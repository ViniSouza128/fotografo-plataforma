'use client'

import { useState } from 'react'

function formatDate(value) {
  if (!value) return '-'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '-'
  return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR')
}

function actorLabel(actor) {
  if (!actor) return 'Sistema'
  return actor.nome || actor.email || actor.id || 'Usuario'
}

function targetLabel(target) {
  if (!target) return '-'
  return [target.type, target.label || target.publicId || target.id].filter(Boolean).join(': ')
}

export default function ConfiguracoesAuditoria({ showMsg }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('todos')

  async function loadAuditLog() {
    setLoading(true)
    try {
      const res = await fetch('/api/audit-log?limit=250')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erro ao carregar auditoria.')
      setEntries(Array.isArray(data.entries) ? data.entries : [])
    } catch (error) {
      showMsg('error', error.message || 'Erro ao carregar auditoria.')
    } finally {
      setLoading(false)
    }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = entries.filter(entry => statusFilter === 'todos' || entry.status === statusFilter)

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', gridColumn: '1 / -1' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none', gap: '1rem' }}
        onClick={() => { setOpen(o => !o); if (!open && entries.length === 0) loadAuditLog() }}
      >
        <div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '0.2rem' }}>Log de Auditoria</h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
            Acoes sensiveis do sistema sem senhas, tokens ou chaves de API.
          </p>
        </div>
        <span style={{ fontSize: '1.2rem', color: 'var(--text-dim)', flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {open && (
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={loadAuditLog} disabled={loading}>
              {loading ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Carregando...</> : 'Atualizar'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={downloadJson} disabled={entries.length === 0} style={{ color: 'var(--accent)' }}>
              JSON
            </button>
            <div style={{ flex: 1 }} />
            <select
              className="form-select"
              style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="success">Sucesso</option>
              <option value="failure">Falha</option>
              <option value="blocked">Bloqueado</option>
            </select>
          </div>

          {filtered.length === 0 && !loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              Nenhum evento de auditoria encontrado.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: '520px', overflowY: 'auto', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 1 }}>
                    {['Data/Hora', 'Status', 'Acao', 'Ator', 'Alvo', 'Detalhes'].map(header => (
                      <th key={header} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry, i) => {
                    const statusColor = entry.status === 'failure'
                      ? { bg: '#3a1a1a', color: '#f87171' }
                      : entry.status === 'blocked'
                        ? { bg: '#3a2a1a', color: '#fbbf24' }
                        : { bg: '#1a3a2a', color: '#4ade80' }
                    const detail = JSON.stringify(entry.details || {})
                    return (
                      <tr
                        key={entry.id || i}
                        style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}
                        title={JSON.stringify(entry, null, 2)}
                      >
                        <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text-dim)', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                          {formatDate(entry.createdAt)}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-block', padding: '0.15rem 0.45rem', borderRadius: 4, background: statusColor.bg, color: statusColor.color, fontSize: '0.68rem', fontWeight: 600 }}>
                            {entry.status || 'success'}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text)', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                          {entry.action}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                          {actorLabel(entry.actor)}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                          {targetLabel(entry.target)}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-dim)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={detail}>
                          {detail === '{}' ? '-' : detail}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.75rem' }}>
            Passe o mouse sobre uma linha para ver o registro completo. O arquivo local mantem ate 5000 entradas.
          </p>
        </div>
      )}
    </div>
  )
}
