export function getPedidoItens(pedido) {
  if (Array.isArray(pedido?.itens)) return pedido.itens
  if (Array.isArray(pedido?.items)) return pedido.items
  return []
}

export function getPedidoItemPhotoId(item) {
  return item?.photoId || item?.id || null
}

export function normalizePedidoStatus(status) {
  if (!status) return 'pendente'
  const s = String(status).toLowerCase()
  if (s === 'aguardando_pagamento') return 'pendente'
  // Novos estados padronizados
  if ([
    'carrinho',
    'pendente',
    'pago',
    'liberado_manual',
    'reembolsado',
    'reembolso_solicitado',
    'reembolso_negado',
  ].includes(s)) return s
  return s
}

function normalizeStatusText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
}

export function isPedidoCompraConcluida(status) {
  const normalized = normalizeStatusText(normalizePedidoStatus(status))
  return normalized === 'pago'
    || normalized === 'liberado manual'
    || normalized === 'compra concluida'
    || normalized === 'concluido'
    || normalized === 'concluida'
}

export function isSimulatedPayment(pedido = {}) {
  const gateway = String(pedido.pagamento?.gateway || '').toLowerCase()
  return gateway === 'manual'
    || gateway === 'asaas_sandbox'
    || gateway === 'sandbox'
    || pedido.pagamento?.sobreposto === true
    || normalizePedidoStatus(pedido.status) === 'liberado_manual'
}

export function isRealPaidPedido(pedido = {}) {
  const status = normalizePedidoStatus(pedido.status)
  if (!['pago', 'liberado_manual'].includes(status)) return false
  if (isSimulatedPayment(pedido)) return false
  const gateway = String(pedido.pagamento?.gateway || '').toLowerCase()
  return gateway === 'asaas_producao' || gateway === 'stripe'
}

export function getFinancialStatus(pedido = {}) {
  const status = normalizePedidoStatus(pedido.status)
  if (status === 'cancelado') return { key: 'cancelado', label: 'Cancelado', tone: 'danger' }
  if (status === 'pendente') return { key: 'pendente', label: 'Pendente', tone: 'warning' }
  if (status === 'reembolsado') return { key: 'reembolsado', label: 'Reembolsado', tone: 'danger' }
  if (status === 'reembolso_solicitado') return { key: 'reembolso_solicitado', label: 'Reembolso solicitado', tone: 'warning' }
  if (status === 'reembolso_negado') return { key: 'reembolso_negado', label: 'Reembolso negado', tone: 'danger' }
  if (isSimulatedPayment(pedido)) return { key: 'simulado', label: 'Simulacao/liberacao', tone: 'warning' }
  if (isRealPaidPedido(pedido)) return { key: 'pago_real', label: 'Pago real', tone: 'success' }
  if (status === 'pago') return { key: 'pago', label: 'Pago', tone: 'success' }
  return { key: status || 'pendente', label: status || 'Pendente', tone: 'warning' }
}

export function getFinancialToneStyle(tone) {
  if (tone === 'success') return { color: 'var(--success)', bg: 'var(--success-dim)' }
  if (tone === 'danger') return { color: 'var(--danger)', bg: 'var(--danger-dim)' }
  return { color: 'var(--accent)', bg: 'var(--accent-dim)' }
}

export function estimateGatewayFee(pedido = {}) {
  if (!isRealPaidPedido(pedido)) return 0
  const gateway = String(pedido.pagamento?.gateway || '').toLowerCase()
  const metodo = String(pedido.pagamento?.metodo || pedido.paymentMethod || '').toLowerCase()
  const total = Number(pedido.total || 0)
  const parcelas = Math.max(1, Number(pedido.parcelas || 1))
  if (!Number.isFinite(total) || total <= 0) return 0

  if (metodo === 'pix') return Math.round(total * 0.0099 * 100) / 100
  if (gateway === 'stripe') return Math.round((total * 0.0399 + 0.39) * 100) / 100
  if (metodo === 'cartao') {
    const rate = 0.0299 * parcelas
    return Math.round(total * rate * 100) / 100
  }
  return Math.round(total * 0.0299 * 100) / 100
}

