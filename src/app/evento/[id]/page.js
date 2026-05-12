'use client'
// src/app/evento/[id]/page.js
// Navegação no modal percorre TODAS as fotos (além da página atual).
// currentPage atualiza junto com a navegação para que ao fechar
// o grid já esteja na página correta e o scroll vá para a foto certa.

import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '../../../components/Navbar'
import Footer from '../../../components/Footer'
import PhotoModal from '../../../components/PhotoModal'
import EventCommentsSection from '../../../components/EventCommentsSection'
import {
  applyNextImageFallback,
  getFirstUrl,
  getPhotoGridPreviewCandidates,
  getPhotoModalDisplayCandidates,
} from '@/lib/imagePaths'
import { getEffectivePrice, isPhotoFree } from '@/lib/freeAccess'
import { resolveEventDiscountConfig, resolveEventVideoDiscountConfig } from '@/lib/pricing'

const PHOTOS_PER_PAGE = 160

export default function EventPage() {
  const { id }       = useParams()
  const searchParams = useSearchParams()

  const [event, setEvent]     = useState(null)
  const [photos, setPhotos]   = useState([])
  const [videos, setVideos]   = useState([])
  const [videoModal, setVideoModal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [modalPhoto, setModalPhoto] = useState(null)
  const [cartItems, setCartItems]   = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [clienteLogado, setClienteLogado] = useState(null)
  const [albumSalvo, setAlbumSalvo] = useState(false)
  const [fotosCompradasIds, setFotosCompradasIds] = useState(new Set())
  const [filtroHoraMin, setFiltroHoraMin] = useState('')
  const [filtroHoraMax, setFiltroHoraMax] = useState('')
  const [currentFolder, setCurrentFolder] = useState(null)
  const [openPhotoComments, setOpenPhotoComments] = useState(false)
  const [globalDiscountConfig, setGlobalDiscountConfig] = useState(null)
  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then((cfg) => {
      setGlobalDiscountConfig({
        descontosGlobais: Array.isArray(cfg?.descontosGlobais) ? cfg.descontosGlobais : [],
        descontosGlobaisAtivos: !!cfg?.descontosGlobaisAtivos,
      })
    }).catch(() => setGlobalDiscountConfig({ descontosGlobais: [], descontosGlobaisAtivos: false }))
  }, [])
  const [initialPhotoCommentId, setInitialPhotoCommentId] = useState(null)

  const prefetchedSet = useRef(new Set())
  const isAdminView = !!clienteLogado?.isAdmin

  const pastaParam = searchParams.get('pasta')
  const fotoParam = searchParams.get('foto')
  const comentarioParam = searchParams.get('comentario')
  const openComentariosParam = searchParams.get('comentarios') === '1'

  // ── cliente logado ───────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado')
      if (raw) {
          const cli = JSON.parse(raw)
          if (cli?.id) {
            setClienteLogado(cli)
            setAlbumSalvo((cli.favoritos || []).includes(`album:${id}`))
          }
        }
      } catch {}
  }, [id])

  useEffect(() => {
    setAlbumSalvo((clienteLogado?.favoritos || []).includes(`album:${id}`))
  }, [clienteLogado, id])

  // ── fotos já compradas pelo cliente ──────────────────────────────────────────
  useEffect(() => {
    if (!clienteLogado?.id) return
    fetch('/api/pedidos?meu=1')
      .then(r => r.json())
      .then(pedidos => {
        const listaPedidos = Array.isArray(pedidos) ? pedidos : []
        const ids = new Set()
        listaPedidos
          .filter(p =>
            p.status === 'pago' &&
            (p.clientId === clienteLogado.id || p.whatsapp === clienteLogado.whatsapp)
          )
          .forEach(p => (p.itens || p.items || []).forEach(i => {
            const targetId = i.photoId || i.videoId || i.id
            if (targetId) ids.add(targetId)
          }))
        setFotosCompradasIds(ids)
      })
      .catch(() => {})
  }, [clienteLogado])

  // ── carregamento ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [evRes, phRes, vRes] = await Promise.all([
          fetch(`/api/events/${id}`),
          fetch(`/api/photos?eventId=${id}`),
          fetch(`/api/videos?eventId=${id}`),
        ])
        const vData = vRes.ok ? await vRes.json() : []
        setVideos(Array.isArray(vData) ? vData : [])
        if (!evRes.ok) { setError('Evento não encontrado.'); return }
        const evData = await evRes.json()
        setEvent(evData)
        // Registra visita (fire-and-forget, sem await)
        fetch(`/api/events/${id}/visita`, { method: 'POST' }).catch(() => {})
        const data = await phRes.json()
        const enhanced = (Array.isArray(data) ? data : []).map(p => ({
          ...p,
          isFree: isPhotoFree(p, evData),
          priceEffective: getEffectivePrice(p, evData),
        }))
        enhanced.sort((a, b) => {
          const t = p => { const d = new Date(p.takenAt || p.createdAt); return isNaN(d) ? 0 : d.getTime() }
          return t(b) - t(a)
        })
        setPhotos(enhanced)
      } catch { setError('Erro ao carregar dados.') }
      finally  { setLoading(false) }
    }
    load()
  }, [id])

  // Deep link: seta pasta/escopo inicial do evento (?pasta=__album__|NomeDaPasta)
  useEffect(() => {
    if (!photos.length) return
    if (!pastaParam) return
    const nextFolder = pastaParam === '__album__' ? null : pastaParam
    setCurrentFolder(prev => (prev === nextFolder ? prev : nextFolder))
  }, [photos.length, pastaParam])

  // Abre foto pelo ?foto=id (link de compartilhamento)
  useEffect(() => {
    if (!photos.length) return
    const fotoId = fotoParam
    if (!fotoId) return
    const found = photos.find(p => p.id === fotoId)
    if (found) {
      setOpenPhotoComments(!!openComentariosParam)
      setInitialPhotoCommentId(comentarioParam || null)
      setModalPhoto(found)
      // Ajusta a página para exibir essa foto
      const idx  = photos.findIndex(p => p.id === fotoId)
      setCurrentPage(Math.floor(idx / PHOTOS_PER_PAGE) + 1)
    }
  }, [photos, fotoParam, openComentariosParam, comentarioParam])

  // ESC key closes photo modal
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && modalPhoto) setModalPhoto(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [modalPhoto])

  // ── carrinho ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    try { setCartItems(JSON.parse(localStorage.getItem('carrinho') || '[]')) }
    catch { setCartItems([]) }
  }, [])

  // Restaura carrinho do servidor quando usuário está logado e localStorage está vazio
  useEffect(() => {
    if (!clienteLogado?.id) return
    const local = (() => { try { return JSON.parse(localStorage.getItem('carrinho') || '[]') } catch { return [] } })()
    if (local.length > 0) return
    fetch('/api/carrinhos?meu=1')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.carrinho?.length) return
        setCartItems(data.carrinho)
        localStorage.setItem('carrinho', JSON.stringify(data.carrinho))
        window.dispatchEvent(new Event('cartUpdated'))
      })
      .catch(() => {})
  }, [clienteLogado])

  function syncCartToServer(cartData) {
    try {
      const raw = localStorage.getItem('clienteLogado')
      if (!raw) return
      const cli = JSON.parse(raw)
      if (!cli?.id) return
      fetch('/api/carrinhos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrinho: cartData }),
      }).catch(() => {})
    } catch {}
  }

  function saveCart(nc) {
    setCartItems(nc)
    localStorage.setItem('carrinho', JSON.stringify(nc))
    window.dispatchEvent(new Event('cartUpdated'))
    syncCartToServer(nc)
  }

  useEffect(() => {
    if (!event || photos.length === 0 || cartItems.length === 0) return
    const photoMap = new Map(photos.map(p => [p.id, p]))
    const normalized = cartItems.map(item => {
      const photoData = photoMap.get(item.id) || item
      const effectivePrice = getEffectivePrice(photoData, event)
      const basePrice = Number(photoData?.price ?? item.price)
      return {
        ...item,
        price: effectivePrice,
        priceOriginal: Number.isFinite(basePrice) ? basePrice : effectivePrice,
        priceEffective: effectivePrice,
        isFree: isPhotoFree(photoData, event),
      }
    })
    const changed = JSON.stringify(normalized) !== JSON.stringify(cartItems)
    if (changed) saveCart(normalized)
  }, [event, photos, cartItems])

  function buildCartItem(photo) {
    const effectivePrice = getEffectivePrice(photo, event)
    const basePrice = Number(photo.price)
    return {
      id: photo.id,
      eventId: photo.eventId,
      eventName: photo.eventName || event?.name || '',
      filename: photo.filename,
      filenameWm: photo.filenameWm,
      filenameThumb: photo.filenameThumb,
      filenameMini: photo.filenameMini || null,
      publicId: photo.publicId || null,
      originalName: photo.originalName || null,
      originalWidth: photo.originalWidth || null,
      originalHeight: photo.originalHeight || null,
      price: effectivePrice,
      priceOriginal: Number.isFinite(basePrice) ? basePrice : effectivePrice,
      priceEffective: effectivePrice,
      isFree: isPhotoFree(photo, event),
    }
  }

  function addToCart(photo) {
    if (cartItems.some(i => i.id === photo.id)) return
    saveCart([...cartItems, buildCartItem(photo)])
  }

  function buildVideoCartItem(video, { raw = false } = {}) {
    const evDefault = Number(event?.precoVideoPadrao || 0)
    const finalPrice = raw
      ? Number(video.rawPrice ?? video.price ?? evDefault)
      : Number(video.price ?? evDefault)
    return {
      id: video.id,
      videoId: video.id,
      mediaType: 'video',
      tipo: 'video',
      eventId: video.eventId,
      eventName: event?.name || '',
      filename: video.filename,
      originalName: video.originalName || video.filename,
      publicId: video.publicId || null,
      posterClean: video.posterClean || null,
      posterWm: video.posterWm || null,
      duration: video.duration || null,
      width: video.width || null,
      height: video.height || null,
      price: finalPrice,
      priceOriginal: finalPrice,
      priceEffective: finalPrice,
      isRaw: !!raw,
      supportsRawDelivery: !!video.supportsRawDelivery,
      rawDeliveryNote: raw ? (video.rawDeliveryNote || null) : null,
    }
  }

  function addVideoToCart(video, { raw = false } = {}) {
    const cartId = `${video.id}${raw ? ':raw' : ''}`
    if (cartItems.some(i => (i.id === cartId) || (i.videoId === video.id && !!i.isRaw === raw))) return
    const item = buildVideoCartItem(video, { raw })
    item.id = cartId
    saveCart([...cartItems, item])
  }

  function removeVideoFromCart(videoId, raw = false) {
    saveCart(cartItems.filter(i => !(i.videoId === videoId && !!i.isRaw === raw)))
  }

  async function toggleSalvarAlbum() {
    if (!clienteLogado?.id) {
      window.location.href = '/login'
      return
    }

    try {
      const res = await fetch('/api/favoritos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clienteLogado.id,
          targetType: 'album',
          targetId: id,
        }),
      })
      if (!res.ok) return
      const data = await res.json()
      const nextCliente = { ...clienteLogado, favoritos: data.favoritos || [] }
      setClienteLogado(nextCliente)
      setAlbumSalvo((data.favoritos || []).includes(`album:${id}`))
      localStorage.setItem('clienteLogado', JSON.stringify(nextCliente))
      window.dispatchEvent(new Event('authUpdated'))
    } catch {}
  }

  function buildPhotoDownloadHref(photo) {
    return `/api/photos/${photo.id}/download`
  }

  function removeFromCart(photoId) { saveCart(cartItems.filter(i => i.id !== photoId)) }
  function toggleCart(photo) { cartItems.some(i => i.id === photo.id) ? removeFromCart(photo.id) : addToCart(photo) }

  function prefetchImage(photo) {
    const url = getFirstUrl(getPhotoModalDisplayCandidates(photo))
    if (!url) return
    if (prefetchedSet.current.has(url)) return
    const img = new Image(); img.src = url; prefetchedSet.current.add(url)
  }

  // ── navegação do modal — percorre TODAS as fotos ──────────────────────────────
  // Atualiza currentPage quando o índice global ultrapassa a página atual,
  // garantindo que ao fechar o grid já esteja na página certa.
  function prevPhoto() {
    if (!modalPhoto) return
    const idx     = photos.findIndex(p => p.id === modalPhoto.id)
    const nextIdx = (idx - 1 + photos.length) % photos.length
    setModalPhoto(photos[nextIdx])
    setCurrentPage(Math.floor(nextIdx / PHOTOS_PER_PAGE) + 1)
  }

  function nextPhoto() {
    if (!modalPhoto) return
    const idx     = photos.findIndex(p => p.id === modalPhoto.id)
    const nextIdx = (idx + 1) % photos.length
    setModalPhoto(photos[nextIdx])
    setCurrentPage(Math.floor(nextIdx / PHOTOS_PER_PAGE) + 1)
  }

  // ── fechar: centraliza a foto na tela ─────────────────────────────────────────
  function handleCloseWithPhoto(closedPhotoId) {
    setModalPhoto(null)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-photo-id="${closedPhotoId}"]`)
        if (!el) return
        const rect    = el.getBoundingClientRect()
        const centerY = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2
        window.scrollTo({ top: Math.max(0, centerY), behavior: 'instant' })
      })
    })
  }

  // ── pastas ────────────────────────────────────────────────────────────────────
  const folders = useMemo(() => {
    const set = new Set(photos.map(p => p.pasta).filter(Boolean))
    return [...set].sort()
  }, [photos])
  const hasFolders = folders.length > 0

  // ── filtro por horário EXIF ───────────────────────────────────────────────────
  const photosComHorario = photos.filter(p => p.takenAt).length
  const filteredPhotos = (() => {
    // Filtro de pasta
    let base = photos
    if (hasFolders) {
      base = currentFolder !== null
        ? photos.filter(p => p.pasta === currentFolder)
        : photos.filter(p => !p.pasta)
    }
    if (!filtroHoraMin && !filtroHoraMax) return base
    return base.filter(p => {
      if (!p.takenAt) return true // sem EXIF: sempre mostra
      const d = new Date(p.takenAt)
      if (isNaN(d)) return true
      const hhmm = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
      if (filtroHoraMin && hhmm < filtroHoraMin) return false
      if (filtroHoraMax && hhmm > filtroHoraMax) return false
      return true
    })
  })()

  // ── paginação ─────────────────────────────────────────────────────────────────
  const totalPages      = Math.ceil(filteredPhotos.length / PHOTOS_PER_PAGE)
  const startIndex      = (currentPage - 1) * PHOTOS_PER_PAGE
  const paginatedPhotos = filteredPhotos.slice(startIndex, startIndex + PHOTOS_PER_PAGE)

  function goToPage(page) {
    if (page < 1 || page > totalPages) return
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }

  if (loading) return (
    <>
      <Navbar />
      <div className="flex-center" style={{ minHeight: '60vh', gap: '1rem' }}>
        <div className="spinner" style={{ width: '36px', height: '36px' }} />
        <span style={{ color: 'var(--text-muted)' }}>Carregando galeria...</span>
      </div>
    </>
  )

  if (error || !event) return (
    <>
      <Navbar />
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-state-icon">😕</div>
          <h2 className="empty-state-title">{error || 'Evento não encontrado'}</h2>
          <Link href="/" className="btn btn-primary mt-3">← Voltar</Link>
        </div>
      </div>
    </>
  )

  const cartCountForEvent = cartItems.filter(i => i.eventId === id).length

  return (
    <>
      <Navbar />
      <main className="page-container">
        <div className="page-header">
          <Link href="/" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', letterSpacing: '0.1em' }}>← Todos os eventos</Link>
          <h1 className="page-title" style={{ marginTop: '0.75rem' }}>{event.name}</h1>
          <div className="flex" style={{ gap: '1.5rem', marginTop: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>📅 {formatDate(event.date)}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>📷 {photos.length} fotos</span>
            {cartCountForEvent > 0 && <span className="event-card-badge">🛒 {cartCountForEvent} no carrinho</span>}
            <button
              type="button"
              className={`btn btn-sm ${albumSalvo ? 'btn-primary' : 'btn-ghost'}`}
              onClick={toggleSalvarAlbum}
              title={clienteLogado?.id ? (albumSalvo ? 'Remover álbum dos salvos' : 'Salvar álbum') : 'Faça login para salvar álbuns'}
            >
              {albumSalvo ? '⭐ Álbum salvo' : '☆ Salvar álbum'}
            </button>
          </div>
          {event.description && (
            <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '600px' }}>
              {event.description}
            </p>
          )}
          <SponsorsPanel sponsors={Array.isArray(event.patrocinadores) ? event.patrocinadores : []} />
        </div>

        {event.albumGratis ? (
          <div className="alert mb-3" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)', color: 'var(--success)', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            🎁 <span>Álbum gratuito — todas as fotos estão disponíveis para download sem custo.</span>
          </div>
        ) : (
          <div className="alert alert-info mb-3">
            🔏 As fotos exibidas têm marca d&apos;água integrada. Após a compra, você baixa os originais sem marca.
          </div>
        )}

        {/* ── Descontos Progressivos ──────────────────────────────────────────── */}
        {(() => {
          const resolved = resolveEventDiscountConfig(event, globalDiscountConfig)
          if (!resolved.ativos || !resolved.table || resolved.table.length === 0) return null
          const sortedTable = [...resolved.table].sort((a, b) => a.quantidade - b.quantidade)
          return (
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600, marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                🎁 <span>Promoção — quanto mais fotos, maior o desconto!</span>
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {sortedTable.map((d, i) => {
                  const precoBase = event.precoFotoPadrao || null
                  const precoResultante = precoBase ? precoBase * (1 - d.desconto / 100) : null
                  return (
                    <div key={i} style={{
                      background: 'linear-gradient(135deg, rgba(201,169,110,0.13), rgba(201,169,110,0.04))',
                      border: '1px solid rgba(201,169,110,0.4)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '0.85rem 1.1rem',
                      minWidth: '130px', flex: '1 1 130px',
                      textAlign: 'center',
                    }}>
                      <p style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-heading)', lineHeight: 1 }}>
                        {d.desconto}% OFF
                      </p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        a partir de <strong>{d.quantidade}</strong> foto{d.quantidade !== 1 ? 's' : ''}
                      </p>
                      {precoResultante != null && (
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                          R$ {precoResultante.toFixed(2).replace('.', ',')} / foto
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ── Descontos Progressivos (Vídeos) ─────────────────────────────────── */}
        {(() => {
          const resolved = resolveEventVideoDiscountConfig(event, globalDiscountConfig)
          if (!resolved.ativos || !resolved.table || resolved.table.length === 0) return null
          const sortedTable = [...resolved.table].sort((a, b) => a.quantidade - b.quantidade)
          return (
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600, marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                🎬 <span>Promoção em vídeos — quanto mais vídeos, maior o desconto!</span>
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {sortedTable.map((d, i) => {
                  const precoBase = event.precoVideoPadrao || null
                  const precoResultante = precoBase ? precoBase * (1 - d.desconto / 100) : null
                  return (
                    <div key={i} style={{
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.13), rgba(99,102,241,0.04))',
                      border: '1px solid rgba(99,102,241,0.4)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '0.85rem 1.1rem',
                      minWidth: '130px', flex: '1 1 130px',
                      textAlign: 'center',
                    }}>
                      <p style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-heading)', lineHeight: 1 }}>
                        {d.desconto}% OFF
                      </p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        a partir de <strong>{d.quantidade}</strong> vídeo{d.quantidade !== 1 ? 's' : ''}
                      </p>
                      {precoResultante != null && (
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                          R$ {precoResultante.toFixed(2).replace('.', ',')} / vídeo
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ── Navegação de Pastas ──────────────────────────────────────────────── */}
        {hasFolders && (
          <div style={{ marginBottom: '1.25rem' }}>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <button
                className={`btn btn-sm ${currentFolder === null ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setCurrentFolder(null); setCurrentPage(1) }}
              >
                🏠 Todas as pastas
              </button>
              {currentFolder !== null && (
                <>
                  <span style={{ color: 'var(--text-dim)' }}>›</span>
                  <span className="btn btn-sm btn-primary" style={{ cursor: 'default' }}>
                    📂 {currentFolder}
                  </span>
                </>
              )}
            </div>

            {/* Folder boxes — só mostra na raiz */}
            {currentFolder === null && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '0.5rem' }}>
                {folders.map(f => {
                  const folderPhotos = photos.filter(p => p.pasta === f)
                  const coverPhoto = folderPhotos[0]
                  const count = folderPhotos.length
                  const thumbCandidates = coverPhoto ? getPhotoGridPreviewCandidates(coverPhoto) : []
                  const thumbSrc = getFirstUrl(thumbCandidates)
                  const hasFreePhotos = folderPhotos.some(p => p.isFree || p.gratis)
                  const allFree = folderPhotos.length > 0 && folderPhotos.every(p => p.isFree || p.gratis)
                  return (
                    <div
                      key={f}
                      onClick={() => { setCurrentFolder(f); setCurrentPage(1) }}
                      style={{
                        background: 'var(--bg-card)', border: `2px solid ${allFree ? 'rgba(34,197,94,0.45)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)', overflow: 'hidden', cursor: 'pointer',
                        transition: 'border-color 0.15s, transform 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = allFree ? 'rgba(34,197,94,0.45)' : 'var(--border)'; e.currentTarget.style.transform = 'none' }}
                    >
                      <div style={{ height: '90px', background: 'var(--bg-input)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {thumbSrc ? (
                          <>
                            <img src={thumbSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} onError={e => {
                              if (!applyNextImageFallback(e.target, thumbCandidates)) e.target.style.display = 'none'
                            }} />
                            <span style={{ position: 'absolute', fontSize: '2rem' }}>📂</span>
                          </>
                        ) : (
                          <span style={{ fontSize: '2.5rem' }}>📁</span>
                        )}
                        {(allFree || hasFreePhotos) && (
                          <span style={{
                            position: 'absolute', top: '0.3rem', right: '0.3rem',
                            background: allFree ? 'rgba(34,197,94,0.9)' : 'rgba(34,197,94,0.75)',
                            color: '#0d2e12', fontSize: '0.6rem', fontWeight: 700,
                            padding: '0.15rem 0.4rem', borderRadius: '999px', letterSpacing: '0.04em',
                          }}>
                            {allFree ? '🎁 GRÁTIS' : '🎁 tem grátis'}
                          </span>
                        )}
                      </div>
                      <div style={{ padding: '0.4rem 0.6rem' }}>
                        <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</p>
                        <p style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{count} foto{count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Filtro por horário EXIF */}
        {photosComHorario > 30 && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', padding: '0.75rem 1rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>⏱ Filtrar por horário:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              De
              <input type="time" value={filtroHoraMin} onChange={e => { setFiltroHoraMin(e.target.value); setCurrentPage(1) }}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              até
              <input type="time" value={filtroHoraMax} onChange={e => { setFiltroHoraMax(e.target.value); setCurrentPage(1) }}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} />
            </label>
            {(filtroHoraMin || filtroHoraMax) && (
              <button className="btn btn-ghost btn-sm"
                onClick={() => { setFiltroHoraMin(''); setFiltroHoraMax(''); setCurrentPage(1) }}>
                ✕ Limpar filtro
              </button>
            )}
            {(filtroHoraMin || filtroHoraMax) && (
              <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>
                {filteredPhotos.length} foto{filteredPhotos.length !== 1 ? 's' : ''} encontrada{filteredPhotos.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {videos.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', margin: '0 0 0.6rem', color: 'var(--text)' }}>
              🎥 Vídeos ({videos.length})
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '0.7rem',
            }}>
              {videos.map(v => {
                const inCart = cartItems.some(i => i.videoId === v.id && !i.isRaw)
                const inCartRaw = cartItems.some(i => i.videoId === v.id && i.isRaw)
                const jaComprado = fotosCompradasIds.has(v.id)
                const evPrice = Number(event?.precoVideoPadrao || 0)
                const price = Number(v.price ?? evPrice)
                const rawPrice = v.rawPrice != null ? Number(v.rawPrice) : null
                // Não-compradores veem a capa com WM. Compradores (e admin) veem clean.
                const gridPoster = jaComprado
                  ? (v.posterClean || v.posterWm)
                  : (v.posterWm || v.posterClean)
                return (
                  <div key={v.id} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                  }}>
                    <button
                      type="button"
                      onClick={() => setVideoModal(v)}
                      style={{
                        position: 'relative', width: '100%', aspectRatio: '16 / 9',
                        background: '#000', border: 'none', padding: 0, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {gridPoster ? (
                        <img src={gridPoster} alt="" loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ color: '#fff', fontSize: '2rem' }}>🎥</span>
                      )}
                      <span style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.25)',
                      }}>
                        <span style={{
                          width: 50, height: 50, borderRadius: '50%',
                          background: 'rgba(255,255,255,0.9)', color: '#000',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '1.4rem',
                        }}>▶</span>
                      </span>
                      {v.duration && (
                        <span style={{
                          position: 'absolute', right: 6, bottom: 6,
                          background: 'rgba(0,0,0,0.8)', color: '#fff',
                          fontSize: '0.7rem', padding: '0.1rem 0.35rem', borderRadius: '4px',
                        }}>{Math.floor(v.duration / 60)}:{String(Math.floor(v.duration % 60)).padStart(2, '0')}</span>
                      )}
                    </button>
                    <div style={{ padding: '0.6rem 0.75rem' }}>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.originalName || 'Vídeo'}
                      </p>
                      <p style={{ margin: '0.2rem 0 0.4rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>
                        R$ {price.toFixed(2)}
                      </p>
                      {inCart ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => removeVideoFromCart(v.id, false)}>✕ Remover</button>
                      ) : (
                        <button className="btn btn-primary btn-sm" onClick={() => addVideoToCart(v, { raw: false })}>+ Carrinho</button>
                      )}
                      {v.supportsRawDelivery && rawPrice != null && (
                        <div style={{ marginTop: '0.35rem', padding: '0.4rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Cru: R$ {rawPrice.toFixed(2)} (edição depois)
                          </p>
                          {inCartRaw ? (
                            <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.25rem' }} onClick={() => removeVideoFromCart(v.id, true)}>✕ Remover cru</button>
                          ) : (
                            <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.25rem' }} onClick={() => addVideoToCart(v, { raw: true })}>+ Comprar cru</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {videoModal && (() => {
          // Na página pública /evento/[id], TODO usuário (inclusive admin) vê
          // sempre a versão com marca d'água. O preview limpo do admin só
          // existe no painel /admin/eventos/[id] (TabVideos).
          const jaComprouVideo = fotosCompradasIds.has(videoModal.id)
          const podeReproduzir = jaComprouVideo
          // Calcula aspect ratio real do vídeo. Para vídeos verticais (9:16),
          // o modal fica mais estreito; horizontais usam 16:9. Sem dimensões,
          // assume 16:9 como fallback.
          const vw = Number(videoModal.width) || 16
          const vh = Number(videoModal.height) || 9
          const isPortrait = vh > vw
          const playerAspect = `${vw} / ${vh}`
          const playerMaxWidth = isPortrait ? '480px' : '900px'
          return (
          <div onClick={e => { if (e.target === e.currentTarget) setVideoModal(null) }} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
            overflowY: 'auto',
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', maxWidth: playerMaxWidth, width: '100%',
              padding: '1rem',
            }}>
              <div style={{ aspectRatio: playerAspect, background: '#000', borderRadius: 'var(--radius)', position: 'relative', overflow: 'hidden', maxHeight: '70vh', margin: '0 auto' }}>
                {podeReproduzir ? (
                  // Player limpo (sem marca d'água) para admin/comprador
                  <video
                    src={`/api/videos/${videoModal.id}/download`}
                    poster={(videoModal.posterClean || videoModal.posterWm) || undefined}
                    controls
                    controlsList="nodownload"
                    onContextMenu={e => e.preventDefault()}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                  />
                ) : videoModal.previewWmStatus === 'ready' && videoModal.previewWmFilename ? (
                  // Pré-visualização com marca d'água QUEIMADA no MP4 (gerada por ffmpeg).
                  // Sem overlay CSS — controles nativos funcionam normalmente.
                  <video
                    src={`/api/videos/${videoModal.id}/preview`}
                    poster={(videoModal.posterWm || videoModal.posterClean) || undefined}
                    controls
                    controlsList="nodownload noremoteplayback"
                    disablePictureInPicture
                    onContextMenu={e => e.preventDefault()}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                  />
                ) : (
                  // Preview ainda não está pronto (em processamento ou falhou)
                  <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                    {(videoModal.posterWm || videoModal.posterClean) ? (
                      <img src={videoModal.posterWm || videoModal.posterClean} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0.45)' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '3rem', background: '#000' }}>🎥</div>
                    )}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', textAlign: 'center', padding: '1rem', color: '#fff' }}>
                      <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                        {videoModal.previewWmStatus === 'failed' ? '⚠️ Pré-visualização indisponível' : '⏳ Processando pré-visualização…'}
                      </p>
                      <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', opacity: 0.8, maxWidth: '400px' }}>
                        {videoModal.previewWmStatus === 'failed'
                          ? 'Volte mais tarde — o fotógrafo será notificado.'
                          : 'A versão com marca d\'água está sendo gerada. Tente novamente em alguns minutos.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600 }}>{videoModal.originalName}</p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    R$ {Number(videoModal.price ?? event?.precoVideoPadrao ?? 0).toFixed(2)}
                    {videoModal.duration && ` · ${Math.floor(videoModal.duration / 60)}:${String(Math.floor(videoModal.duration % 60)).padStart(2, '0')}`}
                    {videoModal.width && videoModal.height && ` · ${videoModal.width}×${videoModal.height}`}
                    {podeReproduzir && <span style={{ marginLeft: '0.4rem', color: 'var(--accent)' }}>· ✓ liberado</span>}
                  </p>
                  {videoModal.supportsRawDelivery && videoModal.rawDeliveryNote && (
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: 'var(--text-dim)' }}>{videoModal.rawDeliveryNote}</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="btn btn-ghost" onClick={() => setVideoModal(null)}>Fechar</button>
                  {!podeReproduzir && (
                    cartItems.some(i => i.videoId === videoModal.id && !i.isRaw) ? (
                      <button className="btn btn-ghost" onClick={() => removeVideoFromCart(videoModal.id, false)}>✕ Remover</button>
                    ) : (
                      <button className="btn btn-primary" onClick={() => { addVideoToCart(videoModal, { raw: false }); setVideoModal(null) }}>+ Carrinho</button>
                    )
                  )}
                  {podeReproduzir && (
                    <a className="btn btn-primary" href={`/api/videos/${videoModal.id}/download`}
                      download={videoModal.originalName || `${videoModal.id}.mp4`}>
                      ⬇️ Baixar
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
          )
        })()}

        {photos.length === 0 && videos.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🖼️</div>
            <h2 className="empty-state-title">Nenhuma mídia ainda</h2>
          </div>
        )}

        {photos.length > 0 && (
          <>
              <div className="gallery-grid">
                {paginatedPhotos.map(photo => {
                  const inCart      = cartItems.some(i => i.id === photo.id)
                  const jaComprada  = fotosCompradasIds.has(photo.id)
                  const isFree      = photo.isFree ?? isPhotoFree(photo, event)
                  const displayPrice = Number(photo.priceEffective ?? photo.price ?? event?.precoFotoPadrao ?? 0)
                  const displayCandidates = getPhotoGridPreviewCandidates(photo)
                  const displaySrc  = getFirstUrl(displayCandidates)

                  return (
                    <div key={photo.id} className={`gallery-item ${inCart ? 'in-cart' : ''} ${jaComprada ? 'purchased' : ''}`}
                    data-photo-id={photo.id}>
                    {inCart && !jaComprada && <span className="in-cart-badge">✓ No carrinho</span>}
                    {jaComprada && <span className="in-cart-badge" style={{ background: 'var(--success)' }}>✓ Comprada</span>}
                    <div className="gallery-item-img-wrap"
                      onClick={() => {
                        setOpenPhotoComments(false)
                        setInitialPhotoCommentId(null)
                        setModalPhoto(photo)
                      }}
                      onMouseEnter={() => prefetchImage(photo)}>
                      <img
  key={displaySrc}
  src={displaySrc}
  alt="Foto do evento"
  loading="lazy"
  className="gallery-img"
  onLoad={(e) => {
    const img = e.currentTarget;

    // garante funcionamento mesmo com cache
    if (img.complete) {
      img.classList.add('loaded');
    } else {
      requestAnimationFrame(() => {
        img.classList.add('loaded');
      });
    }
  }}
  onError={(e) => {
    const target = e.currentTarget
    if (!applyNextImageFallback(target, displayCandidates)) target.style.display = 'none'
  }}
/>
                      {/* ID público no canto superior esquerdo */}
                      {(photo.publicId || photo.id) && (
                        <div style={{ position: 'absolute', top: '0.4rem', left: '0.4rem', fontSize: '0.97rem', fontFamily: 'monospace', fontWeight: 700, background: 'rgba(0,0,0,0.78)', color: '#fff', padding: '0.28rem 0.65rem', borderRadius: '5px', zIndex: 2, lineHeight: 1.2, letterSpacing: '0.05em', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }}>
                          #{photo.publicId || photo.id.slice(0, 8).toUpperCase()}
                        </div>
                      )}
                        <div className="gallery-item-overlay">
                          {isFree ? (
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>GRÁTIS</span>
                          ) : (
                            <span className="gallery-item-price">
                              R$ {Number(displayPrice).toFixed(2).replace('.', ',')}
                            </span>
                          )}
                          {isFree ? (
                            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                              <a
                                href={buildPhotoDownloadHref(photo)}
                                download={photo.originalName || photo.filename}
                                onClick={e => e.stopPropagation()}
                                style={{
                                  background: 'var(--accent)', color: '#000',
                                  border: 'none', borderRadius: '50%',
                                  width: '32px', height: '32px',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '1rem', cursor: 'pointer', textDecoration: 'none',
                                }}
                                title="Baixar grátis"
                              >⬇</a>
                              <button className={`gallery-cart-btn ${inCart ? 'in-cart' : ''}`}
                                onClick={e => { e.stopPropagation(); toggleCart(photo) }}
                                title={inCart ? 'Remover do carrinho' : 'Adicionar ao carrinho grátis'}>
                                {inCart ? '✓' : '🛒'}
                              </button>
                            </div>
                          ) : jaComprada ? (
                            <a
                              href={buildPhotoDownloadHref(photo)}
                              download={photo.originalName || photo.filename}
                              onClick={e => e.stopPropagation()}
                              style={{
                                background: 'var(--success)', color: '#fff',
                                border: 'none', borderRadius: '50%',
                                width: '32px', height: '32px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '1rem', cursor: 'pointer', textDecoration: 'none',
                              }}
                              title="Baixar (já comprada)"
                            >⬇</a>
                          ) : (
                            <button className={`gallery-cart-btn ${inCart ? 'in-cart' : ''}`}
                              onClick={e => { e.stopPropagation(); toggleCart(photo) }}>
                              {inCart ? '✓' : '🛒'}
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', margin: '3rem 0 2rem', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>← Anterior</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button key={page} className={`btn btn-sm ${currentPage === page ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => goToPage(page)}>{page}</button>
                ))}
                <button className="btn btn-secondary btn-sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>Próxima →</button>
                <span style={{ marginLeft: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Página {currentPage} de {totalPages}
                </span>
              </div>
            )}

            {cartCountForEvent > 0 && (
              <div style={{ marginTop: '3rem', padding: '1.5rem', background: 'var(--accent-dim)', border: '1px solid rgba(201,169,110,0.3)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <p style={{ color: 'var(--accent)', fontFamily: 'var(--font-heading)', fontSize: '1.1rem' }}>
                    {cartCountForEvent} foto{cartCountForEvent !== 1 ? 's' : ''} selecionada{cartCountForEvent !== 1 ? 's' : ''}
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Total: R$ {cartItems.filter(i => i.eventId === id).reduce((s, i) => s + i.price, 0).toFixed(2).replace('.', ',')}
                  </p>
                </div>
                <Link href="/carrinho" className="btn btn-primary">Ir para o Carrinho →</Link>
              </div>
            )}
          </>
        )}

        <EventCommentsSection
          eventId={id}
          currentFolder={currentFolder}
          clienteLogado={clienteLogado}
          isAdminView={isAdminView}
          initialFocusId={fotoParam ? null : comentarioParam}
        />
      </main>
      <Footer />

      {modalPhoto && (
        <PhotoModal
          photo={modalPhoto} photos={photos}
          onClose={() => {
            setModalPhoto(null)
            setOpenPhotoComments(false)
            setInitialPhotoCommentId(null)
          }}
          onCloseWithPhoto={handleCloseWithPhoto}
          onPrev={prevPhoto} onNext={nextPhoto}
          cartItems={cartItems}
          onAddToCart={addToCart} onRemoveFromCart={removeFromCart}
          purchasedIds={fotosCompradasIds}
          openCommentsByDefault={openPhotoComments}
          initialCommentId={initialPhotoCommentId}
        />
      )}
    </>
  )
}

// ── Painel de patrocinadores/parceiros ───────────────────────────────────────
function SponsorsPanel({ sponsors }) {
  if (!Array.isArray(sponsors) || sponsors.length === 0) return null
  const sorted = [...sponsors].sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0))

  return (
    <div style={{
      marginTop: '1.25rem',
      paddingTop: '1.25rem',
      borderTop: '1px solid var(--border)',
    }}>
      <p style={{
        fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600,
        letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.65rem',
      }}>
        🤝 Apoiadores deste álbum
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '0.65rem',
      }}>
        {sorted.map(s => <SponsorCard key={s.id} sponsor={s} />)}
      </div>
    </div>
  )
}

