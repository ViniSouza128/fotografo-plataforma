// src/app/api/pagamento/log/route.js
// GET  /api/pagamento/log          → retorna log completo
// DELETE /api/pagamento/log        → limpa o log

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { clearLog, readLog, writeLog } from '../../../../lib/paymentLog'

export async function GET(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const entries = readLog({ limit: searchParams.get('limit') || 500 })
    return NextResponse.json(entries)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const auth = await requireAuth({ requireSuperAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    clearLog()
    writeLog('info', 'LOG_LIMPO', { observacao: 'Log apagado pelo administrador' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
