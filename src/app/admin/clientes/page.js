'use client'
// src/app/admin/clientes/page.js

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { applyNextImageFallback, getFirstUrl, getPhotoCartPreviewCandidates, getUploadsUrlFallbackCandidates } from '@/lib/imagePaths'
import { formatarCPF, mascararCPF } from '@/lib/cpf'
import { buildWhatsAppHref, formatarWhatsApp } from '@/lib/whatsapp'
import Avatar from '@/components/Avatar'
import AvatarUploader from '@/components/AvatarUploader'

const UFS_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
]

function normalizeInstagram(value) {
  return String(value || '').replace(/^@+/, '').trim()
}

function formatList(values) {
  if (!Array.isArray(values) || values.length === 0) return '-'
  return values.filter(Boolean).join(', ')
}

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getClientRole(cliente) {
  if (cliente?.isSuperAdmin) return 'admin'
  if (cliente?.isAdmin) return 'colaborador'
  return 'cliente'
}

function getClientRoleLabel(cliente) {
  if (cliente?.isSuperAdmin) return 'Admin'
  if (cliente?.isAdmin) return 'Colaborador'
  return 'Cliente'
}

function getLastAccess(cliente) {
  return cliente?.ultimoAcessoEm || cliente?.ultimoLoginEm || cliente?.lastLoginAt || cliente?.lastAccessAt || null
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function getClientOrders(cliente, pedidos = []) {
  return pedidos.filter(p =>
    p.clientId === cliente.id ||
    (p.whatsapp && cliente?.whatsapp && normalizeDigits(p.whatsapp) === normalizeDigits(cliente.whatsapp)) ||
    (p.email && cliente?.email && p.email === cliente.email)
  )
}

function isProtectedAccount(cliente) {
  return !!(cliente?.isAdmin || cliente?.isSuperAdmin)
}

function ClienteModal({ cliente: clienteProp, pedidos, remocoes, carrinhos, isSuperAdmin, onClose, onUpdated }) {
  const [cliente, setClienteLocal] = useState(clienteProp)
  useEffect(() => { setClienteLocal(clienteProp) }, [clienteProp?.id])
  function handleAvatarChange(updated) {
    setClienteLocal(updated)
    onUpdated?.(updated)
  }
  const [subTab, setSubTab] = useState('compras')
  const [comentarios, setComentarios] = useState([])
  const [loadingComentarios, setLoadingComentarios] = useState(true)
  const [atualizandoComentario, setAtualizandoComentario] = useState(null)
  const [ordenacaoComentarios, setOrdenacaoComentarios] = useState('top') // top | recent
  const [repliesOpen, setRepliesOpen] = useState({})
  const [historyOpen, setHistoryOpen] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [emailForm, setEmailForm] = useState({ subject: '', body: '' })
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailMsg, setEmailMsg] = useState({ type: '', text: '' })
  const [emailConfigured, setEmailConfigured] = useState(null)
  const clienteId = cliente?.id || null
  const instagramHandle = normalizeInstagram(cliente?.instagram)
  const instagramUrl = instagramHandle ? `https://instagram.com/${instagramHandle}` : null

  const meusPedidos = getClientOrders(cliente, pedidos)
    .sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0))

  const minhasRemocoes = remocoes.filter(r =>
    (r.clientId && r.clientId === clienteId) ||
    (r.contato && cliente?.whatsapp && normalizeDigits(r.contato) === normalizeDigits(cliente.whatsapp))
  ).sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0))

  const carrinho = carrinhos.find(c => c.id === clienteId)
  const itensCarrinho = carrinho?.carrinho || []
  const notasPedidos = meusPedidos.flatMap(pedido =>
    (Array.isArray(pedido.notes) ? pedido.notes : []).map(note => ({ ...note, pedido }))
  ).sort((a, b) => new Date(b.createdAt || b.criadoEm || 0) - new Date(a.createdAt || a.criadoEm || 0))

  const totalGasto = meusPedidos.filter(p => p.status === 'pago').reduce((s, p) => s + Number(p.total || 0), 0)

  const carregarComentarios = useCallback(async () => {
    if (!clienteId) {
      setComentarios([])
      setLoadingComentarios(false)
      return
    }
    setLoadingComentarios(true)
    try {
      const params = new URLSearchParams({
        clientId: clienteId,
        admin: '1',
        includeHistory: '1',
        includeContext: '1',
        tree: '1',
        sort: ordenacaoComentarios,
      })
      const res = await fetch(`/api/comentarios?${params.toString()}`)
      const data = res.ok ? await res.json() : []
      setComentarios(Array.isArray(data) ? data : [])
    } catch {
      setComentarios([])
    } finally {
      setLoadingComentarios(false)
    }
  }, [clienteId, ordenacaoComentarios])

  useEffect(() => {
    carregarComentarios()
  }, [carregarComentarios])

  useEffect(() => {
    if (subTab !== 'email' || emailConfigured !== null) return
    fetch('/api/email').then(r => r.json()).then(d => setEmailConfigured(!!d.configured)).catch(() => setEmailConfigured(false))
  }, [subTab, emailConfigured])

  async function handleSendEmail(e) {
    e.preventDefault()
    if (!emailForm.subject.trim() || !emailForm.body.trim()) return
    setSendingEmail(true)
    setEmailMsg({ type: '', text: '' })
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: cliente.id, subject: emailForm.subject, body: emailForm.body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar e-mail.')
      setEmailMsg({ type: 'success', text: 'E-mail enviado com sucesso.' })
      setEmailForm({ subject: '', body: '' })
    } catch (err) {
      setEmailMsg({ type: 'error', text: err.message })
    } finally {
      setSendingEmail(false)
    }
  }

  async function changeVisibility(comentario, action) {
    setAtualizandoComentario(comentario.id)
    try {
      const res = await fetch('/api/comentarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comentario.id, action }),
      })
      if (!res.ok) throw new Error()
      await carregarComentarios()
    } catch {
      alert('Erro ao atualizar comentario.')
    } finally {
      setAtualizandoComentario(null)
    }
  }

  async function salvarEdicao(comentario) {
    if (!editingId || savingEdit) return
    const texto = editingText.trim()
    if (!texto) return
    if (texto.length > 1000) return

    setSavingEdit(true)
    try {
      const res = await fetch('/api/comentarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comentario.id, action: 'edit', texto }),
      })
      if (!res.ok) throw new Error()
      setEditingId(null)
      setEditingText('')
      await carregarComentarios()
    } catch {
      alert('Erro ao editar comentario.')
    } finally {
      setSavingEdit(false)
    }
  }

  function renderThumb(ctx, { size = 46 } = {}) {
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

  function getScopeLabel(c) {
    const type = c.contextType || c.context?.type
    if (type === 'foto') return 'Foto'
    if (type === 'pasta') return 'Pasta'
    if (type === 'album') return 'Album'
    if (c.photoId) return 'Foto'
    if (c.pasta) return 'Pasta'
    return 'Album'
  }

  function renderContextLine(c) {
    const ctx = c.context || null
    const url = ctx?.url || null
    const albumNome = ctx?.album?.nome || c.eventId || '-'
    const pastaNome = ctx?.pasta?.nome || c.pasta || null
    const fotoId = ctx?.foto?.id || c.photoId || null
    const curtidas = Number(c.curtidas || 0)

    return (
      <div style={{ flex: 1, minWidth: '240px' }}>
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

  function renderHistory(c) {
    if (!historyOpen[c.id]) return null
    const entries = Array.isArray(c.historicoEdicoes) ? c.historicoEdicoes : []
    if (entries.length === 0) {
      return (
        <div style={{ marginTop: '0.7rem', borderTop: '1px dashed var(--border)', paddingTop: '0.6rem' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0 }}>
            Sem historico de edicao.
          </p>
        </div>
      )
    }

    return (
      <div style={{ marginTop: '0.7rem', borderTop: '1px dashed var(--border)', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {entries.map(entry => (
          <div key={entry.id} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.55rem 0.7rem' }}>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
              {new Date(entry.editadoEm || 0).toLocaleString('pt-BR')} - {entry.editadoPorNome}{entry.editadoPorAdmin ? ' (admin)' : ''}
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
    )
  }

  if (!cliente) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', maxWidth: '780px', width: '100%', maxHeight: '88vh', overflow: 'auto', padding: '2rem' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
            <Avatar client={cliente} size={72} variant="large" fontScale={0.4} />
            <div style={{ minWidth: 0 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem' }}>{cliente.nomeCompleto || cliente.nome || '-'}</h2>
            {cliente.email && (
              <a href={`mailto:${cliente.email}`} style={{ fontSize: '0.8rem', color: 'var(--accent)', marginTop: '0.25rem', display: 'inline-block', textDecoration: 'none' }}>
                {cliente.email}
              </a>
            )}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total gasto: <strong style={{ color: 'var(--success)' }}>R$ {totalGasto.toFixed(2).replace('.', ',')}</strong></span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Compras: <strong>{meusPedidos.filter(p => p.status === 'pago').length}</strong></span>
              {itensCarrinho.length > 0 && <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>Carrinho: {itensCarrinho.length}</span>}
              {minhasRemocoes.length > 0 && <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>Aviso {minhasRemocoes.length} reclamação{minhasRemocoes.length !== 1 ? 'ões' : ''}</span>}
            </div>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Foto de perfil</p>
          <AvatarUploader client={cliente} onChange={handleAvatarChange} size={88} />
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Nome completo</p>
              <p style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{cliente.nomeCompleto || '-'}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Email</p>
              {cliente.email ? (
                <a href={`mailto:${cliente.email}`} style={{ fontSize: '0.86rem', color: 'var(--accent)', textDecoration: 'none' }}>{cliente.email}</a>
              ) : (
                <p style={{ fontSize: '0.86rem', color: 'var(--text)' }}>-</p>
              )}
            </div>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>WhatsApp</p>
              {cliente.whatsapp ? (
                <a href={buildWhatsAppHref(cliente.whatsapp)} target="_blank" rel="noreferrer noopener" style={{ fontSize: '0.86rem', color: 'var(--accent)', textDecoration: 'none' }}>
                  {formatarWhatsApp(cliente.whatsapp) || cliente.whatsapp}
                </a>
              ) : (
                <p style={{ fontSize: '0.86rem', color: 'var(--text)' }}>-</p>
              )}
            </div>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>CPF</p>
              <p style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{cliente.cpf ? (isSuperAdmin ? formatarCPF(cliente.cpf) : mascararCPF(cliente.cpf)) : '-'}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Data de nascimento</p>
              <p style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{cliente.dataNascimento || '-'}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Papel</p>
              <p style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{getClientRoleLabel(cliente)}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Ultimo acesso</p>
              <p style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{formatDateTime(getLastAccess(cliente))}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Instagram</p>
              {normalizeInstagram(cliente.instagram) ? (
                <a
                  href={`https://instagram.com/${normalizeInstagram(cliente.instagram)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{ fontSize: '0.86rem', color: 'var(--accent)', textDecoration: 'none' }}
                >
                  @{normalizeInstagram(cliente.instagram)}
                </a>
              ) : (
                <p style={{ fontSize: '0.86rem', color: 'var(--text)' }}>-</p>
              )}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Endereco</p>
              <p style={{ fontSize: '0.86rem', color: 'var(--text)' }}>
                {[cliente.enderecoRua, cliente.enderecoNumero, cliente.enderecoBairro, cliente.enderecoCidade || cliente.cidade, cliente.enderecoEstado || cliente.estado, cliente.enderecoCep]
                  .filter(Boolean)
                  .join(', ') || '-' }
              </p>
            </div>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Times</p>
              <p style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{formatList(cliente.times)}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Escola/Organizacao</p>
              <p style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{formatList(cliente.organizacoes || cliente.escolasOuOrganizacoes)}</p>
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
          {[
            { id: 'compras', label: `Compras (${meusPedidos.length})` },
            { id: 'carrinho', label: `Carrinho (${itensCarrinho.length})` },
            { id: 'remocoes', label: `Reclamacoes (${minhasRemocoes.length})` },
            { id: 'comentarios', label: `Comentarios (${comentarios.length})` },
            { id: 'notas', label: `Notas (${notasPedidos.length})` },
            { id: 'email', label: '✉ E-mail' },
          ].map(st => (
            <button key={st.id}
              onClick={() => setSubTab(st.id)}
              style={{
                padding: '0.5rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.82rem', fontWeight: subTab === st.id ? 600 : 400,
                color: subTab === st.id ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: subTab === st.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: '-1px',
              }}>
              {st.label}
            </button>
          ))}
        </div>

        {subTab === 'compras' && (
          meusPedidos.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>Nenhuma compra registrada.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {meusPedidos.map(p => {
                const itens = p.itens || p.items || []
                const statusColor = p.status === 'pago' ? 'var(--success)' : p.status === 'cancelado' ? 'var(--danger)' : 'var(--accent)'
                return (
                  <div key={p.id} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--text-dim)' }}>#{p.publicId || p.id?.slice(0, 10)}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{formatDate(p.criadoEm)} - {itens.length} foto{itens.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      {itens.slice(0, 3).map((item, idx) => {
                        const previewCandidates = getPhotoCartPreviewCandidates(item)
                        const src = getFirstUrl(previewCandidates)
                        return (
                          <div key={`${p.id}-thumb-${idx}`} style={{ width: '42px', height: '32px', borderRadius: '6px', overflow: 'hidden', background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                            {src && (
                              <img
                                src={src}
                                alt=""
                                loading="lazy"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={e => {
                                  if (!applyNextImageFallback(e.target, previewCandidates)) e.target.style.display = 'none'
                                }}
                              />
                            )}
                          </div>
                        )
                      })}
                      {itens.length > 3 && (
                        <div style={{ width: '42px', height: '32px', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                          +{itens.length - 3}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: statusColor, background: `${statusColor}22`, padding: '0.1rem 0.5rem', borderRadius: '100px' }}>{p.status}</span>
                    <span style={{ fontWeight: 600, color: 'var(--success)', fontSize: '0.9rem' }}>R$ {Number(p.total).toFixed(2).replace('.', ',')}</span>
                  </div>
                )
              })}
            </div>
          )
        )}

        {subTab === 'carrinho' && (
          itensCarrinho.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>Carrinho vazio.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem' }}>
              {itensCarrinho.map(item => {
                const previewCandidates = getPhotoCartPreviewCandidates(item)
                const src = getFirstUrl(previewCandidates)
                return (
                  <div key={item.id} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                    <div style={{ height: '75px' }}>
                      <img
                        src={src}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => {
                          if (!applyNextImageFallback(e.target, previewCandidates)) e.target.style.display = 'none'
                        }}
                      />
                    </div>
                    <div style={{ padding: '0.3rem 0.4rem' }}>
                              <p style={{ fontSize: '0.65rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.eventName || '-'}</p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--success)', fontWeight: 600 }}>R$ {(Number(item.price) || 0).toFixed(2).replace('.', ',')}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {subTab === 'remocoes' && (
          minhasRemocoes.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>Nenhuma reclamacao de remocao.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {minhasRemocoes.map(r => (
                <div key={r.id} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.7rem', color: r.status === 'aceita' ? 'var(--success)' : r.status === 'rejeitada' ? 'var(--danger)' : 'var(--accent)', background: r.status === 'aceita' ? 'var(--success-dim)' : r.status === 'rejeitada' ? 'var(--danger-dim)' : 'var(--accent-dim)', padding: '0.1rem 0.5rem', borderRadius: '100px' }}>{r.status}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{formatDate(r.criadoEm)}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>Foto #{r.publicId}</span>
                  </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text)' }}>{r.motivo || '-'}</p>
                </div>
              ))}
            </div>
          )
        )}

        {subTab === 'notas' && (
          notasPedidos.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>Nenhuma nota registrada em pedidos deste cliente.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {notasPedidos.map(note => (
                <div key={note.id || `${note.pedido.id}-${note.createdAt}`} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.8rem 1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.7rem', color: note.type === 'public' ? 'var(--success)' : 'var(--text-dim)', background: note.type === 'public' ? 'var(--success-dim)' : 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px', textTransform: 'uppercase' }}>
                      {note.type === 'public' ? 'Publica' : 'Privada'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      Pedido #{note.pedido.publicId || note.pedido.id?.slice(0, 8)}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      {formatDateTime(note.createdAt || note.criadoEm)}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{note.text}</p>
                </div>
              ))}
            </div>
          )
        )}

        {subTab === 'email' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {!cliente.email && (
              <div className="alert alert-warning">Este cliente não possui e-mail cadastrado. Adicione um e-mail no cadastro antes de enviar.</div>
            )}
            {emailConfigured === false && (
              <div className="alert alert-warning">Serviço de e-mail não configurado. Defina SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM no arquivo <code>.env</code>.</div>
            )}
            {emailMsg.text && (
              <div className={`alert ${emailMsg.type === 'success' ? 'alert-success' : 'alert-error'}`}>{emailMsg.text}</div>
            )}
            {cliente.email && (
              <form onSubmit={handleSendEmail} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Para</p>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text)' }}>{cliente.nomeCompleto || cliente.nome || '—'} &lt;<a href={`mailto:${cliente.email}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{cliente.email}</a>&gt;</p>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Assunto</label>
                  <input
                    type="text"
                    className="form-input"
                    value={emailForm.subject}
                    onChange={e => setEmailForm(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Assunto do e-mail"
                    maxLength={200}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Mensagem</label>
                  <textarea
                    className="form-input"
                    rows={7}
                    value={emailForm.body}
                    onChange={e => setEmailForm(prev => ({ ...prev, body: e.target.value }))}
                    placeholder="Escreva a mensagem aqui..."
                    maxLength={5000}
                    required
                    style={{ resize: 'vertical' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem', display: 'block' }}>{emailForm.body.length}/5000</span>
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={sendingEmail || !emailForm.subject.trim() || !emailForm.body.trim()}
                >
                  {sendingEmail ? 'Enviando...' : 'Enviar e-mail'}
                </button>
              </form>
            )}
          </div>
        )}

        {subTab === 'comentarios' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Ordenar:</span>
                <button
                  className={`btn btn-sm ${ordenacaoComentarios === 'top' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setOrdenacaoComentarios('top')}
                >
                  Mais curtidos
                </button>
                <button
                  className={`btn btn-sm ${ordenacaoComentarios === 'recent' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setOrdenacaoComentarios('recent')}
                >
                  Mais recentes
                </button>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={carregarComentarios} disabled={loadingComentarios}>
                {loadingComentarios ? '...' : 'Atualizar'}
              </button>
            </div>

            {loadingComentarios ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>Carregando comentarios...</p>
            ) : comentarios.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>Nenhum comentario registrado.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                {comentarios.map(root => {
                  const ctx = root.context || null
                  const replies = Array.isArray(root.respostas) ? root.respostas : []
                  const open = (root._uiForceRepliesOpen === true) || repliesOpen[root.id] === true
                  return (
                    <div key={root.id} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '0.9rem 1rem', border: `1px solid ${root.visivel ? 'var(--border)' : 'rgba(239,68,68,0.25)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                          {new Date(root.criadoEm || root.createdAt || 0).toLocaleString('pt-BR')}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent)', background: 'var(--accent-dim)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                          {getScopeLabel(root)}
                        </span>
                        {root.parentId && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                            resposta
                          </span>
                        )}
                        <span style={{ fontSize: '0.7rem', color: root.visivel ? 'var(--success)' : 'var(--danger)', background: root.visivel ? 'var(--success-dim)' : 'var(--danger-dim)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                          {root.visivel ? 'Visivel' : 'Omitido'}
                        </span>
                        {root.foiEditadoPorAdmin && (
                          <span style={{ fontSize: '0.7rem', color: '#93c5fd', background: 'rgba(59,130,246,0.15)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                            Editado por admin
                          </span>
                        )}
                        {!root.foiEditadoPorAdmin && root.foiEditado && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                            Editado
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                        {renderThumb(ctx, { size: 54 })}
                        {renderContextLine(root)}
                      </div>

                      {editingId === root.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <textarea
                            value={editingText}
                            onChange={e => setEditingText(e.target.value)}
                            rows={3}
                            maxLength={1000}
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
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                              {editingText.length}/1000
                            </span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(null); setEditingText('') }}>
                                Cancelar
                              </button>
                              <button className="btn btn-primary btn-sm" onClick={() => salvarEdicao(root)} disabled={savingEdit}>
                                {savingEdit ? 'Salvando...' : 'Salvar'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize: '0.84rem', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>
                          {root.texto}
                        </p>
                      )}

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setEditingId(root.id); setEditingText(root.texto || '') }}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: root.visivel ? 'var(--danger)' : 'var(--success)' }}
                          disabled={atualizandoComentario === root.id}
                          onClick={() => changeVisibility(root, root.visivel ? 'omit' : 'restore')}
                        >
                          {atualizandoComentario === root.id ? '...' : root.visivel ? 'Omitir' : 'Restaurar'}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setHistoryOpen(prev => ({ ...prev, [root.id]: !prev[root.id] }))}
                        >
                          {historyOpen[root.id] ? 'Fechar historico' : 'Ver historico'}
                        </button>
                        {replies.length > 0 && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setRepliesOpen(prev => ({ ...prev, [root.id]: !open }))}
                          >
                            {open ? `Ocultar respostas (${replies.length})` : `Ver respostas (${replies.length})`}
                          </button>
                        )}
                      </div>

                      {renderHistory(root)}

                      {replies.length > 0 && open && (
                        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          {replies.map(r => {
                            const rCtx = r.context || null
                            return (
                              <div key={r.id} style={{ marginLeft: '0.65rem', background: 'var(--bg-card)', border: `1px solid ${r.visivel ? 'var(--border)' : 'rgba(239,68,68,0.25)'}`, borderRadius: 'var(--radius)', padding: '0.75rem 0.85rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                    {new Date(r.criadoEm || r.createdAt || 0).toLocaleString('pt-BR')}
                                  </span>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                                    resposta
                                  </span>
                                  <span style={{ fontSize: '0.68rem', color: r.visivel ? 'var(--success)' : 'var(--danger)', background: r.visivel ? 'var(--success-dim)' : 'var(--danger-dim)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
                                    {r.visivel ? 'Visivel' : 'Omitido'}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                                  {renderThumb(rCtx, { size: 46 })}
                                  {renderContextLine(r)}
                                </div>

                                {editingId === r.id ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <textarea
                                      value={editingText}
                                      onChange={e => setEditingText(e.target.value)}
                                      rows={3}
                                      maxLength={1000}
                                      style={{ width: '100%', resize: 'vertical', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.7rem 0.9rem', color: 'var(--text)', fontSize: '0.88rem' }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{editingText.length}/1000</span>
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(null); setEditingText('') }}>Cancelar</button>
                                        <button className="btn btn-primary btn-sm" onClick={() => salvarEdicao(r)} disabled={savingEdit}>{savingEdit ? 'Salvando...' : 'Salvar'}</button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <p style={{ fontSize: '0.84rem', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>{r.texto}</p>
                                )}

                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(r.id); setEditingText(r.texto || '') }}>Editar</button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ color: r.visivel ? 'var(--danger)' : 'var(--success)' }}
                                    disabled={atualizandoComentario === r.id}
                                    onClick={() => changeVisibility(r, r.visivel ? 'omit' : 'restore')}
                                  >
                                    {atualizandoComentario === r.id ? '...' : r.visivel ? 'Omitir' : 'Restaurar'}
                                  </button>
                                  <button className="btn btn-ghost btn-sm" onClick={() => setHistoryOpen(prev => ({ ...prev, [r.id]: !prev[r.id] }))}>
                                    {historyOpen[r.id] ? 'Fechar historico' : 'Ver historico'}
                                  </button>
                                </div>

                                {renderHistory(r)}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ClientesPage() {
  const searchParams = useSearchParams()
  const [clientes, setClientes]       = useState([])
  const [pedidos, setPedidos]         = useState([])
  const [remocoes, setRemocoes]       = useState([])
  const [carrinhos, setCarrinhos]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [busca, setBusca]             = useState('')
  const [ordenar, setOrdenar]         = useState('nome')
  const [filtroAtivo, setFiltroAtivo] = useState('todos')
  const [filtroPapel, setFiltroPapel] = useState('todos')
  const [atualizando, setAtualizando] = useState(null)
  const [senhaGerada, setSenhaGerada] = useState(null)
  const [resetando, setResetando]     = useState(null)
  const [clienteModal, setClienteModal] = useState(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [viewMode, setViewMode] = useState('lista')
  const [copiouSenha, setCopiouSenha] = useState(false)
  const [reviewingLgpd, setReviewingLgpd] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cliRes, pedRes, remRes, carRes] = await Promise.all([
        fetch('/api/clients'),
        fetch('/api/pedidos?admin=1'),
        fetch('/api/remocoes'),
        fetch('/api/carrinhos'),
      ])
      setClientes(await cliRes.json())
      setPedidos(await pedRes.json())
      setRemocoes(await remRes.json())
      setCarrinhos(await carRes.json())
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Permite abrir o modal via link direto: /admin/clientes?open=<clientId>
  useEffect(() => {
    if (loading) return
    const openId = searchParams.get('open')
    if (!openId) return
    if (clienteModal?.id === openId) return
    const found = clientes.find(c => c.id === openId)
    if (found) setClienteModal(found)
  }, [loading, searchParams, clientes, clienteModal?.id])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado')
      const cl = raw ? JSON.parse(raw) : null
      setIsSuperAdmin(!!cl?.isSuperAdmin)
    } catch {}
    try {
      const saved = localStorage.getItem('adminContasViewMode')
      if (saved === 'grid' || saved === 'lista') setViewMode(saved)
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem('adminContasViewMode', viewMode) } catch {}
  }, [viewMode])

  useEffect(() => {
    setCopiouSenha(false)
  }, [senhaGerada?.senha])

  async function resetarSenha(id) {
    const cliente = clientes.find(c => c.id === id)
    if (isProtectedAccount(cliente)) {
      alert('Contas admin/super-admin sao protegidas contra reset por esta tela.')
      return
    }
    setResetando(id)
    try {
      const res = await fetch(`/api/clients/${id}/reset-password`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setSenhaGerada({ clienteId: id, senha: data.password || data.senha })
      } else alert('Erro ao redefinir senha.')
    } catch { alert('Erro de conexao.') }
    finally { setResetando(null) }
  }

  async function copiarSenha() {
    if (!senhaGerada?.senha) return
    try {
      await navigator.clipboard.writeText(senhaGerada.senha)
      setCopiouSenha(true)
      setTimeout(() => setCopiouSenha(false), 2000)
    } catch {
      setCopiouSenha(false)
      alert('Não foi possível copiar. Copie manualmente.')
    }
  }

  async function toggleAdmin(id, isAdminAtual) {
    const cliente = clientes.find(c => c.id === id)
    if (isProtectedAccount(cliente)) {
      alert('Contas admin/super-admin sao protegidas contra mudancas perigosas de papel.')
      return
    }
    if (!confirm(isAdminAtual ? 'Remover privilégios de admin?' : 'Conceder acesso de admin? O usuário poderá acessar o painel completo.')) return
    setAtualizando(id)
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: !isAdminAtual }),
      })
      if (res.ok) setClientes(prev => prev.map(c => c.id === id ? { ...c, isAdmin: !isAdminAtual } : c))
      else alert('Erro ao atualizar privilégios.')
    } catch { alert('Erro de conexão.') }
    finally { setAtualizando(null) }
  }

  async function toggleAtivo(id, ativoAtual) {
    const cliente = clientes.find(c => c.id === id)
    if (isProtectedAccount(cliente)) {
      alert('Contas admin/super-admin nao podem ser desativadas por esta tela.')
      return
    }
    setAtualizando(id)
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !ativoAtual }),
      })
      if (res.ok) setClientes(prev => prev.map(c => c.id === id ? { ...c, ativo: !ativoAtual } : c))
      else alert('Erro ao atualizar status.')
    } catch { alert('Erro de conexao.') }
    finally { setAtualizando(null) }
  }

  async function reviewLgpdDeletion(cliente, action) {
    const isApprove = action === 'approve'
    const pedidosCliente = getClientOrders(cliente, pedidos)
    const pedidosPagos = pedidosCliente.filter(p => {
      const status = String(p.status || p.statusFinanceiro || '').toLowerCase()
      return ['pago', 'paid', 'aprovado', 'approved', 'liberado', 'liberado_manual', 'manual'].includes(status) || p.pagoEm || p.paidAt
    })
    const adminNote = window.prompt(isApprove
      ? `Aprovar exclusao de ${cliente.nomeCompleto || cliente.nome || cliente.email}? ${pedidosPagos.length} pedido(s) pago(s) serao preservados/desidentificados. Informe uma nota opcional:`
      : `Rejeitar solicitacao de ${cliente.nomeCompleto || cliente.nome || cliente.email}? Informe uma nota para registrar:`)
    if (adminNote === null) return
    if (isApprove && !confirm('Confirmar aprovacao? A conta sera desidentificada e a sessao do cliente expirada.')) return

    setReviewingLgpd(`${cliente.id}-${action}`)
    try {
      const res = await fetch('/api/clients/lgpd', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: cliente.id, action, adminNote }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro ao revisar solicitacao LGPD.')
      await load()
      if (clienteModal?.id === cliente.id) setClienteModal(data.client || null)
    } catch (err) {
      alert(err.message || 'Erro ao revisar solicitacao LGPD.')
    } finally {
      setReviewingLgpd(null)
    }
  }

  const clientesFiltrados = useMemo(() => {
    let list = clientes.filter(c => {
      const ativo = c.ativo !== false
      if (filtroAtivo === 'ativos' && !ativo) return false
      if (filtroAtivo === 'inativos' && ativo) return false
      if (filtroPapel !== 'todos' && getClientRole(c) !== filtroPapel) return false
      if (!busca) return true
      const t = busca.toLowerCase()
      return (c.nomeCompleto || c.nome || '').toLowerCase().includes(t) ||
        (c.email || '').toLowerCase().includes(t) ||
        (c.whatsapp || '').includes(busca) ||
        (c.cpf || '').includes(busca)
    })
    return [...list].sort((a, b) => {
      if (ordenar === 'nome') return (a.nomeCompleto || a.nome || '').localeCompare(b.nomeCompleto || b.nome || '')
      if (ordenar === 'novo') return new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0)
      if (ordenar === 'antigo') return new Date(a.criadoEm || 0) - new Date(b.criadoEm || 0)
      if (ordenar === 'ultimoAcesso') return new Date(getLastAccess(b) || 0) - new Date(getLastAccess(a) || 0)
      return 0
    })
  }, [clientes, busca, ordenar, filtroAtivo, filtroPapel])

  const totalAtivos   = clientes.filter(c => c.ativo !== false).length
  const totalInativos = clientes.filter(c => c.ativo === false).length
  const totalAdmins   = clientes.filter(c => c.isAdmin).length
  const pendingDeletionRequests = useMemo(
    () => clientes.filter(c => c.lgpdDeletionRequest?.status === 'pending'),
    [clientes]
  )

  if (loading) return (
    <div className="flex-center" style={{ height: '60vh', gap: '1rem' }}>
      <div className="spinner" style={{ width: '32px', height: '32px' }} />
      <span style={{ color: 'var(--text-muted)' }}>Carregando contas...</span>
    </div>
  )

  return (
    <>
      <div className="admin-header">
        <div>
          <Link href="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>← Dashboard</Link>
          <h1 className="admin-page-title" style={{ marginTop: '0.25rem' }}>
            Contas
            <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '0.15rem 0.6rem', borderRadius: '100px', fontFamily: 'var(--font-body)', fontWeight: '400' }}>
              {clientes.length}
            </span>
          </h1>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>Atualizar</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card"><p className="stat-label">Total</p><p className="stat-value">{clientes.length}</p></div>
        <div className="stat-card"><p className="stat-label">Ativos</p><p className="stat-value" style={{ color: 'var(--success)' }}>{totalAtivos}</p></div>
        <div className="stat-card"><p className="stat-label">Inativos</p><p className="stat-value" style={{ color: 'var(--danger)' }}>{totalInativos}</p></div>
        <div className="stat-card"><p className="stat-label">Admins/Staff</p><p className="stat-value" style={{ color: 'var(--accent)' }}>{totalAdmins}</p></div>
      </div>

      {pendingDeletionRequests.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-lg)', padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', marginBottom: '0.25rem' }}>Solicitacoes LGPD pendentes</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Aprove para desidentificar a conta preservando pedidos legais, ou rejeite com uma nota.</p>
            </div>
            <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{pendingDeletionRequests.length}</span>
          </div>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {pendingDeletionRequests.map(cliente => {
              const pedidosCliente = getClientOrders(cliente, pedidos)
              const paidCount = pedidosCliente.filter(p => {
                const status = String(p.status || p.statusFinanceiro || '').toLowerCase()
                return ['pago', 'paid', 'aprovado', 'approved', 'liberado', 'liberado_manual', 'manual'].includes(status) || p.pagoEm || p.paidAt
              }).length
              return (
                <div key={cliente.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.8rem', display: 'flex', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{cliente.nomeCompleto || cliente.nome || cliente.email || cliente.id}</strong>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                      Solicitado em {formatDate(cliente.lgpdDeletionRequest?.requestedAt)} - pedidos: {pedidosCliente.length}, pagos preservados: {paidCount}
                    </p>
                    {cliente.lgpdDeletionRequest?.reason && (
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginTop: '0.2rem' }}>Motivo: {cliente.lgpdDeletionRequest.reason}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => setClienteModal(cliente)}>Detalhes</button>
                    <button className="btn btn-sm btn-danger" disabled={reviewingLgpd === `${cliente.id}-approve`} onClick={() => reviewLgpdDeletion(cliente, 'approve')}>
                      {reviewingLgpd === `${cliente.id}-approve` ? 'Aprovando...' : 'Aprovar exclusao'}
                    </button>
                    <button className="btn btn-sm btn-secondary" disabled={reviewingLgpd === `${cliente.id}-reject`} onClick={() => reviewLgpdDeletion(cliente, 'reject')}>
                      {reviewingLgpd === `${cliente.id}-reject` ? 'Rejeitando...' : 'Rejeitar'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" className="form-input" style={{ maxWidth: '320px' }}
          placeholder="Buscar por nome, email, WhatsApp ou CPF…"
          value={busca} onChange={e => setBusca(e.target.value)} />
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Ordenar:</span>
        {[{ key: 'nome', label: 'Nome' }, { key: 'novo', label: 'Novo' }, { key: 'antigo', label: 'Antigo' }, { key: 'ultimoAcesso', label: 'Ultimo acesso' }].map(o => (
          <button key={o.key} className={`btn btn-sm ${ordenar === o.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setOrdenar(o.key)}>{o.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Status:</span>
        {[{ key: 'todos', label: 'Todos' }, { key: 'ativos', label: 'Ativos' }, { key: 'inativos', label: 'Desativados' }].map(o => (
          <button key={o.key} className={`btn btn-sm ${filtroAtivo === o.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltroAtivo(o.key)}>{o.label}</button>
        ))}
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Papel:</span>
        {[{ key: 'todos', label: 'Todos' }, { key: 'cliente', label: 'Cliente' }, { key: 'colaborador', label: 'Colaborador' }, { key: 'admin', label: 'Admin' }].map(o => (
          <button key={o.key} className={`btn btn-sm ${filtroPapel === o.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltroPapel(o.key)}>{o.label}</button>
        ))}
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>Visão:</span>
        <button
          className={`btn btn-sm ${viewMode === 'lista' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setViewMode('lista')}
          aria-pressed={viewMode === 'lista'}
          title="Visualizar em lista"
        >☰ Lista</button>
        <button
          className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setViewMode('grid')}
          aria-pressed={viewMode === 'grid'}
          title="Visualizar em grid"
        >▦ Grid</button>
      </div>

      {/* Modal de senha gerada */}
      {senhaGerada && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setSenhaGerada(null)}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '2rem', maxWidth: '420px', width: '90%' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', marginBottom: '1rem' }}>Senha Redefinida</h3>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
              <code style={{ fontSize: '1.3rem', fontFamily: 'monospace', color: 'var(--accent)', letterSpacing: '0.1em', fontWeight: '600' }}>{senhaGerada.senha}</code>
              <button
                className={`btn btn-sm ${copiouSenha ? 'btn-success' : 'btn-primary'}`}
                onClick={copiarSenha}
                title={copiouSenha ? 'Senha copiada' : 'Copiar para a área de transferência'}
                style={{ minWidth: '92px' }}
              >
                {copiouSenha ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.5' }}>Passe esta senha ao cliente. Ele poderá alterá-la após o login.</p>
            <button className="btn btn-ghost btn-full" style={{ marginTop: '1rem' }} onClick={() => setSenhaGerada(null)}>Fechar</button>
          </div>
        </div>
      )}

      {clientesFiltrados.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <h2 className="empty-state-title">{busca ? 'Nenhuma conta encontrada' : 'Nenhuma conta cadastrada'}</h2>
        </div>
      ) : viewMode === 'lista' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {clientesFiltrados.map(cliente => {
            const ativo = cliente.ativo !== false
            const pedidosCliente = getClientOrders(cliente, pedidos)
            const carrinhoCliente = carrinhos.find(c => c.id === cliente.id)
            const itensCarrinho = carrinhoCliente?.carrinho || []
            const temRemocoes = remocoes.some(r => r.clientId === cliente.id)
            const protegido = isProtectedAccount(cliente)
            const initials = (cliente.nomeCompleto || cliente.nome || cliente.email || '?')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map(part => part[0]?.toUpperCase())
              .join('') || '?'

            return (
              <div
                key={cliente.id}
                role="button"
                tabIndex={0}
                onClick={() => setClienteModal(cliente)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setClienteModal(cliente)
                  }
                }}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '0.7rem 0.9rem',
                  display: 'grid', gridTemplateColumns: '44px minmax(0, 1.4fr) minmax(0, 1.6fr) auto auto',
                  gap: '0.85rem', alignItems: 'center', cursor: 'pointer',
                  opacity: ativo ? 1 : 0.7, transition: 'border-color 0.2s, background 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-secondary)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)' }}
              >
                <Avatar client={cliente} size={44} fontScale={0.45} />

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cliente.nomeCompleto || cliente.nome || '-'}
                    </p>
                    <span style={{ fontSize: '0.65rem', padding: '0.08rem 0.5rem', borderRadius: '100px', background: ativo ? 'var(--success-dim, rgba(108,196,122,0.15))' : 'var(--danger-dim, rgba(217,108,108,0.15))', color: ativo ? 'var(--success)' : 'var(--danger)' }}>
                      {ativo ? 'Ativo' : 'Inativo'}
                    </span>
                    {cliente.isAdmin && !cliente.isSuperAdmin && <span style={{ fontSize: '0.62rem', padding: '0.08rem 0.45rem', borderRadius: '100px', background: 'rgba(201,169,110,0.15)', color: 'var(--accent)', fontWeight: 600 }}>👑 Admin</span>}
                    {cliente.isSuperAdmin && <span style={{ fontSize: '0.62rem', padding: '0.08rem 0.45rem', borderRadius: '100px', background: 'rgba(201,169,110,0.25)', color: 'var(--accent)', fontWeight: 700 }}>⭐ Super</span>}
                    {temRemocoes && <span style={{ fontSize: '0.62rem', color: 'var(--danger)' }}>⚠ Reclamação</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', marginTop: '0.2rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    <span>Cadastro: {formatDate(cliente.criadoEm)}</span>
                    <span>Último acesso: {formatDate(getLastAccess(cliente))}</span>
                    <span>Compras: {pedidosCliente.length}</span>
                    <span>Carrinho: {itensCarrinho.length}</span>
                  </div>
                </div>

                <div style={{ minWidth: 0, fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  {cliente.email && (
                    <a href={`mailto:${cliente.email}`} onClick={e => e.stopPropagation()} style={{ display: 'block', color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cliente.email}
                    </a>
                  )}
                  {cliente.whatsapp && (
                    <a href={buildWhatsAppHref(cliente.whatsapp)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'block', color: 'var(--accent)', textDecoration: 'none' }}>
                      {formatarWhatsApp(cliente.whatsapp) || cliente.whatsapp}
                    </a>
                  )}
                  {cliente.cpf && (
                    <span style={{ display: 'block' }}>CPF: {isSuperAdmin ? formatarCPF(cliente.cpf) : mascararCPF(cliente.cpf)}</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-sm btn-ghost" onClick={() => setClienteModal(cliente)} style={{ color: 'var(--accent)' }}>Detalhes</button>
                  {!protegido && (
                    <button className="btn btn-sm btn-secondary" disabled={resetando === cliente.id} onClick={() => resetarSenha(cliente.id)}>
                      {resetando === cliente.id ? <div className="spinner" style={{ width: '12px', height: '12px' }} /> : 'Senha'}
                    </button>
                  )}
                  {!protegido && (
                    <button className={`btn btn-sm ${ativo ? 'btn-danger' : 'btn-primary'}`} disabled={atualizando === cliente.id} onClick={() => toggleAtivo(cliente.id, ativo)}>
                      {atualizando === cliente.id ? <div className="spinner" style={{ width: '12px', height: '12px' }} /> : ativo ? 'Desativar' : 'Reativar'}
                    </button>
                  )}
                  {isSuperAdmin && !protegido && (
                    <button className="btn btn-sm btn-ghost" disabled={atualizando === cliente.id}
                      title={cliente.isAdmin ? 'Remover privilegio admin' : 'Conceder acesso admin'}
                      onClick={() => toggleAdmin(cliente.id, !!cliente.isAdmin)}
                      style={{ color: cliente.isAdmin ? 'var(--accent)' : 'var(--text-dim)' }}>
                      👑
                    </button>
                  )}
                  {cliente.whatsapp && (
                    <a href={buildWhatsAppHref(cliente.whatsapp)} target="_blank" rel="noopener noreferrer"
                      className="btn btn-sm" style={{ background: '#25D366', color: 'white', border: 'none', textDecoration: 'none', textAlign: 'center' }}>
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', alignItems: 'stretch' }}>
          {clientesFiltrados.map(cliente => {
            const ativo = cliente.ativo !== false
            const pedidosCliente = getClientOrders(cliente, pedidos)
            const carrinhoCliente = carrinhos.find(c => c.id === cliente.id)
            const itensCarrinho = carrinhoCliente?.carrinho || []
            const temRemocoes = remocoes.some(r => r.clientId === cliente.id)
            const protegido = isProtectedAccount(cliente)
            const initials = (cliente.nomeCompleto || cliente.nome || cliente.email || '?')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map(part => part[0]?.toUpperCase())
              .join('') || '?'

            return (
              <div
                key={cliente.id}
                role="button"
                tabIndex={0}
                onClick={() => setClienteModal(cliente)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setClienteModal(cliente)
                  }
                }}
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem', opacity: ativo ? 1 : 0.7, transition: 'border-color 0.2s, transform 0.2s, opacity 0.2s', aspectRatio: '2 / 3', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.85rem', overflow: 'hidden' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                {cliente.avatar?.large || cliente.avatar?.thumb ? (
                  <div style={{ height: '34%', minHeight: '88px', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <img
                      src={`${cliente.avatar.large || cliente.avatar.thumb}${cliente.avatar.updatedAt ? `?v=${encodeURIComponent(cliente.avatar.updatedAt)}` : ''}`}
                      alt={cliente.nomeCompleto || cliente.nome || 'Avatar'}
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                ) : (
                  <div style={{ height: '34%', minHeight: '88px', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontFamily: 'var(--font-heading)', fontSize: '2rem' }}>
                    {initials}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', minHeight: 0, flex: 1 }}>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: '600', color: 'var(--text)', fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{cliente.nomeCompleto || cliente.nome || '-'}</p>
                      <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.55rem', borderRadius: '100px', background: ativo ? 'var(--success-dim, rgba(108,196,122,0.15))' : 'var(--danger-dim, rgba(217,108,108,0.15))', color: ativo ? 'var(--success)' : 'var(--danger)' }}>
                        {ativo ? 'Ativo' : 'Inativo'}
                      </span>
                      {cliente.isAdmin && !cliente.isSuperAdmin && <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.5rem', borderRadius: '100px', background: 'rgba(201,169,110,0.15)', color: 'var(--accent)', fontWeight: 600 }}>👑 Admin</span>}
                      {cliente.isSuperAdmin && <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.5rem', borderRadius: '100px', background: 'rgba(201,169,110,0.25)', color: 'var(--accent)', fontWeight: 700 }}>⭐ Super Admin</span>}
                      {temRemocoes && <span style={{ fontSize: '0.68rem', color: 'var(--danger)' }}>Aviso reclamação</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {cliente.email && <a href={`mailto:${cliente.email}`} onClick={e => e.stopPropagation()} style={{ fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Email: {cliente.email}</a>}
                      {cliente.whatsapp && <a href={buildWhatsAppHref(cliente.whatsapp)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none' }}>WhatsApp: {formatarWhatsApp(cliente.whatsapp) || cliente.whatsapp}</a>}
                      {cliente.cpf && <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>CPF: {isSuperAdmin ? formatarCPF(cliente.cpf) : mascararCPF(cliente.cpf)}</p>}
                      {normalizeInstagram(cliente.instagram) && (
                        <a
                          href={`https://instagram.com/${normalizeInstagram(cliente.instagram)}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none' }}
                        >
                          Instagram @{normalizeInstagram(cliente.instagram)}
                        </a>
                      )}
                      {(Array.isArray(cliente.times) && cliente.times.length > 0) && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Times: {formatList(cliente.times)}</p>
                      )}
                      {(Array.isArray(cliente.organizacoes) && cliente.organizacoes.length > 0) && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Escola/Organizacao: {formatList(cliente.organizacoes)}</p>
                      )}
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Cadastrado em: {formatDate(cliente.criadoEm)}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ultimo acesso: {formatDate(getLastAccess(cliente))}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Compras: {pedidosCliente.length} - Carrinho: {itensCarrinho.length}</p>
                    </div>
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm btn-ghost" onClick={() => setClienteModal(cliente)} style={{ color: 'var(--accent)' }}>
                      Ver detalhes
                    </button>
                    {!protegido && (
                      <button className="btn btn-sm btn-secondary" disabled={resetando === cliente.id} onClick={() => resetarSenha(cliente.id)}>
                        {resetando === cliente.id ? <div className="spinner" style={{ width: '12px', height: '12px' }} /> : 'Redefinir Senha'}
                      </button>
                    )}
                    {!protegido && (
                      <button className={`btn btn-sm ${ativo ? 'btn-danger' : 'btn-primary'}`} disabled={atualizando === cliente.id} onClick={() => toggleAtivo(cliente.id, ativo)}>
                        {atualizando === cliente.id ? <div className="spinner" style={{ width: '12px', height: '12px' }} /> : ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    )}
                    {isSuperAdmin && !protegido ? (
                      <button className="btn btn-sm btn-ghost" disabled={atualizando === cliente.id}
                        title={cliente.isAdmin ? 'Remover privilegio admin' : 'Conceder acesso admin'}
                        onClick={() => toggleAdmin(cliente.id, !!cliente.isAdmin)}
                        style={{ color: cliente.isAdmin ? 'var(--accent)' : 'var(--text-dim)' }}>
                        {atualizando === cliente.id ? <div className="spinner" style={{ width: '12px', height: '12px' }} /> : cliente.isAdmin ? '👑 Admin' : '👑'}
                      </button>
                    ) : (
                      <span title="Exclusivo de super-admins" style={{ display: 'inline-block', cursor: 'not-allowed' }}>
                        <button className="btn btn-sm btn-ghost" disabled style={{ opacity: 0.38, pointerEvents: 'none', color: cliente.isAdmin ? 'var(--accent)' : 'var(--text-dim)' }}>
                          {cliente.isAdmin ? '👑 Admin' : '👑'}
                        </button>
                      </span>
                    )}
                    {cliente.whatsapp && (
                      <a href={buildWhatsAppHref(cliente.whatsapp)} target="_blank" rel="noopener noreferrer"
                        className="btn btn-sm" style={{ background: '#25D366', color: 'white', border: 'none', textDecoration: 'none', textAlign: 'center' }}>
                        WhatsApp
                      </a>
                    )}
                    {normalizeInstagram(cliente.instagram) && (
                      <a
                        href={`https://instagram.com/${normalizeInstagram(cliente.instagram)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-ghost"
                        style={{ textDecoration: 'none' }}
                      >
                        Instagram
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {clienteModal && (
        <ClienteModal
          cliente={clienteModal}
          pedidos={pedidos}
          remocoes={remocoes}
          carrinhos={carrinhos}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setClienteModal(null)}
          onUpdated={updated => {
            setClienteModal(updated)
            setClientes(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
          }}
        />
      )}
    </>
  )
}
