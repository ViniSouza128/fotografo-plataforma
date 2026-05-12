'use client'
// src/components/AvatarUploader.js
// Bloco de upload da foto de perfil (compartilhado entre minha-conta e admin).

import { useRef, useState } from 'react'
import Avatar from './Avatar'

const MAX_BYTES = 12 * 1024 * 1024

export default function AvatarUploader({ client, onChange, size = 120, disabled = false }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!client?.id) return null

  function pick() {
    if (busy || disabled) return
    setError('')
    fileRef.current?.click()
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError(`Arquivo muito grande (máx ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`)
      return
    }
    if (!String(file.type || '').startsWith('image/')) {
      setError('Apenas imagens.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/clients/${client.id}/avatar`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha no upload.')
      onChange?.(data.client || { ...client, avatar: data.avatar })
    } catch (err) {
      setError(err.message || 'Erro ao enviar.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (busy || disabled) return
    if (!client.avatar) return
    if (!confirm('Remover a foto de perfil?')) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${client.id}/avatar`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao remover.')
      onChange?.(data.client || { ...client, avatar: null })
    } catch (err) {
      setError(err.message || 'Erro ao remover.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative' }}>
        <Avatar client={client} size={size} variant="large" fontScale={0.36} />
        {busy && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div className="spinner" style={{ width: 22, height: 22 }} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm btn-secondary" onClick={pick} disabled={busy || disabled}>
            {client.avatar ? 'Trocar foto' : 'Enviar foto'}
          </button>
          {client.avatar && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={remove} disabled={busy || disabled} style={{ color: 'var(--danger)' }}>
              Remover
            </button>
          )}
        </div>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
          JPG/PNG/WebP até {Math.round(MAX_BYTES / 1024 / 1024)} MB. Será reduzida para uso na lista.
        </span>
        {error && <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{error}</span>}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} hidden />
      </div>
    </div>
  )
}
