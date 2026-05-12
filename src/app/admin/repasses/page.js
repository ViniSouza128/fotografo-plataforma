'use client'
// src/app/admin/repasses/page.js
// Admin: vê e registra repasses; Colaborador: só vê os próprios.

import { useCallback, useEffect, useState } from 'react'

function formatBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function RepassesPage() {
  const [me, setMe] = useState(null)
  const [stats, setStats] = useState([])
  const [historico, setHistorico] = useState([])
  const [config, setConfig] = useState({ percentualPadrao: 70, carenciaDias: 7 })
  const [loading, setLoading] = useState(true)
  const [pagandoFor, setPagandoFor] = useState(null)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado')
      const parsed = raw ? JSON.parse(raw) : null
      setMe(parsed)
    } catch { setMe(null) }
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [resStats, resHist] = await Promise.all([
        fetch('/api/repasses'),
        fetch('/api/repasses?listar=1'),
      ])
      const ds = resStats.ok ? await resStats.json() : { stats: [], configPadrao: {} }
      const dh = resHist.ok ? await resHist.json() : []
      setStats(Array.isArray(ds.stats) ? ds.stats : [])
      setConfig(ds.configPadrao || { percentualPadrao: 70, carenciaDias: 7 })
      setHistorico(Array.isArray(dh) ? dh : [])
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const isFullAdmin = !!(me?.isAdmin && !me?.isColaborador)

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '40vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '960px' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', margin: 0 }}>Repasses</h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {isFullAdmin
            ? 'Saldo pendente por colaborador, com base nas vendas atribuídas a cada um.'
            : 'Saldo a receber pelos seus álbuns vendidos.'}
        </p>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          Padrão: {config.percentualPadrao}% · carência conversão saldo cliente: {config.carenciaDias} dias
        </p>
      </div>

      {feedback && (
        <div style={{
          padding: '0.65rem 0.9rem', marginBottom: '0.75rem',
          background: feedback.type === 'error' ? 'rgba(220,38,38,0.15)' : 'rgba(34,197,94,0.12)',
          border: `1px solid ${feedback.type === 'error' ? 'rgba(220,38,38,0.4)' : 'rgba(34,197,94,0.4)'}`,
          color: feedback.type === 'error' ? '#fca5a5' : '#86efac',
          borderRadius: 'var(--radius)', fontSize: '0.85rem',
        }}>
          {feedback.text}
        </div>
      )}

      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', marginTop: '1.5rem' }}>
        {isFullAdmin ? 'Por colaborador' : 'Seu saldo'}
      </h2>

      {stats.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Nenhuma venda atribuída ainda.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {stats.map(s => (
            <div key={s.colaboradorId} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '1rem',
              display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{s.colaboradorNome}</div>
                <div style={{ marginTop: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Vendido (bruto): {formatBRL(s.totalBruto)} · {s.fotosVendidas} fotos · {s.percentualUsado}%
                </div>
                <div style={{ marginTop: '0.15rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Total devido: {formatBRL(s.totalColaborador)} · Pago: {formatBRL(s.totalPago)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Saldo pendente</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: s.saldoPendente > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {formatBRL(s.saldoPendente)}
                </div>
                {isFullAdmin && s.saldoPendente > 0 && (
                  <button className="btn btn-primary btn-sm" style={{ marginTop: '0.4rem' }} onClick={() => setPagandoFor(s)}>
                    Registrar pagamento
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', marginTop: '2rem' }}>Histórico</h2>
      {historico.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum pagamento registrado.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <Th>Data</Th>
                <Th>Colaborador</Th>
                <Th>Tipo</Th>
                <Th>Método</Th>
                <Th>Valor</Th>
                <Th>Obs</Th>
              </tr>
            </thead>
            <tbody>
              {historico.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <Td>{formatData(r.criadoEm)}</Td>
                  <Td>{stats.find(s => s.colaboradorId === r.colaboradorId)?.colaboradorNome || r.colaboradorId.slice(0, 8)}</Td>
                  <Td>{r.status === 'convertido_saldo_cliente' ? 'Saldo cliente' : 'Pago'}</Td>
                  <Td>{r.metodo || '—'}</Td>
                  <Td style={{ fontWeight: 600 }}>{formatBRL(r.valor)}</Td>
                  <Td>{r.observacao || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagandoFor && (
        <PagamentoModal
          colaborador={pagandoFor}
          carenciaPadrao={config.carenciaDias}
          onClose={() => setPagandoFor(null)}
          onDone={(msg) => {
            setPagandoFor(null)
            setFeedback({ type: 'success', text: msg || 'Pagamento registrado.' })
            carregar()
          }}
          onError={(err) => setFeedback({ type: 'error', text: err })}
        />
      )}
    </div>
  )
}

function Th({ children }) {
  return <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.78rem' }}>{children}</th>
}
function Td({ children, ...rest }) {
  return <td style={{ padding: '0.5rem 0.6rem', color: 'var(--text)' }} {...rest}>{children}</td>
}

function PagamentoModal({ colaborador, carenciaPadrao, onClose, onDone, onError }) {
  const [valor, setValor] = useState(String(colaborador.saldoPendente))
  const [metodo, setMetodo] = useState('pix')
  const [observacao, setObservacao] = useState('')
  const [tipo, setTipo] = useState('pago')
  const [conversaoClienteId, setConversaoClienteId] = useState('')
  const [carencia, setCarencia] = useState(carenciaPadrao || 0)
  const [enviando, setEnviando] = useState(false)
  const [clientes, setClientes] = useState([])

  useEffect(() => {
    if (tipo !== 'convertido_saldo_cliente') return
    fetch('/api/clients').then(r => r.ok ? r.json() : []).then(d => {
      const arr = Array.isArray(d) ? d.filter(c => !c.isAdmin && !c.isColaborador) : []
      setClientes(arr)
    }).catch(() => {})
  }, [tipo])

  async function submit() {
    const v = Number(valor)
    if (!Number.isFinite(v) || v <= 0) {
      onError('Valor inválido.')
      return
    }
    if (v > colaborador.saldoPendente + 0.001) {
      onError(`Maior que saldo pendente (${colaborador.saldoPendente.toFixed(2)}).`)
      return
    }
    if (tipo === 'convertido_saldo_cliente' && !conversaoClienteId) {
      onError('Selecione o cliente que receberá o saldo.')
      return
    }
    setEnviando(true)
    try {
      const res = await fetch('/api/repasses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colaboradorId: colaborador.colaboradorId,
          valor: v, metodo, observacao, tipo,
          conversaoClienteId: tipo === 'convertido_saldo_cliente' ? conversaoClienteId : null,
          carenciaDias: tipo === 'convertido_saldo_cliente' ? Number(carencia || 0) : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        onError(data.error || 'Erro ao registrar.')
        return
      }
      onDone(tipo === 'convertido_saldo_cliente' ? 'Repasse convertido em saldo de cliente.' : 'Pagamento registrado.')
    } catch {
      onError('Erro de rede.')
    } finally { setEnviando(false) }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '1.5rem',
        maxWidth: '460px', width: '100%',
      }}>
        <h3 style={{ margin: '0 0 0.5rem', fontFamily: 'var(--font-heading)' }}>
          Registrar pagamento
        </h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Para: <strong>{colaborador.colaboradorNome}</strong> · Saldo pendente: {Number(colaborador.saldoPendente).toFixed(2)}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Tipo</label>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
              <button type="button" className={`btn btn-sm ${tipo === 'pago' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTipo('pago')}>
                Pagamento direto
              </button>
              <button type="button" className={`btn btn-sm ${tipo === 'convertido_saldo_cliente' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTipo('convertido_saldo_cliente')}>
                Converter em saldo cliente
              </button>
            </div>
          </div>

          <Field label="Valor*" type="number" min="0.01" step="0.01" value={valor} onChange={setValor} />
          <Field label="Método" value={metodo} onChange={setMetodo} placeholder="pix, dinheiro, transferência..." />
          {tipo === 'convertido_saldo_cliente' && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Cliente que receberá saldo*</span>
                <select value={conversaoClienteId} onChange={e => setConversaoClienteId(e.target.value)} style={{
                  padding: '0.55rem 0.7rem', background: 'var(--bg-input)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  color: 'var(--text)', fontSize: '0.88rem',
                }}>
                  <option value="">Selecione...</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nomeCompleto} ({c.email})</option>
                  ))}
                </select>
              </label>
              <Field label={`Carência (dias até disponibilizar)`} type="number" min="0" value={carencia} onChange={setCarencia} />
            </>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Observação</span>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              rows={2}
              maxLength={500}
              style={{
                padding: '0.55rem 0.7rem', background: 'var(--bg-input)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                color: 'var(--text)', fontSize: '0.85rem', resize: 'vertical',
              }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={enviando}>
            {enviando ? '...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', ...rest }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '0.55rem 0.7rem', background: 'var(--bg-input)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          color: 'var(--text)', fontSize: '0.88rem',
        }}
        {...rest}
      />
    </label>
  )
}
