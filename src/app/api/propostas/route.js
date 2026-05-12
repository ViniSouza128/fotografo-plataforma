// src/app/api/propostas/route.js
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { readConfig } from '@/lib/config'
import {
  appendProposta,
  listPropostas,
  findPropostaById,
  invalidateIfCartChanged,
  cartSignature,
  adminAceitar,
  adminRejeitar,
  adminContraproposta,
  clienteAceitarContraproposta,
  clienteRejeitarContraproposta,
  clienteCancelar,
} from '@/lib/propostas'
import { readClients } from '@/lib/clients'
import { appendAuditLog } from '@/lib/auditLog'
import { appendNotificacao } from '@/lib/notificacoes'

function isPropostasAtivo() {
  const cfg = readConfig()
  return !!cfg?.propostas?.ativo
}

function getClientCartSignature(clientId) {
  const clients = readClients()
  const c = clients.find(x => x.id === clientId)
  const items = Array.isArray(c?.carrinho) ? c.carrinho : []
  return cartSignature(items)
}

// GET /api/propostas         → admin lista todas
// GET /api/propostas?meu=1   → cliente lista as proprias (auto-invalida se carrinho mudou)
// GET /api/propostas?id=...  → admin/cliente le uma especifica
export async function GET(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const { searchParams } = new URL(request.url)
    const meu = searchParams.get('meu') === '1'
    const id = searchParams.get('id')
    const isAdmin = !!auth.payload?.isAdmin && !auth.payload?.isColaborador

    if (id) {
      const p = findPropostaById(id)
      if (!p) return NextResponse.json({ error: 'Proposta não encontrada.' }, { status: 404 })
      if (!isAdmin && p.clientId !== auth.payload.id) {
        return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
      }
      return NextResponse.json(p)
    }

    if (meu || !isAdmin) {
      // Auto-invalida propostas se o carrinho atual nao bater
      const sig = getClientCartSignature(auth.payload.id)
      invalidateIfCartChanged(auth.payload.id, sig)
      const items = listPropostas({ clientId: auth.payload.id })
      return NextResponse.json({
        propostas: items,
        ativo: isPropostasAtivo(),
        cartSignature: sig,
      })
    }

    // Admin sem ?meu — retorna todas
    const status = searchParams.get('status') || null
    const items = listPropostas({ statusFilter: status })
    return NextResponse.json(items)
  } catch (err) {
    console.error('Erro em GET /api/propostas:', err)
    return NextResponse.json({ error: 'Erro ao ler propostas.' }, { status: 500 })
  }
}

