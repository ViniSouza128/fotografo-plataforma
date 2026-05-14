import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { appendAuditLog } from '@/lib/auditLog'
import {
  StorageQuotaConfigError,
  getStorageQuotaConfig,
  getStorageQuotaStatus,
  saveStorageQuotaConfig,
} from '@/lib/storageQuota'

export const dynamic = 'force-dynamic'

function authErrorResponse(auth) {
  if (!auth?.error) return null
  return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status || 401 })
}

function actorId(auth) {
  return auth?.client?.id || auth?.payload?.id || auth?.client?.email || auth?.payload?.email || null
}

export async function GET() {
  try {
    const auth = await requireAuth({ requireAdmin: true, requireSuperAdmin: true })
    const blocked = authErrorResponse(auth)
    if (blocked) return blocked

    const config = getStorageQuotaConfig()
    const status = getStorageQuotaStatus({ config })
    return NextResponse.json({ config, status })
  } catch (error) {
    console.error('[storage quota GET] erro:', error)
    return NextResponse.json({ error: 'Erro ao carregar limite de armazenamento.', code: error?.code || 'storage_quota_get_failed' }, { status: 500 })
  }
}

export async function PATCH(request) {
  let auth
  try {
    auth = await requireAuth({ requireAdmin: true, requireSuperAdmin: true })
    const blocked = authErrorResponse(auth)
    if (blocked) return blocked

    const body = await request.json().catch(() => ({}))
    const patch = {}
    if (Object.prototype.hasOwnProperty.call(body, 'enabled')) patch.enabled = body.enabled
    if (Object.prototype.hasOwnProperty.call(body, 'limitBytes')) patch.limitBytes = body.limitBytes

    const config = saveStorageQuotaConfig(patch, { updatedBy: actorId(auth) })
    const status = getStorageQuotaStatus({ config })

    appendAuditLog({
      action: 'storage_quota.updated',
      actor: auth.client || auth.payload,
      target: { type: 'storage_quota', id: 'config' },
      details: {
        enabled: config.enabled,
        limitBytes: config.limitBytes,
        blockVideosAtPercent: config.blockVideosAtPercent,
        blockPhotosAtPercent: config.blockPhotosAtPercent,
      },
      request,
    })

    return NextResponse.json({ config, status })
  } catch (error) {
    if (error instanceof StorageQuotaConfigError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        errors: error.errors,
      }, { status: 400 })
    }

    console.error('[storage quota PATCH] erro:', error)
    appendAuditLog({
      action: 'storage_quota.update_failed',
      status: 'failure',
      actor: auth?.client || auth?.payload || null,
      details: { error: error?.message || String(error) },
      request,
    })
    return NextResponse.json({ error: 'Erro ao salvar limite de armazenamento.', code: error?.code || 'storage_quota_save_failed' }, { status: 500 })
  }
}
