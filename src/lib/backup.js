import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, 'data')
const STORAGE_DIR = path.join(ROOT, 'storage')
const ORIGINALS_DIR = path.join(STORAGE_DIR, 'originals')
const UPLOADS_DIR = path.join(ROOT, 'public', 'uploads')
const BACKUPS_DIR = path.join(STORAGE_DIR, 'backups')

// Files always backed up. audit_log/pending_resets deliberately excluded so
// audit trails survive restore and resets don't recursively mutate themselves.
export const DATA_FILES = [
  'config.json',
  'events.json',
  'photos.json',
  'pedidos.json',
  'clients.json',
  'comentarios.json',
  'feedbacks.json',
  'contatos.json',
  'remocoes.json',
  'avaliacoes.json',
  'payment_log.json',
  'counter.json',
  'watermark_assets.json',
]

const ID_RE = /^[a-zA-Z0-9_\-.]+$/

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true })
}

function safeStat(p) {
  try { return fs.statSync(p) } catch { return null }
}

function dirStats(dir) {
  if (!fs.existsSync(dir)) return { fileCount: 0, sizeBytes: 0 }
  let fileCount = 0
  let sizeBytes = 0
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop()
    let entries
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { continue }
    for (const item of entries) {
      const p = path.join(d, item.name)
      if (item.isDirectory()) stack.push(p)
      else if (item.isFile()) {
        fileCount++
        const st = safeStat(p)
        if (st) sizeBytes += st.size
      }
    }
  }
  return { fileCount, sizeBytes }
}

function copyDirRecursive(src, dst) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dst, { recursive: true })
  for (const item of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, item.name)
    const d = path.join(dst, item.name)
    if (item.isDirectory()) copyDirRecursive(s, d)
    else if (item.isFile()) fs.copyFileSync(s, d)
  }
}

function rmDirSafe(dir) {
  if (!fs.existsSync(dir)) return
  fs.rmSync(dir, { recursive: true, force: true })
}

function backupPath(id) {
  if (!id || !ID_RE.test(id)) return null
  return path.join(BACKUPS_DIR, id)
}

export function listBackups() {
  ensureBackupsDir()
  let names = []
  try { names = fs.readdirSync(BACKUPS_DIR) } catch { return [] }
  const out = []
  for (const name of names) {
    if (!ID_RE.test(name)) continue
    const dir = path.join(BACKUPS_DIR, name)
    const st = safeStat(dir)
    if (!st || !st.isDirectory()) continue
    const manifestPath = path.join(dir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      out.push(manifest)
    } catch {}
  }
  out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return out
}

export function getBackupManifest(id) {
  const dir = backupPath(id)
  if (!dir) return null
  const manifestPath = path.join(dir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) return null
  try { return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) } catch { return null }
}

function generateBackupId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${stamp}_${crypto.randomBytes(3).toString('hex')}`
}

export async function createBackup({ scopes = ['data'], label = '', actor = null, reason = null } = {}) {
  ensureBackupsDir()
  const id = generateBackupId()
  const dir = path.join(BACKUPS_DIR, id)
  fs.mkdirSync(dir, { recursive: true })

  const manifest = {
    id,
    label: String(label || '').slice(0, 100),
    reason: reason ? String(reason).slice(0, 200) : null,
    createdAt: new Date().toISOString(),
    actor: actor ? { id: actor.id || null, email: actor.email || null, nome: actor.nome || actor.nomeCompleto || null } : null,
    scopes: [],
    contents: {},
    error: null,
  }

  try {
    if (scopes.includes('data')) {
      const dst = path.join(dir, 'data')
      fs.mkdirSync(dst, { recursive: true })
      let count = 0, size = 0
      for (const file of DATA_FILES) {
        const src = path.join(DATA_DIR, file)
        if (fs.existsSync(src)) {
          const target = path.join(dst, file)
          fs.copyFileSync(src, target)
          count++
          const st = safeStat(target)
          if (st) size += st.size
        }
      }
      manifest.scopes.push('data')
      manifest.contents.data = { fileCount: count, sizeBytes: size }
    }

    if (scopes.includes('originals')) {
      const dst = path.join(dir, 'originals')
      copyDirRecursive(ORIGINALS_DIR, dst)
      manifest.scopes.push('originals')
      manifest.contents.originals = dirStats(dst)
    }

    if (scopes.includes('uploads')) {
      const dst = path.join(dir, 'uploads')
      copyDirRecursive(UPLOADS_DIR, dst)
      manifest.scopes.push('uploads')
      manifest.contents.uploads = dirStats(dst)
    }

    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    return manifest
  } catch (error) {
    manifest.error = error?.message || String(error)
    try { fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2)) } catch {}
    throw error
  }
}

export function deleteBackup(id) {
  const dir = backupPath(id)
  if (!dir || !fs.existsSync(dir)) return false
  rmDirSafe(dir)
  return true
}

// Restores selected scopes from a backup. Always creates an auto-snapshot
// of the *current* state first so the restore itself is reversible.
export async function restoreBackup({ id, scopes = [], actor = null }) {
  const manifest = getBackupManifest(id)
  if (!manifest) throw new Error('Backup não encontrado.')
  const dir = backupPath(id)
  if (!dir) throw new Error('Backup inválido.')

  const requested = scopes.filter(s => manifest.scopes.includes(s))
  if (requested.length === 0) throw new Error('Nenhum escopo válido para restaurar.')

  // Auto-snapshot of current state — always data + any scope being overwritten.
  const preScopes = ['data']
  if (requested.includes('originals')) preScopes.push('originals')
  if (requested.includes('uploads')) preScopes.push('uploads')

  const preBackup = await createBackup({
    scopes: preScopes,
    label: `auto-pre-restore`,
    actor,
    reason: `Antes de restaurar backup ${id}`,
  })

  const restored = []

  if (requested.includes('data')) {
    const dataDir = path.join(dir, 'data')
    if (fs.existsSync(dataDir)) {
      for (const file of DATA_FILES) {
        const src = path.join(dataDir, file)
        const dst = path.join(DATA_DIR, file)
        if (fs.existsSync(src)) {
          if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
          fs.copyFileSync(src, dst)
        }
      }
      restored.push('data')
    }
  }

  if (requested.includes('originals')) {
    const src = path.join(dir, 'originals')
    if (fs.existsSync(src)) {
      rmDirSafe(ORIGINALS_DIR)
      fs.mkdirSync(ORIGINALS_DIR, { recursive: true })
      copyDirRecursive(src, ORIGINALS_DIR)
      restored.push('originals')
    }
  }

  if (requested.includes('uploads')) {
    const src = path.join(dir, 'uploads')
    if (fs.existsSync(src)) {
      rmDirSafe(UPLOADS_DIR)
      fs.mkdirSync(UPLOADS_DIR, { recursive: true })
      copyDirRecursive(src, UPLOADS_DIR)
      restored.push('uploads')
    }
  }

  return { restored, preBackupId: preBackup.id }
}

export function getBackupsRootInfo() {
  ensureBackupsDir()
  const stats = dirStats(BACKUPS_DIR)
  return { ...stats, path: 'storage/backups' }
}
