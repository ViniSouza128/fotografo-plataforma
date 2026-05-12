// src/lib/jobsBootstrap.js
// Inicialização única do worker de jobs em segundo plano.
//
// - Registra processadores: photo-derivatives, video-poster, video-preview-wm
// - Limpa MP4 com upload incompleto (.partial) ao iniciar
// - Reseta jobs travados em "processing" para "pending"
// - Inicia o worker (lazy: só processa quando há jobs)
//
// Importe `ensureJobsBootstrapped()` em qualquer rota de API que precise da
// fila estar ativa (ex.: /api/upload, /api/upload-video, /api/photos, /api/videos).

import fs from 'fs'
import path from 'path'
import { bootstrapJobsQueue, registerJobProcessor } from './jobsQueue'

const ROOT = process.cwd()
const PRIVATE_ORIGINALS_DIR = path.join(ROOT, 'storage', 'originals')

let _initialized = false

function discardPartialUploads() {
  // Vasculha storage/originals/<eventId>/videos/*.partial e remove.
  if (!fs.existsSync(PRIVATE_ORIGINALS_DIR)) return 0
  let removed = 0
  let buckets = []
  try { buckets = fs.readdirSync(PRIVATE_ORIGINALS_DIR, { withFileTypes: true }) }
  catch { return 0 }

  for (const entry of buckets) {
    if (!entry.isDirectory()) continue
    const videosDir = path.join(PRIVATE_ORIGINALS_DIR, entry.name, 'videos')
    if (!fs.existsSync(videosDir)) continue
    let files = []
    try { files = fs.readdirSync(videosDir) } catch { continue }
    for (const name of files) {
      if (!name.endsWith('.partial')) continue
      try {
        fs.unlinkSync(path.join(videosDir, name))
        removed += 1
      } catch {}
    }
  }
  if (removed > 0) {
    console.log(`[jobsBootstrap] removidos ${removed} arquivo(s) .partial de upload incompleto`)
  }
  return removed
}

async function processPhotoDerivatives(job) {
  const { readPhotos } = await import('./photos')
  const { readEvents } = await import('./events')
  const { readConfig } = await import('./config')
  const { mergeWatermarkConfig } = await import('./watermark')
  const { renderPhotoBuffers } = await import('./derivedImagesRenderer')
  const {
    getDerivedAbsolutePath,
    resolveOriginalPath,
    sanitizeStoredFilename,
  } = await import('./imageStorage')

  const photoId = job.payload?.photoId
  if (!photoId) throw new Error('photoId ausente no payload')

  const photos = readPhotos()
  const photo = photos.find(p => p.id === photoId)
  if (!photo) throw new Error(`foto ${photoId} não encontrada`)

  const safeFilename = sanitizeStoredFilename(photo.filename)
  if (!safeFilename) throw new Error(`filename inválido em ${photoId}`)

  const originalPath = resolveOriginalPath(photo)
  if (!originalPath || !fs.existsSync(originalPath)) {
    throw new Error(`original ausente: ${photo.filename}`)
  }

  const events = readEvents()
  const event = events.find(e => e.id === photo.eventId) || null
  const cfg = mergeWatermarkConfig(readConfig(), event)
  const author = photo.author || 'Vinicius Rodrigues'

  const buffers = await renderPhotoBuffers(originalPath, cfg, author)

  const eventId = photo.eventId || null
  const targets = [
    [getDerivedAbsolutePath({ kind: 'grid', watermark: 'wm', filename: safeFilename, eventId }), buffers.grid.wm],
    [getDerivedAbsolutePath({ kind: 'grid', watermark: 'clean', filename: safeFilename, eventId }), buffers.grid.clean],
    [getDerivedAbsolutePath({ kind: 'thumbs', watermark: 'wm', filename: safeFilename, eventId }), buffers.thumbs.wm],
    [getDerivedAbsolutePath({ kind: 'thumbs', watermark: 'clean', filename: safeFilename, eventId }), buffers.thumbs.clean],
    [getDerivedAbsolutePath({ kind: 'mini', watermark: 'wm', filename: safeFilename, eventId }), buffers.mini.wm],
    [getDerivedAbsolutePath({ kind: 'mini', watermark: 'clean', filename: safeFilename, eventId }), buffers.mini.clean],
  ]
  await Promise.all(
    targets
      .filter(([p]) => !!p)
      .map(([p, buf]) => fs.promises.writeFile(p, buf))
  )
}

