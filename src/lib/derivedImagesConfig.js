const DEFAULT_DERIVATIVES = {
  grid: { maxSize: 1600, quality: 60 },
  thumbs: { size: 300, quality: 40 },
  mini: { size: 90, quality: 45 },
  covers: { width: 400, quality: 78 },
}

const DEFAULT_WATERMARK_VARIANTS = {
  grid: { enabled: false },
  thumbs: { enabled: false },
  mini: { enabled: false },
  covers: { enabled: false },
  // Vídeos: WM sempre habilitada por padrão. Se não houver asset específico,
  // o resolver usa watermarks/video.png ou cai para a WM principal das fotos.
  video: { enabled: true },
}

const DEFAULT_WATERMARK_PLACEMENT = {
  watermarkSizeMode: 'proportional',
  watermarkAnchor: 'center',
  watermarkOffsetX: 0,
  watermarkOffsetY: 0,
  watermarkScalePercent: 40,
}

const DEFAULT_UPLOAD_OPTIMIZATION = {
  preserveOriginal: true,
  maxLongSide: 6000,
  jpgQuality: 86,
  targetMaxMb: null,
}

function clampNumber(value, fallback, { min = null, max = null } = {}) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  if (min !== null && numeric < min) return fallback
  if (max !== null && numeric > max) return fallback
  return numeric
}

function clampOptionalNumber(value, fallback, { min = null, max = null } = {}) {
  if (value === null || value === undefined || value === '') return fallback
  return clampNumber(value, fallback, { min, max })
}

function normalizePosition(value) {
  const safe = String(value || '').trim().toLowerCase()
  if (['center', 'southeast', 'southwest', 'northeast', 'northwest'].includes(safe)) return safe
  return normalizeAnchor(safe)
}

