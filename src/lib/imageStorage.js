import fs from 'fs'
import path from 'path'
import { buildCoverPathFields, buildDerivedRelativePath, buildPhotoPathFields } from './imagePaths'

const ROOT = process.cwd()

export const PUBLIC_UPLOADS_DIR = path.join(ROOT, 'public', 'uploads')
export const LEGACY_PUBLIC_THUMBS_DIR = path.join(PUBLIC_UPLOADS_DIR, 'thumbs')
export const PRIVATE_ORIGINALS_DIR = path.join(ROOT, 'storage', 'originals')
export const LEGACY_PRIVATE_ORIGINALS_DIR = path.join(ROOT, 'data', 'originals')
export const UNASSIGNED_ORIGINALS_BUCKET = '__unassigned'
export const MEDIA_TRASH_DIR = path.join(ROOT, 'storage', 'trash', 'media')
export const DELETION_LOG_PATH = path.join(ROOT, 'storage', 'trash', 'deletion-log.json')
export const PRESERVED_ORIGINALS_BUCKET = '_preserved'
export const PRESERVED_PUBLIC_RELATIVE_ROOT = 'thumbs/_preserved'

const NEW_DERIVED_DIRS = [
  ['grid', 'wm'],
  ['grid', 'clean'],
  ['thumbs', 'wm'],
  ['thumbs', 'clean'],
  ['mini', 'wm'],
  ['mini', 'clean'],
  ['covers', 'wm'],
  ['covers', 'clean'],
]

function ensureDirSync(directory) {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true })
}

function splitRelativePath(relativePath) {
  return String(relativePath).split('/').filter(Boolean)
}

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/')
}

function normalizeRelativePath(value) {
  const raw = toPosixPath(value).trim()
  if (!raw) return null
  let normalized = raw
  if (normalized.startsWith('/uploads/')) normalized = normalized.slice('/uploads/'.length)
  else if (normalized.startsWith('uploads/')) normalized = normalized.slice('uploads/'.length)
  else if (normalized.startsWith('/')) normalized = normalized.slice(1)

  const parts = normalized.split('/').filter(Boolean)
  if (parts.some(part => part === '.' || part === '..')) return null
  return parts.length ? parts.join('/') : null
}

function isInsideDirectory(targetPath, rootPath) {
  const target = path.resolve(targetPath)
  const root = path.resolve(rootPath)
  return target === root || target.startsWith(root + path.sep)
}

function projectRelativePath(absolutePath) {
  return toPosixPath(path.relative(ROOT, absolutePath))
}

function uniqueTargetPath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath
  const dir = path.dirname(targetPath)
  const ext = path.extname(targetPath)
  const base = path.basename(targetPath, ext)
  for (let i = 2; i < 1000; i++) {
    const candidate = path.join(dir, `${base}__${i}${ext}`)
    if (!fs.existsSync(candidate)) return candidate
  }
  throw new Error(`target_collision:${targetPath}`)
}

function moveFileSync(sourcePath, targetPath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null
  if (!isInsideDirectory(sourcePath, ROOT)) {
    throw new Error(`unsafe_source:${sourcePath}`)
  }

  const sourceStat = fs.statSync(sourcePath)
  const finalTarget = uniqueTargetPath(targetPath)
  ensureDirSync(path.dirname(finalTarget))
  fs.renameSync(sourcePath, finalTarget)

  return {
    from: projectRelativePath(sourcePath),
    to: projectRelativePath(finalTarget),
    bytes: sourceStat.size,
  }
}

function getUploadsAbsolutePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath)
  if (!normalized) return null
  const targetPath = path.join(PUBLIC_UPLOADS_DIR, ...splitRelativePath(normalized))
  if (!isInsideDirectory(targetPath, PUBLIC_UPLOADS_DIR)) return null
  return targetPath
}

function getPublicPathFieldAbsolutePath(photo, field) {
  const relative = normalizeRelativePath(photo?.[field])
  if (!relative) return null
  return getUploadsAbsolutePath(relative)
}

