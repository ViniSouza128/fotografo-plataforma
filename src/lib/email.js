// src/lib/email.js
import { readConfig } from './config'

export function isEmailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM)
}

export function getEmailPrefs(client) {
  const prefs = client?.emailPrefs || {}
  return {
    compra: prefs.compra !== false,
    pago: prefs.pago !== false,
    remocao: prefs.remocao !== false,
    reembolso: prefs.reembolso !== false,
    senhaAlterada: prefs.senhaAlterada !== false,
  }
}

async function createTransport() {
  const nodemailer = (await import('nodemailer')).default
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

function studioWrap(content, studioName) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${studioName}</title></head>
<body style="margin:0;padding:0;background:#111;font-family:'Helvetica Neue',Arial,sans-serif;color:#e5e5e5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="600" style="max-width:600px;width:100%;background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden">
<tr><td style="padding:28px 36px;border-bottom:1px solid #2a2a2a">
<p style="margin:0;font-size:1.15rem;font-weight:700;letter-spacing:0.05em;color:#f5f5f5">${studioName}</p>
</td></tr>
<tr><td style="padding:32px 36px">
${content}
</td></tr>
<tr><td style="padding:16px 36px;border-top:1px solid #2a2a2a;text-align:center;font-size:0.73rem;color:#555">
E-mail automático de ${studioName}. Não responda este e-mail.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function accentBtn(href, label) {
  if (!href) return ''
  return `<p style="margin:20px 0 0"><a href="${href}" style="display:inline-block;background:#f5c800;color:#111;font-weight:700;padding:11px 22px;border-radius:6px;text-decoration:none;font-size:0.88rem">${label}</a></p>`
}

function infoBox(rows) {
  const inner = rows
    .map(([label, value, highlight = false]) =>
      `<div style="margin-bottom:10px">
         <p style="margin:0;font-size:0.78rem;color:#888">${label}</p>
         <p style="margin:3px 0 0;font-size:0.95rem;font-weight:700;color:${highlight || '#f5f5f5'};font-family:monospace">${value}</p>
       </div>`
    ).join('')
  return `<div style="background:#222;border-radius:8px;padding:16px 20px;margin:16px 0">${inner}</div>`
}

export async function sendEmail({ to, subject, html, text }) {
  if (!isEmailConfigured()) return { skipped: true, reason: 'not_configured' }
  if (!to) return { skipped: true, reason: 'no_recipient' }

  try {
    const transporter = await createTransport()
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html,
      text: text || String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    })
    return { ok: true, messageId: info.messageId }
  } catch (err) {
    console.error('[email] Falha ao enviar para', to, ':', err.message)
    return { ok: false, error: err.message }
  }
}

export async function sendEmailCompra({ to, nome, pedidoId, total, itens = [], siteUrl = '' }) {
  const { nomeEstudio: studioName = 'Estúdio' } = readConfig()
  const itensHtml = itens.length
    ? `<ul style="margin:8px 0 0;padding-left:18px;color:#999;font-size:0.83rem">${itens.map(i => `<li>${i.filename || i.originalName || 'Foto'}</li>`).join('')}</ul>`
    : ''
  const html = studioWrap(`
    <h2 style="margin:0 0 14px;font-size:1.05rem;color:#f5f5f5">Pedido recebido!</h2>
    <p style="margin:0 0 10px;color:#ccc">Olá, <strong>${nome}</strong>. Seu pedido foi registrado com sucesso.</p>
    ${infoBox([
      ['Nº do pedido', pedidoId],
      ['Total', `R$ ${Number(total || 0).toFixed(2).replace('.', ',')}`, '#f5c800'],
    ])}
    ${itensHtml}
    <p style="margin:14px 0 0;color:#aaa;font-size:0.85rem">Você receberá outro e-mail quando o pagamento for confirmado.</p>
    ${accentBtn(siteUrl ? `${siteUrl}/minha-conta` : '', 'Acompanhar pedido')}
  `, studioName)
  return sendEmail({ to, subject: `Pedido recebido – ${studioName}`, html })
}

