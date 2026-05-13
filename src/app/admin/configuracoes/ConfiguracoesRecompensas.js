'use client'
// src/app/admin/configuracoes/ConfiguracoesRecompensas.js

import { useEffect, useState, useMemo } from 'react'

const PRESETS_BENEFICIO = [
  { id: 'desconto', label: '% Desconto no checkout', sufixo: '%' },
  { id: 'cashback', label: '% Cashback (vira saldo)', sufixo: '%' },
  { id: 'saldo',    label: 'R$ Saldo fixo por pedido pago', sufixo: 'R$' },
]

const ICONES_PRESET = ['🥉', '🥈', '🥇', '💎', '⭐', '🏅', '🎖️', '👑']
const CORES_PRESET = ['#cd7f32', '#c0c0c0', '#ffd700', '#5fb4e0', '#a78bfa', '#ec4899']

function emptyNivel() {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    nome: '',
    icon: '🥉',
    color: '#cd7f32',
    metaCompras: '',
    metaPedidos: '',
    beneficioTipo: 'desconto',
    beneficioValor: '',
  }
}

export default function ConfiguracoesRecompensas({ showMsg, readOnly = false }) {
  const [config, setConfig] = useState({ ativo: false, acumulacao: 'maior', niveis: [] })
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const currentSnapshot = useMemo(() => JSON.stringify(config), [config])
  const isDirty = Boolean(savedSnapshot) && currentSnapshot !== savedSnapshot

  useEffect(() => {
    let cancelled = false
    fetch('/api/rewards')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return
        const next = {
          ativo: !!data.ativo,
          acumulacao: data.acumulacao === 'soma' ? 'soma' : 'maior',
          niveis: Array.isArray(data.niveis) && data.niveis.length > 0
            ? data.niveis.map(n => ({
                id: n.id,
                nome: n.nome || '',
                icon: n.icon || '🥉',
                color: n.color || '#cd7f32',
                metaCompras: String(n.metaCompras ?? ''),
                metaPedidos: String(n.metaPedidos ?? ''),
                beneficioTipo: n.beneficioTipo || 'desconto',
                beneficioValor: String(n.beneficioValor ?? ''),
              }))
            : [],
        }
        setConfig(next)
        setSavedSnapshot(JSON.stringify(next))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function updateNivel(idx, patch) {
    setConfig(prev => ({
      ...prev,
      niveis: prev.niveis.map((n, i) => i === idx ? { ...n, ...patch } : n),
    }))
  }

  function addNivel() {
    setConfig(prev => ({ ...prev, niveis: [...prev.niveis, emptyNivel()] }))
  }

  function removeNivel(idx) {
    setConfig(prev => ({ ...prev, niveis: prev.niveis.filter((_, i) => i !== idx) }))
  }

  function moveNivel(idx, dir) {
    setConfig(prev => {
      const next = [...prev.niveis]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      const tmp = next[idx]
      next[idx] = next[target]
      next[target] = tmp
      return { ...prev, niveis: next }
    })
  }

  async function salvar() {
    if (readOnly) {
      showMsg?.('error', 'Only to super admin.')
      return
    }
    // Validação
    for (const n of config.niveis) {
      if (!n.nome.trim()) {
        showMsg?.('error', 'Cada nível precisa de um nome.')
        return
      }
      const valor = Number(n.beneficioValor)
      if (!Number.isFinite(valor) || valor < 0) {
        showMsg?.('error', `Nível "${n.nome}": valor de benefício inválido.`)
        return
      }
      if ((n.beneficioTipo === 'desconto' || n.beneficioTipo === 'cashback') && valor > 100) {
        showMsg?.('error', `Nível "${n.nome}": percentual não pode ser maior que 100.`)
        return
      }
    }
    setSaving(true)
    try {
      const payload = {
        ativo: !!config.ativo,
        acumulacao: config.acumulacao === 'soma' ? 'soma' : 'maior',
        niveis: config.niveis.map(n => ({
          id: n.id,
          nome: n.nome.trim(),
          icon: n.icon,
          color: n.color,
          metaCompras: Number(n.metaCompras) || 0,
          metaPedidos: Number(n.metaPedidos) || 0,
          beneficioTipo: n.beneficioTipo,
          beneficioValor: Number(n.beneficioValor) || 0,
        })),
      }
      const res = await fetch('/api/rewards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao salvar.')
      }
      showMsg?.('success', 'Configuração de recompensas salva!')
      setSavedSnapshot(currentSnapshot)
    } catch (err) {
      showMsg?.('error', err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
        <div className="spinner" style={{ width: '24px', height: '24px' }} />
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
      {readOnly && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Recompensas em modo leitura para Admin.
        </p>
      )}
      <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', margin: 0 }}>🎁 Cashback, saldo e níveis</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Sistema opcional de recompensas: níveis ganham desconto, cashback ou saldo fixo.
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.ativo}
            onChange={e => setConfig(p => ({ ...p, ativo: e.target.checked }))}
            style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }}
          />
          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: config.ativo ? 'var(--success)' : 'var(--text-muted)' }}>
            {config.ativo ? 'Ativo' : 'Desativado'}
          </span>
        </label>
      </div>

      {!config.ativo && (
        <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '0.82rem' }}>
          Sistema desativado: clientes não veem nem recebem recompensas. Ative para configurar.
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Modo de acumulação (entre níveis)</label>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {[
            { id: 'maior', label: 'Maior benefício', desc: 'Apenas o nível atingido mais alto vale.' },
            { id: 'soma',  label: 'Soma de níveis',  desc: 'Soma todos os níveis qualificados.' },
          ].map(o => (
            <button
              key={o.id}
              type="button"
              className={`btn btn-sm ${config.acumulacao === o.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setConfig(p => ({ ...p, acumulacao: o.id }))}
              title={o.desc}
              style={{ flex: 1 }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
          {config.acumulacao === 'soma'
            ? 'Cliente qualificado para Bronze (5%) + Prata (10%) recebe 15%.'
            : 'Cliente qualificado para Bronze (5%) + Prata (10%) recebe apenas 10% (mais alto).'}
        </p>
      </div>

      <div style={{ marginTop: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <strong style={{ fontSize: '0.9rem' }}>Níveis ({config.niveis.length})</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addNivel}>+ Adicionar nível</button>
        </div>

        {config.niveis.length === 0 && (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', padding: '1rem', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
            Nenhum nível configurado. Clique em &quot;+ Adicionar nível&quot; para começar.
          </p>
        )}

        {config.niveis.map((n, idx) => (
          <div key={n.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <span style={{ fontSize: '1.4rem' }}>{n.icon}</span>
              <input aria-label="Modo de acumulação (entre níveis)"
                type="text"
                className="form-input"
                value={n.nome}
                onChange={e => updateNivel(idx, { nome: e.target.value })}
                placeholder="Nome do nível (ex: Ouro)"
                maxLength={40}
                style={{ flex: 1 }}
              />
              <div style={{ display: 'flex', gap: '0.2rem' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveNivel(idx, -1)} disabled={idx === 0} title="Mover para cima">↑</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveNivel(idx, 1)} disabled={idx === config.niveis.length - 1} title="Mover para baixo">↓</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeNivel(idx)} style={{ color: 'var(--danger)' }} title="Remover">✕</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Ícone</label>
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {ICONES_PRESET.map(i => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => updateNivel(idx, { icon: i })}
                      style={{
                        width: '30px', height: '30px', borderRadius: '6px',
                        border: `1px solid ${n.icon === i ? 'var(--accent)' : 'var(--border)'}`,
                        background: n.icon === i ? 'var(--accent-dim)' : 'var(--bg-input)',
                        cursor: 'pointer', fontSize: '1rem',
                      }}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Cor</label>
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {CORES_PRESET.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateNivel(idx, { color: c })}
                      style={{
                        width: '30px', height: '30px', borderRadius: '6px',
                        border: `2px solid ${n.color === c ? '#fff' : 'var(--border)'}`,
                        background: c,
                        cursor: 'pointer',
                      }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  Meta de compras (R$)
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={n.metaCompras}
                  onChange={e => updateNivel(idx, { metaCompras: e.target.value })}
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  Meta de pedidos pagos
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={n.metaPedidos}
                  onChange={e => updateNivel(idx, { metaPedidos: e.target.value })}
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Tipo de benefício</label>
              <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                {PRESETS_BENEFICIO.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`btn btn-sm ${n.beneficioTipo === p.id ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => updateNivel(idx, { beneficioTipo: p.id })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input
                  type="number"
                  className="form-input"
                  value={n.beneficioValor}
                  onChange={e => updateNivel(idx, { beneficioValor: e.target.value })}
                  placeholder={n.beneficioTipo === 'saldo' ? 'Ex: 10.00' : 'Ex: 5'}
                  min="0"
                  max={n.beneficioTipo === 'saldo' ? undefined : 100}
                  step={n.beneficioTipo === 'saldo' ? '0.01' : '1'}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', minWidth: '30px' }}>
                  {PRESETS_BENEFICIO.find(p => p.id === n.beneficioTipo)?.sufixo}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className={`btn btn-full ${isDirty ? 'btn-primary' : 'btn-secondary'}`}
        onClick={salvar}
        disabled={saving || !isDirty}
        style={{ marginTop: '1rem' }}
      >
        {saving ? 'Salvando...' : (isDirty ? 'Salvar configurações' : 'Salvo')}
      </button>
      </fieldset>
    </div>
  )
}
