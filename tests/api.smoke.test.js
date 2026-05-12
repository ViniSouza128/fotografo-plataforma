// tests/api.smoke.test.js
// Smoke test mínimo de handlers de API: importar sem crash + retornar shape esperado
// para inputs inválidos (resposta 4xx). Não levanta servidor — chama o handler direto.

import { describe, it, expect, vi } from 'vitest'

// Stub Next.js cookies() para não depender de runtime
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}))

describe('smoke /api/auth/login', () => {
  it('handler exporta POST', async () => {
    const mod = await import('@/app/api/auth/login/route')
    expect(typeof mod.POST).toBe('function')
  })

  it('rejeita payload sem email/senha (4xx)', async () => {
    const mod = await import('@/app/api/auth/login/route')
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await mod.POST(req)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })
})

describe('smoke /api/auth/register', () => {
  it('handler exporta POST', async () => {
    const mod = await import('@/app/api/auth/register/route')
    expect(typeof mod.POST).toBe('function')
  })

  it('rejeita registro sem campos obrigatórios (4xx)', async () => {
    const mod = await import('@/app/api/auth/register/route')
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomeCompleto: '', email: '', senha: '' }),
    })
    const res = await mod.POST(req)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })
})

describe('smoke /api/config', () => {
  it('GET retorna 200 com objeto (sem secrets)', async () => {
    const mod = await import('@/app/api/config/route')
    const req = new Request('http://localhost/api/config', { method: 'GET' })
    const res = await mod.GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toBeTypeOf('object')
    // Não deve vazar credenciais sensíveis
    const flat = JSON.stringify(data).toLowerCase()
    expect(flat).not.toMatch(/"api_key"/)
    expect(flat).not.toMatch(/"secret_key"/)
  })
})

describe('smoke /api/events', () => {
  it('GET retorna 200 com array', async () => {
    const mod = await import('@/app/api/events/route')
    const req = new Request('http://localhost/api/events', { method: 'GET' })
    const res = await mod.GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })
})

describe('smoke /api/photos', () => {
  it('GET retorna 200 com array', async () => {
    const mod = await import('@/app/api/photos/route')
    const req = new Request('http://localhost/api/photos', { method: 'GET' })
    const res = await mod.GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })
})
