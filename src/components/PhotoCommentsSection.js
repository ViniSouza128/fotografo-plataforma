'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

const MAX_COMMENT_LENGTH = 1000

function tempoRelativo(dataStr) {
  const agora = Date.now()
  const data = new Date(dataStr || 0).getTime()
  if (Number.isNaN(data)) return 'agora mesmo'

  const diff = agora - data
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora mesmo'
  if (min < 60) return `ha ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `ha ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `ha ${d} dia${d > 1 ? 's' : ''}`
  const m = Math.floor(d / 30)
  return `ha ${m} ${m > 1 ? 'meses' : 'mes'}`
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  let data = null
  try { data = await response.json() } catch { data = null }
  return { response, data }
}

function getErrorMessage(payload, fallback) {
  if (!payload) return fallback
  if (typeof payload === 'string') return payload
  return payload.error || fallback
}

export default function PhotoCommentsSection({
  photoId,
  eventId,
  pasta,
  clienteLogado,
  isAdminView,
  initialFocusId,
}) {
  const [comentarios, setComentarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [novoComentario, setNovoComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ordenacao, setOrdenacao] = useState('top')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  const [replyingToId, setReplyingToId] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [savingReply, setSavingReply] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [busyVisibilityId, setBusyVisibilityId] = useState(null)
  const [busyLikeId, setBusyLikeId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState({})
  const [highlightId, setHighlightId] = useState(null)

  const isLogged = !!clienteLogado?.id

  const clearFeedback = useCallback(() => {
    setErro('')
    setOk('')
  }, [])

  const totalComentarios = useMemo(() => {
    return comentarios.reduce((sum, item) => sum + 1 + (item.respostas?.length || 0), 0)
  }, [comentarios])

  const carregar = useCallback(async () => {
    if (!photoId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        photoId,
        tree: '1',
        sort: ordenacao,
      })

      if (isAdminView) {
        params.set('admin', '1')
        params.set('includeHistory', '1')
      } else if (isLogged) {
        params.set('includeMineHidden', '1')
        params.set('includeHistory', '1')
      }

      const { response, data } = await requestJson(`/api/comentarios?${params.toString()}`)
      if (!response.ok) {
        setComentarios([])
        return
      }
      setComentarios(Array.isArray(data) ? data : [])
    } catch {
      setComentarios([])
    } finally {
      setLoading(false)
    }
  }, [photoId, ordenacao, isAdminView, isLogged])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    if (!initialFocusId) return
    if (loading) return
    requestAnimationFrame(() => {
      const el = document.getElementById(`comment-${initialFocusId}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightId(initialFocusId)
      setTimeout(() => setHighlightId(null), 2200)
    })
  }, [initialFocusId, loading, comentarios])

  function updateCommentInTree(commentId, updater) {
    function walk(list) {
      return (list || []).map(item => {
        if (item.id === commentId) return updater(item)
        if (item.respostas?.length) return { ...item, respostas: walk(item.respostas) }
        return item
      })
    }
    setComentarios(prev => walk(prev))
  }

  async function enviarComentario({ texto, parentId = null }) {
    clearFeedback()
    const trimmed = (texto || '').trim()
    if (!trimmed) { setErro('Escreva algo antes de enviar.'); return false }
    if (trimmed.length > MAX_COMMENT_LENGTH) { setErro(`Comentario muito longo. Limite de ${MAX_COMMENT_LENGTH} caracteres.`); return false }

    const { response, data } = await requestJson('/api/comentarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photoId,
        eventId: eventId || null,
        pasta: pasta || null,
        parentId,
        texto: trimmed,
      }),
    })

    if (!response.ok) {
      setErro(getErrorMessage(data, 'Nao foi possivel enviar o comentario.'))
      return false
    }

    await carregar()
    setOk(parentId ? 'Resposta enviada.' : 'Comentario enviado.')
    return true
  }

  async function handleEnviarNovo() {
    if (!isLogged || enviando) return
    setEnviando(true)
    try {
      const okSend = await enviarComentario({ texto: novoComentario, parentId: null })
      if (okSend) setNovoComentario('')
    } finally {
      setEnviando(false)
    }
  }

  async function handleEnviarResposta(commentId) {
    if (!isLogged || savingReply) return
    setSavingReply(true)
    try {
      const okSend = await enviarComentario({ texto: replyText, parentId: commentId })
      if (okSend) { setReplyText(''); setReplyingToId(null) }
    } finally {
      setSavingReply(false)
    }
  }

  async function salvarEdicao(comment) {
    if (!editingId || savingEdit) return
    clearFeedback()
    const trimmed = editingText.trim()
    if (!trimmed) { setErro('A edicao nao pode ficar vazia.'); return }
    if (trimmed.length > MAX_COMMENT_LENGTH) { setErro(`Comentario muito longo. Limite de ${MAX_COMMENT_LENGTH} caracteres.`); return }

    setSavingEdit(true)
    try {
      const { response, data } = await requestJson('/api/comentarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comment.id, action: 'edit', texto: trimmed }),
      })
      if (!response.ok) {
        setErro(getErrorMessage(data, 'Nao foi possivel editar o comentario.'))
        return
      }
      await carregar()
      setEditingId(null)
      setEditingText('')
      setOk('Comentario atualizado.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function changeVisibility(comment) {
    if (busyVisibilityId) return
    clearFeedback()
    setBusyVisibilityId(comment.id)
    try {
      const action = comment.visivel ? 'omit' : 'restore'
      const { response, data } = await requestJson('/api/comentarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comment.id, action }),
      })
      if (!response.ok) {
        setErro(getErrorMessage(data, 'Nao foi possivel atualizar o comentario.'))
        return
      }
      await carregar()
      setOk(comment.visivel ? 'Comentario omitido.' : 'Comentario restaurado.')
    } finally {
      setBusyVisibilityId(null)
    }
  }

  async function toggleLike(comment) {
    if (!isLogged || busyLikeId) return
    if (!comment?.permissoes?.canLike) return
    clearFeedback()
    setBusyLikeId(comment.id)

    const wasLiked = !!comment.curtidoPorMim
    const prevCount = Number(comment.curtidas || 0)
    updateCommentInTree(comment.id, (c) => ({
      ...c,
      curtidoPorMim: !wasLiked,
      curtidas: Math.max(0, prevCount + (wasLiked ? -1 : 1)),
    }))

    try {
      const { response, data } = await requestJson('/api/comentarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comment.id, action: 'toggleLike' }),
      })
      if (!response.ok) {
        updateCommentInTree(comment.id, (c) => ({ ...c, curtidoPorMim: wasLiked, curtidas: prevCount }))
        setErro(getErrorMessage(data, 'Nao foi possivel curtir este comentario.'))
        return
      }
      updateCommentInTree(comment.id, (c) => ({
        ...c,
        curtidoPorMim: !!data.curtidoPorMim,
        curtidas: Number(data.curtidas || 0),
      }))
    } finally {
      setBusyLikeId(null)
    }
  }

  function openReply(comment) {
    clearFeedback()
    setEditingId(null)
    setEditingText('')
    setReplyingToId(comment.id)
    setReplyText('')
  }

  function openEdit(comment) {
    clearFeedback()
    setReplyingToId(null)
    setReplyText('')
    setEditingId(comment.id)
    setEditingText(comment.texto || '')
  }

  function toggleHistory(commentId) {
    setHistoryOpen(prev => ({ ...prev, [commentId]: !prev[commentId] }))
  }

  function renderEditBadge(comment) {
    if (!comment.foiEditado) return null
    if (comment.foiEditadoPorAdmin) {
      return (
        <span style={{ fontSize: '0.7rem', color: '#93c5fd', background: 'rgba(59,130,246,0.15)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
          editado por admin
        </span>
      )
    }
    return (
      <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
        editado
      </span>
    )
  }

  function renderStatusBadge(comment) {
    if (comment.visivel) return null
    const label = comment.statusOmissao === 'omitido_por_admin' ? 'omitido por admin' : 'omitido por voce'
    return (
      <span style={{ fontSize: '0.7rem', color: 'var(--danger)', background: 'rgba(239,68,68,0.12)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
        {label}
      </span>
    )
  }

  function renderHistory(comment) {
    if (!historyOpen[comment.id]) return null
    if (!comment.historicoEdicoes?.length) {
      return <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.6rem' }}>Sem historico de edicao.</p>
    }
    return (
      <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {comment.historicoEdicoes.map(entry => (
          <div key={entry.id} style={{ borderBottom: '1px dashed var(--border)', paddingBottom: '0.45rem' }}>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginBottom: '0.35rem' }}>
              {tempoRelativo(entry.editadoEm)} por {entry.editadoPorNome}{entry.editadoPorAdmin ? ' (admin)' : ''}
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0 }}><strong>Antes:</strong> {entry.textoAnterior}</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text)', margin: '0.2rem 0 0' }}><strong>Depois:</strong> {entry.textoNovo}</p>
          </div>
        ))}
      </div>
    )
  }

  function renderComment(comment, { isReply = false } = {}) {
    const hasReplies = Array.isArray(comment.respostas) && comment.respostas.length > 0
    const canEdit = comment.permissoes?.canEdit
    const canReply = comment.permissoes?.canReply
    const canOmitOrRestore = comment.permissoes?.canOmit || comment.permissoes?.canRestore
    const canViewHistory = comment.permissoes?.canViewHistory
    const canLike = comment.permissoes?.canLike

    return (
      <div
        key={comment.id}
        id={`comment-${comment.id}`}
        style={{
          background: highlightId === comment.id ? 'rgba(201,169,110,0.12)' : 'var(--bg-card)',
          border: `1px solid ${comment.visivel ? 'var(--border)' : 'rgba(239,68,68,0.35)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: '0.9rem 1.1rem',
          opacity: comment.visivel ? 1 : 0.85,
          marginLeft: isReply ? '0.9rem' : 0,
          transition: 'background 0.25s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem' }}>{comment.clienteNome}</span>
          {isReply && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
              resposta
            </span>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tempoRelativo(comment.criadoEm || comment.createdAt)}</span>
          {renderEditBadge(comment)}
          {renderStatusBadge(comment)}
        </div>

        {editingId === comment.id ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{editingText.length}/{MAX_COMMENT_LENGTH}</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(null); setEditingText('') }}>Cancelar</button>
                <button className="btn btn-primary btn-sm" onClick={() => salvarEdicao(comment)} disabled={savingEdit}>
                  {savingEdit ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text)', fontSize: '0.88rem', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {comment.texto}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!canLike || busyLikeId === comment.id}
            onClick={() => toggleLike(comment)}
            title={isLogged ? (comment.curtidoPorMim ? 'Remover curtida' : 'Curtir') : 'Faca login para curtir'}
          >
            {comment.curtidoPorMim ? '♥ Curtido' : '♡ Curtir'} ({Number(comment.curtidas || 0)})
          </button>

          {canReply && <button className="btn btn-ghost btn-sm" onClick={() => openReply(comment)}>Responder</button>}
          {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => openEdit(comment)}>Editar</button>}
          {canOmitOrRestore && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => changeVisibility(comment)}
              disabled={busyVisibilityId === comment.id}
              style={{ color: comment.visivel ? 'var(--danger)' : 'var(--success)' }}
            >
              {busyVisibilityId === comment.id ? '...' : (comment.visivel ? 'Omitir' : 'Restaurar')}
            </button>
          )}
          {canViewHistory && (
            <button className="btn btn-ghost btn-sm" onClick={() => toggleHistory(comment.id)}>
              {historyOpen[comment.id] ? 'Fechar historico' : 'Ver historico'}
            </button>
          )}
        </div>

        {replyingToId === comment.id && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-input)' }}>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              rows={3}
              maxLength={MAX_COMMENT_LENGTH}
              placeholder="Escreva sua resposta..."
              style={{ width: '100%', resize: 'vertical', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.7rem 0.9rem', color: 'var(--text)', fontSize: '0.86rem' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.55rem', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{replyText.length}/{MAX_COMMENT_LENGTH}</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setReplyingToId(null); setReplyText('') }}>Cancelar</button>
                <button className="btn btn-primary btn-sm" onClick={() => handleEnviarResposta(comment.id)} disabled={savingReply}>
                  {savingReply ? 'Enviando...' : 'Enviar resposta'}
                </button>
              </div>
            </div>
          </div>
        )}

        {renderHistory(comment)}

        {hasReplies && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginTop: '0.85rem' }}>
            {comment.respostas.map(reply => renderComment(reply, { isReply: true }))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', margin: 0 }}>
          Comentarios da foto {totalComentarios > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 'normal' }}>({totalComentarios})</span>}
        </h3>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', paddingTop: '0.35rem' }}>Ordenar:</span>
          <button className={`btn btn-sm ${ordenacao === 'top' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOrdenacao('top')}>Mais curtidos</button>
          <button className={`btn btn-sm ${ordenacao === 'recent' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOrdenacao('recent')}>Mais recentes</button>
        </div>
      </div>

      {erro && <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>{erro}</div>}
      {ok && <div className="alert alert-success" style={{ marginTop: '0.75rem' }}>{ok}</div>}

      {isLogged ? (
        <div style={{ marginTop: '0.9rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
          <textarea
            value={novoComentario}
            onChange={e => setNovoComentario(e.target.value)}
            placeholder="Deixe um comentario sobre esta foto..."
            rows={3}
            maxLength={MAX_COMMENT_LENGTH}
            style={{ width: '100%', resize: 'vertical', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.7rem 0.9rem', color: 'var(--text)', fontSize: '0.88rem', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.55rem', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{novoComentario.length}/{MAX_COMMENT_LENGTH}</span>
            <button className="btn btn-primary btn-sm" onClick={handleEnviarNovo} disabled={!novoComentario.trim() || enviando} style={{ opacity: (!novoComentario.trim() || enviando) ? 0.6 : 1 }}>
              {enviando ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '0.9rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Faca login para comentar esta foto
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>Carregando comentarios...</p>
      ) : comentarios.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>Nenhum comentario nesta foto ainda.</p>
      ) : (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {comentarios.map(c => renderComment(c))}
        </div>
      )}
    </div>
  )
}