async function processVideoPoster(job) {
  const {
    findVideoById,
    getVideoOriginalAbsolutePath,
    getVideoPosterAbsolutePath,
    getVideoPosterRelativeUrl,
    updateVideo,
  } = await import('./videos')
  const { readEvents } = await import('./events')
  const { readConfig } = await import('./config')
  const { mergeWatermarkConfig } = await import('./watermark')
  const { renderVideoPosterBuffers } = await import('./derivedImagesRenderer')
  const { extractVideoFrameBuffer } = await import('./videoProcessing')

  const videoId = job.payload?.videoId
  if (!videoId) throw new Error('videoId ausente')
  const video = findVideoById(videoId)
  if (!video) throw new Error(`video ${videoId} não encontrado`)

  const originalAbs = getVideoOriginalAbsolutePath({ eventId: video.eventId, filename: video.filename })
  if (!originalAbs || !fs.existsSync(originalAbs)) {
    throw new Error(`original do vídeo ausente: ${video.filename}`)
  }

  const event = readEvents().find(e => e.id === video.eventId) || null
  const cfg = mergeWatermarkConfig(readConfig(), event)

  // Tenta usar o poster clean já enviado pelo admin como fonte; senão extrai frame.
  let sourceBuffer = null
  const cleanAbs = getVideoPosterAbsolutePath({ filename: video.filename, kind: 'clean' })
  if (cleanAbs && fs.existsSync(cleanAbs)) {
    try { sourceBuffer = await fs.promises.readFile(cleanAbs) } catch {}
  }
  if (!sourceBuffer) {
    try { sourceBuffer = await extractVideoFrameBuffer(originalAbs, 1.0) }
    catch {
      try { sourceBuffer = await extractVideoFrameBuffer(originalAbs, 0) } catch {}
    }
  }
  if (!sourceBuffer) throw new Error('não foi possível obter frame do vídeo')

  const wmAbs = getVideoPosterAbsolutePath({ filename: video.filename, kind: 'wm' })
  const { clean, wm } = await renderVideoPosterBuffers(sourceBuffer, cfg)
  if (cleanAbs) await fs.promises.writeFile(cleanAbs, clean)
  if (wmAbs) await fs.promises.writeFile(wmAbs, wm)

  const stamp = Date.now()
  const posterClean = `${getVideoPosterRelativeUrl({ filename: video.filename, kind: 'clean' })}?v=${stamp}`
  const posterWm = `${getVideoPosterRelativeUrl({ filename: video.filename, kind: 'wm' })}?v=${stamp}`
  updateVideo(video.id, { posterClean, posterWm })
}

async function processVideoPreviewWm(job) {
  const {
    findVideoById,
    getVideoOriginalAbsolutePath,
    getVideoPreviewWmFilename,
    getVideoPreviewWmAbsolutePath,
    updateVideo,
  } = await import('./videos')
  const { readEvents } = await import('./events')
  const { readConfig } = await import('./config')
  const { mergeWatermarkConfig, getVideoWatermarkPath } = await import('./watermark')
  const { generateWatermarkedPreview } = await import('./videoProcessing')

  const videoId = job.payload?.videoId
  if (!videoId) throw new Error('videoId ausente')
  const video = findVideoById(videoId)
  if (!video) throw new Error(`video ${videoId} não encontrado`)

  const originalAbs = getVideoOriginalAbsolutePath({ eventId: video.eventId, filename: video.filename })
  if (!originalAbs || !fs.existsSync(originalAbs)) {
    throw new Error(`original do vídeo ausente: ${video.filename}`)
  }

  const event = readEvents().find(e => e.id === video.eventId) || null
  const cfg = mergeWatermarkConfig(readConfig(), event)

  updateVideo(video.id, { previewWmStatus: 'processing' })
  try {
    const wmName = getVideoPreviewWmFilename(video.filename)
    const wmAbs = getVideoPreviewWmAbsolutePath({ eventId: video.eventId, filename: wmName })
    const wmText = `PREVIEW · ${(event?.name || 'ALBUM').toUpperCase()}`
    const videoWmPath = getVideoWatermarkPath(cfg)
    await generateWatermarkedPreview(originalAbs, wmAbs, {
      text: wmText,
      watermarkImagePath: videoWmPath,
      watermarkConfig: cfg,
    })
    updateVideo(video.id, { previewWmFilename: wmName, previewWmStatus: 'ready' })
  } catch (err) {
    updateVideo(video.id, {
      previewWmStatus: 'failed',
      previewWmError: String(err?.message || err).slice(0, 400),
    })
    throw err
  }
}

export function ensureJobsBootstrapped() {
  if (_initialized) return
  _initialized = true
  try {
    discardPartialUploads()
  } catch (err) {
    console.error('[jobsBootstrap] discardPartialUploads error:', err)
  }
  registerJobProcessor('photo-derivatives', processPhotoDerivatives)
  registerJobProcessor('video-poster', processVideoPoster)
  registerJobProcessor('video-preview-wm', processVideoPreviewWm)
  bootstrapJobsQueue()
}
