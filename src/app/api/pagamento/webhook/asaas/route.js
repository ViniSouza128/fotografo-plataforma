// src/app/api/pagamento/webhook/asaas/route.js
// Webhook Asaas — configure a URL no painel:
//   https://seudominio.com/api/pagamento/webhook/asaas

import { NextResponse } from 'next/server'
import { readPedidos, writePedidos } from '../../../../../lib/pedidos'
import { appendNotificacao } from '@/lib/notificacoes'
import { processarRewardsAoPagar, markPedidoRewardsCredited } from '@/lib/rewards'
import { readPhotos, writePhotos } from '../../../../../lib/photos'
import { writeLog } from '../../../../../lib/paymentLog'
import { getPedidoItens, normalizePedidoStatus } from '../../../../../lib/commerceUtils'

const PAID_EVENTS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']

export async function POST(request) {
  try {
    const event = await request.json()
    writeLog('webhook', 'WEBHOOK_ASAAS_RECEBIDO', {
      evento: event.event,
      paymentId: event.payment?.id,
      externalRef: event.payment?.externalReference,
      valor: event.payment?.value,
      status: event.payment?.status,
    })

    if (!PAID_EVENTS.includes(event.event)) {
      writeLog('info', 'WEBHOOK_ASAAS_IGNORADO', { evento: event.event, motivo: 'evento não é de pagamento confirmado' })
      return NextResponse.json({ received: true })
    }

    const pedidoId = event.payment?.externalReference
    if (!pedidoId) {
      writeLog('error', 'WEBHOOK_ASAAS_SEM_REFERENCIA', { evento: event.event, paymentId: event.payment?.id })
      return NextResponse.json({ received: true })
    }

    const pedidos = readPedidos()
    const idx = pedidos.findIndex(p => p.id === pedidoId)

    if (idx === -1) {
      writeLog('error', 'WEBHOOK_ASAAS_PEDIDO_NAO_ENCONTRADO', { pedidoId, paymentId: event.payment?.id })
      return NextResponse.json({ received: true })
    }

    if (normalizePedidoStatus(pedidos[idx].status) !== 'pago') {
      pedidos[idx].status = 'pago'
      pedidos[idx].pagamento = {
        ...(pedidos[idx].pagamento || {}),
        status: 'RECEIVED',
        pagoEm: new Date().toISOString(),
        webhookEvent: event.event,
      }
      if (Array.isArray(pedidos[idx].pagamentoTentativas)) {
        const attemptIndex = pedidos[idx].pagamentoTentativas.findIndex(item => item.chargeId === event.payment?.id)
        if (attemptIndex >= 0) {
          pedidos[idx].pagamentoTentativas[attemptIndex] = {
            ...pedidos[idx].pagamentoTentativas[attemptIndex],
            status: 'RECEIVED',
            pagoEm: pedidos[idx].pagamento.pagoEm,
            webhookEvent: event.event,
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
          writeLog('error', 'WEBHOOK_ASAAS_REWARDS_ERROR', { erro: err.message })
        }
      }

      writePedidos(pedidos)

      writeLog('success', 'WEBHOOK_ASAAS_PEDIDO_CONFIRMADO', {
        pedidoId: pedidoId.slice(0, 8), evento: event.event,
        paymentId: event.payment?.id, fotosLiberadas: ids.size,
      })
      try {
        const ped = pedidos[idx]
        appendNotificacao({
          tipo: 'pagamento_confirmado',
          destinatario: 'admin',
          titulo: 'Pagamento confirmado',
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
      writeLog('info', 'WEBHOOK_ASAAS_PEDIDO_JA_PAGO', { pedidoId: pedidoId.slice(0, 8) })
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    writeLog('error', 'WEBHOOK_ASAAS_EXCECAO', { erro: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
