import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { ensurePhotoDerivedVariant } from '@/lib/imageDerivatives'
import { sanitizeStoredFilename } from '@/lib/imageStorage'
import { sanitizeEventBucket } from '@/lib/imagePaths'
import {
  getUploadsRoots,
  inspectSafeUploadsFile,
  normalizeUploadsRequestParts,
  resolveUploadsRequestPath,
} from '@/lib/uploadsSecurity'

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
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
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
  const normalized = normalizeUploadsRequestParts(context?.params?.path)
  if (!normalized.ok) {
    return new NextResponse('Bad request', { status: 400 })
  }

  const roots = getUploadsRoots()
  for (const root of roots) {
    const absolutePath = resolveUploadsRequestPath(normalized.parts, { root })
    if (!absolutePath) return new NextResponse('Forbidden', { status: 403 })
    const inspected = await inspectSafeUploadsFile(absolutePath, root)
    if (inspected.ok) {
      return await serveLocalFile(inspected.filePath)
    }
    if (inspected.status === 403) {
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  const ensured = await ensureDerivedIfPossible(normalized.parts)
  if (ensured) {
    const primaryPath = resolveUploadsRequestPath(normalized.parts, { root: roots[0] })
    const inspected = primaryPath ? await inspectSafeUploadsFile(primaryPath, roots[0]) : null
    if (inspected?.ok) return await serveLocalFile(inspected.filePath)
  }

  return new NextResponse('Not found', { status: 404 })
}
