# Changelog

Registro das mudanças mais relevantes da plataforma.

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/). Datas em ISO-8601.

---

## [Não lançado]

### A fazer

- BP04: separar `public/uploads/` por evento (depende de banco/storage estabilizados).
- Endurecimento final antes de domínio público (revisão de webhooks, TTLs, rotação de `AUTH_SECRET`).
- Postgres opcional (multi-tenant) — hoje SQLite atende o caso single-server.

---

## [2026-05-10]

### Adicionado

- **Banco de dados SQLite (P38)** via `better-sqlite3`. Camada em `src/lib/db/` com `connection.js`, `schema.js`, `repositories.js` e `router.js`. Backend selecionado por `data/storage-backend.txt` (default: `sqlite`); env `STORAGE_BACKEND` sobrescreve. Scripts `npm run db:migrate[:dry|:force]` e `npm run db:rollback` cobrem migração e volta para JSON com backup obrigatório.
- **Storage externo S3-compatible (P39)** em `src/lib/storage/` (R2, S3, MinIO, B2, custom). Local segue como source-of-truth; uploads são espelhados; reads preferem local com fallback ao bucket; URLs assinadas com TTL configurável. Painel `/admin/configuracoes` (aba Storage) controla `mirrorOnUpload`, `preferExternalForReads`, CDN base e segredos. Scripts `npm run storage:migrate[:originals|:derivatives]` e `npm run storage:rollback`.
- **Backup automático e monitoração (P40)** via `npm run backup` (snapshot diário de `data/` + `db.sqlite` em `storage/backups/`, retenção configurável) e `npm run monitor[:json]` (disco, processo, logs, alerta opcional via webhook).
- **Suite de testes Vitest (P41)** em `tests/`: `auth`, `pricing`, `cupons`, `downloadTiers`, `cpfCnpj`, `imagePaths`, `paymentGateways`, `safeDeletion`, smoke geral das APIs. Configuração mínima em `vitest.config.js` (alias `@/*`).
- **ESLint + Prettier (P41)** configurados (`.eslintrc.json`, `.prettierrc`) com scripts `npm run lint` / `npm run lint:fix`.
- **Vídeos como mídia vendável (P35)** com upload, transcodificação (ffmpeg-static), preview, thumb, marca d'água em vídeo, integração com carrinho/checkout/download. Persistência em `data/videos.json`. Rotas `/api/videos`, `/api/upload-video`, painel `/admin/eventos/[id]` (aba Vídeos).
- **Reconhecimento facial e numérico (P36)** com `@vladmandic/face-api` + TensorFlow.js (opcionais), motor manual de fallback, indexação por evento e busca por imagem ou número de peito. Modelos em `data/vision/models/`. Painel `/admin/reconhecimento`.
- **Patrocinadores e organizadores (BP02)**: cadastro institucional, logos em `public/uploads/sponsor-logos/`, exibição na home, footer e páginas internas conforme `data/config.json`.
- **Cupons de desconto (P30)**: `src/lib/cupons.js`, painel `/admin/cupons`, validação no checkout, persistência e auditoria.
- **Cashback / saldo / ranking (P31)**: `src/lib/rewards.js`, `/api/rewards`, `/minha-conta/cashback`, exibição no checkout e nas listas administrativas.
- **Propostas e contrapropostas (P32)**: `src/lib/propostas.js`, `/api/propostas`, painel `/admin/propostas` e `/minha-conta/propostas`. Propostas são invalidadas se o carrinho mudar.
- **Chat cliente ↔ fotógrafo (P33)** persistido em JSON/SQLite, com painel `/admin/chat` e `/minha-conta/chat`, notificações e leituras marcadas.
- **Colaboradores e permissões parciais (P34)**: `src/lib/colaborador.js`, `/admin/colaboradores`, escopos por área (eventos, pedidos, pagamento, etc.), repasses em `/admin/repasses` (`data/repasses.json`).
- **Notificações internas (P29)**: sino na navbar para cliente e admin, `src/lib/notificacoes.js`, `/api/notificacoes`.
- **E-mail transacional (P28)**: `src/lib/email.js` com nodemailer. Sem `SMTP_*` no `.env`, o envio é silenciosamente desativado. Templates para pedido, troca de senha, remoção, propostas.
- **Reset / backup pelo painel (P27)**: `/admin/reset` com fluxos de exportar, restaurar e zerar dados sob confirmação.
- **Dados institucionais e CNPJ (P25)**: campos completos no painel `/admin/configuracoes` propagados para footer, perfil admin e checkout.
- **Personalização visual (P24)**: `/admin/personalizar` ajusta `accentColor`, `tema`, `homeHeroSubtitulo`, `homeSecaoTitulo` e patrocinadores em `data/config.json`.
- **Estatísticas e exportação (P26)**: `/admin/estatisticas` agrega vendas, receita, fotos, ranking, com export CSV.
- **Página pública de contato + privacidade + termos (P16)**: `/contato`, `/privacidade`, `/termos`, com persistência em `data/contatos.json` e LGPD.
- **Portabilidade e exclusão de conta (P17)** com export `meus dados` em JSON.
- **Mercado Pago e PagSeguro (BP01)** como gateways adicionais, com fallback configurável e webhooks dedicados (`MERCADOPAGO_WEBHOOK_SECRET`, `PAGSEGURO_WEBHOOK_SECRET`).
- **Auditoria (`data/audit_log.json`)** registrando ações sensíveis (login, mudança de admin, exclusão, restore, etc.).
- **Logs de pagamento por dia** em `data/payment-logs/` para retenção e análise.
- **Verificação completa**: `npm run verify:full` e `npm run verify:deep` cobrem 50+ rotas e 40+ APIs.

