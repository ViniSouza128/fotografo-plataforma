// src/lib/rewards.js
// Sistema opcional de cashback / saldo / nivel
//
// Configuracao em data/config.json sob a chave "rewards":
//   {
//     ativo: boolean,
//     acumulacao: "maior" | "soma",
//     niveis: [
//       {
//         id, nome, icon, color,
//         metaCompras: number (R$ minimo gasto),
//         metaPedidos: number (numero minimo de pedidos pagos),
//         beneficioTipo: "desconto" | "cashback" | "saldo",
//         beneficioValor: number  // % para desconto/cashback, R$ para saldo
//       }
//     ]
//   }
//
// Saldo do cliente persistido em clients.json: campos `saldo` e `saldoHistorico`.

import crypto from 'crypto'
import { readConfig } from './config'
import { readClients, writeClients } from './clients'
import { readPedidos } from './pedidos'

const PAID_STATUSES = new Set(['pago', 'liberado_manual'])

function round2(v) { return Math.round(Number(v || 0) * 100) / 100 }

export function getRewardsConfig() {
  const cfg = readConfig()
  const r = cfg?.rewards || {}
  return {
    ativo: !!r.ativo,
    acumulacao: r.acumulacao === 'soma' ? 'soma' : 'maior',
    niveis: Array.isArray(r.niveis) ? r.niveis : [],
  }
}

export function isRewardsAtivo() {
  return getRewardsConfig().ativo
}

// Estatisticas do cliente: total gasto e numero de pedidos pagos
export function computeClientStats(clientId) {
  if (!clientId) return { totalGasto: 0, totalPedidos: 0 }
  const pedidos = readPedidos()
  let totalGasto = 0
  let totalPedidos = 0
  for (const p of pedidos) {
    if (!PAID_STATUSES.has(p.status)) continue
    if (p.clientId !== clientId) continue
    totalGasto += Number(p.total || p.totalSemTaxas || 0)
    totalPedidos += 1
  }
  return { totalGasto: round2(totalGasto), totalPedidos }
}

// Niveis qualificados em ordem crescente
function rankedQualifiedLevels(stats, niveis) {
  const sorted = [...(Array.isArray(niveis) ? niveis : [])]
    .map(n => ({
      ...n,
      metaCompras: Math.max(0, Number(n.metaCompras) || 0),
      metaPedidos: Math.max(0, Number(n.metaPedidos) || 0),
      beneficioValor: Math.max(0, Number(n.beneficioValor) || 0),
    }))
    .sort((a, b) => a.metaCompras - b.metaCompras || a.metaPedidos - b.metaPedidos)
  const qualified = sorted.filter(n =>
    stats.totalGasto >= n.metaCompras && stats.totalPedidos >= n.metaPedidos
  )
  const next = sorted.find(n =>
    stats.totalGasto < n.metaCompras || stats.totalPedidos < n.metaPedidos
  ) || null
  const current = qualified.length > 0 ? qualified[qualified.length - 1] : null
  return { sorted, qualified, current, next }
}

export function getClientLevelInfo(clientId) {
  const config = getRewardsConfig()
  const stats = computeClientStats(clientId)
  if (!config.ativo) {
    return { ativo: false, acumulacao: config.acumulacao, current: null, next: null, qualified: [], stats }
  }
  const { sorted, qualified, current, next } = rankedQualifiedLevels(stats, config.niveis)
  return {
    ativo: true,
    acumulacao: config.acumulacao,
    current,
    next,
    qualified,
    todos: sorted,
    stats,
  }
}

