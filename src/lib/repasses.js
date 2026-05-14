// src/lib/repasses.js
// Fluxo de repasse financeiro para colaboradores:
//   - Cada item de pedido pago gera saldo pendente para o colaborador dono da foto
//   - O percentual sai de client.percentualRepasse, com fallback em config.colaboradores.percentualPadrao
//   - Repasses pagos ficam em data/repasses.json
//
// data/repasses.json:
// [
//   {
//     id, colaboradorId, valor, metodo, observacao,
//     status: 'pago' | 'convertido_saldo_cliente' | 'agendado',
//     periodoInicio, periodoFim,
//     pedidoIds: [...],
//     conversaoClienteId, carencia (data dispon.),
//     pagoEm, registradoPor,
//   }
// ]

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { readConfig } from './config'
import { readPedidos } from './pedidos'
import { readPhotos } from './photos'
import { readEvents } from './events'
import { readClients } from './clients'
import { creditarSaldo } from './rewards'
import { getPedidoItens } from './commerceUtils'
import { DATA_DIR, ensureRuntimeDirs } from './runtimePaths'

const DATA_PATH = path.join(DATA_DIR, 'repasses.json')
const PAID_STATUSES = new Set(['pago', 'liberado_manual'])

function ensureFile() {
  ensureRuntimeDirs()
  const dir = path.dirname(DATA_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, '[]', 'utf-8')
}

function round2(v) { return Math.round(Number(v || 0) * 100) / 100 }

export function readRepasses() {
  ensureFile()
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8')
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function writeRepasses(rows) {
  ensureFile()
  fs.writeFileSync(DATA_PATH, JSON.stringify(rows, null, 2), 'utf-8')
}

export function getPercentualPadrao() {
  const cfg = readConfig()
  const v = Number(cfg?.colaboradores?.percentualPadrao)
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 70
}

export function getCarenciaDias() {
  const cfg = readConfig()
  const v = Number(cfg?.colaboradores?.carenciaDiasParaSaldoCliente)
  return Number.isFinite(v) && v >= 0 ? v : 7
}

export function getPercentualParaColaborador(colaborador) {
  if (!colaborador) return getPercentualPadrao()
  const v = Number(colaborador.percentualRepasse)
  if (Number.isFinite(v) && v >= 0 && v <= 100) return v
  return getPercentualPadrao()
}

// Computa, para cada colaborador, total bruto vendido + parte do colaborador (usando seu %),
// número de fotos vendidas, pedidos atribuíveis. Os filtros por período são opcionais.
export function computeRepasseStats({ inicio = null, fim = null, colaboradorId = null } = {}) {
  const pedidos = readPedidos().filter(p => PAID_STATUSES.has(p.status))
  const photos = readPhotos()
  const events = readEvents()
  const clients = readClients()
  const photoById = new Map(photos.map(p => [p.id, p]))
  const eventById = new Map(events.map(e => [e.id, e]))
  const colabById = new Map(
    clients.filter(c => c.isColaborador && c.isAdmin).map(c => [c.id, c])
  )

  const stats = new Map() // colaboradorId -> { ...resumo }
  const tInicio = inicio ? new Date(inicio).getTime() : null
  const tFim = fim ? new Date(fim).getTime() : null

  for (const pedido of pedidos) {
    const t = new Date(pedido.criadoEm || pedido.atualizadoEm || 0).getTime()
    if (tInicio !== null && t < tInicio) continue
    if (tFim !== null && t > tFim) continue
    for (const item of getPedidoItens(pedido)) {
      const photoId = item.photoId || item.id
      const photo = photoById.get(photoId)
      if (!photo) continue
      const colabId = photo.colaboradorId
        || (eventById.get(photo.eventId)?.colaboradorId)
        || null
      if (!colabId) continue
      if (colaboradorId && colabId !== colaboradorId) continue
      const colaborador = colabById.get(colabId)
      const pct = getPercentualParaColaborador(colaborador)
      const valorBruto = Number(item.price) || 0
      const valorColab = round2(valorBruto * (pct / 100))

      let s = stats.get(colabId)
      if (!s) {
        s = {
          colaboradorId: colabId,
          colaboradorNome: colaborador?.nomeCompleto || '(removido)',
          percentualUsado: pct,
          totalBruto: 0,
          totalColaborador: 0,
          fotosVendidas: 0,
          pedidoIds: new Set(),
        }
        stats.set(colabId, s)
      }
      s.totalBruto = round2(s.totalBruto + valorBruto)
      s.totalColaborador = round2(s.totalColaborador + valorColab)
      s.fotosVendidas += 1
      s.pedidoIds.add(pedido.id)
    }
  }

  // Subtrai já pagos para chegar em saldoPendente
  const repasses = readRepasses()
  for (const s of stats.values()) {
    const pagos = repasses
      .filter(r => r.colaboradorId === s.colaboradorId && (r.status === 'pago' || r.status === 'convertido_saldo_cliente'))
    const totalPago = round2(pagos.reduce((acc, r) => acc + Number(r.valor || 0), 0))
    s.totalPago = totalPago
    s.saldoPendente = round2(Math.max(0, s.totalColaborador - totalPago))
    s.pedidoIds = Array.from(s.pedidoIds)
  }

  return Array.from(stats.values()).sort((a, b) => b.saldoPendente - a.saldoPendente)
}

export function listRepasses({ colaboradorId = null } = {}) {
  const all = readRepasses()
  return all
    .filter(r => !colaboradorId || r.colaboradorId === colaboradorId)
    .sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0))
}