function SponsorCard({ sponsor }) {
  const hasLink = !!sponsor.link

  // Sempre renderiza como <div> para evitar nested <a>: o link do Instagram
  // (interno) seria descendente do <a> wrapper, o que viola HTML/hidratação.
  // Quando há link principal, o card abre via onClick.
  const handleCardClick = (e) => {
    if (!hasLink) return
    // Não abrir se o usuário clicou em outro link interno (ex: instagram).
    if (e.target.closest('a')) return
    window.open(sponsor.link, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      role={hasLink ? 'link' : undefined}
      tabIndex={hasLink ? 0 : undefined}
      onClick={handleCardClick}
      onKeyDown={hasLink ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          window.open(sponsor.link, '_blank', 'noopener,noreferrer')
        }
      } : undefined}
      style={{
        display: 'flex', gap: '0.7rem', alignItems: 'center',
        padding: '0.65rem 0.85rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        textDecoration: 'none', color: 'inherit',
        transition: 'all 0.15s',
        cursor: hasLink ? 'pointer' : 'default',
      }}
      onMouseEnter={hasLink ? e => {
        e.currentTarget.style.borderColor = 'var(--accent)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      } : undefined}
      onMouseLeave={hasLink ? e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'translateY(0)'
      } : undefined}>
      <div style={{
        width: 50, height: 50, flexShrink: 0,
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {sponsor.logoUrl ? (
          <img src={sponsor.logoUrl} alt={sponsor.nome || 'Patrocinador'}
            loading="lazy"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: '1.4rem', color: 'var(--text-dim)' }}>🤝</span>
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sponsor.nome}
        </p>
        {sponsor.descricao && (
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sponsor.descricao}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem', fontSize: '0.7rem', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
          {sponsor.instagram && (
            <a href={`https://instagram.com/${sponsor.instagram}`} target="_blank" rel="noopener noreferrer sponsored"
              onClick={e => e.stopPropagation()}
              style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              📷 @{sponsor.instagram}
            </a>
          )}
          {sponsor.contato && <span>📞 {sponsor.contato}</span>}
        </div>
      </div>
    </div>
  )
}
