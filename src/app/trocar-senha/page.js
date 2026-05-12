'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function TrocarSenhaForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/minha-conta'

  const [form, setForm] = useState({ atual: '', nova: '', confirma: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado')
      const client = raw ? JSON.parse(raw) : null
      if (!client || !client.id) {
        router.replace(`/login?returnTo=${encodeURIComponent('/trocar-senha')}`)
        return
      }
      if (!client.mustChangePassword) {
        router.replace(returnTo)
        return
      }
      setReady(true)
    } catch {
      router.replace(`/login?returnTo=${encodeURIComponent('/trocar-senha')}`)
    }
  }, [router, returnTo])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!form.nova || form.nova.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (form.nova !== form.confirma) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senhaAtual: form.atual, novaSenha: form.nova }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Não foi possível trocar a senha.')
        setLoading(false)
        return
      }

      localStorage.setItem('clienteLogado', JSON.stringify(data.client))
      if (data.client?.isAdmin) localStorage.setItem('adminLogado', 'true')
      else localStorage.removeItem('adminLogado')
      window.dispatchEvent(new Event('authUpdated'))

      setSuccess('Senha alterada com sucesso!')
      setTimeout(() => {
        router.replace(returnTo || '/minha-conta')
      }, 600)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (!ready) return null

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <div className="login-brand">
          <h1 className="login-brand-name">Atualize sua senha</h1>
          <p className="login-brand-sub">Acesso bloqueado até definir uma nova senha</p>
        </div>

        {error && <div className="login-error">{error}</div>}
        {success && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Senha temporária (atual)</label>
            <input
              type="password"
              className="form-input"
              value={form.atual}
              onChange={e => setForm({ ...form, atual: e.target.value })}
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Nova senha</label>
            <input
              type="password"
              className="form-input"
              value={form.nova}
              onChange={e => setForm({ ...form, nova: e.target.value })}
              required
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirmar nova senha</label>
            <input
              type="password"
              className="form-input"
              value={form.confirma}
              onChange={e => setForm({ ...form, confirma: e.target.value })}
              required
              minLength={6}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: '0.5rem' }}>
            {loading ? <><div className="spinner" /> Salvando...</> : 'Salvar e continuar'}
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: 'var(--text-dim)', textAlign: 'center' }}>
          <p>Para sua segurança, todos os dispositivos serão desconectados após a troca.</p>
          <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
            Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function TrocarSenhaPage() {
  return (
    <Suspense fallback={null}>
      <TrocarSenhaForm />
    </Suspense>
  )
}
