import { cookies } from 'next/headers'
import { validateAuthToken } from './auth'

export async function requireAuth(options = {}) {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  return validateAuthToken(token, options)
}
