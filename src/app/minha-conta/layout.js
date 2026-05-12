'use client'
// src/app/minha-conta/layout.js

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Avatar from '@/components/Avatar'

const BASE_NAV_ITEMS = [
  { href: '/minha-conta', label: 'Início' },
  { href: '/minha-conta/compras', label: 'Compras' },
  { href: '/minha-conta/carrinho', label: 'Carrinho' },
  { href: '/minha-conta/comentarios', label: 'Comentários' },
  { href: '/minha-conta/remocoes', label: 'Remoções' },
  { href: '/minha-conta/favoritos', label: 'Salvos' },
  { href: '/minha-conta/notificacoes', label: 'Notificações' },
  { href: '/minha-conta/chat', label: 'Chat' },
  { href: '/minha-conta/reconhecimento', label: 'Reconhecimento' },
  { href: '/minha-conta/configuracoes', label: 'Configurações' },
]

export default function MinhaContaLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const [verificando, setVerificando] = useState(true)
  const [cliente, setCliente] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [chatCount, setChatCount] = useState(0)
  const pollRef = useRef(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado')
      if (!raw) {
        router.replace('/login')
        return
      }
      const parsed = JSON.parse(raw)
      if (!parsed || !parsed.id) {
        router.replace('/login')
        return
      }
      setCliente(parsed)
      setVerificando(false)
    } catch {
      router.replace('/login')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function syncFromStorage() {
      try {
        const raw = localStorage.getItem('clienteLogado')
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (parsed?.id) setCliente(parsed)
      } catch {}
    }
    window.addEventListener('authUpdated', syncFromStorage)
    return () => window.removeEventListener('authUpdated', syncFromStorage)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
    if (pathname === '/minha-conta/notificacoes') setNotifCount(0)
    if (pathname === '/minha-conta/chat') setChatCount(0)
  }, [pathname])

  useEffect(() => {
    if (verificando) return
    async function fetchCounts() {
      try {
        const [resN, resC] = await Promise.all([
          fetch('/api/notificacoes?count=1'),
          fetch('/api/chat?count=1'),
        ])
        if (resN.ok) {
          const data = await resN.json()
          setNotifCount(Number(data.count) || 0)
        }
        if (resC.ok) {
          const data = await resC.json()
          setChatCount(Number(data.count) || 0)
        }
      } catch {}
    }
    fetchCounts()
    pollRef.current = setInterval(fetchCounts, 60_000)
    return () => clearInterval(pollRef.current)
  }, [verificando])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleLogout() {
    localStorage.removeItem('clienteLogado')
    localStorage.removeItem('adminLogado')
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    window.dispatchEvent(new Event('authUpdated'))
    router.push('/')
  }

  if (verificando) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div className="spinner" style={{ width: '40px', height: '40px' }} />
      </div>
    )
  }

  const firstName = (cliente?.nomeCompleto || '').split(' ')[0] || 'Conta'
  const navItems = BASE_NAV_ITEMS.map(item => {
    if (item.href === '/minha-conta/notificacoes' && notifCount > 0) return { ...item, badge: notifCount }
    if (item.href === '/minha-conta/chat' && chatCount > 0) return { ...item, badge: chatCount }
    return item
  })
  const activeLabel = navItems.find(item => pathname === item.href)?.label || 'Início'

  return (
    <div className="mc-shell">
      <nav className="mc-navbar">
        <Link href="/" className="mc-back-link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Voltar ao site</span>
        </Link>

        <div className="mc-title-wrap">
          <span className="mc-title">Área do cliente</span>
        </div>

        <div className="mc-menu-wrap">
          <button
            type="button"
            className={`mc-menu-button${menuOpen ? ' is-open' : ''}`}
            onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
            style={{ position: 'relative' }}
          >
            ☰
            {(notifCount > 0 || chatCount > 0) && !menuOpen && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                background: 'var(--accent)',
                color: '#1a1200',
                borderRadius: '100px',
                fontSize: '0.6rem',
                fontWeight: 700,
                padding: '0.05rem 0.3rem',
                minWidth: '16px',
                textAlign: 'center',
                lineHeight: '1.5',
                pointerEvents: 'none',
              }}>
                {notifCount + chatCount}
              </span>
            )}
          </button>

          {menuOpen && (
            <>
              <button
                type="button"
                className="mc-menu-overlay"
                aria-label="Fechar menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="mc-menu-panel" role="menu" aria-label="Navegação da área do cliente">
                <div className="mc-menu-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                    <Avatar client={cliente} size={40} fontScale={0.45} />
                    <div style={{ minWidth: 0 }}>
                      <p className="mc-menu-user">{cliente?.nomeCompleto || firstName}</p>
                      <p className="mc-menu-email">{cliente?.email || ''}</p>
                    </div>
                  </div>
                  <span className="mc-menu-pill">{activeLabel}</span>
                </div>

                <div className="mc-menu-list">
                  {navItems.map(item => {
                    const isActive = pathname === item.href
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`mc-menu-item${isActive ? ' is-active' : ''}`}
                        onClick={() => setMenuOpen(false)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        <span>{item.label}</span>
                        {item.badge > 0 && (
                          <span style={{
                            background: 'var(--accent)',
                            color: '#1a1200',
                            borderRadius: '100px',
                            padding: '0.08rem 0.42rem',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            minWidth: '18px',
                            textAlign: 'center',
                          }}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>

                <div className="mc-menu-footer">
                  {cliente?.isAdmin && (
                    <Link href="/admin" className="mc-menu-admin" onClick={() => setMenuOpen(false)}>
                      Área do fotógrafo
                    </Link>
                  )}
                  <button
                    type="button"
                    className="mc-menu-logout"
                    onClick={() => {
                      setMenuOpen(false)
                      setConfirmLogout(true)
                    }}
                  >
                    Desconectar
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </nav>

      {confirmLogout && (
        <div className="mc-logout-backdrop" onClick={() => setConfirmLogout(false)}>
          <div className="mc-logout-modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔌</div>
            <h2 className="mc-logout-title">Desconectar da conta?</h2>
            <p className="mc-logout-text">Você precisará fazer login novamente para acessar sua conta.</p>
            <div className="mc-logout-actions">
              <button onClick={() => setConfirmLogout(false)} className="mc-logout-cancel">
                Cancelar
              </button>
              <button onClick={handleLogout} className="mc-logout-confirm">
                Desconectar
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mc-main">
        {children}
      </main>
    </div>
  )
}
