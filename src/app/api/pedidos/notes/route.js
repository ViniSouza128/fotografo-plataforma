import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { readPedidos, writePedidos } from '@/lib/pedidos'
import { appendNotificacao } from '@/lib/notificacoes'

const VALID_NOTE_TYPES = new Set(['private', 'public'])

export async function POST(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const body = await request.json()
    const orderId = body.orderId || body.pedidoId
    const type = String(body.type || '').trim().toLowerCase()
    const text = String(body.text || '').trim()

    if (!orderId || !VALID_NOTE_TYPES.has(type) || !text) {
      return NextResponse.json(
        { error: 'orderId, type (private/public) e text sao obrigatorios.' },
        { status: 400 }
      )
    }

    const pedidos = readPedidos()
    const index = pedidos.findIndex(item => item.id === orderId)
    if (index < 0) {
      return NextResponse.json({ error: 'Pedido nao encontrado.' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const note = {
      id: crypto.randomUUID(),
      type,
      text,
      createdAt: now,
      createdBy: auth.payload.id,
    }

    const existingNotes = Array.isArray(pedidos[index].notes) ? pedidos[index].notes : []
    pedidos[index].notes = [...existingNotes, note]
    writePedidos(pedidos)

    // Fire-and-forget: notify client of public note
    if (type === 'public' && pedidos[index].clientId) {
      try {
        appendNotificacao({
          tipo: 'nota_publica',
          destinatario: pedidos[index].clientId,
          titulo: 'Mensagem do fotógrafo',
          mensagem: text.slice(0, 150),
          link: '/minha-conta/compras',
        })
      } catch {}
    }

    return NextResponse.json({ note, pedido: pedidos[index] }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Erro ao adicionar nota.' }, { status: 500 })
  }
}
