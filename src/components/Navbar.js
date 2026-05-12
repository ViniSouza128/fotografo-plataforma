'use client'
// src/components/Navbar.js

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { hasGuestOrderAccess } from '@/lib/guestOrders'

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const loginHref = `/login?returnTo=${encodeURIComponent(pathname)}`
  const [cartCount, setCartCount] = useState(0)
  const [adminLogado, setAdminLogado] = useState(false)
  const [clienteLogado, setClienteLogado] = useState(null)
  const [hasGuestOrders, setHasGuestOrders] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const update = useCallback(() => {
    try {
      const cart = JSON.parse(localStorage.getItem('carrinho') || '[]')
      setCartCount(cart.length)
    } catch { setCartCount(0) }

    try {
      const raw = localStorage.getItem('clienteLogado')
      const cliente = raw ? JSON.parse(raw) : null
      setClienteLogado(cliente)
      setAdminLogado(!!(cliente?.isAdmin && localStorage.getItem('adminLogado') === 'true'))
      setHasGuestOrders(hasGuestOrderAccess())
    } catch {
      setClienteLogado(null)
      setAdminLogado(false)
      setHasGuestOrders(false)
    }
  }, [])

  // Sincroniza dados do usuário com o servidor para refletir mudanças de privilégio
  // feitas pelo admin (ex: promoção a admin enquanto a pessoa estava logada)
  const syncComServidor = useCallback(async () => {
    if (localStorage.getItem('adminLogado') !== 'true' && !localStorage.getItem('clienteLogado')) return
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      if (!res.ok) return
      const { client } = await res.json()
      if (!client) return
      // Atualiza localStorage com dados frescos do servidor
      localStorage.setItem('clienteLogado', JSON.stringify(client))
      // Se virou admin, garante que a flag adminLogado está marcada
      if (client.isAdmin && localStorage.getItem('adminLogado') !== 'true') {
        localStorage.setItem('adminLogado', 'true')
      }
      // Se perdeu admin, limpa a flag
      if (!client.isAdmin && localStorage.getItem('adminLogado') === 'true') {
        localStorage.removeItem('adminLogado')
      }
      update()
    } catch { /* silencioso */ }
  }, [update])

  useEffect(() => {
    update()
    syncComServidor()
    window.addEventListener('cartUpdated', update)
    window.addEventListener('authUpdated', update)
    window.addEventListener('guestOrdersUpdated', update)
    return () => {
      window.removeEventListener('cartUpdated', update)
      window.removeEventListener('authUpdated', update)
      window.removeEventListener('guestOrdersUpdated', update)
    }
  }, [update, syncComServidor])

  // Close drawer on route change
  useEffect(() => { setMenuOpen(false) }, [pathname])

  // Prevent body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const firstName = clienteLogado
    ? (clienteLogado.nomeCompleto || '').split(' ')[0] || 'Conta'
    : null

  return (
    <>
      <nav className="navbar">
        {/* Brand */}
        <Link href="/" className="navbar-brand">
          Vinícius<span>.</span>
        </Link>

        {/* Desktop links */}
        <div className="navbar-links">
          {adminLogado && (
            <Link href="/admin" className="navbar-link" style={{ color: 'var(--accent)' }}>
              ⚙️ Área do fotógrafo
            </Link>
          )}

          {clienteLogado ? (
            <Link href="/minha-conta" className="navbar-link" style={{ color: 'var(--accent)' }}>
              👤 Área do Cliente
            </Link>
          ) : (
            <>
              {hasGuestOrders && (
                <Link href="/compras" className="navbar-link">Compras</Link>
              )}
              <Link href={loginHref} className="navbar-link navbar-link-login">Entrar</Link>
            </>
          )}

          <Link href="/carrinho" className="navbar-cart">
            🛒 Carrinho
            {cartCount > 0 && (
              <span style={{
                background: 'var(--accent)', color: '#1a1200',
                borderRadius: '50%', width: '18px', height: '18px',
                fontSize: '0.7rem', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 600,
              }}>
                {cartCount}
              </span>
            )}
          </Link>
        </div>

        {/* Mobile: cart icon + hamburger */}
        <div className="navbar-mobile-right" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Link href="/carrinho" className="navbar-cart-mobile" aria-label={`Carrinho${cartCount > 0 ? ` (${cartCount})` : ''}`}
            style={{ position: 'relative', fontSize: '1.2rem', textDecoration: 'none', color: cartCount > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
            
            {cartCount > 0 && (
              <span style={{
                position: 'absolute', top: '-5px', right: '-7px',
                background: 'var(--accent)', color: '#000',
                borderRadius: '50%', width: '16px', height: '16px',
                fontSize: '0.6rem', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 700,
              }}>{cartCount}</span>
            )}
          </Link>

          <button
            className="navbar-hamburger"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              /* X icon */
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              /* Hamburger icon */
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div className={`navbar-drawer${menuOpen ? ' open' : ''}`} role="dialog" aria-modal="true">
        <Link href="/" className="navbar-drawer-link" onClick={() => setMenuOpen(false)}>
          <span>🏠</span> Home
        </Link>

        {adminLogado && (
          <Link href="/admin" className="navbar-drawer-link accent" onClick={() => setMenuOpen(false)}>
            <span>⚙️</span> Área do fotógrafo
          </Link>
        )}

        {clienteLogado ? (
          <>
            <Link href="/minha-conta" className="navbar-drawer-link accent" onClick={() => setMenuOpen(false)}>
              <span>👤</span> Área do Cliente
            </Link>
            <Link href="/minha-conta/compras" className="navbar-drawer-link" onClick={() => setMenuOpen(false)}>
              <span>📦</span> Minhas Compras
            </Link>
            <Link href="/minha-conta/carrinho" className="navbar-drawer-link" onClick={() => setMenuOpen(false)}>
              <span>🛒</span> Meu Carrinho
            </Link>
            <Link href="/minha-conta/favoritos" className="navbar-drawer-link" onClick={() => setMenuOpen(false)}>
              <span>★</span> Salvos
            </Link>
            <Link href="/minha-conta/configuracoes" className="navbar-drawer-link" onClick={() => setMenuOpen(false)}>
              <span>⚙️</span> Configurações
            </Link>
          </>
        ) : (
          <>
            {hasGuestOrders && (
              <Link href="/compras" className="navbar-drawer-link" onClick={() => setMenuOpen(false)}>
                <span>🧾</span> Compras deste navegador
              </Link>
            )}
            <Link href={loginHref} className="navbar-drawer-link accent" onClick={() => setMenuOpen(false)}>
              <span>🔑</span> Entrar
            </Link>
            <Link href="/cadastro" className="navbar-drawer-link" onClick={() => setMenuOpen(false)}>
              <span>✨</span> Criar conta
            </Link>
          </>
        )}

        <Link href="/carrinho" className="navbar-drawer-cart" onClick={() => setMenuOpen(false)}>
          <span>🛒 Carrinho</span>
          {cartCount > 0 ? (
            <span style={{
              background: 'var(--accent)', color: '#000',
              borderRadius: '100px', padding: '0.1rem 0.5rem',
              fontSize: '0.78rem', fontWeight: 700,
            }}>
              {cartCount} item{cartCount !== 1 ? 's' : ''}
            </span>
          ) : (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Vazio</span>
          )}
        </Link>
      </div>

      {/* Backdrop for mobile drawer */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed', inset: 0, top: '58px',
            background: 'rgba(0,0,0,0.5)', zIndex: 198,
          }}
        />
      )}
    </>
  )
}

