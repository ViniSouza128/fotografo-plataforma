// src/app/api/pagamento/route.js
// POST /api/pagamento  →  cria pedido + cobrança no gateway configurado

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  appendPaymentAttempt,
  getPaymentExpiresAt,
  haveSamePedidoPhotos,
  isPaymentLinkExpired,
  readPedidos,
  writePedidos,
} from '../../../lib/pedidos'
import { readPhotos, writePhotos } from '../../../lib/photos'
import { generatePedidoId } from '../../../lib/id'
import { createPayment, getPaymentConfig } from '../../../lib/payment'
import { writeLog } from '../../../lib/paymentLog'
import { getAvailablePaymentMethods, resolvePaymentGateways } from '../../../lib/commerceUtils'
import { createDownloadToken, validateAuthToken } from '../../../lib/auth'
import { readClients, writeClients } from '../../../lib/clients'
import { readEvents } from '../../../lib/events'
import { readConfig } from '../../../lib/config'
import { computeProgressiveTotalsWithContext } from '../../../lib/pricing'
import { getEffectivePrice, isPhotoFree } from '@/lib/freeAccess'
import { appendNotificacao } from '@/lib/notificacoes'
import { validarCupom, registrarUsoCupom } from '@/lib/cupons'
import {
  aplicarRewardsAoPedido,
  debitarSaldo,
  processarRewardsAoPagar,
  markPedidoRewardsCredited,
} from '@/lib/rewards'
import {
  findPropostaById,
  cartSignature,
  isStatusUsavelNoCheckout,
  getValorAcordado,
  markPropostaUsada,
} from '@/lib/propostas'

const REUSABLE_PAYMENT_STATUSES = ['pendente', 'cancelado']

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeText(value) {
  return String(value || '').trim()
}

function canUserAccessPedido(pedido, payload, { whatsapp, cpf, clientId } = {}) {
  if (!pedido) return false
  if (payload?.isAdmin) return true
  if (payload?.id && pedido.clientId && payload.id === pedido.clientId) return true
  if (clientId && pedido.clientId && clientId === pedido.clientId) return true
  if (whatsapp && normalizeDigits(pedido.whatsapp) === normalizeDigits(whatsapp)) return true
  if (cpf && normalizeDigits(pedido.cpf) === normalizeDigits(cpf)) return true
  return false
}

function findReusablePedido({ pedidos, pedidoId, payload, clientId, whatsapp, cpf, itens }) {
  if (pedidoId) {
    const idx = pedidos.findIndex(p => p.id === pedidoId)
    if (idx === -1) return { error: 'Pedido nao encontrado.', status: 404 }
    const pedido = pedidos[idx]
    if (!canUserAccessPedido(pedido, payload, { whatsapp, cpf, clientId })) {
      return { error: 'Pedido nao encontrado.', status: 404 }
    }
    if (!REUSABLE_PAYMENT_STATUSES.includes(String(pedido.status || '').toLowerCase())) {
      return { error: 'Apenas pedidos pendentes ou cancelados podem receber novo link.', status: 409 }
    }
    if (String(pedido.status || '').toLowerCase() === 'cancelado' && !payload?.isAdmin) {
      return { error: 'Apenas admin pode reabrir pedido cancelado.', status: 403 }
    }
    if (Array.isArray(itens) && itens.length > 0 && !haveSamePedidoPhotos(pedido, itens)) {
      return { error: 'Os itens informados nao correspondem ao pedido existente.', status: 409 }
    }
    return { idx, pedido }
  }

  const idx = pedidos.findIndex(pedido => {
    if (String(pedido.status || '').toLowerCase() !== 'pendente') return false
    if (!canUserAccessPedido(pedido, payload, { whatsapp, cpf, clientId })) return false
    return haveSamePedidoPhotos(pedido, itens)
  })
  return idx >= 0 ? { idx, pedido: pedidos[idx] } : { idx: -1, pedido: null }
}

