import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { hashPassword } from '@/lib/auth'
import {
  normalizeEmail,
  normalizeWhatsapp,
  readClients,
  stripClientSecrets,
  writeClients,
} from '@/lib/clients'
import { readPedidos, writePedidos } from '@/lib/pedidos'
import { appendAuditLog, sanitizeAuditValue } from '@/lib/auditLog'
import { DATA_DIR, ensureRuntimeDirs } from '@/lib/runtimePaths'

const SENSITIVE_KEY_RE = /(senha|password|token|secret|api.?key|authorization|auth)/i
const PAID_STATUSES = new Set(['pago', 'paid', 'aprovado', 'approved', 'liberado', 'liberado_manual', 'manual'])

function nowIso() {
  return new Date().toISOString()
}

function readJsonFile(name, fallback = []) {
  const filePath = path.join(DATA_DIR, name)
  if (!fs.existsSync(filePath)) return fallback
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return fallback
  }
}

function writeJsonFileIfExists(name, data) {
  const filePath = path.join(DATA_DIR, name)
  if (!fs.existsSync(filePath)) return false
  ensureRuntimeDirs()
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  return true
}

function deepSanitize(value) {
  if (Array.isArray(value)) return value.map(deepSanitize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEY_RE.test(key) ? '[redacted]' : deepSanitize(item),
  ]))
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function orderBelongsToClient(pedido, client) {
  if (!pedido || !client) return false
  const clientId = String(client.id || '')
  if (clientId && String(pedido.clientId || pedido.clienteId || '') === clientId) return true

  const clientEmail = normalizeEmail(client.email)
  const pedidoEmail = normalizeEmail(pedido.email || pedido.clienteEmail || pedido.customerEmail)
  if (clientEmail && pedidoEmail === clientEmail) return true

  const clientPhone = normalizeWhatsapp(client.whatsapp)
  const pedidoPhone = normalizeWhatsapp(pedido.whatsapp || pedido.telefone || pedido.clienteWhatsapp)
  if (clientPhone && pedidoPhone === clientPhone) return true

  const clientDocument = normalizeDigits(client.cpf || client.cnpj)
  const pedidoDocument = normalizeDigits(pedido.cpf || pedido.cnpj || pedido.documento)
  return Boolean(clientDocument && pedidoDocument === clientDocument)
}

function isPaidOrder(pedido) {
  const status = String(pedido?.status || pedido?.paymentStatus || '').trim().toLowerCase()
  const financeiro = String(pedido?.statusFinanceiro || pedido?.financialStatus || '').trim().toLowerCase()
  return PAID_STATUSES.has(status) || PAID_STATUSES.has(financeiro) || Boolean(pedido?.pagoEm || pedido?.paidAt)
}

function getLinkedOrders(client, pedidos = readPedidos()) {
  return pedidos.filter(pedido => orderBelongsToClient(pedido, client))
}

function getDeletionSummary(client, pedidos = readPedidos()) {
  const linkedOrders = getLinkedOrders(client, pedidos)
  const paidOrders = linkedOrders.filter(isPaidOrder)
  return {
    totalOrdersCount: linkedOrders.length,
    paidOrdersCount: paidOrders.length,
    legalRetentionRequired: paidOrders.length > 0,
  }
}

function anonymizeString(value) {
  return value ? 'Titular removido por LGPD' : value
}

function anonymizePayer(pagador) {
  if (!pagador || typeof pagador !== 'object') return pagador
  return {
    ...pagador,
    nome: anonymizeString(pagador.nome),
    name: anonymizeString(pagador.name),
    email: pagador.email ? null : pagador.email,
    whatsapp: pagador.whatsapp ? null : pagador.whatsapp,
    telefone: pagador.telefone ? null : pagador.telefone,
    cpf: pagador.cpf ? null : pagador.cpf,
    cnpj: pagador.cnpj ? null : pagador.cnpj,
    documento: pagador.documento ? null : pagador.documento,
    lgpdAnonymized: true,
  }
}

function anonymizeOrder(pedido, client, timestamp) {
  if (!orderBelongsToClient(pedido, client)) return pedido
  return {
    ...pedido,
    clientId: null,
    clienteId: null,
    lgpdOriginalClientId: client.id,
    lgpdAnonymized: true,
    lgpdAnonymizedAt: timestamp,
    legalRetention: isPaidOrder(pedido) ? 'pedido_pago_preservado' : pedido.legalRetention,
    nome: anonymizeString(pedido.nome),
    clienteNome: anonymizeString(pedido.clienteNome),
    customerName: anonymizeString(pedido.customerName),
    email: pedido.email ? null : pedido.email,
    clienteEmail: pedido.clienteEmail ? null : pedido.clienteEmail,
    customerEmail: pedido.customerEmail ? null : pedido.customerEmail,
    whatsapp: pedido.whatsapp ? null : pedido.whatsapp,
    telefone: pedido.telefone ? null : pedido.telefone,
    clienteWhatsapp: pedido.clienteWhatsapp ? null : pedido.clienteWhatsapp,
    cpf: pedido.cpf ? null : pedido.cpf,
    cnpj: pedido.cnpj ? null : pedido.cnpj,
    documento: pedido.documento ? null : pedido.documento,
    endereco: pedido.endereco ? null : pedido.endereco,
    enderecoEntrega: pedido.enderecoEntrega ? null : pedido.enderecoEntrega,
    pagador: anonymizePayer(pedido.pagador),
  }
}

