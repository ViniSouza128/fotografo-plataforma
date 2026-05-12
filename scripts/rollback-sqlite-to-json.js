/**
 * scripts/rollback-sqlite-to-json.js
 *
 * Volta o backend para JSON (re-grava data/*.json a partir do SQLite atual)
 * e altera data/storage-backend.txt para "json".
 *
 * NÃO apaga o banco — só inverte o ponteiro. Útil para retornar à fonte
 * antiga preservando alterações feitas durante a operação em SQLite.
 *
 * Use --keep-db para preservar data/db.sqlite (default) ou --drop-db para apagar.
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, 'data')
const DB_PATH = path.join(DATA_DIR, 'db.sqlite')
const FLAG_PATH = path.join(DATA_DIR, 'storage-backend.txt')
const DROP_DB = process.argv.includes('--drop-db')

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}

const ENTITIES = [
  { table: 'clients',     file: 'clients.json' },
  { table: 'events',      file: 'events.json' },
  { table: 'photos',      file: 'photos.json' },
  { table: 'pedidos',     file: 'pedidos.json' },
  { table: 'comentarios', file: 'comentarios.json' },
  { table: 'remocoes',    file: 'remocoes.json' },
  { table: 'feedbacks',   file: 'feedbacks.json' },
  { table: 'avaliacoes',  file: 'avaliacoes.json' },
]

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('[rollback] db.sqlite não existe — apenas redefinindo flag para json.')
    fs.writeFileSync(FLAG_PATH, 'json', 'utf-8')
    return
  }
  const Database = require('better-sqlite3')
  const db = new Database(DB_PATH, { readonly: true })

  for (const entity of ENTITIES) {
    try {
      const rows = db.prepare(`SELECT data_json FROM ${entity.table}`).all()
      const items = rows.map(r => { try { return JSON.parse(r.data_json) } catch { return null } }).filter(Boolean)
      writeJson(path.join(DATA_DIR, entity.file), items)
      console.log(`[rollback] ${entity.file}: ${items.length} registros gravados`)
    } catch (err) {
      console.warn(`[rollback] ${entity.table}: ${err.message}`)
    }
  }

  // Config singleton
  try {
    const row = db.prepare(`SELECT data_json FROM config WHERE id = 1`).get()
    if (row) {
      const cfg = JSON.parse(row.data_json)
      writeJson(path.join(DATA_DIR, 'config.json'), cfg)
      console.log('[rollback] config.json: 1 documento gravado')
    }
  } catch (err) {
    console.warn(`[rollback] config: ${err.message}`)
  }

  // Counters
  try {
    const rows = db.prepare(`SELECT name, value FROM counters`).all()
    if (rows.length > 0) {
      const obj = {}
      for (const r of rows) obj[r.name] = Number(r.value)
      writeJson(path.join(DATA_DIR, 'counter.json'), obj)
      console.log(`[rollback] counter.json: ${rows.length} chaves`)
    }
  } catch (err) {
    console.warn(`[rollback] counters: ${err.message}`)
  }

  db.close()

  fs.writeFileSync(FLAG_PATH, 'json', 'utf-8')
  console.log('[rollback] Flag definida para "json".')

  if (DROP_DB) {
    try {
      fs.unlinkSync(DB_PATH)
      const wal = DB_PATH + '-wal'; if (fs.existsSync(wal)) fs.unlinkSync(wal)
      const shm = DB_PATH + '-shm'; if (fs.existsSync(shm)) fs.unlinkSync(shm)
      console.log('[rollback] db.sqlite removido (--drop-db).')
    } catch (err) {
      console.warn(`[rollback] Falha ao remover DB: ${err.message}`)
    }
  } else {
    console.log('[rollback] db.sqlite mantido (use --drop-db para remover).')
  }
}

main().catch(err => { console.error('[rollback] ERRO:', err); process.exit(1) })
