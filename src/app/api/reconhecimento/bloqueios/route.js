// src/app/api/reconhecimento/bloqueios/route.js
// Solicitações de bloqueio/omissão de fotos (LGPD).
//
// POST: cliente cria solicitação (escopo: foto específica ou referência)
// GET (admin): lista solicitações
// PATCH (admin): aprova ou rejeita
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireAuth } from '@/lib/apiAuth'
import {
  appendBlock, readBlocks, updateBlock,
  readVisionConfig,
} from '@/lib/vision/storage'
import { appendAuditLog } from '@/lib/auditLog'
import { appendNotificacao } from '@/lib/notificacoes'

function clientHasConsent(client) {
  return !!(client && client.reconhecimentoConsentidoEm)
}

export async function GET() {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    const all = readBlocks()
    all.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
    return NextResponse.json(all)
  } catch (err) {
    console.error('[vision bloqueios GET] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const cfg = readVisionConfig()
    const body = await request.json()
    const { escopo = 'foto', fotoId = null, referenciaId = null, motivo = '', documento = '' } = body

    if (!['foto', 'pessoa'].includes(escopo)) {
      return NextResponse.json({ error: 'Escopo inválido.' }, { status: 400 })
    }
    if (escopo === 'foto' && !fotoId) {
      return NextResponse.json({ error: 'fotoId obrigatório.' }, { status: 400 })
    }
    if (escopo === 'pessoa' && !referenciaId) {
      return NextResponse.json({ error: 'referenciaId obrigatório.' }, { status: 400 })
    }
    if (!motivo || motivo.length < 10) {
      return NextResponse.json({ error: 'Descreva o motivo (mín 10 caracteres).' }, { status: 400 })
    }

    const block = {
      id: crypto.randomUUID(),
      escopo,
      fotoId,
      referenciaId,
      solicitanteId: auth.client?.id || null,
      solicitanteNome: auth.client?.nomeCompleto || auth.payload?.email || null,
      solicitanteEmail: auth.client?.email || null,
      documento: String(documento || '').slice(0, 50),
      motivo: String(motivo || '').slice(0, 800),
      status: 'pendente',
      criadoEm: new Date().toISOString(),
      resolvidoEm: null,
      resolvidoPor: null,
      decisao: null,
    }
    appendBlock(block)

    // Notifica admin
    appendNotificacao({
      tipo: 'remocao',
      destinatario: 'admin',
      titulo: 'Solicitação de bloqueio de reconhecimento',
      mensagem: `${block.solicitanteNome || 'Anônimo'} pediu bloqueio (${escopo}).`,
      link: '/admin/reconhecimento',
    })

    appendAuditLog({
      action: 'vision.block_requested',
      actor: auth.client || auth.payload,
      target: { type: 'vision_block', id: block.id, label: block.solicitanteNome },
      details: { escopo, fotoId, referenciaId },
      request,
    })

    return NextResponse.json(block, { status: 201 })
  } catch (err) {
    console.error('[vision bloqueios POST] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth({ requireFullAdmin: true })
    if (auth.error) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })

    const body = await request.json()
    const { id, decisao, observacao = '' } = body
    if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })
    if (!['aprovado', 'rejeitado'].includes(decisao)) {
      return NextResponse.json({ error: 'Decisão inválida.' }, { status: 400 })
    }

    const updated = updateBlock(id, {
      status: decisao,
      decisao,
      observacao: String(observacao || '').slice(0, 500),
      resolvidoEm: new Date().toISOString(),
      resolvidoPor: auth.client?.id || null,
    })
    if (!updated) return NextResponse.json({ error: 'Bloqueio não encontrado.' }, { status: 404 })

    if (updated.solicitanteId) {
      appendNotificacao({
        tipo: 'remocao',
        destinatario: updated.solicitanteId,
        titulo: 'Solicitação de bloqueio: ' + (decisao === 'aprovado' ? 'aprovada' : 'rejeitada'),
        mensagem: observacao || (decisao === 'aprovado' ? 'Sua foto foi removida dos resultados de reconhecimento.' : 'Solicitação rejeitada.'),
        link: '/minha-conta/reconhecimento',
      })
    }

    appendAuditLog({
      action: 'vision.block_resolved',
      actor: auth.client || auth.payload,
      target: { type: 'vision_block', id, label: updated.solicitanteNome },
      details: { decisao, observacao },
      request,
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[vision bloqueios PATCH] erro:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
