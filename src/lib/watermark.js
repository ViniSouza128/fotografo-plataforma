import fs from 'fs'
import path from 'path'
import { normalizeDerivativeConfig } from './derivedImagesConfig'
import { DATA_DIR, PROJECT_ROOT, UPLOADS_DIR, ensureRuntimeDirs } from './runtimePaths'

const LEGACY_PUBLIC_DIR = path.join(PROJECT_ROOT, 'public')
const GLOBAL_WATERMARK_PATH = path.join(UPLOADS_DIR, 'watermark.png')
const LEGACY_GLOBAL_WATERMARK_PATH = path.join(LEGACY_PUBLIC_DIR, 'watermark.png')
const VARIANT_WATERMARKS_DIR = path.join(UPLOADS_DIR, 'watermarks')
const LEGACY_VARIANT_WATERMARKS_DIR = path.join(LEGACY_PUBLIC_DIR, 'watermarks')
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
    ensureRuntimeDirs()
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
  ensureRuntimeDirs()
  if (!fs.existsSync(VARIANT_WATERMARKS_DIR)) fs.mkdirSync(VARIANT_WATERMARKS_DIR, { recursive: true })
}

function toPngFilename(name) {
  if (!name) return null
  const safe = path.basename(String(name)).replace(/[^a-zA-Z0-9._-]/g, '')
  if (!safe) return null
  return safe.toLowerCase().endsWith('.png') ? safe.toLowerCase() : `${safe.toLowerCase()}.png`
}

function getRuntimeWatermarkAbsolutePath(variant = 'global') {
  if (variant === 'global' || variant === 'watermark.png') return GLOBAL_WATERMARK_PATH
  return path.join(VARIANT_WATERMARKS_DIR, toPngFilename(variant.replace('.png', '')))
}

function getLegacyWatermarkAbsolutePath(variant = 'global') {
  if (variant === 'global' || variant === 'watermark.png') return LEGACY_GLOBAL_WATERMARK_PATH
  return path.join(LEGACY_VARIANT_WATERMARKS_DIR, toPngFilename(variant.replace('.png', '')))
}

function getRuntimeWatermarkPublicUrl(variant = 'global', stamp = null) {
  const suffix = stamp ? `?v=${stamp}` : ''
  if (variant === 'global' || variant === 'watermark.png') return `/uploads/watermark.png${suffix}`
  return `/uploads/watermarks/${toPngFilename(variant.replace('.png', ''))}${suffix}`
}

function getLegacyWatermarkPublicUrl(variant = 'global', stamp = null) {
  const suffix = stamp ? `?v=${stamp}` : ''
  if (variant === 'global' || variant === 'watermark.png') return `/watermark.png${suffix}`
  return `/watermarks/${toPngFilename(variant.replace('.png', ''))}${suffix}`
}

export function getWatermarkAbsolutePath(variant = 'global') {
  const runtimePath = getRuntimeWatermarkAbsolutePath(variant)
  if (fs.existsSync(runtimePath)) return runtimePath

  const legacyPath = getLegacyWatermarkAbsolutePath(variant)
  if (fs.existsSync(legacyPath)) return legacyPath

  return runtimePath
}

export function getWatermarkPublicUrl(variant = 'global') {
  const runtimePath = getRuntimeWatermarkAbsolutePath(variant)
  if (fs.existsSync(runtimePath)) {
    return getRuntimeWatermarkPublicUrl(variant, fs.statSync(runtimePath).mtimeMs)
  }

  const legacyPath = getLegacyWatermarkAbsolutePath(variant)
  const stamp = fs.existsSync(legacyPath) ? fs.statSync(legacyPath).mtimeMs : Date.now()
  return fs.existsSync(legacyPath)
    ? getLegacyWatermarkPublicUrl(variant, stamp)
    : getRuntimeWatermarkPublicUrl(variant, stamp)
}

export function watermarkExists(variant = 'global') {
  return fs.existsSync(getWatermarkAbsolutePath(variant))
}

export function saveWatermark(buffer, variant = 'global') {
  ensureVariantDir()
  fs.writeFileSync(getRuntimeWatermarkAbsolutePath(variant), buffer)
}

export function deleteWatermark(variant = 'global') {
  if (variant === 'global') return
  for (const target of [getRuntimeWatermarkAbsolutePath(variant), getLegacyWatermarkAbsolutePath(variant)]) {
    if (fs.existsSync(target)) fs.unlinkSync(target)
  }
}

export function listWatermarkAssets() {
  ensureVariantDir()

  const assetsMeta = readAssetsMeta()
  const entries = []
  const globalPath = getWatermarkAbsolutePath('global')
  if (fs.existsSync(globalPath)) {
    const meta = fs.statSync(globalPath)
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

  const seen = new Set(['watermark.png'])
  const sources = [
    { dir: VARIANT_WATERMARKS_DIR, legacy: false },
    { dir: LEGACY_VARIANT_WATERMARKS_DIR, legacy: true },
  ]
  for (const source of sources) {
    if (!fs.existsSync(source.dir)) continue
    const files = fs.readdirSync(source.dir, { withFileTypes: true })
    for (const file of files) {
      if (!file.isFile()) continue
      if (!file.name.toLowerCase().endsWith('.png')) continue
      if (seen.has(file.name)) continue
      seen.add(file.name)
      const full = path.join(source.dir, file.name)
      const meta = fs.statSync(full)
      entries.push({
        id: file.name,
        name: file.name.replace(/\.png$/i, ''),
        url: source.legacy ? `/watermarks/${file.name}?v=${meta.mtimeMs}` : `/uploads/watermarks/${file.name}?v=${meta.mtimeMs}`,
        filename: file.name,
        updatedAt: meta.mtimeMs,
        reserved: RESERVED_VARIANTS.has(file.name),
        orientation: normalizeOrientation(assetsMeta[file.name]?.orientation),
      })
    }
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
    url: `/uploads/watermarks/${targetName}?v=${meta.mtimeMs}`,
    updatedAt: meta.mtimeMs,
    orientation: finalOrientation,
  }
}

export function removeWatermarkAsset(id) {
  const filename = toPngFilename(id)
  if (!filename) return false
  if (filename === 'watermark.png') return false
  if (RESERVED_VARIANTS.has(filename)) return false
  const runtimeTarget = path.join(VARIANT_WATERMARKS_DIR, filename)
  const legacyTarget = path.join(LEGACY_VARIANT_WATERMARKS_DIR, filename)
  const target = fs.existsSync(runtimeTarget) ? runtimeTarget : legacyTarget
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
  if (filename === 'watermark.png') return getWatermarkAbsolutePath('global')
  const runtimeCandidate = path.join(VARIANT_WATERMARKS_DIR, filename)
  if (fs.existsSync(runtimeCandidate)) return runtimeCandidate
  const legacyCandidate = path.join(LEGACY_VARIANT_WATERMARKS_DIR, filename)
  return fs.existsSync(legacyCandidate) ? legacyCandidate : null
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
  const globalPath = getWatermarkAbsolutePath('global')
  return fs.existsSync(globalPath) ? globalPath : null
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

  const globalPath = getWatermarkAbsolutePath('global')
  return fs.existsSync(globalPath) ? globalPath : null
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
