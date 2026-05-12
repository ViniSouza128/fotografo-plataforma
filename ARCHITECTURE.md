# ARCHITECTURE.md

## Mapa curto
- `src/app/page.js`: home publica.
- `src/app/evento/[id]/page.js`: galeria do evento.
- `src/app/minha-conta/**`: area do cliente.
- `src/app/admin/**`: painel administrativo.
- `src/app/api/**`: backend local via Route Handlers.
- `src/components/*`: Navbar, Footer, modal de foto, comentarios, carrinho, chat, etc.
- `src/lib/*`: auth, CRUD, pricing, pagamentos, imagens, watermark, video, vision.
- `src/lib/db/`: camada de persistencia (router JSON/SQLite, schema, repositories).
- `src/lib/storage/`: facade FS local + S3 (R2/B2/MinIO).
- `src/lib/vision/`: reconhecimento facial e numerico.

## Mapa completo (repo)
### Top-level
- `src/`: aplicacao (UI + API + regras).
- `data/`: persistencia. Hoje pode rodar em SQLite (`data/db.sqlite`) ou JSON (`data/*.json`). Backend ativo fica em `data/storage-backend.txt`.
- `public/`: arquivos publicos (derivadas de imagem, assets).
- `storage/`: arquivos fora da arvore publica (originais, videos, backups, migracoes).
- `scripts/`: scripts operacionais (imagem, migracao banco/storage, backup, monitor, verificacao).
- `tests/`: suite Vitest (api smoke, auth, cpf/cnpj, cupons, downloadTiers, imagePaths, paymentGateways, pricing, safeDeletion).
- `docs/`: documentacao operacional e arquitetura detalhada.
- `middleware.js`: bloqueio de acesso a originais/nao-derivados em `/uploads` e `/_next/image`.
- `.env.example`: variaveis de ambiente (auth, gateways, SMTP, storage, monitor).
- `.eslintrc.json`, `.prettierrc`: lint/format.
- `vitest.config.js`: config dos testes.

### src/
- `src/app/`: App Router (paginas, layouts, rotas).
- `src/app/api/`: endpoints (Route Handlers).
- `src/components/`: componentes reutilizaveis.
- `src/hooks/`: hooks custom.
- `src/lib/`: regras de negocio + acesso a dados + pipelines.
- `src/lib/db/`: `connection.js`, `schema.js`, `repositories.js`, `router.js`.
- `src/lib/storage/`: `index.js`, `s3.js`, `config.js`, `migrate.js`, `migrationState.js`.
- `src/lib/vision/`: `index.js`, `storage.js`, `engines/{faceApi.js, manual.js}`.

### data/ (principais)
- `data/db.sqlite` (+ `db.sqlite-shm`, `db.sqlite-wal`): banco SQLite quando ativo.
- `data/storage-backend.txt`: backend ativo (`sqlite` | `json`).
- `data/events.json`: eventos/albuns.
- `data/photos.json` (+ pasta `data/photos/`): catalogo de fotos.
- `data/videos.json`: videos vendaveis.
- `data/clients.json`: contas (user/admin) e estados sociais (favoritos/curtidas).
- `data/pedidos.json`: pedidos e itens.
- `data/repasses.json`: comissoes/repasses para colaboradores.
- `data/config.json`: configuracoes do estudio, precos, gateways, watermark, storage externo, patrocinadores.
- `data/payment_log.json` (+ pasta `data/payment-logs/`): log de pagamento por dia.
- `data/comentarios.json`, `data/avaliacoes.json`, `data/feedbacks.json`, `data/remocoes.json`: modulos sociais/LGPD.
- `data/contatos.json`: mensagens da pagina publica de contato.
- `data/audit_log.json`: trilha de auditoria.
- `data/counter.json`: contadores publicos.
- `data/vision/models/`: modelos `face-api.js` carregados localmente.

### Midia (caminhos)
- Originais (nao publicos): `storage/originals/{eventId}/*.jpg`
- Derivadas (publicas): `public/uploads/{grid|thumbs|mini|covers}/{clean|wm}/*.jpg`
- Watermarks: `public/watermarks/*.png` e `public/watermark.png`
- Videos: `storage/videos/{eventId}/...`
- Backups: `storage/backups/`
- Logos de patrocinadores: `public/uploads/sponsor-logos/`

## Mapa completo (rotas)
### UI publica
- `/`: home + busca de eventos.
- `/evento/[id]`: galeria do evento (fotos + videos).
- `/carrinho`, `/checkout`, `/compras`: fluxo de compra.
- `/login`, `/cadastro`, `/trocar-senha`, `/recuperar-senha`: auth do cliente/admin.
- `/contato`, `/privacidade`, `/termos`: paginas institucionais.

### Area do cliente
- `/minha-conta`: hub.
- `/minha-conta/compras`, `/minha-conta/favoritos`, `/minha-conta/configuracoes`, `/minha-conta/comentarios`, `/minha-conta/remocoes`, `/minha-conta/carrinho`, `/minha-conta/notificacoes`, `/minha-conta/propostas`, `/minha-conta/chat`, `/minha-conta/cashback`, `/minha-conta/exportar`.

