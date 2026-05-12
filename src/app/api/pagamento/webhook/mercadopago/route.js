// src/app/api/pagamento/webhook/mercadopago/route.js
// Webhook do Mercado Pago.
//
// O MP envia notificações de 2 jeitos:
//   1) Notification (legado): POST com query "?topic=payment&id=12345"
//   2) Webhooks v2 (atual):   POST com body { type: 'payment', data: { id: '12345' }, ... }
//
// Em ambos, a notificação SÓ contém o id do pagamento — temos que GET em
// /v1/payments/{id} para ler o status. Configure a URL nas settings do app
// no painel do MP, e SE O TOPIC FOR PAYMENT (PAGAMENTOS), confira "external_reference"
// para localizar o pedido no sistema.
//
// Validação de assinatura (opcional, recomendada):
//   - HEADER x-signature contém ts e v1 (HMAC SHA256 da string "id:<dataId>;request-id:<reqId>;ts:<ts>")
//   - Chave secreta gerada em "Suas integrações" no painel do MP.
//   - MERCADOPAGO_WEBHOOK_SECRET (env) — se setado, exige assinatura válida.

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { writeLog } from '@/lib/paymentLog'
import { confirmarPedidoPago } from '@/lib/paymentWebhookUtils'
import { getPaymentConfig } from '@/lib/payment'

const PAID_STATUSES = ['approved']

function verifyMercadoPagoSignature(request, dataId) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET
  if (!secret) return { ok: true, reason: 'secret_nao_configurado' }
  const sigHeader = request.headers.get('x-signature') || ''
  const reqId = request.headers.get('x-request-id') || ''
  // x-signature = "ts=<timestamp>,v1=<hash>"
  const parts = Object.fromEntries(sigHeader.split(',').map(s => s.trim().split('=')))
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1 || !dataId) return { ok: false, reason: 'header_invalido' }
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  if (expected !== v1) return { ok: false, reason: 'assinatura_invalida' }
  return { ok: true }
}

async function fetchMpPayment(paymentId) {
  const pgConfig = getPaymentConfig()
  // Tentar produção primeiro, depois sandbox
  const candidates = ['mercadopago_producao', 'mercadopago_sandbox']
  let lastError = null
  for (const gateway of candidates) {
    const token = pgConfig?.[gateway]?.access_token
    if (!token) continue
    try {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const text = await res.text()
      if (!res.ok) {
        lastError = `HTTP ${res.status} (${gateway})`
        continue
      }
      const data = text ? JSON.parse(text) : {}
      return { ok: true, data, gateway }
    } catch (err) {
      lastError = err.message
    }
  }
  return { ok: false, error: lastError || 'Nenhum gateway MP configurado' }
}

export async function POST(request) {
  try {
    let body = {}
    try { body = await request.json() } catch {}

    const url = new URL(request.url)
    const topic = body.type || body.topic || url.searchParams.get('type') || url.searchParams.get('topic')
    const dataId =
      body.data?.id ||
      body.id ||
      url.searchParams.get('data.id') ||
      url.searchParams.get('id')

    writeLog('webhook', 'WEBHOOK_MP_RECEBIDO', {
      topic, dataId,
      action: body.action,
      live_mode: body.live_mode,
    })

    if (!dataId) {
      writeLog('error', 'WEBHOOK_MP_SEM_ID', { topic, body: JSON.stringify(body).slice(0, 200) })
      return NextResponse.json({ received: true })
    }

    if (topic && !['payment', 'payments'].includes(String(topic).toLowerCase())) {
      writeLog('info', 'WEBHOOK_MP_IGNORADO', { topic, motivo: 'topic nao eh payment' })
      return NextResponse.json({ received: true })
    }

    // Validação de assinatura (se configurada)
    const sigCheck = verifyMercadoPagoSignature(request, dataId)
    if (!sigCheck.ok) {
      writeLog('error', 'WEBHOOK_MP_ASSINATURA_INVALIDA', { reason: sigCheck.reason })
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }

    const fetched = await fetchMpPayment(dataId)
    if (!fetched.ok) {
      writeLog('error', 'WEBHOOK_MP_FETCH_FALHOU', { dataId, erro: fetched.error })
      return NextResponse.json({ received: true, fetch_error: fetched.error })
    }
    const payment = fetched.data
    const status = payment.status
    const externalRef = payment.external_reference

    if (!externalRef) {
      writeLog('error', 'WEBHOOK_MP_SEM_EXTERNAL_REF', { paymentId: dataId, status })
      return NextResponse.json({ received: true })
    }

    if (!PAID_STATUSES.includes(status)) {
      writeLog('info', 'WEBHOOK_MP_STATUS_NAO_PAGO', {
        paymentId: dataId, status, externalRef: externalRef.slice(0, 8),
      })
      return NextResponse.json({ received: true })
    }

    const result = confirmarPedidoPago(externalRef, {
      gateway: fetched.gateway,
      status,
      chargeId: String(dataId),
      eventoOriginal: `mp:${topic || 'payment'}:${status}`,
    })

    return NextResponse.json({ received: true, ...result })
  } catch (err) {
    writeLog('error', 'WEBHOOK_MP_EXCECAO', { erro: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// MP às vezes faz GET para validar a URL — responder 200
export async function GET() {
  return NextResponse.json({ ok: true, message: 'Mercado Pago webhook endpoint' })
}
