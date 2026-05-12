// src/lib/pricing.js
// Cálculo centralizado de descontos progressivos e resumo de preços

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function resolveBasePrice(item) {
  const candidates = [
    item?.priceEffective,
    item?.priceFinal,
    item?.priceOriginal,
    item?.price,
  ]
  for (const candidate of candidates) {
    const num = Number(candidate)
    if (Number.isFinite(num)) return num
  }
  return 0
}

function normalizeTable(raw, ativos) {
  if (!ativos) return []
  const list = Array.isArray(raw) ? raw : []
  return list
    .map(f => ({
      quantidade: Number(f.quantidade) || 0,
      desconto: Number(f.desconto) || 0,
    }))
    .filter(f => f.quantidade > 0 && f.desconto > 0)
    .sort((a, b) => b.quantidade - a.quantidade)
}

// Resolves the effective discount table for an event, considering its global toggle.
// When event.usarDescontosGlobais is true (or no own config), pulls from globalConfig.
export function resolveEventDiscountConfig(eventInfo, globalConfig = null) {
  if (!eventInfo) {
    return {
      table: normalizeTable(globalConfig?.descontosGlobais, globalConfig?.descontosGlobaisAtivos),
      ativos: !!globalConfig?.descontosGlobaisAtivos,
      origem: 'global',
    }
  }
  const useGlobal = !!eventInfo?.usarDescontosGlobais && !!globalConfig
  if (useGlobal) {
    return {
      table: normalizeTable(globalConfig.descontosGlobais, globalConfig.descontosGlobaisAtivos),
      ativos: !!globalConfig.descontosGlobaisAtivos,
      origem: 'global',
    }
  }
  return {
    table: normalizeTable(eventInfo?.descontosProgressivos, eventInfo?.descontosProgressivosAtivos),
    ativos: !!eventInfo?.descontosProgressivosAtivos,
    origem: 'evento',
  }
}

// Versão paralela para vídeos. Lê event.descontosVideoProgressivos / event.usarDescontosVideoGlobais
// e globalConfig.descontosVideoGlobais / descontosVideoGlobaisAtivos. Independente da tabela de fotos.
export function resolveEventVideoDiscountConfig(eventInfo, globalConfig = null) {
  if (!eventInfo) {
    return {
      table: normalizeTable(globalConfig?.descontosVideoGlobais, globalConfig?.descontosVideoGlobaisAtivos),
      ativos: !!globalConfig?.descontosVideoGlobaisAtivos,
      origem: 'global',
    }
  }
  const useGlobal = !!eventInfo?.usarDescontosVideoGlobais && !!globalConfig
  if (useGlobal) {
    return {
      table: normalizeTable(globalConfig.descontosVideoGlobais, globalConfig.descontosVideoGlobaisAtivos),
      ativos: !!globalConfig.descontosVideoGlobaisAtivos,
      origem: 'global',
    }
  }
  return {
    table: normalizeTable(eventInfo?.descontosVideoProgressivos, eventInfo?.descontosVideoProgressivosAtivos),
    ativos: !!eventInfo?.descontosVideoProgressivosAtivos,
    origem: 'evento',
  }
}

function pickPctForEvent(eventInfo, qty, globalConfig = null) {
  const { table, ativos } = resolveEventDiscountConfig(eventInfo, globalConfig)
  if (!ativos || !table.length || qty <= 0) return 0
  const faixa = table.find(f => qty >= f.quantidade)
  return faixa ? faixa.desconto : 0
}

function pickPctForEventVideo(eventInfo, qty, globalConfig = null) {
  const { table, ativos } = resolveEventVideoDiscountConfig(eventInfo, globalConfig)
  if (!ativos || !table.length || qty <= 0) return 0
  const faixa = table.find(f => qty >= f.quantidade)
  return faixa ? faixa.desconto : 0
}

function isVideoItem(item) {
  return item?.mediaType === 'video' || item?.tipo === 'video'
}

function coerceEventsMap(eventsById = {}) {
  if (eventsById instanceof Map) return eventsById
  const map = new Map()
  if (Array.isArray(eventsById)) {
    eventsById.forEach(ev => { if (ev?.id) map.set(ev.id, ev) })
    return map
  }
  Object.entries(eventsById || {}).forEach(([id, ev]) => { if (id && ev) map.set(id, ev) })
  return map
}