// Registra um pagamento manual ao colaborador.
// Tipos: 'pago' (pix/dinheiro/etc) | 'convertido_saldo_cliente'
export function registrarRepasse({
  colaboradorId,
  valor,
  metodo = 'pix',
  observacao = '',
  status = 'pago',
  conversaoClienteId = null,
  carenciaDias = null,
  registradoPor = null,
  periodoInicio = null,
  periodoFim = null,
} = {}) {
  if (!colaboradorId) return { ok: false, error: 'colaboradorId obrigatorio.' }
  const valorNum = Number(valor)
  if (!Number.isFinite(valorNum) || valorNum <= 0) {
    return { ok: false, error: 'Valor invalido.' }
  }
  const stats = computeRepasseStats({ colaboradorId })
  const saldoAtual = stats[0]?.saldoPendente || 0
  if (round2(valorNum) > round2(saldoAtual)) {
    return { ok: false, error: `Valor maior que saldo pendente (R$ ${saldoAtual.toFixed(2)}).` }
  }

  const all = readRepasses()
  const now = new Date()
  let disponivelEm = null
  if (status === 'convertido_saldo_cliente' && carenciaDias && carenciaDias > 0) {
    disponivelEm = new Date(now.getTime() + carenciaDias * 24 * 60 * 60 * 1000).toISOString()
  }

  const row = {
    id: crypto.randomUUID(),
    colaboradorId,
    valor: round2(valorNum),
    metodo,
    observacao: String(observacao || '').slice(0, 500),
    status,
    conversaoClienteId: status === 'convertido_saldo_cliente' ? (conversaoClienteId || null) : null,
    carenciaDias: status === 'convertido_saldo_cliente' ? Number(carenciaDias || 0) : null,
    disponivelEm,
    periodoInicio: periodoInicio || null,
    periodoFim: periodoFim || null,
    registradoPor: registradoPor || null,
    criadoEm: now.toISOString(),
  }
  all.push(row)
  writeRepasses(all)

  // Conversão imediata em saldo do cliente (se carência = 0, credita já)
  if (status === 'convertido_saldo_cliente' && conversaoClienteId && (!carenciaDias || carenciaDias <= 0)) {
    const credit = creditarSaldo(conversaoClienteId, valorNum, {
      motivo: 'conversao_repasse',
      pedidoId: null,
    })
    if (!credit.ok) {
      // rollback
      writeRepasses(all.filter(r => r.id !== row.id))
      return { ok: false, error: credit.error || 'Falha ao creditar saldo.' }
    }
    row.creditadoEm = new Date().toISOString()
    writeRepasses(all)
  }

  return { ok: true, repasse: row, novoSaldoPendente: round2(saldoAtual - valorNum) }
}

// Processa conversões agendadas cuja carência venceu (chamar periodicamente; também
// pode ser invocado de modo lazy ao listar repasses).
export function processarCarenciasVencidas() {
  const all = readRepasses()
  let changed = false
  const now = Date.now()
  for (const row of all) {
    if (row.status !== 'convertido_saldo_cliente') continue
    if (row.creditadoEm) continue
    if (!row.disponivelEm) continue
    const t = new Date(row.disponivelEm).getTime()
    if (Number.isFinite(t) && t <= now && row.conversaoClienteId) {
      const credit = creditarSaldo(row.conversaoClienteId, row.valor, {
        motivo: 'conversao_repasse_carencia',
        pedidoId: null,
      })
      if (credit.ok) {
        row.creditadoEm = new Date().toISOString()
        changed = true
      }
    }
  }
  if (changed) writeRepasses(all)
  return changed
}
