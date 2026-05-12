// src/app/api/rewards/route.js
// GET: retorna config publica (sem expor admin-only)
// PATCH: salva config (admin)

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { readConfig, writeConfig } from '@/lib/config'
import { getRewardsConfig, normalizeRewardsConfig } from '@/lib/rewards'
import { appendAuditLog } from '@/lib/auditLog'

export async function GET() {
  // Publico (apenas a config, sem dados de cliente)
  const cfg = getRewardsConfig()
  return NextResponse.json(cfg)
}

export async function PATCH(request) {
  const auth = await requireAuth({ requireAdmin: true })
  if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

  try {
    const body = await request.json()
    const normalized = normalizeRewardsConfig(body)
    const current = readConfig()
    const updated = { ...current, rewards: normalized }
    writeConfig(updated)

    appendAuditLog({
      action: 'rewards.updated',
      actor: auth.client || auth.payload,
      target: { type: 'config', id: 'rewards', label: 'rewards' },
      details: {
        ativo: normalized.ativo,
        acumulacao: normalized.acumulacao,
        niveisCount: normalized.niveis.length,
      },
      request,
    })

    return NextResponse.json(normalized)
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Erro ao salvar configuração de recompensas.' }, { status: 400 })
  }
}
