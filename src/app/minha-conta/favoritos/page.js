// src/app/minha-conta/favoritos/page.js
'use client'

import { useEffect, useState } from 'react'
import { applyNextImageFallback, getFirstUrl, getPhotoLargeCardCandidates } from '@/lib/imagePaths'

export default function FavoritosPage() {
  const [cliente, setCliente] = useState(null)
  const [allPhotos, setAllPhotos] = useState([])
  const [allEvents, setAllEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState(null)

  useEffect(() => {
    async function loadData() {
      try {
        // Busca dados atualizados do cliente
        const meRes = await fetch('/api/auth/me')
        let cli = null
        if (meRes.ok) {
          const meData = await meRes.json()
          cli = meData.client
          localStorage.setItem('clienteLogado', JSON.stringify(cli))
        } else {
          const raw = localStorage.getItem('clienteLogado')
          if (raw) cli = JSON.parse(raw)
        }
        if (!cli) return
        setCliente(cli)

        // Carrega todos os eventos e depois as fotos de cada um
        const eventsRes = await fetch('/api/events')
        if (!eventsRes.ok) return
        const events = await eventsRes.json()
        setAllEvents(Array.isArray(events) ? events : [])

        const photosByEvent = await Promise.all(
          events.map(async (ev) => {
            try {
              const res = await fetch(`/api/photos?eventId=${ev.id}`)
              if (res.ok) {
                const photos = await res.json()
                return photos.map(p => ({ ...p, eventName: ev.name }))
              }
            } catch (err) {
              console.warn(`Erro ao carregar fotos do evento ${ev.id}`, err)
            }
            return []
          })
        )

        setAllPhotos(photosByEvent.flat())
      } catch (err) {
        console.error('Erro ao carregar favoritos:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  async function toggleFavorito(photoId) {
    if (!cliente) return
    setRemovingId(photoId)
    try {
      const res = await fetch('/api/favoritos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: cliente.id, photoId, targetType: 'photo' }),
      })
      if (res.ok) {
        const data = await res.json()
        const updated = { ...cliente, favoritos: data.favoritos }
        setCliente(updated)
        localStorage.setItem('clienteLogado', JSON.stringify(updated))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setRemovingId(null)
    }
  }

  async function toggleAlbumSalvo(eventId) {
    if (!cliente) return
    setRemovingId(`album:${eventId}`)
    try {
      const res = await fetch('/api/favoritos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: cliente.id, targetType: 'album', targetId: eventId }),
      })
      if (res.ok) {
        const data = await res.json()
        const updated = { ...cliente, favoritos: data.favoritos }
        setCliente(updated)
        localStorage.setItem('clienteLogado', JSON.stringify(updated))
        window.dispatchEvent(new Event('authUpdated'))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setRemovingId(null)
    }
  }

  async function toggleCurtida(photoId) {
    if (!cliente) return
    setRemovingId(photoId)
    try {
      const res = await fetch('/api/curtidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: cliente.id, photoId }),
      })
      if (res.ok) {
        const data = await res.json()
        const updated = { ...cliente, curtidas: data.curtidas }
        setCliente(updated)
        localStorage.setItem('clienteLogado', JSON.stringify(updated))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setRemovingId(null)
    }
  }

  function addToCart(photo) {
    try {
      const cart = JSON.parse(localStorage.getItem('carrinho') || '[]')
      if (cart.some(item => item.id === photo.id)) return

      cart.push({
        id: photo.id,
        eventId: photo.eventId,
        eventName: photo.eventName || '',
        filename: photo.filename,
        filenameWm: photo.filenameWm,
        filenameThumb: photo.filenameThumb,
        filenameMini: photo.filenameMini || null,
        originalName: photo.originalName,
        publicId: photo.publicId,
        price: photo.price,
      })
      localStorage.setItem('carrinho', JSON.stringify(cart))
      window.dispatchEvent(new Event('cartUpdated'))
    } catch (err) {
      console.error(err)
    }
  }

  function isInCart(photoId) {
    try {
      const cart = JSON.parse(localStorage.getItem('carrinho') || '[]')
      return cart.some(item => item.id === photoId)
    } catch {
      return false
    }
  }

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '40vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  if (!cliente) return null

  const favoritosLista = Array.isArray(cliente.favoritos) ? cliente.favoritos : []
  const favoritoIds = new Set(favoritosLista.filter(id => typeof id === 'string' && !id.startsWith('album:')))
  const albumSalvoIds = new Set(
    favoritosLista
      .filter(id => typeof id === 'string' && id.startsWith('album:'))
      .map(id => id.slice('album:'.length))
  )
  const curtidaIds = new Set(cliente.curtidas || [])

  const favPhotos = allPhotos.filter(p => favoritoIds.has(p.id))
  const curtPhotos = allPhotos.filter(p => curtidaIds.has(p.id))
  const savedAlbums = allEvents.filter(ev => albumSalvoIds.has(ev.id))

  function groupByEvent(photos) {
    const groups = {}
    photos.forEach(p => {
      const key = p.eventName || p.eventId || 'Outros'
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    })
    return groups
  }

  function renderPhotoGrid(photos, type) {
    if (photos.length === 0) {
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            {type === 'favoritos'
              ? 'Nenhuma foto salva ainda.'
              : 'Nenhuma foto curtida ainda.'}
          </p>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            Navegue pelos eventos para encontrar fotos!
          </p>
        </div>
      )
    }

    const groups = groupByEvent(photos)

    return Object.entries(groups).map(([eventName, eventPhotos]) => (
      <div key={eventName} style={{ marginBottom: '1.5rem' }}>
        <p style={{
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          marginBottom: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {eventName}
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '1rem',
        }}>
          {eventPhotos.map(photo => {
            const previewCandidates = getPhotoLargeCardCandidates(photo)
            const thumb = getFirstUrl(previewCandidates)

            const inCart = isInCart(photo.id)
            const isRemoving = removingId === photo.id

            return (
              <div
                key={photo.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                }}
              >
                <div style={{
                  position: 'relative',
                  paddingTop: '75%',
                  background: 'var(--bg-input)',
                }}>
                  <img
                    src={thumb}
                    alt={`Foto #${photo.publicId || photo.id.slice(0, 8)}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                    loading="lazy"
                    onError={(e) => {
                      if (!applyNextImageFallback(e.target, previewCandidates)) {
                        e.target.style.display = 'none'
                      }
                    }}
                  />
                </div>

                <div style={{ padding: '0.75rem' }}>
                  <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                    {photo.publicId && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>
                        #{photo.publicId}
                      </span>
                    )}
                    <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-heading)' }}>
                      R$ {Number(photo.price).toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <button
                      className="btn btn-danger btn-sm btn-full"
                      disabled={isRemoving}
                      onClick={() => type === 'favoritos' ? toggleFavorito(photo.id) : toggleCurtida(photo.id)}
                      style={{ fontSize: '0.75rem' }}
                    >
                      {isRemoving
                        ? 'Removendo...'
                        : type === 'favoritos'
                          ? 'Remover dos salvos'
                          : 'Remover das curtidas'}
                    </button>

                    {!inCart ? (
                      <button
                        className="btn btn-primary btn-sm btn-full"
                        onClick={() => addToCart(photo)}
                        style={{ fontSize: '0.75rem' }}
                      >
                        Adicionar ao carrinho
                      </button>
                    ) : (
                      <span style={{
                        fontSize: '0.72rem',
                        color: 'var(--text-dim)',
                        textAlign: 'center',
                        padding: '0.3rem',
                      }}>
                        Já no carrinho
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    ))
  }

  return (
    <div>
      {/* Salvos */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', marginBottom: '0.25rem' }}>
            Álbuns Salvos
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {savedAlbums.length} {savedAlbums.length === 1 ? 'álbum salvo' : 'álbuns salvos'}
          </p>
        </div>
        {savedAlbums.length === 0 ? (
          <div style={{
            padding: '1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--text-dim)',
            fontSize: '0.9rem',
          }}>
            Nenhum álbum salvo ainda.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.85rem' }}>
            {savedAlbums.map(album => {
              const isRemoving = removingId === `album:${album.id}`
              return (
                <div key={album.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.85rem' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{album.date || ''}</p>
                  <p style={{ fontFamily: 'var(--font-heading)', margin: '0.2rem 0 0.6rem' }}>{album.name}</p>
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    <a href={`/evento/${album.id}`} className="btn btn-primary btn-sm" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>
                      Abrir álbum
                    </a>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleAlbumSalvo(album.id)}
                      disabled={isRemoving}
                      style={{ color: 'var(--danger)' }}
                    >
                      {isRemoving ? '...' : 'Remover'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Fotos salvas */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', marginBottom: '0.25rem' }}>
            Minhas Fotos Salvas
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {favPhotos.length} {favPhotos.length === 1 ? 'foto salva' : 'fotos salvas'}
          </p>
        </div>
        {renderPhotoGrid(favPhotos, 'favoritos')}
      </div>

      {/* Curtidas */}
      <div>
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', marginBottom: '0.25rem' }}>
            Fotos Curtidas
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {curtPhotos.length} {curtPhotos.length === 1 ? 'foto curtida' : 'fotos curtidas'}
          </p>
        </div>
        {renderPhotoGrid(curtPhotos, 'curtidas')}
      </div>
    </div>
  )
}
