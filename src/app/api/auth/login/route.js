import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { verifyPassword, createToken, hashPassword } from '@/lib/auth'
import { findClientByEmail, readClients, writeClients } from '@/lib/clients'
import { checkRateLimit } from '@/lib/rateLimit'
import { appendAuditLog } from '@/lib/auditLog'

// Credenciais do admin padrão (fallback se não existir conta no DB)
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com'
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456'

function isDefaultAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === String(DEFAULT_ADMIN_EMAIL || '').trim().toLowerCase()
}

function elevateDefaultAdminIfNeeded(client, request) {
  if (!client?.id || !client.isAdmin || client.isSuperAdmin || !isDefaultAdminEmail(client.email)) {
    return client
  }

  try {
    const clients = readClients()
    const index = clients.findIndex((item) => item.id === client.id)
    if (index === -1) return client

    clients[index] = {
      ...clients[index],
      isSuperAdmin: true,
      atualizadoEm: new Date().toISOString(),
    }
    writeClients(clients)

    appendAuditLog({
      action: 'admin.elevated_to_super_admin',
      actor: clients[index],
      target: { type: 'client', id: clients[index].id, label: clients[index].email },
      details: { reason: 'default_admin_auto_heal' },
      request,
    })

    return clients[index]
  } catch (error) {
    console.error('Falha ao promover admin padrão a super-admin:', error)
    return client
  }
}

export async function POST(request) {
  try {
    const rateLimit = checkRateLimit(request, {
      key: 'auth:login',
      limit: 10,
      windowMs: 60 * 1000,
      message: 'Muitas tentativas de login neste dispositivo.',
    })
    if (!rateLimit.allowed) return rateLimit.response

    const body = await request.json()
    const { email, senha } = body
    const normalizedEmail = String(email || '').trim().toLowerCase()

    if (!email || !senha) {
      appendAuditLog({
        action: 'login.failed',
        status: 'failure',
        target: { type: 'auth', id: normalizedEmail || null },
        details: { reason: 'missing_credentials', email: normalizedEmail || null },
        request,
      })
      return NextResponse.json(
        { error: 'E-mail e senha são obrigatórios.' },
        { status: 400 }
      )
    }

    // 1) Procura cliente no banco
    let client = findClientByEmail(normalizedEmail)

    // 2) Fallback: credenciais hardcoded do admin padrão
    if (!client && isDefaultAdminEmail(email) && senha === DEFAULT_ADMIN_PASSWORD) {
      // Cria automaticamente a conta admin no banco na primeira vez
      const clients = readClients()
      const novoAdmin = {
        id: crypto.randomUUID(),
        nomeCompleto: 'Administrador',
        email: DEFAULT_ADMIN_EMAIL,
        whatsapp: '',
        cpf: '',
        dataNascimento: '',
        instagram: '',
        enderecoCompleto: '',
        cidade: '',
        estado: '',
        times: [],
        organizacoes: [],
        senha: hashPassword(DEFAULT_ADMIN_PASSWORD),
        isAdmin: true,
        isSuperAdmin: true,
        ativo: true,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
        sessionVersion: 0,
        mustChangePassword: false,
      }
      clients.push(novoAdmin)
      writeClients(clients)
      client = novoAdmin
      appendAuditLog({
        action: 'admin.bootstrap_created',
        actor: novoAdmin,
        target: { type: 'client', id: novoAdmin.id, label: novoAdmin.email },
        details: { email: novoAdmin.email },
        request,
      })
    }

    client = elevateDefaultAdminIfNeeded(client, request)

    if (!client) {
      appendAuditLog({
        action: 'login.failed',
        status: 'failure',
        target: { type: 'auth', id: normalizedEmail },
        details: { reason: 'client_not_found', email: normalizedEmail },
        request,
      })
      return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 })
    }

    if (!client.ativo) {
      appendAuditLog({
        action: 'login.failed',
        status: 'blocked',
        actor: client,
        target: { type: 'client', id: client.id, label: client.email },
        details: { reason: 'inactive_account', email: client.email },
        request,
      })
      return NextResponse.json(
        { error: 'Conta desativada. Entre em contato com o suporte.' },
        { status: 403 }
      )
    }

    const senhaValida = verifyPassword(senha, client.senha)
    if (!senhaValida) {
      appendAuditLog({
        action: 'login.failed',
        status: 'failure',
        actor: client,
        target: { type: 'client', id: client.id, label: client.email },
        details: { reason: 'invalid_password', email: client.email },
        request,
      })
      return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 })
    }

    const now = new Date().toISOString()
    try {
      const clients = readClients()
      const index = clients.findIndex(item => item.id === client.id)
      if (index >= 0) {
        clients[index].ultimoAcessoEm = now
        clients[index].atualizadoEm = clients[index].atualizadoEm || now
        writeClients(clients)
        client = clients[index]
      }
    } catch {}

    const sessionVersion = Number(client.sessionVersion || 0)
    const token = createToken({
      id: client.id,
      email: client.email,
      isAdmin: !!client.isAdmin,
      isSuperAdmin: !!client.isSuperAdmin,
      isColaborador: !!client.isColaborador,
      sessionVersion,
      mustChangePassword: !!client.mustChangePassword,
    })

    const { senha: _, ...clientData } = client
    appendAuditLog({
      action: 'login.success',
      actor: clientData,
      target: { type: 'client', id: clientData.id, label: clientData.email },
      details: { isAdmin: !!clientData.isAdmin, isSuperAdmin: !!clientData.isSuperAdmin },
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
    console.error('Erro no login:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
