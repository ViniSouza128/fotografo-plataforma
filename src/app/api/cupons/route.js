// src/app/api/cupons/route.js
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import {
  listCuponsForAdmin,
  appendCupom,
  updateCupom,
  deleteCupom,
} from '@/lib/cupons'
import { appendAuditLog } from '@/lib/auditLog'

export async function GET() {
  const auth = await requireAuth({ requireFullAdmin: true })
  if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
  return NextResponse.json(listCuponsForAdmin())
}

export async function POST(request) {
  const auth = await requireAuth({ requireFullAdmin: true })
  if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
  try {
    const body = await request.json()
    const novo = appendCupom(body, auth.client || auth.payload)
    appendAuditLog({
      action: 'cupom.created',
      actor: auth.client || auth.payload,
      target: { type: 'cupom', id: novo.id, label: novo.codigo },
      details: { tipo: novo.tipo, valor: novo.valor, albuns: novo.albuns?.length || 0 },
      request,
    })
    return NextResponse.json(novo, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Erro ao criar cupom.' }, { status: 400 })
  }
}

export async function PATCH(request) {
  const auth = await requireAuth({ requireFullAdmin: true })
  if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
  try {
    const body = await request.json()
    if (!body?.id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })
    const updated = updateCupom(body.id, body)
    appendAuditLog({
      action: 'cupom.updated',
      actor: auth.client || auth.payload,
      target: { type: 'cupom', id: updated.id, label: updated.codigo },
      details: { ativo: updated.ativo, tipo: updated.tipo, valor: updated.valor },
      request,
    })
    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Erro ao atualizar cupom.' }, { status: 400 })
  }
}

export async function DELETE(request) {
  const auth = await requireAuth({ requireFullAdmin: true })
  if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })
  const ok = deleteCupom(id)
  if (!ok) return NextResponse.json({ error: 'Cupom não encontrado.' }, { status: 404 })
  appendAuditLog({
    action: 'cupom.deleted',
    actor: auth.client || auth.payload,
    target: { type: 'cupom', id },
    request,
  })
  return NextResponse.json({ ok: true })
}
