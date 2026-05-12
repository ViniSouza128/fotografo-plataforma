# Segurança e LGPD — Checklist antes de publicar

Este documento reúne o que precisa ser endurecido antes de expor a plataforma em um domínio público, e como tratar solicitações de titulares (LGPD).

> Em resumo: **hoje o projeto é seguro para uso interno / operacional**. Para colocar em produção pública sob um domínio exposto, os itens abaixo precisam ser revisados.

---

## 1. Segurança — estado atual vs alvo

| Item | Estado atual | Alvo |
| --- | --- | --- |
| Cookie auth_token | httpOnly, `SameSite=Lax`, HMAC-SHA256 com `AUTH_SECRET` | ✔ ok, manter |
| Segredo de assinatura | Fallback embutido se `AUTH_SECRET` não setado | **Definir `AUTH_SECRET` forte no .env em produção** |
| Hash de senha | `scrypt` + salt (16 bytes) | ✔ ok |
| Proteção de originais | Middleware bloqueia `/uploads/<arquivo não seguro>` | ✔ ok |
| Download autorizado | `/api/photos/[id]/download` valida cliente/pedido/token | ✔ ok |
| Autorização admin-only nas APIs | Parcial: algumas rotas ainda dependem do front-end filtrar | Aplicar `requireAuth({ role: 'admin' })` em todas as rotas sensíveis |
| Rate limit | Existe em `/api/comentarios` | Estender para `/api/remocoes`, `/api/avaliacoes`, `/api/auth/login`, `/api/auth/register` |
| Logs de auditoria | Payment log existe, outros não | Adicionar audit log (BE-37) para ações de admin (reset de senha, remoções, edição de pedidos) |
| CSRF | Hoje depende de `SameSite` | Avaliar token CSRF explícito se for expor em domínio com subdomains públicos |
| HTTPS | Depende do deploy | Obrigatório em produção (Certbot) |
| Antivírus/WAF | Nenhum | Cloudflare na frente ajuda |
| Backup | Manual | Automatizar (ver `OPERACAO.md`) |

---

## 2. Segredos que NÃO podem vazar

Verifique que **estes arquivos nunca são commitados**:

- `.env.local`
- `data/config.json` (contém chaves Asaas e Stripe)
- `data/clients.json` (dados pessoais e hashes)
- `data/pedidos.json` (dados pessoais)
- `data/payment_log.json` (tokens e IDs de transação)

Adicione ao `.gitignore`:

```gitignore
.env
.env.local
data/*.json
!data/config.sample.json
storage/
public/uploads/
```

Se algum desses já foi commitado no passado, **troque as chaves** (Asaas e Stripe emitem novas) e considere reescrever o histórico com `git filter-branch` ou `git filter-repo`.

---

## 3. Permissões server-side

Todas as rotas de API em `src/app/api/**/route.js` deveriam checar permissão **no servidor**, não só no front-end.

Padrão recomendado (usando `apiAuth.js`):

```js
import { requireAuth } from '@/lib/apiAuth'

export async function POST(request) {
  const user = await requireAuth({ role: 'admin' })
  if (user instanceof Response) return user   // 401/403

  // ... lógica
}
```

Rotas que **precisam** de revisão (já seguem o padrão em boa parte, mas revise antes de publicar):

- `POST/PATCH/DELETE /api/events` e `/api/events/[id]`
- `POST/PATCH/DELETE /api/photos`
- `POST /api/events/[id]/regenerate`
- `POST /api/images/missing`
- `POST/DELETE /api/watermark` e `/api/watermark/assets` e `/api/watermark/regenerar`
- `GET /api/pagamento/log`
- `PATCH/POST /api/pedidos` e `/api/pedidos/notes`
- `GET /api/clients`, `PATCH /api/clients/[id]`, `POST /api/clients/[id]/reset-password`
- `PATCH /api/remocoes` (aceitar/rejeitar)
- `PATCH /api/comentarios` (quando `action` é `edit` por admin ou `omit` em post alheio)
- `POST /api/carrinhos` (admin), `DELETE /api/carrinhos`

---

## 4. LGPD — Lei Geral de Proteção de Dados

A Lei 13.709/2018 se aplica a tudo que trata dado pessoal de pessoa física no Brasil. Fotos de rosto são dados pessoais.

### 4.1 Bases legais de uso das fotos

Documente formalmente qual base legal você usa. As mais comuns neste contexto:

