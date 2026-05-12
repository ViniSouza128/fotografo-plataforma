'use client'
// src/app/admin/remocoes/page.js

import { useState, useEffect, useCallback, useMemo } from 'react'
import { applyNextImageFallback, getPhotoCartPreviewCandidates, isLazyDerivedUrl } from '@/lib/imagePaths'
import { formatarCPF, mascararCPF } from '@/lib/cpf'
import { buildWhatsAppHref, formatarWhatsApp } from '@/lib/whatsapp'

const STATUS = {
  pendente:  { label: 'Pendente',  color: 'var(--accent)',  bg: 'var(--accent-dim)'  },
  aceita:    { label: 'Aceita',    color: 'var(--danger)',  bg: 'var(--danger-dim)'  },
  rejeitada: { label: 'Rejeitada', color: 'var(--success)', bg: 'var(--success-dim)' },
}

const MAX_FALLBACK_CANDIDATES = 5
const deriveMiniCache = new Map()
const deriveMiniPromises = new Map()

function toUniqueStrings(values) {
  const out = []
  const seen = new Set()
  for (const value of values) {
    if (!value || typeof value !== 'string') continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function withCacheBuster(url) {
  if (!url || typeof url !== 'string') return null
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${Date.now()}`
}

function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false)
    const img = new window.Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = src
  })
}

async function ensureMiniDerivedOnce(filename) {
  if (!filename) return false
  const cached = deriveMiniCache.get(filename)
  if (typeof cached === 'boolean') return cached

  const existingPromise = deriveMiniPromises.get(filename)
  if (existingPromise) return existingPromise

  const promise = (async () => {
    try {
      const params = new URLSearchParams({
        filename,
        kind: 'mini',
        watermark: 'clean',
        mode: 'ensure',
      })
      const res = await fetch(`/api/images/derive?${params.toString()}`, { method: 'GET', cache: 'no-store' })
      const ok = res.ok
      deriveMiniCache.set(filename, ok)
      return ok
    } catch {
      deriveMiniCache.set(filename, false)
      return false
    } finally {
      deriveMiniPromises.delete(filename)
    }
  })()

  deriveMiniPromises.set(filename, promise)
  return promise
}

function RemocaoThumb({ item }) {
  const filename = item?.storedFilename || item?.filename || null
  const photoForThumb = useMemo(() => ({
    filename,
    filenameWm: item?.storedFilenameWm || item?.filenameWm || null,
    filenameThumb: item?.storedFilenameThumb || item?.filenameThumb || null,
    filenameMini: item?.storedFilenameMini || item?.filenameMini || null,
    pathGridWm: item?.pathGridWm || null,
    pathGridClean: item?.pathGridClean || null,
    pathThumbWm: item?.pathThumbWm || null,
    pathThumbClean: item?.pathThumbClean || null,
    pathMiniClean: item?.pathMiniClean || null,
  }), [
    filename,
    item?.storedFilenameWm,
    item?.filenameWm,
    item?.storedFilenameThumb,
    item?.filenameThumb,
    item?.storedFilenameMini,
    item?.filenameMini,
    item?.pathGridWm,
    item?.pathGridClean,
    item?.pathThumbWm,
    item?.pathThumbClean,
    item?.pathMiniClean,
  ])
  const candidates = useMemo(() => {
    const fromPhoto = getPhotoCartPreviewCandidates(photoForThumb)
      .filter((value) => !isLazyDerivedUrl(value))
      .slice(0, MAX_FALLBACK_CANDIDATES)

    const direct = filename ? [`/uploads/mini/clean/${encodeURIComponent(filename)}`] : []

    return toUniqueStrings([...fromPhoto, ...direct])
  }, [filename, photoForThumb])
  const [resolvedSrc, setResolvedSrc] = useState(null)
  const [loadingThumb, setLoadingThumb] = useState(!!filename)

  useEffect(() => {
    let cancelled = false

    async function resolveThumb() {
      if (!filename) {
        if (!cancelled) {
          setResolvedSrc(null)
          setLoadingThumb(false)
        }
        return
      }

      if (!cancelled) {
        setResolvedSrc(null)
        setLoadingThumb(true)
      }

      for (const candidate of candidates) {
        const ok = await preloadImage(candidate)
        if (ok) {
          if (!cancelled) {
            setResolvedSrc(candidate)
            setLoadingThumb(false)
          }
          return
        }
      }

      const derived = await ensureMiniDerivedOnce(filename)
      if (!derived) {
        if (!cancelled) setLoadingThumb(false)
        return
      }

      const refreshedCandidates = toUniqueStrings([
        withCacheBuster(`/uploads/mini/clean/${encodeURIComponent(filename)}`),
        ...candidates.map((value) => withCacheBuster(value)),
      ])

      for (const candidate of refreshedCandidates) {
        const ok = await preloadImage(candidate)
        if (ok) {
          if (!cancelled) {
            setResolvedSrc(candidate)
            setLoadingThumb(false)
          }
          return
        }
      }

      if (!cancelled) setLoadingThumb(false)
    }

    resolveThumb()
    return () => { cancelled = true }
  }, [filename, candidates])

  if (!filename) return null

  if (loadingThumb) {
    return (
      <div
        aria-label="Carregando miniatura"
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '4px',
          flexShrink: 0,
          border: '1px solid var(--border)',
          background: 'linear-gradient(90deg, var(--bg-secondary), var(--bg-input), var(--bg-secondary))',
        }}
      />
    )
  }

  if (!resolvedSrc) {
    return (
      <div
        title="Miniatura indisponível"
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '4px',
          flexShrink: 0,
          border: '1px dashed var(--border)',
          color: 'var(--text-dim)',
          display: 'grid',
          placeItems: 'center',
          fontSize: '0.65rem',
          background: 'var(--bg-secondary)',
        }}
      >
        sem
      </div>
    )
  }

  return (
    <img
      src={resolvedSrc}
      alt=""
      style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0, border: '1px solid var(--border)' }}
      onLoad={(e) => {
        delete e.currentTarget.dataset.fallbackIndex
        delete e.currentTarget.dataset.fallbackAttempts
        delete e.currentTarget.dataset.fallbackExhausted
      }}
      onError={(e) => {
        if (!applyNextImageFallback(e.currentTarget, candidates, { maxAttempts: 3 })) {
          e.currentTarget.style.display = 'none'
        }
      }}
    />
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function mascaraCPF(cpf) {
  const n = (cpf || '').replace(/\D/g, '')
  if (n.length !== 11) return cpf || '—'
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`
}

function ocultarCPF(cpf) {
  const n = (cpf || '').replace(/\D/g, '')
  if (n.length !== 11) return '—'
  return `***.***.${ n.slice(6, 9)}-${n.slice(9)}`
}

export default function RemocoesPage() {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [busy, setBusy]         = useState(null)
  const [filtro, setFiltro]     = useState('todos')
  const [expandido, setExpandido] = useState(null)
  const [comentarios, setComentarios] = useState({})
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado')
      const cl = raw ? JSON.parse(raw) : null
      setIsSuperAdmin(!!cl?.isSuperAdmin)
    } catch {}
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/remocoes')
      setItems(await res.json())
    } catch { }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function patch(id, payload) {
    setBusy(id)
    try {
      const res = await fetch('/api/remocoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...payload }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Erro ao atualizar')
        return
      }
      const updated = await res.json()
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i))
    } catch { alert('Erro de conexão') }
    finally { setBusy(null) }
  }

  const [comentariosPublicos, setComentariosPublicos] = useState({})

  async function salvarComentario(id) {
    const texto = comentarios[id] ?? items.find(i => i.id === id)?.comentarioAdmin ?? ''
    const textoPublico = comentariosPublicos[id] ?? items.find(i => i.id === id)?.comentarioAdminPublico ?? ''
    await patch(id, { comentarioAdmin: texto, comentarioAdminPublico: textoPublico })
    setExpandido(null)
  }

  const filtrados  = items.filter(i => filtro === 'todos' || i.status === filtro)
  const pendentes  = items.filter(i => i.status === 'pendente').length

  if (loading) return (
    <div className="flex-center" style={{ height: '60vh', gap: '1rem' }}>
      <div className="spinner" style={{ width: '32px', height: '32px' }} />
    </div>
  )

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-page-title">Solicitações de Remoção</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {pendentes > 0
              ? <span style={{ color: 'var(--danger)' }}>⚠ {pendentes} pendente{pendentes !== 1 ? 's' : ''}</span>
              : `${items.length} solicitação${items.length !== 1 ? 'ões' : ''} no total`}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>🔄 Atualizar</button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {['todos', 'pendente', 'aceita', 'rejeitada'].map(f => (
          <button key={f}
            className={`btn btn-sm ${filtro === f ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltro(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', opacity: 0.7 }}>
              ({f === 'todos' ? items.length : items.filter(i => i.status === f).length})
            </span>
          </button>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🗑</div>
          <h2 className="empty-state-title">
            {filtro === 'todos' ? 'Nenhuma solicitação ainda' : 'Nenhuma solicitação neste filtro'}
          </h2>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtrados.map(item => {
            const s           = STATUS[item.status] || STATUS.pendente
            const isBusy      = busy === item.id
            const showComment = expandido === item.id
            const clientLinkId = item.clientId || item.cliente?.id || null

            return (
              <div key={item.id} style={{
                background: 'var(--bg-card)',
                border: `1px solid ${item.status === 'pendente' ? 'var(--danger)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)', padding: '1.25rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ background: s.bg, color: s.color, padding: '0.15rem 0.6rem', borderRadius: '100px', fontSize: '0.7rem', letterSpacing: '0.06em' }}>
                        {s.label}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>🕐 {formatDate(item.criadoEm)}</span>
                    </div>

                    {/* Foto */}
                    {(() => {
                      const fotoPreview = {
                        filename: item?.storedFilename || item?.filename || null,
                        filenameWm: item?.storedFilenameWm || item?.filenameWm || null,
                        filenameThumb: item?.storedFilenameThumb || item?.filenameThumb || null,
                        filenameMini: item?.storedFilenameMini || item?.filenameMini || null,
                        pathGridWm: item?.pathGridWm || null,
                        pathGridClean: item?.pathGridClean || null,
                        pathThumbWm: item?.pathThumbWm || null,
                        pathThumbClean: item?.pathThumbClean || null,
                        pathMiniClean: item?.pathMiniClean || null,
                      }
                      const previewCandidates = toUniqueStrings(
                        getPhotoCartPreviewCandidates(fotoPreview).filter((value) => !isLazyDerivedUrl(value))
                      )
                      const previewSrc = previewCandidates.find(Boolean) || null
                      const fotoNome = item.originalFilename || item.filename || 'Foto sem nome'

                      return (
                        <div
                          role={previewSrc ? 'button' : undefined}
                          tabIndex={previewSrc ? 0 : -1}
                          onClick={() => previewSrc && setPreview({ src: previewSrc, title: fotoNome, id: item.publicId || item.photoId })}
                          onKeyDown={(e) => { if (previewSrc && (e.key === 'Enter' || e.key === ' ')) setPreview({ src: previewSrc, title: fotoNome, id: item.publicId || item.photoId }) }}
                          style={{
                            background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-card))',
                            borderRadius: 'var(--radius)',
                            padding: '0.85rem 1rem',
                            marginBottom: '0.85rem',
                            fontSize: '0.82rem',
                            border: '1px solid var(--border)',
                            boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
                            cursor: previewSrc ? 'zoom-in' : 'default',
                          }}
                        >
                          {item.eventName && <p><span style={{ color: 'var(--text-muted)' }}>Evento:</span> {item.eventName}</p>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                            <RemocaoThumb item={item} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              {item.publicId && (
                                <p style={{ margin: 0 }}>
                                  <span style={{ color: 'var(--text-muted)' }}>ID da foto:</span>{' '}
                                  <code style={{ color: 'var(--accent)' }}>#{item.publicId}</code>
                                </p>
                              )}
                              {(item.originalFilename || item.filename) && (
                                <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', margin: 0 }}>
                                  {fotoNome}
                                </p>
                              )}
                            </div>
                          </div>
                          {previewSrc && (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.35rem' }}>
                              Clique para ampliar em alta leve
                            </p>
                          )}
                          {item.status === 'aceita' && (
                            <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                              🚫 Foto marcada como removida — invisível na galeria e no carrinho
                            </p>
                          )}
                        </div>
                      )
                    })()}

                    {/* Solicitante */}
                    <div
                      style={{ fontSize: '0.85rem', marginBottom: '0.75rem', padding: '0.65rem 0.75rem', borderRadius: 'var(--radius)', background: 'var(--bg-input)', border: '1px dashed var(--border-light)', cursor: item.clientId ? 'pointer' : 'default' }}
                      onClick={() => clientLinkId && window.open(`/admin/clientes?open=${clientLinkId}`, '_blank')}
                      role={clientLinkId ? 'button' : undefined}
                      tabIndex={clientLinkId ? 0 : -1}
                      onKeyDown={(e) => { if (clientLinkId && (e.key === 'Enter' || e.key === ' ')) window.open(`/admin/clientes?open=${clientLinkId}`, '_blank') }}
                    >
                      <p style={{ marginBottom: '0.25rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Solicitante: </span><strong>{item.nome}</strong>
                        {clientLinkId && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
                            Cliente cadastrado (clique)
                          </span>
                        )}
                      </p>
                      {item.cliente?.nome && item.cliente.nome !== item.nome && (
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.1rem 0' }}>
                          Conta vinculada: {item.cliente.nome}
                        </p>
                      )}
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace', margin: '0.15rem 0' }}>
                        CPF: {isSuperAdmin ? formatarCPF(item.cpf) : mascararCPF(item.cpf)}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                        {(item.contatoWhatsapp || item.contato) && (
                          <a
                            href={buildWhatsAppHref(item.contatoWhatsapp || item.contato)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#25D366', textDecoration: 'none', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            📱 {formatarWhatsApp(item.contatoWhatsapp || item.contato)}
                          </a>
                        )}
                        {item.contatoEmail && (
                          <a
                            href={`mailto:${item.contatoEmail}`}
                            style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            ✉️ {item.contatoEmail}
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Motivo */}
                    <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', fontSize: '0.85rem', borderLeft: '3px solid var(--border-light)' }}>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Motivo</p>
                      <p style={{ color: 'var(--text)' }}>{item.motivo}</p>
                    </div>

                    {/* Comentário salvo */}
                    {item.comentarioAdmin && !showComment && (
                      <div style={{ marginTop: '0.75rem', background: 'var(--accent-dim)', borderRadius: 'var(--radius)', padding: '0.6rem 0.85rem', fontSize: '0.8rem', color: 'var(--accent)' }}>
                        📝 <em>{item.comentarioAdmin}</em>
                      </div>
                    )}

                    {/* Nota pública exibida */}
                    {item.comentarioAdminPublico && !showComment && (
                      <div style={{ marginTop: '0.5rem', background: 'rgba(96,165,250,0.1)', borderRadius: 'var(--radius)', padding: '0.6rem 0.85rem', fontSize: '0.8rem', color: '#60a5fa' }}>
                        💬 <em>Nota pública: {item.comentarioAdminPublico}</em>
                      </div>
                    )}

                    {/* Notas do cliente */}
                    {item.notasCliente && (
                      <div style={{ marginTop: '0.5rem', background: 'rgba(245,158,11,0.1)', borderRadius: 'var(--radius)', padding: '0.6rem 0.85rem', fontSize: '0.8rem', color: '#f59e0b' }}>
                        📋 <em>Nota do cliente: {item.notasCliente}</em>
                      </div>
                    )}
                    {Array.isArray(item.notasClienteHistorico) && item.notasClienteHistorico.length > 0 && (
                      <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.35rem' }}>
                        {item.notasClienteHistorico.slice(-3).map((nota, idx) => (
                          <div key={`${nota.criadoEm || idx}-${idx}`} style={{ fontSize: '0.75rem', color: 'var(--text-dim)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.45rem 0.6rem' }}>
                            {nota.criadoEm ? `${formatDate(nota.criadoEm)} - ` : ''}{nota.texto}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Editor de comentários */}
                    {showComment && (
                      <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div>
                          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.3rem' }}>
                            🔒 Nota privada (só eu vejo)
                          </label>
                          <textarea className="form-textarea" rows={2}
                            value={comentarios[item.id] ?? item.comentarioAdmin ?? ''}
                            onChange={e => setComentarios(prev => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="Anotação interna..." />
                        </div>
                        {item.clientId && (
                          <div>
                            <label style={{ fontSize: '0.72rem', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.3rem' }}>
                              💬 Nota pública (cliente vê no painel dele)
                            </label>
                            <textarea className="form-textarea" rows={2}
                              value={comentariosPublicos[item.id] ?? item.comentarioAdminPublico ?? ''}
                              onChange={e => setComentariosPublicos(prev => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="Resposta visível ao cliente..." />
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-sm btn-primary" onClick={() => salvarComentario(item.id)} disabled={isBusy}>
                            {isBusy ? <div className="spinner" style={{ width: '12px', height: '12px' }} /> : '💾 Salvar'}
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setExpandido(null)}>Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '155px', flexShrink: 0 }}>
                    {/* Aceitar remoção */}
                    <button
                      className={`btn btn-sm ${item.status === 'aceita' ? 'btn-danger' : 'btn-ghost'}`}
                      style={{ borderColor: item.status !== 'aceita' ? 'var(--danger)' : undefined, color: item.status !== 'aceita' ? 'var(--danger)' : undefined }}
                      disabled={item.status === 'aceita' || isBusy}
                      onClick={() => {
                        if (!confirm(`Aceitar a remoção?\n\nFoto #${item.publicId || (item.photoId || '').slice(0, 8)} será removida da galeria e dos carrinhos.`)) return
                        patch(item.id, { status: 'aceita' })
                      }}>
                      🚫 Aceitar remoção
                    </button>

                    {/* Rejeitar */}
                    <button
                      className={`btn btn-sm ${item.status === 'rejeitada' ? 'btn-success' : 'btn-ghost'}`}
                      disabled={item.status === 'rejeitada' || isBusy}
                      onClick={() => patch(item.id, { status: 'rejeitada' })}>
                      ✓ Rejeitar pedido
                    </button>

                    {/* Desfazer */}
                    {item.status !== 'pendente' && (
                      <button className="btn btn-sm btn-ghost" disabled={isBusy}
                        onClick={() => {
                          if (item.status === 'aceita' && !confirm('Restaurar a foto na galeria?')) return
                          patch(item.id, { status: 'pendente' })
                        }}>
                        ↩ Desfazer
                      </button>
                    )}

                    {item.status === 'aceita' && !item.fisicamenteExcluidaEm && (
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={isBusy}
                        title="Remove arquivos fisicos apenas se nao houver compras ou outros vinculos criticos"
                        onClick={() => {
                          if (!confirm('Excluir definitivamente os arquivos fisicos desta foto? A API vai bloquear se houver compra ou vinculo critico.')) return
                          patch(item.id, { acao: 'excluir_definitivo' })
                        }}
                      >
                        X Excluir arquivos
                      </button>
                    )}

                    {item.fisicamenteExcluidaEm && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--danger)', textAlign: 'center' }}>
                        Arquivos excluidos em {formatDate(item.fisicamenteExcluidaEm)}
                      </span>
                    )}

                    <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0.1rem 0' }} />

                    {/* Nota interna */}
                    <button className="btn btn-sm btn-ghost"
                      style={{ color: item.comentarioAdmin ? 'var(--accent)' : 'var(--text-dim)' }}
                      onClick={() => setExpandido(showComment ? null : item.id)}>
                      📝 {item.comentarioAdmin ? 'Editar nota' : 'Adicionar nota'}
                    </button>

                    {/* WhatsApp */}
                    {item.contato && (
                      <a href={buildWhatsAppHref(item.contato)}
                        target="_blank" rel="noopener noreferrer"
                        className="btn btn-sm btn-ghost"
                        style={{ background: '#25D36622', color: '#25D366', textDecoration: 'none', textAlign: 'center' }}>
                        📱 WhatsApp
                      </a>
                    )}
                  </div>
                </div>

                {item.resolvidoEm && item.status !== 'pendente' && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.75rem' }}>
                    {item.status === 'aceita' ? '🚫 Aceita' : '✓ Rejeitada'} em {formatDate(item.resolvidoEm)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
      {preview && (
        <div
          className="modal-backdrop"
          style={{ background: 'rgba(0,0,0,0.6)', zIndex: 60 }}
          onClick={() => setPreview(null)}
        >
          <div
            className="modal-full"
            style={{ maxWidth: 'min(90vw, 1100px)', background: 'var(--bg-card)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-top">
              <div className="modal-title">
                <h1>Foto #{preview.id || ''}</h1>
                <span>{preview.title || ''}</span>
              </div>
              <button className="modal-close" onClick={() => setPreview(null)}>×</button>
            </div>
            <div style={{ padding: '0.5rem' }}>
              <img
                src={preview.src}
                alt={preview.title || ''}
                style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '12px', background: 'var(--bg)' }}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
