import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ ok: true }, { status: 200 })

  // Clear auth cookie
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 0,
  })

  return response
}
