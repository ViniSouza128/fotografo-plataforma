'use client'
// src/app/admin/notificacoes/page.js

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

const TIPO_META = {
  novo_pedido:          { label: 'Novo pedido',         icon: '🧾' },
  pagamento_confirmado: { label: 'Pagamento confirmado', icon: '✅' },
  comentario:           { label: 'Comentário',           icon: '💬' },
  resposta:             { label: 'Resposta',             icon: '↩️' },
  remocao:              { label: 'Remoção',              icon: '🚫' },
  reembolso:            { label: 'Reembolso',            icon: '💰' },
  nota_publica:         { label: 'Nota pública',         icon: '📝' },
}

function formatRelativo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'agora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min atrás`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h atrás`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AdminNotificacoesPage() {
  const [notifs, setNotifs] = useState([])
  const [loading, setLoading] = useState(true)
  const [marcando, setMarcando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notificacoes?limit=100')
      const data = res.ok ? await res.json() : []
      setNotifs(Array.isArray(data) ? data : [])
    } catch { setNotifs([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function marcarLida(id) {
    try {
      await fetch('/api/notificacoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n))
    } catch {}
  }

  async function marcarTodas() {
    setMarcando(true)
    try {
      await fetch('/api/notificacoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      setNotifs(prev => prev.map(n => ({ ...n, lida: true })))
    } catch {}
    finally { setMarcando(false) }
  }

  async function excluir(id, e) {
    e.stopPropagation()
    try {
      await fetch(`/api/notificacoes?id=${id}`, { method: 'DELETE' })
      setNotifs(prev => prev.filter(n => n.id !== id))
    } catch {}
  }

  const naoLidas = notifs.filter(n => !n.lida).length

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '40vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', margin: 0 }}>Notificações</h1>
          {naoLidas > 0 && (
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {naoLidas} não lida{naoLidas !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {naoLidas > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={marcarTodas} disabled={marcando}>
              {marcando ? '...' : 'Marcar todas como lidas'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={carregar}>Atualizar</button>
        </div>
      </div>

      {notifs.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>🔔</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Nenhuma notificação.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {notifs.map(n => {
            const meta = TIPO_META[n.tipo] || { label: n.tipo, icon: '🔔' }
            const inner = (
              <div
                style={{
                  background: n.lida ? 'var(--bg-card)' : 'var(--bg-secondary)',
                  border: `1px solid ${n.lida ? 'var(--border)' : 'var(--accent-dim, var(--border))'}`,
                  borderLeft: n.lida ? undefined : '3px solid var(--accent)',
                  borderRadius: 'var(--radius)',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  gap: '0.75rem',
                  alignItems: 'flex-start',
                  cursor: n.link ? 'pointer' : 'default',
                  transition: 'background 0.12s',
                  position: 'relative',
                }}
                onClick={() => !n.lida && marcarLida(n.id)}
              >
                <span style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: '0.1rem' }}>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.83rem', fontWeight: n.lida ? 400 : 600, color: 'var(--text)' }}>{n.titulo}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', flexShrink: 0 }}>{formatRelativo(n.criadaEm)}</span>
                  </div>
                  {n.mensagem && (
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.mensagem}
                    </p>
                  )}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.2rem', display: 'block' }}>{meta.label}</span>
                </div>
                <button
                  onClick={e => excluir(n.id, e)}
                  title="Excluir notificação"
                  style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: '0.75rem', padding: '0.15rem 0.3rem', borderRadius: '4px', lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
            )
            return (
              <div key={n.id}>
                {n.link ? (
                  <Link href={n.link} style={{ textDecoration: 'none' }}>
                    {inner}
                  </Link>
                ) : inner}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
