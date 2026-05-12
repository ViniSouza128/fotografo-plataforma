// src/app/api/pagamento/status/route.js
// GET /api/pagamento/status?pedidoId=xxx

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { readPedidos, writePedidos } from '../../../../lib/pedidos'
import { readPhotos, writePhotos } from '../../../../lib/photos'
import { getPaymentStatus } from '../../../../lib/payment'
import { getPedidoItens, normalizePedidoStatus } from '../../../../lib/commerceUtils'
import { createDownloadToken, verifyDownloadToken, validateAuthToken } from '../../../../lib/auth'
import { findClientById } from '../../../../lib/clients'

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

async function getAuthContext() {
  try {
    const cookieStore = await cookies()
    const authToken = cookieStore.get('auth_token')?.value
    const auth = validateAuthToken(authToken)
    if (auth?.error) return { payload: null, client: null }
    const { payload, client } = auth
    return { payload, client }
  } catch {
    return { payload: null, client: null }
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const pedidoId = searchParams.get('pedidoId')
    const token = searchParams.get('token')

    if (!pedidoId) {
      return NextResponse.json({ error: 'pedidoId obrigatório' }, { status: 400 })
    }

    const pedidos = readPedidos()
    const idx = pedidos.findIndex(p => p.id === pedidoId)

    if (idx === -1) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    }

    const pedido = pedidos[idx]
    const { payload, client } = await getAuthContext()
    const hasTokenAccess = !!(token && verifyDownloadToken(token, pedidoId))
    const hasClientAccess = !!(payload?.isAdmin || isPedidoOwnedByClient(pedido, client))

    if (!hasTokenAccess && !hasClientAccess) {
      return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 })
    }

    const statusNormalizado = normalizePedidoStatus(pedido.status)

    if (statusNormalizado === 'reembolsado') {
      return NextResponse.json({
        paid: false,
        status: 'reembolsado',
        pedido,
        downloadToken: null,
      })
    }

    // Já está pago ou liberado manualmente
    if (statusNormalizado === 'pago' || statusNormalizado === 'liberado_manual') {
      return NextResponse.json({
        paid: true,
        status: statusNormalizado,
        pedido,
        downloadToken: createDownloadToken(pedido.id),
      })
    }

    // Sem info de pagamento (modo manual ou erro)
    if (!pedido.pagamento?.chargeId || !pedido.pagamento?.gateway) {
      return NextResponse.json({ paid: false, status: pedido.status, pedido })
    }

    if (pedido.paymentExpiresAt && new Date(pedido.paymentExpiresAt).getTime() < Date.now()) {
      return NextResponse.json({
        paid: false,
        status: 'expirado',
        pedido,
        expired: true,
        message: 'Link de pagamento expirado. Gere um novo link para continuar.',
      })
    }

    // Consulta gateway
    const result = await getPaymentStatus({
      gateway: pedido.pagamento.gateway,
      chargeId: pedido.pagamento.chargeId,
    })

    // Confirma pagamento
    if (result.paid && pedido.status !== 'pago') {
      pedidos[idx].status = 'pago'
      pedidos[idx].pagamento.status = result.status
      pedidos[idx].pagamento.pagoEm = new Date().toISOString()
      if (Array.isArray(pedidos[idx].pagamentoTentativas) && pedidos[idx].pagamentoTentativas.length > 0) {
        const attemptIndex = pedidos[idx].pagamentoTentativas.findIndex(item => item.chargeId === pedido.pagamento.chargeId)
        if (attemptIndex >= 0) {
          pedidos[idx].pagamentoTentativas[attemptIndex] = {
            ...pedidos[idx].pagamentoTentativas[attemptIndex],
            status: result.status,
            pagoEm: pedidos[idx].pagamento.pagoEm,
          }
        }
      }

      // Marca fotos como vendidas
      const photos = readPhotos()
      const ids = new Set(getPedidoItens(pedido).map(i => i.photoId || i.id).filter(Boolean))
      const atualizadas = photos.map(p =>
        ids.has(p.id)
          ? { ...p, vendida: true, pedidoId: pedido.id, vendidaEm: new Date().toISOString() }
          : p
      )
      writePhotos(atualizadas)
      writePedidos(pedidos)
    }

    return NextResponse.json({
      paid: result.paid,
      status: result.status,
      pedido: pedidos[idx],
      downloadToken: result.paid ? createDownloadToken(pedidos[idx].id) : null,
    })
  } catch (err) {
    console.error('Erro em GET /api/pagamento/status:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
