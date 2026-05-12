// tests/cupons.test.js
// src/lib/cupons.js — validação e cálculo de desconto.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock do fs para evitar I/O real (cupons.js usa fs.readFileSync)
let mockCupons = []
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: {
      ...(actual.default || {}),
      existsSync: () => true,
      readFileSync: () => JSON.stringify(mockCupons),
      writeFileSync: () => {},
      mkdirSync: () => {},
    },
    existsSync: () => true,
    readFileSync: () => JSON.stringify(mockCupons),
    writeFileSync: () => {},
    mkdirSync: () => {},
  }
})

import {
  normalizarCodigo,
  calcularDescontoCupom,
  validarCupom,
} from '@/lib/cupons'

beforeEach(() => { mockCupons = [] })

describe('normalizarCodigo', () => {
  it('uppercase + trim + sem espaços', () => {
    expect(normalizarCodigo('  promo10 ')).toBe('PROMO10')
    expect(normalizarCodigo('feliz natal')).toBe('FELIZNATAL')
    expect(normalizarCodigo('Black-Friday')).toBe('BLACK-FRIDAY')
  })

  it('lida com input inválido', () => {
    expect(normalizarCodigo(null)).toBe('')
    expect(normalizarCodigo('')).toBe('')
  })
})

describe('calcularDescontoCupom — percentual', () => {
  it('aplica % sobre subtotal de itens', () => {
    const cupom = { tipo: 'percentual', valor: 10 }
    const items = [{ price: 100 }, { price: 50 }]
    const r = calcularDescontoCupom(cupom, { items })
    expect(r.subtotalAplicavel).toBe(150)
    expect(r.desconto).toBe(15)
  })

  it('respeita escopo de álbuns (não inclui itens fora do escopo)', () => {
    const cupom = { tipo: 'percentual', valor: 20, albuns: ['evento-A'] }
    const items = [
      { eventId: 'evento-A', price: 100 },
      { eventId: 'evento-B', price: 200 },  // fora do escopo
    ]
    const r = calcularDescontoCupom(cupom, { items })
    expect(r.subtotalAplicavel).toBe(100)
    expect(r.desconto).toBe(20)
  })

  it('respeita escopo de mídia (foto vs vídeo)', () => {
    const cupom = { tipo: 'percentual', valor: 50, escopoMidias: 'foto' }
    const items = [
      { mediaType: 'photo', price: 100 },
      { mediaType: 'video', price: 200 }, // ignorado
    ]
    const r = calcularDescontoCupom(cupom, { items })
    expect(r.subtotalAplicavel).toBe(100)
    expect(r.desconto).toBe(50)
  })
})

describe('calcularDescontoCupom — fixo', () => {
  it('aplica valor fixo limitado ao subtotal', () => {
    const cupom = { tipo: 'fixo', valor: 30 }
    const items = [{ price: 100 }]
    expect(calcularDescontoCupom(cupom, { items }).desconto).toBe(30)
  })

  it('limita desconto fixo ao subtotal disponível', () => {
    const cupom = { tipo: 'fixo', valor: 200 }
    const items = [{ price: 50 }]
    expect(calcularDescontoCupom(cupom, { items }).desconto).toBe(50) // não vai além do subtotal
  })
})

describe('calcularDescontoCupom — tiers', () => {
  it('aplica tier por subtotal', () => {
    const cupom = {
      tipo: 'percentual', valor: 5,
      tiersAtivos: true, tiersTipo: 'subtotal',
      tiers: [{ min: 0, valor: 5 }, { min: 100, valor: 10 }, { min: 300, valor: 20 }],
    }
    const items = [{ price: 150 }]
    const r = calcularDescontoCupom(cupom, { items })
    expect(r.valorEfetivo).toBe(10) // bateu na faixa min=100
    expect(r.desconto).toBe(15)
  })

  it('aplica tier por quantidade', () => {
    const cupom = {
      tipo: 'percentual', valor: 5,
      tiersAtivos: true, tiersTipo: 'quantidade',
      tiers: [{ min: 0, valor: 5 }, { min: 5, valor: 15 }],
    }
    const items = Array.from({ length: 6 }, () => ({ price: 50 }))
    const r = calcularDescontoCupom(cupom, { items })
    expect(r.valorEfetivo).toBe(15) // 6 itens — bateu min=5
    expect(r.desconto).toBe(45) // 15% de 300
  })
})

describe('validarCupom', () => {
  it('rejeita código inexistente', () => {
    mockCupons = []
    const r = validarCupom({ codigo: 'X', items: [{ price: 100 }] })
    expect(r.valido).toBe(false)
    expect(r.code).toBe('not_found')
  })

  it('rejeita cupom suspenso', () => {
    mockCupons = [{ id: 'c1', codigo: 'PROMO', tipo: 'percentual', valor: 10, ativo: false }]
    const r = validarCupom({ codigo: 'PROMO', items: [{ price: 100 }] })
    expect(r.valido).toBe(false)
    expect(r.code).toBe('suspenso')
  })

  it('rejeita cupom expirado', () => {
    mockCupons = [{
      id: 'c1', codigo: 'PROMO', tipo: 'percentual', valor: 10, ativo: true,
      validoAte: '2020-01-01T00:00:00Z',
    }]
    const r = validarCupom({ codigo: 'PROMO', items: [{ price: 100 }] })
    expect(r.valido).toBe(false)
    expect(r.code).toBe('expirado')
  })

  it('rejeita por subtotal mínimo', () => {
    mockCupons = [{
      id: 'c1', codigo: 'PROMO', tipo: 'percentual', valor: 10, ativo: true,
      minSubtotal: 200,
    }]
    const r = validarCupom({ codigo: 'PROMO', items: [{ price: 100 }] })
    expect(r.valido).toBe(false)
    expect(r.code).toBe('min_subtotal')
  })

  it('rejeita por quantidade mínima', () => {
    mockCupons = [{
      id: 'c1', codigo: 'PROMO', tipo: 'percentual', valor: 10, ativo: true,
      minQuantidade: 3,
    }]
    const r = validarCupom({ codigo: 'PROMO', items: [{ price: 100 }] })
    expect(r.valido).toBe(false)
    expect(r.code).toBe('min_quantidade')
  })

  it('aceita cupom válido com desconto > 0', () => {
    mockCupons = [{ id: 'c1', codigo: 'PROMO', tipo: 'percentual', valor: 20, ativo: true }]
    const r = validarCupom({ codigo: 'PROMO', items: [{ price: 100 }] })
    expect(r.valido).toBe(true)
    expect(r.desconto).toBe(20)
  })

  it('aceita códigos com case diferente (PROMO == promo)', () => {
    mockCupons = [{ id: 'c1', codigo: 'PROMO', tipo: 'percentual', valor: 20, ativo: true }]
    expect(validarCupom({ codigo: 'promo', items: [{ price: 100 }] }).valido).toBe(true)
    expect(validarCupom({ codigo: ' Promo ', items: [{ price: 100 }] }).valido).toBe(true)
  })
})
