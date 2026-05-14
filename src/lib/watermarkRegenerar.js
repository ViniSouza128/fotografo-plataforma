import fs from 'fs'
import { readPhotos } from './photos'
import { readEvents } from './events'
import { readConfig } from './config'
import {
  ensureImageStorageDirs,
  getDerivedAbsolutePath,
  resolveOriginalPath,
} from './imageStorage'
import { renderCoverBuffers, renderPhotoBuffers } from './derivedImagesRenderer'
import { mergeWatermarkConfig } from './watermark'
import { assertCanUpload } from './storageQuota'

async function regeneratePhotoVariants(photo, config) {
    const originalPath = resolveOriginalPath(photo)
  if (!originalPath || !fs.existsSync(originalPath)) {
    return { ok: false, reason: 'original_nao_encontrado' }
  }

  const buffers = await renderPhotoBuffers(originalPath, config)
  const eventId = photo?.eventId || null

  const paths = {
    gridWm: getDerivedAbsolutePath({ kind: 'grid', watermark: 'wm', filename: photo.filename, eventId }),
    gridClean: getDerivedAbsolutePath({ kind: 'grid', watermark: 'clean', filename: photo.filename, eventId }),
    thumbWm: getDerivedAbsolutePath({ kind: 'thumbs', watermark: 'wm', filename: photo.filename, eventId }),
    thumbClean: getDerivedAbsolutePath({ kind: 'thumbs', watermark: 'clean', filename: photo.filename, eventId }),
    miniWm: getDerivedAbsolutePath({ kind: 'mini', watermark: 'wm', filename: photo.filename, eventId }),
    miniClean: getDerivedAbsolutePath({ kind: 'mini', watermark: 'clean', filename: photo.filename, eventId }),
  }

  await Promise.all([
    paths.gridWm ? fs.promises.writeFile(paths.gridWm, buffers.grid.wm) : Promise.resolve(),
    paths.gridClean ? fs.promises.writeFile(paths.gridClean, buffers.grid.clean) : Promise.resolve(),
    paths.thumbWm ? fs.promises.writeFile(paths.thumbWm, buffers.thumbs.wm) : Promise.resolve(),
    paths.thumbClean ? fs.promises.writeFile(paths.thumbClean, buffers.thumbs.clean) : Promise.resolve(),
    paths.miniWm ? fs.promises.writeFile(paths.miniWm, buffers.mini.wm) : Promise.resolve(),
    paths.miniClean ? fs.promises.writeFile(paths.miniClean, buffers.mini.clean) : Promise.resolve(),
  ])

  return { ok: true }
}

async function regenerateCoverVariants(event, config) {
  if (!event?.coverImage) return { ok: true, skipped: true }
    const originalPath = resolveOriginalPath({
      filename: event.coverImage,
      eventId: event.id,
      originalPath: event.coverOriginalPath,
    })
  if (!originalPath || !fs.existsSync(originalPath)) {
    return { ok: false, reason: 'cover_original_nao_encontrado' }
  }

  const coverFilename = event.coverImageFile || `cover_${event.coverImage}`
  const { clean, wm } = await renderCoverBuffers(originalPath, config)
  const eventId = event.id || null
  const cleanPath = getDerivedAbsolutePath({ kind: 'covers', watermark: 'clean', filename: coverFilename, eventId })
  const wmPath = getDerivedAbsolutePath({ kind: 'covers', watermark: 'wm', filename: coverFilename, eventId })

  await Promise.all([
    cleanPath ? fs.promises.writeFile(cleanPath, clean) : Promise.resolve(),
    wmPath ? fs.promises.writeFile(wmPath, wm) : Promise.resolve(),
  ])

  return { ok: true }
}

export async function regenerarWatermarks() {
  ensureImageStorageDirs()
  assertCanUpload({ kind: 'photo', incomingBytes: 0 })

  const photos = readPhotos()
  const events = readEvents()
  const config = readConfig()
  const eventMap = new Map(events.map((ev) => [ev.id, ev]))

  let ok = 0
  let erros = 0
  let coversOk = 0
  let coversErro = 0
  const detalhes = []

  for (const photo of photos) {
    try {
      const cfg = mergeWatermarkConfig(config, eventMap.get(photo.eventId) || null)
      const result = await regeneratePhotoVariants(photo, cfg)
      if (result.ok) {
        ok += 1
        detalhes.push({ filename: photo.filename, status: 'ok' })
      } else {
        erros += 1
        detalhes.push({ filename: photo.filename, status: 'erro', msg: result.reason })
      }
    } catch (error) {
      erros += 1
      detalhes.push({ filename: photo.filename, status: 'erro', msg: error.message })
    }
  }

  for (const event of events) {
    try {
      const cfg = mergeWatermarkConfig(config, event)
      const result = await regenerateCoverVariants(event, cfg)
      if (result.ok) coversOk += 1
      else coversErro += 1
    } catch {
      coversErro += 1
    }
  }

  return {
    total: photos.length,
    ok,
    erros,
    coversTotal: events.length,
    coversOk,
    coversErro,
    detalhes,
  }
}