// Beneficio agregado (combina niveis qualificados conforme `acumulacao`)
export function computeAggregateBenefit(infoOrClientId) {
  const info = typeof infoOrClientId === 'string' ? getClientLevelInfo(infoOrClientId) : infoOrClientId
  const empty = { descontoPct: 0, cashbackPct: 0, saldoFlat: 0, levelsApplied: [] }
  if (!info?.ativo) return empty

  const lista = info.acumulacao === 'soma'
    ? (info.qualified || [])
    : (info.current ? [info.current] : [])

  let descontoPct = 0
  let cashbackPct = 0
  let saldoFlat = 0
  const levelsApplied = []

  for (const n of lista) {
    const tipo = n.beneficioTipo
    const valor = Math.max(0, Number(n.beneficioValor) || 0)
    if (valor <= 0) continue
    if (tipo === 'desconto') descontoPct += valor
    else if (tipo === 'cashback') cashbackPct += valor
    else if (tipo === 'saldo') saldoFlat += valor
    levelsApplied.push({ id: n.id || null, nome: n.nome || null, tipo, valor })
  }

  if (descontoPct > 100) descontoPct = 100
  if (cashbackPct > 100) cashbackPct = 100

  return { descontoPct, cashbackPct, saldoFlat: round2(saldoFlat), levelsApplied }
}

// Saldo atual do cliente (cache em clients.json)
export function getClienteSaldo(clientId) {
  if (!clientId) return 0
  const clients = readClients()
  const c = clients.find(x => x.id === clientId)
  return Number(c?.saldo || 0)
}

function appendSaldoEntry(client, entry) {
  client.saldoHistorico = Array.isArray(client.saldoHistorico) ? client.saldoHistorico : []
  client.saldoHistorico.push(entry)
  if (client.saldoHistorico.length > 200) {
    client.saldoHistorico = client.saldoHistorico.slice(-200)
  }
}

export function debitarSaldo(clientId, valor, { motivo, pedidoId } = {}) {
  if (!clientId || !(Number(valor) > 0)) return { ok: false, error: 'Parametros invalidos.' }
  const clients = readClients()
  const idx = clients.findIndex(x => x.id === clientId)
  if (idx === -1) return { ok: false, error: 'Cliente nao encontrado.' }
  const saldoAtual = Number(clients[idx].saldo || 0)
  const valorNum = round2(Number(valor))
  if (saldoAtual + 0.001 < valorNum) return { ok: false, error: 'Saldo insuficiente.' }
  const novoSaldo = round2(saldoAtual - valorNum)
  clients[idx].saldo = novoSaldo
  appendSaldoEntry(clients[idx], {
    id: crypto.randomUUID(),
    tipo: 'debito',
    valor: valorNum,
    motivo: motivo || 'uso em pedido',
    pedidoId: pedidoId || null,
    criadoEm: new Date().toISOString(),
  })
  clients[idx].atualizadoEm = new Date().toISOString()
  writeClients(clients)
  return { ok: true, novoSaldo }
}

export function creditarSaldo(clientId, valor, { motivo, pedidoId } = {}) {
  if (!clientId || !(Number(valor) > 0)) return { ok: false, error: 'Parametros invalidos.' }
  const clients = readClients()
  const idx = clients.findIndex(x => x.id === clientId)
  if (idx === -1) return { ok: false, error: 'Cliente nao encontrado.' }
  const saldoAtual = Number(clients[idx].saldo || 0)
  const valorNum = round2(Number(valor))
  const novoSaldo = round2(saldoAtual + valorNum)
  clients[idx].saldo = novoSaldo
  appendSaldoEntry(clients[idx], {
    id: crypto.randomUUID(),
    tipo: 'credito',
    valor: valorNum,
    motivo: motivo || 'cashback',
    pedidoId: pedidoId || null,
    criadoEm: new Date().toISOString(),
  })
  clients[idx].atualizadoEm = new Date().toISOString()
  writeClients(clients)
  return { ok: true, novoSaldo }
}

// Idempotente: credita cashback + saldoFlat ao cliente quando pedido vai para pago
// Retorna { creditoTotal, novoSaldo } se creditou, ou null se nada a fazer
export function processarRewardsAoPagar(pedido) {
  if (!pedido) return null
  if (pedido.rewardsCreditados === true) return null
  const r = pedido.rewardsAplicado
  if (!r || !pedido.clientId) return null

  let creditoTotal = 0
  if (Number(r.cashback) > 0) creditoTotal += Number(r.cashback)
  if (Number(r.saldoFlat) > 0) creditoTotal += Number(r.saldoFlat)
  if (creditoTotal <= 0) return null

  const result = creditarSaldo(pedido.clientId, creditoTotal, {
    motivo: `Recompensa pedido #${pedido.publicId || (pedido.id || '').slice(0, 8)}`,
    pedidoId: pedido.id,
  })
  if (!result.ok) return null
  return { creditoTotal: round2(creditoTotal), novoSaldo: result.novoSaldo }
}

