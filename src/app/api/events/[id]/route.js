// src/app/api/events/[id]/route.js
// API para buscar, atualizar e deletar um evento especÃ­fico

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { readEvents, writeEvents } from '@/lib/events'
import { readPhotos } from '@/lib/photos'
import { readPedidos } from '@/lib/pedidos'
import { getPedidoItens, getPedidoItemPhotoId } from '@/lib/commerceUtils'
import { applyEventStrategy, analyzeEvent } from '@/lib/safeDeletion'
import { moveOriginalToEvent } from '@/lib/imageStorage'
import { PRICE_MIN, PRICE_MAX } from '@/lib/price'
import { appendAuditLog } from '@/lib/auditLog'
import { canManageEvent } from '@/lib/colaborador'

function sanitizeWatermarkConfig(raw) {
  if (!raw || typeof raw !== 'object') return null
  const allowed = [
    'watermarkOpacity',
    'watermarkPosition',
    'watermarkAnchor',
    'watermarkSizeMode',
    'watermarkOffsetX',
    'watermarkOffsetY',
    'watermarkScalePercent',
    'watermarkVariants',
  ]
  const payload = {}
  for (const key of allowed) {
    if (raw[key] !== undefined) payload[key] = raw[key]
  }
  if (raw.watermarkVariants && typeof raw.watermarkVariants === 'object') {
    payload.watermarkVariants = {
      grid: { ...(raw.watermarkVariants.grid || {}) },
      thumbs: { ...(raw.watermarkVariants.thumbs || {}) },
      mini: { ...(raw.watermarkVariants.mini || {}) },
      covers: { ...(raw.watermarkVariants.covers || {}) },
      video: { ...(raw.watermarkVariants.video || {}) },
    }
  }
  return payload
}

// GET /api/events/[id] â€” retorna um evento pelo ID com stats opcionais
export async function GET(request, { params }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const incluirRemovido = searchParams.get('incluirRemovido') === '1'

    let authPayload = null
    if (incluirRemovido || searchParams.get('stats') === '1') {
      const auth = await requireAuth({ requireAdmin: true })
      if (auth.error) {
        return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
      }
      authPayload = auth.payload
    }

    const events = readEvents()
    const event = events.find(e => e.id === id)

    if (!event || (event.removido && !incluirRemovido)) {
      return NextResponse.json({ error: 'Evento nÃ£o encontrado' }, { status: 404 })
    }

    if (authPayload?.isColaborador && !canManageEvent(authPayload, event)) {
      return NextResponse.json({ error: 'Sem permissão para este evento.' }, { status: 403 })
    }

    const normalizedEvent = { ...event, albumGratis: !!event.albumGratis }
    normalizedEvent.watermarkOverride = !!event.watermarkOverride
    normalizedEvent.watermarkAsset = event.watermarkAsset || null
    normalizedEvent.watermarkConfig = event.watermarkConfig || null

    if (searchParams.get('stats') === '1') {
      const photos = readPhotos().filter(p => p.eventId === id && !p.removida && !p.orfaoFuncional)
      const PAID_STATUSES = new Set(['pago', 'liberado_manual'])
      const pedidos = readPedidos().filter(p => PAID_STATUSES.has(p.status))
      const fotosVendidas = new Set()
      let faturamento = 0
      let totalVendas = 0

      for (const pedido of pedidos) {
        const itensEvento = getPedidoItens(pedido).filter(i => i.eventId === id)
        if (itensEvento.length > 0) {
          totalVendas++
          for (const item of itensEvento) {
            const photoId = getPedidoItemPhotoId(item)
            if (photoId) fotosVendidas.add(photoId)
            faturamento += Number(item.price) || 0
          }
        }
      }

      event._stats = {
        totalFotos: photos.length,
        fotosVendidas: fotosVendidas.size,
        faturamento,
        totalVendas,
        ticketMedio: totalVendas > 0 ? faturamento / totalVendas : 0,
      }
    }

    if (event._stats) {
      normalizedEvent._stats = event._stats
    }

    return NextResponse.json(normalizedEvent)
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar evento' }, { status: 500 })
  }
}

