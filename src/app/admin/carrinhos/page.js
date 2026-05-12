'use client'
// src/app/admin/carrinhos/page.js

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { applyNextImageFallback, getFirstUrl, getPhotoCartPreviewCandidates } from '@/lib/imagePaths'
import { buildWhatsAppHref, formatarWhatsApp } from '@/lib/whatsapp'

function formatCurrency(value) {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`
}

export default function CarrinhosPage() {
  const [carrinhos, setCarrinhos] = useState([])
  const [loading, setLoading]     = useState(true)
  const [expandido, setExpandido] = useState(null)
  const [filtro, setFiltro]       = useState('nao')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/carrinhos')
      setCarrinhos(await res.json())
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Stats
  const totalCarrinhos = carrinhos.length
  const totalItens     = carrinhos.reduce((s, c) => s + ((c.itens || c.carrinho || []).length || 0), 0)
  const valorTotal     = carrinhos.reduce((s, c) =>
    s + (c.itens || c.carrinho || []).reduce((si, item) => si + Number(item.price || 0), 0), 0
  )

  const carrinhosFiltrados = carrinhos.filter(c => {
    const reviewed = !!c.reviewed
    if (filtro === 'nao') return !reviewed
    if (filtro === 'sim') return reviewed
    return true
  })

  async function marcarRevisado(id, value) {
    try {
      await fetch('/api/carrinhos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reviewed: value }),
      })
      setCarrinhos(prev => prev.map(c => (c.id === id || c.clienteId === id) ? { ...c, reviewed: value } : c))
    } catch {
      // silent
    }
  }

  if (loading) return (
    <div className="flex-center" style={{ height: '60vh', gap: '1rem' }}>
      <div className="spinner" style={{ width: '32px', height: '32px' }} />
      <span style={{ color: 'var(--text-muted)' }}>Carregando carrinhos...</span>
    </div>
  )

  return (
    <>
      <div className="admin-header">
        <div>
          <Link href="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>← Dashboard</Link>
          <h1 className="admin-page-title" style={{ marginTop: '0.25rem' }}>Carrinhos Ativos</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Visualize os carrinhos de contas cadastradas que possuem itens.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>Atualizar</button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <p className="stat-label">Total de Carrinhos</p>
          <p className="stat-value">{totalCarrinhos}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total de Itens</p>
          <p className="stat-value">{totalItens}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Valor Total</p>
          <p className="stat-value" style={{ color: 'var(--accent)', fontSize: '1.5rem' }}>
            {formatCurrency(valorTotal)}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginRight: '0.5rem' }}>Filtrar:</span>
        {[
          { key: 'nao', label: 'Não revisados' },
          { key: 'sim', label: 'Revisados' },
          { key: 'todos', label: 'Todos' },
        ].map(f => (
          <button
            key={f.key}
            className={`btn btn-sm ${filtro === f.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltro(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista de carrinhos */}
      {carrinhos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🛒</div>
          <h2 className="empty-state-title">Nenhum carrinho ativo</h2>
          <p>Nenhum cliente cadastrado possui itens no carrinho.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {carrinhosFiltrados.map(carrinho => {
            const cartOwnerId = carrinho.clienteId || carrinho.id
            const itens      = carrinho.itens || carrinho.carrinho || []
            const totalCart  = itens.reduce((s, item) => s + Number(item.price || 0), 0)
            const aberto     = expandido === cartOwnerId

            return (
              <div key={cartOwnerId} style={{
                background: 'var(--bg-card)',
                border: `1px solid ${aberto ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}>
                {/* Linha resumo */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1rem 1.25rem', cursor: 'pointer',
                  }}
                  onClick={() => setExpandido(aberto ? null : cartOwnerId)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: '600', color: 'var(--text)', fontSize: '0.95rem' }}>
                      {carrinho.nome || carrinho.nomeCompleto || '—'}
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                      {carrinho.email && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          {carrinho.email}
                        </span>
                      )}
                      {carrinho.whatsapp && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          {formatarWhatsApp(carrinho.whatsapp) || carrinho.whatsapp}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Itens badge */}
                  <span style={{
                    fontSize: '0.75rem',
                    background: 'var(--accent-dim)',
                    color: 'var(--accent)',
                    padding: '0.15rem 0.6rem',
                    borderRadius: '100px',
                    flexShrink: 0,
                  }}>
                    {itens.length} {itens.length === 1 ? 'item' : 'itens'}
                  </span>

                  {/* Total */}
                  <p style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '1.15rem',
                    color: 'var(--accent)',
                    flexShrink: 0,
                  }}>
                    {formatCurrency(totalCart)}
                  </p>

                  {/* Seta */}
                  <span style={{
                    color: 'var(--text-dim)', fontSize: '1rem',
                    transform: aberto ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.2s', flexShrink: 0,
                  }}>›</span>
                </div>

                {/* Detalhe expandido */}
                {aberto && (
                  <div style={{
                    borderTop: '1px solid var(--border)',
                    padding: '1.25rem',
                    background: 'var(--bg-secondary)',
                  }}>
                    <p style={{
                      fontSize: '0.72rem', letterSpacing: '0.1em',
                      textTransform: 'uppercase', color: 'var(--text-muted)',
                      marginBottom: '0.75rem',
                    }}>
                      Itens no carrinho
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                      {itens.map((item, i) => (
                        <div key={item.id || i} style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          background: 'var(--bg-card)', borderRadius: 'var(--radius)',
                          padding: '0.5rem 0.75rem',
                        }}>
                          <img
                            src={getFirstUrl(getPhotoCartPreviewCandidates(item))}
                            alt=""
                            style={{
                              width: '48px', height: '36px',
                              objectFit: 'cover', borderRadius: '3px', flexShrink: 0,
                            }}
                            onError={e => {
                              if (!applyNextImageFallback(e.target, getPhotoCartPreviewCandidates(item))) e.target.style.display = 'none'
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text)' }}>
                              {item.eventName || '—'}
                              {item.publicId && (
                                <span style={{
                                  color: 'var(--accent)', marginLeft: '0.5rem',
                                  fontSize: '0.72rem', fontFamily: 'monospace',
                                }}>
                                  #{item.publicId}
                                </span>
                              )}
                            </p>
                            <p style={{
                              fontSize: '0.7rem', color: 'var(--text-dim)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {item.originalName || item.filename || '—'}
                            </p>
                          </div>
                          <span style={{ color: 'var(--accent)', fontSize: '0.85rem', flexShrink: 0 }}>
                            {formatCurrency(item.price)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {carrinho.clientComment && (
                      <div style={{ marginBottom: '1rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>
                          Mensagem para o fotografo
                        </p>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text)' }}>
                          {carrinho.clientComment}
                        </p>
                      </div>
                    )}

                    {/* Rodape com total e acao WhatsApp */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      paddingTop: '0.75rem', borderTop: '1px solid var(--border)',
                    }}>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Total:
                        <strong style={{
                          color: 'var(--accent)', marginLeft: '0.5rem',
                          fontFamily: 'var(--font-heading)', fontSize: '1.05rem',
                        }}>
                          {formatCurrency(totalCart)}
                        </strong>
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {carrinho.whatsapp && (
                          <a
                            href={buildWhatsAppHref(carrinho.whatsapp)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm"
                            style={{
                              background: '#25D366', color: 'white', border: 'none',
                              textDecoration: 'none', textAlign: 'center',
                            }}
                            onClick={e => e.stopPropagation()}
                          >
                            Contatar via WhatsApp
                          </a>
                        )}
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={(e) => { e.stopPropagation(); marcarRevisado(cartOwnerId, !carrinho.reviewed) }}
                          title="Marcar como revisado"
                        >
                          {carrinho.reviewed ? 'Desmarcar revisado' : 'Marcar revisado'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
