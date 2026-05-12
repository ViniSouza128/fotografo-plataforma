'use client'
// src/app/admin/cupons/page.js

import { useCallback, useEffect, useMemo, useState } from 'react'

const STATUS_META = {
  ativo:     { label: 'Ativo',     color: 'var(--success)',  bg: 'rgba(34, 197, 94, 0.15)' },
  suspenso:  { label: 'Suspenso',  color: 'var(--text-muted)', bg: 'var(--bg-input)' },
  expirado:  { label: 'Expirado',  color: 'var(--danger)',   bg: 'rgba(220, 38, 38, 0.15)' },
  agendado:  { label: 'Agendado',  color: '#f59e0b',         bg: 'rgba(245, 158, 11, 0.15)' },
  esgotado:  { label: 'Esgotado',  color: 'var(--danger)',   bg: 'rgba(220, 38, 38, 0.15)' },
}

function emptyForm() {
  return {
    id: null,
    codigo: '',
    descricao: '',
    tipo: 'percentual',
    valor: '',
    tiers: [],
    tiersAtivos: false,
    tiersTipo: 'subtotal',
    minSubtotal: '',
    minQuantidade: '',
    validoDe: '',
    validoAte: '',
    limitePorUsuario: '',
    limiteTotal: '',
    albuns: [],
    ativo: true,
  }
}

