# Arquitetura do Pipeline de Imagens

Deep dive da forma como a plataforma trata fotos — do upload até a entrega. Este documento é um complemento técnico do README e do runbook, voltado a quem precisa entender ou estender o pipeline.

---

## 1. Princípios

1. **Original nunca vaza**. O arquivo "cru" fica em `storage/originals/` (fora de `public/`) e só é servido via `/api/photos/[id]/download` com validação explícita.
2. **Derivadas são regeneráveis**. Tudo em `public/uploads/` pode ser refeito a partir do original com 1 comando.
3. **Variantes são explícitas**. Cada tamanho (grid, thumbs, mini, covers) é um artefato independente, com versão `clean` e `wm`.
4. **Marca d'água é imposição**, não overlay. O PNG é fundido no pixel via `sharp.composite()` — não dá para remover no DevTools do navegador.
5. **Lazy onde faz sentido**. Derivadas com marca aplicada podem ser geradas sob demanda no primeiro acesso, mas o comum é já gerar tudo no upload.

---

## 2. Árvore canônica

```
storage/
└── originals/
    └── {eventId}/
        └── {filename}.jpg

public/
└── uploads/
    ├── _legacy/                ← arquivados para rollback
    ├── grid/
    │   ├── clean/{filename}.jpg
    │   └── wm/{filename}.jpg
    ├── thumbs/
    │   ├── clean/{filename}.jpg
    │   └── wm/{filename}.jpg
    ├── mini/
    │   ├── clean/{filename}.jpg
    │   └── wm/{filename}.jpg
    └── covers/
        ├── clean/{filename}.jpg
        └── wm/{filename}.jpg
```

| Variante | Tamanho (padrão) | Qualidade | Uso | WM padrão? |
| --- | --- | --- | --- | --- |
| `grid` | 1600px lado maior | 60% | Modal fullscreen, prefetch | Sim |
| `thumbs` | 400px quadrado (cover crop) | 70% | Galeria, lista de fotos no painel | Sim |
| `mini` | 90px quadrado | 45% | Mini-thumbnails no painel, carrinho, pedidos | Não |
| `covers` | 400px largura (mantém proporção) | 78% | Capa do álbum na home e listagem | Não |

Defaults estão em `src/lib/derivedImagesConfig.js` (função `normalizeDerivativeConfig`). Podem ser sobrescritos em `data/config.json → derivatives`.

---

## 3. Fluxo de upload

Quando o admin arrasta uma foto em `/admin/upload-fotos/[eventId]`:

1. **Cliente (browser)**
   - Gera preview em canvas (220px, JPEG 0.65) para mostrar na fila imediatamente.
   - `POST /api/upload` com o arquivo cru (FormData multipart).

2. **Servidor (`src/app/api/upload/route.js`)**
   - Lê EXIF (`DateTimeOriginal`) com `exifr`.
   - Rotaciona conforme orientação EXIF (usando `sharp.rotate()`).
   - Salva o original em `storage/originals/{eventId}/{uuid}.jpg` via `moveOriginalToEvent()`.
   - Invoca `renderPhotoBuffers()`: produz **6 buffers** em paralelo (grid clean+wm, thumbs clean+wm, mini clean+wm) via `Promise.all`.
   - Escreve os 6 arquivos em paralelo.
   - Responde com o JSON da foto.

3. **Cliente (browser)**
   - Chama `POST /api/photos` para registrar a foto (`filename`, `eventId`, `price`, `originalName`, `size`, `takenAt`, `pasta`).
   - Detecção de duplicata acontece aqui: se já existe uma foto no mesmo álbum com mesmo `(originalName, size)`, o POST retorna `409 Conflict` e a foto recém-enviada é descartada (mas os bytes ficam em disco por enquanto — limpeza é feita em manutenção).

O código que importa está em:

- `src/app/api/upload/route.js` — handler.
- `src/lib/imageDerivatives.js` — `ensurePhotoDerivedVariant` (lazy, usada no servir).
- `src/lib/derivedImagesRenderer.js` — `renderPhotoBuffers` (eager, no upload).

---

## 4. Fluxo de entrega (lado cliente do site)

Ao abrir `/evento/{id}`:

1. O navegador pede as miniaturas via `/uploads/thumbs/wm/{filename}.jpg` (ou `clean/` conforme o caso).
2. O middleware (`middleware.js`) intercepta `/uploads/...` e permite: só variante pública.
3. Se o arquivo existe em disco, o Nginx (ou o Next em dev) serve direto.
4. Se o arquivo **não** existe (caso raro em sistemas que cresceram antes do upload gerar tudo), a página de galeria monta a URL apontando para `/api/images/derive?filename=xxx.jpg&kind=thumbs&watermark=wm` — que gera sob demanda.

No modal:

