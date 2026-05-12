// src/lib/avatars.js
// Avatares de cliente: original em storage/originals/avatars/<clientId>.<ext>
// e derivadas públicas em public/uploads/avatars/<clientId>/{large.jpg, thumb.jpg}.

import fs from 'fs'
import path from 'path'

export const AVATAR_PRIVATE_DIR = path.join(process.cwd(), 'storage', 'originals', 'avatars')
export const AVATAR_PUBLIC_DIR  = path.join(process.cwd(), 'public', 'uploads', 'avatars')

export const AVATAR_LARGE_SIZE = 512
export const AVATAR_THUMB_SIZE = 96
export const AVATAR_MAX_BYTES  = 12 * 1024 * 1024 // 12 MB
export const AVATAR_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function getAvatarPaths(clientId) {
  const safeId = String(clientId || '').replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safeId) return null
  const publicDir = path.join(AVATAR_PUBLIC_DIR, safeId)
  return {
    safeId,
    publicDir,
    privateDir: AVATAR_PRIVATE_DIR,
    largeAbs:  path.join(publicDir, 'large.jpg'),
    thumbAbs:  path.join(publicDir, 'thumb.jpg'),
    largeUrl: `/uploads/avatars/${safeId}/large.jpg`,
    thumbUrl: `/uploads/avatars/${safeId}/thumb.jpg`,
  }
}

export function ensureAvatarDirs(clientId) {
  const p = getAvatarPaths(clientId)
  if (!p) return null
  ensureDir(p.publicDir)
  ensureDir(p.privateDir)
  return p
}

export function getAvatarOriginalPath(clientId, ext = 'jpg') {
  const safeId = String(clientId || '').replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safeId) return null
  ensureDir(AVATAR_PRIVATE_DIR)
  const safeExt = String(ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'jpg'
  return path.join(AVATAR_PRIVATE_DIR, `${safeId}.${safeExt}`)
}

export function findExistingOriginal(clientId) {
  const safeId = String(clientId || '').replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safeId) return null
  if (!fs.existsSync(AVATAR_PRIVATE_DIR)) return null
  const files = fs.readdirSync(AVATAR_PRIVATE_DIR)
  const match = files.find(f => f.startsWith(`${safeId}.`))
  return match ? path.join(AVATAR_PRIVATE_DIR, match) : null
}

export function safeUnlinkSync(p) {
  if (!p) return
  try { fs.unlinkSync(p) } catch {}
}

export function deleteAvatarFiles(clientId) {
  const p = getAvatarPaths(clientId)
  if (!p) return
  safeUnlinkSync(p.largeAbs)
  safeUnlinkSync(p.thumbAbs)
  const orig = findExistingOriginal(clientId)
  if (orig) safeUnlinkSync(orig)
  // remove dir if empty
  try {
    if (fs.existsSync(p.publicDir) && fs.readdirSync(p.publicDir).length === 0) {
      fs.rmdirSync(p.publicDir)
    }
  } catch {}
}