export function markPedidoRewardsCredited(pedido, info) {
  pedido.rewardsCreditados = true
  pedido.rewardsCreditadosEm = new Date().toISOString()
  if (info) pedido.rewardsCreditoInfo = info
  return pedido
}

// Aplica rewards a um pedido sendo criado.
// totalAposCupom = total apos descontos progressivos e cupom, antes de saldo/nivel.
export function aplicarRewardsAoPedido({
  clientId,
  totalAposCupom,
  saldoSolicitado = 0,
  aplicarLevelDiscount = true,
}) {
  const totalInicial = round2(Number(totalAposCupom) || 0)
  const info = getClientLevelInfo(clientId)

  if (!info.ativo || !clientId) {
    return {
      rewardsAplicado: null,
      total: totalInicial,
      saldoUtilizado: 0,
      saldoDisponivelAntes: 0,
    }
  }

  const benefit = computeAggregateBenefit(info)
  let total = totalInicial
  let descontoNivel = 0
  if (aplicarLevelDiscount && benefit.descontoPct > 0 && total > 0) {
    descontoNivel = round2(total * benefit.descontoPct / 100)
    total = round2(total - descontoNivel)
  }

  const saldoDisponivel = getClienteSaldo(clientId)
  let saldoUtilizado = 0
  const solicitado = Math.max(0, round2(Number(saldoSolicitado) || 0))
  if (solicitado > 0 && saldoDisponivel > 0 && total > 0) {
    saldoUtilizado = round2(Math.min(solicitado, saldoDisponivel, total))
    total = round2(total - saldoUtilizado)
  }

  const cashback = (benefit.cashbackPct > 0 && total > 0)
    ? round2(total * benefit.cashbackPct / 100)
    : 0
  const saldoFlat = round2(benefit.saldoFlat || 0)

  const hasAnyBenefit = descontoNivel > 0 || cashback > 0 || saldoFlat > 0 || benefit.levelsApplied.length > 0

  const rewardsAplicado = hasAnyBenefit
    ? {
        nivelAtualId: info.current?.id || null,
        nivelAtualNome: info.current?.nome || null,
        levelsApplied: benefit.levelsApplied,
        acumulacao: info.acumulacao,
        descontoPct: benefit.descontoPct,
        descontoValor: descontoNivel,
        cashbackPct: benefit.cashbackPct,
        cashback,
        saldoFlat,
      }
    : null

  return {
    rewardsAplicado,
    total,
    saldoUtilizado,
    saldoDisponivelAntes: saldoDisponivel,
  }
}

// Validacao simples da estrutura dos niveis (para a API)
export function normalizeRewardsConfig(input = {}) {
  const niveis = Array.isArray(input.niveis) ? input.niveis : []
  return {
    ativo: !!input.ativo,
    acumulacao: input.acumulacao === 'soma' ? 'soma' : 'maior',
    niveis: niveis.map(n => ({
      id: n.id || crypto.randomUUID(),
      nome: String(n.nome || '').slice(0, 40).trim(),
      icon: String(n.icon || '🏅').slice(0, 4),
      color: typeof n.color === 'string' ? n.color : '#cd7f32',
      metaCompras: Math.max(0, Number(n.metaCompras) || 0),
      metaPedidos: Math.max(0, Number(n.metaPedidos) || 0),
      beneficioTipo: ['desconto', 'cashback', 'saldo'].includes(n.beneficioTipo) ? n.beneficioTipo : 'desconto',
      beneficioValor: Math.max(0, Number(n.beneficioValor) || 0),
    })).filter(n => n.nome),
  }
}
