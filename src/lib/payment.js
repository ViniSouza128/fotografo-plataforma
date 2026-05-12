// src/lib/payment.js
// Abstração dos gateways: Asaas (PIX + Cartão) e Stripe (Cartão + PIX)

import { readConfig } from './config'
import { writeLog } from './paymentLog'
import { isStripePixEnabled } from './commerceUtils'

const ASAAS_URLS = {
  asaas_sandbox: 'https://api-sandbox.asaas.com/v3',
  asaas_producao: 'https://api.asaas.com/v3',
}

export function getPaymentConfig() {
  const config = readConfig()
  return config.pagamento || { metodos_ativos: [] }
}

// ── Asaas helpers ────────────────────────────────────────────────────────────

async function asaasReq(endpoint, method, body, apiKey, gateway) {
  const baseUrl = ASAAS_URLS[gateway]
  writeLog('info', 'ASAAS_REQUEST', {
    gateway, method, endpoint,
    body: body ? JSON.stringify(body).slice(0, 300) : null,
  })

  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'access_token': apiKey },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  // Handle potentially empty responses (204 etc.)
  const text = await res.text()
  let data = {}
  if (text.trim()) {
    try {
      data = JSON.parse(text)
    } catch {
      writeLog('error', 'ASAAS_PARSE_ERROR', {
        gateway, endpoint, httpStatus: res.status, text: text.slice(0, 200),
      })
      throw new Error(`Resposta inválida do Asaas (${res.status}): ${text.slice(0, 80)}`)
    }
  }

  if (!res.ok) {
    const msg = data.errors?.[0]?.description || data.error || data.message || `Erro Asaas ${res.status}`
    writeLog('error', 'ASAAS_ERROR', {
      gateway, endpoint, httpStatus: res.status, mensagem: msg,
      resposta: JSON.stringify(data).slice(0, 400),
    })
    throw new Error(msg)
  }

  writeLog('info', 'ASAAS_RESPONSE', {
    gateway, endpoint, httpStatus: res.status,
    data: JSON.stringify(data).slice(0, 300),
  })
  return data
}

async function asaasGetOrCreateCustomer(cpf, nome, telefone, apiKey, gateway) {
  const cleaned = cpf.replace(/\D/g, '')
  try {
    const search = await asaasReq(`/customers?cpfCnpj=${cleaned}`, 'GET', null, apiKey, gateway)
    if (search.data?.length > 0) {
      writeLog('info', 'CUSTOMER_ENCONTRADO', { gateway, customerId: search.data[0].id })
      return search.data[0].id
    }
  } catch { /* cria novo */ }

  const customer = await asaasReq('/customers', 'POST', {
    name: nome,
    cpfCnpj: cleaned,
    mobilePhone: telefone?.replace(/\D/g, '') || undefined,
  }, apiKey, gateway)
  writeLog('success', 'CUSTOMER_CRIADO', { gateway, customerId: customer.id })
  return customer.id
}

// ── Asaas PIX ────────────────────────────────────────────────────────────────

async function createAsaasPixPayment({ total, pedidoId, gateway, apiKey, customerId }) {
  const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const charge = await asaasReq('/payments', 'POST', {
    customer: customerId,
    billingType: 'PIX',
    value: Number(total.toFixed(2)),
    dueDate,
    description: `Pedido #${pedidoId.slice(0, 8).toUpperCase()}`,
    externalReference: pedidoId,
  }, apiKey, gateway)

  writeLog('success', 'COBRANÇA_PIX_CRIADA', {
    gateway, pedidoId: pedidoId.slice(0, 8), chargeId: charge.id,
    valor: total, status: charge.status,
  })

  let extra = {}
  try {
    const pix = await asaasReq(`/payments/${charge.id}/pixQrCode`, 'GET', null, apiKey, gateway)
    extra = { pixCode: pix.payload, pixQR: pix.encodedImage }
    writeLog('success', 'PIX_QRCODE_GERADO', { gateway, chargeId: charge.id, temQR: !!pix.encodedImage })
  } catch (e) {
    writeLog('error', 'PIX_QRCODE_FALHOU', { gateway, chargeId: charge.id, erro: e.message })
  }

  return { chargeId: charge.id, gateway, metodo: 'pix', status: charge.status, ...extra }
}

