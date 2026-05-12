import { readPedidos } from './pedidos'
import { readEvents } from './events'
import { readPhotos } from './photos'
import { getPedidoItens, estimateGatewayFee, isSimulatedPayment, isRealPaidPedido } from './commerceUtils'

const PAID_STATUSES = new Set(['pago', 'liberado_manual'])

function hoursFromTime(timeStr) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  if (!Number.isFinite(h)) return null
  return h + (Number.isFinite(m) ? m / 60 : 0)
}

function daysBetween(d1Str, d2Str) {
  if (!d1Str) return 1
  const d1 = new Date(d1Str)
  const d2 = d2Str ? new Date(d2Str) : d1
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1)
}

function r2(n) { return Math.round((n || 0) * 100) / 100 }

export function computeAnalytics({ startDate, endDate, colaboradorId = null } = {}) {
  const pedidos = readPedidos()
  let events = readEvents()
  let photoOwnerById = null

  if (colaboradorId) {
    const photos = readPhotos()
    const eventsById = new Map(events.map(e => [e.id, e]))
    photoOwnerById = new Map(photos.map(p => [
      p.id,
      p.colaboradorId || (eventsById.get(p.eventId)?.colaboradorId) || null,
    ]))
    events = events.filter(e => e.colaboradorId === colaboradorId)
  }

  const eventsMap = Object.fromEntries(events.map(e => [e.id, e]))
  let paidOrders = pedidos.filter(p => PAID_STATUSES.has(p.status))

  if (colaboradorId) {
    paidOrders = paidOrders.filter(p => {
      const itens = getPedidoItens(p)
      return itens.some(item => {
        const pid = item.photoId || item.id
        return photoOwnerById.get(pid) === colaboradorId
      })
    })
  }

  const start = startDate ? new Date(startDate) : null
  const end = endDate ? new Date(endDate + 'T23:59:59.999') : null

  const orders = paidOrders.filter(p => {
    if (!start && !end) return true
    const d = p.criadoEm ? new Date(p.criadoEm) : null
    if (!d) return true
    if (start && d < start) return false
    if (end && d > end) return false
    return true
  })

  // ── General ──────────────────────────────────────────────────────────────
  let grossRevenue = 0, totalFees = 0, simulatedTotal = 0, totalPhotos = 0

  for (const p of orders) {
    const total = Number(p.total || 0)
    const itens = getPedidoItens(p)
    totalPhotos += itens.length
    if (isSimulatedPayment(p)) {
      simulatedTotal += total
    } else {
      grossRevenue += total
      totalFees += estimateGatewayFee(p)
    }
  }

  const general = {
    totalOrders: orders.length,
    totalPhotos,
    totalEvents: events.filter(e => !e.removido).length,
    grossRevenue: r2(grossRevenue),
    totalFees: r2(totalFees),
    netRevenue: r2(grossRevenue - totalFees),
    simulatedTotal: r2(simulatedTotal),
    avgOrderValue: orders.length ? r2(grossRevenue / orders.filter(p => !isSimulatedPayment(p)).length || 0) : 0,
  }

  // ── By Album ─────────────────────────────────────────────────────────────
  const albumMap = {}
  for (const p of orders) {
    const itens = getPedidoItens(p)
    const simulated = isSimulatedPayment(p)
    const byEvent = {}
    for (const item of itens) {
      const eid = item.eventId
      if (!eid) continue
      if (!byEvent[eid]) byEvent[eid] = []
      byEvent[eid].push(item)
    }
    for (const [eid, items] of Object.entries(byEvent)) {
      if (!albumMap[eid]) {
        const ev = eventsMap[eid]
        albumMap[eid] = { eventId: eid, publicId: ev?.publicId || '', name: ev?.name || eid, categoria: ev?.categoria || '', cidade: ev?.cidade || '', revenue: 0, simulated: 0, orders: 0, photos: 0 }
      }
      const subtotal = items.reduce((s, i) => s + Number(i.price ?? i.priceComDesconto ?? 0), 0)
      if (simulated) albumMap[eid].simulated += subtotal
      else albumMap[eid].revenue += subtotal
      albumMap[eid].orders++
      albumMap[eid].photos += items.length
    }
  }
  const byAlbum = Object.values(albumMap)
    .map(a => ({ ...a, revenue: r2(a.revenue), simulated: r2(a.simulated) }))
    .sort((a, b) => b.revenue - a.revenue)

  // ── By Period (monthly) ───────────────────────────────────────────────────
  const periodMap = {}
  for (const p of orders) {
    if (!p.criadoEm) continue
    const d = new Date(p.criadoEm)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!periodMap[key]) periodMap[key] = { period: key, revenue: 0, orders: 0, photos: 0 }
    if (!isSimulatedPayment(p)) periodMap[key].revenue += Number(p.total || 0)
    periodMap[key].orders++
    periodMap[key].photos += getPedidoItens(p).length
  }
  const byPeriod = Object.values(periodMap)
    .map(p => ({ ...p, revenue: r2(p.revenue) }))
    .sort((a, b) => a.period.localeCompare(b.period))

  // ── By Categoria ─────────────────────────────────────────────────────────
  const catMap = {}
  for (const p of orders) {
    const simulated = isSimulatedPayment(p)
    const byEvent = {}
    for (const item of getPedidoItens(p)) {
      const eid = item.eventId
      if (!eid) continue
      if (!byEvent[eid]) byEvent[eid] = []
      byEvent[eid].push(item)
    }
    for (const [eid, items] of Object.entries(byEvent)) {
      const cat = eventsMap[eid]?.categoria || 'Sem categoria'
      if (!catMap[cat]) catMap[cat] = { categoria: cat, revenue: 0, orders: 0, photos: 0 }
      if (!simulated) catMap[cat].revenue += items.reduce((s, i) => s + Number(i.price ?? i.priceComDesconto ?? 0), 0)
      catMap[cat].orders++
      catMap[cat].photos += items.length
    }
  }
  const byCategoria = Object.values(catMap)
    .map(c => ({ ...c, revenue: r2(c.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)

  // ── By Cidade ────────────────────────────────────────────────────────────
  const cidadeMap = {}
  for (const p of orders) {
    const simulated = isSimulatedPayment(p)
    const byEvent = {}
    for (const item of getPedidoItens(p)) {
      const eid = item.eventId
      if (!eid) continue
      if (!byEvent[eid]) byEvent[eid] = []
      byEvent[eid].push(item)
    }
    for (const [eid, items] of Object.entries(byEvent)) {
      const cidade = eventsMap[eid]?.cidade || 'Não informada'
      if (!cidadeMap[cidade]) cidadeMap[cidade] = { cidade, revenue: 0, orders: 0, photos: 0 }
      if (!simulated) cidadeMap[cidade].revenue += items.reduce((s, i) => s + Number(i.price ?? i.priceComDesconto ?? 0), 0)
      cidadeMap[cidade].orders++
      cidadeMap[cidade].photos += items.length
    }
  }
  const byCidade = Object.values(cidadeMap)
    .map(c => ({ ...c, revenue: r2(c.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)

  // ── By Gateway ───────────────────────────────────────────────────────────
  const gwMap = {}
  for (const p of orders) {
    const gw = p.pagamento?.gateway || 'manual'
    const metodo = p.pagamento?.metodo || p.paymentMethod || '—'
    const key = `${gw}||${metodo}`
    if (!gwMap[key]) gwMap[key] = { gateway: gw, metodo, revenue: 0, orders: 0, fees: 0 }
    gwMap[key].orders++
    if (!isSimulatedPayment(p)) {
      gwMap[key].revenue += Number(p.total || 0)
      gwMap[key].fees += estimateGatewayFee(p)
    }
  }
  const byGateway = Object.values(gwMap)
    .map(g => ({ ...g, revenue: r2(g.revenue), fees: r2(g.fees), net: r2(g.revenue - g.fees) }))
    .sort((a, b) => b.revenue - a.revenue)

  // ── Earnings Per Capture Hour ─────────────────────────────────────────────
  const horaRows = []
  for (const ev of events) {
    if (ev.removido) continue
    const h0 = hoursFromTime(ev.horarioInicial)
    const h1 = hoursFromTime(ev.horarioFinal)
    if (h0 === null || h1 === null) continue
    const horasPorDia = Math.max(0, h1 - h0)
    if (horasPorDia <= 0) continue
    const dias = daysBetween(ev.date, ev.dataFinal)
    const totalHoras = horasPorDia * dias

    let revenue = 0, photosCount = 0, ordersCount = 0
    for (const p of orders) {
      if (isSimulatedPayment(p)) continue
      const itens = getPedidoItens(p).filter(i => i.eventId === ev.id)
      if (itens.length) {
        revenue += itens.reduce((s, i) => s + Number(i.price ?? i.priceComDesconto ?? 0), 0)
        ordersCount++
        photosCount += itens.length
      }
    }

    horaRows.push({
      eventId: ev.id,
      publicId: ev.publicId || '',
      name: ev.name,
      date: ev.date,
      dataFinal: ev.dataFinal || null,
      horarioInicial: ev.horarioInicial,
      horarioFinal: ev.horarioFinal,
      horasPorDia: r2(horasPorDia),
      dias,
      totalHoras: r2(totalHoras),
      revenue: r2(revenue),
      orders: ordersCount,
      photos: photosCount,
      revenuePerHour: totalHoras > 0 ? r2(revenue / totalHoras) : 0,
    })
  }
  horaRows.sort((a, b) => b.revenuePerHour - a.revenuePerHour)

  // ── Export datasets ───────────────────────────────────────────────────────
  const pedidosExport = orders.map(p => ({
    publicId: p.publicId || p.id?.slice(0, 8) || '',
    nome: p.nome || p.clienteNome || '',
    email: p.email || '',
    whatsapp: p.whatsapp || '',
    status: p.status,
    total: Number(p.total || 0),
    fotos: getPedidoItens(p).length,
    gateway: p.pagamento?.gateway || '',
    metodo: p.pagamento?.metodo || p.paymentMethod || '',
    criadoEm: p.criadoEm || '',
  }))

  const clientMap = {}
  for (const p of orders) {
    const key = p.email || p.whatsapp || p.nome || p.id
    if (!key) continue
    if (!clientMap[key]) {
      clientMap[key] = { nome: p.nome || p.clienteNome || '', email: p.email || '', whatsapp: p.whatsapp || '', totalGasto: 0, pedidos: 0, fotos: 0, primeiroPedido: p.criadoEm || '', ultimoPedido: p.criadoEm || '' }
    }
    const c = clientMap[key]
    c.totalGasto += Number(p.total || 0)
    c.pedidos++
    c.fotos += getPedidoItens(p).length
    if (p.criadoEm && p.criadoEm < c.primeiroPedido) c.primeiroPedido = p.criadoEm
    if (p.criadoEm && p.criadoEm > c.ultimoPedido) c.ultimoPedido = p.criadoEm
  }
  const clientesExport = Object.values(clientMap)
    .map(c => ({ ...c, totalGasto: r2(c.totalGasto) }))
    .sort((a, b) => b.totalGasto - a.totalGasto)

  return { general, byAlbum, byPeriod, byCategoria, byCidade, byGateway, byHour: horaRows, pedidosExport, clientesExport }
}
