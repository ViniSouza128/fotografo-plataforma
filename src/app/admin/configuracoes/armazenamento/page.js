'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  adminFetchJson,
  adminFetchObject,
  getStoredAdminClient,
  isAdminAuthError,
  isAdminUnauthorizedError,
  redirectToAdminLogin,
} from '@/lib/adminFetch'

const GB = 1024 ** 3
const PRESETS = [
  { id: '0.5', label: '0.5 GB', value: 0.5 },
  { id: '5', label: '5 GB', value: 5 },
  { id: '10', label: '10 GB', value: 10 },
  { id: '50', label: '50 GB', value: 50 },
  { id: 'custom', label: 'Custom', value: null },
]

function clampPercent(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 100) return 100
  return n
}

function formatBytes(bytes) {
  const value = Number(bytes || 0)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let size = value
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  const decimals = index === 0 ? 0 : (size >= 10 ? 1 : 2)
  return `${size.toFixed(decimals).replace(/\.0+$/, '')} ${units[index]}`
}

function bytesToGb(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return ''
  return String(Math.round((value / GB) * 100) / 100)
}

function gbToBytes(gb) {
  const value = Number(gb)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * GB)
}

function statusLabel(status) {
  switch (status) {
    case 'warning': return 'Atenção'
    case 'block_videos': return 'Vídeos bloqueados'
    case 'block_photos': return 'Fotos e perfil bloqueados'
    case 'full': return 'Crítico'
    default: return 'OK'
  }
}

function statusColor(status) {
  if (status === 'full') return '#ef4444'
  if (status === 'block_photos') return '#f97316'
  if (status === 'block_videos') return '#f59e0b'
  if (status === 'warning') return '#eab308'
  return 'var(--success)'
}

function normalizePayload(data) {
  return {
    config: data?.config || { enabled: false, limitBytes: null },
    status: data?.status || {
      enabled: false,
      usedBytes: 0,
      limitBytes: null,
      remainingBytes: null,
      percentUsed: null,
      status: 'ok',
      thresholds: { video: 90, photo: 95, avatar: 95, other: 95 },
      warnings: [],
    },
  }
}

