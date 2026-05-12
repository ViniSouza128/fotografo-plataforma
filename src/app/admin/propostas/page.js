'use client'
// src/app/admin/propostas/page.js

import { useCallback, useEffect, useMemo, useState } from 'react'

const STATUS_META = {
  pendente:               { label: 'Pendente',                 color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  aceita:                 { label: 'Aceita',                   color: 'var(--success)', bg: 'rgba(34,197,94,0.15)' },
  rejeitada:              { label: 'Rejeitada',                color: 'var(--danger)',  bg: 'rgba(220,38,38,0.15)' },
  contraproposta:         { label: 'Contraproposta enviada',   color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  aceita_pelo_cliente:    { label: 'Cliente aceitou',          color: 'var(--success)', bg: 'rgba(34,197,94,0.15)' },
  rejeitada_pelo_cliente: { label: 'Cliente rejeitou',         color: 'var(--danger)',  bg: 'rgba(220,38,38,0.15)' },
  invalidada:             { label: 'Invalidada',               color: 'var(--text-muted)', bg: 'var(--bg-input)' },
  usada:                  { label: 'Usada em pedido',          color: 'var(--text-muted)', bg: 'var(--bg-input)' },
}

const STATUS_ATIVOS = ['pendente', 'contraproposta', 'aceita', 'aceita_pelo_cliente']

function formatBRL(v) { return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}` }

function formatRelative(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export default function AdminPropostasPage() {
  const [propostas, setPropostas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('ativos')
  const [actionModal, setActionModal] = useState(null) // { tipo, proposta, valor, mensagem }
  const [acting, setActing] = useState(false)
  const [propostasAtivo, setPropostasAtivo] = useState(false)
  const [savingToggle, setSavingToggle] = useState(false)
  const [msg, setMsg] = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [resPropostas, resCfg] = await Promise.all([
        fetch('/api/propostas'),
        fetch('/api/config'),
      ])
      const data = resPropostas.ok ? await resPropostas.json() : []
      setPropostas(Array.isArray(data) ? data : [])
      const cfg = resCfg.ok ? await resCfg.json() : {}
      setPropostasAtivo(!!cfg?.propostas?.ativo)
    } catch {
      setPropostas([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const filtered = useMemo(() => {
    if (filtro === 'todos') return propostas
    if (filtro === 'ativos') return propostas.filter(p => STATUS_ATIVOS.includes(p.status))
    return propostas.filter(p => p.status === filtro)
  }, [propostas, filtro])

  async function toggleAtivo(novo) {
    setSavingToggle(true)
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propostas: { ativo: novo } }),
      })
      if (!res.ok) throw new Error('Erro ao salvar.')
      setPropostasAtivo(novo)
      setMsg({ type: 'success', text: novo ? 'Recurso de propostas ativado.' : 'Recurso desativado.' })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setSavingToggle(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  function openAction(tipo, proposta) {
    setActionModal({ tipo, proposta, valor: '', mensagem: '' })
  }

  async function executeAction() {
    if (!actionModal) return
    const { tipo, proposta, valor, mensagem } = actionModal
    setActing(true)
    try {
      const body = { id: proposta.id, action: tipo }
      if (tipo === 'contraproposta') {
        const v = Number(valor)
        if (!Number.isFinite(v) || v <= 0) throw new Error('Valor da contraproposta inválido.')
        body.valor = v
        body.mensagem = mensagem
      } else if (tipo === 'rejeitar' && mensagem) {
        body.mensagem = mensagem
      }
      const res = await fetch('/api/propostas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao executar ação.')
      setActionModal(null)
      carregar()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
      setTimeout(() => setMsg(null), 4000)
    } finally {
      setActing(false)
    }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.7rem', margin: 0 }}>Propostas e contrapropostas</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            Negocie valores diretamente com clientes antes do checkout.
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.6rem 1rem' }}>
          <input
            type="checkbox"
            checked={propostasAtivo}
            onChange={e => toggleAtivo(e.target.checked)}
            disabled={savingToggle}
            style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }}
          />
          <span style={{ fontSize: '0.86rem', fontWeight: 600, color: propostasAtivo ? 'var(--success)' : 'var(--text-muted)' }}>
            {propostasAtivo ? 'Recurso ativado' : 'Recurso desativado'}
          </span>
        </label>
      </div>

      {msg && (
        <div className={`alert ${msg.type === 'success' ? 'alert-success' : 'alert-error'} mb-3`}>
          {msg.text}
        </div>
      )}

      {!propostasAtivo && (
        <div className="alert alert-warning mb-3">
          O recurso de propostas está <strong>desativado</strong>. Clientes não podem enviar novas propostas, mas as existentes continuam visíveis.
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { id: 'ativos',                 label: `Ativas (${propostas.filter(p => STATUS_ATIVOS.includes(p.status)).length})` },
          { id: 'todos',                  label: `Todas (${propostas.length})` },
          { id: 'pendente',               label: `Pendentes (${propostas.filter(p => p.status === 'pendente').length})` },
          { id: 'contraproposta',         label: `Contrapropostas (${propostas.filter(p => p.status === 'contraproposta').length})` },
          { id: 'aceita',                 label: `Aceitas (${propostas.filter(p => p.status === 'aceita').length})` },
          { id: 'aceita_pelo_cliente',    label: `Cliente aceitou (${propostas.filter(p => p.status === 'aceita_pelo_cliente').length})` },
          { id: 'rejeitada',              label: `Rejeitadas (${propostas.filter(p => p.status === 'rejeitada').length})` },
          { id: 'invalidada',             label: `Invalidadas (${propostas.filter(p => p.status === 'invalidada').length})` },
          { id: 'usada',                  label: `Usadas (${propostas.filter(p => p.status === 'usada').length})` },
        ].map(b => (
          <button
            key={b.id}
            className={`btn btn-sm ${filtro === b.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltro(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>💬</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Nenhuma proposta nesta categoria.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map(p => {
            const meta = STATUS_META[p.status] || { label: p.status, color: 'var(--text)', bg: 'var(--bg-input)' }
            const isAdminCanAct = ['pendente'].includes(p.status)
            const valorAtual = p.status === 'aceita' ? p.valorPropostoCliente
              : p.status === 'aceita_pelo_cliente' ? p.valorContraproposta
              : p.status === 'contraproposta' ? p.valorContraproposta
              : p.valorPropostoCliente

            return (
              <div key={p.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.2rem 1.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                  <div style={{ flex: 1, minWidth: '240px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.95rem' }}>{p.clientNome || 'Cliente'}</strong>
                      <span style={{ background: meta.bg, color: meta.color, padding: '0.15rem 0.55rem', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>{meta.label}</span>
                    </div>
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                      {p.items?.length || 0} foto(s) · Subtotal original: <strong>{formatBRL(p.subtotalOriginal)}</strong> · {formatRelative(p.criadoEm)}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)' }}>Valor atual</p>
                    <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1.3rem', color: 'var(--accent)' }}>
                      {formatBRL(valorAtual)}
                    </p>
                  </div>
                </div>

                {/* Detalhes da negociacao */}
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', fontSize: '0.84rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span>Cliente propôs: <strong style={{ color: 'var(--accent)' }}>{formatBRL(p.valorPropostoCliente)}</strong></span>
                    {p.valorContraproposta != null && (
                      <span>Admin contrapôs: <strong style={{ color: '#a78bfa' }}>{formatBRL(p.valorContraproposta)}</strong></span>
                    )}
                  </div>
                  {p.mensagemCliente && (
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)', borderLeft: '2px solid var(--border)', paddingLeft: '0.6rem' }}>
                      <em>Cliente:</em> &quot;{p.mensagemCliente}&quot;
                    </p>
                  )}
                  {p.mensagemAdmin && (
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)', borderLeft: '2px solid #a78bfa', paddingLeft: '0.6rem' }}>
                      <em>Admin:</em> &quot;{p.mensagemAdmin}&quot;
                    </p>
                  )}
                </div>

                {/* Acoes */}
                {isAdminCanAct && (
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-primary" onClick={() => openAction('aceitar', p)}>✓ Aceitar proposta</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => openAction('contraproposta', p)}>↩ Contraproposta</button>
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => openAction('rejeitar', p)}>✕ Rejeitar</button>
                  </div>
                )}

                {p.status === 'contraproposta' && (
                  <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                    Aguardando resposta do cliente à contraproposta.
                  </p>
                )}
                {p.status === 'aceita' && (
                  <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--success)' }}>
                    O cliente pode finalizar o pedido com este valor enquanto o carrinho não mudar.
                  </p>
                )}
                {p.status === 'usada' && p.pedidoId && (
                  <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    Convertida em pedido <code>{String(p.pedidoId).slice(0, 8)}</code>.
                  </p>
                )}
                {p.invalidacaoMotivo && (
                  <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    Invalidada — motivo: {p.invalidacaoMotivo === 'carrinho_mudou' ? 'carrinho do cliente foi alterado' : p.invalidacaoMotivo}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de ação */}
      {actionModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => !acting && setActionModal(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', maxWidth: '460px', width: '100%', padding: '1.75rem' }}
          >
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginTop: 0, marginBottom: '0.5rem' }}>
              {actionModal.tipo === 'aceitar' && 'Aceitar proposta'}
              {actionModal.tipo === 'rejeitar' && 'Rejeitar proposta'}
              {actionModal.tipo === 'contraproposta' && 'Enviar contraproposta'}
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {actionModal.tipo === 'aceitar' && `Aceitar ${formatBRL(actionModal.proposta.valorPropostoCliente)}? O cliente poderá finalizar o pedido com este valor.`}
              {actionModal.tipo === 'rejeitar' && 'Rejeitar a proposta encerra a negociação.'}
              {actionModal.tipo === 'contraproposta' && 'Envie um valor alternativo. O cliente decide se aceita.'}
            </p>

            {actionModal.tipo === 'contraproposta' && (
              <div className="form-group">
                <label className="form-label">Valor da contraproposta (R$)</label>
                <input
                  type="number"
                  className="form-input"
                  value={actionModal.valor}
                  onChange={e => setActionModal({ ...actionModal, valor: e.target.value })}
                  placeholder="Ex: 65.00"
                  min="0"
                  step="0.01"
                  autoFocus
                />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                  Subtotal original: {formatBRL(actionModal.proposta.subtotalOriginal)} · Cliente propôs: {formatBRL(actionModal.proposta.valorPropostoCliente)}
                </span>
              </div>
            )}

            {(actionModal.tipo === 'rejeitar' || actionModal.tipo === 'contraproposta') && (
              <div className="form-group">
                <label className="form-label">
                  Mensagem ao cliente {actionModal.tipo === 'contraproposta' ? '(opcional)' : '(opcional)'}
                </label>
                <textarea
                  className="form-input"
                  value={actionModal.mensagem}
                  onChange={e => setActionModal({ ...actionModal, mensagem: e.target.value })}
                  rows={3}
                  maxLength={500}
                  placeholder="Explicação para o cliente..."
                  style={{ resize: 'vertical' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn-ghost" onClick={() => setActionModal(null)} disabled={acting}>Cancelar</button>
              <button
                className={`btn ${actionModal.tipo === 'rejeitar' ? 'btn-danger' : 'btn-primary'}`}
                onClick={executeAction}
                disabled={acting || (actionModal.tipo === 'contraproposta' && !actionModal.valor)}
              >
                {acting ? '...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
