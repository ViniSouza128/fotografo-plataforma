// src/lib/downloadTiersDefaults.js
// Constantes e helpers puros (client-safe) — sem 'fs'/'sharp'.
// Carregado tanto em código server quanto em componentes client.

export const DEFAULT_TIERS_CONFIG = {
  ativo: false,
  defaultTier: 'web',
  tiers: [
    { id: 'social', label: 'Social',   maxLongSide: 1080, multiplier: 0.5, fixedPrice: null, ordem: 1, minOriginalLongSide: null },
    { id: 'web',    label: 'Web',      maxLongSide: 1920, multiplier: 0.8, fixedPrice: null, ordem: 2, minOriginalLongSide: null },
    { id: 'full',   label: 'Original', maxLongSide: null, multiplier: 1.0, fixedPrice: null, ordem: 3, minOriginalLongSide: 2400 },
  ],
  presets: [
    { id: 'whatsapp', label: 'WhatsApp',         mode: 'fit',  maxLongSide: 1280, quality: 80 },
    { id: 'ig_post',  label: 'Instagram Post',   mode: 'cover', width: 1080, height: 1350, quality: 85 },
    { id: 'ig_story', label: 'Instagram Story',  mode: 'cover', width: 1080, height: 1920, quality: 85 },
    { id: 'facebook', label: 'Facebook',         mode: 'cover', width: 1200, height: 630,  quality: 85 },
  ],
}

export function normalizeTiersConfig(raw) {
  if (!raw || typeof raw !== 'object') return JSON.parse(JSON.stringify(DEFAULT_TIERS_CONFIG))
  const tiers = Array.isArray(raw.tiers) && raw.tiers.length > 0
    ? raw.tiers
        .map(t => ({
          id: String(t.id || '').trim() || 'tier',
          label: String(t.label || t.id || '').trim() || String(t.id || 'tier'),
          maxLongSide: Number.isFinite(Number(t.maxLongSide)) ? Number(t.maxLongSide) : null,
          multiplier: Number.isFinite(Number(t.multiplier)) ? Number(t.multiplier) : 1,
          fixedPrice: Number.isFinite(Number(t.fixedPrice)) ? Number(t.fixedPrice) : null,
          ordem: Number.isFinite(Number(t.ordem)) ? Number(t.ordem) : 0,
          minOriginalLongSide: Number.isFinite(Number(t.minOriginalLongSide)) ? Number(t.minOriginalLongSide) : null,
        }))
        .sort((a, b) => a.ordem - b.ordem)
    : JSON.parse(JSON.stringify(DEFAULT_TIERS_CONFIG.tiers))
  const presets = Array.isArray(raw.presets) && raw.presets.length > 0
    ? raw.presets.map(p => ({
        id: String(p.id || '').trim() || 'preset',
        label: String(p.label || p.id || '').trim(),
        mode: p.mode === 'cover' ? 'cover' : 'fit',
        maxLongSide: Number.isFinite(Number(p.maxLongSide)) ? Number(p.maxLongSide) : null,
        width: Number.isFinite(Number(p.width)) ? Number(p.width) : null,
        height: Number.isFinite(Number(p.height)) ? Number(p.height) : null,
        quality: Number.isFinite(Number(p.quality)) ? Math.max(50, Math.min(95, Number(p.quality))) : 85,
      }))
    : JSON.parse(JSON.stringify(DEFAULT_TIERS_CONFIG.presets))
  const defaultTier = tiers.find(t => t.id === raw.defaultTier)?.id || tiers[0]?.id || 'web'
  return { ativo: !!raw.ativo, defaultTier, tiers, presets }
}

export function validateTiersConfig(input) {
  const errors = []
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['Configuração inválida.'] }
  }
  if (!Array.isArray(input.tiers) || input.tiers.length === 0) {
    errors.push('É necessário pelo menos um tier.')
  } else {
    const ids = new Set()
    input.tiers.forEach((t, i) => {
      if (!t.id || typeof t.id !== 'string') errors.push(`Tier #${i + 1}: id obrigatório.`)
      else if (ids.has(t.id)) errors.push(`Tier #${i + 1}: id duplicado "${t.id}".`)
      else ids.add(t.id)
      const mult = Number(t.multiplier)
      const fixed = Number(t.fixedPrice)
      if (!Number.isFinite(mult) && !Number.isFinite(fixed)) {
        errors.push(`Tier "${t.id}": informe multiplier ou fixedPrice.`)
      }
      if (Number.isFinite(mult) && (mult < 0 || mult > 10)) {
        errors.push(`Tier "${t.id}": multiplier fora de [0, 10].`)
      }
      if (Number.isFinite(fixed) && (fixed < 0 || fixed > 10000)) {
        errors.push(`Tier "${t.id}": fixedPrice fora de [0, 10000].`)
      }
    })
  }
  if (input.presets && !Array.isArray(input.presets)) errors.push('Presets deve ser um array.')
  return { ok: errors.length === 0, errors }
}

function round2(v) { return Math.round(Number(v || 0) * 100) / 100 }

export function getPriceForTier(basePrice, tier) {
  if (!tier) return Number(basePrice) || 0
  if (Number.isFinite(Number(tier.fixedPrice))) return round2(Math.max(0, Number(tier.fixedPrice)))
  const mult = Number.isFinite(Number(tier.multiplier)) ? Number(tier.multiplier) : 1
  return round2(Math.max(0, Number(basePrice || 0) * mult))
}

export function findTier(cfg, tierId) {
  if (!cfg) return null
  return cfg.tiers.find(t => t.id === tierId) || null
}

export function findPreset(cfg, presetId) {
  if (!cfg) return null
  return cfg.presets.find(p => p.id === presetId) || null
}

export function isTierEligibleForPhoto(tier, photo) {
  if (!tier) return false
  const min = Number(tier.minOriginalLongSide)
  if (!Number.isFinite(min) || min <= 0) return true
  const longSide = Math.max(Number(photo?.originalWidth) || 0, Number(photo?.originalHeight) || 0)
  return longSide >= min
}

export function getMaxPurchasedTier({ pedidoItens, photoId, cfg }) {
  if (!Array.isArray(pedidoItens) || !cfg) return null
  let best = null
  for (const item of pedidoItens) {
    const itemPhotoId = item?.photoId || item?.id
    if (itemPhotoId !== photoId) continue
    if (item.mediaType === 'video') continue
    const tierId = item.tier || cfg.defaultTier
    const tier = findTier(cfg, tierId)
    if (!tier) continue
    if (!best || tier.ordem > best.ordem) best = tier
  }
  return best
}

export function getIncludedTierIds(cfg, purchasedTier) {
  if (!cfg || !purchasedTier) return []
  return cfg.tiers
    .filter(t => t.ordem <= purchasedTier.ordem)
    .map(t => t.id)
}

export function buildSizedFilename({ originalName, photoId, tier, preset }) {
  const base = String(originalName || `foto-${photoId}` || 'foto').replace(/\.[^/.]+$/, '')
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_')
  if (preset) return `${safe}__${preset.id}.jpg`
  if (tier) return `${safe}__${tier.id}.jpg`
  return `${safe}.jpg`
}
