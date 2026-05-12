import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { readAuditLog } from '@/lib/auditLog'

export async function GET(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const entries = readAuditLog({
      limit: searchParams.get('limit') || 200,
      action: searchParams.get('action') || null,
      status: searchParams.get('status') || null,
      actorId: searchParams.get('actorId') || null,
      targetType: searchParams.get('targetType') || null,
    })

    return NextResponse.json({ entries })
  } catch {
    return NextResponse.json({ error: 'Erro ao ler log de auditoria.' }, { status: 500 })
  }
}
