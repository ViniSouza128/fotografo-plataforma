// src/app/api/storage/config/route.js
// GET (admin): retorna config sanitizada (segredos mascarados)
// PATCH (super-admin): atualiza config
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import {
  getStorageConfig, setStorageConfig, publicStorageConfig, validateStorageConfig,
} from '@/lib/storage/config'
import { resetClient } from '@/lib/storage/s3'
import { appendAuditLog } from '@/lib/auditLog'

export async function GET() {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    return NextResponse.json(publicStorageConfig())
  } catch (err) {
    console.error('[storage config GET] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth({ requireSuperAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    const body = await request.json()

    const allowed = [
      'ativo', 'provider', 'endpoint', 'region', 'bucket',
      'accessKeyId', 'secretAccessKey', 'publicBaseUrl', 'pathStyle',
      'mirrorOnUpload', 'preferExternalForReads', 'signedUrlTtlSeconds',
    ]
    const patch = {}
    for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k]

    // Não sobrescreve secrets se valor for vazio ou mascarado
    const current = getStorageConfig()
    if (typeof patch.accessKeyId === 'string' && /^[•\s]*$/.test(patch.accessKeyId)) {
      patch.accessKeyId = current.accessKeyId
    }
    if (typeof patch.secretAccessKey === 'string' && /^[•\s]*$/.test(patch.secretAccessKey)) {
      patch.secretAccessKey = current.secretAccessKey
    }

    const merged = { ...current, ...patch }
    const errors = validateStorageConfig(merged)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' / ') }, { status: 400 })
    }

    const next = setStorageConfig(patch)
    resetClient() // força recarregar credenciais

    appendAuditLog({
      action: 'storage.config_updated',
      actor: auth.client || auth.payload,
      target: { type: 'storage', id: 'config' },
      details: {
        ativo: next.ativo, provider: next.provider, endpoint: next.endpoint,
        bucket: next.bucket, region: next.region, mirrorOnUpload: next.mirrorOnUpload,
        preferExternalForReads: next.preferExternalForReads,
      },
      request,
    })

    return NextResponse.json(publicStorageConfig(next))
  } catch (err) {
    console.error('[storage config PATCH] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
