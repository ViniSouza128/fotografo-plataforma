import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { readConfig } from './config'
import { readPhotos, writePhotos } from './photos'
import { readEvents, writeEvents } from './events'
import {
  ensureImageStorageDirs,
  getDerivedAbsolutePath,
  PUBLIC_UPLOADS_DIR,
  resolveOriginalPath,
  sanitizeStoredFilename,
} from './imageStorage'
import { buildCoverPathFields, buildPhotoPathFields } from './imagePaths'
import { getDerivativeRuntimeConfig } from './derivedImagesConfig'
import { renderCoverBuffers, renderPhotoBuffers } from './derivedImagesRenderer'
import { organizeOriginalsByEvent } from './originalsMaintenance'
import { mergeWatermarkConfig } from './watermark'
import { assertCanUpload } from './storageQuota'

function stampNow() {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
}

function ensureDirSync(directory) {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true })
}

function buildArchiveRoot() {
  return path.join(PUBLIC_UPLOADS_DIR, '_legacy', `sanitize-${stampNow()}`)
}

function createExpectedSets() {
  return {
    'grid/clean': new Set(),
    'grid/wm': new Set(),
    'thumbs/clean': new Set(),
    'thumbs/wm': new Set(),
    'mini/clean': new Set(),
    'mini/wm': new Set(),
    'covers/clean': new Set(),
    'covers/wm': new Set(),
  }
}

function joinUploads(relativePath) {
  return path.join(PUBLIC_UPLOADS_DIR, ...String(relativePath).split('/').filter(Boolean))
}

function ensureSet(expectedSets, key) {
  if (!expectedSets[key]) expectedSets[key] = new Set()
  return expectedSets[key]
}

function addExpectedPhoto(expectedSets, filename, eventId = null) {
  const prefix = eventId ? `${eventId}/` : ''
  ensureSet(expectedSets, `${prefix}grid/clean`).add(filename)
  ensureSet(expectedSets, `${prefix}grid/wm`).add(filename)
  ensureSet(expectedSets, `${prefix}thumbs/clean`).add(filename)
  ensureSet(expectedSets, `${prefix}thumbs/wm`).add(filename)
  ensureSet(expectedSets, `${prefix}mini/clean`).add(filename)
  ensureSet(expectedSets, `${prefix}mini/wm`).add(filename)
  // Mantém também a expectativa flat para compatibilidade
  if (eventId) {
    expectedSets['grid/clean'].add(filename)
    expectedSets['grid/wm'].add(filename)
    expectedSets['thumbs/clean'].add(filename)
    expectedSets['thumbs/wm'].add(filename)
    expectedSets['mini/clean'].add(filename)
    expectedSets['mini/wm'].add(filename)
  }
}

function addExpectedCover(expectedSets, filename, eventId = null) {
  const prefix = eventId ? `${eventId}/` : ''
  ensureSet(expectedSets, `${prefix}covers/clean`).add(filename)
  ensureSet(expectedSets, `${prefix}covers/wm`).add(filename)
  if (eventId) {
    expectedSets['covers/clean'].add(filename)
    expectedSets['covers/wm'].add(filename)
  }
}

async function readMetadata(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  try {
    return await sharp(filePath).metadata()
  } catch {
    return null
  }
}

function isSquare(meta, size) {
  return !!meta && meta.width === size && meta.height === size
}

function isGridValid(meta, maxSize) {
  return !!meta?.width && !!meta?.height && Math.max(meta.width, meta.height) <= maxSize
}

function isCoverValid(meta, maxWidth) {
  return !!meta?.width && !!meta?.height && meta.width <= maxWidth
}

async function moveFileSafe(fromPath, toPath) {
  ensureDirSync(path.dirname(toPath))
  await fs.promises.rename(fromPath, toPath)
}

async function archiveDirectFiles(sourceDir, targetDir, shouldArchive, stats, apply) {
  if (!fs.existsSync(sourceDir)) return
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!shouldArchive(entry.name)) continue
    stats.archived += 1
    if (!apply) continue
    await moveFileSafe(path.join(sourceDir, entry.name), path.join(targetDir, entry.name))
  }
}

