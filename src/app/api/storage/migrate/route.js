// src/app/api/storage/migrate/route.js
// POST (super-admin): inicia migração local → bucket (em background, retorna 202).
// GET (admin): retorna status atual.
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { runMigration } from '@/lib/storage/migrate'
import { readMigrationState } from '@/lib/storage/migrationState'
import { isExternalEnabled } from '@/lib/storage/config'
import { appendAuditLog } from '@/lib/auditLog'

export async function GET() {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    return NextResponse.json({
      enabled: isExternalEnabled(),
      ...readMigrationState(),
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth({ requireSuperAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    if (!isExternalEnabled()) {
      return NextResponse.json({ error: 'Storage externo está desativado.' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({}))
    const { onlyOriginals, onlyDerivatives } = body || {}

    if (readMigrationState().running) {
      return NextResponse.json({ error: 'Já existe uma migração em execução.' }, { status: 409 })
    }

    appendAuditLog({
      action: 'storage.migrate_start',
      actor: auth.client || auth.payload,
      target: { type: 'storage', id: 'migrate' },
      details: { onlyOriginals: !!onlyOriginals, onlyDerivatives: !!onlyDerivatives },
      request,
    })

    // Background — não bloqueia a resposta
    runMigration({ onlyOriginals, onlyDerivatives })
      .then(result => {
        appendAuditLog({
          action: 'storage.migrate_done',
          actor: auth.client || auth.payload,
          target: { type: 'storage', id: 'migrate' },
          details: result,
        })
      })
      .catch(err => {
        console.error('[storage migrate] erro:', err)
      })

    return NextResponse.json({ ok: true, message: 'Migração iniciada em background.' }, { status: 202 })
  } catch (err) {
    console.error('[storage migrate POST] erro:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
