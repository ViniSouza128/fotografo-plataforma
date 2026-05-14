'use client'
// src/app/admin/reconhecimento/page.js
// Admin: configuração + indexação + busca + bloqueios

import { useCallback, useEffect, useState } from 'react'
import { isReadOnlyAdmin } from '@/lib/adminAccess'
import {
  adminFetchArray,
  adminFetchJson,
  adminFetchObject,
  clearAdminSession,
  getCurrentReturnTo,
  getStoredAdminClient,
  isAdminUnauthorizedError,
  redirectToAdminLogin,
} from '@/lib/adminFetch'

function formatRelativo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'agora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min atrás`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h atrás`
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function AdminReconhecimentoPage() {
  const [me, setMe] = useState(null)
  const [tab, setTab] = useState('config')
  const [status, setStatus] = useState(null)
  const [bloqueios, setBloqueios] = useState([])
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState(null)
  const [indexando, setIndexando] = useState(false)
  const [eventoSel, setEventoSel] = useState('')
  const [searchQuery, setSearchQuery] = useState({ code: '', tokens: '', eventId: '' })
  const [searchResults, setSearchResults] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    setMe(getStoredAdminClient())
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const [s, b, e] = await Promise.all([
        adminFetchObject('/api/reconhecimento/config'),
        adminFetchArray('/api/reconhecimento/bloqueios'),
        adminFetchArray('/api/events'),
      ])
      setStatus(s)
      setBloqueios(b)
      setEventos(e)
    } catch (error) {
      setStatus(null)
      setBloqueios([])
      setEventos([])
      if (isAdminUnauthorizedError(error)) {
        setErro('Sessao expirada. Redirecionando para o login...')
        clearAdminSession()
        redirectToAdminLogin(getCurrentReturnTo())
        return
      }
      setErro(error?.message || 'Erro ao carregar reconhecimento.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const isSuperAdmin = !!me?.isSuperAdmin
  const readOnly = isReadOnlyAdmin(me)

  function handleAdminActionError(error, fallback = 'Erro de rede.') {
    if (isAdminUnauthorizedError(error)) {
      clearAdminSession()
      redirectToAdminLogin(getCurrentReturnTo())
      return
    }
    setFeedback({ type: 'error', text: error?.message || fallback })
  }

  async function patchConfig(patch) {
    if (!isSuperAdmin) {
      setFeedback({ type: 'error', text: 'Apenas super-admin pode alterar a configuração.' })
      return
    }
    try {
      await adminFetchJson('/api/reconhecimento/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      await carregar()
      setFeedback({ type: 'success', text: 'Config atualizada.' })
    } catch (error) { handleAdminActionError(error) }
  }

  async function indexarEvento() {
    if (readOnly) {
      setFeedback({ type: 'error', text: 'Only to super admin.' })
      return
    }
    if (!eventoSel) return
    setIndexando(true)
    setFeedback(null)
    try {
      const data = await adminFetchJson('/api/reconhecimento/indexar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: eventoSel }),
      })
      setFeedback({ type: 'success', text: `Indexadas ${data.indexed}/${data.total} fotos.` })
    } catch (error) { handleAdminActionError(error) }
    finally { setIndexando(false) }
  }

  async function buscar(e) {
    e?.preventDefault?.()
    setSearchLoading(true)
    setSearchResults(null)
    try {
      const tokens = searchQuery.tokens
        ? searchQuery.tokens.split(',').map(s => s.trim()).filter(Boolean)
        : []
      const body = {
        code: searchQuery.code || null,
        tokens,
        eventId: searchQuery.eventId || null,
      }
      const data = await adminFetchJson('/api/reconhecimento/buscar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!data || !Array.isArray(data.results)) {
        setFeedback({ type: 'error', text: 'Resposta inesperada do servidor.' })
        return
      }
      setSearchResults(data)
    } catch (error) { handleAdminActionError(error) }
    finally { setSearchLoading(false) }
  }

  async function resolverBloqueio(b, decisao) {
    if (readOnly) {
      setFeedback({ type: 'error', text: 'Only to super admin.' })
      return
    }
    const obs = decisao === 'aprovado'
      ? prompt('Observação opcional:') || ''
      : prompt('Motivo da rejeição:') || ''
    try {
      await adminFetchJson('/api/reconhecimento/bloqueios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id, decisao, observacao: obs }),
      })
      await carregar()
    } catch (error) { handleAdminActionError(error) }
  }

  if (loading) {
    return <div className="flex-center" style={{ minHeight: '40vh' }}><div className="spinner" /></div>
  }

  if (erro) {
    return (
      <div className="empty-state">
        <h2 className="empty-state-title">Nao foi possivel carregar reconhecimento</h2>
        <p>{erro}</p>
        <button className="btn btn-ghost btn-sm" onClick={carregar}>Tentar novamente</button>
      </div>
    )
  }

  if (!status) return <div style={{ padding: '2rem' }}>Erro ao carregar.</div>

  const pendentes = bloqueios.filter(b => b.status === 'pendente').length

  return (
    <div style={{ maxWidth: '960px' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', margin: 0 }}>Reconhecimento</h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Busca por código numérico, tags ou rosto. Tudo local — sem envio externo sem configuração explícita.
        </p>
      </div>

      {feedback && (
        <div style={{
          padding: '0.65rem 0.9rem', marginBottom: '0.75rem',
          background: feedback.type === 'error' ? 'rgba(220,38,38,0.15)' : 'rgba(34,197,94,0.12)',
          border: `1px solid ${feedback.type === 'error' ? 'rgba(220,38,38,0.4)' : 'rgba(34,197,94,0.4)'}`,
          color: feedback.type === 'error' ? '#fca5a5' : '#86efac',
          borderRadius: 'var(--radius)', fontSize: '0.85rem',
        }}>{feedback.text}</div>
      )}

      {readOnly && (
        <div className="alert alert-info" style={{ marginBottom: '0.75rem' }}>
          👁️ Admin pode consultar reconhecimento, buscas e bloqueios. Alterações, indexação e decisões ficam only to super admin.
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { id: 'config', label: 'Configuração' },
          { id: 'indexar', label: 'Indexar' },
          { id: 'buscar', label: 'Buscar' },
          { id: 'bloqueios', label: `Bloqueios${pendentes ? ` (${pendentes})` : ''}` },
        ].map(t => (
          <button key={t.id}
            className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'config' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', margin: '0 0 0.75rem' }}>Status atual</h2>
          <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.88rem' }}>
            <ConfigRow label="Reconhecimento ativo">
              <Toggle disabled={!isSuperAdmin} checked={!!status.ativo} onChange={v => patchConfig({ ativo: v })} />
            </ConfigRow>
            <ConfigRow label="Permitir cliente buscar">
              <Toggle disabled={!isSuperAdmin} checked={!!status.permitirCliente} onChange={v => patchConfig({ permitirCliente: v })} />
            </ConfigRow>
            <ConfigRow label="Exigir consentimento LGPD">
              <Toggle disabled={!isSuperAdmin} checked={!!status.exigirConsentimento} onChange={v => patchConfig({ exigirConsentimento: v })} />
            </ConfigRow>
            <ConfigRow label="Engine">
              <select disabled={!isSuperAdmin} value={status.engine}
                onChange={e => patchConfig({ engine: e.target.value })}
                style={{ padding: '0.4rem 0.6rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)' }}>
                <option value="manual">manual (códigos numéricos + nome do arquivo)</option>
                <option value="face-api-local" disabled={!status.backends['face-api-local']?.available}>
                  face-api-local {status.backends['face-api-local']?.available ? '✓' : `(indisponível: ${status.backends['face-api-local']?.reason})`}
                </option>
              </select>
            </ConfigRow>
            <ConfigRow label="Limiar de similaridade (face)">
              <input type="number" min="0.1" max="1.5" step="0.05" value={status.similarityThreshold}
                disabled={!isSuperAdmin}
                onBlur={e => patchConfig({ similarityThreshold: Number(e.target.value) })}
                style={{ width: '90px', padding: '0.35rem 0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)' }} />
            </ConfigRow>
            <ConfigRow label="Padrão regex (códigos)">
              <input value={status.numericPattern} disabled={!isSuperAdmin}
                onBlur={e => patchConfig({ numericPattern: e.target.value })}
                style={{ width: '180px', padding: '0.35rem 0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)' }} />
            </ConfigRow>
          </div>

          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', margin: '1rem 0 0.5rem' }}>Backends disponíveis</h3>
          <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.85rem' }}>
            {Object.entries(status.backends || {}).map(([id, b]) => (
              <li key={id} style={{ color: b.available ? 'var(--accent)' : 'var(--text-muted)' }}>
                <strong>{id}</strong>: {b.available ? 'disponível' : `indisponível (${b.reason})`}
              </li>
            ))}
          </ul>

          {!status.backends['face-api-local']?.available && (
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Como ativar reconhecimento facial</summary>
              <pre style={{ margin: '0.5rem 0 0', padding: '0.75rem', background: 'var(--bg-input)', borderRadius: 'var(--radius)', fontSize: '0.78rem', whiteSpace: 'pre-wrap' }}>{`1) npm install @vladmandic/face-api @tensorflow/tfjs
   (opcional p/ velocidade: @tensorflow/tfjs-node)
2) Baixe modelos para data/vision/models/:
   - ssd_mobilenetv1_model-*
   - face_landmark_68_model-*
   - face_recognition_model-*
   (Repositório: github.com/vladmandic/face-api/tree/master/model)
3) Em "Engine", selecione "face-api-local" e clique para reindexar fotos.
   Funciona 100% local — nada é enviado para fora.`}</pre>
            </details>
          )}
        </div>
      )}

      {tab === 'indexar' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', margin: '0 0 0.5rem' }}>Indexar evento</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
            Engine: <strong>{status.engine}</strong>. Use para gerar/atualizar o índice de busca de um álbum (até 200 fotos por chamada).
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select value={eventoSel} onChange={e => setEventoSel(e.target.value)}
              style={{ flex: 1, minWidth: '220px', padding: '0.55rem 0.7rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)' }}>
              <option value="">Selecione um álbum...</option>
              {eventos.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
            <button className="btn btn-primary" onClick={indexarEvento} disabled={readOnly || !eventoSel || indexando}>
              {indexando ? 'Indexando...' : 'Indexar agora'}
            </button>
          </div>
        </div>
      )}

      {tab === 'buscar' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', margin: '0 0 1rem' }}>Buscar pessoa</h2>
          <form onSubmit={buscar} style={{ display: 'grid', gap: '0.6rem' }}>
            <Field label="Código numérico (ex: número da camisa)" value={searchQuery.code} onChange={v => setSearchQuery(s => ({ ...s, code: v }))} />
            <Field label="Tags (separadas por vírgula)" value={searchQuery.tokens} onChange={v => setSearchQuery(s => ({ ...s, tokens: v }))} />
            <Field label="Restringir a um álbum (opcional)">
              <select value={searchQuery.eventId} onChange={e => setSearchQuery(s => ({ ...s, eventId: e.target.value }))}
                style={{ padding: '0.55rem 0.7rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)' }}>
                <option value="">Todos os álbuns</option>
                {eventos.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </Field>
            <button type="submit" className="btn btn-primary" disabled={searchLoading}
              style={{ justifySelf: 'start' }}>
              {searchLoading ? 'Buscando...' : 'Buscar'}
            </button>
          </form>

          {searchResults && (
            <div style={{ marginTop: '1.5rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {searchResults.results.length} resultado(s) · engine: {searchResults.engineUsed}
                {searchResults.blocked > 0 && ` · ${searchResults.blocked} foto(s) bloqueada(s)`}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
                {searchResults.results.map((r, i) => (
                  <a key={i} href={`/admin/eventos/${r.event?.id}#${r.photo?.id}`}
                    target="_blank" rel="noreferrer"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.5rem', textDecoration: 'none', color: 'var(--text)' }}>
                    {r.photo?.pathThumbWm ? (
                      <img src={`/uploads/${r.photo.pathThumbWm}`} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 'var(--radius)' }} />
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '4/3', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📷</div>
                    )}
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem' }}>{r.event?.name}</p>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>score {Number(r.score || 0).toFixed(2)}</p>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'bloqueios' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', margin: '0 0 1rem' }}>Solicitações de bloqueio (LGPD)</h2>
          {bloqueios.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhuma solicitação.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {bloqueios.map(b => (
                <div key={b.id} style={{
                  padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  background: b.status === 'pendente' ? 'var(--bg-secondary)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <strong style={{ fontSize: '0.9rem' }}>{b.solicitanteNome || b.solicitanteEmail || 'Anônimo'}</strong>
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', padding: '0.05rem 0.4rem', borderRadius: '100px',
                        background: b.status === 'pendente' ? 'rgba(234,179,8,0.18)' : (b.status === 'aprovado' ? 'rgba(34,197,94,0.18)' : 'rgba(220,38,38,0.18)'),
                        color: b.status === 'pendente' ? '#fde68a' : (b.status === 'aprovado' ? '#86efac' : '#fca5a5'),
                      }}>{b.status}</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{formatRelativo(b.criadoEm)}</span>
                  </div>
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Escopo: <strong>{b.escopo}</strong> ·
                    {b.fotoId && ` Foto: ${b.fotoId.slice(0, 8)}`}
                    {b.referenciaId && ` Ref: ${b.referenciaId.slice(0, 8)}`}
                    {b.documento && ` · Doc: ${b.documento}`}
                  </p>
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem' }}>{b.motivo}</p>
                  {b.status === 'pendente' && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem' }}>
                      <button className="btn btn-sm btn-primary" disabled={readOnly} onClick={() => resolverBloqueio(b, 'aprovado')}>Aprovar</button>
                      <button className="btn btn-sm btn-ghost" disabled={readOnly} onClick={() => resolverBloqueio(b, 'rejeitado')}>Rejeitar</button>
                    </div>
                  )}
                  {b.observacao && (
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                      <em>{b.observacao}</em>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ConfigRow({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <input type="checkbox" checked={!!checked} disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: 'var(--accent)' }} />
      <span style={{ fontSize: '0.78rem', color: checked ? 'var(--accent)' : 'var(--text-muted)' }}>
        {checked ? 'on' : 'off'}
      </span>
    </label>
  )
}

function Field({ label, value, onChange, type = 'text', children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{label}</span>
      {children || (
        <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
          style={{ padding: '0.55rem 0.7rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: '0.88rem' }} />
      )}
    </label>
  )
}
