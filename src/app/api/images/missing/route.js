import { NextResponse } from 'next/server'
import { getMissingDerivativesJobState, startMissingDerivativesJob } from '@/lib/missingDerivativesJob'
import { requireAuth } from '@/lib/apiAuth'

export async function GET() {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    return NextResponse.json(getMissingDerivativesJobState())
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'erro' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    const result = startMissingDerivativesJob()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'erro' }, { status: 500 })
  }
}
