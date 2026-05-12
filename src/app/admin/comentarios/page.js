'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { applyNextImageFallback, getUploadsUrlFallbackCandidates } from '@/lib/imagePaths'

const MAX_COMMENT_LENGTH = 1000

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR')
}

function getScopeLabel(comment) {
  const type = comment.contextType || comment.context?.type
  if (type === 'foto') return 'Foto'
  if (type === 'pasta') return `Pasta: ${comment.context?.pasta?.nome || comment.pasta || '—'}`
  if (type === 'album') return 'Album'
  if (comment.photoId) return 'Foto'
  if (comment.pasta) return `Pasta: ${comment.pasta}`
  if (comment.eventId) return 'Album'
  return 'Sem escopo'
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }
  return { response, data }
}

function getError(payload, fallback) {
  return payload?.error || fallback
}

export default function AdminComentariosPage() {
  const [comentarios, setComentarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('todos')
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [contextFiltro, setContextFiltro] = useState('todos') // album | pasta | foto
  const [ordenacao, setOrdenacao] = useState('top') // top | recent
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [busyVisibilityId, setBusyVisibilityId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState({})
  const [repliesOpen, setRepliesOpen] = useState({})

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const params = new URLSearchParams({
        admin: '1',
        all: '1',
        includeHistory: '1',
        includeContext: '1',
        tree: '1',
        sort: ordenacao,
      })
      const { response, data } = await requestJson(`/api/comentarios?${params.toString()}`)
      if (!response.ok) {
        setComentarios([])
        setErro(getError(data, 'Nao foi possivel carregar comentarios.'))
        return
      }
      setComentarios(Array.isArray(data) ? data : [])
    } catch {
      setErro('Erro de conexao ao carregar comentarios.')
      setComentarios([])
    } finally {
      setLoading(false)
    }
  }, [ordenacao])

  useEffect(() => {
    carregar()
  }, [carregar])

  const comentariosFiltrados = useMemo(() => {
    let items = [...comentarios]

    if (statusFiltro === 'visiveis') {
      items = items.filter(item => item.visivel)
    } else if (statusFiltro === 'omitidos') {
      items = items.filter(item => !item.visivel)
    }

    // A listagem principal agora e focada em comentarios raiz (tree=1).
    // Mantemos o filtro "Respostas" como: somente comentarios que receberam respostas.
    if (tipoFiltro === 'respostas') {
      items = items.filter(item => (item.respostas || []).length > 0)
    }

    if (contextFiltro !== 'todos') {
      items = items.filter(item => (item.contextType || item.context?.type) === contextFiltro)
    }

    if (busca.trim()) {
      const term = busca.trim().toLowerCase()
      const matches = (item) => (
        (item.clienteNome || '').toLowerCase().includes(term) ||
        (item.texto || '').toLowerCase().includes(term) ||
        (item.eventId || '').toLowerCase().includes(term) ||
        (item.pasta || '').toLowerCase().includes(term) ||
        (item.photoId || '').toLowerCase().includes(term) ||
        (item.context?.album?.nome || '').toLowerCase().includes(term)
      )

      items = items.map(root => {
        const rootMatches = matches(root)
        const replies = Array.isArray(root.respostas) ? root.respostas : []
        const replyMatches = replies.filter(r => matches(r))
        if (rootMatches) return { ...root, _uiForceRepliesOpen: replyMatches.length > 0 }
        if (replyMatches.length > 0) return { ...root, _uiForceRepliesOpen: true }
        return null
      }).filter(Boolean)
    }

    return items
  }, [comentarios, busca, statusFiltro, tipoFiltro, contextFiltro])

  async function salvarEdicao(comment) {
    if (!editingId || savingEdit) return
    const texto = editingText.trim()
    if (!texto) {
      setErro('A edicao nao pode ficar vazia.')
      return
    }
    if (texto.length > MAX_COMMENT_LENGTH) {
      setErro(`Texto muito longo. Limite de ${MAX_COMMENT_LENGTH} caracteres.`)
      return
    }

    setSavingEdit(true)
    setErro('')
    try {
      const { response, data } = await requestJson('/api/comentarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comment.id, action: 'edit', texto }),
      })
      if (!response.ok) {
        setErro(getError(data, 'Nao foi possivel editar o comentario.'))
        return
      }
      setEditingId(null)
      setEditingText('')
      await carregar()
    } finally {
      setSavingEdit(false)
    }
  }

  async function changeVisibility(comment, action) {
    if (busyVisibilityId) return
    setErro('')
    setBusyVisibilityId(comment.id)
    try {
      const { response, data } = await requestJson('/api/comentarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comment.id, action }),
      })
      if (!response.ok) {
        setErro(getError(data, 'Nao foi possivel atualizar o comentario.'))
        return
      }
      await carregar()
    } finally {
      setBusyVisibilityId(null)
    }
  }

  function renderThumb(ctx, { size = 56 } = {}) {
    const thumbUrl = ctx?.thumbUrl || null
    const thumbCandidates = getUploadsUrlFallbackCandidates(thumbUrl)
    return (
      <div style={{
        width: `${size}px`,
        height: `${size}px`,
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
    )
  }

  function renderContextLine(comment) {
    const ctx = comment.context || null
    const url = ctx?.url || null
    const albumNome = ctx?.album?.nome || comment.eventId || '—'
    const pastaNome = ctx?.pasta?.nome || comment.pasta || null
    const fotoId = ctx?.foto?.id || comment.photoId || null
    const curtidas = Number(comment.curtidas || 0)

    return (
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
    )
  }

  function renderHistory(comment) {
    if (!historyOpen[comment.id]) return null
    const entries = Array.isArray(comment.historicoEdicoes) ? comment.historicoEdicoes : []
    if (entries.length === 0) {
      return (
        <div style={{ marginTop: '0.8rem', borderTop: '1px dashed var(--border)', paddingTop: '0.7rem' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0 }}>
            Sem historico de edicao.
          </p>
        </div>
      )
    }

    return (
      <div style={{ marginTop: '0.8rem', borderTop: '1px dashed var(--border)', paddingTop: '0.7rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {entries.map(entry => (
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
      </div>
    )
  }

  function renderCommentCard(comment, { isReply = false, rootId = null } = {}) {
    const ctx = comment.context || null
    const replyCount = Array.isArray(comment.respostas) ? comment.respostas.length : 0
    const effectiveRootId = rootId || comment.id
    const forceOpen = comment._uiForceRepliesOpen === true
    const isOpen = forceOpen || repliesOpen[effectiveRootId] === true

    return (
      <div
        style={{
          background: isReply ? 'var(--bg-secondary)' : 'var(--bg-card)',
          border: `1px solid ${comment.visivel ? 'var(--border)' : 'rgba(239,68,68,0.3)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: isReply ? '0.75rem 0.9rem' : '1rem 1.15rem',
          opacity: comment.visivel ? 1 : 0.85,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
          <Link
            href={comment.clientId ? `/admin/clientes?open=${encodeURIComponent(comment.clientId)}` : '/admin/clientes'}
            style={{ color: 'var(--accent)', fontWeight: 600, fontSize: isReply ? '0.82rem' : '0.88rem', textDecoration: 'none' }}
            title="Abrir detalhes da conta"
          >
            {comment.clienteNome}
          </Link>
          {isReply && (
            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
              resposta
            </span>
          )}
          <span style={{ fontSize: '0.68rem', color: 'var(--accent)', background: 'var(--accent-dim)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
            {getScopeLabel(comment)}
          </span>
          <span style={{ fontSize: '0.68rem', color: comment.visivel ? 'var(--success)' : 'var(--danger)', background: comment.visivel ? 'var(--success-dim)' : 'var(--danger-dim)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
            {comment.visivel ? 'Visivel' : 'Omitido'}
          </span>
          {comment.foiEditadoPorAdmin && (
            <span style={{ fontSize: '0.68rem', color: '#93c5fd', background: 'rgba(59,130,246,0.15)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
              editado por admin
            </span>
          )}
          {!comment.foiEditadoPorAdmin && comment.foiEditado && (
            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
              editado
            </span>
          )}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
            {formatDateTime(comment.criadoEm)}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {renderThumb(ctx, { size: isReply ? 46 : 56 })}
          {renderContextLine(comment)}
        </div>

        {editingId === comment.id ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <textarea
              value={editingText}
              onChange={e => setEditingText(e.target.value)}
              rows={3}
              maxLength={MAX_COMMENT_LENGTH}
              style={{
                width: '100%',
                resize: 'vertical',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '0.7rem 0.9rem',
                color: 'var(--text)',
                fontSize: '0.88rem',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                {editingText.length}/{MAX_COMMENT_LENGTH}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(null); setEditingText('') }}>
                  Cancelar
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => salvarEdicao(comment)} disabled={savingEdit}>
                  {savingEdit ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '0.86rem', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>
            {comment.texto}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setEditingId(comment.id)
              setEditingText(comment.texto || '')
              setErro('')
            }}
          >
            Editar
          </button>

          <button
            className="btn btn-ghost btn-sm"
            style={{ color: comment.visivel ? 'var(--danger)' : 'var(--success)' }}
            disabled={busyVisibilityId === comment.id}
            onClick={() => changeVisibility(comment, comment.visivel ? 'omit' : 'restore')}
          >
            {busyVisibilityId === comment.id ? '...' : (comment.visivel ? 'Omitir' : 'Restaurar')}
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setHistoryOpen(prev => ({ ...prev, [comment.id]: !prev[comment.id] }))}
          >
            {historyOpen[comment.id] ? 'Fechar historico' : 'Ver historico'}
          </button>

          {!isReply && replyCount > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setRepliesOpen(prev => ({ ...prev, [effectiveRootId]: !isOpen }))}
            >
              {isOpen ? `Ocultar respostas (${replyCount})` : `Ver respostas (${replyCount})`}
            </button>
          )}
        </div>

        {renderHistory(comment)}

        {!isReply && replyCount > 0 && isOpen && (
          <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {comment.respostas.map(reply => (
              <div key={reply.id} style={{ marginLeft: '0.75rem' }}>
                {renderCommentCard(reply, { isReply: true, rootId: effectiveRootId })}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '40vh', gap: '0.8rem' }}>
        <div className="spinner" style={{ width: '26px', height: '26px' }} />
        <span style={{ color: 'var(--text-muted)' }}>Carregando comentarios...</span>
      </div>
    )
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <Link href="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>← Dashboard</Link>
          <h1 className="admin-page-title" style={{ marginTop: '0.2rem' }}>
            Comentarios
            <span style={{ marginLeft: '0.75rem', fontSize: '0.82rem', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '0.15rem 0.55rem', borderRadius: '100px', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
              {comentarios.length}
            </span>
          </h1>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={carregar}>
          Atualizar
        </button>
      </div>

      {erro && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          {erro}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '1.2rem', alignItems: 'center' }}>
        <input
          className="form-input"
          style={{ maxWidth: '320px' }}
          placeholder="Buscar por texto, autor, evento ou pasta..."
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
        <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>Tipo:</span>
        {[
          { id: 'todos', label: 'Todos' },
          { id: 'raizes', label: 'Principais' },
          { id: 'respostas', label: 'Respostas' },
        ].map(item => (
          <button
            key={item.id}
            className={`btn btn-sm ${tipoFiltro === item.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTipoFiltro(item.id)}
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

      {comentariosFiltrados.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <h2 className="empty-state-title">Nenhum comentario encontrado</h2>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {comentariosFiltrados.map(comment => (
            <div key={comment.id}>
              {renderCommentCard(comment)}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
