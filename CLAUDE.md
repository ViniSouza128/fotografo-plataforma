# CLAUDE.md

## Objetivo do produto
- Plataforma full-stack para fotografo vender fotos (e videos) de eventos.
- Entrega site publico, galeria por evento, carrinho/checkout, area do cliente e painel admin.
- Persistencia padrao: SQLite (`data/db.sqlite`), com fallback para JSON em `data/*.json`. O backend ativo fica em `data/storage-backend.txt` (`sqlite` ou `json`).
- Midia em disco local com mirror opcional para storage S3-compatible (R2, S3, MinIO, B2).

## Stack real
- Next.js 14 App Router
- React 18
- JavaScript comum, sem TypeScript
- CSS em `src/app/*.css`
- Node.js + `sharp` + `exifr` + `better-sqlite3` + `@aws-sdk/client-s3` + `nodemailer` + `ffmpeg-static`
- Vitest para testes (em `tests/`)
- ESLint + Prettier configurados na raiz

## Fase atual do projeto · 2026-05-12

**Estamos em FASE DE MOCKUPS, NAO em fase de migracao do `src/`.**

Tres fases planejadas:
1. **Sistema de design** — TRAVADO em `mockups/system design by claude design/` v1.0.6. NAO mexer.
2. **Mockups das telas** — EM REVISAO em `mockups/frontend-final/` v1.0.23. Trabalhamos aqui.
3. **Migracao para `src/`** — AINDA NAO. So quando os 3 mockups estiverem 100% aprovados.

Convencoes da fase atual:
- Trabalhar exclusivamente em `mockups/frontend-final/` salvo pedido explicito do usuario para tocar em `src/`.
- Cada patch incrementa versao: `v1.0.X` no comentario do topo de cada HTML modificado.
- Cada patch gera arquivo `PATCH-<assunto>-v1XX.md` na mesma pasta com detalhes.
- `publico.html` ja foi aprovado em v1.0.21 (`publico.legacy-v1.0.21-approved.html` e o backup intocavel; restaurar se necessario).
- Preview publico no GitHub Pages: https://vinisouza128.github.io/fotografo-mockups-preview/ (repo `ViniSouza128/fotografo-mockups-preview`, pasta local `H:\Programas\fotografo-mockups-preview\`).

Don't-touch list desta fase:
- `src/` (zero modificacoes ate aprovacao final dos 3 mockups)
- `mockups/system design by claude design/` (travado v1.0.6)
- `mockups/frontend-final/publico.legacy-*.html` (backups aprovados)
- Stack do site real (Next.js, React, SQLite, CSS puro)

## Onde mexer primeiro (fase de migracao futura — referencia)
- UI publica: `src/app/*.js`, `src/components/*`
- Admin: `src/app/admin/**`
- APIs: `src/app/api/**/route.js`
- Regras e acesso a dados: `src/lib/*.js`
- Persistencia: `src/lib/db/` (router JSON/SQLite, schema, repositories)
- Storage: `src/lib/storage/` (FS local + S3, mirror, signed URLs)
- Visao computacional: `src/lib/vision/` (face-api e backend manual)
- Dados locais: `data/db.sqlite` e `data/*.json`
- Midia: `storage/originals`, `public/uploads`, `public/watermarks`, `storage/videos`

## Onde mexer agora (fase de mockup)
- 3 mockups grandes: `mockups/frontend-final/{publico,cliente,admin}.html`
- Shared: `mockups/frontend-final/{shared.css,tokens.css,app.js,logo-defs.html,index.html}`
- Backups e historico de patches: `mockups/frontend-final/PATCH-*.md`, `*.legacy-*.html`
- Repo de deploy: `H:\Programas\fotografo-mockups-preview\` (auto-contido, espelha um subset de `mockups/frontend-final/`)

## Convencoes visuais dos mockups
- Tokens obrigatorios: `var(--ink-X)`, `var(--brand-X)`, `var(--signal-X)`, `var(--font-*)`. ZERO hex inline em `style=""` ou `<style>`.
- Fontes canonicas: Instrument Serif (display, italic) · General Sans (heading/body) · JetBrains Mono (numerais/IDs/precos) · Montserrat (LOGO ONLY).
- Avatar canonical do Vinicius: `https://i.pravatar.cc/150?img=12` (ou variantes `?img=12` em outros sizes). Outros usuarios: pravatar masculinos (1,3,7,8,12,13,14,15,33,51,52,53,60,61,67,68) e femininos (5,9,10,11,16,19,20,24,25,26,32,36,44,47,49) coerentes com o nome.
- Fotos placeholder: `picsum.photos/seed/<tema>/W/H` (seeds tematicos: rodeo, run, race, horse, sport01-20, equestrian, festival, arena, cattle, podium, training).
- Inputs tema escuro: `bg --ink-200` + `border --ink-500` + `focus-ring --brand-500` + `placeholder --ink-700`.
- Status de pagamento: byte-equal com `src/lib/commerceUtils.js` (inclui "Simulacao/liberacao" sem acento, intencional).
- pt-BR limpo, sem mojibake (`Ã©`, `â†`, `Ãš`, etc — corrigir se aparecer).

## Regras para IA
- Nao trocar a stack (sem TypeScript, Tailwind, ORM novo, framework alternativo).
- Antes de criar nova regra, procurar helper existente em `src/lib/`.
- Persistencia passa por `src/lib/db/router.js` quando existir repositorio; se nao houver, manter o padrao do dominio (JSON ou SQLite, conforme `data/storage-backend.txt`).
- Nao misturar migracao de banco/storage com mudancas de regra de venda, pagamento, carrinho ou download.
- Preservar App Router e aliases `@/*`.
- Originais fora de `/public`: respeitar `middleware.js`.
- Se algo nao existir, marcar como `nao encontrado` e sugerir um default curto.
- Para mudancas grandes/repetitivas nos mockups: delegar a `Agent(subagent_type="general-purpose", model="sonnet")` com prompt detalhado (escopo, arquivos permitidos, regras, validacao, relatorio final).

## Validacao minima
- `npm run build`
- `npm test` (Vitest, 9 testes em `tests/`)
- `npm run lint` quando tocar muitos arquivos
- `npm run images:audit` quando mexer em derivadas/watermark/downloads
- `npm run verify:deep` para smoke completo (50+ rotas, 40+ APIs)

Para mudancas em mockups: validacao = grep para zero mojibake + zero hex inline + tokens coerentes + render visual via abrir o HTML no browser.
