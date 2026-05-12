'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  confirmTone,
  onConfirm,
  onCancel,
}) {
  if (!open) return null

  return (
    <div className="confirm-dialog-backdrop" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="confirm-dialog-title">
          {title}
        </h3>
        <p className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn ${confirmTone === 'danger' ? 'btn-danger' : 'btn-success'}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export function useConfirmDialog() {
  const [pending, setPending] = useState(null)

  const confirm = useCallback((options = {}) => {
    return new Promise(resolve => {
      setPending({
        title: options.title || 'Confirmar ação',
        message: options.message || 'Tem certeza que deseja continuar?',
        confirmText: options.confirmText || 'Confirmar',
        cancelText: options.cancelText || 'Cancelar',
        confirmTone: options.confirmTone === 'danger' ? 'danger' : 'success',
        resolve,
      })
    })
  }, [])

  const close = useCallback((result) => {
    setPending(current => {
      if (current?.resolve) current.resolve(result)
      return null
    })
  }, [])

  useEffect(() => {
    return () => {
      setPending(current => {
        if (current?.resolve) current.resolve(false)
        return null
      })
    }
  }, [])

  const confirmDialog = useMemo(() => (
    <ConfirmDialog
      open={!!pending}
      title={pending?.title || ''}
      message={pending?.message || ''}
      confirmText={pending?.confirmText || 'Confirmar'}
      cancelText={pending?.cancelText || 'Cancelar'}
      confirmTone={pending?.confirmTone || 'success'}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ), [pending, close])

  return { confirm, confirmDialog }
}
