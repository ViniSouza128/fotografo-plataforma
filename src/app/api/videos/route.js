// src/app/api/videos/route.js
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireAuth } from '@/lib/apiAuth'
import {
  readVideos,
  writeVideos,
  appendVideo,
  updateVideo,
  buildPublicVideoId,
  isAllowedResolution,
  listVideosByEvent,
} from '@/lib/videos'
import { readEvents } from '@/lib/events'
import { canManageEvent, getColaboradorId } from '@/lib/colaborador'
import { PRICE_MIN, PRICE_MAX } from '@/lib/price'
import { appendAuditLog } from '@/lib/auditLog'
import { enqueueJob } from '@/lib/jobsQueue'
import { ensureJobsBootstrapped } from '@/lib/jobsBootstrap'

function validatePrice(p) {
  if (p === null || p === undefined || p === '') return false
  const num = Number(p)
  if (!Number.isFinite(num)) return false
  if (num < 0 || num > PRICE_MAX) return false
  if (num > 0 && num < PRICE_MIN) return false
  return true
}

function isPriceProvided(p) {
  return p !== undefined && p !== null && p !== ''
}

// GET /api/videos?eventId=xxx
//     /api/videos?ids=a,b,c
//     /api/videos?incluirRemovidas=1 (admin)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')
    const ids = searchParams.get('ids')
    const incluirRemovidas = searchParams.get('incluirRemovidas') === '1'

    if (incluirRemovidas) {
      const auth = await requireAuth({ requireAdmin: true })
      if (auth.error) {
        return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
      }
    }

    let rows = readVideos()
    if (eventId) rows = rows.filter(v => v.eventId === eventId)
    if (ids) {
      const set = new Set(ids.split(',').map(s => s.trim()).filter(Boolean))
      rows = rows.filter(v => set.has(v.id))
    }
    if (!incluirRemovidas) rows = rows.filter(v => !v.removida)
    rows.sort((a, b) => {
      const ta = new Date(a.takenAt || a.createdAt || 0).getTime()
      const tb = new Date(b.takenAt || b.createdAt || 0).getTime()
      return tb - ta
    })
    return NextResponse.json(rows)
  } catch (err) {
    console.error('[videos] GET error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// POST /api/videos — registra um vídeo após upload
// Body: {
//   eventId, filename, originalName, originalPath, size,
//   width?, height?, duration?, takenAt?,
//   posterClean?, posterWm?,
//   price, rawPrice?, supportsRawDelivery?, rawDeliveryNote?,
//   resolutions?: [{ label, filename, size, width?, height? }]
// }
export async function POST(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const body = await request.json()
    const {
      eventId, filename, originalName, originalPath, size,
      width = null, height = null, duration = null, takenAt = null,
      posterClean = null, posterWm = null,
      price, rawPrice, supportsRawDelivery = false, rawDeliveryNote = null,
      resolutions = [],
      pasta = null,
      previewWmFilename = null,
      previewWmStatus = null,
    } = body || {}

    if (!eventId || !filename || !originalPath) {
      return NextResponse.json({ error: 'eventId, filename, originalPath obrigatórios.' }, { status: 400 })
    }
    if (isPriceProvided(price) && !validatePrice(price)) {
      return NextResponse.json({ error: 'Preço fora da faixa.' }, { status: 400 })
    }
    if (isPriceProvided(rawPrice) && !validatePrice(rawPrice)) {
      return NextResponse.json({ error: 'rawPrice fora da faixa.' }, { status: 400 })
    }

    const event = readEvents().find(ev => ev.id === eventId)
    if (!event) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 })

    if (auth.payload.isColaborador && !canManageEvent(auth.payload, event)) {
      return NextResponse.json({ error: 'Sem permissão para este evento.' }, { status: 403 })
    }

    const cleanResolutions = Array.isArray(resolutions)
      ? resolutions
        .filter(r => r && isAllowedResolution(r.label) && r.filename)
        .map(r => ({
          label: r.label,
          filename: r.filename,
          size: Number(r.size) || null,
          width: r.width != null ? Number(r.width) : null,
          height: r.height != null ? Number(r.height) : null,
        }))
      : []

    const novo = {
      id: crypto.randomUUID(),
      publicId: buildPublicVideoId(),
      eventId,
      filename,
      originalName: originalName || filename,
      originalPath,
      size: Number(size) || null,
      width: width != null ? Number(width) : null,
      height: height != null ? Number(height) : null,
      duration: duration != null ? Number(duration) : null,
      takenAt: takenAt || null,
      author: auth.client?.nomeCompleto || auth.client?.email || 'Admin',
      pasta: pasta || null,
      posterClean: posterClean || null,
      posterWm: posterWm || null,
      previewWmFilename: previewWmFilename || null,
      previewWmStatus: previewWmStatus || (previewWmFilename ? 'ready' : 'pending'),
      price: isPriceProvided(price) && validatePrice(price) ? Number(price) : null,
      rawPrice: isPriceProvided(rawPrice) && validatePrice(rawPrice) ? Number(rawPrice) : null,
      supportsRawDelivery: !!supportsRawDelivery,
      rawDeliveryNote: rawDeliveryNote || null,
      resolutions: cleanResolutions,
      edited: { entregue: false, entregueEm: null, filename: null, size: null, width: null, height: null, resolutions: [] },
      colaboradorId: getColaboradorId(auth.payload) || null,
      removida: false,
      removidaEm: null,
      vendida: false,
      createdAt: new Date().toISOString(),
    }
    appendVideo(novo)

    // Enfileira jobs em segundo plano:
    //  - poster (clean + wm) — também atualiza posterClean/posterWm no registro
    //  - preview MP4 com WM via ffmpeg
    // Worker processa em ordem de chegada e sobrevive a reinício do servidor.
    try {
      ensureJobsBootstrapped()
      enqueueJob('video-poster', { videoId: novo.id }, { dedupeKey: `vp:${novo.id}` })
      enqueueJob('video-preview-wm', { videoId: novo.id }, { dedupeKey: `vw:${novo.id}` })
    } catch (err) {
      console.error('[videos POST] falha ao enfileirar jobs:', err)
    }

    appendAuditLog({
      action: 'video.created',
      actor: auth.client || auth.payload,
      target: { type: 'video', id: novo.id, publicId: novo.publicId, label: novo.originalName },
      details: { eventId, price: novo.price, supportsRawDelivery: novo.supportsRawDelivery },
      request,
    })

    return NextResponse.json(novo, { status: 201 })
  } catch (err) {
    console.error('[videos] POST error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// PATCH /api/videos
// Body: { id, ...patch }
//   patch: price, rawPrice, supportsRawDelivery, rawDeliveryNote, pasta,
//          posterClean, posterWm, removida, takenAt, edited (parcial),
//          appendResolution: { label, filename, size, width, height, target: 'original'|'edited' }
export async function PATCH(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    const body = await request.json()
    const { id, appendResolution, ...patch } = body || {}
    if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })

    const all = readVideos()
    const idx = all.findIndex(v => v.id === id)
    if (idx === -1) return NextResponse.json({ error: 'Vídeo não encontrado.' }, { status: 404 })
    const target = all[idx]

    const events = readEvents()
    const event = events.find(ev => ev.id === target.eventId)
    if (auth.payload.isColaborador) {
      if (!event || !canManageEvent(auth.payload, event) || target.colaboradorId !== auth.payload.id) {
        return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
      }
    }

    if (isPriceProvided(patch.price) && !validatePrice(patch.price)) {
      return NextResponse.json({ error: 'Preço fora da faixa.' }, { status: 400 })
    }
    if (isPriceProvided(patch.rawPrice) && !validatePrice(patch.rawPrice)) {
      return NextResponse.json({ error: 'rawPrice fora da faixa.' }, { status: 400 })
    }

    const allowed = [
      'price', 'rawPrice', 'supportsRawDelivery', 'rawDeliveryNote', 'pasta',
      'posterClean', 'posterWm', 'removida', 'takenAt', 'gratis',
      'previewWmFilename', 'previewWmStatus',
    ]
    for (const k of allowed) {
      if (patch[k] !== undefined) {
        if (k === 'removida') {
          target.removida = !!patch[k]
          target.removidaEm = patch[k] ? new Date().toISOString() : null
        } else {
          target[k] = patch[k]
        }
      }
    }

    if (patch.edited && typeof patch.edited === 'object') {
      const prev = target.edited || {}
      target.edited = {
        ...prev,
        ...patch.edited,
        entregue: patch.edited.entregue !== undefined ? !!patch.edited.entregue : prev.entregue,
        entregueEm: patch.edited.entregue && !prev.entregueEm ? new Date().toISOString() : (prev.entregueEm || null),
      }
    }

    if (appendResolution && typeof appendResolution === 'object') {
      const { label, filename, size, width = null, height = null, target: targetField = 'original' } = appendResolution
      if (!isAllowedResolution(label) || !filename) {
        return NextResponse.json({ error: 'Resolução ou filename inválido.' }, { status: 400 })
      }
      const entry = { label, filename, size: Number(size) || null, width: width != null ? Number(width) : null, height: height != null ? Number(height) : null }
      if (targetField === 'edited') {
        const prev = target.edited || { resolutions: [] }
        const list = Array.isArray(prev.resolutions) ? prev.resolutions : []
        target.edited = { ...prev, resolutions: [...list.filter(r => r.label !== entry.label), entry] }
      } else {
        const list = Array.isArray(target.resolutions) ? target.resolutions : []
        target.resolutions = [...list.filter(r => r.label !== entry.label), entry]
      }
    }

    target.atualizadoEm = new Date().toISOString()
    all[idx] = target
    writeVideos(all)

    appendAuditLog({
      action: 'video.updated',
      actor: auth.client || auth.payload,
      target: { type: 'video', id: target.id, publicId: target.publicId, label: target.originalName },
      details: { changedKeys: Object.keys(body || {}).filter(k => k !== 'id') },
      request,
    })

    return NextResponse.json(target)
  } catch (err) {
    console.error('[videos] PATCH error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// DELETE /api/videos?id=xxx — soft delete
export async function DELETE(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })

    const all = readVideos()
    const idx = all.findIndex(v => v.id === id)
    if (idx === -1) return NextResponse.json({ error: 'Vídeo não encontrado.' }, { status: 404 })

    const events = readEvents()
    const event = events.find(ev => ev.id === all[idx].eventId)
    if (auth.payload.isColaborador) {
      if (!event || !canManageEvent(auth.payload, event) || all[idx].colaboradorId !== auth.payload.id) {
        return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
      }
    }

    all[idx].removida = true
    all[idx].removidaEm = new Date().toISOString()
    writeVideos(all)

    appendAuditLog({
      action: 'video.deleted',
      actor: auth.client || auth.payload,
      target: { type: 'video', id: all[idx].id, publicId: all[idx].publicId, label: all[idx].originalName },
      request,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[videos] DELETE error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
