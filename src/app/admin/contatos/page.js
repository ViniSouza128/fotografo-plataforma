'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildWhatsAppHref, formatarWhatsApp } from '@/lib/whatsapp'

const statusOptions = [
  { value: 'novo', label: 'Novo' },
  { value: 'em_atendimento', label: 'Em atendimento' },
  { value: 'resolvido', label: 'Resolvido' },
  { value: 'arquivado', label: 'Arquivado' },
]

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('pt-BR')
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  let data = null
  try {
    data = await response.json()
  } catch {}
  return { response, data }
}

export default function AdminContatosPage() {
  const [contatos, setContatos] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [savingId, setSavingId] = useState('')
  const [notes, setNotes] = useState({})

  async function carregar() {
    setLoading(true)
    setErro('')
    try {
      const { response, data } = await requestJson('/api/contato')
      if (!response.ok) {
        setErro(data?.error || 'Nao foi possivel carregar contatos.')
        setContatos([])
        return
      }
      const items = Array.isArray(data) ? data : []
      setContatos(items)
      setNotes(Object.fromEntries(items.map(item => [item.id, item.adminNote || ''])))
    } catch {
      setErro('Erro de conexao ao carregar contatos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const filtrados = useMemo(() => {
    const term = busca.trim().toLowerCase()
    return contatos.filter(item => {
      if (statusFiltro !== 'todos' && item.status !== statusFiltro) return false
      if (!term) return true
      return [item.nome, item.email, item.whatsapp, item.assunto, item.mensagem]
        .some(value => String(value || '').toLowerCase().includes(term))
    })
  }, [busca, contatos, statusFiltro])

  async function atualizar(item, status = item.status) {
    setSavingId(item.id)
    setErro('')
    try {
      const { response, data } = await requestJson('/api/contato', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          status,
          adminNote: notes[item.id] || '',
        }),
      })
      if (!response.ok) {
        setErro(data?.error || 'Nao foi possivel atualizar contato.')
        return
      }
      setContatos(prev => prev.map(current => current.id === item.id ? data : current))
    } catch {
      setErro('Erro de conexao ao atualizar contato.')
    } finally {
      setSavingId('')
    }
  }

  const novos = contatos.filter(item => item.status === 'novo').length

  return (
    <div>
      <div className="admin-header" style={{ alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <p style={{ color: 'var(--accent)', fontSize: '0.78rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
            Atendimento
          </p>
          <h1>Contatos</h1>
          <p style={{ color: 'var(--text-muted)' }}>{novos} novo(s) de {contatos.length} mensagem(ns).</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={carregar} disabled={loading}>
          Atualizar
        </button>
      </div>

      <div className="admin-contact-toolbar">
        <input
          className="form-input"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, contato, assunto ou mensagem"
        />
        <select aria-label="Filtrar por status" className="form-select" value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}>
          <option value="todos">Todos os status</option>
          {statusOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {erro ? (
        <div style={{
          padding: '0.85rem 1rem',
          borderRadius: 'var(--radius)',
          border: '1px solid rgba(217,108,108,0.35)',
          background: 'var(--danger-dim)',
          color: 'var(--danger)',
          marginBottom: '1rem',
        }}>
          {erro}
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Carregando contatos...</p>
      ) : filtrados.length === 0 ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-card)', padding: '1.5rem', color: 'var(--text-muted)' }}>
          Nenhuma mensagem encontrada.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {filtrados.map(item => {
            const whatsHref = buildWhatsAppHref(item.whatsapp)
            return (
              <article key={item.id} style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                background: 'var(--bg-card)',
                padding: '1.25rem',
              }}>
                <div className="admin-contact-card-head">
                  <div>
                    <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{item.assunto}</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {item.nome} - {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <select aria-label="Status do contato" className="form-select" style={{ width: '190px' }} value={item.status || 'novo'} onChange={e => atualizar(item, e.target.value)} disabled={savingId === item.id}>
                    {statusOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text)', marginBottom: '1rem' }}>{item.mensagem}</p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
                  {item.email ? <a href={`mailto:${item.email}`} style={{ color: 'var(--accent)' }}>{item.email}</a> : null}
                  {whatsHref ? <a href={whatsHref} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{formatarWhatsApp(item.whatsapp)}</a> : null}
                </div>

                <label className="form-label" htmlFor={`note-${item.id}`}>Nota interna</label>
                <textarea aria-label="Nota interna"
                  id={`note-${item.id}`}
                  className="form-textarea"
                  value={notes[item.id] || ''}
                  onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                  style={{ minHeight: '84px', marginTop: '0.4rem' }}
                />
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => atualizar(item)} disabled={savingId === item.id} style={{ marginTop: '0.75rem' }}>
                  {savingId === item.id ? 'Salvando...' : 'Salvar nota'}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
