// src/app/api/pagamento/webhook/stripe/route.js
// Configure no Stripe Dashboard: https://seudominio.com/api/pagamento/webhook/stripe
// Evento: payment_intent.succeeded

import { NextResponse } from 'next/server'
import { readPedidos, writePedidos } from '../../../../../lib/pedidos'
import { appendNotificacao } from '@/lib/notificacoes'
import { processarRewardsAoPagar, markPedidoRewardsCredited } from '@/lib/rewards'
import { readPhotos, writePhotos } from '../../../../../lib/photos'
import { writeLog } from '../../../../../lib/paymentLog'
import { getPedidoItens, normalizePedidoStatus } from '../../../../../lib/commerceUtils'

export async function POST(request) {
  try {
    const event = await request.json()
    writeLog('webhook', 'WEBHOOK_STRIPE_RECEBIDO', {
      tipo: event.type,
      intentId: event.data?.object?.id,
      status: event.data?.object?.status,
    })

    if (event.type !== 'payment_intent.succeeded') {
      writeLog('info', 'WEBHOOK_STRIPE_IGNORADO', { tipo: event.type })
      return NextResponse.json({ received: true })
    }

    const intent = event.data?.object
    const pedidoId = intent?.metadata?.pedidoId
    if (!pedidoId) {
      writeLog('error', 'WEBHOOK_STRIPE_SEM_PEDIDO_ID', { intentId: intent?.id })
      return NextResponse.json({ received: true })
    }

    const pedidos = readPedidos()
    const idx = pedidos.findIndex(p => p.id === pedidoId)

    if (idx === -1) {
      writeLog('error', 'WEBHOOK_STRIPE_PEDIDO_NAO_ENCONTRADO', { pedidoId, intentId: intent?.id })
      return NextResponse.json({ received: true })
    }

    if (normalizePedidoStatus(pedidos[idx].status) !== 'pago') {
      pedidos[idx].status = 'pago'
      pedidos[idx].pagamento = {
        ...(pedidos[idx].pagamento || {}),
        status: 'succeeded',
        pagoEm: new Date().toISOString(),
        webhookEvent: event.type,
      }
      if (Array.isArray(pedidos[idx].pagamentoTentativas)) {
        const attemptIndex = pedidos[idx].pagamentoTentativas.findIndex(item => item.chargeId === intent?.id)
        if (attemptIndex >= 0) {
          pedidos[idx].pagamentoTentativas[attemptIndex] = {
            ...pedidos[idx].pagamentoTentativas[attemptIndex],
            status: 'succeeded',
            pagoEm: pedidos[idx].pagamento.pagoEm,
            webhookEvent: event.type,
          }
        }
      }

      const photos = readPhotos()
      const ids = new Set(getPedidoItens(pedidos[idx]).map(i => i.photoId || i.id).filter(Boolean))
      const atualizadas = photos.map(p =>
        ids.has(p.id) ? { ...p, vendida: true, pedidoId, vendidaEm: new Date().toISOString() } : p
      )
      writePhotos(atualizadas)

      // Credita rewards (idempotente)
      if (pedidos[idx].rewardsAplicado && !pedidos[idx].rewardsCreditados) {
        try {
          const creditInfo = processarRewardsAoPagar(pedidos[idx])
          if (creditInfo) {
            markPedidoRewardsCredited(pedidos[idx], creditInfo)
          }
        } catch (err) {
          writeLog('error', 'WEBHOOK_STRIPE_REWARDS_ERROR', { erro: err.message })
        }
      }

      writePedidos(pedidos)

      writeLog('success', 'WEBHOOK_STRIPE_PEDIDO_CONFIRMADO', {
        pedidoId: pedidoId.slice(0, 8), intentId: intent?.id, fotosLiberadas: ids.size,
      })
      try {
        const ped = pedidos[idx]
        appendNotificacao({
          tipo: 'pagamento_confirmado',
          destinatario: 'admin',
          titulo: 'Pagamento confirmado (Stripe)',
          mensagem: `${ped.nome || ''} — R$ ${Number(ped.totalComTaxa || ped.total || 0).toFixed(2).replace('.', ',')}`,
          link: '/admin/pedidos',
        })
        if (ped.clientId) {
          appendNotificacao({
            tipo: 'pagamento_confirmado',
            destinatario: ped.clientId,
            titulo: 'Pagamento confirmado!',
            mensagem: 'Suas fotos estão disponíveis para download.',
            link: '/minha-conta/compras',
          })
        }
      } catch {}
    } else {
      writeLog('info', 'WEBHOOK_STRIPE_PEDIDO_JA_PAGO', { pedidoId: pedidoId.slice(0, 8) })
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    writeLog('error', 'WEBHOOK_STRIPE_EXCECAO', { erro: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
