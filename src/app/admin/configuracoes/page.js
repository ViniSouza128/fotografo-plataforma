'use client'
// src/app/admin/configuracoes/page.js

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import ConfiguracoesContato from './ConfiguracoesContato'
import ConfiguracoesImagens from './ConfiguracoesImagens'
import ConfiguracoesPagamento from './ConfiguracoesPagamento'
import ConfiguracoesLog from './ConfiguracoesLog'
import ConfiguracoesAuditoria from './ConfiguracoesAuditoria'
import ConfiguracoesRecompensas from './ConfiguracoesRecompensas'
import ConfiguracoesResolucoes from './ConfiguracoesResolucoes'
import { mascararCNPJ, normalizarCNPJ } from '@/lib/cnpj'
import { mascararCPFTempoReal, normalizarCPF } from '@/lib/cpf'
import { mascararWhatsAppTempoReal, normalizarWhatsApp } from '@/lib/whatsapp'
import { temApenasUmNome } from '@/lib/nome'
import { getDefaultDerivativeConfig } from '@/lib/derivedImagesConfig'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { SUPER_ADMIN_ONLY_PLACEHOLDER, isReadOnlyAdmin } from '@/lib/adminAccess'

function normalizePaymentConfig(pg = {}, { readOnly = false } = {}) {
  const secretValue = readOnly ? SUPER_ADMIN_ONLY_PLACEHOLDER : ''
  return {
    gateway_pix: pg.gateway_pix || pg.gateway_ativo || 'manual',
    gateway_pix_fallback: pg.gateway_pix_fallback ?? pg.gateway_fallback ?? null,
    gateway_cartao: pg.gateway_cartao || pg.gateway_ativo || 'manual',
    gateway_cartao_fallback: pg.gateway_cartao_fallback ?? pg.gateway_fallback ?? null,
    metodos_ativos: Array.isArray(pg.metodos_ativos) && pg.metodos_ativos.length > 0 ? pg.metodos_ativos : ['pix', 'cartao'],
    asaas_sandbox: { api_key: secretValue, wallet_id: secretValue, ...(pg.asaas_sandbox || {}) },
    asaas_producao: { api_key: secretValue, wallet_id: secretValue, ...(pg.asaas_producao || {}) },
    stripe: { public_key: secretValue, secret_key: secretValue, ...(pg.stripe || {}) },
    mercadopago_sandbox: { public_key: secretValue, access_token: secretValue, ...(pg.mercadopago_sandbox || {}) },
    mercadopago_producao: { public_key: secretValue, access_token: secretValue, ...(pg.mercadopago_producao || {}) },
    pagseguro_sandbox: { api_token: secretValue, ...(pg.pagseguro_sandbox || {}) },
    pagseguro_producao: { api_token: secretValue, ...(pg.pagseguro_producao || {}) },
  }
}

function normalizeInstagram(value = '') {
  return String(value).replace(/^@+/, '').trim()
}

function normalizeRows(rows = []) {
  return rows
    .filter(r => r?.quantidade && r?.desconto)
    .map(r => ({ quantidade: Number(r.quantidade), desconto: Number(r.desconto) }))
    .sort((a, b) => a.quantidade - b.quantidade)
}

function getNormalizedSharedProfile(data = {}) {
  return {
    nomeCompleto: String(data.nomeCompleto || '').trim(),
    email: String(data.email || '').trim(),
    whatsapp: normalizarWhatsApp(data.whatsapp),
    cpf: normalizarCPF(data.cpf),
    dataNascimento: String(data.dataNascimento || ''),
    instagram: normalizeInstagram(data.instagram),
  }
}

function hasSharedProfileChanges(adminData, sharedProfileData) {
  const current = getNormalizedSharedProfile(adminData)
  return (
    current.nomeCompleto !== sharedProfileData.nomeCompleto ||
    current.email !== sharedProfileData.email ||
    current.whatsapp !== sharedProfileData.whatsapp ||
    current.cpf !== sharedProfileData.cpf ||
    current.dataNascimento !== sharedProfileData.dataNascimento ||
    current.instagram !== sharedProfileData.instagram
  )
}

