'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PhotoModal from './PhotoModal'
import { getAvailablePaymentMethods, resolvePaymentGateways } from '@/lib/commerceUtils'
import { applyNextImageFallback, getFirstUrl, getPhotoCartPreviewCandidates } from '@/lib/imagePaths'
import { clearGuestCart, persistGuestCart, readGuestCart } from '@/lib/guestCart'
import { computeProgressiveTotals, nextTierSuggestion } from '@/lib/pricing'
import { getEffectivePrice, isPhotoFree } from '@/lib/freeAccess'

function mergeCartItems(primary = [], secondary = []) {
  const result = []
  const seen = new Set()
  for (const item of [...primary, ...secondary]) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    result.push(item)
  }
  return result
}

export default function CartView({ insideClientPanel = false }) {
  const router = useRouter()
  const [cartItems, setCartItems] = useState([])
  const [clienteLogado, setClienteLogado] = useState(null)
  const [removedIds, setRemovedIds] = useState(new Set())
  const [loaded, setLoaded] = useState(false)
  const [config, setConfig] = useState({ pagamento: null })
  const [eventPhotosMap, setEventPhotosMap] = useState(new Map())
  const [modalPhoto, setModalPhoto] = useState(null)
  const [modalPhotos, setModalPhotos] = useState([])
  const [eventosInfo, setEventosInfo] = useState({})
  const [prevPaidByEvent, setPrevPaidByEvent] = useState({})
  const [showGuestConfirm, setShowGuestConfirm] = useState(false)
  const [cupomCodigo, setCupomCodigo] = useState('')
  const [cupomAplicado, setCupomAplicado] = useState(null) // { codigo, desconto, tipo, valor, descricao }
  const [cupomErro, setCupomErro] = useState('')
  const [validandoCupom, setValidandoCupom] = useState(false)
  const [rewardsInfo, setRewardsInfo] = useState(null)
  const [propostasInfo, setPropostasInfo] = useState(null)
  const [propostaForm, setPropostaForm] = useState({ valor: '', mensagem: '', open: false })
  const [propostaActing, setPropostaActing] = useState(false)
  const [propostaErro, setPropostaErro] = useState('')

  useEffect(() => {
    async function loadCart() {
      try {
        let loggedClient = null
        try {
          const raw = localStorage.getItem('clienteLogado')
          if (raw) {
            const cli = JSON.parse(raw)
            if (cli?.id) {
              loggedClient = cli
              setClienteLogado(cli)
            }
          }
        } catch {}

        const localCart = readGuestCart()
        let serverCart = []
        if (loggedClient?.id) {
          try {
            const res = await fetch('/api/carrinhos?meu=1')
            if (res.ok) {
              const data = await res.json()
              serverCart = Array.isArray(data.carrinho) ? data.carrinho : []
            }
          } catch {}
        }
        const saved = mergeCartItems(serverCart, localCart)
        setCartItems(saved)

        setEventosInfo({})

        if (saved.length > 0) {
          const eventIds = [...new Set(saved.map(i => i.eventId).filter(Boolean))]
          const [results, eventsData] = await Promise.all([
            Promise.all(eventIds.map(async (eid) => {
              try {
                const response = await fetch(`/api/photos?eventId=${eid}`)
                if (!response.ok) return { eventId: eid, photos: null }
                const photos = await response.json()
                return { eventId: eid, photos: Array.isArray(photos) ? photos : [] }
              } catch {
                return { eventId: eid, photos: null }
              }
            })),
            Promise.all(eventIds.map(async (eid) => {
              try {
                const res = await fetch(`/api/events/${eid}`)
                if (!res.ok) return null
                return await res.json()
              } catch {
                return null
              }
            })),
          ])

          const photosByEvent = new Map(results.map(r => [r.eventId, r.photos]))
          setEventPhotosMap(photosByEvent)

          const evMap = {}
          eventsData.forEach(ev => { if (ev?.id) evMap[ev.id] = ev })
          setEventosInfo(evMap)

          const removidas = new Set()
          for (const item of saved) {
            // Vídeos não estão na lista de fotos do evento — não checar aqui.
            // (Se um vídeo for removido pelo fotógrafo, o backend já omite do
            //  /api/videos; a checagem dedicada de vídeos pode entrar depois.)
            const isVideoItem = item?.mediaType === 'video' || item?.tipo === 'video' || !!item?.videoId
            if (isVideoItem) continue
            const eventPhotos = photosByEvent.get(item.eventId)
            if (!Array.isArray(eventPhotos)) continue
            if (!eventPhotos.some(photo => photo.id === item.id)) removidas.add(item.id)
          }
          setRemovedIds(removidas)

          const normalizedCart = saved.map(item => {
            // Vídeos preservam preço original — não recalcular como foto.
            const isVideoItem = item?.mediaType === 'video' || item?.tipo === 'video' || !!item?.videoId
            if (isVideoItem) return item
            const eventPhotos = photosByEvent.get(item.eventId)
            const matched = Array.isArray(eventPhotos) ? eventPhotos.find(p => p.id === item.id) : null
            const photoData = matched || item
            const ev = evMap[item.eventId]
            const lockedValue = item?.priceLocked?.lockedByAdmin ? Number(item.priceLocked.value) : null
            const policyValue = item?.priceChangePolicy?.action === 'update_carts' ? Number(item.priceChangePolicy.newPhotoPrice) : null
            const adminPrice = Number.isFinite(lockedValue) ? lockedValue : (Number.isFinite(policyValue) ? policyValue : null)
            const priceEffective = adminPrice ?? getEffectivePrice(photoData, ev)
            const basePrice = Number(photoData?.price ?? item.price)
            return {
              ...item,
              price: priceEffective,
              priceOriginal: adminPrice ?? (Number.isFinite(basePrice) ? basePrice : priceEffective),
              priceEffective,
              isFree: isPhotoFree(photoData, ev),
            }
          })
          setCartItems(normalizedCart)
          persistGuestCart(normalizedCart)
          if (loggedClient?.id) syncCartToServer(normalizedCart)
        }
      } catch {
        setCartItems([])
      } finally {
        setLoaded(true)
      }
    }

    loadCart()
    fetch('/api/config').then(r => r.json()).then(setConfig).catch(() => {})

    // Restore previously-applied cupom from localStorage
    try {
      const raw = localStorage.getItem('cupomAplicado')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.codigo) {
          setCupomAplicado(parsed)
          setCupomCodigo(parsed.codigo)
        }
      }
    } catch {}
  }, [])

  // Load rewards info for logged-in clients (lightweight, just for display)
  useEffect(() => {
    if (!clienteLogado?.id) { setRewardsInfo(null); return }
    let cancelled = false
    async function loadRewards() {
      try {
        const res = await fetch('/api/rewards/me')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setRewardsInfo(data)
      } catch {}
    }
    loadRewards()
    return () => { cancelled = true }
  }, [clienteLogado?.id])

  const loadPropostas = useCallback(async () => {
    if (!clienteLogado?.id) { setPropostasInfo(null); return }
    try {
      const res = await fetch('/api/propostas?meu=1')
      if (!res.ok) return
      const data = await res.json()
      setPropostasInfo(data)
    } catch {}
  }, [clienteLogado?.id])

  useEffect(() => {
    loadPropostas()
  }, [loadPropostas])

  useEffect(() => {
    async function loadPrevPaid() {
      if (!clienteLogado?.id) { setPrevPaidByEvent({}); return }
      try {
        const res = await fetch('/api/pedidos?meu=1')
        if (!res.ok) return
        const pedidos = await res.json()
        const map = {}
        pedidos
          .filter(p => ['pago', 'liberado_manual'].includes(String(p.status || '').toLowerCase()))
          .forEach(p => {
            (p.itens || p.items || []).forEach(item => {
              const price = Number(item.price || item.priceOriginal || 0)
              if (price <= 0) return
              if (!item.eventId) return
              map[item.eventId] = (map[item.eventId] || 0) + 1
            })
          })
        setPrevPaidByEvent(map)
      } catch {
        setPrevPaidByEvent({})
      }
    }
    loadPrevPaid()
  }, [clienteLogado?.id])

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

  function saveCart(nextCart) {
    setCartItems(nextCart)
    persistGuestCart(nextCart)
    window.dispatchEvent(new Event('cartUpdated'))
    syncCartToServer(nextCart)
  }

  function buildCartItemFromPhoto(photo, fallbackEventName = '') {
    const event = eventosInfo?.[photo.eventId]
    const effectivePrice = getEffectivePrice(photo, event)
    const basePrice = Number(photo.price)
    return {
      id: photo.id,
      eventId: photo.eventId,
      eventName: photo.eventName || fallbackEventName || '',
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
    if (cartItems.some(item => item.id === photo.id)) return
    saveCart([...cartItems, buildCartItemFromPhoto(photo, photo.eventName)])
  }

  function removeItem(id) {
    saveCart(cartItems.filter(item => item.id !== id))
  }

  function clearCart() {
    if (!confirm('Deseja esvaziar o carrinho?')) return
    clearGuestCart()
    setCartItems([])
    window.dispatchEvent(new Event('cartUpdated'))
    syncCartToServer([])
  }

  function limparIndisponiveis() {
    saveCart(cartItems.filter(item => !removedIds.has(item.id)))
  }

  function openItemInModal(item) {
    const eventPhotos = eventPhotosMap.get(item.eventId)
    const list = Array.isArray(eventPhotos) && eventPhotos.length > 0 ? eventPhotos : [item]
    const selected = list.find(photo => photo.id === item.id) || item
    setModalPhotos(list)
    setModalPhoto(selected)
  }

  function closeModal() {
    setModalPhoto(null)
    setModalPhotos([])
  }

  function prevModalPhoto() {
    if (!modalPhoto || modalPhotos.length <= 1) return
    const index = modalPhotos.findIndex(photo => photo.id === modalPhoto.id)
    if (index < 0) return
    const prevIndex = (index - 1 + modalPhotos.length) % modalPhotos.length
    setModalPhoto(modalPhotos[prevIndex])
  }

  function nextModalPhoto() {
    if (!modalPhoto || modalPhotos.length <= 1) return
    const index = modalPhotos.findIndex(photo => photo.id === modalPhoto.id)
    if (index < 0) return
    const nextIndex = (index + 1) % modalPhotos.length
    setModalPhoto(modalPhotos[nextIndex])
  }

  const itensDisponiveis = cartItems.filter(item => !removedIds.has(item.id))
  const itensIndisponiveis = cartItems.filter(item => removedIds.has(item.id))

  async function aplicarCupom() {
    const codigoNorm = cupomCodigo.trim().toUpperCase()
    if (!codigoNorm) { setCupomErro('Informe o código do cupom.'); return }
    if (itensDisponiveis.length === 0) { setCupomErro('Carrinho vazio.'); return }
    setValidandoCupom(true)
    setCupomErro('')
    try {
      const res = await fetch('/api/cupons/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: codigoNorm,
          items: itensDisponiveis.map(i => ({ id: i.id, eventId: i.eventId })),
        }),
      })
      const data = await res.json()
      if (!data.valido) {
        setCupomAplicado(null)
        try { localStorage.removeItem('cupomAplicado') } catch {}
        setCupomErro(data.error || 'Cupom inválido.')
        return
      }
      const aplicado = {
        codigo: data.codigo,
        tipo: data.tipo,
        valor: data.valor,
        desconto: data.desconto,
        descricao: data.descricao,
      }
      setCupomAplicado(aplicado)
      setCupomCodigo(aplicado.codigo)
      setCupomErro('')
      try { localStorage.setItem('cupomAplicado', JSON.stringify(aplicado)) } catch {}
    } catch {
      setCupomErro('Erro ao validar cupom. Tente novamente.')
    } finally {
      setValidandoCupom(false)
    }
  }

  function removerCupom() {
    setCupomAplicado(null)
    setCupomCodigo('')
    setCupomErro('')
    try { localStorage.removeItem('cupomAplicado') } catch {}
  }

  const propostaAtiva = useMemo(() => {
    if (!Array.isArray(propostasInfo?.propostas)) return null
    return propostasInfo.propostas.find(p =>
      ['pendente', 'contraproposta', 'aceita', 'aceita_pelo_cliente'].includes(p.status)
    ) || null
  }, [propostasInfo])

  async function enviarProposta() {
    setPropostaErro('')
    const valor = Number(propostaForm.valor)
    if (!Number.isFinite(valor) || valor <= 0) { setPropostaErro('Informe um valor válido.'); return }
    setPropostaActing(true)
    try {
      const res = await fetch('/api/propostas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valorProposto: valor, mensagem: propostaForm.mensagem }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar proposta.')
      setPropostaForm({ valor: '', mensagem: '', open: false })
      loadPropostas()
    } catch (err) {
      setPropostaErro(err.message)
    } finally {
      setPropostaActing(false)
    }
  }

  async function actPropostaCliente(propostaId, action) {
    setPropostaActing(true)
    try {
      const res = await fetch('/api/propostas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: propostaId, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro.')
      loadPropostas()
    } catch (err) {
      setPropostaErro(err.message)
    } finally {
      setPropostaActing(false)
    }
  }

  const globalDiscountConfig = useMemo(() => ({
    descontosGlobais: Array.isArray(config?.descontosGlobais) ? config.descontosGlobais : [],
    descontosGlobaisAtivos: !!config?.descontosGlobaisAtivos,
  }), [config])

  const pricing = useMemo(
    () => computeProgressiveTotals(itensDisponiveis, { eventsById: eventosInfo, previousPaidByEvent: prevPaidByEvent, ignoreFreeInCount: true, globalConfig: globalDiscountConfig }),
    [itensDisponiveis, eventosInfo, prevPaidByEvent, globalDiscountConfig]
  )

  const pricedItemsMap = useMemo(() => {
    const map = new Map()
    pricing.itensComDesconto.forEach(item => { if (item?.id) map.set(item.id, item) })
    return map
  }, [pricing.itensComDesconto])

  const nextTier = useMemo(
    () => nextTierSuggestion({ items: itensDisponiveis, eventsById: eventosInfo, previousPaidByEvent: prevPaidByEvent, globalConfig: globalDiscountConfig }),
    [itensDisponiveis, eventosInfo, prevPaidByEvent, globalDiscountConfig]
  )

  // Re-validate cupom whenever cart changes meaningfully (avoid stale discounts)
  const cartSignature = useMemo(
    () => itensDisponiveis.map(i => `${i.id}:${i.eventId}`).sort().join('|'),
    [itensDisponiveis]
  )
  useEffect(() => {
    if (!cupomAplicado?.codigo) return
    if (itensDisponiveis.length === 0) {
      setCupomAplicado(null)
      try { localStorage.removeItem('cupomAplicado') } catch {}
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/cupons/validar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo: cupomAplicado.codigo,
            items: itensDisponiveis.map(i => ({ id: i.id, eventId: i.eventId })),
          }),
        })
        const data = await res.json()
        if (cancelled) return
        if (!data.valido) {
          setCupomAplicado(null)
          try { localStorage.removeItem('cupomAplicado') } catch {}
          setCupomErro(`Cupom removido: ${data.error}`)
        } else {
          const aplicado = {
            codigo: data.codigo,
            tipo: data.tipo,
            valor: data.valor,
            desconto: data.desconto,
            descricao: data.descricao,
          }
          setCupomAplicado(aplicado)
          try { localStorage.setItem('cupomAplicado', JSON.stringify(aplicado)) } catch {}
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [cartSignature]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalComCupom = useMemo(() => {
    const baseTotal = pricing.total
    if (!cupomAplicado) return baseTotal
    return Math.max(0, Math.round((baseTotal - Number(cupomAplicado.desconto || 0)) * 100) / 100)
  }, [pricing.total, cupomAplicado])

  // Rewards: nivel desconto preview no carrinho
  const rewardsAtivo = !!rewardsInfo?.ativo
  const descontoNivelPct = rewardsAtivo ? Number(rewardsInfo?.beneficio?.descontoPct || 0) : 0
  const descontoNivel = (rewardsAtivo && descontoNivelPct > 0)
    ? Math.round(totalComCupom * descontoNivelPct) / 100
    : 0
  const totalComRewards = Math.max(0, Math.round((totalComCupom - descontoNivel) * 100) / 100)
  const cashbackPct = rewardsAtivo ? Number(rewardsInfo?.beneficio?.cashbackPct || 0) : 0
  const cashbackProjetado = (cashbackPct > 0 && totalComRewards > 0)
    ? Math.round(totalComRewards * cashbackPct) / 100
    : 0
  const saldoFlatProjetado = rewardsAtivo ? Number(rewardsInfo?.beneficio?.saldoFlat || 0) : 0

  const byEvent = itensDisponiveis.reduce((acc, item) => {
    if (!acc[item.eventId]) acc[item.eventId] = { eventName: item.eventName, items: [] }
    acc[item.eventId].items.push(item)
    return acc
  }, {})

  if (!loaded) {
    return (
      <div className="flex-center" style={{ minHeight: insideClientPanel ? '35vh' : '60vh' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  return (
    <>
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">{insideClientPanel ? 'Carrinho atual' : 'Carrinho'}</h1>
          {cartItems.length > 0 && (
            <p className="page-subtitle">
              {itensDisponiveis.length} foto{itensDisponiveis.length !== 1 ? 's' : ''} disponível{itensDisponiveis.length !== 1 ? 'is' : ''}
              {itensIndisponiveis.length > 0 && (
                <span style={{ color: 'var(--danger)', marginLeft: '0.5rem' }}>
                  · {itensIndisponiveis.length} indisponível{itensIndisponiveis.length !== 1 ? 'eis' : ''}
                </span>
              )}
            </p>
          )}
        </div>

        {!clienteLogado && cartItems.length > 0 && (
          <div className="alert alert-info mb-3" style={{ fontSize: '0.86rem', lineHeight: '1.5' }}>
            Entrar em uma conta garante acesso permanente às suas compras. Sem conta, o carrinho pode ser perdido a qualquer momento.
          </div>
        )}

        {itensIndisponiveis.length > 0 && (
          <div className="alert alert-error mb-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <span>
              🚫 {itensIndisponiveis.length} foto{itensIndisponiveis.length !== 1 ? 's' : ''} removida{itensIndisponiveis.length !== 1 ? 's' : ''} pelo fotógrafo e não pode{itensIndisponiveis.length !== 1 ? 'm' : ''} ser comprada{itensIndisponiveis.length !== 1 ? 's' : ''}.
            </span>
            <button className="btn btn-sm btn-danger" onClick={limparIndisponiveis}>Remover indisponíveis</button>
          </div>
        )}

        {cartItems.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🛒</div>
            <h2 className="empty-state-title">Seu carrinho está vazio</h2>
            <p>Navegue pelos eventos e adicione fotos ao carrinho.</p>
            <Link href="/" className="btn btn-primary mt-3">Ver Eventos</Link>
          </div>
        )}

        {cartItems.length > 0 && (
          <div className="cart-layout">
            <div>
              {Object.entries(byEvent).map(([eventId, group]) => (
                <div key={eventId} style={{ marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--text-muted)' }}>
                      📸 {group.eventName || 'Evento'}
                    </h3>
                    <Link href={`/evento/${eventId}`} style={{ fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'underline' }}>
                      + Adicionar mais fotos
                    </Link>
                  </div>
                  {nextTier[eventId] && (
                    <div style={{ marginBottom: '0.6rem', background: 'var(--bg-secondary)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', padding: '0.65rem 0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ color: 'var(--accent)' }}>⬆️</span>
                      <div>
                        Faltam <strong>{nextTier[eventId].missing}</strong> foto{nextTier[eventId].missing !== 1 ? 's' : ''} para a próxima faixa de <strong>{nextTier[eventId].pct}%</strong> ({nextTier[eventId].targetQty} fotos) — preço unitário cai para <strong>R$ {nextTier[eventId].projectedUnit.toFixed(2).replace('.', ',')}</strong>.
                        {prevPaidByEvent[eventId] > 0 && (
                          <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                            Compras anteriores ({prevPaidByEvent[eventId]}) já contam para a faixa.
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="cart-items-list">
                    {group.items.map(item => {
                      const thumbCandidates = getPhotoCartPreviewCandidates(item)
                      const thumbSrc = getFirstUrl(thumbCandidates)

                      return (
                        <div
                          key={item.id}
                          className="cart-item cart-item-clickable"
                          role="button"
                          tabIndex={0}
                          onClick={() => openItemInModal(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              openItemInModal(item)
                            }
                          }}
                          title="Abrir foto"
                        >
                          <div className="cart-item-thumb">
                            <img
                              src={thumbSrc}
                              alt="Foto"
                              onError={e => {
                                if (!applyNextImageFallback(e.target, thumbCandidates)) {
                                  e.target.style.display = 'none'
                                }
                              }}
                            />
                          </div>

                          <div className="cart-item-info">
                            <p className="cart-item-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                              #{item.publicId || (item.id?.slice(0, 8) || 'N/A')}
                            </p>
                            <p className="cart-item-event">{group.eventName}</p>
                          </div>

                          {(() => {
                            const priced = pricedItemsMap.get(item.id) || item
                            const original = Number(priced.priceOriginal ?? priced.price ?? 0)
                            const final = Number(priced.priceComDesconto ?? priced.price ?? 0)
                            const hasDesc = final < original
                            const isFree = final === 0
                            return (
                              <div className="cart-item-price" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: hasDesc ? '2px' : 0 }}>
                                {hasDesc && <span style={{ textDecoration: 'line-through', color: 'var(--text-dim)', fontSize: '0.78rem' }}>R$ {original.toFixed(2).replace('.', ',')}</span>}
                                <span style={{ color: isFree ? 'var(--accent)' : 'var(--accent)', fontSize: '0.9rem' }}>
                                  {isFree ? 'Grátis' : `R$ ${final.toFixed(2).replace('.', ',')}`}
                                </span>
                              </div>
                            )
                          })()}

                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => { e.stopPropagation(); removeItem(item.id) }}
                            onMouseDown={(e) => e.stopPropagation()}
                            title="Remover"
                            style={{ color: 'var(--danger)', flexShrink: 0 }}
                          >
                            🗑
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {itensIndisponiveis.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--danger)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                    Fotos indisponíveis
                  </div>
                  <div className="cart-items-list">
                    {itensIndisponiveis.map(item => (
                      <div key={item.id} className="cart-item" style={{ opacity: 0.5 }}>
                        <div className="cart-item-thumb" style={{ background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: '1.2rem' }}>🚫</span>
                        </div>
                        <div className="cart-item-info">
                          <p className="cart-item-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                            {item.originalName || item.filename}
                          </p>
                          <p style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>Foto removida pelo fotógrafo</p>
                        </div>
                        <p className="cart-item-price" style={{ textDecoration: 'line-through', color: 'var(--text-dim)' }}>
                          R$ {Number(item.price).toFixed(2).replace('.', ',')}
                        </p>
                        <button className="btn btn-ghost btn-sm" onClick={() => removeItem(item.id)} style={{ color: 'var(--danger)', flexShrink: 0 }}>
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn btn-ghost btn-sm" onClick={clearCart} style={{ color: 'var(--text-dim)', marginTop: '1rem' }}>
                Esvaziar carrinho
              </button>
            </div>

            <div className="cart-summary-card">
              <h3 className="cart-summary-title">Resumo do Pedido</h3>
              <div className="cart-summary-row">
                <span style={{ color: 'var(--text-muted)' }}>
                  Subtotal ({itensDisponiveis.length} foto{itensDisponiveis.length !== 1 ? 's' : ''})
                </span>
                <span>R$ {pricing.subtotal.toFixed(2).replace('.', ',')}</span>
              </div>
              {pricing.descontoTotal > 0 && (
                pricing.linhas.map((linha, idx) => (
                  <div key={idx} className="cart-summary-row" style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>
                    <span>Desconto progressivo {linha.pct}% ({linha.nomeEvento})</span>
                    <span>- R$ {linha.valor.toFixed(2).replace('.', ',')}</span>
                  </div>
                ))
              )}
              <div className="cart-summary-row">
                <span style={{ color: 'var(--text-muted)' }}>Taxa de serviço</span>
                <span style={{ color: 'var(--success)' }}>Grátis</span>
              </div>

              {/* Cupom de desconto */}
              <div style={{ borderTop: '1px dashed var(--border)', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
                {cupomAplicado ? (
                  <div className="cart-summary-row" style={{ fontSize: '0.85rem', color: 'var(--accent)', alignItems: 'center' }}>
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>🎟️ Cupom <strong style={{ fontFamily: 'monospace' }}>{cupomAplicado.codigo}</strong></span>
                      {cupomAplicado.descricao && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{cupomAplicado.descricao}</span>
                      )}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      - R$ {Number(cupomAplicado.desconto).toFixed(2).replace('.', ',')}
                      <button
                        type="button"
                        onClick={removerCupom}
                        title="Remover cupom"
                        style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '0.1rem 0.3rem', fontSize: '0.78rem' }}
                      >✕</button>
                    </span>
                  </div>
                ) : (
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                      Cupom de desconto
                    </label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Ex: BLACK2024"
                        value={cupomCodigo}
                        onChange={e => { setCupomCodigo(e.target.value.toUpperCase().replace(/\s+/g, '')); setCupomErro('') }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); aplicarCupom() } }}
                        maxLength={40}
                        disabled={validandoCupom || itensDisponiveis.length === 0}
                        style={{ fontFamily: 'monospace', textTransform: 'uppercase', fontSize: '0.85rem' }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={aplicarCupom}
                        disabled={validandoCupom || !cupomCodigo.trim() || itensDisponiveis.length === 0}
                        style={{ flexShrink: 0 }}
                      >
                        {validandoCupom ? '...' : 'Aplicar'}
                      </button>
                    </div>
                    {cupomErro && (
                      <p style={{ fontSize: '0.74rem', color: 'var(--danger)', margin: '0.4rem 0 0' }}>
                        {cupomErro}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Rewards: nivel + cashback projetado */}
              {rewardsAtivo && rewardsInfo?.nivelAtual && (descontoNivel > 0 || cashbackProjetado > 0 || saldoFlatProjetado > 0 || Number(rewardsInfo.saldo) > 0) && (
                <div style={{ borderTop: '1px dashed var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                  {descontoNivel > 0 && (
                    <div className="cart-summary-row" style={{ fontSize: '0.84rem', color: rewardsInfo.nivelAtual.color || 'var(--accent)' }}>
                      <span>{rewardsInfo.nivelAtual.icon} {rewardsInfo.nivelAtual.nome} ({descontoNivelPct}%)</span>
                      <span>- R$ {descontoNivel.toFixed(2).replace('.', ',')}</span>
                    </div>
                  )}
                  {(cashbackProjetado > 0 || saldoFlatProjetado > 0) && (
                    <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: '0.4rem 0 0', lineHeight: 1.4 }}>
                      ✨ Você receberá <strong style={{ color: 'var(--accent)' }}>R$ {(cashbackProjetado + saldoFlatProjetado).toFixed(2).replace('.', ',')}</strong> de saldo após o pagamento.
                    </p>
                  )}
                  {Number(rewardsInfo.saldo) > 0 && (
                    <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '0.3rem 0 0' }}>
                      💰 Você tem <strong>R$ {Number(rewardsInfo.saldo).toFixed(2).replace('.', ',')}</strong> de saldo para usar no checkout.
                    </p>
                  )}
                </div>
              )}

              {/* Propostas */}
              {clienteLogado && (propostasInfo?.ativo || propostaAtiva) && (
                <div style={{ borderTop: '1px dashed var(--border)', marginTop: '0.5rem', paddingTop: '0.6rem' }}>
                  {propostaErro && (
                    <div className="alert alert-error" style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                      {propostaErro}
                      <button type="button" onClick={() => setPropostaErro('')} style={{ float: 'right', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
                    </div>
                  )}

                  {propostaAtiva ? (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
                      <p style={{ fontSize: '0.78rem', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                        💬 Sua proposta
                      </p>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                        <p style={{ margin: '0.1rem 0' }}>
                          Você propôs: <strong style={{ color: 'var(--accent)' }}>R$ {Number(propostaAtiva.valorPropostoCliente).toFixed(2).replace('.', ',')}</strong>
                        </p>
                        {propostaAtiva.valorContraproposta != null && (
                          <p style={{ margin: '0.1rem 0' }}>
                            Fotógrafo contrapôs: <strong style={{ color: '#a78bfa' }}>R$ {Number(propostaAtiva.valorContraproposta).toFixed(2).replace('.', ',')}</strong>
                          </p>
                        )}
                        <p style={{ margin: '0.3rem 0 0', fontSize: '0.74rem' }}>
                          Status: <strong style={{ color: propostaAtiva.status === 'aceita' || propostaAtiva.status === 'aceita_pelo_cliente' ? 'var(--success)' : 'var(--text)' }}>
                            {propostaAtiva.status === 'pendente' && 'Aguardando fotógrafo'}
                            {propostaAtiva.status === 'contraproposta' && 'Aguardando sua resposta'}
                            {propostaAtiva.status === 'aceita' && '✓ Aceita pelo fotógrafo'}
                            {propostaAtiva.status === 'aceita_pelo_cliente' && '✓ Acordo fechado'}
                          </strong>
                        </p>
                        {propostaAtiva.mensagemAdmin && (
                          <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', borderLeft: '2px solid #a78bfa', paddingLeft: '0.5rem', fontStyle: 'italic' }}>
                            &quot;{propostaAtiva.mensagemAdmin}&quot;
                          </p>
                        )}
                      </div>
                      {propostaAtiva.status === 'contraproposta' && (
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => actPropostaCliente(propostaAtiva.id, 'cliente_aceitar')}
                            disabled={propostaActing}
                            style={{ flex: 1 }}
                          >
                            ✓ Aceitar contraproposta
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => actPropostaCliente(propostaAtiva.id, 'cliente_rejeitar')}
                            disabled={propostaActing}
                            style={{ color: 'var(--danger)' }}
                          >
                            ✕ Rejeitar
                          </button>
                        </div>
                      )}
                      {propostaAtiva.status === 'pendente' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => actPropostaCliente(propostaAtiva.id, 'cliente_cancelar')}
                          disabled={propostaActing}
                          style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}
                        >
                          Cancelar proposta
                        </button>
                      )}
                    </div>
                  ) : propostasInfo?.ativo ? (
                    !propostaForm.open ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm btn-full"
                        onClick={() => setPropostaForm(p => ({ ...p, open: true }))}
                        disabled={itensDisponiveis.length === 0}
                      >
                        💬 Propor outro valor
                      </button>
                    ) : (
                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
                          Sua proposta (R$)
                        </label>
                        <input
                          type="number"
                          className="form-input"
                          value={propostaForm.valor}
                          onChange={e => setPropostaForm(p => ({ ...p, valor: e.target.value }))}
                          placeholder="Ex: 45.00"
                          min="0"
                          step="0.01"
                          max={pricing.total}
                          style={{ fontSize: '0.85rem' }}
                        />
                        <textarea
                          className="form-input"
                          value={propostaForm.mensagem}
                          onChange={e => setPropostaForm(p => ({ ...p, mensagem: e.target.value }))}
                          placeholder="Mensagem ao fotógrafo (opcional)"
                          rows={2}
                          maxLength={500}
                          style={{ fontSize: '0.82rem', marginTop: '0.4rem', resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={enviarProposta}
                            disabled={propostaActing || !propostaForm.valor}
                            style={{ flex: 1 }}
                          >
                            {propostaActing ? '...' : 'Enviar proposta'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => setPropostaForm({ valor: '', mensagem: '', open: false })}
                          >
                            Cancelar
                          </button>
                        </div>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
                          O total atual é R$ {pricing.total.toFixed(2).replace('.', ',')}. Se o carrinho mudar, sua proposta será invalidada.
                        </p>
                      </div>
                    )
                  ) : null}
                </div>
              )}

              <div className="cart-summary-row total">
                <span>Total</span>
                <span>
                  {propostaAtiva && (propostaAtiva.status === 'aceita' || propostaAtiva.status === 'aceita_pelo_cliente') ? (
                    <>R$ {Number(propostaAtiva.status === 'aceita_pelo_cliente' ? propostaAtiva.valorContraproposta : propostaAtiva.valorPropostoCliente).toFixed(2).replace('.', ',')}</>
                  ) : (
                    <>R$ {totalComRewards.toFixed(2).replace('.', ',')}</>
                  )}
                </span>
              </div>
              {Object.keys(prevPaidByEvent).length > 0 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.35rem', lineHeight: 1.4 }}>
                  Considerando compras anteriores pagas no mesmo álbum para manter o desconto progressivo.
                </p>
              )}
              <button
                className="btn btn-primary btn-full btn-lg"
                disabled={itensDisponiveis.length === 0}
                onClick={() => {
                  if (!clienteLogado) { setShowGuestConfirm(true); return }
                  router.push('/checkout')
                }}
              >
                Finalizar Compra →
              </button>
              {itensDisponiveis.length === 0 && cartItems.length > 0 && (
                <p style={{ fontSize: '0.78rem', color: 'var(--danger)', textAlign: 'center', marginTop: '0.75rem' }}>
                  Remova os itens indisponíveis para continuar.
                </p>
              )}
              {(() => {
                const pgConfig = config.pagamento || {}
                const metodos = getAvailablePaymentMethods(pgConfig)
                const isSimulated = metodos.length > 0 && metodos.every(method => {
                  const gateway = resolvePaymentGateways(pgConfig, method).effectivePrimary
                  return gateway === 'manual' || gateway === 'asaas_sandbox'
                })

                return isSimulated && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: '1rem', lineHeight: '1.5' }}>
                    🔒 Pagamento simulado — sem cobranças reais.
                  </p>
                )
              })()}
              <hr className="divider" />
              <Link href="/" style={{ display: 'block', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                ← Continuar comprando
              </Link>
            </div>
          </div>
        )}
      </div>

      {modalPhoto && (
        <PhotoModal
          photo={modalPhoto}
          photos={modalPhotos.length > 0 ? modalPhotos : [modalPhoto]}
          onClose={closeModal}
          onPrev={prevModalPhoto}
          onNext={nextModalPhoto}
          cartItems={cartItems}
          onAddToCart={addToCart}
          onRemoveFromCart={removeItem}
          purchasedIds={new Set()}
        />
      )}

      {showGuestConfirm && (
        <div className="modal-backdrop" onClick={() => setShowGuestConfirm(false)}>
          <div
            className="modal-full"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '420px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', borderRadius: 'var(--radius-lg)' }}
          >
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', color: 'var(--text)' }}>
              Comprar sem conta?
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6' }}>
              Sem uma conta, o acesso às suas compras fica salvo apenas neste dispositivo e pode ser perdido se você limpar o navegador ou trocar de aparelho.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6' }}>
              Com uma conta, você acessa suas fotos de qualquer lugar a qualquer hora.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <a href="/cadastro" className="btn btn-primary btn-full" style={{ textDecoration: 'none', textAlign: 'center' }}>
                Criar conta grátis
              </a>
              <a href="/login" className="btn btn-ghost btn-full" style={{ textDecoration: 'none', textAlign: 'center' }}>
                Já tenho conta — entrar
              </a>
              <button
                className="btn btn-ghost btn-full"
                style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}
                onClick={() => { setShowGuestConfirm(false); router.push('/checkout') }}
              >
                Continuar sem conta mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
