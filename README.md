# Plataforma de Fotografia Esportiva e de Eventos

Modelo de plataforma **full-stack** em `Next.js 14` para fotógrafos autônomos que cobrem corridas, travessias, rodeios, cavalgadas, campeonatos, festivais, casamentos e qualquer evento com grande volume de fotos. O sistema entrega site público, galeria por álbum, venda online, área do cliente e um painel administrativo completo — rodando localmente em **SQLite** (com fallback para JSON) e mídia em disco, com mirror opcional para storage S3-compatible.

> Este repositório é ao mesmo tempo **produto operacional** (hoje rodando em produção para o estúdio Vinícius Rodrigues de Souza) e **modelo de referência** que outros fotógrafos podem clonar, adaptar e publicar.

---

## 1. Visão geral

O que a plataforma já faz hoje:

- **Site público** com home, busca, galerias por álbum, páginas de foto e vídeos vendáveis.
- **Galerias otimizadas** com modal em tela cheia, favoritos, curtidas, comentários em árvore e solicitação de remoção (LGPD).
- **Carrinho e checkout** com descontos progressivos, cupons, cashback/saldo, propostas e contrapropostas, pagamento via **PIX** e **cartão** (Asaas, Stripe, Mercado Pago, PagSeguro) e liberação manual.
- **Área do cliente** com histórico de compras, downloads de originais, favoritos, curtidas, propostas, chat com fotógrafo, notificações, cashback e exportação de dados (LGPD).
- **Painel admin completo** com gestão de álbuns, upload, preços, pedidos, clientes, carrinhos ativos, remoções, comentários, marca d'água, cupons, propostas, chat, colaboradores, repasses, reconhecimento facial/numérico, estatísticas e configurações.
- **Pipeline de imagens em camadas** (original protegido + derivadas públicas: grid, thumbs, mini, covers), com versões **com** e **sem** marca d'água geradas sob demanda.
- **Vídeos vendáveis** com transcodificação por `ffmpeg`, preview, thumb, marca d'água em vídeo e download autorizado.
- **Reconhecimento facial e numérico (opcional)** via `@vladmandic/face-api` + `@tensorflow/tfjs`, com motor manual de fallback.
- **Middleware de proteção** que bloqueia acesso direto a originais via `/uploads`.
- **Persistência em SQLite** (`data/db.sqlite`, via `better-sqlite3`) com fallback para JSON e flag em `data/storage-backend.txt`.
- **Storage externo opcional** (R2/S3/B2/MinIO): mirror de uploads, leituras com fallback, URLs assinadas para downloads autorizados.
- **Backup automático diário** e **monitoração de saúde** (disco, processo, logs) com alerta opcional via webhook.

---

## 2. Snapshot do estado atual

Revisão com base no código e nos dados locais em **10 de maio de 2026**.

- `npm run build` executa com sucesso em modo de produção.
- `npm test` (Vitest) roda 9 suites em `tests/` cobrindo auth, pricing, cupons, downloadTiers, cpf/cnpj, imagePaths, paymentGateways, safeDeletion e smoke das APIs.
- `npm run lint` ativa o ESLint (`next/core-web-vitals` + overrides).
- O App Router expõe **80+ rotas** entre páginas e handlers de API.
- **Backend de dados**: `data/storage-backend.txt = "sqlite"` (`better-sqlite3` em modo WAL). JSONs em `data/*.json` continuam como fallback / source-of-truth para módulos ainda não migrados.
- **Base local atual**
  - `7` eventos no total (`4` ativos, `3` removidos logicamente)
  - `1 582` fotos cadastradas (`1 420` ativas, `162` removidas)
  - `1 016` fotos marcadas como grátis / preço 0
  - `53` fotos organizadas em pastas
  - `4` vídeos cadastrados
  - `29` pedidos (`19` pagos, `1` cancelado/reembolsado)
  - `9` clientes (`3` com flag admin)
  - `8` solicitações de remoção
  - `4` feedbacks de pedido
  - `21` avaliações por estrelas
  - `14` comentários em fotos/álbuns
- **Contadores públicos em `data/counter.json`**
  - fotos até `100001616`
  - pedidos até `200000039`
  - eventos até `300000008`
- **Gateway ativo**: `asaas_producao` com fallback `stripe`. Métodos habilitados: `pix` e `cartao`. Mercado Pago e PagSeguro disponíveis e configuráveis.
- **Storage em disco**
  - Originais sob `storage/originals/{eventId}/*.jpg` (fora da árvore pública)
  - Derivadas sob `public/uploads/{grid|thumbs|mini|covers}/{clean|wm}/*.jpg`
  - Vídeos sob `storage/videos/{eventId}/...`
  - Marcas d'água personalizadas em `public/watermarks/`
  - Backups diários em `storage/backups/`
- **Storage externo (opcional)**: configurado em `data/config.json:storageExterno` (R2/S3/B2/MinIO). Local segue como source-of-truth com mirror fire-and-forget.

---

## 3. Stack

