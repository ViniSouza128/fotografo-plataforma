export class AdminFetchError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'AdminFetchError'
    this.status = details.status || 0
    this.code = details.code || null
    this.payload = details.payload || null
    this.url = details.url || ''
    this.expected = details.expected || null
  }
}

export function clearAdminSession({ emit = true } = {}) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem('adminLogado')
    window.localStorage.removeItem('clienteLogado')
  } catch {}
  if (emit) {
    try { window.dispatchEvent(new Event('authUpdated')) } catch {}
  }
}

export function getCurrentReturnTo(fallback = '/admin') {
  if (typeof window === 'undefined') return fallback
  return `${window.location.pathname || fallback}${window.location.search || ''}`
}

export function buildAdminLoginHref(returnTo = getCurrentReturnTo()) {
  return `/login?returnTo=${encodeURIComponent(returnTo || '/admin')}`
}

export function redirectToAdminLogin(returnTo = getCurrentReturnTo()) {
  if (typeof window === 'undefined') return
  window.location.assign(buildAdminLoginHref(returnTo))
}

export function isAdminAuthError(error) {
  return error?.status === 401 || error?.status === 403
}

export function isAdminUnauthorizedError(error) {
  return error?.status === 401
}

export function getStoredAdminClient() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem('clienteLogado')
    const client = raw ? JSON.parse(raw) : null
    return client && client.id && client.isAdmin ? client : null
  } catch {
    return null
  }
}

export function syncAdminSession(client) {
  if (typeof window === 'undefined') return
  if (!client?.id || !client?.isAdmin) {
    clearAdminSession()
    return
  }
  try {
    window.localStorage.setItem('adminLogado', 'true')
    window.localStorage.setItem('clienteLogado', JSON.stringify({
      ...client,
      isAdmin: !!client.isAdmin,
      isSuperAdmin: !!client.isSuperAdmin,
      isColaborador: !!client.isColaborador,
    }))
  } catch {}
  try { window.dispatchEvent(new Event('authUpdated')) } catch {}
}

async function readJsonSafe(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function normalizeFetchOptions(options = {}) {
  const { expected, validate, ...fetchOptions } = options
  return {
    expected,
    validate,
    fetchOptions: {
      credentials: 'include',
      ...fetchOptions,
      headers: {
        ...(fetchOptions.headers || {}),
      },
    },
  }
}

export async function adminFetchJson(url, options = {}) {
  const { expected = 'json', validate, fetchOptions } = normalizeFetchOptions(options)
  const response = await fetch(url, fetchOptions)
  const payload = await readJsonSafe(response)

  if (!response.ok) {
    throw new AdminFetchError(
      payload?.error || payload?.message || `Erro HTTP ${response.status}`,
      {
        status: response.status,
        code: payload?.code || null,
        payload,
        url,
        expected,
      }
    )
  }

  if (typeof validate === 'function' && !validate(payload)) {
    throw new AdminFetchError('Resposta inesperada do servidor.', {
      status: response.status,
      code: 'invalid_payload',
      payload,
      url,
      expected,
    })
  }

  return payload
}

export function adminFetchArray(url, options = {}) {
  return adminFetchJson(url, {
    ...options,
    expected: 'array',
    validate: Array.isArray,
  })
}

export function adminFetchObject(url, options = {}) {
  return adminFetchJson(url, {
    ...options,
    expected: 'object',
    validate: value => !!value && typeof value === 'object' && !Array.isArray(value),
  })
}

export async function fetchAdminSession() {
  const data = await adminFetchObject('/api/auth/me')
  const client = data?.client
  if (!client?.id || !client?.isAdmin) {
    clearAdminSession()
    throw new AdminFetchError('Sessao admin invalida.', {
      status: 403,
      code: 'admin_only',
      payload: data,
      url: '/api/auth/me',
      expected: 'admin_client',
    })
  }
  syncAdminSession(client)
  return client
}
