// src/lib/notificacoes.js
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { DATA_DIR, ensureRuntimeDirs } from './runtimePaths'

const NOTIF_PATH = path.join(DATA_DIR, 'notificacoes.json')
const MAX_TOTAL = 2000   // hard cap; prune oldest when exceeded
const MAX_PER_DEST = 200 // per-destinatario cap

export const TIPOS = {
  novo_pedido: { label: 'Novo pedido', icon: '🧾' },
  pagamento_confirmado: { label: 'Pagamento confirmado', icon: '✅' },
  comentario: { label: 'Novo comentário', icon: '💬' },
  resposta: { label: 'Resposta', icon: '↩️' },
  remocao: { label: 'Remoção solicitada', icon: '🚫' },
  reembolso: { label: 'Reembolso', icon: '💰' },
  nota_publica: { label: 'Nota do fotógrafo', icon: '📝' },
}

function ensureDir() {
  ensureRuntimeDirs()
}

export function readNotificacoes() {
  try {
    if (!fs.existsSync(NOTIF_PATH)) return []
    const raw = fs.readFileSync(NOTIF_PATH, 'utf-8')
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function writeNotificacoes(data) {
  ensureDir()
  fs.writeFileSync(NOTIF_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function appendNotificacao({ tipo, destinatario, titulo, mensagem, link = null }) {
  try {
    let all = readNotificacoes()
    const nova = {
      id: crypto.randomUUID(),
      tipo: String(tipo || 'info'),
      destinatario: String(destinatario || 'admin'),
      titulo: String(titulo || '').slice(0, 200),
      mensagem: String(mensagem || '').slice(0, 500),
      link: link ? String(link).slice(0, 300) : null,
      lida: false,
      criadaEm: new Date().toISOString(),
    }
    all.push(nova)

    // Per-destinatario cap
    const byDest = all.filter(n => n.destinatario === nova.destinatario)
    if (byDest.length > MAX_PER_DEST) {
      byDest.sort((a, b) => new Date(a.criadaEm) - new Date(b.criadaEm))
      const excess = new Set(byDest.slice(0, byDest.length - MAX_PER_DEST).map(n => n.id))
      all = all.filter(n => !excess.has(n.id))
    }

    // Global cap
    if (all.length > MAX_TOTAL) {
      all.sort((a, b) => new Date(a.criadaEm) - new Date(b.criadaEm))
      all = all.slice(all.length - MAX_TOTAL)
    }

    writeNotificacoes(all)
    return nova
  } catch (err) {
    console.error('[notificacoes] Erro ao salvar:', err.message)
    return null
  }
}

export function contarNaoLidas(destinatario) {
  try {
    return readNotificacoes().filter(n => n.destinatario === destinatario && !n.lida).length
  } catch { return 0 }
}

export function listarNotificacoes(destinatario, { limit = 50 } = {}) {
  try {
    return readNotificacoes()
      .filter(n => n.destinatario === destinatario)
      .sort((a, b) => new Date(b.criadaEm) - new Date(a.criadaEm))
      .slice(0, Math.min(limit, 200))
  } catch { return [] }
}

export function marcarLida(id, destinatario) {
  try {
    const all = readNotificacoes()
    const idx = all.findIndex(n => n.id === id && n.destinatario === destinatario)
    if (idx === -1) return false
    all[idx].lida = true
    writeNotificacoes(all)
    return true
  } catch { return false }
}

export function marcarTodasLidas(destinatario) {
  try {
    const all = readNotificacoes()
    let changed = false
    all.forEach(n => {
      if (n.destinatario === destinatario && !n.lida) { n.lida = true; changed = true }
    })
    if (changed) writeNotificacoes(all)
    return true
  } catch { return false }
}

export function deletarNotificacao(id, destinatario) {
  try {
    const all = readNotificacoes()
    const next = all.filter(n => !(n.id === id && n.destinatario === destinatario))
    if (next.length === all.length) return false
    writeNotificacoes(next)
    return true
  } catch { return false }
}
