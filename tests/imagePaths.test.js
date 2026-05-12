// tests/imagePaths.test.js
// src/lib/imagePaths.js — funções puras de URL/path para fotos.

import { describe, it, expect } from 'vitest'
import {
  toUploadsUrl,
  isUploadsUrl,
  getUploadsUrlFallbackCandidates,
  buildDerivedRelativePath,
  buildDerivedUrl,
  getPhotoVariantCandidates,
  getPhotoModalDisplayCandidates,
  getPhotoGridPreviewCandidates,
  getFirstUrl,
  isLazyDerivedUrl,
  applyNextImageFallback,
} from '@/lib/imagePaths'

describe('toUploadsUrl', () => {
  it('prefixa com /uploads/', () => {
    expect(toUploadsUrl('grid/wm/foto.jpg')).toBe('/uploads/grid/wm/foto.jpg')
  })

  it('aceita caminho já com /uploads/', () => {
    expect(toUploadsUrl('/uploads/grid/wm/foto.jpg')).toBe('/uploads/grid/wm/foto.jpg')
  })

  it('rejeita path com .. (path traversal)', () => {
    expect(toUploadsUrl('../etc/passwd')).toBeNull()
    expect(toUploadsUrl('grid/../../escape.jpg')).toBeNull()
  })

  it('aceita backslashes (Windows) convertendo', () => {
    expect(toUploadsUrl('grid\\wm\\foto.jpg')).toBe('/uploads/grid/wm/foto.jpg')
  })

  it('retorna null para input inválido', () => {
    expect(toUploadsUrl(null)).toBeNull()
    expect(toUploadsUrl('')).toBeNull()
    expect(toUploadsUrl(undefined)).toBeNull()
  })
})

describe('isUploadsUrl', () => {
  it('detecta /uploads/...', () => {
    expect(isUploadsUrl('/uploads/foto.jpg')).toBe(true)
    expect(isUploadsUrl('/uploads/grid/wm/foto.jpg')).toBe(true)
  })

  it('falso para outras URLs', () => {
    expect(isUploadsUrl('https://cdn.example.com/foto.jpg')).toBe(false)
    expect(isUploadsUrl('/api/photos/123')).toBe(false)
    expect(isUploadsUrl('')).toBe(false)
    expect(isUploadsUrl(null)).toBe(false)
  })
})

describe('buildDerivedRelativePath', () => {
  it('monta path conforme kind+watermark sem eventId (legado)', () => {
    expect(buildDerivedRelativePath({ kind: 'grid', watermark: 'wm', filename: 'foto.jpg' })).toBe('grid/wm/foto.jpg')
    expect(buildDerivedRelativePath({ kind: 'thumbs', watermark: 'clean', filename: 'foto.jpg' })).toBe('thumbs/clean/foto.jpg')
    expect(buildDerivedRelativePath({ kind: 'mini', watermark: 'wm', filename: 'foto.jpg' })).toBe('mini/wm/foto.jpg')
  })

  it('monta path com prefixo de eventId', () => {
    const eventId = '2b555113-6a7f-4b92-a097-c749985572f4'
    expect(buildDerivedRelativePath({ kind: 'grid', watermark: 'wm', filename: 'foto.jpg', eventId })).toBe(`${eventId}/grid/wm/foto.jpg`)
    expect(buildDerivedRelativePath({ kind: 'covers', watermark: 'clean', filename: 'cover_x.jpg', eventId })).toBe(`${eventId}/covers/clean/cover_x.jpg`)
  })

  it('retorna null para kind/watermark inválido', () => {
    expect(buildDerivedRelativePath({ kind: 'unknown', watermark: 'wm', filename: 'foto.jpg' })).toBeNull()
    expect(buildDerivedRelativePath({ kind: 'grid', watermark: 'invalido', filename: 'foto.jpg' })).toBeNull()
  })

  it('extrai apenas o filename da entrada (não vaza path)', () => {
    expect(buildDerivedRelativePath({ kind: 'grid', watermark: 'wm', filename: 'pasta/foto.jpg' })).toBe('grid/wm/foto.jpg')
  })

  it('retorna null para .. no filename', () => {
    expect(buildDerivedRelativePath({ kind: 'grid', watermark: 'wm', filename: '..' })).toBeNull()
  })

  it('rejeita eventId com / ou .. (path traversal)', () => {
    expect(buildDerivedRelativePath({ kind: 'grid', watermark: 'wm', filename: 'foto.jpg', eventId: '../escape' })).toBe('grid/wm/foto.jpg')
    expect(buildDerivedRelativePath({ kind: 'grid', watermark: 'wm', filename: 'foto.jpg', eventId: 'a/b' })).toBe('grid/wm/foto.jpg')
  })
})

describe('buildDerivedUrl', () => {
  it('monta URL completa', () => {
    expect(buildDerivedUrl({ kind: 'thumbs', watermark: 'wm', filename: 'foto.jpg' })).toBe('/uploads/thumbs/wm/foto.jpg')
  })

  it('monta URL completa com eventId', () => {
    const eventId = 'evt-abc-123'
    expect(buildDerivedUrl({ kind: 'thumbs', watermark: 'wm', filename: 'foto.jpg', eventId })).toBe(`/uploads/${eventId}/thumbs/wm/foto.jpg`)
  })
})

