'use client'

import { useEffect, useMemo, useState } from 'react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { buildWhatsAppHref, formatarWhatsApp, mascararWhatsAppTempoReal } from '@/lib/whatsapp'

const initialForm = {
  nome: '',
  email: '',
  whatsapp: '',
  assunto: '',
  mensagem: '',
}

function getStudioName(config) {
  return config?.razaoSocial || config?.nomeEstudio || 'Estudio de fotografia'
}

export default function ContatoPage() {
  const [config, setConfig] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState({ type: '', text: '' })

  useEffect(() => {
    let active = true
    async function loadConfig() {
      try {
        const res = await fetch('/api/config')
        if (!res.ok) return
        const data = await res.json()
        if (active) setConfig(data)
      } catch {}
    }
    loadConfig()
    return () => { active = false }
  }, [])

  const studioName = getStudioName(config)
  const whatsappHref = useMemo(() => buildWhatsAppHref(config?.whatsapp), [config?.whatsapp])
  const instagram = String(config?.instagram || '').replace(/^@+/, '').trim()

  function updateField(field, value) {
    setForm(prev => ({
      ...prev,
      [field]: field === 'whatsapp' ? mascararWhatsAppTempoReal(value) : value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving) return

    setSaving(true)
    setStatus({ type: '', text: '' })
    try {
      const res = await fetch('/api/contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus({ type: 'error', text: data.error || 'Nao foi possivel enviar a mensagem.' })
        return
      }
      setForm(initialForm)
      setStatus({ type: 'success', text: 'Mensagem enviada. O atendimento vai aparecer no painel administrativo.' })
    } catch {
      setStatus({ type: 'error', text: 'Erro de conexao ao enviar a mensagem.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Navbar />
      <main style={{
        width: 'min(1040px, calc(100% - 2rem))',
        margin: '0 auto',
        padding: '3rem 0 4rem',
      }}>
        <div style={{ marginBottom: '2rem' }}>
          <p style={{
            color: 'var(--accent)',
            fontSize: '0.78rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: '0.75rem',
          }}>
            Atendimento
          </p>
          <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.4rem)', marginBottom: '1rem' }}>Contato</h1>
          <p style={{ color: 'var(--text-muted)', maxWidth: '680px' }}>
            Fale com {studioName} sobre compras, acesso a downloads, remocoes LGPD, autenticidade de links ou duvidas sobre uma galeria.
          </p>
        </div>

        <div className="contact-page-grid">
          <form onSubmit={handleSubmit} style={{
            border: '1px solid var(--border)',
            borderRadius: '8px',
            background: 'var(--bg-card)',
            padding: 'clamp(1.25rem, 4vw, 2rem)',
          }}>
            {status.text ? (
              <div style={{
                marginBottom: '1.25rem',
                padding: '0.8rem 1rem',
                borderRadius: 'var(--radius)',
                border: status.type === 'error' ? '1px solid rgba(217,108,108,0.35)' : '1px solid rgba(34,197,94,0.35)',
                background: status.type === 'error' ? 'var(--danger-dim)' : 'var(--success-dim)',
                color: status.type === 'error' ? 'var(--danger)' : 'var(--success)',
              }}>
                {status.text}
              </div>
            ) : null}

            <div className="form-group">
              <label className="form-label" htmlFor="nome">Nome</label>
              <input id="nome" className="form-input" value={form.nome} onChange={e => updateField('nome', e.target.value)} required maxLength={120} />
            </div>

            <div className="contact-form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="email">E-mail</label>
                <input id="email" type="email" className="form-input" value={form.email} onChange={e => updateField('email', e.target.value)} maxLength={160} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="whatsapp">WhatsApp</label>
                <input id="whatsapp" className="form-input" value={form.whatsapp} onChange={e => updateField('whatsapp', e.target.value)} maxLength={16} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="assunto">Assunto</label>
              <input id="assunto" className="form-input" value={form.assunto} onChange={e => updateField('assunto', e.target.value)} required maxLength={140} />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="mensagem">Mensagem</label>
              <textarea id="mensagem" className="form-textarea" value={form.mensagem} onChange={e => updateField('mensagem', e.target.value)} required maxLength={2000} style={{ minHeight: '170px' }} />
            </div>

            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Enviando...' : 'Enviar mensagem'}
            </button>
          </form>

          <aside style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--bg-card)',
              padding: '1.25rem',
            }}>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>{studioName}</h2>
              <div style={{ color: 'var(--text-muted)', display: 'grid', gap: '0.55rem' }}>
                {config?.localizacao ? <span>{config.localizacao}</span> : null}
                {whatsappHref ? (
                  <a href={whatsappHref} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                    WhatsApp: {formatarWhatsApp(config.whatsapp)}
                  </a>
                ) : null}
                {instagram ? (
                  <a href={`https://instagram.com/${instagram}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                    Instagram: @{instagram}
                  </a>
                ) : null}
              </div>
            </div>
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--bg-card)',
              padding: '1.25rem',
              color: 'var(--text-muted)',
            }}>
              <h2 style={{ fontSize: '1.1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>Privacidade</h2>
              <p>As mensagens sao salvas em arquivo JSON local e ficam disponiveis para consulta no painel administrativo.</p>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  )
}
