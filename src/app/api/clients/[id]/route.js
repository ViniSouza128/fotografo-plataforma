import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { readClients, writeClients } from '@/lib/clients'
import { appendAuditLog } from '@/lib/auditLog'

function bumpSessionVersion(client) {
  client.sessionVersion = Number(client.sessionVersion || 0) + 1
}

export async function GET(request, { params }) {
  try {
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      )
    }

    const { id } = await params

    if (auth.payload.id !== id && !auth.payload.isAdmin) {
      return NextResponse.json(
        { error: 'Sem permissao para acessar este cliente.' },
        { status: 403 }
      )
    }

    const client = readClients().find(c => c.id === id)

    if (!client) {
      return NextResponse.json(
        { error: 'Cliente não encontrado.' },
        { status: 404 }
      )
    }

    const { senha, ...clientData } = client
    return NextResponse.json(clientData)
  } catch (error) {
    console.error('Erro ao buscar cliente:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params

    // Autenticação obrigatória
    const auth = await requireAuth({ requireFullAdmin: true })
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      )
    }

    const { payload } = auth
    const body = await request.json()
    const clients = readClients()
    const index = clients.findIndex(c => c.id === id)

    if (index === -1) {
      return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
    }

    const alvo = clients[index]
    const before = { isAdmin: !!alvo.isAdmin, ativo: alvo.ativo !== false }

    // Somente super-admin pode alterar privilégios (isAdmin) de qualquer conta
    if (typeof body.isAdmin === 'boolean') {
      if (!payload.isSuperAdmin) {
        return NextResponse.json({ error: 'Apenas super-admins podem alterar privilégios de conta.' }, { status: 403 })
      }
      if (alvo.isAdmin || alvo.isSuperAdmin) {
        return NextResponse.json({ error: 'Contas admin/super-admin sao protegidas contra mudancas perigosas de papel.' }, { status: 403 })
      }
      // Super-admin não pode remover seus próprios privilégios de super-admin
      if (alvo.isSuperAdmin && body.isAdmin === false) {
        return NextResponse.json({ error: 'Não é possível remover privilégios do super-admin.' }, { status: 403 })
      }
      alvo.isAdmin = body.isAdmin
    }

    // Somente super-admin pode desativar/reativar contas de admins
    if (typeof body.ativo === 'boolean') {
      if (alvo.isAdmin || alvo.isSuperAdmin) {
        return NextResponse.json({ error: 'Contas admin/super-admin nao podem ser desativadas.' }, { status: 403 })
      }

      const newStatus = body.ativo
      const oldStatus = alvo.ativo !== false
      if (newStatus !== oldStatus) {
        alvo.ativo = newStatus
        bumpSessionVersion(alvo) // invalida sessões existentes
      }
    }

    alvo.atualizadoEm = new Date().toISOString()
    writeClients(clients)

    if (typeof body.isAdmin === 'boolean' && before.isAdmin !== !!alvo.isAdmin) {
      appendAuditLog({
        action: 'client.admin_permission_changed',
        actor: auth.client || payload,
        target: { type: 'client', id: alvo.id, label: alvo.email || alvo.nomeCompleto },
        details: { from: before.isAdmin, to: !!alvo.isAdmin },
        request,
      })
    }

    if (typeof body.ativo === 'boolean' && before.ativo !== (alvo.ativo !== false)) {
      appendAuditLog({
        action: 'client.active_changed',
        actor: auth.client || payload,
        target: { type: 'client', id: alvo.id, label: alvo.email || alvo.nomeCompleto },
        details: { from: before.ativo, to: alvo.ativo !== false },
        request,
      })
    }

    const { senha, ...clientData } = alvo
    return NextResponse.json(clientData)
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
