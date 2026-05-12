// src/app/api/colaboradores/route.js
// Super-admin only: gestão de colaboradores (papel admin parcial).
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireAuth } from '@/lib/apiAuth'
import {
  readClients,
  writeClients,
  normalizeEmail,
  normalizeWhatsapp,
} from '@/lib/clients'
import { hashPassword, generateRandomPassword } from '@/lib/auth'
import { listColaboradores, getColaboradorSummary } from '@/lib/colaborador'
import { appendAuditLog } from '@/lib/auditLog'

export async function GET(request) {
  try {
    const auth = await requireAuth({ requireFullAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    const { searchParams } = new URL(request.url)
    const includeSummary = searchParams.get('summary') === '1'
    const list = listColaboradores()
    if (!includeSummary) return NextResponse.json(list)
    const enriched = list.map(c => ({ ...c, summary: getColaboradorSummary(c.id) }))
    return NextResponse.json(enriched)
  } catch (err) {
    console.error('[colaboradores] GET error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// POST: cria colaborador
// Body: { nomeCompleto, email, whatsapp?, percentualRepasse? }
// Super-admin only. Senha temporária retornada apenas neste momento.
export async function POST(request) {
  try {
    const auth = await requireAuth({ requireSuperAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    const body = await request.json()
    const nomeCompleto = String(body?.nomeCompleto || '').trim()
    const email = normalizeEmail(body?.email)
    const whatsapp = normalizeWhatsapp(body?.whatsapp)
    if (!nomeCompleto || !email) {
      return NextResponse.json({ error: 'Nome e email são obrigatórios.' }, { status: 400 })
    }
    const clients = readClients()
    if (clients.some(c => normalizeEmail(c.email) === email)) {
      return NextResponse.json({ error: 'Email já cadastrado.' }, { status: 409 })
    }
    let pct = Number(body?.percentualRepasse)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) pct = null

    const senhaTemp = generateRandomPassword(10)
    const novo = {
      id: crypto.randomUUID(),
      nomeCompleto,
      email,
      whatsapp: whatsapp || '',
      senha: hashPassword(senhaTemp),
      isAdmin: true,
      isColaborador: true,
      isSuperAdmin: false,
      ativo: true,
      mustChangePassword: true,
      percentualRepasse: pct,
      criadoEm: new Date().toISOString(),
      sessionVersion: 0,
    }
    clients.push(novo)
    writeClients(clients)

    appendAuditLog({
      action: 'colaborador.created',
      actor: auth.client || auth.payload,
      target: { type: 'colaborador', id: novo.id, label: nomeCompleto },
      details: { email, percentualRepasse: pct },
      request,
    })

    return NextResponse.json({
      id: novo.id,
      nomeCompleto: novo.nomeCompleto,
      email: novo.email,
      senhaTemporaria: senhaTemp,
    }, { status: 201 })
  } catch (err) {
    console.error('[colaboradores] POST error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// PATCH: atualiza colaborador
// Body: { id, nomeCompleto?, percentualRepasse?, ativo?, resetPassword? }
export async function PATCH(request) {
  try {
    const auth = await requireAuth({ requireSuperAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    const body = await request.json()
    const id = String(body?.id || '').trim()
    if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })

    const clients = readClients()
    const idx = clients.findIndex(c => c.id === id)
    if (idx === -1) return NextResponse.json({ error: 'Colaborador não encontrado.' }, { status: 404 })
    if (!clients[idx].isColaborador) {
      return NextResponse.json({ error: 'Cliente alvo não é colaborador.' }, { status: 400 })
    }

    const before = { ...clients[idx] }
    let senhaTemp = null

    if (typeof body.nomeCompleto === 'string' && body.nomeCompleto.trim()) {
      clients[idx].nomeCompleto = body.nomeCompleto.trim()
    }
    if (body.percentualRepasse !== undefined) {
      const v = body.percentualRepasse === null ? null : Number(body.percentualRepasse)
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > 100)) {
        return NextResponse.json({ error: 'Percentual inválido.' }, { status: 400 })
      }
      clients[idx].percentualRepasse = v
    }
    if (body.ativo !== undefined) {
      const wantAtivo = !!body.ativo
      clients[idx].ativo = wantAtivo
      if (!wantAtivo) clients[idx].sessionVersion = (Number(clients[idx].sessionVersion) || 0) + 1
    }
    if (body.resetPassword === true) {
      senhaTemp = generateRandomPassword(10)
      clients[idx].senha = hashPassword(senhaTemp)
      clients[idx].mustChangePassword = true
      clients[idx].sessionVersion = (Number(clients[idx].sessionVersion) || 0) + 1
    }

    clients[idx].atualizadoEm = new Date().toISOString()
    writeClients(clients)

    appendAuditLog({
      action: 'colaborador.updated',
      actor: auth.client || auth.payload,
      target: { type: 'colaborador', id, label: clients[idx].nomeCompleto },
      details: {
        nomeCompleto: { from: before.nomeCompleto, to: clients[idx].nomeCompleto },
        percentualRepasse: { from: before.percentualRepasse ?? null, to: clients[idx].percentualRepasse ?? null },
        ativo: { from: !!before.ativo, to: !!clients[idx].ativo },
        passwordReset: !!senhaTemp,
      },
      request,
    })

    return NextResponse.json({
      id: clients[idx].id,
      nomeCompleto: clients[idx].nomeCompleto,
      email: clients[idx].email,
      ativo: !!clients[idx].ativo,
      percentualRepasse: clients[idx].percentualRepasse ?? null,
      senhaTemporaria: senhaTemp,
    })
  } catch (err) {
    console.error('[colaboradores] PATCH error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// DELETE /api/colaboradores?id=xxx — desativa (soft)
export async function DELETE(request) {
  try {
    const auth = await requireAuth({ requireSuperAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })

    const clients = readClients()
    const idx = clients.findIndex(c => c.id === id)
    if (idx === -1 || !clients[idx].isColaborador) {
      return NextResponse.json({ error: 'Colaborador não encontrado.' }, { status: 404 })
    }
    clients[idx].ativo = false
    clients[idx].sessionVersion = (Number(clients[idx].sessionVersion) || 0) + 1
    clients[idx].atualizadoEm = new Date().toISOString()
    writeClients(clients)

    appendAuditLog({
      action: 'colaborador.disabled',
      actor: auth.client || auth.payload,
      target: { type: 'colaborador', id, label: clients[idx].nomeCompleto },
      request,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[colaboradores] DELETE error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