export async function sendEmailPago({ to, nome, pedidoId, total, siteUrl = '' }) {
  const { nomeEstudio: studioName = 'Estúdio' } = readConfig()
  const html = studioWrap(`
    <h2 style="margin:0 0 14px;font-size:1.05rem;color:#f5f5f5">Pagamento confirmado!</h2>
    <p style="margin:0 0 10px;color:#ccc">Olá, <strong>${nome}</strong>. Seu pagamento foi aprovado e suas fotos estão disponíveis para download.</p>
    ${infoBox([
      ['Nº do pedido', pedidoId],
      ['Valor pago', `R$ ${Number(total || 0).toFixed(2).replace('.', ',')}`, '#4ade80'],
    ])}
    ${accentBtn(siteUrl ? `${siteUrl}/minha-conta` : '', 'Baixar minhas fotos')}
  `, studioName)
  return sendEmail({ to, subject: `Pagamento confirmado – ${studioName}`, html })
}

export async function sendEmailRemocao({ to, nome, status, comentarioPublico = '', siteUrl = '' }) {
  const { nomeEstudio: studioName = 'Estúdio' } = readConfig()
  const isNova = status === 'pendente'
  const labels = { pendente: 'Recebida', aceita: 'Aprovada', rejeitada: 'Não aprovada' }
  const statusLabel = labels[status] || status
  const comentBox = comentarioPublico
    ? `<div style="background:#222;border-left:3px solid #f5c800;border-radius:0 6px 6px 0;padding:12px 16px;margin:16px 0;font-size:0.85rem;color:#ccc"><strong style="color:#f5f5f5">Mensagem da equipe:</strong><br/><span style="margin-top:4px;display:block">${comentarioPublico}</span></div>`
    : ''
  const html = studioWrap(`
    <h2 style="margin:0 0 14px;font-size:1.05rem;color:#f5f5f5">${isNova ? 'Solicitação de remoção recebida' : `Solicitação de remoção: ${statusLabel}`}</h2>
    <p style="margin:0 0 10px;color:#ccc">Olá, <strong>${nome}</strong>.</p>
    ${isNova
      ? '<p style="margin:0;color:#aaa;font-size:0.85rem">Recebemos sua solicitação de remoção de foto. Nossa equipe irá analisá-la em breve.</p>'
      : `<p style="margin:0;color:#aaa;font-size:0.85rem">Sua solicitação foi atualizada para: <strong style="color:#f5f5f5">${statusLabel}</strong>.</p>`
    }
    ${comentBox}
    ${accentBtn(siteUrl ? `${siteUrl}/minha-conta` : '', 'Ver minhas solicitações')}
  `, studioName)
  const subjects = {
    pendente: `Solicitação de remoção recebida – ${studioName}`,
    aceita: `Remoção aprovada – ${studioName}`,
    rejeitada: `Solicitação de remoção não aprovada – ${studioName}`,
  }
  return sendEmail({ to, subject: subjects[status] || `Remoção de foto – ${studioName}`, html })
}

export async function sendEmailReembolso({ to, nome, pedidoId, status, siteUrl = '' }) {
  const { nomeEstudio: studioName = 'Estúdio' } = readConfig()
  const labels = { pending: 'Solicitado', approved: 'Aprovado', denied: 'Não aprovado', completed: 'Concluído' }
  const html = studioWrap(`
    <h2 style="margin:0 0 14px;font-size:1.05rem;color:#f5f5f5">Reembolso: ${labels[status] || status}</h2>
    <p style="margin:0 0 10px;color:#ccc">Olá, <strong>${nome}</strong>. Atualização sobre seu pedido de reembolso.</p>
    ${infoBox([
      ['Nº do pedido', pedidoId],
      ['Status do reembolso', labels[status] || status],
    ])}
    ${accentBtn(siteUrl ? `${siteUrl}/minha-conta` : '', 'Ver meus pedidos')}
  `, studioName)
  const subjects = {
    pending: `Reembolso solicitado – ${studioName}`,
    approved: `Reembolso aprovado – ${studioName}`,
    denied: `Reembolso não aprovado – ${studioName}`,
    completed: `Reembolso concluído – ${studioName}`,
  }
  return sendEmail({ to, subject: subjects[status] || `Reembolso – ${studioName}`, html })
}

export async function sendEmailSenhaAlterada({ to, nome }) {
  const { nomeEstudio: studioName = 'Estúdio' } = readConfig()
  const html = studioWrap(`
    <h2 style="margin:0 0 14px;font-size:1.05rem;color:#f5f5f5">Senha alterada</h2>
    <p style="margin:0 0 10px;color:#ccc">Olá, <strong>${nome}</strong>. Sua senha foi alterada com sucesso.</p>
    <p style="margin:0;color:#aaa;font-size:0.85rem">Se você não realizou esta alteração, entre em contato imediatamente.</p>
  `, studioName)
  return sendEmail({ to, subject: `Senha alterada – ${studioName}`, html })
}
