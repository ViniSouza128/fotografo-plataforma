import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { computeAnalytics } from '@/lib/analytics'

export async function GET(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate') || null
    const endDate = searchParams.get('endDate') || null
    const colaboradorId = auth.payload.isColaborador ? auth.payload.id : null

    const data = computeAnalytics({ startDate, endDate, colaboradorId })
    return NextResponse.json(data)
  } catch (error) {
    console.error('Erro em /api/estatisticas:', error)
    return NextResponse.json({ error: 'Erro ao calcular estatísticas' }, { status: 500 })
  }
}
