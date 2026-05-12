'use client'
// src/app/minha-conta/comentarios/page.js

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { applyNextImageFallback, getUploadsUrlFallbackCandidates } from '@/lib/imagePaths'

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR')
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  let data = null
  try { data = await response.json() } catch { data = null }
  return { response, data }
}

function getError(payload, fallback) {
  if (!payload) return fallback
  if (typeof payload === 'string') return payload
  return payload.error || fallback
}

export default function MinhaContaComentariosPage() {
  const [cliente, setCliente] = useState(null)
  const [comentarios, setComentarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('todos') // todos | visiveis | omitidos
  const [contextFiltro, setContextFiltro] = useState('todos') // todos | album | pasta | foto
  const [ordenacao, setOrdenacao] = useState('top') // top | recent
  const [historyOpen, setHistoryOpen] = useState({})

  useEffect(() => {
    let cancelled = false
    async function loadClient() {
      try {
        const meRes = await fetch('/api/auth/me')
        if (meRes.ok) {
          const meData = await meRes.json()
          if (!cancelled) {
            setCliente(meData.client || null)
            if (meData?.client) localStorage.setItem('clienteLogado', JSON.stringify(meData.client))
          }
          return
        }
      } catch {}

      try {
        const raw = localStorage.getItem('clienteLogado')
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (!cancelled) setCliente(parsed?.id ? parsed : null)
      } catch {}
    }
    loadClient()
    return () => { cancelled = true }
  }, [])

  const carregar = useCallback(async () => {
    if (!cliente?.id) return
    setLoading(true)
    setErro('')
    try {
      const params = new URLSearchParams({
        clientId: cliente.id,
        includeMineHidden: '1',
        includeHistory: '1',
        includeContext: '1',
        sort: ordenacao,
      })
      const { response, data } = await requestJson(`/api/comentarios?${params.toString()}`)
      if (!response.ok) {
        setComentarios([])
        setErro(getError(data, 'Nao foi possivel carregar seus comentarios.'))
        return
      }
      setComentarios(Array.isArray(data) ? data : [])
    } catch {
      setComentarios([])
      setErro('Erro de conexao ao carregar comentarios.')
    } finally {
      setLoading(false)
    }
  }, [cliente?.id, ordenacao])

  useEffect(() => {
    carregar()
  }, [carregar])

  const comentariosFiltrados = useMemo(() => {
    let items = [...comentarios]

    if (statusFiltro === 'visiveis') items = items.filter(c => c.visivel)
    else if (statusFiltro === 'omitidos') items = items.filter(c => !c.visivel)

    if (contextFiltro !== 'todos') {
      items = items.filter(c => (c.contextType || c.context?.type) === contextFiltro)
    }

    if (busca.trim()) {
      const term = busca.trim().toLowerCase()
      items = items.filter(c =>
        (c.texto || '').toLowerCase().includes(term) ||
        (c.context?.album?.nome || '').toLowerCase().includes(term) ||
        (c.pasta || '').toLowerCase().includes(term) ||
        (c.photoId || '').toLowerCase().includes(term)
      )
    }

    return items
  }, [comentarios, busca, statusFiltro, contextFiltro])

  if (!cliente) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>
        Carregando...
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', marginBottom: '0.25rem' }}>
            Comentarios
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            {comentariosFiltrados.length} registro{comentariosFiltrados.length === 1 ? '' : 's'}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={carregar} disabled={loading}>
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {erro && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{erro}</div>}

      <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '1.2rem', alignItems: 'center' }}>
        <input
          className="form-input"
          style={{ maxWidth: '320px' }}
          placeholder="Buscar por texto, album, pasta ou foto..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />

        <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>Ordenar:</span>
        {[
          { id: 'top', label: 'Mais curtidos' },
          { id: 'recent', label: 'Mais recentes' },
        ].map(item => (
          <button
            key={item.id}
            className={`btn btn-sm ${ordenacao === item.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setOrdenacao(item.id)}
          >
            {item.label}
          </button>
        ))}

        <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>Status:</span>
        {[
          { id: 'todos', label: 'Todos' },
          { id: 'visiveis', label: 'Visiveis' },
          { id: 'omitidos', label: 'Omitidos' },
        ].map(item => (
          <button
            key={item.id}
            className={`btn btn-sm ${statusFiltro === item.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setStatusFiltro(item.id)}
          >
            {item.label}
          </button>
        ))}

        <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>Contexto:</span>
        {[
          { id: 'todos', label: 'Todos' },
          { id: 'album', label: 'Album' },
          { id: 'pasta', label: 'Pasta' },
          { id: 'foto', label: 'Foto' },
        ].map(item => (
          <button
            key={item.id}
            className={`btn btn-sm ${contextFiltro === item.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setContextFiltro(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-center" style={{ minHeight: '40vh', gap: '0.8rem' }}>
          <div className="spinner" style={{ width: '26px', height: '26px' }} />
          <span style={{ color: 'var(--text-muted)' }}>Carregando comentarios...</span>
        </div>
      ) : comentariosFiltrados.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <h2 className="empty-state-title">Nenhum comentario encontrado</h2>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {comentariosFiltrados.map(comment => {
            const ctx = comment.context || null
            const thumbUrl = ctx?.thumbUrl || null
            const thumbCandidates = getUploadsUrlFallbackCandidates(thumbUrl)
            const url = ctx?.url || null
            const albumNome = ctx?.album?.nome || comment.eventId || '—'
            const pastaNome = ctx?.pasta?.nome || comment.pasta || null
            const fotoId = ctx?.foto?.id || comment.photoId || null
            const curtidas = Number(comment.curtidas || 0)
            const statusLabel = comment.visivel
              ? 'Visivel no site'
              : (comment.statusOmissao === 'omitido_por_admin' ? 'Omitido por admin' : 'Omitido por voce')

            return (
              <div
                key={comment.id}
                style={{
                  background: 'var(--bg-card)',
                  border: `1px solid ${comment.visivel ? 'var(--border)' : 'rgba(239,68,68,0.3)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '1rem 1.15rem',
                  opacity: comment.visivel ? 1 : 0.85,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--accent)', background: 'var(--accent-dim)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                    {(comment.contextType || ctx?.type || 'album').toUpperCase()}
                  </span>
                  {comment.parentId && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                      Resposta
                    </span>
                  )}
                  <span style={{ fontSize: '0.68rem', color: comment.visivel ? 'var(--success)' : 'var(--danger)', background: comment.visivel ? 'var(--success-dim)' : 'var(--danger-dim)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                    {statusLabel}
                  </span>
                  {comment.foiEditadoPorAdmin && (
                    <span style={{ fontSize: '0.68rem', color: '#93c5fd', background: 'rgba(59,130,246,0.15)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                      Editado por admin
                    </span>
                  )}
                  {!comment.foiEditadoPorAdmin && comment.foiEditado && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                      Editado
                    </span>
                  )}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
                    {formatDateTime(comment.criadoEm)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{
                    width: '56px',
                    height: '56px',
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
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                        <strong>Album:</strong> {albumNome}
                      </span>
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
                        <strong>Curtidas:</strong> {curtidas}
                      </span>
                    </div>
                    {url && (
                      <div style={{ marginTop: '0.25rem' }}>
                        <Link href={url} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none' }}>
                          Abrir no local do comentario
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                <p style={{ fontSize: '0.86rem', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>
                  {comment.texto}
                </p>

                {(comment.historicoEdicoes?.length || 0) > 0 && (
                  <div style={{ marginTop: '0.65rem' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setHistoryOpen(prev => ({ ...prev, [comment.id]: !prev[comment.id] }))}
                    >
                      {historyOpen[comment.id] ? 'Fechar historico' : 'Ver historico'}
                    </button>
                    {historyOpen[comment.id] && (
                      <div style={{ marginTop: '0.7rem', borderTop: '1px dashed var(--border)', paddingTop: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {comment.historicoEdicoes.map(entry => (
                          <div key={entry.id} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.55rem 0.7rem' }}>
                            <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                              {formatDateTime(entry.editadoEm)} - {entry.editadoPorNome}{entry.editadoPorAdmin ? ' (admin)' : ''}
                            </p>
                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                              <strong>Antes:</strong> {entry.textoAnterior}
                            </p>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text)' }}>
                              <strong>Depois:</strong> {entry.textoNovo}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
