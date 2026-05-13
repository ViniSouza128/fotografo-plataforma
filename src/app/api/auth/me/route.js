import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireAuth({ allowMustChangePassword: true })
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      )
    }

    const { client } = auth
    const { senha, ...clientData } = client

    return NextResponse.json({ client: clientData }, { status: 200 })
  } catch (error) {
    console.error('Erro ao verificar autenticação:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}
