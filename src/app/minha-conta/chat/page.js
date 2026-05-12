'use client'
// src/app/minha-conta/chat/page.js

import { useCallback, useEffect, useRef, useState } from 'react'

function formatRelativo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'agora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min atrás`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h atrás`
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function MinhaContaChatPage() {
  const [thread, setThread] = useState(null)
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const messagesEndRef = useRef(null)
  const pollRef = useRef(null)

  const carregar = useCallback(async (markRead = true) => {
    try {
      const res = await fetch('/api/chat?meu=1')
      if (res.ok) {
        const data = await res.json()
        setThread(data)
        if (markRead && data?.mensagens?.some(m => !m.lidaPorCliente && m.de === 'admin')) {
          fetch('/api/chat', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }).catch(() => {})
        }
      }
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    carregar()
    pollRef.current = setInterval(() => carregar(false), 10_000)
    return () => clearInterval(pollRef.current)
  }, [carregar])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [thread?.mensagens?.length])

  async function handleSend(e) {
    e.preventDefault()
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: t }),
      })
      if (res.ok) {
        setTexto('')
        await carregar(false)
      }
    } catch {}
    finally { setEnviando(false) }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  const mensagens = thread?.mensagens || []

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', margin: 0 }}>Chat com o fotógrafo</h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Envie uma mensagem e aguarde a resposta.
        </p>
      </div>

      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', height: '520px',
      }}>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {mensagens.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              <p style={{ fontSize: '1.8rem', margin: '0 0 0.5rem' }}>💬</p>
              <p style={{ margin: 0 }}>Nenhuma mensagem ainda.<br />Mande um oi!</p>
            </div>
          ) : mensagens.map(m => {
            const isClient = m.de === 'client'
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: isClient ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '78%',
                  background: isClient ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: isClient ? '#1a1200' : 'var(--text)',
                  borderRadius: isClient ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  padding: '0.6rem 0.9rem',
                  fontSize: '0.88rem',
                  lineHeight: 1.45,
                }}>
                  {!isClient && (
                    <p style={{ margin: '0 0 0.2rem', fontSize: '0.7rem', fontWeight: 600, opacity: 0.75 }}>Fotógrafo</p>
                  )}
                  <p style={{ margin: 0, wordBreak: 'break-word' }}>{m.texto}</p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.67rem', opacity: 0.6, textAlign: isClient ? 'right' : 'left' }}>
                    {formatRelativo(m.criadaEm)}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.6rem' }}>
          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Escreva uma mensagem..."
            maxLength={2000}
            style={{
              flex: 1, padding: '0.6rem 0.9rem',
              background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: '0.88rem',
            }}
            disabled={enviando}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!texto.trim() || enviando}
            style={{ flexShrink: 0 }}
          >
            {enviando ? '...' : 'Enviar'}
          </button>
        </form>
      </div>
    </div>
  )
}
