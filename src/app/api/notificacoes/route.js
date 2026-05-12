// src/app/api/notificacoes/route.js
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import {
  listarNotificacoes,
  contarNaoLidas,
  marcarLida,
  marcarTodasLidas,
  deletarNotificacao,
} from '@/lib/notificacoes'

function getDestinatario(auth) {
  return auth.payload?.isAdmin ? 'admin' : (auth.payload?.id || null)
}

// GET /api/notificacoes?count=1        → { count: N }
// GET /api/notificacoes?limit=50       → [...notifications]
export async function GET(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const dest = getDestinatario(auth)
    if (!dest) return NextResponse.json({ error: 'Sem destinatário identificado.' }, { status: 400 })

    const { searchParams } = new URL(request.url)
    const countOnly = searchParams.get('count') === '1'

    if (countOnly) {
      return NextResponse.json({ count: contarNaoLidas(dest) })
    }

    const limit = Math.min(Number(searchParams.get('limit') || 50), 200)
    const notifs = listarNotificacoes(dest, { limit })
    return NextResponse.json(notifs)
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao ler notificações.' }, { status: 500 })
  }
}

// PATCH /api/notificacoes
// { id }            → marcar uma como lida
// { all: true }     → marcar todas como lidas
export async function PATCH(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const dest = getDestinatario(auth)
    if (!dest) return NextResponse.json({ error: 'Sem destinatário identificado.' }, { status: 400 })

    const body = await request.json().catch(() => ({}))

    if (body.all === true) {
      marcarTodasLidas(dest)
      return NextResponse.json({ ok: true })
    }

    if (body.id) {
      const ok = marcarLida(String(body.id), dest)
      if (!ok) return NextResponse.json({ error: 'Notificação não encontrada.' }, { status: 404 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Informe id ou all.' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Erro ao atualizar notificação.' }, { status: 500 })
  }
}

// DELETE /api/notificacoes?id=xxx → deletar uma
export async function DELETE(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const dest = getDestinatario(auth)
    if (!dest) return NextResponse.json({ error: 'Sem destinatário identificado.' }, { status: 400 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })

    const ok = deletarNotificacao(id, dest)
    if (!ok) return NextResponse.json({ error: 'Notificação não encontrada.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro ao excluir notificação.' }, { status: 500 })
  }
}
