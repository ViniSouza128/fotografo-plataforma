import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { ensurePhotoDerivedVariant } from '@/lib/imageDerivatives'
import { PUBLIC_UPLOADS_DIR, sanitizeStoredFilename } from '@/lib/imageStorage'
import { sanitizeEventBucket } from '@/lib/imagePaths'

export const dynamic = 'force-dynamic'

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
}

function toPosixParts(parts) {
  return (Array.isArray(parts) ? parts : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function isSafeUploadsParts(parts) {
  return parts.length > 0 && parts.every((part) => {
    if (!part || part === '.' || part === '..') return false
    return !part.includes('\\') && !part.includes('/')
  })
}

function buildUploadsAbsolutePath(parts) {
  if (!isSafeUploadsParts(parts)) return null
  const targetPath = path.join(PUBLIC_UPLOADS_DIR, ...parts)
  const resolvedRoot = path.resolve(PUBLIC_UPLOADS_DIR)
  const resolvedTarget = path.resolve(targetPath)
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) return null
  return resolvedTarget
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_BY_EXT[ext] || 'application/octet-stream'
}

async function serveLocalFile(filePath) {
  const buffer = await fs.promises.readFile(filePath)
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

function parseDerivedPath(parts) {
  if (parts.length === 4) {
    const [kind, watermark, filename] = parts.slice(1)
    return {
      eventId: sanitizeEventBucket(parts[0]),
      kind,
      watermark,
      filename: sanitizeStoredFilename(filename),
    }
  }

  if (parts.length === 3) {
    const [kind, watermark, filename] = parts
    return {
      eventId: null,
      kind,
      watermark,
      filename: sanitizeStoredFilename(filename),
    }
  }

  return null
}

async function ensureDerivedIfPossible(parts) {
  const parsed = parseDerivedPath(parts)
  if (!parsed?.filename) return false
  if (!['grid', 'thumbs', 'mini'].includes(parsed.kind)) return false
  if (!['wm', 'clean'].includes(parsed.watermark)) return false

  const result = await ensurePhotoDerivedVariant(parsed).catch(() => null)
  return !!result?.ok
}

export async function GET(_request, context) {
  const parts = toPosixParts(context?.params?.path)
  const absolutePath = buildUploadsAbsolutePath(parts)

  if (!absolutePath) {
    return new NextResponse('Not found', { status: 404 })
  }

  if (fs.existsSync(absolutePath)) {
    return await serveLocalFile(absolutePath)
  }

  const ensured = await ensureDerivedIfPossible(parts)
  if (ensured && fs.existsSync(absolutePath)) {
    return await serveLocalFile(absolutePath)
  }

  return new NextResponse('Not found', { status: 404 })
}