- A imagem exibida é a `grid/wm/{filename}.jpg` (ou `clean` se foto grátis ou já comprada).
- O sistema já pré-carrega a imagem da foto adjacente para navegação rápida.

No painel admin:

- Listagens usam `mini/clean/{filename}.jpg` (90px, sem marca) por padrão.
- A aba Fotos usa `thumbs/clean/{filename}.jpg` por padrão (admin pode ver sem marca).

---

## 5. Marca d'água

### 5.1 Onde vive

- **Asset global padrão**: `public/watermark.png`.
- **Assets adicionais**: `public/watermarks/*.png`, gerenciados via `/admin/marca-dagua`.
- **Por evento**: o campo `watermarkAsset` no `events.json` referencia um asset específico.

### 5.2 Como é aplicada

A função central é `applyWatermarkToBuffer()` em `src/lib/imageUtils.js`:

```js
applyWatermarkToBuffer(resizedBuffer, opacity, quality)
```

- Lê as dimensões do buffer já redimensionado.
- Chama `computeWatermarkBox()` (em `watermarkPlacement.js`, função pura sem dependência de `sharp`) que devolve `{ left, top, width, height }` — geometria do overlay.
- Se existe PNG de marca, aplica `sharp.composite()` com `opacity` e `blend: 'over'`.
- Senão, renderiza um SVG de texto como fallback (usando o nome do estúdio).

### 5.3 Configuração

Em `data/config.json`:

```json
{
  "watermarkOpacity": 0.8,
  "watermarkAnchor": "center",
  "watermarkSizeMode": "fill",
  "watermarkScalePercent": 82,
  "watermarkOffsetX": 0,
  "watermarkOffsetY": 0,
  "watermarkVariants": {
    "grid":   { "enabled": false },
    "thumbs": { "enabled": false },
    "mini":   { "enabled": false },
    "covers": { "enabled": false }
  }
}
```

Por evento (em `events.json`):

```json
{
  "id": "uuid",
  "watermarkOverride": true,
  "watermarkAsset": "id_do_asset",
  "watermarkConfig": {
    "opacity": 0.6,
    "anchor": "bottom-right",
    "scalePercent": 30,
    "offsetX": -24,
    "offsetY": -24
  },
  "wm_capa": false,
  "wm_miniaturas": true
}
```

### 5.4 Regeneração

Quando o fotógrafo muda a marca ou configuração, as derivadas já geradas ficam "desatualizadas". Regeneração acontece em:

- **Um álbum (capa ou thumbs)**: `POST /api/events/[id]/regenerate { type: 'cover' | 'thumbs' | 'all' }`.
- **Global (todos os álbuns)**: `POST /api/watermark/regenerar` — aceita filtro `{ eventIds: [...] }`.
- **Sob demanda**: `POST /api/images/missing` dispara um job em background que caminha por todas as fotos e regenera o que falta ou está fora do padrão.

O job é gerenciado por `src/lib/missingDerivativesJob.js`:

- `startMissingDerivativesJob()` — state machine `running → finished`.
- `getMissingDerivativesJobSnapshot()` — snapshot em memória com `total`, `done`, `generated`, `etaSeconds`.
- Polling do admin em `GET /api/images/missing`.

---

## 6. Proteção de originais

### 6.1 Middleware

Em `middleware.js` (raiz):

```js
// Libera /uploads/ apenas para:
// - qualquer arquivo dentro de thumbs/
// - arquivos cujo nome começa com wm_, thumb_, mini_ ou preview_
// Qualquer outro caminho em /uploads/ devolve 404.
```

- Interceptação acontece também no `/_next/image` para evitar bypass via otimizador Next.
- Originais ficam em `storage/originals/`, que **não é servido** por Next.

### 6.2 Download autorizado

O único jeito de pegar o original é `/api/photos/[id]/download`, que valida:

- Admin logado? Libera.
- Foto marcada como grátis (ou álbum grátis)? Libera.
- Cliente logado tem pedido pago com essa foto? Libera.
- Guest com `pedidoId` + `token` válido na query? Libera.
- Senão → 403.

O `token` de download é gerado por `createDownloadToken(pedidoId)` em `src/lib/auth.js`: HMAC-SHA256 + TTL 24h + revogação por `sessionVersion` (quando é cliente).

---

## 7. Pastas dentro do álbum

Uma foto tem o campo `pasta`:

- `undefined` ou `""` → raiz do álbum.
- `"Largada"`, `"Chegada"` etc. → entra em uma "subgaleria".

A galeria pública renderiza como:

- **Raiz**: todas as fotos soltas + **cards das pastas**, cada card é um card com a capa que você escolheu para a pasta.
- **Subpasta**: quando o cliente clica no card, entra em uma página filtrada com as fotos daquela pasta.

Internamente:

- Filtro: `GET /api/photos?eventId=xxx&pasta=__album__` retorna apenas a raiz.
- `GET /api/photos?eventId=xxx&pasta=Largada` retorna só as da pasta.

