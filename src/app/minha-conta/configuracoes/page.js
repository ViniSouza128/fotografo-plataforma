'use client'
// src/app/minha-conta/configuracoes/page.js

import { useEffect, useMemo, useState } from 'react'
import { mascararCPFTempoReal, normalizarCPF } from '@/lib/cpf'
import { formatarWhatsApp, mascararWhatsAppTempoReal, normalizarWhatsApp } from '@/lib/whatsapp'
import { temApenasUmNome } from '@/lib/nome'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import AvatarUploader from '@/components/AvatarUploader'

const MAX_MULTI_ITEMS = 10
const UFS_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
]

function normalizeInstagram(value) {
  return String(value || '').replace(/^@+/, '').trim()
}

function normalizeList(items) {
  return (Array.isArray(items) ? items : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, MAX_MULTI_ITEMS)
}

function listWithOneEmpty(items) {
  return items.length > 0 ? items : ['']
}

function normalizeFormSnapshot(form) {
  return {
    nomeCompleto: String(form.nomeCompleto || '').trim(),
    email: String(form.email || '').trim(),
    whatsapp: normalizarWhatsApp(form.whatsapp),
    cpf: normalizarCPF(form.cpf),
    dataNascimento: String(form.dataNascimento || ''),
    instagram: normalizeInstagram(form.instagram),
    enderecoRua: String(form.enderecoRua || '').trim(),
    enderecoNumero: String(form.enderecoNumero || '').trim(),
    enderecoBairro: String(form.enderecoBairro || '').trim(),
    enderecoCidade: String(form.enderecoCidade || '').trim(),
    enderecoEstado: UFS_BR.includes(String(form.enderecoEstado || '').trim().toUpperCase())
      ? String(form.enderecoEstado || '').trim().toUpperCase()
      : '',
    enderecoCep: String(form.enderecoCep || '').replace(/\D/g, '').slice(0, 8),
    times: normalizeList(form.times),
    organizacoes: normalizeList(form.organizacoes),
  }
}

