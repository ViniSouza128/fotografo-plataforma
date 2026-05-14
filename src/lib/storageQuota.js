import fs from 'fs'
import path from 'path'
import {
  APP_PERSIST_DIR,
  DATA_DIR,
  STORAGE_DIR,
  UPLOADS_DIR,
  BACKUP_DIR,
  ensureRuntimeDirs,
} from './runtimePaths'

export const STORAGE_QUOTA_CONFIG_PATH = path.join(DATA_DIR, 'storage-quota.json')

export const STORAGE_QUOTA_THRESHOLDS = Object.freeze({
  video: 90,
  photo: 95,
  avatar: 95,
  other: 95,
})

const STATUS_WARNING_PERCENT = 80
const CONFIG_VERSION = 1

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  limitBytes: null,
  blockVideosAtPercent: STORAGE_QUOTA_THRESHOLDS.video,
  blockPhotosAtPercent: STORAGE_QUOTA_THRESHOLDS.photo,
  updatedAt: null,
  updatedBy: null,
})

const ACCEPTED_UPLOAD_KINDS = new Set(['video', 'photo', 'avatar', 'other'])

export class StorageQuotaConfigError extends Error {
  constructor(errors) {
    const list = Array.isArray(errors) ? errors : [String(errors || 'Configuração inválida.')]
    super(list.join(' / '))
    this.name = 'StorageQuotaConfigError'
    this.code = 'invalid_storage_quota_config'
    this.status = 400
    this.errors = list
  }
}

export class StorageQuotaExceededError extends Error {
  constructor(payload) {
    super(payload.message)
    this.name = 'StorageQuotaExceededError'
    this.code = payload.code || getQuotaBlockedCode(payload.kind)
    this.status = 507
    Object.assign(this, payload)
  }
}

