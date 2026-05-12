// src/app/api/photos/route.js

import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { readPhotos, writePhotos } from '../../../lib/photos'
import { generatePhotoId } from '../../../lib/id'
import { getPhotoDuplicateKey } from '../../../lib/commerceUtils'
import { buildOriginalStorageFields, buildPhotoStorageFields } from '@/lib/imageStorage'
import { withResolvedPhotoUrls } from '@/lib/imagePaths'
import { requireAuth } from '@/lib/apiAuth'
import { readEvents } from '@/lib/events'
import { PRICE_MIN, PRICE_MAX } from '@/lib/price'
import { applyPhotoStrategy, analyzePhotos } from '@/lib/safeDeletion'
import { withFreeFlags } from '@/lib/freeAccess'
import {
  analyzeCartPriceImpact,
  applyCartPriceDecision,
  CART_PRICE_DECISION_PRESERVE,
  CART_PRICE_DECISION_UPDATE,
} from '@/lib/cartPricePolicy'
import { appendAuditLog } from '@/lib/auditLog'
import { canManagePhoto, canManageEvent, getColaboradorId } from '@/lib/colaborador'
import { enqueueJob } from '@/lib/jobsQueue'
import { ensureJobsBootstrapped } from '@/lib/jobsBootstrap'

// GET /api/photos?eventId=xxx
// ?incluirRemovidas=1 Ã¢â€ â€™ inclui fotos marcadas como removidas (uso admin)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')
    const idsParam = searchParams.get('ids')
    const pasta = searchParams.get('pasta')
    const limit = Number(searchParams.get('limit') || 0)
    const incluirRemovidas = searchParams.get('incluirRemovidas') === '1'
    const incluirOrfaos = searchParams.get('incluirOrfaos') === '1'

    if (incluirRemovidas) {
      const auth = await requireAuth({ requireAdmin: true })
      if (auth.error) {
        return NextResponse.json(
          { error: auth.error, code: auth.code || 'nao_autorizado' },
          { status: auth.status }
        )
      }
    }

    const publicIdParam = searchParams.get('publicId')

    let photos = readPhotos()
    if (publicIdParam) {
      const pid = String(publicIdParam).trim()
      photos = photos.filter(p => String(p.publicId || '').includes(pid))
      if (!incluirRemovidas) photos = photos.filter(p => !p.removida)
      photos = photos.filter(p => !p.orfaoFuncional && !p.ocultarDoAlbum)
      photos.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      if (!Number.isNaN(limit) && limit > 0) photos = photos.slice(0, limit)
      const eventsMap = new Map(readEvents().map(ev => [ev.id, ev]))
      return NextResponse.json(photos.map(p => withResolvedPhotoUrls(withFreeFlags(p, eventsMap.get(p.eventId)))))
    } else if (idsParam) {
      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)
      const idSet = new Set(ids)
      photos = photos.filter(p => idSet.has(p.id))
    } else if (eventId) {
      photos = photos.filter(p => p.eventId === eventId)
      if (pasta === '__album__') photos = photos.filter(p => !p.pasta)
      else if (pasta) photos = photos.filter(p => (p.pasta || '') === pasta)
    }
    if (!idsParam && !incluirOrfaos) {
      photos = photos.filter(p => !p.orfaoFuncional && !p.ocultarDoAlbum)
    }
    if (!incluirRemovidas) photos = photos.filter(p => !p.removida)
    photos.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    if (!Number.isNaN(limit) && limit > 0) photos = photos.slice(0, limit)

    const eventsMap = new Map(readEvents().map(ev => [ev.id, ev]))
    const hydrated = photos.map(photo => withResolvedPhotoUrls(
      withFreeFlags(photo, eventsMap.get(photo.eventId))
    ))

    return NextResponse.json(hydrated)
  } catch {
    return NextResponse.json({ error: 'Erro ao ler fotos' }, { status: 500 })
  }
}