function buildPagamentoSnapshot({ chargeResult, gateway, metodo, criadoEm, expiresAt }) {
  return {
    gateway,
    chargeId: chargeResult.chargeId,
    metodo: chargeResult.metodo || metodo,
    status: chargeResult.status,
    criadoEm,
    expiresAt,
    pixCode: chargeResult.pixCode || null,
    pixQR: chargeResult.pixQR || null,
    pixQRUrl: chargeResult.pixQRUrl || null,
    asaasPaymentLink: chargeResult.asaasPaymentLink || null,
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const {
      nome,
      whatsapp,
      cpf,
      cnpj,
      documentType,
      clientId,
      itens,
      metodo,
      adminBypass,
      parcelas: parcelasRaw,
      clientComment,
      pedidoId,
      cupomCodigo,
      saldoUtilizado: saldoSolicitado,
      propostaId,
    } = body
    const parcelas = Math.max(1, Math.min(12, parseInt(parcelasRaw) || 1))
    const paymentDocument = normalizeDigits(cnpj || cpf)
    const effectiveDocumentType = documentType === 'cnpj' || cnpj ? 'cnpj' : 'cpf'
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value
    const authResult = token ? validateAuthToken(token) : null
    if (authResult?.error) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.status })
    }
    const authPayload = authResult?.payload || null

    // Valida admin bypass — exige token de admin/super-admin
    if (adminBypass) {
      if (!authPayload?.isAdmin) {
        return NextResponse.json({ error: 'Sem permissão para bypass de pagamento.' }, { status: 403 })
      }
    }

    const isExistingPaymentRequest = !!pedidoId
    if (!isExistingPaymentRequest && (!nome || !whatsapp || !Array.isArray(itens) || itens.length === 0)) {
      return NextResponse.json(
        { error: 'nome, whatsapp e itens são obrigatórios' },
        { status: 400 }
      )
    }

    if (authPayload?.id && clientId && clientId !== authPayload.id && !authPayload.isAdmin) {
      return NextResponse.json({ error: 'clientId invalido para o usuario autenticado.' }, { status: 403 })
    }

    const pgConfig = getPaymentConfig()
    const metodosDisponiveis = getAvailablePaymentMethods(pgConfig)
    const metodoEscolhido = metodo || metodosDisponiveis[0] || null
    const gatewayResolution = metodoEscolhido ? resolvePaymentGateways(pgConfig, metodoEscolhido) : null
    const gateway = gatewayResolution?.effectivePrimary || null
    const fallback = gatewayResolution?.effectiveFallback || null
    const effectiveClientId = authPayload?.id || clientId || null

    const pedidos = readPedidos()
    const photos = readPhotos()
    const events = readEvents()
    const eventsMap = new Map(events.map(ev => [ev.id, ev]))

    const explicitReusable = pedidoId
      ? findReusablePedido({
          pedidos,
          pedidoId,
          payload: authPayload,
          clientId: effectiveClientId || clientId || null,
          whatsapp,
          cpf: paymentDocument,
          itens: Array.isArray(itens) ? itens : [],
        })
      : null
    if (explicitReusable?.error) {
      return NextResponse.json({ error: explicitReusable.error }, { status: explicitReusable.status || 400 })
    }

    const requestedItems = Array.isArray(itens) && itens.length > 0
      ? itens
      : (explicitReusable?.pedido?.itens || explicitReusable?.pedido?.items || [])
    const canonicalItens = []
    const seenItemIds = new Set()

    // Carrega vídeos só se houver algum item de vídeo
    const hasVideoItems = requestedItems.some(it => it?.mediaType === 'video' || it?.tipo === 'video')
    let allVideos = []
    if (hasVideoItems) {
      try {
        const mod = await import('@/lib/videos')
        allVideos = mod.readVideos()
      } catch {}
    }

    for (const item of requestedItems) {
      const isVideoItem = item?.mediaType === 'video' || item?.tipo === 'video'

      if (isVideoItem) {
        const videoId = item?.videoId || item?.id
        const cartKey = `${videoId}:${item?.isRaw ? 'raw' : 'final'}`
        if (!videoId || seenItemIds.has(cartKey)) continue
        seenItemIds.add(cartKey)

        const video = allVideos.find(v => v.id === videoId)
        if (!video || video.removida) {
          return NextResponse.json({ error: 'Um ou mais vídeos selecionados nao estao disponiveis.' }, { status: 400 })
        }

        const event = eventsMap.get(video.eventId)
        const albumFree = !!event?.albumGratis
        const cfg = readConfig()
        const cfgDefault = Number(cfg?.precoVideoDefault) || 0
        const evDefault = Number(event?.precoVideoPadrao ?? cfgDefault) || 0
        const effective = item?.isRaw
          ? Number(video.rawPrice ?? video.price ?? evDefault)
          : Number(video.price ?? evDefault)
        const canonicalPrice = albumFree ? 0 : (Number.isFinite(effective) ? effective : 0)

        canonicalItens.push({
          photoId: video.id,           // mantém compat com helpers que olham photoId
          videoId: video.id,
          mediaType: 'video',
          tipo: 'video',
          eventId: video.eventId,
          eventName: item?.eventName || event?.name || 'Evento',
          filename: video.filename,
          originalName: video.originalName || video.filename,
          publicId: video.publicId || null,
          posterClean: video.posterClean || null,
          duration: video.duration || null,
          width: video.width || null,
          height: video.height || null,
          isRaw: !!item?.isRaw,
          supportsRawDelivery: !!video.supportsRawDelivery,
          rawDeliveryNote: item?.isRaw ? (video.rawDeliveryNote || null) : null,
          price: Math.round(canonicalPrice * 100) / 100,
          priceOriginal: Math.round(canonicalPrice * 100) / 100,
          priceEffective: Math.round(canonicalPrice * 100) / 100,
          isFree: canonicalPrice === 0,
        })
        continue
      }

      const photoId = item?.id || item?.photoId
      const tierId = item?.tier || null
      const cartKey = tierId ? `${photoId}:${tierId}` : photoId
      if (!photoId || seenItemIds.has(cartKey)) continue
      seenItemIds.add(cartKey)

      const photo = photos.find(p => p.id === photoId)
      if (!photo || photo.removida) {
        return NextResponse.json({ error: 'Uma ou mais fotos selecionadas nao estao disponiveis.' }, { status: 400 })
      }

      const locked = item?.priceLocked
      const lockedValue = locked && locked.lockedByAdmin === true && Number.isFinite(Number(locked.value))
        ? Number(locked.value)
        : null
      const event = eventsMap.get(photo.eventId)
      const isFree = isPhotoFree(photo, event)
      const effectivePrice = getEffectivePrice(photo, event)
      let canonicalPrice = isFree ? 0 : (lockedValue != null ? lockedValue : effectivePrice)

      // Tier pricing — recalcula no servidor a partir da config (ignora client-side)
      let canonicalTier = null
      if (tierId && !isFree && lockedValue == null) {
        try {
          const { getEffectiveTiersConfig, findTier, getPriceForTier, isTierEligibleForPhoto } = await import('@/lib/downloadTiers')
          const tCfg = getEffectiveTiersConfig(event)
          if (!tCfg.ativo) {
            return NextResponse.json({ error: 'Venda por resolução não está ativa.' }, { status: 400 })
          }
          const tier = findTier(tCfg, tierId)
          if (!tier) {
            return NextResponse.json({ error: `Tier "${tierId}" inválido.` }, { status: 400 })
          }
          if (!isTierEligibleForPhoto(tier, photo)) {
            return NextResponse.json({ error: `Original sem resolução suficiente para o tier ${tier.label}.` }, { status: 400 })
          }
          canonicalPrice = getPriceForTier(effectivePrice, tier)
          canonicalTier = {
            id: tier.id, label: tier.label,
            maxLongSide: tier.maxLongSide ?? null,
            ordem: Number(tier.ordem) || 0,
            multiplier: Number.isFinite(Number(tier.multiplier)) ? Number(tier.multiplier) : null,
            fixedPrice: Number.isFinite(Number(tier.fixedPrice)) ? Number(tier.fixedPrice) : null,
          }
        } catch (err) {
          console.error('Erro ao processar tier:', err)
        }
      }

      if (!Number.isFinite(canonicalPrice) || canonicalPrice < 0) {
        return NextResponse.json({ error: 'Foto com preco invalido no servidor.' }, { status: 400 })
      }

      canonicalItens.push({
        photoId: photo.id,
        eventId: photo.eventId,
        eventName: item?.eventName || event?.name || 'Evento',
        filename: photo.filename,
        filenameWm: photo.filenameWm,
        filenameMini: photo.filenameMini || null,
        originalName: photo.originalName || photo.filename,
        publicId: photo.publicId || null,
        price: Math.round(canonicalPrice * 100) / 100,
        priceOriginal: Number(photo.price) || 0,
        priceEffective: Math.round(canonicalPrice * 100) / 100,
        isFree,
        priceLocked: lockedValue != null ? { value: lockedValue, lockedByAdmin: true } : undefined,
        tier: canonicalTier?.id || null,
        tierLabel: canonicalTier?.label || null,
        tierMaxLongSide: canonicalTier?.maxLongSide ?? null,
        tierOrdem: canonicalTier?.ordem ?? null,
      })
    }

    if (canonicalItens.length === 0) {
      return NextResponse.json({ error: 'Nenhuma foto valida para finalizar o pedido.' }, { status: 400 })
    }

    const eventsById = Object.fromEntries(events.map(ev => [ev.id, ev]))

    const previousPaidByEvent = (() => {
      const map = {}
      if (!effectiveClientId) return map
      const isPaidStatus = (s) => ['pago', 'liberado_manual'].includes(String(s || '').toLowerCase())
      pedidos.forEach(p => {
        if (!isPaidStatus(p.status)) return
        if (p.clientId === effectiveClientId || (p.whatsapp && p.whatsapp === whatsapp)) {
          (p.itens || p.items || []).forEach(item => {
            const evId = item.eventId
            const price = Number(item.price || item.priceOriginal || 0)
            if (price <= 0) return
            map[evId] = (map[evId] || 0) + 1
          })
        }
      })
      return map
    })()

    const pricing = computeProgressiveTotalsWithContext(canonicalItens, {
      eventsById,
      previousPaidByEvent,
      ignoreFreeInCount: true,
    })
    const itensComDesconto = pricing.itensComDesconto
    const subtotal = pricing.subtotal
    const descontoProgressivoValor = pricing.descontoTotal
    let total = pricing.total

    // Cupom de desconto (validação server-side, nunca confiar no cliente)
    let descontoCupom = null
    if (cupomCodigo) {
      const cupomCheck = validarCupom({
        codigo: cupomCodigo,
        items: itensComDesconto,
        clientId: effectiveClientId,
      })
      if (!cupomCheck.valido) {
        return NextResponse.json(
          { error: `Cupom inválido: ${cupomCheck.error}`, code: cupomCheck.code || 'cupom_invalido' },
          { status: 400 }
        )
      }
      const valorDesconto = Math.min(cupomCheck.desconto, total)
      total = Math.round((total - valorDesconto) * 100) / 100
      descontoCupom = {
        cupomId: cupomCheck.cupom.id,
        codigo: cupomCheck.cupom.codigo,
        tipo: cupomCheck.cupom.tipo,
        valor: cupomCheck.valorEfetivo,
        desconto: valorDesconto,
        subtotalAplicavel: cupomCheck.subtotalAplicavel,
      }
    }

    // Proposta aceita: substitui o total acordado, ignorando demais descontos/saldo/rewards.
    let propostaAplicada = null
    let totalAntesProposta = total
    if (propostaId) {
      const proposta = findPropostaById(propostaId)
      if (!proposta) {
        return NextResponse.json({ error: 'Proposta não encontrada.' }, { status: 400 })
      }
      if (!effectiveClientId || proposta.clientId !== effectiveClientId) {
        return NextResponse.json({ error: 'Proposta não pertence a este cliente.' }, { status: 403 })
      }
      if (!isStatusUsavelNoCheckout(proposta.status)) {
        return NextResponse.json({ error: `Proposta não está em estado válido para checkout (${proposta.status}).` }, { status: 400 })
      }
      const sigAtual = cartSignature(canonicalItens)
      if (sigAtual !== proposta.cartSignature) {
        return NextResponse.json({ error: 'Itens do carrinho mudaram após a aceitação. Crie uma nova proposta.', code: 'proposta_invalida' }, { status: 400 })
      }
      const valorAcordado = getValorAcordado(proposta)
      if (!(valorAcordado > 0)) {
        return NextResponse.json({ error: 'Valor da proposta inválido.' }, { status: 400 })
      }
      total = Math.round(valorAcordado * 100) / 100
      propostaAplicada = {
        propostaId: proposta.id,
        statusOriginal: proposta.status,
        valorAcordado: total,
        valorPropostoCliente: proposta.valorPropostoCliente,
        valorContraproposta: proposta.valorContraproposta,
      }
    }

    // Rewards: nivel de desconto + uso de saldo (validacao server-side)
    // Quando proposta esta aplicada, nao usa rewards/saldo automaticos
    const rewardsResult = propostaAplicada
      ? { rewardsAplicado: null, total, saldoUtilizado: 0, saldoDisponivelAntes: 0 }
      : aplicarRewardsAoPedido({
          clientId: effectiveClientId,
          totalAposCupom: total,
          saldoSolicitado: Number(saldoSolicitado) || 0,
        })
    total = rewardsResult.total
    const rewardsAplicado = rewardsResult.rewardsAplicado
    const saldoUtilizadoFinal = rewardsResult.saldoUtilizado || 0
    const isManual = gateway === 'manual'
    const isFree = total === 0 // carrinho 100% gratuito — sem gateway
    const isAdminBypass = !!adminBypass // admin finalizando sem cobrança

    if (isManual && !authPayload?.isAdmin) {
      return NextResponse.json(
        { error: 'Gateway manual indisponivel para clientes. Use um gateway online ativo.' },
        { status: 403 }
      )
    }

    // Taxa de parcelamento: repasse ao cliente apenas o excedente sobre taxa PIX
    function calcInstallmentFee(base, n) {
      if (n <= 1) return 0
      const totalComJuros = base * Math.pow(1.0299, n)
      const taxaCartao = totalComJuros - base
      const taxaPix = base * 0.0099
      return Math.max(0, Math.round((taxaCartao - taxaPix) * 100) / 100)
    }
    if (!isAdminBypass && !isManual && !isFree && (!metodoEscolhido || !metodosDisponiveis.includes(metodoEscolhido))) {
      return NextResponse.json(
        { error: `Metodo de pagamento indisponivel para o gateway ativo (${gateway}).` },
        { status: 400 }
      )
    }
    if (!isAdminBypass && !isManual && !isFree && !gatewayResolution?.hasSupportedGateway) {
      return NextResponse.json(
        { error: `Nenhum gateway configurado suporta o metodo ${metodoEscolhido}.` },
        { status: 400 }
      )
    }

    const taxaParcelamento = (metodoEscolhido === 'cartao' && !isManual && !isFree && !isAdminBypass) ? calcInstallmentFee(total, parcelas) : 0
    const totalComTaxa = total + taxaParcelamento

    const reusableLookup = explicitReusable || findReusablePedido({
      pedidos,
      payload: authPayload,
      clientId: effectiveClientId,
      whatsapp,
      cpf: paymentDocument,
      itens: itensComDesconto,
    })

    if (reusableLookup?.pedido && !isManual && !isFree && !isAdminBypass) {
      const pedidoExistente = reusableLookup.pedido
      const idxExistente = reusableLookup.idx
      const payer = {
        nome: normalizeText(nome || pedidoExistente.nome),
        whatsapp: normalizeDigits(whatsapp || pedidoExistente.whatsapp),
        cpf: normalizeDigits(paymentDocument || pedidoExistente.cpf) || null,
        email: normalizeText(body.email || pedidoExistente.email || ''),
      }
      const expiresAt = getPaymentExpiresAt()
      const paymentTotal = Number(pedidoExistente.total) || totalComTaxa
      let chargeResult = null
      let usedGateway = gateway

      try {
        chargeResult = await createPayment({
          gateway,
          metodo: metodoEscolhido,
          cpf: payer.cpf || '',
          nome: payer.nome || pedidoExistente.nome,
          telefone: payer.whatsapp || pedidoExistente.whatsapp,
          total: paymentTotal,
          parcelas,
          pedidoId: pedidoExistente.id,
        })
      } catch (primaryErr) {
        if (fallback && fallback !== gateway) {
          try {
            chargeResult = await createPayment({
              gateway: fallback,
              metodo: metodoEscolhido,
              cpf: payer.cpf || '',
              nome: payer.nome || pedidoExistente.nome,
              telefone: payer.whatsapp || pedidoExistente.whatsapp,
              total: paymentTotal,
              parcelas,
              pedidoId: pedidoExistente.id,
            })
            usedGateway = fallback
            writeLog('error', 'FALLBACK_ATIVADO', {
              gatewayPrimario: gateway, gatewayFallback: fallback,
              motivo: primaryErr.message, pedidoId: pedidoExistente.id.slice(0, 8),
            })
          } catch (fallbackErr) {
            return NextResponse.json(
              { error: `Erro no gateway de pagamento: ${fallbackErr.message}` },
              { status: 502 }
            )
          }
        } else {
          return NextResponse.json(
            { error: `Erro no gateway de pagamento: ${primaryErr.message}` },
            { status: 502 }
          )
        }
      }

      const attempt = appendPaymentAttempt(pedidoExistente, {
        gateway: usedGateway,
        metodo: chargeResult.metodo || metodoEscolhido,
        chargeId: chargeResult.chargeId,
        status: chargeResult.status,
        total: paymentTotal,
        parcelas: parcelas > 1 ? parcelas : null,
        expiresAt,
        pagador: payer,
        source: authPayload?.isAdmin ? 'admin_regenerate' : (isPaymentLinkExpired(pedidoExistente) ? 'expired_refresh' : 'method_change'),
      })

      pedidoExistente.status = 'pendente'
      pedidoExistente.paymentExpiresAt = expiresAt
      pedidoExistente.pagador = payer
      pedidoExistente.donoCompra = {
        clientId: pedidoExistente.clientId || effectiveClientId || null,
      }
      pedidoExistente.pagamento = buildPagamentoSnapshot({
        chargeResult,
        gateway: usedGateway,
        metodo: metodoEscolhido,
        criadoEm: attempt.criadoEm,
        expiresAt,
      })
      pedidoExistente.parcelas = parcelas > 1 ? parcelas : null
      pedidoExistente.atualizadoEm = new Date().toISOString()
      pedidos[idxExistente] = pedidoExistente
      writePedidos(pedidos)
      writeLog('info', 'PAGAMENTO_TENTATIVA_REGISTRADA', {
        pedidoId: pedidoExistente.id.slice(0, 8),
        gateway: usedGateway,
        metodo: pedidoExistente.pagamento.metodo,
        chargeId: chargeResult.chargeId,
        source: attempt.source,
      })

      return NextResponse.json(
        { pedido: pedidoExistente, pagamento: chargeResult, downloadToken: createDownloadToken(pedidoExistente.id), reused: true },
        { status: 200 }
      )
    }

    const novoPedido = {
      id: crypto.randomUUID(),
      publicId: generatePedidoId(),
      nome,
      whatsapp,
      email: normalizeText(body.email || '') || null,
      cpf: paymentDocument || null,
      cnpj: effectiveDocumentType === 'cnpj' ? paymentDocument : null,
      documentType: effectiveDocumentType,
      clientId: effectiveClientId,
      donoCompra: {
        clientId: effectiveClientId,
      },
      pagador: {
        nome: normalizeText(nome),
        whatsapp: normalizeDigits(whatsapp),
        cpf: paymentDocument || null,
        cnpj: effectiveDocumentType === 'cnpj' ? paymentDocument : null,
        documentType: effectiveDocumentType,
        email: normalizeText(body.email || '') || null,
      },
      subtotal,
      descontoProgressivo: descontoProgressivoValor > 0 ? { valor: descontoProgressivoValor, linhas: pricing.linhas } : null,
      descontoCupom,
      propostaAplicada,
      rewardsAplicado,
      saldoUtilizado: saldoUtilizadoFinal,
      rewardsCreditados: false,
      totalSemTaxas: total,
      total: totalComTaxa,
      taxaParcelamento: taxaParcelamento || null,
      parcelas: parcelas > 1 ? parcelas : null,
      status: (isManual || isFree || isAdminBypass) ? 'pago' : 'pendente',
      itens: itensComDesconto,
      clientComment: String(clientComment || '').trim() || null,
      downloads: 0,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      paymentExpiresAt: (!isManual && !isFree && !isAdminBypass) ? getPaymentExpiresAt() : null,
      pagamentoTentativas: [],
      pagamento: null,
    }

    // Cria cobrança no gateway
    let chargeResult = null
    let usedGateway = gateway

    if (!isManual && !isFree && !isAdminBypass) {
      try {
        chargeResult = await createPayment({
          gateway,
          metodo: metodoEscolhido,
          cpf: paymentDocument || '',
          nome,
          telefone: whatsapp,
          total: totalComTaxa,
          parcelas,
          pedidoId: novoPedido.id,
        })
        usedGateway = gateway
      } catch (primaryErr) {
        // Tenta fallback
        if (fallback && fallback !== gateway) {
          try {
            chargeResult = await createPayment({
              gateway: fallback,
              metodo: metodoEscolhido,
              cpf: paymentDocument || '',
              nome,
              telefone: whatsapp,
              total: totalComTaxa,
              parcelas,
              pedidoId: novoPedido.id,
            })
            usedGateway = fallback
            writeLog('error', 'FALLBACK_ATIVADO', {
              gatewayPrimario: gateway, gatewayFallback: fallback,
              motivo: primaryErr.message, pedidoId: novoPedido.id.slice(0, 8),
            })
          } catch (fallbackErr) {
            return NextResponse.json(
              { error: `Erro no gateway de pagamento: ${fallbackErr.message}` },
              { status: 502 }
            )
          }
        } else {
          return NextResponse.json(
            { error: `Erro no gateway de pagamento: ${primaryErr.message}` },
            { status: 502 }
          )
        }
      }

      novoPedido.pagamento = buildPagamentoSnapshot({
        chargeResult,
        gateway: usedGateway,
        metodo: metodoEscolhido,
        criadoEm: new Date().toISOString(),
        expiresAt: novoPedido.paymentExpiresAt,
      })
      appendPaymentAttempt(novoPedido, {
        gateway: usedGateway,
        metodo: chargeResult.metodo || metodoEscolhido,
        chargeId: chargeResult.chargeId,
        status: chargeResult.status,
        total: totalComTaxa,
        parcelas: parcelas > 1 ? parcelas : null,
        expiresAt: novoPedido.paymentExpiresAt,
        pagador: novoPedido.pagador,
        source: 'checkout',
      })
    }

    // Modo manual, carrinho grátis ou admin bypass: marca fotos como vendidas já
    if (isManual || isFree || isAdminBypass) {
      const ids = new Set(canonicalItens.map(i => i.photoId))
      const atualizadas = photos.map(p =>
        ids.has(p.id)
          ? { ...p, vendida: true, pedidoId: novoPedido.id, vendidaEm: novoPedido.criadoEm }
          : p
      )
      writePhotos(atualizadas)

      // Mesmo tratamento para vídeos
      try {
        const videoIds = new Set(canonicalItens
          .filter(i => i.mediaType === 'video' || i.tipo === 'video')
          .map(i => i.videoId || i.photoId))
        if (videoIds.size > 0) {
          const { readVideos, writeVideos } = await import('@/lib/videos')
          const allVideos = readVideos()
          const updated = allVideos.map(v =>
            videoIds.has(v.id)
              ? { ...v, vendida: true, pedidoId: novoPedido.id, vendidaEm: novoPedido.criadoEm }
              : v
          )
          writeVideos(updated)
        }
      } catch (err) { console.error('Erro ao marcar vídeos vendidos:', err.message) }
    }

    pedidos.push(novoPedido)
    writePedidos(pedidos)

    // Debita saldo do cliente (apos persistir pedido)
    if (saldoUtilizadoFinal > 0 && effectiveClientId) {
      try {
        const debitResult = debitarSaldo(effectiveClientId, saldoUtilizadoFinal, {
          motivo: `Uso em pedido #${novoPedido.publicId || novoPedido.id.slice(0, 8)}`,
          pedidoId: novoPedido.id,
        })
        if (!debitResult.ok) {
          // Saldo mudou durante o processamento — desfaz no pedido (raro)
          const allPedidos = readPedidos()
          const idx = allPedidos.findIndex(p => p.id === novoPedido.id)
          if (idx >= 0) {
            allPedidos[idx].saldoUtilizado = 0
            allPedidos[idx].total = (Number(allPedidos[idx].total) || 0) + saldoUtilizadoFinal
            allPedidos[idx].totalSemTaxas = (Number(allPedidos[idx].totalSemTaxas) || 0) + saldoUtilizadoFinal
            writePedidos(allPedidos)
            novoPedido.saldoUtilizado = 0
          }
        }
      } catch (err) {
        console.error('Erro ao debitar saldo:', err.message)
      }
    }

    // Se ja esta pago (free/manual/admin-bypass), credita cashback ja
    if ((novoPedido.status === 'pago' || novoPedido.status === 'liberado_manual') && novoPedido.rewardsAplicado) {
      try {
        const creditInfo = processarRewardsAoPagar(novoPedido)
        if (creditInfo) {
          markPedidoRewardsCredited(novoPedido, creditInfo)
          const allPedidos = readPedidos()
          const idx = allPedidos.findIndex(p => p.id === novoPedido.id)
          if (idx >= 0) {
            allPedidos[idx].rewardsCreditados = true
            allPedidos[idx].rewardsCreditadosEm = novoPedido.rewardsCreditadosEm
            allPedidos[idx].rewardsCreditoInfo = novoPedido.rewardsCreditoInfo
            writePedidos(allPedidos)
          }
        }
      } catch (err) {
        console.error('Erro ao creditar rewards:', err.message)
      }
    }

    // Marcar proposta como usada (fire-and-forget)
    if (propostaAplicada?.propostaId) {
      try {
        markPropostaUsada(propostaAplicada.propostaId, novoPedido.id)
      } catch (err) {
        console.error('Erro ao marcar proposta como usada:', err.message)
      }
    }

    // Registrar uso do cupom (fire-and-forget)
    if (descontoCupom?.cupomId) {
      try {
        registrarUsoCupom(descontoCupom.cupomId, effectiveClientId)
      } catch (err) {
        console.error('Erro ao registrar uso do cupom:', err.message)
      }
    }

    // Notificações (fire-and-forget)
    try {
      const totalFmt = `R$ ${Number(novoPedido.totalComTaxa || novoPedido.total || 0).toFixed(2).replace('.', ',')}`
      appendNotificacao({
        tipo: 'novo_pedido',
        destinatario: 'admin',
        titulo: 'Novo pedido recebido',
        mensagem: `${novoPedido.nome || ''} — ${totalFmt}`,
        link: '/admin/pedidos',
      })
      if (novoPedido.status === 'pago' && effectiveClientId) {
        appendNotificacao({
          tipo: 'pagamento_confirmado',
          destinatario: effectiveClientId,
          titulo: 'Pagamento confirmado!',
          mensagem: 'Suas fotos estão disponíveis para download.',
          link: '/minha-conta/compras',
        })
      }
    } catch {}

    if (effectiveClientId) {
      const clients = readClients()
      const clientIndex = clients.findIndex(item => item.id === effectiveClientId)
      if (clientIndex >= 0 && clients[clientIndex].checkoutComment != null) {
        clients[clientIndex].checkoutComment = null
        clients[clientIndex].atualizadoEm = new Date().toISOString()
        writeClients(clients)
      }
    }

    const downloadToken = createDownloadToken(novoPedido.id)

    return NextResponse.json(
      { pedido: novoPedido, pagamento: chargeResult, downloadToken },
      { status: 201 }
    )
  } catch (err) {
    console.error('Erro em POST /api/pagamento:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
