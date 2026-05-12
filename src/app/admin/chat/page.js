'use client'
// src/app/admin/chat/page.js

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

export default function AdminChatPage() {
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [thread, setThread] = useState(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const messagesEndRef = useRef(null)
  const pollRef = useRef(null)

  const carregarThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/chat')
      const data = res.ok ? await res.json() : []
      setThreads(Array.isArray(data) ? data : [])
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { carregarThreads() }, [carregarThreads])

  const carregarThread = useCallback(async (clientId, markRead = true) => {
    if (!clientId) return
    setLoadingThread(true)
    try {
      const res = await fetch(`/api/chat?clientId=${clientId}`)
      const data = res.ok ? await res.json() : null
      setThread(data)
      if (markRead && data?.mensagens?.some(m => !m.lidaPorAdmin && m.de === 'client')) {
        await fetch('/api/chat', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId }),
        })
        setThreads(prev => prev.map(t => t.clientId === clientId ? { ...t, naoLidasAdmin: 0 } : t))
      }
    } catch {}
    finally { setLoadingThread(false) }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    carregarThread(selectedId)
    clearInterval(pollRef.current)
    pollRef.current = setInterval(() => carregarThread(selectedId, false), 10_000)
    return () => clearInterval(pollRef.current)
  }, [selectedId, carregarThread])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [thread?.mensagens?.length])

  async function handleSend(e) {
    e.preventDefault()
    const t = texto.trim()
    if (!t || !selectedId || enviando) return
    setEnviando(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: t, clientId: selectedId }),
      })
      if (res.ok) {
        setTexto('')
        await carregarThread(selectedId, false)
        await carregarThreads()
      }
    } catch {}
    finally { setEnviando(false) }
  }

  function handleSelect(clientId) {
    setSelectedId(clientId)
    setThread(null)
    setTexto('')
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '40vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: '1.25rem', height: 'calc(100vh - 120px)', maxHeight: '780px' }}>
      {/* Sidebar: lista de threads */}
      <div style={{
        width: '280px', flexShrink: 0,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '1rem 1rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', margin: 0 }}>Chat</h1>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {threads.length} conversa{threads.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {threads.length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Nenhuma conversa ainda.
            </div>
          ) : threads.map(t => (
            <button
              key={t.clientId}
              type="button"
              onClick={() => handleSelect(t.clientId)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '0.85rem 1rem',
                background: selectedId === t.clientId ? 'var(--bg-secondary)' : 'transparent',
                border: 'none', borderBottom: '1px solid var(--border)',
                cursor: 'pointer', transition: 'background 0.12s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: t.naoLidasAdmin > 0 ? 700 : 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                  {t.clientNome || t.clientId}
                </span>
                {t.naoLidasAdmin > 0 && (
                  <span style={{
                    background: 'var(--accent)', color: '#1a1200',
                    borderRadius: '100px', padding: '0.05rem 0.38rem',
                    fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
                  }}>
                    {t.naoLidasAdmin}
                  </span>
                )}
              </div>
              {t.ultimaMensagem && (
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.ultimaMensagem.de === 'admin' ? 'Você: ' : ''}{t.ultimaMensagem.texto}
                </p>
              )}
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                {formatRelativo(t.atualizadaEm)}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Thread view */}
      <div style={{
        flex: 1, minWidth: 0,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {!selectedId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Selecione uma conversa
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>💬</span>
              <div>
                <p style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600, color: 'var(--text)' }}>
                  {threads.find(t => t.clientId === selectedId)?.clientNome || selectedId}
                </p>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {thread?.mensagens?.length ?? '—'} mensagen{thread?.mensagens?.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {loadingThread ? (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '2rem' }}>
                  <div className="spinner" style={{ width: '28px', height: '28px' }} />
                </div>
              ) : !thread?.mensagens?.length ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', paddingTop: '2rem' }}>
                  Nenhuma mensagem ainda.
                </div>
              ) : thread.mensagens.map(m => {
                const isAdmin = m.de === 'admin'
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '72%',
                      background: isAdmin ? 'var(--accent)' : 'var(--bg-secondary)',
                      color: isAdmin ? '#1a1200' : 'var(--text)',
                      borderRadius: isAdmin ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      padding: '0.55rem 0.85rem',
                      fontSize: '0.875rem',
                      lineHeight: 1.45,
                    }}>
                      <p style={{ margin: 0, wordBreak: 'break-word' }}>{m.texto}</p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.67rem', opacity: 0.65, textAlign: isAdmin ? 'right' : 'left' }}>
                        {formatRelativo(m.criadaEm)}
                        {isAdmin && !m.lidaPorCliente && ' · não lida'}
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
                placeholder="Digite uma mensagem..."
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
          </>
        )}
      </div>
    </div>
  )
}
