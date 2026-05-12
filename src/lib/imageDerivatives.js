import fs from 'fs'
import { readConfig } from './config'
import { readEvents } from './events'
import { readPhotos } from './photos'
import {
  ensureImageStorageDirs,
  getDerivedAbsolutePath,
  resolveOriginalPath,
  sanitizeStoredFilename,
} from './imageStorage'
import { buildDerivedRelativePath, toUploadsUrl } from './imagePaths'
import { renderCoverBuffers, renderPhotoBuffers } from './derivedImagesRenderer'
import { mergeWatermarkConfig } from './watermark'

const generationLocks = new Map()

function getConfig() {
  return readConfig()
}

function withGenerationLock(key, task) {
  const existing = generationLocks.get(key)
  if (existing) return existing
  const promise = Promise.resolve()
    .then(task)
    .finally(() => generationLocks.delete(key))
  generationLocks.set(key, promise)
  return promise
}

function ensureVariant(kind, watermark) {
  if (!['grid', 'thumbs', 'mini'].includes(kind)) return false
  if (!['wm', 'clean'].includes(watermark)) return false
  return true
}

function buildDerivedUrl(kind, watermark, filename, eventId = null) {
  const relative = buildDerivedRelativePath({ kind, watermark, filename, eventId })
  return relative ? toUploadsUrl(relative) : null
}

function exists(filePath) {
  return !!filePath && fs.existsSync(filePath)
}

function findPhotoByFilename(filename) {
  const photos = readPhotos()
  return photos.find((photo) => photo?.filename === filename) || null
}

function findEventById(id) {
  if (!id) return null
  const events = readEvents()
  return events.find((event) => event?.id === id) || null
}

function findEventByCoverFilename(filename) {
  const events = readEvents()
  return events.find((event) => event?.coverImage === filename) || null
}

async function writeIfMissing(filePath, buffer) {
  if (!filePath || exists(filePath)) return false
  try {
    await fs.promises.writeFile(filePath, buffer, { flag: 'wx' })
    return true
  } catch (error) {
    if (error?.code === 'EEXIST') return false
    throw error
  }
}

export async function ensurePhotoDerivedVariant({ filename, kind, watermark, eventId = null }) {
  const safeFilename = sanitizeStoredFilename(filename)
  if (!safeFilename || !ensureVariant(kind, watermark)) return { ok: false, reason: 'invalid_input' }

  ensureImageStorageDirs()

  // Encontra o evento via photo (preferindo eventId fornecido, mas validando)
  const photo = findPhotoByFilename(safeFilename)
  const resolvedEventId = (eventId && photo?.eventId === eventId)
    ? eventId
    : (photo?.eventId || eventId || null)

  const targetPath = getDerivedAbsolutePath({ kind, watermark, filename: safeFilename, eventId: resolvedEventId })
  const targetUrl = buildDerivedUrl(kind, watermark, safeFilename, resolvedEventId)
  if (exists(targetPath)) return { ok: true, generated: false, url: targetUrl }

  return withGenerationLock(`photo:${resolvedEventId || '_'}:${kind}:${watermark}:${safeFilename}`, async () => {
    if (exists(targetPath)) return { ok: true, generated: false, url: targetUrl }

    const originalPath = resolveOriginalPath(photo || { filename: safeFilename, eventId: resolvedEventId })
    if (!originalPath || !exists(originalPath)) return { ok: false, reason: 'original_missing' }

    const cfg = mergeWatermarkConfig(getConfig(), photo ? findEventById(photo.eventId) : (resolvedEventId ? findEventById(resolvedEventId) : null))
    const buffers = await renderPhotoBuffers(originalPath, cfg)
    const buffer = buffers?.[kind]?.[watermark]
    if (!buffer) return { ok: false, reason: 'variant_not_supported' }

    await writeIfMissing(targetPath, buffer)

    return { ok: true, generated: true, url: targetUrl }
  })
}

export function getMissingPhotoVariants(filename, eventId = null) {
  const safeFilename = sanitizeStoredFilename(filename)
  if (!safeFilename) return []
  const variants = [
    { kind: 'grid', watermark: 'wm' },
    { kind: 'grid', watermark: 'clean' },
    { kind: 'thumbs', watermark: 'wm' },
    { kind: 'thumbs', watermark: 'clean' },
    { kind: 'mini', watermark: 'wm' },
    { kind: 'mini', watermark: 'clean' },
  ]
  return variants.filter((variant) => {
    const path = getDerivedAbsolutePath({ ...variant, filename: safeFilename, eventId })
    return !exists(path)
  })
}

export async function ensureCoverVariants({ originalFilename, coverFilename, wmEnabled = false, eventId = null }) {
  const safeOriginal = sanitizeStoredFilename(originalFilename)
  const safeCover = sanitizeStoredFilename(coverFilename)
  if (!safeOriginal || !safeCover) return { ok: false, reason: 'invalid_input' }

  ensureImageStorageDirs()

  const event = findEventByCoverFilename(safeOriginal) || (eventId ? findEventById(eventId) : null)
  const resolvedEventId = event?.id || eventId || null

  const cleanPath = getDerivedAbsolutePath({ kind: 'covers', watermark: 'clean', filename: safeCover, eventId: resolvedEventId })
  const wmPath = getDerivedAbsolutePath({ kind: 'covers', watermark: 'wm', filename: safeCover, eventId: resolvedEventId })
  if (exists(cleanPath) && exists(wmPath)) {
    return { ok: true, generated: false }
  }

  return withGenerationLock(`cover:${resolvedEventId || '_'}:${safeCover}`, async () => {
    if (exists(cleanPath) && exists(wmPath)) {
      return { ok: true, generated: false }
    }

    const originalPath = resolveOriginalPath(event
      ? { filename: safeOriginal, eventId: event.id, originalPath: event.coverOriginalPath }
      : { filename: safeOriginal, eventId: resolvedEventId })
    if (!originalPath || !exists(originalPath)) return { ok: false, reason: 'original_missing' }

    const cfg = mergeWatermarkConfig(getConfig(), event || null)
    const { clean: cleanBuffer, wm: wmBuffer } = await renderCoverBuffers(originalPath, cfg)
    await Promise.all([
      writeIfMissing(cleanPath, cleanBuffer),
      writeIfMissing(wmPath, wmBuffer),
    ])

    return { ok: true, generated: true }
  })
}