function normalizeComparablePath(value) {
  const resolved = path.resolve(String(value || ''))
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isSameOrInsidePath(candidate, root) {
  const child = normalizeComparablePath(candidate)
  const parent = normalizeComparablePath(root)
  return child === parent || child.startsWith(parent + path.sep)
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function normalizeLimitBytes(value) {
  if (value === undefined || value === null || value === '') return null
  return value
}

function normalizeStoredConfig(raw = {}) {
  return {
    enabled: raw.enabled,
    limitBytes: normalizeLimitBytes(raw.limitBytes),
    blockVideosAtPercent: STORAGE_QUOTA_THRESHOLDS.video,
    blockPhotosAtPercent: STORAGE_QUOTA_THRESHOLDS.photo,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    updatedBy: raw.updatedBy === null || raw.updatedBy === undefined ? null : String(raw.updatedBy),
  }
}

export function validateStorageQuotaConfig(config) {
  const errors = []
  if (typeof config?.enabled !== 'boolean') {
    errors.push('enabled deve ser booleano.')
  }

  const enabled = config?.enabled === true
  const limitBytes = normalizeLimitBytes(config?.limitBytes)
  const hasLimit = limitBytes !== null

  if (enabled && !hasLimit) {
    errors.push('limitBytes é obrigatório quando o limite está ativo.')
  }

  if (hasLimit) {
    if (typeof limitBytes !== 'number' || !Number.isFinite(limitBytes) || !Number.isSafeInteger(limitBytes) || limitBytes <= 0) {
      errors.push('limitBytes deve ser um número inteiro positivo.')
    }
  }

  return errors
}

function assertValidConfig(config) {
  const errors = validateStorageQuotaConfig(config)
  if (errors.length > 0) throw new StorageQuotaConfigError(errors)
  return config
}

function getConfigFilePath(options = {}) {
  return options.filePath || STORAGE_QUOTA_CONFIG_PATH
}

export function getStorageQuotaConfig(options = {}) {
  const filePath = getConfigFilePath(options)
  if (!fs.existsSync(filePath)) return { ...DEFAULT_CONFIG }

  const parsed = safeJsonParse(fs.readFileSync(filePath, 'utf-8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StorageQuotaConfigError(['storage-quota.json não contém um objeto válido.'])
  }

  const config = normalizeStoredConfig({ ...DEFAULT_CONFIG, ...parsed })
  return assertValidConfig(config)
}

export function saveStorageQuotaConfig(patch = {}, options = {}) {
  const filePath = getConfigFilePath(options)
  const current = options.currentConfig || getStorageQuotaConfig({ filePath })
  const next = normalizeStoredConfig({
    ...current,
    enabled: Object.prototype.hasOwnProperty.call(patch, 'enabled') ? patch.enabled : current.enabled,
    limitBytes: Object.prototype.hasOwnProperty.call(patch, 'limitBytes') ? patch.limitBytes : current.limitBytes,
    updatedAt: options.updatedAt || new Date().toISOString(),
    updatedBy: options.updatedBy || null,
  })

  assertValidConfig(next)

  if (!options.skipEnsureRuntimeDirs) ensureRuntimeDirs()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify({ version: CONFIG_VERSION, ...next }, null, 2) + '\n', 'utf-8')
  fs.renameSync(tmpPath, filePath)
  return next
}

function recordWarning(warnings, message, error, logWarnings) {
  const detail = error?.message ? `${message}: ${error.message}` : message
  warnings.push(detail)
  if (logWarnings) console.warn('[storageQuota]', detail)
}

function getUsageRoots(options = {}) {
  if (Array.isArray(options.roots)) return options.roots
  if (options.appPersistDir) return [options.appPersistDir]
  if (APP_PERSIST_DIR) return [APP_PERSIST_DIR]
  return [DATA_DIR, STORAGE_DIR, UPLOADS_DIR, BACKUP_DIR]
}

function getSafeExistingRoots(rawRoots, warnings, logWarnings) {
  const roots = []
  for (const rawRoot of rawRoots) {
    if (!rawRoot) continue
    const absolute = path.resolve(String(rawRoot))
    try {
      if (!fs.existsSync(absolute)) continue
      const stat = fs.lstatSync(absolute)
      if (stat.isSymbolicLink()) {
        recordWarning(warnings, `Ignorando raiz de quota que é symlink: ${absolute}`, null, logWarnings)
        continue
      }
      if (!stat.isDirectory()) continue
      roots.push({ root: absolute, realRoot: fs.realpathSync(absolute) })
    } catch (error) {
      recordWarning(warnings, `Não foi possível acessar raiz de quota: ${absolute}`, error, logWarnings)
    }
  }

  roots.sort((a, b) => a.realRoot.length - b.realRoot.length)
  return roots.filter((entry, index, list) => {
    return !list.slice(0, index).some(parent => isSameOrInsidePath(entry.realRoot, parent.realRoot))
  })
}

function getDirectorySize(root, warnings, logWarnings) {
  let usedBytes = 0
  const stack = [root]

  while (stack.length > 0) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch (error) {
      recordWarning(warnings, `Não foi possível listar diretório: ${current}`, error, logWarnings)
      continue
    }

    for (const entry of entries) {
      const absolute = path.join(current, entry.name)
      try {
        const stat = fs.lstatSync(absolute)
        if (stat.isSymbolicLink()) continue
        if (stat.isDirectory()) {
          stack.push(absolute)
        } else if (stat.isFile()) {
          usedBytes += stat.size
        }
      } catch (error) {
        recordWarning(warnings, `Não foi possível ler arquivo de quota: ${absolute}`, error, logWarnings)
      }
    }
  }

  return usedBytes
}

export function getStorageUsage(options = {}) {
  const warnings = []
  const logWarnings = options.logWarnings === true
  const rawRoots = getUsageRoots(options)
  const roots = getSafeExistingRoots(rawRoots, warnings, logWarnings)
  let usedBytes = 0

  for (const entry of roots) {
    usedBytes += getDirectorySize(entry.root, warnings, logWarnings)
  }

  return {
    usedBytes,
    roots: roots.map(entry => entry.root),
    warnings,
  }
}

function roundPercent(value) {
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100) / 100
}

function statusForPercent(percentUsed) {
  if (percentUsed === null || percentUsed === undefined) return 'ok'
  if (percentUsed >= 100) return 'full'
  if (percentUsed >= STORAGE_QUOTA_THRESHOLDS.photo) return 'block_photos'
  if (percentUsed >= STORAGE_QUOTA_THRESHOLDS.video) return 'block_videos'
  if (percentUsed >= STATUS_WARNING_PERCENT) return 'warning'
  return 'ok'
}

export function getStorageQuotaStatus(options = {}) {
  const config = options.config || getStorageQuotaConfig(options)
  const usage = options.usage || getStorageUsage(options)
  const enabled = config.enabled === true
  const limitBytes = enabled ? config.limitBytes : null
  const remainingBytes = enabled ? Math.max(0, limitBytes - usage.usedBytes) : null
  const percentUsed = enabled ? roundPercent((usage.usedBytes / limitBytes) * 100) : null

  return {
    enabled,
    usedBytes: usage.usedBytes,
    limitBytes,
    remainingBytes,
    percentUsed,
    status: enabled ? statusForPercent(percentUsed) : 'ok',
    thresholds: { ...STORAGE_QUOTA_THRESHOLDS },
    roots: usage.roots || [],
    warnings: usage.warnings || [],
  }
}