async function archiveUnexpectedCanonical(expectedSets, archiveRoot, stats, apply) {
  for (const [relativeDir, expected] of Object.entries(expectedSets)) {
    const dirPath = joinUploads(relativeDir)
    if (!fs.existsSync(dirPath)) continue
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (expected.has(entry.name)) continue
      stats.orphans += 1
      if (!apply) continue
      await moveFileSafe(
        path.join(dirPath, entry.name),
        path.join(archiveRoot, 'orphans', relativeDir, entry.name),
      )
    }
  }
}

function buildPhotoTargets(filename, eventId = null) {
  return {
    gridClean: getDerivedAbsolutePath({ kind: 'grid', watermark: 'clean', filename, eventId }),
    gridWm: getDerivedAbsolutePath({ kind: 'grid', watermark: 'wm', filename, eventId }),
    thumbClean: getDerivedAbsolutePath({ kind: 'thumbs', watermark: 'clean', filename, eventId }),
    thumbWm: getDerivedAbsolutePath({ kind: 'thumbs', watermark: 'wm', filename, eventId }),
    miniClean: getDerivedAbsolutePath({ kind: 'mini', watermark: 'clean', filename, eventId }),
    miniWm: getDerivedAbsolutePath({ kind: 'mini', watermark: 'wm', filename, eventId }),
  }
}

function buildPhotoTargetEntries(filename, runtimeConfig, eventId = null) {
  const targets = buildPhotoTargets(filename, eventId)
  const dirPrefix = eventId ? `${eventId}/` : ''
  return [
    {
      relativeDir: `${dirPrefix}grid/clean`,
      filePath: targets.gridClean,
      filename,
      validate: (meta) => isGridValid(meta, runtimeConfig.gridMaxSize),
    },
    {
      relativeDir: `${dirPrefix}grid/wm`,
      filePath: targets.gridWm,
      filename,
      validate: (meta) => isGridValid(meta, runtimeConfig.gridMaxSize),
    },
    {
      relativeDir: `${dirPrefix}thumbs/clean`,
      filePath: targets.thumbClean,
      filename,
      validate: (meta) => isSquare(meta, runtimeConfig.thumbSize),
    },
    {
      relativeDir: `${dirPrefix}thumbs/wm`,
      filePath: targets.thumbWm,
      filename,
      validate: (meta) => isSquare(meta, runtimeConfig.thumbSize),
    },
    {
      relativeDir: `${dirPrefix}mini/clean`,
      filePath: targets.miniClean,
      filename,
      validate: (meta) => isSquare(meta, runtimeConfig.miniSize),
    },
    {
      relativeDir: `${dirPrefix}mini/wm`,
      filePath: targets.miniWm,
      filename,
      validate: (meta) => isSquare(meta, runtimeConfig.miniSize),
    },
  ]
}

function buildCoverTargetEntries(coverFilename, runtimeConfig, eventId = null) {
  const dirPrefix = eventId ? `${eventId}/` : ''
  return [
    {
      relativeDir: `${dirPrefix}covers/clean`,
      filePath: getDerivedAbsolutePath({ kind: 'covers', watermark: 'clean', filename: coverFilename, eventId }),
      filename: coverFilename,
      validate: (meta) => isCoverValid(meta, runtimeConfig.coverWidth),
    },
    {
      relativeDir: `${dirPrefix}covers/wm`,
      filePath: getDerivedAbsolutePath({ kind: 'covers', watermark: 'wm', filename: coverFilename, eventId }),
      filename: coverFilename,
      validate: (meta) => isCoverValid(meta, runtimeConfig.coverWidth),
    },
  ]
}

function buildExpectedPhotoFields(filename, eventId = null) {
  const safeFilename = sanitizeStoredFilename(filename)
  return {
    filenameWm: `wm_${safeFilename}`,
    filenameThumb: `thumb_${safeFilename}`,
    filenameMini: `mini_${safeFilename.replace(/\.\w+$/, '.jpg')}`,
    ...buildPhotoPathFields(safeFilename, eventId),
  }
}

