'use client'
// src/app/admin/configuracoes/storage/page.js
// Painel completo de storage externo: configuração, teste, migração e instruções.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const PROVIDERS = [
  { id: 'r2', label: 'Cloudflare R2', endpointHint: 'https://<accountid>.r2.cloudflarestorage.com', region: 'auto', pathStyle: false,
    note: 'Recomendado: zero egress, R$ ~0,08/GB armazenado, CDN incluso via Cloudflare.' },
  { id: 's3', label: 'AWS S3', endpointHint: 'https://s3.<regiao>.amazonaws.com', region: 'us-east-1', pathStyle: false,
    note: 'Mais maduro. Egress pago (~R$ 0,45/GB nos EUA).' },
  { id: 'b2', label: 'Backblaze B2', endpointHint: 'https://s3.<regiao>.backblazeb2.com', region: 'us-west-002', pathStyle: false,
    note: 'Barato (~R$ 0,03/GB). Egress até 3x do storage grátis. Compatível S3.' },
  { id: 'minio', label: 'MinIO (self-hosted)', endpointHint: 'https://meu-minio.exemplo.com', region: 'us-east-1', pathStyle: true,
    note: 'Para hospedar no próprio servidor / NAS. PathStyle ON.' },
  { id: 'custom', label: 'Outro S3-compatível', endpointHint: 'https://...', region: 'auto', pathStyle: false,
    note: 'Wasabi, Scaleway, DigitalOcean Spaces, Idrive E2 etc.' },
]

