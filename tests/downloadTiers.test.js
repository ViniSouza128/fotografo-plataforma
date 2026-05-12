// tests/downloadTiers.test.js
// src/lib/downloadTiersDefaults.js — funções puras de tiers (P37).

import { describe, it, expect } from 'vitest'
import {
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
} from '@/lib/downloadTiersDefaults'

describe('DEFAULT_TIERS_CONFIG', () => {
  it('tem 3 tiers (social, web, full)', () => {
    expect(DEFAULT_TIERS_CONFIG.tiers).toHaveLength(3)
    const ids = DEFAULT_TIERS_CONFIG.tiers.map(t => t.id)
    expect(ids).toEqual(['social', 'web', 'full'])
  })

  it('tem 4 presets (whatsapp, ig_post, ig_story, facebook)', () => {
    expect(DEFAULT_TIERS_CONFIG.presets.length).toBeGreaterThanOrEqual(4)
  })

  it('default ativo=false', () => {
    expect(DEFAULT_TIERS_CONFIG.ativo).toBe(false)
  })
})

describe('normalizeTiersConfig', () => {
  it('aplica defaults para input vazio', () => {
    const r = normalizeTiersConfig({})
    expect(r.tiers).toHaveLength(3)
    expect(r.presets.length).toBeGreaterThan(0)
  })

  it('ordena tiers por ordem ASC', () => {
    const r = normalizeTiersConfig({
      tiers: [
        { id: 'c', label: 'C', ordem: 3, multiplier: 1 },
        { id: 'a', label: 'A', ordem: 1, multiplier: 0.5 },
        { id: 'b', label: 'B', ordem: 2, multiplier: 0.8 },
      ],
    })
    expect(r.tiers.map(t => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('valida defaultTier — cai pro primeiro tier se id inválido', () => {
    const r = normalizeTiersConfig({
      defaultTier: 'inexistente',
      tiers: [{ id: 'social', label: 'Social', multiplier: 1, ordem: 1 }],
    })
    expect(r.defaultTier).toBe('social')
  })
})

describe('validateTiersConfig', () => {
  it('passa para configuração válida', () => {
    const r = validateTiersConfig({
      tiers: [{ id: 'web', label: 'Web', multiplier: 0.8, ordem: 1 }],
    })
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('falha se não tem tiers', () => {
    const r = validateTiersConfig({ tiers: [] })
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/pelo menos um tier/i)
  })

  it('flagga ids duplicados', () => {
    const r = validateTiersConfig({
      tiers: [
        { id: 'web', label: 'A', multiplier: 1, ordem: 1 },
        { id: 'web', label: 'B', multiplier: 0.5, ordem: 2 },
      ],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => /duplicado/i.test(e))).toBe(true)
  })

  it('exige multiplier ou fixedPrice em cada tier', () => {
    const r = validateTiersConfig({
      tiers: [{ id: 'web', label: 'Web', ordem: 1 }],  // nenhum dos dois
    })
    expect(r.ok).toBe(false)
  })

  it('flagga multiplier fora de [0, 10]', () => {
    const r = validateTiersConfig({
      tiers: [{ id: 'x', label: 'X', multiplier: 50, ordem: 1 }],
    })
    expect(r.ok).toBe(false)
  })
})

describe('getPriceForTier', () => {
  it('aplica multiplier ao preço base', () => {
    expect(getPriceForTier(100, { multiplier: 0.5 })).toBe(50)
    expect(getPriceForTier(100, { multiplier: 0.8 })).toBe(80)
    expect(getPriceForTier(100, { multiplier: 1 })).toBe(100)
  })

  it('fixedPrice sobrepõe multiplier', () => {
    expect(getPriceForTier(100, { multiplier: 1, fixedPrice: 25 })).toBe(25)
  })

  it('arredonda 2 casas', () => {
    expect(getPriceForTier(33.333, { multiplier: 0.5 })).toBe(16.67)
  })

  it('nunca retorna negativo', () => {
    expect(getPriceForTier(-50, { multiplier: 1 })).toBe(0)
    expect(getPriceForTier(100, { fixedPrice: -10 })).toBe(0)
  })
})

describe('isTierEligibleForPhoto', () => {
  it('tier sem minOriginalLongSide é sempre elegível', () => {
    expect(isTierEligibleForPhoto({ minOriginalLongSide: null }, { originalWidth: 100, originalHeight: 100 })).toBe(true)
    expect(isTierEligibleForPhoto({}, { originalWidth: 50 })).toBe(true)
  })

  it('foto deve ter long side >= mínimo', () => {
    const tier = { minOriginalLongSide: 2400 }
    expect(isTierEligibleForPhoto(tier, { originalWidth: 3000, originalHeight: 2000 })).toBe(true)
    expect(isTierEligibleForPhoto(tier, { originalWidth: 1500, originalHeight: 1000 })).toBe(false)
    expect(isTierEligibleForPhoto(tier, { originalWidth: 2000, originalHeight: 2400 })).toBe(true)
  })

  it('foto sem dimensões falha em tier com mínimo', () => {
    expect(isTierEligibleForPhoto({ minOriginalLongSide: 2400 }, {})).toBe(false)
  })
})

describe('getMaxPurchasedTier', () => {
  const cfg = {
    defaultTier: 'web',
    tiers: [
      { id: 'social', ordem: 1 },
      { id: 'web', ordem: 2 },
      { id: 'full', ordem: 3 },
    ],
  }

  it('null se nenhum item da foto', () => {
    expect(getMaxPurchasedTier({ pedidoItens: [], photoId: 'p1', cfg })).toBeNull()
    expect(getMaxPurchasedTier({ pedidoItens: [{ photoId: 'p2', tier: 'web' }], photoId: 'p1', cfg })).toBeNull()
  })

  it('retorna o tier de maior ordem comprado', () => {
    const items = [
      { photoId: 'p1', tier: 'social' },
      { photoId: 'p1', tier: 'web' },
    ]
    const max = getMaxPurchasedTier({ pedidoItens: items, photoId: 'p1', cfg })
    expect(max.id).toBe('web')
  })

  it('ignora itens de vídeo', () => {
    const items = [{ photoId: 'p1', tier: 'full', mediaType: 'video' }]
    expect(getMaxPurchasedTier({ pedidoItens: items, photoId: 'p1', cfg })).toBeNull()
  })

  it('cai no defaultTier se item não tem tier explícito', () => {
    const items = [{ photoId: 'p1' }]  // sem tier
    const r = getMaxPurchasedTier({ pedidoItens: items, photoId: 'p1', cfg })
    expect(r.id).toBe('web')   // defaultTier
  })
})

describe('getIncludedTierIds', () => {
  const cfg = {
    tiers: [
      { id: 'social', ordem: 1 },
      { id: 'web', ordem: 2 },
      { id: 'full', ordem: 3 },
    ],
  }

  it('comprou full → tem direito a todos', () => {
    expect(getIncludedTierIds(cfg, { ordem: 3 })).toEqual(['social', 'web', 'full'])
  })

  it('comprou web → tem direito a social + web', () => {
    expect(getIncludedTierIds(cfg, { ordem: 2 })).toEqual(['social', 'web'])
  })

  it('comprou social → só social', () => {
    expect(getIncludedTierIds(cfg, { ordem: 1 })).toEqual(['social'])
  })
})

describe('findTier / findPreset', () => {
  const cfg = DEFAULT_TIERS_CONFIG
  it('findTier por id', () => {
    expect(findTier(cfg, 'web')?.id).toBe('web')
    expect(findTier(cfg, 'inexistente')).toBeNull()
  })
  it('findPreset por id', () => {
    expect(findPreset(cfg, 'whatsapp')?.id).toBe('whatsapp')
    expect(findPreset(cfg, 'inexistente')).toBeNull()
  })
})

describe('buildSizedFilename', () => {
  it('inclui sufixo do tier', () => {
    expect(buildSizedFilename({ originalName: 'corrida-001.jpg', tier: { id: 'web' } })).toBe('corrida-001__web.jpg')
  })

  it('inclui sufixo do preset (preset tem precedência sobre tier)', () => {
    expect(buildSizedFilename({ originalName: 'foto.jpg', tier: { id: 'web' }, preset: { id: 'whatsapp' } }))
      .toBe('foto__whatsapp.jpg')
  })

  it('sanitiza caracteres inválidos', () => {
    expect(buildSizedFilename({ originalName: 'foto com espaço & cedilha.JPG', tier: { id: 'web' } }))
      .toMatch(/^foto_com_espa_o___cedilha__web\.jpg$/i)
  })

  it('fallback se sem originalName', () => {
    expect(buildSizedFilename({ photoId: 'abc-123', tier: { id: 'social' } })).toBe('foto-abc-123__social.jpg')
  })
})
