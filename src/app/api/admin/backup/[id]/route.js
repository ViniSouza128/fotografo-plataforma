import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getBackupManifest, deleteBackup, restoreBackup } from '@/lib/backup'
import { appendAuditLog } from '@/lib/auditLog'

function gateSuperAdmin(auth) {
  if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
  if (!auth.payload?.isSuperAdmin) {
    return NextResponse.json({ error: 'Apenas super-admins podem usar backup/reset.', code: 'super_admin_only' }, { status: 403 })
  }
  return null
}

export async function GET(_request, { params }) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    const blocked = gateSuperAdmin(auth)
    if (blocked) return blocked

    const id = params?.id
    const manifest = getBackupManifest(id)
    if (!manifest) return NextResponse.json({ error: 'Backup não encontrado.' }, { status: 404 })
    return NextResponse.json({ backup: manifest })
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao ler backup.' }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    const blocked = gateSuperAdmin(auth)
    if (blocked) return blocked

    const id = params?.id
    const body = await request.json().catch(() => ({}))
    const scopes = Array.isArray(body?.scopes) ? body.scopes.filter(s => ['data','originals','uploads'].includes(s)) : []
    const confirmation = String(body?.confirmation || '').trim()

    if (confirmation !== 'RESTAURAR') {
      return NextResponse.json({ error: 'Confirmação inválida. Digite "RESTAURAR" para confirmar.' }, { status: 400 })
    }
    if (scopes.length === 0) {
      return NextResponse.json({ error: 'Selecione ao menos um escopo para restaurar.' }, { status: 400 })
    }

    const manifest = getBackupManifest(id)
    if (!manifest) return NextResponse.json({ error: 'Backup não encontrado.' }, { status: 404 })

    const result = await restoreBackup({ id, scopes, actor: auth.client || auth.payload })

    appendAuditLog({
      action: 'backup.restored',
      actor: auth.client || auth.payload,
      target: { type: 'backup', id, label: manifest.label || id },
      details: {
        backupCreatedAt: manifest.createdAt,
        scopesRequested: scopes,
        scopesRestored: result.restored,
        preRestoreBackupId: result.preBackupId,
      },
      request,
    })

    return NextResponse.json({ ok: true, restored: result.restored, preBackupId: result.preBackupId })
  } catch (error) {
    console.error('Erro restaurando backup:', error)
    appendAuditLog({
      action: 'backup.restore_failed',
      status: 'failure',
      target: { type: 'backup', id: params?.id, label: params?.id },
      details: { error: error?.message || String(error) },
      request,
    })
    return NextResponse.json({ error: 'Erro ao restaurar: ' + (error?.message || 'desconhecido') }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    const blocked = gateSuperAdmin(auth)
    if (blocked) return blocked

    const id = params?.id
    const manifest = getBackupManifest(id)
    if (!manifest) return NextResponse.json({ error: 'Backup não encontrado.' }, { status: 404 })

    const ok = deleteBackup(id)
    if (!ok) return NextResponse.json({ error: 'Falha ao remover.' }, { status: 500 })

    appendAuditLog({
      action: 'backup.deleted',
      actor: auth.client || auth.payload,
      target: { type: 'backup', id, label: manifest.label || id },
      details: { createdAt: manifest.createdAt, scopes: manifest.scopes },
      request,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao excluir backup.' }, { status: 500 })
  }
}