Criação, renomeação e escolha de capa de pasta são feitas na aba Fotos do álbum.

---

## 8. Resolução das fotos

O modal do cliente exibe `LARGURA × ALTURA (X MP)` quando disponível.

- Ao subir, nem sempre esse dado é gravado na hora.
- O endpoint `GET /api/photos/[id]/resolution` calcula com `sharp.metadata()` e persiste o resultado em `photos.json` para a próxima chamada ser instantânea.
- Front-end faz lazy-load — ao abrir o modal, dispara a requisição em paralelo.

---

## 9. Rotação e orientação EXIF

- `sharp.rotate()` é chamado antes de qualquer resize.
- Isso garante que a imagem em disco já fica na orientação visual correta — navegadores modernos respeitam EXIF, mas alguns sistemas de impressão não.

---

## 10. Detecção de duplicata

No `POST /api/photos`, o critério é:

- Mesmo `eventId`.
- Mesmo `originalName`.
- Mesmo `size` (bytes).

Se bater, retorna `409 Conflict`. O upload na pasta bruta continuou (bytes ficam no disco até a próxima manutenção), mas nenhum registro novo é criado no `photos.json`.

Esse esquema resolve o caso comum de o fotógrafo arrastar o mesmo lote duas vezes — não duplica na galeria.

---

## 11. Caminhos e fallbacks

Quando a galeria está renderizando e precisa decidir qual caminho usar para uma foto específica, o código vai em `src/lib/imagePaths.js`:

- `getPhotoVariantCandidates(photo, kind, options)` retorna uma lista ordenada de candidatas:
  1. Campo explícito no `photo` (ex.: `photo.filenameMini`).
  2. Caminho canônico novo (`/uploads/mini/{clean|wm}/...`).
  3. URL de *lazy derive* (`/api/images/derive?...`).
  4. Caminho legado (`/uploads/mini_...`) — backward compat.
- O componente de imagem tenta a primeira; com `onError` cai para a seguinte.

Ou seja: o sistema continua mostrando a foto mesmo que uma derivada esteja faltando, e no pior caso dispara a geração lazy.

---

## 12. Ordenação

Ordem padrão da galeria: `takenAt` (EXIF) ascendente, fallback `createdAt`.

Alternativas que o cliente pode escolher:

- **Tirada em** (default) — primeira foto tirada primeiro.
- **Mais curtidas** — `likes` desc, desempate por comentários, desempate final por `takenAt` desc.
- **Mais comentadas** — `comentariosCount` desc, desempate por likes, desempate por `takenAt` desc.

Em álbuns de mais de um dia, o filtro de faixa de horário também permite escolher qual dos dias filtrar.

---

## 13. Manutenção

### 13.1 `normalize-image-variants.js` (= `sanitizeDerivedImages`)

Percorre `photos.json` e `events.json`. Para cada item:

1. Verifica se todas as variantes esperadas existem.
2. Valida dimensão (`sharp.metadata()`) — se estiver fora do esperado, regenera.
3. Move arquivos claramente inválidos para `_legacy/`.
4. Reorganiza originais soltos em `public/uploads/` para `storage/originals/`.

Reporta, em JSON no stdout:

```json
{
  "fotosTotal": 1581,
  "coversTotal": 4,
  "archived": 23,
  "originalsMoved": 0,
  "generated": {
    "grid": 0, "thumbs": 12, "mini": 5, "covers": 0
  },
  "errors": []
}
```

### 13.2 Job de faltantes (dinâmico)

`POST /api/images/missing` dispara o equivalente do script, mas em background, com snapshot em memória consumido por `GET /api/images/missing`. A UI do admin mostra progresso em tempo real.

---

## 14. Dependências críticas

- **sharp 0.33** — resize, composite, rotate, metadata. Vem com binários pré-compilados por plataforma — se você mover a máquina de Windows para Linux, `npm rebuild sharp` normalmente resolve.
- **exifr** — leitura leve de EXIF (apenas o que a gente precisa).
- **Next Image**: desativado (`next.config.js → images.unoptimized: true`) para garantir que o middleware consiga barrar originais que passariam pelo otimizador.

---

## 15. Ideias não implementadas (roadmap)

Do backlog (`docs/BACKLOG_EXECUCAO_Codex.md`), nesta parte do sistema:

- **BE-22** — overlay de ID público e nome do arquivo direto na foto (identificação em caso de vazamento).
- **BE-27** — capa de pasta gerada a partir de grid com montagem 2×2.
- **BE-50** — venda por resolução (baixa, média, alta), cada uma com preço próprio.
- **BE-51** — videos com watermark animado.
- **BE-52** — reconhecimento facial e de número de peito para o cliente se identificar na galeria.
- **BE-49** — mover originais para storage externo (S3/R2) e servir derivadas por CDN.

Cada item tem prompt detalhado no backlog.
