const UPLOADS_BASE_URL = '/uploads'

const KIND_TO_DIR = {
  grid: 'grid',
  thumbs: 'thumbs',
  mini: 'mini',
  covers: 'covers',
}

const WATERMARK_TO_DIR = {
  wm: 'wm',
  clean: 'clean',
}

const PHOTO_PATH_FIELDS = {
  'grid:wm': 'pathGridWm',
  'grid:clean': 'pathGridClean',
  'thumbs:wm': 'pathThumbWm',
  'thumbs:clean': 'pathThumbClean',
  'mini:wm': 'pathMiniWm',
  'mini:clean': 'pathMiniClean',
}

const EVENT_BUCKET_REGEX = /^[a-zA-Z0-9._-]+$/

export function sanitizeEventBucket(value) {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw) return null
  if (raw === '.' || raw === '..') return null
  if (!EVENT_BUCKET_REGEX.test(raw)) return null
  return raw
}

function isPhotoFreeForClient(photo) {
  if (!photo) return false
  if (photo.isFree) return true
  if (photo.albumGratis) return true
  if (photo.gratis) return true
  const effective = Number(photo.priceEffective ?? photo.price)
  return Number.isFinite(effective) && effective === 0
}

function buildLazyDerivedUrl({ kind, watermark, filename, eventId = null }) {
  const safeFilename = normalizeFilename(filename)
  if (!safeFilename || !KIND_TO_DIR[kind] || !WATERMARK_TO_DIR[watermark]) return null
  const params = new URLSearchParams({
    filename: safeFilename,
    kind,
    watermark,
  })
  const safeEventId = sanitizeEventBucket(eventId)
  if (safeEventId) params.set('eventId', safeEventId)
  return `/api/images/derive?${params.toString()}`
}