function normalizePhotoRecord(photo, filename) {
  const expected = buildExpectedPhotoFields(filename, photo?.eventId || null)
  let changed = false
  for (const [key, value] of Object.entries(expected)) {
    if (photo[key] !== value) {
      photo[key] = value
      changed = true
    }
  }
  return changed
}

function normalizeEventCoverRecord(event, coverFilename) {
  const expected = buildCoverPathFields(coverFilename, event?.id || null)
  let changed = false
  if (event.coverImageFile !== coverFilename) {
    event.coverImageFile = coverFilename
    changed = true
  }
  for (const [key, value] of Object.entries(expected)) {
    if (event[key] !== value) {
      event[key] = value
      changed = true
    }
  }
  return changed
}

async function inspectTargets(entries) {
  const metadata = await Promise.all(entries.map((entry) => readMetadata(entry.filePath)))
  const invalidExisting = []
  let missing = false

  entries.forEach((entry, index) => {
    const meta = metadata[index]
    if (!meta) {
      missing = true
      return
    }
    if (!entry.validate(meta)) invalidExisting.push(entry)
  })

  return {
    missing,
    invalidExisting,
    needsRegeneration: missing || invalidExisting.length > 0,
  }
}

async function archiveInvalidEntries(entries, archiveRoot, stats, apply) {
  for (const entry of entries) {
    if (!fs.existsSync(entry.filePath)) continue
    stats.archived += 1
    if (!apply) continue
    await moveFileSafe(
      entry.filePath,
      path.join(archiveRoot, 'invalid-size', entry.relativeDir, entry.filename),
    )
  }
}

