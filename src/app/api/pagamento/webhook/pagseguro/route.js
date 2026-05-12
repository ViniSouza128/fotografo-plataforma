// src/app/api/pagamento/webhook/pagseguro/route.js
// Webhook do PagSeguro (PagBank).
//
// O PagBank notifica de duas formas (depende do produto):
//   1) Notificações de Order (POST com body completo do pedido)
//   2) Notificações de Charge (POST com a charge)
//
// Validação de assinatura:
//   - Header `x-authenticity-token` traz HMAC SHA256 do body cru com a chave secreta.
//   - Configure PAGSEGURO_WEBHOOK_SECRET (env) para exigir validação.
//
// O body normalmente vem com:
//   { id: 'ORDE_xxx' ou 'CHAR_xxx', reference_id: '<pedidoId>', status: 'PAID', charges: [...] }

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { writeLog } from '@/lib/paymentLog'
import { confirmarPedidoPago } from '@/lib/paymentWebhookUtils'

const PAID_STATUSES = ['PAID', 'AUTHORIZED', 'COMPLETED']

async function readRawBody(request) {
  // Precisamos do raw body para validar assinatura. Next dá Request padrão Web.
  const buf = Buffer.from(await request.arrayBuffer())
  return { raw: buf, text: buf.toString('utf8') }
}

function verifyPagSeguroSignature(raw, headerToken) {
  const secret = process.env.PAGSEGURO_WEBHOOK_SECRET
  if (!secret) return { ok: true, reason: 'secret_nao_configurado' }
  if (!headerToken) return { ok: false, reason: 'header_ausente' }
  const hmac = crypto.createHmac('sha256', secret).update(raw).digest('hex')
  return { ok: hmac === headerToken, reason: hmac === headerToken ? 'ok' : 'mismatch' }
}

function detectPaidStatus(body) {
  // Order: { status: 'PAID', charges: [...] }  ou  charge unitária: { status: 'PAID' }
  if (PAID_STATUSES.includes(body.status)) return body.status
  if (Array.isArray(body.charges)) {
    const paid = body.charges.find(c => PAID_STATUSES.includes(c.status))
    if (paid) return paid.status
  }
  return null
}

function detectGateway(body) {
  // Tentamos inferir produção vs sandbox a partir do id (não há flag direta).
  // Em sandbox, IDs costumam começar com "ORDE_" ou "CHAR_" do mesmo jeito,
  // então o cliente do servidor deve poder consultar ambos. Default produção.
  if (body?.environment === 'sandbox' || body?.id?.includes('SANDBOX')) return 'pagseguro_sandbox'
  return 'pagseguro_producao'
}

export async function POST(request) {
  try {
    const { raw, text } = await readRawBody(request)
    let body = {}
    try { body = text ? JSON.parse(text) : {} } catch {}

    writeLog('webhook', 'WEBHOOK_PAGSEGURO_RECEBIDO', {
      id: body.id, status: body.status, refId: body.reference_id,
      tamanhoBody: text.length,
    })

    // Validação de assinatura
    const sig = verifyPagSeguroSignature(raw, request.headers.get('x-authenticity-token'))
    if (!sig.ok) {
      writeLog('error', 'WEBHOOK_PAGSEGURO_ASSINATURA_INVALIDA', { reason: sig.reason })
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }

    const externalRef = body.reference_id
    if (!externalRef) {
      writeLog('error', 'WEBHOOK_PAGSEGURO_SEM_REF', {
        id: body.id, body: JSON.stringify(body).slice(0, 200),
      })
      return NextResponse.json({ received: true })
    }

    const paidStatus = detectPaidStatus(body)
    if (!paidStatus) {
      writeLog('info', 'WEBHOOK_PAGSEGURO_NAO_PAGO', {
        id: body.id, status: body.status, refId: externalRef.slice(0, 8),
      })
      return NextResponse.json({ received: true })
    }

    const result = confirmarPedidoPago(externalRef, {
      gateway: detectGateway(body),
      status: paidStatus,
      chargeId: body.id,
      eventoOriginal: `pagseguro:${paidStatus}`,
    })

    return NextResponse.json({ received: true, ...result })
  } catch (err) {
    writeLog('error', 'WEBHOOK_PAGSEGURO_EXCECAO', { erro: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'PagSeguro webhook endpoint' })
}
