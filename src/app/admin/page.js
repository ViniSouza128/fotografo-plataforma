'use client'
// src/app/admin/page.js — Dashboard

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { applyNextImageFallback, getEventCoverCandidates, getFirstUrl, getPhotoCartPreviewCandidates } from '@/lib/imagePaths'
import { buildWhatsAppHref, formatarWhatsApp } from '@/lib/whatsapp'
import { buildOrderFinancialSummary, getFinancialStatus, getFinancialToneStyle, summarizeFinancialOrders } from '@/lib/commerceUtils'

function formatDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function SaleModal({ pedido, onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!pedido) return null
  const financialStatus = getFinancialStatus(pedido)
  const statusStyle = getFinancialToneStyle(financialStatus.tone)
  const financial = buildOrderFinancialSummary(pedido)
  const itens = pedido.itens || pedido.items || []
  const whatsappHref = buildWhatsAppHref(pedido.whatsapp)
  const email = pedido.email || pedido.pagador?.email || ''
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', maxWidth: '680px', width: '100%', maxHeight: '85vh', overflow: 'auto', padding: '2rem' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem' }}>Pedido #{pedido.publicId || pedido.id?.slice(0, 8)}</h2>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            ['Cliente', pedido.nome || pedido.clienteNome || 'Anônimo'],
            ['Status financeiro', <span key="s" style={{ color: statusStyle.color, fontWeight: 600 }}>{financialStatus.label}</span>],
            ['WhatsApp direto', whatsappHref ? <a key="w" href={whatsappHref} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{formatarWhatsApp(pedido.whatsapp) || pedido.whatsapp}</a> : ''],
            ['E-mail direto', email ? <a key="e" href={`mailto:${email}`} style={{ color: 'var(--accent)' }}>{email}</a> : ''],
            ['WhatsApp', formatarWhatsApp(pedido.whatsapp) || pedido.whatsapp || '—'],
            ['E-mail', pedido.email || '—'],
            ['Data', pedido.criadoEm ? new Date(pedido.criadoEm).toLocaleString('pt-BR') : '—'],
            ['Total', <span key="t" style={{ color: 'var(--success)', fontWeight: 700 }}>R$ {Number(pedido.total).toFixed(2).replace('.', ',')}</span>],
            ['Taxa estimada', `R$ ${financial.gatewayFee.toFixed(2).replace('.', ',')}`],
            ['Liquido estimado', `R$ ${financial.net.toFixed(2).replace('.', ',')}`],
          ].map(([label, val]) => (
            <div key={label}>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>{label}</p>
              <p style={{ fontSize: '0.88rem' }}>{val}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Fotos ({itens.length})</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px,1fr))', gap: '0.5rem' }}>
          {itens.map(item => {
            const srcCandidates = getPhotoCartPreviewCandidates(item)
            const src = getFirstUrl(srcCandidates)
            return (
              <div key={item.id} style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius)', overflow: 'hidden', position: 'relative' }}>
                <div style={{ height: '70px' }}>
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => {
                      if (!applyNextImageFallback(e.target, srcCandidates)) {
                        e.target.style.display = 'none'
                      }
                    }}
                  />
                </div>
                <p style={{ fontSize: '0.62rem', color: 'var(--text-dim)', padding: '0.25rem 0.4rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.originalName || item.filename || '—'}
                </p>
                <p style={{ fontSize: '0.68rem', color: 'var(--success)', padding: '0 0.4rem 0.3rem', fontWeight: 600 }}>
                  R$ {(Number(item.price) || 0).toFixed(2).replace('.', ',')}
                </p>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <Link href="/admin/pedidos" className="btn btn-ghost btn-sm">Ver todos os pedidos</Link>
          <button onClick={onClose} className="btn btn-primary btn-sm">Fechar</button>
        </div>
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const router = useRouter()
  const [events, setEvents]   = useState([])
  const [photos, setPhotos]   = useState([])
  const [pedidos, setPedidos] = useState([])
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedPedido, setSelectedPedido] = useState(null)
  const [adminProfile, setAdminProfile] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [evRes, phRes, pdRes] = await Promise.all([
          fetch('/api/events'),
          fetch('/api/photos'),
          fetch('/api/pedidos?admin=1'),
        ])
        const [eventsData, photosData, pedidosData] = await Promise.all([
          evRes.json().catch(() => []),
          phRes.json().catch(() => []),
          pdRes.json().catch(() => []),
        ])
        setEvents(Array.isArray(eventsData) ? eventsData : [])
        setPhotos(Array.isArray(photosData) ? photosData : [])
        setPedidos(Array.isArray(pedidosData) ? pedidosData : [])

        if (!pdRes.ok) {
          setErro(pedidosData?.error || 'Nao foi possivel carregar os pedidos do painel.')
          if (pdRes.status === 401 || pdRes.status === 403) {
            localStorage.removeItem('adminLogado')
            router.replace('/login?returnTo=/admin')
          }
        }
      } catch (e) {
        console.error(e)
        setErro('Erro ao carregar dados do dashboard.')
      }
      finally { setLoading(false) }
    }
    load()
  }, [router])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.id) setAdminProfile(parsed)
    } catch {}
  }, [])

  function photoCount(eventId) { return photos.filter(p => p.eventId === eventId && !p.removida).length }
  // Retorna URL completa para miniatura do evento (prioriza thumbs pequenas → evita carregar originais)
  function eventThumbCandidates(ev) {
    const coverCandidates = getEventCoverCandidates(ev, { watermark: 'clean' })
    if (coverCandidates.length > 0) return coverCandidates
    const photo = photos.find(p => p.eventId === ev.id && !p.removida)
    if (!photo) return []
    return getPhotoCartPreviewCandidates(photo)
  }

  // Apenas gateways de produção real contam para receita (exclui manual e sandbox)
  const financeiro      = summarizeFinancialOrders(pedidos)
  const pedidosPagos    = pedidos.filter(p => buildOrderFinancialSummary(p).realPaid)
  const receitaReal     = financeiro.gross
  const fotosVendidas   = financeiro.itemsSold
  const pedidosRecentes = [...pedidos].sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0)).slice(0, 5)
  const adminName = adminProfile?.nomeCompleto || adminProfile?.nome || 'Administrador'
  const adminInitials = adminName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'A'
  const isSuperAdmin = !!adminProfile?.isSuperAdmin

  if (loading) return (
    <div className="flex-center" style={{ height: '60vh', gap: '1rem' }}>
      <div className="spinner" style={{ width: '32px', height: '32px' }} />
      <span style={{ color: 'var(--text-muted)' }}>Carregando...</span>
    </div>
  )

  return (
    <>
      <div className="admin-header">
        <div className="admin-header-shell">
          <Link href="/" className="btn btn-ghost btn-sm admin-header-back">
            ← Voltar ao site
          </Link>

          <div className="admin-header-center">
            <h1 className="admin-page-title admin-header-title">Dashboard</h1>
            <p className="admin-header-subtitle">Área do fotógrafo</p>
          </div>

          <div className="admin-header-user">
            <div className="admin-header-avatar" aria-hidden="true">
              {adminInitials}
            </div>
            <div className="admin-header-user-meta">
              <span className="admin-header-user-name">{adminName}</span>
              {isSuperAdmin && (
                <span className="admin-header-badge">⭐ Super Admin</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {erro && (
        <div style={{
          background: 'var(--danger-dim)',
          border: '1px solid rgba(217,108,108,0.35)',
          color: 'var(--danger)',
          borderRadius: 'var(--radius)',
          padding: '0.85rem 1rem',
          marginBottom: '1rem',
        }}>
          {erro}
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Faturamento Bruto</p>
          <p className="stat-value" style={{ color: 'var(--success)', fontSize: '1.5rem' }}>
            R$ {receitaReal.toFixed(2).replace('.', ',')}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Liquido Estimado</p>
          <p className="stat-value" style={{ color: 'var(--accent)', fontSize: '1.5rem' }}>
            R$ {financeiro.net.toFixed(2).replace('.', ',')}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Taxas Estimadas</p>
          <p className="stat-value" style={{ fontSize: '1.4rem' }}>
            R$ {financeiro.gatewayFees.toFixed(2).replace('.', ',')}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Simulacoes/Liberacoes</p>
          <p className="stat-value">{financeiro.simulatedCount}</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>R$ {financeiro.simulatedTotal.toFixed(2).replace('.', ',')}</p>
        </div>
      </div>

      {/* Pedidos recentes — cada linha clicável */}
      {pedidosRecentes.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: '2rem' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link href="/admin/pedidos" style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--text)', textDecoration: 'none' }}>Últimos Pedidos</Link>
            <Link href="/admin/pedidos" style={{ fontSize: '0.78rem', color: 'var(--accent)' }}>Ver todos →</Link>
          </div>
          {pedidosRecentes.map((pedido, idx) => {
            const financialStatus = getFinancialStatus(pedido)
            const statusStyle = getFinancialToneStyle(financialStatus.tone)
            const itens = pedido.itens || pedido.items || []
            return (
              <div key={pedido.id}
                onClick={() => setSelectedPedido(pedido)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '0.85rem 1.5rem', cursor: 'pointer',
                  borderBottom: idx < pedidosRecentes.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pedido.nome || pedido.clienteNome || 'Anônimo'}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    {itens.length} foto{itens.length !== 1 ? 's' : ''} · {pedido.criadoEm ? new Date(pedido.criadoEm).toLocaleDateString('pt-BR') : '—'}
                  </p>
                </div>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--accent)', flexShrink: 0 }}>
                  R$ {Number(pedido.total).toFixed(2).replace('.', ',')}
                </span>
                <span style={{ fontSize: '0.7rem', color: statusStyle.color, background: statusStyle.bg, padding: '0.15rem 0.5rem', borderRadius: '100px', flexShrink: 0 }}>
                  {financialStatus.label}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>→</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Eventos — cada linha clicável */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link href="/admin/eventos" style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: 'var(--text)', textDecoration: 'none' }}>Álbuns Recentes</Link>
          <Link href="/admin/eventos" style={{ fontSize: '0.78rem', color: 'var(--accent)' }}>Ver todos →</Link>
        </div>
        {events.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem' }}>
            <div className="empty-state-icon">📅</div>
            <h3 className="empty-state-title" style={{ fontSize: '1.2rem' }}>Nenhum álbum criado</h3>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[...events].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 8).map((event, idx, arr) => {
              const thumbCandidates = eventThumbCandidates(event)
              const thumb = getFirstUrl(thumbCandidates)
              const count = photoCount(event.id)
              const vendidas = pedidosPagos.flatMap(p => p.itens || p.items || []).filter(item => item.eventId === event.id).length
              return (
                <div key={event.id}
                  onClick={() => router.push(`/admin/eventos/${event.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1rem 1.5rem', cursor: 'pointer',
                    borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ width: '64px', height: '46px', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', flexShrink: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => {
                          if (!applyNextImageFallback(e.target, thumbCandidates)) {
                            e.target.style.display = 'none'
                          }
                        }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📷</div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: '400', color: 'var(--text)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {event.name}
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>📅 {formatDate(event.date)}</span>
                      <span style={{ fontSize: '0.72rem', background: count > 0 ? 'var(--accent-dim)' : 'var(--bg-input)', color: count > 0 ? 'var(--accent)' : 'var(--text-dim)', padding: '0.1rem 0.5rem', borderRadius: '100px' }}>
                        {count} foto{count !== 1 ? 's' : ''}
                      </span>
                      {vendidas > 0 && (
                        <span style={{ fontSize: '0.72rem', background: 'var(--success-dim)', color: 'var(--success)', padding: '0.1rem 0.5rem', borderRadius: '100px' }}>
                          ✓ {vendidas} vendida{vendidas !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', flexShrink: 0 }}>→</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedPedido && <SaleModal pedido={selectedPedido} onClose={() => setSelectedPedido(null)} />}
    </>
  )
}
