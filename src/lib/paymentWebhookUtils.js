// src/lib/paymentWebhookUtils.js
// Lógica compartilhada por webhooks de gateways de pagamento.
// Sempre que um gateway sinaliza "pago", chamar `confirmarPedidoPago`.

import { readPedidos, writePedidos } from './pedidos'
import { readPhotos, writePhotos } from './photos'
import { writeLog } from './paymentLog'
import { getPedidoItens, normalizePedidoStatus } from './commerceUtils'
import { appendNotificacao } from './notificacoes'
import { processarRewardsAoPagar, markPedidoRewardsCredited } from './rewards'

/**
 * Marca um pedido como pago, libera fotos vendidas, credita rewards e envia
 * notificações. Idempotente — se já estiver pago, retorna early.
 *
 * @param {string} pedidoId
 * @param {object} info { gateway, status, chargeId, eventoOriginal }
 * @returns {{ ok: boolean, reason?: string, fotosLiberadas?: number }}
 */
export function confirmarPedidoPago(pedidoId, info = {}) {
  const { gateway = null, status = 'RECEIVED', chargeId = null, eventoOriginal = null } = info
  if (!pedidoId) return { ok: false, reason: 'sem_pedido_id' }

  const pedidos = readPedidos()
  const idx = pedidos.findIndex(p => p.id === pedidoId)
  if (idx === -1) {
    writeLog('error', 'WEBHOOK_PEDIDO_NAO_ENCONTRADO', { gateway, pedidoId, chargeId })
    return { ok: false, reason: 'pedido_nao_encontrado' }
  }

  if (normalizePedidoStatus(pedidos[idx].status) === 'pago') {
    writeLog('info', 'WEBHOOK_PEDIDO_JA_PAGO', { gateway, pedidoId: pedidoId.slice(0, 8) })
    return { ok: true, reason: 'ja_pago', fotosLiberadas: 0 }
  }

  pedidos[idx].status = 'pago'
  pedidos[idx].pagamento = {
    ...(pedidos[idx].pagamento || {}),
    gateway: gateway || pedidos[idx].pagamento?.gateway,
    status,
    pagoEm: new Date().toISOString(),
    webhookEvent: eventoOriginal,
  }
  if (Array.isArray(pedidos[idx].pagamentoTentativas) && chargeId) {
    const ti = pedidos[idx].pagamentoTentativas.findIndex(item => item.chargeId === chargeId)
    if (ti >= 0) {
      pedidos[idx].pagamentoTentativas[ti] = {
        ...pedidos[idx].pagamentoTentativas[ti],
        status,
        pagoEm: pedidos[idx].pagamento.pagoEm,
        webhookEvent: eventoOriginal,
      }
    }
  }

  // Libera fotos do pedido
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
      if (creditInfo) markPedidoRewardsCredited(pedidos[idx], creditInfo)
    } catch (err) {
      writeLog('error', 'WEBHOOK_REWARDS_ERROR', { gateway, erro: err.message })
    }
  }

  writePedidos(pedidos)

  writeLog('success', 'WEBHOOK_PEDIDO_CONFIRMADO', {
    gateway, pedidoId: pedidoId.slice(0, 8),
    evento: eventoOriginal, chargeId, fotosLiberadas: ids.size,
  })

  // Notificações (fire-and-forget)
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

  return { ok: true, fotosLiberadas: ids.size }
}