### Admin
- `/admin`: dashboard.
- `/admin/eventos`, `/admin/eventos/[id]`: gestao de eventos (com abas Vendas, Carrinhos, Fotos, Videos, Relatorios, Precos, Marca d'agua, Informacoes).
- `/admin/criar-evento`, `/admin/upload-fotos/[eventId]`: criacao e upload.
- `/admin/pedidos`, `/admin/clientes`, `/admin/carrinhos`, `/admin/comentarios`, `/admin/remocoes`, `/admin/contatos`.
- `/admin/marca-dagua`, `/admin/configuracoes`, `/admin/personalizar`.
- `/admin/cupons`, `/admin/notificacoes`, `/admin/propostas`, `/admin/chat`, `/admin/colaboradores`, `/admin/repasses`.
- `/admin/reconhecimento`: indexacao e busca por face/numero.
- `/admin/estatisticas`: graficos e exportacao.
- `/admin/reset`: reset/restore guiado.

### API (alto nivel)
- Auth: `/api/auth/*`
- Eventos: `/api/events`, `/api/events/[id]`
- Fotos: `/api/photos`, `/api/photos/[id]/*`
- Videos: `/api/videos`, `/api/upload-video`
- Social: `/api/favoritos`, `/api/curtidas`, `/api/comentarios`, `/api/avaliacoes`, `/api/feedback`, `/api/remocoes`, `/api/contato`
- Pagamento: `/api/pagamento/*` (Asaas, Stripe, Mercado Pago, PagSeguro, manual)
- Imagens: `/api/images/*`, `/api/watermark/*`, `/api/upload`, `/api/upload-sponsor-logo`
- Comercial: `/api/cupons`, `/api/propostas`, `/api/rewards`
- Operacao: `/api/repasses`, `/api/colaboradores`, `/api/notificacoes`, `/api/chat`, `/api/email`, `/api/storage`, `/api/audit-log`, `/api/estatisticas`, `/api/reconhecimento`, `/api/admin/*`
- Config: `/api/config`

## Fluxo de dados
1. UI chama `/api/...`.
2. Route handler usa `src/lib/*`.
3. Helpers de dominio chamam `src/lib/db/router.js`, que despacha para SQLite (`repositories.js`) ou JSON conforme `data/storage-backend.txt`.
4. Imagens passam por `src/lib/storage/index.js` (local + mirror S3 opcional).
5. UI renderiza resposta e, em alguns fluxos, usa `localStorage` para estado do navegador.

## Midia
- Originais: `storage/originals/{eventId}/*.jpg` (acesso autenticado via `/api/photos/[id]/download`).
- Derivadas publicas: `public/uploads/{grid|thumbs|mini|covers}/{clean|wm}/*.jpg`.
- Watermarks: `public/watermarks/*.png`.
- Videos: ffmpeg gera preview/thumb/poster sob `storage/videos/...`.
- Mirror opcional para bucket S3-compatible (`src/lib/storage/index.js`).
- Protecao de acesso direto: `middleware.js`.

## Auth
- Token HMAC em cookie httpOnly (`src/lib/auth.js`), payload `{ userId, role, sessionVersion, exp }`.
- Senha com scrypt + salt.
- `sessionVersion` invalida tokens em troca de senha, reset admin e desativacao.
- Validacao server-side em `src/lib/apiAuth.js`.
- Permissoes parciais para colaboradores em `src/lib/colaborador.js`.

## Persistencia
- Padrao atual: **SQLite** (`data/db.sqlite`), via `better-sqlite3` em modo WAL.
- Fallback: JSON em `data/*.json` (rotas legacy ou modulos sem repositorio dedicado ainda).
- Backend selecionado por `data/storage-backend.txt` (sobrescritivel via env `STORAGE_BACKEND`).
- Migracao: `npm run db:migrate` (com `--dry`/`--force`); rollback: `npm run db:rollback`.

## Storage
- Backend ativo via `data/config.json:storageExterno.ativo`.
- Suporta R2/S3/B2/MinIO/custom.
- Local continua source-of-truth; uploads sao espelhados para o bucket de forma fire-and-forget.
- Reads preferem local; fallback para S3 quando habilitado.
- URLs assinadas por TTL configuravel para downloads autorizados.
- Migracao: `npm run storage:migrate` (e variantes); rollback: `npm run storage:rollback`.

## Scripts
- `npm run build` / `npm start` / `npm run dev`
- `npm run lint`, `npm run lint:fix`
- `npm test`, `npm run test:watch` (Vitest)
- `npm run images:audit`, `npm run images:normalize`
- `npm run db:migrate[:dry|:force]`, `npm run db:rollback`
- `npm run storage:migrate[:originals|:derivatives]`, `npm run storage:rollback`
- `npm run backup`, `npm run monitor[:json]`
- `npm run verify:full`, `npm run verify:deep`

## Testes
- Suite minima em `tests/` (Vitest, environment node + jsdom sob demanda).
- Cobre: auth, pricing, descontos, downloadTiers, cupons, safeDeletion, imagePaths, paymentGateways, smoke das APIs principais.
- Configuracao em `vitest.config.js` (alias `@/*` igual ao Next).

## Nao encontrado
- TypeScript
- Storybook ou design-system documentado em ferramenta externa
- Banco relacional remoto (Postgres/MySQL): SQLite local cobre o caso atual
- CI/CD: nao ha pipeline declarado em `.github/`
