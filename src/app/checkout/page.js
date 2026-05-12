'use client'
// src/app/checkout/page.js — Checkout com pagamento real

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Navbar from '../../components/Navbar'
import Footer from '../../components/Footer'
import { getAvailablePaymentMethods, resolvePaymentGateways } from '../../lib/commerceUtils'
import { applyNextImageFallback, getFirstUrl, getPhotoCartPreviewCandidates } from '@/lib/imagePaths'
import { validarCPF, normalizarCPF, mascararCPFTempoReal } from '@/lib/cpf'
import { validarCNPJ, normalizarCNPJ, mascararCNPJTempoReal } from '@/lib/cnpj'
import { buildWhatsAppHref, formatarWhatsApp, mascararWhatsAppTempoReal, normalizarWhatsApp } from '@/lib/whatsapp'
import { confirmarNomeComUmaPalavra } from '@/lib/nome'
import { clearGuestCart, persistGuestCart, readGuestCart } from '@/lib/guestCart'
import { getEffectivePrice, isPhotoFree } from '@/lib/freeAccess'
import { resolveEventDiscountConfig } from '@/lib/pricing'

function gerarLinkWA(config, nome, whatsapp, pedido) {
  const num = normalizarWhatsApp(config.whatsapp)
  if (!num) return ''
  const lista = pedido.itens.map((item, i) =>
    `  ${i + 1}. ${item.eventName} — #${item.publicId || item.photoId?.slice(0, 8)} (R$ ${Number(item.price).toFixed(2).replace('.', ',')})`
  ).join('\n')
  const msg = `Olá! Acabei de finalizar um pedido.\n\n👤 Nome: ${nome}\n📱 WhatsApp: ${whatsapp}\n🔑 Pedido: ${pedido.id.slice(0, 8).toUpperCase()}\n\n🛒 *Fotos:*\n${lista}\n\n💰 *Total: R$ ${Number(pedido.total).toFixed(2).replace('.', ',')}*\n\nAguardo confirmação!`
  return `${buildWhatsAppHref(num)}?text=${encodeURIComponent(msg)}`
}

function buildStatusHref(pedidoId, statusToken) {
  if (!pedidoId) return '/api/pagamento/status'
  const params = new URLSearchParams({ pedidoId })
  if (statusToken) params.set('token', statusToken)
  return `/api/pagamento/status?${params.toString()}`
}

function mergeCartItems(primary = [], secondary = []) {
  const result = []
  const seen = new Set()
  for (const item of [...primary, ...secondary]) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    result.push(item)
  }
  return result
}

function maskDocument(value, type) {
  return type === 'cnpj' ? mascararCNPJTempoReal(value) : mascararCPFTempoReal(value)
}

function normalizeDocument(value, type) {
  return type === 'cnpj' ? normalizarCNPJ(value) : normalizarCPF(value)
}

function validateDocument(value, type) {
  return type === 'cnpj' ? validarCNPJ(value) : validarCPF(value)
}

// ── PIX ─────────────────────────────────────────────────────────────────────
function PixScreen({ pagamento, pedidoId, statusToken, onPaid }) {
  const [copied, setCopied] = useState(false)
  const [checking, setChecking] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        setChecking(true)
        const res = await fetch(buildStatusHref(pedidoId, statusToken))
        const d = await res.json()
        if (d.paid) { clearInterval(poll); onPaid(d.pedido, d.downloadToken || null) }
      } catch { } finally { setChecking(false) }
    }, 5000)
    const timer = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => { clearInterval(poll); clearInterval(timer) }
  }, [pedidoId, statusToken, onPaid])

  const mins = Math.floor(elapsed / 60), secs = elapsed % 60
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚡</div>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', marginBottom: '0.25rem' }}>Pague via PIX</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Escaneie o QR Code ou copie o código</p>
      {(pagamento.pixQR || pagamento.pixQRUrl)
        ? <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <img
              src={pagamento.pixQR ? `data:image/png;base64,${pagamento.pixQR}` : pagamento.pixQRUrl}
              alt="QR PIX"
              style={{ width: 200, height: 200, border: '4px solid var(--border)', borderRadius: 'var(--radius)', background: '#fff' }}
            />
          </div>
        : <div style={{ width: 200, height: 200, margin: '0 auto 1.25rem', background: 'var(--bg-input)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>QR indisponível</div>
      }
      {pagamento.pixCode && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', fontSize: '0.72rem', color: 'var(--text-muted)', wordBreak: 'break-all', textAlign: 'left', maxHeight: 80, overflow: 'auto', marginBottom: '0.5rem' }}>
            {pagamento.pixCode}
          </div>
          <button onClick={() => { navigator.clipboard.writeText(pagamento.pixCode); setCopied(true); setTimeout(() => setCopied(false), 3000) }} className="btn btn-primary btn-full">
            {copied ? '✅ Copiado!' : '📋 Copiar Código PIX'}
          </button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
        <div className="spinner" style={{ width: 14, height: 14, opacity: 0.6 }} />
        Aguardando... {mins > 0 ? `${mins}m ` : ''}{secs}s
        {checking && <span style={{ color: 'var(--accent)' }}> · verificando</span>}
      </div>
    </div>
  )
}

// ── BOLETO ──────────────────────────────────────────────────────────────────
function BoletoScreen({ pagamento, pedidoId, statusToken, onPaid }) {
  useEffect(() => {
    const poll = setInterval(async () => {
      const res = await fetch(buildStatusHref(pedidoId, statusToken)).catch(() => null)
      if (!res) return
      const d = await res.json()
      if (d.paid) { clearInterval(poll); onPaid(d.pedido, d.downloadToken || null) }
    }, 15000)
    return () => clearInterval(poll)
  }, [pedidoId, statusToken, onPaid])

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏦</div>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', marginBottom: '0.25rem' }}>Boleto Bancário</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Vence em 3 dias úteis</p>
      {pagamento.boletoUrl && (
        <a href={pagamento.boletoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-full" style={{ marginBottom: '1rem', textDecoration: 'none', display: 'block' }}>
          📄 Abrir Boleto
        </a>
      )}
      {pagamento.boletoField && (
        <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.35rem' }}>Linha digitável:</p>
          <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', fontSize: '0.8rem', wordBreak: 'break-all', fontFamily: 'monospace' }}>
            {pagamento.boletoField}
          </div>
        </div>
      )}
      <div className="alert alert-info" style={{ textAlign: 'left' }}>
        ℹ️ Os downloads serão liberados automaticamente após a compensação do boleto (até 1 dia útil).
      </div>
    </div>
  )
}

// ── CARTÃO (Asaas link hospedado OU Stripe embutido) ─────────────────────────
function CartaoScreen({ pagamento, pedidoId, statusToken, stripePublicKey, onPaid }) {
  // Asaas: redireciona para o link de pagamento hospedado pelo Asaas
  if (pagamento.asaasPaymentLink) {
    return <AsaasCartaoScreen pagamento={pagamento} pedidoId={pedidoId} statusToken={statusToken} onPaid={onPaid} />
  }
  // Stripe: widget embutido
  if (pagamento.clientSecret && stripePublicKey) {
    return <StripeCardScreen pagamento={pagamento} pedidoId={pedidoId} statusToken={statusToken} stripePublicKey={stripePublicKey} onPaid={onPaid} />
  }
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <p style={{ color: 'var(--danger)' }}>⚠ Link de pagamento não disponível. Tente novamente ou escolha PIX.</p>
    </div>
  )
}

