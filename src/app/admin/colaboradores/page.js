'use client'
// src/app/admin/colaboradores/page.js
// Super-admin: gestão de colaboradores

import { useCallback, useEffect, useState } from 'react'
import {
  adminFetchArray,
  clearAdminSession,
  getCurrentReturnTo,
  getStoredAdminClient,
  isAdminUnauthorizedError,
  redirectToAdminLogin,
} from '@/lib/adminFetch'

export default function AdminColaboradoresPage() {
  const [authorized, setAuthorized] = useState(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [createData, setCreateData] = useState({ nomeCompleto: '', email: '', whatsapp: '', percentualRepasse: '' })
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editData, setEditData] = useState({})
  const [feedback, setFeedback] = useState(null)
  const [revealedSenha, setRevealedSenha] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const parsed = getStoredAdminClient()
    setAuthorized(!!parsed)
    setIsSuperAdmin(!!parsed?.isSuperAdmin)
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const data = await adminFetchArray('/api/colaboradores?summary=1')
      setList(data)
    } catch (error) {
      setList([])
      if (isAdminUnauthorizedError(error)) {
        setErro('Sessao expirada. Redirecionando para o login...')
        clearAdminSession()
        redirectToAdminLogin(getCurrentReturnTo())
        return
      }
      setErro(error?.message || 'Erro ao carregar colaboradores.')
    }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (authorized) carregar()
  }, [authorized, carregar])

  async function handleCreate(e) {
    e.preventDefault()
    if (!isSuperAdmin) return
    if (!createData.nomeCompleto || !createData.email || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/colaboradores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeCompleto: createData.nomeCompleto,
          email: createData.email,
          whatsapp: createData.whatsapp,
          percentualRepasse: createData.percentualRepasse === '' ? null : Number(createData.percentualRepasse),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'Erro ao criar.' })
        return
      }
      setRevealedSenha({ id: data.id, email: data.email, senhaTemporaria: data.senhaTemporaria, nome: data.nomeCompleto })
      setShowCreate(false)
      setCreateData({ nomeCompleto: '', email: '', whatsapp: '', percentualRepasse: '' })
      await carregar()
    } catch {
      setFeedback({ type: 'error', text: 'Erro de rede.' })
    } finally { setCreating(false) }
  }

  async function saveEdit() {
    if (!isSuperAdmin) return
    if (!editing) return
    try {
      const body = { id: editing.id, ...editData }
      const res = await fetch('/api/colaboradores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'Erro.' })
        return
      }
      if (data.senhaTemporaria) {
        setRevealedSenha({ id: data.id, email: data.email, senhaTemporaria: data.senhaTemporaria, nome: data.nomeCompleto })
      } else {
        setFeedback({ type: 'success', text: 'Atualizado.' })
      }
      setEditing(null); setEditData({})
      await carregar()
    } catch {
      setFeedback({ type: 'error', text: 'Erro de rede.' })
    }
  }

  async function toggleAtivo(item) {
    if (!isSuperAdmin) return
    if (!confirm(`Tem certeza que quer ${item.ativo ? 'desativar' : 'ativar'} ${item.nomeCompleto}?`)) return
    try {
      await fetch('/api/colaboradores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, ativo: !item.ativo }),
      })
      await carregar()
    } catch {}
  }

  if (authorized === null) return null
  if (authorized === false) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)' }}>Acesso restrito</h1>
        <p style={{ color: 'var(--text-muted)' }}>Esta área é exclusiva para super admin.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', margin: 0 }}>Colaboradores</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Crie e gerencie fotógrafos com acesso parcial.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)} disabled={!isSuperAdmin}>+ Novo colaborador</button>
      </div>

      {!isSuperAdmin && (
        <div className="alert alert-info" style={{ marginBottom: '0.75rem' }}>
          ðŸ‘ï¸ Admin pode visualizar colaboradores. CriaÃ§Ã£o, ediÃ§Ã£o, ativaÃ§Ã£o e senhas temporÃ¡rias ficam only to super admin.
        </div>
      )}

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

      {erro ? (
        <div className="empty-state">
          <h2 className="empty-state-title">Nao foi possivel carregar colaboradores</h2>
          <p>{erro}</p>
          <button className="btn btn-ghost btn-sm" onClick={carregar}>Tentar novamente</button>
        </div>
      ) : loading ? (
        <div className="flex-center" style={{ minHeight: '20vh' }}>
          <div className="spinner" style={{ width: '32px', height: '32px' }} />
        </div>
      ) : list.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>🧑‍🤝‍🧑</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Nenhum colaborador cadastrado.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {list.map(item => (
            <div key={item.id} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '1rem', display: 'grid',
              gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'center',
            }}>
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{item.nomeCompleto}</span>
                  <span style={{
                    fontSize: '0.65rem', padding: '0.05rem 0.4rem', borderRadius: '100px',
                    background: item.ativo ? 'rgba(34,197,94,0.18)' : 'rgba(220,38,38,0.18)',
                    color: item.ativo ? '#86efac' : '#fca5a5',
                  }}>{item.ativo ? 'ATIVO' : 'INATIVO'}</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.email}</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  Repasse: {item.percentualRepasse != null ? `${item.percentualRepasse}%` : 'padrão'} ·
                  Álbuns: {item.summary?.totalEventos || 0} ·
                  Fotos: {item.summary?.totalFotos || 0}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="btn btn-ghost btn-sm" disabled={!isSuperAdmin} onClick={() => {
                  setEditing(item)
                  setEditData({ nomeCompleto: item.nomeCompleto, percentualRepasse: item.percentualRepasse ?? '' })
                }}>Editar</button>
                <button className="btn btn-ghost btn-sm" disabled={!isSuperAdmin} onClick={() => toggleAtivo(item)}>
                  {item.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Novo colaborador">
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Field label="Nome completo*" value={createData.nomeCompleto} onChange={v => setCreateData(s => ({ ...s, nomeCompleto: v }))} required />
            <Field label="Email*" type="email" value={createData.email} onChange={v => setCreateData(s => ({ ...s, email: v }))} required />
            <Field label="WhatsApp" value={createData.whatsapp} onChange={v => setCreateData(s => ({ ...s, whatsapp: v }))} />
            <Field label="% de repasse (opcional)" type="number" min="0" max="100" value={createData.percentualRepasse} onChange={v => setCreateData(s => ({ ...s, percentualRepasse: v }))} placeholder="Em branco usa padrão da config" />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? '...' : 'Criar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal onClose={() => { setEditing(null); setEditData({}) }} title={`Editar: ${editing.nomeCompleto}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Field label="Nome completo" value={editData.nomeCompleto || ''} onChange={v => setEditData(s => ({ ...s, nomeCompleto: v }))} />
            <Field label="% de repasse (em branco = padrão)" type="number" min="0" max="100" value={editData.percentualRepasse ?? ''} onChange={v => setEditData(s => ({ ...s, percentualRepasse: v === '' ? null : Number(v) }))} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
              if (confirm('Resetar a senha deste colaborador? Ele será forçado a trocar no próximo login.')) {
                setEditData(s => ({ ...s, resetPassword: true }))
              }
            }}>
              {editData.resetPassword ? '✓ Senha será resetada' : 'Resetar senha'}
            </button>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setEditData({}) }}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={saveEdit}>Salvar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Senha temporária revelada */}
      {revealedSenha && (
        <Modal onClose={() => setRevealedSenha(null)} title="Senha temporária">
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              Anote ou copie. Ela não será mostrada novamente.
            </p>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem' }}>{revealedSenha.email}</p>
            <code style={{
              display: 'inline-block', padding: '0.6rem 1rem', background: 'var(--bg-input)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '1.1rem',
              fontFamily: 'monospace', letterSpacing: '0.05em', userSelect: 'all',
            }}>{revealedSenha.senhaTemporaria}</code>
            <p style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              O colaborador será obrigado a trocar a senha no primeiro login.
            </p>
            <div style={{ marginTop: '1rem' }}>
              <button className="btn btn-primary" onClick={() => {
                navigator.clipboard?.writeText(revealedSenha.senhaTemporaria).catch(() => {})
                setRevealedSenha(null)
              }}>Copiar e fechar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ children, title, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '1.5rem',
        maxWidth: '440px', width: '100%',
      }}>
        <h3 style={{ margin: '0 0 1rem', fontFamily: 'var(--font-heading)', fontSize: '1.1rem' }}>{title}</h3>
        {children}
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
