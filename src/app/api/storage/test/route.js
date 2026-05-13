// src/app/api/storage/test/route.js
// POST (super-admin): faz PUT/HEAD/DELETE em uma key de healthcheck.
// Útil para validar credenciais antes de migrar.
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { testConnection } from '@/lib/storage/s3'
import { appendAuditLog } from '@/lib/auditLog'

export async function POST(request) {
  try {
    const auth = await requireAuth({ requireSuperAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    const result = await testConnection()
    appendAuditLog({
      action: 'storage.test_connection',
      actor: auth.client || auth.payload,
      target: { type: 'storage', id: 'test' },
      details: { ok: !!result.ok, reason: result.reason || null },
      request,
    })
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (err) {
    console.error('[storage test] erro:', err)
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}
