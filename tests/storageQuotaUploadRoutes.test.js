import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  uploadsDir: '',
}))

vi.mock('@/lib/apiAuth', () => ({
  requireAuth: vi.fn(async () => ({
    payload: { id: 'admin-1', isAdmin: true, isSuperAdmin: true },
    client: { id: 'admin-1' },
  })),
}))

vi.mock('@/lib/imageStorage', () => ({
  PUBLIC_UPLOADS_DIR: state.uploadsDir,
}))

vi.mock('@/lib/imagePaths', () => ({
  sanitizeEventBucket: vi.fn((value) => String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_')),
}))

vi.mock('@/lib/storageQuota', () => ({
  assertCanUpload: vi.fn(() => {
    const error = new Error('Limite de armazenamento atingido. O envio de fotos esta bloqueado.')
    error.status = 507
    error.code = 'storage_quota_photo_blocked'
    error.kind = 'photo'
    error.usedBytes = 95
    error.incomingBytes = 10
    error.projectedBytes = 105
    error.limitBytes = 100
    error.percent = 105
    error.thresholdPercent = 95
    throw error
  }),
  isStorageQuotaExceededError: vi.fn((error) => error?.status === 507),
  toStorageQuotaErrorPayload: vi.fn((error) => ({
    error: error.message,
    code: error.code,
    kind: error.kind,
    usedBytes: error.usedBytes,
    incomingBytes: error.incomingBytes,
    projectedBytes: error.projectedBytes,
    limitBytes: error.limitBytes,
    percent: error.percent,
    thresholdPercent: error.thresholdPercent,
  })),
}))

const tempRoots = []

beforeEach(() => {
  vi.resetModules()
  state.uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fotografo-upload-quota-'))
  tempRoots.push(state.uploadsDir)
})

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    try { fs.rmSync(root, { recursive: true, force: true }) } catch {}
  }
})

describe('storage quota em rotas de upload', () => {
  it('bloqueia upload de capa antes de gravar arquivo', async () => {
    const mod = await import('@/app/api/events/[id]/upload-cover/route')
    const fd = new FormData()
    fd.append('file', new File([Buffer.alloc(10)], 'cover.jpg', { type: 'image/jpeg' }))

    const req = new Request('http://localhost/api/events/event-1/upload-cover', {
      method: 'POST',
      body: fd,
    })

    const res = await mod.POST(req, { params: { id: 'event-1' } })
    const data = await res.json()

    expect(res.status).toBe(507)
    expect(data.code).toBe('storage_quota_photo_blocked')
    expect(fs.readdirSync(state.uploadsDir)).toEqual([])
  })
})