export default function ConfiguracoesPage() {
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savedProfileSnapshot, setSavedProfileSnapshot] = useState('')
  const { confirm, confirmDialog } = useConfirmDialog()

  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' })

  const [form, setForm] = useState({
    nomeCompleto: '',
    email: '',
    whatsapp: '',
    cpf: '',
    dataNascimento: '',
    instagram: '',
    enderecoRua: '',
    enderecoNumero: '',
    enderecoBairro: '',
    enderecoCidade: '',
    enderecoEstado: '',
    enderecoCep: '',
    times: [''],
    organizacoes: [''],
  })

  const [senhaForm, setSenhaForm] = useState({
    senhaAtual: '',
    novaSenha: '',
    confirmarSenha: '',
  })
  const [showSenhaAtual, setShowSenhaAtual] = useState(false)
  const [showNovaSenha, setShowNovaSenha] = useState(false)
  const [showConfirmarSenha, setShowConfirmarSenha] = useState(false)
  const [savingSenha, setSavingSenha] = useState(false)
  const [senhaMsg, setSenhaMsg] = useState({ type: '', text: '' })
  const [exportingData, setExportingData] = useState(false)
  const [requestingDeletion, setRequestingDeletion] = useState(false)
  const [deletionReason, setDeletionReason] = useState('')
  const [lgpdMsg, setLgpdMsg] = useState({ type: '', text: '' })

  const [emailPrefs, setEmailPrefs] = useState({ compra: true, pago: true, remocao: true, reembolso: true, senhaAlterada: true })
  const [savingEmailPrefs, setSavingEmailPrefs] = useState(false)
  const [emailPrefsMsg, setEmailPrefsMsg] = useState({ type: '', text: '' })
  const profileSnapshot = useMemo(() => JSON.stringify(normalizeFormSnapshot(form)), [form])
  const isProfileDirty = Boolean(savedProfileSnapshot) && profileSnapshot !== savedProfileSnapshot

  useEffect(() => {
    async function loadData() {
      try {
        const meRes = await fetch('/api/auth/me')
        let cli = null

        if (meRes.ok) {
          const meData = await meRes.json()
          cli = meData.client
          localStorage.setItem('clienteLogado', JSON.stringify(cli))
        } else {
          const raw = localStorage.getItem('clienteLogado')
          if (raw) cli = JSON.parse(raw)
        }

        if (!cli) return
        setCliente(cli)

        let cfg = null
        if (cli.isAdmin) {
          try {
            const cfgRes = await fetch('/api/config')
            if (cfgRes.ok) cfg = await cfgRes.json()
          } catch {}
        }

        const initialForm = {
          nomeCompleto: cli.nomeCompleto || cfg?.nomeEstudio || '',
          email: cli.email || '',
          whatsapp: mascararWhatsAppTempoReal(cli.whatsapp || cfg?.whatsapp || ''),
          cpf: mascararCPFTempoReal(cli.cpf || cfg?.cpf || ''),
          dataNascimento: cli.dataNascimento || '',
          instagram: cli.instagram || cfg?.instagram || '',
          enderecoRua: cli.enderecoRua || '',
          enderecoNumero: cli.enderecoNumero || '',
          enderecoBairro: cli.enderecoBairro || '',
          enderecoCidade: cli.enderecoCidade || '',
          enderecoEstado: UFS_BR.includes((cli.enderecoEstado || '').toUpperCase()) ? (cli.enderecoEstado || '').toUpperCase() : '',
          enderecoCep: cli.enderecoCep || '',
          times: listWithOneEmpty(normalizeList(cli.times)),
          organizacoes: listWithOneEmpty(normalizeList(cli.organizacoes || cli.escolasOuOrganizacoes)),
        }
        setForm(initialForm)
        setSavedProfileSnapshot(JSON.stringify(normalizeFormSnapshot(initialForm)))

        if (cli.emailPrefs) {
          setEmailPrefs(prev => ({ ...prev, ...cli.emailPrefs }))
        }

      } catch {
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  function updateMultiField(field, index, value) {
    setForm(prev => {
      const next = [...prev[field]]
      next[index] = value
      return { ...prev, [field]: next.slice(0, MAX_MULTI_ITEMS) }
    })
  }

  function addMultiField(field) {
    setForm(prev => {
      if (prev[field].length >= MAX_MULTI_ITEMS) return prev
      return { ...prev, [field]: [...prev[field], ''] }
    })
  }

  function removeMultiField(field, index) {
    setForm(prev => {
      const next = prev[field].filter((_, idx) => idx !== index)
      return { ...prev, [field]: listWithOneEmpty(next) }
    })
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    if (!cliente) return

    setSavingProfile(true)
    setProfileMsg({ type: '', text: '' })

    try {
      if (temApenasUmNome(form.nomeCompleto)) {
        const accepted = await confirm({
          title: 'Confirmar nome',
          message: 'Parece que você informou apenas um nome.\nDeseja mesmo salvar assim?',
          confirmText: 'Salvar mesmo assim',
          cancelText: 'Revisar',
        })
        if (!accepted) {
          setSavingProfile(false)
          return
        }
      }

      const payload = {
        id: cliente.id,
        nomeCompleto: form.nomeCompleto.trim(),
        email: form.email.trim(),
        whatsapp: normalizarWhatsApp(form.whatsapp),
        cpf: normalizarCPF(form.cpf),
        dataNascimento: form.dataNascimento,
        instagram: normalizeInstagram(form.instagram),
        enderecoRua: form.enderecoRua.trim(),
        enderecoNumero: form.enderecoNumero.trim(),
        enderecoBairro: form.enderecoBairro.trim(),
        enderecoCidade: form.enderecoCidade.trim(),
        enderecoEstado: UFS_BR.includes(form.enderecoEstado.trim().toUpperCase())
          ? form.enderecoEstado.trim().toUpperCase()
          : '',
        enderecoCep: form.enderecoCep.replace(/\D/g, '').slice(0, 8),
        times: normalizeList(form.times),
        organizacoes: normalizeList(form.organizacoes),
      }

      const clientRes = await fetch('/api/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!clientRes.ok) {
        const data = await clientRes.json()
        throw new Error(data.error || 'Erro ao salvar dados.')
      }

      const updated = await clientRes.json()
      setCliente(updated)
      localStorage.setItem('clienteLogado', JSON.stringify(updated))

      // Espelhamento legado para os dados públicos já consumidos no site.
      if (updated.isAdmin) {
        await fetch('/api/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nomeEstudio: payload.nomeCompleto,
            whatsapp: payload.whatsapp,
            instagram: payload.instagram,
            cpf: payload.cpf,
          }),
        }).catch(() => {})
      }

      setProfileMsg({ type: 'success', text: 'Perfil atualizado com sucesso.' })
      setSavedProfileSnapshot(profileSnapshot)
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.message || 'Erro ao atualizar perfil.' })
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangeSenha(e) {
    e.preventDefault()
    if (!cliente) return

    setSenhaMsg({ type: '', text: '' })
    if (!senhaForm.senhaAtual) {
      setSenhaMsg({ type: 'error', text: 'Informe a senha atual.' })
      return
    }
    if (senhaForm.novaSenha.length < 6) {
      setSenhaMsg({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres.' })
      return
    }
    if (senhaForm.novaSenha !== senhaForm.confirmarSenha) {
      setSenhaMsg({ type: 'error', text: 'As senhas não coincidem.' })
      return
    }

    setSavingSenha(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cliente.id,
          senhaAtual: senhaForm.senhaAtual,
          novaSenha: senhaForm.novaSenha,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao alterar senha')
      }

      setSenhaForm({ senhaAtual: '', novaSenha: '', confirmarSenha: '' })
      setSenhaMsg({ type: 'success', text: 'Senha alterada com sucesso!' })
    } catch (err) {
      setSenhaMsg({ type: 'error', text: err.message })
    } finally {
      setSavingSenha(false)
    }
  }

  async function handleSaveEmailPrefs() {
    if (!cliente) return
    setSavingEmailPrefs(true)
    setEmailPrefsMsg({ type: '', text: '' })
    try {
      const res = await fetch('/api/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cliente.id, emailPrefs }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao salvar preferências.')
      }
      const updated = await res.json()
      setCliente(updated)
      localStorage.setItem('clienteLogado', JSON.stringify(updated))
      setEmailPrefsMsg({ type: 'success', text: 'Preferências de e-mail salvas.' })
    } catch (err) {
      setEmailPrefsMsg({ type: 'error', text: err.message || 'Erro ao salvar preferências.' })
    } finally {
      setSavingEmailPrefs(false)
    }
  }

  async function handleExportData() {
    if (!cliente) return
    setLgpdMsg({ type: '', text: '' })
    setExportingData(true)
    try {
      const res = await fetch('/api/clients/lgpd')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao exportar seus dados.')

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `meus-dados-${cliente.id || 'cliente'}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setLgpdMsg({ type: 'success', text: 'Exportacao gerada em JSON.' })
    } catch (err) {
      setLgpdMsg({ type: 'error', text: err.message || 'Erro ao exportar seus dados.' })
    } finally {
      setExportingData(false)
    }
  }

  async function handleRequestDeletion() {
    if (!cliente) return
    setLgpdMsg({ type: '', text: '' })
    const ok = await confirm({
      title: 'Solicitar exclusao definitiva?',
      message: 'A solicitacao sera enviada para revisao. Pedidos pagos podem ser preservados pelo periodo legal, com seus dados pessoais desidentificados quando aprovado.',
      confirmText: 'Solicitar exclusao',
      cancelText: 'Cancelar',
      danger: true,
    })
    if (!ok) return

    setRequestingDeletion(true)
    try {
      const res = await fetch('/api/clients/lgpd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deletionReason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao solicitar exclusao.')

      const updated = data.client || { ...cliente, lgpdDeletionRequest: data.request }
      setCliente(updated)
      localStorage.setItem('clienteLogado', JSON.stringify(updated))
      setDeletionReason('')
      setLgpdMsg({ type: 'success', text: 'Solicitacao registrada. O admin revisara antes de qualquer desidentificacao.' })
    } catch (err) {
      setLgpdMsg({ type: 'error', text: err.message || 'Erro ao solicitar exclusao.' })
    } finally {
      setRequestingDeletion(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '40vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  if (!cliente) return null

  const instagramHandle = normalizeInstagram(form.instagram)
  const instagramUrl = instagramHandle ? `https://instagram.com/${instagramHandle}` : ''

  return (
    <div style={{ maxWidth: '760px' }}>
      {confirmDialog}
      <div style={{ marginBottom: '3rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', marginBottom: '1.2rem' }}>
          Meus Dados
        </h1>

        {profileMsg.text && (
          <div className={`alert ${profileMsg.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '1rem' }}>
            {profileMsg.text}
          </div>
        )}

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem 1.5rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>Foto de perfil</p>
          <AvatarUploader
            client={cliente}
            onChange={updated => {
              setCliente(updated)
              try { localStorage.setItem('clienteLogado', JSON.stringify(updated)) } catch {}
              try { window.dispatchEvent(new Event('authUpdated')) } catch {}
            }}
          />
        </div>

        <form onSubmit={handleSaveProfile}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Nome completo</label>
              <input aria-label="Nome completo" type="text" className="form-input" value={form.nomeCompleto} onChange={e => setForm(prev => ({ ...prev, nomeCompleto: e.target.value }))} required />
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input aria-label="Email" type="email" className="form-input" value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} required />
            </div>

            <div className="form-group">
              <label className="form-label">WhatsApp</label>
              <input aria-label="WhatsApp" type="tel" className="form-input" placeholder="(11) 99999-9999" value={form.whatsapp} onChange={e => setForm(prev => ({ ...prev, whatsapp: mascararWhatsAppTempoReal(e.target.value) }))} />
              {form.whatsapp && <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>Formato: {formatarWhatsApp(form.whatsapp) || form.whatsapp}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">CPF</label>
              <input aria-label="CPF"
                type="text"
                className="form-input"
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={e => setForm(prev => ({ ...prev, cpf: mascararCPFTempoReal(e.target.value) }))}
                maxLength={14}
                disabled={!cliente.isAdmin}
                style={!cliente.isAdmin ? { opacity: 0.6, cursor: 'not-allowed', background: 'var(--bg-secondary)' } : undefined}
              />
              {!cliente.isAdmin && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>CPF não pode ser alterado.</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Data de nascimento</label>
              <input aria-label="Data de nascimento" type="date" className="form-input" value={form.dataNascimento} onChange={e => setForm(prev => ({ ...prev, dataNascimento: e.target.value }))} />
            </div>

            <div className="form-group">
              <label className="form-label">Instagram</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }}>@</span>
                <input aria-label="Instagram"
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '1.7rem' }}
                  value={normalizeInstagram(form.instagram)}
                  onChange={e => setForm(prev => ({ ...prev, instagram: e.target.value }))}
                  placeholder="seuusuario"
                />
              </div>
              {instagramUrl && (
                <a href={instagramUrl} target="_blank" rel="noreferrer noopener" style={{ marginTop: '0.4rem', display: 'inline-flex', gap: '0.4rem', alignItems: 'center', color: 'var(--accent)', textDecoration: 'none', fontSize: '0.8rem' }}>
                  📷 Abrir Instagram
                </a>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Endereço completo (opcional)</label>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 2fr) minmax(120px, 0.8fr)', gap: '0.5rem' }}>
                  <input aria-label="Endereço completo (opcional)"
                    type="text"
                    className="form-input"
                    value={form.enderecoRua || ''}
                    onChange={e => setForm(prev => ({ ...prev, enderecoRua: e.target.value }))}
                    placeholder="Rua / avenida"
                  />
                  <input
                    type="text"
                    className="form-input"
                    value={form.enderecoNumero || ''}
                    onChange={e => setForm(prev => ({ ...prev, enderecoNumero: e.target.value }))}
                    placeholder="Número"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(140px, 1fr) minmax(100px, 0.65fr)', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="form-input"
                    value={form.enderecoBairro || ''}
                    onChange={e => setForm(prev => ({ ...prev, enderecoBairro: e.target.value }))}
                    placeholder="Bairro"
                  />
                  <input
                    type="text"
                    className="form-input"
                    value={form.enderecoCidade || ''}
                    onChange={e => setForm(prev => ({ ...prev, enderecoCidade: e.target.value }))}
                    placeholder="Cidade"
                  />
                  <select
                    aria-label="UF"
                    className="form-input"
                    value={form.enderecoEstado || ''}
                    onChange={e => setForm(prev => ({ ...prev, enderecoEstado: e.target.value }))}
                  >
                    <option value="">UF</option>
                    {UFS_BR.map(uf => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  className="form-input"
                  style={{ maxWidth: '180px' }}
                  value={form.enderecoCep || ''}
                  onChange={e => setForm(prev => ({ ...prev, enderecoCep: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
                  placeholder="CEP"
                  maxLength={8}
                />
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem', display: 'block' }}>
                Formato: rua, número, bairro, cidade, UF e CEP.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Time(s) (até 10)</label>
              {form.times.map((item, idx) => (
                <div key={`time-${idx}`} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.45rem' }}>
                  <input aria-label="Time(s) (até 10)" type="text" className="form-input" value={item} onChange={e => updateMultiField('times', idx, e.target.value)} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeMultiField('times', idx)} disabled={form.times.length === 1}>
                    Remover
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => addMultiField('times')} disabled={form.times.length >= MAX_MULTI_ITEMS}>
                + Adicionar time
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Escola ou organização (até 10)</label>
              {form.organizacoes.map((item, idx) => (
                <div key={`org-${idx}`} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.45rem' }}>
                  <input aria-label="Escola ou organização (até 10)" type="text" className="form-input" value={item} onChange={e => updateMultiField('organizacoes', idx, e.target.value)} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeMultiField('organizacoes', idx)} disabled={form.organizacoes.length === 1}>
                    Remover
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => addMultiField('organizacoes')} disabled={form.organizacoes.length >= MAX_MULTI_ITEMS}>
                + Adicionar item
              </button>
            </div>

            <button type="submit" className={`btn btn-full ${isProfileDirty ? 'btn-state-dirty' : 'btn-state-clean'}`} disabled={savingProfile || !isProfileDirty}>
              {savingProfile ? 'Salvando...' : 'Salvar dados'}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', marginBottom: '1.5rem' }}>
          Alterar Senha
        </h2>

        {senhaMsg.text && (
          <div className={`alert ${senhaMsg.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '1rem' }}>
            {senhaMsg.text}
          </div>
        )}

        <form onSubmit={handleChangeSenha}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Senha Atual</label>
              <div style={{ position: 'relative' }}>
                <input aria-label="Senha Atual"
                  type={showSenhaAtual ? 'text' : 'password'}
                  className="form-input"
                  value={senhaForm.senhaAtual}
                  onChange={e => setSenhaForm(prev => ({ ...prev, senhaAtual: e.target.value }))}
                  style={{ paddingRight: '3rem' }}
                />
                <button type="button" onClick={() => setShowSenhaAtual(prev => !prev)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.25rem' }}>
                  {showSenhaAtual ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Nova Senha</label>
              <div style={{ position: 'relative' }}>
                <input aria-label="Nova Senha"
                  type={showNovaSenha ? 'text' : 'password'}
                  className="form-input"
                  value={senhaForm.novaSenha}
                  onChange={e => setSenhaForm(prev => ({ ...prev, novaSenha: e.target.value }))}
                  minLength={6}
                  style={{ paddingRight: '3rem' }}
                />
                <button type="button" onClick={() => setShowNovaSenha(prev => !prev)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.25rem' }}>
                  {showNovaSenha ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirmar Nova Senha</label>
              <div style={{ position: 'relative' }}>
                <input aria-label="Confirmar Nova Senha"
                  type={showConfirmarSenha ? 'text' : 'password'}
                  className="form-input"
                  value={senhaForm.confirmarSenha}
                  onChange={e => setSenhaForm(prev => ({ ...prev, confirmarSenha: e.target.value }))}
                  style={{ paddingRight: '3rem' }}
                />
                <button type="button" onClick={() => setShowConfirmarSenha(prev => !prev)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.25rem' }}>
                  {showConfirmarSenha ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-secondary btn-full" disabled={savingSenha}>
              {savingSenha ? 'Alterando...' : 'Alterar Senha'}
            </button>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>A senha deve ter no mínimo 6 caracteres.</p>
          </div>
        </form>
      </div>

      <div style={{ marginTop: '3rem' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', marginBottom: '1.5rem' }}>
          Notificações por E-mail
        </h2>

        {emailPrefsMsg.text && (
          <div className={`alert ${emailPrefsMsg.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '1rem' }}>
            {emailPrefsMsg.text}
          </div>
        )}

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {!cliente.email && (
            <div className="alert alert-warning" style={{ marginBottom: '0.5rem' }}>
              Cadastre um e-mail no seu perfil para receber notificações.
            </div>
          )}
          {[
            { key: 'compra', label: 'Pedido criado', desc: 'Ao registrar um novo pedido' },
            { key: 'pago', label: 'Pagamento confirmado', desc: 'Quando o pagamento for aprovado e as fotos liberadas' },
            { key: 'remocao', label: 'Solicitação de remoção', desc: 'Ao enviar ou receber atualização de remoção de foto' },
            { key: 'reembolso', label: 'Reembolso', desc: 'Atualizações sobre solicitações de reembolso' },
            { key: 'senhaAlterada', label: 'Alteração de senha', desc: 'Confirmação ao trocar a senha' },
          ].map(({ key, label, desc }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.5rem', borderRadius: 'var(--radius)', transition: 'background 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <input
                type="checkbox"
                checked={!!emailPrefs[key]}
                onChange={e => setEmailPrefs(prev => ({ ...prev, [key]: e.target.checked }))}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent)', flexShrink: 0 }}
              />
              <span style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <span style={{ fontSize: '0.88rem', color: 'var(--text)', fontWeight: 500 }}>{label}</span>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{desc}</span>
              </span>
            </label>
          ))}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSaveEmailPrefs}
            disabled={savingEmailPrefs}
            style={{ marginTop: '0.25rem' }}
          >
            {savingEmailPrefs ? 'Salvando...' : 'Salvar preferências'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: '3rem' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', marginBottom: '1.5rem' }}>
          Privacidade e LGPD
        </h2>

        {lgpdMsg.text && (
          <div className={`alert ${lgpdMsg.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '1rem' }}>
            {lgpdMsg.text}
          </div>
        )}

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <strong style={{ color: 'var(--text)' }}>Portabilidade dos dados</strong>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: 1.5 }}>
              Gere um arquivo JSON com seus dados de cadastro, pedidos, comentarios, solicitacoes, favoritos, curtidas e carrinho.
            </p>
            <button type="button" className="btn btn-secondary" onClick={handleExportData} disabled={exportingData}>
              {exportingData ? 'Gerando...' : 'Exportar meus dados em JSON'}
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <strong style={{ color: 'var(--text)' }}>Exclusao definitiva da conta</strong>
            {cliente.lgpdDeletionRequest?.status === 'pending' ? (
              <div className="alert alert-warning">
                Solicitacao pendente desde {new Date(cliente.lgpdDeletionRequest.requestedAt).toLocaleDateString('pt-BR')}. O admin revisara a retencao legal antes de aprovar.
              </div>
            ) : cliente.lgpdDeletionRequest?.status === 'rejected' ? (
              <div className="alert alert-error">
                Solicitacao anterior rejeitada. {cliente.lgpdDeletionRequest.adminNote ? `Observacao: ${cliente.lgpdDeletionRequest.adminNote}` : ''}
              </div>
            ) : null}
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: 1.5 }}>
              A aprovacao desidentifica seu cadastro e remove dados editaveis. Pedidos pagos podem continuar guardados para obrigacoes legais, sem dados pessoais desnecessarios.
            </p>
            <textarea
              aria-label="Motivo da solicitacao de exclusao"
              className="form-input"
              rows={3}
              value={deletionReason}
              onChange={e => setDeletionReason(e.target.value)}
              placeholder="Motivo opcional"
              disabled={requestingDeletion || cliente.lgpdDeletionRequest?.status === 'pending'}
            />
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleRequestDeletion}
              disabled={requestingDeletion || cliente.isAdmin || cliente.lgpdDeletionRequest?.status === 'pending'}
            >
              {requestingDeletion ? 'Enviando...' : 'Solicitar exclusao definitiva'}
            </button>
            {cliente.isAdmin && (
              <p style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>Contas administrativas precisam de revisao fora do fluxo de cliente.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
