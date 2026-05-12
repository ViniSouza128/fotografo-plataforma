import { NextResponse } from 'next/server'
import { hashPassword, generateRandomPassword } from '@/lib/auth'
import { readClients, writeClients } from '@/lib/clients'
import { requireAuth } from '@/lib/apiAuth'
import { appendAuditLog } from '@/lib/auditLog'

function bumpSessionVersion(client) {
  client.sessionVersion = Number(client.sessionVersion || 0) + 1
}

export async function POST(request, { params }) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      )
    }

    const { id } = await params
    const clients = readClients()
    const index = clients.findIndex(c => c.id === id)

    if (index === -1) {
      return NextResponse.json(
        { error: 'Cliente não encontrado.' },
        { status: 404 }
      )
    }

    if (clients[index].isAdmin || clients[index].isSuperAdmin) {
      return NextResponse.json(
        { error: 'Contas admin/super-admin sao protegidas contra reset de senha por esta rota.' },
        { status: 403 }
      )
    }

    const novaSenha = generateRandomPassword(8)
    clients[index].senha = hashPassword(novaSenha)
    clients[index].mustChangePassword = true
    bumpSessionVersion(clients[index])
    clients[index].atualizadoEm = new Date().toISOString()
    clients[index].ultimaSenhaResetadaEm = clients[index].atualizadoEm
    writeClients(clients)

    appendAuditLog({
      action: 'client.password_reset',
      actor: auth.client || auth.payload,
      target: { type: 'client', id: clients[index].id, label: clients[index].email || clients[index].nomeCompleto },
      details: { mustChangePassword: true },
      request,
    })

    return NextResponse.json({ senha: novaSenha })
  } catch (error) {
    console.error('Erro ao resetar senha:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}