function AsaasCartaoScreen({ pagamento, pedidoId, statusToken, onPaid }) {
  const [checking, setChecking] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        setChecking(true)
        const res = await fetch(buildStatusHref(pedidoId, statusToken))
        const d = await res.json()
        if (d.paid) { clearInterval(poll); onPaid(d.pedido, d.downloadToken || null) }
      } catch { } finally { setChecking(false) }
    }, 6000)
    const timer = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => { clearInterval(poll); clearInterval(timer) }
  }, [pedidoId, statusToken, onPaid])

  const mins = Math.floor(elapsed / 60), secs = elapsed % 60

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>💳</div>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', marginBottom: '0.25rem' }}>Cartão de Crédito</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Você será redirecionado para a página de pagamento segura do Asaas
      </p>
      <a
        href={pagamento.asaasPaymentLink}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setOpened(true)}
        className="btn btn-primary btn-full btn-lg"
        style={{ textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}
      >
        🔒 Pagar com Cartão
      </a>
      {opened && (
        <div className="alert alert-info" style={{ textAlign: 'left', marginBottom: '1rem' }}>
          ✅ Página de pagamento aberta. Após finalizar o pagamento lá, a confirmação aqui é automática.
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
        <div className="spinner" style={{ width: 14, height: 14, opacity: 0.6 }} />
        Aguardando confirmação... {mins > 0 ? `${mins}m ` : ''}{secs}s
        {checking && <span style={{ color: 'var(--accent)' }}> · verificando</span>}
      </div>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.75rem' }}>
        🔒 Dados do cartão processados diretamente pelo Asaas — nunca passam pelo nosso servidor.
      </p>
    </div>
  )
}

function StripeCardScreen({ pagamento, pedidoId, statusToken, stripePublicKey, onPaid }) {
  const cardRef = useRef(null)
  const stripeRef = useRef(null)
  const cardElRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [paying, setPaying] = useState(false)
  const [cardErr, setCardErr] = useState('')

  useEffect(() => {
    const init = () => {
      stripeRef.current = window.Stripe(stripePublicKey)
      const els = stripeRef.current.elements()
      cardElRef.current = els.create('card', {
        style: { base: { color: '#e0e0e0', fontFamily: 'system-ui,sans-serif', fontSize: '16px', '::placeholder': { color: '#888' } }, invalid: { color: '#ef4444' } },
      })
      cardElRef.current.mount(cardRef.current)
      cardElRef.current.on('change', e => setCardErr(e.error?.message || ''))
      setReady(true)
    }
    if (window.Stripe) { init(); return }
    const s = document.createElement('script'); s.src = 'https://js.stripe.com/v3/'; s.onload = init
    document.head.appendChild(s)
    return () => { if (cardElRef.current) cardElRef.current.destroy() }
  }, [stripePublicKey])

  async function handlePay() {
    if (!stripeRef.current || !cardElRef.current) return
    setPaying(true); setCardErr('')
    try {
      const result = await stripeRef.current.confirmCardPayment(pagamento.clientSecret, {
        payment_method: { card: cardElRef.current },
      })
      if (result.error) { setCardErr(result.error.message) }
      else if (result.paymentIntent.status === 'succeeded') {
        const res = await fetch(buildStatusHref(pedidoId, statusToken))
        const d = await res.json()
        onPaid(d.pedido, d.downloadToken || null)
      }
    } catch (err) { setCardErr(err.message) } finally { setPaying(false) }
  }

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>💳</div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', marginBottom: '0.25rem' }}>Cartão de Crédito</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Pagamento seguro via Stripe</p>
      </div>
      <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '0.75rem', minHeight: 46 }}>
        <div ref={cardRef} />
        {!ready && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-dim)', fontSize: '0.8rem' }}><div className="spinner" style={{ width: 14, height: 14 }} /> Carregando...</div>}
      </div>
      {cardErr && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>⚠ {cardErr}</p>}
      <button className="btn btn-primary btn-full btn-lg" onClick={handlePay} disabled={!ready || paying}>
        {paying ? <><div className="spinner" /> Processando...</> : '🔒 Pagar com Cartão'}
      </button>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: '0.75rem' }}>
        🔒 Dados de cartão protegidos pela Stripe.
      </p>
    </div>
  )
}

// ── SUCESSO ──────────────────────────────────────────────────────────────────
function buildSecureDownloadHref(photoId, pedidoId, downloadToken) {
  if (!photoId) return '#'
  const base = `/api/photos/${photoId}/download`
  if (!pedidoId || !downloadToken) return base
  const params = new URLSearchParams({
    pedidoId,
    token: downloadToken,
  })
  return `${base}?${params.toString()}`
}

