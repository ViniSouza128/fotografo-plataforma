# PROMPTS.md

## Prompt - implementar feature
```text
Implemente [feature] neste repo sem mudar a stack.
Contexto: Next.js 14 + React 18 + JavaScript + SQLite (data/db.sqlite, com fallback JSON em data/*.json) + imagens em disco com mirror opcional para S3.
Respeite os helpers existentes em src/lib (incluindo src/lib/db, src/lib/storage, src/lib/vision) e as rotas em src/app/api.
Antes de editar, identifique os arquivos ja responsaveis por [area].
Persistencia passa por src/lib/db/router.js quando ja houver repositorio; caso contrario, mantenha o padrao do dominio.
Se algo nao existir, marque como "nao encontrado" e sugira o default minimo.
No final, rode npm run build e npm test (Vitest), reportando o resultado.
```

## Prompt - alterar UI
```text
Ajuste a UI de [tela/componente] preservando o design system atual:
- tema escuro
- accent verde (configuravel via data/config.json:accentColor)
- fontes Inter + Space Grotesk
- CSS em src/app/*.css (utilitarios em utilities.css)
Nao introduza Tailwind, TypeScript ou nova biblioteca de UI.
Prefira editar componentes existentes e reutilizar classes/tokens.
Rode npm run build no final.
```

## Prompt - criar endpoint
```text
Crie/ajuste o endpoint [rota] em src/app/api.
Use os helpers de src/lib quando possivel; persistencia via src/lib/db/router.js (SQLite ou JSON conforme data/storage-backend.txt).
Aplique requireAuth/requireAdmin server-side se a rota for sensivel.
Valide erros com respostas curtas e status HTTP coerentes.
No final, informe arquivos alterados e rode npm run build + npm test.
```

## Prompt - revisar mudanca
```text
Revise esta mudanca com foco em regressao funcional, fluxo de dados (SQLite/JSON), auth e pipeline de imagens/videos.
Cheque especialmente:
- se rotas em src/app/api continuam coerentes
- se middleware.js continua protegendo originais
- se nao foi criado fluxo paralelo sem passar por src/lib (db/router.js, storage/index.js, vision/index.js)
- se a migracao banco/storage nao foi misturada com regra de venda/pagamento
- se npm run build, npm test e (quando relevante) npm run images:audit passam
```

## Prompt - migracao destrutiva (banco/storage)
```text
Trate este item como altissimo. Nao combine com mudanca de regra de venda/pagamento.
Antes de tocar no codigo:
1. Confirme se ha backup recente (npm run backup) ou crie um.
2. Rode a versao --dry primeiro (db:migrate:dry / storage:migrate em ambiente isolado).
3. Documente como reverter (db:rollback / storage:rollback).
Ao terminar, rode npm run verify:deep e npm test.
```
