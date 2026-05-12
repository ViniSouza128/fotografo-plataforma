// src/lib/downloadTiers.js
// Lado servidor: lê config global, mescla com override de evento, expõe pipelines sharp.
// Re-exporta tudo de downloadTiersDefaults para uso server.

import { readConfig } from './config'

export {
  DEFAULT_TIERS_CONFIG,
  normalizeTiersConfig,
  validateTiersConfig,
  getPriceForTier,
  findTier,
  findPreset,
  isTierEligibleForPhoto,
  getMaxPurchasedTier,
  getIncludedTierIds,
  buildSizedFilename,
} from './downloadTiersDefaults'

import { normalizeTiersConfig as _normalize, DEFAULT_TIERS_CONFIG as _DEFAULTS } from './downloadTiersDefaults'

export function getGlobalTiersConfig() {
  let cfg
  try { cfg = readConfig() } catch { cfg = {} }
  const raw = cfg?.downloadTiers
  if (!raw || typeof raw !== 'object') return JSON.parse(JSON.stringify(_DEFAULTS))
  return _normalize(raw)
}

export function getEffectiveTiersConfig(event = null) {
  const global = getGlobalTiersConfig()
  if (!event?.downloadTiersOverride) return global
  const override = _normalize(event.downloadTiersOverride)
  if (event.downloadTiersOverride.ativo === undefined) {
    return { ...override, ativo: global.ativo }
  }
  return override
}

export function isTiersFeatureEnabled(event = null) {
  return getEffectiveTiersConfig(event).ativo === true
}

export function getTiersForPhoto(photo, event = null) {
  const cfg = getEffectiveTiersConfig(event)
  if (!cfg.ativo) return []
  const longSide = Math.max(Number(photo?.originalWidth) || 0, Number(photo?.originalHeight) || 0)
  return cfg.tiers.map(tier => {
    const eligible = tier.minOriginalLongSide
      ? longSide >= Number(tier.minOriginalLongSide)
      : true
    return { ...tier, eligible, originalLongSide: longSide || null }
  })
}

// Pipelines sharp (server-only)
export function applyPresetPipeline(sharpInstance, preset) {
  if (!preset) return sharpInstance
  let pipeline = sharpInstance.rotate()
  if (preset.mode === 'cover' && preset.width && preset.height) {
    pipeline = pipeline.resize({
      width: preset.width,
      height: preset.height,
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: false,
    })
  } else if (preset.maxLongSide) {
    pipeline = pipeline.resize({
      width: preset.maxLongSide,
      height: preset.maxLongSide,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }
  pipeline = pipeline.jpeg({ quality: preset.quality || 85, mozjpeg: true })
  return pipeline
}

export function applyTierPipeline(sharpInstance, tier) {
  if (!tier) return sharpInstance
  let pipeline = sharpInstance.rotate()
  if (tier.maxLongSide) {
    pipeline = pipeline.resize({
      width: tier.maxLongSide,
      height: tier.maxLongSide,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }
  pipeline = pipeline.jpeg({ quality: 92, mozjpeg: true })
  return pipeline
}