export function computeProgressiveTotals(items = [], opts = {}) {
  return computeProgressiveTotalsWithContext(items, opts)
}

export function buildPedidoPricing(pedido = {}) {
  const itens = Array.isArray(pedido.itens || pedido.items) ? (pedido.itens || pedido.items) : []
  const subtotal = round2(itens.reduce((sum, item) => sum + resolveBasePrice(item), 0))
  const totalItens = round2(itens.reduce((sum, item) => sum + Number(item.priceComDesconto ?? resolveBasePrice(item)), 0))
  const descontoValor = round2(subtotal - totalItens)
  const taxaParcelamento = Number(pedido.taxaParcelamento || 0)
  const totalSemTaxas = totalItens
  const totalFinal = Number.isFinite(pedido.total) ? Number(pedido.total) : round2(totalSemTaxas + taxaParcelamento)

  return {
    subtotal,
    descontoValor,
    totalSemTaxas,
    totalFinal,
    linhas: pedido.descontoProgressivo?.linhas || [],
    taxaParcelamento,
  }
}

// ===== Internals / avançado =====

export function computeProgressiveTotalsWithContext(items = [], {
  eventsById = {},
  previousPaidByEvent = {},
  ignoreFreeInCount = true,
  globalConfig = null,
} = {}) {
  const events = coerceEventsMap(eventsById)
  // Estrutura agora: chave "<eventId>|<media>" onde media = 'foto' | 'video'.
  // Permite aplicar tabelas independentes para fotos e vídeos no mesmo evento.
  const groups = new Map()
  let subtotal = 0

  const safeItems = Array.isArray(items) ? items : []
  safeItems.forEach(item => {
    const price = resolveBasePrice(item)
    subtotal += price
    const eventId = item?.eventId || 'sem_evento'
    const media = isVideoItem(item) ? 'video' : 'foto'
    const key = `${eventId}|${media}`
    const current = groups.get(key) || { eventId, media, quantidade: 0, total: 0, eventName: item?.eventName || '' }
    const countsForQty = (!ignoreFreeInCount || price > 0) ? 1 : 0
    current.quantidade += countsForQty
    current.total += price
    if (!current.eventName && item?.eventName) current.eventName = item.eventName
    groups.set(key, current)
  })

  // Compras anteriores aplicam-se apenas ao grupo "foto" do evento (compatibilidade
  // com o formato atual de previousPaidByEvent que não distingue media).
  Object.entries(previousPaidByEvent || {}).forEach(([eventId, qty]) => {
    if (!eventId) return
    const key = `${eventId}|foto`
    const current = groups.get(key) || { eventId, media: 'foto', quantidade: 0, total: 0, eventName: '' }
    current.quantidade += Number(qty) || 0
    groups.set(key, current)
  })

  const appliedPctByEvent = {}        // chave eventId → % do FOTO (preserva contrato p/ UI antiga)
  const appliedPctByGroup = {}        // chave "eventId|media" → % real
  const linhas = []
  let descontoTotal = 0

  groups.forEach((info, key) => {
    const eventInfo = events.get(info.eventId)
    const pct = info.media === 'video'
      ? pickPctForEventVideo(eventInfo, info.quantidade, globalConfig)
      : pickPctForEvent(eventInfo, info.quantidade, globalConfig)
    appliedPctByGroup[key] = pct
    if (info.media === 'foto') appliedPctByEvent[info.eventId] = pct
    if (pct > 0) {
      const valor = round2(info.total * (pct / 100))
      descontoTotal += valor
      linhas.push({
        eventId: info.eventId,
        nomeEvento: info.eventName || 'Evento',
        media: info.media,
        pct,
        valor,
      })
    }
  })

  const itensComDesconto = safeItems.map(item => {
    const eventId = item?.eventId || 'sem_evento'
    const media = isVideoItem(item) ? 'video' : 'foto'
    const pct = appliedPctByGroup[`${eventId}|${media}`] || 0
    const price = resolveBasePrice(item)
    const priceComDesconto = (pct > 0 && price > 0) ? round2(price * (pct / 100 ? (1 - pct / 100) : 1)) : price
    return {
      ...item,
      descontoPct: pct,
      priceComDesconto,
      priceOriginal: price,
    }
  })

  const total = round2(subtotal - descontoTotal)

  return {
    subtotal: round2(subtotal),
    descontoTotal: round2(descontoTotal),
    total,
    linhas,
    appliedPctByEvent,
    appliedPctByGroup,
    itensComDesconto,
  }
}