// POST /api/propostas — cliente cria proposta
// Body: { valorProposto, mensagem? }
export async function POST(request) {
  try {
    if (!isPropostasAtivo()) {
      return NextResponse.json({ error: 'Sistema de propostas desativado.' }, { status: 403 })
    }

    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const body = await request.json().catch(() => ({}))
    const valorProposto = Number(body?.valorProposto)
    const mensagem = String(body?.mensagem || '').slice(0, 500)

    if (!Number.isFinite(valorProposto) || valorProposto <= 0) {
      return NextResponse.json({ error: 'Informe um valor válido.' }, { status: 400 })
    }

    // Le carrinho atual do cliente
    const clients = readClients()
    const client = clients.find(c => c.id === auth.payload.id)
    if (!client) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

    const cart = Array.isArray(client.carrinho) ? client.carrinho : []
    if (cart.length === 0) {
      return NextResponse.json({ error: 'Adicione fotos ao carrinho antes de enviar uma proposta.' }, { status: 400 })
    }

    const subtotalOriginal = cart.reduce((s, i) => s + (Number(i.price) || 0), 0)
    if (valorProposto >= subtotalOriginal) {
      return NextResponse.json({ error: 'Valor proposto deve ser menor que o total atual do carrinho.' }, { status: 400 })
    }

    const nova = appendProposta({
      clientId: client.id,
      clientNome: client.nomeCompleto || client.nome || null,
      items: cart,
      subtotalOriginal,
      valorPropostoCliente: valorProposto,
      mensagemCliente: mensagem,
    })

    appendAuditLog({
      action: 'proposta.created',
      actor: auth.client || auth.payload,
      target: { type: 'proposta', id: nova.id, label: `R$ ${valorProposto.toFixed(2)}` },
      details: { subtotalOriginal, valorProposto, items: cart.length },
      request,
    })

    try {
      appendNotificacao({
        tipo: 'comentario', // sem tipo dedicado; usa generico
        destinatario: 'admin',
        titulo: 'Nova proposta de cliente',
        mensagem: `${client.nomeCompleto || 'Cliente'} propôs R$ ${valorProposto.toFixed(2).replace('.', ',')} em ${cart.length} foto(s).`,
        link: '/admin/propostas',
      })
    } catch {}

    return NextResponse.json(nova, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Erro ao criar proposta.' }, { status: 400 })
  }
}

// PATCH /api/propostas
// Body: { id, action, valor?, mensagem? }
// action: aceitar | rejeitar | contraproposta | cliente_aceitar | cliente_rejeitar | cliente_cancelar
export async function PATCH(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const body = await request.json().catch(() => ({}))
    const { id, action, valor, mensagem } = body
    if (!id || !action) return NextResponse.json({ error: 'id e action obrigatórios.' }, { status: 400 })

    const proposta = findPropostaById(id)
    if (!proposta) return NextResponse.json({ error: 'Proposta não encontrada.' }, { status: 404 })

    const isAdmin = !!auth.payload?.isAdmin && !auth.payload?.isColaborador
    const isOwner = proposta.clientId === auth.payload.id

    let updated = null

    try {
      switch (action) {
        case 'aceitar':
        case 'rejeitar':
        case 'contraproposta': {
          if (!isAdmin) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
          if (action === 'aceitar') updated = adminAceitar(id, auth.client || auth.payload)
          else if (action === 'rejeitar') updated = adminRejeitar(id, auth.client || auth.payload, mensagem)
          else updated = adminContraproposta(id, auth.client || auth.payload, valor, mensagem)
          break
        }
        case 'cliente_aceitar':
        case 'cliente_rejeitar':
        case 'cliente_cancelar': {
          if (!isOwner) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
          if (action === 'cliente_aceitar') updated = clienteAceitarContraproposta(id, auth.payload.id)
          else if (action === 'cliente_rejeitar') updated = clienteRejeitarContraproposta(id, auth.payload.id)
          else updated = clienteCancelar(id, auth.payload.id)
          break
        }
        default:
          return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
      }
    } catch (err) {
      return NextResponse.json({ error: err.message || 'Erro ao atualizar proposta.' }, { status: 400 })
    }

    appendAuditLog({
      action: `proposta.${action}`,
      actor: auth.client || auth.payload,
      target: { type: 'proposta', id, label: updated.status },
      details: { status: updated.status, valor: valor ?? null },
      request,
    })

    // Notificacao para a outra parte
    try {
      if (action === 'aceitar' || action === 'rejeitar' || action === 'contraproposta') {
        appendNotificacao({
          tipo: 'comentario',
          destinatario: updated.clientId,
          titulo: action === 'aceitar' ? 'Sua proposta foi aceita' : action === 'rejeitar' ? 'Sua proposta foi rejeitada' : 'Você recebeu uma contraproposta',
          mensagem: action === 'contraproposta'
            ? `Contraproposta de R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}.`
            : '',
          link: '/minha-conta/carrinho',
        })
      }
      if (action === 'cliente_aceitar' || action === 'cliente_rejeitar') {
        appendNotificacao({
          tipo: 'comentario',
          destinatario: 'admin',
          titulo: action === 'cliente_aceitar' ? 'Cliente aceitou contraproposta' : 'Cliente rejeitou contraproposta',
          mensagem: `Proposta #${id.slice(0, 8)}.`,
          link: '/admin/propostas',
        })
      }
    } catch {}

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Erro em PATCH /api/propostas:', err)
    return NextResponse.json({ error: 'Erro ao atualizar proposta.' }, { status: 500 })
  }
}
