import fs from 'fs'
import path from 'path'
import { normalizeDerivativeConfig } from './derivedImagesConfig'

const PUBLIC_DIR = path.join(process.cwd(), 'public')
const DATA_DIR = path.join(process.cwd(), 'data')
const GLOBAL_WATERMARK_PATH = path.join(PUBLIC_DIR, 'watermark.png')
const VARIANT_WATERMARKS_DIR = path.join(PUBLIC_DIR, 'watermarks')
const ASSETS_META_PATH = path.join(DATA_DIR, 'watermark_assets.json')
const WATERMARK_VARIANTS = ['global', 'grid', 'thumbs', 'mini', 'covers', 'video']
const RESERVED_VARIANTS = new Set(['grid.png', 'thumbs.png', 'mini.png', 'covers.png'])
const VALID_ORIENTATIONS = new Set(['horizontal', 'vertical', 'video', 'any'])

function readAssetsMeta() {
  try {
    if (!fs.existsSync(ASSETS_META_PATH)) return {}
    const raw = fs.readFileSync(ASSETS_META_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object') ? parsed : {}
  } catch {
    return {}
  }
}

function writeAssetsMeta(meta) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(ASSETS_META_PATH, JSON.stringify(meta, null, 2), 'utf-8')
  } catch {
    // best-effort
  }
}

function normalizeOrientation(value) {
  const safe = String(value || '').trim().toLowerCase()
  return VALID_ORIENTATIONS.has(safe) ? safe : 'any'
}

export function setAssetOrientation(id, orientation) {
  if (!id) return null
  const meta = readAssetsMeta()
  const normalized = normalizeOrientation(orientation)
  meta[id] = { ...(meta[id] || {}), orientation: normalized }
  writeAssetsMeta(meta)
  return normalized
}

export function getAssetOrientation(id) {
  const meta = readAssetsMeta()
  return normalizeOrientation(meta?.[id]?.orientation)
}

function ensureVariantDir() {
  if (!fs.existsSync(VARIANT_WATERMARKS_DIR)) fs.mkdirSync(VARIANT_WATERMARKS_DIR, { recursive: true })
}

function toPngFilename(name) {
  if (!name) return null
  const safe = path.basename(String(name)).replace(/[^a-zA-Z0-9._-]/g, '')
  if (!safe) return null
  return safe.toLowerCase().endsWith('.png') ? safe.toLowerCase() : `${safe.toLowerCase()}.png`
}

export function getWatermarkAbsolutePath(variant = 'global') {
  if (variant === 'global' || variant === 'watermark.png') return GLOBAL_WATERMARK_PATH
  return path.join(VARIANT_WATERMARKS_DIR, toPngFilename(variant.replace('.png', '')))
}

export function getWatermarkPublicUrl(variant = 'global') {
  const stamp = fs.existsSync(getWatermarkAbsolutePath(variant))
    ? fs.statSync(getWatermarkAbsolutePath(variant)).mtimeMs
    : Date.now()
  if (variant === 'global' || variant === 'watermark.png') return `/watermark.png?v=${stamp}`
  return `/watermarks/${toPngFilename(variant.replace('.png', ''))}?v=${stamp}`
}

export function watermarkExists(variant = 'global') {
  return fs.existsSync(getWatermarkAbsolutePath(variant))
}

export function saveWatermark(buffer, variant = 'global') {
  ensureVariantDir()
  fs.writeFileSync(getWatermarkAbsolutePath(variant), buffer)
}

export function deleteWatermark(variant = 'global') {
  const target = getWatermarkAbsolutePath(variant)
  if (variant === 'global') return
  if (fs.existsSync(target)) fs.unlinkSync(target)
}

export function listWatermarkAssets() {
  ensureVariantDir()

  const assetsMeta = readAssetsMeta()
  const entries = []
  if (fs.existsSync(GLOBAL_WATERMARK_PATH)) {
    const meta = fs.statSync(GLOBAL_WATERMARK_PATH)
    entries.push({
      id: 'watermark.png',
      name: 'Padrão global',
      url: getWatermarkPublicUrl('global'),
      filename: 'watermark.png',
      updatedAt: meta.mtimeMs,
      reserved: true,
      orientation: normalizeOrientation(assetsMeta['watermark.png']?.orientation),
    })
  }

  const files = fs.readdirSync(VARIANT_WATERMARKS_DIR, { withFileTypes: true })
  for (const file of files) {
    if (!file.isFile()) continue
    if (!file.name.toLowerCase().endsWith('.png')) continue
    const full = path.join(VARIANT_WATERMARKS_DIR, file.name)
    const meta = fs.statSync(full)
    entries.push({
      id: file.name,
      name: file.name.replace(/\.png$/i, ''),
      url: `/watermarks/${file.name}?v=${meta.mtimeMs}`,
      filename: file.name,
      updatedAt: meta.mtimeMs,
      reserved: RESERVED_VARIANTS.has(file.name),
      orientation: normalizeOrientation(assetsMeta[file.name]?.orientation),
    })
  }

  // Order by update time desc then name
  entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.name.localeCompare(b.name))
  return entries
}

