// src/lib/videos.js
// Persistência de vídeos vendáveis (MP4) com posters separados.
//
// Modelo (data/videos.json):
//   {
//     id, publicId, eventId, colaboradorId,
//     filename,          // nome único interno (sanitizado), .mp4
//     originalName,      // nome do arquivo enviado
//     originalPath,      // relativo a storage/originals/{eventId}/videos/<filename>
//     posterClean,       // caminho relativo (sob /uploads/) do poster sem WM (opcional)
//     posterWm,          // caminho relativo (sob /uploads/) do poster c/ WM (opcional)
//     duration,          // segundos (opcional)
//     width, height, size,
//     price,             // preço editado/finalizado
//     rawPrice,          // preço da versão crua (opcional)
//     supportsRawDelivery,
//     resolutions: [
//       { label: '1080p'|'720p'|'480p'|'360p'|'4K', filename, size, width, height }
//     ],
//     edited: {
//       entregue, entregueEm,
//       filename, size, width, height,
//       resolutions: [...],
//     },
//     pasta, takenAt, author,
//     removida, removidaEm, vendida,
//     createdAt
//   }

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { DATA_DIR, STORAGE_DIR, UPLOADS_DIR, ensureRuntimeDirs } from './runtimePaths'

const DATA_PATH = path.join(DATA_DIR, 'videos.json')
export const VIDEOS_PRIVATE_DIR = path.join(STORAGE_DIR, 'originals')
export const VIDEO_POSTERS_DIR = path.join(UPLOADS_DIR, 'video-posters')

const ALLOWED_RESOLUTIONS = ['360p', '480p', '720p', '1080p', '1440p', '4K']

function ensureFile() {
  ensureRuntimeDirs()
  const dir = path.dirname(DATA_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, '[]', 'utf-8')
}

export function readVideos() {
  ensureFile()
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8')
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function writeVideos(rows) {
  ensureFile()
  fs.writeFileSync(DATA_PATH, JSON.stringify(rows, null, 2), 'utf-8')
}

export function findVideoById(id) {
  if (!id) return null
  return readVideos().find(v => v.id === id) || null
}

export function listVideosByEvent(eventId, { incluirRemovidas = false } = {}) {
  return readVideos().filter(v =>
    v.eventId === eventId && (incluirRemovidas || !v.removida)
  )
}

export function sanitizeVideoFilename(filename) {
  const safe = path.basename(String(filename || '').trim())
  if (!safe || safe === '.' || safe === '..') return null
  return safe.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function buildPublicVideoId() {
  return 'v_' + crypto.randomBytes(4).toString('hex')
}

export function getVideoOriginalAbsolutePath({ eventId, filename }) {
  const safeFilename = sanitizeVideoFilename(filename)
  const safeBucket = sanitizeVideoFilename(eventId) || '__unassigned'
  if (!safeFilename) return null
  ensureRuntimeDirs()
  const dir = path.join(VIDEOS_PRIVATE_DIR, safeBucket, 'videos')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, safeFilename)
}

export function getVideoOriginalRelativePath({ eventId, filename }) {
  const safeFilename = sanitizeVideoFilename(filename)
  const safeBucket = sanitizeVideoFilename(eventId) || '__unassigned'
  if (!safeFilename) return null
  return `${safeBucket}/videos/${safeFilename}`
}

// Caminho do MP4 de preview com marca d'água queimada (servido publicamente
// para não-compradores). Fica na mesma área privada do original.
export function getVideoPreviewWmFilename(originalFilename) {
  const safe = sanitizeVideoFilename(originalFilename)
  if (!safe) return null
  const ext = safe.match(/\.\w+$/)?.[0] || '.mp4'
  return safe.replace(/\.\w+$/, '') + '_wm' + ext
}

export function getVideoPreviewWmAbsolutePath({ eventId, filename }) {
  // 'filename' aqui pode ser o filename original ou já o "_wm". Aceitamos os dois.
  const f = filename && /_wm\.\w+$/i.test(filename)
    ? sanitizeVideoFilename(filename)
    : getVideoPreviewWmFilename(filename)
  const safeBucket = sanitizeVideoFilename(eventId) || '__unassigned'
  if (!f) return null
  ensureRuntimeDirs()
  const dir = path.join(VIDEOS_PRIVATE_DIR, safeBucket, 'videos')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, f)
}

export function getVideoPosterAbsolutePath({ filename, kind = 'clean' }) {
  const safeFilename = sanitizeVideoFilename(filename)
  if (!safeFilename) return null
  ensureRuntimeDirs()
  const folder = kind === 'wm' ? 'wm' : 'clean'
  const dir = path.join(VIDEO_POSTERS_DIR, folder)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, safeFilename.replace(/\.\w+$/, '.jpg'))
}

export function getVideoPosterRelativeUrl({ filename, kind = 'clean' }) {
  const safeFilename = sanitizeVideoFilename(filename)
  if (!safeFilename) return null
  const folder = kind === 'wm' ? 'wm' : 'clean'
  return `/uploads/video-posters/${folder}/${safeFilename.replace(/\.\w+$/, '.jpg')}`
}

export function appendVideo(record) {
  const all = readVideos()
  all.push(record)
  writeVideos(all)
  return record
}

export function updateVideo(id, patch) {
  const all = readVideos()
  const idx = all.findIndex(v => v.id === id)
  if (idx === -1) return null
  all[idx] = { ...all[idx], ...patch, atualizadoEm: new Date().toISOString() }
  writeVideos(all)
  return all[idx]
}

export function softDeleteVideo(id) {
  return updateVideo(id, { removida: true, removidaEm: new Date().toISOString() })
}

export function restoreVideo(id) {
  return updateVideo(id, { removida: false, removidaEm: null })
}

export function isAllowedResolution(label) {
  return ALLOWED_RESOLUTIONS.includes(String(label || '').trim())
}

export function findResolutionVariant(video, label) {
  if (!video) return null
  const target = String(label || '').trim()
  if (!target) return null
  const sources = []
  if (Array.isArray(video.resolutions)) sources.push(...video.resolutions.map(r => ({ ...r, source: 'original' })))
  if (Array.isArray(video.edited?.resolutions)) sources.push(...video.edited.resolutions.map(r => ({ ...r, source: 'edited' })))
  return sources.find(r => String(r.label).trim() === target) || null
}

// Helpers semelhantes a getEffectivePrice/isPhotoFree para vídeos
// Fallback: video.price → event.precoVideoPadrao → config.precoVideoDefault → 0
export function getEffectiveVideoPrice(video, event = null, config = null) {
  if (!video) return 0
  if (event?.albumGratis) return 0
  if (video.price !== null && video.price !== undefined && Number.isFinite(Number(video.price))) {
    return Number(video.price)
  }
  if (event?.precoVideoPadrao !== null && event?.precoVideoPadrao !== undefined && Number.isFinite(Number(event.precoVideoPadrao))) {
    return Number(event.precoVideoPadrao)
  }
  if (config?.precoVideoDefault !== null && config?.precoVideoDefault !== undefined && Number.isFinite(Number(config.precoVideoDefault))) {
    return Number(config.precoVideoDefault)
  }
  return 0
}

export function isVideoFree(video, event = null) {
  if (!video) return false
  if (event?.albumGratis) return true
  if (video.gratis === true) return true
  return false
}