- **Consentimento** (art. 7º, I) — quando a pessoa autoriza explicitamente.
- **Execução de contrato** (art. 7º, V) — ex.: casamento contratado pela família.
- **Legítimo interesse** (art. 7º, IX) — eventos públicos com grande número de participantes, onde ninguém tem destaque exclusivo e a finalidade é comercial legítima (venda de fotos do próprio evento aos participantes).

Em eventos esportivos públicos a base mais adequada é normalmente **legítimo interesse**, desde que:

- O evento seja efetivamente aberto ao público.
- A pessoa seja retratada em contexto do evento, não em situação pessoal íntima.
- A foto não tenha conteúdo vexatório.

### 4.2 Direitos do titular

O titular pode exigir:

1. **Acesso** — ver quais dados você tem dele.
2. **Correção** — atualizar dado incorreto.
3. **Anonimização / eliminação** — remover dado desnecessário.
4. **Portabilidade** — receber os dados dele em formato legível.
5. **Eliminação por consentimento revogado**.
6. **Informação sobre compartilhamento**.
7. **Oposição** — recusar tratamento desproporcional.

No sistema, já existem hoje:

- **Pedido de remoção de foto** (`/api/remocoes` + painel `/admin/remocoes`) — atende o direito 3 e 5.
- **Edição do perfil** (`/minha-conta/configuracoes`) — atende 1 e 2.
- **Download das próprias compras** — atende 4 (parcialmente).
- **Desativação de conta** (admin) — atende 5 (para a conta).

Falta implementar (pendente):

- **Exclusão definitiva de conta pelo próprio cliente** (hoje é só desativação).
- **Export completo dos dados do cliente em JSON** (portabilidade automatizada).
- **Aviso formal de política de privacidade no cadastro** (checkbox obrigatório com link).

### 4.3 Atendendo uma solicitação

Quando chegar um pedido de remoção:

1. Confirme identidade do solicitante (CPF + foto de documento, se for caso sério).
2. Registre em `/admin/remocoes` com comentário interno.
3. **Avalie:**
   - Foto em evento público, pessoa sem destaque exclusivo, base legítima → pode recusar, explique educadamente.
   - Foto com destaque exclusivo, situação constrangedora ou criança identificável sem autorização dos pais → **remova imediatamente**.
4. Se aceitar:
   - Marque a solicitação como aceita no painel.
   - Exclua fisicamente o original quando tiver certeza (ver seção 6).
   - Mantenha o registro da solicitação por 5 anos (evidência de cumprimento).

### 4.4 Dados pessoais armazenados

Resumo do que o sistema guarda por pessoa:

| Entidade | Campo | Justificativa |
| --- | --- | --- |
| Cliente | nome, e-mail, WhatsApp, CPF, data de nascimento | execução de contrato (venda) |
| Cliente | senha (hasheada) | segurança da conta |
| Cliente | favoritos, curtidas, comentários | melhoria do serviço |
| Pedido | nome, WhatsApp, CPF, e-mail | emissão de NF + atendimento |
| Pagamento | ID de gateway, valor, método | obrigação fiscal |
| Comentário | autor, texto, timestamp | manutenção do conteúdo |

Base legal: execução de contrato + obrigação legal fiscal.

### 4.5 Retenção

Sugestão de política:

| Dado | Tempo de retenção |
| --- | --- |
| Pedido pago + nota fiscal | 5 anos (legal) |
| Pedido cancelado/não pago | 6 meses |
| Carrinho abandonado | 6 meses |
| Foto de evento público comercializada | enquanto fizer sentido operacional |
| Foto recusada em venda | 30 dias após aceitar remoção |
| Logs de pagamento | 5 anos |
| Comentários | permanente (podem ser omitidos) |

---

## 5. Política de privacidade — template mínimo

Publique em `/politica-de-privacidade` (página pública que ainda precisa ser criada; é um TODO na roadmap):

> **Política de Privacidade — {nome do estúdio}**
>
> 1. **Controlador dos dados**: {nome, CPF/CNPJ, e-mail de contato}.
> 2. **Dados coletados**: nome, e-mail, WhatsApp, CPF, data de nascimento (quando o usuário se cadastra ou compra fotos).
> 3. **Finalidades**: permitir a venda de fotos, emitir nota fiscal, fornecer acesso aos downloads comprados, suporte.
> 4. **Bases legais**: execução de contrato (art. 7º V), obrigação legal (art. 7º II), legítimo interesse (art. 7º IX) para fotos de eventos públicos.
> 5. **Compartilhamento com terceiros**: gateways de pagamento (Asaas, Stripe) para processar cobrança; operadora de WhatsApp para envio de link. Não compartilhamos com terceiros para marketing.
> 6. **Retenção**: conforme política descrita em `{link}`.
> 7. **Direitos do titular**: acesso, correção, eliminação, portabilidade, oposição. Para exercer, escreva para `{e-mail}` ou abra solicitação em `{link do formulário}`.
> 8. **Transferência internacional**: os gateways utilizados podem ter servidores fora do Brasil. A base legal é o legítimo interesse e a execução de contrato.
> 9. **Segurança**: dados trafegam em HTTPS; senhas são armazenadas com scrypt + salt; originais são protegidos por middleware.
> 10. **Data da última atualização**: {data}.