function anonymizeRelatedJson(client, timestamp) {
  const remocoes = readJsonFile('remocoes.json', [])
  if (Array.isArray(remocoes)) {
    const nextRemocoes = remocoes.map(item => {
      if (String(item?.clientId || '') !== String(client.id)) return item
      return {
        ...item,
        clientId: null,
        lgpdOriginalClientId: client.id,
        lgpdAnonymizedAt: timestamp,
        nome: anonymizeString(item.nome),
        email: item.email ? null : item.email,
        contato: item.contato ? null : item.contato,
        cpf: item.cpf ? null : item.cpf,
        observacoes: item.observacoes ? '[removido por LGPD]' : item.observacoes,
      }
    })
    writeJsonFileIfExists('remocoes.json', nextRemocoes)
  }

  const comentarios = readJsonFile('comentarios.json', [])
  if (Array.isArray(comentarios)) {
    const nextComentarios = comentarios.map(item => {
      const curtidasPor = Array.isArray(item?.curtidasPor)
        ? item.curtidasPor.filter(id => String(id) !== String(client.id))
        : item?.curtidasPor
      if (String(item?.clientId || item?.clienteId || '') !== String(client.id)) {
        return { ...item, curtidasPor }
      }
      return {
        ...item,
        clientId: null,
        clienteId: null,
        lgpdOriginalClientId: client.id,
        lgpdAnonymizedAt: timestamp,
        clienteNome: anonymizeString(item.clienteNome),
        nome: anonymizeString(item.nome),
        email: item.email ? null : item.email,
        curtidasPor,
      }
    })
    writeJsonFileIfExists('comentarios.json', nextComentarios)
  }

  const carrinhos = readJsonFile('carrinhos.json', [])
  if (Array.isArray(carrinhos)) {
    const nextCarrinhos = carrinhos.filter(item => String(item?.id || item?.clientId || item?.clienteId || '') !== String(client.id))
    writeJsonFileIfExists('carrinhos.json', nextCarrinhos)
  }
}

function buildDeletedClient(client, request, reviewerId, timestamp) {
  const nextSessionVersion = Number(client.sessionVersion ?? 0) + 1
  return {
    ...client,
    nome: 'Conta removida',
    nomeCompleto: 'Conta removida',
    email: `deleted-${client.id}@local.invalid`,
    whatsapp: '',
    cpf: '',
    cnpj: null,
    documentType: null,
    dataNascimento: '',
    instagram: '',
    enderecoCompleto: '',
    enderecoRua: '',
    enderecoNumero: '',
    enderecoBairro: '',
    enderecoCidade: '',
    enderecoEstado: '',
    enderecoCep: '',
    times: [],
    organizacoes: [],
    escolasOuOrganizacoes: [],
    favoritos: [],
    curtidas: [],
    carrinho: [],
    ativo: false,
    isAdmin: false,
    isSuperAdmin: false,
    mustChangePassword: false,
    sessionVersion: nextSessionVersion,
    senha: hashPassword(crypto.randomUUID()),
    lgpdDeleted: true,
    lgpdDeletedAt: timestamp,
    lgpdDeletionRequest: {
      ...request,
      status: 'approved',
      reviewedAt: timestamp,
      reviewedBy: reviewerId,
      completedAt: timestamp,
    },
    atualizadoEm: timestamp,
  }
}

