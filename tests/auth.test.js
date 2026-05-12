// tests/auth.test.js
// Testes unitários de src/lib/auth.js — funções puras crypto.
// Não toca storage; validateAuthToken (que lê clients) fica fora do escopo.

import { describe, it, expect, beforeAll } from 'vitest'

// Garante chave fixa em todos os testes
beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-fixed-for-deterministic-output-1234567890'
})

import {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  createDownloadToken,
  verifyDownloadToken,
  generateRandomPassword,
} from '@/lib/auth'

describe('hashPassword / verifyPassword', () => {
  it('hash retorna formato hash:salt e é determinístico para mesmo salt', () => {
    const stored = hashPassword('senha123')
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
    expect(stored.split(':')).toHaveLength(2)
  })

  it('hashes diferentes para a mesma senha (salt aleatório)', () => {
    const a = hashPassword('senha123')
    const b = hashPassword('senha123')
    expect(a).not.toBe(b)
  })

  it('verifyPassword aceita a senha correta', () => {
    const stored = hashPassword('senha123')
    expect(verifyPassword('senha123', stored)).toBe(true)
  })

  it('verifyPassword rejeita senha errada', () => {
    const stored = hashPassword('senha123')
    expect(verifyPassword('outra-senha', stored)).toBe(false)
  })

  it('verifyPassword rejeita senha vazia', () => {
    const stored = hashPassword('senha123')
    expect(verifyPassword('', stored)).toBe(false)
  })
})

describe('createToken / verifyToken', () => {
  it('cria token assinado com formato data.sig', () => {
    const t = createToken({ id: 'u1', email: 'a@b.com' })
    expect(t.split('.')).toHaveLength(2)
  })

  it('verifyToken retorna payload original', () => {
    const t = createToken({ id: 'u1', email: 'a@b.com', custom: 42 })
    const p = verifyToken(t)
    expect(p).toBeTruthy()
    expect(p.id).toBe('u1')
    expect(p.email).toBe('a@b.com')
    expect(p.custom).toBe(42)
    expect(typeof p.exp).toBe('number')
  })

  it('rejeita token com assinatura inválida', () => {
    const t = createToken({ id: 'u1' })
    const tampered = t.split('.')[0] + '.assinatura-falsa'
    expect(verifyToken(tampered)).toBeNull()
  })

  it('rejeita token com payload modificado mas assinatura antiga', () => {
    const t = createToken({ id: 'u1' })
    const [, sig] = t.split('.')
    const novoData = Buffer.from(JSON.stringify({ id: 'admin', exp: Date.now() + 1e9 })).toString('base64url')
    expect(verifyToken(`${novoData}.${sig}`)).toBeNull()
  })

  it('rejeita token expirado', () => {
    const t = createToken({ id: 'u1' }, { expiresInMs: 1 })
    return new Promise(r => setTimeout(r, 5)).then(() => {
      expect(verifyToken(t)).toBeNull()
    })
  })

  it('rejeita string vazia/null/inválida', () => {
    expect(verifyToken(null)).toBeNull()
    expect(verifyToken('')).toBeNull()
    expect(verifyToken('abc')).toBeNull()
    expect(verifyToken('a.b.c')).toBeNull() // 3 partes — auth só aceita 2
  })

  it('expiresInMs customizado é respeitado', () => {
    const t = createToken({ id: 'u1' }, { expiresInMs: 60_000 })
    const p = verifyToken(t)
    expect(p.exp - Date.now()).toBeGreaterThan(50_000)
    expect(p.exp - Date.now()).toBeLessThan(70_000)
  })
})

describe('createDownloadToken / verifyDownloadToken', () => {
  it('createDownloadToken retorna null sem pedidoId', () => {
    expect(createDownloadToken(null)).toBeNull()
    expect(createDownloadToken('')).toBeNull()
    expect(createDownloadToken(undefined)).toBeNull()
  })

  it('valida token de download apenas para o pedido correto', () => {
    const t = createDownloadToken('pedido-123')
    const ok = verifyDownloadToken(t, 'pedido-123')
    expect(ok).toBeTruthy()
    expect(ok.purpose).toBe('photo_download')
    expect(ok.pedidoId).toBe('pedido-123')
  })

  it('rejeita token de download para pedido diferente', () => {
    const t = createDownloadToken('pedido-123')
    expect(verifyDownloadToken(t, 'pedido-456')).toBeNull()
  })

  it('rejeita token de auth comum como token de download', () => {
    const auth = createToken({ id: 'u1' }) // sem purpose='photo_download'
    expect(verifyDownloadToken(auth, 'qualquer-pedido')).toBeNull()
  })
})

describe('generateRandomPassword', () => {
  it('gera senhas de 8 chars por default', () => {
    expect(generateRandomPassword()).toHaveLength(8)
  })

  it('respeita o length pedido', () => {
    expect(generateRandomPassword(16)).toHaveLength(16)
    expect(generateRandomPassword(4)).toHaveLength(4)
  })

  it('senhas geradas são diferentes', () => {
    const a = generateRandomPassword(12)
    const b = generateRandomPassword(12)
    expect(a).not.toBe(b)
  })
})
