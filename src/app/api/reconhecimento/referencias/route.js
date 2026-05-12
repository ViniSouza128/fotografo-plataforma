// src/app/api/reconhecimento/referencias/route.js
// Referências de busca (imagens de pessoa) — armazenadas fora de /public.
//
// GET ?meu=1 (cliente) | (admin) lista geral
// POST multipart {file, label?} — cliente envia referência sua
// DELETE ?id=... — cliente apaga as suas, admin apaga qualquer

import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import {
  readVisionConfig,
  readReferences,
  appendReference,
  deleteReference,
  findReferenceById,
  getReferenceFileAbsPath,
  listReferencesForOwner,
} from '@/lib/vision/storage'
import { extractEmbeddingsFromImage, isFaceApiAvailable } from '@/lib/vision/engines/faceApi'
import { appendAuditLog } from '@/lib/auditLog'
import crypto from 'crypto'

function clientHasConsent(client) {
  return !!(client && client.reconhecimentoConsentidoEm)
}

export async function GET(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    const { searchParams } = new URL(request.url)
    const meu = searchParams.get('meu') === '1'
    if (!auth.payload.isAdmin || meu) {
      const items = listReferencesForOwner({ ownerId: auth.client.id, ownerType: 'client' })
      return NextResponse.json(items.map(r => ({
        id: r.id, label: r.label, ownerId: r.ownerId, ownerType: r.ownerType,
        consentedAt: r.consentedAt, createdAt: r.createdAt,
        hasEmbedding: Array.isArray(r.embedding),
      })))
    }
    const all = readReferences()
    return NextResponse.json(all.map(r => ({
      id: r.id, label: r.label, ownerId: r.ownerId, ownerType: r.ownerType,
      consentedAt: r.consentedAt, createdAt: r.createdAt,
      hasEmbedding: Array.isArray(r.embedding),
    })))
  } catch (err) {
    console.error('[vision refs GET] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const cfg = readVisionConfig()
    if (!cfg.ativo) return NextResponse.json({ error: 'Reconhecimento desativado.' }, { status: 403 })

    const isAdmin = !!auth.payload.isAdmin
    if (!isAdmin) {
      if (!cfg.permitirCliente) return NextResponse.json({ error: 'Busca por cliente desativada.' }, { status: 403 })
      if (cfg.exigirConsentimento && !clientHasConsent(auth.client)) {
        return NextResponse.json({ error: 'Aceite LGPD obrigatório.', code: 'consent_required' }, { status: 403 })
      }
    }

    const ct = String(request.headers.get('content-type') || '')
    if (!ct.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Esperado multipart/form-data.' }, { status: 400 })
    }
    const fd = await request.formData()
    const file = fd.get('file')
    const label = String(fd.get('label') || '').slice(0, 80)
    const consentido = fd.get('consentido') === '1'
    if (!file || typeof file !== 'object' || file.size === 0) {
      return NextResponse.json({ error: 'Arquivo obrigatório.' }, { status: 400 })
    }

    if (cfg.exigirConsentimento && !isAdmin && !consentido && !clientHasConsent(auth.client)) {
      return NextResponse.json({ error: 'Marque o consentimento.', code: 'consent_required' }, { status: 403 })
    }

    // Engine facial precisa estar configurado para extrair embedding
    const status = await isFaceApiAvailable()

    const refId = crypto.randomUUID()
    const safeName = `${refId}.jpg`
    const ownerId = isAdmin ? null : auth.client.id
    const ownerType = isAdmin ? 'admin' : 'client'
    const absPath = getReferenceFileAbsPath({ ownerId, ownerType, filename: safeName })
    const buf = Buffer.from(await file.arrayBuffer())
    await fs.promises.writeFile(absPath, buf)

    let embedding = null
    let detectionInfo = null
    if (status.available) {
      try {
        const detections = await extractEmbeddingsFromImage(absPath)
        if (detections.length > 0) {
          embedding = detections[0].embedding
          detectionInfo = { faces: detections.length, score: detections[0].score }
        }
      } catch (err) {
        // Salva mesmo sem embedding — admin pode reprocessar depois
      }
    }

    const ref = {
      id: refId,
      ownerId,
      ownerType,
      label: label || (ownerType === 'admin' ? 'Referência admin' : (auth.client.nomeCompleto || 'Minha referência')),
      filename: safeName,
      embedding,
      detectionInfo,
      consentedAt: cfg.exigirConsentimento ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
    }
    appendReference(ref)

    appendAuditLog({
      action: 'vision.reference_created',
      actor: auth.client || auth.payload,
      target: { type: 'vision_ref', id: refId, label: ref.label },
      details: {
        ownerType, hasEmbedding: !!embedding,
        engineAvailable: status.available, engineReason: status.reason,
      },
      request,
    })

    return NextResponse.json({
      id: refId,
      label: ref.label,
      ownerType,
      hasEmbedding: !!embedding,
      consentedAt: ref.consentedAt,
      createdAt: ref.createdAt,
      engineAvailable: status.available,
      engineReason: status.reason,
    }, { status: 201 })
  } catch (err) {
    console.error('[vision refs POST] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })

    const ref = findReferenceById(id)
    if (!ref) return NextResponse.json({ error: 'Referência não encontrada.' }, { status: 404 })

    const isAdmin = !!auth.payload.isAdmin
    if (!isAdmin && (ref.ownerType !== 'client' || ref.ownerId !== auth.client.id)) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
    }
    deleteReference(id)
    appendAuditLog({
      action: 'vision.reference_deleted',
      actor: auth.client || auth.payload,
      target: { type: 'vision_ref', id, label: ref.label },
      request,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[vision refs DELETE] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
