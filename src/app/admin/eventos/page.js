/* eslint-disable react-hooks/rules-of-hooks */
'use client'
// src/app/admin/eventos/page.js
// nota: componente "ÁlbunsPage" (acentuado) bate na heurística PascalCase ASCII do linter

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { applyNextImageFallback, getEventCoverCandidates, getFirstUrl } from '@/lib/imagePaths'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import SafeDeleteModal from '@/components/SafeDeleteModal'

function SortHeader({ label, field, current, dir, onSort, align = 'left' }) {
  const active = current === field
  return (
    <th
      style={{ padding: '0.75rem 0.5rem', textAlign: align, fontSize: '0.72rem', color: active ? 'var(--accent)' : 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onSort(field)}
    >
      {label} {active ? (dir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )
}

const VISIB_OPTIONS = [
  { value: 'publico',    label: 'Público',      color: 'var(--success)' },
  { value: 'naolistado', label: 'Não listado',  color: 'var(--warning, #f59e0b)' },
  { value: 'privado',    label: 'Privado',       color: 'var(--danger)' },
]

function VisibBadge({ value }) {
  const cfg = VISIB_OPTIONS.find(o => o.value === value) || VISIB_OPTIONS[0]
  return (
    <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '100px', background: cfg.color + '18', color: cfg.color, fontWeight: 500 }}>
      {cfg.label}
    </span>
  )
}

export default function ÁlbunsPage() {
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const [deletePrompt, setDeletePrompt] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [tableSort, setTableSort] = useState({ field: 'date', dir: 'desc' })

  // Inline visibility editing
  const [editingVisib, setEditingVisib] = useState(null) // event id
  const [visibBusy, setVisibBusy] = useState(false)

  // Copy-link feedback
  const [copiedId, setCopiedId] = useState(null)

  // Photo publicId search results
  const [photoResults, setPhotoResults] = useState(null) // null | {query, photos}
  const [photoSearchLoading, setPhotoSearchLoading] = useState(false)

  function handleTableSort(field) {
    setTableSort(prev => prev.field === field
      ? { field, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { field, dir: 'desc' }
    )
  }

  async function criarÁlbum() {
    setCriando(true)
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Novo Álbum', date: new Date().toISOString().slice(0, 10) }),
      })
      if (!res.ok) throw new Error()
      const ev = await res.json()
      router.push(`/admin/eventos/${ev.id}?tab=info`)
    } catch { alert('Erro ao criar álbum.') }
    setCriando(false)
  }

  async function solicitarExclusao(ev, { permanent = false } = {}) {
    const accepted = await confirm({
      title: permanent ? 'Excluir album definitivamente' : 'Mover album para lixeira',
      message: permanent
        ? `A exclusao definitiva de "${ev.name}" so sera permitida se nao houver compras, carrinhos, favoritos ou curtidas.`
        : `Deseja mover o album "${ev.name}" para a lixeira fisica? Fotos vinculadas serao preservadas.`,
      confirmText: permanent ? 'Excluir definitivo' : 'Mover para lixeira',
      cancelText: 'Cancelar',
      confirmTone: 'danger',
    })
    if (!accepted) return

    try {
      const res = await fetch(`/api/events/${ev.id}`, {
        method: 'DELETE',
        headers: permanent ? { 'Content-Type': 'application/json' } : undefined,
        body: permanent ? JSON.stringify({ permanente: true }) : undefined,
      })
      if (res.status === 409) {
        const data = await res.json()
        if (permanent) {
          alert(data.message || 'Exclusao definitiva bloqueada por vinculos.')
          return
        }
        setDeletePrompt({ analysis: data.analysis, eventId: ev.id })
        return
      }
      if (!res.ok) throw new Error()
      setEvents(prev => prev.filter(e => e.id !== ev.id))
    } catch {
      alert('Erro ao excluir álbum.')
    }
  }

  async function confirmarExclusaoEvento(strategy, decisions = {}) {
    if (!deletePrompt) return
    setDeleteBusy(true)
    try {
      const res = await fetch(`/api/events/${deletePrompt.eventId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estrategia: strategy, decisoes: decisions }),
      })
      if (!res.ok) throw new Error()
      setEvents(prev => prev.filter(e => e.id !== deletePrompt.eventId))
      setDeletePrompt(null)
    } catch {
      alert('Erro ao processar exclusão.')
    }
    setDeleteBusy(false)
  }

  async function changeVisibilidade(ev, newVisib) {
    if (newVisib === ev.visibilidade) { setEditingVisib(null); return }
    if (!ev.name || !ev.date) {
      alert('O álbum precisa ter nome e data antes de alterar a visibilidade.')
      return
    }
    setVisibBusy(true)
    try {
      const res = await fetch(`/api/events/${ev.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibilidade: newVisib }),
      })
      if (!res.ok) throw new Error()
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, visibilidade: newVisib } : e))
    } catch {
      alert('Erro ao alterar visibilidade.')
    }
    setVisibBusy(false)
    setEditingVisib(null)
  }

  function copyLink(ev) {
    const url = `${window.location.origin}/evento/${ev.id}`
    navigator.clipboard.writeText(url).catch(() => {
      const el = Object.assign(document.createElement('textarea'), { value: url })
      document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el)
    })
    setCopiedId(ev.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroVisibilidade, setFiltroVisibilidade] = useState('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroPeriodo, setFiltroPeriodo] = useState('todos')
  const [ordenacao, setOrdenacao] = useState('recentes')

  useEffect(() => {
    fetch('/api/events?stats=1')
      .then(r => r.json())
      .then(data => { setEvents(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Busca por publicId de foto — dispara quando busca parece um ID numérico
  const searchPhotoPublicId = useCallback(async (query) => {
    const q = query.trim()
    const looksLikeId = /^\d{5,}$/.test(q)
    if (!looksLikeId) { setPhotoResults(null); return }
    setPhotoSearchLoading(true)
    try {
      const res = await fetch(`/api/photos?publicId=${encodeURIComponent(q)}&limit=20`)
      if (!res.ok) throw new Error()
      const photos = await res.json()
      setPhotoResults({ query: q, photos: Array.isArray(photos) ? photos : [] })
    } catch {
      setPhotoResults(null)
    }
    setPhotoSearchLoading(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => searchPhotoPublicId(busca), 350)
    return () => clearTimeout(timer)
  }, [busca, searchPhotoPublicId])

  const categorias = useMemo(() => {
    const cats = new Set(events.map(e => e.categoria).filter(Boolean))
    return [...cats].sort()
  }, [events])

  const filtered = useMemo(() => {
    let result = [...events]

    if (busca.trim()) {
      const q = busca.toLowerCase()
      result = result.filter(e =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.categoria || '').toLowerCase().includes(q) ||
        (e.cidade || '').toLowerCase().includes(q) ||
        (e.id || '').toLowerCase().includes(q) ||
        String(e.publicId || '').includes(q)
      )
    }

    if (filtroVisibilidade !== 'todos') {
      result = result.filter(e => (e.visibilidade || 'publico') === filtroVisibilidade)
    }

    if (filtroCategoria) {
      result = result.filter(e => e.categoria === filtroCategoria)
    }

    if (filtroPeriodo !== 'todos') {
      const now = new Date()
      let dias = 0
      if (filtroPeriodo === '7d') dias = 7
      else if (filtroPeriodo === '30d') dias = 30
      else if (filtroPeriodo === '90d') dias = 90
      else if (filtroPeriodo === 'ano') dias = 365
      const corte = new Date(now.getTime() - dias * 86400000)
      result = result.filter(e => new Date(e.date) >= corte)
    }

    result.sort((a, b) => {
      const sa = a._stats || {}
      const sb = b._stats || {}
      const { field, dir } = tableSort
      let cmp = 0
      if (field === 'date') cmp = new Date(b.date) - new Date(a.date)
      else if (field === 'faturamento') cmp = (sb.faturamento || 0) - (sa.faturamento || 0)
      else if (field === 'fotosVendidas') cmp = (sb.fotosVendidas || 0) - (sa.fotosVendidas || 0)
      else if (field === 'totalFotos') cmp = (sb.totalFotos || 0) - (sa.totalFotos || 0)
      else {
        switch (ordenacao) {
          case 'antigos': cmp = new Date(a.date) - new Date(b.date); break
          case 'faturamento': cmp = (sb.faturamento || 0) - (sa.faturamento || 0); break
          case 'midias': cmp = (sb.fotosVendidas || 0) - (sa.fotosVendidas || 0); break
          default: cmp = new Date(b.date) - new Date(a.date)
        }
      }
      return dir === 'asc' ? -cmp : cmp
    })

    return result
  }, [events, busca, filtroVisibilidade, filtroCategoria, filtroPeriodo, ordenacao, tableSort])

  // Álbuns que contêm fotos da busca por publicId de foto
  const photoResultEventIds = useMemo(() => {
    if (!photoResults?.photos?.length) return new Set()
    return new Set(photoResults.photos.map(p => p.eventId).filter(Boolean))
  }, [photoResults])

  const eventsFromPhotoSearch = useMemo(() => {
    if (!photoResultEventIds.size) return []
    return events.filter(e => photoResultEventIds.has(e.id))
  }, [events, photoResultEventIds])

  const totalFaturamento = events.reduce((s, e) => s + ((e._stats || {}).faturamento || 0), 0)
  const totalFotos = events.reduce((s, e) => s + ((e._stats || {}).totalFotos || 0), 0)
  const totalVendidas = events.reduce((s, e) => s + ((e._stats || {}).fotosVendidas || 0), 0)

  function formatDate(d) {
    if (!d) return '—'
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
  }

  function EventRow({ ev, highlightPhotoId }) {
    const s = ev._stats || {}
    const thumbCandidates = getEventCoverCandidates(ev, { watermark: 'clean', purpose: 'small' })
    const isEditingVisib = editingVisib === ev.id
    const relevantPhotos = highlightPhotoId
      ? (photoResults?.photos || []).filter(p => p.eventId === ev.id)
      : []

    return (
      <>
        <tr key={ev.id}
          onClick={() => { if (editingVisib === ev.id) return; router.push(`/admin/eventos/${ev.id}`) }}
          style={{ borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.05))', cursor: 'pointer', transition: 'background 0.1s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <td style={tdStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {ev.coverImage ? (
                <img
                  src={getFirstUrl(thumbCandidates)}
                  alt=""
                  loading="lazy"
                  style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
                  onError={e2 => { if (!applyNextImageFallback(e2.target, thumbCandidates)) e2.target.style.display = 'none' }}
                />
              ) : (
                <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                  📷
                </div>
              )}
              <div>
                <Link href={`/admin/eventos/${ev.id}`}
                  style={{ color: 'var(--text)', fontWeight: 500, fontSize: '0.88rem', textDecoration: 'none' }}>
                  {ev.name}
                </Link>
                {ev.publicId && (
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>#{ev.publicId}</p>
                )}
                {ev.cidade && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.05rem' }}>
                    {ev.cidade}{ev.estado ? `, ${ev.estado}` : ''}
                  </p>
                )}
              </div>
            </div>
          </td>
          <td style={tdStyle}>
            <span style={{ fontSize: '0.82rem' }}>{formatDate(ev.date)}</span>
            {ev.dataFinal && ev.dataFinal !== ev.date && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}> — {formatDate(ev.dataFinal)}</span>
            )}
          </td>
          <td style={tdStyle}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{ev.categoria || '—'}</span>
          </td>

          {/* Visibilidade inline editável */}
          <td style={{ ...tdStyle }} onClick={e => e.stopPropagation()}>
            {isEditingVisib ? (
              <select
                autoFocus
                value={ev.visibilidade || 'publico'}
                disabled={visibBusy}
                className="form-input"
                style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', width: 'auto', minWidth: '120px' }}
                onChange={e => changeVisibilidade(ev, e.target.value)}
                onBlur={() => setEditingVisib(null)}
              >
                {VISIB_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <button
                title="Clique para alterar visibilidade"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={() => setEditingVisib(ev.id)}
              >
                <VisibBadge value={ev.visibilidade || 'publico'} />
              </button>
            )}
          </td>

          <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {s.totalFotos || 0}
          </td>
          <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {s.fotosVendidas || 0}
          </td>
          <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--success)' }}>
            R$ {(s.faturamento || 0).toFixed(2).replace('.', ',')}
          </td>
          <td style={{ ...tdStyle, textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
              <Link href={`/evento/${ev.id}`} target="_blank" className="btn btn-ghost btn-sm" title="Abrir link público">
                🌐
              </Link>
              <button
                className="btn btn-ghost btn-sm"
                title={copiedId === ev.id ? 'Copiado!' : 'Copiar link público'}
                onClick={() => copyLink(ev)}
                style={{ color: copiedId === ev.id ? 'var(--success)' : undefined }}
              >
                {copiedId === ev.id ? '✓' : '📋'}
              </button>
              <button className="btn btn-ghost btn-sm" title="Excluir álbum" onClick={() => solicitarExclusao(ev)}>
                🗑
              </button>
              <button className="btn btn-ghost btn-sm" title="Excluir definitivamente" onClick={() => solicitarExclusao(ev, { permanent: true })}
                style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>
                ✕✕
              </button>
            </div>
          </td>
        </tr>
        {relevantPhotos.map(p => (
          <tr key={`photo-${p.id}`} style={{ background: 'rgba(201,169,110,0.05)', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.03))' }}>
            <td colSpan={8} style={{ padding: '0.35rem 0.75rem 0.35rem 3.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600 }}>#{p.publicId}</span>
              {p.originalName && <span style={{ marginLeft: '0.5rem', color: 'var(--text-dim)' }}>{p.originalName}</span>}
              {p.pasta && <span style={{ marginLeft: '0.5rem', color: 'var(--text-dim)' }}>📂 {p.pasta}</span>}
            </td>
          </tr>
        ))}
      </>
    )
  }

  if (loading) return (
    <div className="flex-center" style={{ minHeight: '60vh' }}>
      <div className="spinner" style={{ width: '32px', height: '32px' }} />
    </div>
  )

  const hasPhotoResults = eventsFromPhotoSearch.length > 0
  // IDs de álbuns já na lista filtrada normal
  const filteredIds = new Set(filtered.map(e => e.id))
  // Álbuns da busca por foto que NÃO aparecem na lista normal (para não duplicar)
  const extraPhotoEvents = eventsFromPhotoSearch.filter(e => !filteredIds.has(e.id))

  return (
    <>
      {confirmDialog}
      {deletePrompt && (
        <SafeDeleteModal
          analysis={deletePrompt.analysis}
          scopeLabel="álbum"
          busy={deleteBusy}
          onCancel={() => setDeletePrompt(null)}
          onConfirm={confirmarExclusaoEvento}
        />
      )}
      <div className="admin-header">
        <div>
          <h1 className="admin-page-title">Álbuns</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            {events.length} álbum{events.length !== 1 ? 's' : ''} cadastrado{events.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={criarÁlbum} disabled={criando}>
          {criando ? <><div className="spinner" style={{ width: '14px', height: '14px', display: 'inline-block', marginRight: '0.4rem' }} />Criando...</> : '➕ Criar Álbum'}
        </button>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Álbuns</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{events.length}</p>
        </div>
        <div className="stat-card">
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Fotos</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalFotos}</p>
        </div>
        <div className="stat-card">
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fotos Vendidas</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalVendidas}</p>
        </div>
        <div className="stat-card">
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Faturamento Total</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>
            R$ {totalFaturamento.toFixed(2).replace('.', ',')}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem',
        padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)'
      }}>
        <input
          type="text"
          className="form-input"
          placeholder="Buscar álbum, ID público, #foto..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ flex: '1 1 220px', minWidth: 0 }}
        />
        <select aria-label="Filtrar por periodo" className="form-input" value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)}
          style={{ width: 'auto', minWidth: '130px' }}>
          <option value="todos">Todos os períodos</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
          <option value="ano">Último ano</option>
        </select>
        <select aria-label="Filtrar por visibilidade" className="form-input" value={filtroVisibilidade} onChange={e => setFiltroVisibilidade(e.target.value)}
          style={{ width: 'auto', minWidth: '120px' }}>
          <option value="todos">Todas visib.</option>
          <option value="publico">Público</option>
          <option value="naolistado">Não listado</option>
          <option value="privado">Privado</option>
        </select>
        {categorias.length > 0 && (
          <select aria-label="Filtrar por categoria" className="form-input" value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
            style={{ width: 'auto', minWidth: '130px' }}>
            <option value="">Todas categorias</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select aria-label="Ordenacao" className="form-input" value={ordenacao} onChange={e => setOrdenacao(e.target.value)}
          style={{ width: 'auto', minWidth: '140px' }}>
          <option value="recentes">Mais recentes</option>
          <option value="antigos">Mais antigos</option>
          <option value="faturamento">Maior faturamento</option>
          <option value="midias">Mais vendidas</option>
        </select>
      </div>

      {/* Tabela */}
      {filtered.length === 0 && !hasPhotoResults ? (
        <div className="empty-state">
          <div className="empty-state-icon">📷</div>
          <h2 className="empty-state-title">
            {events.length === 0 ? 'Nenhum álbum criado' : 'Nenhum álbum encontrado'}
          </h2>
          {events.length === 0 && (
            <button className="btn btn-primary mt-3" onClick={criarÁlbum} disabled={criando}>Criar primeiro álbum</button>
          )}
          {photoSearchLoading && (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', marginTop: '0.75rem' }}>
              <span className="spinner" style={{ width: '12px', height: '12px', display: 'inline-block', marginRight: '0.4rem' }} />
              Buscando fotos por ID...
            </p>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Álbum</th>
                <SortHeader label="Data" field="date" current={tableSort.field} dir={tableSort.dir} onSort={handleTableSort} />
                <th style={thStyle}>Categoria</th>
                <th style={thStyle}>
                  Visib.
                  <span style={{ fontSize: '0.6rem', marginLeft: '0.3rem', color: 'var(--text-dim)', fontWeight: 400 }}>clique p/ editar</span>
                </th>
                <SortHeader label="Fotos" field="totalFotos" current={tableSort.field} dir={tableSort.dir} onSort={handleTableSort} align="right" />
                <SortHeader label="Vendidas" field="fotosVendidas" current={tableSort.field} dir={tableSort.dir} onSort={handleTableSort} align="right" />
                <SortHeader label="Faturamento" field="faturamento" current={tableSort.field} dir={tableSort.dir} onSort={handleTableSort} align="right" />
                <th style={{ ...thStyle, textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {/* Resultados normais (por nome, publicId de álbum, etc.) */}
              {filtered.map(ev => (
                <EventRow key={ev.id} ev={ev} highlightPhotoId={photoResultEventIds.has(ev.id)} />
              ))}

              {/* Separador quando há resultados de busca por foto não na lista normal */}
              {extraPhotoEvents.length > 0 && (
                <>
                  {filtered.length > 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: '0.6rem 0.5rem 0.4rem', fontSize: '0.7rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                        Encontrado por ID de foto #{photoResults?.query}
                      </td>
                    </tr>
                  )}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: '0.6rem 0.5rem 0.4rem', fontSize: '0.7rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                        Álbum encontrado por foto #{photoResults?.query}
                      </td>
                    </tr>
                  )}
                  {extraPhotoEvents.map(ev => (
                    <EventRow key={`photo-ev-${ev.id}`} ev={ev} highlightPhotoId />
                  ))}
                </>
              )}

              {/* Indicador de busca de foto em progresso ou sem resultado */}
              {photoSearchLoading && (
                <tr>
                  <td colSpan={8} style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                    <span className="spinner" style={{ width: '12px', height: '12px', display: 'inline-block', marginRight: '0.4rem' }} />
                    Buscando fotos pelo ID...
                  </td>
                </tr>
              )}
              {!photoSearchLoading && photoResults && photoResults.photos.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    Nenhuma foto encontrada com ID #{photoResults.query}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

const thStyle = {
  padding: '0.75rem 0.5rem',
  textAlign: 'left',
  fontSize: '0.72rem',
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 500,
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '0.75rem 0.5rem',
  fontSize: '0.85rem',
  color: 'var(--text)',
  verticalAlign: 'middle',
}