// POST /api/photos
export async function POST(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const body = await request.json()
    const {
      eventId,
      filename,
      filenameWm,
      filenameThumb,
      filenameMini,
      pathGridWm,
      pathGridClean,
      pathThumbWm,
      pathThumbClean,
      pathMiniWm,
      pathMiniClean,
      price,
      originalName,
      size,
      takenAt,
      author,
      pasta,
      originalWidth,
      originalHeight,
      originalPath,
    } = body

    const numericPrice = Number(price)

    if (!eventId || !filename || price === undefined)
      return NextResponse.json({ error: 'eventId, filename e price sÃ£o obrigatÃ³rios' }, { status: 400 })

    if (!Number.isFinite(numericPrice) || numericPrice < 0 || numericPrice > PRICE_MAX || (numericPrice > 0 && numericPrice < PRICE_MIN)) {
      return NextResponse.json({ error: 'PreÃ§o fora da faixa permitida.' }, { status: 400 })
    }

    // Colaborador só pode subir foto em eventos seus
    if (auth.payload.isColaborador) {
      const ev = readEvents().find(e => e.id === eventId)
      if (!ev || !canManageEvent(auth.payload, ev)) {
        return NextResponse.json({ error: 'Sem permissão para este evento.' }, { status: 403 })
      }
    }

    const photos = readPhotos()
    const duplicateKey = getPhotoDuplicateKey({ originalName, size })
    const existingDuplicate = duplicateKey
      ? photos.find(photo =>
          photo.eventId === eventId &&
          !photo.removida &&
          getPhotoDuplicateKey(photo) === duplicateKey
        )
      : null

    if (existingDuplicate) {
      return NextResponse.json(
        {
          skipped: true,
          reason: 'duplicate_original_name_and_size',
          existingPhotoId: existingDuplicate.id,
        },
        { status: 200 }
      )
    }

    const storageDefaults = buildPhotoStorageFields(filename, eventId)
    const originalStorageDefaults = buildOriginalStorageFields({ eventId, filename })

    const newPhoto = {
      id:       crypto.randomUUID(),
      publicId: generatePhotoId(),
      eventId, filename,
      filenameWm:    filenameWm    || storageDefaults.filenameWm || `wm_${filename}`,
      filenameThumb: filenameThumb || storageDefaults.filenameThumb || `thumb_${filename}`,
      filenameMini:  filenameMini  || storageDefaults.filenameMini || `mini_${filename}`,
      pathGridWm:    pathGridWm    || storageDefaults.pathGridWm || null,
      pathGridClean: pathGridClean || storageDefaults.pathGridClean || null,
      pathThumbWm:   pathThumbWm   || storageDefaults.pathThumbWm || null,
      pathThumbClean:pathThumbClean|| storageDefaults.pathThumbClean || null,
      pathMiniWm:    pathMiniWm    || storageDefaults.pathMiniWm || null,
      pathMiniClean: pathMiniClean || storageDefaults.pathMiniClean || null,
      price: numericPrice,
      originalName:   originalName   || null,
      originalPath:   originalPath   || originalStorageDefaults.originalPath || null,
      size:           size           || null,
      takenAt:        takenAt        || null,
      author:         author         || 'Desconhecido',
      pasta:          pasta || null,
      originalWidth:  originalWidth  || null,
      originalHeight: originalHeight || null,
      removida:   false,
      removidaEm: null,
      colaboradorId: getColaboradorId(auth.payload) || (body.colaboradorId || null),
      createdAt: new Date().toISOString(),
    }

    photos.push(newPhoto)
    writePhotos(photos)

    // Enfileira a geração de derivadas (grid/thumbs/mini wm+clean) em segundo
    // plano. O cliente já recebe a foto registrada e pode partir para o
    // próximo upload sem esperar o pipeline pesado de sharp.
    try {
      ensureJobsBootstrapped()
      enqueueJob('photo-derivatives', { photoId: newPhoto.id }, { dedupeKey: `pd:${newPhoto.id}` })
    } catch (err) {
      console.error('[photos POST] falha ao enfileirar derivadas:', err)
    }

    const event = readEvents().find(ev => ev.id === eventId)
    return NextResponse.json(withResolvedPhotoUrls(withFreeFlags(newPhoto, event)), { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Erro ao registrar foto' }, { status: 500 })
  }
}

// PATCH /api/photos
// { id, price }             -> atualiza preço de uma foto
// { id, removida: bool }    -> marca/desmarca como removida
// { id, pasta: string }     -> move para pasta
// { id, gratis: bool }      -> toggle download gratuito
// { ids: [...], ...campos } -> atualização em lote
export async function PATCH(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const body = await request.json()
    const { ids, id, price, removida, pasta, gratis, cartPriceDecision } = body

    if (price !== undefined) {
      const num = Number(price)
      if (!Number.isFinite(num) || num < 0 || num > PRICE_MAX || (num > 0 && num < PRICE_MIN)) {
        return NextResponse.json({ error: 'PreÃ§o fora da faixa permitida.' }, { status: 400 })
      }
    }

    const photos = readPhotos()
    const isPriceChange = price !== undefined
    const targetIds = ids && Array.isArray(ids) ? ids : (id ? [id] : [])

    // Colaborador: bloqueia se algum alvo não for dele
    if (auth.payload.isColaborador && targetIds.length > 0) {
      const eventsMap = new Map(readEvents().map(e => [e.id, e]))
      const targets = photos.filter(p => targetIds.includes(p.id))
      const notMine = targets.find(p => !canManagePhoto(auth.payload, p, eventsMap))
      if (notMine) {
        return NextResponse.json({ error: 'Sem permissão para uma ou mais fotos.' }, { status: 403 })
      }
    }

    const beforeById = new Map(
      photos
        .filter(photo => targetIds.includes(photo.id))
        .map(photo => [photo.id, { price: photo.price, removida: !!photo.removida, pasta: photo.pasta || null }])
    )
    let cartDecisionResult = null

    if (isPriceChange && targetIds.length > 0) {
      const analysis = analyzeCartPriceImpact({
        photoIds: targetIds,
        photos,
        newPrice: Number(price),
      })

      if (analysis.hasImpact) {
        const validDecision = [CART_PRICE_DECISION_UPDATE, CART_PRICE_DECISION_PRESERVE].includes(cartPriceDecision)
        if (!validDecision) {
          return NextResponse.json(
            {
              requiresDecision: true,
              reason: 'cart_price_policy_required',
              message: 'Existem carrinhos com fotos que terao preco alterado. Escolha como tratar os carrinhos existentes.',
              analysis,
            },
            { status: 409 }
          )
        }

        cartDecisionResult = applyCartPriceDecision({
          analysis,
          decision: cartPriceDecision,
          adminId: auth.client?.id || auth.payload?.id || null,
          adminName: auth.client?.nomeCompleto || auth.client?.nome || auth.client?.email || null,
        })
      }
    }

    // Bulk update
    if (ids && Array.isArray(ids)) {
      const idSet = new Set(ids)
      let changed = 0
      for (let i = 0; i < photos.length; i++) {
        if (!idSet.has(photos[i].id)) continue
        if (price !== undefined) photos[i].price = Number(price)
        if (pasta !== undefined)    photos[i].pasta     = pasta || null
        if (gratis !== undefined)   photos[i].gratis    = Boolean(gratis)
        if (removida !== undefined) {
          photos[i].removida   = Boolean(removida)
          photos[i].removidaEm = removida ? new Date().toISOString() : null
        }
        changed++
      }
      writePhotos(photos)
      if (isPriceChange) {
        appendAuditLog({
          action: 'photo.price_changed',
          actor: auth.client || auth.payload,
          target: { type: 'photo_batch', id: null, label: `${changed} fotos` },
          details: {
            ids: ids.slice(0, 50),
            count: changed,
            newPrice: Number(price),
            previousPrices: ids.slice(0, 50).map(photoId => ({ id: photoId, price: beforeById.get(photoId)?.price })),
            cartPriceDecision: cartDecisionResult?.decision || cartPriceDecision || null,
          },
          request,
        })
      }
      if (removida !== undefined) {
        appendAuditLog({
          action: removida ? 'photo.deleted' : 'photo.restored',
          actor: auth.client || auth.payload,
          target: { type: 'photo_batch', id: null, label: `${changed} fotos` },
          details: { ids: ids.slice(0, 50), count: changed, logicalOnly: true },
          request,
        })
      }
      return NextResponse.json({ updated: changed, cartPriceDecision: cartDecisionResult })
    }

    // Single update
    if (!id) return NextResponse.json({ error: 'id Ã© obrigatÃ³rio' }, { status: 400 })
    const idx = photos.findIndex(p => p.id === id)
    if (idx === -1) return NextResponse.json({ error: 'Foto nÃ£o encontrada' }, { status: 404 })

    if (price !== undefined) photos[idx].price = Number(price)
    if (pasta !== undefined)    photos[idx].pasta     = pasta || null
    if (gratis !== undefined)   photos[idx].gratis    = Boolean(gratis)
    if (removida !== undefined) {
      photos[idx].removida   = Boolean(removida)
      photos[idx].removidaEm = removida ? new Date().toISOString() : null
    }

    writePhotos(photos)
    if (price !== undefined) {
      appendAuditLog({
        action: 'photo.price_changed',
        actor: auth.client || auth.payload,
        target: { type: 'photo', id: photos[idx].id, publicId: photos[idx].publicId, label: photos[idx].originalName || photos[idx].filename },
        details: {
          from: beforeById.get(photos[idx].id)?.price,
          to: Number(price),
          cartPriceDecision: cartDecisionResult?.decision || cartPriceDecision || null,
        },
        request,
      })
    }
    if (removida !== undefined && beforeById.get(photos[idx].id)?.removida !== !!photos[idx].removida) {
      appendAuditLog({
        action: removida ? 'photo.deleted' : 'photo.restored',
        actor: auth.client || auth.payload,
        target: { type: 'photo', id: photos[idx].id, publicId: photos[idx].publicId, label: photos[idx].originalName || photos[idx].filename },
        details: { logicalOnly: true },
        request,
      })
    }
    const event = readEvents().find(ev => ev.id === photos[idx].eventId)
    return NextResponse.json({
      ...withFreeFlags(photos[idx], event),
      cartPriceDecision: cartDecisionResult,
    })
  } catch {
    return NextResponse.json({ error: 'Erro ao atualizar foto' }, { status: 500 })
  }
}