export default function ConfiguracoesPage() {
  const defaults = getDefaultDerivativeConfig()
  const [admin, setAdmin] = useState(null)
  const [config, setConfig] = useState({
    whatsapp: '',
    instagram: '',
    nomeEstudio: '',
    cpf: '',
    cnpj: '',
    razaoSocial: '',
    localizacao: '',
    precoFotoDefault: 29.90,
    precoVideoDefault: 49.90,
    descontosGlobais: [],
    descontosGlobaisAtivos: false,
    categoriasCustom: [],
    derivatives: { ...defaults.derivatives },
    watermarkVariants: { ...defaults.watermarkVariants },
  })
  const [sharedProfile, setSharedProfile] = useState({
    nomeCompleto: '',
    email: '',
    whatsapp: '',
    cpf: '',
    dataNascimento: '',
    instagram: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  const [pg, setPg] = useState(() => normalizePaymentConfig())
  const [savingPg, setSavingPg] = useState(false)
  const [missingJob, setMissingJob] = useState(null)
  const [startingMissingJob, setStartingMissingJob] = useState(false)

  const [descontosRows, setDescontosRows] = useState([
    { quantidade: 3, desconto: 5 },
    { quantidade: 5, desconto: 10 },
    { quantidade: 10, desconto: 15 },
  ])
  const [descontosAtivos, setDescontosAtivos] = useState(false)
  // Descontos progressivos para vídeos (separados das fotos)
  const [descontosVideoRows, setDescontosVideoRows] = useState([
    { quantidade: 2, desconto: 10 },
    { quantidade: 5, desconto: 20 },
  ])
  const [descontosVideoAtivos, setDescontosVideoAtivos] = useState(false)
  const [savedConfigSnapshot, setSavedConfigSnapshot] = useState('')
  const [savedPgSnapshot, setSavedPgSnapshot] = useState('')
  const { confirm, confirmDialog } = useConfirmDialog()

  const currentConfigSnapshot = useMemo(() => JSON.stringify({
    sharedProfile: {
      nomeCompleto: String(sharedProfile.nomeCompleto || '').trim(),
      email: String(sharedProfile.email || '').trim(),
      whatsapp: normalizarWhatsApp(sharedProfile.whatsapp),
      cpf: normalizarCPF(sharedProfile.cpf),
      dataNascimento: String(sharedProfile.dataNascimento || ''),
      instagram: normalizeInstagram(sharedProfile.instagram),
    },
    config: {
      cnpj: normalizarCNPJ(config.cnpj),
      razaoSocial: String(config.razaoSocial || '').trim(),
      localizacao: String(config.localizacao || '').trim(),
      precoFotoDefault: Number(config.precoFotoDefault),
      precoVideoDefault: Number(config.precoVideoDefault),
      categoriasCustom: Array.isArray(config.categoriasCustom) ? [...config.categoriasCustom] : [],
      derivatives: config.derivatives,
    },
    descontosGlobais: normalizeRows(descontosRows),
    descontosGlobaisAtivos: !!descontosAtivos,
    descontosVideoGlobais: normalizeRows(descontosVideoRows),
    descontosVideoGlobaisAtivos: !!descontosVideoAtivos,
  }), [sharedProfile, config, descontosRows, descontosAtivos, descontosVideoRows, descontosVideoAtivos])
  const currentPgSnapshot = useMemo(() => JSON.stringify(normalizePaymentConfig(pg)), [pg])
  const isConfigDirty = Boolean(savedConfigSnapshot) && currentConfigSnapshot !== savedConfigSnapshot
  const isPaymentDirty = Boolean(savedPgSnapshot) && currentPgSnapshot !== savedPgSnapshot
  const readOnly = isReadOnlyAdmin(admin)

  useEffect(() => {
    async function load() {
      try {
        const raw = localStorage.getItem('clienteLogado')
        if (!raw) {
          setLoading(false)
          return
        }

        let adminData = null
        try {
          adminData = JSON.parse(raw)
        } catch {}

        if (!adminData) {
          setLoading(false)
          return
        }

        setAdmin(adminData)
        const cfgRes = await fetch('/api/config')
        const cfg = await cfgRes.json()
        setConfig({
          ...defaults,
          ...cfg,
          categoriasCustom: cfg.categoriasCustom || [],
          descontosGlobais: cfg.descontosGlobais || [],
          descontosGlobaisAtivos: !!cfg.descontosGlobaisAtivos,
          cnpj: mascararCNPJ(cfg.cnpj || ''),
          derivatives: {
            ...defaults.derivatives,
            ...(cfg.derivatives || {}),
          },
          watermarkVariants: {
            ...defaults.watermarkVariants,
            ...(cfg.watermarkVariants || {}),
          },
        })
        setSharedProfile({
          nomeCompleto: adminData.nomeCompleto || cfg.nomeEstudio || '',
          email: adminData.email || '',
          whatsapp: mascararWhatsAppTempoReal(adminData.whatsapp || cfg.whatsapp || ''),
          cpf: mascararCPFTempoReal(adminData.cpf || cfg.cpf || ''),
          dataNascimento: adminData.dataNascimento || '',
          instagram: adminData.instagram || cfg.instagram || '',
        })
        if (cfg.pagamento) setPg(normalizePaymentConfig(cfg.pagamento, { readOnly: !adminData.isSuperAdmin }))
        else setPg(normalizePaymentConfig({}, { readOnly: !adminData.isSuperAdmin }))
        if (cfg.descontosGlobais?.length) setDescontosRows(cfg.descontosGlobais)
        setDescontosAtivos(!!cfg.descontosGlobaisAtivos)
        if (Array.isArray(cfg.descontosVideoGlobais) && cfg.descontosVideoGlobais.length) {
          setDescontosVideoRows(cfg.descontosVideoGlobais)
        }
        setDescontosVideoAtivos(!!cfg.descontosVideoGlobaisAtivos)
        setSavedConfigSnapshot(JSON.stringify({
          sharedProfile: {
            nomeCompleto: String(adminData.nomeCompleto || cfg.nomeEstudio || '').trim(),
            email: String(adminData.email || '').trim(),
            whatsapp: normalizarWhatsApp(adminData.whatsapp || cfg.whatsapp || ''),
            cpf: normalizarCPF(adminData.cpf || cfg.cpf || ''),
            dataNascimento: String(adminData.dataNascimento || ''),
            instagram: normalizeInstagram(adminData.instagram || cfg.instagram || ''),
          },
          config: {
            cnpj: normalizarCNPJ(cfg.cnpj || ''),
            razaoSocial: String(cfg.razaoSocial || '').trim(),
            localizacao: String(cfg.localizacao || '').trim(),
            precoFotoDefault: Number(cfg.precoFotoDefault),
            precoVideoDefault: Number(cfg.precoVideoDefault),
            categoriasCustom: Array.isArray(cfg.categoriasCustom) ? [...cfg.categoriasCustom] : [],
            derivatives: {
              ...defaults.derivatives,
              ...(cfg.derivatives || {}),
            },
          },
          descontosGlobais: normalizeRows(cfg.descontosGlobais || []),
          descontosGlobaisAtivos: !!cfg.descontosGlobaisAtivos,
          descontosVideoGlobais: normalizeRows(cfg.descontosVideoGlobais || []),
          descontosVideoGlobaisAtivos: !!cfg.descontosVideoGlobaisAtivos,
        }))
        setSavedPgSnapshot(JSON.stringify(normalizePaymentConfig(cfg.pagamento || {}, { readOnly: !adminData.isSuperAdmin })))
      } catch {
        showMsg('error', 'Erro ao carregar configurações.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  useEffect(() => {
    if (!missingJob?.running) return undefined
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/images/missing')
        if (!res.ok) return
        const data = await res.json()
        setMissingJob(data)
      } catch {}
    }, 1000)
    return () => clearInterval(timer)
  }, [missingJob?.running])

  useEffect(() => {
    let timer = null
    let mounted = true

    async function loadJob() {
      try {
        const res = await fetch('/api/images/missing')
        if (!res.ok) return
        const data = await res.json()
        if (!mounted) return
        setMissingJob(data)
        if (data?.running) timer = setTimeout(loadJob, 1000)
      } catch {}
    }

    loadJob()
    return () => {
      mounted = false
      if (timer) clearTimeout(timer)
    }
  }, [])

  function showMsg(type, text) {
    setMsg({ type, text })
    setTimeout(() => setMsg({ type: '', text: '' }), 5000)
  }

  function validarDescontos(rows) {
    const validas = rows.filter(r => r.quantidade && r.desconto)
    for (let i = 1; i < validas.length; i++) {
      if (Number(validas[i].desconto) <= Number(validas[i - 1].desconto)) {
        return `Faixa ${i + 1}: o desconto (${validas[i].desconto}%) deve ser maior que o anterior (${validas[i - 1].desconto}%)`
      }
      if (Number(validas[i].quantidade) <= Number(validas[i - 1].quantidade)) {
        return `Faixa ${i + 1}: a quantidade deve ser maior que a anterior`
      }
    }
    return null
  }

  async function handleSaveConfig(e) {
    if (e?.preventDefault) e.preventDefault()
    if (readOnly) {
      showMsg('error', 'Only to super admin.')
      return
    }
    if (temApenasUmNome(sharedProfile.nomeCompleto)) {
      const accepted = await confirm({
        title: 'Confirmar nome',
        message: 'Parece que você informou apenas um nome.\nDeseja mesmo salvar assim?',
        confirmText: 'Salvar mesmo assim',
        cancelText: 'Revisar',
      })
      if (!accepted) return
    }

    const erroDesconto = validarDescontos(descontosRows)
    if (erroDesconto && descontosAtivos) {
      showMsg('error', erroDesconto)
      return
    }

    const validDescontos = descontosRows
      .filter(d => d.quantidade && d.desconto)
      .map(d => ({ quantidade: Number(d.quantidade), desconto: Number(d.desconto) }))
      .sort((a, b) => a.quantidade - b.quantidade)
    const erroDescontoVideo = validarDescontos(descontosVideoRows)
    if (erroDescontoVideo && descontosVideoAtivos) {
      showMsg('error', `Vídeo: ${erroDescontoVideo}`)
      return
    }
    const validDescontosVideo = descontosVideoRows
      .filter(d => d.quantidade && d.desconto)
      .map(d => ({ quantidade: Number(d.quantidade), desconto: Number(d.desconto) }))
      .sort((a, b) => a.quantidade - b.quantidade)
    const normalizedSharedProfile = getNormalizedSharedProfile(sharedProfile)
    const shouldSyncSharedProfile = Boolean(admin?.id) && hasSharedProfileChanges(admin, normalizedSharedProfile)

    setSaving(true)
    try {
      if (shouldSyncSharedProfile) {
        const clientRes = await fetch('/api/clients', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: admin.id,
            nomeCompleto: normalizedSharedProfile.nomeCompleto,
            email: normalizedSharedProfile.email,
            whatsapp: normalizedSharedProfile.whatsapp,
            cpf: normalizedSharedProfile.cpf,
            dataNascimento: normalizedSharedProfile.dataNascimento,
            instagram: normalizedSharedProfile.instagram,
          }),
        })
        if (!clientRes.ok) {
          const clientErr = await clientRes.json().catch(() => ({}))
          throw new Error(clientErr.error || 'Erro ao salvar perfil compartilhado.')
        }
        const updatedClient = await clientRes.json()
        setAdmin(updatedClient)
        localStorage.setItem('clienteLogado', JSON.stringify(updatedClient))
      }

      const cfgRes = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Espelha os dados compartilhados que já são consumidos por páginas públicas.
          whatsapp: normalizedSharedProfile.whatsapp,
          instagram: normalizedSharedProfile.instagram,
          nomeEstudio: normalizedSharedProfile.nomeCompleto,
          cpf: normalizedSharedProfile.cpf,
          cnpj: normalizarCNPJ(config.cnpj),
          razaoSocial: config.razaoSocial || '',
          localizacao: config.localizacao || '',
          precoFotoDefault: config.precoFotoDefault,
          precoVideoDefault: config.precoVideoDefault,
          categoriasCustom: config.categoriasCustom || [],
          descontosGlobais: validDescontos,
          descontosGlobaisAtivos: descontosAtivos,
          descontosVideoGlobais: validDescontosVideo,
          descontosVideoGlobaisAtivos: descontosVideoAtivos,
          derivatives: config.derivatives,
        }),
      })
      if (!cfgRes.ok) {
        const data = await cfgRes.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao salvar configurações.')
      }

      showMsg('success', 'Configurações salvas!')
      setSavedConfigSnapshot(currentConfigSnapshot)
    } catch (err) {
      showMsg('error', err.message || 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePg() {
    if (readOnly) {
      showMsg('error', 'Only to super admin.')
      return
    }
    setSavingPg(true)
    try {
      const pgToSave = {
        ...pg,
        gateway_ativo: pg.gateway_cartao || pg.gateway_pix || 'manual',
        gateway_fallback: pg.gateway_cartao_fallback || pg.gateway_pix_fallback || null,
      }
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagamento: pgToSave }),
      })
      if (res.ok) {
        showMsg('success', 'Configurações de pagamento salvas!')
        setSavedPgSnapshot(currentPgSnapshot)
      } else {
        showMsg('error', 'Erro ao salvar.')
      }
    } catch {
      showMsg('error', 'Erro de conexão.')
    } finally {
      setSavingPg(false)
    }
  }

  async function handleStartMissingJob() {
    if (readOnly) {
      showMsg('error', 'Only to super admin.')
      return
    }
    setStartingMissingJob(true)
    try {
      const res = await fetch('/api/images/missing', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        showMsg('error', data?.error || 'Erro ao iniciar geração.')
        return
      }
      setMissingJob(data.state || null)
      showMsg('success', data.started ? 'Geração iniciada.' : 'Geração já em andamento.')
    } catch {
      showMsg('error', 'Erro de conexão.')
    } finally {
      setStartingMissingJob(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '60vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  return (
    <>
      {confirmDialog}
      <div className="admin-header">
        <div>
          <Link href="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>← Dashboard</Link>
          <h1 className="admin-page-title" style={{ marginTop: '0.25rem' }}>Configurações</h1>
        </div>
      </div>

      {msg.text && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'} mb-3`}>
          {msg.type === 'success' ? '✅' : '⚠'} {msg.text}
        </div>
      )}

      {readOnly && (
        <div className="alert alert-info mb-3">
          👁️ Modo leitura para Admin. Alterações e segredos ficam disponíveis only to super admin.
        </div>
      )}

      <div style={{ maxWidth: '960px', marginBottom: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Sanitizar sistema de imagens</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Arquiva legados e órfãos fora do padrão, regenera derivadas canonicamente a partir dos originais e aplica as configurações atuais.
            </p>
          </div>
          <button className="btn btn-sm btn-primary" onClick={handleStartMissingJob} disabled={readOnly || startingMissingJob || !!missingJob?.running}>
            {startingMissingJob ? 'Iniciando...' : missingJob?.running ? 'Em andamento...' : 'Sanitizar imagens'}
          </button>
        </div>

        {missingJob && (
          <div style={{ marginTop: '0.85rem' }}>
            <div style={{ height: '8px', borderRadius: '999px', background: 'var(--bg-input)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${missingJob.total > 0 ? Math.round((missingJob.done / missingJob.total) * 100) : 0}%`,
                  background: 'var(--accent)',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              <span>{missingJob.done || 0} / {missingJob.total || 0}</span>
              <span>Geradas: {missingJob.generated || 0}</span>
              <span>Puladas: {missingJob.skipped || 0}</span>
              <span>Falhas: {missingJob.failed || 0}</span>
              <span>Arquivadas: {missingJob.archived || 0}</span>
              {missingJob.originalsMoved > 0 && <span>Originais movidos: {missingJob.originalsMoved}</span>}
              {missingJob.originalsMissing > 0 && <span>Originais ausentes: {missingJob.originalsMissing}</span>}
              {missingJob.orphans > 0 && <span>Órfãos: {missingJob.orphans}</span>}
              {typeof missingJob.etaSeconds === 'number' && missingJob.running && <span>ETA: ~{missingJob.etaSeconds}s</span>}
            </div>
            {missingJob.current && (
              <p style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Processando: {missingJob.current}
              </p>
            )}
            {missingJob.archiveRoot && !missingJob.running && (
              <p style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Arquivo legado: {missingJob.archiveRoot}
              </p>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.5rem', maxWidth: '960px' }}>
        <ConfiguracoesContato
          config={config}
          setConfig={setConfig}
          sharedProfile={sharedProfile}
          setSharedProfile={setSharedProfile}
          saving={saving}
          isDirty={isConfigDirty}
          onSaveConfig={handleSaveConfig}
          readOnly={readOnly}
        />

        <ConfiguracoesImagens
          config={config}
          setConfig={setConfig}
          saving={saving}
          isDirty={isConfigDirty}
          onSaveConfig={handleSaveConfig}
          descontosRows={descontosRows}
          setDescontosRows={setDescontosRows}
          descontosAtivos={descontosAtivos}
          setDescontosAtivos={setDescontosAtivos}
          descontosVideoRows={descontosVideoRows}
          setDescontosVideoRows={setDescontosVideoRows}
          descontosVideoAtivos={descontosVideoAtivos}
          setDescontosVideoAtivos={setDescontosVideoAtivos}
          showMsg={showMsg}
          readOnly={readOnly}
        />

        <ConfiguracoesPagamento
          pg={pg}
          setPg={setPg}
          savingPg={savingPg}
          isDirty={isPaymentDirty}
          onSavePg={handleSavePg}
          readOnly={readOnly}
        />

        <ConfiguracoesRecompensas showMsg={showMsg} readOnly={readOnly} />

        <ConfiguracoesResolucoes showMsg={showMsg} readOnly={readOnly} />

        <section className="config-section" style={{ marginTop: '2rem' }}>
          <h2 className="config-section-title">☁️ Armazenamento externo (S3 / R2)</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Configure um bucket S3-compatível (R2, S3, B2, MinIO) para originais privados e derivadas em CDN.
            Default: <strong>desativado</strong> (usa apenas FS local).
          </p>
          <Link href="/admin/configuracoes/storage" className="btn btn-primary" style={{ marginTop: '0.5rem', display: 'inline-block' }}>
            Abrir painel de armazenamento →
          </Link>
        </section>

        <ConfiguracoesLog showMsg={showMsg} readOnly={readOnly} />

        <ConfiguracoesAuditoria showMsg={showMsg} />
      </div>
    </>
  )
}
