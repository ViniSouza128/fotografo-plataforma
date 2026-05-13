import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { requireAuth } from '@/lib/apiAuth'
import { createBackup } from '@/lib/backup'
import { appendAuditLog } from '@/lib/auditLog'
import { readPedidos, writePedidos } from '@/lib/pedidos'
import { readPhotos, writePhotos } from '@/lib/photos'
import { readEvents, writeEvents } from '@/lib/events'
import { readConfig, writeConfig } from '@/lib/config'
import { getPedidoItens } from '@/lib/commerceUtils'

const DATA_DIR = path.join(process.cwd(), 'data')
const PAID_STATUSES = new Set(['pago', 'liberado_manual'])

const RESET_TYPES = {
  pedidos: { phrase: 'RESETAR PEDIDOS', label: 'Pedidos e financeiro' },
  carrinhos: { phrase: 'RESETAR CARRINHOS', label: 'Carrinhos abertos' },
  eventos: { phrase: 'RESETAR EVENTOS', label: 'Eventos e fotos não compradas' },
  clientes: { phrase: 'RESETAR CLIENTES', label: 'Contas de clientes (preserva admins)' },
  configs: { phrase: 'RESETAR CONFIGURACOES', label: 'Configurações do site' },
  tudo: { phrase: 'RESETAR SITE INTEIRO', label: 'Site inteiro' },
}

function gateSuperAdmin(auth) {
  if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
  if (!auth.payload?.isSuperAdmin) {
    return NextResponse.json({ error: 'Apenas super-admins podem executar reset.', code: 'super_admin_only' }, { status: 403 })
  }
  return null
}

function writeJsonSafe(filename, data) {
  const file = path.join(DATA_DIR, filename)
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}

function readJsonSafe(filename, fallback) {
  const file = path.join(DATA_DIR, filename)
  if (!fs.existsSync(file)) return fallback
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return fallback }
}

// Returns the set of photo IDs referenced by paid orders.
// These must be preserved when resetting events/photos.
function getPurchasedPhotoIds() {
  const pedidos = readPedidos()
  const ids = new Set()
  for (const p of pedidos) {
    if (!PAID_STATUSES.has(p.status)) continue
    for (const item of getPedidoItens(p)) {
      const id = item?.photoId || item?.id
      if (id) ids.add(id)
    }
  }
  return ids
}

async function resetPedidos() {
  const before = readPedidos()
  writePedidos([])
  writeJsonSafe('payment_log.json', [])
  writeJsonSafe('remocoes.json', [])
  return { removedPedidos: before.length }
}

async function resetCarrinhos() {
  const clients = readJsonSafe('clients.json', [])
  let cleared = 0
  for (const c of clients) {
    if (Array.isArray(c.carrinho) && c.carrinho.length > 0) {
      cleared++
      c.carrinho = []
    }
    if (c.cart && Array.isArray(c.cart) && c.cart.length > 0) {
      cleared++
      c.cart = []
    }
  }
  writeJsonSafe('clients.json', clients)
  // Pedidos with status 'carrinho' are also active carts — clear them.
  const pedidos = readPedidos()
  const filtered = pedidos.filter(p => p.status !== 'carrinho')
  if (filtered.length !== pedidos.length) writePedidos(filtered)
  return { clearedCarts: cleared, removedAbandonedOrders: pedidos.length - filtered.length }
}

async function resetEventos() {
  const purchased = getPurchasedPhotoIds()
  const events = readEvents()
  const photos = readPhotos()

  // Preserve photos that are part of paid orders. Detach from event but keep
  // the entry so download links from past purchases continue to work.
  const preserved = []
  for (const ph of photos) {
    if (purchased.has(ph.id)) {
      preserved.push({
        ...ph,
        eventId: null,
        preservado: true,
        eventIdOriginal: ph.eventIdOriginal || ph.eventId || null,
        preservadoEm: new Date().toISOString(),
      })
    }
  }

  writeEvents([])
  writePhotos(preserved)

  return {
    removedEvents: events.length,
    removedPhotos: photos.length - preserved.length,
    preservedPhotos: preserved.length,
  }
}

async function resetClientes(actor) {
  const clients = readJsonSafe('clients.json', [])
  // Keep all admin accounts, plus the actor (defensive — should already be admin).
  const kept = clients.filter(c => c.isAdmin === true || c.id === actor?.id)
  writeJsonSafe('clients.json', kept)
  // Comments/feedback are tied to clients — clear them too to avoid orphan refs.
  writeJsonSafe('comentarios.json', [])
  writeJsonSafe('feedbacks.json', [])
  writeJsonSafe('avaliacoes.json', [])
  return { removedClients: clients.length - kept.length, keptAdmins: kept.length }
}