export default function AdminStoragePage() {
  const [me, setMe] = useState(null)
  const [config, setConfig] = useState(null)
  const [editing, setEditing] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [migrating, setMigrating] = useState(false)
  const [migrationStatus, setMigrationStatus] = useState(null)
  const [showInstructions, setShowInstructions] = useState(true)
  const pollRef = useRef(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado')
      setMe(raw ? JSON.parse(raw) : null)
    } catch {}
  }, [])

  const carregar = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/storage/config'),
        fetch('/api/storage/migrate'),
      ])
      if (r1.ok) {
        const data = await r1.json()
        setConfig(data)
        setEditing(prev => prev || { ...data })
      }
      if (r2.ok) setMigrationStatus(await r2.json())
    } catch {}
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const isSuperAdmin = !!me?.isSuperAdmin

  // Polling do status enquanto migrando
  useEffect(() => {
    if (!migrationStatus?.running) {
      clearInterval(pollRef.current); return
    }
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/storage/migrate')
        if (res.ok) setMigrationStatus(await res.json())
      } catch {}
    }, 2000)
    return () => clearInterval(pollRef.current)
  }, [migrationStatus?.running])

  function applyProviderTemplate(providerId) {
    const tpl = PROVIDERS.find(p => p.id === providerId)
    if (!tpl) return
    setEditing(prev => ({ ...prev, provider: tpl.id, region: tpl.region, pathStyle: tpl.pathStyle }))
  }

  async function handleSave() {
    if (!isSuperAdmin) {
      setFeedback({ type: 'error', text: 'Apenas super-admin pode salvar.' }); return
    }
    try {
      // Não envia secrets ainda mascarados — limpa para preservar valor antigo
      const payload = { ...editing }
      if (payload.accessKeyId === '••••••') delete payload.accessKeyId
      if (payload.secretAccessKey === '••••••') delete payload.secretAccessKey

      const res = await fetch('/api/storage/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'Erro ao salvar.' }); return
      }
      setConfig(data)
      setEditing({ ...data })
      setFeedback({ type: 'success', text: 'Configuração salva.' })
    } catch {
      setFeedback({ type: 'error', text: 'Erro de rede.' })
    }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null)
    try {
      const res = await fetch('/api/storage/test', { method: 'POST' })
      const data = await res.json()
      setTestResult(data)
    } catch (e) {
      setTestResult({ ok: false, reason: 'Erro de rede.' })
    } finally { setTesting(false) }
  }

  async function handleMigrate(opts = {}) {
    if (!confirm(`Iniciar migração local → bucket?\n\nIsso copia todos os arquivos de storage/originals e public/uploads. Operação idempotente (pula arquivos já no bucket).`)) return
    setMigrating(true)
    try {
      const res = await fetch('/api/storage/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'Erro ao iniciar migração.' }); return
      }
      setFeedback({ type: 'success', text: 'Migração iniciada em background. Acompanhe o progresso abaixo.' })
      // Force polling
      const status = await fetch('/api/storage/migrate').then(r => r.json()).catch(() => null)
      if (status) setMigrationStatus(status)
    } catch {
      setFeedback({ type: 'error', text: 'Erro de rede.' })
    } finally { setMigrating(false) }
  }

  if (!editing) {
    return <div style={{ padding: '2rem' }}>Carregando…</div>
  }

  const ativo = !!editing.ativo
  const dirty = JSON.stringify(editing) !== JSON.stringify(config)
  const providerHint = PROVIDERS.find(p => p.id === editing.provider) || PROVIDERS[0]
  const status = migrationStatus || {}
  const pct = status.totalDescobertos > 0
    ? Math.round((status.totalEnviados / status.totalDescobertos) * 100)
    : 0

  return (
    <div style={{ maxWidth: '960px' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <Link href="/admin/configuracoes" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'none' }}>← Configurações</Link>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', margin: '0.2rem 0 0' }}>☁️ Armazenamento externo (S3 / R2)</h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Mova originais e derivadas para um bucket compatível com S3. Reduz uso de disco local
          e habilita CDN para entregar miniaturas mais rápido.
        </p>
      </div>

      {feedback && (
        <div style={{
          padding: '0.65rem 0.9rem', marginBottom: '0.75rem',
          background: feedback.type === 'error' ? 'rgba(220,38,38,0.15)' : 'rgba(34,197,94,0.12)',
          border: `1px solid ${feedback.type === 'error' ? 'rgba(220,38,38,0.4)' : 'rgba(34,197,94,0.4)'}`,
          color: feedback.type === 'error' ? '#fca5a5' : '#86efac',
          borderRadius: 'var(--radius)', fontSize: '0.85rem',
        }}>{feedback.text}</div>
      )}

      <Section title="📋 Status atual">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1rem', fontSize: '0.85rem' }}>
          <Field label="Storage externo" value={config?.ativo ? '✓ ATIVO' : '○ desativado'} accent={!!config?.ativo} />
          <Field label="Provider" value={config?.provider || '—'} />
          <Field label="Bucket" value={config?.bucket || '—'} />
          <Field label="Endpoint" value={config?.endpoint || '—'} />
          <Field label="Mirror em uploads" value={config?.mirrorOnUpload ? 'ativo' : 'inativo'} />
          <Field label="Preferir external em reads" value={config?.preferExternalForReads ? 'sim' : 'não'} />
          <Field label="CDN URL pública" value={config?.publicBaseUrl || '—'} />
          <Field label="TTL signed URL" value={config?.signedUrlTtlSeconds ? `${config.signedUrlTtlSeconds}s` : '—'} />
        </div>
        <p style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Default: <strong>desativado</strong> — usa apenas FS local. Ative quando quiser começar a usar bucket.
        </p>
      </Section>

      <Section title="🔧 Configuração" defaultOpen={true}>
        {!isSuperAdmin && (
          <p style={{ marginBottom: '0.75rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Apenas super-admin pode editar. Você pode visualizar mas não salvar.
          </p>
        )}

        <Toggle
          label="Ativar storage externo"
          checked={ativo}
          disabled={!isSuperAdmin}
          onChange={v => setEditing(p => ({ ...p, ativo: v }))}
        />

        <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <FormField label="Provider">
            <select disabled={!isSuperAdmin} value={editing.provider} onChange={e => applyProviderTemplate(e.target.value)}
              style={inputStyle}>
              {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <small style={hintStyle}>{providerHint.note}</small>
          </FormField>
          <FormField label="Region">
            <input disabled={!isSuperAdmin} value={editing.region || ''} onChange={e => setEditing(p => ({ ...p, region: e.target.value }))}
              style={inputStyle} placeholder="auto / us-east-1 / etc" />
          </FormField>
          <FormField label="Endpoint *" full>
            <input disabled={!isSuperAdmin} value={editing.endpoint || ''} onChange={e => setEditing(p => ({ ...p, endpoint: e.target.value }))}
              style={inputStyle} placeholder={providerHint.endpointHint} />
          </FormField>
          <FormField label="Bucket *">
            <input disabled={!isSuperAdmin} value={editing.bucket || ''} onChange={e => setEditing(p => ({ ...p, bucket: e.target.value }))}
              style={inputStyle} placeholder="meu-bucket" />
          </FormField>
          <FormField label="Public CDN URL (opcional)">
            <input disabled={!isSuperAdmin} value={editing.publicBaseUrl || ''} onChange={e => setEditing(p => ({ ...p, publicBaseUrl: e.target.value }))}
              style={inputStyle} placeholder="https://cdn.exemplo.com" />
            <small style={hintStyle}>Domínio público que serve as derivadas (CDN do R2 / CloudFront / Bunny).</small>
          </FormField>
          <FormField label="Access Key ID *">
            <input disabled={!isSuperAdmin} value={editing.accessKeyId || ''} onChange={e => setEditing(p => ({ ...p, accessKeyId: e.target.value }))}
              style={inputStyle} placeholder="AKIA... (mascarado depois de salvar)" />
          </FormField>
          <FormField label="Secret Access Key *">
            <input type="password" disabled={!isSuperAdmin} value={editing.secretAccessKey || ''} onChange={e => setEditing(p => ({ ...p, secretAccessKey: e.target.value }))}
              style={inputStyle} placeholder="••••••" />
          </FormField>
          <FormField label="TTL signed URL (segundos)">
            <input type="number" disabled={!isSuperAdmin} value={editing.signedUrlTtlSeconds ?? 900}
              onChange={e => setEditing(p => ({ ...p, signedUrlTtlSeconds: Number(e.target.value) }))}
              style={inputStyle} min="60" max="604800" />
            <small style={hintStyle}>Validade dos links de download privados. Padrão: 15 min.</small>
          </FormField>
        </div>

        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <Toggle label="Path-style URLs (ON para MinIO)" checked={!!editing.pathStyle}
            disabled={!isSuperAdmin} onChange={v => setEditing(p => ({ ...p, pathStyle: v }))} />
          <Toggle label="Espelhar uploads automaticamente para o bucket" checked={!!editing.mirrorOnUpload}
            disabled={!isSuperAdmin} onChange={v => setEditing(p => ({ ...p, mirrorOnUpload: v }))} />
          <Toggle label="Preferir external para leituras (downloads via signed URL)" checked={!!editing.preferExternalForReads}
            disabled={!isSuperAdmin} onChange={v => setEditing(p => ({ ...p, preferExternalForReads: v }))} />
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={!isSuperAdmin || !dirty} onClick={handleSave}>
            Salvar configuração
          </button>
          <button className="btn btn-ghost" disabled={!isSuperAdmin || !ativo || testing} onClick={handleTest}>
            {testing ? 'Testando…' : '🔌 Testar conexão'}
          </button>
        </div>

        {testResult && (
          <div style={{
            marginTop: '0.75rem', padding: '0.65rem 0.9rem',
            background: testResult.ok ? 'rgba(34,197,94,0.12)' : 'rgba(220,38,38,0.15)',
            border: `1px solid ${testResult.ok ? 'rgba(34,197,94,0.4)' : 'rgba(220,38,38,0.4)'}`,
            color: testResult.ok ? '#86efac' : '#fca5a5',
            borderRadius: 'var(--radius)', fontSize: '0.85rem',
          }}>
            {testResult.ok ? `✓ Conexão OK (PUT/HEAD/DELETE em ${testResult.sample}).` : `✗ Falhou: ${testResult.reason}`}
            {testResult.code && <span style={{ display: 'block', fontSize: '0.72rem', opacity: 0.8 }}>Código: {testResult.code}</span>}
          </div>
        )}
      </Section>

      <Section title="📤 Migração local → bucket" defaultOpen={true}>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Sobe todos os arquivos de <code>storage/originals/</code> e <code>public/uploads/</code> para o bucket.
          Idempotente: pula arquivos já presentes (HEAD com tamanho igual).
        </p>

        {!config?.ativo && (
          <p style={{ fontSize: '0.82rem', color: '#fca5a5' }}>
            ⚠ Habilite "storage externo" e teste a conexão antes de migrar.
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <button className="btn btn-primary"
            disabled={!isSuperAdmin || !config?.ativo || status.running || migrating}
            onClick={() => handleMigrate({})}>
            {status.running ? 'Migrando…' : '🚀 Iniciar migração'}
          </button>
          <button className="btn btn-ghost"
            disabled={!isSuperAdmin || !config?.ativo || status.running || migrating}
            onClick={() => handleMigrate({ onlyOriginals: true })}>
            Só originais
          </button>
          <button className="btn btn-ghost"
            disabled={!isSuperAdmin || !config?.ativo || status.running || migrating}
            onClick={() => handleMigrate({ onlyDerivatives: true })}>
            Só derivadas
          </button>
        </div>

        {(status.running || status.fase) && (
          <div style={{ marginTop: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <strong style={{ fontSize: '0.85rem' }}>
                {status.running ? `Fase: ${status.fase}` : `Última execução: ${status.fase}`}
              </strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {status.totalEnviados}/{status.totalDescobertos} ({pct}%)
              </span>
            </div>
            <div style={{ background: 'var(--bg-input)', height: 8, borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: status.fase === 'error' ? '#dc2626' : 'var(--accent)',
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              {status.totalErros > 0 && <span style={{ color: '#fca5a5' }}>Erros: {status.totalErros}. </span>}
              {status.ultimoArquivo && <>Último: <code>{status.ultimoArquivo}</code>. </>}
              {status.ultimaErroMsg && <span style={{ color: '#fca5a5' }}>Msg: {status.ultimaErroMsg}</span>}
            </div>
          </div>
        )}
      </Section>

      <Section title="📚 Como configurar — passo a passo (Cloudflare R2)" defaultOpen={false}>
        <ol style={{ fontSize: '0.85rem', lineHeight: 1.6, paddingLeft: '1.25rem' }}>
          <li>Crie uma conta em <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer">dash.cloudflare.com</a> (gratuita).</li>
          <li>No menu lateral, vá em <strong>R2 Object Storage</strong> e crie um bucket (ex: <code>fotos-vinicius</code>).</li>
          <li>Em <strong>R2 → Manage R2 API Tokens</strong>, gere um token <em>Object Read & Write</em>. Anote: <code>Account ID</code>, <code>Access Key ID</code>, <code>Secret Access Key</code>.</li>
          <li>O <strong>endpoint</strong> é <code>https://&lt;Account ID&gt;.r2.cloudflarestorage.com</code>.</li>
          <li>Para CDN público (derivadas), em <strong>Settings do bucket → Public access</strong>, ative o <em>R2.dev subdomain</em> ou conecte um domínio próprio. Cole essa URL em <strong>Public CDN URL</strong> aqui.</li>
          <li>Volte aqui, preencha os campos, clique <strong>Salvar</strong> e depois <strong>Testar conexão</strong>.</li>
          <li>Se OK, clique <strong>Iniciar migração</strong>. Acompanhe o progresso. Pode levar minutos para arquivos grandes.</li>
        </ol>
        <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Para outros providers (B2, Wasabi, MinIO etc.) o processo é equivalente — gerar credenciais S3-compatíveis e copiar endpoint + bucket.
        </p>
      </Section>

      <Section title="🛟 Como funciona / arquitetura" defaultOpen={false}>
        <ul style={{ fontSize: '0.85rem', lineHeight: 1.6, paddingLeft: '1.25rem' }}>
          <li><strong>Local continua sendo source-of-truth</strong>: novos uploads gravam no FS antes de espelhar para o bucket.</li>
          <li><strong>Mirror automático</strong> roda em background a cada upload (não bloqueia a resposta).</li>
          <li><strong>Originais</strong> ficam privados no bucket. Download usa <em>signed URL</em> com TTL configurável.</li>
          <li><strong>Derivadas</strong> (mini/thumb/grid) são <em>public-read</em> com <code>Cache-Control: public, max-age=31536000, immutable</code> — perfeitas para CDN.</li>
          <li><strong>Fallback gracioso</strong>: se externo der erro, app continua servindo do FS local.</li>
          <li><strong>Migração</strong> é idempotente: rodar de novo só envia novidades.</li>
          <li><strong>Reverter</strong>: desligue o toggle "ativo" + (opcional) <code>npm run storage:rollback</code> para baixar tudo do bucket.</li>
        </ul>
      </Section>

      <Section title="💡 Simulador de custo" defaultOpen={false}>
        <CostSimulator />
      </Section>
    </div>
  )
}

const inputStyle = {
  padding: '0.55rem 0.7rem', background: 'var(--bg-input)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  color: 'var(--text)', fontSize: '0.85rem', width: '100%',
}
const hintStyle = { display: 'block', marginTop: '0.2rem', fontSize: '0.72rem', color: 'var(--text-dim)' }
const thStyle = { textAlign: 'left', padding: '0.4rem 0.5rem', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.78rem' }
const tdStyle = { padding: '0.4rem 0.5rem' }

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', marginBottom: '1rem', overflow: 'hidden',
    }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left',
          padding: '0.85rem 1.25rem',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text)', fontSize: '0.95rem', fontWeight: 600,
          fontFamily: 'var(--font-heading)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
        {title}
        <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div style={{ padding: '0 1.25rem 1.25rem' }}>{children}</div>}
    </section>
  )
}

function Field({ label, value, accent = false }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-dim)' }}>{label}</p>
      <p style={{ margin: '0.1rem 0 0', fontSize: '0.85rem', color: accent ? 'var(--accent)' : 'var(--text)', wordBreak: 'break-all' }}>{value}</p>
    </div>
  )
}

function FormField({ label, children, full = false }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', gridColumn: full ? '1 / -1' : 'auto' }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function SliderField({ label, value, onChange, min, max, step, display }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{display}</strong>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  )
}

function CostSimulator() {
  const USD_BRL = 5.75

  const [numFotos, setNumFotos] = useState(1500)
  const [tamanhoMB, setTamanhoMB] = useState(3.5)
  const [egressGB, setEgressGB] = useState(50)

  const totalGB = (numFotos * tamanhoMB) / 1024

  const PLAN = [
    {
      nome: 'Cloudflare R2', badge: 'Recomendado',
      storageUSD: Math.max(0, totalGB - 10) * 0.015,
      egressUSD: 0,
      nota: 'Egress grátis. 10 GB free tier permanente de storage.',
    },
    {
      nome: 'Idrive E2',
      storageUSD: Math.max(0, totalGB - 10) * 0.004,
      egressUSD: 0,
      nota: '10 GB free permanente. Egress incluso (limite 3× storage).',
    },
    {
      nome: 'Backblaze B2',
      storageUSD: Math.max(0, totalGB - 10) * 0.006,
      egressUSD: Math.max(0, egressGB - totalGB * 3) * 0.01,
      nota: '10 GB free + egress grátis até 3× o storage/mês.',
    },
    {
      nome: 'Scaleway Object Storage',
      storageUSD: Math.max(0, totalGB - 75) * 0.013,
      egressUSD: Math.max(0, egressGB - 75) * 0.011,
      nota: '75 GB grátis storage e 75 GB egress incluídos.',
    },
    {
      nome: 'Wasabi',
      storageUSD: Math.max(totalGB * 0.0068, 6.99 / USD_BRL),
      egressUSD: 0,
      nota: 'Sem egress. Sem free tier. Min. 30 dias por objeto. Min. ~$7/mês.',
    },
    {
      nome: 'AWS S3',
      storageUSD: totalGB * 0.023,
      egressUSD: Math.max(0, egressGB - 0.1) * 0.09,
      nota: 'Maduro, caro no egress. 5 GB free só no primeiro ano.',
    },
  ]

  const rows = PLAN.map(p => ({
    ...p,
    storageBRL: p.storageUSD * USD_BRL,
    egressBRL: p.egressUSD * USD_BRL,
    totalBRL: (p.storageUSD + p.egressUSD) * USD_BRL,
  }))

  const brl = v => `R$ ${v.toFixed(2).replace('.', ',')}`

  const cheapest = Math.min(...rows.map(r => r.totalBRL))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem', marginBottom: '1.25rem' }}>
        <SliderField
          label="Número de fotos"
          value={numFotos} onChange={setNumFotos}
          min={100} max={20000} step={100}
          display={numFotos.toLocaleString('pt-BR')}
        />
        <SliderField
          label="Tamanho médio por foto"
          value={tamanhoMB} onChange={setTamanhoMB}
          min={0.5} max={25} step={0.5}
          display={`${tamanhoMB.toFixed(1)} MB`}
        />
        <SliderField
          label="Downloads/mês (egress)"
          value={egressGB} onChange={setEgressGB}
          min={0} max={500} step={5}
          display={`${egressGB} GB`}
        />
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem',
        marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      }}>
        <SummaryStat label="Storage total"
          value={totalGB < 1 ? `${(totalGB * 1024).toFixed(0)} MB` : `${totalGB.toFixed(1)} GB`} />
        <SummaryStat label="Egress total/mês" value={`${egressGB} GB`} />
        <SummaryStat label="Câmbio (USD)" value={`R$ ${USD_BRL.toFixed(2)}`} />
        <SummaryStat label="Custo por foto/mês"
          value={(() => {
            const cheapestRow = rows.find(r => r.totalBRL === cheapest)
            if (!cheapestRow) return '—'
            const perPhoto = numFotos > 0 ? cheapestRow.totalBRL / numFotos : 0
            return `R$ ${perPhoto.toFixed(4)}`
          })()}
          hint="no provider mais barato" />
      </div>

      <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={thStyle}>Provider</th>
            <th style={thStyle}>Storage/mês</th>
            <th style={thStyle}>Egress/mês</th>
            <th style={thStyle}>Total/mês</th>
            <th style={thStyle}>Observação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const isCheapest = r.totalBRL === cheapest
            return (
              <tr key={r.nome} style={{
                borderBottom: '1px solid var(--border)',
                background: isCheapest ? 'rgba(var(--accent-rgb,99,102,241),0.06)' : 'transparent',
              }}>
                <td style={tdStyle}>
                  <strong>{r.nome}</strong>
                  {r.badge && (
                    <span style={{
                      marginLeft: '0.4rem', fontSize: '0.68rem',
                      background: 'rgba(99,102,241,0.15)', color: 'var(--accent)',
                      padding: '0.1rem 0.35rem', borderRadius: 'var(--radius)',
                    }}>{r.badge}</span>
                  )}
                </td>
                <td style={tdStyle}>{brl(r.storageBRL)}</td>
                <td style={tdStyle}>
                  {r.egressBRL === 0
                    ? <span style={{ color: '#86efac' }}>grátis</span>
                    : brl(r.egressBRL)}
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, color: isCheapest ? 'var(--accent)' : 'var(--text)' }}>
                  {brl(r.totalBRL)}
                  {isCheapest && <span style={{ marginLeft: '0.35rem', fontSize: '0.7rem' }}>★</span>}
                </td>
                <td style={{ ...tdStyle, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.nota}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        Valores estimados em BRL. Preços em USD de jun/2025. Não incluem custos de operações (PUT/GET) nem impostos.
        Egress considera downloads diretos do bucket; uso via CDN pode reduzir custos no S3.
      </p>
    </div>
  )
}

function SummaryStat({ label, value, hint }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      <p style={{ margin: '0.15rem 0 0', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {hint && <p style={{ margin: '0.05rem 0 0', fontSize: '0.65rem', color: 'var(--text-dim)' }}>{hint}</p>}
    </div>
  )
}