export function listWatermarks() {
  const payload = {}
  for (const variant of WATERMARK_VARIANTS) {
    const exists = watermarkExists(variant)
    payload[variant] = {
      exists,
      url: exists ? getWatermarkPublicUrl(variant) : null,
    }
  }

  return {
    variants: payload,
    assets: listWatermarkAssets(),
  }
}

export function saveWatermarkAsset(buffer, desiredName = null, orientation = null) {
  ensureVariantDir()
  const baseName = toPngFilename(desiredName) || `wm_${Date.now().toString(36)}.png`
  let targetName = baseName
  let counter = 1
  while (fs.existsSync(path.join(VARIANT_WATERMARKS_DIR, targetName))) {
    const suffix = `-${counter}`
    targetName = baseName.replace(/\.png$/i, `${suffix}.png`)
    counter += 1
  }
  const target = path.join(VARIANT_WATERMARKS_DIR, targetName)
  fs.writeFileSync(target, buffer)
  const meta = fs.statSync(target)
  const finalOrientation = setAssetOrientation(targetName, orientation)
  return {
    id: targetName,
    filename: targetName,
    url: `/watermarks/${targetName}?v=${meta.mtimeMs}`,
    updatedAt: meta.mtimeMs,
    orientation: finalOrientation,
  }
}

export function removeWatermarkAsset(id) {
  const filename = toPngFilename(id)
  if (!filename) return false
  if (filename === 'watermark.png') return false
  if (RESERVED_VARIANTS.has(filename)) return false
  const target = path.join(VARIANT_WATERMARKS_DIR, filename)
  if (!fs.existsSync(target)) return false
  fs.unlinkSync(target)
  // Cleanup metadata
  const meta = readAssetsMeta()
  if (meta[filename]) {
    delete meta[filename]
    writeAssetsMeta(meta)
  }
  return true
}

export function resolveWatermarkAssetPath(assetName) {
  const filename = toPngFilename(assetName)
  if (!filename) return null
  if (filename === 'watermark.png') return GLOBAL_WATERMARK_PATH
  const candidate = path.join(VARIANT_WATERMARKS_DIR, filename)
  return fs.existsSync(candidate) ? candidate : null
}

export function getActiveWatermarkPath(config, variant = 'grid') {
  const normalized = normalizeDerivativeConfig(config || {})
  const variantCfg = normalized.watermarkVariants?.[variant] || {}

  // 1) Specific variant asset if enabled
  if (variant !== 'global' && variantCfg.enabled) {
    const variantAsset = variantCfg.asset || null
    const pathFromAsset = resolveWatermarkAssetPath(variantAsset || `${variant}.png`)
    if (pathFromAsset) return pathFromAsset

    const overridePath = getWatermarkAbsolutePath(variant)
    if (fs.existsSync(overridePath)) return overridePath
  }

  // 2) Global asset (configurable)
  const assetPath = resolveWatermarkAssetPath(normalized.watermarkAsset || null)
  if (assetPath) return assetPath

  // 3) Legacy global fallback
  return fs.existsSync(GLOBAL_WATERMARK_PATH) ? GLOBAL_WATERMARK_PATH : null
}

// Watermark dedicada para vídeos (miniatura, capa e overlay no MP4 via ffmpeg).
// Tenta nesta ordem:
//   1) asset configurado em watermarkVariants.video (se enabled e asset definido)
//   2) public/watermarks/video.png (PNG dedicado de vídeo)
//   3) asset global configurado em watermarkAsset
//   4) public/watermark.png (legado)
// Retorna null se nenhuma WM existir.
export function getVideoWatermarkPath(config) {
  const normalized = normalizeDerivativeConfig(config || {})
  const variantCfg = normalized.watermarkVariants?.video || {}

  if (variantCfg.enabled !== false) {
    if (variantCfg.asset) {
      const fromAsset = resolveWatermarkAssetPath(variantCfg.asset)
      if (fromAsset) return fromAsset
    }
    const dedicated = getWatermarkAbsolutePath('video')
    if (fs.existsSync(dedicated)) return dedicated
  }

  const globalAsset = resolveWatermarkAssetPath(normalized.watermarkAsset || null)
  if (globalAsset) return globalAsset

  return fs.existsSync(GLOBAL_WATERMARK_PATH) ? GLOBAL_WATERMARK_PATH : null
}

export function mergeWatermarkConfig(globalConfig, event = null) {
  const base = normalizeDerivativeConfig(globalConfig || {})
  if (!event?.watermarkOverride) return base

  const mergedVariants = {
    ...base.watermarkVariants,
    ...(event?.watermarkConfig?.watermarkVariants || {}),
  }

  return normalizeDerivativeConfig({
    ...base,
    ...(event?.watermarkConfig || {}),
    watermarkAsset: event?.watermarkAsset || base.watermarkAsset || null,
    watermarkVariants: mergedVariants,
  })
}