// ── Asaas Cartão (link de pagamento hospedado pelo Asaas) ────────────────────

async function createAsaasCartaoPayment({ total, pedidoId, gateway, apiKey, customerId, parcelas = 1 }) {
  const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const nParcelas = Math.max(1, Math.min(12, parseInt(parcelas) || 1))
  const valorParcela = Number((total / nParcelas).toFixed(2))

  const charge = await asaasReq('/payments', 'POST', {
    customer: customerId,
    billingType: 'CREDIT_CARD',
    value: Number(total.toFixed(2)),
    dueDate,
    description: `Pedido #${pedidoId.slice(0, 8).toUpperCase()}`,
    externalReference: pedidoId,
    installmentCount: nParcelas,
    installmentValue: valorParcela,
  }, apiKey, gateway)

  writeLog('success', 'COBRANÇA_CARTAO_CRIADA', {
    gateway, pedidoId: pedidoId.slice(0, 8), chargeId: charge.id,
    valor: total, status: charge.status,
  })

  let paymentLink = charge.invoiceUrl || null
  if (!paymentLink) {
    try {
      const inv = await asaasReq(`/payments/${charge.id}`, 'GET', null, apiKey, gateway)
      paymentLink = inv.invoiceUrl || null
    } catch (e) {
      writeLog('error', 'INVOICE_URL_FALHOU', { gateway, chargeId: charge.id, erro: e.message })
    }
  }

  writeLog('info', 'CARTAO_LINK_GERADO', { gateway, chargeId: charge.id, temLink: !!paymentLink })

  return {
    chargeId: charge.id,
    gateway,
    metodo: 'cartao',
    status: charge.status,
    asaasPaymentLink: paymentLink,
  }
}

// ── Asaas dispatcher ─────────────────────────────────────────────────────────

export async function createAsaasPayment({ cpf, nome, telefone, total, metodo, pedidoId, gateway, parcelas }) {
  const pgConfig = getPaymentConfig()
  const gwCfg = pgConfig[gateway] || {}
  const apiKey = gwCfg.api_key

  if (!apiKey) {
    writeLog('error', 'API_KEY_AUSENTE', { gateway, metodo, pedidoId: pedidoId.slice(0, 8) })
    throw new Error(`Chave API do gateway "${gateway}" não configurada`)
  }

  writeLog('info', 'COBRANÇA_INICIADA', { gateway, metodo, pedidoId: pedidoId.slice(0, 8), valor: total, parcelas })

  const customerId = await asaasGetOrCreateCustomer(cpf, nome, telefone, apiKey, gateway)

  if (metodo === 'pix') return createAsaasPixPayment({ total, pedidoId, gateway, apiKey, customerId })
  if (metodo === 'cartao') return createAsaasCartaoPayment({ total, pedidoId, gateway, apiKey, customerId, parcelas })

  throw new Error(`Método "${metodo}" não suportado pelo Asaas nesta integração`)
}

export async function getAsaasStatus(chargeId, gateway) {
  const pgConfig = getPaymentConfig()
  const gwCfg = pgConfig[gateway] || {}
  const apiKey = gwCfg.api_key
  if (!apiKey) throw new Error('API key Asaas não configurada')

  writeLog('info', 'STATUS_CONSULTADO', { gateway, chargeId })

  const charge = await asaasReq(`/payments/${chargeId}`, 'GET', null, apiKey, gateway)
  const paid = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(charge.status)
  if (paid) writeLog('success', 'PAGAMENTO_CONFIRMADO_POLLING', { gateway, chargeId, status: charge.status })

  return { status: charge.status, paid, chargeId, gateway }
}

// ── Stripe Cartão ─────────────────────────────────────────────────────────────

