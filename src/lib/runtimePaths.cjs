const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(process.cwd())

const rawAppPersistDir = String(process.env.APP_PERSIST_DIR || '').trim()
const APP_PERSIST_DIR = rawAppPersistDir ? path.resolve(rawAppPersistDir) : null
const isPersistMode = !!APP_PERSIST_DIR

const DATA_DIR = isPersistMode
  ? path.join(APP_PERSIST_DIR, 'data')
  : path.join(PROJECT_ROOT, 'data')

const STORAGE_DIR = isPersistMode
  ? path.join(APP_PERSIST_DIR, 'storage')
  : path.join(PROJECT_ROOT, 'storage')

const UPLOADS_DIR = isPersistMode
  ? path.join(APP_PERSIST_DIR, 'uploads')
  : path.join(PROJECT_ROOT, 'public', 'uploads')

const rawBackupDir = String(process.env.BACKUP_DIR || '').trim()
const BACKUP_DIR = rawBackupDir
  ? path.resolve(rawBackupDir)
  : (isPersistMode
    ? path.join(APP_PERSIST_DIR, 'backups')
    : path.join(PROJECT_ROOT, 'backups'))

function normalizeSegment(segment) {
  const value = String(segment || '').trim()
  if (!value) return null
  return value.replace(/[\\/]+/g, path.sep)
}

function resolveRuntimePath(baseDir, ...segments) {
  const root = path.resolve(String(baseDir || ''))
  if (!root) throw new Error('runtime_path_base_required')

  const normalizedSegments = []
  for (const segment of segments.flat()) {
    const normalized = normalizeSegment(segment)
    if (!normalized) continue
    normalizedSegments.push(normalized)
  }

  const candidate = path.resolve(root, ...normalizedSegments)
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    throw new Error(`unsafe_runtime_path: ${candidate}`)
  }
  return candidate
}

function ensureRuntimeDirs() {
  for (const dir of [DATA_DIR, STORAGE_DIR, UPLOADS_DIR, BACKUP_DIR]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return {
    APP_PERSIST_DIR,
    PROJECT_ROOT,
    DATA_DIR,
    STORAGE_DIR,
    UPLOADS_DIR,
    BACKUP_DIR,
  }
}

module.exports = {
  APP_PERSIST_DIR,
  PROJECT_ROOT,
  DATA_DIR,
  STORAGE_DIR,
  UPLOADS_DIR,
  BACKUP_DIR,
  isPersistMode,
  ensureRuntimeDirs,
  resolveRuntimePath,
}