// PATCH /api/events/[id] â€” atualiza campos de um evento
export async function PATCH(request, { params }) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const { id } = await params
    const body = await request.json()
    const events = readEvents()
    const index = events.findIndex(e => e.id === id)

    if (index === -1) {
      return NextResponse.json({ error: 'Evento nÃ£o encontrado' }, { status: 404 })
    }
    if (auth.payload.isColaborador && !canManageEvent(auth.payload, events[index])) {
      return NextResponse.json({ error: 'Sem permissão para este evento.' }, { status: 403 })
    }
    const before = JSON.parse(JSON.stringify(events[index]))

    if (body.precoFotoPadrao !== undefined) {
      const num = body.precoFotoPadrao === null ? null : Number(body.precoFotoPadrao)
      if (num !== null && (!Number.isFinite(num) || num < 0 || num > PRICE_MAX || (num > 0 && num < PRICE_MIN))) {
        return NextResponse.json({ error: 'PreÃ§o padrÃ£o fora da faixa permitida.' }, { status: 400 })
      }
      body.precoFotoPadrao = num
    }
    if (body.precoVideoPadrao !== undefined) {
      const num = body.precoVideoPadrao === null ? null : Number(body.precoVideoPadrao)
      if (num !== null && (!Number.isFinite(num) || num < 0 || num > PRICE_MAX || (num > 0 && num < PRICE_MIN))) {
        return NextResponse.json({ error: 'Preço de vídeo fora da faixa permitida.' }, { status: 400 })
      }
      body.precoVideoPadrao = num
    }
    if (body.albumGratis !== undefined) {
      body.albumGratis = !!body.albumGratis
    }

    const allowedFields = [
      'name', 'date', 'dataFinal', 'description', 'coverImage', 'coverImageThumb',
      'visibilidade', 'categoria', 'horarioInicial', 'horarioFinal',
      'cidade', 'estado', 'localEspecifico', 'organizador',
      'precoFotoPadrao', 'precoVideoPadrao', 'descontosProgressivos', 'descontosProgressivosAtivos',
      'usarDescontosGlobais',
      // Descontos progressivos para vídeos (separados das fotos)
      'descontosVideoProgressivos', 'descontosVideoProgressivosAtivos', 'usarDescontosVideoGlobais',
      'capaPersonalizadaUrl', 'usarCapaPersonalizada',
      'pastasCapas', 'patrocinadores',
      // Marca d'água por álbum
      'wm_capa',       // boolean — exibir WM na capa (default false)
      'wm_miniaturas', // boolean — exibir WM nas miniaturas (default true)
      'watermarkOverride',
      'watermarkAsset',
      'watermarkConfig',
      // Arquivo de capa gerado (480px sem WM, salvo em /uploads/thumbs/)
      'coverImageFile',
      'coverImagePathWm',
      'coverImagePathClean',
      'albumGratis',
    ]
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'watermarkOverride') {
          events[index][field] = !!body[field]
        } else if (field === 'watermarkConfig') {
          events[index][field] = sanitizeWatermarkConfig(body[field])
        } else if (field === 'patrocinadores') {
          // Saneamento e ordenação consistente
          try {
            const { normalizeSponsor, sortSponsors } = await import('@/lib/sponsors')
            const arr = Array.isArray(body.patrocinadores) ? body.patrocinadores : []
            events[index][field] = sortSponsors(arr.map(p => normalizeSponsor(p)))
          } catch {
            events[index][field] = Array.isArray(body[field]) ? body[field] : []
          }
        } else {
          events[index][field] = body[field]
        }
      }
    }

    if (events[index].coverImage) {
      try {
        await moveOriginalToEvent({ filename: events[index].coverImage, eventId: id })
      } catch (error) {
        console.error('Erro ao mover original da capa do evento:', error)
      }
    }

    events[index].atualizadoEm = new Date().toISOString()
    writeEvents(events)

    const changedFields = allowedFields.filter(field => body[field] !== undefined)
    if (changedFields.length > 0) {
      appendAuditLog({
        action: 'event.updated',
        actor: auth.client || auth.payload,
        target: { type: 'event', id: events[index].id, publicId: events[index].publicId, label: events[index].name },
        details: {
          changedFields,
          price: body.precoFotoPadrao !== undefined
            ? { from: before.precoFotoPadrao ?? null, to: events[index].precoFotoPadrao ?? null }
            : undefined,
          watermarkChanged: changedFields.some(field => field.startsWith('wm_') || field.startsWith('watermark')),
          albumGratis: body.albumGratis !== undefined
            ? { from: !!before.albumGratis, to: !!events[index].albumGratis }
            : undefined,
        },
        request,
      })
    }

    return NextResponse.json(events[index])
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao atualizar evento' }, { status: 500 })
  }
}

// DELETE /api/events/[id] â€” remove um evento
export async function DELETE(request, { params }) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const modo = searchParams.get('estrategia') || searchParams.get('modo') || null
    let body = {}
    try {
      body = await request.json()
    } catch {}

    const estrategia = body.estrategia || modo
    const decisions = body.decisoes || {}
    const permanent = body.permanente === true || body.permanent === true || searchParams.get('permanente') === '1'

    const analysis = analyzeEvent(id)
    if (!analysis.event) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 })
    }
    if (auth.payload.isColaborador && !canManageEvent(auth.payload, analysis.event)) {
      return NextResponse.json({ error: 'Sem permissão para este evento.' }, { status: 403 })
    }

    const temVinculos = analysis.totalImportantes > 0
    if (permanent && temVinculos) {
      return NextResponse.json(
        {
          requiresDecision: true,
          reason: 'permanent_not_safe',
          analysis,
          message: 'Exclusao definitiva bloqueada: existem midias com compras, carrinhos, favoritos ou curtidas.',
        },
        { status: 409 }
      )
    }

    if (temVinculos && !estrategia) {
      return NextResponse.json(
        { requiresDecision: true, analysis, message: 'Existem midias com compras, carrinhos, favoritos ou curtidas.' },
        { status: 409 }
      )
    }

    const result = applyEventStrategy({
      eventId: id,
      strategy: estrategia || 'agressivo',
      decisions,
      permanent,
    })

    if (result.rejectedPermanent) {
      return NextResponse.json(
        {
          requiresDecision: true,
          reason: 'permanent_not_safe',
          analysis: result.analysis,
          message: result.message,
        },
        { status: 409 }
      )
    }

    appendAuditLog({
      action: permanent ? 'event.permanent_delete' : 'event.deleted',
      actor: auth.client || auth.payload,
      target: { type: 'event', id, publicId: analysis.event?.publicId || null, label: analysis.event?.name || null },
      details: {
        strategy: estrategia || 'agressivo',
        permanent,
        totalPhotos: analysis.total || analysis.ids?.length || null,
        removed: result.removed || 0,
        preserved: result.preserved || 0,
        trashBatchId: result.trashBatchId || null,
      },
      request,
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('Erro ao deletar evento:', error)
    return NextResponse.json({ error: 'Erro ao deletar evento' }, { status: 500 })
  }
}
