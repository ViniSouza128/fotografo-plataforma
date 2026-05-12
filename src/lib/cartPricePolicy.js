import crypto from 'crypto'
import { readClients, writeClients } from './clients'

export const CART_PRICE_DECISION_UPDATE = 'update_carts'
export const CART_PRICE_DECISION_PRESERVE = 'preserve_existing'

function getCartPhotoId(item) {
  return item?.photoId || item?.id || null
}

function getClientName(client) {
  return client?.nomeCompleto || client?.nome || client?.email || client?.id || 'Cliente'
}

function buildPriceMap({ photoIds = [], photos = [], newPrice }) {
  const idSet = new Set(photoIds)
  const price = Number(newPrice)
  const map = new Map()

  photos.forEach(photo => {
    if (!idSet.has(photo?.id)) return
    const oldPrice = Number(photo.price)
    if (!Number.isFinite(price)) return
    if (Number.isFinite(oldPrice) && oldPrice === price) return
    map.set(photo.id, {
      photoId: photo.id,
      photoName: photo.originalName || photo.filename || photo.publicId || photo.id,
      eventId: photo.eventId || null,
      oldPhotoPrice: Number.isFinite(oldPrice) ? oldPrice : null,
      newPrice: price,
    })
  })

  return map
}

export function analyzeCartPriceImpact({ photoIds = [], photos = [], newPrice } = {}) {
  const changes = buildPriceMap({ photoIds, photos, newPrice })
  if (changes.size === 0) {
    return {
      hasImpact: false,
      totalCarts: 0,
      totalItems: 0,
      affectedPhotoIds: [],
      carts: [],
      changes: [],
    }
  }

  const clients = readClients()
  const carts = []
  let totalItems = 0

  clients.forEach(client => {
    if (!Array.isArray(client.carrinho) || client.carrinho.length === 0) return

    const items = client.carrinho
      .filter(item => changes.has(getCartPhotoId(item)))
      .map(item => {
        const photoId = getCartPhotoId(item)
        const change = changes.get(photoId)
        const currentCartPrice = Number(item.price)
        return {
          photoId,
          photoName: item.originalName || item.filename || change.photoName,
          eventId: item.eventId || change.eventId,
          currentCartPrice: Number.isFinite(currentCartPrice) ? currentCartPrice : null,
          oldPhotoPrice: change.oldPhotoPrice,
          newPrice: change.newPrice,
        }
      })

    if (!items.length) return
    totalItems += items.length
    carts.push({
      clientId: client.id,
      clientName: getClientName(client),
      email: client.email || null,
      whatsapp: client.whatsapp || null,
      itemCount: items.length,
      items,
    })
  })

  return {
    hasImpact: carts.length > 0,
    totalCarts: carts.length,
    totalItems,
    affectedPhotoIds: [...changes.keys()],
    carts,
    changes: [...changes.values()],
  }
}

export function applyCartPriceDecision({
  analysis,
  decision,
  adminId = null,
  adminName = null,
} = {}) {
  if (!analysis?.hasImpact) {
    return { updatedCarts: 0, updatedItems: 0, decisionId: null }
  }
  if (![CART_PRICE_DECISION_UPDATE, CART_PRICE_DECISION_PRESERVE].includes(decision)) {
    throw new Error('Decisao de carrinho invalida.')
  }

  const decisionId = crypto.randomUUID()
  const decidedAt = new Date().toISOString()
  const changes = new Map((analysis.changes || []).map(change => [change.photoId, change]))
  const affectedIds = new Set(analysis.affectedPhotoIds || [])
  const clients = readClients()
  let updatedCarts = 0
  let updatedItems = 0

  clients.forEach((client, index) => {
    if (!Array.isArray(client.carrinho) || client.carrinho.length === 0) return

    const affectedItems = []
    const nextCart = client.carrinho.map(item => {
      const photoId = getCartPhotoId(item)
      if (!affectedIds.has(photoId)) return item

      const change = changes.get(photoId)
      if (!change) return item

      const currentCartPrice = Number(item.price)
      const oldCartPrice = Number.isFinite(currentCartPrice)
        ? currentCartPrice
        : (change.oldPhotoPrice ?? change.newPrice)
      const next = { ...item }
      const policy = {
        decisionId,
        action: decision,
        decidedAt,
        decidedBy: adminId,
        decidedByName: adminName,
        photoId,
        oldCartPrice,
        oldPhotoPrice: change.oldPhotoPrice,
        newPhotoPrice: change.newPrice,
      }

      if (decision === CART_PRICE_DECISION_UPDATE) {
        next.price = change.newPrice
        next.priceOriginal = change.newPrice
        next.priceEffective = change.newPrice
        delete next.priceLocked
        next.priceChangePolicy = {
          ...policy,
          label: 'Carrinho atualizado para o novo preco da foto',
        }
      } else {
        next.price = oldCartPrice
        next.priceOriginal = oldCartPrice
        next.priceEffective = oldCartPrice
        next.priceLocked = {
          value: oldCartPrice,
          lockedAt: decidedAt,
          lockedByAdmin: true,
          reason: 'price_change_preserved',
          decisionId,
          oldPhotoPrice: change.oldPhotoPrice,
          newPhotoPrice: change.newPrice,
        }
        next.priceChangePolicy = {
          ...policy,
          label: 'Carrinho manteve o preco antigo existente',
        }
      }

      affectedItems.push({
        photoId,
        oldCartPrice,
        oldPhotoPrice: change.oldPhotoPrice,
        newPhotoPrice: change.newPrice,
      })
      updatedItems += 1
      return next
    })

    if (!affectedItems.length) return

    updatedCarts += 1
    clients[index].carrinho = nextCart
    clients[index].cartPriceDecisions = [
      ...(Array.isArray(client.cartPriceDecisions) ? client.cartPriceDecisions : []),
      {
        id: decisionId,
        action: decision,
        decidedAt,
        decidedBy: adminId,
        decidedByName: adminName,
        affectedItems,
      },
    ]
    clients[index].atualizadoEm = decidedAt
  })

  writeClients(clients)
  return { updatedCarts, updatedItems, decisionId, action: decision }
}
