const GUEST_ORDERS_STORAGE_KEY = 'guest_order_access_v1'
const MAX_GUEST_ORDERS = 12

function safeParse(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function sanitizeOrderAccessEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const pedidoId = String(entry.pedidoId || '').trim()
  const token = String(entry.token || '').trim()
  if (!pedidoId || !token) return null

  return {
    pedidoId,
    token,
    status: String(entry.status || '').trim() || 'pago',
    createdAt: String(entry.createdAt || '').trim() || new Date().toISOString(),
    updatedAt: String(entry.updatedAt || '').trim() || new Date().toISOString(),
  }
}

export function readGuestOrderAccessList() {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(GUEST_ORDERS_STORAGE_KEY)
  const list = safeParse(raw, [])
  if (!Array.isArray(list)) return []
  return list
    .map(sanitizeOrderAccessEntry)
    .filter(Boolean)
    .slice(0, MAX_GUEST_ORDERS)
}

export function hasGuestOrderAccess() {
  return readGuestOrderAccessList().length > 0
}

export function saveGuestApprovedOrderAccess({ pedidoId, token, status = 'pago' }) {
  if (typeof window === 'undefined') return
  const entry = sanitizeOrderAccessEntry({
    pedidoId,
    token,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  if (!entry) return

  const current = readGuestOrderAccessList()
  const filtered = current.filter(item => item.pedidoId !== entry.pedidoId)
  const next = [entry, ...filtered].slice(0, MAX_GUEST_ORDERS)
  window.localStorage.setItem(GUEST_ORDERS_STORAGE_KEY, JSON.stringify(next))
}

export function removeGuestOrderAccess(pedidoId) {
  if (typeof window === 'undefined') return
  const target = String(pedidoId || '').trim()
  if (!target) return
  const current = readGuestOrderAccessList()
  const next = current.filter(entry => entry.pedidoId !== target)
  window.localStorage.setItem(GUEST_ORDERS_STORAGE_KEY, JSON.stringify(next))
}