| Camada | Tecnologia |
| --- | --- |
| Front-end | `Next.js 14.2.0` + `React 18` |
| Roteamento | App Router (`src/app`) |
| API | Route Handlers Next |
| Processamento de imagem | `sharp 0.33` |
| Leitura de EXIF | `exifr` |
| Vídeo | `ffmpeg-static` (transcodificação, preview, watermark) |
| Reconhecimento (opcional) | `@vladmandic/face-api` + `@tensorflow/tfjs` |
| Estilo | CSS global modular em `src/app/*.css` |
| Persistência | **SQLite** (`data/db.sqlite` via `better-sqlite3`) com fallback JSON em `data/*.json` |
| Mídia | local em `storage/originals` (originais) e `public/uploads` (derivadas), com mirror opcional para S3/R2/B2/MinIO via `@aws-sdk/client-s3` |
| Autenticação | cookie httpOnly `auth_token` (HMAC-SHA256) + `sessionVersion`; senha com scrypt+salt |
| Pagamentos | Asaas (sandbox/produção), Stripe, Mercado Pago e PagSeguro, com modo manual e fallback configurável |
| E-mail | `nodemailer` (SMTP via env; opcional) |
| Testes | `vitest` (suite mínima em `tests/`) |
| Qualidade | ESLint (`next/core-web-vitals`) + Prettier |

---

## 4. Organização do projeto

```text
src/
  app/
    page.js                        -> home pública
    evento/[id]/page.js            -> galeria do álbum
    carrinho/page.js               -> carrinho
    checkout/page.js               -> checkout e confirmação
    compras/page.js                -> acesso guest a pedido pago
    login/page.js                  -> login unificado
    cadastro/page.js               -> cadastro de cliente
    trocar-senha/page.js           -> primeira troca obrigatória
    minha-conta/**                 -> área do cliente
    admin/**                       -> painel administrativo
    api/**                         -> backend local (ver seção 7)

  components/
    Navbar.js                      -> barra topo unificada
    Footer.js                      -> rodapé com dados do estúdio
    PhotoModal.js                  -> lightbox de foto
    CartView.js                    -> resumo/visão do carrinho
    EventCommentsSection.js        -> comentários no álbum
    PhotoCommentsSection.js        -> comentários na foto
    SafeDeleteModal.js             -> confirmação de exclusão com análise

  hooks/
    useConfirmDialog.js            -> diálogo custom promise-based

  lib/
    apiAuth.js, auth.js            -> tokens, sessão, hash de senha
    db/                            -> camada SQLite (router, schema, repositories, connection)
    storage/                       -> facade FS local + S3 (R2/B2/MinIO), mirror, signed URLs
    vision/                        -> reconhecimento facial e numérico (face-api + manual)
    events.js, photos.js,
    pedidos.js, clients.js,
    config.js, paymentLog.js       -> domínio (passa por db/router quando aplicável)
    videos.js                      -> CRUD de vídeos
    cupons.js, rewards.js,
    propostas.js                   -> promoções, cashback, propostas
    chat.js, notificacoes.js       -> chat e sino de notificações
    colaborador.js, repasses.js    -> permissões parciais e comissões
    sponsors.js                    -> patrocinadores/organizadores
    auditLog.js                    -> trilha em data/audit_log.json
    rateLimit.js                   -> limitador de chamadas
    cartPricePolicy.js             -> congelamento de preços no checkout
    derivedImagesConfig.js         -> normalização da config de derivadas
    derivedImagesRenderer.js       -> render em buffer (grid/thumbs/mini/cover)
    derivedImagesMaintenance.js    -> sanitiza e regenera a árvore derivada
    imageDerivatives.js            -> geração lazy por variante
    imageStorage.js, imagePaths.js -> caminhos canônicos e fallbacks
    imageUtils.js                  -> compositing de watermark em buffer
    missingDerivativesJob.js       -> job em background p/ faltantes
    watermark.js                   -> assets e variantes de marca
    watermarkPlacement.js          -> geometria pura (posição, scale)
    watermarkRegenerar.js          -> regeneração em lote
    safeDeletion.js                -> análise de vínculos antes de apagar
    originalsMaintenance.js        -> organiza originais por eventId
    videoProcessing.js             -> pipeline ffmpeg (preview, thumb, watermark)
    guestCart.js, guestOrders.js   -> carrinho e pedidos sem login
    freeAccess.js                  -> flags e preço efetivo
    pricing.js, price.js           -> descontos progressivos
    downloadTiers.js,
    downloadTiersDefaults.js       -> download por resolução (P37)
    commerceUtils.js               -> normalização de status / gateway
    paymentWebhookUtils.js         -> validação de webhook por gateway
    cpf.js, cnpj.js, whatsapp.js,
    nome.js                        -> validação e formatação
    avaliacoes.js, comentarios.js,
    feedbacks.js, remocoes.js      -> CRUD dos módulos sociais
    payment.js                     -> integração Asaas/Stripe/Mercado Pago/PagSeguro/manual
    backup.js, email.js            -> backup de dados e SMTP transacional

data/
  db.sqlite (+ -shm/-wal)          -> banco SQLite quando ativo
  storage-backend.txt              -> backend ativo: "sqlite" ou "json"
  audit_log.json                   -> trilha de auditoria
  avaliacoes.json, clients.json, comentarios.json, config.json,
  counter.json, events.json, feedbacks.json, payment_log.json,
  pedidos.json, photos.json, remocoes.json, repasses.json,
  videos.json, contatos.json
  payment-logs/                    -> logs de pagamento por dia
  vision/models/                   -> modelos face-api carregados localmente

storage/
  originals/{eventId}/*.jpg        -> originais (fora de /public)
  videos/{eventId}/...             -> vídeos e derivadas
  backups/                         -> backups diários gerados por scripts/backup-daily.js
  migrations/*.jsonl               -> logs one-shot de scripts

public/
  uploads/
    _legacy/                       -> arquivos obsoletos arquivados
    grid/{clean,wm}/*.jpg          -> 1600px p/ modal
    thumbs/{clean,wm}/*.jpg        -> 300-400px p/ galeria
    mini/{clean,wm}/*.jpg          -> 90px p/ UI interna
    covers/{clean,wm}/*.jpg        -> 400-480px p/ capa
  watermark.png                    -> marca global default
  watermarks/*.png                 -> marcas alternativas

scripts/
  normalize-image-variants.js      -> audita/regenera derivadas
  migrate-derived-images-structure.js
  migrate-legacy-originals.js
  migrate-uploads-by-event.js      -> preparação para BP04
  migrate-json-to-sqlite.js        -> migração JSON -> SQLite (P38)
  rollback-sqlite-to-json.js       -> volta para JSON
  migrate-storage-to-s3.js         -> migração local -> S3 (P39)
  rollback-storage-to-local.js     -> volta para FS local
  backup-daily.js                  -> backup automático diário (P40)
  monitor-health.js                -> monitoração (disco/processo/logs)
  verify-full.js, verify-deep.js   -> smoke completo
  fix-a11y-labels.js               -> acabamento de acessibilidade

tests/
  api.smoke.test.js, auth.test.js, cpfCnpj.test.js, cupons.test.js,
  downloadTiers.test.js, imagePaths.test.js, paymentGateways.test.js,
  pricing.test.js, safeDeletion.test.js

docs/
  BACKLOG_EXECUCAO_Codex.md        -> backlog detalhado (P00 a BP05)
  BACKLOG_RESTANTE_Codex_P18-P41.md
  BACKLOG_RESTANTE_ClaudeCode_P18-P41.md
  MANUAL_FOTOGRAFO.md              -> manual de uso (este pacote)
  OPERACAO.md                      -> runbook técnico (backup, restore, deploy)
  ARQUITETURA_IMAGENS.md           -> deep dive do pipeline de imagens
  MIGRACAO_BANCO.md                -> guia da migração JSON -> SQLite (P38)
  STORAGE_EXTERNO.md               -> guia do storage externo (P39)
  PAGAMENTOS.md                    -> integração com gateways
  SEGURANCA_E_LGPD.md              -> checklist antes de publicar
```

