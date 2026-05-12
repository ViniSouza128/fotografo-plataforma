'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { applyNextImageFallback, getFirstUrl, getPhotoCartPreviewCandidates } from '@/lib/imagePaths'
import { isPedidoCompraConcluida } from '@/lib/commerceUtils'
import { readGuestOrderAccessList, removeGuestOrderAccess, saveGuestApprovedOrderAccess } from '@/lib/guestOrders'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR')
}

function buildSecureDownloadHref(photoId, pedidoId, token) {
  if (!photoId || !pedidoId || !token) return '#'
  const params = new URLSearchParams({ pedidoId, token })
  return `/api/photos/${photoId}/download?${params.toString()}`
}

export default function ComprasGuestPage() {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadGuestOrders() {
      setLoading(true)
      setError('')
      try {
        const entries = readGuestOrderAccessList()
        if (entries.length === 0) {
          if (active) setOrders([])
          return
        }

        const results = await Promise.all(entries.map(async (entry) => {
          try {
            const params = new URLSearchParams({
              pedidoId: entry.pedidoId,
              token: entry.token,
            })
            const response = await fetch(`/api/pagamento/status?${params.toString()}`)
            if (!response.ok) {
              return {
                pedidoId: entry.pedidoId,
                unavailable: true,
              }
            }

            const data = await response.json()
            const resolvedToken = data.downloadToken || entry.token
            if (data?.pedido?.id && resolvedToken && isPedidoCompraConcluida(data.pedido.status)) {
              saveGuestApprovedOrderAccess({
                pedidoId: data.pedido.id,
                token: resolvedToken,
                status: data.pedido.status,
              })
              window.dispatchEvent(new Event('guestOrdersUpdated'))
            }

            return {
              pedidoId: entry.pedidoId,
              statusToken: resolvedToken,
              paid: !!data.paid,
              status: data.status || data.pedido?.status || null,
              pedido: data.pedido || null,
            }
          } catch {
            return {
              pedidoId: entry.pedidoId,
              unavailable: true,
            }
          }
        }))

        if (!active) return
        setOrders(results)
      } catch {
        if (!active) return
        setError('Não foi possível carregar suas compras salvas neste navegador.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadGuestOrders()
    return () => { active = false }
  }, [])

  const availableOrders = useMemo(
    () => orders.filter(entry => entry?.pedido && !entry.unavailable),
    [orders]
  )

  return (
    <>
      <Navbar />
      <main className="page-container">
        <div className="page-header">
          <h1 className="page-title">Compras deste navegador</h1>
          <p className="page-subtitle">Acesso para pedidos guest aprovados salvos localmente.</p>
        </div>

        {loading && (
          <div className="flex-center" style={{ minHeight: '40vh' }}>
            <div className="spinner" style={{ width: '32px', height: '32px' }} />
          </div>
        )}

        {!loading && error && (
          <div className="alert alert-error">{error}</div>
        )}

        {!loading && !error && availableOrders.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <h2 className="empty-state-title">Nenhuma compra guest encontrada</h2>
            <p>Quando você concluir um pedido sem login, ele ficará disponível aqui neste navegador.</p>
            <Link href="/" className="btn btn-primary mt-3">Ver Eventos</Link>
          </div>
        )}

        {!loading && !error && availableOrders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {availableOrders.map(entry => {
              const pedido = entry.pedido
              const paid = isPedidoCompraConcluida(entry.status)

              return (
                <section key={pedido.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <div>
                      <p style={{ color: 'var(--accent)', fontFamily: 'var(--font-heading)' }}>
                        Pedido #{pedido.publicId || pedido.id.slice(0, 8)}
                      </p>
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                        {formatDate(pedido.criadoEm)} · {Array.isArray(pedido.itens) ? pedido.itens.length : 0} itens
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontFamily: 'var(--font-heading)' }}>R$ {Number(pedido.total || 0).toFixed(2).replace('.', ',')}</p>
                      <p style={{ fontSize: '0.75rem', color: paid ? 'var(--success)' : 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {paid ? 'Compra concluída' : (entry.status || 'Pendente')}
                      </p>
                    </div>
                  </div>

                  {paid ? (
                    <div className="download-list" style={{ textAlign: 'left' }}>
                      {(pedido.itens || []).map((item, index) => {
                        const thumbCandidates = getPhotoCartPreviewCandidates(item)
                        const photoId = item.photoId || item.id || null

                        return (
                          <div key={`${pedido.id}-${photoId || index}`} className="download-item">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <img
                                src={getFirstUrl(thumbCandidates)}
                                alt=""
                                style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 4 }}
                                onError={e => {
                                  if (!applyNextImageFallback(e.target, thumbCandidates)) {
                                    e.target.style.display = 'none'
                                  }
                                }}
                              />
                              <div>
                                <p style={{ fontSize: '0.85rem' }}>
                                  {item.eventName || 'Evento'}
                                  {item.publicId && <span style={{ color: 'var(--accent)', marginLeft: '0.5rem', fontSize: '0.75rem' }}>#{item.publicId}</span>}
                                </p>
                                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>R$ {Number(item.price || 0).toFixed(2).replace('.', ',')}</p>
                              </div>
                            </div>
                            <a
                              href={buildSecureDownloadHref(photoId, pedido.id, entry.statusToken)}
                              download={item.originalName || item.filename}
                              className="btn btn-success btn-sm"
                            >
                              ⬇ Baixar
                            </a>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="alert alert-info" style={{ marginTop: '0.5rem' }}>
                      Pagamento ainda não confirmado para este pedido.
                    </div>
                  )}

                  <div style={{ marginTop: '0.9rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--text-dim)' }}
                      onClick={() => {
                        removeGuestOrderAccess(pedido.id)
                        window.dispatchEvent(new Event('guestOrdersUpdated'))
                        setOrders(prev => prev.filter(item => item.pedidoId !== pedido.id))
                      }}
                    >
                      Remover deste navegador
                    </button>
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </main>
      <Footer />
    </>
  )
}
