// src/app/api/reconhecimento/config/route.js
// GET: cliente recebe um subset público; admin recebe status completo (com backends).
// PATCH (super-admin): atualiza config
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { readVisionConfig, writeVisionConfig } from '@/lib/vision/storage'
import { getEngineStatus } from '@/lib/vision'
import { appendAuditLog } from '@/lib/auditLog'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    if (!auth.payload.isAdmin) {
      // Subset público para clientes — só o que afeta a UI deles
      const cfg = readVisionConfig()
      return NextResponse.json({
        ativo: !!cfg.ativo,
        permitirCliente: !!cfg.permitirCliente,
        exigirConsentimento: !!cfg.exigirConsentimento,
      })
    }

    const status = await getEngineStatus()
    return NextResponse.json(status)
  } catch (err) {
    console.error('[vision config] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth({ requireSuperAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    const body = await request.json()
    const allowed = [
      'ativo', 'permitirCliente', 'exigirConsentimento',
      'engine', 'similarityThreshold', 'numericPattern',
      'externoConfigurado', 'externoEndpoint', 'externoNome',
      'registrarLog',
    ]
    const before = readVisionConfig()
    const patch = {}
    for (const k of allowed) {
      if (body[k] !== undefined) patch[k] = body[k]
    }
    if (patch.engine && !['manual', 'face-api-local', 'external'].includes(patch.engine)) {
      return NextResponse.json({ error: 'Engine inválido.' }, { status: 400 })
    }
    if (patch.similarityThreshold !== undefined) {
      const v = Number(patch.similarityThreshold)
      if (!Number.isFinite(v) || v < 0.1 || v > 1.5) {
        return NextResponse.json({ error: 'similarityThreshold deve estar entre 0.1 e 1.5.' }, { status: 400 })
      }
      patch.similarityThreshold = v
    }
    const next = writeVisionConfig(patch)
    appendAuditLog({
      action: 'vision.config_updated',
      actor: auth.client || auth.payload,
      target: { type: 'vision', id: 'config' },
      details: { before, patch },
      request,
    })
    return NextResponse.json(next)
  } catch (err) {
    console.error('[vision config patch] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