function uniqueStrings(values) {
  const out = []
  const seen = new Set()
  for (const value of values) {
    if (!value || typeof value !== 'string') continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function toJpgName(filename) {
  if (!filename) return null
  const idx = filename.lastIndexOf('.')
  if (idx === -1) return `${filename}.jpg`
  return `${filename.slice(0, idx)}.jpg`
}

function normalizePathLike(value) {
  if (!value || typeof value !== 'string') return null
  let normalized = value.trim().replace(/\\/g, '/')
  if (!normalized) return null
  if (normalized.includes('..')) return null
  if (normalized.startsWith('/uploads/')) normalized = normalized.slice('/uploads/'.length)
  else if (normalized.startsWith('uploads/')) normalized = normalized.slice('uploads/'.length)
  else if (normalized.startsWith('/')) normalized = normalized.slice(1)
  return normalized || null
}

function normalizeFilename(value) {
  const normalized = normalizePathLike(value)
  if (!normalized) return null
  const parts = normalized.split('/')
  const safe = parts[parts.length - 1]
  if (!safe || safe === '.' || safe === '..') return null
  return safe
}

export function toUploadsUrl(relativePath) {
  const safe = normalizePathLike(relativePath)
  if (!safe) return null
  return `${UPLOADS_BASE_URL}/${safe}`
}

export function isUploadsUrl(value) {
  return typeof value === 'string' && value.startsWith(`${UPLOADS_BASE_URL}/`)
}

export function getUploadsUrlFallbackCandidates(value) {
  if (!value || typeof value !== 'string') return []
  if (!isUploadsUrl(value)) return [value]

  const safe = normalizePathLike(value)
  if (!safe) return [value]

  const candidates = [toUploadsUrl(safe)]
  let match = null

  // Per-event paths: <eventId>/<kind>/<watermark>/<file>
  // Tenta também a versão flat (legacy) sem eventId
  match = safe.match(/^([^/]+)\/(mini|thumbs|grid|covers)\/(wm|clean)\/(.+)$/)
  if (match) {
    const [, eventId, kind, wm, file] = match
    const safeFile = normalizeFilename(file)
    const safeEventId = sanitizeEventBucket(eventId)
    if (safeFile) {
      candidates.push(toUploadsUrl(`${kind}/${wm}/${safeFile}`))
      if (safeEventId) {
        const lazyUrl = buildLazyDerivedUrl({ kind, watermark: wm, filename: safeFile, eventId: safeEventId })
        if (lazyUrl) candidates.push(lazyUrl)
      }
      const lazyFlat = buildLazyDerivedUrl({ kind, watermark: wm, filename: safeFile })
      if (lazyFlat) candidates.push(lazyFlat)
    }
  }

  match = safe.match(/^mini\/clean\/(.+)$/)
  if (match) {
    const file = normalizeFilename(match[1])
    const lazyMini = file ? buildLazyDerivedUrl({ kind: 'mini', watermark: 'clean', filename: file }) : null
    if (lazyMini) candidates.push(lazyMini)
    if (file) candidates.push(toUploadsUrl(`thumbs/mini_${toJpgName(file)}`))
    if (file) candidates.push(toUploadsUrl(`thumbs/thumb_${file}`))
    if (file) candidates.push(toUploadsUrl(`wm_${file}`))
  }

  match = safe.match(/^thumbs\/(?:wm|clean)\/(.+)$/)
  if (match) {
    const file = normalizeFilename(match[1])
    if (file) candidates.push(toUploadsUrl(`thumbs/thumb_${file}`))
    if (file) candidates.push(toUploadsUrl(`wm_${file}`))
  }

  match = safe.match(/^grid\/(?:wm|clean)\/(.+)$/)
  if (match) {
    const file = normalizeFilename(match[1])
    if (file) candidates.push(toUploadsUrl(`wm_${file}`))
    if (file) candidates.push(toUploadsUrl(`thumbs/thumb_${file}`))
  }

  match = safe.match(/^covers\/(?:wm|clean)\/(.+)$/)
  if (match) {
    const file = normalizeFilename(match[1])
    if (file) candidates.push(toUploadsUrl(`thumbs/${file}`))
    if (file) candidates.push(toUploadsUrl(`wm_${file.replace(/^cover_/, '')}`))
  }

  return uniqueStrings(candidates)
}

export function buildDerivedRelativePath({ kind, watermark, filename, eventId = null } = {}) {
  const dirKind = KIND_TO_DIR[kind]
  const dirWm = WATERMARK_TO_DIR[watermark]
  const safeFilename = normalizeFilename(filename)
  if (!dirKind || !dirWm || !safeFilename) return null
  const safeEventId = sanitizeEventBucket(eventId)
  if (safeEventId) {
    return `${safeEventId}/${dirKind}/${dirWm}/${safeFilename}`
  }
  return `${dirKind}/${dirWm}/${safeFilename}`
}

export function buildDerivedUrl({ kind, watermark, filename, eventId = null } = {}) {
  const relative = buildDerivedRelativePath({ kind, watermark, filename, eventId })
  return toUploadsUrl(relative)
}

function getExplicitPathCandidate(photo, key) {
  if (!photo || !key) return null
  return toUploadsUrl(photo[key])
}

function getLegacyFieldUrl(photo, field, folder = '') {
  const raw = photo?.[field]
  if (!raw || typeof raw !== 'string') return null
  const normalized = normalizePathLike(raw)
  if (!normalized) return null
  if (normalized.includes('/')) return toUploadsUrl(normalized)
  return toUploadsUrl(folder ? `${folder}/${normalized}` : normalized)
}

function getLegacyDerivedFromOriginal(filename, kind, watermark) {
  const safeFilename = normalizeFilename(filename)
  if (!safeFilename) return null

  if (kind === 'grid' && watermark === 'wm') return toUploadsUrl(`wm_${safeFilename}`)
  if (kind === 'grid' && watermark === 'clean') return null
  if (kind === 'thumbs' && watermark === 'wm') return toUploadsUrl(`thumbs/thumb_${safeFilename}`)
  if (kind === 'thumbs' && watermark === 'clean') return null
  if (kind === 'mini' && watermark === 'clean') return toUploadsUrl(`thumbs/mini_${toJpgName(safeFilename)}`)
  if (kind === 'mini' && watermark === 'wm') return null
  if (kind === 'covers') return toUploadsUrl(`thumbs/cover_${safeFilename}`)

  return null
}

export function getPhotoVariantCandidates(photo, { kind, watermark }) {
  if (!photo) return []
  const safeFilename = normalizeFilename(photo.filename)
  const safeEventId = sanitizeEventBucket(photo.eventId)
  const pathField = PHOTO_PATH_FIELDS[`${kind}:${watermark}`]
  const candidates = []

  const explicitPath = getExplicitPathCandidate(photo, pathField)
  if (explicitPath) candidates.push(explicitPath)

  if (safeEventId) {
    const eventScopedPath = buildDerivedUrl({ kind, watermark, filename: safeFilename, eventId: safeEventId })
    if (eventScopedPath) candidates.push(eventScopedPath)
  }

  const computedFlatPath = buildDerivedUrl({ kind, watermark, filename: safeFilename })
  if (computedFlatPath) candidates.push(computedFlatPath)

  const lazyUrl = buildLazyDerivedUrl({ kind, watermark, filename: safeFilename, eventId: safeEventId })
  if (lazyUrl) candidates.push(lazyUrl)
  if (safeEventId) {
    const lazyFlatUrl = buildLazyDerivedUrl({ kind, watermark, filename: safeFilename })
    if (lazyFlatUrl) candidates.push(lazyFlatUrl)
  }

  if (kind === 'grid' && watermark === 'wm') {
    candidates.push(getLegacyFieldUrl(photo, 'filenameWm'))
  } else if (kind === 'thumbs' && watermark === 'wm') {
    candidates.push(getLegacyFieldUrl(photo, 'filenameThumb', 'thumbs'))
  } else if (kind === 'mini' && watermark === 'clean') {
    candidates.push(getLegacyFieldUrl(photo, 'filenameMini', 'thumbs'))
  } else if (kind === 'thumbs' && watermark === 'clean') {
    candidates.push(getLegacyFieldUrl(photo, 'filenameThumb', 'thumbs'))
  }

  candidates.push(getLegacyDerivedFromOriginal(safeFilename, kind, watermark))

  if (kind === 'thumbs') {
    candidates.push(...getPhotoVariantCandidates(photo, { kind: 'grid', watermark: 'wm' }))
  }
  if (kind === 'mini') {
    candidates.push(...getPhotoVariantCandidates(photo, { kind: 'thumbs', watermark: 'wm' }))
  }

  return uniqueStrings(candidates)
}

export function getPhotoModalDisplayCandidates(photo) {
  const useClean = isPhotoFreeForClient(photo)
  return uniqueStrings([
    ...getPhotoVariantCandidates(photo, { kind: 'grid', watermark: useClean ? 'clean' : 'wm' }),
    ...getPhotoVariantCandidates(photo, { kind: 'thumbs', watermark: useClean ? 'clean' : 'wm' }),
    ...(useClean ? getPhotoVariantCandidates(photo, { kind: 'mini', watermark: 'clean' }) : []),
  ])
}

export function getPhotoGridPreviewCandidates(photo) {
  const useClean = isPhotoFreeForClient(photo)
  return uniqueStrings([
    ...getPhotoVariantCandidates(photo, { kind: 'thumbs', watermark: useClean ? 'clean' : 'wm' }),
    ...getPhotoVariantCandidates(photo, { kind: 'grid', watermark: useClean ? 'clean' : 'wm' }),
    ...(useClean ? getPhotoVariantCandidates(photo, { kind: 'mini', watermark: 'clean' }) : []),
  ])
}

export function getPhotoCommentPreviewCandidates(photo) {
  const useClean = isPhotoFreeForClient(photo)
  return uniqueStrings([
    ...getPhotoVariantCandidates(photo, { kind: 'mini', watermark: 'clean' }),
    ...getPhotoVariantCandidates(photo, { kind: 'thumbs', watermark: useClean ? 'clean' : 'wm' }),
    ...(useClean ? [] : getPhotoVariantCandidates(photo, { kind: 'grid', watermark: 'wm' })),
  ])
}

export function getPhotoCartPreviewCandidates(photo) {
  const useClean = isPhotoFreeForClient(photo)
  return uniqueStrings([
    ...getPhotoVariantCandidates(photo, { kind: 'mini', watermark: 'clean' }),
    ...getPhotoVariantCandidates(photo, { kind: 'thumbs', watermark: useClean ? 'clean' : 'wm' }),
    ...getPhotoVariantCandidates(photo, { kind: 'grid', watermark: useClean ? 'clean' : 'wm' }),
  ])
}

export function getPhotoLargeCardCandidates(photo) {
  const useClean = isPhotoFreeForClient(photo)
  return uniqueStrings([
    ...getPhotoVariantCandidates(photo, { kind: 'thumbs', watermark: useClean ? 'clean' : 'wm' }),
    ...getPhotoVariantCandidates(photo, { kind: 'grid', watermark: useClean ? 'clean' : 'wm' }),
    ...getPhotoVariantCandidates(photo, { kind: 'mini', watermark: 'clean' }),
  ])
}

export function getFirstUrl(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  return candidates[0] || null
}

function normalizeCustomCoverUrl(raw) {
  if (!raw || typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return toUploadsUrl(value)
}

export function getEventCoverCandidates(event, { watermark = 'clean', purpose = 'cover' } = {}) {
  if (!event) return []
  const candidates = []
  const isSmall = purpose === 'small'
  const safeEventId = sanitizeEventBucket(event.id)

  if (event.usarCapaPersonalizada && event.capaPersonalizadaUrl) {
    candidates.push(normalizeCustomCoverUrl(event.capaPersonalizadaUrl))
  }

  const explicitPath = watermark === 'wm'
    ? toUploadsUrl(event.coverImagePathWm)
    : toUploadsUrl(event.coverImagePathClean)
  if (explicitPath) candidates.push(explicitPath)

  const coverImageFile = normalizeFilename(event.coverImageFile)
  if (coverImageFile) {
    const coverKind = watermark === 'wm' ? 'wm' : 'clean'
    if (safeEventId) {
      candidates.push(toUploadsUrl(`${safeEventId}/covers/${coverKind}/${coverImageFile}`))
    }
    candidates.push(toUploadsUrl(`covers/${coverKind}/${coverImageFile}`))
    candidates.push(toUploadsUrl(`thumbs/${coverImageFile}`))
  }

  if (event.coverImageThumb) candidates.push(getLegacyFieldUrl(event, 'coverImageThumb', 'thumbs'))

  const coverFilename = normalizeFilename(event.coverImage)
  if (coverFilename) {
    const pseudoPhoto = { filename: coverFilename, eventId: safeEventId || event.id }
    if (watermark === 'wm') {
      candidates.push(...getPhotoVariantCandidates(pseudoPhoto, { kind: 'grid', watermark: 'wm' }))
    } else {
      if (isSmall) {
        candidates.push(...getPhotoVariantCandidates(pseudoPhoto, { kind: 'mini', watermark: 'clean' }))
        candidates.push(...getPhotoVariantCandidates(pseudoPhoto, { kind: 'thumbs', watermark: 'clean' }))
      } else {
        candidates.push(...getPhotoVariantCandidates(pseudoPhoto, { kind: 'thumbs', watermark: 'clean' }))
      }
    }
  }

  return uniqueStrings(candidates)
}

function normalizeComparableUrl(value) {
  try {
    const parsed = new URL(value, 'http://localhost')
    if (parsed.pathname === '/api/images/derive') {
      return `${parsed.pathname}${parsed.search}`
    }
    return parsed.pathname
  } catch {
    return String(value || '')
  }
}

export function isLazyDerivedUrl(value) {
  return typeof value === 'string' && value.startsWith('/api/images/derive?')
}

export function applyNextImageFallback(target, candidates, { maxAttempts = 5 } = {}) {
  if (!target || !Array.isArray(candidates) || candidates.length === 0) return false
  if (target.dataset?.fallbackExhausted === '1') return false

  let attempts = Number(target.dataset?.fallbackAttempts || 0)
  if (!Number.isFinite(attempts) || attempts < 0) attempts = 0
  if (attempts >= maxAttempts) {
    target.dataset.fallbackExhausted = '1'
    return false
  }

  let index = Number(target.dataset?.fallbackIndex || 0)
  if (!Number.isFinite(index) || index < 0) index = 0

  const current = normalizeComparableUrl(target.src || target.getAttribute('src') || '')
  const currentIndex = candidates.findIndex((candidate) => normalizeComparableUrl(candidate) === current)
  if (currentIndex >= 0) index = currentIndex

  const nextIndex = index + 1
  if (nextIndex >= candidates.length) {
    target.dataset.fallbackExhausted = '1'
    return false
  }

  target.dataset.fallbackIndex = String(nextIndex)
  target.dataset.fallbackAttempts = String(attempts + 1)
  target.src = candidates[nextIndex]
  return true
}

export function withResolvedPhotoUrls(photo) {
  const modalCandidates = getPhotoModalDisplayCandidates(photo)
  const gridCandidates = getPhotoGridPreviewCandidates(photo)
  const cartCandidates = getPhotoCartPreviewCandidates(photo)
  const commentCandidates = getPhotoCommentPreviewCandidates(photo)

  return {
    ...photo,
    urls: {
      modal: getFirstUrl(modalCandidates),
      modalCandidates,
      grid: getFirstUrl(gridCandidates),
      gridCandidates,
      cart: getFirstUrl(cartCandidates),
      cartCandidates,
      comment: getFirstUrl(commentCandidates),
      commentCandidates,
    },
  }
}

export function buildPhotoPathFields(filename, eventId = null) {
  const safeFilename = normalizeFilename(filename)
  if (!safeFilename) return {}
  const safeEventId = sanitizeEventBucket(eventId)
  return {
    pathGridWm: buildDerivedRelativePath({ kind: 'grid', watermark: 'wm', filename: safeFilename, eventId: safeEventId }),
    pathGridClean: buildDerivedRelativePath({ kind: 'grid', watermark: 'clean', filename: safeFilename, eventId: safeEventId }),
    pathThumbWm: buildDerivedRelativePath({ kind: 'thumbs', watermark: 'wm', filename: safeFilename, eventId: safeEventId }),
    pathThumbClean: buildDerivedRelativePath({ kind: 'thumbs', watermark: 'clean', filename: safeFilename, eventId: safeEventId }),
    pathMiniWm: buildDerivedRelativePath({ kind: 'mini', watermark: 'wm', filename: safeFilename, eventId: safeEventId }),
    pathMiniClean: buildDerivedRelativePath({ kind: 'mini', watermark: 'clean', filename: safeFilename, eventId: safeEventId }),
  }
}

export function buildCoverPathFields(coverFilename, eventId = null) {
  const safeFilename = normalizeFilename(coverFilename)
  if (!safeFilename) return {}
  const safeEventId = sanitizeEventBucket(eventId)
  return {
    coverImagePathWm: buildDerivedRelativePath({ kind: 'covers', watermark: 'wm', filename: safeFilename, eventId: safeEventId }),
    coverImagePathClean: buildDerivedRelativePath({ kind: 'covers', watermark: 'clean', filename: safeFilename, eventId: safeEventId }),
  }
}
