'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { buildThemeStyleContent } from '@/components/ThemeInjector'

const TEMA_OPTIONS = [
  { value: 'escuro', label: 'Escuro', icon: '🌑' },
  { value: 'claro', label: 'Claro', icon: '☀️' },
  { value: 'auto', label: 'Automático', icon: '🌗' },
]

const ACCENT_PRESETS = [
  { color: '#22c55e', label: 'Verde' },
  { color: '#3b82f6', label: 'Azul' },
  { color: '#f59e0b', label: 'Âmbar' },
  { color: '#ec4899', label: 'Rosa' },
  { color: '#8b5cf6', label: 'Violeta' },
  { color: '#ef4444', label: 'Vermelho' },
  { color: '#06b6d4', label: 'Ciano' },
  { color: '#f97316', label: 'Laranja' },
]

function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return { r, g, b }
}

function darken(hex, amount = 0.2) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const r = Math.max(0, Math.round(rgb.r * (1 - amount)))
  const g = Math.max(0, Math.round(rgb.g * (1 - amount)))
  const b = Math.max(0, Math.round(rgb.b * (1 - amount)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

const LIGHT_BG = '#f5f4f1'
const DARK_BG = '#0c0c0c'
const LIGHT_CARD = '#ffffff'
const DARK_CARD = '#1c1c1c'
const LIGHT_TEXT = '#1a1916'
const DARK_TEXT = '#ede8e0'
const LIGHT_MUTED = '#6b6860'
const DARK_MUTED = '#888880'

function PreviewCard({ draft, systemDark }) {
  const isLight = draft.tema === 'claro' || (draft.tema === 'auto' && !systemDark)
  const accent = /^#[0-9a-fA-F]{6}$/.test(draft.accentColor || '') ? draft.accentColor : '#22c55e'
  const bg = isLight ? LIGHT_BG : DARK_BG
  const card = isLight ? LIGHT_CARD : DARK_CARD
  const text = isLight ? LIGHT_TEXT : DARK_TEXT
  const muted = isLight ? LIGHT_MUTED : DARK_MUTED
  const border = isLight ? '#d6d3cc' : '#2e2e2e'
  const accentDim = (() => { const rgb = hexToRgb(accent); return rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)` : 'rgba(34,197,94,0.15)' })()
  const studioName = draft.nomeEstudio || 'Vinícius Rodrigues Fotografia'
  const subtitle = draft.homeHeroSubtitulo || "Encontre as fotos do seu evento e baixe os originais sem marca d'água."
  const sectionTitle = draft.homeSecaoTitulo || 'Eventos Recentes'

  return (
    <div style={{ background: bg, borderRadius: '10px', overflow: 'hidden', border: `1px solid ${border}`, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Navbar mini */}
      <div style={{ background: isLight ? '#eceae5' : '#141414', padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${border}` }}>
        <span style={{ color: accent, fontSize: '0.75rem', fontWeight: 600 }}>{studioName}</span>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {['Eventos', 'Minha conta'].map(l => (
            <span key={l} style={{ color: muted, fontSize: '0.65rem' }}>{l}</span>
          ))}
        </div>
      </div>

      {/* Hero mini */}
      <div style={{ padding: '1.5rem 1.2rem', textAlign: 'center', background: bg }}>
        <p style={{ color: accent, fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Fotografia profissional</p>
        <p style={{ color: text, fontSize: '1.1rem', fontWeight: 300, marginBottom: '0.4rem', fontFamily: 'Space Grotesk, sans-serif' }}>{studioName}</p>
        <p style={{ color: muted, fontSize: '0.65rem', lineHeight: 1.5, maxWidth: '240px', margin: '0 auto 0.75rem' }}>{subtitle}</p>
        <span style={{ display: 'inline-block', background: accent, color: isLight ? '#0d2e12' : '#fff', padding: '0.3rem 0.8rem', borderRadius: '100px', fontSize: '0.65rem', fontWeight: 600 }}>Ver Eventos ↓</span>
      </div>

      {/* Events section */}
      <div style={{ padding: '0.75rem 1.2rem 1.2rem', background: bg }}>
        <h2 style={{ color: text, fontSize: '0.85rem', marginBottom: '0.75rem', fontFamily: 'Space Grotesk, sans-serif' }}>{sectionTitle}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {['Casamento João & Maria', 'Formatura Turma 2024', 'Aniversário 15 anos'].map((name, i) => (
            <div key={i} style={{ background: card, borderRadius: '6px', overflow: 'hidden', border: `1px solid ${border}` }}>
              <div style={{ height: '48px', background: accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '1rem' }}>📷</span>
              </div>
              <div style={{ padding: '0.4rem' }}>
                <p style={{ color: text, fontSize: '0.58rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</p>
                <p style={{ color: muted, fontSize: '0.52rem', marginTop: '0.1rem' }}>42 fotos</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer mini */}
      <div style={{ background: isLight ? '#eceae5' : '#141414', padding: '0.5rem 1.2rem', borderTop: `1px solid ${border}`, textAlign: 'center' }}>
        <p style={{ color: muted, fontSize: '0.58rem' }}>© 2025 {studioName} · Todos os direitos reservados</p>
      </div>
    </div>
  )
}

export default function PersonalizarSitePage() {
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [config, setConfig] = useState({})
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [systemDark, setSystemDark] = useState(true)
  const previewApplied = useRef(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado')
      const admin = raw ? JSON.parse(raw) : null
      setIsSuperAdmin(!!admin?.isSuperAdmin)
    } catch {
      setIsSuperAdmin(false)
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(mq.matches)
    const handler = e => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/config')
        const cfg = await res.json()
        setConfig(cfg)
        setDraft({
          tema: cfg.tema || 'escuro',
          accentColor: cfg.accentColor || '#22c55e',
          nomeEstudio: cfg.nomeEstudio || '',
          homeHeroSubtitulo: cfg.homeHeroSubtitulo || '',
          homeSecaoTitulo: cfg.homeSecaoTitulo || '',
        })
      } catch {}
      finally { setLoading(false) }
    }
    load()
  }, [])

  const applyPreview = useCallback(() => {
    const tema = draft.tema || 'escuro'
    if (tema === 'escuro') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', tema)
    }
    let styleEl = document.getElementById('theme-custom-vars')
    const styleContent = buildThemeStyleContent(draft.accentColor)
    if (styleContent) {
      if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = 'theme-custom-vars'
        document.head.appendChild(styleEl)
      }
      styleEl.textContent = styleContent
    } else if (styleEl) {
      styleEl.remove()
    }
    previewApplied.current = true
    setPreviewing(true)
  }, [draft.tema, draft.accentColor])

  const revertPreview = useCallback(() => {
    const tema = config.tema || 'escuro'
    if (tema === 'escuro') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', tema)
    }
    const styleEl = document.getElementById('theme-custom-vars')
    const styleContent = buildThemeStyleContent(config.accentColor)
    if (styleEl && styleContent) {
      styleEl.textContent = styleContent
    } else if (styleEl) {
      styleEl.remove()
    }
    previewApplied.current = false
    setPreviewing(false)
  }, [config.tema, config.accentColor])

  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tema: draft.tema,
          accentColor: /^#[0-9a-fA-F]{6}$/.test(draft.accentColor || '') ? draft.accentColor : '#22c55e',
          nomeEstudio: draft.nomeEstudio || '',
          homeHeroSubtitulo: draft.homeHeroSubtitulo || '',
          homeSecaoTitulo: draft.homeSecaoTitulo || '',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveMsg(data.error || 'Erro ao salvar.')
      } else {
        const updated = await res.json()
        setConfig(updated)
        setPreviewing(false)
        previewApplied.current = false
        setSaveMsg('Salvo com sucesso!')
        // Apply the saved settings to the live page
        applyPreview()
      }
    } catch {
      setSaveMsg('Erro ao salvar.')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 4000)
    }
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '60vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3.5rem' }}>🔒</div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', color: 'var(--text)' }}>Área exclusiva de super-admins</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '360px', lineHeight: 1.6 }}>
          A personalização do site é restrita ao super-administrador.
        </p>
        <Link href="/admin" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>← Voltar ao Dashboard</Link>
      </div>
    )
  }

  const hasChanges = (
    draft.tema !== (config.tema || 'escuro') ||
    (draft.accentColor || '#22c55e') !== (config.accentColor || '#22c55e') ||
    (draft.nomeEstudio || '') !== (config.nomeEstudio || '') ||
    (draft.homeHeroSubtitulo || '') !== (config.homeHeroSubtitulo || '') ||
    (draft.homeSecaoTitulo || '') !== (config.homeSecaoTitulo || '')
  )

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 1rem 3rem' }}>
      <div className="admin-header" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="admin-page-title">Personalizar site</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Ajuste visual, textos e tema. Use o preview antes de salvar.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {previewing ? (
            <button className="btn btn-ghost" onClick={revertPreview}>↩ Reverter preview</button>
          ) : (
            <button className="btn btn-ghost" onClick={applyPreview} disabled={!hasChanges}>👁 Preview</button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {saveMsg && (
        <div className={`alert ${saveMsg.includes('sucesso') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '1.5rem' }}>
          {saveMsg}
        </div>
      )}

      {previewing && (
        <div className="alert" style={{ marginBottom: '1.5rem', background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)' }}>
          Preview ativo — as mudanças estão aplicadas nesta aba. Salve para tornar permanente ou reverta para cancelar.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Painel de configurações */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Tema */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', marginBottom: '1rem', color: 'var(--text)' }}>Tema</h2>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {TEMA_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDraft(d => ({ ...d, tema: opt.value }))}
                  style={{
                    flex: 1, padding: '0.75rem 0.5rem', borderRadius: 'var(--radius)',
                    border: draft.tema === opt.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: draft.tema === opt.value ? 'var(--accent-dim)' : 'var(--bg-card)',
                    color: 'var(--text)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                    display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '1.4rem' }}>{opt.icon}</span>
                  <span style={{ fontSize: '0.8rem' }}>{opt.label}</span>
                </button>
              ))}
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.75rem' }}>
              {draft.tema === 'auto' ? 'Segue a preferência do sistema operacional do visitante.' :
               draft.tema === 'claro' ? 'Sempre tema claro para todos os visitantes.' :
               'Sempre tema escuro para todos os visitantes.'}
            </p>
          </div>

          {/* Cor de destaque */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', marginBottom: '1rem', color: 'var(--text)' }}>Cor de destaque</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              {ACCENT_PRESETS.map(p => (
                <button
                  key={p.color}
                  title={p.label}
                  onClick={() => setDraft(d => ({ ...d, accentColor: p.color }))}
                  style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: p.color, border: draft.accentColor === p.color ? '3px solid var(--text)' : '2px solid transparent',
                    cursor: 'pointer', transition: 'transform 0.1s', outline: 'none',
                    boxShadow: draft.accentColor === p.color ? '0 0 0 2px var(--bg), 0 0 0 4px ' + p.color : 'none',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                aria-label="Selecionar cor de destaque"
                type="color"
                value={draft.accentColor || '#22c55e'}
                onChange={e => setDraft(d => ({ ...d, accentColor: e.target.value }))}
                style={{ width: '48px', height: '36px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', padding: '2px' }}
              />
              <input
                type="text"
                className="form-input"
                value={draft.accentColor || ''}
                onChange={e => {
                  const v = e.target.value.trim()
                  setDraft(d => ({ ...d, accentColor: v }))
                }}
                placeholder="#22c55e"
                maxLength={7}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
              <div style={{
                width: '48px', height: '36px', borderRadius: 'var(--radius)',
                background: /^#[0-9a-fA-F]{6}$/.test(draft.accentColor || '') ? draft.accentColor : '#22c55e',
                border: '1px solid var(--border)', flexShrink: 0,
              }} />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem' }}>
              {[['Destaque', draft.accentColor], ['Hover', darken(draft.accentColor || '#22c55e', 0.2)]].map(([label, color]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#22c55e' }} />
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>{label}: {/^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#22c55e'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Nome / marca */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', marginBottom: '1rem', color: 'var(--text)' }}>Nome do estúdio</h2>
            <input
              type="text"
              className="form-input"
              value={draft.nomeEstudio || ''}
              onChange={e => setDraft(d => ({ ...d, nomeEstudio: e.target.value }))}
              placeholder="Vinícius Rodrigues Fotografia"
              maxLength={80}
            />
            <p style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginTop: '0.5rem' }}>Aparece no navbar, hero da home e rodapé.</p>
          </div>

          {/* Textos da home */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', marginBottom: '1rem', color: 'var(--text)' }}>Textos da home</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="form-label">Subtítulo do hero</label>
                <textarea aria-label="Subtítulo do hero"
                  className="form-input"
                  rows={3}
                  value={draft.homeHeroSubtitulo || ''}
                  onChange={e => setDraft(d => ({ ...d, homeHeroSubtitulo: e.target.value }))}
                  placeholder="Encontre as fotos do seu evento, selecione os seus salvos e baixe os originais sem marca d'água."
                  style={{ resize: 'vertical' }}
                  maxLength={300}
                />
                <p style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginTop: '0.3rem' }}>Texto exibido abaixo do nome do estúdio na página inicial.</p>
              </div>
              <div>
                <label className="form-label">Título da seção de eventos</label>
                <input aria-label="Título da seção de eventos"
                  type="text"
                  className="form-input"
                  value={draft.homeSecaoTitulo || ''}
                  onChange={e => setDraft(d => ({ ...d, homeSecaoTitulo: e.target.value }))}
                  placeholder="Eventos Recentes"
                  maxLength={60}
                />
              </div>
            </div>
          </div>

        </div>

        {/* Painel de preview */}
        <div style={{ position: 'sticky', top: '1.5rem' }}>
          <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Preview do site</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {previewing ? (
                <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={revertPreview}>↩ Reverter</button>
              ) : (
                <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={applyPreview} disabled={!hasChanges}>👁 Aplicar preview</button>
              )}
            </div>
          </div>
          <PreviewCard draft={draft} systemDark={systemDark} />
          <p style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginTop: '0.5rem', textAlign: 'center' }}>
            Simulação visual — as proporções são reduzidas.
          </p>
        </div>
      </div>
    </div>
  )
}
