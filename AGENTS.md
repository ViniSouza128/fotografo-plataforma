# AGENTS.md

## Papel recomendado por tarefa
- Arquitetura/fluxo: ler `ARCHITECTURE.md` + `src/lib/*` (dominio) + `src/lib/db/router.js`
- UI/UX: ler `DESIGN-SYSTEM.md` + componentes/paginas envolvidos
- Backend/API: ler rota em `src/app/api/**` e helper correspondente em `src/lib/*`
- Persistencia: `src/lib/db/{router,repositories,schema,connection}.js` e `data/storage-backend.txt`
- Storage de imagens: `src/lib/storage/*` e `src/lib/imageStorage.js`
- Visao computacional: `src/lib/vision/*` (motores `faceApi` e `manual`)
- Conteudo operacional: consultar `docs/OPERACAO.md`, `docs/ARQUITETURA_IMAGENS.md`, `docs/MIGRACAO_BANCO.md`, `docs/STORAGE_EXTERNO.md`, `docs/PAGAMENTOS.md`, `docs/SEGURANCA_E_LGPD.md` quando relevante

## Sequencia curta para qualquer agente
1. Ler `package.json` e `data/storage-backend.txt`.
2. Confirmar area alvo em `src/app`, `src/components` e `src/lib`.
3. Checar se ja existe helper/rota equivalente.
4. Fazer mudanca minima e consistente.
5. Rodar `npm run build` e, quando relevante, `npm test`.

## Heuristicas para reduzir tokens
- Nao reler o repo inteiro; ir direto ao dominio afetado.
- Nao resumir arquivos grandes em excesso; extrair apenas contrato, fluxo e efeitos colaterais.
- Se o assunto for imagem, olhar primeiro `image*.js`, `watermark*.js`, `middleware.js`, `src/lib/storage/*`.
- Se o assunto for video, olhar `videoProcessing.js`, `videos.js`, `src/app/api/videos/**` e `src/app/api/upload-video/**`.
- Se o assunto for auth, olhar `auth.js`, `apiAuth.js`, `clients.js`, `colaborador.js`, `/api/auth/*`.
- Se o assunto for checkout/pedidos, olhar `pedidos.js`, `payment.js`, `commerceUtils.js`, `paymentWebhookUtils.js`, `cartPricePolicy.js`.
- Se o assunto for promocao/credito, olhar `cupons.js`, `rewards.js`, `propostas.js`.
- Se o assunto for persistencia, ler `src/lib/db/router.js` antes de tocar JSON ou SQLite direto.

## Validacao por tipo de mudanca
- Sempre: `npm run build`.
- Quando tocar libs criticas (auth, pricing, downloads, imagens, pagamento): rodar `npm test` (suite Vitest em `tests/`).
- Imagens/derivadas/watermark: `npm run images:audit`.
- Mudancas grandes: `npm run verify:deep` (smoke completo de rotas).
- Migracao banco/storage: rodar primeiro `*:dry`/`*:rollback` em ambiente isolado.

## Nao encontrado
- Multi-package workspace
- Monorepo tools
- TypeScript

## Default sugerido
- Um agente principal basta na maioria das tarefas; dividir por dominio apenas em mudancas grandes (ex.: video + pagamento + admin simultaneamente).