function normalizeAnchor(value) {
  const safe = String(value || '').trim().toLowerCase()
  if (['top-left', 'top', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom', 'bottom-right'].includes(safe)) return safe
  if (safe === 'southeast') return 'bottom-right'
  if (safe === 'southwest') return 'bottom-left'
  if (safe === 'northeast') return 'top-right'
  if (safe === 'northwest') return 'top-left'
  if (safe === 'north') return 'top'
  if (safe === 'south') return 'bottom'
  return 'center'
}

function normalizeSizeMode(value) {
  const safe = String(value || '').trim().toLowerCase()
  if (['proportional', 'proporcional'].includes(safe)) return 'proportional'
  if (['ajustar', 'fit'].includes(safe)) return 'fit'
  if (['preencher', 'fill'].includes(safe)) return 'fill'
  return 'proportional'
}

export function getDefaultDerivativeConfig() {
  return {
    watermarkAsset: null,
    watermarkOpacity: 0.45,
    watermarkPosition: 'center',
    watermarkAnchor: 'center',
    watermarkSizeMode: 'proportional',
    watermarkOffsetX: 0,
    watermarkOffsetY: 0,
    watermarkScalePercent: 40,
    derivatives: {
      grid: { ...DEFAULT_DERIVATIVES.grid },
      thumbs: { ...DEFAULT_DERIVATIVES.thumbs },
      mini: { ...DEFAULT_DERIVATIVES.mini },
      covers: { ...DEFAULT_DERIVATIVES.covers },
    },
    watermarkVariants: {
      grid: { ...DEFAULT_WATERMARK_VARIANTS.grid },
      thumbs: { ...DEFAULT_WATERMARK_VARIANTS.thumbs },
      mini: { ...DEFAULT_WATERMARK_VARIANTS.mini },
      covers: { ...DEFAULT_WATERMARK_VARIANTS.covers },
      video: { ...DEFAULT_WATERMARK_VARIANTS.video },
    },
    uploadOptimization: { ...DEFAULT_UPLOAD_OPTIMIZATION },
    ...DEFAULT_WATERMARK_PLACEMENT,
  }
}

export function normalizeDerivativeConfig(rawConfig = {}) {
  const defaults = getDefaultDerivativeConfig()
  const rawDerivatives = rawConfig?.derivatives || {}
  const rawWatermarkVariants = rawConfig?.watermarkVariants || {}

  const derivatives = {
    grid: {
      maxSize: clampNumber(rawDerivatives?.grid?.maxSize ?? rawConfig?.wmSize, defaults.derivatives.grid.maxSize, { min: 256, max: 6000 }),
      quality: clampNumber(rawDerivatives?.grid?.quality ?? rawConfig?.wmQuality, defaults.derivatives.grid.quality, { min: 10, max: 100 }),
    },
    thumbs: {
      size: clampNumber(rawDerivatives?.thumbs?.size ?? rawConfig?.thumbSize, defaults.derivatives.thumbs.size, { min: 64, max: 2000 }),
      quality: clampNumber(rawDerivatives?.thumbs?.quality ?? rawConfig?.thumbQuality, defaults.derivatives.thumbs.quality, { min: 10, max: 100 }),
    },
    mini: {
      size: clampNumber(rawDerivatives?.mini?.size ?? rawConfig?.miniSize, defaults.derivatives.mini.size, { min: 32, max: 600 }),
      quality: clampNumber(rawDerivatives?.mini?.quality ?? rawConfig?.miniQuality, defaults.derivatives.mini.quality, { min: 10, max: 100 }),
    },
    covers: {
      width: clampNumber(rawDerivatives?.covers?.width ?? rawConfig?.coverSize, defaults.derivatives.covers.width, { min: 120, max: 3000 }),
      quality: clampNumber(rawDerivatives?.covers?.quality ?? rawConfig?.coverQuality, defaults.derivatives.covers.quality, { min: 10, max: 100 }),
    },
  }

  const watermarkVariants = {
    grid: {
      enabled: Boolean(rawWatermarkVariants?.grid?.enabled),
      asset: rawWatermarkVariants?.grid?.asset || null,
    },
    thumbs: {
      enabled: Boolean(rawWatermarkVariants?.thumbs?.enabled),
      asset: rawWatermarkVariants?.thumbs?.asset || null,
    },
    mini: {
      enabled: Boolean(rawWatermarkVariants?.mini?.enabled),
      asset: rawWatermarkVariants?.mini?.asset || null,
    },
    covers: {
      enabled: Boolean(rawWatermarkVariants?.covers?.enabled),
      asset: rawWatermarkVariants?.covers?.asset || null,
    },
    // Para vídeos o default é enabled=true; admin pode desligar setando false.
    video: {
      enabled: rawWatermarkVariants?.video?.enabled === false ? false : true,
      asset: rawWatermarkVariants?.video?.asset || null,
    },
  }

  const normalizedAnchor = normalizeAnchor(rawConfig?.watermarkAnchor ?? rawConfig?.watermarkPosition)
  const normalizedSizeMode = normalizeSizeMode(rawConfig?.watermarkSizeMode)
  const normalizedOffsetX = clampNumber(rawConfig?.watermarkOffsetX, defaults.watermarkOffsetX, { min: -10, max: 10 })
  const normalizedOffsetY = clampNumber(rawConfig?.watermarkOffsetY, defaults.watermarkOffsetY, { min: -10, max: 10 })
  const normalizedScalePercent = clampNumber(rawConfig?.watermarkScalePercent, defaults.watermarkScalePercent, { min: 5, max: 200 })
  const rawUploadOptimization = rawConfig?.uploadOptimization || {}
  const targetMaxMb = clampOptionalNumber(
    rawUploadOptimization?.targetMaxMb,
    defaults.uploadOptimization.targetMaxMb,
    { min: 1, max: 80 }
  )

  const uploadOptimization = {
    preserveOriginal: rawUploadOptimization?.preserveOriginal !== false,
    maxLongSide: clampOptionalNumber(
      rawUploadOptimization?.maxLongSide,
      defaults.uploadOptimization.maxLongSide,
      { min: 1200, max: 12000 }
    ),
    jpgQuality: clampNumber(
      rawUploadOptimization?.jpgQuality,
      defaults.uploadOptimization.jpgQuality,
      { min: 45, max: 95 }
    ),
    targetMaxMb,
  }

  return {
    ...rawConfig,
    watermarkAsset: rawConfig?.watermarkAsset || null,
    watermarkOpacity: clampNumber(rawConfig?.watermarkOpacity, defaults.watermarkOpacity, { min: 0, max: 1 }),
    watermarkPosition: normalizePosition(rawConfig?.watermarkPosition),
    watermarkAnchor: normalizedAnchor,
    watermarkSizeMode: normalizedSizeMode,
    watermarkOffsetX: normalizedOffsetX,
    watermarkOffsetY: normalizedOffsetY,
    watermarkScalePercent: normalizedScalePercent,
    derivatives,
    watermarkVariants,
    wmSize: derivatives.grid.maxSize,
    wmQuality: derivatives.grid.quality,
    thumbSize: derivatives.thumbs.size,
    thumbQuality: derivatives.thumbs.quality,
    miniSize: derivatives.mini.size,
    miniQuality: derivatives.mini.quality,
    coverSize: derivatives.covers.width,
    coverQuality: derivatives.covers.quality,
    uploadOptimization,
  }
}

export function getUploadOptimizationRuntimeConfig(rawConfig = {}) {
  return normalizeDerivativeConfig(rawConfig).uploadOptimization
}

export function getDerivativeRuntimeConfig(rawConfig = {}) {
  const normalized = normalizeDerivativeConfig(rawConfig)
  return {
    opacity: normalized.watermarkOpacity,
    position: normalized.watermarkPosition,
    anchor: normalized.watermarkAnchor,
    sizeMode: normalized.watermarkSizeMode,
    offsetX: normalized.watermarkOffsetX,
    offsetY: normalized.watermarkOffsetY,
    scalePercent: normalized.watermarkScalePercent,
    gridMaxSize: normalized.derivatives.grid.maxSize,
    gridQuality: normalized.derivatives.grid.quality,
    thumbSize: normalized.derivatives.thumbs.size,
    thumbQuality: normalized.derivatives.thumbs.quality,
    miniSize: normalized.derivatives.mini.size,
    miniQuality: normalized.derivatives.mini.quality,
    coverWidth: normalized.derivatives.covers.width,
    coverQuality: normalized.derivatives.covers.quality,
    watermarkAsset: normalized.watermarkAsset,
    watermarkVariants: normalized.watermarkVariants,
    derivatives: normalized.derivatives,
  }
}
