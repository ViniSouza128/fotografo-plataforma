import { NextResponse } from 'next/server'
import { createToken, hashPassword, verifyPassword } from '@/lib/auth'
import { readClients, writeClients } from '@/lib/clients'
import { requireAuth } from '@/lib/apiAuth'
import { appendAuditLog } from '@/lib/auditLog'
import { getEmailPrefs, sendEmailSenhaAlterada } from '@/lib/email'

export async function POST(request) {
  try {
    const auth = await requireAuth({ allowMustChangePassword: true })
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      )
    }

    const { client } = auth
    const body = await request.json()
    const { senhaAtual, novaSenha } = body || {}

    if (!novaSenha || typeof novaSenha !== 'string' || novaSenha.trim().length < 6) {
      return NextResponse.json(
        { error: 'Nova senha inválida. Use pelo menos 6 caracteres.' },
        { status: 400 }
      )
    }

    if (!senhaAtual || !verifyPassword(senhaAtual, client.senha)) {
      appendAuditLog({
        action: 'client.password_change_failed',
        status: 'failure',
        actor: client,
        target: { type: 'client', id: client.id, label: client.email },
        details: { reason: 'invalid_current_password' },
        request,
      })
      return NextResponse.json(
        { error: 'Senha atual incorreta.' },
        { status: 400 }
      )
    }

    const clients = readClients()
    const idx = clients.findIndex(c => c.id === client.id)
    if (idx === -1) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    }

    clients[idx].senha = hashPassword(novaSenha.trim())
    clients[idx].mustChangePassword = false
    clients[idx].sessionVersion = Number(clients[idx].sessionVersion || 0) + 1
    clients[idx].atualizadoEm = new Date().toISOString()
    clients[idx].ultimaTrocaSenhaEm = clients[idx].atualizadoEm
    writeClients(clients)

    const updated = clients[idx]
    const token = createToken({
      id: updated.id,
      email: updated.email,
      isAdmin: !!updated.isAdmin,
      isSuperAdmin: !!updated.isSuperAdmin,
      sessionVersion: updated.sessionVersion,
      mustChangePassword: !!updated.mustChangePassword,
    })

    const { senha, ...clientData } = updated
    if (clientData.email) {
      const emailPrefs = getEmailPrefs(clientData)
      if (emailPrefs.senhaAlterada) {
        sendEmailSenhaAlterada({
          to: clientData.email,
          nome: clientData.nomeCompleto || clientData.nome || 'Cliente',
        }).catch(() => {})
      }
    }

    appendAuditLog({
      action: 'client.password_changed',
      actor: clientData,
      target: { type: 'client', id: clientData.id, label: clientData.email },
      details: { mustChangePassword: false },
      request,
    })

    const response = NextResponse.json({ client: clientData }, { status: 200 })
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    })

    return response
  } catch (error) {
    console.error('Erro ao trocar senha:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}
