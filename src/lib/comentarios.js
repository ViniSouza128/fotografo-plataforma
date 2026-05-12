import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { useDb } from './db/router'
import { comentariosRepo } from './db/repositories'

const FILE_PATH = path.join(process.cwd(), 'data', 'comentarios.json')
const LIMIT_10_SECONDS_MS = 10 * 1000
const LIMIT_1_MINUTE_MS = 60 * 1000
const LIMIT_1_HOUR_MS = 60 * 60 * 1000

export const MAX_COMMENT_LENGTH = 1000
export const COMMENT_RATE_LIMITS = {
  per10Seconds: 1,
  perMinute: 3,
  perHour: 30,
}

function uniqStrings(value) {
  const items = Array.isArray(value) ? value : []
  const out = []
  const seen = new Set()
  for (const item of items) {
    if (typeof item !== 'string') continue
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

function toIsoOrNull(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizeHistoryEdit(rawEntry) {
  return {
    id: rawEntry?.id || crypto.randomUUID(),
    editadoEm: toIsoOrNull(rawEntry?.editadoEm) || new Date().toISOString(),
    editadoPorId: rawEntry?.editadoPorId || null,
    editadoPorNome: rawEntry?.editadoPorNome || 'Usuario',
    editadoPorAdmin: rawEntry?.editadoPorAdmin === true,
    textoAnterior: typeof rawEntry?.textoAnterior === 'string' ? rawEntry.textoAnterior : '',
    textoNovo: typeof rawEntry?.textoNovo === 'string' ? rawEntry.textoNovo : '',
  }
}

function normalizeHistoryOmissao(rawEntry) {
  return {
    id: rawEntry?.id || crypto.randomUUID(),
    acao: rawEntry?.acao === 'restore' ? 'restore' : 'omit',
    feitoEm: toIsoOrNull(rawEntry?.feitoEm) || new Date().toISOString(),
    feitoPorId: rawEntry?.feitoPorId || null,
    feitoPorNome: rawEntry?.feitoPorNome || 'Usuario',
    feitoPorAdmin: rawEntry?.feitoPorAdmin === true,
  }
}

function normalizeLegacyVisibility(raw, visivel, criadoEm, atualizadoEm) {
  // Compatibilidade: comentarios antigos ocultos pelo fluxo legado eram sempre moderados por admin.
  if (visivel) {
    return {
      omitidoEm: null,
      omitidoPorId: null,
      omitidoPorNome: null,
      omitidoPorAdmin: false,
    }
  }

  const omitidoEm = toIsoOrNull(raw?.omitidoEm) || atualizadoEm || criadoEm
  const temAutorExplicitado = raw?.omitidoPorId || raw?.omitidoPorNome || typeof raw?.omitidoPorAdmin === 'boolean'

  return {
    omitidoEm,
    omitidoPorId: raw?.omitidoPorId || null,
    omitidoPorNome: raw?.omitidoPorNome || (temAutorExplicitado ? null : 'Administracao'),
    omitidoPorAdmin: typeof raw?.omitidoPorAdmin === 'boolean' ? raw.omitidoPorAdmin : true,
  }
}

export function normalizePasta(value) {
  return (value || '').trim().toLowerCase()
}

export function normalizeComentario(raw) {
  const criadoEm = toIsoOrNull(raw?.criadoEm) || toIsoOrNull(raw?.createdAt) || new Date().toISOString()
  const atualizadoEm = toIsoOrNull(raw?.atualizadoEm)
  const visivel = raw?.visivel !== false
  const omissaoAtual = normalizeLegacyVisibility(raw, visivel, criadoEm, atualizadoEm)

  return {
    ...raw,
    id: raw?.id || crypto.randomUUID(),
    clientId: raw?.clientId || null,
    clienteNome: raw?.clienteNome || 'Cliente',
    badgeRole: raw?.badgeRole || null,
    photoId: raw?.photoId || null,
    eventId: raw?.eventId || null,
    pasta: raw?.pasta?.trim?.() || null,
    parentId: raw?.parentId || null,
    texto: typeof raw?.texto === 'string' ? raw.texto : '',
    curtidasPor: uniqStrings(raw?.curtidasPor),
    visivel,
    criadoEm,
    atualizadoEm,
    editadoEm: toIsoOrNull(raw?.editadoEm),
    editadoPorId: raw?.editadoPorId || null,
    editadoPorNome: raw?.editadoPorNome || null,
    editadoPorAdmin: raw?.editadoPorAdmin === true,
    bloqueadoEdicaoAutor: raw?.bloqueadoEdicaoAutor === true,
    historicoEdicoes: Array.isArray(raw?.historicoEdicoes)
      ? raw.historicoEdicoes.map(normalizeHistoryEdit)
      : [],
    ...omissaoAtual,
    restauradoEm: toIsoOrNull(raw?.restauradoEm),
    restauradoPorId: raw?.restauradoPorId || null,
    restauradoPorNome: raw?.restauradoPorNome || null,
    restauradoPorAdmin: raw?.restauradoPorAdmin === true,
    historicoOmissoes: Array.isArray(raw?.historicoOmissoes)
      ? raw.historicoOmissoes.map(normalizeHistoryOmissao)
      : [],
  }
}

export function readComentarios() {
  if (useDb()) {
    const rows = comentariosRepo.readAll()
    return rows.map(normalizeComentario)
  }
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, '[]')
    return []
  }
  const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'))
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeComentario)
}