function normalizeIncomingBytes(value) {
  if (value === undefined || value === null || value === '') return 0
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    const error = new Error('incomingBytes deve ser um número positivo ou zero.')
    error.code = 'invalid_incoming_bytes'
    error.status = 400
    throw error
  }
  return Math.ceil(value)
}

function getThresholdForKind(kind) {
  if (!ACCEPTED_UPLOAD_KINDS.has(kind)) {
    const error = new Error('Tipo de upload inválido.')
    error.code = 'invalid_upload_kind'
    error.status = 400
    throw error
  }
  return STORAGE_QUOTA_THRESHOLDS[kind]
}

function getQuotaBlockedCode(kind) {
  if (kind === 'video') return 'storage_quota_video_blocked'
  if (kind === 'avatar') return 'storage_quota_avatar_blocked'
  return 'storage_quota_photo_blocked'
}

function getQuotaKindLabel(kind) {
  if (kind === 'video') return 'videos'
  if (kind === 'avatar') return 'fotos de perfil'
  return 'fotos'
}

export function assertCanUpload({ kind = 'other', incomingBytes = 0 } = {}, options = {}) {
  const normalizedKind = String(kind || 'other').toLowerCase()
  const thresholdPercent = getThresholdForKind(normalizedKind)
  const incoming = normalizeIncomingBytes(incomingBytes)
  const config = options.config || getStorageQuotaConfig(options)

  if (config.enabled !== true) {
    return {
      allowed: true,
      kind: normalizedKind,
      incomingBytes: incoming,
      thresholdPercent,
      status: getStorageQuotaStatus({ ...options, config }),
    }
  }

  const usage = options.usage || getStorageUsage(options)
  const projectedBytes = usage.usedBytes + incoming
  const projectedPercent = roundPercent((projectedBytes / config.limitBytes) * 100)

  if (projectedPercent >= thresholdPercent) {
    const usedText = formatBytes(projectedBytes)
    const limitText = formatBytes(config.limitBytes)
    const label = getQuotaKindLabel(normalizedKind)
    throw new StorageQuotaExceededError({
      code: getQuotaBlockedCode(normalizedKind),
      kind: normalizedKind,
      usedBytes: usage.usedBytes,
      incomingBytes: incoming,
      projectedBytes,
      limitBytes: config.limitBytes,
      percent: projectedPercent,
      thresholdPercent,
      message: `Limite de armazenamento atingido. O envio de ${label} e bloqueado a partir de ${thresholdPercent}% do limite. Projecao atual: ${projectedPercent}% (${usedText} de ${limitText}). Peça ao superadmin para aumentar o limite ou liberar espaco.`,
    })
  }

  return {
    allowed: true,
    kind: normalizedKind,
    incomingBytes: incoming,
    thresholdPercent,
    projectedBytes,
    projectedPercent,
    status: getStorageQuotaStatus({ ...options, config, usage }),
  }
}

export function isStorageQuotaExceededError(error) {
  return error instanceof StorageQuotaExceededError ||
    (typeof error?.code === 'string' && error.code.startsWith('storage_quota_') && error.status === 507)
}

export function toStorageQuotaErrorPayload(error) {
  return {
    error: error?.message || 'Limite de armazenamento atingido.',
    code: error?.code || getQuotaBlockedCode(error?.kind),
    kind: error?.kind || 'other',
    usedBytes: Number.isFinite(error?.usedBytes) ? error.usedBytes : null,
    incomingBytes: Number.isFinite(error?.incomingBytes) ? error.incomingBytes : null,
    projectedBytes: Number.isFinite(error?.projectedBytes) ? error.projectedBytes : null,
    limitBytes: Number.isFinite(error?.limitBytes) ? error.limitBytes : null,
    percent: Number.isFinite(error?.percent) ? error.percent : null,
    thresholdPercent: Number.isFinite(error?.thresholdPercent) ? error.thresholdPercent : null,
  }
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  const formatted = unitIndex === 0 ? String(Math.round(size)) : size.toFixed(size >= 10 ? 1 : 2).replace(/\.0$/, '')
  return `${formatted} ${units[unitIndex]}`
}
