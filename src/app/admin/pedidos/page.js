'use client'
// src/app/admin/pedidos/page.js

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  buildOrderFinancialSummary,
  getFinancialStatus,
  getFinancialToneStyle,
  getPedidoItens,
  normalizePedidoStatus,
  summarizeFinancialOrders,
} from '@/lib/commerceUtils'
import { applyNextImageFallback, getFirstUrl, getPhotoCartPreviewCandidates } from '@/lib/imagePaths'
import { buildWhatsAppHref, formatarWhatsApp } from '@/lib/whatsapp'

const STATUS_LABEL = {
  pago:      { label: 'Pago',       color: 'var(--success)', bg: 'var(--success-dim)' },
  pendente:  { label: 'Pendente',   color: 'var(--accent)',  bg: 'var(--accent-dim)'  },
  cancelado: { label: 'Cancelado',  color: 'var(--danger)',  bg: 'var(--danger-dim)'  },
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Retorna o melhor nome para exibir ao fotógrafo:
// prefere o nome original do arquivo (IMG_5823.JPG), cai no filename interno se não tiver
function displayName(item) {
  return item.originalName || item.filename || '—'
}

export default function PedidosPage() {
  const [pedidos, setPedidos]       = useState([])
  const [feedbacksByOrder, setFeedbacksByOrder] = useState({})
  const [noteDraftByOrder, setNoteDraftByOrder] = useState({})
  const [savingNoteOrderId, setSavingNoteOrderId] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [expandido, setExpandido]   = useState(null)
  const [atualizando, setAtualizando] = useState(null)
  const [filtro, setFiltro]         = useState('todos')
  const [busca, setBusca]           = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pedidosRes, feedbackRes] = await Promise.all([
        fetch('/api/pedidos?admin=1'),
        fetch('/api/feedback'),
      ])
      const pedidosData = pedidosRes.ok ? await pedidosRes.json() : []
      setPedidos(Array.isArray(pedidosData) ? pedidosData : [])

      if (feedbackRes.ok) {
        const feedbackItems = await feedbackRes.json()
        const nextMap = {}
        for (const item of feedbackItems) {
          const orderId = item.orderId || item.pedidoId
          if (!orderId || nextMap[orderId]) continue
          nextMap[orderId] = item
        }
        setFeedbacksByOrder(nextMap)
      } else {
        setFeedbacksByOrder({})
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function atualizarStatus(id, novoStatus) {
    setAtualizando(id)
    try {
      await fetch('/api/pedidos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: novoStatus }),
      })
      setPedidos(prev => prev.map(p => p.id === id ? { ...p, status: novoStatus } : p))
    } catch { alert('Erro ao atualizar status') }
    finally { setAtualizando(null) }
  }

  async function gerarNovoLink(pedido) {
    const status = normalizePedidoStatus(pedido.status)
    if (!['pendente', 'cancelado'].includes(status)) return
    const metodoAtual = pedido.pagamento?.metodo || 'pix'
    const metodo = window.prompt('Metodo para o novo link (pix ou cartao):', metodoAtual)
    if (!metodo) return
    const metodoNormalizado = metodo.trim().toLowerCase()
    if (!['pix', 'cartao'].includes(metodoNormalizado)) {
      alert('Metodo invalido. Use pix ou cartao.')
      return
    }

    setAtualizando(pedido.id)
    try {
      const res = await fetch('/api/pagamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedidoId: pedido.id,
          metodo: metodoNormalizado,
          parcelas: metodoNormalizado === 'cartao' ? (pedido.parcelas || 1) : 1,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar novo link.')
      setPedidos(prev => prev.map(item => item.id === pedido.id ? data.pedido : item))
      const link = data.pagamento?.asaasPaymentLink || data.pagamento?.pixQRUrl || null
      if (link && window.confirm('Novo link gerado. Abrir agora?')) {
        window.open(link, '_blank', 'noopener,noreferrer')
      } else {
        alert('Nova tentativa de pagamento registrada no pedido.')
      }
    } catch (error) {
      alert(error.message)
    } finally {
      setAtualizando(null)
    }
  }

  async function adicionarNota(orderId) {
    const draft = noteDraftByOrder[orderId] || { type: 'private', text: '' }
    const text = String(draft.text || '').trim()
    if (!text) return

    setSavingNoteOrderId(orderId)
    try {
      const res = await fetch('/api/pedidos/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          type: draft.type || 'private',
          text,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao adicionar nota.')
      }
      const data = await res.json()
      setPedidos(prev => prev.map(item => item.id === orderId ? data.pedido : item))
      setNoteDraftByOrder(prev => ({
        ...prev,
        [orderId]: { type: draft.type || 'private', text: '' },
      }))
    } catch (error) {
      alert(error.message)
    } finally {
      setSavingNoteOrderId(null)
    }
  }

  const pedidosFiltrados = pedidos.filter(p => {
    const statusNormalizado = normalizePedidoStatus(p.status)
    const passaFiltro = filtro === 'todos' || statusNormalizado === filtro
    // Busca por nome, WhatsApp, publicId numérico ou UUID parcial
    const passaBusca = !busca ||
      (p.nome || p.clienteNome || '').toLowerCase().includes(busca.toLowerCase()) ||
      (p.whatsapp || '').includes(busca) ||
      (p.publicId && p.publicId.includes(busca)) ||
      (p.id || '').toLowerCase().includes(busca.toLowerCase())
    return passaFiltro && passaBusca
  })

  // Apenas gateways de produção real (exclui manual e sandbox)
  const financeiro          = summarizeFinancialOrders(pedidos)
  const pedidosPagos        = pedidos.filter(p => buildOrderFinancialSummary(p).realPaid)
  const totalReceita        = financeiro.gross
  const totalFotosVendidas  = financeiro.itemsSold
  const ticketMedio         = financeiro.realPaidCount > 0 ? totalReceita / financeiro.realPaidCount : 0

  if (loading) return (
    <div className="flex-center" style={{ height: '60vh', gap: '1rem' }}>
      <div className="spinner" style={{ width: '32px', height: '32px' }} />
      <span style={{ color: 'var(--text-muted)' }}>Carregando pedidos...</span>
    </div>
  )

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-page-title">Pedidos & Vendas</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} no total
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>🔄 Atualizar</button>
      </div>

      {/* Métricas */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <p className="stat-label">Faturamento Bruto</p>
          <p className="stat-value" style={{ color: 'var(--success)', fontSize: '1.6rem' }}>
            R$ {totalReceita.toFixed(2).replace('.', ',')}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Liquido Estimado</p>
          <p className="stat-value" style={{ color: 'var(--accent)', fontSize: '1.5rem' }}>
            R$ {financeiro.net.toFixed(2).replace('.', ',')}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Taxas Estimadas</p>
          <p className="stat-value" style={{ fontSize: '1.5rem' }}>
            R$ {financeiro.gatewayFees.toFixed(2).replace('.', ',')}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Pedidos Reais</p>
          <p className="stat-value">{pedidosPagos.length}</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            {totalFotosVendidas} fotos · ticket {ticketMedio > 0 ? `R$ ${ticketMedio.toFixed(2).replace('.', ',')}` : '-'}
          </p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            {financeiro.simulatedCount} simulacao/liberacao
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          className="form-input"
          style={{ maxWidth: '280px' }}
          placeholder="Buscar por nome, WhatsApp, nº do pedido..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        {['todos', 'pago', 'pendente', 'cancelado'].map(f => (
          <button
            key={f}
            className={`btn btn-sm ${filtro === f ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltro(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', opacity: 0.7 }}>
              ({f === 'todos' ? pedidos.length : pedidos.filter(p => normalizePedidoStatus(p.status) === f).length})
            </span>
          </button>
        ))}
      </div>

      {/* Lista */}
      {pedidosFiltrados.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h2 className="empty-state-title">
            {busca || filtro !== 'todos' ? 'Nenhum pedido encontrado' : 'Nenhum pedido ainda'}
          </h2>
          <p>
            {busca || filtro !== 'todos'
              ? 'Tente outro filtro ou termo de busca.'
              : 'Os pedidos aparecerão aqui quando clientes finalizarem compras.'
            }
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {pedidosFiltrados.map(pedido => {
            const itensPedido = getPedidoItens(pedido)
            const statusNormalizado = normalizePedidoStatus(pedido.status)
            const financialStatus = getFinancialStatus(pedido)
            const s = getFinancialToneStyle(financialStatus.tone)
            const financial = buildOrderFinancialSummary(pedido)
            const aberto = expandido === pedido.id
            const feedback = feedbacksByOrder[pedido.id] || null
            const noteDraft = noteDraftByOrder[pedido.id] || { type: 'private', text: '' }

            return (
              <div key={pedido.id} style={{
                background: 'var(--bg-card)',
                border: `1px solid ${aberto ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}>

                {/* Linha resumo */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', cursor: 'pointer' }}
                  onClick={() => setExpandido(aberto ? null : pedido.id)}
                >
                  {/* Miniaturas */}
                  <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                    {itensPedido.slice(0, 3).map((item, i) => (
                      (() => {
                        const previewCandidates = getPhotoCartPreviewCandidates(item)
                        return (
                          <img
                            key={i}
                            src={getFirstUrl(previewCandidates)}
                            alt=""
                            style={{ width: '40px', height: '30px', objectFit: 'cover', borderRadius: '3px', opacity: statusNormalizado === 'cancelado' ? 0.4 : 1 }}
                            onError={e => {
                              if (!applyNextImageFallback(e.target, previewCandidates)) {
                                e.target.style.display = 'none'
                              }
                            }}
                          />
                        )
                      })()
                    ))}
                    {itensPedido.length > 3 && (
                      <div style={{
                        width: '40px', height: '30px', borderRadius: '3px',
                        background: 'var(--bg-secondary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.65rem', color: 'var(--text-muted)',
                      }}>
                        +{itensPedido.length - 3}
                      </div>
                    )}
                  </div>

                  {/* Info cliente */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                      <p style={{ fontWeight: '400', color: 'var(--text)', fontSize: '0.9rem' }}>
                        {pedido.nome}
                      </p>
                      {/* ID numérico do pedido — 9 dígitos, série 2xxxxxxxx */}
                      <span style={{
                        fontSize: '0.72rem', color: 'var(--accent)',
                        fontFamily: 'monospace', letterSpacing: '0.05em',
                      }}>
                        #{pedido.publicId || pedido.id.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                      {pedido.whatsapp && (
                        <a
                          href={buildWhatsAppHref(pedido.whatsapp)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textDecoration: 'none' }}
                          onClick={e => e.stopPropagation()}
                        >
                          📱 {formatarWhatsApp(pedido.whatsapp) || pedido.whatsapp}
                        </a>
                      )}
                      {(pedido.email || pedido.pagador?.email) && (
                        <a
                          href={`mailto:${pedido.email || pedido.pagador.email}`}
                          style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textDecoration: 'none' }}
                          onClick={e => e.stopPropagation()}
                        >
                          {pedido.email || pedido.pagador.email}
                        </a>
                      )}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>🕐 {formatDate(pedido.criadoEm)}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        📷 {itensPedido.length} foto{itensPedido.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Total */}
                  <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: 'var(--accent)', flexShrink: 0 }}>
                    R$ {Number(pedido.total).toFixed(2).replace('.', ',')}
                  </p>

                  {/* Status badge */}
                  <span style={{
                    background: s.bg, color: s.color,
                    padding: '0.2rem 0.7rem', borderRadius: '100px',
                    fontSize: '0.72rem', letterSpacing: '0.06em', flexShrink: 0,
                  }}>
                    {financialStatus.label}
                  </span>

                  {/* Seta */}
                  <span style={{
                    color: 'var(--text-dim)', fontSize: '1rem',
                    transform: aberto ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.2s', flexShrink: 0,
                  }}>›</span>
                </div>

                {/* Detalhe expandido */}
                {aberto && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '1.25rem', background: 'var(--bg-secondary)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1.5rem', alignItems: 'start' }}>

                      {/* Fotos vendidas */}
                      <div>
                        <p style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                          Fotos vendidas
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {itensPedido.map((item, i) => (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'center', gap: '0.75rem',
                              background: 'var(--bg-card)', borderRadius: 'var(--radius)',
                              padding: '0.5rem 0.75rem',
                            }}>
                              {(() => {
                                const previewCandidates = getPhotoCartPreviewCandidates(item)
                                return (
                                  <img
                                    src={getFirstUrl(previewCandidates)}
                                    alt=""
                                    style={{ width: '48px', height: '36px', objectFit: 'cover', borderRadius: '3px', flexShrink: 0 }}
                                    onError={e => {
                                      if (!applyNextImageFallback(e.target, previewCandidates)) {
                                        e.target.style.display = 'none'
                                      }
                                    }}
                                  />
                                )
                              })()}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text)' }}>
                                  {item.eventName}
                                  {/* ID numérico da foto */}
                                  {item.publicId && (
                                    <span style={{ color: 'var(--accent)', marginLeft: '0.5rem', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                                      #{item.publicId}
                                    </span>
                                  )}
                                </p>
                                {/* Nome original do arquivo (como estava no computador do fotógrafo) */}
                                <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {displayName(item)}
                                </p>
                              </div>
                              <span style={{ color: 'var(--accent)', fontSize: '0.85rem', flexShrink: 0 }}>
                                R$ {Number(item.price).toFixed(2).replace('.', ',')}
                              </span>
                              {/* Download do original */}
                              <a
                                href={`/api/photos/${item.photoId || item.id}/download`}
                                download={item.originalName || item.filename}
                                className="btn btn-sm btn-ghost"
                                title="Baixar original"
                                style={{ flexShrink: 0 }}
                                onClick={e => e.stopPropagation()}
                              >
                                ⬇
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Ações */}
                      <div style={{ minWidth: '200px' }}>
                        <p style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                          Ações
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                          {['pago', 'pendente', 'cancelado'].map(st => (
                            <button
                              key={st}
                              className={`btn btn-sm ${statusNormalizado === st ? 'btn-primary' : 'btn-ghost'}`}
                              disabled={statusNormalizado === st || atualizando === pedido.id}
                              onClick={() => atualizarStatus(pedido.id, st)}
                            >
                              {atualizando === pedido.id && statusNormalizado !== st
                                ? <div className="spinner" style={{ width: '12px', height: '12px' }} />
                                : STATUS_LABEL[st].label
                              }
                            </button>
                          ))}
                        </div>
                        <a
                          href={buildWhatsAppHref(pedido.whatsapp)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-full"
                          style={{ background: '#25D366', color: 'white', border: 'none', textDecoration: 'none', textAlign: 'center' }}
                          onClick={e => e.stopPropagation()}
                        >
                          📱 Contato WhatsApp
                        </a>
                        {['pendente', 'cancelado'].includes(statusNormalizado) && (
                          <button
                            className="btn btn-sm btn-primary btn-full"
                            style={{ marginTop: '0.5rem' }}
                            disabled={atualizando === pedido.id}
                            onClick={() => gerarNovoLink(pedido)}
                          >
                            {atualizando === pedido.id ? 'Gerando...' : 'Gerar novo link'}
                          </button>
                        )}
                        {pedido.clientComment && (
                          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            <p style={{ color: 'var(--text)', marginBottom: '0.3rem', fontWeight: 600 }}>Comentario do cliente</p>
                            <p style={{ color: 'var(--text)' }}>{pedido.clientComment}</p>
                          </div>
                        )}
                        {feedback && (
                          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            <p style={{ color: 'var(--text)', marginBottom: '0.3rem', fontWeight: 600 }}>Feedback pos-compra</p>
                            <div style={{ display: 'flex', gap: '0.2rem', marginBottom: (feedback.comment || feedback.texto) ? '0.35rem' : 0 }}>
                              {[1, 2, 3, 4, 5].map(star => (
                                <span key={star} style={{ color: star <= Number(feedback.rating || 0) ? '#f59e0b' : 'var(--text-dim)', fontSize: '1rem', lineHeight: 1 }}>
                                  &#9733;
                                </span>
                              ))}
                            </div>
                            {(feedback.comment || feedback.texto) && <p style={{ color: 'var(--text)' }}>{feedback.comment || feedback.texto}</p>}
                          </div>
                        )}
                        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          <p style={{ color: 'var(--text)', marginBottom: '0.4rem', fontWeight: 600 }}>Notas do fotografo</p>
                          {Array.isArray(pedido.notes) && pedido.notes.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
                              {pedido.notes.map(note => (
                                <div key={note.id || note.createdAt} style={{ padding: '0.45rem 0.55rem', borderRadius: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                                  <p style={{ color: 'var(--text)' }}>{note.text}</p>
                                  <p style={{ marginTop: '0.2rem' }}>
                                    <span style={{ color: note.type === 'public' ? 'var(--success)' : 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.66rem' }}>
                                      {note.type === 'public' ? 'PUBLICA' : 'PRIVADA'}
                                    </span>
                                    <span style={{ marginLeft: '0.4rem' }}>{formatDate(note.createdAt || note.criadoEm)}</span>
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p style={{ marginBottom: '0.5rem' }}>Nenhuma nota registrada.</p>
                          )}
                          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                            <select
                              className="form-input"
                              value={noteDraft.type}
                              onChange={e => setNoteDraftByOrder(prev => ({ ...prev, [pedido.id]: { ...noteDraft, type: e.target.value } }))}
                              style={{ height: '34px', fontSize: '0.75rem' }}
                            >
                              <option value="private">Privada</option>
                              <option value="public">Publica</option>
                            </select>
                          </div>
                          <textarea
                            className="form-input"
                            rows={3}
                            value={noteDraft.text}
                            onChange={e => setNoteDraftByOrder(prev => ({ ...prev, [pedido.id]: { ...noteDraft, text: e.target.value } }))}
                            placeholder="Adicionar nota"
                            style={{ resize: 'vertical', marginBottom: '0.45rem' }}
                          />
                          <button
                            className="btn btn-sm btn-primary btn-full"
                            onClick={() => adicionarNota(pedido.id)}
                            disabled={savingNoteOrderId === pedido.id}
                          >
                            {savingNoteOrderId === pedido.id ? 'Salvando...' : 'Adicionar nota'}
                          </button>
                        </div>
                        {(pedido.parcelas > 1 || pedido.taxaParcelamento > 0) && (
                          <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            📦 {pedido.parcelas || 1}x parcelado
                            {pedido.taxaParcelamento > 0 && <span style={{ color: '#f59e0b', marginLeft: '0.4rem' }}>· taxa +R$ {Number(pedido.taxaParcelamento).toFixed(2).replace('.', ',')}</span>}
                          </div>
                        )}
                        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
                          <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>Resumo financeiro</p>
                          <p>Status: <strong style={{ color: s.color }}>{financialStatus.label}</strong></p>
                          <p>Valor base: <strong style={{ color: 'var(--text)' }}>R$ {financial.subtotal.toFixed(2).replace('.', ',')}</strong></p>
                          <p>Descontos: <strong style={{ color: 'var(--text)' }}>R$ {financial.descontoValor.toFixed(2).replace('.', ',')}</strong></p>
                          <p>Taxa de parcelamento: <strong style={{ color: 'var(--text)' }}>R$ {financial.taxaParcelamento.toFixed(2).replace('.', ',')}</strong></p>
                          <p>Taxa estimada gateway: <strong style={{ color: 'var(--text)' }}>R$ {financial.gatewayFee.toFixed(2).replace('.', ',')}</strong></p>
                          <p>Liquido estimado: <strong style={{ color: 'var(--accent)' }}>R$ {financial.net.toFixed(2).replace('.', ',')}</strong></p>
                          <p>Metodo: <strong style={{ color: 'var(--text)' }}>{financial.metodo || 'nao informado'}</strong> · Parcelas: <strong style={{ color: 'var(--text)' }}>{financial.parcelas || 1}x</strong></p>
                        </div>
                        {pedido.pagamento && (
                          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
                            <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>💳 Pagamento</p>
                            <p>Gateway: <strong style={{ color: 'var(--text)' }}>{pedido.pagamento.gateway}</strong></p>
                            <p>Método: <strong style={{ color: 'var(--text)' }}>{pedido.pagamento.metodo}</strong></p>
                            <p>Status: <strong style={{ color: pedido.pagamento.status === 'RECEIVED' || pedido.pagamento.status === 'succeeded' ? 'var(--success)' : 'var(--accent)' }}>{pedido.pagamento.status}</strong></p>
                            {pedido.pagamento.chargeId && <p style={{ wordBreak: 'break-all' }}>ID: <code style={{ fontSize: '0.68rem' }}>{pedido.pagamento.chargeId}</code></p>}
                            {pedido.pagamento.expiresAt && <p>Expira em: {new Date(pedido.pagamento.expiresAt).toLocaleString('pt-BR')}</p>}
                            {pedido.pagamento.asaasPaymentLink && (
                              <p><a href={pedido.pagamento.asaasPaymentLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Abrir link de pagamento</a></p>
                            )}
                            {pedido.pagamento.pixCode && (
                              <p style={{ wordBreak: 'break-all' }}>PIX: <code style={{ fontSize: '0.68rem' }}>{String(pedido.pagamento.pixCode).slice(0, 90)}...</code></p>
                            )}
                            {pedido.pagamento.pagoEm && <p>Pago em: {new Date(pedido.pagamento.pagoEm).toLocaleString('pt-BR')}</p>}
                            {pedido.pagamento.sobreposto && (
                              <div style={{ marginTop: '0.4rem', padding: '0.4rem 0.6rem', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '4px', color: '#f59e0b' }}>
                                ⚠️ Pago definido manualmente pelo fotógrafo
                                {pedido.pagamento.sobrepostoEm && <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', color: 'var(--text-dim)' }}>em {new Date(pedido.pagamento.sobrepostoEm).toLocaleString('pt-BR')}</span>}
                                {pedido.pagamento.statusOriginalGateway && <span style={{ display: 'block', fontSize: '0.68rem' }}>Status original no gateway: {pedido.pagamento.statusOriginalGateway}</span>}
                              </div>
                            )}
                            {Array.isArray(pedido.pagamentoTentativas) && pedido.pagamentoTentativas.length > 0 && (
                              <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                                <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>Tentativas</p>
                                {pedido.pagamentoTentativas.slice(0, 5).map(attempt => (
                                  <p key={attempt.id || attempt.chargeId || attempt.criadoEm} style={{ fontSize: '0.7rem' }}>
                                    {new Date(attempt.criadoEm).toLocaleString('pt-BR')} · {attempt.metodo} · {attempt.gateway} · {attempt.status}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
