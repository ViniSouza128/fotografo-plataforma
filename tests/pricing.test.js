// tests/pricing.test.js
// src/lib/pricing.js — desconto progressivo, simulação de tabela, detecção de incoerências.

import { describe, it, expect } from 'vitest'
import {
  resolveEventDiscountConfig,
  buildPedidoPricing,
  computeProgressiveTotals,
  computeProgressiveTotalsWithContext,
  simulateProgressiveTable,
  detectIncoherentTiers,
  nextTierSuggestion,
} from '@/lib/pricing'

describe('resolveEventDiscountConfig', () => {
  it('usa override do evento quando usarDescontosGlobais é falso', () => {
    const ev = {
      usarDescontosGlobais: false,
      descontosProgressivos: [{ quantidade: 5, desconto: 10 }],
      descontosProgressivosAtivos: true,
    }
    const r = resolveEventDiscountConfig(ev, { descontosGlobais: [{ quantidade: 10, desconto: 20 }], descontosGlobaisAtivos: true })
    expect(r.origem).toBe('evento')
    expect(r.table).toHaveLength(1)
    expect(r.table[0].desconto).toBe(10)
  })

  it('usa global quando usarDescontosGlobais é true e config global tem dados', () => {
    const ev = { usarDescontosGlobais: true, descontosProgressivos: [], descontosProgressivosAtivos: false }
    const r = resolveEventDiscountConfig(ev, { descontosGlobais: [{ quantidade: 10, desconto: 20 }], descontosGlobaisAtivos: true })
    expect(r.origem).toBe('global')
    expect(r.table[0].desconto).toBe(20)
    expect(r.ativos).toBe(true)
  })

  it('retorna lista vazia quando descontos não estão ativos', () => {
    const ev = { descontosProgressivos: [{ quantidade: 5, desconto: 10 }], descontosProgressivosAtivos: false }
    const r = resolveEventDiscountConfig(ev)
    expect(r.table).toHaveLength(0)
  })

  it('lida com evento null retornando config global', () => {
    const r = resolveEventDiscountConfig(null, { descontosGlobais: [{ quantidade: 3, desconto: 5 }], descontosGlobaisAtivos: true })
    expect(r.origem).toBe('global')
    expect(r.table[0].desconto).toBe(5)
  })
})

describe('buildPedidoPricing', () => {
  it('soma o subtotal corretamente a partir dos itens', () => {
    const pedido = {
      itens: [
        { price: 50, priceComDesconto: 45 },
        { price: 30, priceComDesconto: 27 },
      ],
      total: 72,
    }
    const r = buildPedidoPricing(pedido)
    expect(r.subtotal).toBe(80)
    expect(r.totalSemTaxas).toBe(72)
    expect(r.descontoValor).toBe(8)
    expect(r.totalFinal).toBe(72)
  })

  it('inclui taxa de parcelamento no totalFinal default', () => {
    const pedido = {
      itens: [{ price: 100 }],
      taxaParcelamento: 5.5,
    }
    const r = buildPedidoPricing(pedido)
    expect(r.subtotal).toBe(100)
    expect(r.taxaParcelamento).toBe(5.5)
    expect(r.totalFinal).toBe(105.5)
  })

  it('aceita pedido sem itens', () => {
    expect(buildPedidoPricing({}).subtotal).toBe(0)
    expect(buildPedidoPricing({ itens: [] }).subtotal).toBe(0)
  })
})

describe('computeProgressiveTotalsWithContext', () => {
  const events = {
    'ev1': {
      id: 'ev1',
      descontosProgressivos: [
        { quantidade: 3, desconto: 10 },
        { quantidade: 5, desconto: 20 },
        { quantidade: 10, desconto: 30 },
      ],
      descontosProgressivosAtivos: true,
    },
  }

  it('sem itens devolve subtotal 0', () => {
    const r = computeProgressiveTotalsWithContext([], { eventsById: events })
    expect(r.subtotal).toBe(0)
    expect(r.total).toBe(0)
    expect(r.descontoTotal).toBe(0)
  })

  it('aplica primeira faixa (3+ fotos = 10%)', () => {
    const itens = [
      { eventId: 'ev1', price: 50 },
      { eventId: 'ev1', price: 50 },
      { eventId: 'ev1', price: 50 },
    ]
    const r = computeProgressiveTotalsWithContext(itens, { eventsById: events })
    expect(r.subtotal).toBe(150)
    expect(r.descontoTotal).toBe(15)
    expect(r.total).toBe(135)
    expect(r.appliedPctByEvent.ev1).toBe(10)
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0].pct).toBe(10)
  })

  it('aplica faixa maior (5+ = 20%)', () => {
    const itens = Array.from({ length: 5 }, () => ({ eventId: 'ev1', price: 100 }))
    const r = computeProgressiveTotalsWithContext(itens, { eventsById: events })
    expect(r.subtotal).toBe(500)
    expect(r.descontoTotal).toBe(100)
    expect(r.appliedPctByEvent.ev1).toBe(20)
  })

  it('soma compras anteriores na quantidade', () => {
    const itens = [{ eventId: 'ev1', price: 100 }] // só 1 nova
    const r = computeProgressiveTotalsWithContext(itens, {
      eventsById: events,
      previousPaidByEvent: { ev1: 4 }, // já tinha 4 → 5 totais → 20%
    })
    // subtotal só do que está no carrinho atual
    expect(r.subtotal).toBe(100)
    expect(r.appliedPctByEvent.ev1).toBe(20)
  })

  it('agrupa por evento separadamente', () => {
    const itens = [
      { eventId: 'ev1', price: 50 },
      { eventId: 'ev1', price: 50 },
      { eventId: 'ev1', price: 50 },
      { eventId: 'ev2', price: 50 }, // sem config → sem desconto
    ]
    const r = computeProgressiveTotalsWithContext(itens, { eventsById: events })
    expect(r.appliedPctByEvent.ev1).toBe(10)
    expect(r.appliedPctByEvent.ev2 || 0).toBe(0)
    expect(r.descontoTotal).toBe(15)
  })

  it('itens grátis não contam no qty mas contam no subtotal', () => {
    const itens = [
      { eventId: 'ev1', price: 0 }, // grátis
      { eventId: 'ev1', price: 50 },
      { eventId: 'ev1', price: 50 },
      { eventId: 'ev1', price: 50 },
    ]
    const r = computeProgressiveTotalsWithContext(itens, { eventsById: events, ignoreFreeInCount: true })
    // 3 pagas → 10% desconto sobre 150
    expect(r.appliedPctByEvent.ev1).toBe(10)
    expect(r.descontoTotal).toBe(15)
  })

  it('preserva itensComDesconto com priceComDesconto correto', () => {
    const itens = [
      { eventId: 'ev1', price: 100 },
      { eventId: 'ev1', price: 100 },
      { eventId: 'ev1', price: 100 },
    ]
    const r = computeProgressiveTotalsWithContext(itens, { eventsById: events })
    for (const item of r.itensComDesconto) {
      expect(item.descontoPct).toBe(10)
      expect(item.priceComDesconto).toBe(90)
      expect(item.priceOriginal).toBe(100)
    }
  })
})

