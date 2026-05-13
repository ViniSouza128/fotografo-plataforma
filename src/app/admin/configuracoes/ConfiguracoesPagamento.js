'use client'
// src/app/admin/configuracoes/ConfiguracoesPagamento.js

import { useState } from 'react'

export const GATEWAY_OPTIONS = [
  { value: 'manual', label: '🧪 Manual (sem cobrança real)' },
  { value: 'asaas_sandbox', label: '⚗️ Asaas — Sandbox (testes)' },
  { value: 'asaas_producao', label: '🏦 Asaas — Produção' },
  { value: 'stripe', label: '💳 Stripe' },
  { value: 'mercadopago_sandbox', label: '⚗️ Mercado Pago — Sandbox (testes)' },
  { value: 'mercadopago_producao', label: '💛 Mercado Pago — Produção' },
  { value: 'pagseguro_sandbox', label: '⚗️ PagSeguro/PagBank — Sandbox (testes)' },
  { value: 'pagseguro_producao', label: '🟧 PagSeguro/PagBank — Produção' },
]

const PIX_DESCRIPTION = 'Cobrança instantânea por QR Code e copia e cola.'
const CARD_DESCRIPTION = 'Pagamento por cartão com gateway primário e fallback dedicados.'

export default function ConfiguracoesPagamento({ pg, setPg, savingPg, isDirty, onSavePg, readOnly = false }) {
  function toggleMetodo(m) {
    setPg(prev => {
      const ativos = prev.metodos_ativos || []
      return {
        ...prev,
        metodos_ativos: ativos.includes(m) ? ativos.filter(x => x !== m) : [...ativos, m],
      }
    })
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', gridColumn: '1 / -1' }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '0.4rem' }}>💳 Gateway de Pagamento</h2>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
        Configure um gateway primário por método de pagamento e um fallback opcional.
        O fallback entra se o primário falhar ou não suportar o método.
        Suportados: <strong>Asaas</strong>, <strong>Stripe</strong>, <strong>Mercado Pago</strong> e <strong>PagSeguro/PagBank</strong>.
      </p>
      {readOnly && (
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
          Credenciais, wallet IDs e chaves ficam visíveis only to super admin.
        </div>
      )}
      <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>

      {/* Gateway por método */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { id: 'pix', title: '⚡ PIX', desc: PIX_DESCRIPTION, gatewayKey: 'gateway_pix', fallbackKey: 'gateway_pix_fallback' },
          { id: 'cartao', title: '💳 Cartão', desc: CARD_DESCRIPTION, gatewayKey: 'gateway_cartao', fallbackKey: 'gateway_cartao_fallback' },
        ].map(section => (
          <div key={section.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius)', padding: '1rem' }}>
            <div style={{ marginBottom: '0.85rem' }}>
              <h3 style={{ fontSize: '0.98rem', marginBottom: '0.25rem', color: 'var(--text)' }}>{section.title}</h3>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: 0, lineHeight: 1.5 }}>{section.desc}</p>
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">Gateway primário</label>
              <select aria-label="Gateway primário" className="form-select" value={pg[section.gatewayKey] || 'manual'}
                onChange={e => setPg(p => ({ ...p, [section.gatewayKey]: e.target.value }))}>
                {GATEWAY_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Gateway fallback</label>
              <select aria-label="Gateway fallback" className="form-select" value={pg[section.fallbackKey] || ''}
                onChange={e => setPg(p => ({ ...p, [section.fallbackKey]: e.target.value || null }))}>
                <option value="">— Nenhum —</option>
                {GATEWAY_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem', display: 'block' }}>Usado se o primário falhar ou não atender este método.</span>
            </div>
          </div>
        ))}
      </div>

      {/* Métodos aceitos */}
      <div className="form-group">
        <label className="form-label">Métodos de Pagamento Aceitos</label>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {[
            { id: 'pix', label: '⚡ PIX', desc: 'Asaas / Mercado Pago / PagSeguro / Stripe' },
            { id: 'cartao', label: '💳 Cartão', desc: 'Asaas / Mercado Pago / PagSeguro / Stripe' },
          ].map(({ id, label, desc }) => {
            const ativo = (pg.metodos_ativos || []).includes(id)
            return (
              <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', borderRadius: 'var(--radius)', border: `1.5px solid ${ativo ? 'var(--accent)' : 'var(--border)'}`, background: ativo ? 'var(--accent-dim)' : 'var(--bg-input)', cursor: 'pointer', transition: 'all 0.15s', userSelect: 'none' }}>
                <input aria-label="Métodos de Pagamento Aceitos" type="checkbox" checked={ativo} onChange={() => toggleMetodo(id)} style={{ accentColor: 'var(--accent)' }} />
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>{label}</strong>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', margin: 0 }}>via {desc}</p>
                </div>
              </label>
            )
          })}
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.5rem 0' }} />

      {/* Asaas */}
      <CredentialsBlock
        title="⚗️ Asaas — Sandbox (testes)"
        instructions={
          <Instructions
            steps={[
              'Crie uma conta gratuita em https://sandbox.asaas.com',
              'Acesse: Integrações → API → "Gerar nova chave"',
              'Copie a Chave de API (começa com $aact_hmlg_)',
            ]}
            link="https://docs.asaas.com/docs/autenticacao-da-api"
          />
        }>
        <FormPair label1="Wallet ID" value1={pg.asaas_sandbox?.wallet_id || ''} onChange1={v => setPg(p => ({ ...p, asaas_sandbox: { ...p.asaas_sandbox, wallet_id: v } }))}
          label2="Chave de API" value2={pg.asaas_sandbox?.api_key || ''} onChange2={v => setPg(p => ({ ...p, asaas_sandbox: { ...p.asaas_sandbox, api_key: v } }))}
          ph1="xxxxxxxx-xxxx-..." ph2="$aact_hmlg_..." secret2 />
      </CredentialsBlock>

      <CredentialsBlock title="🏦 Asaas — Produção"
        instructions={
          <Instructions
            steps={[
              'Conta validada em https://www.asaas.com',
              'Integrações → API → Gerar nova chave',
              'Token começa com $aact_prod_',
            ]}
            link="https://docs.asaas.com/" />
        }>
        <FormPair label1="Wallet ID" value1={pg.asaas_producao?.wallet_id || ''} onChange1={v => setPg(p => ({ ...p, asaas_producao: { ...p.asaas_producao, wallet_id: v } }))}
          label2="Chave de API" value2={pg.asaas_producao?.api_key || ''} onChange2={v => setPg(p => ({ ...p, asaas_producao: { ...p.asaas_producao, api_key: v } }))}
          ph1="xxxxxxxx-xxxx-..." ph2="$aact_prod_..." secret2 />
      </CredentialsBlock>

      {/* Stripe */}
      <CredentialsBlock title="💳 Stripe"
        instructions={
          <Instructions
            steps={[
              'Crie conta em https://dashboard.stripe.com',
              'Modo Live (canto sup. esq.) ou Test → Developers → API keys',
              'Copie Publishable key (pk_live_/pk_test_) e Secret key (sk_live_/sk_test_)',
              'Para PIX: ative em Settings → Payment methods (precisa CNPJ BR)',
            ]}
            link="https://docs.stripe.com/keys" />
        }>
        <FormPair label1="Chave Pública (pk_…)" value1={pg.stripe?.public_key || ''} onChange1={v => setPg(p => ({ ...p, stripe: { ...p.stripe, public_key: v } }))}
          label2="Chave Secreta (sk_…)" value2={pg.stripe?.secret_key || ''} onChange2={v => setPg(p => ({ ...p, stripe: { ...p.stripe, secret_key: v } }))}
          ph1="pk_live_..." ph2="sk_live_..." secret2 />
        <Toggle label="Habilitar PIX no Stripe (precisa estar liberado na conta)"
          checked={!!pg.stripe?.pix_enabled}
          onChange={v => setPg(p => ({ ...p, stripe: { ...p.stripe, pix_enabled: v } }))} />
      </CredentialsBlock>

      {/* Mercado Pago */}
      <CredentialsBlock title="⚗️ Mercado Pago — Sandbox (testes)"
        instructions={
          <Instructions
            steps={[
              'Crie conta em https://www.mercadopago.com.br',
              'Acesse "Suas integrações" → criar nova aplicação (PIX e cartão)',
              'Em "Credenciais de teste" copie o Access Token (começa com TEST-)',
              'Para webhook: nessa mesma página configure a URL e copie a "chave secreta de assinatura"',
              'No painel admin: cole no campo "Webhook secret" abaixo OU em .env como MERCADOPAGO_WEBHOOK_SECRET',
            ]}
            link="https://www.mercadopago.com.br/developers/pt/docs/checkout-api/integration-configuration/integrate-with-pix" />
        }>
        <FormPair label1="Public Key" value1={pg.mercadopago_sandbox?.public_key || ''} onChange1={v => setPg(p => ({ ...p, mercadopago_sandbox: { ...p.mercadopago_sandbox, public_key: v } }))}
          label2="Access Token" value2={pg.mercadopago_sandbox?.access_token || ''} onChange2={v => setPg(p => ({ ...p, mercadopago_sandbox: { ...p.mercadopago_sandbox, access_token: v } }))}
          ph1="TEST-..." ph2="TEST-..." secret2 />
      </CredentialsBlock>

      <CredentialsBlock title="💛 Mercado Pago — Produção"
        instructions={
          <Instructions
            steps={[
              'No painel "Suas integrações", copie as credenciais de PRODUÇÃO',
              'Access Token começa com APP_USR-',
              'Configure webhook URL para receber notificações de payment',
            ]}
            link="https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials" />
        }>
        <FormPair label1="Public Key" value1={pg.mercadopago_producao?.public_key || ''} onChange1={v => setPg(p => ({ ...p, mercadopago_producao: { ...p.mercadopago_producao, public_key: v } }))}
          label2="Access Token" value2={pg.mercadopago_producao?.access_token || ''} onChange2={v => setPg(p => ({ ...p, mercadopago_producao: { ...p.mercadopago_producao, access_token: v } }))}
          ph1="APP_USR-..." ph2="APP_USR-..." secret2 />
      </CredentialsBlock>

      {/* PagSeguro */}
      <CredentialsBlock title="⚗️ PagSeguro/PagBank — Sandbox"
        instructions={
          <Instructions
            steps={[
              'Crie conta em https://sandbox.pagseguro.uol.com.br',
              'No painel: Vendas → Integrações → Token de API',
              'Gere um Token de Sandbox (chave longa em hexa)',
              'Cole abaixo. Para webhook: defina PAGSEGURO_WEBHOOK_SECRET em .env',
            ]}
            link="https://dev.pagbank.uol.com.br/reference/tokens" />
        }>
        <SingleField label="Token de API (Sandbox)" value={pg.pagseguro_sandbox?.api_token || ''}
          onChange={v => setPg(p => ({ ...p, pagseguro_sandbox: { ...p.pagseguro_sandbox, api_token: v } }))}
          placeholder="Bearer Token longo..." secret />
      </CredentialsBlock>

      <CredentialsBlock title="🟧 PagSeguro/PagBank — Produção"
        instructions={
          <Instructions
            steps={[
              'Conta verificada em https://pagseguro.uol.com.br',
              'Painel: Vendas → Conexões → "Gerar API Token" (escolha "Pagamentos")',
              'Cole abaixo. O sistema usa a API REST /orders e /checkouts',
            ]}
            link="https://dev.pagbank.uol.com.br/reference/orders-introducao" />
        }>
        <SingleField label="Token de API (Produção)" value={pg.pagseguro_producao?.api_token || ''}
          onChange={v => setPg(p => ({ ...p, pagseguro_producao: { ...p.pagseguro_producao, api_token: v } }))}
          placeholder="Bearer Token longo..." secret />
      </CredentialsBlock>

      {/* Webhooks - urls a configurar nos painéis dos gateways */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600, marginBottom: '0.6rem' }}>📡 URLs de Webhook</p>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Configure cada URL no painel do respectivo gateway. Substitua <code>seudominio.com</code> pela sua URL pública (ex: <code>https://abc.trycloudflare.com</code>).
        </p>
        <WebhookRow label="Asaas" path="/api/pagamento/webhook/asaas"
          extra="No painel Asaas: Integrações → Webhooks → Adicionar URL. Selecione eventos PAYMENT_RECEIVED e PAYMENT_CONFIRMED." />
        <WebhookRow label="Stripe" path="/api/pagamento/webhook/stripe"
          extra="No painel Stripe: Developers → Webhooks → Add endpoint. Evento payment_intent.succeeded. Copie o Signing secret para STRIPE_WEBHOOK_SECRET no .env." />
        <WebhookRow label="Mercado Pago" path="/api/pagamento/webhook/mercadopago"
          extra='Em "Suas integrações" → sua app → Webhooks → editar. Cole a URL e marque o tópico "Pagamentos". Copie a "chave secreta" para MERCADOPAGO_WEBHOOK_SECRET (.env).' />
        <WebhookRow label="PagSeguro" path="/api/pagamento/webhook/pagseguro"
          extra='No painel PagBank → Notificações de transação → cole a URL. A chave de validação opcional vai em PAGSEGURO_WEBHOOK_SECRET (.env).' />
        <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.5rem', lineHeight: 1.5 }}>
          ⚠️ Webhooks confirmam pagamentos mesmo se o cliente fechar o navegador.
          Sem eles o sistema só sabe que pagou via polling do status (mais lento).
        </p>
      </div>

      <button className={`btn ${isDirty ? 'btn-state-dirty' : 'btn-state-clean'}`} onClick={onSavePg} disabled={savingPg || !isDirty}>
        {savingPg ? <><div className="spinner" /> Salvando...</> : '💾 Salvar Configurações de Pagamento'}
      </button>
      </fieldset>
    </div>
  )
}

