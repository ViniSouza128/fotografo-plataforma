import { NextResponse } from 'next/server'
import { ensurePhotoDerivedVariant } from '@/lib/imageDerivatives'

function validateKind(value) {
  return ['grid', 'thumbs', 'mini'].includes(value)
}

function validateWatermark(value) {
  return ['wm', 'clean'].includes(value)
}

function validateVariant(kind, watermark) {
  if (!validateKind(kind) || !validateWatermark(watermark)) return false
  if (kind === 'mini' && watermark !== 'clean') return false
  return true
}

export async function GET(request) {
  try {
    const { searchParams, origin } = new URL(request.url)
    const filename = searchParams.get('filename')
    const kind = searchParams.get('kind')
    const watermark = searchParams.get('watermark')
    const eventId = searchParams.get('eventId') || null
    const mode = searchParams.get('mode')

    if (!filename || !validateVariant(kind, watermark)) {
      return NextResponse.json({ error: 'invalid_parameters' }, { status: 400 })
    }

    const result = await ensurePhotoDerivedVariant({ filename, kind, watermark, eventId })
    if (!result?.ok || !result?.url) {
      return NextResponse.json({ error: result?.reason || 'not_available' }, { status: 404 })
    }

    if (mode === 'ensure') {
      return NextResponse.json({
        ok: true,
        generated: !!result.generated,
        url: result.url,
      })
    }

    return NextResponse.redirect(new URL(result.url, origin), 307)
  } catch (error) {
    console.error('Erro ao derivar imagem sob demanda:', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
