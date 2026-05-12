// tests/cpfCnpj.test.js
// Validação e formatação de CPF/CNPJ — entradas comuns dos formulários.

import { describe, it, expect } from 'vitest'
import { normalizarCPF, validarCPF, formatarCPF, mascararCPF } from '@/lib/cpf'
import { normalizarCNPJ, validarCNPJ, formatarCNPJ, mascararCNPJ } from '@/lib/cnpj'

describe('CPF', () => {
  it('normalizarCPF tira tudo que não é dígito', () => {
    expect(normalizarCPF('529.982.247-25')).toBe('52998224725')
    expect(normalizarCPF('  529 982 247-25 ')).toBe('52998224725')
    expect(normalizarCPF('')).toBe('')
    expect(normalizarCPF(null)).toBe('')
  })

  it('validarCPF aceita CPFs válidos', () => {
    expect(validarCPF('529.982.247-25')).toBe(true)   // CPF clássico de teste válido
    expect(validarCPF('52998224725')).toBe(true)
  })

  it('validarCPF rejeita CPFs inválidos', () => {
    expect(validarCPF('111.111.111-11')).toBe(false)
    expect(validarCPF('123.456.789-00')).toBe(false)
    expect(validarCPF('')).toBe(false)
    expect(validarCPF('abc')).toBe(false)
    expect(validarCPF('12345')).toBe(false)
    expect(validarCPF('00000000000')).toBe(false)
  })

  it('formatarCPF aplica a máscara padrão', () => {
    expect(formatarCPF('52998224725')).toBe('529.982.247-25')
  })

  it('mascararCPF não estoura com input curto', () => {
    expect(mascararCPF('123')).toBeTruthy()
    expect(mascararCPF('12345')).toBeTruthy()
  })
})

describe('CNPJ', () => {
  it('normalizarCNPJ remove tudo que não é dígito', () => {
    expect(normalizarCNPJ('11.222.333/0001-81')).toBe('11222333000181')
    expect(normalizarCNPJ('  11 222 333/0001-81 ')).toBe('11222333000181')
  })

  it('validarCNPJ aceita CNPJs válidos', () => {
    // 11.222.333/0001-81 — exemplo padrão de testes
    expect(validarCNPJ('11.222.333/0001-81')).toBe(true)
    expect(validarCNPJ('11222333000181')).toBe(true)
  })

  it('validarCNPJ rejeita inválidos', () => {
    expect(validarCNPJ('11.111.111/1111-11')).toBe(false)
    expect(validarCNPJ('00.000.000/0000-00')).toBe(false)
    expect(validarCNPJ('')).toBe(false)
    expect(validarCNPJ('abc')).toBe(false)
    expect(validarCNPJ('123')).toBe(false)
  })

  it('formatarCNPJ aplica a máscara padrão', () => {
    expect(formatarCNPJ('11222333000181')).toBe('11.222.333/0001-81')
  })

  it('mascararCNPJ não quebra com inputs incompletos', () => {
    expect(mascararCNPJ('1')).toBeTruthy()
    expect(mascararCNPJ('1122')).toBeTruthy()
    expect(mascararCNPJ('11222')).toBeTruthy()
  })
})