async function createStripeCartaoPayment({ total, pedidoId, secretKey }) {
  writeLog('info', 'STRIPE_INTENT_INICIADO', { pedidoId: pedidoId.slice(0, 8), valor: total })

  const params = new URLSearchParams()
  params.set('amount', Math.round(total * 100).toString())
  params.set('currency', 'brl')
  params.append('payment_method_types[]', 'card')
  params.set('description', `Pedido #${pedidoId.slice(0, 8).toUpperCase()}`)
  params.set('metadata[pedidoId]', pedidoId)

  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data.error?.message || 'Erro Stripe'
    writeLog('error', 'STRIPE_INTENT_ERRO', { pedidoId: pedidoId.slice(0, 8), erro: msg })
    throw new Error(msg)
  }

  writeLog('success', 'STRIPE_INTENT_CRIADO', { pedidoId: pedidoId.slice(0, 8), intentId: data.id, status: data.status })
  return { chargeId: data.id, clientSecret: data.client_secret, gateway: 'stripe', metodo: 'cartao', status: data.status }
}

// ── Stripe PIX ────────────────────────────────────────────────────────────────

async function createStripePixPayment({ total, pedidoId, secretKey }) {
  if (!isStripePixEnabled(getPaymentConfig())) {
    throw new Error('PIX no Stripe nao esta habilitado neste projeto. Ative o metodo na conta Stripe ou use cartao/Asaas.')
  }

  writeLog('info', 'STRIPE_PIX_INICIADO', { pedidoId: pedidoId.slice(0, 8), valor: total })

  // Cria PaymentIntent com tipo pix
  const params = new URLSearchParams()
  params.set('amount', Math.round(total * 100).toString())
  params.set('currency', 'brl')
  params.append('payment_method_types[]', 'pix')
  params.set('description', `Pedido #${pedidoId.slice(0, 8).toUpperCase()}`)
  params.set('metadata[pedidoId]', pedidoId)

  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const intent = await res.json()
  if (!res.ok) {
    const originalMsg = intent.error?.message || 'Erro Stripe PIX'
    const msg = /payment method type "pix" is invalid/i.test(originalMsg)
      ? 'PIX esta desabilitado ou indisponivel nesta conta Stripe. Ative o metodo no dashboard da Stripe ou use cartao.'
      : originalMsg
    writeLog('error', 'STRIPE_PIX_INTENT_ERRO', { pedidoId: pedidoId.slice(0, 8), erro: msg })
    throw new Error(msg)
  }

  // Confirma para gerar o QR code
  const confirmParams = new URLSearchParams()
  confirmParams.set('payment_method_data[type]', 'pix')

  const confirmRes = await fetch(`https://api.stripe.com/v1/payment_intents/${intent.id}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: confirmParams.toString(),
  })
  const confirmed = await confirmRes.json()
  if (!confirmRes.ok) {
    const originalMsg = confirmed.error?.message || 'Erro ao confirmar PIX Stripe'
    const msg = /payment method type "pix" is invalid/i.test(originalMsg)
      ? 'PIX esta desabilitado ou indisponivel nesta conta Stripe. Ative o metodo no dashboard da Stripe ou use cartao.'
      : originalMsg
    writeLog('error', 'STRIPE_PIX_CONFIRM_ERRO', { pedidoId: pedidoId.slice(0, 8), erro: msg })
    throw new Error(msg)
  }

  const pixAction = confirmed.next_action?.pix_display_qr_code
  const pixCode = pixAction?.data || null
  const pixQRUrl = pixAction?.image_url_png || null

  writeLog('success', 'STRIPE_PIX_CRIADO', {
    pedidoId: pedidoId.slice(0, 8), intentId: confirmed.id,
    temQR: !!pixQRUrl, status: confirmed.status,
  })

  return {
    chargeId: confirmed.id,
    clientSecret: confirmed.client_secret,
    gateway: 'stripe',
    metodo: 'pix',
    status: confirmed.status,
    pixCode,
    pixQRUrl, // URL da imagem (não base64 como no Asaas)
  }
}

// ── Stripe dispatcher ─────────────────────────────────────────────────────────

export async function createStripePayment({ total, pedidoId, metodo }) {
  const pgConfig = getPaymentConfig()
  const secretKey = pgConfig.stripe?.secret_key
  if (!secretKey) {
    writeLog('error', 'STRIPE_KEY_AUSENTE', { pedidoId: pedidoId.slice(0, 8) })
    throw new Error('Secret key do Stripe não configurada')
  }

  if (metodo === 'pix') return createStripePixPayment({ total, pedidoId, secretKey })
  return createStripeCartaoPayment({ total, pedidoId, secretKey })
}

export async function getStripeStatus(chargeId) {
  const pgConfig = getPaymentConfig()
  const secretKey = pgConfig.stripe?.secret_key
  if (!secretKey) throw new Error('Secret key do Stripe não configurada')

  writeLog('info', 'STRIPE_STATUS_CONSULTADO', { chargeId })

  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${chargeId}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  const data = await res.json()
  if (!res.ok) {
    writeLog('error', 'STRIPE_STATUS_ERRO', { chargeId, erro: data.error?.message })
    throw new Error(data.error?.message || 'Erro Stripe')
  }

  const paid = data.status === 'succeeded'
  if (paid) writeLog('success', 'STRIPE_PAGAMENTO_CONFIRMADO', { chargeId, status: data.status })
  return { status: data.status, paid, chargeId, gateway: 'stripe' }
}

// ── Mercado Pago ─────────────────────────────────────────────────────────────
// Doc: https://www.mercadopago.com.br/developers/pt/reference
// API: https://api.mercadopago.com (mesmo endpoint p/ sandbox e prod, diferenciados pelo TOKEN)
//   - TEST-* → modo sandbox (não cobra de verdade)
//   - APP_USR-* → produção
// Suporte: PIX (POST /v1/payments com payment_method_id=pix) + Cartão via Checkout Pro (preferences)

const MP_API = 'https://api.mercadopago.com'

function getMpEnv(gateway) {
  return gateway === 'mercadopago_sandbox' ? 'sandbox' : 'producao'
}

function getMpAccessToken(gateway) {
  const pgConfig = getPaymentConfig()
  const cfg = pgConfig[gateway] || {}
  return cfg.access_token || null
}

async function mpReq(endpoint, method, body, accessToken, gateway, idempotencyKey = null) {
  writeLog('info', 'MP_REQUEST', {
    gateway, method, endpoint,
    body: body ? JSON.stringify(body).slice(0, 300) : null,
  })
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey

  const res = await fetch(`${MP_API}${endpoint}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let data = {}
  if (text.trim()) {
    try { data = JSON.parse(text) }
    catch {
      writeLog('error', 'MP_PARSE_ERROR', { gateway, endpoint, httpStatus: res.status, text: text.slice(0, 200) })
      throw new Error(`Resposta invalida do Mercado Pago (${res.status}): ${text.slice(0, 80)}`)
    }
  }
  if (!res.ok) {
    const msg = data.message || data.error || data.cause?.[0]?.description || `Erro Mercado Pago ${res.status}`
    writeLog('error', 'MP_ERROR', {
      gateway, endpoint, httpStatus: res.status, mensagem: msg,
      resposta: JSON.stringify(data).slice(0, 400),
    })
    throw new Error(msg)
  }
  writeLog('info', 'MP_RESPONSE', {
    gateway, endpoint, httpStatus: res.status, data: JSON.stringify(data).slice(0, 300),
  })
  return data
}

async function createMpPixPayment({ total, pedidoId, gateway, accessToken, cpf, nome, email }) {
  // POST /v1/payments — criação direta de PIX
  const body = {
    transaction_amount: Number(total.toFixed(2)),
    description: `Pedido #${pedidoId.slice(0, 8).toUpperCase()}`,
    payment_method_id: 'pix',
    external_reference: pedidoId,
    notification_url: process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')}/api/pagamento/webhook/mercadopago`
      : undefined,
    payer: {
      email: email || `noreply+${pedidoId.slice(0, 8)}@example.com`,
      first_name: (nome || 'Cliente').split(' ')[0],
      last_name: (nome || 'Anonimo').split(' ').slice(1).join(' ') || 'Sobrenome',
      identification: cpf
        ? { type: 'CPF', number: String(cpf).replace(/\D/g, '') }
        : undefined,
    },
  }
  const charge = await mpReq('/v1/payments', 'POST', body, accessToken, gateway, pedidoId)

  const pixData = charge.point_of_interaction?.transaction_data || {}
  writeLog('success', 'MP_PIX_CRIADO', {
    gateway, pedidoId: pedidoId.slice(0, 8), chargeId: charge.id,
    valor: total, status: charge.status, temQR: !!pixData.qr_code_base64,
  })
  return {
    chargeId: String(charge.id),
    gateway,
    metodo: 'pix',
    status: charge.status,
    pixCode: pixData.qr_code || null,
    pixQR: pixData.qr_code_base64 || null,
  }
}

async function createMpCartaoPayment({ total, pedidoId, gateway, accessToken, parcelas, nome, cpf, email }) {
  // Para cartão, usamos Checkout Pro (preference) que entrega uma URL hospedada
  // e o usuário paga lá. Mais simples e cumpre PCI sem manter form de cartão local.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')
    : 'http://localhost:3000'
  const body = {
    items: [{
      id: pedidoId,
      title: `Pedido #${pedidoId.slice(0, 8).toUpperCase()}`,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: Number(total.toFixed(2)),
    }],
    external_reference: pedidoId,
    payment_methods: {
      excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }, { id: 'bank_transfer' }],
      installments: Math.max(1, Math.min(12, parseInt(parcelas) || 12)),
    },
    notification_url: `${siteUrl}/api/pagamento/webhook/mercadopago`,
    back_urls: {
      success: `${siteUrl}/compras?ref=${pedidoId}`,
      pending: `${siteUrl}/compras?ref=${pedidoId}`,
      failure: `${siteUrl}/checkout?error=1&ref=${pedidoId}`,
    },
    auto_return: 'approved',
    payer: {
      name: (nome || 'Cliente').split(' ')[0],
      surname: (nome || 'Anonimo').split(' ').slice(1).join(' ') || 'Sobrenome',
      email: email || `noreply+${pedidoId.slice(0, 8)}@example.com`,
      identification: cpf ? { type: 'CPF', number: String(cpf).replace(/\D/g, '') } : undefined,
    },
  }

  const pref = await mpReq('/checkout/preferences', 'POST', body, accessToken, gateway, pedidoId)

  // Preferência cria URL pública (init_point) que o cliente abre.
  // Em sandbox, usar sandbox_init_point; em produção, init_point.
  const env = getMpEnv(gateway)
  const link = env === 'sandbox' ? (pref.sandbox_init_point || pref.init_point) : pref.init_point

  writeLog('success', 'MP_CARTAO_CRIADO', {
    gateway, pedidoId: pedidoId.slice(0, 8), prefId: pref.id, temLink: !!link,
  })
  return {
    chargeId: String(pref.id),
    gateway,
    metodo: 'cartao',
    status: 'PENDING',
    asaasPaymentLink: link, // reaproveitamos a chave que o front já entende
  }
}

