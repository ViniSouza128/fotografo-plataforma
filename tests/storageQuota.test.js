import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  StorageQuotaConfigError,
  StorageQuotaExceededError,
  assertCanUpload,
  getStorageQuotaConfig,
  getStorageUsage,
  saveStorageQuotaConfig,
} from '@/lib/storageQuota'

const tempRoots = []

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fotografo-quota-test-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    try { fs.rmSync(root, { recursive: true, force: true }) } catch {}
  }
})

describe('storageQuota helper', () => {
  it('permite upload quando a quota esta desativada', () => {
    const result = assertCanUpload(
      { kind: 'video', incomingBytes: 10_000 },
      { config: { enabled: false, limitBytes: null }, usage: { usedBytes: 999_999, roots: [], warnings: [] } }
    )

    expect(result.allowed).toBe(true)
  })

  it('permite foto e video quando a quota ativa ainda esta abaixo dos limites', () => {
    for (const kind of ['photo', 'video']) {
      const result = assertCanUpload(
        { kind, incomingBytes: 1 },
        { config: { enabled: true, limitBytes: 100 }, usage: { usedBytes: 70, roots: [], warnings: [] } }
      )

      expect(result.allowed).toBe(true)
      expect(result.projectedPercent).toBe(71)
    }
  })

  it('bloqueia video quando a projecao chega em 90%', () => {
    try {
      assertCanUpload(
        { kind: 'video', incomingBytes: 1 },
        { config: { enabled: true, limitBytes: 100 }, usage: { usedBytes: 89, roots: [], warnings: [] } }
      )
      throw new Error('deveria bloquear')
    } catch (error) {
      expect(error).toBeInstanceOf(StorageQuotaExceededError)
      expect(error.status).toBe(507)
      expect(error.code).toBe('storage_quota_video_blocked')
    }
  })

  it('bloqueia foto e avatar quando a projecao chega em 95%', () => {
    for (const [kind, code] of [['photo', 'storage_quota_photo_blocked'], ['avatar', 'storage_quota_avatar_blocked']]) {
      try {
        assertCanUpload(
          { kind, incomingBytes: 1 },
          { config: { enabled: true, limitBytes: 100 }, usage: { usedBytes: 94, roots: [], warnings: [] } }
        )
        throw new Error('deveria bloquear')
      } catch (error) {
        expect(error).toBeInstanceOf(StorageQuotaExceededError)
        expect(error.status).toBe(507)
        expect(error.code).toBe(code)
      }
    }
  })

  it('calcula uso real em diretorio temporario e ignora symlinks quando possivel', () => {
    const root = makeTempRoot()
    fs.mkdirSync(path.join(root, 'nested'), { recursive: true })
    fs.writeFileSync(path.join(root, 'a.bin'), Buffer.alloc(10))
    fs.writeFileSync(path.join(root, 'nested', 'b.bin'), Buffer.alloc(15))

    try {
      fs.symlinkSync(path.join(root, 'a.bin'), path.join(root, 'link.bin'))
    } catch {}

    const usage = getStorageUsage({ roots: [root] })
    expect(usage.usedBytes).toBe(25)
    expect(usage.roots).toEqual([root])
  })

  it('deduplica diretorios quando uma raiz esta dentro da outra', () => {
    const root = makeTempRoot()
    const nested = path.join(root, 'nested')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(root, 'a.bin'), Buffer.alloc(10))
    fs.writeFileSync(path.join(nested, 'b.bin'), Buffer.alloc(15))

    const usage = getStorageUsage({ roots: [root, nested] })
    expect(usage.usedBytes).toBe(25)
    expect(usage.roots).toEqual([root])
  })

  it('falha ao salvar config invalida', () => {
    const root = makeTempRoot()
    const filePath = path.join(root, 'storage-quota.json')

    expect(() => saveStorageQuotaConfig(
      { enabled: true, limitBytes: 0 },
      { filePath, skipEnsureRuntimeDirs: true }
    )).toThrow(StorageQuotaConfigError)
  })

  it('salva e le config valida com thresholds fixos', () => {
    const root = makeTempRoot()
    const filePath = path.join(root, 'storage-quota.json')

    const saved = saveStorageQuotaConfig(
      { enabled: true, limitBytes: 1024, blockVideosAtPercent: 10 },
      { filePath, skipEnsureRuntimeDirs: true, updatedBy: 'super-1' }
    )
    const read = getStorageQuotaConfig({ filePath })

    expect(saved.enabled).toBe(true)
    expect(read.limitBytes).toBe(1024)
    expect(read.blockVideosAtPercent).toBe(90)
    expect(read.blockPhotosAtPercent).toBe(95)
    expect(read.updatedBy).toBe('super-1')
  })
})
