// src/app/api/reconhecimento/buscar/route.js
// POST: busca por código numérico, tags textuais ou referência facial.
// - Admin: busca em qualquer evento (ou eventId específico)
// - Cliente (se permitirCliente=true e consentimento ok): busca apenas em
//   eventos públicos (visibilidade='publico'), e respeita filtros de bloqueio.
//
// Body:
//   { code?: string, tokens?: string[] }
//   { referenceId: string }      — usa um embedding já salvo
//   ou multipart-form com 'file'  — extrai embedding ad-hoc (não persiste)
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { readPhotos } from '@/lib/photos'
import { readEvents } from '@/lib/events'
import {
  readVisionConfig,
  findReferenceById,
  getBlockedPhotoIds,
} from '@/lib/vision/storage'
import {
  searchByText, searchByFace, applyBlocksFilter, indexPhoto,
} from '@/lib/vision'
import { extractEmbeddingsFromImage, isFaceApiAvailable } from '@/lib/vision/engines/faceApi'
import { appendAuditLog } from '@/lib/auditLog'
import path from 'path'
import fs from 'fs'
import os from 'os'

function clientHasConsent(client) {
  return !!(client && client.reconhecimentoConsentidoEm)
}

function decorateResults(results) {
  if (results.length === 0) return []
  const photos = readPhotos()
  const events = readEvents()
  const phMap = new Map(photos.map(p => [p.id, p]))
  const evMap = new Map(events.map(e => [e.id, e]))
  return results.map(r => {
    const p = phMap.get(r.photoId)
    const e = evMap.get(r.eventId || p?.eventId)
    return {
      ...r,
      photo: p ? {
        id: p.id, publicId: p.publicId, eventId: p.eventId,
        filename: p.filename, originalName: p.originalName,
        pathThumbWm: p.pathThumbWm, pathGridWm: p.pathGridWm, pathMiniWm: p.pathMiniWm,
        filenameThumb: p.filenameThumb, filenameMini: p.filenameMini,
      } : null,
      event: e ? { id: e.id, name: e.name, publicId: e.publicId, visibilidade: e.visibilidade } : null,
    }
  })
}

export async function POST(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const cfg = readVisionConfig()
    if (!cfg.ativo) {
      return NextResponse.json({ error: 'Reconhecimento desativado.', code: 'disabled' }, { status: 403 })
    }

    const isAdmin = !!auth.payload.isAdmin
    const isFullAdmin = isAdmin && !auth.payload.isColaborador

    let scopes = ['publico']
    let allowedEventId = null
    if (isAdmin) {
      scopes = ['publico', 'restrito', 'oculto']
    } else {
      if (!cfg.permitirCliente) {
        return NextResponse.json({ error: 'Busca por cliente está desativada.', code: 'client_disabled' }, { status: 403 })
      }
      if (cfg.exigirConsentimento && !clientHasConsent(auth.client)) {
        return NextResponse.json({ error: 'Aceite do termo LGPD obrigatório.', code: 'consent_required' }, { status: 403 })
      }
    }

    const contentType = String(request.headers.get('content-type') || '')
    let body = {}
    let uploadedFilePath = null
    if (contentType.includes('multipart/form-data')) {
      const fd = await request.formData()
      body = {
        code: fd.get('code') || null,
        tokens: fd.get('tokens') ? String(fd.get('tokens')).split(',').map(s => s.trim()).filter(Boolean) : [],
        referenceId: fd.get('referenceId') || null,
        eventId: fd.get('eventId') || null,
      }
      const file = fd.get('file')
      if (file && typeof file === 'object' && file.size > 0) {
        const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vision-'))
        uploadedFilePath = path.join(tmpDir, 'q.jpg')
        const buf = Buffer.from(await file.arrayBuffer())
        await fs.promises.writeFile(uploadedFilePath, buf)
      }
    } else {
      try { body = await request.json() } catch { body = {} }
    }

    const { code, tokens, referenceId, eventId } = body
    if (eventId) allowedEventId = eventId

    let textResults = []
    if (code || (Array.isArray(tokens) && tokens.length > 0)) {
      textResults = searchByText({
        code, tokens: tokens || [],
        eventId: allowedEventId,
        includeEventScopes: scopes,
      })
    }

    let faceResults = []
    if (referenceId || uploadedFilePath) {
      const status = await isFaceApiAvailable()
      if (!status.available) {
        return NextResponse.json({
          error: `Engine facial indisponível: ${status.reason}`, code: 'engine_unavailable',
        }, { status: 503 })
      }
      let queryEmbedding = null
      if (referenceId) {
        const ref = findReferenceById(referenceId)
        if (!ref) return NextResponse.json({ error: 'Referência não encontrada.' }, { status: 404 })
        // Cliente só pode usar referências próprias
        if (!isAdmin && (ref.ownerType !== 'client' || ref.ownerId !== auth.client.id)) {
          return NextResponse.json({ error: 'Sem permissão para essa referência.' }, { status: 403 })
        }
        queryEmbedding = ref.embedding
      } else if (uploadedFilePath) {
        try {
          const detections = await extractEmbeddingsFromImage(uploadedFilePath)
          if (!detections.length) {
            return NextResponse.json({ error: 'Nenhum rosto detectado na foto enviada.' }, { status: 400 })
          }
          queryEmbedding = detections[0].embedding
        } finally {
          try { await fs.promises.unlink(uploadedFilePath) } catch {}
        }
      }
      if (queryEmbedding) {
        faceResults = await searchByFace({
          queryEmbedding,
          eventId: allowedEventId,
          includeEventScopes: scopes,
        })
      }
    }

    let combined = [...textResults, ...faceResults]
    // dedupe por photoId (mantém o de maior score)
    const seen = new Map()
    for (const r of combined) {
      const prev = seen.get(r.photoId)
      if (!prev || (r.score || 0) > (prev.score || 0)) seen.set(r.photoId, r)
    }
    combined = Array.from(seen.values())

    // Aplica filtros de bloqueio (LGPD)
    combined = applyBlocksFilter(combined)

    // Limita resposta
    combined.sort((a, b) => (b.score || 0) - (a.score || 0))
    combined = combined.slice(0, 200)

    const decorated = decorateResults(combined)

    appendAuditLog({
      action: 'vision.search',
      actor: auth.client || auth.payload,
      target: { type: 'vision', id: 'search' },
      details: {
        code: code || null,
        tokensCount: tokens?.length || 0,
        usedReference: !!referenceId,
        uploaded: !!uploadedFilePath,
        eventId: allowedEventId,
        scope: scopes,
        results: combined.length,
        engine: cfg.engine,
      },
      request,
    })

    return NextResponse.json({
      results: decorated,
      engineUsed: faceResults.length > 0 ? 'face-api-local' : 'manual',
      blocked: getBlockedPhotoIds().size,
    })
  } catch (err) {
    console.error('[vision buscar] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