---

## 6. Exclusão física de fotos

Aceitar uma remoção apenas marca a foto como `removida` em `photos.json` e esconde da galeria. **Não apaga os arquivos em disco**.

Para apagar fisicamente:

1. Tire nota do `id` e `filename` da foto em `photos.json`.
2. Apague:
   - `storage/originals/{eventId}/{filename}.jpg`
   - `public/uploads/grid/clean/{filename}.jpg`
   - `public/uploads/grid/wm/{filename}.jpg`
   - `public/uploads/thumbs/clean/{filename}.jpg`
   - `public/uploads/thumbs/wm/{filename}.jpg`
   - `public/uploads/mini/clean/{filename}.jpg`
   - `public/uploads/mini/wm/{filename}.jpg`
3. Se era foto de capa, troque a capa do álbum e regenere (`POST /api/events/[id]/regenerate { type: 'cover' }`).
4. Idealmente, registre no log de auditoria (quando implementado) quem apagou e quando.

Existe espaço para um botão **"apagar definitivamente"** no painel `/admin/remocoes`, pendente de implementação (está no backlog como parte de BE-26).

---

## 7. Boas práticas operacionais

- Troque `AUTH_SECRET` se suspeitar de vazamento (invalida todos os cookies).
- Revogue todos os cookies aumentando `sessionVersion` das contas afetadas.
- Monitore o `data/payment_log.json` diariamente (ou configure alerta) para detectar tentativas estranhas.
- Nunca dê acesso FTP/SSH ao servidor a terceiros sem supervisão.
- Mantenha o Node.js e as dependências atualizados (`npm audit fix`).
- Faça **dry-run** de qualquer script de migração antes de `--apply`.
- Para cada release, registre no CHANGELOG o que foi mudado.

---

## 8. Checklist final antes de colocar no ar

```
[ ] AUTH_SECRET forte no .env.local (não o fallback).
[ ] ADMIN_PASSWORD padrão trocado.
[ ] HTTPS ativo com cert válido.
[ ] Backup diário automatizado configurado.
[ ] data/ e storage/ fora do git (ver .gitignore).
[ ] Chaves de pagamento em produção, não sandbox.
[ ] Webhooks Asaas e Stripe configurados e testados.
[ ] Rate limit em /api/auth/login, /api/auth/register, /api/remocoes.
[ ] Autorização server-side revisada em todas as rotas /api/ sensíveis.
[ ] Política de privacidade publicada.
[ ] Termos de uso publicados (mesmo que mínimos).
[ ] Canal de atendimento LGPD ativo (e-mail ou formulário).
[ ] Plano de resposta a incidente definido (quem aciona quem, em quanto tempo).
[ ] Primeiro teste de restore do backup feito (não basta ter backup — precisa saber restaurar).
```

Se algum item está aberto, **é melhor adiar o deploy público**.

## 9. Sanitizacao antes de compartilhar ou publicar

Nao apague dados reais automaticamente. Para preparar uma copia segura:

1. Faca backup privado de `data/`, `storage/` e `public/uploads/`.
2. Remova do pacote compartilhado todos os JSONs reais em `data/*.json`.
3. Inclua apenas samples, como `data/config.sample.json`, com chaves vazias e dados ficticios.
4. Se precisar enviar um JSON para diagnostico, remova nomes, CPF/CNPJ, e-mail, WhatsApp, hashes de senha, IDs de gateway, tokens, URLs de pagamento, logs e nomes de arquivos sensiveis.
5. Troque imediatamente chaves de Asaas/Stripe se qualquer copia de `data/config.json` sair do ambiente controlado.

Enquanto as chaves de pagamento forem editaveis pelo painel, `data/config.json` deve ser tratado como segredo. Em deploy publico, prefira migrar essas chaves para `.env.local` quando o fluxo administrativo permitir.

Checklist especifico de versionamento seguro:

```gitignore
.env
.env.local
data/*.json
!data/*.sample.json
storage/
public/uploads/
backup/
backups/
```