export default function AdminStorageQuotaPage() {
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [payload, setPayload] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [limitGb, setLimitGb] = useState('')
  const [preset, setPreset] = useState('custom')
  const [feedback, setFeedback] = useState(null)
  const [permissionError, setPermissionError] = useState('')

  const isSuperAdmin = !!me?.isSuperAdmin

  const loadQuota = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    else setRefreshing(true)
    setFeedback(null)
    try {
      const data = normalizePayload(await adminFetchObject('/api/admin/storage-quota'))
      setPayload(data)
      setEnabled(!!data.config.enabled)
      const currentGb = bytesToGb(data.config.limitBytes)
      setLimitGb(currentGb)
      const matchedPreset = PRESETS.find(item => item.value !== null && String(item.value) === currentGb)
      setPreset(matchedPreset?.id || 'custom')
      setPermissionError('')
      if (quiet) setFeedback({ type: 'success', text: 'Uso recalculado.' })
    } catch (error) {
      if (isAdminUnauthorizedError(error)) {
        redirectToAdminLogin()
        return
      }
      if (isAdminAuthError(error)) {
        setPermissionError(error.message || 'Acesso restrito a superadmin.')
      } else {
        setFeedback({ type: 'error', text: error.message || 'Erro ao carregar limite de armazenamento.' })
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const stored = getStoredAdminClient()
    setMe(stored)
    if (stored && !stored.isSuperAdmin) {
      setPayload(null)
      setEnabled(false)
      setLimitGb('')
      setPreset('custom')
      setPermissionError('')
      setLoading(false)
      return
    }
    loadQuota()
  }, [loadQuota])

  const status = payload?.status || null
  const config = payload?.config || null
  const canViewQuotaDetails = isSuperAdmin && !!payload
  const percent = status?.enabled ? clampPercent(status.percentUsed) : 0
  const progressColor = statusColor(status?.status)
  const limitBytes = useMemo(() => gbToBytes(limitGb), [limitGb])
  const canSave = !saving && isSuperAdmin && (!enabled || (limitBytes && limitBytes > 0))

  function applyPreset(id) {
    setPreset(id)
    const item = PRESETS.find(entry => entry.id === id)
    if (item?.value !== null && item?.value !== undefined) {
      setLimitGb(String(item.value))
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!isSuperAdmin) {
      setFeedback({ type: 'error', text: 'Apenas superadmin pode alterar o limite de armazenamento.' })
      return
    }
    const nextLimitBytes = gbToBytes(limitGb)
    if (enabled && (!nextLimitBytes || nextLimitBytes <= 0)) {
      setFeedback({ type: 'error', text: 'Informe um limite em GB maior que zero.' })
      return
    }

    setSaving(true)
    setFeedback(null)
    try {
      const data = normalizePayload(await adminFetchJson('/api/admin/storage-quota', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          limitBytes: enabled ? nextLimitBytes : null,
        }),
      }))
      setPayload(data)
      setEnabled(!!data.config.enabled)
      setLimitGb(bytesToGb(data.config.limitBytes))
      setFeedback({ type: 'success', text: 'Limite de armazenamento salvo.' })
    } catch (error) {
      if (isAdminUnauthorizedError(error)) {
        redirectToAdminLogin()
        return
      }
      if (isAdminAuthError(error)) {
        setPermissionError(error.message || 'Acesso restrito a superadmin.')
      } else {
        setFeedback({ type: 'error', text: error.message || 'Erro ao salvar limite.' })
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '60vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  if (permissionError) {
    return (
      <div style={{ maxWidth: '720px' }}>
        <Link href="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>← Dashboard</Link>
        <h1 className="admin-page-title" style={{ marginTop: '0.25rem' }}>Acesso restrito</h1>
        <div className="alert alert-error" style={{ marginTop: '1rem' }}>
          {permissionError}
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1040px' }}>
      <div className="admin-header">
        <div>
          <Link href="/admin/configuracoes" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>← Configurações</Link>
          <h1 className="admin-page-title" style={{ marginTop: '0.25rem' }}>Limite de armazenamento</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.35rem' }}>
            Controle a quota persistente da plataforma sem expor caminhos internos.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => loadQuota({ quiet: true })}
          disabled={refreshing || !isSuperAdmin}
        >
          {refreshing ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {!isSuperAdmin && (
        <div className="alert alert-info mb-3">
          Admin pode abrir esta area para entender que o recurso existe. Uso, limite e alteracoes ficam restritos ao superadmin.
        </div>
      )}

      {feedback && (
        <div className={`alert alert-${feedback.type === 'success' ? 'success' : 'error'} mb-3`}>
          {feedback.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
        <MetricCard label="Uso atual" value={canViewQuotaDetails ? formatBytes(status?.usedBytes) : 'Restrito ao superadmin'} />
        <MetricCard label="Limite definido" value={canViewQuotaDetails ? (status?.enabled ? formatBytes(status?.limitBytes) : 'Desativado') : 'Restrito ao superadmin'} />
        <MetricCard label="Espaço restante" value={canViewQuotaDetails ? (status?.enabled ? formatBytes(status?.remainingBytes) : 'Sem bloqueio') : 'Restrito ao superadmin'} />
        <MetricCard label="Percentual usado" value={canViewQuotaDetails ? (status?.enabled ? `${Number(status?.percentUsed || 0).toFixed(2)}%` : '—') : 'Restrito ao superadmin'} />
        <MetricCard label="Estado atual" value={canViewQuotaDetails ? statusLabel(status?.status) : 'Restrito'} accent={canViewQuotaDetails ? progressColor : undefined} />
      </div>

      <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.65rem' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', margin: 0 }}>Uso da quota</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
              A barra mostra quando cada tipo de upload passará a ser bloqueado.
            </p>
          </div>
          <strong style={{ color: progressColor, fontSize: '0.9rem' }}>{canViewQuotaDetails ? statusLabel(status?.status) : 'Restrito'}</strong>
        </div>

        <div style={{ position: 'relative', height: '16px', background: 'var(--bg-input)', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ width: `${percent}%`, height: '100%', background: progressColor, transition: 'width 0.25s ease' }} />
          <ThresholdMark left={90} label="90%" />
          <ThresholdMark left={95} label="95%" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.65rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <span>Abaixo de 90%: normal</span>
          <span>≥90%: vídeos bloqueados</span>
          <span>≥95%: fotos/avatar bloqueados</span>
          <span>≥100%: crítico</span>
        </div>
      </section>

      <form onSubmit={handleSave} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1rem' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', margin: 0 }}>Configuração</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginTop: '1rem', fontSize: '0.9rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} disabled={!isSuperAdmin} onChange={event => setEnabled(event.target.checked)} />
          Ativar limite de armazenamento
        </label>

        <div style={{ marginTop: '1rem' }}>
          <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Presets</span>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {PRESETS.map(item => (
              <button
                key={item.id}
                type="button"
                className={`btn btn-sm ${preset === item.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => applyPreset(item.id)}
                disabled={!enabled || !isSuperAdmin}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: 'block', marginTop: '1rem' }}>
          <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Limite em GB</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={limitGb}
            disabled={!enabled || !isSuperAdmin}
            onChange={event => {
              setPreset('custom')
              setLimitGb(event.target.value)
            }}
            style={{
              width: '220px',
              maxWidth: '100%',
              padding: '0.65rem 0.75rem',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
              fontSize: '0.9rem',
            }}
            placeholder="Ex.: 5"
          />
        </label>

        <div className="alert alert-info" style={{ marginTop: '1rem', lineHeight: 1.6 }}>
          <div>Vídeos são bloqueados ao atingir 90% do limite.</div>
          <div>Fotos de álbuns e perfil são bloqueadas ao atingir 95% do limite.</div>
          <div>O bloqueio é aplicado no servidor.</div>
        </div>

        {Array.isArray(status?.warnings) && status.warnings.length > 0 && (
          <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
            Alguns arquivos não puderam ser lidos no cálculo. O status foi calculado com os arquivos acessíveis.
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          {config?.updatedAt && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Última alteração: {new Date(config.updatedAt).toLocaleString('pt-BR')}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}

function MetricCard({ label, value, accent }) {
  return (
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <p className="stat-value" style={{ color: accent || 'var(--text)' }}>{value}</p>
    </div>
  )
}

function ThresholdMark({ left, label }) {
  return (
    <span
      title={label}
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: 0,
        bottom: 0,
        width: '2px',
        background: 'rgba(255,255,255,0.72)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.22)',
      }}
    />
  )
}
