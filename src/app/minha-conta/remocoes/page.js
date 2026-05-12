// src/app/minha-conta/remocoes/page.js
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { applyNextImageFallback, getFirstUrl, getPhotoCartPreviewCandidates } from '@/lib/imagePaths'

const STATUS = {
  pendente:  { label: 'Pendente',  color: 'var(--accent)',  bg: 'var(--accent-dim)' },
  aceita:    { label: 'Aceita',    color: 'var(--danger)',  bg: 'var(--danger-dim)' },
  rejeitada: { label: 'Rejeitada', color: 'var(--success)', bg: 'var(--success-dim)' },
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function RemocoesClientePage() {
  const router = useRouter()
  const [cliente, setCliente] = useState(null)
  const [remocoes, setRemocoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [notaDraft, setNotaDraft] = useState({})

  // Autentica e carrega cliente
  useEffect(() => {
    async function loadCliente() {
      try {
        const meRes = await fetch('/api/auth/me')
        if (meRes.ok) {
          const data = await meRes.json()
          setCliente(data.client)
          localStorage.setItem('clienteLogado', JSON.stringify(data.client))
        } else {
          const raw = localStorage.getItem('clienteLogado')
          if (raw) setCliente(JSON.parse(raw))
          else router.replace('/login')
        }
      } catch {
        const raw = localStorage.getItem('clienteLogado')
        if (raw) setCliente(JSON.parse(raw))
        else router.replace('/login')
      }
    }
    loadCliente()
  }, [router])

  // Carrega remoções do cliente
  useEffect(() => {
    if (!cliente?.id) return
    const cpf = String(cliente.cpf || '').replace(/\D/g, '')
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/remocoes')
        if (!res.ok) throw new Error('fail')
        const all = await res.json()
        const mine = all.filter(r =>
          r.clientId === cliente.id ||
          (cpf && String(r.cpf || '').replace(/\D/g, '') === cpf)
        )
        if (!cancelled) {
          setRemocoes(mine)
          const drafts = {}
          mine.forEach(r => { drafts[r.id] = '' })
          setNotaDraft(drafts)
        }
      } catch {
        if (!cancelled) setRemocoes([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [cliente?.id, cliente?.cpf])

  async function salvarNota(remocaoId) {
    const texto = String(notaDraft[remocaoId] || '').trim()
    if (!texto) return
    setSaving(remocaoId)
    try {
      const res = await fetch('/api/remocoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: remocaoId, notaClienteAdicionar: texto }),
      })
      if (res.ok) {
        const atualizado = await res.json()
        setRemocoes(prev => prev.map(r => r.id === remocaoId ? { ...r, ...atualizado } : r))
        setNotaDraft(prev => ({ ...prev, [remocaoId]: '' }))
      } else {
        alert('Não foi possível salvar sua nota.')
      }
    } catch {
      alert('Erro de conexão ao salvar.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '40vh' }}>
        <div className="spinner" style={{ width: '28px', height: '28px' }} />
      </div>
    )
  }

  if (!cliente) return null

  const ordenadas = [...remocoes].sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', marginBottom: '0.2rem' }}>
          Minhas solicitações de remoção
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Acompanhe o status, notas do fotógrafo e deixe seus comentários.
        </p>
      </div>

      {ordenadas.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🗂️</div>
          <h2 className="empty-state-title">Nenhuma solicitação registrada</h2>
          <p className="empty-state-text">Envie um pedido de remoção pela foto para acompanhar aqui.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {ordenadas.map(item => {
            const s = STATUS[item.status] || STATUS.pendente
            const photoData = {
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
            const previewCandidates = getPhotoCartPreviewCandidates(photoData)
            const previewSrc = getFirstUrl(previewCandidates)

            return (
              <div key={item.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <span style={{ background: s.bg, color: s.color, padding: '0.12rem 0.55rem', borderRadius: '100px', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                      {s.label}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{formatDate(item.criadoEm)}</span>
                    {item.publicId && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>Foto #{item.publicId}</span>}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.8rem', alignItems: 'center', marginTop: '0.65rem' }}>
                  {previewSrc ? (
                    <img
                      src={previewSrc}
                      alt=""
                      style={{ width: '72px', height: '72px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }}
                      onError={e => { if (!applyNextImageFallback(e.currentTarget, previewCandidates)) e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <div style={{ width: '72px', height: '72px', borderRadius: '8px', border: '1px dashed var(--border)', display: 'grid', placeItems: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>sem</div>
                  )}
                  <div>
                    <p style={{ margin: 0, color: 'var(--text)' }}>{item.motivo || '-'}</p>
                    {item.status === 'aceita' && (
                      <p style={{ margin: '0.25rem 0 0', color: 'var(--danger)', fontSize: '0.8rem' }}>
                        🚫 Foto indisponível para curtidas, favoritos e compras.
                      </p>
                    )}
                  </div>
                </div>

                {item.comentarioAdminPublico && (
                  <div style={{ marginTop: '0.65rem', background: 'rgba(59,130,246,0.12)', borderRadius: 'var(--radius)', padding: '0.65rem 0.75rem', color: '#3b82f6', fontSize: '0.88rem' }}>
                    💬 Nota do fotógrafo: {item.comentarioAdminPublico}
                  </div>
                )}

                {item.notasCliente && (
                  <div style={{ marginTop: '0.65rem', background: 'rgba(245,158,11,0.1)', borderRadius: 'var(--radius)', padding: '0.65rem 0.75rem', color: '#f59e0b', fontSize: '0.86rem', whiteSpace: 'pre-wrap' }}>
                    Suas notas: {item.notasCliente}
                  </div>
                )}

                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                    🗒️ Sua nota (visível para o fotógrafo)
                  </label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    value={notaDraft[item.id] ?? ''}
                    onChange={e => setNotaDraft(prev => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="Inclua detalhes adicionais ou atualizacoes."
                    style={{ resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.45rem' }}>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => salvarNota(item.id)}
                      disabled={saving === item.id}
                    >
                      {saving === item.id ? <div className="spinner" style={{ width: '12px', height: '12px' }} /> : '💾 Salvar nota'}
                    </button>
                    {item.resolvidoEm && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        Atualizado em {formatDate(item.resolvidoEm)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
