'use client'
// src/app/admin/configuracoes/ConfiguracoesResolucoes.js
// Configuração global de download por resolução (tiers + presets de social).

import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_TIERS_CONFIG } from '@/lib/downloadTiersDefaults'

function clone(o) { return JSON.parse(JSON.stringify(o)) }

export default function ConfiguracoesResolucoes({ showMsg }) {
  const [config, setConfig] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/config')
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      const dt = data?.downloadTiers && typeof data.downloadTiers === 'object'
        ? data.downloadTiers
        : clone(DEFAULT_TIERS_CONFIG)
      setConfig({ ...clone(DEFAULT_TIERS_CONFIG), ...dt, tiers: Array.isArray(dt.tiers) && dt.tiers.length ? dt.tiers : clone(DEFAULT_TIERS_CONFIG.tiers), presets: Array.isArray(dt.presets) && dt.presets.length ? dt.presets : clone(DEFAULT_TIERS_CONFIG.presets) })
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function updateTier(idx, patch) {
    setConfig(prev => {
      if (!prev) return prev
      const next = clone(prev)
      next.tiers[idx] = { ...next.tiers[idx], ...patch }
      return next
    })
  }

  function updatePreset(idx, patch) {
    setConfig(prev => {
      if (!prev) return prev
      const next = clone(prev)
      next.presets[idx] = { ...next.presets[idx], ...patch }
      return next
    })
  }

  function addTier() {
    setConfig(prev => {
      const next = clone(prev || {})
      const list = Array.isArray(next.tiers) ? next.tiers : []
      const ordem = list.length > 0 ? Math.max(...list.map(t => Number(t.ordem) || 0)) + 1 : 1
      list.push({ id: `tier${ordem}`, label: 'Novo tier', maxLongSide: 1280, multiplier: 0.6, fixedPrice: null, ordem, minOriginalLongSide: null })
      next.tiers = list
      return next
    })
  }

  function removeTier(idx) {
    if (!confirm('Remover este tier?')) return
    setConfig(prev => {
      const next = clone(prev || {})
      next.tiers.splice(idx, 1)
      return next
    })
  }

  function addPreset() {
    setConfig(prev => {
      const next = clone(prev || {})
      const list = Array.isArray(next.presets) ? next.presets : []
      list.push({ id: `preset${list.length + 1}`, label: 'Novo preset', mode: 'fit', maxLongSide: 1280, width: null, height: null, quality: 85 })
      next.presets = list
      return next
    })
  }

  function removePreset(idx) {
    if (!confirm('Remover este preset?')) return
    setConfig(prev => {
      const next = clone(prev || {})
      next.presets.splice(idx, 1)
      return next
    })
  }

  async function handleSave() {
    if (!config) return
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadTiers: config }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showMsg?.(err.error || 'Erro ao salvar', 'error')
      } else {
        showMsg?.('Configuração de resoluções salva.', 'success')
      }
    } catch (e) {
      showMsg?.('Erro de rede', 'error')
    } finally { setSaving(false) }
  }

  if (loading || !config) {
    return (
      <section className="config-section" style={{ marginTop: '2rem' }}>
        <h2 className="config-section-title">📐 Download por resolução</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Carregando...</p>
      </section>
    )
  }

  return (
    <section className="config-section" style={{ marginTop: '2rem' }}>
      <h2 className="config-section-title">📐 Download por resolução</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 0 1rem' }}>
        Permite ao cliente escolher o tamanho ao comprar (Social/Web/Original) e baixar em formatos predefinidos
        (WhatsApp, Instagram, etc.) Tudo é gerado on-demand a partir do original.
      </p>

      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={!!config.ativo}
            onChange={e => setConfig(prev => ({ ...prev, ativo: e.target.checked }))} />
          Ativar venda por resolução
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
          Tier padrão exibido:
          <select value={config.defaultTier}
            onChange={e => setConfig(prev => ({ ...prev, defaultTier: e.target.value }))}
            style={{ padding: '0.35rem 0.55rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)' }}>
            {config.tiers.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
      </div>

      <h3 style={{ fontSize: '0.95rem', margin: '0.5rem 0 0.5rem' }}>Tiers (níveis de venda)</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <Th>id</Th><Th>Label</Th><Th>Max long side</Th><Th>Multiplier</Th><Th>Fixed (R$)</Th><Th>Ordem</Th><Th>Min original</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {config.tiers.map((t, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <Td><Input value={t.id} onChange={v => updateTier(i, { id: String(v).replace(/[^a-z0-9_-]/gi, '').toLowerCase() })} style={{ width: 80 }} /></Td>
                <Td><Input value={t.label} onChange={v => updateTier(i, { label: v })} /></Td>
                <Td><Input type="number" value={t.maxLongSide ?? ''} onChange={v => updateTier(i, { maxLongSide: v === '' ? null : Number(v) })} style={{ width: 90 }} /></Td>
                <Td><Input type="number" step="0.05" value={t.multiplier ?? ''} onChange={v => updateTier(i, { multiplier: v === '' ? null : Number(v) })} style={{ width: 70 }} /></Td>
                <Td><Input type="number" step="0.01" value={t.fixedPrice ?? ''} onChange={v => updateTier(i, { fixedPrice: v === '' ? null : Number(v) })} style={{ width: 80 }} /></Td>
                <Td><Input type="number" value={t.ordem ?? ''} onChange={v => updateTier(i, { ordem: Number(v) })} style={{ width: 60 }} /></Td>
                <Td><Input type="number" value={t.minOriginalLongSide ?? ''} onChange={v => updateTier(i, { minOriginalLongSide: v === '' ? null : Number(v) })} style={{ width: 90 }} /></Td>
                <Td><button className="btn btn-sm btn-ghost" onClick={() => removeTier(i)}>✕</button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-sm btn-ghost" onClick={addTier} style={{ marginTop: '0.4rem' }}>+ Adicionar tier</button>

      <h3 style={{ fontSize: '0.95rem', margin: '1.25rem 0 0.5rem' }}>Presets de download (formatos sociais)</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <Th>id</Th><Th>Label</Th><Th>Modo</Th><Th>W</Th><Th>H</Th><Th>Max long</Th><Th>Q</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {config.presets.map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <Td><Input value={p.id} onChange={v => updatePreset(i, { id: String(v).replace(/[^a-z0-9_-]/gi, '').toLowerCase() })} style={{ width: 80 }} /></Td>
                <Td><Input value={p.label} onChange={v => updatePreset(i, { label: v })} /></Td>
                <Td>
                  <select value={p.mode || 'fit'} onChange={e => updatePreset(i, { mode: e.target.value })}
                    style={{ padding: '0.25rem 0.4rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)' }}>
                    <option value="fit">fit (limita lado maior)</option>
                    <option value="cover">cover (recorta para WxH)</option>
                  </select>
                </Td>
                <Td><Input type="number" value={p.width ?? ''} onChange={v => updatePreset(i, { width: v === '' ? null : Number(v) })} style={{ width: 70 }} /></Td>
                <Td><Input type="number" value={p.height ?? ''} onChange={v => updatePreset(i, { height: v === '' ? null : Number(v) })} style={{ width: 70 }} /></Td>
                <Td><Input type="number" value={p.maxLongSide ?? ''} onChange={v => updatePreset(i, { maxLongSide: v === '' ? null : Number(v) })} style={{ width: 80 }} /></Td>
                <Td><Input type="number" value={p.quality ?? 85} onChange={v => updatePreset(i, { quality: Math.max(50, Math.min(95, Number(v) || 85)) })} style={{ width: 50 }} /></Td>
                <Td><button className="btn btn-sm btn-ghost" onClick={() => removePreset(i)}>✕</button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-sm btn-ghost" onClick={addPreset} style={{ marginTop: '0.4rem' }}>+ Adicionar preset</button>

      <div style={{ marginTop: '1.25rem' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar configuração de resoluções'}
        </button>
      </div>
    </section>
  )
}

function Th({ children }) {
  return <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.75rem' }}>{children}</th>
}

function Td({ children }) {
  return <td style={{ padding: '0.4rem 0.5rem' }}>{children}</td>
}

function Input({ value, onChange, type = 'text', style = {}, ariaLabel, ...rest }) {
  return (
    <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
      aria-label={ariaLabel || 'campo'}
      style={{
        padding: '0.35rem 0.55rem', background: 'var(--bg-input)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        color: 'var(--text)', fontSize: '0.82rem', ...style,
      }}
      {...rest} />
  )
}
