import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  inspectSafeUploadsFile,
  normalizeUploadsRequestParts,
  resolveUploadsRequestPath,
  uploadsUrlToParts,
} from '@/lib/uploadsSecurity'

const tempRoots = []

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fotografo-uploads-test-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    try { fs.rmSync(root, { recursive: true, force: true }) } catch {}
  }
})

describe('uploadsSecurity', () => {
  it('normaliza segmentos seguros', () => {
    const normalized = normalizeUploadsRequestParts(['evento-1', 'thumbs', 'wm', 'foto.jpg'])
    expect(normalized).toEqual({
      ok: true,
      parts: ['evento-1', 'thumbs', 'wm', 'foto.jpg'],
    })
  })

  it('bloqueia traversal simples e URL encoded', () => {
    expect(normalizeUploadsRequestParts(['..', 'secret.txt']).ok).toBe(false)
    expect(normalizeUploadsRequestParts(['%2e%2e', 'secret.txt']).ok).toBe(false)
    expect(normalizeUploadsRequestParts(['safe%2f..%2fsecret.txt']).ok).toBe(false)
  })

  it('resolve caminho somente dentro da raiz de uploads', () => {
    const root = makeTempRoot()
    const resolved = resolveUploadsRequestPath(['grid', 'wm', 'foto.jpg'], { root })
    expect(resolved).toBe(path.join(root, 'grid', 'wm', 'foto.jpg'))
  })

  it('extrai partes de uma URL /uploads ignorando query string', () => {
    const parsed = uploadsUrlToParts('/uploads/video-posters/clean/poster.jpg?v=123')
    expect(parsed).toEqual({
      ok: true,
      parts: ['video-posters', 'clean', 'poster.jpg'],
    })
  })

  it('serve arquivo comum e rejeita symlink perigoso quando o SO permite', async () => {
    const root = makeTempRoot()
    const outside = makeTempRoot()
    const file = path.join(root, 'ok.jpg')
    fs.writeFileSync(file, 'ok')

    const safe = await inspectSafeUploadsFile(file, root)
    expect(safe.ok).toBe(true)

    const outsideFile = path.join(outside, 'secret.jpg')
    const link = path.join(root, 'secret-link.jpg')
    fs.writeFileSync(outsideFile, 'secret')

    try {
      fs.symlinkSync(outsideFile, link)
    } catch {
      return
    }

    const inspected = await inspectSafeUploadsFile(link, root)
    expect(inspected.ok).toBe(false)
    expect(inspected.status).toBe(403)
  })
})
