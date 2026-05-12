// src/app/api/cupons/validar/route.js
// Public endpoint: validates a cupom against the current cart and returns
// a summary of the discount that would apply. Server-side validation.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validarCupom } from '@/lib/cupons'
import { validateAuthToken } from '@/lib/auth'
import { readPhotos } from '@/lib/photos'
import { readEvents } from '@/lib/events'
import { computeProgressiveTotalsWithContext } from '@/lib/pricing'
import { getEffectivePrice, isPhotoFree } from '@/lib/freeAccess'
import { readConfig } from '@/lib/config'
import { readPedidos } from '@/lib/pedidos'

function normalizeCanonicalItens({ items, photos, eventsMap }) {
  const out = []
  const seen = new Set()
  for (const item of (Array.isArray(items) ? items : [])) {
    const photoId = item?.id || item?.photoId
    if (!photoId || seen.has(photoId)) continue
    seen.add(photoId)
    const photo = photos.find(p => p.id === photoId)
    if (!photo || photo.removida) continue
    const event = eventsMap.get(photo.eventId)
    const isFree = isPhotoFree(photo, event)
    const effectivePrice = getEffectivePrice(photo, event)
    out.push({
      id: photo.id,
      photoId: photo.id,
      eventId: photo.eventId,
      eventName: event?.name || item?.eventName || '',
      price: isFree ? 0 : effectivePrice,
      priceEffective: isFree ? 0 : effectivePrice,
      priceOriginal: Number(photo.price) || 0,
      isFree,
    })
  }
  return out
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const codigo = body?.codigo
    const items = Array.isArray(body?.items) ? body.items : []
    if (!codigo) {
      return NextResponse.json({ valido: false, error: 'Código obrigatório.' }, { status: 400 })
    }

    let clientId = null
    try {
      const cookieStore = await cookies()
      const token = cookieStore.get('auth_token')?.value
      const auth = token ? validateAuthToken(token) : null
      clientId = auth?.payload?.id || null
    } catch {}

    // Re-canonicalize prices server-side. Never trust client-supplied prices.
    const photos = readPhotos()
    const events = readEvents()
    const eventsMap = new Map(events.map(ev => [ev.id, ev]))
    const canonicalItens = normalizeCanonicalItens({ items, photos, eventsMap })

    if (canonicalItens.length === 0) {
      return NextResponse.json({ valido: false, error: 'Carrinho vazio ou todas as fotos indisponíveis.' }, { status: 400 })
    }

    // Apply progressive discounts so coupon sees post-progressive prices
    const config = readConfig()
    const previousPaidByEvent = (() => {
      const map = {}
      if (!clientId) return map
      const pedidos = readPedidos()
      const isPaid = (s) => ['pago', 'liberado_manual'].includes(String(s || '').toLowerCase())
      pedidos.forEach(p => {
        if (!isPaid(p.status)) return
        if (p.clientId !== clientId) return
        ;(p.itens || p.items || []).forEach(item => {
          const evId = item.eventId
          const price = Number(item.price || item.priceOriginal || 0)
          if (price <= 0 || !evId) return
          map[evId] = (map[evId] || 0) + 1
        })
      })
      return map
    })()

    const eventsById = Object.fromEntries(events.map(ev => [ev.id, ev]))
    const pricing = computeProgressiveTotalsWithContext(canonicalItens, {
      eventsById,
      previousPaidByEvent,
      ignoreFreeInCount: true,
      globalConfig: {
        descontosGlobais: Array.isArray(config?.descontosGlobais) ? config.descontosGlobais : [],
        descontosGlobaisAtivos: !!config?.descontosGlobaisAtivos,
      },
    })

    const result = validarCupom({
      codigo,
      items: pricing.itensComDesconto,
      clientId,
    })

    if (!result.valido) {
      return NextResponse.json({ valido: false, error: result.error, code: result.code }, { status: 200 })
    }

    return NextResponse.json({
      valido: true,
      codigo: result.cupom.codigo,
      tipo: result.cupom.tipo,
      valor: result.valorEfetivo,
      desconto: result.desconto,
      subtotalAplicavel: result.subtotalAplicavel,
      quantidadeAplicavel: result.quantidadeAplicavel,
      albunsRestrito: (result.cupom.albuns || []).length > 0,
      descricao: result.cupom.descricao || null,
      subtotalAtual: pricing.total,
    })
  } catch (err) {
    console.error('Erro em /api/cupons/validar:', err)
    return NextResponse.json({ valido: false, error: 'Erro ao validar cupom.' }, { status: 500 })
  }
}
