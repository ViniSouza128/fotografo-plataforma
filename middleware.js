import { NextResponse } from 'next/server'

const SAFE_ROOT_PREFIXES = ['wm_', 'thumb_', 'mini_', 'preview_']

const EVENT_BUCKET_REGEX = /^[a-zA-Z0-9._-]+$/

const PER_EVENT_KIND_PATTERN = /^(?:grid|thumbs|mini|covers)\/(?:wm|clean)\//

function isPublicDerivative(relativePath) {
  if (!relativePath) return false
  if (relativePath.startsWith('thumbs/')) return true
  if (relativePath.startsWith('video-posters/')) return true
  if (relativePath.startsWith('sponsors/')) return true

  // Per-event paths: <eventId>/<grid|thumbs|mini|covers>/<wm|clean>/<file>
  const slashIdx = relativePath.indexOf('/')
  if (slashIdx > 0) {
    const head = relativePath.slice(0, slashIdx)
    const tail = relativePath.slice(slashIdx + 1)
    if (EVENT_BUCKET_REGEX.test(head) && PER_EVENT_KIND_PATTERN.test(tail)) {
      return true
    }
    // Capa personalizada por evento (cover_custom_*)
    if (EVENT_BUCKET_REGEX.test(head) && /^cover_custom_/.test(tail)) {
      return true
    }
  }

  // Layout flat legado: grid/wm/<file>, thumbs/clean/<file>, etc.
  if (PER_EVENT_KIND_PATTERN.test(relativePath)) return true

  const fileName = relativePath.split('/').pop() || ''
  return SAFE_ROOT_PREFIXES.some(prefix => fileName.startsWith(prefix))
}

export function middleware(request) {
  const { pathname, searchParams } = request.nextUrl

  if (pathname === '/_next/image') {
    const imageUrl = searchParams.get('url') || ''
    if (!imageUrl.startsWith('/uploads/')) {
      return NextResponse.next()
    }

    const relativePath = imageUrl.slice('/uploads/'.length)
    if (isPublicDerivative(relativePath)) {
      return NextResponse.next()
    }

    return new NextResponse('Not Found', { status: 404 })
  }

  if (!pathname.startsWith('/uploads/')) {
    return NextResponse.next()
  }

  const relativePath = pathname.slice('/uploads/'.length)
  if (isPublicDerivative(relativePath)) {
    return NextResponse.next()
  }

  return new NextResponse('Not Found', { status: 404 })
}

export const config = {
  matcher: ['/uploads/:path*', '/_next/image'],
}
