'use client'
// src/app/admin/configuracoes/ConfiguracoesLog.js

import { useState } from 'react'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'

export default function ConfiguracoesLog({ showMsg }) {
  const [logEntries, setLogEntries] = useState([])
  const [logLoading, setLogLoading] = useState(false)
  const [logFilter, setLogFilter] = useState('todos')
  const [logOpen, setLogOpen] = useState(false)
  const [clearingLog, setClearingLog] = useState(false)
  const { confirm, confirmDialog } = useConfirmDialog()

  async function loadLog() {
    setLogLoading(true)
    try {
      const res = await fetch('/api/pagamento/log?limit=500')
      const data = await res.json()
      setLogEntries(Array.isArray(data) ? data : [])
    } catch { showMsg('error', 'Erro ao carregar log.') }
    finally { setLogLoading(false) }
  }

  async function clearLog() {
    const accepted = await confirm({
      title: 'Limpar log de pagamento',
      message: 'Limpar todo o log de pagamento?',
      confirmText: 'Limpar log',
      cancelText: 'Cancelar',
      confirmTone: 'danger',
    })
    if (!accepted) return
    setClearingLog(true)
    try {
      await fetch('/api/pagamento/log', { method: 'DELETE' })
      setLogEntries([])
      showMsg('success', 'Log limpo com sucesso.')
    } catch { showMsg('error', 'Erro ao limpar log.') }
    finally { setClearingLog(false) }
  }

  function downloadLog() {
    const json = JSON.stringify(logEntries, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payment_log_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadLogCSV() {
    const cols = ['ts', 'level', 'event', 'gateway', 'metodo', 'pedidoId', 'chargeId', 'valor', 'status', 'erro', 'mensagem']
    const rows = logEntries.map(e =>
      cols.map(c => {
        const v = e[c] ?? ''
        return typeof v === 'string' && v.includes(',') ? `"${v}"` : v
      }).join(',')
    )
    const csv = [cols.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payment_log_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', gridColumn: '1 / -1' }}>
      {confirmDialog}
      {/* Cabeçalho colapsável */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => { setLogOpen(o => !o); if (!logOpen && logEntries.length === 0) loadLog() }}
      >
        <div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '0.2rem' }}>📋 Log de Pagamentos</h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
            Arquivos diarios em data/payment-logs, com compatibilidade para data/payment_log.json.
            <br />
            Histórico detalhado de todos os eventos de gateway — requisições, respostas, webhooks, erros.
          </p>
        </div>
        <span style={{ fontSize: '1.2rem', color: 'var(--text-dim)', flexShrink: 0, marginLeft: '1rem' }}>
          {logOpen ? '▲' : '▼'}
        </span>
      </div>

      {logOpen && (
        <div style={{ marginTop: '1.25rem' }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={loadLog} disabled={logLoading}>
              {logLoading ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Carregando...</> : '🔄 Atualizar'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={downloadLog} disabled={logEntries.length === 0} style={{ color: 'var(--accent)' }}>
              ⬇ JSON
            </button>
            <button className="btn btn-ghost btn-sm" onClick={downloadLogCSV} disabled={logEntries.length === 0} style={{ color: 'var(--accent)' }}>
              ⬇ CSV
            </button>
            <div style={{ flex: 1 }} />
            <select
              className="form-select"
              style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
              value={logFilter}
              onChange={e => setLogFilter(e.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="success">✅ Sucesso</option>
              <option value="error">❌ Erro</option>
              <option value="webhook">📡 Webhook</option>
              <option value="info">ℹ Info</option>
            </select>
            <button className="btn btn-danger btn-sm" onClick={clearLog} disabled={clearingLog || logEntries.length === 0}>
              {clearingLog ? '...' : '🗑 Limpar'}
            </button>
          </div>

          {/* Tabela de log */}
          {logEntries.length === 0 && !logLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              Nenhum evento registrado ainda. Os logs aparecem assim que houver atividade de pagamento.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: '520px', overflowY: 'auto', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 1 }}>
                    {['Data/Hora', 'Level', 'Evento', 'Gateway', 'Detalhe'].map(h => (
                      <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logEntries
                    .filter(e => logFilter === 'todos' || e.level === logFilter)
                    .map((entry, i) => {
                      const levelColors = {
                        success: { bg: '#1a3a2a', text: '#4ade80', label: '✅ sucesso' },
                        error:   { bg: '#3a1a1a', text: '#f87171', label: '❌ erro' },
                        webhook: { bg: '#1a2a3a', text: '#60a5fa', label: '📡 webhook' },
                        info:    { bg: 'transparent', text: 'var(--text-dim)', label: 'ℹ info' },
                      }
                      const lc = levelColors[entry.level] || levelColors.info

                      const detail = [
                        entry.pedidoId && `pedido: ${entry.pedidoId}`,
                        entry.chargeId && `charge: ${String(entry.chargeId).slice(0, 24)}`,
                        entry.valor != null && `R$ ${Number(entry.valor).toFixed(2)}`,
                        entry.status && `status: ${entry.status}`,
                        entry.metodo && `método: ${entry.metodo}`,
                        entry.endpoint && `→ ${entry.endpoint}`,
                        entry.httpStatus && `HTTP ${entry.httpStatus}`,
                        entry.erro && `⚠ ${entry.erro}`,
                        entry.mensagem && `⚠ ${entry.mensagem}`,
                        entry.fotosLiberadas != null && `fotos: ${entry.fotosLiberadas}`,
                        entry.customerId && `customer: ${entry.customerId}`,
                      ].filter(Boolean).join(' · ')

                      const ts = new Date(entry.ts)
                      const tsStr = ts.toLocaleDateString('pt-BR') + ' ' + ts.toLocaleTimeString('pt-BR')

                      return (
                        <tr
                          key={entry.id || i}
                          style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}
                          title={JSON.stringify(entry, null, 2)}
                        >
                          <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text-dim)', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                            {tsStr}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-block', padding: '0.15rem 0.45rem', borderRadius: '4px', background: lc.bg, color: lc.text, fontSize: '0.68rem', fontWeight: 600 }}>
                              {lc.label}
                            </span>
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text)', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                            {entry.event}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                            {entry.gateway || '—'}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-dim)', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={detail}>
                            {detail || '—'}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}

          <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.75rem' }}>
            O painel mostra os 500 registros mais recentes agregados por data.
            <br />
            💡 Passe o mouse sobre uma linha para ver todos os campos. Máximo de 500 entradas mantidas.
          </p>
        </div>
      )}
    </div>
  )
}
