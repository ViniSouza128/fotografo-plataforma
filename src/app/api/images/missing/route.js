import { NextResponse } from 'next/server'
import { getMissingDerivativesJobState, startMissingDerivativesJob } from '@/lib/missingDerivativesJob'
import { requireAuth } from '@/lib/apiAuth'
import {
  assertCanUpload,
  isStorageQuotaExceededError,
  toStorageQuotaErrorPayload,
} from '@/lib/storageQuota'

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
    const auth = await requireAuth({ requireSuperAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    assertCanUpload({ kind: 'photo', incomingBytes: 0 })
    const result = startMissingDerivativesJob()
    return NextResponse.json(result)
  } catch (error) {
    if (isStorageQuotaExceededError(error)) {
      return NextResponse.json(toStorageQuotaErrorPayload(error), { status: error.status || 507 })
    }
    return NextResponse.json({ error: error?.message || 'erro' }, { status: 500 })
  }
}
