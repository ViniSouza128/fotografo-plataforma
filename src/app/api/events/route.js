import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { readEvents, writeEvents } from '@/lib/events'
import { readPhotos } from '@/lib/photos'
import { readPedidos } from '@/lib/pedidos'
import { readConfig } from '@/lib/config'
import { generateEventId } from '@/lib/id'
import { getPedidoItens } from '@/lib/commerceUtils'
import { moveOriginalToEvent } from '@/lib/imageStorage'
import { PRICE_MIN, PRICE_MAX } from '@/lib/price'
import { appendAuditLog } from '@/lib/auditLog'
import { filterEventsForAuth, getColaboradorId } from '@/lib/colaborador'

// GET /api/events — retorna todos os eventos (com stats opcionais)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const incluirRemovidos = searchParams.get('incluirRemovidos') === '1'
    const isAdminQuery = incluirRemovidos || searchParams.get('stats') === '1' || searchParams.get('admin') === '1'

    let authPayload = null
    if (isAdminQuery) {
      const auth = await requireAuth({ requireAdmin: true })
      if (auth.error) {
        return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
      }
      authPayload = auth.payload
    }

    let events = readEvents()
      .map(ev => ({ ...ev, albumGratis: !!ev.albumGratis }))
      .filter(ev => incluirRemovidos || !ev.removido)

    // Colaborador só vê os próprios eventos quando logado
    if (isAdminQuery && authPayload?.isColaborador) {
      events = filterEventsForAuth(events, authPayload)
    }

    events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    if (searchParams.get('stats') === '1') {
      const photos = readPhotos()
      // Conta todos os pedidos pagos ou liberados manualmente (independente de gateway)
      const PAID_STATUSES = new Set(['pago', 'liberado_manual'])
      const pedidos = readPedidos().filter(p => PAID_STATUSES.has(p.status))

      for (const ev of events) {
        const evPhotos = photos.filter(p => p.eventId === ev.id && !p.removida && !p.orfaoFuncional)
        let fotosVendidas = 0
        let faturamento = 0
        let totalVendas = 0

        for (const pedido of pedidos) {
          const itensEvento = getPedidoItens(pedido).filter(i => i.eventId === ev.id)
          if (itensEvento.length > 0) {
            totalVendas++
            fotosVendidas += itensEvento.length
            faturamento += itensEvento.reduce((s, i) => s + (Number(i.price) || 0), 0)
          }
        }

        ev._stats = { totalFotos: evPhotos.length, fotosVendidas, faturamento, totalVendas }
      }
    }

    return NextResponse.json(events)
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao ler eventos' }, { status: 500 })
  }
}

// POST /api/events — cria um novo evento
export async function POST(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const body = await request.json()
    const { name, date, description, coverImage } = body

    if (!name || !date) {
      return NextResponse.json(
        { error: 'Nome e data são obrigatórios' },
        { status: 400 }
      )
    }

    const events = readEvents()

    // Herdar configurações globais para novos eventos
    let cfgDescontos = [], cfgDescontosAtivos = false, cfgPreco = null
    let cfgDefaultWmCapa = false
    let cfgDefaultWmMiniaturas = true
    try {
      const cfg = readConfig()
      cfgDescontos = Array.isArray(cfg.descontosGlobais) ? cfg.descontosGlobais : []
      cfgDescontosAtivos = !!cfg.descontosGlobaisAtivos
      cfgPreco = cfg.precoFotoDefault ? Number(cfg.precoFotoDefault) : null
      cfgDefaultWmCapa = cfg.defaultWmCapa !== undefined ? !!cfg.defaultWmCapa : false
      cfgDefaultWmMiniaturas = cfg.defaultWmMiniaturas !== undefined ? !!cfg.defaultWmMiniaturas : true
      var cfgPrecoVideo = cfg.precoVideoDefault ? Number(cfg.precoVideoDefault) : null
    } catch {}

    let precoEvento = body.precoFotoPadrao ?? cfgPreco ?? null
    if (precoEvento !== null && precoEvento !== undefined) {
      const num = Number(precoEvento)
      if (!Number.isFinite(num) || num < 0 || num > PRICE_MAX || (num > 0 && num < PRICE_MIN)) {
        return NextResponse.json({ error: 'PreÃ§o padrÃ£o fora da faixa permitida.' }, { status: 400 })
      }
      precoEvento = num
    } else {
      precoEvento = null
    }

    let precoVideoEvento = body.precoVideoPadrao ?? cfgPrecoVideo ?? null
    if (precoVideoEvento !== null && precoVideoEvento !== undefined) {
      const num = Number(precoVideoEvento)
      if (!Number.isFinite(num) || num < 0 || num > PRICE_MAX || (num > 0 && num < PRICE_MIN)) {
        return NextResponse.json({ error: 'Preço de vídeo fora da faixa permitida.' }, { status: 400 })
      }
      precoVideoEvento = num
    } else {
      precoVideoEvento = null
    }

    const newEvent = {
      id: crypto.randomUUID(),
      publicId: generateEventId(),
      name,
      date,
      dataFinal: body.dataFinal || null,
      description: description || '',
      coverImage: coverImage || null,
      visibilidade: body.visibilidade || 'publico',
      categoria: body.categoria || null,
      horarioInicial: body.horarioInicial || null,
      horarioFinal: body.horarioFinal || null,
      cidade: body.cidade || null,
      estado: body.estado || null,
      localEspecifico: body.localEspecifico || null,
      organizador: body.organizador || null,
      albumGratis: !!body.albumGratis,
      watermarkOverride: false,
      watermarkAsset: null,
      watermarkConfig: null,
      wm_capa: body.wm_capa !== undefined ? !!body.wm_capa : cfgDefaultWmCapa,
      wm_miniaturas: body.wm_miniaturas !== undefined ? !!body.wm_miniaturas : cfgDefaultWmMiniaturas,
      precoFotoPadrao: precoEvento,
      precoVideoPadrao: precoVideoEvento,
      descontosProgressivos: (body.descontosProgressivos && body.descontosProgressivos.length > 0) ? body.descontosProgressivos : cfgDescontos,
      descontosProgressivosAtivos: body.descontosProgressivosAtivos ?? (cfgDescontos.length > 0 ? cfgDescontosAtivos : false),
      usarDescontosGlobais: body.usarDescontosGlobais ?? true,
      colaboradorId: getColaboradorId(auth.payload) || (body.colaboradorId || null),
      createdAt: new Date().toISOString(),
    }

    events.push(newEvent)
    writeEvents(events)

    if (newEvent.coverImage) {
      try {
        await moveOriginalToEvent({ filename: newEvent.coverImage, eventId: newEvent.id })
      } catch (error) {
        console.error('Erro ao mover original da capa para o evento:', error)
      }
    }

    appendAuditLog({
      action: 'event.created',
      actor: auth.client || auth.payload,
      target: { type: 'event', id: newEvent.id, publicId: newEvent.publicId, label: newEvent.name },
      details: {
        visibilidade: newEvent.visibilidade,
        precoFotoPadrao: newEvent.precoFotoPadrao,
        albumGratis: newEvent.albumGratis,
      },
      request,
    })

    return NextResponse.json(newEvent, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao criar evento' }, { status: 500 })
  }
}