describe('simulateProgressiveTable', () => {
  it('gera as N linhas e respeita as faixas configuradas', () => {
    const tabela = [
      { quantidade: 3, desconto: 5 },
      { quantidade: 5, desconto: 10 },
      { quantidade: 10, desconto: 20 },
    ]
    const rows = simulateProgressiveTable({ precoBase: 100, tabela, ativos: true, maxQty: 12 })
    expect(rows).toHaveLength(12)
    expect(rows[0].qty).toBe(1)
    expect(rows[0].pct).toBe(0)
    expect(rows[2].pct).toBe(5)  // 3 fotos
    expect(rows[4].pct).toBe(10) // 5 fotos
    expect(rows[9].pct).toBe(20) // 10 fotos
    // unit price decresce com a faixa
    expect(rows[9].unit).toBeLessThan(rows[0].unit)
  })

  it('alerta monotonicidade quando salto de desconto faz total cair', () => {
    // Caso clássico: 9 itens com 10% (810) → 10 itens com 20% (800). Total caiu.
    const tabela = [{ quantidade: 5, desconto: 10 }, { quantidade: 10, desconto: 20 }]
    const rows = simulateProgressiveTable({ precoBase: 100, tabela, ativos: true, maxQty: 12 })
    const warned = rows.filter(r => r.warn === 'monotonicidade')
    expect(warned.length).toBeGreaterThan(0)
  })

  it('quando ativos=false não aplica desconto algum', () => {
    const rows = simulateProgressiveTable({
      precoBase: 100,
      tabela: [{ quantidade: 3, desconto: 30 }],
      ativos: false,
      maxQty: 5,
    })
    expect(rows.every(r => r.pct === 0)).toBe(true)
  })
})

describe('detectIncoherentTiers', () => {
  it('flagga tier com desconto menor que o anterior', () => {
    const tabela = [
      { quantidade: 3, desconto: 30 },  // alto desconto na faixa baixa
      { quantidade: 5, desconto: 10 },  // ← deveria ser >= 30
    ]
    const flagged = detectIncoherentTiers({ precoBase: 100, tabela, ativos: true })
    expect(flagged.has(1)).toBe(true)
  })

  it('não flagga tabela coerente', () => {
    const tabela = [
      { quantidade: 3, desconto: 5 },
      { quantidade: 5, desconto: 10 },
      { quantidade: 10, desconto: 20 },
    ]
    const flagged = detectIncoherentTiers({ precoBase: 100, tabela, ativos: true })
    expect(flagged.size).toBe(0)
  })

  it('retorna Set vazio quando ativos=false', () => {
    const flagged = detectIncoherentTiers({ precoBase: 100, tabela: [{ quantidade: 5, desconto: 50 }], ativos: false })
    expect(flagged.size).toBe(0)
  })
})

describe('nextTierSuggestion', () => {
  const events = {
    ev1: {
      descontosProgressivos: [{ quantidade: 3, desconto: 10 }, { quantidade: 5, desconto: 20 }],
      descontosProgressivosAtivos: true,
    },
  }

  it('sugere próxima faixa quando quase lá', () => {
    const itens = [{ eventId: 'ev1', price: 50 }, { eventId: 'ev1', price: 50 }]
    const r = nextTierSuggestion({ items: itens, eventsById: events })
    expect(r).toBeTruthy()
  })
})

describe('computeProgressiveTotals (alias)', () => {
  it('é equivalente a computeProgressiveTotalsWithContext', () => {
    const itens = [{ eventId: 'ev1', price: 50 }]
    const a = computeProgressiveTotals(itens, { eventsById: { ev1: { descontosProgressivosAtivos: false } } })
    const b = computeProgressiveTotalsWithContext(itens, { eventsById: { ev1: { descontosProgressivosAtivos: false } } })
    expect(a).toEqual(b)
  })
})
