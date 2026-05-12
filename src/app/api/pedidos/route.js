import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { readPedidos, writePedidos } from '../../../lib/pedidos'
import { readPhotos, writePhotos } from '../../../lib/photos'
import { generatePedidoId } from '../../../lib/id'
import { writeLog } from '../../../lib/paymentLog'
import { getPedidoItens, normalizePedidoStatus } from '../../../lib/commerceUtils'
import { readEvents } from '@/lib/events'
import { computeProgressiveTotalsWithContext } from '@/lib/pricing'
import { validateAuthToken } from '../../../lib/auth'
import { findClientById } from '../../../lib/clients'
import { isAlbumFree } from '@/lib/freeAccess'
import { appendAuditLog } from '@/lib/auditLog'
import { getEmailPrefs, sendEmailPago, sendEmailReembolso } from '@/lib/email'
import { appendNotificacao } from '@/lib/notificacoes'
import { processarRewardsAoPagar, markPedidoRewardsCredited } from '@/lib/rewards'
import { readPhotos as readPhotosForOwnership } from '@/lib/photos'
import { readEvents as readEventsForOwnership } from '@/lib/events'

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function ensureRefund(pedido) {
  const base = {
    requested: false,
    type: 'full',
    photos: [],
    reason: '',
    pixKey: '',
    status: 'pending', // pending | approved | denied | completed
    requestedAt: null,
    resolvedAt: null,
  }
  return { ...base, ...(pedido?.refund || {}) }
}

async function getAuthContext() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value
    const auth = validateAuthToken(token)
    if (auth?.error) return { payload: null, client: null }
    const { payload, client } = auth
    return { payload, client }
  } catch {
    return { payload: null, client: null }
  }
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

function requireAdmin(payload) {
  return !!payload?.isAdmin
}

function requireFullAdmin(payload) {
  return !!payload?.isAdmin && !payload?.isColaborador
}

// GET /api/pedidos
// - admin autenticado: retorna todos
// - usuario autenticado comum: retorna somente os proprios pedidos
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')
    const adminMode = searchParams.get('admin') === '1'

    const { payload, client } = await getAuthContext()
    if (!payload || !client) {
      return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 })
    }

    let pedidos = readPedidos().map(p => ({
      ...p,
      status: normalizePedidoStatus(p.status),
      paymentMethod: p.paymentMethod || p.pagamento?.metodo || null,
      refund: ensureRefund(p),
      reviewed: p.reviewed === true,
    }))

    if (!requireAdmin(payload)) {
      if (adminMode) {
        return NextResponse.json({ error: 'Sem permissao para modo admin.' }, { status: 403 })
      }
      pedidos = pedidos.filter(pedido => isPedidoOwnedByClient(pedido, client))
    } else if (payload.isColaborador) {
      // Colaborador só enxerga pedidos que contêm fotos suas
      const photos = readPhotosForOwnership()
      const events = readEventsForOwnership()
      const eventsById = new Map(events.map(e => [e.id, e]))
      const photoOwnerById = new Map(photos.map(p => [
        p.id,
        p.colaboradorId || (eventsById.get(p.eventId)?.colaboradorId) || null,
      ]))
      pedidos = pedidos.filter(pedido => {
        const itens = getPedidoItens(pedido)
        return itens.some(item => {
          const pid = item.photoId || item.id
          return photoOwnerById.get(pid) === payload.id
        })
      })
    }

    if (eventId) {
      pedidos = pedidos.filter(pedido =>
        getPedidoItens(pedido).some(item => item.eventId === eventId)
      )
    }

    pedidos.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
    return NextResponse.json(pedidos)
  } catch {
    return NextResponse.json({ error: 'Erro ao ler pedidos.' }, { status: 500 })
  }
}

