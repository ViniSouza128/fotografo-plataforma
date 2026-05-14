/**
 * scripts/migrate-json-to-sqlite.js
 *
 * Migra os dados de data/*.json para data/db.sqlite (SQLite via better-sqlite3).
 *
 * Etapas:
 *   1. Backup obrigatório de data/ → data/_backup_<timestamp>/
 *   2. Aplica schema (CREATE TABLE IF NOT EXISTS).
 *   3. Para cada entidade migrável (events, photos, clients, pedidos,
 *      comentarios, remocoes, feedbacks, avaliacoes, config, counter):
 *        - lê JSON
 *        - escreve no SQLite (transação)
 *        - confere contagem
 *   4. Grava data/storage-backend.txt = "sqlite" para o app passar a usar o DB.
 *
 * Modo dry-run: passe --dry para testar sem gravar a flag (mas o backup acontece).
 *
 * Rollback: scripts/rollback-sqlite-to-json.js
 */

const fs = require('fs')
const path = require('path')
const {
  DATA_DIR,
  ensureRuntimeDirs,
} = require('../src/lib/runtimePaths.cjs')

const DB_PATH = path.join(DATA_DIR, 'db.sqlite')
const FLAG_PATH = path.join(DATA_DIR, 'storage-backend.txt')
const DRY = process.argv.includes('--dry')
const SKIP_BACKUP = process.argv.includes('--no-backup')
const FORCE = process.argv.includes('--force')

function timestampLabel() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function readJson(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback
    const raw = fs.readFileSync(file, 'utf-8')
    return JSON.parse(raw || (Array.isArray(fallback) ? '[]' : '{}')) ?? fallback
  } catch (err) {
    console.warn(`[migrate] erro lendo ${file}: ${err.message}`)
    return fallback
  }
}

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }

function copyDirSync(src, dest) {
  ensureDir(dest)
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      // Não copiar subpastas pesadas (backups/migrations/etc) — só dados ativos
      if (entry.name === '_backup' || entry.name === 'backups' || entry.name === 'migrations') continue
      if (entry.name.startsWith('_backup_')) continue
      copyDirSync(s, d)
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d)
    }
  }
}

function backup() {
  if (SKIP_BACKUP) {
    console.log('[migrate] --no-backup: pulando backup (NÃO RECOMENDADO).')
    return null
  }
  const label = `_backup_${timestampLabel()}`
  const target = path.join(DATA_DIR, label)
  console.log(`[migrate] Criando backup em data/${label}/ …`)
  copyDirSync(DATA_DIR, target)
  console.log('[migrate] Backup concluído.')
  return target
}

function loadEntity(file, fallback) {
  return readJson(path.join(DATA_DIR, file), fallback)
}

const ENTITIES = [
  { name: 'clients',     file: 'clients.json',     repo: 'clientsRepo',     fallback: [] },
  { name: 'events',      file: 'events.json',      repo: 'eventsRepo',      fallback: [] },
  { name: 'photos',      file: 'photos.json',      repo: 'photosRepo',      fallback: [] },
  { name: 'pedidos',     file: 'pedidos.json',     repo: 'pedidosRepo',     fallback: [] },
  { name: 'comentarios', file: 'comentarios.json', repo: 'comentariosRepo', fallback: [] },
  { name: 'remocoes',    file: 'remocoes.json',    repo: 'remocoesRepo',    fallback: [] },
  { name: 'feedbacks',   file: 'feedbacks.json',   repo: 'feedbacksRepo',   fallback: [] },
  { name: 'avaliacoes',  file: 'avaliacoes.json',  repo: 'avaliacoesRepo',  fallback: [] },
]

async function loadDbModules() {
  // Carregamento dinâmico para evitar erro se better-sqlite3 não estiver instalado
  const Database = require('better-sqlite3')
  return { Database }
}

