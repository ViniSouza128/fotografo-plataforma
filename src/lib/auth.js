import crypto from 'crypto'
import { findClientById } from './clients'

const SECRET = process.env.AUTH_SECRET || 'fotografo-plataforma-secret-key-2024'
const DEFAULT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const DOWNLOAD_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${hash}:${salt}`
}

export function verifyPassword(password, stored) {
  const [hash, salt] = stored.split(':')
  const testHash = crypto.scryptSync(password, salt, 64).toString('hex')
  return hash === testHash
}

export function createToken(payload, options = {}) {
  const expiresInMs = Number(options.expiresInMs)
  const ttl = Number.isFinite(expiresInMs) && expiresInMs > 0
    ? expiresInMs
    : DEFAULT_TOKEN_TTL_MS
  const data = Buffer.from(JSON.stringify({
    ...payload,
    exp: Date.now() + ttl,
  })).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function createDownloadToken(pedidoId) {
  if (!pedidoId) return null
  return createToken(
    {
      purpose: 'photo_download',
      pedidoId,
    },
    { expiresInMs: DOWNLOAD_TOKEN_TTL_MS }
  )
}

export function verifyDownloadToken(token, pedidoId) {
  const payload = verifyToken(token)
  if (!payload) return null
  if (payload.purpose !== 'photo_download') return null
  if (!payload.pedidoId || payload.pedidoId !== pedidoId) return null
  return payload
}

export function verifyToken(token) {
  if (!token) return null
  const [data, sig] = token.split('.')
  if (!data || !sig) return null
  const expectedSig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
  if (sig !== expectedSig) return null
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function validateAuthToken(token, { requireAdmin = false, requireFullAdmin = false, requireSuperAdmin = false, allowMustChangePassword = false } = {}) {
  const payload = verifyToken(token)
  if (!payload?.id) {
    return { error: 'Não autorizado.', status: 401, code: 'unauthorized' }
  }

  const client = findClientById(payload.id)
  if (!client) {
    return { error: 'Usuário não encontrado.', status: 401, code: 'user_not_found' }
  }

  const tokenVersion = Number(payload.sessionVersion ?? 0)
  const currentVersion = Number(client.sessionVersion ?? 0)
  if (tokenVersion !== currentVersion) {
    return { error: 'Sessão expirada. Faça login novamente.', status: 401, code: 'session_invalid' }
  }

  if (client.ativo === false) {
    return { error: 'Conta desativada.', status: 403, code: 'account_disabled' }
  }

  if (client.mustChangePassword && !allowMustChangePassword) {
    return { error: 'Troca de senha obrigatória.', status: 403, code: 'must_change_password', client, payload }
  }

  const isAdmin = !!client.isAdmin
  const isSuperAdmin = !!client.isSuperAdmin
  const isColaborador = !!client.isColaborador && isAdmin
  if (requireAdmin && !isAdmin) {
    return { error: 'Não autorizado.', status: 403, code: 'admin_only' }
  }
  if (requireFullAdmin && (!isAdmin || isColaborador)) {
    return { error: 'Acesso restrito a administradores.', status: 403, code: 'full_admin_only' }
  }
  if (requireSuperAdmin && !isSuperAdmin) {
    return { error: 'Acesso restrito a super admin.', status: 403, code: 'super_admin_only' }
  }

  return {
    payload: { ...payload, isAdmin, isSuperAdmin, isColaborador },
    client,
  }
}

export function generateRandomPassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