describe('getPhotoVariantCandidates', () => {
  it('prioriza pathThumbWm explícito quando existe', () => {
    const photo = {
      filename: 'foto.jpg',
      pathThumbWm: 'custom/path/thumb_foto.jpg',
    }
    const candidates = getPhotoVariantCandidates(photo, { kind: 'thumbs', watermark: 'wm' })
    expect(candidates[0]).toBe('/uploads/custom/path/thumb_foto.jpg')
  })

  it('cai para path padrão quando não há campo explícito', () => {
    const photo = { filename: 'foto.jpg' }
    const candidates = getPhotoVariantCandidates(photo, { kind: 'thumbs', watermark: 'wm' })
    expect(candidates).toContain('/uploads/thumbs/wm/foto.jpg')
  })

  it('inclui path com eventId quando photo.eventId está presente', () => {
    const eventId = 'evt-xyz-1'
    const photo = { filename: 'foto.jpg', eventId }
    const candidates = getPhotoVariantCandidates(photo, { kind: 'thumbs', watermark: 'wm' })
    expect(candidates).toContain(`/uploads/${eventId}/thumbs/wm/foto.jpg`)
    // Path flat (legado) também é candidato como fallback
    expect(candidates).toContain('/uploads/thumbs/wm/foto.jpg')
  })

  it('retorna lista vazia se não há filename nem path', () => {
    expect(getPhotoVariantCandidates({}, { kind: 'thumbs', watermark: 'wm' })).toEqual([])
  })
})

describe('getPhotoModalDisplayCandidates / getPhotoGridPreviewCandidates', () => {
  it('modal devolve candidatos não vazios para foto válida', () => {
    const photo = { filename: 'foto.jpg', pathGridWm: 'grid/wm/foto.jpg' }
    const c = getPhotoModalDisplayCandidates(photo)
    expect(Array.isArray(c)).toBe(true)
    expect(c.length).toBeGreaterThan(0)
  })

  it('grid preview prefere mini/thumb (mais leve) sobre grid', () => {
    const photo = {
      filename: 'foto.jpg',
      pathMiniWm: 'mini/wm/foto.jpg',
      pathThumbWm: 'thumbs/wm/foto.jpg',
      pathGridWm: 'grid/wm/foto.jpg',
    }
    const c = getPhotoGridPreviewCandidates(photo)
    // primeiro candidato deve ser mini ou thumb (mais leve)
    expect(c[0]).toMatch(/\/(mini|thumbs)\//)
  })
})

describe('getFirstUrl', () => {
  it('retorna o primeiro elemento (truthy)', () => {
    expect(getFirstUrl(['/a.jpg', '/b.jpg'])).toBe('/a.jpg')
  })
  it('retorna null quando o primeiro é null/undefined (não procura próximo válido)', () => {
    // A implementação atual retorna o primeiro item ou null — simples truthiness do índice 0
    expect(getFirstUrl([null, '/b.jpg'])).toBeNull()
    expect(getFirstUrl([null, undefined, ''])).toBeFalsy()
  })
  it('retorna null para inputs inválidos', () => {
    expect(getFirstUrl([])).toBeFalsy()
    expect(getFirstUrl(null)).toBeFalsy()
  })
})

describe('isLazyDerivedUrl', () => {
  it('detecta URLs do endpoint /api/images/derive', () => {
    expect(isLazyDerivedUrl('/api/images/derive?filename=foto.jpg&kind=thumbs&watermark=wm')).toBe(true)
  })

  it('falso para URLs estáticas', () => {
    expect(isLazyDerivedUrl('/uploads/grid/wm/foto.jpg')).toBe(false)
  })
})

describe('applyNextImageFallback', () => {
  // A função espera um HTMLImageElement com .dataset (DOM) — simulamos.
  function makeImg(src) {
    return {
      src,
      dataset: {},
      getAttribute(attr) { return attr === 'src' ? this.src : null },
    }
  }

  it('avança o src para o próximo candidato e retorna true', () => {
    const candidates = ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg']
    const img = makeImg('/uploads/a.jpg')
    const ok = applyNextImageFallback(img, candidates)
    expect(ok).toBe(true)
    expect(img.src).toBe('/uploads/b.jpg')
  })

  it('retorna false quando todos os candidatos foram tentados', () => {
    const candidates = ['/uploads/a.jpg', '/uploads/b.jpg']
    const img = makeImg('/uploads/b.jpg')
    const ok = applyNextImageFallback(img, candidates)
    expect(ok).toBe(false)
    expect(img.dataset.fallbackExhausted).toBe('1')
  })

  it('lida com candidatos vazios sem crash', () => {
    expect(applyNextImageFallback(makeImg('x'), [])).toBe(false)
    expect(applyNextImageFallback(null, ['/a.jpg'])).toBe(false)
  })
})

describe('getUploadsUrlFallbackCandidates', () => {
  it('devolve candidatos derivados para path /uploads/', () => {
    const c = getUploadsUrlFallbackCandidates('/uploads/grid/wm/foto.jpg')
    expect(Array.isArray(c)).toBe(true)
    expect(c[0]).toBe('/uploads/grid/wm/foto.jpg')
  })

  it('devolve [value] para URL externa', () => {
    expect(getUploadsUrlFallbackCandidates('https://cdn.x.com/a.jpg')).toEqual(['https://cdn.x.com/a.jpg'])
  })

  it('lista vazia para input vazio', () => {
    expect(getUploadsUrlFallbackCandidates(null)).toEqual([])
    expect(getUploadsUrlFallbackCandidates('')).toEqual([])
  })
})
