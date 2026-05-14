// src/lib/paymentLog.js
// Log estruturado de eventos de gateway de pagamento.

import fs from 'fs'
import path from 'path'
import { DATA_DIR, ensureRuntimeDirs } from './runtimePaths'

const LEGACY_LOG_PATH = path.join(DATA_DIR, 'payment_log.json')
const DAILY_LOG_ROOT = path.join(DATA_DIR, 'payment-logs')
const LEGACY_LIMIT = 500
const DAILY_FILE_LIMIT = 1000
const DEFAULT_READ_LIMIT = 500
const SENSITIVE_KEY_RE = /(senha|password|token|secret|api[_-]?key|apikey|authorization|cookie|credential|webhook[_-]?secret|wallet)/i

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function ensureLegacyFile() {
  ensureRuntimeDirs()
  if (!fs.existsSync(LEGACY_LOG_PATH)) fs.writeFileSync(LEGACY_LOG_PATH, '[]', 'utf-8')
}

function safeReadJsonArray(filePath) {
  try {
    if (!fs.existsSync(filePath)) return []
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8') || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeJsonArray(filePath, entries) {
  ensureRuntimeDirs()
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8')
}

function truncateString(value) {
  if (value.length <= 500) return value
  return `${value.slice(0, 500)}...`
}

function sanitizeLogValue(value, depth = 0) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return truncateString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (depth > 5) return '[truncated]'

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(item => sanitizeLogValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY_RE.test(key) ? '[redacted]' : sanitizeLogValue(item, depth + 1),
      ])
    )
  }

  return String(value)
}

function dailyLogPath(date = new Date()) {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return path.join(DAILY_LOG_ROOT, year, month, `${day}.json`)
}

function getDailyLogFiles() {
  if (!fs.existsSync(DAILY_LOG_ROOT)) return []
  const files = []
  for (const year of fs.readdirSync(DAILY_LOG_ROOT)) {
    const yearDir = path.join(DAILY_LOG_ROOT, year)
    if (!fs.statSync(yearDir).isDirectory()) continue
    for (const month of fs.readdirSync(yearDir)) {
      const monthDir = path.join(yearDir, month)
      if (!fs.statSync(monthDir).isDirectory()) continue
      for (const file of fs.readdirSync(monthDir)) {
        if (file.endsWith('.json')) files.push(path.join(monthDir, file))
      }
    }
  }
  return files.sort().reverse()
}

function sortEntries(entries) {
  return entries.sort((a, b) => new Date(b.ts || b.createdAt || 0) - new Date(a.ts || a.createdAt || 0))
}

function dedupeEntries(entries) {
  const seen = new Set()
  const result = []
  for (const entry of entries) {
    const key = entry.id || [entry.ts, entry.level, entry.event, entry.pedidoId, entry.chargeId].filter(Boolean).join('|')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(entry)
  }
  return result
}

export function readLegacyLog() {
  ensureLegacyFile()
  return safeReadJsonArray(LEGACY_LOG_PATH).map(entry => sanitizeLogValue(entry))
}

export function readLog(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || DEFAULT_READ_LIMIT), 1), 2000)
  const dailyFiles = getDailyLogFiles()
  const entries = []

  for (const file of dailyFiles) {
    entries.push(...safeReadJsonArray(file).map(entry => sanitizeLogValue(entry)))
    if (entries.length >= limit * 2) break
  }

  // Compatibilidade: registros antigos continuam visiveis mesmo antes de migrar.
  entries.push(...readLegacyLog())
  return dedupeEntries(sortEntries(entries)).slice(0, limit)
}

/**
 * Copia entradas legadas para arquivos por data sem remover data/payment_log.json.
 * Uso opcional para manutencao: chamar com apply=true em script local.
 */
export function migrateLegacyPaymentLog({ apply = false } = {}) {
  const legacyEntries = readLegacyLog()
  if (!apply) {
    return { apply: false, entries: legacyEntries.length }
  }

  let migrated = 0
  for (const entry of legacyEntries) {
    const ts = entry.ts ? new Date(entry.ts) : new Date()
    const file = dailyLogPath(Number.isNaN(ts.getTime()) ? new Date() : ts)
    const dailyEntries = safeReadJsonArray(file)
    const nextEntries = dedupeEntries(sortEntries([sanitizeLogValue(entry), ...dailyEntries])).slice(0, DAILY_FILE_LIMIT)
    writeJsonArray(file, nextEntries)
    migrated++
  }
  return { apply: true, migrated }
}

export function clearLog() {
  ensureLegacyFile()
  writeJsonArray(LEGACY_LOG_PATH, [])
  if (fs.existsSync(DAILY_LOG_ROOT)) {
    fs.rmSync(DAILY_LOG_ROOT, { recursive: true, force: true })
  }
}

/**
 * Adiciona uma entrada ao log de pagamento.
 * @param {'info'|'success'|'error'|'webhook'} level
 * @param {string} event  - ex: 'COBRANCA_CRIADA', 'WEBHOOK_RECEBIDO', 'STATUS_CONSULTADO'
 * @param {object} data   - dados livres relacionados ao evento
 */
export function writeLog(level, event, data = {}) {
  ensureLegacyFile()

  const entry = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitizeLogValue(data),
  }

  const dailyPath = dailyLogPath(new Date(entry.ts))
  const dailyEntries = safeReadJsonArray(dailyPath)
  writeJsonArray(dailyPath, [entry, ...dailyEntries].slice(0, DAILY_FILE_LIMIT))

  // Espelho legado para compatibilidade com ferramentas antigas.
  const legacyEntries = readLegacyLog()
  writeJsonArray(LEGACY_LOG_PATH, [entry, ...legacyEntries].slice(0, LEGACY_LIMIT))

  return entry
}
