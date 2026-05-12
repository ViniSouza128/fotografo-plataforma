// src/app/api/repasses/route.js
// Estatísticas e ações de repasse para colaboradores.
// - admin "completo": vê tudo, pode registrar pagamento
// - colaborador: vê só os próprios stats e repasses
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import {
  computeRepasseStats,
  listRepasses,
  registrarRepasse,
  processarCarenciasVencidas,
  getCarenciaDias,
  getPercentualPadrao,
} from '@/lib/repasses'
import { appendAuditLog } from '@/lib/auditLog'
import { appendNotificacao } from '@/lib/notificacoes'
import { findClientById } from '@/lib/clients'

export async function GET(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    // Lazy: processa carências vencidas a cada GET
    try { processarCarenciasVencidas() } catch {}

    const { searchParams } = new URL(request.url)
    const wantList = searchParams.get('listar') === '1'
    const colaboradorIdQuery = searchParams.get('colaboradorId') || null
    const inicio = searchParams.get('inicio') || null
    const fim = searchParams.get('fim') || null

    // Colaborador só pode ver os próprios dados
    const colabIdEffective = auth.payload.isColaborador
      ? auth.payload.id
      : colaboradorIdQuery

    if (wantList) {
      const rows = listRepasses({ colaboradorId: colabIdEffective })
      return NextResponse.json(rows)
    }
    const stats = computeRepasseStats({
      inicio, fim,
      colaboradorId: colabIdEffective,
    })
    return NextResponse.json({
      stats,
      configPadrao: {
        percentualPadrao: getPercentualPadrao(),
        carenciaDias: getCarenciaDias(),
      },
    })
  } catch (err) {
    console.error('[repasses] GET error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// POST: registra pagamento ao colaborador
// Body: {
//   colaboradorId, valor, metodo, observacao?,
//   tipo: 'pago' | 'convertido_saldo_cliente',
//   conversaoClienteId?, carenciaDias?,
// }
export async function POST(request) {
  try {
    const auth = await requireAuth({ requireFullAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    const body = await request.json()
    const tipo = body?.tipo === 'convertido_saldo_cliente' ? 'convertido_saldo_cliente' : 'pago'

    const result = registrarRepasse({
      colaboradorId: body?.colaboradorId,
      valor: body?.valor,
      metodo: body?.metodo || 'pix',
      observacao: body?.observacao || '',
      status: tipo,
      conversaoClienteId: body?.conversaoClienteId || null,
      carenciaDias: body?.carenciaDias != null ? Number(body.carenciaDias) : null,
      registradoPor: auth.client?.id || auth.payload?.id || null,
      periodoInicio: body?.periodoInicio || null,
      periodoFim: body?.periodoFim || null,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    appendAuditLog({
      action: 'repasse.registrado',
      actor: auth.client || auth.payload,
      target: { type: 'colaborador', id: body?.colaboradorId, label: body?.colaboradorId },
      details: {
        valor: result.repasse.valor,
        metodo: result.repasse.metodo,
        tipo,
        conversaoClienteId: result.repasse.conversaoClienteId,
        carenciaDias: result.repasse.carenciaDias,
      },
      request,
    })

    // Notifica o colaborador
    const colab = findClientById(body?.colaboradorId)
    if (colab) {
      appendNotificacao({
        tipo: 'pagamento_confirmado',
        destinatario: colab.id,
        titulo: tipo === 'convertido_saldo_cliente' ? 'Repasse convertido em saldo' : 'Repasse registrado',
        mensagem: `Valor: R$ ${Number(result.repasse.valor).toFixed(2)}`,
        link: '/admin/repasses',
      })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[repasses] POST error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
