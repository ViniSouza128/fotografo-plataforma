// src/lib/db/connection.js
// Conexão singleton com SQLite (better-sqlite3, síncrono).
//
// Localização: data/db.sqlite — fora de /public, dentro de data/ que já é
// excluído do git. Próximo aos arquivos JSON para backups conjuntos.

import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'
import { applySchema, readSchemaVersion, SCHEMA_VERSION } from './schema'

let _db = null
let _initFailed = false
const require = createRequire(import.meta.url)

const DB_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'db.sqlite')

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
}

export function getDb() {
  if (_db) return _db
  if (_initFailed) return null
  try {
    ensureDir()
    const Database = require('better-sqlite3')
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('synchronous = NORMAL')
    _db.pragma('foreign_keys = ON')
    if (readSchemaVersion(_db) < SCHEMA_VERSION) {
      applySchema(_db)
    }
    return _db
  } catch (err) {
    if (_db) {
      try { _db.close() } catch {}
      _db = null
    }
    _initFailed = true
    console.error('[db] Falha ao abrir SQLite:', err.message)
    return null
  }
}

export function getDbPath() { return DB_PATH }

export function isDbAvailable() {
  return getDb() !== null
}

export function closeDb() {
  if (_db) {
    try { _db.close() } catch {}
    _db = null
  }
}
