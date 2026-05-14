import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import {
  deleteWatermark,
  listWatermarks,
  saveWatermark,
  watermarkExists,
  getWatermarkPublicUrl,
} from '../../../lib/watermark'
import { appendAuditLog } from '@/lib/auditLog'
import {
  assertCanUpload,
  isStorageQuotaExceededError,
  toStorageQuotaErrorPayload,
} from '@/lib/storageQuota'

function normalizeVariant(value) {
  const safe = String(value || 'global').trim().toLowerCase()
  if (['global', 'grid', 'thumbs', 'mini', 'covers', 'video'].includes(safe)) return safe
  return null
}

export async function GET() {
  const watermarks = listWatermarks()
  return NextResponse.json({
    exists: watermarkExists('global'),
    url: watermarkExists('global') ? getWatermarkPublicUrl('global') : null,
    watermarks,
  })
}

export async function POST(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const { searchParams } = new URL(request.url)
    const variant = normalizeVariant(searchParams.get('variant'))
    if (!variant) return NextResponse.json({ error: 'variant_invalido' }, { status: 400 })

    const formData = await request.formData()
    const file = formData.get('file')

    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    if (file.type !== 'image/png') return NextResponse.json({ error: 'A marca d\'agua deve ser PNG' }, { status: 400 })

    assertCanUpload({ kind: 'photo', incomingBytes: Number(file.size) || 0 })

    const buffer = Buffer.from(await file.arrayBuffer())
    saveWatermark(buffer, variant)
    appendAuditLog({
      action: 'watermark.saved',
      actor: auth.client || auth.payload,
      target: { type: 'watermark', id: variant, label: variant },
      details: { variant, filename: file.name || null, size: file.size || null },
      request,
    })

    return NextResponse.json({
      success: true,
      variant,
      url: getWatermarkPublicUrl(variant),
      watermarks: listWatermarks(),
    })
  } catch (error) {
    if (isStorageQuotaExceededError(error)) {
      return NextResponse.json(toStorageQuotaErrorPayload(error), { status: error.status || 507 })
    }
    return NextResponse.json({ error: 'Erro ao salvar arquivo' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const { searchParams } = new URL(request.url)
    const variant = normalizeVariant(searchParams.get('variant'))
    if (!variant) return NextResponse.json({ error: 'variant_invalido' }, { status: 400 })

    deleteWatermark(variant)
    appendAuditLog({
      action: 'watermark.deleted',
      actor: auth.client || auth.payload,
      target: { type: 'watermark', id: variant, label: variant },
      details: { variant },
      request,
    })
    return NextResponse.json({ success: true, watermarks: listWatermarks() })
  } catch {
    return NextResponse.json({ error: 'Erro ao remover marca d\'agua' }, { status: 500 })
  }
}