export async function createMercadoPagoPayment({ cpf, nome, telefone, email, total, metodo, pedidoId, gateway, parcelas }) {
  const accessToken = getMpAccessToken(gateway)
  if (!accessToken) {
    writeLog('error', 'MP_TOKEN_AUSENTE', { gateway, metodo, pedidoId: pedidoId.slice(0, 8) })
    throw new Error(`Access token do Mercado Pago "${gateway}" nao configurado.`)
  }
  writeLog('info', 'MP_INICIADO', { gateway, metodo, pedidoId: pedidoId.slice(0, 8), valor: total })

  if (metodo === 'pix') {
    return createMpPixPayment({ total, pedidoId, gateway, accessToken, cpf, nome, email })
  }
  if (metodo === 'cartao') {
    return createMpCartaoPayment({ total, pedidoId, gateway, accessToken, parcelas, nome, cpf, email })
  }
  throw new Error(`Metodo "${metodo}" nao suportado pelo Mercado Pago.`)
}

export async function getMercadoPagoStatus(chargeId, gateway) {
  const accessToken = getMpAccessToken(gateway)
  if (!accessToken) throw new Error('Access token do Mercado Pago nao configurado')

  // Pode ser payment id (PIX) ou preference id (cartão Checkout Pro).
  // Para preferência, precisamos buscar pagamentos por external_reference.
  // Tentamos primeiro como payment id.
  writeLog('info', 'MP_STATUS_CONSULTADO', { gateway, chargeId })
  try {
    const data = await mpReq(`/v1/payments/${chargeId}`, 'GET', null, accessToken, gateway)
    const paid = data.status === 'approved'
    if (paid) writeLog('success', 'MP_PAGAMENTO_CONFIRMADO', { gateway, chargeId, status: data.status })
    return { status: data.status, paid, chargeId, gateway }
  } catch (errPayment) {
    // Fallback: busca por preference id
    try {
      const search = await mpReq(`/v1/payments/search?preference_id=${encodeURIComponent(chargeId)}&sort=date_created&criteria=desc&limit=5`,
        'GET', null, accessToken, gateway)
      const payments = Array.isArray(search.results) ? search.results : []
      const approved = payments.find(p => p.status === 'approved')
      if (approved) {
        writeLog('success', 'MP_PAGAMENTO_CONFIRMADO_POR_PREF', { gateway, chargeId, paymentId: approved.id })
        return { status: 'approved', paid: true, chargeId, gateway }
      }
      const last = payments[0]
      return { status: last?.status || 'PENDING', paid: false, chargeId, gateway }
    } catch {
      throw errPayment
    }
  }
}

