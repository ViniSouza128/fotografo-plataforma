// src/app/api/reconhecimento/indexar/route.js
// POST (admin): indexa fotos.
// Body:
//   { eventId } -> indexa todas as fotos do evento
//   { photoIds: [] } -> indexa lista
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { readPhotos } from '@/lib/photos'
import { readEvents } from '@/lib/events'
import { canManageEvent } from '@/lib/colaborador'
import { indexPhotos } from '@/lib/vision'
import { readVisionConfig } from '@/lib/vision/storage'
import { appendAuditLog } from '@/lib/auditLog'

export async function POST(request) {
  try {
    const auth = await requireAuth({ requireSuperAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const cfg = readVisionConfig()
    if (!cfg.ativo) {
      return NextResponse.json({ error: 'Reconhecimento está desativado nas configurações.' }, { status: 400 })
    }

    const body = await request.json()
    const { eventId, photoIds } = body || {}

    let photos = readPhotos().filter(p => !p.removida)
    let event = null

    if (eventId) {
      event = readEvents().find(ev => ev.id === eventId) || null
      if (!event) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 })
      if (auth.payload.isColaborador && !canManageEvent(auth.payload, event)) {
        return NextResponse.json({ error: 'Sem permissão para este evento.' }, { status: 403 })
      }
      photos = photos.filter(p => p.eventId === eventId)
    } else if (Array.isArray(photoIds) && photoIds.length > 0) {
      const set = new Set(photoIds)
      photos = photos.filter(p => set.has(p.id))
      if (auth.payload.isColaborador) {
        const events = readEvents()
        const okIds = new Set(events.filter(ev => ev.colaboradorId === auth.payload.id).map(ev => ev.id))
        photos = photos.filter(p => okIds.has(p.eventId))
      }
    } else {
      return NextResponse.json({ error: 'Forneça eventId ou photoIds.' }, { status: 400 })
    }

    if (photos.length === 0) {
      return NextResponse.json({ ok: true, indexed: 0, results: [] })
    }

    // Limite de proteção: 200 por chamada
    if (photos.length > 200) {
      return NextResponse.json({
        error: `Lote muito grande (${photos.length}). Máximo 200 por requisição.`,
      }, { status: 400 })
    }

    const results = await indexPhotos(photos, { event })
    const okCount = results.filter(r => r.ok).length

    appendAuditLog({
      action: 'vision.indexed',
      actor: auth.client || auth.payload,
      target: { type: 'vision', id: eventId || `lote(${photos.length})` },
      details: { eventId, count: photos.length, ok: okCount, engine: cfg.engine },
      request,
    })

    return NextResponse.json({ ok: true, indexed: okCount, total: photos.length, results })
  } catch (err) {
    console.error('[vision indexar] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
