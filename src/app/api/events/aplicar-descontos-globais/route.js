import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { readEvents, writeEvents } from '@/lib/events'
import { readConfig } from '@/lib/config'
import { appendAuditLog } from '@/lib/auditLog'

// POST /api/events/aplicar-descontos-globais
// Body: { mode: 'override' | 'switchToGlobal' | 'onlyDefault' }
//   - 'switchToGlobal' (default): sets usarDescontosGlobais=true on all non-removed events; preserves their custom table for later toggle-off
//   - 'override': copies the global table into each event's descontosProgressivos and turns it on
//   - 'onlyDefault': only updates events that have no custom table or have it empty/inactive
export async function POST(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const body = await request.json().catch(() => ({}))
    const mode = ['override', 'switchToGlobal', 'onlyDefault'].includes(body?.mode) ? body.mode : 'switchToGlobal'
    // target: 'fotos' (default, retrocompatível) ou 'videos' — escolhe qual tabela
    const target = body?.target === 'videos' ? 'videos' : 'fotos'

    const cfg = readConfig()
    const globalRows = target === 'videos'
      ? (Array.isArray(cfg.descontosVideoGlobais) ? cfg.descontosVideoGlobais : [])
      : (Array.isArray(cfg.descontosGlobais) ? cfg.descontosGlobais : [])
    const globalAtivo = target === 'videos' ? !!cfg.descontosVideoGlobaisAtivos : !!cfg.descontosGlobaisAtivos

    // Nomes dos campos no event conforme target
    const F = target === 'videos'
      ? { rows: 'descontosVideoProgressivos', ativo: 'descontosVideoProgressivosAtivos', usaGlobal: 'usarDescontosVideoGlobais' }
      : { rows: 'descontosProgressivos',      ativo: 'descontosProgressivosAtivos',      usaGlobal: 'usarDescontosGlobais' }

    const events = readEvents()
    let touched = 0

    for (const ev of events) {
      if (ev.removido) continue

      if (mode === 'switchToGlobal') {
        ev[F.usaGlobal] = true
        touched += 1
      } else if (mode === 'override') {
        ev[F.rows] = globalRows.map(r => ({
          quantidade: Number(r.quantidade) || 0,
          desconto: Number(r.desconto) || 0,
        }))
        ev[F.ativo] = globalAtivo
        ev[F.usaGlobal] = false
        touched += 1
      } else if (mode === 'onlyDefault') {
        const noCustom = !Array.isArray(ev[F.rows]) || ev[F.rows].length === 0
        if (noCustom || !ev[F.ativo]) {
          ev[F.usaGlobal] = true
          touched += 1
        }
      }
      ev.atualizadoEm = new Date().toISOString()
    }

    writeEvents(events)

    appendAuditLog({
      action: 'discounts.apply_global',
      actor: auth.client || auth.payload,
      target: { type: 'config', label: target === 'videos' ? 'descontosVideoGlobais' : 'descontosGlobais' },
      details: { mode, target, touched, totalEvents: events.length },
      request,
    })

    return NextResponse.json({ touched, total: events.length, mode, target })
  } catch (error) {
    console.error('Erro ao aplicar descontos globais:', error)
    return NextResponse.json({ error: 'Erro ao aplicar descontos globais' }, { status: 500 })
  }
}
