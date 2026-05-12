'use client'
// src/app/minha-conta/page.js
// Dashboard do cliente - visao geral com cards de estatisticas e compras recentes

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getFinancialStatus, getFinancialToneStyle, getPedidoItens } from '@/lib/commerceUtils'
import { applyNextImageFallback, getFirstUrl, getPhotoCartPreviewCandidates, getUploadsUrlFallbackCandidates } from '@/lib/imagePaths'
import { persistGuestCart } from '@/lib/guestCart'

export default function MinhaContaPage() {
  const router = useRouter()
  const [cliente, setCliente] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [comentarios, setComentarios] = useState([])
  const [cartCount, setCartCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [rewards, setRewards] = useState(null)

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch fresh client data from API
        const meRes = await fetch('/api/auth/me')
        if (meRes.ok) {
          const meData = await meRes.json()
          setCliente(meData.client)
          localStorage.setItem('clienteLogado', JSON.stringify(meData.client))
        } else {
          const errorData = await meRes.json().catch(() => ({}))
          if (errorData?.code === 'must_change_password') {
            router.replace(`/trocar-senha?returnTo=${encodeURIComponent('/minha-conta')}`)
            return
          }
          // Fallback to localStorage
          const raw = localStorage.getItem('clienteLogado')
          if (raw) setCliente(JSON.parse(raw))
        }

        // Fetch all pedidos
        const pedidosRes = await fetch('/api/pedidos?meu=1')
        if (pedidosRes.ok) {
          const allPedidos = await pedidosRes.json()
          setPedidos(allPedidos)
        }
      } catch {
        // Fallback to localStorage
        const raw = localStorage.getItem('clienteLogado')
        if (raw) setCliente(JSON.parse(raw))
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    if (cliente?.mustChangePassword) {
      router.replace(`/trocar-senha?returnTo=${encodeURIComponent('/minha-conta')}`)
    }
  }, [cliente?.mustChangePassword, router])

  useEffect(() => {
    if (!cliente?.id) return
    let cancelled = false

    async function loadComentarios() {
      try {
        const params = new URLSearchParams({
          clientId: cliente.id,
          includeHidden: '1',
          includeHistory: '1',
          includeContext: '1',
          sort: 'top',
        })
        const res = await fetch(`/api/comentarios?${params.toString()}`)
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) setComentarios(Array.isArray(data) ? data : [])
          return
        }
      } catch {}

      try {
        const params = new URLSearchParams({
          clientId: cliente.id,
          includeContext: '1',
          sort: 'top',
        })
        const fallback = await fetch(`/api/comentarios?${params.toString()}`)
        const data = fallback.ok ? await fallback.json() : []
        if (!cancelled) setComentarios(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setComentarios([])
      }
    }

    loadComentarios()
    return () => { cancelled = true }
  }, [cliente?.id])

  useEffect(() => {
    if (!cliente?.id) return
    let cancelled = false
    async function loadRewards() {
      try {
        const res = await fetch('/api/rewards/me')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setRewards(data)
      } catch {}
    }
    loadRewards()
    return () => { cancelled = true }
  }, [cliente?.id])

  useEffect(() => {
    function updateCartCount() {
      try {
        const cart = JSON.parse(localStorage.getItem('carrinho') || '[]')
        setCartCount(Array.isArray(cart) ? cart.length : 0)
      } catch {
        setCartCount(0)
      }
    }

    updateCartCount()
    window.addEventListener('cartUpdated', updateCartCount)
    return () => window.removeEventListener('cartUpdated', updateCartCount)
  }, [])

  useEffect(() => {
    if (!cliente?.id) return
    let cancelled = false
    async function loadServerCartCount() {
      try {
        const res = await fetch('/api/carrinhos?meu=1')
        if (!res.ok) return
        const data = await res.json()
        const serverCart = Array.isArray(data.carrinho) ? data.carrinho : []
        if (cancelled) return
        const localCart = JSON.parse(localStorage.getItem('carrinho') || '[]')
        const localCount = Array.isArray(localCart) ? localCart.length : 0
        if (serverCart.length > 0) {
          if (localCount === 0) {
            persistGuestCart(serverCart)
            window.dispatchEvent(new Event('cartUpdated'))
          }
        }
        setCartCount(Math.max(localCount, serverCart.length))
      } catch {}
    }
    loadServerCartCount()
    return () => { cancelled = true }
  }, [cliente?.id])

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '40vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  if (!cliente) return null

  // Filter pedidos belonging to this client
  const meusPedidos = pedidos.filter(p =>
    p.clientId === cliente.id ||
    (p.whatsapp && cliente.whatsapp && p.whatsapp === cliente.whatsapp)
  )

  const firstName = (cliente.nomeCompleto || '').split(' ')[0] || 'Cliente'
  const totalCompras = meusPedidos.length
  const fotosCompradas = meusPedidos.reduce((sum, p) => sum + getPedidoItens(p).length, 0)
  const favoritosLista = Array.isArray(cliente.favoritos) ? cliente.favoritos : []
  const fotosFavoritadas = favoritosLista.filter(id => typeof id === 'string' && !id.startsWith('album:')).length
  const albunsSalvos = favoritosLista.filter(id => typeof id === 'string' && id.startsWith('album:')).length
  const fotosCurtidas = (cliente.curtidas || []).length

  const pedidosRecentes = [...meusPedidos]
    .sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0))
    .slice(0, 5)

  const statCards = [
    { label: 'Itens no Carrinho', value: cartCount, color: '#22d3ee', href: '/minha-conta/carrinho' },
    { label: 'Total de Compras', value: totalCompras, color: 'var(--accent)', href: '/minha-conta/compras' },
    { label: 'Fotos Compradas', value: fotosCompradas, color: '#60a5fa', href: '/minha-conta/compras' },
    { label: 'Fotos Salvas', value: fotosFavoritadas, color: '#f59e0b', href: '/minha-conta/favoritos' },
    { label: 'Álbuns Salvos', value: albunsSalvos, color: '#f97316', href: '/minha-conta/favoritos' },
    { label: 'Fotos Curtidas', value: fotosCurtidas, color: '#ec4899', href: '/minha-conta/favoritos' },
  ]

  return (
    <div>
      {/* Welcome */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '2rem',
          marginBottom: '0.25rem',
        }}>
          Ola, {firstName}!
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Veja um resumo da sua conta
        </p>
      </div>

      {/* Stat cards grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2.5rem',
      }}>
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = card.color
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <p style={{
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
              marginBottom: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {card.label}
            </p>
            <p style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '2rem',
              color: card.color,
              fontWeight: '500',
            }}>
              {card.value}
            </p>
          </Link>
        ))}
      </div>

      {/* Rewards card */}
      {rewards?.ativo && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem',
          marginBottom: '2rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', margin: 0 }}>
                🎁 Meu programa de recompensas
              </h2>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Saldo disponível para usar no checkout
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saldo</p>
              <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', color: 'var(--accent)', margin: 0 }}>
                R$ {Number(rewards.saldo || 0).toFixed(2).replace('.', ',')}
              </p>
            </div>
          </div>

          {/* Status do nivel */}
          {rewards.nivelAtual ? (
            <div style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
              padding: '1rem',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-secondary)',
              borderLeft: `3px solid ${rewards.nivelAtual.color || 'var(--accent)'}`,
              marginBottom: '0.75rem',
            }}>
              <span style={{ fontSize: '2rem' }}>{rewards.nivelAtual.icon || '🏅'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Seu nível atual</p>
                <p style={{ margin: '0.1rem 0 0', fontSize: '1.05rem', fontWeight: 600, color: rewards.nivelAtual.color || 'var(--text)' }}>
                  {rewards.nivelAtual.nome}
                </p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {rewards.beneficio?.descontoPct > 0 && <span>{rewards.beneficio.descontoPct}% desconto · </span>}
                  {rewards.beneficio?.cashbackPct > 0 && <span>{rewards.beneficio.cashbackPct}% cashback · </span>}
                  {rewards.beneficio?.saldoFlat > 0 && <span>R$ {Number(rewards.beneficio.saldoFlat).toFixed(2).replace('.', ',')} de saldo · </span>}
                  <span>Acumulação: {rewards.acumulacao === 'soma' ? 'soma de níveis' : 'maior nível'}</span>
                </p>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '1rem',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-secondary)',
              marginBottom: '0.75rem',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
            }}>
              Você ainda não atingiu nenhum nível. Continue comprando para desbloquear benefícios!
            </div>
          )}

          {/* Progresso para o proximo nivel */}
          {rewards.proximoNivel && rewards.progresso && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Próximo: <strong style={{ color: rewards.proximoNivel.color || 'var(--text)' }}>
                    {rewards.proximoNivel.icon} {rewards.proximoNivel.nome}
                  </strong>
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  {rewards.progresso.pct.toFixed(1)}%
                </span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-input)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${rewards.progresso.pct}%`,
                  background: rewards.proximoNivel.color || 'var(--accent)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
                {rewards.progresso.faltaCompras > 0 && <span>Faltam R$ {rewards.progresso.faltaCompras.toFixed(2).replace('.', ',')} em compras</span>}
                {rewards.progresso.faltaCompras > 0 && rewards.progresso.faltaPedidos > 0 && <span> e </span>}
                {rewards.progresso.faltaPedidos > 0 && <span>{rewards.progresso.faltaPedidos} pedido(s)</span>}
                {rewards.progresso.faltaCompras === 0 && rewards.progresso.faltaPedidos === 0 && <span>Você está prestes a subir de nível!</span>}
              </p>
            </div>
          )}

          {/* Niveis disponiveis */}
          {Array.isArray(rewards.niveisDisponiveis) && rewards.niveisDisponiveis.length > 1 && (
            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Ver todos os níveis ({rewards.niveisDisponiveis.length})
              </summary>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
                {rewards.niveisDisponiveis.map(n => {
                  const isCurrent = rewards.nivelAtual?.id === n.id
                  const beneficioLabel = n.beneficioTipo === 'desconto' ? `${n.beneficioValor}% desconto`
                    : n.beneficioTipo === 'cashback' ? `${n.beneficioValor}% cashback`
                    : `R$ ${Number(n.beneficioValor).toFixed(2).replace('.', ',')} saldo`
                  return (
                    <div key={n.id} style={{
                      padding: '0.6rem',
                      borderRadius: 'var(--radius)',
                      background: isCurrent ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                      border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                      fontSize: '0.78rem',
                    }}>
                      <p style={{ margin: 0, fontWeight: 600, color: n.color }}>{n.icon} {n.nome}</p>
                      <p style={{ margin: '0.15rem 0 0', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        {beneficioLabel}
                      </p>
                      <p style={{ margin: '0.15rem 0 0', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                        Meta: {n.metaCompras > 0 ? `R$ ${Number(n.metaCompras).toFixed(0)}` : '—'}
                        {n.metaPedidos > 0 && ` · ${n.metaPedidos} pedido(s)`}
                      </p>
                    </div>
                  )
                })}
              </div>
            </details>
          )}

          {/* Historico recente de saldo */}
          {Array.isArray(rewards.saldoHistorico) && rewards.saldoHistorico.length > 0 && (
            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Histórico de saldo ({rewards.saldoHistorico.length})
              </summary>
              <div style={{ marginTop: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                {rewards.saldoHistorico.slice(0, 10).map(h => (
                  <div key={h.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.4rem 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '0.78rem',
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.motivo}</p>
                      <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                        {new Date(h.criadoEm).toLocaleDateString('pt-BR')} {new Date(h.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span style={{
                      color: h.tipo === 'credito' ? 'var(--success)' : 'var(--danger)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      marginLeft: '0.5rem',
                    }}>
                      {h.tipo === 'credito' ? '+' : '-'} R$ {Number(h.valor).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Recent purchases */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
        marginBottom: '2rem',
      }}>
        <div className="flex-between" style={{ marginBottom: '1rem' }}>
          <h2 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.2rem',
          }}>
            Compras Recentes
          </h2>
          {meusPedidos.length > 5 && (
            <Link
              href="/minha-conta/compras"
              style={{ color: 'var(--accent)', fontSize: '0.85rem' }}
            >
              Ver todas
            </Link>
          )}
        </div>

        {pedidosRecentes.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', padding: '1rem 0' }}>
            Nenhuma compra realizada ainda.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {pedidosRecentes.map(p => {
              const data = new Date(p.criadoEm)
              const dataStr = data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              const itensPedido = getPedidoItens(p)
              const financialStatus = getFinancialStatus(p)
              const st = getFinancialToneStyle(financialStatus.tone)

              return (
                <Link
                  key={p.id}
                  href="/minha-conta/compras"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.95rem 1rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius)',
                    gap: '1rem',
                    flexWrap: 'wrap',
                    textDecoration: 'none',
                    border: '1px solid transparent',
                    transition: 'border-color 0.2s, transform 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.transform = 'translateY(0)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: '1 1 360px' }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 36px)',
                      gridTemplateRows: 'repeat(2, 28px)',
                      gap: '4px',
                      padding: '4px',
                      background: 'var(--bg-input)',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      flexShrink: 0,
                    }}>
                      {itensPedido.slice(0, 4).map((item, idx) => {
                        const thumbCandidates = getPhotoCartPreviewCandidates(item)
                        const thumbSrc = getFirstUrl(thumbCandidates)
                        return (
                          <div key={`${p.id}-${idx}`} style={{
                            width: '36px',
                            height: '28px',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            background: 'var(--bg-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-dim)',
                            fontSize: '0.6rem',
                          }}>
                            {thumbSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumbSrc}
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
                              '—'
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                        Pedido <span style={{ color: 'var(--accent)' }}>#{p.publicId || p.id.slice(0, 8)}</span>
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        {dataStr} - {itensPedido.length} {itensPedido.length === 1 ? 'foto' : 'fotos'}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '100px',
                      background: st.bg,
                      color: st.color,
                      fontWeight: '500',
                    }}>
                      {financialStatus.label}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-heading)',
                      fontSize: '0.95rem',
                      color: 'var(--text)',
                    }}>
                      R$ {Number(p.total).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
      }}>
        <div className="flex-between" style={{ marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', margin: 0 }}>
              Seus Comentarios
            </h2>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>
              {comentarios.length} registro{comentarios.length !== 1 ? 's' : ''}
            </span>
          </div>
          <Link href="/minha-conta/comentarios" className="btn btn-ghost btn-sm">
            Ver todos
          </Link>
        </div>

        {comentarios.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', padding: '0.5rem 0' }}>
            Voce ainda nao comentou em nenhum album ou pasta.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {comentarios.slice(0, 5).map(c => {
              const ctx = c.context || null
              const thumbUrl = ctx?.thumbUrl || null
              const thumbCandidates = getUploadsUrlFallbackCandidates(thumbUrl)
              const albumNome = ctx?.album?.nome || c.eventId || null
              const pastaNome = ctx?.pasta?.nome || c.pasta || null
              const fotoId = ctx?.foto?.id || c.photoId || null
              const scopeLabel = c.photoId
                ? 'Foto'
                : c.pasta
                  ? `Pasta: ${c.pasta}`
                  : 'Album'
              const statusLabel = c.visivel
                ? 'Visivel no site'
                : c.statusOmissao === 'omitido_por_admin'
                  ? 'Omitido por admin'
                  : 'Omitido por voce'
              return (
                <div
                  key={c.id}
                  style={{
                    padding: '0.9rem 1rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius)',
                    border: `1px solid ${c.visivel ? 'var(--border)' : 'rgba(239,68,68,0.25)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent)', background: 'var(--accent-dim)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>{scopeLabel}</span>
                    {c.parentId && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                        Resposta
                      </span>
                    )}
                    <span style={{ fontSize: '0.72rem', color: c.visivel ? 'var(--success)' : 'var(--danger)' }}>
                      {statusLabel}
                    </span>
                    {c.foiEditadoPorAdmin && (
                      <span style={{ fontSize: '0.7rem', color: '#93c5fd', background: 'rgba(59,130,246,0.15)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                        Editado por admin
                      </span>
                    )}
                    {!c.foiEditadoPorAdmin && c.foiEditado && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                        Editado
                      </span>
                    )}
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      {new Date(c.criadoEm || c.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.55rem', flexWrap: 'wrap' }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-input)',
                      overflow: 'hidden',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-dim)',
                      fontSize: '0.7rem',
                    }}>
                      {thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbUrl}
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
                        'sem capa'
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: '220px' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {albumNome && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                            <strong>Album:</strong> {albumNome}
                          </span>
                        )}
                        {pastaNome && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                            <strong>Pasta:</strong> {pastaNome}
                          </span>
                        )}
                        {fotoId && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                            <strong>Foto:</strong> {String(fotoId).slice(0, 10)}...
                          </span>
                        )}
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                          <strong>Curtidas:</strong> {Number(c.curtidas || 0)}
                        </span>
                      </div>
                      {ctx?.url && (
                        <div style={{ marginTop: '0.25rem' }}>
                          <Link href={ctx.url} style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none' }}>
                            Abrir no local do comentario
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                  <p style={{ color: 'var(--text)', fontSize: '0.86rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {c.texto}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
