import sharp from 'sharp'
import { applyWatermarkToBuffer, applyLabelOverlayToBuffer } from './imageUtils'
import { getDerivativeRuntimeConfig } from './derivedImagesConfig'
import { getActiveWatermarkPath, getVideoWatermarkPath } from './watermark'

export function getDerivativeProcessingConfig(rawConfig) {
  const runtime = getDerivativeRuntimeConfig(rawConfig)
  return {
    ...runtime,
    watermarkPaths: {
      grid: getActiveWatermarkPath(rawConfig, 'grid'),
      thumbs: getActiveWatermarkPath(rawConfig, 'thumbs'),
      mini: getActiveWatermarkPath(rawConfig, 'mini'),
      covers: getActiveWatermarkPath(rawConfig, 'covers'),
      video: getVideoWatermarkPath(rawConfig),
    },
  }
}

export async function renderPhotoBuffers(originalPath, rawConfig, authorName = 'Vinicius Rodrigues', extras = {}) {
  const cfg = getDerivativeProcessingConfig(rawConfig)
  const overlay = extras?.overlay || null

  const gridCleanBuffer = await sharp(originalPath)
    .rotate()
    .resize({ width: cfg.gridMaxSize, height: cfg.gridMaxSize, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: cfg.gridQuality })
    .toBuffer()

  let gridWmBuffer = await applyWatermarkToBuffer(gridCleanBuffer, cfg.opacity, cfg.gridQuality, {
    authorName,
    position: cfg.position,
    anchor: cfg.anchor,
    sizeMode: cfg.sizeMode,
    offsetX: cfg.offsetX,
    offsetY: cfg.offsetY,
    scalePercent: cfg.scalePercent,
    watermarkPath: cfg.watermarkPaths.grid,
  })

  if (overlay) {
    gridWmBuffer = await applyLabelOverlayToBuffer(gridWmBuffer, {
      publicId: overlay.publicId,
      originalName: overlay.originalName,
      quality: cfg.gridQuality,
    })
  }

  const thumbCleanBuffer = await sharp(gridCleanBuffer)
    .resize(cfg.thumbSize, cfg.thumbSize, { fit: 'cover' })
    .jpeg({ quality: cfg.thumbQuality })
    .toBuffer()

  let thumbWmBuffer = await applyWatermarkToBuffer(thumbCleanBuffer, cfg.opacity, cfg.thumbQuality, {
    authorName,
    position: cfg.position,
    anchor: cfg.anchor,
    sizeMode: cfg.sizeMode,
    offsetX: cfg.offsetX,
    offsetY: cfg.offsetY,
    scalePercent: cfg.scalePercent,
    watermarkPath: cfg.watermarkPaths.thumbs,
  })

  if (overlay && overlay.publicId) {
    // Thumbs are square; only show the publicId to keep readability.
    thumbWmBuffer = await applyLabelOverlayToBuffer(thumbWmBuffer, {
      publicId: overlay.publicId,
      originalName: '',
      quality: cfg.thumbQuality,
    })
  }

  const miniCleanBuffer = await sharp(originalPath)
    .rotate()
    .resize(cfg.miniSize, cfg.miniSize, { fit: 'cover' })
    .jpeg({ quality: cfg.miniQuality })
    .toBuffer()

  const miniWmBuffer = await applyWatermarkToBuffer(miniCleanBuffer, cfg.opacity, cfg.miniQuality, {
    authorName,
    position: cfg.position,
    anchor: cfg.anchor,
    sizeMode: cfg.sizeMode,
    offsetX: cfg.offsetX,
    offsetY: cfg.offsetY,
    scalePercent: cfg.scalePercent,
    watermarkPath: cfg.watermarkPaths.mini,
  })

  return {
    cfg,
    grid: { clean: gridCleanBuffer, wm: gridWmBuffer },
    thumbs: { clean: thumbCleanBuffer, wm: thumbWmBuffer },
    mini: { clean: miniCleanBuffer, wm: miniWmBuffer },
  }
}

// Renderiza poster de vídeo (capa/miniatura) em duas variantes:
//   clean (sem WM) e wm (com a marca d'água de vídeo, ou fallback para a global)
//
// inputBuffer: Buffer com a imagem original (já decodificada, qualquer formato suportado por sharp)
// rawConfig: config global (com watermarkVariants merged via mergeWatermarkConfig já se for por evento)
//
// Retorna { clean: Buffer, wm: Buffer }. Ambos JPEG, otimizados, dimensão máxima 1280px.
export async function renderVideoPosterBuffers(inputBuffer, rawConfig) {
  const cfg = getDerivativeProcessingConfig(rawConfig)
  const POSTER_MAX_DIM = 1280
  const POSTER_QUALITY = 86

  const cleanBuffer = await sharp(inputBuffer)
    .rotate()
    .resize({
      width: POSTER_MAX_DIM,
      height: POSTER_MAX_DIM,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: POSTER_QUALITY, mozjpeg: true })
    .toBuffer()

  const wmBuffer = await applyWatermarkToBuffer(cleanBuffer, cfg.opacity, POSTER_QUALITY, {
    position: cfg.position,
    anchor: cfg.anchor,
    sizeMode: cfg.sizeMode,
    offsetX: cfg.offsetX,
    offsetY: cfg.offsetY,
    scalePercent: cfg.scalePercent,
    watermarkPath: cfg.watermarkPaths.video,
  })

  return {
    cfg,
    clean: cleanBuffer,
    wm: wmBuffer,
  }
}

export async function renderCoverBuffers(originalPath, rawConfig, authorName = 'Vinicius Rodrigues') {
  const cfg = getDerivativeProcessingConfig(rawConfig)

  const cleanBuffer = await sharp(originalPath)
    .rotate()
    .resize({ width: cfg.coverWidth, withoutEnlargement: true })
    .jpeg({ quality: cfg.coverQuality })
    .toBuffer()

  const wmBuffer = await applyWatermarkToBuffer(cleanBuffer, cfg.opacity, cfg.coverQuality, {
    authorName,
    position: cfg.position,
    anchor: cfg.anchor,
    sizeMode: cfg.sizeMode,
    offsetX: cfg.offsetX,
    offsetY: cfg.offsetY,
    scalePercent: cfg.scalePercent,
    watermarkPath: cfg.watermarkPaths.covers,
  })

  return {
    cfg,
    clean: cleanBuffer,
    wm: wmBuffer,
  }
}
