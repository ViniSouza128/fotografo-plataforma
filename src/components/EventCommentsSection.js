'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

function getErrorMessage(payload, fallback) {
  if (!payload) return fallback
  if (typeof payload === 'string') return payload
  return payload.error || fallback
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

export default function EventCommentsSection({
  eventId,
  currentFolder,
  clienteLogado,
  isAdminView,
  initialFocusId = null,
}) {
  const [comentarios, setComentarios] = useState([])
  const [loadingComentarios, setLoadingComentarios] = useState(true)
  const [novoComentario, setNovoComentario] = useState('')
  const [enviandoComentario, setEnviandoComentario] = useState(false)
  const [feedbackErro, setFeedbackErro] = useState('')
  const [feedbackOk, setFeedbackOk] = useState('')
  const [ordenacao, setOrdenacao] = useState('top') // top | recent
  const [replyingToId, setReplyingToId] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [savingReply, setSavingReply] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [updatingVisibilityId, setUpdatingVisibilityId] = useState(null)
  const [updatingLikeId, setUpdatingLikeId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState({})
  const [highlightId, setHighlightId] = useState(null)
  const lastFocusedRef = useRef(null)

  const isLogged = !!clienteLogado?.id

  const totalComentarios = useMemo(() => {
    return comentarios.reduce((sum, item) => sum + 1 + (item.respostas?.length || 0), 0)
  }, [comentarios])

  const clearFeedback = useCallback(() => {
    setFeedbackErro('')
    setFeedbackOk('')
  }, [])

  const carregarComentarios = useCallback(async () => {
    if (!eventId) return
    setLoadingComentarios(true)
    try {
      const params = new URLSearchParams({
        eventId,
        pasta: currentFolder || '__album__',
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
      setLoadingComentarios(false)
    }
  }, [eventId, currentFolder, isAdminView, isLogged, ordenacao])

  useEffect(() => {
    carregarComentarios()
  }, [carregarComentarios])

  useEffect(() => {
    if (!initialFocusId) return
    if (loadingComentarios) return
    if (lastFocusedRef.current === initialFocusId) return
    requestAnimationFrame(() => {
      const el = document.getElementById(`comment-${initialFocusId}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightId(initialFocusId)
      setTimeout(() => setHighlightId(null), 2200)
      lastFocusedRef.current = initialFocusId
    })
  }, [initialFocusId, loadingComentarios, comentarios])

  function updateCommentInTree(commentId, updater) {
    function walk(list) {
      return (list || []).map(item => {
        if (item.id === commentId) return updater(item)
        if (item.respostas?.length) {
          return { ...item, respostas: walk(item.respostas) }
        }
        return item
      })
    }
    setComentarios(prev => walk(prev))
  }

  async function toggleLike(comment) {
    if (!isLogged || updatingLikeId) return
    if (!comment?.permissoes?.canLike) return
    clearFeedback()
    setUpdatingLikeId(comment.id)

    // Otimista: atualiza UI imediatamente e reverte se falhar.
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
        // Reverte
        updateCommentInTree(comment.id, (c) => ({ ...c, curtidoPorMim: wasLiked, curtidas: prevCount }))
        setFeedbackErro(getErrorMessage(data, 'Nao foi possivel curtir este comentario.'))
        return
      }
      const updated = data
      updateCommentInTree(comment.id, (c) => ({
        ...c,
        curtidoPorMim: !!updated.curtidoPorMim,
        curtidas: Number(updated.curtidas || 0),
      }))
    } finally {
      setUpdatingLikeId(null)
    }
  }

  async function enviarComentario({ texto, parentId = null }) {
    clearFeedback()

    const trimmed = (texto || '').trim()
    if (!trimmed) {
      setFeedbackErro('Escreva algo antes de enviar.')
      return false
    }
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setFeedbackErro(`Comentario muito longo. Limite de ${MAX_COMMENT_LENGTH} caracteres.`)
      return false
    }

    const payload = {
      eventId,
      pasta: currentFolder || null,
      texto: trimmed,
      parentId,
    }

    const { response, data } = await requestJson('/api/comentarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      setFeedbackErro(getErrorMessage(data, 'Nao foi possivel enviar o comentario.'))
      return false
    }

    await carregarComentarios()
    setFeedbackOk(parentId ? 'Resposta enviada com sucesso.' : 'Comentario enviado com sucesso.')
    return true
  }

  async function handleEnviarNovoComentario() {
    if (!isLogged || enviandoComentario) return
    setEnviandoComentario(true)
    try {
      const ok = await enviarComentario({ texto: novoComentario, parentId: null })
      if (ok) setNovoComentario('')
    } finally {
      setEnviandoComentario(false)
    }
  }

  async function handleEnviarResposta(commentId) {
    if (!isLogged || savingReply) return
    setSavingReply(true)
    try {
      const ok = await enviarComentario({ texto: replyText, parentId: commentId })
      if (ok) {
        setReplyText('')
        setReplyingToId(null)
      }
    } finally {
      setSavingReply(false)
    }
  }

  async function handleSalvarEdicao(comment) {
    if (!editingId || savingEdit) return
    clearFeedback()

    const trimmed = editingText.trim()
    if (!trimmed) {
      setFeedbackErro('A edicao nao pode ficar vazia.')
      return
    }
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setFeedbackErro(`Comentario muito longo. Limite de ${MAX_COMMENT_LENGTH} caracteres.`)
      return
    }

    setSavingEdit(true)
    try {
      const { response, data } = await requestJson('/api/comentarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comment.id, action: 'edit', texto: trimmed }),
      })

      if (!response.ok) {
        setFeedbackErro(getErrorMessage(data, 'Nao foi possivel editar o comentario.'))
        return
      }

      await carregarComentarios()
      setEditingId(null)
      setEditingText('')
      setFeedbackOk('Comentario atualizado.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleOmitir(comment) {
    if (updatingVisibilityId) return
    clearFeedback()
    setUpdatingVisibilityId(comment.id)

    try {
      const { response, data } = await requestJson('/api/comentarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comment.id, action: 'omit' }),
      })

      if (!response.ok) {
        setFeedbackErro(getErrorMessage(data, 'Nao foi possivel omitir o comentario.'))
        return
      }

      await carregarComentarios()
      setFeedbackOk('Comentario omitido.')
    } finally {
      setUpdatingVisibilityId(null)
    }
  }

  async function handleRestaurar(comment) {
    if (updatingVisibilityId) return
    clearFeedback()
    setUpdatingVisibilityId(comment.id)

    try {
      const { response, data } = await requestJson('/api/comentarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comment.id, action: 'restore' }),
      })

      if (!response.ok) {
        setFeedbackErro(getErrorMessage(data, 'Nao foi possivel restaurar o comentario.'))
        return
      }

      await carregarComentarios()
      setFeedbackOk('Comentario restaurado.')
    } finally {
      setUpdatingVisibilityId(null)
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

  function renderRoleBadge(comment) {
    if (comment.badgeRole === 'fotografo') {
      return (
        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(201,169,110,0.2)', color: 'var(--accent)', border: '1px solid rgba(201,169,110,0.4)', letterSpacing: '0.04em' }}>
          Fotografo
        </span>
      )
    }
    if (comment.badgeRole === 'admin') {
      return (
        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', letterSpacing: '0.04em' }}>
          Admin
        </span>
      )
    }
    return null
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

    const label = comment.statusOmissao === 'omitido_por_admin'
      ? 'omitido por admin'
      : 'omitido por voce'

    return (
      <span style={{
        fontSize: '0.7rem',
        color: 'var(--danger)',
        background: 'rgba(239,68,68,0.12)',
        padding: '0.1rem 0.45rem',
        borderRadius: '100px',
      }}>
        {label}
      </span>
    )
  }

  function renderHistory(comment) {
    if (!historyOpen[comment.id]) return null
    if (!comment.historicoEdicoes?.length) {
      return (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.6rem' }}>
          Sem historico de edicao.
        </p>
      )
    }

    return (
      <div style={{
        marginTop: '0.75rem',
        padding: '0.75rem',
        background: 'var(--bg-input)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        {comment.historicoEdicoes.map(entry => (
          <div key={entry.id} style={{ borderBottom: '1px dashed var(--border)', paddingBottom: '0.45rem' }}>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginBottom: '0.35rem' }}>
              {tempoRelativo(entry.editadoEm)} por {entry.editadoPorNome}{entry.editadoPorAdmin ? ' (admin)' : ''}
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0 }}>
              <strong>Antes:</strong> {entry.textoAnterior}
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text)', margin: '0.2rem 0 0' }}>
              <strong>Depois:</strong> {entry.textoNovo}
            </p>
          </div>
        ))}
      </div>
    )
  }

  function renderComment(comment, { isReply = false } = {}) {
    const hasReplies = Array.isArray(comment.respostas) && comment.respostas.length > 0
    const canEdit = comment.permissoes?.canEdit
    const canReply = comment.permissoes?.canReply
    const canOmit = comment.permissoes?.canOmit
    const canRestore = comment.permissoes?.canRestore
    const canViewHistory = comment.permissoes?.canViewHistory
    const canLike = comment.permissoes?.canLike
    const isHighlighted = highlightId === comment.id

    return (
      <div
        key={comment.id}
        id={`comment-${comment.id}`}
        style={{
          background: 'var(--bg-card)',
          border: `1px solid ${comment.visivel ? 'var(--border)' : 'rgba(239,68,68,0.35)'}`,
          boxShadow: isHighlighted ? '0 0 0 3px rgba(201,169,110,0.35)' : 'none',
          borderRadius: 'var(--radius-lg)',
          padding: '1rem 1.25rem',
          opacity: comment.visivel ? 1 : 0.8,
          marginLeft: isReply ? '1rem' : 0,
          scrollMarginTop: '84px',
          transition: 'box-shadow 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem' }}>{comment.clienteNome}</span>
          {renderRoleBadge(comment)}
          {isReply && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
              resposta
            </span>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tempoRelativo(comment.criadoEm || comment.createdAt)}</span>
          {renderEditBadge(comment)}
          {renderStatusBadge(comment)}
          {comment.pasta && !isReply && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
              Pasta: {comment.pasta}
            </span>
          )}
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
                fontSize: '0.9rem',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{editingText.length}/{MAX_COMMENT_LENGTH}</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(null); setEditingText('') }}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSalvarEdicao(comment)}
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Salvando...' : 'Salvar edicao'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text)', fontSize: '0.9rem', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {comment.texto}
          </p>
        )}

        {(canReply || canEdit || canOmit || canRestore || canViewHistory) && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                className="btn btn-ghost btn-sm"
                disabled={!canLike || updatingLikeId === comment.id}
                onClick={() => toggleLike(comment)}
                title={isLogged ? (comment.curtidoPorMim ? 'Remover curtida' : 'Curtir') : 'Faca login para curtir'}
              >
                {comment.curtidoPorMim ? '♥ Curtido' : '♡ Curtir'} ({Number(comment.curtidas || 0)})
              </button>
            </span>
            {canReply && (
              <button className="btn btn-ghost btn-sm" onClick={() => openReply(comment)}>
                Responder
              </button>
            )}
            {canEdit && (
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(comment)}>
                Editar
              </button>
            )}
            {(canOmit || canRestore) && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => (comment.visivel ? handleOmitir(comment) : handleRestaurar(comment))}
                disabled={updatingVisibilityId === comment.id}
                style={{ color: comment.visivel ? 'var(--danger)' : 'var(--success)' }}
              >
                {updatingVisibilityId === comment.id ? '...' : (comment.visivel ? 'Omitir' : 'Restaurar')}
              </button>
            )}
            {canViewHistory && (
              <button className="btn btn-ghost btn-sm" onClick={() => toggleHistory(comment.id)}>
                {historyOpen[comment.id] ? 'Fechar historico' : 'Ver historico'}
              </button>
            )}
          </div>
        )}

        {replyingToId === comment.id && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-input)',
          }}>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              rows={3}
              maxLength={MAX_COMMENT_LENGTH}
              placeholder="Escreva sua resposta..."
              style={{
                width: '100%',
                resize: 'vertical',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '0.7rem 0.9rem',
                color: 'var(--text)',
                fontSize: '0.88rem',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.55rem', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{replyText.length}/{MAX_COMMENT_LENGTH}</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setReplyingToId(null); setReplyText('') }}>
                  Cancelar
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => handleEnviarResposta(comment.id)} disabled={savingReply}>
                  {savingReply ? 'Enviando...' : 'Enviar resposta'}
                </button>
              </div>
            </div>
          </div>
        )}

        {renderHistory(comment)}

        {hasReplies && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.85rem' }}>
            {comment.respostas.map(reply => renderComment(reply, { isReply: true }))}
          </div>
        )}
      </div>
    )
  }

  return (
    <section style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid var(--border)' }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', color: 'var(--text)', marginBottom: '0.4rem' }}>
        Comentarios {totalComentarios > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 'normal' }}>({totalComentarios})</span>}
      </h2>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.84rem', marginBottom: '1.5rem' }}>
        {currentFolder ? `Comentarios da pasta "${currentFolder}"` : 'Comentarios gerais do album'}
        {isAdminView && ' - modo admin com moderacao completa'}
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', paddingTop: '0.35rem' }}>Ordenar:</span>
        <button
          className={`btn btn-sm ${ordenacao === 'top' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setOrdenacao('top')}
        >
          Mais curtidos
        </button>
        <button
          className={`btn btn-sm ${ordenacao === 'recent' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setOrdenacao('recent')}
        >
          Mais recentes
        </button>
      </div>

      {feedbackErro && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          {feedbackErro}
        </div>
      )}
      {feedbackOk && (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          {feedbackOk}
        </div>
      )}

      {isLogged ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '2rem' }}>
          <textarea
            value={novoComentario}
            onChange={e => setNovoComentario(e.target.value)}
            placeholder={currentFolder ? `Deixe um comentario sobre a pasta "${currentFolder}"...` : 'Deixe um comentario sobre este album...'}
            rows={3}
            maxLength={MAX_COMMENT_LENGTH}
            style={{
              width: '100%',
              resize: 'vertical',
              background: 'var(--bg-input, var(--bg-elevated, transparent))',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '0.75rem 1rem',
              color: 'var(--text)',
              fontSize: '0.9rem',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>{novoComentario.length}/{MAX_COMMENT_LENGTH}</span>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleEnviarNovoComentario}
              disabled={!novoComentario.trim() || enviandoComentario}
              style={{ opacity: (!novoComentario.trim() || enviandoComentario) ? 0.5 : 1 }}
            >
              {enviandoComentario ? 'Enviando...' : 'Enviar comentario'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem',
          marginBottom: '2rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.9rem',
        }}>
          Faca login para comentar
        </div>
      )}

      {loadingComentarios ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>
          Carregando comentarios...
        </p>
      ) : comentarios.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>
          {currentFolder
            ? 'Nenhum comentario nesta pasta ainda. Seja o primeiro a comentar!'
            : 'Nenhum comentario ainda. Seja o primeiro a comentar!'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {comentarios.map(comment => renderComment(comment))}
        </div>
      )}
    </section>
  )
}
