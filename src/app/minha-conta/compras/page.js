'use client'

import { useEffect, useState } from 'react'
import { applyNextImageFallback, getFirstUrl, getPhotoCartPreviewCandidates } from '@/lib/imagePaths'
import {
  buildOrderFinancialSummary,
  getFinancialStatus,
  getFinancialToneStyle,
  isPedidoCompraConcluida,
} from '@/lib/commerceUtils'
import { buildPedidoPricing } from '@/lib/pricing'

function formatDate(dateStr) {
  const d = new Date(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

function formatOrderStatusLabel(pedido) {
  return getFinancialStatus(pedido).label
}

function PhotoTierDownload({ item, pedido }) {
  const [tiersCfg, setTiersCfg] = useState(null)
  const blocked = ['reembolsado','reembolso_solicitado'].includes(String(pedido.status||'').toLowerCase())
    || pedido.refund?.status === 'pending' || pedido.refund?.status === 'approved'
  const photoId = item.photoId || item.id

  useEffect(() => {
    fetch('/api/config').then(r => r.ok ? r.json() : null)
      .then(cfg => {
        const dt = cfg?.downloadTiers
        if (dt?.ativo && Array.isArray(dt.tiers) && dt.tiers.length) setTiersCfg(dt)
      }).catch(() => {})
  }, [])

  const purchasedTier = item.tier || null
  const purchasedOrdem = item.tierOrdem != null
    ? Number(item.tierOrdem)
    : (purchasedTier && tiersCfg ? Number(tiersCfg.tiers.find(t => t.id === purchasedTier)?.ordem || 0) : Infinity)

  const baseStyle = {
    background: 'var(--accent-dim)', color: 'var(--accent)',
    fontSize: '0.78rem', textDecoration: 'none', textAlign: 'center',
    opacity: blocked ? 0.35 : 1,
    pointerEvents: blocked ? 'none' : 'auto',
  }

  if (!tiersCfg) {
    return (
      <a href={`/api/photos/${photoId}/download`} download={item.originalName || item.filename}
        className="btn btn-sm" style={baseStyle}>
        Baixar original
      </a>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 180 }}>
      {item.tierLabel && (
        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
          🎟️ Comprou: <strong>{item.tierLabel}</strong>
        </span>
      )}
      {tiersCfg.tiers.map(t => {
        const ordem = Number(t.ordem) || 0
        const unlocked = !purchasedTier || ordem <= purchasedOrdem
        if (!unlocked) return null
        return (
          <a key={t.id}
            href={`/api/photos/${photoId}/download?tier=${t.id}`}
            download={item.originalName ? item.originalName.replace(/\.[^/.]+$/, '') + `__${t.id}.jpg` : `${photoId}__${t.id}.jpg`}
            className="btn btn-sm" style={baseStyle}>
            ⬇️ {t.label}
          </a>
        )
      })}
      {Array.isArray(tiersCfg.presets) && tiersCfg.presets.length > 0 && (
        <details style={{ fontSize: '0.72rem' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Formatos sociais</summary>
          <div style={{ marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            {tiersCfg.presets.map(p => (
              <a key={p.id}
                href={`/api/photos/${photoId}/download?preset=${p.id}`}
                style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                {p.label}
              </a>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function VideoDownloadActions({ item, pedido }) {
  const [info, setInfo] = useState(null)
  const blocked = ['reembolsado','reembolso_solicitado'].includes(String(pedido.status||'').toLowerCase())
    || pedido.refund?.status === 'pending' || pedido.refund?.status === 'approved'
  const videoId = item.videoId || item.id
  useEffect(() => {
    if (!videoId) return
    fetch(`/api/videos?ids=${videoId}`)
      .then(r => r.ok ? r.json() : [])
      .then(rows => setInfo(Array.isArray(rows) && rows[0] ? rows[0] : null))
      .catch(() => {})
  }, [videoId])
  const variant = item.isRaw ? 'original' : (info?.edited?.entregue ? 'edited' : 'original')
  const resolutionsAvailable = (() => {
    const list = []
    list.push({ label: 'Original' })
    const fromOriginal = Array.isArray(info?.resolutions) ? info.resolutions : []
    fromOriginal.forEach(r => list.push({ label: r.label }))
    if (info?.edited?.entregue && Array.isArray(info?.edited?.resolutions)) {
      info.edited.resolutions.forEach(r => list.push({ label: r.label, edited: true }))
    }
    return list
  })()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <a
        href={`/api/videos/${videoId}/download${variant === 'edited' ? '?variant=edited' : ''}`}
        download={item.originalName || `${videoId}.mp4`}
        className="btn btn-sm"
        style={{
          background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: '0.78rem',
          textDecoration: 'none', opacity: blocked ? 0.35 : 1,
          pointerEvents: blocked ? 'none' : 'auto', textAlign: 'center',
        }}
      >
        🎥 Baixar {variant === 'edited' ? 'editado' : (item.isRaw ? 'cru' : 'vídeo')}
      </a>
      {item.isRaw && info && !info.edited?.entregue && (
        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
          ⏳ Edição em produção. {item.rawDeliveryNote || info.rawDeliveryNote || ''}
        </span>
      )}
      {item.isRaw && info?.edited?.entregue && (
        <a
          href={`/api/videos/${videoId}/download?variant=edited`}
          className="btn btn-sm"
          style={{ background: 'var(--success-dim, var(--accent-dim))', color: 'var(--success, var(--accent))', fontSize: '0.75rem' }}
        >
          ✓ Editado disponível
        </a>
      )}
      {resolutionsAvailable.length > 1 && (
        <details style={{ fontSize: '0.72rem' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Outras resoluções</summary>
          <div style={{ marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            {resolutionsAvailable.slice(1).map(r => (
              <a key={`${r.edited ? 'e' : 'o'}-${r.label}`}
                href={`/api/videos/${videoId}/download?resolution=${encodeURIComponent(r.label)}${r.edited ? '&variant=edited' : ''}`}
                style={{ color: 'var(--accent)', textDecoration: 'none' }}
              >
                {r.edited ? '✏️ ' : ''}{r.label}
              </a>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function isPublicNote(note) {
  return note?.type === 'public' && String(note?.text || '').trim()
}

export default function ComprasPage() {
  const [cliente, setCliente] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [feedbacks, setFeedbacks] = useState({})
  const [feedbackDrafts, setFeedbackDrafts] = useState({})
  const [feedbackSavingOrderId, setFeedbackSavingOrderId] = useState(null)
  const [feedbackMsg, setFeedbackMsg] = useState({})
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [refundDrafts, setRefundDrafts] = useState({})
  const [refundMsg, setRefundMsg] = useState({})

  useEffect(() => {
    async function loadData() {
      try {
        const raw = localStorage.getItem('clienteLogado')
        if (!raw) return
        const cli = JSON.parse(raw)
        setCliente(cli)

        const pedidosRes = await fetch('/api/pedidos?meu=1')
        if (!pedidosRes.ok) return
        const allPedidos = await pedidosRes.json()
        const meusPedidos = allPedidos.filter(p =>
          p.clientId === cli.id || (p.whatsapp && cli.whatsapp && p.whatsapp === cli.whatsapp)
        )
        setPedidos(meusPedidos)

        const feedbackRes = await fetch('/api/feedback?userId=' + encodeURIComponent(cli.id))
        if (!feedbackRes.ok) return
        const feedbackItems = await feedbackRes.json()
        const byOrder = {}
        const drafts = {}
        for (const fb of feedbackItems) {
          const orderId = fb.orderId || fb.pedidoId
          if (!orderId || byOrder[orderId]) continue
          byOrder[orderId] = fb
          drafts[orderId] = {
            rating: Number(fb.rating) || 0,
            comment: fb.comment ?? fb.texto ?? '',
          }
        }
        setFeedbacks(byOrder)
        setFeedbackDrafts(drafts)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  function ensureDraft(orderId) {
    return feedbackDrafts[orderId] || {
      rating: Number(feedbacks[orderId]?.rating) || 0,
      comment: feedbacks[orderId]?.comment ?? feedbacks[orderId]?.texto ?? '',
    }
  }

  function updateDraft(orderId, patch) {
    setFeedbackDrafts(prev => ({
      ...prev,
      [orderId]: {
        ...ensureDraft(orderId),
        ...patch,
      },
    }))
  }

  async function saveFeedback(orderId) {
    if (!cliente) return
    const draft = ensureDraft(orderId)
    if (!draft.rating || draft.rating < 1 || draft.rating > 5) {
      setFeedbackMsg(prev => ({ ...prev, [orderId]: { type: 'error', text: 'Selecione de 1 a 5 estrelas.' } }))
      return
    }

    setFeedbackSavingOrderId(orderId)
    setFeedbackMsg(prev => ({ ...prev, [orderId]: null }))

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          rating: Number(draft.rating),
          comment: String(draft.comment || '').trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao salvar feedback.')
      }
      const saved = await res.json()
      setFeedbacks(prev => ({ ...prev, [orderId]: saved }))
      setFeedbackDrafts(prev => ({
        ...prev,
        [orderId]: {
          rating: Number(saved.rating) || 0,
          comment: saved.comment ?? saved.texto ?? '',
        },
      }))
      setFeedbackMsg(prev => ({ ...prev, [orderId]: { type: 'success', text: 'Feedback salvo com sucesso.' } }))
    } catch (error) {
      setFeedbackMsg(prev => ({ ...prev, [orderId]: { type: 'error', text: error.message } }))
    } finally {
      setFeedbackSavingOrderId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '40vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', marginBottom: '0.25rem' }}>
          Minhas Compras
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'} encontrado{pedidos.length !== 1 ? 's' : ''}
        </p>
      </div>

      {pedidos.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '3rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-dim)', fontSize: '1rem', marginBottom: '0.5rem' }}>Nenhuma compra realizada ainda.</p>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Navegue pelos eventos e encontre suas fotos!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {pedidos.map(pedido => {
            const isExpanded = expandedId === pedido.id
            const statusLabel = formatOrderStatusLabel(pedido)
            const financialStatus = getFinancialStatus(pedido)
            const statusStyle = getFinancialToneStyle(financialStatus.tone)
            const canGiveFeedback = isPedidoCompraConcluida(pedido.status)
            const draft = ensureDraft(pedido.id)
            const currentMsg = feedbackMsg[pedido.id]
            const publicNotes = (Array.isArray(pedido.notes) ? pedido.notes : []).filter(isPublicNote)
            const pricing = buildPedidoPricing(pedido)
            const financial = buildOrderFinancialSummary(pedido)
            const itensPedido = Array.isArray(pedido.itens) ? pedido.itens : []

            return (
              <div key={pedido.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <button
                  onClick={() => setExpandedId(prev => (prev === pedido.id ? null : pedido.id))}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1.25rem 1.5rem',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    gap: '1rem',
                    flexWrap: 'wrap',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--accent)' }}>
                      #{pedido.publicId || pedido.id.slice(0, 8)}
                    </span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>{formatDate(pedido.criadoEm)}</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {pedido.itens?.length || 0} {(pedido.itens?.length || 0) === 1 ? 'item' : 'itens'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: '1 1 180px', minWidth: '150px' }}>
                    {itensPedido.slice(0, 4).map((item, index) => {
                      const thumbCandidates = getPhotoCartPreviewCandidates(item)
                      const thumbSrc = getFirstUrl(thumbCandidates)
                      return (
                        <div key={`${pedido.id}-preview-${index}`} style={{ width: '46px', height: '34px', borderRadius: '6px', overflow: 'hidden', background: 'var(--bg-input)', border: '1px solid var(--border)', flexShrink: 0 }}>
                          {thumbSrc && (
                            <img
                              src={thumbSrc}
                              alt=""
                              loading="lazy"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={e => {
                                if (!applyNextImageFallback(e.target, thumbCandidates)) {
                                  e.target.style.display = 'none'
                                }
                              }}
                            />
                          )}
                        </div>
                      )
                    })}
                    {itensPedido.length > 4 && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginLeft: '0.25rem' }}>
                        +{itensPedido.length - 4}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '100px', background: statusStyle.bg, color: statusStyle.color, fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {statusLabel}
                    </span>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem' }}>
                      R$ {Number(pedido.total).toFixed(2).replace('.', ',')}
                    </span>
                    <span style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      &#9660;
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '1.25rem 1.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                      {(pedido.itens || []).map((item, index) => (
                        <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', gap: '0.75rem', flexWrap: 'wrap' }}>
                          {(() => {
                            const thumbCandidates = getPhotoCartPreviewCandidates(item)
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <img
                                  src={getFirstUrl(thumbCandidates)}
                                  alt=""
                                  style={{ width: '56px', height: '42px', objectFit: 'cover', borderRadius: '4px', background: 'var(--bg-input)' }}
                                  onError={e => {
                                    if (!applyNextImageFallback(e.target, thumbCandidates)) {
                                      e.target.style.display = 'none'
                                    }
                                  }}
                                />
                                <div>
                                  <p style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                                    {item.eventName || 'Evento'}
                                    {item.publicId && <span style={{ color: 'var(--accent)', marginLeft: '0.5rem', fontSize: '0.75rem' }}>#{item.publicId}</span>}
                                  </p>
                                  {(() => {
                                    const original = Number(item.priceOriginal ?? item.price ?? 0)
                                    const final = Number(item.priceComDesconto ?? item.price ?? 0)
                                    const hasDesc = final < original
                                    return (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: hasDesc ? '2px' : 0 }}>
                                        {hasDesc && <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textDecoration: 'line-through' }}>R$ {original.toFixed(2).replace('.', ',')}</span>}
                                        <span style={{ fontSize: '0.72rem', color: 'var(--accent)' }}>R$ {final.toFixed(2).replace('.', ',')}</span>
                                      </div>
                                    )
                                  })()}
                                </div>
                              </div>
                            )
                          })()}
                          {isPedidoCompraConcluida(pedido.status) && (
                            (item.mediaType === 'video' || item.tipo === 'video') ? (
                              <VideoDownloadActions item={item} pedido={pedido} />
                            ) : (
                              <PhotoTierDownload item={item} pedido={pedido} />
                            )
                          )}
                        </div>
                      ))}
                    </div>

                    <div style={{ marginBottom: '1rem', padding: '0.9rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)' }}>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Resumo do pedido</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span>Subtotal</span>
                        <strong style={{ color: 'var(--text)' }}>R$ {pricing.subtotal.toFixed(2).replace('.', ',')}</strong>
                      </div>
                      {pricing.descontoValor > 0 && (
                        (pricing.linhas && pricing.linhas.length > 0 ? pricing.linhas : [{ nomeEvento: 'Desconto progressivo', valor: pricing.descontoValor }]).map((l, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--accent)', marginTop: '0.25rem' }}>
                            <span>{l.pct ? `Desconto ${l.pct}%` : l.nomeEvento}</span>
                            <span>- R$ {l.valor.toFixed(2).replace('.', ',')}</span>
                          </div>
                        ))
                      )}
                      {pricing.taxaParcelamento > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#f59e0b', marginTop: '0.25rem' }}>
                          <span>Juros parcelamento</span>
                          <span>+ R$ {pricing.taxaParcelamento.toFixed(2).replace('.', ',')}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', marginTop: '0.35rem' }}>
                        <span>Total</span>
                        <strong style={{ color: 'var(--accent)' }}>R$ {pricing.totalFinal.toFixed(2).replace('.', ',')}</strong>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.35rem 1rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                        <span>Metodo: <strong style={{ color: 'var(--text)' }}>{financial.metodo || 'nao informado'}</strong></span>
                        <span>Parcelas: <strong style={{ color: 'var(--text)' }}>{financial.parcelas || 1}x</strong></span>
                        <span>Taxa parcelamento: <strong style={{ color: 'var(--text)' }}>R$ {financial.taxaParcelamento.toFixed(2).replace('.', ',')}</strong></span>
                        <span>Taxa gateway estimada: <strong style={{ color: 'var(--text)' }}>R$ {financial.gatewayFee.toFixed(2).replace('.', ',')}</strong></span>
                      </div>
                    </div>

                    {pedido.clientComment && (
                      <div style={{ marginBottom: '1rem', padding: '0.9rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)' }}>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Sua mensagem para o fotografo:</p>
                        <p style={{ fontSize: '0.84rem', color: 'var(--text)' }}>{pedido.clientComment}</p>
                      </div>
                    )}

                    {publicNotes.length > 0 && (
                      <div style={{ marginBottom: '1rem', padding: '0.9rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)' }}>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>Notas do fotografo:</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {publicNotes.map(note => (
                            <div key={note.id || note.createdAt} style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                              <p style={{ fontSize: '0.82rem', color: 'var(--text)' }}>{note.text}</p>
                              <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                                {formatDate(note.createdAt || note.criadoEm)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>Feedback pos-compra</p>

                      {!canGiveFeedback ? (
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                          Disponivel somente quando o pedido estiver com compra concluida.
                        </p>
                      ) : (
                        <>
                          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.65rem' }}>
                            {[1, 2, 3, 4, 5].map(star => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => updateDraft(pedido.id, { rating: star })}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '1.45rem',
                                  color: star <= Number(draft.rating || 0) ? '#f59e0b' : 'var(--text-dim)',
                                  padding: 0,
                                  lineHeight: 1,
                                }}
                                title={`${star} estrela${star > 1 ? 's' : ''}`}
                              >
                                &#9733;
                              </button>
                            ))}
                          </div>

                          {draft.rating > 0 && (
                            <div className="form-group" style={{ marginBottom: '0.6rem' }}>
                              <textarea
                                className="form-input"
                                placeholder="Comentario opcional..."
                                rows={3}
                                value={draft.comment}
                                onChange={e => updateDraft(pedido.id, { comment: e.target.value })}
                                style={{ resize: 'vertical' }}
                              />
                            </div>
                          )}

                          {currentMsg?.text && (
                            <div className={`alert ${currentMsg.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '0.6rem', fontSize: '0.8rem' }}>
                              {currentMsg.text}
                            </div>
                          )}

                          <button
                            className="btn btn-primary btn-sm"
                            disabled={feedbackSavingOrderId === pedido.id}
                            onClick={() => saveFeedback(pedido.id)}
                          >
                            {feedbackSavingOrderId === pedido.id ? 'Salvando...' : (feedbacks[pedido.id] ? 'Salvar alteracoes' : 'Enviar feedback')}
                          </button>
                        </>
                      )}
                    </div>
                    <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Solicitar reembolso</p>
                      {pedido.refund?.status && (
                        <p style={{ fontSize: '0.8rem', color: pedido.refund.status === 'denied' ? 'var(--danger)' : '#f59e0b' }}>
                          Status atual: {pedido.refund.status}
                        </p>
                      )}
                      {(['reembolsado','reembolso_solicitado'].includes(String(pedido.status||'').toLowerCase()) || pedido.refund?.status === 'pending' || pedido.refund?.status === 'approved') ? (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Já existe um reembolso em andamento para este pedido.</p>
                      ) : (
                        (() => {
                          const draft = refundDrafts[pedido.id] || { type: 'full', photos: new Set(), reason: '', pixKey: '' }
                          const togglePhoto = (pid) => {
                            setRefundDrafts(prev => {
                              const current = prev[pedido.id]?.photos ? new Set(prev[pedido.id].photos) : new Set()
                              if (current.has(pid)) current.delete(pid); else current.add(pid)
                              return { ...prev, [pedido.id]: { ...draft, photos: current } }
                            })
                          }
                          const updateDraft = (patch) => {
                            setRefundDrafts(prev => ({ ...prev, [pedido.id]: { ...draft, ...patch } }))
                          }
                          const submitRefund = async () => {
                            if (!draft.reason.trim() || !draft.pixKey.trim()) {
                              setRefundMsg(prev => ({ ...prev, [pedido.id]: { type: 'error', text: 'Preencha motivo e chave Pix.' } }))
                              return
                            }
                            const photosArray = draft.type === 'partial'
                              ? Array.from(draft.photos || [])
                              : []
                            if (draft.type === 'partial' && photosArray.length === 0) {
                              setRefundMsg(prev => ({ ...prev, [pedido.id]: { type: 'error', text: 'Selecione ao menos uma foto para reembolso parcial.' } }))
                              return
                            }
                            try {
                              const res = await fetch('/api/pedidos', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  id: pedido.id,
                                  refund: {
                                    requested: true,
                                    status: 'pending',
                                    type: draft.type === 'partial' ? 'partial' : 'full',
                                    photos: photosArray,
                                    reason: draft.reason.trim(),
                                    pixKey: draft.pixKey.trim(),
                                    requestedAt: new Date().toISOString(),
                                  },
                                }),
                              })
                              if (!res.ok) {
                                const data = await res.json().catch(() => ({}))
                                throw new Error(data.error || 'Erro ao solicitar reembolso.')
                              }
                              const updated = await res.json()
                              setPedidos(prev => prev.map(p => p.id === pedido.id ? updated : p))
                              setRefundMsg(prev => ({ ...prev, [pedido.id]: { type: 'success', text: 'Reembolso solicitado.' } }))
                            } catch (err) {
                              setRefundMsg(prev => ({ ...prev, [pedido.id]: { type: 'error', text: err.message } }))
                            }
                          }
                          return (
                            <>
                              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                                  <input type="radio" name={`refund-type-${pedido.id}`} checked={draft.type === 'full'} onChange={() => updateDraft({ type: 'full' })} />
                                  <span>Reembolso total</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                                  <input type="radio" name={`refund-type-${pedido.id}`} checked={draft.type === 'partial'} onChange={() => updateDraft({ type: 'partial' })} />
                                  <span>Reembolso parcial</span>
                                </label>
                              </div>
                              {draft.type === 'partial' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                  {(pedido.itens || []).map((item, idx) => (
                                    <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
                                      <input
                                        type="checkbox"
                                        checked={(draft.photos || new Set()).has(item.photoId || item.id)}
                                        onChange={() => togglePhoto(item.photoId || item.id)}
                                      />
                                      <span>{item.eventName || 'Foto'} {item.publicId ? `#${item.publicId}` : ''}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                className="form-input"
                                placeholder="Chave Pix"
                                value={draft.pixKey}
                                onChange={e => updateDraft({ pixKey: e.target.value })}
                              />
                              <textarea
                                className="form-input"
                                rows={3}
                                placeholder="Motivo do reembolso"
                                value={draft.reason}
                                onChange={e => updateDraft({ reason: e.target.value })}
                                style={{ resize: 'vertical' }}
                              />
                              {refundMsg[pedido.id]?.text && (
                                <div className={`alert ${refundMsg[pedido.id].type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ fontSize: '0.8rem' }}>
                                  {refundMsg[pedido.id].text}
                                </div>
                              )}
                              <button className="btn btn-sm btn-primary" onClick={submitRefund}>Enviar pedido de reembolso</button>
                            </>
                          )
                        })()
                      )}
                    </div>
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
