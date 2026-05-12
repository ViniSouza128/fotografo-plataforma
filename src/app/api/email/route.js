// src/app/api/email/route.js
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { findClientById } from '@/lib/clients'

export async function GET() {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    return NextResponse.json({ configured: isEmailConfigured() })
  } catch {
    return NextResponse.json({ error: 'Erro' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const body = await request.json().catch(() => ({}))
    const { clientId, to: toOverride, subject, body: bodyText } = body

    if (!subject || !bodyText) {
      return NextResponse.json({ error: 'Assunto e mensagem são obrigatórios.' }, { status: 400 })
    }

    let to = toOverride
    let nomeDest = ''
    if (clientId) {
      const client = findClientById(clientId)
      if (!client) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
      if (!client.email) return NextResponse.json({ error: 'Este cliente não possui e-mail cadastrado.' }, { status: 400 })
      to = client.email
      nomeDest = client.nomeCompleto || client.nome || ''
    }

    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ error: 'E-mail de destino inválido.' }, { status: 400 })
    }

    const safeBody = String(bodyText).slice(0, 5000).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')
    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:24px;background:#111;font-family:sans-serif;color:#e5e5e5">
${nomeDest ? `<p style="margin:0 0 16px;color:#ccc">Olá, <strong>${nomeDest}</strong>.</p>` : ''}
<div style="white-space:pre-wrap;color:#e5e5e5;font-size:0.92rem;line-height:1.6">${safeBody}</div>
</body></html>`

    const result = await sendEmail({ to, subject: String(subject).slice(0, 200), html })
    if (result.skipped) {
      return NextResponse.json({ error: 'Serviço de e-mail não configurado. Defina as variáveis SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM no arquivo .env.', code: 'not_configured' }, { status: 503 })
    }
    if (!result.ok) {
      return NextResponse.json({ error: `Falha ao enviar: ${result.error}` }, { status: 500 })
    }
    return NextResponse.json({ ok: true, messageId: result.messageId })
  } catch (error) {
    console.error('Erro em /api/email POST:', error)
    return NextResponse.json({ error: 'Erro inesperado: ' + (error?.message || 'desconhecido') }, { status: 500 })
  }
}
