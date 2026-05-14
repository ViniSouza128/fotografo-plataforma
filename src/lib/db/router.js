// src/lib/db/router.js
// Decide se a leitura/escrita usa SQLite ou JSON.
//
// Fonte da decisão (em ordem):
//   1) env STORAGE_BACKEND = 'sqlite' | 'json'
//   2) arquivo data/storage-backend.txt (uma linha)
//   3) default 'json' (mantém compatibilidade)
//
// O migrate-script grava 'sqlite' nesse arquivo após copiar dados.
// Rollback: gravar 'json'.

import fs from 'fs'
import path from 'path'
import { isDbAvailable } from './connection'
import { DATA_DIR, ensureRuntimeDirs } from '../runtimePaths'

const FLAG_PATH = path.join(DATA_DIR, 'storage-backend.txt')

let _cached = null
let _cachedAt = 0
const CACHE_MS = 1000 // re-checa flag a cada 1s no máx

function readFlagFile() {
  try {
    if (!fs.existsSync(FLAG_PATH)) return null
    const v = String(fs.readFileSync(FLAG_PATH, 'utf-8') || '').trim().toLowerCase()
    return v === 'sqlite' || v === 'json' ? v : null
  } catch { return null }
}

export function getStorageBackend() {
  const now = Date.now()
  if (_cached && (now - _cachedAt) < CACHE_MS) return _cached
  const env = String(process.env.STORAGE_BACKEND || '').trim().toLowerCase()
  let result = (env === 'sqlite' || env === 'json') ? env : null
  if (!result) result = readFlagFile()
  if (!result) result = 'json'
  // Se SQLite estiver indisponível por qualquer razão, cai para JSON.
  if (result === 'sqlite' && !isDbAvailable()) result = 'json'
  _cached = result
  _cachedAt = now
  return result
}

export function useDb() {
  return getStorageBackend() === 'sqlite'
}

export function setStorageBackend(value) {
  if (value !== 'sqlite' && value !== 'json') {
    throw new Error(`Backend inválido: ${value}`)
  }
  ensureRuntimeDirs()
  fs.writeFileSync(FLAG_PATH, value, 'utf-8')
  _cached = value
  _cachedAt = Date.now()
}

export function invalidateBackendCache() {
  _cached = null
  _cachedAt = 0
}
