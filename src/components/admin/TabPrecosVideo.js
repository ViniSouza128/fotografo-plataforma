'use client'
// src/components/admin/TabPrecosVideo.js
// Bloco para configurar descontos progressivos de vídeo do evento.
// Análogo aos de fotos, mas usa campos descontosVideo* separados.

import { useEffect, useMemo, useState } from 'react'
import { simulateProgressiveTable, detectIncoherentTiers } from '@/lib/pricing'

export default function TabPrecosVideo({ event, saveEvent, saving, showToast }) {
  const [globalRows, setGlobalRows] = useState([])
  const [globalAtivos, setGlobalAtivos] = useState(false)

  const [ativo, setAtivo] = useState(!!event.descontosVideoProgressivosAtivos)
  const [usarGlobal, setUsarGlobal] = useState(
    event.usarDescontosVideoGlobais === undefined
      ? !(Array.isArray(event.descontosVideoProgressivos) && event.descontosVideoProgressivos.length > 0)
      : !!event.usarDescontosVideoGlobais
  )
  const [descontos, setDescontos] = useState(
    Array.isArray(event.descontosVideoProgressivos) && event.descontosVideoProgressivos.length > 0
      ? event.descontosVideoProgressivos
      : [{ quantidade: 2, desconto: 10 }, { quantidade: 5, desconto: 20 }]
  )

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(cfg => {
      setGlobalRows(Array.isArray(cfg.descontosVideoGlobais) ? cfg.descontosVideoGlobais : [])
      setGlobalAtivos(!!cfg.descontosVideoGlobaisAtivos)
    }).catch(() => {})
  }, [])

  const precoBase = Number(event.precoVideoPadrao) || 0
  const effectiveTable = usarGlobal ? globalRows : descontos
  const effectiveAtivos = usarGlobal ? globalAtivos : ativo

  const incoherentSet = useMemo(
    () => detectIncoherentTiers({ precoBase, tabela: effectiveTable, ativos: true }),
    [precoBase, effectiveTable]
  )
  const simulatorRows = useMemo(
    () => simulateProgressiveTable({ precoBase, tabela: effectiveTable, ativos: effectiveAtivos }),
    [precoBase, effectiveTable, effectiveAtivos]
  )

  const isDirty = JSON.stringify({
    a: !!event.descontosVideoProgressivosAtivos,
    g: event.usarDescontosVideoGlobais === undefined
      ? !(Array.isArray(event.descontosVideoProgressivos) && event.descontosVideoProgressivos.length > 0)
      : !!event.usarDescontosVideoGlobais,
    d: normalize(event.descontosVideoProgressivos || []),
  }) !== JSON.stringify({
    a: !!ativo,
    g: !!usarGlobal,
    d: normalize(descontos),
  })

  function normalize(rows) {
    return rows
      .filter(r => r.quantidade !== '' && r.desconto !== '')
      .map(r => ({ quantidade: Number(r.quantidade), desconto: Number(r.desconto) }))
      .filter(r => Number.isFinite(r.quantidade) && Number.isFinite(r.desconto))
      .sort((a, b) => a.quantidade - b.quantidade)
  }

  function addRow() {
    setDescontos(prev => [...prev, { quantidade: '', desconto: '' }])
  }
  function removeRow(idx) {
    setDescontos(prev => prev.filter((_, i) => i !== idx))
  }
  function updateRow(idx, field, value) {
    setDescontos(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  function handleSave() {
    saveEvent({
      descontosVideoProgressivos: normalize(descontos),
      descontosVideoProgressivosAtivos: !!ativo,
      usarDescontosVideoGlobais: !!usarGlobal,
    }).then(() => showToast?.('Descontos de vídeo salvos.'))
      .catch(err => showToast?.(`Erro: ${err.message || err}`))
  }

  const cardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '1.5rem',
    marginTop: '1.5rem',
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', margin: 0 }}>🎬 Descontos progressivos para vídeos</h2>
        <Toggle label="ativos" checked={ativo} onChange={setAtivo} disabled={usarGlobal} />
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
        Descontos progressivos aplicados quando o cliente comprar <strong>vídeos</strong> deste álbum.
        Independe da tabela de fotos.
      </p>

      <Toggle label="Usar tabela global de descontos de vídeo (configurada em /admin/configuracoes)"
        checked={usarGlobal} onChange={setUsarGlobal} />

      {usarGlobal ? (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.65rem 0.85rem',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          fontSize: '0.82rem',
          color: 'var(--text-muted)',
        }}>
          {globalRows.length === 0
            ? 'Nenhuma tabela global configurada. Vá em /admin/configuracoes para definir.'
            : (
              <>
                <strong>Tabela global ({globalAtivos ? 'ativa' : 'inativa'}):</strong>
                <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
                  {[...globalRows].sort((a, b) => Number(a.quantidade) - Number(b.quantidade)).map((r, i) => (
                    <li key={i}>{r.quantidade}+ vídeos: {r.desconto}% off</li>
                  ))}
                </ul>
              </>
            )}
        </div>
      ) : (
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
            Tabela personalizada deste álbum (ordene por quantidade crescente, descontos crescentes):
          </p>
          {descontos.map((row, idx) => {
            const isIncoherent = incoherentSet.has(idx)
            return (
              <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 90px' }}>
                  {idx === 0 && <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.2rem' }}>A partir de</label>}
                  <input type="number" min="1" placeholder="Qtd" className="form-input"
                    value={row.quantidade}
                    onChange={e => updateRow(idx, 'quantidade', e.target.value)}
                    style={{ borderColor: isIncoherent ? 'var(--danger)' : undefined }} />
                </div>
                <div style={{ flex: '0 0 80px' }}>
                  {idx === 0 && <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.2rem' }}>Desconto %</label>}
                  <input type="number" min="0" max="100" placeholder="%" className="form-input"
                    value={row.desconto}
                    onChange={e => updateRow(idx, 'desconto', e.target.value)}
                    style={{ borderColor: isIncoherent ? 'var(--danger)' : undefined }} />
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRow(idx)}
                  style={{ color: 'var(--danger)' }}>🗑</button>
              </div>
            )
          })}
          <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}
            style={{ marginTop: '0.4rem' }}>+ Adicionar faixa</button>
        </div>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn ${isDirty ? 'btn-state-dirty' : 'btn-state-clean'}`}
          onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? '...' : 'Salvar descontos de vídeo'}
        </button>
        {precoBase > 0 && effectiveAtivos && simulatorRows.length > 0 && (
          <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
            Ex: 5 vídeos a R$ {precoBase.toFixed(2)} → R$ {(simulatorRows[4]?.total || (precoBase * 5)).toFixed(2)}
          </span>
        )}
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.85rem', opacity: disabled ? 0.5 : 1 }}>
      <input type="checkbox" checked={!!checked} disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: 'var(--accent)' }} />
      {label}
    </label>
  )
}