// ── PagSeguro (PagBank) ──────────────────────────────────────────────────────
// Doc: https://dev.pagbank.uol.com.br/reference/orders-introducao
// API: https://api.pagseguro.com (prod), https://sandbox.api.pagseguro.com (sandbox)
// Auth: Bearer token (chave da API gerada em Vendas > Conexões)

const PAGSEGURO_URLS = {
  pagseguro_sandbox: 'https://sandbox.api.pagseguro.com',
  pagseguro_producao: 'https://api.pagseguro.com',
}

function getPagSeguroConfig(gateway) {
  const pgConfig = getPaymentConfig()
  return pgConfig[gateway] || {}
}

async function pagseguroReq(endpoint, method, body, gateway) {
  const cfg = getPagSeguroConfig(gateway)
  const baseUrl = PAGSEGURO_URLS[gateway]
  if (!baseUrl) throw new Error(`PagSeguro: gateway desconhecido "${gateway}"`)
  const apiKey = cfg.api_token
  if (!apiKey) throw new Error(`Token de API do PagSeguro "${gateway}" nao configurado.`)

  writeLog('info', 'PAGSEGURO_REQUEST', {
    gateway, method, endpoint, body: body ? JSON.stringify(body).slice(0, 300) : null,
  })
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let data = {}
  if (text.trim()) {
    try { data = JSON.parse(text) }
    catch {
      writeLog('error', 'PAGSEGURO_PARSE_ERROR', { gateway, endpoint, httpStatus: res.status, text: text.slice(0, 200) })
      throw new Error(`Resposta invalida do PagSeguro (${res.status})`)
    }
  }
  if (!res.ok) {
    const msg = data.error_messages?.[0]?.description
      || data.error_messages?.[0]?.message
      || data.message
      || data.error
      || `Erro PagSeguro ${res.status}`
    writeLog('error', 'PAGSEGURO_ERROR', {
      gateway, endpoint, httpStatus: res.status, mensagem: msg,
      resposta: JSON.stringify(data).slice(0, 400),
    })
    throw new Error(msg)
  }
  writeLog('info', 'PAGSEGURO_RESPONSE', {
    gateway, endpoint, httpStatus: res.status, data: JSON.stringify(data).slice(0, 300),
  })
  return data
}