function SuccessScreen({ pedido, form, config, downloadToken }) {
  const waLink = gerarLinkWA(config, form.nome, form.whatsapp, pedido)
  const [fbRating, setFbRating] = useState(0)
  const [fbText, setFbText] = useState('')
  const [fbSent, setFbSent] = useState(false)
  const [fbLoading, setFbLoading] = useState(false)

  const isSimulated = pedido.pagamento?.gateway === 'manual' || pedido.pagamento?.gateway === 'asaas_sandbox'

  return (
    <div className="checkout-card checkout-success">
      <div className="success-icon">🎉</div>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.2rem', marginBottom: '0.5rem' }}>Pagamento Confirmado!</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Obrigado, <strong style={{ color: 'var(--text)' }}>{form.nome}</strong>!</p>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '2rem' }}>
        Pedido <code style={{ color: 'var(--accent)' }}>#{pedido.id.slice(0, 8).toUpperCase()}</code>
      </p>
      {isSimulated && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '2rem', textAlign: 'center' }}>
          <p style={{ color: '#856404', fontSize: '0.95rem', margin: 0, fontWeight: 500 }}>
            ⚠️ <strong>Pagamento Simulado</strong> — Nenhuma cobrança real foi realizada
          </p>
        </div>
      )}
      {waLink && (
        <a href={waLink} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', background: '#25D366', color: '#fff', padding: '0.85rem 2rem', borderRadius: 'var(--radius)', fontSize: '1rem', fontWeight: 500, textDecoration: 'none', marginBottom: '2rem' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.998 0C5.373 0 0 5.373 0 11.998c0 2.117.554 4.103 1.523 5.83L.044 24l6.345-1.454A11.95 11.95 0 0 0 11.998 24C18.625 24 24 18.627 24 11.998 24 5.373 18.625 0 11.998 0zm0 21.818a9.814 9.814 0 0 1-5.007-1.371l-.36-.214-3.766.863.896-3.664-.235-.374A9.823 9.823 0 0 1 2.18 11.998c0-5.423 4.395-9.818 9.818-9.818 5.423 0 9.818 4.395 9.818 9.818 0 5.424-4.395 9.82-9.818 9.82z"/></svg>
          Avisar o fotógrafo pelo WhatsApp
        </a>
      )}
      <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', marginBottom: '0.75rem' }}>📥 Suas fotos originais:</p>
      <div className="download-list" style={{ textAlign: 'left' }}>
        {pedido.itens.map((item, i) => (
          <div key={i} className="download-item">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {(() => {
                const thumbCandidates = getPhotoCartPreviewCandidates(item)
                return (
                  <img
                    src={getFirstUrl(thumbCandidates)}
                    alt=""
                    style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 4 }}
                    onError={e => {
                      if (!applyNextImageFallback(e.target, thumbCandidates)) {
                        e.target.style.display = 'none'
                      }
                    }}
                  />
                )
              })()}
              <div>
                <p style={{ fontSize: '0.85rem' }}>{item.eventName}{item.publicId && <span style={{ color: 'var(--accent)', marginLeft: '0.5rem', fontSize: '0.75rem' }}>#{item.publicId}</span>}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>R$ {Number(item.price).toFixed(2).replace('.', ',')}</p>
              </div>
            </div>
            <a href={buildSecureDownloadHref(item.photoId || item.id || null, pedido.id, downloadToken)} download={item.originalName || item.filename} className="btn btn-success btn-sm">⬇ Baixar</a>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '2.5rem', padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
        {fbSent
          ? <p style={{ color: 'var(--success)', fontWeight: 600 }}>Obrigado pelo feedback! ⭐</p>
          : <>
              <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', marginBottom: '0.75rem' }}>Como foi sua experiência?</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.35rem', marginBottom: '1rem' }}>
                {[1,2,3,4,5].map(star => <button key={star} type="button" onClick={() => setFbRating(star)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.8rem', color: star <= fbRating ? '#f5a623' : 'var(--text-dim)' }}>★</button>)}
              </div>
              <textarea placeholder="Comentário opcional" value={fbText} onChange={e => setFbText(e.target.value)} rows={3} className="form-input" style={{ marginBottom: '1rem', resize: 'vertical' }} />
              <button className="btn btn-primary" disabled={fbLoading || fbRating === 0} onClick={async () => {
                setFbLoading(true)
                try { await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoId: pedido.id, rating: fbRating, comment: fbText.trim() }) }); setFbSent(true) } catch {} finally { setFbLoading(false) }
              }}>{fbLoading ? 'Enviando...' : 'Enviar Feedback'}</button>
            </>
        }
      </div>
      <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <Link href="/" className="btn btn-secondary">← Ver Mais Eventos</Link>
      </div>
    </div>
  )
}

// ── Cálculo de taxa de parcelamento ──────────────────────────────────────────
// Fotógrafo absorve taxa PIX (0.99%); no cartão parcelado, repassa apenas o excedente.
const TAXA_PIX = 0.0099
const TAXA_CARTAO_MENSAL = 0.0299  // 2.99%/mês

function calcInstallmentFee(base, parcelas) {
  if (parcelas <= 1) return 0
  const totalComJuros = base * Math.pow(1 + TAXA_CARTAO_MENSAL, parcelas)
  const taxaCartao = totalComJuros - base
  const taxaPix = base * TAXA_PIX
  return Math.max(0, Math.round((taxaCartao - taxaPix) * 100) / 100)
}

// ── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function CheckoutPage() {
  const [cartItems, setCartItems] = useState([])
  const [removedIds, setRemovedIds] = useState(new Set())
  const [loaded, setLoaded] = useState(false)
  const [config, setConfig] = useState({ whatsapp: '', pagamento: null })
  const [eventosInfo, setEventosInfo] = useState({})
  const [prevPaidByEvent, setPrevPaidByEvent] = useState({})
  const [form, setForm] = useState({ nome: '', whatsapp: '', email: '' })
  const [cpf, setCpf] = useState('')
  const [documentType, setDocumentType] = useState('cpf')
  const [clientComment, setClientComment] = useState('')
  const [clienteLogado, setClienteLogado] = useState(null)
  const [errors, setErrors] = useState({})
  const [metodo, setMetodo] = useState(null)
  const [parcelas, setParcelas] = useState(1)
  const [loading, setLoading] = useState(false)
  const [pedido, setPedido] = useState(null)
  const [downloadToken, setDownloadToken] = useState(null)
  const [pagamento, setPagamento] = useState(null)
  const [step, setStep] = useState('form')
  const [cupomCodigo, setCupomCodigo] = useState('')
  const [cupomAplicado, setCupomAplicado] = useState(null)
  const [cupomErro, setCupomErro] = useState('')
  const [validandoCupom, setValidandoCupom] = useState(false)
  const [rewards, setRewards] = useState(null)
  const [saldoUsar, setSaldoUsar] = useState('')
  const [propostasInfo, setPropostasInfo] = useState(null)

  const pgConfig = config.pagamento || {}
  const metodosAtivos = getAvailablePaymentMethods(pgConfig)
  const isAdminUser = !!(clienteLogado?.isAdmin || clienteLogado?.isSuperAdmin)
  const isAdminBypass = metodo === 'admin_bypass'
  const gateway = (!isAdminBypass && metodo) ? (resolvePaymentGateways(pgConfig, metodo).effectivePrimary || null) : null
  const isManual = gateway === 'manual'

  useEffect(() => {
    if (metodo === 'admin_bypass') return // não sobrescrever opção admin
    if (metodosAtivos.length === 0) {
      if (metodo) setMetodo(null)
      return
    }
    if (!metodo || !metodosAtivos.includes(metodo)) setMetodo(metodosAtivos[0])
  }, [JSON.stringify(metodosAtivos), metodo])

  useEffect(() => {
    if (metodo !== 'cartao') setParcelas(1)
  }, [metodo])

  // Restore previously-applied cupom from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('cupomAplicado')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.codigo) {
          setCupomAplicado(parsed)
          setCupomCodigo(parsed.codigo)
        }
      }
    } catch {}
  }, [])

  // Load rewards info for logged-in clients
  useEffect(() => {
    if (!clienteLogado?.id) { setRewards(null); return }
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/rewards/me')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setRewards(data)
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [clienteLogado?.id])

  // Load propostas info
  useEffect(() => {
    if (!clienteLogado?.id) { setPropostasInfo(null); return }
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/propostas?meu=1')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setPropostasInfo(data)
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [clienteLogado?.id])

  const propostaAtiva = (() => {
    if (!Array.isArray(propostasInfo?.propostas)) return null
    return propostasInfo.propostas.find(p =>
      ['aceita', 'aceita_pelo_cliente'].includes(p.status)
    ) || null
  })()

  useEffect(() => {
    async function load() {
      try {
        let loggedClient = null
        try {
          const raw = localStorage.getItem('clienteLogado')
          if (raw) {
            const cli = JSON.parse(raw)
            if (cli?.id) loggedClient = cli
          }
        } catch {}

        const localCart = readGuestCart()
        let serverCart = []
        let serverComment = null
        if (loggedClient?.id) {
          try {
            const res = await fetch('/api/carrinhos?meu=1')
            if (res.ok) {
              const data = await res.json()
              serverCart = Array.isArray(data.carrinho) ? data.carrinho : []
              serverComment = typeof data.clientComment === 'string' ? data.clientComment : null
            }
          } catch {}
        }
        const saved = mergeCartItems(serverCart, localCart)
        if (serverComment) setClientComment(serverComment)
        setCartItems(saved)
        if (saved.length > 0) {
          const eids = [...new Set(saved.map(i => i.eventId))]
          const [pRes, eRes] = await Promise.all([
            Promise.all(eids.map(async (eid) => {
              try {
                const response = await fetch(`/api/photos?eventId=${eid}`)
                if (!response.ok) return { eventId: eid, photos: null }
                const photos = await response.json()
                return { eventId: eid, photos: Array.isArray(photos) ? photos : [] }
              } catch {
                return { eventId: eid, photos: null }
              }
            })),
            Promise.all(eids.map(eid => fetch(`/api/events/${eid}`).then(r=>r.json()).catch(()=>null))),
          ])
          const photosByEvent = new Map(pRes.map(entry => [entry.eventId, entry.photos]))
          const removidas = new Set()
          for (const item of saved) {
            const eventPhotos = photosByEvent.get(item.eventId)
            if (!Array.isArray(eventPhotos)) continue
            if (!eventPhotos.some(photo => photo.id === item.id)) removidas.add(item.id)
          }
          setRemovedIds(removidas)
          const evMap = {}; eids.forEach((eid,i)=>{ if(eRes[i]) evMap[eid]=eRes[i] }); setEventosInfo(evMap)

            const normalizedCart = saved.map(item => {
              const eventPhotos = photosByEvent.get(item.eventId)
              const matched = Array.isArray(eventPhotos) ? eventPhotos.find(p => p.id === item.id) : null
              const photoData = matched || item
              const ev = evMap[item.eventId]
              const priceEffective = getEffectivePrice(photoData, ev)
              const basePrice = Number(photoData?.price ?? item.price)
              return {
                ...item,
                price: priceEffective,
                priceOriginal: Number.isFinite(basePrice) ? basePrice : priceEffective,
                priceEffective,
                isFree: isPhotoFree(photoData, ev),
              }
            })
            setCartItems(normalizedCart)
            persistGuestCart(normalizedCart)
          }
        } catch { } finally { setLoaded(true) }
      }
    load()
    fetch('/api/config').then(r=>r.json()).then(setConfig).catch(()=>{})
    fetch('/api/pedidos?meu=1').then(r => r.ok ? r.json() : []).then(pedidos => {
      const map = {}
      ;(Array.isArray(pedidos) ? pedidos : [])
        .filter(p => ['pago', 'liberado_manual'].includes(String(p.status || '').toLowerCase()))
        .forEach(p => {
          (p.itens || p.items || []).forEach(item => {
            const price = Number(item.price || item.priceOriginal || 0)
            if (price <= 0 || !item.eventId) return
            map[item.eventId] = (map[item.eventId] || 0) + 1
          })
        })
      setPrevPaidByEvent(map)
    }).catch(() => setPrevPaidByEvent({}))
    try {
      const raw = localStorage.getItem('clienteLogado')
      if (raw) {
        const cli = JSON.parse(raw)
        if (cli?.id) {
          const type = cli.documentType === 'cnpj' || cli.cnpj ? 'cnpj' : 'cpf'
          setClienteLogado(cli)
          setDocumentType(type)
          setForm(p=>({...p,nome:cli.nomeCompleto||'',whatsapp:mascararWhatsAppTempoReal(cli.whatsapp||''),email:cli.email||''}))
          setCpf(maskDocument(cli.cnpj || cli.cpf || '', type))
        }
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (!clienteLogado?.id) return
    fetch('/api/carrinhos?meu=1')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data && typeof data.clientComment === 'string') {
          setClientComment(data.clientComment)
        }
      })
      .catch(() => {})
  }, [clienteLogado?.id])

  useEffect(() => {
    if (!clienteLogado?.id || !loaded) return
    const timeoutId = setTimeout(() => {
      fetch('/api/carrinhos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carrinho: cartItems,
          clientComment,
        }),
      }).catch(() => {})
    }, 350)
    return () => clearTimeout(timeoutId)
  }, [clienteLogado?.id, loaded, cartItems, clientComment])

  const itens = cartItems.filter(i => !removedIds.has(i.id))

  function calcDesc(eid, qtd) {
    const ev = eventosInfo[eid]
    const globalCfg = {
      descontosGlobais: Array.isArray(config?.descontosGlobais) ? config.descontosGlobais : [],
      descontosGlobaisAtivos: !!config?.descontosGlobaisAtivos,
    }
    const { table, ativos } = resolveEventDiscountConfig(ev, globalCfg)
    if (!ativos || !table.length) return 0
    const effectiveQty = qtd + (Number(prevPaidByEvent[eid]) || 0)
    const faixas = [...table].sort((a,b)=>b.quantidade-a.quantidade)
    for (const f of faixas) if (effectiveQty >= f.quantidade) return f.desconto; return 0
  }

  const descInfo = (() => {
    const groups = {}; itens.forEach(item=>{ if(!groups[item.eventId]) groups[item.eventId]=[]; groups[item.eventId].push(item) })
    let sub=0,totalD=0; const linhas=[]
    for (const [eid,items] of Object.entries(groups)) {
        const pricedItems = items.filter(i => Number(i.price) > 0)
        const s=pricedItems.reduce((a,i)=>a+Number(i.price),0), pct=calcDesc(eid,pricedItems.length), d=pct>0?s*(pct/100):0
        sub+=s; totalD+=d; if(pct>0) linhas.push({nomeEvento:items[0].eventName,pct,valor:d})
    }
    return {subtotal:sub,totalDesconto:totalD,linhas,total:sub-totalD}
  })()

  const totalAposProgressivo = descInfo.total

  // Proposta aceita SUBSTITUI todos os descontos automaticos
  const valorProposta = propostaAtiva
    ? (propostaAtiva.status === 'aceita_pelo_cliente' ? Number(propostaAtiva.valorContraproposta) : Number(propostaAtiva.valorPropostoCliente))
    : null

  const cupomDesconto = (!propostaAtiva && cupomAplicado) ? Math.min(Number(cupomAplicado.desconto || 0), totalAposProgressivo) : 0
  const totalAposCupom = Math.max(0, Math.round((totalAposProgressivo - cupomDesconto) * 100) / 100)

  // Rewards: level discount + saldo (somente se nao ha proposta)
  const rewardsAtivo = !!rewards?.ativo && !propostaAtiva
  const descontoNivelPct = rewardsAtivo ? Number(rewards?.beneficio?.descontoPct || 0) : 0
  const descontoNivel = (rewardsAtivo && descontoNivelPct > 0)
    ? Math.round(totalAposCupom * descontoNivelPct) / 100
    : 0
  const totalAposNivel = Math.max(0, Math.round((totalAposCupom - descontoNivel) * 100) / 100)

  const saldoDisponivel = rewardsAtivo ? Number(rewards?.saldo || 0) : 0
  const saldoSolicitadoNum = Math.max(0, Number(saldoUsar) || 0)
  const saldoUtilizado = Math.min(saldoSolicitadoNum, saldoDisponivel, totalAposNivel)
  const total = propostaAtiva && valorProposta != null
    ? Math.max(0, Math.round(valorProposta * 100) / 100)
    : Math.max(0, Math.round((totalAposNivel - saldoUtilizado) * 100) / 100)

  const cashbackPct = rewardsAtivo ? Number(rewards?.beneficio?.cashbackPct || 0) : 0
  const cashbackProjetado = (cashbackPct > 0 && total > 0)
    ? Math.round(total * cashbackPct) / 100
    : 0
  const saldoFlatProjetado = rewardsAtivo ? Number(rewards?.beneficio?.saldoFlat || 0) : 0

  const isFree = total === 0

  // Taxa de parcelamento (só para cartão com parcelas > 1)
  const taxaParcelamento = (!isManual && !isFree && !isAdminBypass && metodo === 'cartao') ? calcInstallmentFee(total, parcelas) : 0
  const totalFinal = total + taxaParcelamento
  const valorParcela = parcelas > 0 ? totalFinal / parcelas : totalFinal

  async function aplicarCupom() {
    const codigoNorm = cupomCodigo.trim().toUpperCase()
    if (!codigoNorm) { setCupomErro('Informe o código.'); return }
    if (itens.length === 0) { setCupomErro('Carrinho vazio.'); return }
    setValidandoCupom(true); setCupomErro('')
    try {
      const res = await fetch('/api/cupons/validar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: codigoNorm, items: itens.map(i => ({ id: i.id, eventId: i.eventId })) }),
      })
      const data = await res.json()
      if (!data.valido) {
        setCupomAplicado(null)
        try { localStorage.removeItem('cupomAplicado') } catch {}
        setCupomErro(data.error || 'Cupom inválido.')
        return
      }
      const aplicado = { codigo: data.codigo, tipo: data.tipo, valor: data.valor, desconto: data.desconto, descricao: data.descricao }
      setCupomAplicado(aplicado); setCupomCodigo(aplicado.codigo); setCupomErro('')
      try { localStorage.setItem('cupomAplicado', JSON.stringify(aplicado)) } catch {}
    } catch {
      setCupomErro('Erro ao validar cupom.')
    } finally {
      setValidandoCupom(false)
    }
  }

  function removerCupom() {
    setCupomAplicado(null); setCupomCodigo(''); setCupomErro('')
    try { localStorage.removeItem('cupomAplicado') } catch {}
  }

  function validate() {
    const e={}
    if (!form.nome.trim()) e.nome='Informe seu nome'
    if (!form.whatsapp.trim()) e.whatsapp='Informe seu WhatsApp'
    else if (form.whatsapp.replace(/\D/g,'').length<10) e.whatsapp='WhatsApp inválido'
    const documentDigits = normalizeDocument(cpf, documentType)
    if (!cpf.trim()) e.cpf=`Informe seu ${documentType === 'cnpj' ? 'CNPJ' : 'CPF'}`
    else if (!validateDocument(documentDigits, documentType)) e.cpf=`${documentType === 'cnpj' ? 'CNPJ' : 'CPF'} inválido`
    if (!isAdminBypass && !isManual && !isFree && !metodo) e.metodo='Selecione uma forma de pagamento'
    return e
  }

  const clearCartAfterSuccess = useCallback(async () => {
    clearGuestCart()
    setCartItems([])
    setRemovedIds(new Set())
    setClientComment('')
    setCupomAplicado(null)
    setCupomCodigo('')
    try { localStorage.removeItem('cupomAplicado') } catch {}
    window.dispatchEvent(new Event('cartUpdated'))

    if (!clienteLogado?.id) return
    try {
      await fetch('/api/carrinhos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carrinho: [],
          clientComment: null,
        }),
      })
    } catch {}
  }, [clienteLogado?.id])

  const handlePaid = useCallback((p, token = null) => {
    setPedido(p)
    setDownloadToken(token)
    setStep('success')
    clearCartAfterSuccess()
  }, [clearCartAfterSuccess])

  async function handleSubmit(e) {
    e.preventDefault(); const errs=validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true); setErrors({})
    try {
      if (!confirmarNomeComUmaPalavra(form.nome, 'continuar')) {
        setLoading(false)
        return
      }
      const res = await fetch('/api/pagamento', {
        method: 'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ nome:form.nome.trim(), whatsapp:normalizarWhatsApp(form.whatsapp), email:form.email.trim()||null, cpf:normalizeDocument(cpf, documentType), documentType, cnpj:documentType==='cnpj'?normalizeDocument(cpf, documentType):null, clientId:clienteLogado?.id||null, itens, metodo:(isManual||isFree||isAdminBypass)?null:metodo, adminBypass:isAdminBypass||undefined, parcelas:(metodo==='cartao'&&!isManual&&!isFree&&!isAdminBypass)?parcelas:1, clientComment: clientComment.trim() || null, cupomCodigo: propostaAtiva ? null : (cupomAplicado?.codigo || null), saldoUtilizado: (propostaAtiva || saldoUtilizado <= 0) ? 0 : saldoUtilizado, propostaId: propostaAtiva?.id || null }),
      })
      if (!res.ok) { const d=await res.json(); throw new Error(d.error||'Erro ao criar pedido') }
      const {pedido:novoPedido, pagamento:charge, downloadToken:responseDownloadToken} = await res.json()
      if (isManual || isAdminBypass || novoPedido.status==='pago') {
        setPedido(novoPedido)
        setDownloadToken(responseDownloadToken || null)
        setStep('success')
        clearCartAfterSuccess()
      } else {
        setPedido(novoPedido); setPagamento(charge); setDownloadToken(responseDownloadToken || null); setStep('payment')
      }
    } catch (err) { setErrors({submit:err.message}) } finally { setLoading(false) }
  }

  if (!loaded) return <><Navbar /><div className="flex-center" style={{minHeight:'60vh'}}><div className="spinner" style={{width:32,height:32}}/></div></>

  if (cartItems.length===0 && step==='form') return (
    <><Navbar /><main className="page-container"><h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Checkout</h1><div className="empty-state"><div className="empty-state-icon">🛒</div><h2 className="empty-state-title">Carrinho vazio</h2><Link href="/" className="btn btn-primary mt-3">Ver Eventos</Link></div></main><Footer /></>
  )

  return (
    <><Navbar />
      <main className="page-container">
        <h1 className="visually-hidden" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Checkout</h1>
        <div className="checkout-layout">

          {step==='success' && pedido && <SuccessScreen pedido={pedido} form={form} config={config} downloadToken={downloadToken} />}

          {step==='payment' && pedido && pagamento && (
            <div style={{maxWidth:480,margin:'0 auto'}}>
              <div style={{textAlign:'center',marginBottom:'1.5rem'}}>
                <p style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>
                  Pedido <code style={{color:'var(--accent)'}}>#{pedido.id.slice(0,8).toUpperCase()}</code>{' '}·{' '}
                  <strong style={{color:'var(--text)'}}>R$ {Number(pedido.total).toFixed(2).replace('.',',')}</strong>
                </p>
              </div>
              <div className="checkout-card">
                {metodo==='pix' && <PixScreen pagamento={pagamento} pedidoId={pedido.id} statusToken={downloadToken} onPaid={handlePaid}/>}
                {metodo==='cartao' && <CartaoScreen pagamento={pagamento} pedidoId={pedido.id} statusToken={downloadToken} stripePublicKey={pgConfig.stripe?.public_key} onPaid={handlePaid}/>}
              </div>
              <button className="btn btn-ghost btn-full" style={{marginTop:'1rem',color:'var(--text-muted)',fontSize:'0.8rem'}}
                onClick={()=>{ if(confirm('Cancelar e voltar?')){setStep('form');setPedido(null);setPagamento(null);setDownloadToken(null)} }}>
                ← Voltar
              </button>
            </div>
          )}

          {step==='form' && (
            <>
              <div className="page-header">
                <h1 className="page-title">Finalizar Compra</h1>
                <p className="page-subtitle">Informe seus dados para concluir o pedido</p>
              </div>
              {isManual && <div className="alert alert-info mb-3">🧪 Modo demonstração — sem cobrança real. As fotos serão liberadas imediatamente.</div>}
              {errors.submit && <div className="alert alert-error mb-3">⚠ {errors.submit}</div>}

              <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:'2rem'}}>
                <div className="checkout-card">
                  <h2 style={{fontFamily:'var(--font-heading)',fontSize:'1.4rem',marginBottom:'1.5rem'}}>Seus Dados</h2>
                  <form onSubmit={handleSubmit}>
                    {/* Aviso de campos bloqueados para usuários logados */}
                    {clienteLogado && (
                      <div style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.6rem 0.85rem',background:'var(--bg-input)',border:'1px solid var(--border)',borderRadius:'var(--radius)',marginBottom:'1rem',fontSize:'0.78rem',color:'var(--text-muted)'}}>
                        🔒 <span>Dados da sua conta. Para alterar, acesse <Link href="/minha-conta/configuracoes" style={{color:'var(--accent)'}}>Configurações</Link>.</span>
                      </div>
                    )}

                    {/* Nome */}
                    <div className="form-group">
                      <label className="form-label">Nome completo</label>
                      {clienteLogado ? (
                        <div className="form-input" style={{background:'var(--bg-secondary)',color:'var(--text-muted)',cursor:'default'}}>{form.nome}</div>
                      ) : (
                        <input type="text" className="form-input" placeholder="Seu nome" value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})}/>
                      )}
                      {errors.nome && <span style={{color:'var(--danger)',fontSize:'0.78rem'}}>{errors.nome}</span>}
                    </div>

                    {/* WhatsApp */}
                    <div className="form-group">
                      <label className="form-label">WhatsApp (com DDD)</label>
                      {clienteLogado ? (
                        <div className="form-input" style={{background:'var(--bg-secondary)',color:'var(--text-muted)',cursor:'default'}}>{formatarWhatsApp(form.whatsapp) || form.whatsapp}</div>
                      ) : (
                        <input type="tel" className="form-input" placeholder="(11) 99999-9999" value={form.whatsapp} maxLength={15} onChange={e=>setForm({...form,whatsapp:mascararWhatsAppTempoReal(e.target.value)})}/>
                      )}
                      {errors.whatsapp && <span style={{color:'var(--danger)',fontSize:'0.78rem'}}>{errors.whatsapp}</span>}
                    </div>

                    {/* CPF */}
                    <div className="form-group">
                      <label className="form-label">Documento</label>
                      {clienteLogado ? (
                        <div className="form-input" style={{background:'var(--bg-secondary)',color:'var(--text-muted)',cursor:'default'}}>{cpf || '—'}</div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            {['cpf', 'cnpj'].map(type => (
                              <button key={type} type="button" className={`btn btn-sm ${documentType === type ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setDocumentType(type); setCpf('') }}>
                                {type.toUpperCase()}
                              </button>
                            ))}
                          </div>
                          <input type="text" className="form-input" placeholder={documentType === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'} inputMode="numeric" maxLength={documentType === 'cnpj' ? 18 : 14} value={cpf} onChange={e=>setCpf(maskDocument(e.target.value, documentType))}/>
                        </>
                      )}
                      {errors.cpf && <span style={{color:'var(--danger)',fontSize:'0.78rem'}}>{errors.cpf}</span>}
                    </div>

                    {/* Email */}
                    <div className="form-group">
                      <label className="form-label">
                        E-mail <span style={{color:'var(--text-dim)',fontWeight:400,fontSize:'0.8rem'}}>(opcional)</span>
                      </label>
                      {clienteLogado ? (
                        <div className="form-input" style={{background:'var(--bg-secondary)',color:'var(--text-muted)',cursor:'default'}}>{form.email||'—'}</div>
                      ) : (
                        <input type="email" className="form-input" placeholder="seu@email.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Mensagem para o fotografo <span style={{color:'var(--text-dim)',fontWeight:400,fontSize:'0.8rem'}}>(opcional)</span>
                      </label>
                      <textarea
                        className="form-input"
                        rows={4}
                        placeholder="Ex.: Obrigado pelo evento! Se possivel, priorizar as fotos da chegada."
                        value={clientComment}
                        onChange={e => setClientComment(e.target.value)}
                        style={{ resize: 'vertical', minHeight: '96px' }}
                      />
                    </div>

                    <hr className="divider"/>

                    {isFree && (
                      <div style={{background:'var(--bg-input)',border:'1px dashed var(--success)',borderRadius:'var(--radius)',padding:'1rem',textAlign:'center',color:'var(--success)',fontSize:'0.88rem',marginBottom:'1.5rem'}}>
                        🎉 Seu carrinho está <strong>100% gratuito</strong>! As fotos serão liberadas imediatamente.
                      </div>
                    )}

                    {!isManual && !isFree && (isAdminUser || metodosAtivos.length > 0) && (
                      <div className="form-group">
                        <label className="form-label">Forma de Pagamento</label>
                        <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
                          {metodosAtivos.includes('pix') && (
                            <label style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.75rem 1rem',borderRadius:'var(--radius)',border:`1.5px solid ${metodo==='pix'?'var(--accent)':'var(--border)'}`,cursor:'pointer',background:metodo==='pix'?'var(--accent-dim)':'var(--bg-input)',transition:'all 0.15s'}}>
                              <input type="radio" name="metodo" value="pix" checked={metodo==='pix'} onChange={()=>setMetodo('pix')} style={{accentColor:'var(--accent)'}}/>
                              <span style={{fontSize:'1.3rem'}}>⚡</span>
                              <div><strong style={{fontSize:'0.9rem'}}>PIX</strong><p style={{fontSize:'0.72rem',color:'var(--text-muted)',margin:0}}>Aprovação instantânea</p></div>
                            </label>
                          )}
                          {metodosAtivos.includes('cartao') && (
                            <>
                              <label style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.75rem 1rem',borderRadius:'var(--radius)',border:`1.5px solid ${metodo==='cartao'?'var(--accent)':'var(--border)'}`,cursor:'pointer',background:metodo==='cartao'?'var(--accent-dim)':'var(--bg-input)',transition:'all 0.15s'}}>
                                <input type="radio" name="metodo" value="cartao" checked={metodo==='cartao'} onChange={()=>setMetodo('cartao')} style={{accentColor:'var(--accent)'}}/>
                                <span style={{fontSize:'1.3rem'}}>💳</span>
                                <div><strong style={{fontSize:'0.9rem'}}>Cartão de Crédito</strong><p style={{fontSize:'0.72rem',color:'var(--text-muted)',margin:0}}>Aprovação imediata</p></div>
                              </label>
                              {metodo==='cartao' && (
                                <div style={{marginTop:'0.5rem',padding:'0.75rem 1rem',background:'var(--bg-input)',borderRadius:'var(--radius)',border:'1px solid var(--border)'}}>
                                  <label style={{fontSize:'0.78rem',color:'var(--text-muted)',display:'block',marginBottom:'0.4rem'}}>Parcelas</label>
                                  <select
                                    value={parcelas}
                                    onChange={e=>setParcelas(Number(e.target.value))}
                                    style={{width:'100%',background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:'var(--radius)',color:'var(--text)',padding:'0.5rem 0.75rem',fontSize:'0.85rem'}}
                                  >
                                    {Array.from({length:12},(_,i)=>i+1).map(n=>{
                                      const taxa = calcInstallmentFee(total, n)
                                      const totN = total + taxa
                                      const vp = totN / n
                                      return (
                                        <option key={n} value={n}>
                                          {n}x de R$ {vp.toFixed(2).replace('.',',')}
                                          {taxa > 0 ? ` (total R$ ${totN.toFixed(2).replace('.',',')} c/ juros)` : ' sem juros'}
                                        </option>
                                      )
                                    })}
                                  </select>
                                  {taxaParcelamento > 0 && (
                                    <p style={{fontSize:'0.72rem',color:'#f59e0b',marginTop:'0.35rem'}}>
                                      ⚠ Taxa de parcelamento: +R$ {taxaParcelamento.toFixed(2).replace('.',',')} — total R$ {totalFinal.toFixed(2).replace('.',',')}
                                    </p>
                                  )}
                                  {taxaParcelamento === 0 && parcelas > 1 && (
                                    <p style={{fontSize:'0.72rem',color:'var(--success)',marginTop:'0.35rem'}}>✓ Sem acréscimo</p>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        {errors.metodo && <span style={{color:'var(--danger)',fontSize:'0.78rem'}}>{errors.metodo}</span>}
                      </div>
                    )}

                    {isAdminUser && !isFree && (
                      <div className="form-group" style={{marginTop: metodosAtivos.length > 0 && !isManual ? '0' : undefined}}>
                        {metodosAtivos.length > 0 && !isManual && <div style={{margin:'0.5rem 0',borderTop:'1px dashed var(--border)',paddingTop:'0.5rem'}}/>}
                        <label style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.75rem 1rem',borderRadius:'var(--radius)',border:`1.5px solid ${isAdminBypass?'rgba(201,169,110,0.7)':'rgba(201,169,110,0.25)'}`,cursor:'pointer',background:isAdminBypass?'rgba(201,169,110,0.1)':'var(--bg-input)',transition:'all 0.15s'}}>
                          <input type="radio" name="metodo" value="admin_bypass" checked={isAdminBypass} onChange={()=>setMetodo('admin_bypass')} style={{accentColor:'var(--accent)'}}/>
                          <span style={{fontSize:'1.3rem'}}>🔑</span>
                          <div>
                            <strong style={{fontSize:'0.9rem',color:'var(--accent)'}}>Finalizar sem pagar</strong>
                            <p style={{fontSize:'0.72rem',color:'var(--text-muted)',margin:0}}>Privilégio administrativo — libera as fotos imediatamente</p>
                          </div>
                        </label>
                      </div>
                    )}

                    {isManual && (
                      <div style={{background:'var(--bg-secondary)',border:'1px dashed var(--border-light)',borderRadius:'var(--radius)',padding:'1.25rem',textAlign:'center',color:'var(--text-muted)',fontSize:'0.85rem',marginBottom:'1.5rem'}}>
                        💬 Após confirmar, o fotógrafo entrará em contato para combinar o pagamento.
                      </div>
                    )}

                    <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
                      {loading ? <><div className="spinner"/> Processando...</>
                        : isFree ? '🎉 Confirmar e Baixar Grátis'
                        : isAdminBypass ? `🔑 Confirmar sem Pagar — R$ ${total.toFixed(2).replace('.',',')}`
                        : isManual ? `Confirmar Pedido — R$ ${total.toFixed(2).replace('.',',')}`
                        : `Continuar para Pagamento — R$ ${totalFinal.toFixed(2).replace('.',',')}`}
                    </button>
                  </form>
                </div>

                <div className="cart-summary-card" style={{position:'relative',top:0}}>
                  <h3 className="cart-summary-title">Seu Pedido</h3>
                  <div style={{maxHeight:300,overflowY:'auto',marginBottom:'1rem'}}>
                    {cartItems.map(item=>(
                      (() => {
                        const previewCandidates = getPhotoCartPreviewCandidates(item)
                        const previewSrc = getFirstUrl(previewCandidates)
                        return (
                      <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem',fontSize:'0.82rem'}}>
                        <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
                          <img src={previewSrc || ''} alt="" style={{width:36,height:28,objectFit:'cover',borderRadius:3}} onError={e=>{
                            if (!applyNextImageFallback(e.target, previewCandidates)) e.target.style.display = 'none'
                          }}/>
                          <div>
                            <p style={{color:'var(--text)',fontSize:'0.78rem'}}>{item.eventName}</p>
                            <p style={{color:'var(--text-dim)',fontSize:'0.72rem'}}>{item.filename.slice(0,22)}...</p>
                          </div>
                        </div>
                        <span style={{color:'var(--accent)',whiteSpace:'nowrap',marginLeft:'0.5rem'}}>R$ {Number(item.price).toFixed(2).replace('.',',')}</span>
                      </div>
                        )
                      })()
                    ))}
                  </div>
                  <hr className="divider"/>
                  {descInfo.totalDesconto>0 && (
                    <>
                      <div className="cart-summary-row" style={{fontSize:'0.82rem',color:'var(--text-muted)'}}><span>Subtotal</span><span>R$ {descInfo.subtotal.toFixed(2).replace('.',',')}</span></div>
                      {descInfo.linhas.map((l,i)=>(
                        <div key={i} className="cart-summary-row" style={{fontSize:'0.78rem',color:'var(--accent)'}}><span>🏷️ Desconto {l.pct}% ({l.nomeEvento})</span><span>- R$ {l.valor.toFixed(2).replace('.',',')}</span></div>
                      ))}
                    </>
                  )}

                  {/* Proposta aceita */}
                  {propostaAtiva && (
                    <div style={{ borderTop: '1px dashed var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                      <div className="cart-summary-row" style={{ fontSize: '0.85rem', color: 'var(--success)' }}>
                        <span>💬 Proposta {propostaAtiva.status === 'aceita_pelo_cliente' ? 'aceita pelo cliente' : 'aceita pelo fotógrafo'}</span>
                        <span><strong>R$ {Number(valorProposta).toFixed(2).replace('.', ',')}</strong></span>
                      </div>
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                        Valor negociado substitui descontos progressivos, cupom e benefícios de nível.
                      </p>
                    </div>
                  )}

                  {/* Cupom de desconto */}
                  {!propostaAtiva && (
                  <div style={{ borderTop: '1px dashed var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                    {cupomAplicado ? (
                      <div className="cart-summary-row" style={{ fontSize: '0.82rem', color: 'var(--accent)' }}>
                        <span>🎟️ Cupom <strong style={{ fontFamily: 'monospace' }}>{cupomAplicado.codigo}</strong></span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          - R$ {cupomDesconto.toFixed(2).replace('.', ',')}
                          <button type="button" onClick={removerCupom} title="Remover cupom" style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0, fontSize: '0.78rem' }}>✕</button>
                        </span>
                      </div>
                    ) : (
                      <div>
                        <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Cupom</label>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Código"
                            value={cupomCodigo}
                            onChange={e => { setCupomCodigo(e.target.value.toUpperCase().replace(/\s+/g, '')); setCupomErro('') }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); aplicarCupom() } }}
                            maxLength={40}
                            disabled={validandoCupom || itens.length === 0}
                            style={{ fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={aplicarCupom}
                            disabled={validandoCupom || !cupomCodigo.trim() || itens.length === 0}
                            style={{ flexShrink: 0 }}
                          >
                            {validandoCupom ? '...' : 'OK'}
                          </button>
                        </div>
                        {cupomErro && (
                          <p style={{ fontSize: '0.72rem', color: 'var(--danger)', margin: '0.3rem 0 0' }}>{cupomErro}</p>
                        )}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Rewards: nivel + saldo */}
                  {rewardsAtivo && (descontoNivel > 0 || saldoDisponivel > 0 || cashbackProjetado > 0 || saldoFlatProjetado > 0) && (
                    <div style={{ borderTop: '1px dashed var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                      {descontoNivel > 0 && rewards?.nivelAtual && (
                        <div className="cart-summary-row" style={{ fontSize: '0.8rem', color: rewards.nivelAtual.color || 'var(--accent)' }}>
                          <span>{rewards.nivelAtual.icon} Desconto {rewards.nivelAtual.nome} ({descontoNivelPct}%)</span>
                          <span>- R$ {descontoNivel.toFixed(2).replace('.', ',')}</span>
                        </div>
                      )}
                      {saldoDisponivel > 0 && (
                        <div style={{ marginTop: '0.4rem' }}>
                          <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>💰 Usar saldo (disponível: R$ {saldoDisponivel.toFixed(2).replace('.', ',')})</span>
                            {saldoUtilizado > 0 && <button type="button" onClick={() => setSaldoUsar('')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.74rem' }}>Limpar</button>}
                          </label>
                          <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.25rem' }}>
                            <input
                              type="number"
                              className="form-input"
                              value={saldoUsar}
                              onChange={e => setSaldoUsar(e.target.value)}
                              placeholder="0.00"
                              min="0"
                              max={Math.min(saldoDisponivel, totalAposNivel)}
                              step="0.01"
                              style={{ fontSize: '0.82rem', padding: '0.35rem 0.5rem' }}
                            />
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setSaldoUsar(Math.min(saldoDisponivel, totalAposNivel).toFixed(2))}
                              style={{ flexShrink: 0, fontSize: '0.74rem' }}
                            >
                              Usar tudo
                            </button>
                          </div>
                          {saldoUtilizado > 0 && (
                            <div className="cart-summary-row" style={{ fontSize: '0.8rem', color: 'var(--accent)', marginTop: '0.35rem' }}>
                              <span>💰 Saldo aplicado</span>
                              <span>- R$ {saldoUtilizado.toFixed(2).replace('.', ',')}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {(cashbackProjetado > 0 || saldoFlatProjetado > 0) && (
                        <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '0.4rem', lineHeight: 1.4 }}>
                          ✨ Após o pagamento, você receberá <strong style={{ color: 'var(--accent)' }}>R$ {(cashbackProjetado + saldoFlatProjetado).toFixed(2).replace('.', ',')}</strong> de saldo
                          {cashbackPct > 0 && saldoFlatProjetado > 0 ? ` (${cashbackPct}% cashback + R$ ${saldoFlatProjetado.toFixed(2).replace('.', ',')} fixo)`
                            : cashbackPct > 0 ? ` (${cashbackPct}% de cashback)`
                            : ` (saldo fixo)`}
                        </p>
                      )}
                    </div>
                  )}

                  {taxaParcelamento > 0 && (
                    <div className="cart-summary-row" style={{fontSize:'0.78rem',color:'#f59e0b'}}><span>⚠ Juros {parcelas}x cartão</span><span>+ R$ {taxaParcelamento.toFixed(2).replace('.',',')}</span></div>
                  )}
                  <div className="cart-summary-row total"><span>Total</span><span>R$ {totalFinal.toFixed(2).replace('.',',')}</span></div>
                  {metodo==='cartao'&&parcelas>1&&<p style={{fontSize:'0.72rem',color:'var(--text-dim)',textAlign:'right',marginTop:'0.2rem'}}>{parcelas}x de R$ {valorParcela.toFixed(2).replace('.',',')}</p>}
                  <Link href={clienteLogado ? '/minha-conta/carrinho' : '/carrinho'} style={{display:'block',textAlign:'center',color:'var(--text-muted)',fontSize:'0.8rem',marginTop:'0.5rem'}}>← Editar carrinho</Link>
                </div>
              </div>
            </>
          )}

        </div>
      </main>
      <Footer />
    </>
  )
}
