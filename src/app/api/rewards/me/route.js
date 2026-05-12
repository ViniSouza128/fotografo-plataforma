// src/app/api/rewards/me/route.js
// GET: status do cliente (level, beneficio, meta, saldo, historico)

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import {
  getRewardsConfig,
  getClientLevelInfo,
  computeAggregateBenefit,
  getClienteSaldo,
} from '@/lib/rewards'
import { findClientById } from '@/lib/clients'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

  const config = getRewardsConfig()
  const clientId = auth.client?.id
  const info = getClientLevelInfo(clientId)
  const benefit = computeAggregateBenefit(info)
  const saldo = getClienteSaldo(clientId)

  // Historico (truncado, mais recentes primeiro)
  const fullClient = findClientById(clientId)
  const historico = Array.isArray(fullClient?.saldoHistorico)
    ? [...fullClient.saldoHistorico]
        .sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0))
        .slice(0, 20)
    : []

  // Calcular progresso para o proximo nivel
  let progresso = null
  if (info.next) {
    const metaCompras = Number(info.next.metaCompras) || 0
    const metaPedidos = Number(info.next.metaPedidos) || 0
    const faltaCompras = Math.max(0, metaCompras - info.stats.totalGasto)
    const faltaPedidos = Math.max(0, metaPedidos - info.stats.totalPedidos)
    const pctCompras = metaCompras > 0 ? Math.min(100, (info.stats.totalGasto / metaCompras) * 100) : 100
    const pctPedidos = metaPedidos > 0 ? Math.min(100, (info.stats.totalPedidos / metaPedidos) * 100) : 100
    const pct = (metaCompras > 0 && metaPedidos > 0)
      ? Math.min(pctCompras, pctPedidos)
      : (metaCompras > 0 ? pctCompras : pctPedidos)
    progresso = {
      faltaCompras: Math.round(faltaCompras * 100) / 100,
      faltaPedidos,
      pct: Math.round(pct * 10) / 10,
    }
  }

  return NextResponse.json({
    ativo: config.ativo,
    acumulacao: config.acumulacao,
    niveisDisponiveis: config.niveis,
    nivelAtual: info.current,
    proximoNivel: info.next,
    qualified: info.qualified.map(n => ({ id: n.id, nome: n.nome })),
    beneficio: benefit,
    progresso,
    stats: info.stats,
    saldo,
    saldoHistorico: historico,
  })
}
