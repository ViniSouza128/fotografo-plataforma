import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getWatermarkRegenerationState, startWatermarkRegeneration } from '@/lib/watermarkRegenerationJob'

export async function GET() {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    return NextResponse.json(getWatermarkRegenerationState())
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'erro' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    let payload = {}
    try {
      payload = await request.json()
    } catch {}

    const eventIds = Array.isArray(payload?.eventIds) ? payload.eventIds.filter(Boolean) : null
    const overlay = !!payload?.overlay
    const forceRegenerate = payload?.forceRegenerate !== false

    const result = startWatermarkRegeneration({ eventIds, overlay, forceRegenerate })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: 'Erro: ' + err.message }, { status: 500 })
  }
}
