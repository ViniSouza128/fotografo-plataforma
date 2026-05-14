'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { getDefaultDerivativeConfig } from '@/lib/derivedImagesConfig'
import { computeWatermarkBox, normalizeAnchor } from '@/lib/watermarkPlacement'

const RATIO_OPTIONS = ['2:3', '3:2', '3:4', '4:3', '1:1', '16:9', '9:16']
const SIZE_MODE_OPTIONS = [
  { id: 'proportional', label: 'Proporcional' },
  { id: 'fit', label: 'Ajustar' },
  { id: 'fill', label: 'Preencher' },
]
const ANCHOR_OPTIONS = [
  ['top-left', 'top', 'top-right'],
  ['center-left', 'center', 'center-right'],
  ['bottom-left', 'bottom', 'bottom-right'],
]

const VARIANT_META = {
  global: {
    title: 'Marca global',
    description: 'Usada em todas as derivadas quando não houver PNG específico ativo.',
  },
  grid: {
    title: 'Grid',
    description: 'Versão principal proporcional para exibição e navegação.',
  },
  thumbs: {
    title: 'Thumb',
    description: 'Miniatura quadrada do catálogo.',
  },
  mini: {
    title: 'Mini',
    description: 'Prévia de 90px ou no tamanho que estiver configurado.',
  },
  covers: {
    title: 'Cover',
    description: 'Capa proporcional do evento.',
  },
}

function buildInitialConfig() {
  const defaults = getDefaultDerivativeConfig()
  return {
    watermarkAsset: null,
    watermarkOpacity: defaults.watermarkOpacity,
    watermarkPosition: defaults.watermarkPosition,
    watermarkAnchor: defaults.watermarkAnchor,
    watermarkSizeMode: defaults.watermarkSizeMode,
    watermarkOffsetX: defaults.watermarkOffsetX,
    watermarkOffsetY: defaults.watermarkOffsetY,
    watermarkScalePercent: defaults.watermarkScalePercent,
    derivatives: defaults.derivatives,
    watermarkVariants: defaults.watermarkVariants,
  }
}

function getVariantSummary(config, variant) {
  if (variant === 'grid') return `lado maior até ${config.derivatives.grid.maxSize}px`
  if (variant === 'thumbs') return `${config.derivatives.thumbs.size}x${config.derivatives.thumbs.size}px`
  if (variant === 'mini') return `${config.derivatives.mini.size}x${config.derivatives.mini.size}px`
  if (variant === 'covers') return `largura até ${config.derivatives.covers.width}px`
  return 'global'
}

function checkerboardStyle() {
  return {
    background: 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 0 0 / 16px 16px',
    borderRadius: 'var(--radius)',
    padding: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '110px',
  }
}

