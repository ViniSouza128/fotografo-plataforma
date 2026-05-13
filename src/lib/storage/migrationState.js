// src/lib/storage/migrationState.js
// Estado compartilhado da migração de arquivos locais → bucket externo.
// Persiste em data/storage-migration-status.json para sobreviver a reload.

import fs from 'fs'
import path from 'path'

const STATE_PATH = path.join(process.cwd(), 'data', 'storage-migration-status.json')

const DEFAULT_STATE = {
  running: false,
  startedAt: null,
  finishedAt: null,
  totalDescobertos: 0,
  totalEnviados: 0,
  totalErros: 0,
  ultimaErroMsg: null,
  fase: null,         // 'discover' | 'originals' | 'derivatives' | 'done' | 'error'
  ultimoArquivo: null,
}

export function readMigrationState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return { ...DEFAULT_STATE }
    return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) }
  } catch { return { ...DEFAULT_STATE } }
}

export function writeMigrationState(patch) {
  const dir = path.dirname(STATE_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const current = readMigrationState()
  const next = { ...current, ...patch }
  fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2), 'utf-8')
  return next
}

export function resetMigrationState() {
  return writeMigrationState({ ...DEFAULT_STATE })
}