// POST /api/pedidos
// Mantido para uso administrativo/manual legado.
export async function POST(request) {
  try {
    const { payload, client } = await getAuthContext()
    if (!requireFullAdmin(payload)) {
      return NextResponse.json({ error: 'Sem permissao para criar pedido manual.' }, { status: 403 })
    }

    const body = await request.json()
    const { nome, whatsapp, cpf, clientId, itens, status: statusInput, paymentMethod: pmInput, reviewed } = body

    if (!nome || !whatsapp || !itens?.length) {
      return NextResponse.json(
        { error: 'nome, whatsapp e itens sao obrigatorios.' },
        { status: 400 }
      )
    }

    const pedidos = readPedidos()
    const photos = readPhotos()
    const events = readEvents()
    const eventsById = Object.fromEntries(events.map(ev => [ev.id, ev]))
    const itensCanonicos = itens.map(item => {
      const ev = eventsById[item.eventId]
      const basePrice = Number(item.price)
      const effectivePrice = isAlbumFree(ev) ? 0 : (Number.isFinite(basePrice) ? basePrice : 0)
      return {
        photoId: item.id,
        eventId: item.eventId,
        eventName: item.eventName,
        filename: item.filename,
        filenameWm: item.filenameWm,
        filenameMini: item.filenameMini || null,
        originalName: item.originalName || item.filename,
        publicId: item.publicId || null,
        price: effectivePrice,
        priceOriginal: Number.isFinite(basePrice) ? basePrice : 0,
        priceEffective: effectivePrice,
        isFree: effectivePrice === 0,
      }
    })
    const pricing = computeProgressiveTotalsWithContext(itensCanonicos, { eventsById, ignoreFreeInCount: true })
    const subtotal = pricing.subtotal
    const descontoProgressivoValor = pricing.descontoTotal
    const total = pricing.total

    const novoPedido = {
      id: crypto.randomUUID(),
      publicId: generatePedidoId(),
      nome,
      whatsapp,
      cpf: cpf ? normalizeCpf(cpf) : null,
      clientId: clientId || null,
      subtotal,
      descontoProgressivo: descontoProgressivoValor > 0 ? { valor: descontoProgressivoValor, linhas: pricing.linhas } : null,
      totalSemTaxas: total,
      total,
      status: statusInput || 'pago',
      paymentMethod: pmInput || 'manual',
      reviewed: reviewed === true,
      refund: ensureRefund(null),
      itens: pricing.itensComDesconto,
      downloads: 0,
      criadoEm: new Date().toISOString(),
    }

    pedidos.push(novoPedido)
    writePedidos(pedidos)

    const idsVendidos = new Set(itens.map(item => item.id))
    const fotosAtualizadas = photos.map(photo => {
      if (!idsVendidos.has(photo.id)) return photo
      return {
        ...photo,
        vendida: true,
        pedidoId: novoPedido.id,
        vendidaEm: novoPedido.criadoEm,
      }
    })
    writePhotos(fotosAtualizadas)

    appendAuditLog({
      action: 'order.created_manual',
      actor: client || payload,
      target: { type: 'pedido', id: novoPedido.id, publicId: novoPedido.publicId, label: novoPedido.nome },
      details: {
        status: novoPedido.status,
        paymentMethod: novoPedido.paymentMethod,
        total: novoPedido.total,
        items: novoPedido.itens.length,
        clientId: novoPedido.clientId,
      },
      request,
    })

    return NextResponse.json(novoPedido, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Erro ao criar pedido.' }, { status: 500 })
  }
}

// PATCH /api/pedidos
// Body: { id, status }
export async function PATCH(request) {
  try {
    const { payload, client } = await getAuthContext()
    if (!requireFullAdmin(payload)) {
      return NextResponse.json({ error: 'Sem permissao para atualizar pedido.' }, { status: 403 })
    }

    const { id, status, paymentMethod, refund, reviewed } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'id e status obrigatorios.' }, { status: 400 })
    }

    const pedidos = readPedidos()
    const idx = pedidos.findIndex(p => p.id === id)
    if (idx === -1) {
      return NextResponse.json({ error: 'Pedido nao encontrado.' }, { status: 404 })
    }

    const oldPedido = JSON.parse(JSON.stringify(pedidos[idx]))
    pedidos[idx].refund = ensureRefund(pedidos[idx])

    if (status) {
      pedidos[idx].status = status
    }
    if (paymentMethod) {
      pedidos[idx].paymentMethod = paymentMethod
    }
    if (typeof reviewed === 'boolean') {
      pedidos[idx].reviewed = reviewed
    }

    // Atualização de reembolso
    if (refund && typeof refund === 'object') {
      const merged = { ...ensureRefund(pedidos[idx]), ...refund }
      pedidos[idx].refund = merged

      // status do pedido acompanha refund
      if (merged.status === 'pending' || merged.status === 'approved') {
        pedidos[idx].status = 'reembolso_solicitado'
      }
      if (merged.status === 'denied') {
        pedidos[idx].status = 'reembolso_negado'
        pedidos[idx].refund.resolvedAt = pedidos[idx].refund.resolvedAt || new Date().toISOString()
      }
      if (merged.status === 'completed') {
        pedidos[idx].status = 'reembolsado'
        pedidos[idx].refund.resolvedAt = pedidos[idx].refund.resolvedAt || new Date().toISOString()
      }
    }

    const statusNormalizado = normalizePedidoStatus(pedidos[idx].status)
    const statusAntes = normalizePedidoStatus(oldPedido.status)

    if ((statusNormalizado === 'pago' || statusNormalizado === 'liberado_manual') && statusAntes !== 'pago' && statusAntes !== 'liberado_manual') {
      const agora = new Date().toISOString()

      try {
        const photos = readPhotos()
        const ids = new Set(getPedidoItens(oldPedido).map(item => item.photoId || item.id).filter(Boolean))
        if (ids.size > 0) {
          const updated = photos.map(photo =>
            ids.has(photo.id)
              ? { ...photo, vendida: true, pedidoId: oldPedido.id, vendidaEm: agora }
              : photo
          )
          writePhotos(updated)
        }
      } catch {}

      const gw = oldPedido.pagamento?.gateway
      if (gw && gw !== 'manual') {
        pedidos[idx].pagamento = {
          ...(oldPedido.pagamento || {}),
          sobreposto: true,
          sobrepostoEm: agora,
          sobrepostoPor: 'fotografo',
          statusOriginalGateway: oldPedido.pagamento?.status || null,
        }
        writeLog('info', 'PAGAMENTO_SOBREPOSTO_MANUALMENTE', {
          pedidoId: oldPedido.id.slice(0, 8),
          gateway: gw,
          statusAnterior: oldPedido.status,
          statusGateway: oldPedido.pagamento?.status,
        })
      }
    }

    writePedidos(pedidos)

    // Fire-and-forget email triggers
    const updatedPedido = pedidos[idx]
    const recipientClient = updatedPedido.clientId ? findClientById(updatedPedido.clientId) : null
    const toEmail = recipientClient?.email || updatedPedido.email || null
    const toNome = recipientClient?.nomeCompleto || updatedPedido.nome || 'Cliente'
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

    if (toEmail) {
      const emailPrefs = getEmailPrefs(recipientClient)
      const newStatus = normalizePedidoStatus(updatedPedido.status)
      const wasNotPaid = statusAntes !== 'pago' && statusAntes !== 'liberado_manual'
      if ((newStatus === 'pago' || newStatus === 'liberado_manual') && wasNotPaid) {
        // Credita cashback / saldoFlat (idempotente)
        if (updatedPedido.rewardsAplicado && !updatedPedido.rewardsCreditados) {
          try {
            const creditInfo = processarRewardsAoPagar(updatedPedido)
            if (creditInfo) {
              markPedidoRewardsCredited(updatedPedido, creditInfo)
              pedidos[idx].rewardsCreditados = true
              pedidos[idx].rewardsCreditadosEm = updatedPedido.rewardsCreditadosEm
              pedidos[idx].rewardsCreditoInfo = updatedPedido.rewardsCreditoInfo
              writePedidos(pedidos)
            }
          } catch (err) {
            console.error('Erro ao creditar rewards:', err.message)
          }
        }
        // Notify the client that their order is paid
        if (recipientClient?.id) {
          appendNotificacao({
            tipo: 'pagamento_confirmado',
            destinatario: recipientClient.id,
            titulo: 'Pagamento confirmado!',
            mensagem: 'Suas fotos estão disponíveis para download.',
            link: '/minha-conta/compras',
          })
        }
      }
      if ((newStatus === 'pago' || newStatus === 'liberado_manual') && wasNotPaid && emailPrefs.pago) {
        sendEmailPago({
          to: toEmail,
          nome: toNome,
          pedidoId: updatedPedido.publicId || updatedPedido.id,
          total: updatedPedido.total,
          siteUrl,
        }).catch(() => {})
      }
      const refundStatus = ensureRefund(updatedPedido).status
      const oldRefundStatus = ensureRefund(oldPedido).status
      if (refundStatus !== oldRefundStatus) {
        // Notify admin of refund status change
        appendNotificacao({
          tipo: 'reembolso',
          destinatario: 'admin',
          titulo: 'Reembolso atualizado',
          mensagem: `Pedido de ${toNome} — status: ${refundStatus}`,
          link: '/admin/pedidos',
        })
      }
      if (refundStatus !== oldRefundStatus && emailPrefs.reembolso) {
        sendEmailReembolso({
          to: toEmail,
          nome: toNome,
          pedidoId: updatedPedido.publicId || updatedPedido.id,
          status: refundStatus,
          siteUrl,
        }).catch(() => {})
      }
    }

    appendAuditLog({
      action: 'order.updated',
      actor: client || payload,
      target: { type: 'pedido', id: pedidos[idx].id, publicId: pedidos[idx].publicId, label: pedidos[idx].nome },
      details: {
        status: { from: oldPedido.status, to: pedidos[idx].status },
        paymentMethod: { from: oldPedido.paymentMethod || oldPedido.pagamento?.metodo || null, to: pedidos[idx].paymentMethod || null },
        reviewed: { from: oldPedido.reviewed === true, to: pedidos[idx].reviewed === true },
        refundStatus: { from: ensureRefund(oldPedido).status, to: ensureRefund(pedidos[idx]).status },
      },
      request,
    })
    return NextResponse.json(pedidos[idx])
  } catch {
    return NextResponse.json({ error: 'Erro ao atualizar pedido.' }, { status: 500 })
  }
}
