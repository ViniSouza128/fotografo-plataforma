// tests/paymentGateways.test.js
// Testes do dispatcher de gateways e helpers de comerce — incluindo MP e PagSeguro (P+).

import { describe, it, expect } from 'vitest'
import {
  gatewaySupportsMethod,
  resolvePaymentGateways,
  getAvailablePaymentMethods,
  isStripePixEnabled,
} from '@/lib/commerceUtils'

describe('gatewaySupportsMethod', () => {
  it('manual aceita pix e cartão', () => {
    expect(gatewaySupportsMethod('manual', 'pix')).toBe(true)
    expect(gatewaySupportsMethod('manual', 'cartao')).toBe(true)
  })

  it('asaas (sandbox e produção) aceita pix e cartão', () => {
    expect(gatewaySupportsMethod('asaas_sandbox', 'pix')).toBe(true)
    expect(gatewaySupportsMethod('asaas_sandbox', 'cartao')).toBe(true)
    expect(gatewaySupportsMethod('asaas_producao', 'pix')).toBe(true)
    expect(gatewaySupportsMethod('asaas_producao', 'cartao')).toBe(true)
  })

  it('stripe aceita cartão sempre, pix só com flag', () => {
    expect(gatewaySupportsMethod('stripe', 'cartao')).toBe(true)
    expect(gatewaySupportsMethod('stripe', 'pix', { stripe: { pix_enabled: false } })).toBe(false)
    expect(gatewaySupportsMethod('stripe', 'pix', { stripe: { pix_enabled: true } })).toBe(true)
  })

  it('mercadopago (ambos) aceita pix e cartão', () => {
    expect(gatewaySupportsMethod('mercadopago_sandbox', 'pix')).toBe(true)
    expect(gatewaySupportsMethod('mercadopago_sandbox', 'cartao')).toBe(true)
    expect(gatewaySupportsMethod('mercadopago_producao', 'pix')).toBe(true)
    expect(gatewaySupportsMethod('mercadopago_producao', 'cartao')).toBe(true)
  })

  it('pagseguro (ambos) aceita pix e cartão', () => {
    expect(gatewaySupportsMethod('pagseguro_sandbox', 'pix')).toBe(true)
    expect(gatewaySupportsMethod('pagseguro_sandbox', 'cartao')).toBe(true)
    expect(gatewaySupportsMethod('pagseguro_producao', 'pix')).toBe(true)
    expect(gatewaySupportsMethod('pagseguro_producao', 'cartao')).toBe(true)
  })

  it('rejeita gateway desconhecido / vazio', () => {
    expect(gatewaySupportsMethod('paypal', 'pix')).toBe(false)
    expect(gatewaySupportsMethod('', 'pix')).toBe(false)
    expect(gatewaySupportsMethod(null, 'pix')).toBe(false)
  })
})

describe('resolvePaymentGateways', () => {
  it('escolhe primário válido sem precisar de fallback', () => {
    const cfg = { gateway_pix: 'mercadopago_producao', gateway_pix_fallback: 'asaas_producao' }
    const r = resolvePaymentGateways(cfg, 'pix')
    expect(r.effectivePrimary).toBe('mercadopago_producao')
    expect(r.effectiveFallback).toBe('asaas_producao')
    expect(r.hasSupportedGateway).toBe(true)
  })

  it('cai para fallback quando primário não suporta o método', () => {
    // Stripe sem pix_enabled não suporta pix. Deve cair pro fallback.
    const cfg = { gateway_pix: 'stripe', gateway_pix_fallback: 'asaas_producao', stripe: { pix_enabled: false } }
    const r = resolvePaymentGateways(cfg, 'pix')
    expect(r.effectivePrimary).toBe('asaas_producao')
  })

  it('aceita configurações com mp + pagseguro encadeadas', () => {
    const cfg = {
      gateway_pix: 'mercadopago_sandbox',
      gateway_pix_fallback: 'pagseguro_sandbox',
      gateway_cartao: 'pagseguro_producao',
      gateway_cartao_fallback: 'mercadopago_producao',
    }
    expect(resolvePaymentGateways(cfg, 'pix').effectivePrimary).toBe('mercadopago_sandbox')
    expect(resolvePaymentGateways(cfg, 'pix').effectiveFallback).toBe('pagseguro_sandbox')
    expect(resolvePaymentGateways(cfg, 'cartao').effectivePrimary).toBe('pagseguro_producao')
    expect(resolvePaymentGateways(cfg, 'cartao').effectiveFallback).toBe('mercadopago_producao')
  })
})

describe('getAvailablePaymentMethods', () => {
  it('lista pix e cartão quando ambos têm gateway', () => {
    const cfg = {
      metodos_ativos: ['pix', 'cartao'],
      gateway_pix: 'mercadopago_producao',
      gateway_cartao: 'pagseguro_producao',
    }
    expect(getAvailablePaymentMethods(cfg).sort()).toEqual(['cartao', 'pix'])
  })

  it('omite método sem gateway suportado', () => {
    const cfg = {
      metodos_ativos: ['pix', 'cartao'],
      gateway_pix: null,           // sem gateway
      gateway_cartao: 'mercadopago_producao',
    }
    expect(getAvailablePaymentMethods(cfg)).toEqual(['cartao'])
  })
})

describe('isStripePixEnabled', () => {
  it('retorna true só com flag explícita', () => {
    expect(isStripePixEnabled({ stripe: { pix_enabled: true } })).toBe(true)
    expect(isStripePixEnabled({ stripe: { pix_enabled: false } })).toBe(false)
    expect(isStripePixEnabled({})).toBe(false)
    expect(isStripePixEnabled({ stripe: {} })).toBe(false)
  })
})
