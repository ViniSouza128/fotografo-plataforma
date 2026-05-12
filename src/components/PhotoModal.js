'use client'
// src/components/PhotoModal.js

import { useEffect, useRef, useState } from 'react'
import PhotoCommentsSection from './PhotoCommentsSection'
import { applyNextImageFallback, getFirstUrl, getPhotoModalDisplayCandidates } from '@/lib/imagePaths'
import { getEffectivePrice, isPhotoFree } from '@/lib/freeAccess'

const EMPTY_REMOVE_FORM = { nome: '', cpf: '', contato: '', motivo: '' }

function formatFileSize(bytes) {
  if (!bytes) return 'Desconhecido'
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`
}

function formatDate(dateString) {
  if (!dateString) return 'Data desconhecida'
  const d = new Date(dateString)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' — '
    + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatMegapixels(width, height) {
  const totalPixels = Number(width || 0) * Number(height || 0)
  if (!totalPixels) return null
  return `${(totalPixels / 1_000_000).toFixed(1)} MP`
}

const prefetched = new Set()
function preloadImage(url) {
  if (!url || prefetched.has(url)) return
  const img = new Image()
  img.src = url
  prefetched.add(url)
}

function validarCPF(cpf) {
  const n = cpf.replace(/\D/g, '')
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += parseInt(n[i], 10) * (10 - i)
  let r1 = (s * 10) % 11
  if (r1 >= 10) r1 = 0
  if (r1 !== parseInt(n[9], 10)) return false
  s = 0
  for (let i = 0; i < 10; i++) s += parseInt(n[i], 10) * (11 - i)
  let r2 = (s * 10) % 11
  if (r2 >= 10) r2 = 0
  return r2 === parseInt(n[10], 10)
}

function mascaraCPF(v) {
  const n = v.replace(/\D/g, '').slice(0, 11)
  return n.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) => (
    d ? `${a}.${b}.${c}-${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a
  ))
}

