// src/app/api/chat/route.js
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import {
  appendMensagem,
  marcarLidasPorAdmin,
  marcarLidasPorCliente,
  getThread,
  listarThreadsAdmin,
  contarNaoLidasAdmin,
  contarNaoLidasCliente,
} from '@/lib/chat'
import { readClients } from '@/lib/clients'

// GET /api/chat — admin: lista threads; GET /api/chat?clientId=xxx — admin: thread
// GET /api/chat?meu=1 — client: sua thread
// GET /api/chat?count=1 — count de não lidas (admin ou client)
export async function GET(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    const { searchParams } = new URL(request.url)
    const isAdmin = auth.payload.isAdmin
    const count = searchParams.get('count')

    if (count) {
      const n = isAdmin
        ? contarNaoLidasAdmin()
        : contarNaoLidasCliente(auth.payload.id)
      return NextResponse.json({ count: n })
    }

    if (isAdmin) {
      const clientId = searchParams.get('clientId')
      if (clientId) {
        const thread = getThread(clientId)
        if (!thread) return NextResponse.json({ mensagens: [], clientId, clientNome: '' })
        return NextResponse.json(thread)
      }
      return NextResponse.json(listarThreadsAdmin())
    }

    // Client: own thread only
    const thread = getThread(auth.payload.id)
    if (!thread) return NextResponse.json({ mensagens: [], clientId: auth.payload.id })
    return NextResponse.json(thread)
  } catch (err) {
    console.error('[chat] GET error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// POST /api/chat — send message
// Body: { texto, clientId? (admin only) }
export async function POST(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const body = await request.json()
    const texto = String(body?.texto || '').trim()
    if (!texto) return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 })

    const isAdmin = auth.payload.isAdmin

    let clientId, clientNome, de
    if (isAdmin) {
      clientId = body?.clientId
      if (!clientId) return NextResponse.json({ error: 'clientId obrigatorio.' }, { status: 400 })
      const clients = readClients()
      const cli = clients.find(c => c.id === clientId)
      if (!cli) return NextResponse.json({ error: 'Cliente nao encontrado.' }, { status: 404 })
      clientNome = cli.nomeCompleto || ''
      de = 'admin'
    } else {
      clientId = auth.payload.id
      clientNome = auth.payload.nomeCompleto || ''
      de = 'client'
    }

    const { msg } = appendMensagem(clientId, clientNome, { de, texto })
    return NextResponse.json({ ok: true, msg })
  } catch (err) {
    console.error('[chat] POST error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// PATCH /api/chat — marcar como lida
// Admin: { clientId } → marca mensagens do cliente como lidas pelo admin
// Client: {} → marca mensagens do admin como lidas pelo cliente
export async function PATCH(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const isAdmin = auth.payload.isAdmin
    const body = await request.json().catch(() => ({}))

    if (isAdmin) {
      const clientId = body?.clientId
      if (!clientId) return NextResponse.json({ error: 'clientId obrigatorio.' }, { status: 400 })
      marcarLidasPorAdmin(clientId)
    } else {
      marcarLidasPorCliente(auth.payload.id)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[chat] PATCH error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
