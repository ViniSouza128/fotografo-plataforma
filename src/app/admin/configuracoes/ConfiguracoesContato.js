'use client'
// src/app/admin/configuracoes/ConfiguracoesContato.js

import { useState } from 'react'
import { mascararCPFTempoReal } from '@/lib/cpf'
import { mascararWhatsAppTempoReal } from '@/lib/whatsapp'
import { mascararCNPJ, validarCNPJ, normalizarCNPJ } from '@/lib/cnpj'
import { parsePriceInput, formatPrice, PRICE_MIN, PRICE_MAX } from '@/lib/price'

function normalizeInstagram(value = '') {
  return String(value).replace(/^@+/, '').trim()
}

export default function ConfiguracoesContato({
  config,
  setConfig,
  sharedProfile,
  setSharedProfile,
  saving,
  isDirty,
  onSaveConfig,
  readOnly = false,
}) {
  const instagramHandle = normalizeInstagram(sharedProfile.instagram)
  const instagramUrl = instagramHandle ? `https://instagram.com/${instagramHandle}` : ''
  const [precoDisplay, setPrecoDisplay] = useState(formatPrice(config.precoFotoDefault ?? '', { currency: false }))
  const [precoVideoDisplay, setPrecoVideoDisplay] = useState(formatPrice(config.precoVideoDefault ?? '', { currency: false }))

  const cnpjDigits = normalizarCNPJ(config.cnpj || '')
  const cnpjPreenchido = cnpjDigits.length > 0
  const cnpjValido = cnpjPreenchido ? validarCNPJ(cnpjDigits) : true

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem' }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '1.5rem' }}>Perfil compartilhado</h2>
      {readOnly && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Visualização liberada para Admin. Edição only to super admin.
        </p>
      )}
      <form onSubmit={onSaveConfig}>
        <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
        <div className="form-group">
          <label className="form-label">Nome completo</label>
          <input aria-label="Nome completo"
            type="text"
            className="form-input"
            value={sharedProfile.nomeCompleto || ''}
            onChange={e => setSharedProfile({ ...sharedProfile, nomeCompleto: e.target.value })}
            placeholder="Seu nome completo"
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input aria-label="Email"
            type="email"
            className="form-input"
            value={sharedProfile.email || ''}
            onChange={e => setSharedProfile({ ...sharedProfile, email: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">WhatsApp (só números, com DDD)</label>
          <input aria-label="WhatsApp (só números, com DDD)"
            type="tel"
            className="form-input"
            value={sharedProfile.whatsapp || ''}
            onChange={e => setSharedProfile({ ...sharedProfile, whatsapp: mascararWhatsAppTempoReal(e.target.value) })}
            placeholder="(11) 99999-9999"
            maxLength={15}
          />
        </div>
        <div className="form-group">
          <label className="form-label">CPF (só números)</label>
          <input aria-label="CPF (só números)"
            type="text"
            className="form-input"
            value={sharedProfile.cpf || ''}
            onChange={e => setSharedProfile({ ...sharedProfile, cpf: mascararCPFTempoReal(e.target.value) })}
            placeholder="000.000.000-00"
            maxLength={14}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Data de nascimento</label>
          <input aria-label="Data de nascimento"
            type="date"
            className="form-input"
            value={sharedProfile.dataNascimento || ''}
            onChange={e => setSharedProfile({ ...sharedProfile, dataNascimento: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Instagram</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: '0.88rem' }}>@</span>
            <input aria-label="Instagram"
              type="text"
              className="form-input"
              style={{ paddingLeft: '1.75rem' }}
              value={instagramHandle}
              onChange={e => setSharedProfile({ ...sharedProfile, instagram: e.target.value })}
              placeholder="seuarrobaaqui"
            />
          </div>
          {instagramUrl && (
            <a href={instagramUrl} target="_blank" rel="noreferrer noopener" style={{ marginTop: '0.35rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none' }}>
              📷 Abrir Instagram
            </a>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Preço padrão das fotos (R$)</label>
          <input aria-label="Preço padrão das fotos (R$)"
            type="text"
            className="form-input"
            style={{ maxWidth: '160px' }}
            inputMode="decimal"
            value={precoDisplay}
            placeholder={`Mín ${PRICE_MIN.toFixed(2).replace('.', ',')} · Máx ${PRICE_MAX.toFixed(2).replace('.', ',')}`}
            onChange={e => {
              const { value, text } = parsePriceInput(e.target.value)
              setPrecoDisplay(text)
              setConfig({ ...config, precoFotoDefault: value })
            }}
            onBlur={() => {
              const { value, text } = parsePriceInput(precoDisplay)
              setPrecoDisplay(text)
              setConfig({ ...config, precoFotoDefault: value })
            }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Preço padrão dos vídeos (R$)</label>
          <input aria-label="Preço padrão dos vídeos (R$)"
            type="text"
            className="form-input"
            style={{ maxWidth: '160px' }}
            inputMode="decimal"
            value={precoVideoDisplay}
            placeholder={`Mín ${PRICE_MIN.toFixed(2).replace('.', ',')} · Máx ${PRICE_MAX.toFixed(2).replace('.', ',')}`}
            onChange={e => {
              const { value, text } = parsePriceInput(e.target.value)
              setPrecoVideoDisplay(text)
              setConfig({ ...config, precoVideoDefault: value })
            }}
            onBlur={() => {
              const { value, text } = parsePriceInput(precoVideoDisplay)
              setPrecoVideoDisplay(text)
              setConfig({ ...config, precoVideoDefault: value })
            }}
          />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem', display: 'block' }}>
            Usado quando o álbum ou o próprio vídeo não tem preço próprio definido.
          </span>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', marginBottom: '0.8rem' }}>Dados empresariais (opcional)</h3>
        <div className="form-group">
          <label className="form-label">CNPJ</label>
          <input aria-label="CNPJ"
            type="text"
            className="form-input"
            value={config.cnpj || ''}
            onChange={e => setConfig({ ...config, cnpj: mascararCNPJ(e.target.value) })}
            placeholder="00.000.000/0000-00"
            maxLength={18}
            style={cnpjPreenchido && !cnpjValido ? { borderColor: 'var(--danger)' } : {}}
          />
          {cnpjPreenchido && !cnpjValido && (
            <span style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.25rem', display: 'block' }}>
              CNPJ inválido.
            </span>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Razão social</label>
          <input aria-label="Razão social"
            type="text"
            className="form-input"
            value={config.razaoSocial || ''}
            onChange={e => setConfig({ ...config, razaoSocial: e.target.value })}
            placeholder="Nome empresarial"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Localização</label>
          <input aria-label="Localização"
            type="text"
            className="form-input"
            value={config.localizacao || ''}
            onChange={e => setConfig({ ...config, localizacao: e.target.value })}
            placeholder="Cidade/UF ou endereço comercial"
          />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem', display: 'block' }}>
            Se preencher um campo empresarial, os três devem ser preenchidos.
          </span>
        </div>

        <button type="submit" className={`btn btn-full ${isDirty ? 'btn-state-dirty' : 'btn-state-clean'}`} disabled={saving || !isDirty || !cnpjValido}>
          {saving ? <><div className="spinner" /> Salvando...</> : 'Salvar Configurações'}
        </button>
        </fieldset>
      </form>
    </div>
  )
}
