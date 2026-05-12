'use client'
// src/components/admin/TabPatrocinadores.js
// Aba "Patrocinadores" do painel /admin/eventos/[id]. Recebe eventId via prop.

import { useCallback, useEffect, useState } from 'react'

function newEmptySponsor() {
  return {
    nome: '',
    descricao: '',
    instagram: '',
    link: '',
    contato: '',
    logoUrl: null,
    logoFilename: null,
    ordem: 0,
  }
}

export default function TabPatrocinadores({ eventId, embedded = true }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [editing, setEditing] = useState(null)
  const [logoUploading, setLogoUploading] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/events/${eventId}`)
      const data = res.ok ? await res.json() : null
      setList(Array.isArray(data?.patrocinadores) ? data.patrocinadores : [])
    } catch {} finally { setLoading(false) }
  }, [eventId])

  useEffect(() => { carregar() }, [carregar])

  function showMsg(type, text) {
    setFeedback({ type, text })
    setTimeout(() => setFeedback(null), 4000)
  }

  async function persistir(novaLista) {
    setSaving(true)
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patrocinadores: novaLista }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showMsg('error', data.error || 'Erro ao salvar.')
        return false
      }
      const updated = Array.isArray(data.patrocinadores) ? data.patrocinadores : novaLista
      setList(updated)
      showMsg('success', 'Patrocinadores atualizados.')
      return true
    } catch {
      showMsg('error', 'Erro de rede.')
      return false
    } finally { setSaving(false) }
  }

  async function uploadLogo(file, sponsorId) {
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('eventId', eventId)
      if (sponsorId) fd.append('sponsorId', sponsorId)
      const res = await fetch('/api/upload-sponsor-logo', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { showMsg('error', data.error || 'Erro no upload.'); return null }
      return data
    } catch (err) {
      showMsg('error', err.message || 'Erro de rede.')
      return null
    } finally { setLogoUploading(false) }
  }

  function handleAdd() {
    setEditing({ ...newEmptySponsor(), _isNew: true })
  }

  async function handleSave(sponsor) {
    if (!sponsor.nome?.trim()) {
      showMsg('error', 'Nome é obrigatório.')
      return
    }
    let next
    if (sponsor._isNew) {
      const { _isNew, ...clean } = sponsor
      const ordemFinal = list.length > 0 ? Math.max(...list.map(s => Number(s.ordem) || 0)) + 1 : 1
      next = [...list, { ...clean, ordem: clean.ordem || ordemFinal }]
    } else {
      next = list.map(s => s.id === sponsor.id ? { ...sponsor } : s)
    }
    const ok = await persistir(next)
    if (ok) setEditing(null)
  }

  async function handleDelete(sponsor) {
    if (!confirm(`Remover patrocinador "${sponsor.nome}"?`)) return
    const next = list.filter(s => s.id !== sponsor.id)
    await persistir(next)
  }

  async function handleReorder(sponsor, direction) {
    const sorted = [...list].sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0))
    const idx = sorted.findIndex(s => s.id === sponsor.id)
    if (idx < 0) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= sorted.length) return
    ;[sorted[idx].ordem, sorted[targetIdx].ordem] = [sorted[targetIdx].ordem, sorted[idx].ordem]
    await persistir(sorted)
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '20vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: embedded ? '100%' : '960px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div>
          {!embedded && (
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', margin: 0 }}>🤝 Patrocinadores / parceiros</h1>
          )}
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Aparecem em um painel no topo da galeria pública do álbum, logo acima dos cards de descontos.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>+ Novo patrocinador</button>
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

      {list.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>🤝</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
            Nenhum patrocinador cadastrado ainda. Clique em <strong>+ Novo patrocinador</strong>.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.7rem' }}>
          {[...list].sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0)).map((s, i, arr) => (
            <div key={s.id} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '0.85rem',
              display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: '0.85rem', alignItems: 'center',
            }}>
              <div style={{
                width: 90, height: 60, background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)',
              }}>
                {s.logoUrl ? (
                  <img src={s.logoUrl} alt={s.nome}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: '1.4rem', color: 'var(--text-dim)' }}>🤝</span>
                )}
              </div>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{s.nome}</div>
                {s.descricao && (
                  <div style={{ marginTop: '0.2rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{s.descricao}</div>
                )}
                <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  {s.instagram && <span>📷 @{s.instagram}</span>}
                  {s.link && <span>🔗 {s.link}</span>}
                  {s.contato && <span>📞 {s.contato}</span>}
                  <span>· ordem {s.ordem}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleReorder(s, 'up')} disabled={i === 0 || saving} title="Mover para cima">↑</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleReorder(s, 'down')} disabled={i === arr.length - 1 || saving} title="Mover para baixo">↓</button>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>Editar</button>
                <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(s)} style={{ color: '#fca5a5' }}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <SponsorEditor
          eventId={eventId}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
          uploadLogo={uploadLogo}
          uploading={logoUploading}
        />
      )}
    </div>
  )
}

function SponsorEditor({ initial, onCancel, onSave, uploadLogo, uploading }) {
  const [draft, setDraft] = useState(initial)
  const isNew = !!initial._isNew

  function setField(key, value) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  async function handleLogoChange(file) {
    if (!file) return
    const result = await uploadLogo(file, draft.id)
    if (result?.logoUrl) {
      setDraft(prev => ({
        ...prev,
        id: prev.id || result.sponsorId,
        logoUrl: result.logoUrl,
        logoFilename: result.filename,
      }))
    }
  }

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '1.5rem',
        maxWidth: '560px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h3 style={{ margin: '0 0 1rem', fontFamily: 'var(--font-heading)' }}>
          {isNew ? 'Novo patrocinador' : 'Editar patrocinador'}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
            <div style={{
              width: 100, height: 70, background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius)', overflow: 'hidden', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border)',
            }}>
              {draft.logoUrl ? (
                <img src={draft.logoUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontSize: '1.6rem', color: 'var(--text-dim)' }}>🤝</span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label" style={{ display: 'block' }}>Logo (PNG, JPG, GIF, WEBP ou SVG)</label>
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.svg"
                onChange={e => handleLogoChange(e.target.files?.[0] || null)}
                disabled={uploading}
                style={{ fontSize: '0.85rem' }} />
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                {uploading ? 'Enviando...' : 'Recomendado: PNG/SVG transparente. Tamanho máx 5 MB.'}
              </p>
            </div>
          </div>

          <Field label="Nome *" value={draft.nome} onChange={v => setField('nome', v)} placeholder="Ex: Loja XYZ" />
          <Field label="Descrição (opcional)" value={draft.descricao} onChange={v => setField('descricao', v)}
            placeholder="Texto curto de apresentação" textarea />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <Field label="Instagram (sem @)" value={draft.instagram} onChange={v => setField('instagram', v)} placeholder="loja_xyz" />
            <Field label="Site / link" value={draft.link} onChange={v => setField('link', v)} placeholder="https://..." />
          </div>

          <Field label="Contato (telefone, e-mail livre)" value={draft.contato} onChange={v => setField('contato', v)}
            placeholder="(11) 99999-9999" />
          <Field label="Ordem de exibição" type="number" value={draft.ordem} onChange={v => setField('ordem', Number(v))} />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(draft)} disabled={uploading || !draft.nome?.trim()}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', textarea = false }) {
  const baseStyle = {
    padding: '0.55rem 0.7rem', background: 'var(--bg-input)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    color: 'var(--text)', fontSize: '0.88rem', width: '100%',
  }
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{label}</span>
      {textarea ? (
        <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          rows={3} style={{ ...baseStyle, resize: 'vertical' }} />
      ) : (
        <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={baseStyle} />
      )}
    </label>
  )
}
