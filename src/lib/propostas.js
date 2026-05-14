// src/lib/propostas.js
// Sistema de propostas e contrapropostas no carrinho
//
// Status flow:
//   pendente → aceita | rejeitada | contraproposta | invalidada
//   contraproposta → aceita_pelo_cliente | rejeitada_pelo_cliente | invalidada
//   aceita | aceita_pelo_cliente → usada (após pagamento) | invalidada (carrinho mudou)
//
// Snapshot do carrinho fica preso na proposta: se o cliente alterar itens,
// proposta vira invalidada.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { DATA_DIR, ensureRuntimeDirs } from './runtimePaths'

const PROPOSTAS_PATH = path.join(DATA_DIR, 'propostas.json')

const STATUS_ATIVOS = new Set([
  'pendente',
  'contraproposta',
  'aceita',
  'aceita_pelo_cliente',
])
const STATUS_RESOLVIDOS_PRA_CHECKOUT = new Set([
  'aceita',
  'aceita_pelo_cliente',
])

function ensureDir() {
  ensureRuntimeDirs()
}

function round2(v) { return Math.round(Number(v || 0) * 100) / 100 }

export function readPropostas() {
  try {
    if (!fs.existsSync(PROPOSTAS_PATH)) return []
    const raw = fs.readFileSync(PROPOSTAS_PATH, 'utf-8')
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function writePropostas(data) {
  ensureDir()
  fs.writeFileSync(PROPOSTAS_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

// Assinatura estavel do carrinho — usa apenas IDs (nao preço, pois admin pode mudar preço)
export function cartSignature(items) {
  if (!Array.isArray(items) || items.length === 0) return ''
  return items
    .map(i => `${i?.id || i?.photoId || ''}:${i?.eventId || ''}`)
    .filter(s => s !== ':')
    .sort()
    .join('|')
}

export function isStatusAtivo(status) {
  return STATUS_ATIVOS.has(status)
}

export function isStatusUsavelNoCheckout(status) {
  return STATUS_RESOLVIDOS_PRA_CHECKOUT.has(status)
}

export function getValorAcordado(proposta) {
  if (!proposta) return null
  if (proposta.status === 'aceita') return Number(proposta.valorPropostoCliente) || 0
  if (proposta.status === 'aceita_pelo_cliente') return Number(proposta.valorContraproposta) || 0
  return null
}

export function findPropostaById(id) {
  return readPropostas().find(p => p.id === id) || null
}

// Encontra a proposta ativa do cliente (apenas uma ativa por vez)
export function findActivePropostaForClient(clientId) {
  if (!clientId) return null
  const all = readPropostas()
  return all.find(p => p.clientId === clientId && STATUS_ATIVOS.has(p.status)) || null
}

// Marca propostas ativas do cliente como invalidadas se a assinatura do
// carrinho atual nao bater com o snapshot. Retorna numero de invalidadas.
export function invalidateIfCartChanged(clientId, currentSignature) {
  if (!clientId) return 0
  const all = readPropostas()
  let changed = 0
  for (const p of all) {
    if (p.clientId !== clientId) continue
    if (!STATUS_ATIVOS.has(p.status)) continue
    if (p.cartSignature !== currentSignature) {
      p.status = 'invalidada'
      p.invalidadaEm = new Date().toISOString()
      p.invalidacaoMotivo = 'carrinho_mudou'
      p.atualizadoEm = p.invalidadaEm
      changed++
    }
  }
  if (changed > 0) writePropostas(all)
  return changed
}

export function appendProposta({
  clientId,
  clientNome,
  items,
  subtotalOriginal,
  valorPropostoCliente,
  mensagemCliente,
}) {
  const valor = round2(Number(valorPropostoCliente) || 0)
  if (!clientId) throw new Error('clientId obrigatório.')
  if (!(valor > 0)) throw new Error('Valor proposto deve ser maior que zero.')
  if (!Array.isArray(items) || items.length === 0) throw new Error('Itens obrigatórios.')

  const sig = cartSignature(items)

  // Cancela propostas ativas anteriores do mesmo cliente (uma por vez)
  const all = readPropostas()
  for (const p of all) {
    if (p.clientId === clientId && STATUS_ATIVOS.has(p.status)) {
      p.status = 'invalidada'
      p.invalidadaEm = new Date().toISOString()
      p.invalidacaoMotivo = 'nova_proposta_criada'
      p.atualizadoEm = p.invalidadaEm
    }
  }

  const itemsSnapshot = items.map(i => ({
    id: i.id || i.photoId,
    photoId: i.id || i.photoId,
    eventId: i.eventId || null,
    eventName: i.eventName || null,
    filename: i.filename || null,
    publicId: i.publicId || null,
    price: Number(i.price ?? i.priceEffective ?? i.priceOriginal ?? 0),
  }))

  const nowIso = new Date().toISOString()
  const nova = {
    id: crypto.randomUUID(),
    clientId,
    clientNome: clientNome || null,
    items: itemsSnapshot,
    cartSignature: sig,
    subtotalOriginal: round2(Number(subtotalOriginal) || 0),
    valorPropostoCliente: valor,
    mensagemCliente: String(mensagemCliente || '').slice(0, 500),
    valorContraproposta: null,
    mensagemAdmin: null,
    status: 'pendente',
    criadoEm: nowIso,
    atualizadoEm: nowIso,
    respondidoPor: null,
    pedidoId: null,
  }

  all.push(nova)
  writePropostas(all)
  return nova
}

// Acoes de admin
export function adminAceitar(id, actor) {
  return mutateProposta(id, p => {
    if (!isStatusAtivo(p.status) || p.status === 'aceita_pelo_cliente') {
      throw new Error('Proposta não está em estado aceitável.')
    }
    if (p.status === 'contraproposta') throw new Error('Aguardando resposta do cliente à contraproposta.')
    if (p.status === 'aceita') return p
    p.status = 'aceita'
    p.respondidoPor = actor?.id || null
    p.atualizadoEm = new Date().toISOString()
    return p
  })
}

export function adminRejeitar(id, actor, mensagem) {
  return mutateProposta(id, p => {
    if (!isStatusAtivo(p.status)) throw new Error('Proposta não está ativa.')
    p.status = 'rejeitada'
    p.respondidoPor = actor?.id || null
    if (mensagem) p.mensagemAdmin = String(mensagem).slice(0, 500)
    p.atualizadoEm = new Date().toISOString()
    return p
  })
}

export function adminContraproposta(id, actor, valor, mensagem) {
  const valorNum = round2(Number(valor) || 0)
  if (!(valorNum > 0)) throw new Error('Valor da contraproposta inválido.')
  return mutateProposta(id, p => {
    if (!isStatusAtivo(p.status)) throw new Error('Proposta não está ativa.')
    if (p.status === 'aceita') throw new Error('Proposta já foi aceita.')
    if (p.status === 'aceita_pelo_cliente') throw new Error('Cliente já aceitou contraproposta anterior.')
    p.status = 'contraproposta'
    p.valorContraproposta = valorNum
    p.mensagemAdmin = String(mensagem || '').slice(0, 500)
    p.respondidoPor = actor?.id || null
    p.atualizadoEm = new Date().toISOString()
    return p
  })
}

// Acoes de cliente (sobre contraproposta)
export function clienteAceitarContraproposta(id, clientId) {
  return mutateProposta(id, p => {
    if (p.clientId !== clientId) throw new Error('Sem permissão.')
    if (p.status !== 'contraproposta') throw new Error('Não há contraproposta para responder.')
    p.status = 'aceita_pelo_cliente'
    p.atualizadoEm = new Date().toISOString()
    return p
  })
}

export function clienteRejeitarContraproposta(id, clientId) {
  return mutateProposta(id, p => {
    if (p.clientId !== clientId) throw new Error('Sem permissão.')
    if (p.status !== 'contraproposta') throw new Error('Não há contraproposta para rejeitar.')
    p.status = 'rejeitada_pelo_cliente'
    p.atualizadoEm = new Date().toISOString()
    return p
  })
}

// Cliente cancela sua propria proposta (antes de resposta)
export function clienteCancelar(id, clientId) {
  return mutateProposta(id, p => {
    if (p.clientId !== clientId) throw new Error('Sem permissão.')
    if (p.status !== 'pendente') throw new Error('Apenas propostas pendentes podem ser canceladas.')
    p.status = 'invalidada'
    p.invalidadaEm = new Date().toISOString()
    p.invalidacaoMotivo = 'cancelada_pelo_cliente'
    p.atualizadoEm = p.invalidadaEm
    return p
  })
}

// Marca proposta como usada após pagamento
export function markPropostaUsada(id, pedidoId) {
  return mutateProposta(id, p => {
    p.status = 'usada'
    p.pedidoId = pedidoId
    p.usadaEm = new Date().toISOString()
    p.atualizadoEm = p.usadaEm
    return p
  })
}

function mutateProposta(id, fn) {
  const all = readPropostas()
  const idx = all.findIndex(p => p.id === id)
  if (idx === -1) throw new Error('Proposta não encontrada.')
  const updated = fn({ ...all[idx] })
  all[idx] = updated
  writePropostas(all)
  return updated
}

// Lista propostas com filtros
export function listPropostas({ clientId = null, statusFilter = null } = {}) {
  let all = readPropostas()
  if (clientId) all = all.filter(p => p.clientId === clientId)
  if (statusFilter) all = all.filter(p => p.status === statusFilter)
  return all.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
}

// Helpers de status display
export const STATUS_LABELS = {
  pendente: 'Pendente',
  aceita: 'Aceita',
  rejeitada: 'Rejeitada',
  contraproposta: 'Contraproposta enviada',
  aceita_pelo_cliente: 'Cliente aceitou',
  rejeitada_pelo_cliente: 'Cliente rejeitou',
  invalidada: 'Invalidada',
  usada: 'Usada em pedido',
}
