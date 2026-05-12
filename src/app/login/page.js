'use client'
// src/app/login/page.js

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/minha-conta'

  const [form, setForm] = useState({ email: '', senha: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.id) {
          const redirectTo = parsed.mustChangePassword
            ? `/trocar-senha?returnTo=${encodeURIComponent(returnTo)}`
            : returnTo
          router.replace(redirectTo)
          return
        }
      }
      localStorage.removeItem('adminLogado')
    } catch {
      localStorage.removeItem('clienteLogado')
      localStorage.removeItem('adminLogado')
    }
    setReady(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), senha: form.senha }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'E-mail ou senha inválidos.')
        setLoading(false)
        return
      }
      const client = data.client
      localStorage.setItem('clienteLogado', JSON.stringify(client))
      if (client.isAdmin) {
        localStorage.setItem('adminLogado', 'true')
      } else {
        localStorage.removeItem('adminLogado')
      }
      window.dispatchEvent(new Event('authUpdated'))
      // Volta para onde estava, ou minha-conta
      const baseDest = returnTo.startsWith('/admin') && !client.isAdmin ? '/minha-conta' : returnTo
      if (client.mustChangePassword) {
        router.push(`/trocar-senha?returnTo=${encodeURIComponent(baseDest)}`)
      } else {
        router.push(baseDest)
      }
    } catch {
      setError('Erro de conexão. Tente novamente.')
      setLoading(false)
    }
  }

  if (!ready) return null

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 420 }}>
        <div className="login-brand">
          <h1 className="login-brand-name">Vinícius Rodrigues</h1>
          <p className="login-brand-sub">Acesse sua conta</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">E-mail</label>
            <input
              id="login-email"
              type="email" className="form-input" placeholder="seu@email.com"
              value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              autoFocus required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-senha">Senha</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-senha"
                type={showPassword ? 'text' : 'password'} className="form-input"
                placeholder="••••••" value={form.senha}
                onChange={e => setForm({ ...form, senha: e.target.value })}
                required style={{ paddingRight: '3rem' }}
              />
              <button type="button" onClick={() => setShowPassword(p => !p)} tabIndex={-1}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: '0.5rem' }}>
            {loading ? <><div className="spinner" /> Entrando...</> : 'Entrar'}
          </button>
        </form>

        <div style={{ marginTop: '1.75rem', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: '1.8' }}>
          <p>Esqueceu a senha? Entre em contato com o fotógrafo.</p>
          <p style={{ marginTop: '0.5rem' }}>
            Não tem conta?{' '}
            <Link href={`/cadastro${returnTo !== '/minha-conta' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
              style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: '3px' }}>
              Cadastre-se
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
