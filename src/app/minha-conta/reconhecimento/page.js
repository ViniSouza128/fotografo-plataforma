'use client'
// src/app/minha-conta/reconhecimento/page.js
// Cliente: consentimento + upload de referência + busca + solicitar bloqueio.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

export default function ReconhecimentoClientePage() {
  const [me, setMe] = useState(null)
  const [status, setStatus] = useState(null)
  const [refs, setRefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState(null)
  const [searchCode, setSearchCode] = useState('')
  const [searchFile, setSearchFile] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState(null)
  const [showBlock, setShowBlock] = useState(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado')
      const c = raw ? JSON.parse(raw) : null
      setMe(c)
    } catch { setMe(null) }
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [s, r, m] = await Promise.all([
        fetch('/api/reconhecimento/config').then(r => r.ok ? r.json() : null),
        fetch('/api/reconhecimento/referencias?meu=1').then(r => r.ok ? r.json() : []),
        fetch('/api/auth/me').then(r => r.ok ? r.json() : null),
      ])
      setStatus(s)
      setRefs(Array.isArray(r) ? r : [])
      if (m?.client) {
        setMe(prev => ({ ...(prev || {}), ...m.client }))
        try {
          localStorage.setItem('clienteLogado', JSON.stringify({ ...(JSON.parse(localStorage.getItem('clienteLogado') || '{}')), ...m.client }))
        } catch {}
      }
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const consentido = !!me?.reconhecimentoConsentidoEm

  async function darConsentimento() {
    try {
      const res = await fetch('/api/reconhecimento/consentimento', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFeedback({ type: 'error', text: data.error || 'Erro' })
        return
      }
      await carregar()
      setFeedback({ type: 'success', text: 'Consentimento registrado.' })
    } catch { setFeedback({ type: 'error', text: 'Erro de rede.' }) }
  }

  async function revogarConsentimento() {
    if (!confirm('Revogar o consentimento apaga TODAS as suas referências e impede futuras buscas. Continuar?')) return
    try {
      const res = await fetch('/api/reconhecimento/consentimento', { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'Erro' })
        return
      }
      setFeedback({ type: 'success', text: `Consentimento revogado. ${data.referenciasApagadas} referência(s) apagada(s).` })
      await carregar()
    } catch { setFeedback({ type: 'error', text: 'Erro de rede.' }) }
  }

  async function uploadReferencia(file) {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('label', me?.nomeCompleto || 'Minha referência')
    fd.append('consentido', '1')
    try {
      const res = await fetch('/api/reconhecimento/referencias', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'Erro' })
        return
      }
      const detail = data.hasEmbedding
        ? 'Rosto detectado. Você já pode buscar.'
        : `Imagem salva, mas o engine facial ${data.engineReason || 'não está disponível'}. Aguarde o admin habilitar.`
      setFeedback({ type: 'success', text: `Referência enviada. ${detail}` })
      await carregar()
    } catch { setFeedback({ type: 'error', text: 'Erro de rede.' }) }
  }

  async function deletarRef(id) {
    if (!confirm('Apagar esta referência?')) return
    try {
      await fetch(`/api/reconhecimento/referencias?id=${id}`, { method: 'DELETE' })
      await carregar()
    } catch {}
  }

  async function buscar() {
    setSearchLoading(true)
    setSearchResults(null)
    try {
      let res
      if (searchFile) {
        const fd = new FormData()
        fd.append('file', searchFile)
        if (searchCode) fd.append('code', searchCode)
        res = await fetch('/api/reconhecimento/buscar', { method: 'POST', body: fd })
      } else {
        res = await fetch('/api/reconhecimento/buscar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: searchCode || null }),
        })
      }
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'Erro' })
      } else {
        setSearchResults(data)
      }
    } catch { setFeedback({ type: 'error', text: 'Erro de rede.' }) }
    finally { setSearchLoading(false) }
  }

  async function buscarComReferencia(refId) {
    setSearchLoading(true)
    setSearchResults(null)
    try {
      const res = await fetch('/api/reconhecimento/buscar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceId: refId }),
      })
      const data = await res.json()
      if (!res.ok) setFeedback({ type: 'error', text: data.error || 'Erro' })
      else setSearchResults(data)
    } catch { setFeedback({ type: 'error', text: 'Erro de rede.' }) }
    finally { setSearchLoading(false) }
  }

  async function solicitarBloqueio({ fotoId, motivo, documento }) {
    try {
      const res = await fetch('/api/reconhecimento/bloqueios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escopo: 'foto', fotoId, motivo, documento }),
      })
      const data = await res.json()
      if (!res.ok) { setFeedback({ type: 'error', text: data.error || 'Erro' }); return }
      setShowBlock(null)
      setFeedback({ type: 'success', text: 'Solicitação enviada. Será revisada manualmente.' })
    } catch { setFeedback({ type: 'error', text: 'Erro de rede.' }) }
  }

  if (loading) {
    return <div style={{ padding: '4rem 0', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
  }

  if (!status?.ativo) {
    return (
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)' }}>Reconhecimento</h1>
        <p style={{ color: 'var(--text-muted)' }}>O recurso de reconhecimento está desativado pelo fotógrafo.</p>
      </div>
    )
  }

  if (!status?.permitirCliente) {
    return (
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)' }}>Reconhecimento</h1>
        <p style={{ color: 'var(--text-muted)' }}>A busca por reconhecimento está disponível apenas para o fotógrafo.</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Você pode <Link href="/contato">entrar em contato</Link> para que ele busque suas fotos.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', margin: 0 }}>Reconhecimento</h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Encontre suas fotos por número (ex: número da camisa) ou rosto.
        </p>
      </div>

      {feedback && (
        <div style={{
          padding: '0.65rem 0.9rem', marginBottom: '0.75rem',
          background: feedback.type === 'error' ? 'rgba(220,38,38,0.15)' : 'rgba(34,197,94,0.12)',
          border: `1px solid ${feedback.type === 'error' ? 'rgba(220,38,38,0.4)' : 'rgba(34,197,94,0.4)'}`,
          color: feedback.type === 'error' ? '#fca5a5' : '#86efac',
          borderRadius: 'var(--radius)', fontSize: '0.85rem',
        }}>{feedback.text}</div>
      )}

      {status.exigirConsentimento && !consentido && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1rem',
        }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', margin: '0 0 0.5rem' }}>📜 Termo de uso (LGPD)</h2>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Para usar o reconhecimento facial você precisa autorizar o tratamento da sua imagem.
            A imagem fica armazenada localmente no servidor do fotógrafo, criptografada por permissões
            do sistema operacional, e usada apenas para encontrar fotos suas. Você pode revogar a
            qualquer momento e todas as suas referências serão apagadas.
          </p>
          <button className="btn btn-primary" onClick={darConsentimento}>Eu concordo</button>
        </div>
      )}

      {consentido && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', margin: '0 0 0.5rem' }}>🔒 Suas referências</h2>
          {refs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 0.6rem' }}>Você ainda não enviou nenhuma referência.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
              {refs.map(r => (
                <div key={r.id} style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 500 }}>{r.label}</p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {r.hasEmbedding ? '✓ rosto extraído' : '⚠ aguardando engine facial'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    {r.hasEmbedding && (
                      <button className="btn btn-sm btn-primary" onClick={() => buscarComReferencia(r.id)}>Buscar</button>
                    )}
                    <button className="btn btn-sm btn-ghost" onClick={() => deletarRef(r.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 0.75rem', background: 'var(--bg-input)', borderRadius: 'var(--radius)', fontSize: '0.85rem' }}>
            📸 Enviar foto
            <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && uploadReferencia(e.target.files[0])} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }} onClick={revogarConsentimento}>
            Revogar consentimento e apagar tudo
          </button>
        </div>
      )}

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1rem' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', margin: '0 0 0.5rem' }}>🔎 Buscar fotos</h2>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <input value={searchCode} onChange={e => setSearchCode(e.target.value)}
            placeholder="Número (ex: 18)"
            style={{ padding: '0.55rem 0.7rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)' }} />
          <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Foto sua (opcional, busca por rosto):
            <input type="file" accept="image/*" onChange={e => setSearchFile(e.target.files?.[0] || null)}
              style={{ marginLeft: '0.4rem', fontSize: '0.78rem' }} />
          </label>
          <button className="btn btn-primary" onClick={buscar}
            disabled={searchLoading || (!searchCode && !searchFile)}>
            {searchLoading ? 'Buscando...' : 'Buscar nas fotos públicas'}
          </button>
        </div>

        {searchResults && (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{searchResults.results.length} resultado(s)</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
              {searchResults.results.map((r, i) => (
                <div key={i} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.4rem' }}>
                  <Link href={`/evento/${r.event?.id}?foto=${r.photo?.id}`}>
                    {r.photo?.pathThumbWm ? (
                      <img src={`/uploads/${r.photo.pathThumbWm}`} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 'var(--radius)' }} />
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '4/3', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📷</div>
                    )}
                  </Link>
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{r.event?.name}</p>
                  <button className="btn btn-sm btn-ghost" style={{ width: '100%', marginTop: '0.25rem', fontSize: '0.7rem' }}
                    onClick={() => setShowBlock({ fotoId: r.photo?.id, eventName: r.event?.name })}>
                    🚫 Pedir bloqueio
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showBlock && (
        <BloqueioModal alvo={showBlock} onClose={() => setShowBlock(null)} onSubmit={solicitarBloqueio} />
      )}
    </div>
  )
}

function BloqueioModal({ alvo, onClose, onSubmit }) {
  const [motivo, setMotivo] = useState('')
  const [documento, setDocumento] = useState('')
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', maxWidth: '440px', width: '100%' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontFamily: 'var(--font-heading)' }}>Solicitar bloqueio</h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Foto de <strong>{alvo.eventName}</strong> · Sua solicitação será analisada manualmente.
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Motivo (mín 10 caracteres)*</span>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
            style={{ padding: '0.55rem 0.7rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: '0.85rem', resize: 'vertical' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Documento (opcional, ajuda na análise)</span>
          <input value={documento} onChange={e => setDocumento(e.target.value)}
            style={{ padding: '0.55rem 0.7rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: '0.85rem' }} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSubmit({ fotoId: alvo.fotoId, motivo, documento })} disabled={motivo.length < 10}>
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
