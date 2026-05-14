import fs from 'fs'
import path from 'path'
import { PROJECT_ROOT, UPLOADS_DIR } from './runtimePaths'

export const LEGACY_UPLOADS_DIR = path.join(PROJECT_ROOT, 'public', 'uploads')

function uniquePaths(paths) {
  const seen = new Set()
  const out = []
  for (const item of paths) {
    const resolved = path.resolve(item)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    out.push(resolved)
  }
  return out
}

function decodeSegment(value) {
  let current = String(value || '').trim()
  if (!current) return null
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(current)
      if (decoded === current) break
      current = decoded
    } catch {
      return null
    }
  }
  return current
}

export function getUploadsRoots({ includeLegacy = true } = {}) {
  return uniquePaths(includeLegacy ? [UPLOADS_DIR, LEGACY_UPLOADS_DIR] : [UPLOADS_DIR])
}

export function isInsideDirectory(targetPath, rootPath) {
  const target = path.resolve(targetPath)
  const root = path.resolve(rootPath)
  return target === root || target.startsWith(root + path.sep)
}

export function normalizeUploadsRequestParts(rawParts) {
  const input = Array.isArray(rawParts) ? rawParts : [rawParts]
  const parts = []

  for (const rawPart of input) {
    const part = decodeSegment(rawPart)
    if (!part) continue
    if (part === '.' || part === '..') {
      return { ok: false, code: 'unsafe_segment' }
    }
    if (part.includes('/') || part.includes('\\')) {
      return { ok: false, code: 'unsafe_separator' }
    }
    parts.push(part)
  }

  if (parts.length === 0) {
    return { ok: false, code: 'empty_path' }
  }

  return { ok: true, parts }
}

export function uploadsUrlToParts(value) {
  if (!value || typeof value !== 'string') return { ok: false, code: 'empty_url' }
  let pathname = null
  try {
    pathname = new URL(value, 'http://localhost').pathname
  } catch {
    return { ok: false, code: 'invalid_url' }
  }
  if (!pathname.startsWith('/uploads/')) return { ok: false, code: 'not_uploads_url' }
  return normalizeUploadsRequestParts(pathname.slice('/uploads/'.length).split('/'))
}

export function resolveUploadsRequestPath(parts, { root = UPLOADS_DIR } = {}) {
  const normalized = normalizeUploadsRequestParts(parts)
  if (!normalized.ok) return null
  const rootPath = path.resolve(root)
  const targetPath = path.resolve(rootPath, ...normalized.parts)
  if (!isInsideDirectory(targetPath, rootPath)) return null
  return targetPath
}

export function resolveUploadsUrlCandidates(value, { includeLegacy = true } = {}) {
  const normalized = uploadsUrlToParts(value)
  if (!normalized.ok) return []
  return getUploadsRoots({ includeLegacy })
    .map((root) => resolveUploadsRequestPath(normalized.parts, { root }))
    .filter(Boolean)
}

export async function inspectSafeUploadsFile(filePath, root) {
  const rootPath = path.resolve(root)
  let stat = null
  try {
    stat = await fs.promises.lstat(filePath)
  } catch {
    return { ok: false, status: 404, code: 'not_found' }
  }

  if (stat.isSymbolicLink()) {
    return { ok: false, status: 403, code: 'symlink_forbidden' }
  }

  if (!stat.isFile()) {
    return { ok: false, status: 404, code: 'not_file' }
  }

  let realRoot = rootPath
  let realFile = path.resolve(filePath)
  try {
    realRoot = await fs.promises.realpath(rootPath)
    realFile = await fs.promises.realpath(filePath)
  } catch {
    return { ok: false, status: 404, code: 'not_found' }
  }

  if (!isInsideDirectory(realFile, realRoot)) {
    return { ok: false, status: 403, code: 'escaped_uploads_root' }
  }

  return { ok: true, filePath: realFile, stat }
}