async function createPagSeguroPixPayment({ total, pedidoId, gateway, cpf, nome, telefone, email }) {
  const cleanedCpf = String(cpf || '').replace(/\D/g, '')
  const cleanedPhone = String(telefone || '').replace(/\D/g, '')
  const valorCentavos = Math.round(Number(total) * 100)

  const body = {
    reference_id: pedidoId,
    customer: {
      name: nome || 'Cliente',
      email: email || `noreply+${pedidoId.slice(0, 8)}@example.com`,
      tax_id: cleanedCpf || undefined,
      phones: cleanedPhone ? [{
        country: '55',
        area: cleanedPhone.slice(0, 2),
        number: cleanedPhone.slice(2),
        type: 'MOBILE',
      }] : undefined,
    },
    items: [{
      reference_id: pedidoId,
      name: `Pedido #${pedidoId.slice(0, 8).toUpperCase()}`,
      quantity: 1,
      unit_amount: valorCentavos,
    }],
    qr_codes: [{
      amount: { value: valorCentavos },
      expiration_date: new Date(Date.now() + 30 * 60 * 1000).toISOString(),  // expira em 30min
    }],
    notification_urls: process.env.NEXT_PUBLIC_SITE_URL
      ? [`${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')}/api/pagamento/webhook/pagseguro`]
      : undefined,
  }
  const order = await pagseguroReq('/orders', 'POST', body, gateway)
  const qr = (order.qr_codes && order.qr_codes[0]) || {}
  const qrLink = (qr.links || []).find(l => l.media === 'image/png')?.href || null

  writeLog('success', 'PAGSEGURO_PIX_CRIADO', {
    gateway, pedidoId: pedidoId.slice(0, 8), orderId: order.id,
    valor: total, status: order.status,
  })
  return {
    chargeId: order.id,
    gateway,
    metodo: 'pix',
    status: order.status || 'WAITING',
    pixCode: qr.text || null,           // string copia-e-cola
    pixQRUrl: qrLink || null,           // URL da imagem PNG
  }
}