function getLegacyPublicFieldAbsolutePath(photo, field, folder = '') {
  const value = photo?.[field]
  if (!value || typeof value !== 'string') return null
  const normalized = normalizeRelativePath(value)
  if (!normalized) return null
  const relative = normalized.includes('/') || !folder ? normalized : `${folder}/${normalized}`
  return getUploadsAbsolutePath(relative)
}

function addManagedFile(files, seen, descriptor) {
  if (!descriptor?.absolutePath || !fs.existsSync(descriptor.absolutePath)) return
  const resolved = path.resolve(descriptor.absolutePath)
  if (seen.has(resolved)) return
  if (!isInsideDirectory(resolved, ROOT)) return
  seen.add(resolved)
  files.push({
    ...descriptor,
    absolutePath: resolved,
    projectPath: projectRelativePath(resolved),
  })
}

function sanitizeOriginalBucket(value) {
  const safe = path.basename(String(value || '').trim())
  if (!safe || safe === '.' || safe === '..') return null
  return safe.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function ensureImageStorageDirs() {
  ensureDirSync(PUBLIC_UPLOADS_DIR)
  ensureDirSync(LEGACY_PUBLIC_THUMBS_DIR)
  ensureDirSync(PRIVATE_ORIGINALS_DIR)
  ensureDirSync(MEDIA_TRASH_DIR)
  ensureDirSync(path.dirname(DELETION_LOG_PATH))
  ensureDirSync(path.join(PUBLIC_UPLOADS_DIR, ...splitRelativePath(PRESERVED_PUBLIC_RELATIVE_ROOT)))
  ensureDirSync(path.join(PRIVATE_ORIGINALS_DIR, PRESERVED_ORIGINALS_BUCKET))

  for (const [kind, watermark] of NEW_DERIVED_DIRS) {
    const relative = buildDerivedRelativePath({
      kind,
      watermark,
      filename: 'placeholder.jpg',
    })
    if (!relative) continue
    const parts = splitRelativePath(relative).slice(0, -1)
    ensureDirSync(path.join(PUBLIC_UPLOADS_DIR, ...parts))
  }
}

export function sanitizeStoredFilename(value) {
  const safe = path.basename(String(value || '').trim())
  if (!safe || safe === '.' || safe === '..') return null
  return safe
}

export function buildOriginalRelativePath({ eventId, filename }) {
  const safeFilename = sanitizeStoredFilename(filename)
  if (!safeFilename) return null

  const bucket = sanitizeOriginalBucket(eventId) || UNASSIGNED_ORIGINALS_BUCKET
  return `${bucket}/${safeFilename}`
}

export function getOriginalAbsolutePath({ eventId, filename }) {
  const relative = buildOriginalRelativePath({ eventId, filename })
  if (!relative) return null

  const targetPath = path.join(PRIVATE_ORIGINALS_DIR, ...splitRelativePath(relative))
  ensureDirSync(path.dirname(targetPath))
  return targetPath
}

export function buildOriginalStorageFields({ eventId, filename }) {
  const originalPath = buildOriginalRelativePath({ eventId, filename })
  return originalPath ? { originalPath } : {}
}

export function getDerivedAbsolutePath({ kind, watermark, filename, eventId = null }) {
  const relative = buildDerivedRelativePath({ kind, watermark, filename, eventId })
  if (!relative) return null
  const targetPath = path.join(PUBLIC_UPLOADS_DIR, ...splitRelativePath(relative))
  ensureDirSync(path.dirname(targetPath))
  return targetPath
}

export function getLegacyAbsolutePath(type, filename) {
  const safeFilename = sanitizeStoredFilename(filename)
  if (!safeFilename) return null

  if (type === 'wm') return path.join(PUBLIC_UPLOADS_DIR, `wm_${safeFilename}`)
  if (type === 'thumb') return path.join(LEGACY_PUBLIC_THUMBS_DIR, `thumb_${safeFilename}`)
  if (type === 'mini') return path.join(LEGACY_PUBLIC_THUMBS_DIR, `mini_${safeFilename.replace(/\.\w+$/, '.jpg')}`)
  if (type === 'cover') return path.join(LEGACY_PUBLIC_THUMBS_DIR, safeFilename)

  return null
}

export function buildPhotoStorageFields(filename, eventId = null) {
  const safeFilename = sanitizeStoredFilename(filename)
  if (!safeFilename) return {}
  return {
    filenameWm: `wm_${safeFilename}`,
    filenameThumb: `thumb_${safeFilename}`,
    filenameMini: `mini_${safeFilename.replace(/\.\w+$/, '.jpg')}`,
    ...buildPhotoPathFields(safeFilename, eventId),
  }
}

export function getPhotoManagedFiles(photo) {
  const files = []
  const seen = new Set()
  const safeFilename = sanitizeStoredFilename(photo?.filename)

  const originalPath = resolveOriginalPath(photo)
  addManagedFile(files, seen, {
    role: 'original',
    field: 'originalPath',
    absolutePath: originalPath,
  })

  const explicitFields = [
    'pathGridWm',
    'pathGridClean',
    'pathThumbWm',
    'pathThumbClean',
    'pathMiniWm',
    'pathMiniClean',
  ]
  for (const field of explicitFields) {
    addManagedFile(files, seen, {
      role: 'derived',
      field,
      absolutePath: getPublicPathFieldAbsolutePath(photo, field),
    })
  }

  if (safeFilename) {
    const photoEventId = photo?.eventId || null
    const derived = [
      ['pathGridWm', 'grid', 'wm'],
      ['pathGridClean', 'grid', 'clean'],
      ['pathThumbWm', 'thumbs', 'wm'],
      ['pathThumbClean', 'thumbs', 'clean'],
      ['pathMiniWm', 'mini', 'wm'],
      ['pathMiniClean', 'mini', 'clean'],
    ]
    for (const [field, kind, watermark] of derived) {
      // Per-event scoped path (canonical after migration)
      if (photoEventId) {
        addManagedFile(files, seen, {
          role: 'derived',
          field,
          absolutePath: getDerivedAbsolutePath({ kind, watermark, filename: safeFilename, eventId: photoEventId }),
        })
      }
      // Flat path (legacy pre-migration)
      addManagedFile(files, seen, {
        role: 'derived',
        field,
        absolutePath: getDerivedAbsolutePath({ kind, watermark, filename: safeFilename }),
      })
    }

    addManagedFile(files, seen, {
      role: 'legacy',
      field: 'filenameWm',
      absolutePath: getLegacyAbsolutePath('wm', safeFilename),
    })
    addManagedFile(files, seen, {
      role: 'legacy',
      field: 'filenameThumb',
      absolutePath: getLegacyAbsolutePath('thumb', safeFilename),
    })
    addManagedFile(files, seen, {
      role: 'legacy',
      field: 'filenameMini',
      absolutePath: getLegacyAbsolutePath('mini', safeFilename),
    })
  }

  addManagedFile(files, seen, {
    role: 'legacy',
    field: 'filenameWm',
    absolutePath: getLegacyPublicFieldAbsolutePath(photo, 'filenameWm'),
  })
  addManagedFile(files, seen, {
    role: 'legacy',
    field: 'filenameThumb',
    absolutePath: getLegacyPublicFieldAbsolutePath(photo, 'filenameThumb', 'thumbs'),
  })
  addManagedFile(files, seen, {
    role: 'legacy',
    field: 'filenameMini',
    absolutePath: getLegacyPublicFieldAbsolutePath(photo, 'filenameMini', 'thumbs'),
  })

  return files
}

export function movePhotoFilesToTrash(photo, { batchId }) {
  const safeBatchId = sanitizeOriginalBucket(batchId) || `trash_${Date.now()}`
  const batchRoot = path.join(MEDIA_TRASH_DIR, safeBatchId)
  const moved = []

  for (const file of getPhotoManagedFiles(photo)) {
    const relative = file.projectPath
    const targetPath = path.join(batchRoot, ...splitRelativePath(relative))
    const result = moveFileSync(file.absolutePath, targetPath)
    if (!result) continue
    moved.push({
      role: file.role,
      field: file.field,
      ...result,
    })
  }

  return moved
}

function preservePublicVariant(photo, { batchId, field, candidates, bucket }) {
  const sourcePath = candidates.find(candidate => candidate && fs.existsSync(candidate))
  if (!sourcePath) return null

  const sourceName = path.basename(sourcePath)
  const relativeTarget = `${PRESERVED_PUBLIC_RELATIVE_ROOT}/${batchId}/${bucket}/${sourceName}`
  const targetPath = path.join(PUBLIC_UPLOADS_DIR, ...splitRelativePath(relativeTarget))
  const result = moveFileSync(sourcePath, targetPath)
  if (!result) return null

  photo[field] = result.to.replace(/^public\/uploads\//, '')
  return {
    role: 'preserved-derived',
    field,
    ...result,
  }
}

export function movePhotoFilesToPreservedArea(photo, { batchId }) {
  const safeBatchId = sanitizeOriginalBucket(batchId) || `preserved_${Date.now()}`
  const updated = { ...photo }
  const moved = []
  const safeFilename = sanitizeStoredFilename(updated.filename)

  const eventId = updated?.eventId || null
  const eventScopedPath = (kind, watermark) => eventId
    ? getDerivedAbsolutePath({ kind, watermark, filename: safeFilename, eventId })
    : null

  const variants = safeFilename ? [
    {
      field: 'pathGridWm',
      bucket: 'grid-wm',
      candidates: [
        getPublicPathFieldAbsolutePath(updated, 'pathGridWm'),
        eventScopedPath('grid', 'wm'),
        getDerivedAbsolutePath({ kind: 'grid', watermark: 'wm', filename: safeFilename }),
        getLegacyPublicFieldAbsolutePath(updated, 'filenameWm'),
        getLegacyAbsolutePath('wm', safeFilename),
      ],
    },
    {
      field: 'pathGridClean',
      bucket: 'grid-clean',
      candidates: [
        getPublicPathFieldAbsolutePath(updated, 'pathGridClean'),
        eventScopedPath('grid', 'clean'),
        getDerivedAbsolutePath({ kind: 'grid', watermark: 'clean', filename: safeFilename }),
      ],
    },
    {
      field: 'pathThumbWm',
      bucket: 'thumb-wm',
      candidates: [
        getPublicPathFieldAbsolutePath(updated, 'pathThumbWm'),
        eventScopedPath('thumbs', 'wm'),
        getDerivedAbsolutePath({ kind: 'thumbs', watermark: 'wm', filename: safeFilename }),
        getLegacyPublicFieldAbsolutePath(updated, 'filenameThumb', 'thumbs'),
        getLegacyAbsolutePath('thumb', safeFilename),
      ],
    },
    {
      field: 'pathThumbClean',
      bucket: 'thumb-clean',
      candidates: [
        getPublicPathFieldAbsolutePath(updated, 'pathThumbClean'),
        eventScopedPath('thumbs', 'clean'),
        getDerivedAbsolutePath({ kind: 'thumbs', watermark: 'clean', filename: safeFilename }),
      ],
    },
    {
      field: 'pathMiniWm',
      bucket: 'mini-wm',
      candidates: [
        getPublicPathFieldAbsolutePath(updated, 'pathMiniWm'),
        eventScopedPath('mini', 'wm'),
        getDerivedAbsolutePath({ kind: 'mini', watermark: 'wm', filename: safeFilename }),
      ],
    },
    {
      field: 'pathMiniClean',
      bucket: 'mini-clean',
      candidates: [
        getPublicPathFieldAbsolutePath(updated, 'pathMiniClean'),
        eventScopedPath('mini', 'clean'),
        getDerivedAbsolutePath({ kind: 'mini', watermark: 'clean', filename: safeFilename }),
        getLegacyPublicFieldAbsolutePath(updated, 'filenameMini', 'thumbs'),
        getLegacyAbsolutePath('mini', safeFilename),
      ],
    },
  ] : []

  for (const variant of variants) {
    const result = preservePublicVariant(updated, {
      batchId: safeBatchId,
      field: variant.field,
      candidates: variant.candidates,
      bucket: variant.bucket,
    })
    if (result) moved.push(result)
  }

  const originalPath = resolveOriginalPath(updated)
  if (originalPath) {
    const originalName = path.basename(originalPath)
    const relativeOriginal = `${PRESERVED_ORIGINALS_BUCKET}/${safeBatchId}/${originalName}`
    const targetPath = path.join(PRIVATE_ORIGINALS_DIR, ...splitRelativePath(relativeOriginal))
    const result = moveFileSync(originalPath, targetPath)
    if (result) {
      updated.originalPath = relativeOriginal
      moved.push({
        role: 'preserved-original',
        field: 'originalPath',
        ...result,
      })
    }
  }

  return { photo: updated, files: moved }
}

export function purgeTrashFiles(fileEntries = []) {
  const purged = []
  for (const file of fileEntries) {
    const trashPath = file?.to ? path.join(ROOT, ...splitRelativePath(file.to)) : null
    if (!trashPath || !fs.existsSync(trashPath)) continue
    if (!isInsideDirectory(trashPath, MEDIA_TRASH_DIR)) {
      throw new Error(`unsafe_trash_purge:${trashPath}`)
    }
    const stat = fs.statSync(trashPath)
    fs.unlinkSync(trashPath)
    purged.push({
      path: projectRelativePath(trashPath),
      bytes: stat.size,
    })
  }
  return purged
}

export function buildCoverStorageFields(coverFilename, eventId = null) {
  const safeFilename = sanitizeStoredFilename(coverFilename)
  if (!safeFilename) return {}
  return {
    ...buildCoverPathFields(safeFilename, eventId),
  }
}

export function resolveOriginalPath(input, options = {}) {
  const isObjectInput = !!input && typeof input === 'object'
  const safeFilename = sanitizeStoredFilename(isObjectInput ? input.filename : input)
  if (!safeFilename) return null

  const explicitOriginalPath = isObjectInput
    ? input.originalPath
    : options?.originalPath
  const eventId = isObjectInput
    ? input.eventId
    : (typeof options === 'string' ? options : options?.eventId)

  const candidates = [
    explicitOriginalPath
      ? path.join(PRIVATE_ORIGINALS_DIR, ...splitRelativePath(explicitOriginalPath))
      : null,
    eventId
      ? path.join(PRIVATE_ORIGINALS_DIR, ...splitRelativePath(buildOriginalRelativePath({ eventId, filename: safeFilename })))
      : null,
    path.join(PRIVATE_ORIGINALS_DIR, ...splitRelativePath(buildOriginalRelativePath({ eventId: UNASSIGNED_ORIGINALS_BUCKET, filename: safeFilename }))),
    path.join(PRIVATE_ORIGINALS_DIR, safeFilename),
    path.join(LEGACY_PRIVATE_ORIGINALS_DIR, safeFilename),
    path.join(PUBLIC_UPLOADS_DIR, safeFilename),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export async function moveOriginalToEvent({ filename, eventId, currentPath = null }) {
  const safeFilename = sanitizeStoredFilename(filename)
  const safeEventId = sanitizeOriginalBucket(eventId)
  if (!safeFilename || !safeEventId) return null

  const sourcePath = currentPath || resolveOriginalPath({ filename: safeFilename })
  if (!sourcePath || !fs.existsSync(sourcePath)) return null

  const targetPath = getOriginalAbsolutePath({ eventId: safeEventId, filename: safeFilename })
  if (!targetPath) return null

  if (path.resolve(sourcePath) === path.resolve(targetPath)) {
    return targetPath
  }

  if (fs.existsSync(targetPath)) {
    const sourceStat = fs.statSync(sourcePath)
    const targetStat = fs.statSync(targetPath)
    if (sourceStat.size === targetStat.size) {
      await fs.promises.unlink(sourcePath)
      return targetPath
    }
    throw new Error(`original_collision:${safeEventId}/${safeFilename}`)
  }

  ensureDirSync(path.dirname(targetPath))
  await fs.promises.rename(sourcePath, targetPath)
  return targetPath
}
