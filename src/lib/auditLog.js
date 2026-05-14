import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { DATA_DIR, ensureRuntimeDirs } from './runtimePaths'

const AUDIT_LOG_PATH = path.join(DATA_DIR, 'audit_log.json')
const MAX_ENTRIES = 5000
const MAX_STRING_LENGTH = 300
const SENSITIVE_KEY_RE = /(senha|password|token|secret|api[_-]?key|apikey|wallet|authorization|cookie|credential|chave)/i

function ensureDataDir() {
  ensureRuntimeDirs()
}

function truncateString(value) {
  if (value.length <= MAX_STRING_LENGTH) return value
  return `${value.slice(0, MAX_STRING_LENGTH)}...`
}

export function sanitizeAuditValue(value, depth = 0) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return truncateString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (depth > 5) return '[truncated]'

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(item => sanitizeAuditValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY_RE.test(key) ? '[redacted]' : sanitizeAuditValue(item, depth + 1),
      ])
    )
  }

  return String(value)
}

function normalizeActor(actor) {
  if (!actor || typeof actor !== 'object') return null
  return {
    id: actor.id || actor.clientId || null,
    email: actor.email || null,
    nome: actor.nomeCompleto || actor.nome || actor.name || null,
    isAdmin: !!actor.isAdmin,
    isSuperAdmin: !!actor.isSuperAdmin,
  }
}

function normalizeTarget(target) {
  if (!target || typeof target !== 'object') return null
  return sanitizeAuditValue({
    type: target.type || null,
    id: target.id || null,
    publicId: target.publicId || null,
    label: target.label || target.nome || target.name || null,
  })
}

function getRequestMeta(request) {
  if (!request?.headers?.get) return {}
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null
  const userAgent = request.headers.get('user-agent') || null
  return {
    ip: ip ? truncateString(ip) : null,
    userAgent: userAgent ? truncateString(userAgent) : null,
  }
}

export function readAuditLog(options = {}) {
  try {
    if (!fs.existsSync(AUDIT_LOG_PATH)) return []
    const raw = fs.readFileSync(AUDIT_LOG_PATH, 'utf8')
    let entries = JSON.parse(raw || '[]')
    if (!Array.isArray(entries)) entries = []

    const {
      action,
      status,
      actorId,
      targetType,
      limit = 200,
    } = options

    if (action) entries = entries.filter(entry => entry.action === action)
    if (status) entries = entries.filter(entry => entry.status === status)
    if (actorId) entries = entries.filter(entry => entry.actor?.id === actorId)
    if (targetType) entries = entries.filter(entry => entry.target?.type === targetType)

    entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000)
    return entries.slice(0, safeLimit)
  } catch {
    return []
  }
}

export function appendAuditLog({
  action,
  status = 'success',
  actor = null,
  target = null,
  details = {},
  request = null,
}) {
  try {
    if (!action) return null
    ensureDataDir()

    let entries = []
    if (fs.existsSync(AUDIT_LOG_PATH)) {
      const raw = fs.readFileSync(AUDIT_LOG_PATH, 'utf8')
      entries = JSON.parse(raw || '[]')
      if (!Array.isArray(entries)) entries = []
    }

    const entry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      action,
      status,
      actor: normalizeActor(actor),
      target: normalizeTarget(target),
      details: sanitizeAuditValue(details || {}),
      ...getRequestMeta(request),
    }

    entries.push(entry)
    if (entries.length > MAX_ENTRIES) entries = entries.slice(entries.length - MAX_ENTRIES)
    fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(entries, null, 2))
    return entry
  } catch (error) {
    console.error('Erro ao registrar auditoria:', error)
    return null
  }
}