export default function PhotoModal({
  photo,
  photos,
  onClose,
  onPrev,
  onNext,
  cartItems,
  onAddToCart,
  onRemoveFromCart,
  onCloseWithPhoto,
  purchasedIds,
  openCommentsByDefault = false,
  initialCommentId = null,
}) {
  const [loaded, setLoaded] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [copied, setCopied] = useState(false)

  const [showRemoveByPhoto, setShowRemoveByPhoto] = useState({})
  const [removeFormByPhoto, setRemoveFormByPhoto] = useState({})
  const [removeStatusByPhoto, setRemoveStatusByPhoto] = useState({})

  const [cliente, setCliente] = useState(null)
  const [curtido, setCurtido] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [curtidasCount, setCurtidasCount] = useState(0)
  const [fallbackResolution, setFallbackResolution] = useState(null)
  const [loadingFallbackResolution, setLoadingFallbackResolution] = useState(false)
  const [tiersConfig, setTiersConfig] = useState(null)
  const [selectedTier, setSelectedTier] = useState(null)

  // Carrega config de tiers (apenas uma vez)
  useEffect(() => {
    let cancelled = false
    fetch('/api/config').then(r => r.ok ? r.json() : null).then(cfg => {
      if (cancelled) return
      const dt = cfg?.downloadTiers
      if (dt && dt.ativo && Array.isArray(dt.tiers) && dt.tiers.length > 0) {
        setTiersConfig(dt)
        setSelectedTier(dt.defaultTier || dt.tiers[0]?.id)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const inCart = cartItems.some(item => item.id === photo.id)
  const jaComprada = purchasedIds?.has(photo.id) || false
  const currentIndex = photos.findIndex(p => p.id === photo.id)
  const displayCandidates = getPhotoModalDisplayCandidates(photo)
  const displaySrc = getFirstUrl(displayCandidates)
  const basePrice = Number(photo.priceEffective ?? getEffectivePrice(photo) ?? photo.price ?? 0)
  const longSide = Math.max(Number(photo.originalWidth) || 0, Number(photo.originalHeight) || 0)
  const tiersForPhoto = (tiersConfig?.tiers || []).map(t => {
    const eligible = t.minOriginalLongSide ? longSide >= Number(t.minOriginalLongSide) : true
    const price = Number.isFinite(Number(t.fixedPrice))
      ? Number(t.fixedPrice)
      : Math.round(basePrice * (Number.isFinite(Number(t.multiplier)) ? Number(t.multiplier) : 1) * 100) / 100
    return { ...t, eligible, price }
  })
  const activeTier = tiersForPhoto.find(t => t.id === selectedTier && t.eligible) || tiersForPhoto.find(t => t.eligible) || null
  const priceDisplay = tiersConfig && activeTier ? activeTier.price : basePrice
  const priceText = Number(priceDisplay).toFixed(2).replace('.', ',')
  const isFree = photo.isFree ?? isPhotoFree(photo)
  const displayId = photo.publicId || photo.id?.slice(0, 8)
  const downloadHref = `/api/photos/${photo.id}/download`
  const removeStatus = removeStatusByPhoto[photo.id] || ''
  const showRemove = !!showRemoveByPhoto[photo.id]
  const removeForm = removeFormByPhoto[photo.id] || EMPTY_REMOVE_FORM
  const removeSent = removeStatus === 'sent'

  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado')
      if (!raw) return
      const cli = JSON.parse(raw)
      if (!cli?.id) return
      setCliente(cli)
      setCurtido((cli.curtidas || []).includes(photo.id))
      setSalvo((cli.favoritos || []).includes(photo.id))
    } catch {}
  }, [photo.id])

  useEffect(() => {
    setRemoveFormByPhoto(prev => {
      const current = prev[photo.id]
      const defaults = {
        nome: cliente?.nomeCompleto || '',
        cpf: mascaraCPF(cliente?.cpf || ''),
        contato: cliente?.whatsapp || cliente?.email || '',
        motivo: '',
      }

      if (!current) return { ...prev, [photo.id]: defaults }
      if (!cliente) return prev

      const merged = {
        ...current,
        nome: current.nome || defaults.nome,
        cpf: current.cpf || defaults.cpf,
        contato: current.contato || defaults.contato,
      }

      if (
        merged.nome === current.nome
        && merged.cpf === current.cpf
        && merged.contato === current.contato
      ) return prev

      return { ...prev, [photo.id]: merged }
    })

    setRemoveStatusByPhoto(prev => (prev[photo.id] ? prev : { ...prev, [photo.id]: '' }))
    setShowRemoveByPhoto(prev => (photo.id in prev ? prev : { ...prev, [photo.id]: false }))
  }, [photo.id, cliente?.id])

  useEffect(() => {
    setShowComments(!!openCommentsByDefault)
  }, [openCommentsByDefault, photo.id])

  useEffect(() => {
    fetch(`/api/curtidas?photoId=${photo.id}`)
      .then(r => r.json())
      .then(d => setCurtidasCount(d.count || 0))
      .catch(() => {})
  }, [photo.id])

  useEffect(() => {
    const hasStoredResolution = Number(photo.originalWidth) > 0 && Number(photo.originalHeight) > 0
    if (hasStoredResolution) {
      setFallbackResolution(null)
      setLoadingFallbackResolution(false)
      return
    }

    let cancelled = false
    setLoadingFallbackResolution(true)

    fetch(`/api/photos/${photo.id}/resolution`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data) return
        const width = Number(data.originalWidth)
        const height = Number(data.originalHeight)
        if (width > 0 && height > 0) {
          setFallbackResolution({ width, height })
        } else {
          setFallbackResolution(null)
        }
      })
      .catch(() => {
        if (!cancelled) setFallbackResolution(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingFallbackResolution(false)
      })

    return () => { cancelled = true }
  }, [photo.id, photo.originalWidth, photo.originalHeight])

  const scrollYRef = useRef(0)
  useEffect(() => {
    scrollYRef.current = window.scrollY
    const y = scrollYRef.current
    document.body.style.position = 'fixed'
    document.body.style.top = `-${y}px`
    document.body.style.width = '100%'
    document.body.style.overflowY = 'scroll'

    return () => {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      document.body.style.overflowY = ''
      window.scrollTo(0, y)
    }
  }, [])

  function handleClose() {
    if (onCloseWithPhoto) onCloseWithPhoto(photo.id)
    else onClose()
  }

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') handleClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [photo.id])

  useEffect(() => {
    ;[-2, -1, 1, 2].forEach(offset => {
      const i = currentIndex + offset
      if (i >= 0 && i < photos.length) {
        preloadImage(getFirstUrl(getPhotoModalDisplayCandidates(photos[i])))
      }
    })
  }, [photo.id])

  useEffect(() => setLoaded(false), [photo.id])

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?foto=${photo.id}`
    : ''

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      const el = Object.assign(document.createElement('textarea'), { value: shareUrl })
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleCurtir() {
    if (!cliente) { window.location.href = '/login'; return }
    try {
      const res = await fetch('/api/curtidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: cliente.id, photoId: photo.id }),
      })
      if (!res.ok) return

      const data = await res.json()
      const nowCurtido = data.curtidas.includes(photo.id)
      setCurtido(nowCurtido)
      setCurtidasCount(data.totalCount || 0)

      const cli = { ...cliente, curtidas: data.curtidas }
      setCliente(cli)
      localStorage.setItem('clienteLogado', JSON.stringify(cli))
    } catch {}
  }

  async function handleSalvar() {
    if (!cliente) { window.location.href = '/login'; return }
    try {
      const res = await fetch('/api/favoritos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: cliente.id, photoId: photo.id, targetType: 'photo' }),
      })
      if (!res.ok) return

      const data = await res.json()
      const nowSalvo = data.favoritos.includes(photo.id)
      setSalvo(nowSalvo)

      const cli = { ...cliente, favoritos: data.favoritos }
      setCliente(cli)
      localStorage.setItem('clienteLogado', JSON.stringify(cli))
    } catch {}
  }

  function updateRemoveForm(changes) {
    setRemoveFormByPhoto(prev => ({
      ...prev,
      [photo.id]: { ...(prev[photo.id] || EMPTY_REMOVE_FORM), ...changes },
    }))
  }

  async function handleSubmitRemocao(e) {
    e.preventDefault()
    const currentPhotoId = photo.id

    if (!validarCPF(removeForm.cpf)) {
      setRemoveStatusByPhoto(prev => ({ ...prev, [currentPhotoId]: 'cpf-invalid' }))
      return
    }

    setRemoveStatusByPhoto(prev => ({ ...prev, [currentPhotoId]: 'sending' }))

    try {
      const res = await fetch('/api/remocoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoId: photo.id,
          publicId: photo.publicId || null,
          eventName: photo.eventName || null,
          filename: photo.originalName || photo.filename,
          nome: removeForm.nome,
          cpf: removeForm.cpf,
          contato: removeForm.contato,
          motivo: removeForm.motivo,
          clientId: cliente?.id || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setRemoveStatusByPhoto(prev => ({
          ...prev,
          [currentPhotoId]: data.error?.toLowerCase().includes('cpf') ? 'cpf-invalid' : 'error',
        }))
      } else {
        setRemoveStatusByPhoto(prev => ({ ...prev, [currentPhotoId]: 'sent' }))
        setShowRemoveByPhoto(prev => ({ ...prev, [currentPhotoId]: true }))
      }
    } catch {
      setRemoveStatusByPhoto(prev => ({ ...prev, [currentPhotoId]: 'error' }))
    }
  }

  const resolutionData = Number(photo.originalWidth) > 0 && Number(photo.originalHeight) > 0
    ? { width: Number(photo.originalWidth), height: Number(photo.originalHeight) }
    : fallbackResolution

  const resolutionText = resolutionData
    ? `${resolutionData.width} × ${resolutionData.height}`
    : (loadingFallbackResolution ? '...' : 'Desconhecida')

  const megapixelsText = resolutionData
    ? formatMegapixels(resolutionData.width, resolutionData.height)
    : (loadingFallbackResolution ? '...' : 'Desconhecido')

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-full" onClick={e => e.stopPropagation()}>

        <div className="modal-top">
          <div className="modal-title">
            <h1>ID #{displayId}</h1>
            <span>{formatDate(photo.takenAt)}</span>
          </div>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        <div className="modal-image-area">
          <div className="modal-photo-actions">
            <button
              type="button"
              className={`modal-photo-action-btn save ${salvo ? 'active' : ''}`}
              onClick={handleSalvar}
              title={cliente ? (salvo ? 'Remover dos salvos' : 'Salvar') : 'Faça login para salvar'}
              >
                <span className="icon">{salvo ? '⭐' : '☆'}</span>
                <span className="label">{salvo ? 'Salva' : 'Salvar'}</span>
              </button>

            <button
              type="button"
              className={`modal-photo-action-btn like ${curtido ? 'active' : ''}`}
              onClick={handleCurtir}
              title={cliente ? (curtido ? 'Descurtir' : 'Curtir') : 'Faça login para curtir'}
            >
              <span className="icon">{curtido ? '❤️' : '🤍'}</span>
              <span className="label">{curtidasCount}</span>
            </button>
          </div>

          <div className="nav-zone left" onClick={onPrev} />
          <div className="nav-zone right" onClick={onNext} />
          <img
            key={displaySrc}
            src={displaySrc || ''}
            className={`modal-img ${loaded ? 'loaded' : ''}`}
            onLoad={() => setLoaded(true)}
            onError={(e) => {
              if (!applyNextImageFallback(e.target, displayCandidates)) {
                e.target.style.display = 'none'
              }
            }}
            alt={`Foto #${displayId}`}
          />
        </div>

        <div className="modal-actions">
          {isFree ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <a
                href={downloadHref}
                download={photo.originalName || photo.filename}
                className="btn btn-success btn-full"
                style={{ textDecoration: 'none', textAlign: 'center' }}
              >
                ⬇ Baixar Grátis
              </a>
              {inCart ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-danger" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => onRemoveFromCart(photo.id)}>
                    Remover do carrinho
                  </button>
                  <a href="/carrinho" className="btn btn-ghost" style={{ flex: 1, fontSize: '0.8rem', textDecoration: 'none', textAlign: 'center' }}>
                    🛒 Ver carrinho
                  </a>
                </div>
              ) : (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.8rem' }}
                  onClick={() => onAddToCart({
                    ...photo,
                    price: 0,
                    priceOriginal: Number(photo.price ?? 0),
                    priceEffective: 0,
                    isFree: true,
                  })}
                >
                  + Adicionar ao carrinho por R$ 0,00
                </button>
              )}
            </div>
          ) : jaComprada ? (
            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
              <a
                href={downloadHref}
                download={photo.originalName || photo.filename}
                className="btn btn-success btn-full"
                style={{ textDecoration: 'none', textAlign: 'center' }}
              >
                ⬇ Baixar (já comprada)
              </a>
              {inCart ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-danger" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => onRemoveFromCart(photo.id)}>
                    Remover do carrinho
                  </button>
                  <a href="/carrinho" className="btn btn-ghost" style={{ flex: 1, fontSize: '0.8rem', textDecoration: 'none', textAlign: 'center' }}>
                    🛒 Ver carrinho
                  </a>
                </div>
              ) : (
                <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => onAddToCart({ ...photo, price: 0 })}>
                  + Adicionar ao carrinho por R$ 0,00
                </button>
              )}
            </div>
          ) : inCart ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => onRemoveFromCart(photo.id)}>
                Remover do carrinho
              </button>
              <a href="/carrinho" className="btn btn-primary" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>
                🛒 Ver carrinho
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {tiersConfig && tiersForPhoto.length > 0 && (
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {tiersForPhoto.map(t => {
                    const sel = activeTier?.id === t.id
                    return (
                      <button key={t.id} type="button"
                        disabled={!t.eligible}
                        onClick={() => setSelectedTier(t.id)}
                        title={!t.eligible ? `Original tem ${longSide || '?'}px (mín ${t.minOriginalLongSide}px)` : `${t.maxLongSide ? `até ${t.maxLongSide}px` : 'resolução total'}`}
                        style={{
                          padding: '0.3rem 0.6rem', fontSize: '0.72rem',
                          background: sel ? 'var(--accent)' : 'var(--bg-input)',
                          color: sel ? '#1a1200' : (t.eligible ? 'var(--text)' : 'var(--text-dim)'),
                          border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: '999px',
                          cursor: t.eligible ? 'pointer' : 'not-allowed',
                          opacity: t.eligible ? 1 : 0.5,
                        }}>
                        {t.label} · R$ {Number(t.price).toFixed(2).replace('.', ',')}
                        {!t.eligible && ' 🔒'}
                      </button>
                    )
                  })}
                </div>
              )}
              <button
                className="btn btn-primary btn-full"
                disabled={tiersConfig && !activeTier}
                onClick={() => onAddToCart({
                  ...photo,
                  price: priceDisplay,
                  priceOriginal: Number(photo.price ?? basePrice ?? 0),
                  priceEffective: priceDisplay,
                  tier: activeTier?.id || null,
                  tierLabel: activeTier?.label || null,
                  tierMaxLongSide: activeTier?.maxLongSide ?? null,
                })}
              >
                {`Adicionar ao carrinho — R$ ${priceText}`}
                {activeTier && <span style={{ fontSize: '0.7rem', opacity: 0.85, marginLeft: '0.4rem' }}>({activeTier.label})</span>}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => {
                setShowComments(!showComments)
                setShowInfo(false)
                setShowShare(false)
                setShowRemoveByPhoto(prev => ({ ...prev, [photo.id]: false }))
              }}
            >
              {showComments ? '✕ Fechar' : '💬 Comentar esta foto'}
            </button>

            <button
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => {
                setShowInfo(!showInfo)
                setShowShare(false)
                setShowRemoveByPhoto(prev => ({ ...prev, [photo.id]: false }))
                setShowComments(false)
              }}
            >
              {showInfo ? 'Ocultar detalhes' : 'Detalhes'}
            </button>

            <button
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => {
                setShowShare(!showShare)
                setShowInfo(false)
                setShowRemoveByPhoto(prev => ({ ...prev, [photo.id]: false }))
                setShowComments(false)
              }}
            >
              {showShare ? 'Fechar' : '🔗 Compartilhar'}
            </button>

            <button
              className="btn btn-ghost"
              disabled={removeSent}
              style={{
                flex: 1,
                color: showRemove ? 'var(--danger)' : 'var(--text-muted)',
                opacity: removeSent ? 0.7 : 1,
                cursor: removeSent ? 'not-allowed' : 'pointer',
              }}
              onClick={() => {
                if (removeSent) return
                setShowRemoveByPhoto(prev => ({ ...prev, [photo.id]: !showRemove }))
                setShowInfo(false)
                setShowShare(false)
                setShowComments(false)
              }}
            >
              {removeSent ? 'Solicitação enviada' : showRemove ? 'Fechar' : '🚫 Solicitar remoção'}
            </button>
          </div>

          {showComments && (
            <div style={{ marginTop: '0.85rem' }}>
              <PhotoCommentsSection
                photoId={photo.id}
                eventId={photo.eventId}
                pasta={photo.pasta || null}
                clienteLogado={cliente}
                isAdminView={!!cliente?.isAdmin}
                initialFocusId={initialCommentId}
              />
            </div>
          )}

          {showInfo && (
            <div className="modal-extra-info">
              <p><b>ID:</b> {displayId}</p>
              <p><b>Tirada em:</b> {formatDate(photo.takenAt)}</p>
              <p><b>Arquivo:</b> {photo.originalName || photo.filename || 'Desconhecido'}</p>
              <p><b>Resolução:</b> {resolutionText}</p>
              <p><b>Megapixels:</b> {megapixelsText}</p>
              <p><b>Tamanho:</b> {formatFileSize(photo.size)}</p>
              <p><b>Autor:</b> {photo.author || 'Desconhecido'}</p>
              <p className="copyright">⚠️ Protegido pela Lei nº 9.610/98. Reprodução sem autorização é proibida.</p>
            </div>
          )}

          {showShare && (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Link desta foto:</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  readOnly
                  value={shareUrl}
                  style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-muted)', padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                  onClick={e => e.target.select()}
                />
                <button className={`btn btn-sm ${copied ? 'btn-success' : 'btn-secondary'}`} onClick={handleCopyLink}>
                  {copied ? '✓ Copiado!' : 'Copiar'}
                </button>
              </div>
              <button
                className="btn btn-sm btn-full"
                style={{ background: '#25D366', color: 'white', border: 'none' }}
                onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Olha essa foto! ID #${displayId}\n${shareUrl}`)}`, '_blank')}
              >
                Compartilhar via WhatsApp
              </button>
            </div>
          )}

          {showRemove && (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '0.85rem 1rem', borderLeft: '3px solid var(--danger)' }}>
              {removeStatus === 'sent' ? (
                <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                  <p style={{ color: 'var(--success)', fontWeight: '500', marginBottom: '0.25rem' }}>✅ Solicitação enviada!</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>O fotógrafo analisará seu pedido.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmitRemocao} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <p style={{ color: 'var(--danger)', fontSize: '0.78rem', fontWeight: '500', marginBottom: '0.15rem' }}>
                    Solicitar remoção desta foto
                  </p>
                  {cliente && (
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginBottom: '0.25rem' }}>
                      Dados preenchidos automaticamente da sua conta
                    </p>
                  )}

                  <input type="text" className="form-input" placeholder="Seu nome *" required value={removeForm.nome} onChange={e => updateRemoveForm({ nome: e.target.value })} />

                  <div>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="CPF (obrigatório) *"
                      inputMode="numeric"
                      maxLength={14}
                      required
                      value={removeForm.cpf}
                      onChange={e => updateRemoveForm({ cpf: mascaraCPF(e.target.value) })}
                      style={{ borderColor: removeStatus === 'cpf-invalid' ? 'var(--danger)' : undefined }}
                    />
                    {removeStatus === 'cpf-invalid' && (
                      <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        CPF inválido. Informe um CPF real para continuar.
                      </p>
                    )}
                  </div>

                  <input type="text" className="form-input" placeholder="WhatsApp ou e-mail *" required value={removeForm.contato} onChange={e => updateRemoveForm({ contato: e.target.value })} />
                  <textarea className="form-textarea" placeholder="Motivo *" rows={3} required style={{ resize: 'vertical' }} value={removeForm.motivo} onChange={e => updateRemoveForm({ motivo: e.target.value })} />

                  {removeStatus === 'error' && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.78rem' }}>Erro ao enviar. Tente novamente.</p>
                  )}

                  <button type="submit" className="btn btn-danger btn-sm btn-full" disabled={removeStatus === 'sending'}>
                    {removeStatus === 'sending'
                      ? <><div className="spinner" style={{ width: '14px', height: '14px' }} /> Enviando...</>
                      : '🚫 Enviar solicitação'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
