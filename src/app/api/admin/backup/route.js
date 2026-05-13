import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { listBackups, createBackup, getBackupsRootInfo } from '@/lib/backup'
import { appendAuditLog } from '@/lib/auditLog'

function gateSuperAdmin(auth) {
  if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
  if (!auth.payload?.isSuperAdmin) {
    return NextResponse.json({ error: 'Apenas super-admins podem usar backup/reset.', code: 'super_admin_only' }, { status: 403 })
  }
  return null
}

export async function GET() {
  try {
    const auth = await requireAuth({ requireFullAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    return NextResponse.json({
      backups: listBackups(),
      info: getBackupsRootInfo(),
    })
  } catch (error) {
    console.error('Erro listando backups:', error)
    return NextResponse.json({ error: 'Erro ao listar backups.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    const blocked = gateSuperAdmin(auth)
    if (blocked) return blocked

    const body = await request.json().catch(() => ({}))
    const requestedScopes = Array.isArray(body?.scopes) ? body.scopes : ['data']
    const allowed = ['data', 'originals', 'uploads']
    const scopes = requestedScopes.filter(s => allowed.includes(s))
    if (scopes.length === 0) {
      return NextResponse.json({ error: 'Selecione ao menos um escopo (data, originals, uploads).' }, { status: 400 })
    }
    const label = String(body?.label || '').slice(0, 100)
    const reason = body?.reason ? String(body.reason).slice(0, 200) : null

    const manifest = await createBackup({ scopes, label, reason, actor: auth.client || auth.payload })

    appendAuditLog({
      action: 'backup.created',
      actor: auth.client || auth.payload,
      target: { type: 'backup', id: manifest.id, label: manifest.label || manifest.id },
      details: { scopes, contents: manifest.contents, label, reason },
      request,
    })

    return NextResponse.json({ backup: manifest })
  } catch (error) {
    console.error('Erro criando backup:', error)
    appendAuditLog({
      action: 'backup.create_failed',
      status: 'failure',
      details: { error: error?.message || String(error) },
      request,
    })
    return NextResponse.json({ error: 'Erro ao criar backup: ' + (error?.message || 'desconhecido') }, { status: 500 })
  }
}