---

## 5. Rotas principais

### Site público

- `/` — home com hero, busca de álbuns e grade de eventos visíveis.
- `/evento/[id]` — galeria do álbum (paginada em blocos de 160 fotos).
- `/carrinho` — resumo do carrinho.
- `/checkout` — captura de dados, pedido e etapa de pagamento.
- `/compras` — acesso guest a um pedido pago pelo link enviado.
- `/login` — login unificado de cliente e admin.
- `/cadastro` — criação de conta.
- `/trocar-senha` — obrigatória no primeiro login após reset do admin.

### Área do cliente (`/minha-conta`)

- `/minha-conta` — dashboard pessoal.
- `/minha-conta/compras` — histórico e downloads.
- `/minha-conta/favoritos` — salvos (fotos e álbuns).
- `/minha-conta/configuracoes` — dados pessoais, senha, preferências.
- `/minha-conta/notificacoes` — sino unificado.
- `/minha-conta/propostas` — propostas e contrapropostas.
- `/minha-conta/chat` — chat com o fotógrafo.
- `/minha-conta/cashback` — saldo, ranking e cupons aplicáveis.
- `/minha-conta/exportar` — exportação dos dados (LGPD).

### Painel administrativo (`/admin`)

- `/admin` — dashboard com métricas.
- `/admin/eventos` — lista de álbuns.
- `/admin/eventos/[id]` — tela detalhada (informações, fotos, vídeos, vendas, carrinhos, preços, relatórios, marca d'água).
- `/admin/criar-evento` — novo álbum.
- `/admin/upload-fotos/[eventId]` — fila de upload com preview.
- `/admin/pedidos` — pedidos e vendas.
- `/admin/clientes` — contas (clientes e admins).
- `/admin/carrinhos` — carrinhos ativos.
- `/admin/remocoes` — solicitações LGPD.
- `/admin/comentarios` — moderação de comentários.
- `/admin/contatos` — mensagens da página `/contato`.
- `/admin/cupons` — cupons de desconto.
- `/admin/propostas` — fila de propostas e contrapropostas.
- `/admin/chat` — chats com clientes.
- `/admin/notificacoes` — disparos e sino interno.
- `/admin/colaboradores` — permissões parciais.
- `/admin/repasses` — comissões para colaboradores.
- `/admin/reconhecimento` — indexação e busca por face/número.
- `/admin/estatisticas` — gráficos e exportação.
- `/admin/reset` — reset/restore guiado (com backup obrigatório).
- `/admin/marca-dagua` — marca d'água por variante.
- `/admin/personalizar` — personalização visual (tema, accent, hero, patrocinadores).
- `/admin/configuracoes` — estúdio, pagamento, imagens, descontos globais, storage externo, e-mail, log.

---

## 6. Funcionalidades implementadas

### Home

- Carrega eventos, fotos e configuração em paralelo.
- Oculta eventos `privado`; mostra `naolistado` somente para admin logado.
- Busca por nome, descrição, categoria, cidade, mês e ano.
- Usa `cover_*` (400px sem marca d'água por padrão) para as capas.
- Exibe Instagram e WhatsApp do estúdio quando presentes em `config.json`.

### Galeria do evento

- Ordenação padrão por `takenAt` (EXIF) com fallback em `createdAt`.
- Ordenações alternativas: mais curtidas, mais comentadas.
- Filtro por faixa de horário quando há EXIF suficiente.
- Suporte a pasta raiz + subpastas (`photo.pasta`).
- Abertura direta por querystring (`?foto=ID_PUBLICO`).
- Modal em tela cheia com navegação por teclado, prefetch das adjacentes, resolução (W×H e MP) exibida quando disponível.
- Cards de desconto progressivo e badges de foto no carrinho / já comprada.
- Download direto do original para fotos grátis ou já compradas.
- Comentários no álbum e na foto (árvore com replies e likes).
- Solicitação de remoção por foto com CPF + contato (WhatsApp ou e-mail).
- Compartilhamento por link direto e WhatsApp.

### Carrinho

- Persistência em `localStorage` para guest; sincronização com `/api/carrinhos` para logado.
- Agrupamento por evento e limpeza automática de itens indisponíveis.
- Validação antes do checkout (fotos removidas, preços atualizados pelo admin).
- Mensagem diferenciada para guest x logado.

### Checkout

- Formulário com nome, WhatsApp, CPF e e-mail — preenchido automaticamente no login.
- Validação de CPF no front-end.
- Aplicação de descontos progressivos por evento.
- Taxa de parcelamento para cartão (até 12x).
- Carrinho 100% gratuito gera pedido liberado direto.
- Modo manual / demonstração / sandbox.
- Polling de status para PIX e cartão.
- Página de sucesso com links de download e contato WhatsApp.
- Coleta de feedback pós-compra.

### Pagamento

Gateways suportados pelo backend:

- `manual` (liberação por admin);
- `asaas_sandbox` e `asaas_producao`;
- `stripe`;
- `mercadopago`;
- `pagseguro`;
- fallback automático entre gateways (configurável).

Métodos suportados hoje: **PIX** e **cartão** (crédito com parcelamento).

- Polling de status em `/api/pagamento/status`.
- Webhooks em `/api/pagamento/webhook/{asaas,stripe,mercadopago,pagseguro}` com validação por gateway (`paymentWebhookUtils.js`).
- Log estruturado em `data/payment_log.json` + arquivos por dia em `data/payment-logs/` (exportável/exclusível no admin).
- O dashboard considera receita real apenas para gateways de produção, ignorando `manual` e sandboxes.

### Área do cliente

- Dashboard com totais de compras, fotos compradas, favoritos, curtidas e 5 pedidos recentes.
- Página de compras expansível, com download dos originais por item.
- Coleta de feedback pós-compra.
- Favoritos e curtidas agrupados por evento.
- Adição de fotos favoritas ao carrinho.
- Edição de dados pessoais (nome, WhatsApp, Instagram, data de nascimento).
- Troca de senha (`/api/auth/change-password`) com `sessionVersion` — todas as demais sessões saem automaticamente.
- Logout e botão rápido "Área do fotógrafo" quando a conta também é admin.

### Painel administrativo

#### Dashboard

- Totais de eventos, fotos, vendas e receita confirmada.
- Últimos pedidos (modal de detalhes com mini-thumbs sem marca d'água, WhatsApp clicável, botão de liberar manualmente e baixar originais).
- Eventos recentes com contagem de fotos, vendidas e faturamento.
- Atalhos: abrir site, copiar URL base, gerar QR code.

#### Álbuns

- Criação rápida pelo dashboard e criação completa em `/admin/criar-evento`.
- Listagem com filtros (busca, visibilidade, categoria, período) e ordenação (data, faturamento, fotos, vendidas).
- Estatísticas por álbum via `/api/events?stats=1`.
- Troca de visibilidade direta na listagem quando os dados obrigatórios estão preenchidos.

#### Tela detalhada do álbum (`/admin/eventos/[id]`)

Abas:

- **Vendas & Clientes**
- **Carrinhos ativos** (com ação *liberar manualmente* — registra o pedido com gateway `liberado_manual`)
- **Fotos** (galeria interna com seleção em lote, mover entre pastas, criar/renomear pasta, marcar como grátis, definir capa)
- **Relatórios** (por pasta, por faixa de horário, por cliente)
- **Preços & Descontos** (preço padrão por evento + escada progressiva)
- **Marca d'água** (override por álbum, asset dedicado, toggles `wm_capa` e `wm_miniaturas`, botões de regenerar capa e thumbs)
- **Informações** (nome, data, categoria, cidade, descrição, links, capa personalizada)

#### Upload

Em `/admin/upload-fotos/[eventId]`:

- Drag-and-drop com preview via canvas (220px).
- Fila concorrente com 3 workers.
- Upload inicia automaticamente ao soltar os arquivos.
- Detecção de duplicata por (`originalName`, `size`) — o item entra marcado em cor distinta e conta na barra de resumo.
- Edição de preço por item só depois de enviado.
- Autor = conta que está enviando (não mais fixo).
- Preço padrão vem do álbum; cai no global só se o álbum não tiver.

#### Clientes

- Listagem com busca, filtros e ordenação.
- Toggle de admin.
- Ativação / desativação (conta desativada é desconectada em todos os dispositivos).
- Reset de senha com código aleatório (copy-to-clipboard com feedback visual).
- Modal com compras, carrinho, reclamações e notas internas.

#### Pedidos

- Listagem expansível com agrupamento por status.
- Troca manual de status, detalhes do gateway e parcelas.
- Download de itens e acesso rápido ao WhatsApp do cliente.
- Notas privadas (visíveis só ao admin) e públicas (visíveis ao cliente) em `/api/pedidos/notes`.
- Fluxo de reembolso (estado: `solicitado`, `aprovado`, `negado`, `concluido`).

#### Remoções (LGPD)

- Fluxo completo de solicitação, aceite, rejeição e desfazer.
- Comentário interno (admin) e comentário público (cliente vê).
- Aceitação marca a foto como `removida` em `photos.json` e limpa referências em carrinhos, favoritos e curtidas.
- Campo duplo: WhatsApp *ou* e-mail (um dos dois é obrigatório).

#### Comentários

- Visão consolidada dos comentários em fotos e álbuns.
- Ações: omitir, restaurar, editar (entra no histórico), ver cliente autor.
- Rate limit no endpoint público.

#### Marca d'água (`/admin/marca-dagua`)

- Painel dedicado para a marca d'água.
- Upload de PNGs e vinculação por variante (`global`, `grid`, `thumbs`, `mini`, `covers`).
- Controles de **anchor** (9 posições), **opacity** (0–100%), **size mode** (proporcional, fit, fill), **scale** (5–200%) e **offset X/Y**.
- Preview em tempo real e botão *regenerar tudo* ou *regenerar em álbuns específicos*.

#### Configurações gerais

- Dados do estúdio (nome, CPF, CNPJ, razão social, localização, Instagram, WhatsApp) — compartilhados com o perfil do admin no painel do cliente.
- Preço global padrão e descontos globais por escada.
- Categorias custom.
- Qualidade e tamanho das derivadas (grid, thumbs, mini, covers).
- Gateways de pagamento (keys com botão de mostrar/copiar por trás de asteriscos).
- Log de pagamento com exportação e limpeza.

---

## 7. API

Todos os handlers ficam em `src/app/api/**/route.js`. Resumo por domínio:

### Autenticação

- `POST /api/auth/login` — autentica e devolve cookie `auth_token` (30 dias).
- `POST /api/auth/logout` — limpa o cookie.
- `GET  /api/auth/me` — dados do usuário autenticado + flag `mustChangePassword`.
- `POST /api/auth/register` — cadastro com validação de CPF, e-mail e WhatsApp únicos.
- `POST /api/auth/change-password` — troca senha e incrementa `sessionVersion` (invalida tokens antigos).

### Eventos

- `GET    /api/events` — lista com filtros (`stats=1`, `incluirRemovidos=1`).
- `POST   /api/events` — cria (admin).
- `GET    /api/events/[id]` — detalhe (aceita `stats=1`).
- `PATCH  /api/events/[id]` — atualiza (admin); inclui `watermarkOverride`, `watermarkAsset`, `watermarkConfig`, `wm_capa`, `wm_miniaturas`, `albumGratis`, `coverImage`, `coverImageFile` etc.
- `DELETE /api/events/[id]` — análise de dependências + estratégia (`agressivo`, `preservar`, `individual`).
- `POST   /api/events/[id]/regenerate` — regenera `{ type: 'cover' | 'thumbs' | 'all' }`.
- `GET    /api/events/[id]/visita` — registra/recupera o contador de visitas.

### Fotos

- `GET    /api/photos` — filtra por `eventId`, `ids`, `pasta` (`__album__` = raiz); admin pode passar `incluirRemovidas=1`.
- `POST   /api/photos` — registra após upload (detecta duplicata por `originalName`+`size`).
- `PATCH  /api/photos` — edita preço, pasta, flag `gratis`, marca `removida`; suporta bulk por `ids: [...]`.
- `DELETE /api/photos` — análise de compras/carrinhos/favoritos + estratégia.
- `GET    /api/photos/[id]/download` — entrega o original; valida foto grátis, admin, cliente com pedido pago ou token de guest.
- `GET    /api/photos/[id]/resolution` — devolve `{ width, height, mp }` (calcula e persiste na primeira vez).

### Imagens derivadas

- `GET  /api/images/derive` — gera sob demanda (`kind=grid|thumbs|mini`, `watermark=wm|clean`, `mode=ensure` devolve JSON).
- `GET  /api/images/missing` — status do job.
- `POST /api/images/missing` — dispara o job que detecta e regenera tudo o que falta.

### Marca d'água

- `GET    /api/watermark` — lista variantes e URL da marca global.
- `POST   /api/watermark` — upload de PNG (`?variant=grid|thumbs|...`).
- `DELETE /api/watermark` — remove variante.
- `GET    /api/watermark/assets` — lista assets reutilizáveis.
- `POST   /api/watermark/assets` — upload de asset com nome.
- `DELETE /api/watermark/assets` — remove asset por ID.
- `POST   /api/watermark/regenerar` — regenera derivadas (opcional `{ eventIds: [...] }`).

### Pedidos

- `GET   /api/pedidos` — lista (cliente vê só os seus, admin tudo); `?eventId=` filtra.
- `POST  /api/pedidos` — cria pedido manual (admin).
- `PATCH /api/pedidos` — muda `status`, `paymentMethod`, `refund` ou `reviewed`; marca fotos como vendidas quando status = pago.
- `POST  /api/pedidos/notes` — anota `type: 'private' | 'public'`.

### Pagamento

- `POST /api/pagamento` — cria pedido + cobrança (manual / Asaas / Stripe); aceita parcelamento 1–12x.
- `GET  /api/pagamento/status` — polling do estado.
- `GET  /api/pagamento/log` — log operacional (admin).
- `POST /api/pagamento/webhook/asaas` — `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED`.
- `POST /api/pagamento/webhook/stripe` — `charge.succeeded`.

### Clientes

- `GET   /api/clients` — admin lista todos.
- `GET   /api/clients/[id]` — detalhe.
- `PATCH /api/clients/[id]` — atualiza perfil.
- `POST  /api/clients/[id]/reset-password` — gera senha temporária.

### Carrinhos

- `GET    /api/carrinhos` — admin vê todos; cliente passa `?meu=1` para ver o próprio.
- `POST   /api/carrinhos` — `action: 'update' | 'preserve'` (ajuste de preços em lote).
- `PUT    /api/carrinhos` — cliente atualiza o próprio carrinho.
- `DELETE /api/carrinhos` — admin limpa carrinho de cliente.

### Remoções

- `GET    /api/remocoes` — lista solicitações.
- `POST   /api/remocoes` — cria (guest pode).
- `PATCH  /api/remocoes` — aceita/rejeita (admin), com comentário público/privado.

### Comentários

- `GET   /api/comentarios` — filtra por foto, álbum, pasta ou cliente; suporta `tree=1` e `sort=top|recent`.
- `POST  /api/comentarios` — cria com rate limit; aceita `parentId` para replies.
- `PATCH /api/comentarios` — `action: 'edit' | 'omit' | 'restore' | 'toggleLike'`.
- `DELETE /api/comentarios` — soft-delete (omite).

### Outros

- `GET /api/avaliacoes` / `POST /api/avaliacoes` — rating 1–5 por foto.
- `GET /api/curtidas` / `POST /api/curtidas` — toggle de like.
- `GET /api/favoritos` / `POST /api/favoritos` — favoritos de foto/álbum.
- `GET /api/feedback` / `POST /api/feedback` — feedback pós-compra.
- `GET /api/config` — config pública.

Consulte `docs/OPERACAO.md` para payloads completos.

---

## 8. Pipeline de imagens

Durante o upload, `sharp` produz 1 original + múltiplas derivadas organizadas por tipo e por presença (ou não) de marca d'água:

```
storage/originals/{eventId}/{filename}.jpg      -> original PROTEGIDO (middleware)
public/uploads/grid/{clean|wm}/{filename}.jpg   -> 1600px  p/ modal
public/uploads/thumbs/{clean|wm}/{filename}.jpg -> 400px   p/ galeria
public/uploads/mini/{clean|wm}/{filename}.jpg   -> 90px    p/ UI interna
public/uploads/covers/{clean|wm}/{filename}.jpg -> 400px   p/ capa
```

Principais decisões:

- Cada variante tem configuração própria em `config.derivatives` (tamanho + qualidade).
- Por padrão, o álbum **não** aplica marca nas miniaturas mini e cover — os toggles `wm_capa` e `wm_miniaturas` por evento deixam o fotógrafo decidir.
- Toda variante pode ser regenerada sob demanda (`POST /api/events/[id]/regenerate` ou `POST /api/watermark/regenerar`) e o sistema também tem um **job** (`POST /api/images/missing`) que percorre tudo e produz o que faltar.
- `applyWatermarkToBuffer(buffer, opacity, quality)` aplica a marca diretamente no pixel (imposição e não overlay JS) via `sharp.composite()`.
- Geometria da marca é calculada em `watermarkPlacement.js` (função pura reutilizada em node e browser).
- Originais ficam **fora** de `/public`: o middleware bloqueia `/uploads/<arquivo-não-seguro>` e só libera derivadas com prefixo `wm_`, `thumb_`, `mini_`, `preview_` ou sob `thumbs/`.

Scripts de manutenção em `scripts/`:

- `normalize-image-variants.js` (alias: `npm run images:audit` e `npm run images:normalize`) — audita/regenera derivadas e arquiva órfãos em `_legacy/`.
- `migrate-derived-images-structure.js` — migra derivadas do layout antigo (`wm_*`, `thumb_*`, `mini_*`) para o novo.
- `migrate-legacy-originals.js` — move originais de `public/uploads/` para `storage/originals/{eventId}/`, com dedup SHA-256.

Fluxo recomendado em máquina nova:

```bash
# backup antes de tudo!
node scripts/migrate-legacy-originals.js --apply --cleanup-duplicates
node scripts/migrate-derived-images-structure.js --apply --include-covers
npm run images:normalize
```

---

## 9. Persistência

A partir do P38, o backend padrão é **SQLite** (`data/db.sqlite`, modo WAL, via `better-sqlite3`). A flag em `data/storage-backend.txt` (ou a env `STORAGE_BACKEND`) decide se o roteador `src/lib/db/router.js` despacha para SQLite ou para o legado JSON.

Independentemente do backend, o conteúdo segue o mesmo modelo:

| Tabela / Arquivo | Conteúdo |
| --- | --- |
| `events.json` | álbuns (nome, data, categoria, cidade, descontos, capa, flags de marca d'água etc.) |
| `photos.json` | catálogo de fotos (filename, eventId, price, gratis, pasta, takenAt, removida, autor) |
| `videos.json` | vídeos (filename, eventId, price, duration, watermark) |
| `pedidos.json` | pedidos (itens, status, pagamento, reembolso, notas, reviewed) |
| `clients.json` | contas (senha hasheada com scrypt, favoritos, curtidas, carrinho, sessionVersion, cashback) |
| `config.json` | configuração global (estúdio, descontos, gateways, derivatives, watermarkConfig, storageExterno, accentColor, tema, patrocinadores) |
| `counter.json` | contadores públicos por série (fotos 1xxxxxxxx, pedidos 2xxxxxxxx, eventos 3xxxxxxxx) |
| `comentarios.json` | comentários (árvore, histórico de edições, likes) |
| `avaliacoes.json` | notas 1–5 por foto |
| `feedbacks.json` | feedback pós-compra |
| `remocoes.json` | solicitações LGPD |
| `repasses.json` | comissões / repasses para colaboradores |
| `contatos.json` | mensagens públicas via `/contato` |
| `audit_log.json` | trilha de auditoria de ações sensíveis |
| `payment_log.json` (+ `payment-logs/`) | log de webhooks e transações por dia |

Migração JSON ↔ SQLite: `npm run db:migrate[:dry|:force]` e `npm run db:rollback`. Rollback é seguro: a flag em `storage-backend.txt` decide qual fonte está ativa.

IDs públicos continuam sequenciais e separados por série. Os UUIDs internos continuam para joins internos, mas a interface exibe os IDs públicos em todos os lugares.

---

## 10. Autenticação

- Cookie httpOnly `auth_token` assinado via HMAC-SHA256 (`src/lib/auth.js`), com payload `{ userId, role, sessionVersion, exp }`.
- Senha armazenada com **scrypt + salt** (`hashPassword`).
- `sessionVersion` é incrementado em:
  - troca de senha;
  - reset administrativo;
  - desativação da conta.
- O middleware de API (`src/lib/apiAuth.js`) valida a cada request e devolve 401/403 conforme role.
- Credenciais padrão somente para bootstrap em máquina nova: `admin@test.com` / `123456`. Ao entrar pela primeira vez o sistema **exige** troca imediata.
- Variáveis de ambiente suportadas (crie um `.env.local`, ou copie de `.env.example`):
  - `AUTH_SECRET` — segredo de assinatura do token
  - `ADMIN_EMAIL`, `ADMIN_PASSWORD` — bootstrap do primeiro admin
  - `ASAAS_WEBHOOK_TOKEN`, `STRIPE_WEBHOOK_SECRET`, `MERCADOPAGO_WEBHOOK_SECRET`, `PAGSEGURO_WEBHOOK_SECRET` — validação de webhooks
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — e-mail transacional (opcional)
  - `NEXT_PUBLIC_SITE_URL` — base usada nos links dos e-mails
  - `STORAGE_BACKEND` — força backend (`sqlite` ou `json`); sobrescreve `data/storage-backend.txt`
  - `BACKUP_DIR`, `BACKUP_RETENTION_DAYS` — backup automático
  - `MONITORING_WEBHOOK_URL`, `MONITORING_DISK_MIN_GB` — alertas do monitor
  - `NEXT_PUBLIC_MAX_UPLOAD_MB` — limite de upload (default 200)
  - `DEBUG_MIGRATIONS` — verbosidade dos scripts de migração

---

## 11. Como rodar localmente

```bash
# 1. instalar dependências
npm install

# 2. subir o app em dev
npm run dev

# 3. abrir no navegador
#    site:  http://localhost:3000
#    login: http://localhost:3000/login
```

Build de produção:

```bash
npm run build
npm start
```

Scripts utilitários:

```bash
# Imagens
npm run images:audit                # mostra o que regeneraria
npm run images:normalize            # aplica a regeneração

# Banco SQLite (P38) — alternativa aos JSONs
npm run db:migrate:dry              # testa migração JSON→SQLite (com backup)
npm run db:migrate                  # migra de verdade
npm run db:rollback                 # volta a usar JSONs

# Storage externo S3/R2 (P39)
npm run storage:migrate             # local → bucket
npm run storage:rollback            # bucket → local

# Operação (P40)
npm run backup                      # backup diário do data/ + db.sqlite
npm run monitor                     # health-check (disco/logs/processos)

# Verificação completa
npm run verify:deep                 # testa 50+ rotas, 40+ APIs, 20+ fluxos
```

### Modo público temporário (5 min, grátis)

Se quiser que outras pessoas testem o site pela internet:

1. Instale `cloudflared`: `winget install --id Cloudflare.cloudflared`
2. Execute `iniciar-publico.bat` (raiz do projeto, dois cliques)
3. Anote a URL `https://abc-def.trycloudflare.com` que aparece e mande pros testadores

Detalhes em [docs/OPERACAO.md §5](docs/OPERACAO.md#50-cloudflare-tunnel-recomendado-para-começar--100-grátis).

---

## 12. Observações importantes

### Build

- O build passa sem erros.
- Next registra avisos de `Dynamic server usage` em rotas como `/api/auth/me` e `/api/pagamento/status`. Isso é esperado — essas rotas precisam ler cookies a cada request.

### Dados reais, dados de teste e segredos

- O workspace atual mistura dados operacionais com dados de teste.
- `data/config.json` guarda as chaves de gateway. Em produção coloque-as em `.env` e leia dentro de `payment.js`.
- `data/clients.json` e outros JSONs contêm dados pessoais — se compartilhar o repositório, **sanitize primeiro**.

### Segurança

No estado atual o projeto **não deve ser exposto em domínio público sem hardening**. Consulte `docs/SEGURANCA_E_LGPD.md` para o checklist completo (autorização server-side em rotas sensíveis, limites de rate, rotação de `AUTH_SECRET`, backup, etc.).

### Limitações técnicas

- SQLite local (single-server). Suficiente para um estúdio; não é multi-tenant nem distribuído.
- Storage externo é mirror — o local continua sendo source-of-truth (sem CDN obrigatório).
- Suite de testes é mínima (libs críticas + smoke); cobertura ampla ainda não existe.
- Fontes vêm do Google Fonts via `@import` — dependem de internet.

### Recomendações antes de um deploy público

- Confirmar `AUTH_SECRET`, segredos de webhooks e SMTP em `.env.local`.
- Remover dados reais e dados de teste do workspace antes de publicar repo.
- Conferir `requireAuth({ requireAdmin: true })` nas APIs administrativas (P01 já passou — revisar).
- Habilitar storage externo (`/admin/configuracoes` aba Storage) se for atender muitos usuários.
- Verificar que `npm run backup` está agendado (cron/systemd/Task Scheduler).
- Rodar `npm run verify:deep` antes do go-live.

---

## 13. Usando como modelo de outro estúdio

Este repositório é intencionalmente neutro. Para adaptar a outro fotógrafo:

1. Em `data/config.json`, troque **nome do estúdio**, **CPF/CNPJ**, **WhatsApp**, **Instagram** e **localização**.
2. Substitua `public/watermark.png` pela marca d'água do novo estúdio (ou use o painel `/admin/marca-dagua`).
3. Resete os dados:
   - **Se rodando em SQLite** (default): apague `data/db.sqlite*` e os JSONs operacionais (`events.json`, `photos.json`, `videos.json`, `pedidos.json`, `comentarios.json`, `avaliacoes.json`, `feedbacks.json`, `remocoes.json`, `payment_log.json`, `repasses.json`, `audit_log.json`, `contatos.json`, `clients.json` mantendo apenas a conta admin) e `data/counter.json`.
   - **Se rodando em JSON** (`data/storage-backend.txt = "json"`): mesma lista, sem o `db.sqlite*`.
   - Alternativa segura: usar `/admin/reset` no painel, que faz backup automático antes de zerar.
4. Apague o conteúdo de `public/uploads/`, `storage/originals/` e `storage/videos/`.
5. Rode `npm install && npm run build && npm test` para garantir que continua compilando e os testes passam.
6. Consulte o [Manual do Fotógrafo](docs/MANUAL_FOTOGRAFO.md) para o passo a passo de uso diário.

---

## 14. Documentação complementar

- [`docs/MANUAL_FOTOGRAFO.md`](docs/MANUAL_FOTOGRAFO.md) — guia de uso para o fotógrafo que opera o painel.
- [`docs/OPERACAO.md`](docs/OPERACAO.md) — runbook técnico (backup, scripts, troubleshooting).
- [`docs/ARQUITETURA_IMAGENS.md`](docs/ARQUITETURA_IMAGENS.md) — deep dive do pipeline de imagens e da marca d'água.
- [`docs/SEGURANCA_E_LGPD.md`](docs/SEGURANCA_E_LGPD.md) — checklist de segurança e LGPD antes de publicar.
- [`docs/BACKLOG_EXECUCAO_Codex.md`](docs/BACKLOG_EXECUCAO_Codex.md) — backlog detalhado por blocos de execução.

---

## 15. Resumo honesto do estado do projeto

O que começou como uma vitrine de fotos hoje é uma **plataforma operacional completa para fotógrafo solo (e equipe pequena)**: publica álbuns, protege originais, organiza fotos e vídeos, registra clientes, vende, libera downloads, acompanha pedidos, gerencia descontos progressivos, cupons, cashback e propostas, centraliza carrinhos, modera comentários, opera reconhecimento facial/numérico, distribui repasses para colaboradores e administra reclamações.

O principal limite atual **não é falta de tela ou de fluxo**. As peças críticas — autorização server-side, banco SQLite, storage externo opcional, backup automático, monitoração, testes mínimos e múltiplos gateways — já estão no lugar. O que resta para um deploy público é apertar segurança (revisar webhooks, rotação de `AUTH_SECRET`, expiração de URLs assinadas), sanitizar dados de teste e operacionalizar o backup/monitor em rotina. A UI, o fluxo de venda, o pipeline de imagens/vídeos e a operação diária já estão em uso real.
