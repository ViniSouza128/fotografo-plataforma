// src/lib/sponsors.js
// Patrocinadores/apoiadores/parceiros por evento.
// Estrutura armazenada dentro do próprio event.patrocinadores (array).
// Logos ficam em public/uploads/sponsors/<eventId>/<sponsorId>.<ext>.

import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

export const SPONSORS_PUBLIC_DIR = path.join(process.cwd(), 'public', 'uploads', 'sponsors')

const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'])
const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif',
  'image/svg+xml', 'image/webp',
])

export function isAllowedSponsorMime(mime) {
  if (!mime) return false
  return ALLOWED_MIME.has(String(mime).toLowerCase())
}

export function isAllowedSponsorExt(filename) {
  const ext = (path.extname(filename || '') || '').toLowerCase()
  return ALLOWED_EXTS.has(ext)
}

export function newSponsorId() {
  return 's_' + crypto.randomBytes(4).toString('hex')
}

export function getSponsorDir(eventId) {
  const safe = String(eventId || '').replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(SPONSORS_PUBLIC_DIR, safe)
}

export function getSponsorAbsolutePath(eventId, filename) {
  const dir = getSponsorDir(eventId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const safe = String(filename || '').replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(dir, safe)
}

export function getSponsorPublicUrl(eventId, filename) {
  const safeEvent = String(eventId || '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const safe = String(filename || '').replace(/[^a-zA-Z0-9._-]/g, '_')
  return `/uploads/sponsors/${safeEvent}/${safe}`
}

export function deleteSponsorFile(eventId, filename) {
  if (!filename) return
  const target = getSponsorAbsolutePath(eventId, filename)
  try { if (fs.existsSync(target)) fs.unlinkSync(target) } catch {}
}

// Normaliza um patrocinador (saneamento de input vindo da UI)
export function normalizeSponsor(input = {}) {
  const cleanInsta = String(input.instagram || '').trim().replace(/^@+/, '')
  const cleanLink = String(input.link || '').trim()
  const finalLink = cleanLink && !/^https?:\/\//i.test(cleanLink) ? `https://${cleanLink}` : cleanLink
  return {
    id: input.id || newSponsorId(),
    nome: String(input.nome || '').trim().slice(0, 120),
    descricao: String(input.descricao || '').trim().slice(0, 400),
    instagram: cleanInsta.slice(0, 60) || null,
    link: finalLink || null,
    contato: String(input.contato || '').trim().slice(0, 120) || null,
    logoUrl: input.logoUrl || null,
    logoFilename: input.logoFilename || null,  // só p/ saber qual arquivo apagar depois
    ordem: Number.isFinite(Number(input.ordem)) ? Number(input.ordem) : 0,
    criadoEm: input.criadoEm || new Date().toISOString(),
  }
}

export function sortSponsors(list) {
  return [...(list || [])].sort((a, b) => {
    const oa = Number.isFinite(Number(a.ordem)) ? Number(a.ordem) : 0
    const ob = Number.isFinite(Number(b.ordem)) ? Number(b.ordem) : 0
    if (oa !== ob) return oa - ob
    return String(a.nome || '').localeCompare(String(b.nome || ''))
  })
}