export function writeComentarios(items) {
  const sanitized = Array.isArray(items) ? items.map(normalizeComentario) : []
  if (useDb()) { comentariosRepo.writeAll(sanitized); return }
  fs.writeFileSync(FILE_PATH, JSON.stringify(sanitized, null, 2), 'utf-8')
}

export function applyScopeFilter(comentarios, { photoId, eventId, clientId, pasta, allowAll = false }) {
  if (photoId) return comentarios.filter(c => c.photoId === photoId)

  if (eventId) {
    let filtrados = comentarios.filter(c => c.eventId === eventId)
    if (pasta === '__album__') {
      filtrados = filtrados.filter(c => !c.pasta || c.pasta.trim() === '')
    } else if (pasta) {
      const pastaNorm = normalizePasta(pasta)
      filtrados = filtrados.filter(c => normalizePasta(c.pasta) === pastaNorm)
    }
    return filtrados
  }

  if (clientId) return comentarios.filter(c => c.clientId === clientId)
  if (allowAll) return comentarios
  return null
}

export function buildComentarioTree(comentarios, {
  dropOrphans = false,
  preserveRootOrder = false,
} = {}) {
  const nodes = comentarios.map(item => ({ ...item, respostas: [] }))
  const byId = new Map(nodes.map(node => [node.id, node]))
  const roots = []

  nodes.forEach(node => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId).respostas.push(node)
      return
    }
    if (!node.parentId || !dropOrphans) {
      roots.push(node)
    }
  })

  // Por compatibilidade, quando ninguem ordena antes, mantemos o default
  // de "mais recentes primeiro" para raizes.
  //
  // Quando o backend ja aplicou uma ordenacao (ex: "mais curtidos"),
  // ele pode pedir para preservar a ordem original.
  if (!preserveRootOrder) {
    roots.sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0))
  }
  roots.forEach(root => {
    root.respostas.sort((a, b) => new Date(a.criadoEm || 0) - new Date(b.criadoEm || 0))
  })
  return roots
}

export function checkCommentRateLimit(comentarios, clientId, nowDate = new Date()) {
  const now = nowDate.getTime()
  const timestamps = comentarios
    .filter(c => c.clientId === clientId)
    .map(c => new Date(c.criadoEm || 0).getTime())
    .filter(t => !Number.isNaN(t))

  const within10Seconds = timestamps.filter(t => now - t < LIMIT_10_SECONDS_MS)
  if (within10Seconds.length >= COMMENT_RATE_LIMITS.per10Seconds) {
    const latest = Math.max(...within10Seconds)
    const retryAfterMs = LIMIT_10_SECONDS_MS - (now - latest)
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      error: 'Voce acabou de comentar. Aguarde alguns segundos para enviar novamente.',
      code: 'COMMENT_RATE_LIMIT_10S',
    }
  }

  const within1Minute = timestamps.filter(t => now - t < LIMIT_1_MINUTE_MS)
  if (within1Minute.length >= COMMENT_RATE_LIMITS.perMinute) {
    const retryAfterMs = Math.min(...within1Minute) + LIMIT_1_MINUTE_MS - now
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      error: 'Voce atingiu o limite de 3 comentarios por minuto. Tente novamente em instantes.',
      code: 'COMMENT_RATE_LIMIT_1M',
    }
  }

  const within1Hour = timestamps.filter(t => now - t < LIMIT_1_HOUR_MS)
  if (within1Hour.length >= COMMENT_RATE_LIMITS.perHour) {
    const retryAfterMs = Math.min(...within1Hour) + LIMIT_1_HOUR_MS - now
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      error: 'Voce atingiu o limite de 30 comentarios por hora. Tente novamente mais tarde.',
      code: 'COMMENT_RATE_LIMIT_1H',
    }
  }

  return { allowed: true }
}
