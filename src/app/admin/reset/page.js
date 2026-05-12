'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'

const COUNTDOWN_SECONDS = 15

const RESET_CARDS = [
  {
    type: 'pedidos',
    title: 'Pedidos e financeiro',
    icon: '🧾',
    phrase: 'RESETAR PEDIDOS',
    description: 'Apaga histórico de pedidos, log de pagamentos e solicitações de remoção.',
    preserves: ['Eventos', 'Fotos', 'Clientes', 'Configurações'],
  },
  {
    type: 'carrinhos',
    title: 'Carrinhos abertos',
    icon: '🛒',
    phrase: 'RESETAR CARRINHOS',
    description: 'Esvazia carrinhos ativos de todos os clientes e remove pedidos em estado "carrinho".',
    preserves: ['Pedidos pagos', 'Eventos', 'Fotos', 'Configurações'],
  },
  {
    type: 'eventos',
    title: 'Eventos e fotos não compradas',
    icon: '📅',
    phrase: 'RESETAR EVENTOS',
    description: 'Remove todos os álbuns. Fotos comprovadamente vendidas em pedidos pagos são preservadas (desvinculadas do álbum, mantidas para download de quem comprou).',
    preserves: ['Pedidos pagos', 'Fotos compradas (preservadas)', 'Clientes', 'Configurações'],
  },
  {
    type: 'clientes',
    title: 'Contas de clientes',
    icon: '👥',
    phrase: 'RESETAR CLIENTES',
    description: 'Remove contas de clientes, comentários, avaliações e feedbacks. Contas administrativas são preservadas.',
    preserves: ['Pedidos', 'Eventos', 'Fotos', 'Configurações', 'Contas admin'],
  },
  {
    type: 'configs',
    title: 'Configurações do site',
    icon: '⚙️',
    phrase: 'RESETAR CONFIGURACOES',
    description: 'Restaura configurações do site (nome, contatos, dados empresariais) ao padrão. Credenciais de pagamento podem ser preservadas opcionalmente.',
    preserves: ['Pedidos', 'Eventos', 'Fotos', 'Clientes'],
    hasWipePagamento: true,
  },
  {
    type: 'tudo',
    title: 'Site inteiro',
    icon: '☢️',
    phrase: 'RESETAR SITE INTEIRO',
    description: 'Reset completo: eventos, fotos, pedidos, carrinhos, clientes (exceto admins), configurações. Equivale a uma fábrica.',
    preserves: ['Contas admin', 'Backups existentes', 'Log de auditoria'],
    extraDanger: true,
    hasWipePagamento: true,
  },
]

function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDateTime(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('pt-BR') } catch { return iso }
}