async function resetConfigs({ wipePagamento = false } = {}) {
  const current = readConfig()
  const next = {
    whatsapp: '',
    nomeEstudio: 'Vinicius Rodrigues Fotografia',
    instagram: '',
    cpf: '',
    cnpj: '',
    razaoSocial: '',
    localizacao: '',
  }
  if (!wipePagamento && current.pagamento) next.pagamento = current.pagamento
  writeConfig(next)
  writeJsonSafe('contatos.json', [])
  return { wipedPagamento: !!wipePagamento }
}

async function resetTudo({ actor, wipePagamento = false } = {}) {
  // Order matters: events first (uses pedidos to compute preservation set),
  // then pedidos, clients, configs.
  const eventResult = await resetEventos()
  const pedidoResult = await resetPedidos()
  const cartResult = await resetCarrinhos()
  const clientResult = await resetClientes(actor)
  const configResult = await resetConfigs({ wipePagamento })
  return { eventResult, pedidoResult, cartResult, clientResult, configResult }
}

export async function POST(request) {
  let auth
  try {
    auth = await requireAuth({ requireAdmin: true })
    const blocked = gateSuperAdmin(auth)
    if (blocked) return blocked

    const body = await request.json().catch(() => ({}))
    const type = String(body?.type || '').trim()
    const confirmation = String(body?.confirmation || '').trim().toUpperCase()
    const wipePagamento = !!body?.wipePagamento

    const def = RESET_TYPES[type]
    if (!def) {
      return NextResponse.json({ error: 'Tipo de reset inválido.' }, { status: 400 })
    }
    if (confirmation !== def.phrase) {
      return NextResponse.json({
        error: `Confirmação inválida. Digite exatamente: ${def.phrase}`,
      }, { status: 400 })
    }

    // Always create a full auto-backup first. This is non-negotiable.
    const backup = await createBackup({
      scopes: ['data'],
      label: `auto-pre-reset-${type}`,
      reason: `Backup automático antes de reset: ${def.label}`,
      actor: auth.client || auth.payload,
    })

    let result
    try {
      switch (type) {
        case 'pedidos': result = await resetPedidos(); break
        case 'carrinhos': result = await resetCarrinhos(); break
        case 'eventos': result = await resetEventos(); break
        case 'clientes': result = await resetClientes(auth.client || auth.payload); break
        case 'configs': result = await resetConfigs({ wipePagamento }); break
        case 'tudo': result = await resetTudo({ actor: auth.client || auth.payload, wipePagamento }); break
        default: throw new Error('Tipo desconhecido')
      }
    } catch (resetError) {
      // Reset failed mid-flight. The backup is preserved as the recovery path.
      appendAuditLog({
        action: 'reset.executed',
        status: 'failure',
        actor: auth.client || auth.payload,
        target: { type: 'site', id: type, label: def.label },
        details: { error: resetError?.message || String(resetError), preBackupId: backup.id },
        request,
      })
      return NextResponse.json({
        error: `Reset falhou: ${resetError?.message || 'desconhecido'}. Backup ${backup.id} disponível para restauração.`,
        preBackupId: backup.id,
      }, { status: 500 })
    }

    appendAuditLog({
      action: 'reset.executed',
      status: 'success',
      actor: auth.client || auth.payload,
      target: { type: 'site', id: type, label: def.label },
      details: { type, result, preBackupId: backup.id, wipePagamento },
      request,
    })

    return NextResponse.json({ ok: true, type, result, preBackupId: backup.id })
  } catch (error) {
    console.error('Erro em /api/admin/reset:', error)
    appendAuditLog({
      action: 'reset.error',
      status: 'failure',
      actor: auth?.client || auth?.payload || null,
      details: { error: error?.message || String(error) },
      request,
    })
    return NextResponse.json({ error: 'Erro inesperado: ' + (error?.message || 'desconhecido') }, { status: 500 })
  }
}

export async function GET() {
  try {
    const auth = await requireAuth({ requireFullAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    // Returns the reset type definitions so the UI can render phrases consistently.
    return NextResponse.json({
      types: Object.fromEntries(Object.entries(RESET_TYPES).map(([k, v]) => [k, v])),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Erro' }, { status: 500 })
  }
}