export async function sanitizeDerivedImages({
  apply = true,
  forceRegenerate = false,
  onProgress = null,
  eventIds = null,
  overlay = false,
} = {}) {
  ensureImageStorageDirs()
  if (apply) assertCanUpload({ kind: 'photo', incomingBytes: 0 })

  const config = readConfig()
  const runtimeConfig = getDerivativeRuntimeConfig(config)
  const photos = readPhotos()
  const events = readEvents()
  const eventById = new Map(events.map((ev) => [ev.id, ev]))
  const selectedIds = Array.isArray(eventIds) ? new Set(eventIds.filter(Boolean)) : null
  const scoped = !!(selectedIds && selectedIds.size > 0)
  const expectedSets = scoped ? null : createExpectedSets()
  const archiveRoot = buildArchiveRoot()
  const stats = {
    photosTotal: 0,
    photosGenerated: 0,
    photosSkipped: 0,
    photosFailed: 0,
    coversTotal: 0,
    coversGenerated: 0,
    coversSkipped: 0,
    coversFailed: 0,
    archived: 0,
    orphans: 0,
    originalsMoved: 0,
    originalsMissing: 0,
    photoOriginalMissing: 0,
    coverOriginalMissing: 0,
  }
  // Per-event report: { eventId: { name, photosTotal, photosGenerated, photosSkipped, photosFailed, coverGenerated, coverSkipped, coverFailed, allUpToDate } }
  const eventResults = new Map()
  function ensureEventEntry(eventId) {
    if (!eventResults.has(eventId)) {
      const ev = eventById.get(eventId)
      eventResults.set(eventId, {
        eventId,
        name: ev?.name || 'Evento',
        photosTotal: 0,
        photosGenerated: 0,
        photosSkipped: 0,
        photosFailed: 0,
        coverGenerated: 0,
        coverSkipped: 0,
        coverFailed: 0,
        coverMissing: false,
        allUpToDate: false,
      })
    }
    return eventResults.get(eventId)
  }

  const photoCandidates = photos
    .filter((photo) => !!sanitizeStoredFilename(photo?.filename))
    .filter((photo) => !scoped || selectedIds.has(photo.eventId))
  const coverCandidates = events
    .filter((event) => !!sanitizeStoredFilename(event?.coverImage))
    .filter((event) => !scoped || selectedIds.has(event.id))

  const housekeepingSteps = scoped ? 0 : 2
  const totalSteps = photoCandidates.length + coverCandidates.length + housekeepingSteps
  let doneSteps = 0

  const report = (current) => {
    doneSteps += 1
    if (typeof onProgress === 'function') {
      onProgress({
        total: totalSteps,
        done: doneSteps,
        current,
        generated: stats.photosGenerated + stats.coversGenerated,
        skipped: stats.photosSkipped + stats.coversSkipped,
        failed: stats.photosFailed + stats.coversFailed,
        archived: stats.archived,
        orphans: stats.orphans,
      })
    }
  }

  if (!scoped && expectedSets) {
    for (const photo of photoCandidates) {
      addExpectedPhoto(expectedSets, sanitizeStoredFilename(photo.filename), photo.eventId || null)
    }
    for (const event of coverCandidates) {
      const coverFilename = sanitizeStoredFilename(event.coverImageFile || `cover_${event.coverImage}`)
      if (coverFilename) addExpectedCover(expectedSets, coverFilename, event.id || null)
    }
  }

  const originalsLayout = scoped
    ? { moved: 0, missing: 0, photosDirty: false, eventsDirty: false }
    : await organizeOriginalsByEvent({ photos, events, apply })
  stats.originalsMoved = originalsLayout.moved || 0
  stats.originalsMissing = originalsLayout.missing || 0
  if (!scoped) report('Organizando originais por evento')

  if (!scoped && expectedSets) {
    await archiveDirectFiles(
      path.join(PUBLIC_UPLOADS_DIR, 'thumbs'),
      path.join(archiveRoot, 'legacy-thumbs-root'),
      () => true,
      stats,
      apply,
    )
    await archiveDirectFiles(
      PUBLIC_UPLOADS_DIR,
      path.join(archiveRoot, 'legacy-uploads-root'),
      (name) => /^wm_|^thumb_|^mini_|^cover_/i.test(name),
      stats,
      apply,
    )
    await archiveUnexpectedCanonical(expectedSets, archiveRoot, stats, apply)
    report('Arquivando legado e órfãos')
  }

  let photosDirty = false
  const overlayAt = new Date().toISOString()
  for (const photo of photoCandidates) {
    const filename = sanitizeStoredFilename(photo.filename)
    stats.photosTotal += 1
    const evEntry = ensureEventEntry(photo.eventId)
    evEntry.photosTotal += 1
    photosDirty = normalizePhotoRecord(photo, filename) || photosDirty

    const originalPath = resolveOriginalPath(photo)
    if (!originalPath || !fs.existsSync(originalPath)) {
      stats.photosFailed += 1
      stats.photoOriginalMissing += 1
      evEntry.photosFailed += 1
      report(`Original ausente: ${filename}`)
      continue
    }

    const inspection = await inspectTargets(buildPhotoTargetEntries(filename, runtimeConfig, photo.eventId || null))
    const needsRegeneration = forceRegenerate || inspection.needsRegeneration || (overlay && !photo.overlayApplied)
    if (!needsRegeneration) {
      stats.photosSkipped += 1
      evEntry.photosSkipped += 1
      report(`Foto ok: ${filename}`)
      continue
    }

    if (inspection.invalidExisting.length > 0) {
      await archiveInvalidEntries(inspection.invalidExisting, archiveRoot, stats, apply)
    }

    if (apply) {
      const cfg = mergeWatermarkConfig(config, eventById.get(photo.eventId) || null)
      const overlayInfo = overlay ? {
        publicId: photo.publicId || null,
        originalName: photo.originalName || photo.filename || null,
      } : null
      const buffers = await renderPhotoBuffers(originalPath, cfg, undefined, { overlay: overlayInfo })
      const targets = buildPhotoTargets(filename, photo.eventId || null)
      await Promise.all([
        fs.promises.writeFile(targets.gridClean, buffers.grid.clean),
        fs.promises.writeFile(targets.gridWm, buffers.grid.wm),
        fs.promises.writeFile(targets.thumbClean, buffers.thumbs.clean),
        fs.promises.writeFile(targets.thumbWm, buffers.thumbs.wm),
        fs.promises.writeFile(targets.miniClean, buffers.mini.clean),
        fs.promises.writeFile(targets.miniWm, buffers.mini.wm),
      ])
      // Persist overlay metadata
      if (overlay) {
        photo.overlayApplied = true
        photo.overlayAppliedAt = overlayAt
        photosDirty = true
      } else if (photo.overlayApplied) {
        photo.overlayApplied = false
        photo.overlayAppliedAt = null
        photosDirty = true
      }
    }

    stats.photosGenerated += 1
    evEntry.photosGenerated += 1
    report(`Regenerando foto: ${filename}`)
  }

  let eventsDirty = false
  for (const event of coverCandidates) {
    const originalCover = sanitizeStoredFilename(event.coverImage)
    const coverFilename = sanitizeStoredFilename(event.coverImageFile || `cover_${originalCover}`)
    stats.coversTotal += 1
    const evEntry = ensureEventEntry(event.id)
    eventsDirty = normalizeEventCoverRecord(event, coverFilename) || eventsDirty

    const originalPath = resolveOriginalPath({
      filename: originalCover,
      eventId: event.id,
      originalPath: event.coverOriginalPath,
    })
    if (!originalPath || !fs.existsSync(originalPath)) {
      stats.coversFailed += 1
      stats.coverOriginalMissing += 1
      evEntry.coverFailed += 1
      evEntry.coverMissing = true
      report(`Original da capa ausente: ${coverFilename}`)
      continue
    }

    const inspection = await inspectTargets(buildCoverTargetEntries(coverFilename, runtimeConfig, event.id))
    const needsRegeneration = forceRegenerate || inspection.needsRegeneration
    if (!needsRegeneration) {
      stats.coversSkipped += 1
      evEntry.coverSkipped += 1
      report(`Capa ok: ${coverFilename}`)
      continue
    }

    if (inspection.invalidExisting.length > 0) {
      await archiveInvalidEntries(inspection.invalidExisting, archiveRoot, stats, apply)
    }

    if (apply) {
      const cfg = mergeWatermarkConfig(config, event)
      const buffers = await renderCoverBuffers(originalPath, cfg)
      const cleanPath = getDerivedAbsolutePath({ kind: 'covers', watermark: 'clean', filename: coverFilename, eventId: event.id })
      const wmPath = getDerivedAbsolutePath({ kind: 'covers', watermark: 'wm', filename: coverFilename, eventId: event.id })
      await Promise.all([
        fs.promises.writeFile(cleanPath, buffers.clean),
        fs.promises.writeFile(wmPath, buffers.wm),
      ])
    }

    stats.coversGenerated += 1
    evEntry.coverGenerated += 1
    report(`Regenerando capa: ${coverFilename}`)
  }
  // Final pass: mark events as up-to-date when nothing was regenerated
  for (const entry of eventResults.values()) {
    entry.allUpToDate = (entry.photosGenerated === 0 && entry.coverGenerated === 0
      && entry.photosFailed === 0 && entry.coverFailed === 0
      && (entry.photosTotal > 0 || entry.coverSkipped > 0))
  }

  if (apply) {
    if (photosDirty || originalsLayout.photosDirty) writePhotos(photos)
    if (eventsDirty || originalsLayout.eventsDirty) writeEvents(events)
  }

  return {
    ok: true,
    archiveRoot: apply ? archiveRoot : null,
    total: totalSteps,
    done: doneSteps,
    generated: stats.photosGenerated + stats.coversGenerated,
    skipped: stats.photosSkipped + stats.coversSkipped,
    failed: stats.photosFailed + stats.coversFailed,
    scoped,
    ...stats,
    eventResults: Array.from(eventResults.values()),
  }
}
