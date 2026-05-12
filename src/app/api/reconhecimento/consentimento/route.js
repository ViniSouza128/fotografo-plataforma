// src/app/api/reconhecimento/consentimento/route.js
// POST: cliente registra consentimento LGPD para uso de reconhecimento.
// DELETE: cliente revoga consentimento (LGPD direito ao esquecimento).
//   Também apaga referências e bloqueia novas buscas dele.
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { readClients, writeClients } from '@/lib/clients'
import {
  listReferencesForOwner,
  deleteReference,
} from '@/lib/vision/storage'
import { appendAuditLog } from '@/lib/auditLog'

export async function POST(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const clients = readClients()
    const idx = clients.findIndex(c => c.id === auth.client.id)
    if (idx === -1) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

    clients[idx].reconhecimentoConsentidoEm = new Date().toISOString()
    clients[idx].atualizadoEm = new Date().toISOString()
    writeClients(clients)

    appendAuditLog({
      action: 'vision.consent_granted',
      actor: clients[idx],
      target: { type: 'client', id: clients[idx].id, label: clients[idx].email },
      request,
    })
    return NextResponse.json({ ok: true, consentidoEm: clients[idx].reconhecimentoConsentidoEm })
  } catch (err) {
    console.error('[vision consent POST] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const clients = readClients()
    const idx = clients.findIndex(c => c.id === auth.client.id)
    if (idx === -1) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

    // Apaga todas as referências do cliente
    const refs = listReferencesForOwner({ ownerId: auth.client.id, ownerType: 'client' })
    for (const r of refs) {
      try { deleteReference(r.id) } catch {}
    }

    clients[idx].reconhecimentoConsentidoEm = null
    clients[idx].reconhecimentoRevogadoEm = new Date().toISOString()
    clients[idx].atualizadoEm = new Date().toISOString()
    writeClients(clients)

    appendAuditLog({
      action: 'vision.consent_revoked',
      actor: clients[idx],
      target: { type: 'client', id: clients[idx].id, label: clients[idx].email },
      details: { referenciasApagadas: refs.length },
      request,
    })
    return NextResponse.json({ ok: true, referenciasApagadas: refs.length })
  } catch (err) {
    console.error('[vision consent DELETE] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