---

## 12. Reconhecimento facial e numérico (P36)

O recurso de reconhecimento — **opt-in, desativado por padrão** — permite buscar fotos por código numérico (ex: número de camisa) ou por rosto (engine `face-api-local`, opcional).

### Princípios e LGPD

- **Tudo local**: por padrão, nenhuma imagem é enviada para serviço externo. Engines suportados:
  - `manual` (default): extrai códigos numéricos do nome do arquivo / EXIF; sem ML.
  - `face-api-local`: detecção e embeddings via `@vladmandic/face-api` rodando no servidor com TensorFlow.js. Modelos ficam em `data/vision/models/` (não vão para `/public`).
  - `external` (não habilitado por padrão): caminho reservado para integração externa, **só funciona se super-admin marcar `externoConfigurado=true` e fornecer `externoEndpoint`**. Nada é enviado sem isso.
- **Consentimento**: cliente precisa aceitar termo (`reconhecimentoConsentidoEm`) antes de fazer upload de referência facial. Revogar apaga **todas** as referências e bloqueia novas buscas.
- **Armazenamento separado**: imagens de referência ficam em `storage/vision/refs/<owner>/<id>.jpg`, fora de `/public`. Embeddings ficam em `data/vision/references.json`.
- **Bloqueio/omissão**: cliente pode pedir bloqueio de fotos específicas; toda solicitação requer **revisão manual** pelo admin antes de remover dos resultados.

### Onde fica o quê

| Recurso | Caminho |
| --- | --- |
| Configuração runtime | `data/vision/config.json` |
| Índice de fotos (codes/embeddings) | `data/vision/index.json` |
| Referências de busca | `data/vision/references.json` |
| Imagens das referências | `storage/vision/refs/<ownerId>/*.jpg` |
| Modelos faciais | `data/vision/models/*` |
| Solicitações de bloqueio | `data/vision/blocks.json` |
| Logs de auditoria | `data/audit_log.json` (eventos `vision.*`) |

### Setup do engine facial (opcional)

```sh
npm install @vladmandic/face-api @tensorflow/tfjs
# (opcional, mais rápido) npm install @tensorflow/tfjs-node
```

Baixe os pesos para `data/vision/models/` (do repo oficial `@vladmandic/face-api` — diretório `model/`):

- `ssd_mobilenetv1_model-*`
- `face_landmark_68_model-*`
- `face_recognition_model-*`

Em **/admin/reconhecimento → Configuração**, escolha `engine = face-api-local`. O painel só permite selecionar quando os modelos estão no disco.

### APIs

| Método | Rota | Quem |
| --- | --- | --- |
| `GET` | `/api/reconhecimento/config` | admin |
| `PATCH` | `/api/reconhecimento/config` | super-admin |
| `POST` | `/api/reconhecimento/indexar` | admin (ownership colaborador respeitada) |
| `POST` | `/api/reconhecimento/buscar` | admin sempre · cliente se `permitirCliente=true` + consentimento |
| `GET/POST/DELETE` | `/api/reconhecimento/referencias` | dono (cliente) ou admin |
| `POST/GET/PATCH` | `/api/reconhecimento/bloqueios` | cliente cria · admin revisa |
| `POST/DELETE` | `/api/reconhecimento/consentimento` | cliente |

### Auditoria

Eventos registrados em `data/audit_log.json`:

- `vision.config_updated` — alteração de configuração
- `vision.indexed` — indexação de fotos
- `vision.search` — busca executada
- `vision.reference_created` / `vision.reference_deleted`
- `vision.block_requested` / `vision.block_resolved`
- `vision.consent_granted` / `vision.consent_revoked`

### Direitos do titular (LGPD)

- **Acesso**: cliente vê suas referências em `/minha-conta/reconhecimento`.
- **Eliminação**: revogar consentimento apaga arquivo + embedding (`DELETE /api/reconhecimento/consentimento`).
- **Oposição**: solicitar bloqueio de foto específica (`POST /api/reconhecimento/bloqueios`).
- **Revisão humana**: bloqueios não são automáticos; admin decide aprovar/rejeitar.

### Limites e o que NÃO foi feito nesta etapa

- Reconhecimento numérico via OCR (Tesseract) ainda não está integrado — apenas extração simples a partir do nome do arquivo / metadados. OCR fica como evolução futura.
- Variantes de resolução, anti-spoofing facial e quality scoring não foram incluídos.
- Para alta carga, considerar substituir o `index.json` por SQLite/Vector DB com índice IVFFlat.
