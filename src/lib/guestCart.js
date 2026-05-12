const CART_STORAGE_KEY = 'carrinho'
const GUEST_CART_ID_KEY = 'guest_cart_id'
const GUEST_CART_META_KEY = 'guest_cart_meta'
const GUEST_CART_COOKIE = 'guest_cart_id'
const GUEST_CART_PREFIX = 'guest_cart_items_'
const GUEST_CART_TTL_MS = 1000 * 60 * 60 * 24 * 30

function safeParse(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function setCookie(name, value, expiresAt) {
  if (typeof document === 'undefined') return
  const expires = new Date(expiresAt).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; expires=${expires}; SameSite=Lax`
}

function getCookie(name) {
  if (typeof document === 'undefined') return ''
  const match = document.cookie
    .split('; ')
    .find(part => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

function removeCookie(name) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
}

function createGuestCartId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeCartItems(items) {
  return Array.isArray(items) ? items : []
}

export function getOrCreateGuestCartId() {
  if (typeof window === 'undefined') return ''
  const localId = window.localStorage.getItem(GUEST_CART_ID_KEY)
  const cookieId = getCookie(GUEST_CART_COOKIE)
  const id = localId || cookieId || createGuestCartId()
  window.localStorage.setItem(GUEST_CART_ID_KEY, id)
  return id
}

function getGuestCartStorageKey(guestCartId) {
  return `${GUEST_CART_PREFIX}${guestCartId}`
}

export function persistGuestCart(items) {
  if (typeof window === 'undefined') return
  const cartItems = normalizeCartItems(items)
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems))

  if (cartItems.length === 0) {
    clearGuestCart()
    return
  }

  const guestCartId = getOrCreateGuestCartId()
  const expiresAt = Date.now() + GUEST_CART_TTL_MS

  window.localStorage.setItem(getGuestCartStorageKey(guestCartId), JSON.stringify(cartItems))
  window.localStorage.setItem(GUEST_CART_META_KEY, JSON.stringify({
    guestCartId,
    expiresAt,
    updatedAt: new Date().toISOString(),
  }))
  setCookie(GUEST_CART_COOKIE, guestCartId, expiresAt)
}

export function cleanupExpiredGuestCart() {
  if (typeof window === 'undefined') return
  const meta = safeParse(window.localStorage.getItem(GUEST_CART_META_KEY), null)
  if (!meta || !meta.guestCartId) return
  if (!meta.expiresAt || Number(meta.expiresAt) > Date.now()) return

  window.localStorage.removeItem(getGuestCartStorageKey(meta.guestCartId))
  window.localStorage.removeItem(GUEST_CART_META_KEY)
  window.localStorage.removeItem(GUEST_CART_ID_KEY)
  removeCookie(GUEST_CART_COOKIE)
}

export function readGuestCart() {
  if (typeof window === 'undefined') return []
  cleanupExpiredGuestCart()

  const localCart = normalizeCartItems(safeParse(window.localStorage.getItem(CART_STORAGE_KEY), []))
  if (localCart.length > 0) {
    persistGuestCart(localCart)
    return localCart
  }

  const guestCartId = window.localStorage.getItem(GUEST_CART_ID_KEY) || getCookie(GUEST_CART_COOKIE)
  if (!guestCartId) return []

  const backupKey = getGuestCartStorageKey(guestCartId)
  const backupCart = normalizeCartItems(safeParse(window.localStorage.getItem(backupKey), []))
  if (backupCart.length === 0) return []

  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(backupCart))
  window.localStorage.setItem(GUEST_CART_ID_KEY, guestCartId)
  return backupCart
}

export function clearGuestCart() {
  if (typeof window === 'undefined') return
  const guestCartId = window.localStorage.getItem(GUEST_CART_ID_KEY) || getCookie(GUEST_CART_COOKIE)
  window.localStorage.removeItem(CART_STORAGE_KEY)
  window.localStorage.removeItem(GUEST_CART_META_KEY)
  if (guestCartId) {
    window.localStorage.removeItem(getGuestCartStorageKey(guestCartId))
  }
  window.localStorage.removeItem(GUEST_CART_ID_KEY)
  removeCookie(GUEST_CART_COOKIE)
}

