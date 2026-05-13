export const SUPER_ADMIN_ONLY_PLACEHOLDER = 'Only to super admin.'

export function isReadOnlyAdmin(client) {
  return !!(client?.isAdmin && !client?.isSuperAdmin && !client?.isColaborador)
}

export function maskSuperAdminValue(isSuperAdmin, value, fallback = SUPER_ADMIN_ONLY_PLACEHOLDER) {
  if (!isSuperAdmin) return fallback
  if (value === null || value === undefined || value === '') return ''
  return value
}
