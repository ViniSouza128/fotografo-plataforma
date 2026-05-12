import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import {
  listWatermarkAssets,
  removeWatermarkAsset,
  saveWatermarkAsset,
  setAssetOrientation,
} from '@/lib/watermark'
import { appendAuditLog } from '@/lib/auditLog'

export async function GET() {
  try {
    return NextResponse.json({ assets: listWatermarkAssets() })
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao listar marcas d\'água.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const formData = await request.formData()
    const file = formData.get('file')
    const name = formData.get('name')
    const orientation = formData.get('orientation')

    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    if (file.type !== 'image/png') return NextResponse.json({ error: 'A marca d\'água deve ser PNG' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const asset = saveWatermarkAsset(buffer, name ? String(name) : null, orientation ? String(orientation) : null)
    appendAuditLog({
      action: 'watermark.asset_saved',
      actor: auth.client || auth.payload,
      target: { type: 'watermark_asset', id: asset.id, label: asset.name || asset.filename },
      details: { name: asset.name || null, filename: asset.filename || null, orientation: asset.orientation, size: file.size || null },
      request,
    })

    return NextResponse.json({
      success: true,
      asset,
      assets: listWatermarkAssets(),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao salvar marca d\'água' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const body = await request.json().catch(() => ({}))
    const id = String(body?.id || '').trim()
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

    const orientation = setAssetOrientation(id, body?.orientation)
    appendAuditLog({
      action: 'watermark.asset_meta_updated',
      actor: auth.client || auth.payload,
      target: { type: 'watermark_asset', id, label: id },
      details: { orientation },
      request,
    })
    return NextResponse.json({ id, orientation, assets: listWatermarkAssets() })
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao atualizar metadado' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

    const removed = removeWatermarkAsset(id)
    appendAuditLog({
      action: 'watermark.asset_deleted',
      actor: auth.client || auth.payload,
      target: { type: 'watermark_asset', id, label: removed?.name || removed?.filename || null },
      details: { removed: !!removed },
      request,
    })
    return NextResponse.json({
      removed,
      assets: listWatermarkAssets(),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao remover marca d\'água' }, { status: 500 })
  }
}
