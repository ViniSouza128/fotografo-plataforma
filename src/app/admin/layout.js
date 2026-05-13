'use client'
// src/app/admin/layout.js

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

export default function AdminLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const [verificando, setVerificando] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [isColaborador, setIsColaborador] = useState(false)
  const [pedidosNovos, setPedidosNovos] = useState(0)
  const [remocoesPendentes, setRemocoesPendentes] = useState(0)
  const [notifCount, setNotifCount] = useState(0)
  const [chatCount, setChatCount] = useState(0)
  const [siteCopyFeedback, setSiteCopyFeedback] = useState('')
  const siteCopyTimeoutRef = useRef(null)
  const loginHref = `/login?returnTo=${encodeURIComponent(pathname || '/admin')}`

  useEffect(() => {
    let cancelled = false
    const logado = localStorage.getItem('adminLogado')
    const raw = localStorage.getItem('clienteLogado')
    let clienteValido = false
    try {
      const parsed = raw ? JSON.parse(raw) : null
      clienteValido = !!(parsed && parsed.id && parsed.isAdmin)
      if (parsed?.isSuperAdmin) setIsSuperAdmin(true)
      if (parsed?.isColaborador) setIsColaborador(true)
    } catch {}

    if (logado === 'true' && clienteValido) {
      setVerificando(false)
      return
    }

    // Fallback: o cookie JWT pode estar válido neste navegador mesmo
    // sem o localStorage (ex.: usuário fez login em outro browser e
    // este só recebeu o cookie via SSO/share). Consulta o servidor.
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (!res.ok) {
          if (!cancelled) {
            localStorage.removeItem('adminLogado')
            router.replace(loginHref)
          }
          return
        }
        const data = await res.json().catch(() => null)
        const c = data?.client
        if (!c || !c.isAdmin) {
          if (!cancelled) {
            localStorage.removeItem('adminLogado')
            localStorage.removeItem('clienteLogado')
            router.replace(loginHref)
          }
          return
        }
        if (cancelled) return
        // Repopula localStorage para o resto do app que ainda lê dali.
        localStorage.setItem('adminLogado', 'true')
        localStorage.setItem('clienteLogado', JSON.stringify(c))
        if (c.isSuperAdmin) setIsSuperAdmin(true)
        if (c.isColaborador) setIsColaborador(true)
        window.dispatchEvent(new Event('authUpdated'))
        setVerificando(false)
      } catch {
        if (!cancelled) router.replace(loginHref)
      }
    })()

    return () => { cancelled = true }
  }, [loginHref, router]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (verificando) return
    async function checkNovos() {
      try {
        const [res, resRem, resNotif, resChat] = await Promise.all([
          fetch('/api/pedidos?admin=1'),
          fetch('/api/remocoes'),
          fetch('/api/notificacoes?count=1'),
          fetch('/api/chat?count=1'),
        ])
        const pedidosPayload = await res.json().catch(() => [])
        const remocoesPayload = await resRem.json().catch(() => [])
        const notifPayload = await resNotif.json().catch(() => ({}))
        const chatPayload = await resChat.json().catch(() => ({}))
        const pedidos = Array.isArray(pedidosPayload) ? pedidosPayload : []
        const remocoes = Array.isArray(remocoesPayload) ? remocoesPayload : []
        setRemocoesPendentes(remocoes.filter(r => r.status === 'pendente').length)
        setNotifCount(Number(notifPayload.count) || 0)
        setChatCount(Number(chatPayload.count) || 0)
        const ultima = localStorage.getItem('ultimaVisitaPedidos')
        if (!ultima) {
          setPedidosNovos(pedidos.filter(p => p.status === 'pago').length)
          return
        }
        const novos = pedidos.filter(p =>
          p.status === 'pago' && new Date(p.criadoEm) > new Date(ultima)
        )
        setPedidosNovos(novos.length)
      } catch { /* silencioso */ }
    }
    checkNovos()
    const pollInterval = setInterval(checkNovos, 60_000)
    return () => clearInterval(pollInterval)
  }, [verificando])

  const [confirmLogout, setConfirmLogout] = useState(false)

  async function handleLogout() {
    localStorage.removeItem('adminLogado')
    localStorage.removeItem('clienteLogado')
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    window.dispatchEvent(new Event('authUpdated'))
    router.push('/login')
  }

  async function handleCopySiteUrl() {
    const url = window.location.origin
    try {
      await navigator.clipboard.writeText(url)
      setSiteCopyFeedback('Copiado!')
      if (siteCopyTimeoutRef.current) clearTimeout(siteCopyTimeoutRef.current)
      siteCopyTimeoutRef.current = setTimeout(() => {
        setSiteCopyFeedback('')
      }, 1800)
    } catch {
      setSiteCopyFeedback('Falha ao copiar')
      if (siteCopyTimeoutRef.current) clearTimeout(siteCopyTimeoutRef.current)
      siteCopyTimeoutRef.current = setTimeout(() => {
        setSiteCopyFeedback('')
      }, 1800)
    }
  }

  useEffect(() => () => {
    if (siteCopyTimeoutRef.current) clearTimeout(siteCopyTimeoutRef.current)
  }, [])

  if (verificando) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" style={{ width: '40px', height: '40px' }} />
    </div>
  )

  const allMenuItems = [
    { href: '/admin', label: 'Dashboard', icon: '📊', visibleTo: 'all' },
    { href: '/admin/estatisticas', label: 'Estatísticas', icon: '📈', visibleTo: 'all' },
    { href: '/admin/notificacoes', label: 'Notificações', icon: '🔔', badge: notifCount, visibleTo: 'all' },
    { href: '/admin/pedidos', label: 'Pedidos', icon: '🧾', badge: pedidosNovos, visibleTo: 'all' },
    { href: '/admin/eventos', label: 'Álbuns', icon: '📅', visibleTo: 'all' },
    { href: '/admin/comentarios', label: 'Comentários', icon: '💬', visibleTo: 'all' },
    { href: '/admin/clientes', label: 'Contas', icon: '👥', visibleTo: 'fullAdmin' },
    { href: '/admin/colaboradores', label: 'Colaboradores', icon: '🧑‍🤝‍🧑', visibleTo: 'superAdmin' },
    { href: '/admin/repasses', label: 'Repasses', icon: '💸', visibleTo: 'all' },
    { href: '/admin/carrinhos', label: 'Carrinhos', icon: '🛒', visibleTo: 'fullAdmin' },
    { href: '/admin/contatos', label: 'Contatos', icon: '✉️', visibleTo: 'fullAdmin' },
    { href: '/admin/cupons', label: 'Cupons', icon: '🎟️', visibleTo: 'fullAdmin' },
    { href: '/admin/propostas', label: 'Propostas', icon: '📋', visibleTo: 'fullAdmin' },
    { href: '/admin/chat', label: 'Chat', icon: '💬', badge: chatCount, visibleTo: 'all' },
    { href: '/admin/reconhecimento', label: 'Reconhecimento', icon: '🧠', visibleTo: 'fullAdmin' },
    { href: '/admin/marca-dagua', label: "Marca d'água", icon: '🔏', visibleTo: 'fullAdmin' },
    { href: '/admin/remocoes', label: 'Remoções', icon: '🚫', badge: remocoesPendentes, visibleTo: 'fullAdmin' },
  ]

  const menuItems = allMenuItems.filter(item => {
    if (item.visibleTo === 'all') return true
    if (item.visibleTo === 'superAdmin') return isSuperAdmin
    // 'fullAdmin' = admin não-colaborador
    return !isColaborador
  })

  const siteItems = [
    { href: '/', label: 'Ver site', icon: '🌐', external: true },
    { href: '/admin/personalizar', label: 'Personalizar site', icon: '🎨', superAdminOnly: true },
    { href: '/admin/configuracoes', label: 'Configurações', icon: '⚙️', superAdminOnly: true },
    { href: '/admin/reset', label: 'Backup e Reset', icon: '🛟', superAdminOnly: true },
  ]

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          Vinícius<span>.</span><br />
          {isSuperAdmin && (
            <span className="admin-sidebar-brand-badge">⭐ Super Admin</span>
          )}
          {!isSuperAdmin && isColaborador && (
            <span className="admin-sidebar-brand-badge">📷 Colaborador</span>
          )}
        </div>

        <p className="admin-nav-section">Navegação</p>
        {menuItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/'))

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => {
                if (item.href === '/admin/pedidos') {
                  localStorage.setItem('ultimaVisitaPedidos', new Date().toISOString())
                  setPedidosNovos(0)
                }
                if (item.href === '/admin/remocoes') {
                  setRemocoesPendentes(0)
                }
                if (item.href === '/admin/notificacoes') {
                  setNotifCount(0)
                }
                if (item.href === '/admin/chat') {
                  setChatCount(0)
                }
              }}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.badge > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: 'var(--accent)',
                  color: '#1a1200',
                  borderRadius: '100px',
                  padding: '0.1rem 0.45rem',
                  fontSize: '0.65rem',
                  fontWeight: '500',
                }}>
                  {item.badge}
                </span>
              )}
              </Link>
          )
        })}

        <div className="admin-sidebar-divider" />

        <p className="admin-nav-section">Site</p>
        <div className="admin-site-actions">
          <div className="admin-site-action-row">
            <Link href="/" target="_blank" rel="noreferrer" className="admin-nav-item admin-site-link">
              <span>{siteItems[0].icon}</span>
              {siteItems[0].label}
            </Link>
            <button
              type="button"
              className="admin-site-copy"
              onClick={handleCopySiteUrl}
              aria-label="Copiar URL do site"
              title="Copiar URL do site"
            >
              📋
            </button>
          </div>

          {isSuperAdmin && siteItems.slice(1).map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-item admin-site-link ${pathname === item.href ? 'active' : ''}`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}

          {siteCopyFeedback && (
            <span className="admin-site-feedback" role="status" aria-live="polite">
              {siteCopyFeedback}
            </span>
          )}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '2rem', padding: '1rem 0.75rem' }}>
          <button
            onClick={() => setConfirmLogout(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              padding: '0.7rem 1rem', borderRadius: 'var(--radius)',
              background: 'rgba(220, 38, 38, 0.15)', color: '#ef4444',
              border: '1px solid rgba(220, 38, 38, 0.3)', cursor: 'pointer',
              fontSize: '0.88rem', fontWeight: 600, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220, 38, 38, 0.28)'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.55)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(220, 38, 38, 0.15)'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.3)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Desconectar
          </button>
        </div>
      </aside>

      {/* Modal de confirmação de logout */}
      {confirmLogout && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}
          onClick={() => setConfirmLogout(false)}
        >
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '2rem',
            maxWidth: '360px', width: '100%', textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔌</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: 'var(--text)', marginBottom: '0.5rem' }}>
              Desconectar da Área do fotógrafo?
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1.75rem' }}>
              Você será redirecionado para a página de login.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setConfirmLogout(false)}
                style={{
                  flex: 1, padding: '0.65rem', borderRadius: 'var(--radius)',
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', fontSize: '0.88rem', fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-input)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              >
                Cancelar
              </button>
              <button
                onClick={handleLogout}
                style={{
                  flex: 1, padding: '0.65rem', borderRadius: 'var(--radius)',
                  background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.45)',
                  color: '#ef4444', fontSize: '0.88rem', fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(220,38,38,0.32)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(220,38,38,0.2)'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Desconectar
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="admin-main">
        {children}
      </main>
    </div>
  )
}
