'use client'
// src/components/admin/TabVideos.js
// Aba "Vídeos" do painel /admin/eventos/[id]. Recebe eventId via prop.
// Upload é feito pelo uploader unificado de Mídia. Esta aba lista, reproduz,
// edita e remove vídeos já enviados via VideoAdminModal.

import { useCallback, useEffect, useState } from 'react'

function formatBytes(b) {
  if (!b) return '—'
  const mb = b / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`
}

function formatDuration(s) {
  if (!s || !Number.isFinite(s)) return '—'
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function TabVideos({ eventId, embedded = true }) {
  const [event, setEvent] = useState(null)
  const [videos, setVideos] = useState([])
  const [photoFolders, setPhotoFolders] = useState([])
  const [globalVideoPrice, setGlobalVideoPrice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState(null)
  const [editing, setEditing] = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [evRes, vRes, cfgRes, phRes] = await Promise.all([
        fetch(`/api/events/${eventId}?stats=1`),
        fetch(`/api/videos?eventId=${eventId}&incluirRemovidas=1`),
        fetch('/api/config'),
        fetch(`/api/photos?eventId=${eventId}`),
      ])
      const evData = evRes.ok ? await evRes.json() : null
      const vData = vRes.ok ? await vRes.json() : []
      const cfgData = cfgRes.ok ? await cfgRes.json().catch(() => ({})) : {}
      const phData = phRes.ok ? await phRes.json().catch(() => []) : []
      setEvent(evData)
      setVideos(Array.isArray(vData) ? vData : [])
      const pv = Number(cfgData?.precoVideoDefault)
      setGlobalVideoPrice(Number.isFinite(pv) && pv > 0 ? pv : null)
      // Pastas: união de pastas de fotos + de vídeos já existentes
      const fset = new Set()
      ;(Array.isArray(phData) ? phData : []).forEach(p => p.pasta && fset.add(p.pasta))
      ;(Array.isArray(vData) ? vData : []).forEach(v => v.pasta && fset.add(v.pasta))
      setPhotoFolders(Array.from(fset).sort())
    } catch {} finally { setLoading(false) }
  }, [eventId])

  useEffect(() => { carregar() }, [carregar])

  function showFeedback(type, text, ms = 3500) {
    setFeedback({ type, text })
    setTimeout(() => setFeedback(null), ms)
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '20vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  if (!event) {
    return <div style={{ padding: '2rem' }}>Evento não encontrado.</div>
  }

  return (
    <div style={{ maxWidth: embedded ? '100%' : '960px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div>
          {!embedded && (
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', margin: 0 }}>Vídeos do álbum</h1>
          )}
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Preço de vídeo padrão: {event.precoVideoPadrao
              ? `R$ ${Number(event.precoVideoPadrao).toFixed(2)} (álbum)`
              : globalVideoPrice
                ? `R$ ${Number(globalVideoPrice).toFixed(2)} (global)`
                : 'não definido'}
            . Para enviar novos vídeos, use o uploader único da aba <strong>Mídia</strong>:
            arraste arquivos <strong>.mp4</strong> junto com as fotos.
          </p>
        </div>
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

      {videos.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>🎥</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Nenhum vídeo neste álbum ainda.</p>
        </div>
      ) : (
        <VideosCardGrid
          videos={videos}
          allFolders={photoFolders}
          onEdit={setEditing}
          onChanged={(msg) => { if (msg) showFeedback('success', msg); carregar() }}
          onError={(msg) => showFeedback('error', msg)}
        />
      )}

      {editing && (
        <VideoAdminModal
          video={editing}
          event={event}
          allFolders={photoFolders}
          onClose={() => setEditing(null)}
          onUpdated={(msg) => {
            showFeedback('success', msg || 'Atualizado.')
            carregar()
          }}
          onDeleted={() => {
            setEditing(null)
            showFeedback('success', 'Vídeo removido.')
            carregar()
          }}
          onError={(msg) => showFeedback('error', msg || 'Erro.')}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// VideoAdminModal — modal completo para o admin: player, edição, ações
// ─────────────────────────────────────────────────────────────────────────────
function VideoAdminModal({ video, event, allFolders = [], onClose, onUpdated, onDeleted, onError }) {
  const [price, setPrice] = useState(video.price != null ? String(video.price) : '')
  const [gratis, setGratis] = useState(!!video.gratis)
  const [pasta, setPasta] = useState(video.pasta || '')
  const [pastaCustom, setPastaCustom] = useState(false)
  const [posterClean, setPosterClean] = useState(video.posterClean || null)
  const [thumbUploading, setThumbUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [previewWmStatus, setPreviewWmStatus] = useState(video.previewWmStatus || (video.previewWmFilename ? 'ready' : 'pending'))
  const [regenerating, setRegenerating] = useState(false)
  // Toggle: ver o vídeo original (limpo) ou o preview WM (como cliente vê).
  const [previewMode, setPreviewMode] = useState(false)

  const downloadUrl = `/api/videos/${video.id}/download`
  const previewUrl = `/api/videos/${video.id}/preview`
  const publicAlbumUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/evento/${video.eventId}#video-${video.publicId || video.id}`
    : ''

  async function handleSave() {
    setBusy(true)
    try {
      const patch = { id: video.id }
      const numPrice = price === '' ? null : Number(price)
      if (numPrice !== null && (!Number.isFinite(numPrice) || numPrice < 0)) {
        onError('Preço inválido.')
        setBusy(false)
        return
      }
      patch.price = numPrice
      patch.gratis = gratis
      patch.pasta = pasta ? String(pasta).trim() : null
      const res = await fetch('/api/videos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        onError(data.error || 'Erro ao salvar.')
        setBusy(false)
        return
      }
      onUpdated('Alterações salvas.')
    } catch (err) {
      onError(err.message || 'Erro de rede.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Remover vídeo "${video.originalName}"? Pode ser restaurado depois pela lixeira.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/videos?id=${video.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        onError(data.error || 'Erro ao remover.')
        setBusy(false)
        return
      }
      onDeleted()
    } catch (err) {
      onError(err.message || 'Erro de rede.')
    } finally {
      setBusy(false)
    }
  }

  async function handleThumbUpload(file) {
    if (!file) return
    setThumbUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/videos/${video.id}/poster`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        onError(data.error || 'Erro ao salvar miniatura.')
        return
      }
      setPosterClean(data.posterClean)
      onUpdated('Miniatura atualizada.')
    } catch (err) {
      onError(err.message || 'Erro de rede.')
    } finally {
      setThumbUploading(false)
    }
  }

  async function handleSetAsCover() {
    if (!posterClean) {
      onError('Defina uma miniatura primeiro (frame ou imagem customizada).')
      return
    }
    setBusy(true)
    try {
      // Define a capa do evento usando a URL do poster do vídeo.
      // O backend aceita coverImageFile como URL pronta de thumb.
      const patch = {
        coverImage: video.filename,
        coverImageThumb: posterClean,
        coverImageFile: posterClean,
      }
      const res = await fetch(`/api/events/${video.eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        onError(data.error || 'Erro ao definir capa.')
        setBusy(false)
        return
      }
      onUpdated('Vídeo definido como capa do álbum.')
    } catch (err) {
      onError(err.message || 'Erro de rede.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCaptureFrame() {
    // Captura o frame atual do <video> e envia como nova miniatura.
    const v = document.getElementById(`admin-video-${video.id}`)
    if (!v) return
    try {
      const canvas = document.createElement('canvas')
      const w = v.videoWidth || 1280
      const h = v.videoHeight || 720
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(v, 0, 0, w, h)
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92))
      if (!blob) { onError('Falha ao capturar frame.'); return }
      await handleThumbUpload(new File([blob], 'frame.jpg', { type: 'image/jpeg' }))
    } catch (err) {
      onError(err.message || 'Erro ao capturar frame.')
    }
  }

  async function handleRegeneratePreview() {
    if (regenerating) return
    setRegenerating(true)
    setPreviewWmStatus('processing')
    try {
      const res = await fetch(`/api/videos/${video.id}/regenerate-preview`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPreviewWmStatus('failed')
        onError(data.error || 'Falha ao gerar preview.')
        return
      }
      setPreviewWmStatus('ready')
      onUpdated('Pré-visualização com marca d\'água regenerada.')
    } catch (err) {
      setPreviewWmStatus('failed')
      onError(err.message || 'Erro de rede.')
    } finally {
      setRegenerating(false)
    }
  }

  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(publicAlbumUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1800)
    } catch {
      onError('Falha ao copiar link.')
    }
  }

  // Lista de pastas conhecidas + opção customizada
  const folderOptions = ['', ...allFolders]

  return (
    <div onClick={busy ? () => {} : (e => { if (e.target === e.currentTarget) onClose() })} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '1rem',
        maxWidth: '960px', width: '100%', maxHeight: '94vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1.1rem' }}>
            🎬 {video.originalName}
          </h3>
          <button onClick={onClose} disabled={busy} className="btn btn-ghost btn-sm">✕ Fechar</button>
        </div>

        {/* Player — usa aspect ratio real do vídeo, com fallback 16/9. */}
        {(() => {
          const vw = Number(video.width) || 16
          const vh = Number(video.height) || 9
          const ar = `${vw} / ${vh}`
          const isPortrait = vh > vw
          return (
            <div style={{
              aspectRatio: ar, background: '#000', borderRadius: 'var(--radius)', overflow: 'hidden',
              marginBottom: '0.75rem',
              maxWidth: isPortrait ? '320px' : '100%',
              maxHeight: '60vh',
              margin: '0 auto 0.75rem',
            }}>
              <video
                key={previewMode ? 'preview' : 'original'}
                id={`admin-video-${video.id}`}
                src={previewMode && previewWmStatus === 'ready' ? previewUrl : downloadUrl}
                poster={posterClean || undefined}
                controls
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
              />
            </div>
          )
        })()}

        {/* Toggle: ver como cliente (preview WM) vs admin (original limpo) */}
        {previewWmStatus === 'ready' && (
          <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-sm ${previewMode ? 'btn-ghost' : 'btn-secondary'}`}
              onClick={() => setPreviewMode(false)}
              title="Vídeo original sem marca d'água (admin / comprador)"
            >
              👤 Como admin (limpo)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${previewMode ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setPreviewMode(true)}
              title="Pré-visualização com marca d'água (cliente não-comprador)"
            >
              👁️ Como cliente (com WM)
            </button>
          </div>
        )}

        {/* Status da pré-visualização com marca d'água */}
        <div style={{
          padding: '0.55rem 0.8rem', marginBottom: '0.75rem', borderRadius: 'var(--radius)',
          fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem',
          background: previewWmStatus === 'ready' ? 'rgba(34,197,94,0.10)'
            : previewWmStatus === 'failed' ? 'rgba(220,38,38,0.12)'
            : 'rgba(245,158,11,0.12)',
          border: `1px solid ${
            previewWmStatus === 'ready' ? 'rgba(34,197,94,0.35)'
            : previewWmStatus === 'failed' ? 'rgba(220,38,38,0.4)'
            : 'rgba(245,158,11,0.4)'}`,
          color: previewWmStatus === 'ready' ? '#86efac'
            : previewWmStatus === 'failed' ? '#fca5a5'
            : '#fbbf24',
        }}>
          <span>
            {previewWmStatus === 'ready'
              ? '✓ Preview com marca d\'água pronto (servido para não-compradores).'
              : previewWmStatus === 'failed'
                ? '⚠️ Falha ao gerar preview com marca d\'água. Não-compradores não conseguem ver este vídeo.'
                : previewWmStatus === 'processing'
                  ? '⏳ Gerando preview com marca d\'água…'
                  : '⏸ Preview com marca d\'água ainda não foi gerado.'}
          </span>
          {(previewWmStatus !== 'ready' || regenerating) && previewWmStatus !== 'processing' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleRegeneratePreview} disabled={regenerating || busy}>
              {regenerating ? 'Gerando…' : '🔄 Regenerar preview'}
            </button>
          )}
          {previewWmStatus === 'ready' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleRegeneratePreview} disabled={regenerating || busy}>
              🔄 Regenerar
            </button>
          )}
        </div>

        {/* Linha 1: ações rápidas */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleCaptureFrame} disabled={thumbUploading || busy}>
            📸 Capturar frame atual
          </button>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            🖼️ Subir miniatura
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleThumbUpload(f) }} />
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleSetAsCover} disabled={busy || !posterClean}>
            🏆 Definir como capa do álbum
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={copyPublicLink}>
            🔗 {linkCopied ? 'Copiado!' : 'Copiar link público'}
          </button>
          <a className="btn btn-ghost btn-sm" href={downloadUrl} download={video.originalName || `${video.id}.mp4`}>
            ⬇️ Baixar original
          </a>
        </div>

        {/* Edição: preço, grátis, pasta */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <Field label="Preço (R$)">
            <input type="number" min="0" step="0.01" value={gratis ? '' : price}
              disabled={gratis}
              onChange={e => setPrice(e.target.value)}
              style={inputStyle} />
          </Field>

          <Field label="Status">
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem', padding: '0.55rem 0.7rem', background: 'var(--bg-input)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <input type="checkbox" checked={gratis} onChange={e => setGratis(e.target.checked)} />
              🎁 Marcar como grátis (download liberado)
            </label>
          </Field>

          <Field label="Pasta">
            {!pastaCustom ? (
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <select value={pasta || ''} onChange={e => {
                  if (e.target.value === '__new__') { setPastaCustom(true); setPasta('') }
                  else setPasta(e.target.value)
                }} style={{ ...inputStyle, flex: 1 }}>
                  <option value="">— raiz —</option>
                  {folderOptions.filter(Boolean).map(f => <option key={f} value={f}>📂 {f}</option>)}
                  <option value="__new__">+ nova pasta…</option>
                </select>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <input type="text" placeholder="nome da pasta" value={pasta} onChange={e => setPasta(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPastaCustom(false); setPasta('') }}>↩</button>
              </div>
            )}
          </Field>
        </div>

        {/* Metadados */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.6rem 0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          <strong>Metadados:</strong>{' '}
          {video.duration ? `${formatDuration(video.duration)}` : 'duração —'}
          {video.width && video.height ? ` · ${video.width}×${video.height}` : ''}
          {video.size ? ` · ${formatBytes(video.size)}` : ''}
          {video.takenAt ? ` · ${new Date(video.takenAt).toLocaleString('pt-BR')}` : ''}
          {video.publicId ? ` · ID público: ${video.publicId}` : ''}
        </div>

        {/* Footer: salvar / remover */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={handleDelete} disabled={busy} style={{ color: '#fca5a5' }}>
            🗑 Remover vídeo
          </button>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  padding: '0.55rem 0.7rem', background: 'var(--bg-input)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  color: 'var(--text)', fontSize: '0.88rem', width: '100%',
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// VideosCardGrid — exibição de vídeos como cards (não lista) com seleção
// múltipla e ações em lote: preço, gratuidade, mover para pasta, excluir.
// ─────────────────────────────────────────────────────────────────────────────
function VideosCardGrid({ videos, allFolders, onEdit, onChanged, onError }) {
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkPasta, setBulkPasta] = useState('')
  const [bulkPastaCustom, setBulkPastaCustom] = useState(false)

  const visibleVideos = videos.filter(v => !v.removida)
  const allVisibleIds = visibleVideos.map(v => v.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selected.has(id))

  function toggleOne(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(allVisibleIds))
  }

  async function bulkPatch(patch, successMsg) {
    if (!selected.size || busy) return
    setBusy(true)
    let ok = 0
    let failed = 0
    try {
      // PATCH em paralelo controlado
      const ids = Array.from(selected)
      const concurrency = 4
      let cursor = 0
      const workers = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
        while (cursor < ids.length) {
          const i = cursor++
          const id = ids[i]
          try {
            const res = await fetch('/api/videos', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, ...patch }),
            })
            if (res.ok) ok++
            else failed++
          } catch {
            failed++
          }
        }
      })
      await Promise.all(workers)
    } finally {
      setBusy(false)
      setSelected(new Set())
      if (failed > 0) onError(`${ok} atualizado(s), ${failed} falharam.`)
      else onChanged(successMsg || `${ok} atualizado(s).`)
    }
  }

  async function bulkDelete() {
    if (!selected.size || busy) return
    if (!confirm(`Remover ${selected.size} vídeo(s)? Eles ficam disponíveis na lixeira para restaurar.`)) return
    setBusy(true)
    let ok = 0
    let failed = 0
    try {
      const ids = Array.from(selected)
      for (const id of ids) {
        try {
          const res = await fetch(`/api/videos?id=${id}`, { method: 'DELETE' })
          if (res.ok) ok++
          else failed++
        } catch {
          failed++
        }
      }
    } finally {
      setBusy(false)
      setSelected(new Set())
      if (failed > 0) onError(`${ok} removido(s), ${failed} falharam.`)
      else onChanged(`${ok} vídeo(s) removido(s).`)
    }
  }

  async function applyBulkPrice() {
    const num = bulkPrice === '' ? null : Number(bulkPrice)
    if (num !== null && (!Number.isFinite(num) || num < 0)) {
      onError('Preço inválido.')
      return
    }
    setShowPriceModal(false)
    await bulkPatch({ price: num, gratis: false }, num === 0 ? `Marcado como grátis (R$ 0).` : `Preço definido para R$ ${num?.toFixed(2)}.`)
    setBulkPrice('')
  }

  async function applyBulkFolder() {
    const folder = bulkPasta?.trim() || null
    setShowFolderModal(false)
    await bulkPatch({ pasta: folder }, folder ? `Movido para 📂 ${folder}.` : 'Movido para a raiz.')
    setBulkPasta('')
    setBulkPastaCustom(false)
  }

  return (
    <div>
      {/* Toolbar de seleção */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center',
        marginBottom: '0.75rem', padding: '0.55rem 0.75rem',
        background: selected.size > 0 ? 'rgba(201,169,110,0.10)' : 'var(--bg-card)',
        border: `1px solid ${selected.size > 0 ? 'rgba(201,169,110,0.4)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
      }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={toggleAll}>
          {allSelected ? '☑️ Desmarcar todos' : `☐ Selecionar todos (${visibleVideos.length})`}
        </button>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {selected.size > 0 ? `${selected.size} selecionado(s)` : 'Selecione vídeos para ações em lote'}
        </span>
        {selected.size > 0 && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setBulkPrice(''); setShowPriceModal(true) }} disabled={busy}>
              💰 Definir preço
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => bulkPatch({ gratis: true, price: 0 }, 'Marcado(s) como grátis.')} disabled={busy}>
              🎁 Marcar grátis
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setBulkPasta(''); setBulkPastaCustom(false); setShowFolderModal(true) }} disabled={busy}>
              📂 Mover para pasta
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={bulkDelete} disabled={busy} style={{ color: '#fca5a5' }}>
              🗑 Excluir
            </button>
          </>
        )}
      </div>

      {/* Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '0.6rem',
      }}>
        {videos.map(v => {
          const isSel = selected.has(v.id)
          // Para o admin, mostra o poster clean (sem WM); fallback para WM se não houver clean.
          const posterSrc = v.posterClean || v.posterWm
          return (
            <div
              key={v.id}
              onClick={(e) => {
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                  toggleOne(v.id)
                } else if (!v.removida) {
                  onEdit(v)
                }
              }}
              style={{
                background: 'var(--bg-card)',
                border: `2px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
                position: 'relative',
                cursor: v.removida ? 'default' : 'pointer',
                opacity: v.removida ? 0.5 : 1,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => { if (!isSel && !v.removida) e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              {/* Checkbox de seleção */}
              <div
                onClick={(e) => { e.stopPropagation(); toggleOne(v.id) }}
                title={isSel ? 'Desmarcar vídeo' : 'Selecionar vídeo'}
                style={{
                  position: 'absolute', top: 4, left: 4, zIndex: 2,
                  width: 18, height: 18, borderRadius: 3,
                  background: isSel ? 'var(--accent)' : 'rgba(0,0,0,0.55)',
                  border: '1.5px solid rgba(255,255,255,0.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: '#000', fontWeight: 700, cursor: 'pointer',
                }}
              >
                {isSel ? '✓' : ''}
              </div>

              {/* Badge de tipo */}
              <span style={{
                position: 'absolute', top: 4, right: 4, zIndex: 2,
                background: 'rgba(99,102,241,0.85)', color: '#fff',
                fontSize: '0.6rem', padding: '0.05rem 0.3rem',
                borderRadius: 4, fontWeight: 700,
              }}>
                🎬 VÍDEO
              </span>

              {/* Thumbnail */}
              <div style={{
                width: '100%', aspectRatio: '4 / 3',
                background: 'var(--bg-input)', position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {posterSrc ? (
                  <img
                    src={posterSrc}
                    alt={v.originalName}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: '2.4rem', color: 'var(--text-dim)' }}>🎥</span>
                )}
                {v.duration ? (
                  <span style={{
                    position: 'absolute', right: 4, bottom: 4,
                    background: 'rgba(0,0,0,0.78)', color: '#fff',
                    fontSize: '0.65rem', padding: '0.05rem 0.3rem', borderRadius: 4,
                  }}>
                    {formatDuration(v.duration)}
                  </span>
                ) : null}
              </div>

              {/* Info */}
              <div style={{ padding: '0.45rem 0.55rem' }}>
                <div style={{
                  fontSize: '0.76rem', fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  color: 'var(--text)',
                }}>
                  {v.originalName}
                </div>
                <div style={{ marginTop: 2, fontSize: '0.68rem', color: 'var(--text-dim)', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  <span>{formatBytes(v.size)}</span>
                  {v.pasta && <span>📂 {v.pasta}</span>}
                  {v.previewWmStatus && v.previewWmStatus !== 'ready' && (
                    <span style={{ color: v.previewWmStatus === 'failed' ? '#fca5a5' : '#fbbf24' }}>
                      {v.previewWmStatus === 'failed' ? '⚠️ preview' : '⏳ preview'}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 3, fontSize: '0.72rem', fontWeight: 600 }}>
                  {v.gratis
                    ? <span style={{ color: '#86efac' }}>🎁 Grátis</span>
                    : (v.price != null
                      ? <span>R$ {Number(v.price).toFixed(2)}</span>
                      : <span style={{ color: 'var(--text-dim)' }}>preço padrão</span>)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal: definir preço em lote */}
      {showPriceModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowPriceModal(false) }} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '1.25rem', maxWidth: 360, width: '100%',
          }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem' }}>Definir preço para {selected.size} vídeo(s)</h3>
            <Field label="Preço (R$)">
              <input type="number" min="0" step="0.01" value={bulkPrice}
                onChange={e => setBulkPrice(e.target.value)}
                placeholder="0.00 = grátis · vazio = sem preço fixo"
                autoFocus style={inputStyle} />
            </Field>
            <p style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Vazio remove o preço (volta a usar padrão do álbum/global). 0 marca como grátis.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPriceModal(false)} disabled={busy}>Cancelar</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={applyBulkPrice} disabled={busy}>Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: mover para pasta em lote */}
      {showFolderModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowFolderModal(false) }} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '1.25rem', maxWidth: 380, width: '100%',
          }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem' }}>Mover {selected.size} vídeo(s) para pasta</h3>
            <Field label="Pasta destino">
              {!bulkPastaCustom ? (
                <select value={bulkPasta} onChange={e => {
                  if (e.target.value === '__new__') { setBulkPastaCustom(true); setBulkPasta('') }
                  else setBulkPasta(e.target.value)
                }} style={inputStyle}>
                  <option value="">— raiz —</option>
                  {allFolders.map(f => <option key={f} value={f}>📂 {f}</option>)}
                  <option value="__new__">+ nova pasta…</option>
                </select>
              ) : (
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  <input type="text" placeholder="nome da pasta" value={bulkPasta}
                    onChange={e => setBulkPasta(e.target.value)} autoFocus
                    style={{ ...inputStyle, flex: 1 }} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setBulkPastaCustom(false); setBulkPasta('') }}>↩</button>
                </div>
              )}
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFolderModal(false)} disabled={busy}>Cancelar</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={applyBulkFolder} disabled={busy}>Mover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
