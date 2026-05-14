import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import exifr from 'exifr'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { requireAuth } from '@/lib/apiAuth'
import { readConfig } from '@/lib/config'
import { getUploadOptimizationRuntimeConfig } from '@/lib/derivedImagesConfig'
import {
  buildOriginalRelativePath,
  buildPhotoStorageFields,
  ensureImageStorageDirs,
  getDerivedAbsolutePath,
  getOriginalAbsolutePath,
} from '@/lib/imageStorage'
import { renderPhotoBuffers } from '@/lib/derivedImagesRenderer'
import {
  getPhotoCartPreviewCandidates,
  getPhotoGridPreviewCandidates,
  getPhotoModalDisplayCandidates,
  getFirstUrl,
} from '@/lib/imagePaths'
import { mergeWatermarkConfig } from '@/lib/watermark'
import { readEvents } from '@/lib/events'
import { canManageEvent } from '@/lib/colaborador'
import { mirrorOriginalToExternal, mirrorDerivativeToExternal } from '@/lib/storage'
import {
  assertCanUpload,
  isStorageQuotaExceededError,
  toStorageQuotaErrorPayload,
} from '@/lib/storageQuota'

const SHARP_THREADS = Number(process.env.UPLOAD_SHARP_THREADS || 2)
const MAX_ACTIVE_PIPELINES = Number(process.env.UPLOAD_PIPELINE_CONCURRENCY || 2)

sharp.concurrency(Math.max(1, SHARP_THREADS))
sharp.cache({ memory: 64, files: 0, items: 200 })

let activePipelines = 0
const waiters = []

function sanitizeFilename(originalName) {
  const ext = path.extname(originalName)
  const baseName = path.basename(originalName, ext)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .slice(0, 40)
  const random = Math.random().toString(36).slice(2, 8)
  return `${Date.now()}_${random}_${baseName}.jpg`
}

async function withPipelineSlot(task) {
  while (activePipelines >= MAX_ACTIVE_PIPELINES) {
    await new Promise((resolve) => waiters.push(resolve))
  }

  activePipelines += 1
  try {
    return await task()
  } finally {
    activePipelines -= 1
    const next = waiters.shift()
    if (next) next()
  }
}

async function writeBlobToFile(file, destinationPath) {
  const source = Readable.fromWeb(file.stream())
  const target = fs.createWriteStream(destinationPath, { flags: 'wx' })
  await pipeline(source, target)
}

async function safeUnlink(filePath) {
  if (!filePath) return
  try {
    await fs.promises.unlink(filePath)
  } catch {}
}

function getUploadAuthor(client) {
  return client?.nomeCompleto || client?.nome || client?.email || client?.id || 'Admin'
}

function getLongestSide(metadata) {
  return Math.max(Number(metadata?.width) || 0, Number(metadata?.height) || 0)
}