// ── Multi-step destructive action modal ───────────────────────────────────────
function ActionModal({ action, onClose, onComplete }) {
  const [step, setStep] = useState('review') // review → phrase → countdown → running → result
  const [typed, setTyped] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [wipePagamento, setWipePagamento] = useState(false)
  const [restoreScopes, setRestoreScopes] = useState({ data: true, originals: false, uploads: false })

  const cancelledRef = useRef(false)
  const timerRef = useRef(null)

  useEffect(() => {
    return () => {
      cancelledRef.current = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Phrase to type for confirmation
  const expectedPhrase = action.kind === 'reset'
    ? action.card.phrase
    : action.kind === 'restore'
      ? 'RESTAURAR'
      : action.kind === 'delete'
        ? 'EXCLUIR'
        : ''

  const phraseValid = typed.trim().toUpperCase() === expectedPhrase

  function startCountdown() {
    setStep('countdown')
    setSecondsLeft(COUNTDOWN_SECONDS)
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(timerRef.current)
          if (!cancelledRef.current) execute()
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  function cancelCountdown() {
    cancelledRef.current = true
    if (timerRef.current) clearInterval(timerRef.current)
    onClose()
  }

  async function execute() {
    setStep('running')
    setRunning(true)
    setError('')
    try {
      let res
      if (action.kind === 'reset') {
        res = await fetch('/api/admin/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: action.card.type,
            confirmation: expectedPhrase,
            wipePagamento: action.card.hasWipePagamento ? wipePagamento : false,
          }),
        })
      } else if (action.kind === 'restore') {
        const scopes = Object.entries(restoreScopes).filter(([k, v]) => v && action.backup.scopes.includes(k)).map(([k]) => k)
        res = await fetch(`/api/admin/backup/${encodeURIComponent(action.backup.id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmation: 'RESTAURAR', scopes }),
        })
      } else if (action.kind === 'delete') {
        res = await fetch(`/api/admin/backup/${encodeURIComponent(action.backup.id)}`, { method: 'DELETE' })
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Erro')
        setStep('error')
      } else {
        setResult(data)
        setStep('result')
        if (onComplete) onComplete()
      }
    } catch (e) {
      setError(e.message || 'Erro de rede')
      setStep('error')
    } finally {
      setRunning(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const isDanger = action.kind === 'reset' || action.kind === 'delete'
  const accentColor = isDanger ? '#ef4444' : 'var(--accent)'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
      onClick={step === 'countdown' || running ? undefined : onClose}
    >
      <div
        style={{
          background: 'var(--bg-card)', border: `1px solid ${isDanger ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)', padding: '1.75rem', maxWidth: '560px', width: '100%',
          maxHeight: '90vh', overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* STEP: review */}
        {step === 'review' && action.kind === 'reset' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>{action.card.icon}</span>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: 'var(--text)' }}>
                Reset: {action.card.title}
              </h2>
            </div>
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius)', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
              <p style={{ color: '#ef4444', fontSize: '0.85rem', lineHeight: 1.5, fontWeight: 500 }}>
                ⚠️ {action.card.description}
              </p>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>O que será preservado</p>
            <ul style={{ paddingLeft: '1.25rem', marginBottom: '1rem' }}>
              {action.card.preserves.map(p => (
                <li key={p} style={{ color: 'var(--text)', fontSize: '0.85rem', lineHeight: 1.7 }}>{p}</li>
              ))}
            </ul>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginBottom: '1rem', fontStyle: 'italic' }}>
              ℹ️ Um backup automático será criado antes de qualquer alteração.
            </p>
            {action.card.hasWipePagamento && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.7rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', marginBottom: '1rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={wipePagamento} onChange={e => setWipePagamento(e.target.checked)} style={{ marginTop: '0.2rem' }} />
                <span style={{ fontSize: '0.82rem', color: 'var(--text)' }}>
                  Apagar também credenciais de pagamento (Stripe, Asaas). Por padrão, são preservadas.
                </span>
              </label>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button
                className="btn"
                style={{ background: '#ef4444', color: '#fff', borderColor: '#ef4444' }}
                onClick={() => { setTyped(''); setStep('phrase') }}
              >
                Continuar
              </button>
            </div>
          </>
        )}

        {step === 'review' && action.kind === 'restore' && (
          <>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: 'var(--text)', marginBottom: '0.75rem' }}>
              ↻ Restaurar backup
            </h2>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>Backup</p>
              <p style={{ fontSize: '0.88rem', color: 'var(--text)', fontWeight: 500 }}>{action.backup.label || action.backup.id}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{formatDateTime(action.backup.createdAt)}</p>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Selecione o que restaurar:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {['data', 'originals', 'uploads'].map(scope => {
                const available = action.backup.scopes.includes(scope)
                const labels = { data: 'JSON (data/)', originals: 'Originais (storage/originals)', uploads: 'Derivados (public/uploads)' }
                return (
                  <label key={scope} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: available ? 1 : 0.4, cursor: available ? 'pointer' : 'not-allowed' }}>
                    <input
                      type="checkbox"
                      checked={!!restoreScopes[scope]}
                      disabled={!available}
                      onChange={e => setRestoreScopes(s => ({ ...s, [scope]: e.target.checked }))}
                    />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                      {labels[scope]} {!available && <span style={{ color: 'var(--text-dim)' }}>(não está no backup)</span>}
                    </span>
                  </label>
                )
              })}
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginBottom: '1rem', fontStyle: 'italic' }}>
              ℹ️ Será criado um backup do estado atual antes de restaurar.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => { setTyped(''); setStep('phrase') }}
                disabled={!Object.values(restoreScopes).some(v => v)}
              >
                Continuar
              </button>
            </div>
          </>
        )}

        {step === 'review' && action.kind === 'delete' && (
          <>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: 'var(--text)', marginBottom: '0.75rem' }}>
              🗑️ Excluir backup
            </h2>
            <p style={{ color: 'var(--text)', fontSize: '0.88rem', marginBottom: '1rem' }}>
              Excluir <strong>{action.backup.label || action.backup.id}</strong>?
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
              Os arquivos serão removidos permanentemente. Backups não podem ser recuperados.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button
                className="btn"
                style={{ background: '#ef4444', color: '#fff', borderColor: '#ef4444' }}
                onClick={() => { setTyped(''); setStep('phrase') }}
              >
                Continuar
              </button>
            </div>
          </>
        )}

        {/* STEP: phrase */}
        {step === 'phrase' && (
          <>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>
              Confirmação por frase
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '0.75rem' }}>
              Para evitar acidentes, digite a frase exata abaixo:
            </p>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius)', marginBottom: '0.75rem', textAlign: 'center' }}>
              <code style={{ fontSize: '1rem', color: accentColor, fontWeight: 700, letterSpacing: '0.05em' }}>{expectedPhrase}</code>
            </div>
            <input
              type="text"
              className="form-input"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder="Digite aqui…"
              autoFocus
              style={{
                fontFamily: 'monospace',
                marginBottom: '1rem',
                borderColor: phraseValid ? 'var(--accent)' : (typed.length > 0 ? '#ef4444' : 'var(--border)'),
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setStep('review')}>← Voltar</button>
              <button
                className="btn"
                style={{ background: phraseValid ? accentColor : 'var(--bg-secondary)', color: '#fff', borderColor: phraseValid ? accentColor : 'var(--border)' }}
                onClick={startCountdown}
                disabled={!phraseValid}
              >
                Confirmar
              </button>
            </div>
          </>
        )}

        {/* STEP: countdown */}
        {step === 'countdown' && (
          <>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--text)', marginBottom: '1rem', textAlign: 'center' }}>
              Executando em…
            </h2>
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{
                fontSize: '5rem', fontWeight: 700, color: accentColor,
                fontFamily: 'var(--font-heading)', lineHeight: 1,
              }}>
                {secondsLeft}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                Você ainda pode cancelar.
              </p>
            </div>
            <button
              onClick={cancelCountdown}
              style={{
                width: '100%', padding: '0.85rem', borderRadius: 'var(--radius)',
                background: 'var(--bg-secondary)', border: '2px solid var(--border)',
                color: 'var(--text)', fontSize: '0.95rem', fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              ✕ CANCELAR
            </button>
          </>
        )}

        {/* STEP: running */}
        {step === 'running' && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 1rem' }} />
            <p style={{ color: 'var(--text)', fontSize: '0.95rem' }}>Executando…</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.5rem' }}>
              Isso pode levar alguns segundos.
            </p>
          </div>
        )}

        {/* STEP: result */}
        {step === 'result' && result && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '3rem' }}>✅</span>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--success)', marginTop: '0.5rem' }}>
                Concluído
              </h2>
            </div>
            {result.preBackupId && (
              <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>Backup automático criado</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--success)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{result.preBackupId}</p>
              </div>
            )}
            {result.result && (
              <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius)', marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '0.4rem' }}>Resumo</p>
                <pre style={{ fontSize: '0.78rem', color: 'var(--text)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', overflow: 'auto', maxHeight: '200px' }}>
                  {JSON.stringify(result.result, null, 2)}
                </pre>
              </div>
            )}
            {result.restored && (
              <p style={{ color: 'var(--text)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                Restaurado: <strong>{result.restored.join(', ')}</strong>
              </p>
            )}
            <button className="btn btn-primary btn-full" onClick={onClose}>Fechar</button>
          </>
        )}

        {/* STEP: error */}
        {step === 'error' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '3rem' }}>❌</span>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--danger)', marginTop: '0.5rem' }}>
                Erro
              </h2>
            </div>
            <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>
            <button className="btn btn-primary btn-full" onClick={onClose}>Fechar</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ResetBackupPage() {
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [backups, setBackups] = useState([])
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createScopes, setCreateScopes] = useState({ data: true, originals: false, uploads: false })
  const [createLabel, setCreateLabel] = useState('')

  const [activeAction, setActiveAction] = useState(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado')
      const admin = raw ? JSON.parse(raw) : null
      setIsSuperAdmin(!!admin?.isSuperAdmin)
    } catch { setIsSuperAdmin(false) }
  }, [])

  const loadBackups = useCallback(async () => {
    setError('')
    try {
      const res = await fetch('/api/admin/backup')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao carregar')
      }
      const data = await res.json()
      setBackups(data.backups || [])
      setInfo(data.info || null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isSuperAdmin) loadBackups()
    else setLoading(false)
  }, [isSuperAdmin, loadBackups])

  async function handleCreateBackup() {
    const scopes = Object.entries(createScopes).filter(([, v]) => v).map(([k]) => k)
    if (scopes.length === 0) {
      setError('Selecione ao menos um escopo.')
      return
    }
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopes, label: createLabel.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro')
      setShowCreate(false)
      setCreateLabel('')
      await loadBackups()
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '60vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3.5rem' }}>🔒</div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', color: 'var(--text)' }}>Área exclusiva de super-admins</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', lineHeight: 1.6 }}>
          Backups e reset são restritos ao super-administrador.
        </p>
        <Link href="/admin" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>← Voltar ao Dashboard</Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 1rem 3rem' }}>
      {/* Header */}
      <div className="admin-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="admin-page-title">Backup e Reset</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Crie cópias de segurança, restaure dados e execute resets controlados.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* ── BACKUPS SECTION ───────────────────────────────────────────────── */}
      <section style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '2rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', color: 'var(--text)' }}>📦 Backups</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
              {info ? `${backups.length} backup${backups.length !== 1 ? 's' : ''} · ${formatBytes((info?.sizeBytes || 0))} em ${info?.path}` : ''}
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate(s => !s)}
          >
            {showCreate ? '✕ Cancelar' : '+ Criar backup'}
          </button>
        </div>

        {showCreate && (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>O que incluir:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={createScopes.data} onChange={e => setCreateScopes(s => ({ ...s, data: e.target.checked }))} />
                <span style={{ color: 'var(--text)', fontSize: '0.88rem' }}>Dados JSON (eventos, fotos, pedidos, clientes…) — rápido</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={createScopes.originals} onChange={e => setCreateScopes(s => ({ ...s, originals: e.target.checked }))} />
                <span style={{ color: 'var(--text)', fontSize: '0.88rem' }}>Imagens originais (<code style={{ fontSize: '0.78rem' }}>storage/originals</code>) — pode ser grande</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={createScopes.uploads} onChange={e => setCreateScopes(s => ({ ...s, uploads: e.target.checked }))} />
                <span style={{ color: 'var(--text)', fontSize: '0.88rem' }}>Imagens derivadas (<code style={{ fontSize: '0.78rem' }}>public/uploads</code>) — opcional</span>
              </label>
            </div>
            <input
              type="text"
              className="form-input"
              placeholder="Rótulo (opcional, ex: 'antes-da-migracao')"
              value={createLabel}
              onChange={e => setCreateLabel(e.target.value)}
              maxLength={100}
              style={{ marginBottom: '0.75rem' }}
            />
            <button
              className="btn btn-primary"
              disabled={creating || !Object.values(createScopes).some(v => v)}
              onClick={handleCreateBackup}
            >
              {creating ? '⏳ Criando…' : '💾 Criar backup agora'}
            </button>
          </div>
        )}

        {backups.length === 0 ? (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '2rem 1rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)' }}>Nenhum backup ainda.</p>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.5rem' }}>Crie seu primeiro backup antes de qualquer alteração importante.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {backups.map(b => {
              const isAuto = b.label && b.label.startsWith('auto-')
              const totalSize = Object.values(b.contents || {}).reduce((s, c) => s + (c.sizeBytes || 0), 0)
              const totalFiles = Object.values(b.contents || {}).reduce((s, c) => s + (c.fileCount || 0), 0)
              return (
                <div key={b.id} style={{
                  background: 'var(--bg-secondary)', borderRadius: 'var(--radius)',
                  padding: '0.85rem 1rem', display: 'flex', gap: '1rem',
                  alignItems: 'center', flexWrap: 'wrap',
                  borderLeft: isAuto ? '3px solid var(--text-dim)' : '3px solid var(--accent)',
                }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      <span style={{ color: 'var(--text)', fontSize: '0.88rem', fontWeight: 500 }}>
                        {b.label || b.id}
                      </span>
                      {isAuto && (
                        <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', background: 'var(--bg-input)', borderRadius: '99px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>auto</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      <span>{formatDateTime(b.createdAt)}</span>
                      <span>·</span>
                      <span>{(b.scopes || []).join(', ')}</span>
                      <span>·</span>
                      <span>{totalFiles} arq. · {formatBytes(totalSize)}</span>
                      {b.actor?.email && (<><span>·</span><span>{b.actor.email}</span></>)}
                    </div>
                    {b.reason && <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem', fontStyle: 'italic' }}>{b.reason}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setActiveAction({ kind: 'restore', backup: b })}
                      title="Restaurar este backup"
                    >
                      ↻ Restaurar
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setActiveAction({ kind: 'delete', backup: b })}
                      title="Excluir backup"
                      style={{ color: '#ef4444' }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── RESET SECTION ─────────────────────────────────────────────────── */}
      <section style={{
        background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 'var(--radius-lg)', padding: '1.5rem',
      }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', color: '#ef4444', marginBottom: '0.5rem' }}>
          ⚠️ Zona de reset
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          Operações destrutivas. Cada ação cria automaticamente um backup antes de alterar qualquer dado.
          Fotos vendidas em pedidos pagos são sempre preservadas.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.85rem' }}>
          {RESET_CARDS.map(card => (
            <div key={card.type} style={{
              background: 'var(--bg-secondary)',
              border: card.extraDanger ? '1px solid rgba(239,68,68,0.4)' : '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '1rem',
              display: 'flex', flexDirection: 'column', gap: '0.6rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.4rem' }}>{card.icon}</span>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: 'var(--text)' }}>{card.title}</h3>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.5, flex: 1 }}>
                {card.description}
              </p>
              <button
                onClick={() => setActiveAction({ kind: 'reset', card })}
                style={{
                  padding: '0.5rem 0.85rem', borderRadius: 'var(--radius)',
                  background: card.extraDanger ? '#ef4444' : 'rgba(239,68,68,0.15)',
                  color: card.extraDanger ? '#fff' : '#ef4444',
                  border: `1px solid ${card.extraDanger ? '#ef4444' : 'rgba(239,68,68,0.4)'}`,
                  fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  if (!card.extraDanger) e.currentTarget.style.background = 'rgba(239,68,68,0.28)'
                }}
                onMouseLeave={e => {
                  if (!card.extraDanger) e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
                }}
              >
                Resetar {card.title.toLowerCase()}
              </button>
            </div>
          ))}
        </div>
      </section>

      {activeAction && (
        <ActionModal
          action={activeAction}
          onClose={() => setActiveAction(null)}
          onComplete={loadBackups}
        />
      )}
    </div>
  )
}
