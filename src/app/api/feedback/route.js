import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { readPedidos } from '@/lib/pedidos'
import {
  getFeedbackOrderId,
  getFeedbackUserId,
  normalizeFeedback,
  readFeedbacks,
  writeFeedbacks,
} from '@/lib/feedbacks'
import { isPedidoCompraConcluida } from '@/lib/commerceUtils'

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function isPedidoOwnedByClient(pedido, client) {
  if (!pedido || !client) return false
  if (pedido.clientId && pedido.clientId === client.id) return true

  const clientPhone = normalizePhone(client.whatsapp)
  if (clientPhone && normalizePhone(pedido.whatsapp) === clientPhone) return true

  const clientCpf = normalizeCpf(client.cpf)
  if (clientCpf && normalizeCpf(pedido.cpf) === clientCpf) return true

  const clientEmail = normalizeEmail(client.email)
  if (clientEmail && normalizeEmail(pedido.email) === clientEmail) return true

  return false
}

function toClientPayload(item) {
  const normalized = normalizeFeedback(item)
  return {
    id: normalized.id,
    orderId: normalized.orderId,
    pedidoId: normalized.pedidoId,
    userId: normalized.userId,
    clientId: normalized.clientId,
    rating: normalized.rating,
    comment: normalized.comment,
    texto: normalized.texto,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    criadoEm: normalized.criadoEm,
    atualizadoEm: normalized.atualizadoEm,
  }
}

export async function GET(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId') || searchParams.get('pedidoId')
    const userIdQuery = searchParams.get('userId') || searchParams.get('clientId')
    const isAdmin = !!auth.payload?.isAdmin
    const feedbacks = readFeedbacks()
    const pedidos = readPedidos()

    let filtered = feedbacks

    if (orderId) {
      const pedido = pedidos.find(p => p.id === orderId)
      if (!pedido) {
        return NextResponse.json({ error: 'Pedido nao encontrado.' }, { status: 404 })
      }
      if (!isAdmin && !isPedidoOwnedByClient(pedido, auth.client)) {
        return NextResponse.json({ error: 'Sem permissao para consultar este pedido.' }, { status: 403 })
      }
      filtered = filtered.filter(item => getFeedbackOrderId(item) === orderId)
    }

    if (userIdQuery) {
      if (!isAdmin && userIdQuery !== auth.payload.id) {
        return NextResponse.json({ error: 'Sem permissao para consultar este usuario.' }, { status: 403 })
      }
      filtered = filtered.filter(item => getFeedbackUserId(item) === userIdQuery)
    }

    if (!isAdmin && !orderId && !userIdQuery) {
      filtered = filtered.filter(item => getFeedbackUserId(item) === auth.payload.id)
    }

    filtered.sort((a, b) => {
      const aDate = new Date(a.updatedAt || a.createdAt || a.criadoEm || 0).getTime()
      const bDate = new Date(b.updatedAt || b.createdAt || b.criadoEm || 0).getTime()
      return bDate - aDate
    })

    return NextResponse.json(filtered.map(toClientPayload))
  } catch {
    return NextResponse.json({ error: 'Erro ao ler feedbacks.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const body = await request.json()
    const orderId = body.orderId || body.pedidoId
    const commentRaw = body.comment ?? body.texto ?? ''
    const rating = Number(body.rating)

    if (!orderId || !Number.isInteger(rating)) {
      return NextResponse.json(
        { error: 'orderId e rating sao obrigatorios.' },
        { status: 400 }
      )
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'rating deve ser inteiro entre 1 e 5.' },
        { status: 400 }
      )
    }

    const pedidos = readPedidos()
    const pedido = pedidos.find(p => p.id === orderId)
    if (!pedido) {
      return NextResponse.json({ error: 'Pedido nao encontrado.' }, { status: 404 })
    }

    if (!isPedidoCompraConcluida(pedido.status)) {
      return NextResponse.json(
        { error: 'Feedback so pode ser enviado em pedidos com compra concluida.' },
        { status: 400 }
      )
    }

    const isAdmin = !!auth.payload?.isAdmin
    if (!isAdmin && !isPedidoOwnedByClient(pedido, auth.client)) {
      return NextResponse.json({ error: 'Sem permissao para avaliar este pedido.' }, { status: 403 })
    }

    const userId = auth.payload.id
    const now = new Date().toISOString()
    const comment = String(commentRaw || '').trim() || null

    const feedbacks = readFeedbacks()
    const existingIndex = feedbacks.findIndex(item =>
      getFeedbackOrderId(item) === orderId && getFeedbackUserId(item) === userId
    )

    let saved
    if (existingIndex >= 0) {
      const current = normalizeFeedback(feedbacks[existingIndex])
      saved = normalizeFeedback({
        ...current,
        rating,
        comment,
        texto: comment,
        updatedAt: now,
        atualizadoEm: now,
      })
      feedbacks[existingIndex] = saved
    } else {
      saved = normalizeFeedback({
        id: crypto.randomUUID(),
        orderId,
        pedidoId: orderId,
        userId,
        clientId: userId,
        rating,
        comment,
        texto: comment,
        clienteNome: auth.client?.nomeCompleto || pedido.nome || null,
        createdAt: now,
        criadoEm: now,
        updatedAt: now,
        atualizadoEm: now,
      })
      feedbacks.push(saved)
    }

    writeFeedbacks(feedbacks)
    return NextResponse.json(toClientPayload(saved), { status: existingIndex >= 0 ? 200 : 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Erro ao salvar feedback.' }, { status: 500 })
  }
}
