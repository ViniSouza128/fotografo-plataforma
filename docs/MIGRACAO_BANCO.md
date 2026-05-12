# Migração JSON → SQLite (P38)

## Decisão: SQLite + better-sqlite3

| Critério | SQLite | Postgres |
| --- | --- | --- |
| Local-first (CLAUDE.md) | ✓ arquivo único em `data/db.sqlite` | precisa daemon/network |
| Zero-config | ✓ | exige Docker/serviço |
| Síncrono (compatível com `readX/writeX` atuais) | ✓ via `better-sqlite3` | async-only |
| Backup atômico | ✓ copiar 1 arquivo | `pg_dump` + restore |
| Migração reversível | ✓ flag em arquivo | exige migrations |
| Concorrência alta | razoável (WAL) | melhor |

Escolhi **SQLite** porque:
1. Mantém a filosofia do projeto (single-server, sem dependência de rede).
2. `better-sqlite3` é síncrono — adapta os 50+ `readX/writeX` existentes sem reescrever rotas.
3. Backup = `cp data/db.sqlite`. Rollback = trocar 1 flag de texto.
4. Postgres pode ser introduzido depois, se virar SaaS multi-tenant.

## Arquitetura

```
src/lib/db/
  connection.js     # singleton de conexão (WAL mode, foreign_keys ON)
  schema.js         # CREATE TABLE statements
  router.js         # decide JSON vs SQLite a cada chamada
  repositories.js   # CRUD por entidade (readAll/writeAll)

scripts/
  migrate-json-to-sqlite.js   # backup + migração + flip da flag
  rollback-sqlite-to-json.js  # exporta SQLite → JSON e flip da flag

data/
  db.sqlite                   # criado pela migração
  storage-backend.txt         # "sqlite" ou "json" (override de runtime)
  _backup_<timestamp>/        # snapshot pré-migração
```

### Estratégia de schema

Cada tabela é **JSON-document**: tem colunas indexáveis (`id`, `event_id`, `status`, etc.) **mais** uma coluna `data_json` com o objeto inteiro serializado. Isso:
- preserva campos arbitrários (sem perder dados em estruturas evolutivas)
- mantém os reads/writes idênticos aos atuais (devolve objetos JS completos)
- permite indexação básica por colunas comuns

Em uma futura iteração, é possível extrair colunas adicionais sem quebrar nada.

### Roteador

```js
// src/lib/db/router.js
useDb()  // → 'sqlite' | 'json'
```

Resolve em ordem:
1. `process.env.STORAGE_BACKEND`
2. arquivo `data/storage-backend.txt`
3. default `'json'`

Se o SQLite estiver indisponível por qualquer motivo (driver não carregou, arquivo inacessível), o roteador automaticamente cai para `'json'` — **fail-safe**.

## Como migrar

```sh
# 1. Garantir build OK e backup do data/
npm run build

# 2. Dry-run (cria backup, valida o pipeline, NÃO altera a flag)
npm run db:migrate:dry

# 3. Migração real
npm run db:migrate
# Cria data/_backup_<timestamp>/ + data/db.sqlite + data/storage-backend.txt = "sqlite"

# 4. Reiniciar o servidor
npm run dev   # ou npm run start
```

A partir daqui, todas as 10 entidades migráveis (clients, events, photos, pedidos, comentarios, remocoes, feedbacks, avaliacoes, config, counter) são lidas/gravadas pelo SQLite. Demais arquivos JSON (notificações, chat, propostas, cupons, vision, repasses, videos, etc.) **permanecem em JSON** nessa primeira fase — fora do escopo do P38.

### Re-rodar a migração

Se já há um `db.sqlite`, o script aborta. Use `--force` para sobrescrever:

```sh
npm run db:migrate:force
```

## Como reverter

```sh
# Opção 1: continuar em SQLite mas re-exportar para JSON (snapshot)
npm run db:rollback

# Opção 2: voltar a usar JSON e remover o DB
node scripts/rollback-sqlite-to-json.js --drop-db
```

O rollback **lê o SQLite atual** e regrava `data/*.json` com o estado mais recente. Depois muda a flag para `json`. O `db.sqlite` é mantido por padrão (pode-se re-ativar trocando a flag).

## Rotas e libs adaptadas

Cada lib abaixo agora dispara via `useDb()`:

| Lib | Tabela |
| --- | --- |
| `src/lib/clients.js` | `clients` |
| `src/lib/events.js` | `events` |
| `src/lib/photos.js` | `photos` |
| `src/lib/pedidos.js` | `pedidos` |
| `src/lib/comentarios.js` | `comentarios` |
| `src/lib/remocoes.js` | `remocoes` |
| `src/lib/feedbacks.js` | `feedbacks` |
| `src/lib/avaliacoes.js` | `avaliacoes` |
| `src/lib/config.js` | `config` (singleton) |
| `src/lib/id.js` (counters) | `counters` |

Todas as ~50 API routes que usam essas libs **não foram tocadas** — a troca é transparente.

## Limitações desta etapa (e próximos passos)

- Reads/writes ainda são **full-table replace** (mantém compatibilidade com o pattern atual de `read → mutate em memória → write`). Não é o ideal para escala alta, mas mantém zero risco.
- Não há **migrations versionadas** ainda (apenas `schema_meta.version = 1`). Próxima fase: adicionar migrations incrementais quando o schema mudar.
- Concorrência de escrita: WAL ajuda, mas dois processos escrevendo simultaneamente ainda podem disputar — manter um único processo de servidor.
- **Não foi mesclado com storage cloud** (S3 etc.) — escopo intencionalmente preservado para um P futuro.

## Auditoria pós-migração

Após `npm run db:migrate`, valide com:

```sh
# 1. Build
npm run build

# 2. Verifier (testa rotas/APIs/fluxos com o backend ativo)
npm run verify:deep

# 3. Inspeção rápida do banco
sqlite3 data/db.sqlite ".tables"
sqlite3 data/db.sqlite "SELECT name, COUNT(*) FROM (SELECT 'clients' name FROM clients UNION ALL SELECT 'events' FROM events UNION ALL SELECT 'photos' FROM photos UNION ALL SELECT 'pedidos' FROM pedidos) GROUP BY name;"
```