// ─── Helpers visuais ─────────────────────────────────────────────────────────
function CredentialsBlock({ title, instructions, children }) {
  const [showInstr, setShowInstr] = useState(false)
  return (
    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '1rem', margin: 0, color: 'var(--text)' }}>{title}</h3>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowInstr(s => !s)}
          style={{ fontSize: '0.72rem' }}>
          {showInstr ? 'ocultar' : '📖 como configurar'}
        </button>
      </div>
      {showInstr && <div style={{ marginBottom: '0.75rem' }}>{instructions}</div>}
      {children}
    </div>
  )
}

function Instructions({ steps, link }) {
  return (
    <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
      <ol style={{ margin: 0, paddingLeft: '1.1rem' }}>
        {steps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>
      {link && (
        <a href={link} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '0.4rem', color: 'var(--accent)', fontSize: '0.74rem' }}>
          📄 Doc oficial →
        </a>
      )}
    </div>
  )
}

function FormPair({ label1, value1, onChange1, label2, value2, onChange2, ph1, ph2, secret2 = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">{label1}</label>
        <input aria-label={label1} type="text" className="form-input" placeholder={ph1}
          value={value1} onChange={e => onChange1(e.target.value)} />
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">{label2}</label>
        <input aria-label={label2} type={secret2 ? 'password' : 'text'} className="form-input" placeholder={ph2}
          value={value2} onChange={e => onChange2(e.target.value)} />
      </div>
    </div>
  )
}

function SingleField({ label, value, onChange, placeholder, secret = false }) {
  return (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label">{label}</label>
      <input aria-label={label} type={secret ? 'password' : 'text'} className="form-input"
        placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.85rem', cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
      {label}
    </label>
  )
}

function WebhookRow({ label, path, extra }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : `https://seudominio.com${path}`
  function copy() {
    try { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }
  return (
    <div style={{ marginBottom: '0.6rem', padding: '0.5rem 0.75rem', background: 'var(--bg-input)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.78rem', color: 'var(--text)', minWidth: '95px' }}>{label}:</strong>
        <code style={{ flex: 1, fontSize: '0.72rem', color: 'var(--accent)', wordBreak: 'break-all' }}>{url}</code>
        <button type="button" onClick={copy}
          className="btn btn-sm btn-ghost" style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}>
          {copied ? '✓' : '📋'}
        </button>
      </div>
      {extra && <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', margin: '0.25rem 0 0', lineHeight: 1.45 }}>{extra}</p>}
    </div>
  )
}
