// Shared watermark placement helpers (node + browser friendly).

const LEGACY_ANCHORS = {
  center: 'center',
  centre: 'center',
  northeast: 'top-right',
  northwest: 'top-left',
  southeast: 'bottom-right',
  southwest: 'bottom-left',
}

const ANCHOR_MAP = {
  'top-left': { x: 'left', y: 'top' },
  'top': { x: 'center', y: 'top' },
  'top-right': { x: 'right', y: 'top' },
  'center-left': { x: 'left', y: 'center' },
  'center': { x: 'center', y: 'center' },
  'center-right': { x: 'right', y: 'center' },
  'bottom-left': { x: 'left', y: 'bottom' },
  'bottom': { x: 'center', y: 'bottom' },
  'bottom-right': { x: 'right', y: 'bottom' },
}

export const WATERMARK_DEFAULTS = {
  opacity: 0.45,
  anchor: 'center',
  sizeMode: 'proportional',
  offsetX: 0,
  offsetY: 0,
  scalePercent: 40,
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function normalizeAnchor(value) {
  const safe = String(value || '').toLowerCase().trim()
  if (ANCHOR_MAP[safe]) return safe
  if (LEGACY_ANCHORS[safe]) return LEGACY_ANCHORS[safe]
  if (safe === 'north' || safe === 'top') return 'top'
  if (safe === 'south' || safe === 'bottom') return 'bottom'
  if (safe === 'east' || safe === 'right') return 'center-right'
  if (safe === 'west' || safe === 'left') return 'center-left'
  return 'center'
}

export function normalizeSizeMode(value) {
  const safe = String(value || '').toLowerCase().trim()
  if (['proportional', 'proporcional', 'fit', 'ajustar', 'fill', 'preencher'].includes(safe)) return safe
  return 'proportional'
}

export function clampOffset(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return clamp(n, -10, 10)
}

export function clampScalePercent(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return WATERMARK_DEFAULTS.scalePercent
  return clamp(n, 5, 200)
}

function anchorToAlignment(anchor) {
  return ANCHOR_MAP[anchor] || ANCHOR_MAP.center
}

export function computeWatermarkBox({
  imageWidth,
  imageHeight,
  watermarkWidth,
  watermarkHeight,
  sizeMode = WATERMARK_DEFAULTS.sizeMode,
  anchor = WATERMARK_DEFAULTS.anchor,
  offsetX = 0,
  offsetY = 0,
  scalePercent = WATERMARK_DEFAULTS.scalePercent,
} = {}) {
  const width = Math.max(1, Number(imageWidth) || 1)
  const height = Math.max(1, Number(imageHeight) || 1)
  const minSide = Math.min(width, height)
  const padding = minSide * 0.03
  const resolvedAnchor = normalizeAnchor(anchor)
  const resolvedSizeMode = normalizeSizeMode(sizeMode)
  const resolvedOffsetX = clampOffset(offsetX)
  const resolvedOffsetY = clampOffset(offsetY)
  const resolvedScalePercent = clampScalePercent(scalePercent)

  const baseW = Math.max(1, Number(watermarkWidth) || minSide)
  const baseH = Math.max(1, Number(watermarkHeight) || minSide * 0.36)

  let finalW
  let finalH
  let fitMode = 'contain'

  if (resolvedSizeMode === 'proportional') {
    const targetMax = (resolvedScalePercent / 100) * minSide
    const scale = clamp(targetMax / Math.max(baseW, baseH), 0.05, 8)
    finalW = baseW * scale
    finalH = baseH * scale
  } else if (resolvedSizeMode === 'fit') {
    const innerWidth = Math.max(1, width - padding * 2)
    const innerHeight = Math.max(1, height - padding * 2)
    const scale = Math.min(innerWidth / baseW, innerHeight / baseH)
    finalW = baseW * scale
    finalH = baseH * scale
  } else if (resolvedSizeMode === 'fill') {
    const scale = Math.max(width / baseW, height / baseH)
    finalW = baseW * scale
    finalH = baseH * scale
    fitMode = 'cover'
  } else {
    finalW = baseW
    finalH = baseH
  }

  const { x, y } = anchorToAlignment(resolvedAnchor)

  let left
  if (x === 'left') left = resolvedSizeMode === 'fill' ? 0 : padding
  else if (x === 'right') left = resolvedSizeMode === 'fill' ? width - finalW : width - finalW - padding
  else left = (width - finalW) / 2

  let top
  if (y === 'top') top = resolvedSizeMode === 'fill' ? 0 : padding
  else if (y === 'bottom') top = resolvedSizeMode === 'fill' ? height - finalH : height - finalH - padding
  else top = (height - finalH) / 2

  const offsetFactor = minSide * 0.02
  left += resolvedOffsetX * offsetFactor
  top += resolvedOffsetY * offsetFactor

  if (resolvedSizeMode !== 'fill') {
    left = clamp(left, 0, Math.max(0, width - finalW))
    top = clamp(top, 0, Math.max(0, height - finalH))
  }

  return {
    anchor: resolvedAnchor,
    sizeMode: resolvedSizeMode,
    offsetX: resolvedOffsetX,
    offsetY: resolvedOffsetY,
    scalePercent: resolvedScalePercent,
    width: finalW,
    height: finalH,
    left,
    top,
    fitMode,
  }
}
