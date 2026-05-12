/* eslint-disable react-hooks/rules-of-hooks */
'use client'
// nota: padrão legado com early-return antes de hooks (auth check)

import { useState, useEffect, useCallback, useRef } from 'react'

// ── CSV export ────────────────────────────────────────────────────────────────
function escapeCSV(v) {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function buildCSV(headers, rows) {
  const lines = [headers.map(escapeCSV).join(',')]
  for (const row of rows) lines.push(row.map(escapeCSV).join(','))
  return '﻿' + lines.join('\n')
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function brl(n) {
  return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')
}

function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('pt-BR') } catch { return iso }
}

// ── SVG Chart ─────────────────────────────────────────────────────────────────
const CHART_TYPES = [
  { id: 'bar',    label: 'Barras',    icon: '▮' },
  { id: 'hbar',   label: 'Horizontal', icon: '▬' },
  { id: 'line',   label: 'Linha',     icon: '╱' },
  { id: 'area',   label: 'Área',      icon: '◢' },
  { id: 'donut',  label: 'Rosca',     icon: '◯' },
]

const CHART_PALETTE = [
  'var(--accent)',
  '#6cc4fa', '#9bd47a', '#f0a55a', '#d96c6c', '#b88cff',
  '#5fd4c4', '#ffd166', '#ef6f93', '#7ad1a8', '#a3a3ff',
]

function ChartTypeSelector({ value, onChange, available }) {
  const options = available ? CHART_TYPES.filter(t => available.includes(t.id)) : CHART_TYPES
  return (
    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
      {options.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          aria-pressed={value === t.id}
          title={t.label}
          style={{
            padding: '0.35rem 0.7rem', fontSize: '0.78rem',
            borderRadius: 'var(--radius)', border: '1px solid var(--border)',
            background: value === t.id ? 'var(--accent-dim, rgba(201,169,110,0.18))' : 'transparent',
            color: value === t.id ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          <span style={{ marginRight: '0.3rem' }}>{t.icon}</span>{t.label}
        </button>
      ))}
    </div>
  )
}

function ChartTooltip({ pos, content }) {
  if (!pos) return null
  return (
    <div style={{
      position: 'absolute', left: pos.x + 12, top: pos.y + 12, pointerEvents: 'none',
      background: '#0f1115', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: '0.45rem 0.65rem', fontSize: '0.76rem', color: 'var(--text)',
      whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 20,
    }}>
      {content}
    </div>
  )
}