### Alterado

- **Persistência migrada para SQLite por padrão** (`data/storage-backend.txt = "sqlite"`). Repositórios convivem com handlers JSON legados via `src/lib/db/router.js`; transição é transparente para a UI.
- **Rotas administrativas** passaram a exigir `requireAuth({ requireAdmin: true })` server-side; filtros por front-end / `localStorage` deixaram de ser confiáveis (P01).
- **Rate limit (P02)** padronizado em endpoints públicos sensíveis (`src/lib/rateLimit.js`).
- **Política de mudança de preço em carrinhos (P06)**: preço é congelado no checkout; alterações posteriores não invalidam pedidos pagos.
- **Exclusão física opcional (P07)**: `safeDeletion.js` agora suporta apagar arquivos derivados/originais sob confirmação.
- **Pipeline de imagens** ganhou job de regeneração persistente e suporte a S3 nas leituras quando habilitado.
- **Configurações** consolidadas em abas (estúdio, pagamento, imagens, descontos, storage, reconhecimento, e-mail).
- **Defaults de cor de acento** agora vêm de `accentColor` em `config.json`.

### Corrigido

- Webhooks de pagamento agora validam assinatura por gateway (`paymentWebhookUtils.js`).
- Liberação manual de carrinho aplica desconto progressivo correto.
- Carrinho persistido sobrevive a deploy mesmo após migração JSON→SQLite.
- Job de derivadas não duplica registros após múltiplos disparos concorrentes.
- Reconhecimento manual: deduplicação por SHA-256 e tolerância de rotação.

### Scripts adicionados

- `scripts/migrate-json-to-sqlite.js` (com `--dry` / `--force`) e `scripts/rollback-sqlite-to-json.js`.
- `scripts/migrate-storage-to-s3.js` (com `--only-originals` / `--only-derivatives`) e `scripts/rollback-storage-to-local.js`.
- `scripts/backup-daily.js` e `scripts/monitor-health.js` (com `--json`).
- `scripts/verify-full.js` e `scripts/verify-deep.js`.
- `scripts/migrate-uploads-by-event.js` (preparação para BP04).
- `scripts/fix-a11y-labels.js` (acabamento de acessibilidade).

---

## [2026-04-18]

### Adicionado