async function createPagSeguroCartaoPayment({ total, pedidoId, gateway, parcelas, cpf, nome, email, telefone }) {
  // PagSeguro requer a tokenização do cartão no front; integração mais simples:
  // criamos uma "checkout session" hospedada (Pagamento Transparente padrão exige form local).
  // Como o projeto não tem form de cartão integrado, usamos a página de pagamento PagSeguro
  // criando uma order + redirect para a invoice do PagBank quando disponível.
  //
  // ATENÇÃO: Isso depende da conta ter "Checkout PagBank" habilitado.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'http://localhost:3000'
  const valorCentavos = Math.round(Number(total) * 100)
  const cleanedCpf = String(cpf || '').replace(/\D/g, '')
  const cleanedPhone = String(telefone || '').replace(/\D/g, '')
  const installments = Math.max(1, Math.min(12, parseInt(parcelas) || 1))

  const body = {
    reference_id: pedidoId,
    customer: {
      name: nome || 'Cliente',
      email: email || `noreply+${pedidoId.slice(0, 8)}@example.com`,
      tax_id: cleanedCpf || undefined,
      phones: cleanedPhone ? [{
        country: '55',
        area: cleanedPhone.slice(0, 2),
        number: cleanedPhone.slice(2),
        type: 'MOBILE',
      }] : undefined,
    },
    items: [{
      reference_id: pedidoId,
      name: `Pedido #${pedidoId.slice(0, 8).toUpperCase()}`,
      quantity: 1,
      unit_amount: valorCentavos,
    }],
    redirect_url: `${siteUrl}/compras?ref=${pedidoId}`,
    notification_urls: [`${siteUrl}/api/pagamento/webhook/pagseguro`],
    payment_methods: [{ type: 'CREDIT_CARD' }, { type: 'DEBIT_CARD' }],
    payment_methods_configs: [{
      type: 'CREDIT_CARD',
      config_options: [{ option: 'INSTALLMENTS_LIMIT', value: String(installments) }],
    }],
  }

  // Primeiro tentamos /checkouts (payment links) — endpoint de checkout hospedado da PagBank
  let checkoutLink = null
  let chargeId = null
  let status = 'PENDING'
  try {
    const checkout = await pagseguroReq('/checkouts', 'POST', body, gateway)
    chargeId = checkout.id
    status = checkout.status || 'PENDING'
    const link = (checkout.links || []).find(l => l.rel === 'PAY')?.href
      || (checkout.links || []).find(l => l.media === 'text/html')?.href
      || null
    checkoutLink = link
    writeLog('success', 'PAGSEGURO_CHECKOUT_CRIADO', {
      gateway, pedidoId: pedidoId.slice(0, 8), checkoutId: checkout.id, temLink: !!link,
    })
  } catch (err) {
    // Fallback: criar order direto sem charges (deixa o cliente pagar via dashboard)
    writeLog('info', 'PAGSEGURO_CHECKOUT_FALHOU_FALLBACK_ORDER', { gateway, erro: err.message })
    const order = await pagseguroReq('/orders', 'POST', body, gateway)
    chargeId = order.id
    status = order.status || 'PENDING'
    const payLink = (order.links || []).find(l => l.rel === 'PAY')?.href || null
    checkoutLink = payLink
  }

  return {
    chargeId,
    gateway,
    metodo: 'cartao',
    status,
    asaasPaymentLink: checkoutLink, // reaproveita chave do front
  }
}