// DELETE /api/photos?id=xxx
export async function DELETE(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const singleId = searchParams.get('id')
    const queryEventId = searchParams.get('eventId') || null
    const queryPasta = searchParams.get('pasta') || null
    const modo = searchParams.get('estrategia') || searchParams.get('modo') || null

    let body = {}
    try {
      body = await request.json()
    } catch {}

    const ids = body.ids || (singleId ? [singleId] : [])
    const estrategia = body.estrategia || modo
    const decisions = body.decisoes || {}
    const alvoPasta = body.pasta || queryPasta
    const alvoEvento = body.eventId || queryEventId
    const permanent = body.permanente === true || body.permanent === true || searchParams.get('permanente') === '1'

    if (!ids.length && !alvoEvento) {
      return NextResponse.json({ error: 'Informe id(s) ou eventId para pasta.' }, { status: 400 })
    }

    // Colaborador: valida ownership de cada alvo (id ou evento)
    if (auth.payload.isColaborador) {
      const eventsAll = readEvents()
      const eventsMap = new Map(eventsAll.map(e => [e.id, e]))
      if (alvoEvento) {
        const ev = eventsMap.get(alvoEvento)
        if (!ev || !canManageEvent(auth.payload, ev)) {
          return NextResponse.json({ error: 'Sem permissão para este evento.' }, { status: 403 })
        }
      }
      if (ids.length > 0) {
        const allPhotos = readPhotos()
        const targets = allPhotos.filter(p => ids.includes(p.id))
        const notMine = targets.find(p => !canManagePhoto(auth.payload, p, eventsMap))
        if (notMine) {
          return NextResponse.json({ error: 'Sem permissão para uma ou mais fotos.' }, { status: 403 })
        }
      }
    }

    const analysis = analyzePhotos({
      photoIds: ids,
      eventId: ids.length === 0 ? alvoEvento : null,
      pasta: ids.length === 0 ? alvoPasta : null,
    })

    const temVinculos = analysis.totalImportantes > 0
    if (permanent && temVinculos) {
      return NextResponse.json(
        {
          requiresDecision: true,
          reason: 'permanent_not_safe',
          analysis,
          message: 'Exclusao definitiva bloqueada: existem fotos com compras, carrinhos, favoritos ou curtidas.',
        },
        { status: 409 }
      )
    }

    if (temVinculos && !estrategia) {
      return NextResponse.json(
        { requiresDecision: true, analysis, message: 'Existem fotos com compras, carrinhos, favoritos ou curtidas.' },
        { status: 409 }
      )
    }

    const result = applyPhotoStrategy({
      photoIds: analysis.ids,
      eventId: alvoEvento,
      pasta: alvoPasta,
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
      action: permanent ? 'photo.permanent_delete' : 'photo.deleted',
      actor: auth.client || auth.payload,
      target: { type: 'photo_batch', id: alvoEvento || singleId || null, label: alvoPasta || null },
      details: {
        ids: analysis.ids?.slice(0, 50) || ids.slice(0, 50),
        count: analysis.ids?.length || ids.length,
        eventId: alvoEvento,
        pasta: alvoPasta,
        strategy: estrategia || 'agressivo',
        permanent,
        removed: result.removed || 0,
        preserved: result.preserved || 0,
        trashBatchId: result.trashBatchId || null,
      },
      request,
    })

    return NextResponse.json({ success: true, ...result })
  } catch {
    return NextResponse.json({ error: 'Erro ao deletar foto' }, { status: 500 })
  }
}