function buildPlainRepos(db) {
  // Replica a lógica de src/lib/db/repositories.js sem ESM
  const bool01 = v => v ? 1 : 0
  const writeArrayBasic = (table, items) => {
    const insert = db.prepare(`INSERT INTO ${table} (id, data_json) VALUES (@id, @data_json)`)
    const tx = db.transaction(rows => {
      db.prepare(`DELETE FROM ${table}`).run()
      for (const row of rows) {
        if (!row?.id) continue
        insert.run({ id: row.id, data_json: JSON.stringify(row) })
      }
    })
    tx(Array.isArray(items) ? items : [])
  }

  return {
    clientsRepo: {
      writeAll(rows) {
        const insert = db.prepare(`INSERT INTO clients
          (id, email, cpf, cnpj, whatsapp, is_admin, is_super_admin, is_colaborador, ativo, criado_em, atualizado_em, data_json)
          VALUES (@id, @email, @cpf, @cnpj, @whatsapp, @is_admin, @is_super_admin, @is_colaborador, @ativo, @criado_em, @atualizado_em, @data_json)`)
        const tx = db.transaction(items => {
          db.prepare(`DELETE FROM clients`).run()
          for (const c of items) {
            if (!c?.id) continue
            insert.run({
              id: c.id, email: c.email || null, cpf: c.cpf || null, cnpj: c.cnpj || null, whatsapp: c.whatsapp || null,
              is_admin: bool01(c.isAdmin), is_super_admin: bool01(c.isSuperAdmin), is_colaborador: bool01(c.isColaborador),
              ativo: c.ativo === false ? 0 : 1,
              criado_em: c.criadoEm || null, atualizado_em: c.atualizadoEm || null,
              data_json: JSON.stringify(c),
            })
          }
        })
        tx(Array.isArray(rows) ? rows : [])
      }
    },
    eventsRepo: {
      writeAll(rows) {
        const insert = db.prepare(`INSERT INTO events
          (id, public_id, name, date, visibilidade, colaborador_id, removido, created_at, data_json)
          VALUES (@id, @public_id, @name, @date, @visibilidade, @colaborador_id, @removido, @created_at, @data_json)`)
        const tx = db.transaction(items => {
          db.prepare(`DELETE FROM events`).run()
          for (const e of items) {
            if (!e?.id) continue
            insert.run({
              id: e.id, public_id: e.publicId || null, name: e.name || null, date: e.date || null,
              visibilidade: e.visibilidade || 'publico', colaborador_id: e.colaboradorId || null,
              removido: bool01(e.removido), created_at: e.createdAt || null,
              data_json: JSON.stringify(e),
            })
          }
        })
        tx(Array.isArray(rows) ? rows : [])
      }
    },
    photosRepo: {
      writeAll(rows) {
        const insert = db.prepare(`INSERT INTO photos
          (id, public_id, event_id, pasta, colaborador_id, removida, orfao_funcional, vendida, created_at, data_json)
          VALUES (@id, @public_id, @event_id, @pasta, @colaborador_id, @removida, @orfao_funcional, @vendida, @created_at, @data_json)`)
        const tx = db.transaction(items => {
          db.prepare(`DELETE FROM photos`).run()
          for (const p of items) {
            if (!p?.id) continue
            insert.run({
              id: p.id, public_id: p.publicId || null, event_id: p.eventId || null, pasta: p.pasta || null,
              colaborador_id: p.colaboradorId || null,
              removida: bool01(p.removida), orfao_funcional: bool01(p.orfaoFuncional), vendida: bool01(p.vendida),
              created_at: p.createdAt || null,
              data_json: JSON.stringify(p),
            })
          }
        })
        tx(Array.isArray(rows) ? rows : [])
      }
    },
    pedidosRepo: {
      writeAll(rows) {
        const insert = db.prepare(`INSERT INTO pedidos
          (id, public_id, client_id, status, criado_em, atualizado_em, total, data_json)
          VALUES (@id, @public_id, @client_id, @status, @criado_em, @atualizado_em, @total, @data_json)`)
        const tx = db.transaction(items => {
          db.prepare(`DELETE FROM pedidos`).run()
          for (const p of items) {
            if (!p?.id) continue
            insert.run({
              id: p.id, public_id: p.publicId || null, client_id: p.clientId || null,
              status: p.status || null, criado_em: p.criadoEm || null, atualizado_em: p.atualizadoEm || null,
              total: Number(p.total) || 0, data_json: JSON.stringify(p),
            })
          }
        })
        tx(Array.isArray(rows) ? rows : [])
      }
    },
    comentariosRepo: {
      writeAll(rows) {
        const insert = db.prepare(`INSERT INTO comentarios
          (id, event_id, photo_id, client_id, criado_em, data_json)
          VALUES (@id, @event_id, @photo_id, @client_id, @criado_em, @data_json)`)
        const tx = db.transaction(items => {
          db.prepare(`DELETE FROM comentarios`).run()
          for (const c of items) {
            if (!c?.id) continue
            insert.run({
              id: c.id, event_id: c.eventId || null, photo_id: c.photoId || null,
              client_id: c.clientId || c.autorId || null,
              criado_em: c.criadoEm || c.createdAt || null,
              data_json: JSON.stringify(c),
            })
          }
        })
        tx(Array.isArray(rows) ? rows : [])
      }
    },
    remocoesRepo: {
      writeAll(rows) {
        const insert = db.prepare(`INSERT INTO remocoes
          (id, photo_id, status, criado_em, data_json)
          VALUES (@id, @photo_id, @status, @criado_em, @data_json)`)
        const tx = db.transaction(items => {
          db.prepare(`DELETE FROM remocoes`).run()
          for (const r of items) {
            if (!r?.id) continue
            insert.run({
              id: r.id, photo_id: r.photoId || null, status: r.status || null,
              criado_em: r.criadoEm || r.createdAt || null,
              data_json: JSON.stringify(r),
            })
          }
        })
        tx(Array.isArray(rows) ? rows : [])
      }
    },
    feedbacksRepo: {
      writeAll(rows) {
        const insert = db.prepare(`INSERT INTO feedbacks (id, criado_em, data_json) VALUES (@id, @criado_em, @data_json)`)
        const tx = db.transaction(items => {
          db.prepare(`DELETE FROM feedbacks`).run()
          for (const f of items) {
            if (!f?.id) continue
            insert.run({
              id: f.id, criado_em: f.criadoEm || f.createdAt || null,
              data_json: JSON.stringify(f),
            })
          }
        })
        tx(Array.isArray(rows) ? rows : [])
      }
    },
    avaliacoesRepo: {
      writeAll(rows) {
        const insert = db.prepare(`INSERT INTO avaliacoes (id, event_id, nota, criado_em, data_json)
          VALUES (@id, @event_id, @nota, @criado_em, @data_json)`)
        const tx = db.transaction(items => {
          db.prepare(`DELETE FROM avaliacoes`).run()
          for (const a of items) {
            if (!a?.id) continue
            insert.run({
              id: a.id, event_id: a.eventId || null, nota: Number(a.nota) || null,
              criado_em: a.criadoEm || a.createdAt || null,
              data_json: JSON.stringify(a),
            })
          }
        })
        tx(Array.isArray(rows) ? rows : [])
      }
    },
  }
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, email TEXT, cpf TEXT, cnpj TEXT, whatsapp TEXT, is_admin INTEGER DEFAULT 0, is_super_admin INTEGER DEFAULT 0, is_colaborador INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, criado_em TEXT, atualizado_em TEXT, data_json TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)`,
  `CREATE INDEX IF NOT EXISTS idx_clients_admin ON clients(is_admin, ativo)`,
  `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, public_id TEXT, name TEXT, date TEXT, visibilidade TEXT, colaborador_id TEXT, removido INTEGER DEFAULT 0, created_at TEXT, data_json TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_events_visibilidade ON events(visibilidade)`,
  `CREATE INDEX IF NOT EXISTS idx_events_colaborador ON events(colaborador_id)`,
  `CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, public_id TEXT, event_id TEXT, pasta TEXT, colaborador_id TEXT, removida INTEGER DEFAULT 0, orfao_funcional INTEGER DEFAULT 0, vendida INTEGER DEFAULT 0, created_at TEXT, data_json TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_photos_event ON photos(event_id, removida)`,
  `CREATE INDEX IF NOT EXISTS idx_photos_pasta ON photos(event_id, pasta)`,
  `CREATE TABLE IF NOT EXISTS pedidos (id TEXT PRIMARY KEY, public_id TEXT, client_id TEXT, status TEXT, criado_em TEXT, atualizado_em TEXT, total REAL, data_json TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_pedidos_client ON pedidos(client_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status)`,
  `CREATE TABLE IF NOT EXISTS comentarios (id TEXT PRIMARY KEY, event_id TEXT, photo_id TEXT, client_id TEXT, criado_em TEXT, data_json TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_comentarios_event ON comentarios(event_id)`,
  `CREATE INDEX IF NOT EXISTS idx_comentarios_photo ON comentarios(photo_id)`,
  `CREATE TABLE IF NOT EXISTS remocoes (id TEXT PRIMARY KEY, photo_id TEXT, status TEXT, criado_em TEXT, data_json TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_remocoes_status ON remocoes(status)`,
  `CREATE TABLE IF NOT EXISTS feedbacks (id TEXT PRIMARY KEY, criado_em TEXT, data_json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS avaliacoes (id TEXT PRIMARY KEY, event_id TEXT, nota REAL, criado_em TEXT, data_json TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_avaliacoes_event ON avaliacoes(event_id)`,
  `CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), data_json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)`,
]

async function main() {
  ensureRuntimeDirs()
  console.log(`[migrate] Início — DRY=${DRY}`)

  if (!fs.existsSync(DATA_DIR)) {
    console.error('[migrate] data/ não existe.')
    process.exit(1)
  }

  // Pré-checagem: se DB já existe e --force não foi passado, aborta
  if (fs.existsSync(DB_PATH) && !FORCE) {
    console.error(`[migrate] ${DB_PATH} já existe. Use --force para sobrescrever (rodar idempotente).`)
    process.exit(1)
  }

  const backupPath = backup()

  const { Database } = await loadDbModules()
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')

  // Schema
  console.log('[migrate] Aplicando schema...')
  db.exec('BEGIN')
  try {
    for (const stmt of SCHEMA_STATEMENTS) db.exec(stmt)
    db.prepare(`INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('version', ?)`).run('1')
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  const repos = buildPlainRepos(db)

  let migratedCount = 0
  // Entidades-array
  for (const entity of ENTITIES) {
    const items = loadEntity(entity.file, [])
    if (!Array.isArray(items)) {
      console.warn(`[migrate] ${entity.name}: arquivo não é array, pulando.`)
      continue
    }
    repos[entity.repo].writeAll(items)
    const after = db.prepare(`SELECT COUNT(*) c FROM ${entity.name}`).get().c
    console.log(`[migrate] ${entity.name}: ${items.length} JSON → ${after} no banco`)
    if (after !== items.filter(i => i?.id).length) {
      console.warn(`[migrate]   ATENÇÃO: contagem diverge (alguns sem id?).`)
    }
    migratedCount += after
  }

  // Config (singleton)
  const cfg = readJson(path.join(DATA_DIR, 'config.json'), null)
  if (cfg && typeof cfg === 'object') {
    db.prepare(`INSERT INTO config (id, data_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json`)
      .run(JSON.stringify(cfg))
    console.log('[migrate] config: 1 documento copiado')
  } else {
    console.log('[migrate] config: ausente, será criado pelo app no primeiro uso')
  }

  // Counter
  const counter = readJson(path.join(DATA_DIR, 'counter.json'), {})
  if (counter && typeof counter === 'object') {
    const insert = db.prepare(`INSERT OR REPLACE INTO counters (name, value) VALUES (?, ?)`)
    const tx = db.transaction(entries => {
      for (const [name, value] of entries) insert.run(String(name), Number(value) || 0)
    })
    tx(Object.entries(counter))
    console.log(`[migrate] counters: ${Object.keys(counter).length} chaves migradas`)
  }

  db.close()

  if (!DRY) {
    fs.writeFileSync(FLAG_PATH, 'sqlite', 'utf-8')
    console.log(`[migrate] Flag gravada em data/storage-backend.txt = "sqlite"`)
  } else {
    console.log('[migrate] DRY-RUN: flag NÃO foi alterada (continua usando JSON).')
  }

  console.log('')
  console.log('[migrate] Concluído.')
  console.log(`  Total de registros migrados: ${migratedCount}`)
  if (backupPath) console.log(`  Backup em: ${backupPath}`)
  console.log(`  DB: ${DB_PATH}`)
  console.log(`  Próximo passo: reiniciar o servidor (npm run dev / npm start).`)
  console.log(`  Rollback: node scripts/rollback-sqlite-to-json.js`)
}

main().catch(err => {
  console.error('[migrate] ERRO:', err)
  process.exit(1)
})