async function renderOptimizedOriginalBuffer(filePath, maxLongSide, quality) {
  let image = sharp(filePath).rotate()
  if (maxLongSide) {
    image = image.resize({
      width: maxLongSide,
      height: maxLongSide,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }
  return image.jpeg({ quality, mozjpeg: true }).toBuffer()
}

async function optimizeStoredOriginal(filePath, options, sourceMetadata) {
  if (options?.preserveOriginal !== false) return null

  const originalLongestSide = getLongestSide(sourceMetadata)
  const configuredMaxSide = Number.isFinite(Number(options.maxLongSide))
    ? Math.round(Number(options.maxLongSide))
    : null
  const targetBytes = Number.isFinite(Number(options.targetMaxMb))
    ? Math.round(Number(options.targetMaxMb) * 1024 * 1024)
    : null
  let quality = Math.max(45, Math.min(95, Math.round(Number(options.jpgQuality) || 86)))
  let maxLongSide = configuredMaxSide && originalLongestSide > configuredMaxSide ? configuredMaxSide : null

  let buffer = await renderOptimizedOriginalBuffer(filePath, maxLongSide, quality)

  while (targetBytes && buffer.length > targetBytes && quality > 45) {
    quality = Math.max(45, quality - 7)
    buffer = await renderOptimizedOriginalBuffer(filePath, maxLongSide, quality)
  }

  while (targetBytes && buffer.length > targetBytes) {
    const currentSide = maxLongSide || originalLongestSide
    if (!currentSide || currentSide <= 1200) break
    maxLongSide = Math.max(1200, Math.round(currentSide * 0.9))
    buffer = await renderOptimizedOriginalBuffer(filePath, maxLongSide, quality)
  }

  await fs.promises.writeFile(filePath, buffer)
  return {
    size: buffer.length,
    quality,
    maxLongSide,
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    ensureImageStorageDirs()

    const formData = await request.formData()
    const file = formData.get('file')
    const eventId = String(formData.get('eventId') || '').trim() || null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      return NextResponse.json({ error: 'Apenas JPG, PNG e WebP' }, { status: 400 })
    }

    const config = readConfig()
    const event = eventId ? readEvents().find((ev) => ev.id === eventId) || null : null

    // Colaborador só pode subir em eventos próprios
    if (auth.payload.isColaborador) {
      if (!event || !canManageEvent(auth.payload, event)) {
        return NextResponse.json({ error: 'Sem permissão para este evento.' }, { status: 403 })
      }
    }

    assertCanUpload({ kind: 'photo', incomingBytes: Number(file.size) || 0 })

    const effectiveConfig = mergeWatermarkConfig(config, event)
    const uploadOptimization = getUploadOptimizationRuntimeConfig(config)
    const filename = sanitizeFilename(file.name)
    const originalPath = getOriginalAbsolutePath({ eventId, filename })
    const originalRelativePath = buildOriginalRelativePath({ eventId, filename })
    const storageFields = buildPhotoStorageFields(filename, eventId)

    const paths = {
      gridWm: getDerivedAbsolutePath({ kind: 'grid', watermark: 'wm', filename, eventId }),
      gridClean: getDerivedAbsolutePath({ kind: 'grid', watermark: 'clean', filename, eventId }),
      thumbWm: getDerivedAbsolutePath({ kind: 'thumbs', watermark: 'wm', filename, eventId }),
      thumbClean: getDerivedAbsolutePath({ kind: 'thumbs', watermark: 'clean', filename, eventId }),
      miniWm: getDerivedAbsolutePath({ kind: 'mini', watermark: 'wm', filename, eventId }),
      miniClean: getDerivedAbsolutePath({ kind: 'mini', watermark: 'clean', filename, eventId }),
    }

    const writtenPaths = [originalPath]
    const originalName = file.name
    const size = file.size
    const author = getUploadAuthor(auth.client)
    let takenAt = null
    let originalWidth = null
    let originalHeight = null

    try {
      await writeBlobToFile(file, originalPath)

      // Apenas leitura rápida de metadados (EXIF + dimensões) e otimização do
      // original. As derivadas (grid/thumbs/mini WM e clean) ficam para o
      // worker em segundo plano, enfileirado pelo /api/photos POST. Isso
      // libera o cliente para iniciar o próximo upload imediatamente.
      try {
        const exif = await exifr.parse(originalPath, { pick: ['DateTimeOriginal'] })
        if (exif?.DateTimeOriginal) takenAt = new Date(exif.DateTimeOriginal).toISOString()
      } catch {}

      const metadata = await sharp(originalPath).metadata()
      originalWidth = metadata.width || null
      originalHeight = metadata.height || null
      await optimizeStoredOriginal(originalPath, uploadOptimization, metadata)
    } catch (error) {
      await Promise.all(writtenPaths.map((target) => safeUnlink(target)))
      throw error
    }

    // Mirror do original p/ storage externo (fire-and-forget). As derivadas
    // serão espelhadas pelo worker depois que forem geradas.
    Promise.allSettled([
      mirrorOriginalToExternal({ eventId, filename, absolutePath: originalPath, contentType: 'image/jpeg' }),
    ]).catch(() => {})

    const photoRecord = {
      filename,
      eventId,
      originalPath: originalRelativePath,
      ...storageFields,
      originalName,
      size,
      takenAt,
      author,
      originalWidth,
      originalHeight,
      optimizedOriginal: uploadOptimization.preserveOriginal === false,
      storedOriginalSize: null,
    }

    if (uploadOptimization.preserveOriginal === false) {
      const stat = await fs.promises.stat(originalPath).catch(() => null)
      photoRecord.storedOriginalSize = stat?.size || null
    }

    const modalCandidates = getPhotoModalDisplayCandidates(photoRecord)
    const gridCandidates = getPhotoGridPreviewCandidates(photoRecord)
    const cartCandidates = getPhotoCartPreviewCandidates(photoRecord)

    return NextResponse.json({
      ...photoRecord,
      url: getFirstUrl(modalCandidates),
      thumbUrl: getFirstUrl(gridCandidates),
      miniUrl: getFirstUrl(cartCandidates),
    }, { status: 201 })
  } catch (error) {
    if (isStorageQuotaExceededError(error)) {
      return NextResponse.json(toStorageQuotaErrorPayload(error), { status: error.status || 507 })
    }
    console.error('Erro no upload:', error)
    return NextResponse.json({ error: `Erro: ${error.message}` }, { status: 500 })
  }
}