export async function createPagSeguroPayment({ cpf, nome, telefone, email, total, metodo, pedidoId, gateway, parcelas }) {
  if (!PAGSEGURO_URLS[gateway]) {
    throw new Error(`PagSeguro: gateway desconhecido "${gateway}"`)
  }
  writeLog('info', 'PAGSEGURO_INICIADO', { gateway, metodo, pedidoId: pedidoId.slice(0, 8), valor: total })

  if (metodo === 'pix') {
    return createPagSeguroPixPayment({ total, pedidoId, gateway, cpf, nome, telefone, email })
  }
  if (metodo === 'cartao') {
    return createPagSeguroCartaoPayment({ total, pedidoId, gateway, parcelas, cpf, nome, email, telefone })
  }
  throw new Error(`Metodo "${metodo}" nao suportado pelo PagSeguro.`)
}

export async function getPagSeguroStatus(chargeId, gateway) {
  if (!PAGSEGURO_URLS[gateway]) throw new Error('Gateway PagSeguro inválido')
  writeLog('info', 'PAGSEGURO_STATUS_CONSULTADO', { gateway, chargeId })
  // Tenta como order id
  try {
    const order = await pagseguroReq(`/orders/${chargeId}`, 'GET', null, gateway)
    const charges = Array.isArray(order.charges) ? order.charges : []
    const paid = charges.some(c => c.status === 'PAID')
    const lastStatus = charges[charges.length - 1]?.status || order.status || 'WAITING'
    if (paid) writeLog('success', 'PAGSEGURO_PAGAMENTO_CONFIRMADO', { gateway, chargeId })
    return { status: lastStatus, paid, chargeId, gateway }
  } catch (err) {
    // Pode ser checkout id
    try {
      const co = await pagseguroReq(`/checkouts/${chargeId}`, 'GET', null, gateway)
      return { status: co.status || 'PENDING', paid: co.status === 'PAID', chargeId, gateway }
    } catch {
      throw err
    }
  }
}

// ── Dispatcher principal ──────────────────────────────────────────────────────

export async function createPayment({ gateway, metodo, cpf, nome, telefone, email, total, pedidoId, parcelas }) {
  if (!gateway) {
    throw new Error('Nenhum gateway de pagamento configurado.')
  }
  if (gateway === 'manual') {
    writeLog('info', 'MODO_MANUAL', { pedidoId: pedidoId.slice(0, 8), metodo })
    return { gateway: 'manual', chargeId: null, status: 'MANUAL', metodo }
  }
  if (gateway.startsWith('asaas')) {
    return createAsaasPayment({ cpf, nome, telefone, total, metodo, pedidoId, gateway, parcelas })
  }
  if (gateway === 'stripe') {
    return createStripePayment({ total, pedidoId, metodo })
  }
  if (gateway.startsWith('mercadopago')) {
    return createMercadoPagoPayment({ cpf, nome, telefone, email, total, metodo, pedidoId, gateway, parcelas })
  }
  if (gateway.startsWith('pagseguro')) {
    return createPagSeguroPayment({ cpf, nome, telefone, email, total, metodo, pedidoId, gateway, parcelas })
  }
  throw new Error(`Gateway desconhecido: ${gateway}`)
}

export async function getPaymentStatus({ gateway, chargeId }) {
  if (!gateway) return { status: 'MANUAL', paid: true }
  if (gateway === 'manual') return { status: 'MANUAL', paid: true }
  if (gateway.startsWith('asaas')) return getAsaasStatus(chargeId, gateway)
  if (gateway === 'stripe') return getStripeStatus(chargeId)
  if (gateway.startsWith('mercadopago')) return getMercadoPagoStatus(chargeId, gateway)
  if (gateway.startsWith('pagseguro')) return getPagSeguroStatus(chargeId, gateway)
  throw new Error(`Gateway desconhecido: ${gateway}`)
}