function Chart({ type, data, formatValue, height = 280, emptyMsg = 'Sem dados para gráfico.' }) {
  const [hover, setHover] = useState(null)
  const items = (data || []).filter(d => Number(d.value) > 0)
  if (items.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>{emptyMsg}</p>
  }
  const fmt = formatValue || (v => String(v))
  const max = Math.max(...items.map(d => Number(d.value)))
  const containerRef = useRef(null)

  const mouseHandlers = (label, value) => ({
    onMouseEnter: e => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, label, value })
    },
    onMouseMove: e => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      setHover(h => h ? { ...h, x: e.clientX - rect.left, y: e.clientY - rect.top } : h)
    },
    onMouseLeave: () => setHover(null),
  })

  if (type === 'donut') {
    const total = items.reduce((s, d) => s + Number(d.value), 0)
    const size = Math.min(height, 320)
    const cx = size / 2, cy = size / 2
    const r  = size / 2 - 14
    const ri = r * 0.62
    let acc = 0
    const slices = items.map((d, i) => {
      const v = Number(d.value)
      const start = (acc / total) * Math.PI * 2 - Math.PI / 2
      acc += v
      const end = (acc / total) * Math.PI * 2 - Math.PI / 2
      const large = end - start > Math.PI ? 1 : 0
      const x1 = cx + r  * Math.cos(start), y1 = cy + r  * Math.sin(start)
      const x2 = cx + r  * Math.cos(end),   y2 = cy + r  * Math.sin(end)
      const x3 = cx + ri * Math.cos(end),   y3 = cy + ri * Math.sin(end)
      const x4 = cx + ri * Math.cos(start), y4 = cy + ri * Math.sin(start)
      return {
        d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${ri} ${ri} 0 ${large} 0 ${x4} ${y4} Z`,
        color: CHART_PALETTE[i % CHART_PALETTE.length],
        label: d.label, value: v, pct: (v / total) * 100,
      }
    })
    return (
      <div ref={containerRef} style={{ position: 'relative', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((s, i) => (
            <path
              key={i} d={s.d} fill={s.color} stroke="#0f1115" strokeWidth="1.5"
              {...mouseHandlers(s.label, `${fmt(s.value)} (${s.pct.toFixed(1)}%)`)}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s', opacity: hover && hover.label !== s.label ? 0.45 : 1 }}
            />
          ))}
          <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text-dim)" fontSize="11">Total</text>
          <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--text)" fontSize="14" fontWeight="600">{fmt(total)}</text>
        </svg>
        <div style={{ display: 'grid', gap: '0.3rem', minWidth: '180px', flex: 1 }}>
          {slices.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: s.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.label}</span>
              <span style={{ color: 'var(--text-muted)' }}>{s.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
        <ChartTooltip pos={hover} content={hover && (<><strong>{hover.label}</strong><br />{hover.value}</>)} />
      </div>
    )
  }

  if (type === 'hbar') {
    const rowH = 26, gap = 8
    const padL = 140, padR = 60, padT = 8, padB = 8
    const w = 720
    const h = padT + padB + items.length * (rowH + gap) - gap
    return (
      <div ref={containerRef} style={{ position: 'relative', overflowX: 'auto' }}>
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
          {items.map((d, i) => {
            const v = Number(d.value)
            const bw = ((w - padL - padR) * v) / max
            const y = padT + i * (rowH + gap)
            const color = CHART_PALETTE[i % CHART_PALETTE.length]
            return (
              <g key={i} {...mouseHandlers(d.label, fmt(v))} style={{ cursor: 'pointer' }}>
                <text x={padL - 8} y={y + rowH / 2 + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
                  {String(d.label).length > 22 ? String(d.label).slice(0, 21) + '…' : d.label}
                </text>
                <rect x={padL} y={y} width={w - padL - padR} height={rowH} fill="var(--bg-secondary)" rx="4" />
                <rect x={padL} y={y} width={bw} height={rowH} fill={color} rx="4"
                  style={{ opacity: hover && hover.label !== d.label ? 0.45 : 1, transition: 'opacity 0.15s' }} />
                <text x={padL + bw + 6} y={y + rowH / 2 + 4} fontSize="11" fill="var(--text)">{fmt(v)}</text>
              </g>
            )
          })}
        </svg>
        <ChartTooltip pos={hover} content={hover && (<><strong>{hover.label}</strong><br />{hover.value}</>)} />
      </div>
    )
  }

  // bar / line / area share an X-axis
  const w = 720
  const h = height
  const padL = 50, padR = 16, padT = 14, padB = 56
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const step = items.length > 1 ? innerW / (items.length - (type === 'bar' ? 0 : 1)) : innerW
  const yScale = v => padT + innerH - (v / max) * innerH
  const xCenter = i => type === 'bar' ? padL + step * i + step / 2 : padL + step * i

  // y grid (4 gridlines)
  const gridSteps = 4
  const grid = Array.from({ length: gridSteps + 1 }, (_, i) => {
    const v = (max / gridSteps) * i
    return { v, y: yScale(v) }
  })

  let pathLine = '', pathArea = ''
  if (type === 'line' || type === 'area') {
    items.forEach((d, i) => {
      const x = xCenter(i), y = yScale(Number(d.value))
      pathLine += (i === 0 ? 'M ' : 'L ') + x + ' ' + y + ' '
    })
    if (type === 'area') {
      pathArea = pathLine + `L ${xCenter(items.length - 1)} ${padT + innerH} L ${xCenter(0)} ${padT + innerH} Z`
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', overflowX: 'auto' }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={g.y} y2={g.y} stroke="var(--border)" strokeDasharray="2 4" />
            <text x={padL - 6} y={g.y + 3} textAnchor="end" fontSize="10" fill="var(--text-dim)">{fmt(g.v)}</text>
          </g>
        ))}
        {type === 'area' && (
          <>
            <defs>
              <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%"  stopColor="var(--accent)" stopOpacity="0.45" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={pathArea} fill="url(#areaGrad)" />
            <path d={pathLine} fill="none" stroke="var(--accent)" strokeWidth="2" />
          </>
        )}
        {type === 'line' && <path d={pathLine} fill="none" stroke="var(--accent)" strokeWidth="2" />}
        {type === 'bar' && items.map((d, i) => {
          const v = Number(d.value)
          const bw = Math.max(2, step * 0.65)
          const x = padL + step * i + (step - bw) / 2
          const y = yScale(v)
          const color = CHART_PALETTE[i % CHART_PALETTE.length]
          return (
            <rect key={i} x={x} y={y} width={bw} height={padT + innerH - y} fill={color} rx="3"
              {...mouseHandlers(d.label, fmt(v))}
              style={{ cursor: 'pointer', opacity: hover && hover.label !== d.label ? 0.45 : 1, transition: 'opacity 0.15s' }} />
          )
        })}
        {(type === 'line' || type === 'area') && items.map((d, i) => {
          const v = Number(d.value)
          const x = xCenter(i), y = yScale(v)
          return (
            <circle key={i} cx={x} cy={y} r="4" fill="var(--accent)" stroke="#0f1115" strokeWidth="1.5"
              {...mouseHandlers(d.label, fmt(v))}
              style={{ cursor: 'pointer', opacity: hover && hover.label !== d.label ? 0.5 : 1, transition: 'opacity 0.15s' }} />
          )
        })}
        {items.map((d, i) => {
          const x = xCenter(i)
          const lbl = String(d.label)
          const short = lbl.length > 14 ? lbl.slice(0, 13) + '…' : lbl
          return (
            <text key={i} x={x} y={h - padB + 14}
              fontSize="10" fill="var(--text-muted)"
              transform={`rotate(-30 ${x} ${h - padB + 14})`}
              textAnchor="end"
            >{short}</text>
          )
        })}
      </svg>
      <ChartTooltip pos={hover} content={hover && (<><strong>{hover.label}</strong><br />{hover.value}</>)} />
    </div>
  )
}

function ChartCard({ title, type, onTypeChange, data, formatValue, available }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: 'var(--text)' }}>{title}</h3>
        <ChartTypeSelector value={type} onChange={onTypeChange} available={available} />
      </div>
      <Chart type={type} data={data} formatValue={formatValue} />
    </div>
  )
}

// ── Mini progress bar ─────────────────────────────────────────────────────────
function BarCell({ value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, height: '6px', background: 'var(--bg-secondary)', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: '99px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: '32px', textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem 1.5rem' }}>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>{label}</p>
      <p style={{ fontSize: '1.5rem', fontWeight: 600, color: accent ? 'var(--accent)' : 'var(--text)', fontFamily: 'var(--font-heading)' }}>{value}</p>
      {sub && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{sub}</p>}
    </div>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────
function DataTable({ headers, rows, emptyMsg = 'Sem dados' }) {
  if (!rows || rows.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>{emptyMsg}</p>
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h.key || h.label} style={{ padding: '0.6rem 0.75rem', textAlign: h.right ? 'right' : 'left', color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {headers.map(h => (
                <td key={h.key || h.label} style={{ padding: '0.65rem 0.75rem', textAlign: h.right ? 'right' : 'left', color: h.accent ? 'var(--accent)' : 'var(--text)', fontWeight: h.bold ? 600 : 400 }}>
                  {h.render ? h.render(row) : row[h.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const TABS = [
  { id: 'albuns', label: 'Por Álbum' },
  { id: 'periodo', label: 'Por Período' },
  { id: 'categoria', label: 'Por Categoria' },
  { id: 'cidade', label: 'Por Cidade' },
  { id: 'gateway', label: 'Por Gateway' },
  { id: 'hora', label: 'Ganhos/Hora' },
]

export default function EstatisticasPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeTab, setActiveTab] = useState('albuns')
  const [exporting, setExporting] = useState(false)
  const [chartTypes, setChartTypes] = useState({
    albuns:    'bar',
    periodo:   'line',
    categoria: 'donut',
    cidade:    'donut',
    gateway:   'bar',
    hora:      'hbar',
  })
  const setChartType = (tab, t) => setChartTypes(prev => ({ ...prev, [tab]: t }))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const res = await fetch(`/api/estatisticas?${params}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erro')
      setData(await res.json())
    } catch (e) {
      setError(e.message || 'Erro ao carregar estatísticas')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  // ── Export helpers ────────────────────────────────────────────────────────
  function exportPedidos() {
    if (!data) return
    const headers = ['ID', 'Nome', 'E-mail', 'WhatsApp', 'Status', 'Total (R$)', 'Fotos', 'Gateway', 'Método', 'Data']
    const rows = data.pedidosExport.map(p => [
      p.publicId, p.nome, p.email, p.whatsapp, p.status,
      Number(p.total).toFixed(2), p.fotos, p.gateway, p.metodo,
      fmtDateTime(p.criadoEm),
    ])
    downloadCSV(buildCSV(headers, rows), `pedidos_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function exportClientes() {
    if (!data) return
    const headers = ['Nome', 'E-mail', 'WhatsApp', 'Total Gasto (R$)', 'Pedidos', 'Fotos', 'Primeiro Pedido', 'Último Pedido']
    const rows = data.clientesExport.map(c => [
      c.nome, c.email, c.whatsapp,
      Number(c.totalGasto).toFixed(2), c.pedidos, c.fotos,
      fmtDateTime(c.primeiroPedido), fmtDateTime(c.ultimoPedido),
    ])
    downloadCSV(buildCSV(headers, rows), `clientes_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function exportAlbuns() {
    if (!data) return
    const headers = ['ID Público', 'Álbum', 'Categoria', 'Cidade', 'Receita Real (R$)', 'Simulado (R$)', 'Pedidos', 'Fotos']
    const rows = data.byAlbum.map(a => [
      a.publicId, a.name, a.categoria, a.cidade,
      Number(a.revenue).toFixed(2), Number(a.simulated).toFixed(2), a.orders, a.photos,
    ])
    downloadCSV(buildCSV(headers, rows), `vendas_albuns_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function exportPeriodo() {
    if (!data) return
    const headers = ['Período', 'Receita (R$)', 'Pedidos', 'Fotos']
    const rows = data.byPeriod.map(p => [p.period, Number(p.revenue).toFixed(2), p.orders, p.photos])
    downloadCSV(buildCSV(headers, rows), `vendas_periodo_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function exportHora() {
    if (!data) return
    const headers = ['Álbum', 'Data inicial', 'Data final', 'Horário início', 'Horário fim', 'Horas/dia', 'Dias', 'Total horas', 'Receita (R$)', 'R$/hora', 'Pedidos', 'Fotos']
    const rows = data.byHour.map(h => [
      h.name, fmtDate(h.date), fmtDate(h.dataFinal),
      h.horarioInicial, h.horarioFinal,
      h.horasPorDia, h.dias, h.totalHoras,
      Number(h.revenue).toFixed(2), Number(h.revenuePerHour).toFixed(2),
      h.orders, h.photos,
    ])
    downloadCSV(buildCSV(headers, rows), `ganhos_hora_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function exportEstatisticas() {
    if (!data) return
    setExporting(true)
    try {
      exportAlbuns()
      setTimeout(exportPeriodo, 200)
      setTimeout(exportHora, 400)
      setTimeout(() => setExporting(false), 600)
    } catch { setExporting(false) }
  }

  const g = data?.general
  const maxAlbumRevenue = Math.max(0, ...(data?.byAlbum?.map(a => a.revenue) || [0]))
  const maxPeriodRevenue = Math.max(0, ...(data?.byPeriod?.map(p => p.revenue) || [0]))

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 1rem 3rem' }}>
      {/* Header */}
      <div className="admin-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="admin-page-title">Estatísticas</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Análise de receitas, pedidos, álbuns e clientes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={exportPedidos} disabled={!data || loading}>⬇ Pedidos CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={exportClientes} disabled={!data || loading}>⬇ Clientes CSV</button>
          <button className="btn btn-primary btn-sm" onClick={exportEstatisticas} disabled={!data || loading || exporting}>
            {exporting ? '…' : '⬇ Exportar tudo'}
          </button>
        </div>
      </div>

      {/* Date filter */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem' }}>
        <div>
          <label className="form-label" style={{ marginBottom: '0.3rem' }}>De</label>
          <input aria-label="De" type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ fontSize: '0.85rem' }} />
        </div>
        <div>
          <label className="form-label" style={{ marginBottom: '0.3rem' }}>Até</label>
          <input aria-label="Até" type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ fontSize: '0.85rem' }} />
        </div>
        {(startDate || endDate) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setStartDate(''); setEndDate('') }}>✕ Limpar filtro</button>
        )}
        <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginLeft: 'auto' }}>
          {startDate || endDate ? 'Período filtrado' : 'Todo o histórico'}
        </span>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {loading && (
        <div className="flex-center" style={{ padding: '4rem' }}>
          <div className="spinner" style={{ width: '32px', height: '32px' }} />
          <span style={{ color: 'var(--text-muted)', marginLeft: '0.75rem' }}>Calculando…</span>
        </div>
      )}

      {!loading && data && (
        <>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <StatCard label="Receita bruta" value={brl(g.grossRevenue)} accent />
            <StatCard label="Receita líquida" value={brl(g.netRevenue)} sub={`Taxas: ${brl(g.totalFees)}`} />
            <StatCard label="Simulado/manual" value={brl(g.simulatedTotal)} />
            <StatCard label="Pedidos pagos" value={g.totalOrders} sub={`Ticket médio: ${brl(g.avgOrderValue)}`} />
            <StatCard label="Fotos vendidas" value={g.totalPhotos} />
            <StatCard label="Álbuns ativos" value={g.totalEvents} />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '0.55rem 1rem', fontSize: '0.85rem', border: 'none', background: 'none',
                  color: activeTab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                  borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: 'pointer', transition: 'color 0.15s', marginBottom: '-1px',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab: Álbuns */}
          {activeTab === 'albuns' && (
            <div>
              <ChartCard
                title="Receita por álbum"
                type={chartTypes.albuns}
                onTypeChange={t => setChartType('albuns', t)}
                data={data.byAlbum.map(a => ({ label: a.name || a.publicId || '—', value: Number(a.revenue) || 0 }))}
                formatValue={brl}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={exportAlbuns}>⬇ CSV</button>
              </div>
              <DataTable
                headers={[
                  { key: 'name', label: 'Álbum' },
                  { key: 'categoria', label: 'Categoria' },
                  { key: 'cidade', label: 'Cidade' },
                  { label: 'Receita', right: true, accent: true, render: a => brl(a.revenue) },
                  { label: 'Simulado', right: true, render: a => a.simulated > 0 ? brl(a.simulated) : '—' },
                  { label: 'Pedidos', key: 'orders', right: true },
                  { label: 'Fotos', key: 'photos', right: true },
                  { label: 'Participação', right: false, render: a => <BarCell value={a.revenue} max={maxAlbumRevenue} /> },
                ]}
                rows={data.byAlbum}
                emptyMsg="Nenhuma venda encontrada."
              />
            </div>
          )}

          {/* Tab: Período */}
          {activeTab === 'periodo' && (
            <div>
              <ChartCard
                title="Receita por período"
                type={chartTypes.periodo}
                onTypeChange={t => setChartType('periodo', t)}
                data={data.byPeriod.map(p => ({ label: p.period, value: Number(p.revenue) || 0 }))}
                formatValue={brl}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={exportPeriodo}>⬇ CSV</button>
              </div>
              <DataTable
                headers={[
                  { key: 'period', label: 'Mês/Ano' },
                  { label: 'Receita', right: true, accent: true, render: p => brl(p.revenue) },
                  { label: 'Pedidos', key: 'orders', right: true },
                  { label: 'Fotos', key: 'photos', right: true },
                  { label: 'Participação', render: p => <BarCell value={p.revenue} max={maxPeriodRevenue} /> },
                ]}
                rows={data.byPeriod}
                emptyMsg="Sem dados de período."
              />
            </div>
          )}

          {/* Tab: Categoria */}
          {activeTab === 'categoria' && (
            <div>
              <ChartCard
                title="Receita por categoria"
                type={chartTypes.categoria}
                onTypeChange={t => setChartType('categoria', t)}
                data={data.byCategoria.map(c => ({ label: c.categoria || '—', value: Number(c.revenue) || 0 }))}
                formatValue={brl}
              />
              <DataTable
              headers={[
                { key: 'categoria', label: 'Categoria' },
                { label: 'Receita', right: true, accent: true, render: c => brl(c.revenue) },
                { label: 'Pedidos', key: 'orders', right: true },
                { label: 'Fotos', key: 'photos', right: true },
              ]}
              rows={data.byCategoria}
              emptyMsg="Sem categorias com vendas."
            />
            </div>
          )}

          {/* Tab: Cidade */}
          {activeTab === 'cidade' && (
            <div>
              <ChartCard
                title="Receita por cidade"
                type={chartTypes.cidade}
                onTypeChange={t => setChartType('cidade', t)}
                data={data.byCidade.map(c => ({ label: c.cidade || '—', value: Number(c.revenue) || 0 }))}
                formatValue={brl}
              />
              <DataTable
              headers={[
                { key: 'cidade', label: 'Cidade' },
                { label: 'Receita', right: true, accent: true, render: c => brl(c.revenue) },
                { label: 'Pedidos', key: 'orders', right: true },
                { label: 'Fotos', key: 'photos', right: true },
              ]}
              rows={data.byCidade}
              emptyMsg="Sem cidades com vendas."
            />
            </div>
          )}

          {/* Tab: Gateway */}
          {activeTab === 'gateway' && (
            <div>
              <ChartCard
                title="Receita líquida por gateway"
                type={chartTypes.gateway}
                onTypeChange={t => setChartType('gateway', t)}
                data={data.byGateway.map(g => ({ label: `${g.gateway || '—'}${g.metodo ? ' / ' + g.metodo : ''}`, value: Number(g.net) || 0 }))}
                formatValue={brl}
              />
              <DataTable
              headers={[
                { key: 'gateway', label: 'Gateway' },
                { key: 'metodo', label: 'Método' },
                { label: 'Receita', right: true, accent: true, render: g => brl(g.revenue) },
                { label: 'Taxas est.', right: true, render: g => brl(g.fees) },
                { label: 'Líquido', right: true, bold: true, render: g => brl(g.net) },
                { label: 'Pedidos', key: 'orders', right: true },
              ]}
              rows={data.byGateway}
              emptyMsg="Sem dados de gateway."
            />
            </div>
          )}

          {/* Tab: Ganhos por hora */}
          {activeTab === 'hora' && (
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                Calculado com base no horário inicial/final cadastrado em cada álbum. Apenas receitas reais (sem simulações).
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={exportHora}>⬇ CSV</button>
              </div>
              {data.byHour.length > 0 && (
                <ChartCard
                  title="R$ por hora"
                  type={chartTypes.hora}
                  onTypeChange={t => setChartType('hora', t)}
                  data={data.byHour.map(h => ({ label: h.name || '—', value: Number(h.revenuePerHour) || 0 }))}
                  formatValue={brl}
                />
              )}
              {data.byHour.length === 0 ? (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '1.5rem', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Nenhum álbum com horário de captura informado.</p>
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Preencha "Horário inicial" e "Horário final" na edição do álbum para ver este relatório.</p>
                </div>
              ) : (
                <DataTable
                  headers={[
                    { key: 'name', label: 'Álbum' },
                    { label: 'Data', render: h => `${fmtDate(h.date)}${h.dataFinal && h.dataFinal !== h.date ? ' → ' + fmtDate(h.dataFinal) : ''}` },
                    { label: 'Horário', render: h => `${h.horarioInicial} – ${h.horarioFinal}` },
                    { label: 'Horas/dia', key: 'horasPorDia', right: true },
                    { label: 'Dias', key: 'dias', right: true },
                    { label: 'Total horas', key: 'totalHoras', right: true },
                    { label: 'Receita', right: true, render: h => brl(h.revenue) },
                    { label: 'R$/hora', right: true, accent: true, bold: true, render: h => brl(h.revenuePerHour) },
                    { label: 'Pedidos', key: 'orders', right: true },
                    { label: 'Fotos', key: 'photos', right: true },
                  ]}
                  rows={data.byHour}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
