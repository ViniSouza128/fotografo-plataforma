import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  auth: { error: 'Nao autorizado.', code: 'unauthorized', status: 401 },
  saveThrows: null,
}))

vi.mock('@/lib/apiAuth', () => ({
  requireAuth: vi.fn(async () => state.auth),
}))

vi.mock('@/lib/auditLog', () => ({
  appendAuditLog: vi.fn(),
}))

vi.mock('@/lib/storageQuota', () => {
  class StorageQuotaConfigError extends Error {
    constructor(errors) {
      const list = Array.isArray(errors) ? errors : [String(errors)]
      super(list.join(' / '))
      this.code = 'invalid_storage_quota_config'
      this.errors = list
    }
  }

  return {
    StorageQuotaConfigError,
    getStorageQuotaConfig: vi.fn(() => ({
      enabled: false,
      limitBytes: null,
      blockVideosAtPercent: 90,
      blockPhotosAtPercent: 95,
      updatedAt: null,
      updatedBy: null,
    })),
    getStorageQuotaStatus: vi.fn(({ config }) => ({
      enabled: config.enabled,
      usedBytes: 0,
      limitBytes: config.enabled ? config.limitBytes : null,
      remainingBytes: config.enabled ? config.limitBytes : null,
      percentUsed: config.enabled ? 0 : null,
      status: 'ok',
      thresholds: { video: 90, photo: 95, avatar: 95, other: 95 },
    })),
    saveStorageQuotaConfig: vi.fn((patch, options) => {
      if (state.saveThrows) throw new StorageQuotaConfigError(state.saveThrows)
      return {
        enabled: !!patch.enabled,
        limitBytes: patch.limitBytes ?? null,
        blockVideosAtPercent: 90,
        blockPhotosAtPercent: 95,
        updatedAt: '2026-05-14T00:00:00.000Z',
        updatedBy: options.updatedBy,
      }
    }),
  }
})

beforeEach(() => {
  state.auth = { error: 'Nao autorizado.', code: 'unauthorized', status: 401 }
  state.saveThrows = null
})

describe('/api/admin/storage-quota', () => {
  it('GET retorna 401 para usuario nao logado', async () => {
    const mod = await import('@/app/api/admin/storage-quota/route')
    const res = await mod.GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'unauthorized' })
  })

  it('GET retorna 403 para admin sem superadmin', async () => {
    state.auth = { error: 'Acesso restrito a super admin.', code: 'super_admin_only', status: 403 }

    const mod = await import('@/app/api/admin/storage-quota/route')
    const res = await mod.GET()
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'super_admin_only' })
  })

  it('GET permite superadmin', async () => {
    state.auth = { payload: { id: 'super-1', isAdmin: true, isSuperAdmin: true }, client: { id: 'super-1' } }

    const mod = await import('@/app/api/admin/storage-quota/route')
    const res = await mod.GET()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.config.blockVideosAtPercent).toBe(90)
    expect(data.status.status).toBe('ok')
  })

  it('PATCH permite superadmin e grava updatedBy vindo do auth real', async () => {
    state.auth = { payload: { id: 'super-1', isAdmin: true, isSuperAdmin: true }, client: { id: 'super-1' } }

    const mod = await import('@/app/api/admin/storage-quota/route')
    const req = new Request('http://localhost/api/admin/storage-quota', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, limitBytes: 1024 }),
    })
    const res = await mod.PATCH(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.config).toMatchObject({ enabled: true, limitBytes: 1024, updatedBy: 'super-1' })
  })

  it('PATCH retorna 400 para config invalida', async () => {
    state.auth = { payload: { id: 'super-1', isAdmin: true, isSuperAdmin: true }, client: { id: 'super-1' } }
    state.saveThrows = ['limitBytes deve ser um número inteiro positivo.']

    const mod = await import('@/app/api/admin/storage-quota/route')
    const req = new Request('http://localhost/api/admin/storage-quota', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, limitBytes: 0 }),
    })
    const res = await mod.PATCH(req)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.code).toBe('invalid_storage_quota_config')
  })
})