export function simulateProgressiveTable({ precoBase = 0, tabela = [], ativos = true, previousPaid = 0, maxQty = 40 }) {
  const tab = normalizeTable(tabela, ativos)
  const rows = []
  let lastTotal = null
  for (let qty = 1; qty <= maxQty; qty += 1) {
    const pct = pickPctForEvent({ descontosProgressivos: tab, descontosProgressivosAtivos: true }, qty + previousPaid)
    const total = round2(precoBase * qty * (pct > 0 ? (1 - pct / 100) : 1))
    const unit = qty > 0 ? round2(total / qty) : 0
    const warn = lastTotal != null && total < lastTotal ? 'monotonicidade' : null
    rows.push({ qty, pct, total, unit, warn })
    lastTotal = total
  }
  return rows
}

// Detects rows in a discount table that would create incoherent jumps:
// adding more photos shouldn't reduce the cumulative total. Returns Set of indices flagged.
export function detectIncoherentTiers({ precoBase = 0, tabela = [], ativos = true } = {}) {
  const flagged = new Set()
  if (!ativos || precoBase <= 0) return flagged
  const sorted = (Array.isArray(tabela) ? tabela : [])
    .map((row, originalIndex) => ({
      originalIndex,
      quantidade: Number(row.quantidade) || 0,
      desconto: Number(row.desconto) || 0,
    }))
    .filter(r => r.quantidade > 0 && r.desconto > 0)
    .sort((a, b) => a.quantidade - b.quantidade)
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    // Higher tier should give higher percentage. If lower threshold has higher discount,
    // a smaller quantity becomes cheaper per photo than a higher quantity → incoherent.
    if (curr.desconto <= prev.desconto) flagged.add(curr.originalIndex)
    // Also flag when the incremental total for going from prev.quantidade to curr.quantidade decreases.
    const totalAtPrev = prev.quantidade * precoBase * (1 - prev.desconto / 100)
    const totalAtCurr = curr.quantidade * precoBase * (1 - curr.desconto / 100)
    if (totalAtCurr < totalAtPrev) flagged.add(curr.originalIndex)
  }
  return flagged
}

export function nextTierSuggestion({ items = [], eventsById = {}, previousPaidByEvent = {}, globalConfig = null } = {}) {
  const events = coerceEventsMap(eventsById)
  const safeItems = Array.isArray(items) ? items : []
  const groupCounts = {}
  safeItems.forEach(item => {
    const price = resolveBasePrice(item)
    if (price <= 0) return
    const eventId = item?.eventId || 'sem_evento'
    groupCounts[eventId] = (groupCounts[eventId] || 0) + 1
  })

  const suggestions = {}
  Object.entries(groupCounts).forEach(([eventId, count]) => {
    const ev = events.get(eventId)
    const { table, ativos } = resolveEventDiscountConfig(ev, globalConfig)
    if (!ativos || !table.length) return
    const prev = Number(previousPaidByEvent?.[eventId] || 0)
    const effectiveCount = count + prev
    const next = table.filter(f => f.quantidade > effectiveCount).sort((a, b) => a.quantidade - b.quantidade)[0]
    if (!next) return
    const missing = next.quantidade - effectiveCount
    const pricedItems = safeItems.filter(i => i.eventId === eventId && resolveBasePrice(i) > 0)
    const avgPrice = pricedItems.reduce((sum, i) => sum + resolveBasePrice(i), 0) / (pricedItems.length || 1)
    const projectedUnit = round2(avgPrice * (1 - next.desconto / 100))
    suggestions[eventId] = {
      missing,
      pct: next.desconto,
      targetQty: next.quantidade,
      projectedUnit,
      currentCount: effectiveCount,
    }
  })
  return suggestions
}