- **Painel dedicado de Marca d'água** em `/admin/marca-dagua` com upload de múltiplos assets, variantes por tamanho (grid/thumbs/mini/covers), anchor, opacity, scale e offset, preview em tempo real e botão "regenerar tudo / em álbuns específicos".
- **Sobrescrita de marca por álbum**: toggles `wm_capa` e `wm_miniaturas` em cada evento, com botões de regenerar capa e miniaturas on-demand.
- **Painel de moderação de comentários** em `/admin/comentarios` (árvore, omitir/restaurar, edição admin com histórico).
- **Painel de Remoções LGPD** em `/admin/remocoes` com fluxo completo (aceitar/rejeitar/desfazer, comentário público/privado, contato por WhatsApp **ou** e-mail).
- **Notas em pedidos** (`POST /api/pedidos/notes`) — privadas (só admin) ou públicas (cliente vê).
- **Fluxo de reembolso por pedido** (`solicitado → aprovado/negado → concluído`) com histórico.
- **Derivadas sob demanda** (`GET /api/images/derive`) + **job de faltantes** (`POST /api/images/missing`) com polling e ETA.
- **Troca obrigatória de senha** após reset administrativo (`/trocar-senha`).
- **Comentários em árvore** (replies, likes, rate limit) no álbum e na foto, com ordenação `top|recent`.
- **ID público por série** (fotos `1xxxxxxxx`, pedidos `2xxxxxxxx`, eventos `3xxxxxxxx`), exibido em todas as telas.
- **Mini-thumbs (90px) sem marca d'água** geradas no upload e usadas em painel admin, carrinho e modais internos.
- **Capa dedicada** (`cover_xxx.jpg`, 400px por padrão, sem WM) — separada das thumbs da galeria.
- **Compras como guest**: histórico por link, persistido em `localStorage`, limpeza automática com TTL.
- **Liberação manual** de carrinho ativo pelo admin (gera pedido `liberado_manual`).
- **Upload automático**: inicia ao soltar os arquivos, detecta duplicata por `(originalName, size)`.
- **Autor** das fotos = conta que subiu (não mais fixo).
- **Preço padrão por álbum** com fallback para global.
- **Preferências de visibilidade** editáveis direto na listagem e no cabeçalho do álbum.
- **QR code** do álbum e atalhos de URL no dashboard.
- **CHANGELOG.md, MANUAL_FOTOGRAFO.md, OPERACAO.md, ARQUITETURA_IMAGENS.md, SEGURANCA_E_LGPD.md**.

### Alterado

- **Pipeline de imagens reorganizado** em layout canônico: `public/uploads/{kind}/{clean|wm}/` e `storage/originals/{eventId}/`. Originais saíram de `public/`.
- **Middleware de proteção** (`middleware.js`) restringe acesso direto a originais via `/uploads`.
- **Defaults de derivadas** revisados (`grid` 1600/60, `thumbs` 400/70, `mini` 90/45, `covers` 400/78).
- **Desconto progressivo** aplicado e exibido no carrinho, checkout, painel do cliente e painel admin (preço original riscado, desconto no resumo).
- **Dashboard admin** mostra mini-thumbs sem marca d'água, WhatsApp clicável, botão de download e liberação manual.
- **Configurações**: nome/contato/documento compartilhados entre painel do cliente e painel admin.
- **Categorias custom** passaram a persistir corretamente.

### Corrigido

- Caminhos inconsistentes de thumbs (antes em `/uploads/` solto, agora em `/uploads/thumbs/`), eliminando o `onError` que baixava o original por engano.
- Avaliação em estrelas persistindo entre fotos no modal.
- Solicitação de remoção agora permitida por foto (antes o botão mostrava o primeiro pedido em todas).
- Carrinhos ativos voltaram a aparecer corretamente no painel admin.
- Categorias personalizadas que não salvavam.
- Status `aguardando_pagamento` renomeado em toda a UI admin para `pendente`.

### Scripts de migração

- `scripts/migrate-legacy-originals.js` — move originais soltos para `storage/originals/{eventId}/`.
- `scripts/migrate-derived-images-structure.js` — copia derivadas do layout antigo para o novo.
- `scripts/normalize-image-variants.js` — audita/regenera e arquiva inválidas em `_legacy/`.

---

## [2026-04-04]

### Snapshot inicial (pré-overhaul)

- 44 rotas no App Router.
- 4 eventos, 1287 fotos, 1284 ativas, 20 pedidos, 13 pagos.
- Gateway ativo `asaas_producao` com fallback `stripe`.
- Documentação em README único.