export function buildOrderFinancialSummary(pedido = {}) {
  const itens = getPedidoItens(pedido)
  const subtotal = Math.round(itens.reduce((sum, item) => {
    const value = Number(item.priceOriginal ?? item.priceEffective ?? item.price ?? 0)
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0) * 100) / 100
  const totalItens = Math.round(itens.reduce((sum, item) => {
    const value = Number(item.priceComDesconto ?? item.price ?? item.priceEffective ?? 0)
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0) * 100) / 100
  const descontoValor = Math.max(0, Math.round((subtotal - totalItens) * 100) / 100)
  const taxaParcelamento = Math.round(Number(pedido.taxaParcelamento || 0) * 100) / 100
  const total = Number.isFinite(Number(pedido.total)) ? Math.round(Number(pedido.total) * 100) / 100 : totalItens + taxaParcelamento
  const gatewayFee = estimateGatewayFee(pedido)
  const gross = isRealPaidPedido(pedido) ? total : 0
  const net = Math.max(0, Math.round((gross - gatewayFee) * 100) / 100)

  return {
    subtotal,
    descontoValor,
    totalSemTaxas: totalItens,
    taxaParcelamento,
    total,
    gross,
    gatewayFee,
    net,
    parcelas: Number(pedido.parcelas || 1),
    metodo: pedido.pagamento?.metodo || pedido.paymentMethod || null,
    gateway: pedido.pagamento?.gateway || null,
    simulated: isSimulatedPayment(pedido),
    realPaid: isRealPaidPedido(pedido),
  }
}

export function summarizeFinancialOrders(pedidos = []) {
  const list = Array.isArray(pedidos) ? pedidos : []
  return list.reduce((acc, pedido) => {
    const summary = buildOrderFinancialSummary(pedido)
    if (summary.realPaid) {
      acc.gross += summary.gross
      acc.gatewayFees += summary.gatewayFee
      acc.net += summary.net
      acc.realPaidCount += 1
      acc.itemsSold += getPedidoItens(pedido).length
    } else if (summary.simulated && isPedidoCompraConcluida(pedido.status)) {
      acc.simulatedTotal += Number(pedido.total || 0)
      acc.simulatedCount += 1
    }
    return acc
  }, {
    gross: 0,
    gatewayFees: 0,
    net: 0,
    realPaidCount: 0,
    itemsSold: 0,
    simulatedTotal: 0,
    simulatedCount: 0,
  })
}

export function isStripePixEnabled(pgConfig = {}) {
  return pgConfig?.stripe?.pix_enabled === true
}

export function normalizeOriginalName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function getPhotoDuplicateKey(photoLike = {}) {
  const originalName = normalizeOriginalName(photoLike.originalName || photoLike.name)
  const rawSize = Number(photoLike.size)
  const size = Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : null
  if (!originalName || size == null) return null
  return `${originalName}::${size}`
}

export function getConfiguredPaymentMethods(pgConfig = {}) {
  if (Array.isArray(pgConfig?.metodos_ativos) && pgConfig.metodos_ativos.length > 0) {
    return pgConfig.metodos_ativos
  }
  return ['pix', 'cartao']
}

export function gatewaySupportsMethod(gateway, method, pgConfig = {}) {
  if (!gateway) return false
  if (gateway === 'manual') return method === 'pix' || method === 'cartao'
  if (gateway === 'stripe') {
    return method === 'cartao' || (method === 'pix' && isStripePixEnabled(pgConfig))
  }
  if (gateway.startsWith('asaas')) {
    return method === 'pix' || method === 'cartao'
  }
  if (gateway.startsWith('mercadopago')) {
    return method === 'pix' || method === 'cartao'
  }
  if (gateway.startsWith('pagseguro')) {
    return method === 'pix' || method === 'cartao'
  }
  return false
}

export function resolvePaymentGateways(pgConfig = {}, method) {
  const primary = pgConfig?.[`gateway_${method}`] || pgConfig?.gateway_ativo || null
  const fallback = pgConfig?.[`gateway_${method}_fallback`] || pgConfig?.gateway_fallback || null
  const primarySupported = gatewaySupportsMethod(primary, method, pgConfig)
  const fallbackSupported = gatewaySupportsMethod(fallback, method, pgConfig)
  const effectivePrimary = primarySupported ? primary : (fallbackSupported ? fallback : primary)
  const effectiveFallback =
    effectivePrimary === primary && fallback && fallback !== primary && fallbackSupported
      ? fallback
      : null

  return {
    primary,
    fallback,
    primarySupported,
    fallbackSupported,
    effectivePrimary,
    effectiveFallback,
    hasSupportedGateway: primarySupported || fallbackSupported,
  }
}

export function getAvailablePaymentMethods(pgConfig = {}) {
  return getConfiguredPaymentMethods(pgConfig).filter(method =>
    resolvePaymentGateways(pgConfig, method).hasSupportedGateway
  )
}
