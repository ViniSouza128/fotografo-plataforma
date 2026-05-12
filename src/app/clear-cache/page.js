'use client'
// /clear-cache — desregistra service workers antigos, apaga caches do browser
// e redireciona para /. Usado uma única vez quando o cache de webpack chunks
// fica corrompido depois de mudanças na configuração de bundle.

import { useEffect, useState } from 'react'

export default function ClearCachePage() {
  const [status, setStatus] = useState('Limpando cache do navegador…')

  useEffect(() => {
    (async () => {
      const messages = []
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          for (const r of regs) {
            try { await r.unregister(); messages.push(`SW desregistrado: ${r.scope || ''}`) } catch {}
          }
        }
      } catch {}
      try {
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys()
          for (const k of keys) {
            try { await caches.delete(k); messages.push(`cache apagado: ${k}`) } catch {}
          }
        }
      } catch {}
      try { localStorage.removeItem('__next-build-id') } catch {}
      setStatus(messages.length === 0 ? 'Nada para limpar — redirecionando…' : `Pronto: ${messages.length} item(ns) limpos. Redirecionando…`)
      setTimeout(() => { window.location.replace('/') }, 800)
    })()
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0a', color: '#fff', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>🧹 Limpando cache</h1>
        <p style={{ marginTop: '0.6rem', color: '#9ca3af' }}>{status}</p>
      </div>
    </div>
  )
}
