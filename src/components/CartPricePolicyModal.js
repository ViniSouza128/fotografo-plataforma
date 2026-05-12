'use client'

import { useMemo } from 'react'

function money(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return `R$ ${num.toFixed(2).replace('.', ',')}`
}

export default function CartPricePolicyModal({ analysis, busy = false, onCancel, onConfirm }) {
  const carts = analysis?.carts || []
  const totalItems = analysis?.totalItems || 0
  const totalCarts = analysis?.totalCarts || carts.length
  const previewCarts = useMemo(() => carts.slice(0, 8), [carts])
  if (!analysis?.hasImpact) return null

  return (
    <div className="confirm-dialog-backdrop" style={{ zIndex: 10000 }} onClick={onCancel}>
      <div className="confirm-dialog" style={{ maxWidth: '720px', width: 'min(720px, calc(100vw - 2rem))' }} onClick={event => event.stopPropagation()}>
        <h3 className="confirm-dialog-title">Preço em carrinhos existentes</h3>
        <p className="confirm-dialog-message" style={{ marginBottom: '0.75rem' }}>
          A mudança afeta {totalItems} item(ns) em {totalCarts} carrinho(s). Escolha se esses carrinhos serão atualizados para o novo preço ou se manterão o valor que já estava neles.
        </p>

        <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.65rem', marginBottom: '0.9rem' }}>
          {previewCarts.map(cart => (
            <div key={cart.clientId} style={{ padding: '0.55rem 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9rem' }}>{cart.clientName}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{cart.itemCount} item(ns)</span>
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.74rem', marginTop: '0.15rem' }}>
                {[cart.email, cart.whatsapp].filter(Boolean).join(' · ')}
              </div>
              <div style={{ display: 'grid', gap: '0.25rem', marginTop: '0.45rem' }}>
                {cart.items.slice(0, 4).map(item => (
                  <div key={`${cart.clientId}-${item.photoId}`} style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                    {item.photoName || item.photoId}: {money(item.currentCartPrice)} → {money(item.newPrice)}
                  </div>
                ))}
                {cart.items.length > 4 && (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>+ {cart.items.length - 4} item(ns)</div>
                )}
              </div>
            </div>
          ))}
          {carts.length > previewCarts.length && (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
              + {carts.length - previewCarts.length} carrinho(s) afetado(s)
            </p>
          )}
        </div>

        <div className="confirm-dialog-actions" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onConfirm?.('preserve_existing')} disabled={busy}>
            Manter preço antigo
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm?.('update_carts')} disabled={busy}>
            {busy ? 'Processando...' : 'Atualizar carrinhos'}
          </button>
        </div>
      </div>
    </div>
  )
}
