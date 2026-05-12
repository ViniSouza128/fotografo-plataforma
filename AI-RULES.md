# AI-RULES.md

## Restricoes tecnicas
- Linguagem: JavaScript (sem TypeScript).
- Framework: Next.js App Router.
- Estilo: CSS importado por `src/app/globals.css` e modulos sob `src/app/*.css`.
- Persistencia: SQLite (`data/db.sqlite`) ou JSON (`data/*.json`). O backend ativo e definido em `data/storage-backend.txt` e roteado por `src/lib/db/router.js`.
- Imagens originais nao ficam em `public/`; ficam em `storage/originals/`.
- Storage externo (R2/S3/B2/MinIO) e opcional, configurado em `data/config.json:storageExterno`.

## Regras de alteracao
- Nao trocar stack sem pedido explicito (sem TypeScript, Tailwind, ORM, NestJS, etc.).
- Nao migrar de SQLite para outro banco por conta propria; tocar persistencia passa por `src/lib/db/`.
- Nao expor originais em `/public`; respeitar `middleware.js`.
- Nao duplicar CRUD: preferir `src/lib/events.js`, `photos.js`, `pedidos.js`, `clients.js`, `videos.js`, `cupons.js`, `propostas.js`, `rewards.js`, `chat.js`, `colaborador.js`, etc.
- Lint, formatter e test runner ja existem (ESLint, Prettier, Vitest); use-os em vez de criar paralelos.
- Nao misturar mudanca destrutiva (migracao, reset, exclusao fisica) com mudanca de regra de venda/pagamento na mesma rodada.

## Padroes do repo
- Paginas e layouts em `src/app`.
- APIs em `src/app/api/**/route.js`.
- Helpers de dominio em `src/lib`, com subpacotes em `src/lib/db`, `src/lib/storage`, `src/lib/vision`.
- Componentes compartilhados em `src/components`.
- Hooks custom em `src/hooks`.
- Scripts operacionais em `scripts/` (imagens, banco, storage, backup, monitor, verificacao).
- Testes em `tests/` (Vitest, environment node).

## UX/UI
- Tema escuro.
- Tipografia via Google Fonts (`Inter`, `Space Grotesk`).
- Tokens principais em `src/app/base.css`.
- Navbar sticky, cards escuros, acento verde (`--accent`) com cor configuravel em `data/config.json`.
- Mobile tem drawer e ajustes proprios; nao quebrar fluxo desktop.

## Checklist antes de encerrar
- Confirmar caminho de dados/fluxo impactado (verificar se a entidade tem repository SQLite ou ainda roda em JSON).
- Rodar `npm run build`.
- Rodar `npm test` quando tocar libs criticas (auth, pricing, downloads, pagamento, safeDeletion, imagePaths, cupons).
- Rodar `npm run lint` em mudancas amplas.
- Se tocar pipeline de imagem, rodar `npm run images:audit`.
- Se tocar storage externo ou backend, rodar `npm run verify:deep` antes de fechar.