function formatBRL(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`
}

function toLocalInputDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  // YYYY-MM-DDTHH:MM (local)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInputDate(s) {
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function AdminCuponsPage() {
  const [cupons, setCupons] = useState([])
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [resCupons, resEvents] = await Promise.all([
        fetch('/api/cupons'),
        fetch('/api/events'),
      ])
      const data = resCupons.ok ? await resCupons.json() : []
      setCupons(Array.isArray(data) ? data : [])
      const evData = resEvents.ok ? await resEvents.json() : []
      setEventos(Array.isArray(evData) ? evData : [])
    } catch {
      setCupons([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const filtered = useMemo(() => {
    if (filtroStatus === 'todos') return cupons
    return cupons.filter(c => c.status === filtroStatus)
  }, [cupons, filtroStatus])

  function openCreate() {
    setForm(emptyForm())
    setError('')
    setShowModal(true)
  }

  function openEdit(cupom) {
    setForm({
      id: cupom.id,
      codigo: cupom.codigo || '',
      descricao: cupom.descricao || '',
      tipo: cupom.tipo || 'percentual',
      valor: String(cupom.valor || ''),
      tiers: Array.isArray(cupom.tiers) ? cupom.tiers.map(t => ({ min: String(t.min ?? ''), valor: String(t.valor ?? '') })) : [],
      tiersAtivos: !!cupom.tiersAtivos,
      tiersTipo: cupom.tiersTipo || 'subtotal',
      minSubtotal: String(cupom.minSubtotal || ''),
      minQuantidade: String(cupom.minQuantidade || ''),
      validoDe: toLocalInputDate(cupom.validoDe),
      validoAte: toLocalInputDate(cupom.validoAte),
      limitePorUsuario: cupom.limitePorUsuario != null ? String(cupom.limitePorUsuario) : '',
      limiteTotal: cupom.limiteTotal != null ? String(cupom.limiteTotal) : '',
      albuns: Array.isArray(cupom.albuns) ? cupom.albuns : [],
      ativo: cupom.ativo !== false,
    })
    setError('')
    setShowModal(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!form.codigo.trim()) { setError('Informe o código.'); return }
    const valorNum = Number(form.valor)
    if (!Number.isFinite(valorNum) || valorNum <= 0) { setError('Valor de desconto inválido.'); return }
    if (form.tipo === 'percentual' && valorNum > 100) { setError('Percentual não pode ser maior que 100.'); return }

    setSaving(true)
    try {
      const payload = {
        codigo: form.codigo,
        descricao: form.descricao,
        tipo: form.tipo,
        valor: valorNum,
        tiers: form.tiers
          .map(t => ({ min: Number(t.min) || 0, valor: Number(t.valor) || 0 }))
          .filter(t => t.valor > 0),
        tiersAtivos: form.tiersAtivos && form.tiers.length > 0,
        tiersTipo: form.tiersTipo,
        minSubtotal: form.minSubtotal ? Number(form.minSubtotal) : 0,
        minQuantidade: form.minQuantidade ? Number(form.minQuantidade) : 0,
        validoDe: fromLocalInputDate(form.validoDe),
        validoAte: fromLocalInputDate(form.validoAte),
        limitePorUsuario: form.limitePorUsuario ? Number(form.limitePorUsuario) : null,
        limiteTotal: form.limiteTotal ? Number(form.limiteTotal) : null,
        albuns: form.albuns,
        ativo: form.ativo,
      }
      const url = '/api/cupons'
      const method = form.id ? 'PATCH' : 'POST'
      const body = form.id ? { ...payload, id: form.id } : payload

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar.')
      setShowModal(false)
      carregar()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleAtivo(cupom) {
    try {
      await fetch('/api/cupons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cupom.id, ativo: !cupom.ativo }),
      })
      carregar()
    } catch {}
  }

  async function handleDelete(cupom) {
    if (!confirm(`Excluir o cupom "${cupom.codigo}"? Esta ação não pode ser desfeita.`)) return
    try {
      await fetch(`/api/cupons?id=${cupom.id}`, { method: 'DELETE' })
      carregar()
    } catch {}
  }

  function addTier() {
    setForm(p => ({ ...p, tiers: [...p.tiers, { min: '', valor: '' }] }))
  }
  function updateTier(idx, field, value) {
    setForm(p => ({
      ...p,
      tiers: p.tiers.map((t, i) => i === idx ? { ...t, [field]: value } : t),
    }))
  }
  function removeTier(idx) {
    setForm(p => ({ ...p, tiers: p.tiers.filter((_, i) => i !== idx) }))
  }
  function toggleAlbum(eventId) {
    setForm(p => ({
      ...p,
      albuns: p.albuns.includes(eventId)
        ? p.albuns.filter(x => x !== eventId)
        : [...p.albuns, eventId],
    }))
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '40vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.7rem', margin: 0 }}>Cupons de desconto</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            {cupons.length} cupom{cupons.length !== 1 ? 's' : ''} cadastrado{cupons.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Criar cupom</button>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { id: 'todos',    label: `Todos (${cupons.length})` },
          { id: 'ativo',    label: `Ativos (${cupons.filter(c => c.status === 'ativo').length})` },
          { id: 'suspenso', label: `Suspensos (${cupons.filter(c => c.status === 'suspenso').length})` },
          { id: 'expirado', label: `Expirados (${cupons.filter(c => c.status === 'expirado').length})` },
          { id: 'agendado', label: `Agendados (${cupons.filter(c => c.status === 'agendado').length})` },
          { id: 'esgotado', label: `Esgotados (${cupons.filter(c => c.status === 'esgotado').length})` },
        ].map(b => (
          <button
            key={b.id}
            className={`btn btn-sm ${filtroStatus === b.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltroStatus(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>🎟️</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
            {cupons.length === 0 ? 'Nenhum cupom criado. Clique em "Criar cupom" para começar.' : 'Nenhum cupom com este status.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {filtered.map(c => {
            const meta = STATUS_META[c.status] || STATUS_META.ativo
            const valorLabel = c.tipo === 'percentual' ? `${c.valor}%` : formatBRL(c.valor)
            const albunsLabel = (c.albuns || []).length === 0 ? 'Todos os álbuns' : `${c.albuns.length} álbum(s)`
            return (
              <div key={c.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '240px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em' }}>{c.codigo}</span>
                      <span style={{ background: meta.bg, color: meta.color, padding: '0.15rem 0.55rem', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>{meta.label}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text)', background: 'var(--bg-input)', padding: '0.15rem 0.55rem', borderRadius: '100px', fontWeight: 600 }}>
                        {c.tipo === 'percentual' ? '%' : 'R$'} {valorLabel}
                      </span>
                    </div>
                    {c.descricao && <p style={{ margin: '0.4rem 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>{c.descricao}</p>}
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap', fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                      <span>📅 {c.validoDe ? new Date(c.validoDe).toLocaleDateString('pt-BR') : '∞'} → {c.validoAte ? new Date(c.validoAte).toLocaleDateString('pt-BR') : '∞'}</span>
                      <span>🎯 {albunsLabel}</span>
                      <span>👤 {c.totalUsado || 0}{c.limiteTotal ? `/${c.limiteTotal}` : ''} uso(s)</span>
                      {c.minSubtotal > 0 && <span>💰 mín. {formatBRL(c.minSubtotal)}</span>}
                      {c.minQuantidade > 0 && <span>📦 mín. {c.minQuantidade} foto(s)</span>}
                      {c.tiersAtivos && c.tiers?.length > 0 && <span>📊 {c.tiers.length} faixa(s)</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => toggleAtivo(c)} title={c.ativo ? 'Suspender' : 'Reativar'}>
                      {c.ativo ? '⏸ Suspender' : '▶ Reativar'}
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(c)}>Editar</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(c)} style={{ color: 'var(--danger)' }} title="Excluir">🗑</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => !saving && setShowModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '2rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', margin: 0 }}>
                {form.id ? 'Editar cupom' : 'Novo cupom'}
              </h2>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm" disabled={saving}>✕</button>
            </div>

            {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Código *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={form.codigo}
                    onChange={e => setForm(p => ({ ...p, codigo: e.target.value.toUpperCase().replace(/\s+/g, '') }))}
                    placeholder="Ex: BLACK2024"
                    style={{ fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    maxLength={40}
                    required
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Descrição (uso interno)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={form.descricao}
                    onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                    placeholder="Ex: Black Friday 2024"
                    maxLength={200}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tipo de desconto *</label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {['percentual', 'fixo'].map(t => (
                      <button
                        key={t}
                        type="button"
                        className={`btn btn-sm ${form.tipo === t ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setForm(p => ({ ...p, tipo: t }))}
                      >
                        {t === 'percentual' ? '% Percentual' : 'R$ Valor fixo'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Valor base *</label>
                  <input
                    type="number"
                    className="form-input"
                    value={form.valor}
                    onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
                    placeholder={form.tipo === 'percentual' ? 'Ex: 10' : 'Ex: 25.00'}
                    step={form.tipo === 'percentual' ? '1' : '0.01'}
                    min="0"
                    max={form.tipo === 'percentual' ? '100' : undefined}
                    required
                  />
                </div>
              </div>

              {/* Tiers */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.tiersAtivos} onChange={e => setForm(p => ({ ...p, tiersAtivos: e.target.checked }))} style={{ accentColor: 'var(--accent)' }} />
                  <strong style={{ fontSize: '0.88rem' }}>Faixas escalonadas</strong>
                </label>
                <p style={{ margin: '0 0 0.6rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Quando ativo, o desconto varia conforme o {form.tiersTipo === 'quantidade' ? 'número de fotos' : 'subtotal'}. Faixa com maior limite vale.
                </p>
                {form.tiersAtivos && (
                  <>
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                      {['subtotal', 'quantidade'].map(t => (
                        <button
                          key={t}
                          type="button"
                          className={`btn btn-sm ${form.tiersTipo === t ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setForm(p => ({ ...p, tiersTipo: t }))}
                        >
                          Por {t === 'subtotal' ? 'subtotal (R$)' : 'quantidade'}
                        </button>
                      ))}
                    </div>
                    {form.tiers.map((t, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', marginBottom: '0.4rem' }}>
                        <input
                          type="number"
                          className="form-input"
                          value={t.min}
                          onChange={e => updateTier(idx, 'min', e.target.value)}
                          placeholder={form.tiersTipo === 'subtotal' ? 'Subtotal mín. (R$)' : 'Qtd mínima'}
                          min="0"
                          step={form.tiersTipo === 'subtotal' ? '0.01' : '1'}
                        />
                        <input
                          type="number"
                          className="form-input"
                          value={t.valor}
                          onChange={e => updateTier(idx, 'valor', e.target.value)}
                          placeholder={form.tipo === 'percentual' ? 'Desconto %' : 'Desconto R$'}
                          min="0"
                          step={form.tipo === 'percentual' ? '1' : '0.01'}
                          max={form.tipo === 'percentual' ? '100' : undefined}
                        />
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeTier(idx)} style={{ color: 'var(--danger)' }}>✕</button>
                      </div>
                    ))}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={addTier}>+ Adicionar faixa</button>
                  </>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Subtotal mínimo (R$)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={form.minSubtotal}
                    onChange={e => setForm(p => ({ ...p, minSubtotal: e.target.value }))}
                    placeholder="0 = sem mínimo"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Quantidade mínima</label>
                  <input
                    type="number"
                    className="form-input"
                    value={form.minQuantidade}
                    onChange={e => setForm(p => ({ ...p, minQuantidade: e.target.value }))}
                    placeholder="0 = sem mínimo"
                    min="0"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Válido a partir de</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={form.validoDe}
                    onChange={e => setForm(p => ({ ...p, validoDe: e.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Válido até</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={form.validoAte}
                    onChange={e => setForm(p => ({ ...p, validoAte: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Limite por usuário</label>
                  <input
                    type="number"
                    className="form-input"
                    value={form.limitePorUsuario}
                    onChange={e => setForm(p => ({ ...p, limitePorUsuario: e.target.value }))}
                    placeholder="Vazio = ilimitado"
                    min="1"
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Limite total de usos</label>
                  <input
                    type="number"
                    className="form-input"
                    value={form.limiteTotal}
                    onChange={e => setForm(p => ({ ...p, limiteTotal: e.target.value }))}
                    placeholder="Vazio = ilimitado"
                    min="1"
                  />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Álbuns aplicáveis</label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
                  {form.albuns.length === 0 ? 'Vazio = vale para todos os álbuns (cupom global).' : `${form.albuns.length} selecionado(s).`}
                </p>
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.5rem' }}>
                  {eventos.length === 0 ? (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0, padding: '0.5rem' }}>Nenhum álbum cadastrado.</p>
                  ) : (
                    eventos.map(ev => (
                      <label key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem', cursor: 'pointer', borderRadius: 'var(--radius)' }}>
                        <input
                          type="checkbox"
                          checked={form.albuns.includes(ev.id)}
                          onChange={() => toggleAlbum(ev.id)}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        <span style={{ fontSize: '0.85rem' }}>{ev.name || ev.id}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={e => setForm(p => ({ ...p, ativo: e.target.checked }))}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span style={{ fontSize: '0.88rem' }}>Cupom ativo</span>
              </label>

              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : (form.id ? 'Salvar alterações' : 'Criar cupom')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