function getRequester(request) {
  return {
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
    userAgent: request.headers.get('user-agent') || null,
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const auth = await requireAuth({ requireAdmin: url.searchParams.get('admin') === '1' })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const clients = readClients()
    const pedidos = readPedidos()

    if (url.searchParams.get('admin') === '1') {
      const requests = clients
        .filter(client => client.lgpdDeletionRequest)
        .map(client => ({
          client: stripClientSecrets(client),
          summary: getDeletionSummary(client, pedidos),
        }))
        .sort((a, b) => new Date(b.client.lgpdDeletionRequest?.requestedAt || 0) - new Date(a.client.lgpdDeletionRequest?.requestedAt || 0))
      return NextResponse.json({ requests })
    }

    const client = auth.client
    const linkedOrders = getLinkedOrders(client, pedidos)
    const clientId = String(client.id)
    const comentarios = readJsonFile('comentarios.json', []).filter(item => String(item?.clientId || item?.clienteId || '') === clientId)
    const remocoes = readJsonFile('remocoes.json', []).filter(item => String(item?.clientId || '') === clientId)

    appendAuditLog({
      action: 'client.data_exported',
      actor: { id: client.id, email: client.email, role: client.isAdmin ? 'admin' : 'client' },
      target: { type: 'client', id: client.id },
      details: { orders: linkedOrders.length, requester: getRequester(request) },
      request,
    })

    return NextResponse.json(deepSanitize({
      generatedAt: nowIso(),
      titular: stripClientSecrets(client),
      pedidos: linkedOrders,
      comentarios,
      remocoes,
      favoritos: client.favoritos || [],
      curtidas: client.curtidas || [],
      carrinho: client.carrinho || [],
    }))
  } catch (error) {
    console.error('Erro LGPD GET:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    if (auth.client.isAdmin || auth.client.isSuperAdmin) {
      return NextResponse.json({ error: 'Contas administrativas devem ser revisadas fora do fluxo de cliente.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const reason = String(body.reason || '').trim().slice(0, 1000)
    const clients = readClients()
    const index = clients.findIndex(client => client.id === auth.client.id)
    if (index === -1) {
      return NextResponse.json({ error: 'Cliente nao encontrado.' }, { status: 404 })
    }

    const timestamp = nowIso()
    const summary = getDeletionSummary(clients[index])
    const requestData = {
      id: crypto.randomUUID(),
      status: 'pending',
      requestedAt: timestamp,
      reason,
      reviewedAt: null,
      reviewedBy: null,
      adminNote: '',
      legalRetention: summary,
    }

    clients[index].lgpdDeletionRequest = requestData
    clients[index].atualizadoEm = timestamp
    writeClients(clients)

    appendAuditLog({
      action: 'client.deletion_requested',
      actor: { id: auth.client.id, email: auth.client.email, role: 'client' },
      target: { type: 'client', id: auth.client.id },
      details: { reason: sanitizeAuditValue(reason), ...summary, requester: getRequester(request) },
      request,
    })

    return NextResponse.json({
      ok: true,
      request: requestData,
      client: stripClientSecrets(clients[index]),
    })
  } catch (error) {
    console.error('Erro LGPD POST:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const body = await request.json().catch(() => ({}))
    const clientId = String(body.clientId || '').trim()
    const action = String(body.action || '').trim()
    const adminNote = String(body.adminNote || '').trim().slice(0, 1000)
    if (!clientId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Informe clientId e action approve/reject.' }, { status: 400 })
    }

    const clients = readClients()
    const index = clients.findIndex(client => String(client.id) === clientId)
    if (index === -1) {
      return NextResponse.json({ error: 'Cliente nao encontrado.' }, { status: 404 })
    }

    const client = clients[index]
    if (client.isAdmin || client.isSuperAdmin) {
      return NextResponse.json({ error: 'Contas admin/super-admin nao podem ser excluidas por este fluxo.' }, { status: 403 })
    }
    if (client.lgpdDeleted) {
      return NextResponse.json({ error: 'Conta ja foi desidentificada.' }, { status: 409 })
    }
    if (client.lgpdDeletionRequest?.status !== 'pending') {
      return NextResponse.json({ error: 'Nao ha solicitacao pendente para esta conta.' }, { status: 409 })
    }

    const timestamp = nowIso()
    const requestData = {
      ...client.lgpdDeletionRequest,
      reviewedAt: timestamp,
      reviewedBy: auth.client.id,
      adminNote,
    }

    if (action === 'reject') {
      clients[index] = {
        ...client,
        lgpdDeletionRequest: {
          ...requestData,
          status: 'rejected',
        },
        atualizadoEm: timestamp,
      }
      writeClients(clients)

      appendAuditLog({
        action: 'client.deletion_rejected',
        actor: { id: auth.client.id, email: auth.client.email, role: 'admin' },
        target: { type: 'client', id: client.id },
        details: { adminNote: sanitizeAuditValue(adminNote) },
        request,
      })

      return NextResponse.json({ ok: true, client: stripClientSecrets(clients[index]) })
    }

    const pedidos = readPedidos()
    const linkedOrders = getLinkedOrders(client, pedidos)
    const paidOrdersCount = linkedOrders.filter(isPaidOrder).length
    const nextPedidos = pedidos.map(pedido => anonymizeOrder(pedido, client, timestamp))
    writePedidos(nextPedidos)
    anonymizeRelatedJson(client, timestamp)

    clients[index] = buildDeletedClient(client, {
      ...requestData,
      legalRetention: {
        totalOrdersCount: linkedOrders.length,
        paidOrdersCount,
        legalRetentionRequired: paidOrdersCount > 0,
      },
    }, auth.client.id, timestamp)
    writeClients(clients)

    appendAuditLog({
      action: 'client.deletion_approved',
      actor: { id: auth.client.id, email: auth.client.email, role: 'admin' },
      target: { type: 'client', id: client.id },
      details: {
        totalOrdersCount: linkedOrders.length,
        paidOrdersCount,
        legalRetentionRequired: paidOrdersCount > 0,
        adminNote: sanitizeAuditValue(adminNote),
      },
      request,
    })

    return NextResponse.json({
      ok: true,
      client: stripClientSecrets(clients[index]),
      summary: { totalOrdersCount: linkedOrders.length, paidOrdersCount },
    })
  } catch (error) {
    console.error('Erro LGPD PATCH:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