function cardStyle() {
  return {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '1.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  }
}

export default function MarcaDaguaPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [uploadingVariant, setUploadingVariant] = useState(null)
  const [deletingVariant, setDeletingVariant] = useState(null)
  const [regenResult, setRegenResult] = useState(null)
  const [regenJob, setRegenJob] = useState(null)
  const [msg, setMsg] = useState(null)
  const [config, setConfig] = useState(buildInitialConfig)
  const [previewRatio, setPreviewRatio] = useState('3:2')
  const [wmMeta, setWmMeta] = useState(null)
  const [events, setEvents] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [regenScope, setRegenScope] = useState('all') // all | selected
  const [selectedEvents, setSelectedEvents] = useState([])
  const [overlayEnabled, setOverlayEnabled] = useState(false)
  const [forceRegenerate, setForceRegenerate] = useState(true)
  const [defaultWmCapa, setDefaultWmCapa] = useState(false)
  const [defaultWmMiniaturas, setDefaultWmMiniaturas] = useState(true)
  const [watermarks, setWatermarks] = useState({
    global: { exists: false, url: null },
    grid: { exists: false, url: null },
    thumbs: { exists: false, url: null },
    mini: { exists: false, url: null },
    covers: { exists: false, url: null },
    video: { exists: false, url: null },
  })
  const [assets, setAssets] = useState([])
  const [uploadingAsset, setUploadingAsset] = useState(false)
  const [uploadOrientation, setUploadOrientation] = useState('any')

  // Estado da marca d'água específica para vídeos
  const [uploadingVideoWm, setUploadingVideoWm] = useState(false)
  const [deletingVideoWm, setDeletingVideoWm] = useState(false)

  // Estado da regeneração em lote de previews de vídeo
  const [videoStats, setVideoStats] = useState(null)
  const [videoRegenResult, setVideoRegenResult] = useState(null)
  const [videoRegenerating, setVideoRegenerating] = useState(false)
  const [videoRegenEventId, setVideoRegenEventId] = useState('')
  const [videoRegenForce, setVideoRegenForce] = useState(false)

  const inputRefs = {
    global: useRef(null),
    grid: useRef(null),
    thumbs: useRef(null),
    mini: useRef(null),
    covers: useRef(null),
  }
  const assetInputRef = useRef(null)
  const videoWmInputRef = useRef(null)

  const previewWatermarkUrl = useMemo(() => {
    const assetMap = new Map(assets.map((a) => [a.id, a]))
    const candidateIds = []
    if (config.watermarkAsset) candidateIds.push(config.watermarkAsset)
    const variantAssets = Object.values(config.watermarkVariants || {})
      .map((v) => v?.asset)
      .filter(Boolean)
    candidateIds.push(...variantAssets)

    for (const id of candidateIds) {
      const found = assetMap.get(id)
      if (found?.url) return found.url
    }

    if (assets[0]?.url) return assets[0].url

    const order = ['global', 'grid', 'thumbs', 'mini', 'covers']
    for (const key of order) {
      const url = watermarks[key]?.url
      if (url) return url
    }
    return null
  }, [assets, config.watermarkAsset, config.watermarkVariants, watermarks])

  const previewCanvas = useMemo(() => {
    const [w, h] = (previewRatio || '3:2').split(':').map(Number)
    const baseWidth = 780
    const ratio = (h || 2) / (w || 3)
    return { width: baseWidth, height: Math.round(baseWidth * ratio) }
  }, [previewRatio])

  const previewPlacement = useMemo(() => {
    const wmWidth = wmMeta?.width || previewCanvas.width * 0.5
    const wmHeight = wmMeta?.height || previewCanvas.height * 0.18

    return computeWatermarkBox({
      imageWidth: previewCanvas.width,
      imageHeight: previewCanvas.height,
      watermarkWidth: wmWidth,
      watermarkHeight: wmHeight,
      sizeMode: config.watermarkSizeMode || 'proportional',
      anchor: config.watermarkAnchor || config.watermarkPosition || 'center',
      offsetX: config.watermarkOffsetX ?? 0,
      offsetY: config.watermarkOffsetY ?? 0,
      scalePercent: config.watermarkScalePercent ?? 40,
    })
  }, [
    previewCanvas.width,
    previewCanvas.height,
    wmMeta?.width,
    wmMeta?.height,
    config.watermarkSizeMode,
    config.watermarkAnchor,
    config.watermarkPosition,
    config.watermarkOffsetX,
    config.watermarkOffsetY,
    config.watermarkScalePercent,
  ])

  function showMsg(type, text) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 5000)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cfgRes, wmRes] = await Promise.all([fetch('/api/config'), fetch('/api/watermark')])
        if (!cfgRes.ok || !wmRes.ok) throw new Error('load_failed')

        const cfg = await cfgRes.json()
        const defaults = getDefaultDerivativeConfig()
        setConfig({
          watermarkAsset: cfg.watermarkAsset || null,
          watermarkOpacity: cfg.watermarkOpacity ?? defaults.watermarkOpacity,
          watermarkPosition: cfg.watermarkPosition ?? defaults.watermarkPosition,
          watermarkAnchor: normalizeAnchor(cfg.watermarkAnchor ?? cfg.watermarkPosition ?? defaults.watermarkAnchor),
          watermarkSizeMode: cfg.watermarkSizeMode || defaults.watermarkSizeMode,
          watermarkOffsetX: Number.isFinite(cfg.watermarkOffsetX) ? cfg.watermarkOffsetX : defaults.watermarkOffsetX,
          watermarkOffsetY: Number.isFinite(cfg.watermarkOffsetY) ? cfg.watermarkOffsetY : defaults.watermarkOffsetY,
          watermarkScalePercent: Number.isFinite(cfg.watermarkScalePercent) ? cfg.watermarkScalePercent : defaults.watermarkScalePercent,
          derivatives: {
            ...defaults.derivatives,
            ...(cfg.derivatives || {}),
          },
          watermarkVariants: {
            ...defaults.watermarkVariants,
            ...(cfg.watermarkVariants || {}),
          },
        })

        const wm = await wmRes.json()
        setWatermarks({
          global: wm.watermarks?.variants?.global || wm.watermarks?.global || { exists: false, url: null },
          grid: wm.watermarks?.variants?.grid || wm.watermarks?.grid || { exists: false, url: null },
          thumbs: wm.watermarks?.variants?.thumbs || wm.watermarks?.thumbs || { exists: false, url: null },
          mini: wm.watermarks?.variants?.mini || wm.watermarks?.mini || { exists: false, url: null },
          covers: wm.watermarks?.variants?.covers || wm.watermarks?.covers || { exists: false, url: null },
          video: wm.watermarks?.variants?.video || wm.watermarks?.video || { exists: false, url: null },
        })
        setAssets(wm.watermarks?.assets || [])
        setDefaultWmCapa(cfg.defaultWmCapa !== undefined ? !!cfg.defaultWmCapa : false)
        setDefaultWmMiniaturas(cfg.defaultWmMiniaturas !== undefined ? !!cfg.defaultWmMiniaturas : true)
      } catch {
        showMsg('error', 'Erro ao carregar configurações.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  // Poll regeneration job state.
  useEffect(() => {
    let stopped = false
    let timer = null
    async function poll() {
      try {
        const res = await fetch('/api/watermark/regenerar')
        if (!res.ok) return
        const data = await res.json()
        if (stopped) return
        setRegenJob(data || null)
        if (data?.running) {
          setRegenerating(true)
        } else if (regenerating) {
          setRegenerating(false)
          setRegenResult(data)
          if (data?.failed > 0) showMsg('error', `Regeneração concluída com ${data.failed} falha(s).`)
          else showMsg('success', 'Regeneração concluída.')
        }
      } catch {}
      if (!stopped) timer = setTimeout(poll, regenerating ? 1500 : 3000)
    }
    poll()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [regenerating])

  useEffect(() => {
    async function loadEvents() {
      setLoadingEvents(true)
      try {
        const res = await fetch('/api/events?stats=1')
        if (!res.ok) throw new Error('load_events_failed')
        const data = await res.json()
        setEvents(Array.isArray(data) ? data : [])
      } catch {
        setEvents([])
      } finally {
        setLoadingEvents(false)
      }
    }

    loadEvents()
  }, [])

  useEffect(() => {
    async function loadVideoStats() {
      try {
        const res = await fetch('/api/videos/regenerate-all-previews')
        if (!res.ok) return
        const data = await res.json()
        setVideoStats(data.stats || null)
      } catch {}
    }
    loadVideoStats()
  }, [])

  async function handleSaveSettings() {
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watermarkAsset: config.watermarkAsset,
          watermarkOpacity: config.watermarkOpacity,
          watermarkPosition: config.watermarkPosition,
          watermarkAnchor: config.watermarkAnchor,
          watermarkSizeMode: config.watermarkSizeMode,
          watermarkOffsetX: config.watermarkOffsetX,
          watermarkOffsetY: config.watermarkOffsetY,
          watermarkScalePercent: config.watermarkScalePercent,
          watermarkVariants: config.watermarkVariants,
        }),
      })

      if (!res.ok) throw new Error('save_failed')
      showMsg('success', 'Configurações de marca d\'água salvas.')
    } catch {
      showMsg('error', 'Erro ao salvar configurações.')
    } finally {
      setSaving(false)
    }
  }

  async function handleWatermarkUpload(variant, event) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingVariant(variant)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/watermark?variant=${variant}`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'upload_failed')

      setWatermarks(data.watermarks || watermarks)
      showMsg('success', `PNG salvo para ${VARIANT_META[variant].title.toLowerCase()}.`)
    } catch (err) {
      showMsg('error', err.message && err.message !== 'upload_failed' ? err.message : 'Erro ao enviar o PNG.')
    } finally {
      setUploadingVariant(null)
      if (inputRefs[variant]?.current) inputRefs[variant].current.value = ''
    }
  }

  async function handleRemoveWatermark(variant) {
    const label = VARIANT_META[variant].title.toLowerCase()
    const confirmed = window.confirm(
      variant === 'global'
        ? 'Remover a marca global? O fallback em texto continuará disponível.'
        : `Remover o PNG específico de ${label}? A variante voltará a usar a marca global.`,
    )
    if (!confirmed) return

    setDeletingVariant(variant)
    try {
      const res = await fetch(`/api/watermark?variant=${variant}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'delete_failed')

      setWatermarks(data.watermarks || watermarks)
      showMsg('success', 'PNG removido.')
    } catch {
      showMsg('error', 'Erro ao remover o PNG.')
    } finally {
      setDeletingVariant(null)
    }
  }

  async function handleRegenerate() {
    const scoped = regenScope === 'selected'
    if (scoped && selectedEvents.length === 0) {
      showMsg('error', 'Selecione pelo menos um álbum para regenerar.')
      return
    }

    const confirmed = window.confirm(
      scoped
        ? 'Regenerar derivadas dos álbuns selecionados em segundo plano? Os já atualizados serão pulados com explicação.'
        : 'Regenerar derivadas de todo o acervo em segundo plano? Os álbuns já atualizados serão pulados.',
    )
    if (!confirmed) return

    setRegenResult(null)
    try {
      const payload = {
        ...(scoped ? { eventIds: selectedEvents } : {}),
        overlay: !!overlayEnabled,
        forceRegenerate: !!forceRegenerate,
      }
      const res = await fetch('/api/watermark/regenerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'regenerate_failed')

      setRegenJob(data?.state || null)
      setRegenerating(true)
      showMsg(data?.started ? 'success' : 'info', data?.started ? 'Regeneração iniciada em segundo plano.' : 'Já existe uma regeneração em andamento.')
    } catch {
      showMsg('error', 'Erro ao iniciar regeneração.')
    }
  }

  async function handleSaveDefaults() {
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultWmCapa, defaultWmMiniaturas }),
      })
      if (!res.ok) throw new Error('save_failed')
      showMsg('success', 'Defaults salvos para novos álbuns.')
    } catch {
      showMsg('error', 'Erro ao salvar defaults.')
    }
  }

  async function handleVideoWatermarkUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadingVideoWm(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/watermark?variant=video', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'upload_failed')
      const variants = data.watermarks?.variants || {}
      setWatermarks((prev) => ({ ...prev, video: variants.video || { exists: true, url: null } }))
      // Força reload para pegar a URL com cache-bust
      const wmRes = await fetch('/api/watermark')
      if (wmRes.ok) {
        const wm = await wmRes.json()
        setWatermarks((prev) => ({
          ...prev,
          video: wm.watermarks?.variants?.video || { exists: false, url: null },
        }))
      }
      showMsg('success', 'PNG de vídeo salvo. Regenere os previews para aplicar.')
    } catch {
      showMsg('error', 'Erro ao enviar o PNG de vídeo.')
    } finally {
      setUploadingVideoWm(false)
      if (videoWmInputRef.current) videoWmInputRef.current.value = ''
    }
  }

  async function handleRemoveVideoWatermark() {
    const confirmed = window.confirm('Remover o PNG de marca d\'água de vídeo? Os previews existentes não mudam até serem regenerados.')
    if (!confirmed) return
    setDeletingVideoWm(true)
    try {
      const res = await fetch('/api/watermark?variant=video', { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'delete_failed')
      const variants = data.watermarks?.variants || {}
      setWatermarks((prev) => ({ ...prev, video: variants.video || { exists: false, url: null } }))
      showMsg('success', 'PNG de vídeo removido. Novos previews usarão marca em texto.')
    } catch {
      showMsg('error', 'Erro ao remover o PNG de vídeo.')
    } finally {
      setDeletingVideoWm(false)
    }
  }

  async function handleVideoRegen() {
    const hasScope = !!videoRegenEventId
    const confirmed = window.confirm(
      videoRegenForce
        ? 'Reprocessar TODOS os vídeos' + (hasScope ? ' do evento selecionado' : '') + ' com a marca d\'água atual? Isso pode demorar vários minutos.'
        : 'Regenerar previews pendentes/falhados' + (hasScope ? ' do evento selecionado' : '') + '?',
    )
    if (!confirmed) return

    setVideoRegenResult(null)
    setVideoRegenerating(true)
    try {
      const res = await fetch('/api/videos/regenerate-all-previews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: videoRegenEventId || null,
          force: !!videoRegenForce,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'regen_failed')
      setVideoRegenResult(data)
      // Atualiza stats
      const statsRes = await fetch('/api/videos/regenerate-all-previews')
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setVideoStats(statsData.stats || null)
      }
      if (data.failed > 0) showMsg('error', `Regeneração concluída com ${data.failed} falha(s).`)
      else showMsg('success', `Regeneração concluída. ${data.done} preview(s) gerado(s).`)
    } catch (err) {
      showMsg('error', 'Erro ao regenerar previews: ' + (err.message || 'desconhecido'))
    } finally {
      setVideoRegenerating(false)
    }
  }

  async function handleAssetOrientationChange(id, orientation) {
    try {
      const res = await fetch('/api/watermark/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, orientation }),
      })
      if (!res.ok) throw new Error('patch_failed')
      const data = await res.json()
      setAssets(data.assets || [])
    } catch {
      showMsg('error', 'Erro ao atualizar orientação.')
    }
  }

  async function handleAssetUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadingAsset(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('orientation', uploadOrientation || 'any')
      const res = await fetch('/api/watermark/assets', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'upload_failed')
      setAssets(data.assets || [])
      if (!config.watermarkAsset) {
        const newest = data.asset?.id || (data.assets || [])[0]?.id || null
        if (newest) setConfig((prev) => ({ ...prev, watermarkAsset: newest }))
      }
      showMsg('success', 'PNG cadastrado.')
    } catch (err) {
      showMsg('error', err.message && err.message !== 'upload_failed' ? err.message : 'Erro ao enviar PNG.')
    } finally {
      setUploadingAsset(false)
      if (assetInputRef.current) assetInputRef.current.value = ''
    }
  }

  async function handleAssetDelete(id) {
    if (!id) return
    try {
      const res = await fetch(`/api/watermark/assets?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete_failed')
      const data = await res.json()
      setAssets(data.assets || [])
      if (config.watermarkAsset === id) {
        const fallback = (data.assets || []).find((a) => a.id !== id)
        setConfig((prev) => ({ ...prev, watermarkAsset: fallback?.id || null }))
      }
      showMsg(data.removed ? 'success' : 'info', data.removed ? 'PNG removido.' : 'Arquivo protegido; não foi removido.')
    } catch {
      showMsg('error', 'Não foi possível remover PNG.')
    }
  }

  function toggleVariantEnabled(variant) {
    setConfig((prev) => ({
      ...prev,
      watermarkVariants: {
        ...prev.watermarkVariants,
        [variant]: {
          ...(prev.watermarkVariants?.[variant] || {}),
          enabled: !prev.watermarkVariants?.[variant]?.enabled,
        },
      },
    }))
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '60vh', gap: '1rem' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
        <span style={{ color: 'var(--text-muted)' }}>Carregando...</span>
      </div>
    )
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <Link href="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>← Dashboard</Link>
          <h1 className="admin-page-title" style={{ marginTop: '0.25rem' }}>Marca d&apos;água</h1>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'danger'}`} style={{ marginBottom: '1.5rem' }}>
          {msg.text}
        </div>
      )}

      <div style={{ ...cardStyle(), maxWidth: '1200px', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '0.4rem' }}>Regras de aplicação</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.5', maxWidth: '68ch' }}>
              Opacidade, âncora, deslocamentos e modo de escala seguem a lógica do Lightroom Classic. Dimensões e qualidades das derivadas continuam em <Link href="/admin/configuracoes">Configurações</Link>.
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleSaveSettings} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar regras'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Opacidade ({Math.round((config.watermarkOpacity || 0.45) * 100)}%)</label>
            <input aria-label="Opacidade ({Math.round((config.watermarkOpacity || 0.45) * 100)}%)"
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round((config.watermarkOpacity || 0.45) * 100)}
              onChange={(e) => setConfig((prev) => ({ ...prev, watermarkOpacity: Number(e.target.value) / 100 }))}
              style={{ width: '100%', accentColor: 'var(--accent)', marginTop: '0.35rem' }}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Modo de tamanho</label>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {SIZE_MODE_OPTIONS.map((mode) => {
                const active = (config.watermarkSizeMode || 'proportional') === mode.id
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, watermarkSizeMode: mode.id }))}
                    className="btn"
                    style={{
                      background: active ? 'var(--accent)' : 'var(--bg-input)',
                      color: active ? '#fff' : 'var(--text)',
                      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                      flex: '1 1 100px',
                    }}
                  >
                    {mode.label}
                  </button>
                )
              })}
            </div>
            {config.watermarkSizeMode === 'proportional' && (
              <div style={{ marginTop: '0.5rem' }}>
                <label className="form-label" style={{ fontSize: '0.82rem' }}>
                  Escala (%)
                  <span style={{ color: 'var(--text-muted)', marginLeft: '0.35rem' }}>{config.watermarkScalePercent ?? 40}%</span>
                </label>
                <input aria-label="Escala (%) {config.watermarkScalePercent ?? 40}%"
                  type="range"
                  min="5"
                  max="200"
                  step="1"
                  value={config.watermarkScalePercent ?? 40}
                  onChange={(e) => setConfig((prev) => ({ ...prev, watermarkScalePercent: Number(e.target.value) }))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>
            )}
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Deslocamento horizontal ({config.watermarkOffsetX ?? 0})</label>
            <input aria-label="Deslocamento horizontal ({config.watermarkOffsetX ?? 0})"
              type="range"
              min="-10"
              max="10"
              step="1"
              value={config.watermarkOffsetX ?? 0}
              onChange={(e) => setConfig((prev) => ({ ...prev, watermarkOffsetX: Number(e.target.value) }))}
              style={{ width: '100%', accentColor: 'var(--accent)', marginTop: '0.35rem' }}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Deslocamento vertical ({config.watermarkOffsetY ?? 0})</label>
            <input aria-label="Deslocamento vertical ({config.watermarkOffsetY ?? 0})"
              type="range"
              min="-10"
              max="10"
              step="1"
              value={config.watermarkOffsetY ?? 0}
              onChange={(e) => setConfig((prev) => ({ ...prev, watermarkOffsetY: Number(e.target.value) }))}
              style={{ width: '100%', accentColor: 'var(--accent)', marginTop: '0.35rem' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', alignItems: 'stretch' }}>
          <div>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Âncora (grade 3x3)</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.4rem' }}>
              {ANCHOR_OPTIONS.flat().map((anchor) => {
                const active = normalizeAnchor(config.watermarkAnchor || config.watermarkPosition) === anchor
                const label = {
                  'top-left': 'Sup. Esq.',
                  top: 'Sup. Centro',
                  'top-right': 'Sup. Dir.',
                  'center-left': 'Centro Esq.',
                  center: 'Centro',
                  'center-right': 'Centro Dir.',
                  'bottom-left': 'Inf. Esq.',
                  bottom: 'Inf. Centro',
                  'bottom-right': 'Inf. Dir.',
                }[anchor]

                return (
                  <button
                    key={anchor}
                    type="button"
                    onClick={() => setConfig((prev) => ({
                      ...prev,
                      watermarkAnchor: anchor,
                      watermarkPosition: anchor,
                    }))}
                    className="btn btn-secondary"
                    style={{
                      border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: active ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-input)',
                      color: 'var(--text)',
                      padding: '0.5rem 0.6rem',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '0.75rem 0.85rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Simulação</p>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
              {RATIO_OPTIONS.map((ratio) => {
                const active = previewRatio === ratio
                return (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setPreviewRatio(ratio)}
                    className="btn"
                    style={{
                      padding: '0.35rem 0.65rem',
                      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: active ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                      color: 'var(--text)',
                      fontSize: '0.82rem',
                    }}
                  >
                    {ratio}
                  </button>
                )
              })}
            </div>

            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: (previewRatio.includes(':') ? previewRatio.replace(':', '/') : '3 / 2'),
                background: 'linear-gradient(135deg, #1f2937, #0f172a)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 20%, #ffffff0f, transparent 45%)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, #ffffff06 0 1px, transparent 1px 16px)' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff26', fontSize: '4vw', fontWeight: 700, letterSpacing: '0.4em' }}>
                PREVIEW
              </div>

              {previewWatermarkUrl ? (
                <img
                  src={previewWatermarkUrl}
                  alt="Preview watermark"
                  onLoad={(e) => setWmMeta({ width: e.target.naturalWidth, height: e.target.naturalHeight })}
                  style={{
                    position: 'absolute',
                    left: `${(previewPlacement.left / previewCanvas.width) * 100}%`,
                    top: `${(previewPlacement.top / previewCanvas.height) * 100}%`,
                    width: `${(previewPlacement.width / previewCanvas.width) * 100}%`,
                    height: `${(previewPlacement.height / previewCanvas.height) * 100}%`,
                    opacity: config.watermarkOpacity ?? 0.45,
                    filter: 'drop-shadow(0 2px 6px #0008)',
                    objectFit: config.watermarkSizeMode === 'fill' ? 'cover' : 'contain',
                  }}
                />
              ) : (
                <div
                  style={{
                    position: 'absolute',
                    left: `${(previewPlacement.left / previewCanvas.width) * 100}%`,
                    top: `${(previewPlacement.top / previewCanvas.height) * 100}%`,
                    width: `${(previewPlacement.width / previewCanvas.width) * 100}%`,
                    height: `${(previewPlacement.height / previewCanvas.height) * 100}%`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#ffffff14',
                    color: '#fff',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    opacity: config.watermarkOpacity ?? 0.45,
                  }}
                >
                  Marca d&apos;água
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle(), maxWidth: '960px', margin: '0 auto 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', marginBottom: '0.25rem' }}>Defaults para novos álbuns</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.5' }}>
              Definem se a marca d&apos;água será aplicada na <strong>capa</strong> e nas <strong>miniaturas</strong> dos álbuns recém-criados. Cada álbum pode sobrescrever depois.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <label style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!defaultWmCapa} onChange={(e) => setDefaultWmCapa(e.target.checked)} />
            <span>WM na capa por padrão</span>
          </label>
          <label style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!defaultWmMiniaturas} onChange={(e) => setDefaultWmMiniaturas(e.target.checked)} />
            <span>WM nas miniaturas por padrão</span>
          </label>
          <button className="btn btn-secondary btn-sm" onClick={handleSaveDefaults} type="button">
            Salvar defaults
          </button>
        </div>
      </div>

      <div style={{ ...cardStyle(), maxWidth: '960px', margin: '0 auto 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', marginBottom: '0.25rem' }}>PNGs cadastrados</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: '1.45' }}>
              Escolha qual PNG é o global padrão e cadastre novas opções. A seleção abaixo define o PNG base usado quando não há override específico.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              aria-label="Orientacao prevista do upload"
              value={uploadOrientation}
              onChange={(e) => setUploadOrientation(e.target.value)}
              className="form-input"
              style={{ width: 'auto', padding: '0.4rem 0.6rem', fontSize: '0.82rem' }}
              title="Orientação prevista para este PNG"
            >
              <option value="any">Qualquer orientação</option>
              <option value="horizontal">Horizontal (landscape)</option>
              <option value="vertical">Vertical (portrait)</option>
              <option value="video">Vídeo (futuro)</option>
            </select>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => assetInputRef.current?.click()}
              disabled={uploadingAsset}
            >
              {uploadingAsset ? 'Enviando...' : 'Cadastrar PNG'}
            </button>
            <input
              ref={assetInputRef}
              type="file"
              accept="image/png"
              style={{ display: 'none' }}
              onChange={handleAssetUpload}
            />
          </div>
        </div>

        <div style={{ marginTop: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
          {assets.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Nenhum PNG cadastrado ainda. Use o botão acima para adicionar.
            </div>
          )}
          {assets.map((asset) => {
            const selected = config.watermarkAsset === asset.id || (!config.watermarkAsset && asset.id === 'watermark.png')
            return (
              <div key={asset.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.45rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', flex: 1 }}>
                  <input
                    type="radio"
                    name="watermark-asset"
                    checked={selected}
                    onChange={() => setConfig((prev) => ({ ...prev, watermarkAsset: asset.id }))}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>{asset.name || asset.id}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{asset.id}</div>
                  </div>
                </label>
                {asset.url && (
                  <img src={asset.url} alt={asset.name} style={{ maxWidth: '120px', maxHeight: '48px', objectFit: 'contain' }} />
                )}
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <select
                    aria-label="Orientacao do asset"
                    value={asset.orientation || 'any'}
                    onChange={(e) => handleAssetOrientationChange(asset.id, e.target.value)}
                    className="form-input"
                    style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    title="Orientação para a qual este PNG é otimizado"
                  >
                    <option value="any">Qualquer</option>
                    <option value="horizontal">Horizontal</option>
                    <option value="vertical">Vertical</option>
                    <option value="video">Vídeo</option>
                  </select>
                  {asset.reserved ? (
                    <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-dim)' }}>fixo</span>
                  ) : (
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => handleAssetDelete(asset.id)}>
                      Remover
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', maxWidth: '960px' }}>
        {Object.keys(VARIANT_META).map((variant) => {
          const item = VARIANT_META[variant]
          const wm = watermarks[variant] || { exists: false, url: null }
          const isSpecific = variant !== 'global'
          const enabled = isSpecific ? !!config.watermarkVariants?.[variant]?.enabled : true
          const summary = isSpecific ? getVariantSummary(config, variant) : 'aplicada a tudo por fallback'

          return (
            <div key={variant} style={cardStyle()}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', marginBottom: '0.25rem' }}>{item.title}</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.45' }}>{item.description}</p>
                  </div>
                  {isSpecific && (
                    <button
                      onClick={() => toggleVariantEnabled(variant)}
                      style={{
                        width: '44px',
                        height: '24px',
                        borderRadius: '12px',
                        border: 'none',
                        cursor: 'pointer',
                        background: enabled ? 'var(--accent)' : 'var(--bg-input)',
                        position: 'relative',
                        transition: 'background 0.2s',
                        flexShrink: 0,
                      }}
                      title={enabled ? 'Desativar PNG específico' : 'Ativar PNG específico'}
                      type="button"
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: '3px',
                          left: enabled ? '23px' : '3px',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: '#fff',
                          transition: 'left 0.2s',
                        }}
                      />
                    </button>
                  )}
                </div>

                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Perfil atual: <strong>{summary}</strong>
                </p>
                {isSpecific && (
                  <p style={{ fontSize: '0.72rem', color: enabled ? 'var(--success)' : 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {enabled ? 'Override específico ativo para esta derivada.' : 'Override desligado; esta derivada usará a marca global.'}
                  </p>
                )}
              
                {isSpecific && enabled && (
                  <div className="form-group" style={{ marginTop: '0.6rem' }}>
                    <label className="form-label">PNG para esta derivada</label>
                    <select aria-label="PNG para esta derivada"
                      className="form-input"
                      value={config.watermarkVariants?.[variant]?.asset || ''}
                      onChange={(e) => setConfig((prev) => ({
                        ...prev,
                        watermarkVariants: {
                          ...prev.watermarkVariants,
                          [variant]: {
                            ...(prev.watermarkVariants?.[variant] || {}),
                            asset: e.target.value || null,
                          },
                        },
                      }))}
                    >
                      <option value="">Usar PNG global selecionado</option>
                      {assets.map((asset) => (
                        <option key={asset.id} value={asset.id}>{asset.name || asset.id}</option>
                      ))}
                    </select>
                  </div>
                )}
</div>

              {wm.url ? (
                <div style={checkerboardStyle()}>
                  <img src={wm.url} alt={`Marca ${item.title}`} style={{ maxWidth: '200px', maxHeight: '100px', objectFit: 'contain' }} />
                </div>
              ) : (
                <div style={{ ...checkerboardStyle(), color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
                  Nenhum PNG salvo.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className={`alert alert-${wm.exists ? 'success' : 'info'}`} style={{ margin: 0 }}>
                  {wm.exists
                    ? 'PNG disponível.'
                    : (isSpecific ? 'Sem PNG específico; o fallback global continua valendo.' : 'Sem PNG global; o sistema usa o fallback em texto.')}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <label htmlFor={`wm-input-${variant}`} style={{ flex: 1, cursor: 'pointer' }}>
                    <div className="btn btn-secondary btn-full" style={{ textAlign: 'center' }}>
                      {uploadingVariant === variant ? 'Enviando...' : (wm.exists ? 'Trocar PNG' : 'Enviar PNG')}
                    </div>
                  </label>
                  {wm.exists && (
                    <button className="btn btn-danger" onClick={() => handleRemoveWatermark(variant)} disabled={deletingVariant === variant} type="button">
                      {deletingVariant === variant ? 'Removendo...' : 'Remover'}
                    </button>
                  )}
                </div>
              </div>

              <input
                id={`wm-input-${variant}`}
                ref={inputRefs[variant]}
                type="file"
                accept="image/png"
                onChange={(event) => handleWatermarkUpload(variant, event)}
                style={{ display: 'none' }}
              />
            </div>
          )
        })}

        {/* ── Marca d'água específica para vídeos ────────────────── */}
        <div style={{ ...cardStyle(), gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '0.4rem' }}>
                🎬 Marca d&apos;água de vídeos
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.5', maxWidth: '72ch' }}>
                PNG queimado diretamente no MP4 de pré-visualização. Quando não há PNG, o sistema gera automaticamente um
                padrão diagonal com texto <em>PREVIEW · NOME DO ÁLBUM</em>. Ao trocar o PNG, regenere os previews abaixo para aplicar.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginTop: '0.5rem' }}>
            {/* Preview do PNG atual */}
            <div>
              {watermarks.video?.url ? (
                <div style={checkerboardStyle()}>
                  <img
                    src={watermarks.video.url}
                    alt="Marca d'água de vídeo"
                    style={{ maxWidth: '220px', maxHeight: '110px', objectFit: 'contain' }}
                  />
                </div>
              ) : (
                <div style={{ ...checkerboardStyle(), flexDirection: 'column', gap: '0.5rem', textAlign: 'center' }}>
                  <span style={{ fontSize: '2rem' }}>🎬</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Nenhum PNG. Usando marca em texto diagonal.
                  </span>
                </div>
              )}

              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div className={`alert alert-${watermarks.video?.exists ? 'success' : 'info'}`} style={{ margin: 0 }}>
                  {watermarks.video?.exists
                    ? '✅ PNG de vídeo disponível. Regenere previews para aplicar.'
                    : 'ℹ️ Sem PNG. Previews usam marca em texto (PREVIEW · ÁLBUM).'}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => videoWmInputRef.current?.click()}
                    disabled={uploadingVideoWm}
                    style={{ flex: 1 }}
                  >
                    {uploadingVideoWm ? 'Enviando...' : (watermarks.video?.exists ? '🔄 Trocar PNG' : '📤 Enviar PNG')}
                  </button>
                  {watermarks.video?.exists && (
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={handleRemoveVideoWatermark}
                      disabled={deletingVideoWm}
                    >
                      {deletingVideoWm ? 'Removendo...' : 'Remover'}
                    </button>
                  )}
                </div>
                <input
                  ref={videoWmInputRef}
                  type="file"
                  accept="image/png"
                  style={{ display: 'none' }}
                  onChange={handleVideoWatermarkUpload}
                />
              </div>
            </div>

            {/* Dicas */}
            <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p><strong style={{ color: 'var(--text)' }}>Como funciona</strong></p>
              <ul style={{ paddingLeft: '1.1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <li>O PNG é sobreposto em todo o frame, com transparência preservada.</li>
                <li>Recomendado: PNG transparente horizontal, ex. 960×540px ou maior.</li>
                <li>Para remover a marca de um preview já gerado, troque o PNG e clique em &quot;Regenerar previews&quot;.</li>
                <li>O original MP4 nunca é alterado — apenas o preview em baixa resolução.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── Regenerar previews de vídeo em lote ─────────────── */}
        <div style={{ ...cardStyle(), gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '0.4rem' }}>
                🔄 Regenerar previews de vídeos
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.5', maxWidth: '72ch' }}>
                Reprocessa o MP4 de pré-visualização com marca d&apos;água queimada. Útil após trocar o PNG de vídeo,
                ou para corrigir previews falhados. O processamento é síncrono (pode demorar).
              </p>
            </div>
          </div>

          {/* Stats */}
          {videoStats && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.82rem', padding: '0.65rem 0.85rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', marginTop: '0.25rem' }}>
              <span>Total: <strong style={{ color: 'var(--text)' }}>{videoStats.total}</strong></span>
              <span style={{ color: 'var(--success)' }}>✅ Prontos: <strong>{videoStats.ready}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>⏳ Pendentes: <strong>{videoStats.pending}</strong></span>
              {videoStats.processing > 0 && (
                <span style={{ color: 'var(--accent)' }}>⚙️ Processando: <strong>{videoStats.processing}</strong></span>
              )}
              {videoStats.failed > 0 && (
                <span style={{ color: 'var(--danger)' }}>❌ Falhas: <strong>{videoStats.failed}</strong></span>
              )}
              {videoStats.total === 0 && (
                <span style={{ color: 'var(--text-muted)' }}>Nenhum vídeo cadastrado.</span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '0.5rem' }}>
            <div className="form-group" style={{ margin: 0, flex: '1 1 220px' }}>
              <label className="form-label">Filtrar por evento (opcional)</label>
              <select
                aria-label="Filtrar por evento"
                className="form-input"
                value={videoRegenEventId}
                onChange={(e) => setVideoRegenEventId(e.target.value)}
              >
                <option value="">Todos os eventos</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name || 'Sem nome'}</option>
                ))}
              </select>
            </div>

            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', cursor: 'pointer', paddingBottom: '0.15rem' }}>
              <input
                type="checkbox"
                checked={!!videoRegenForce}
                onChange={(e) => setVideoRegenForce(e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>Forçar (reprocessar todos, inclusive prontos)</span>
            </label>
          </div>

          <button
            className="btn btn-secondary"
            type="button"
            onClick={handleVideoRegen}
            disabled={videoRegenerating || (videoStats?.total === 0)}
            style={{ alignSelf: 'flex-start' }}
          >
            {videoRegenerating ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="spinner" style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                Regenerando... aguarde
              </span>
            ) : '🔄 Regenerar agora'}
          </button>

          {videoRegenResult && !videoRegenerating && (
            <div style={{ marginTop: '0.5rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                <span>Candidatos: <strong style={{ color: 'var(--text)' }}>{videoRegenResult.total}</strong></span>
                <span style={{ color: 'var(--success)' }}>✅ Gerados: <strong>{videoRegenResult.done}</strong></span>
                {videoRegenResult.failed > 0 && (
                  <span style={{ color: 'var(--danger)' }}>❌ Falhas: <strong>{videoRegenResult.failed}</strong></span>
                )}
                {videoRegenResult.skipped > 0 && (
                  <span style={{ color: 'var(--text-muted)' }}>⏭ Sem original: <strong>{videoRegenResult.skipped}</strong></span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Regenerar derivadas de fotos ─────────────────────── */}
        <div style={{ ...cardStyle(), gridColumn: '1 / -1' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '0.4rem' }}>Regenerar derivadas e marca d&apos;água</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.5' }}>
            Reprocessa grid, thumbs, minis e covers a partir dos originais. A regeneração roda em segundo plano com barra de progresso e ETA.
            Álbuns já atualizados são pulados (a explicação aparece abaixo após a execução).
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                name="regen-scope"
                checked={regenScope === 'all'}
                onChange={() => setRegenScope('all')}
              />
              <span>Todo o acervo</span>
            </label>
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                name="regen-scope"
                checked={regenScope === 'selected'}
                onChange={() => setRegenScope('selected')}
              />
              <span>Apenas álbuns selecionados</span>
            </label>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Escopo atual: {regenScope === 'all' ? 'todo acervo' : `${selectedEvents.length} álbuns marcados`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!overlayEnabled}
                onChange={(e) => setOverlayEnabled(e.target.checked)}
              />
              <span title="Aplica #ID público + nome original em branco com contorno e sombra na amostra com WM (grid e thumbs).">Overlay de ID/nome na amostra</span>
            </label>
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!forceRegenerate}
                onChange={(e) => setForceRegenerate(e.target.checked)}
              />
              <span title="Quando desligado, derivadas que já bateram com a configuração atual são puladas.">Forçar regeneração mesmo quando válido</span>
            </label>
          </div>

          {regenScope === 'selected' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9rem' }}>Selecione os álbuns</strong>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary" type="button" onClick={() => setSelectedEvents(events.map((e) => e.id))} disabled={loadingEvents || events.length === 0}>
                    Marcar todos
                  </button>
                  <button className="btn btn-light" type="button" onClick={() => setSelectedEvents([])}>
                    Limpar seleção
                  </button>
                </div>
              </div>
              {loadingEvents ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                  <div className="spinner" style={{ width: '16px', height: '16px' }} /> Carregando álbuns...
                </div>
              ) : (
                <div style={{ maxHeight: '240px', overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.45rem' }}>
                  {events.length === 0 && <span style={{ color: 'var(--text-muted)' }}>Nenhum álbum encontrado.</span>}
                  {events.map((ev) => {
                    const checked = selectedEvents.includes(ev.id)
                    return (
                      <label key={ev.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.55rem', display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer', background: checked ? 'rgba(99, 102, 241, 0.08)' : 'transparent' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedEvents((prev) => (checked ? prev.filter((id) => id !== ev.id) : [...prev, ev.id]))}
                        />
                        <div>
                          <div style={{ fontWeight: 600 }}>{ev.name || 'Sem nome'}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{ev.date || 's/ data'}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <button className="btn btn-secondary" onClick={handleRegenerate} disabled={regenerating || !!regenJob?.running} type="button">
            {(regenerating || regenJob?.running) ? 'Regenerando...' : 'Regenerar agora'}
          </button>

          {regenJob?.running && (
            <div style={{ marginTop: '0.85rem' }}>
              <div style={{ height: '8px', borderRadius: '999px', background: 'var(--bg-input)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${regenJob.total > 0 ? Math.round((regenJob.done / regenJob.total) * 100) : 0}%`,
                    background: 'var(--accent)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                <span>{regenJob.done || 0} / {regenJob.total || 0}</span>
                <span>Restantes: {Math.max(0, (regenJob.total || 0) - (regenJob.done || 0))}</span>
                <span>Geradas: {regenJob.generated || 0}</span>
                <span>Puladas: {regenJob.skipped || 0}</span>
                <span>Falhas: {regenJob.failed || 0}</span>
                {typeof regenJob.etaSeconds === 'number' && <span>ETA: ~{regenJob.etaSeconds}s</span>}
                {regenJob.overlay && <span style={{ color: 'var(--accent)' }}>+ overlay</span>}
              </div>
              {regenJob.current && (
                <p style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Processando: {regenJob.current}
                </p>
              )}
            </div>
          )}

          {!regenJob?.running && (regenResult || regenJob?.finishedAt) && (
            <div style={{ marginTop: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '0.85rem 1rem', fontSize: '0.78rem' }}>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <span>Escopo: <strong style={{ color: 'var(--text)' }}>{regenJob?.scoped ? `${regenJob.scopeEventIds?.length || 0} álbuns` : 'Todo acervo'}</strong></span>
                <span>Total: <strong style={{ color: 'var(--text)' }}>{regenJob?.done ?? 0}/{regenJob?.total ?? 0}</strong></span>
                <span>Geradas: <strong style={{ color: 'var(--text)' }}>{regenJob?.generated ?? 0}</strong></span>
                <span>Puladas: <strong style={{ color: 'var(--text)' }}>{regenJob?.skipped ?? 0}</strong></span>
                <span>Falhas: <strong style={{ color: 'var(--danger)' }}>{regenJob?.failed ?? 0}</strong></span>
                <span>Arquivadas: <strong style={{ color: 'var(--text)' }}>{regenJob?.archived ?? 0}</strong></span>
                <span>Órfãos: <strong style={{ color: 'var(--text)' }}>{regenJob?.orphans ?? 0}</strong></span>
                {regenJob?.overlay && <span style={{ color: 'var(--accent)' }}>overlay aplicado</span>}
              </div>
              {regenJob?.archiveRoot && (
                <p style={{ marginTop: '0.6rem', color: 'var(--text-muted)' }}>
                  Legado arquivado em: {regenJob.archiveRoot}
                </p>
              )}
              {Array.isArray(regenJob?.eventResults) && regenJob.eventResults.length > 0 && (
                <div style={{ marginTop: '0.85rem' }}>
                  <p style={{ fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text)' }}>Por álbum</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.5rem' }}>
                    {regenJob.eventResults.map((entry) => {
                      const blocked = entry.allUpToDate
                      return (
                        <div key={entry.eventId} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.5rem 0.65rem', background: blocked ? 'rgba(34,197,94,0.06)' : 'transparent' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline' }}>
                            <strong style={{ color: 'var(--text)' }}>{entry.name}</strong>
                            {blocked && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--success)', whiteSpace: 'nowrap' }}>
                                ✓ já atualizado — pulado
                              </span>
                            )}
                          </div>
                          <div style={{ marginTop: '0.25rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Fotos: {entry.photosGenerated}/{entry.photosTotal} regeneradas
                            {entry.photosSkipped > 0 && ` · ${entry.photosSkipped} pulada${entry.photosSkipped !== 1 ? 's' : ''}`}
                            {entry.photosFailed > 0 && ` · ${entry.photosFailed} falha${entry.photosFailed !== 1 ? 's' : ''}`}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Capa: {entry.coverGenerated > 0 ? 'regenerada' : entry.coverSkipped > 0 ? 'mantida' : entry.coverMissing ? 'original ausente' : 'sem capa'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
