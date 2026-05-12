// src/lib/safeDeletion.js
// Utilitarios para analisar vinculos e executar exclusoes seguras

import fs from 'fs'
import { readPhotos, writePhotos } from './photos'
import { readEvents, writeEvents } from './events'
import { readPedidos } from './pedidos'
import { readClients, writeClients } from './clients'
import { getPedidoItens, getPedidoItemPhotoId, isPedidoCompraConcluida } from './commerceUtils'
import {
  DELETION_LOG_PATH,
  ensureImageStorageDirs,
  movePhotoFilesToPreservedArea,
  movePhotoFilesToTrash,
  purgeTrashFiles,
} from './imageStorage'

function readDeletionLog() {
  ensureImageStorageDirs()
  if (!fs.existsSync(DELETION_LOG_PATH)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(DELETION_LOG_PATH, 'utf-8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function appendDeletionLog(entry) {
  ensureImageStorageDirs()
  const current = readDeletionLog()
  current.push({
    id: `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  })
  fs.writeFileSync(DELETION_LOG_PATH, JSON.stringify(current, null, 2), 'utf-8')
}

function createBatchId(prefix = 'delete') {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  return `${prefix}_${stamp}_${Math.random().toString(36).slice(2, 8)}`
}

function publicPhotoLabel(photo) {
  return photo?.originalName || photo?.filename || photo?.publicId || photo?.id || null
}

function cleanupAlbumFavorites(eventId) {
  const clients = readClients()
  const target = `album:${eventId}`
  let changed = false
  for (let i = 0; i < clients.length; i++) {
    const favs = Array.isArray(clients[i].favoritos) ? clients[i].favoritos : []
    const next = favs.filter(f => f !== target)
    if (next.length !== favs.length) {
      clients[i].favoritos = next
      changed = true
    }
  }
  if (changed) writeClients(clients)
}

function buildPhotoLinkSummary(photoId, { pedidos, clients }) {
  let compras = 0
  let carrinhos = 0
  let favoritos = 0
  let curtidas = 0

  for (const pedido of pedidos) {
    for (const item of getPedidoItens(pedido)) {
      const pid = getPedidoItemPhotoId(item)
      if (pid && pid === photoId) compras++
    }
  }

  for (const client of clients) {
    if (Array.isArray(client.carrinho)) {
      carrinhos += client.carrinho.filter(item => (item?.id || item?.photoId) === photoId).length
    }
    if (Array.isArray(client.favoritos) && client.favoritos.includes(photoId)) {
      favoritos++
    }
    if (Array.isArray(client.curtidas) && client.curtidas.includes(photoId)) {
      curtidas++
    }
  }

  return {
    compras,
    carrinhos,
    favoritos,
    curtidas,
    total: compras + carrinhos + favoritos + curtidas,
  }
}

export function analyzePhotos({ photoIds = [], eventId = null, pasta = null } = {}) {
  const photos = readPhotos()
  let targets = []

  if (photoIds.length > 0) {
    const idSet = new Set(photoIds)
    targets = photos.filter(p => idSet.has(p.id))
  } else if (eventId) {
    targets = photos.filter(p => p.eventId === eventId)
    if (pasta === '__album__') targets = targets.filter(p => !p.pasta)
    else if (pasta) targets = targets.filter(p => (p.pasta || '') === pasta)
  }

  const pedidos = readPedidos().filter(p => isPedidoCompraConcluida(p.status))
  const clients = readClients()

  const items = targets.map(photo => ({
    photo,
    id: photo.id,
    vinculos: buildPhotoLinkSummary(photo.id, { pedidos, clients }),
  }))

  const importantes = items.filter(i => i.vinculos.total > 0)

  return {
    items,
    importantes,
    totalImportantes: importantes.length,
    totalFotos: items.length,
    ids: items.map(i => i.id),
  }
}

export function analyzeEvent(eventId) {
  const events = readEvents()
  const event = events.find(e => e.id === eventId)
  if (!event) return { event: null, totalFotos: 0, totalImportantes: 0, importantes: [], items: [] }
  return { event, ...analyzePhotos({ eventId }) }
}

function markOrphans(photoIds, { origemEventId = null, pasta = null, batchId = null, reason = 'preserve_linked_media' } = {}) {
  const photos = readPhotos()
  const idSet = new Set(photoIds)
  const now = new Date().toISOString()
  const preservationBatchId = batchId || createBatchId('preserve')
  const preserved = []

  const updated = photos.map(photo => {
    if (!idSet.has(photo.id)) return photo
    const result = movePhotoFilesToPreservedArea(photo, { batchId: preservationBatchId })
    preserved.push({
      photoId: photo.id,
      label: publicPhotoLabel(photo),
      snapshot: photo,
      files: result.files,
    })
    return {
      ...result.photo,
      orfaoFuncional: true,
      origemEventId: photo.origemEventId || origemEventId || photo.eventId || null,
      pasta: null,
      pastaAnterior: photo.pasta || null,
      ocultarDoAlbum: true,
      removida: false,
      removidaEm: null,
      preservadaEm: now,
      preservacaoFisica: {
        batchId: preservationBatchId,
        reason,
        area: 'public/uploads/thumbs/_preserved + storage/originals/_preserved',
        movedAt: now,
        files: result.files,
      },
    }
  })

  writePhotos(updated)
  if (preserved.length > 0) {
    appendDeletionLog({
      action: 'preserve_linked_media',
      batchId: preservationBatchId,
      reason,
      origemEventId,
      pasta,
      photoIds,
      preserved,
    })
  }
  return { preserved: preserved.length, preservationBatchId }
}

function removePhotos(photoIds, { aggressive = false, permanent = false, batchId = null, reason = 'delete_to_trash' } = {}) {
  const idSet = new Set(photoIds)
  const photos = readPhotos()
  const targets = photos.filter(p => idSet.has(p.id))
  const trashBatchId = batchId || createBatchId(permanent ? 'permanent' : 'trash')
  const trashed = []
  const purged = []

  for (const photo of targets) {
    const files = movePhotoFilesToTrash(photo, { batchId: trashBatchId })
    trashed.push({
      photoId: photo.id,
      label: publicPhotoLabel(photo),
      snapshot: photo,
      files,
    })
  }

  if (permanent) {
    appendDeletionLog({
      action: 'trash_before_permanent_delete',
      batchId: trashBatchId,
      reason,
      photoIds,
      photos: trashed,
    })

    for (const item of trashed) {
      const purgedFiles = purgeTrashFiles(item.files)
      purged.push({
        photoId: item.photoId,
        files: purgedFiles,
      })
    }

    appendDeletionLog({
      action: 'permanent_delete',
      batchId: trashBatchId,
      reason,
      photoIds,
      purged,
      safety: 'allowed_only_without_compras_carrinhos_favoritos_curtidas',
    })
  } else if (trashed.length > 0) {
    appendDeletionLog({
      action: 'move_to_trash',
      batchId: trashBatchId,
      reason,
      photoIds,
      photos: trashed,
    })
  }

  const filtered = photos.filter(p => !idSet.has(p.id))

  if (aggressive) {
    const clients = readClients()
    let changed = false

    for (let idx = 0; idx < clients.length; idx++) {
      const client = clients[idx]
      if (Array.isArray(client.carrinho)) {
        const next = client.carrinho.filter(item => !idSet.has(item?.id))
        if (next.length !== client.carrinho.length) {
          clients[idx].carrinho = next
          changed = true
        }
      }
      if (Array.isArray(client.favoritos)) {
        const nextFavs = client.favoritos.filter(f => !idSet.has(f))
        if (nextFavs.length !== client.favoritos.length) {
          clients[idx].favoritos = nextFavs
          changed = true
        }
      }
      if (Array.isArray(client.curtidas)) {
        const nextLikes = client.curtidas.filter(f => !idSet.has(f))
        if (nextLikes.length !== client.curtidas.length) {
          clients[idx].curtidas = nextLikes
          changed = true
        }
      }
    }

    if (changed) writeClients(clients)
  }

  writePhotos(filtered)
  return {
    removed: targets.length,
    trashBatchId,
    trashedFiles: trashed.reduce((sum, item) => sum + item.files.length, 0),
    purgedFiles: purged.reduce((sum, item) => sum + item.files.length, 0),
  }
}

export function applyPhotoStrategy({
  photoIds = [],
  eventId = null,
  pasta = null,
  strategy = 'agressivo',
  decisions = {},
  permanent = false,
}) {
  const analysis = analyzePhotos({ photoIds, eventId, pasta })
  const ids = analysis.items.map(i => i.id)
  const importantSet = new Set(analysis.importantes.map(i => i.id))
  const batchId = createBatchId(permanent ? 'photo_permanent' : 'photo_delete')

  if (ids.length === 0) return { analysis, removed: 0, preserved: 0 }

  if (strategy === 'analise') return { analysis }

  if (permanent && analysis.totalImportantes > 0) {
    return {
      analysis,
      removed: 0,
      preserved: 0,
      rejectedPermanent: true,
      message: 'Exclusao definitiva bloqueada: ha compras, carrinhos, favoritos ou curtidas.',
    }
  }

  if (strategy === 'preservar') {
    const toPreserve = analysis.importantes.map(i => i.id)
    const toRemove = ids.filter(id => !importantSet.has(id))
    const preserved = toPreserve.length > 0
      ? markOrphans(toPreserve, { origemEventId: eventId, pasta, batchId, reason: 'photo_delete_preserve_linked' })
      : { preserved: 0 }
    const removed = toRemove.length > 0
      ? removePhotos(toRemove, { permanent, batchId, reason: 'photo_delete_unlinked' })
      : { removed: 0 }
    return { analysis, preserved: preserved.preserved, removed: removed.removed, trashBatchId: removed.trashBatchId || batchId }
  }

  if (strategy === 'individual') {
    const toPreserve = []
    const toRemove = []
    for (const id of ids) {
      const choice = decisions[id]
      if (importantSet.has(id)) toPreserve.push(id)
      else if (choice === 'preservar') toPreserve.push(id)
      else toRemove.push(id)
    }
    const preserved = toPreserve.length > 0
      ? markOrphans(toPreserve, { origemEventId: eventId, pasta, batchId, reason: 'photo_delete_individual_preserve' })
      : { preserved: 0 }
    const removed = toRemove.length > 0
      ? removePhotos(toRemove, { aggressive: true, permanent, batchId, reason: 'photo_delete_individual_unlinked' })
      : { removed: 0 }
    return { analysis, preserved: preserved.preserved, removed: removed.removed, trashBatchId: removed.trashBatchId || batchId }
  }

  // aggressive default still preserves linked media; only unlinked records are trashed.
  const toPreserve = analysis.importantes.map(i => i.id)
  const toRemove = ids.filter(id => !importantSet.has(id))
  const preserved = toPreserve.length > 0
    ? markOrphans(toPreserve, { origemEventId: eventId, pasta, batchId, reason: 'photo_delete_force_preserve_linked' })
    : { preserved: 0 }
  const removed = toRemove.length > 0
    ? removePhotos(toRemove, { aggressive: true, permanent, batchId, reason: 'photo_delete_unlinked_aggressive' })
    : { removed: 0 }
  return { analysis, preserved: preserved.preserved, removed: removed.removed, trashBatchId: removed.trashBatchId || batchId }
}

function markEventRemoved(events, eventIdx, { batchId, reason }) {
  events[eventIdx].removido = true
  events[eventIdx].removidoEm = new Date().toISOString()
  events[eventIdx].exclusaoFisica = {
    batchId,
    reason,
    mode: 'event_record_preserved_for_linked_media',
  }
}

export function applyEventStrategy({ eventId, strategy = 'agressivo', decisions = {}, permanent = false }) {
  const events = readEvents()
  const eventIdx = events.findIndex(e => e.id === eventId)
  if (eventIdx === -1) return { removedEvent: false, removedPhotos: 0, preserved: 0, analysis: analyzeEvent(eventId) }

  const analysis = analyzeEvent(eventId)
  const photoIds = analysis.items.map(i => i.id)
  const importantIds = new Set(analysis.importantes.map(i => i.id))
  const batchId = createBatchId(permanent ? 'event_permanent' : 'event_delete')

  if (strategy === 'analise') return { analysis }

  if (permanent && analysis.totalImportantes > 0) {
    return {
      analysis,
      removedEvent: false,
      removedPhotos: 0,
      preserved: 0,
      rejectedPermanent: true,
      message: 'Exclusao definitiva bloqueada: ha compras, carrinhos, favoritos ou curtidas.',
    }
  }

  if (strategy === 'preservar') {
    const toPreserve = analysis.importantes.map(i => i.id)
    const toRemove = photoIds.filter(id => !importantIds.has(id))
    const preserved = toPreserve.length > 0
      ? markOrphans(toPreserve, { origemEventId: eventId, batchId, reason: 'event_delete_preserve_linked' })
      : { preserved: 0 }
    const removed = toRemove.length > 0
      ? removePhotos(toRemove, { permanent, batchId, reason: 'event_delete_unlinked' })
      : { removed: 0 }

    markEventRemoved(events, eventIdx, { batchId, reason: 'event_delete_preserve_linked' })
    writeEvents(events)
    cleanupAlbumFavorites(eventId)

    appendDeletionLog({
      action: 'event_removed_with_preserved_media',
      batchId,
      eventId,
      eventSnapshot: analysis.event,
      strategy,
      permanent,
      removedPhotoIds: toRemove,
      preservedPhotoIds: toPreserve,
    })

    return { analysis, removedEvent: true, removedPhotos: removed.removed, preserved: preserved.preserved, trashBatchId: removed.trashBatchId || batchId }
  }

  if (strategy === 'individual') {
    const toPreserve = []
    const toRemove = []
    for (const id of photoIds) {
      const choice = decisions[id]
      if (importantIds.has(id)) toPreserve.push(id)
      else if (choice === 'preservar') toPreserve.push(id)
      else toRemove.push(id)
    }
    const preserved = toPreserve.length > 0
      ? markOrphans(toPreserve, { origemEventId: eventId, batchId, reason: 'event_delete_individual_preserve' })
      : { preserved: 0 }
    const removed = toRemove.length > 0
      ? removePhotos(toRemove, { aggressive: true, permanent, batchId, reason: 'event_delete_individual_unlinked' })
      : { removed: 0 }

    if (toPreserve.length > 0) {
      markEventRemoved(events, eventIdx, { batchId, reason: 'event_delete_individual_preserve' })
    } else {
      events.splice(eventIdx, 1)
    }
    writeEvents(events)
    cleanupAlbumFavorites(eventId)

    appendDeletionLog({
      action: toPreserve.length > 0 ? 'event_removed_with_preserved_media' : 'event_deleted',
      batchId,
      eventId,
      eventSnapshot: analysis.event,
      strategy,
      permanent,
      removedPhotoIds: toRemove,
      preservedPhotoIds: toPreserve,
    })

    return { analysis, removedEvent: true, removedPhotos: removed.removed, preserved: preserved.preserved, trashBatchId: removed.trashBatchId || batchId }
  }

  // aggressive default preserves linked media and trashes only unlinked photos.
  const toPreserve = analysis.importantes.map(i => i.id)
  const toRemove = photoIds.filter(id => !importantIds.has(id))
  const preserved = toPreserve.length > 0
    ? markOrphans(toPreserve, { origemEventId: eventId, batchId, reason: 'event_delete_force_preserve_linked' })
    : { preserved: 0 }
  const removed = toRemove.length > 0
    ? removePhotos(toRemove, { aggressive: true, permanent, batchId, reason: 'event_delete_unlinked_aggressive' })
    : { removed: 0 }

  if (toPreserve.length > 0) {
    markEventRemoved(events, eventIdx, { batchId, reason: 'event_delete_force_preserve_linked' })
  } else {
    events.splice(eventIdx, 1)
  }
  writeEvents(events)
  cleanupAlbumFavorites(eventId)

  appendDeletionLog({
    action: toPreserve.length > 0 ? 'event_removed_with_preserved_media' : 'event_deleted',
    batchId,
    eventId,
    eventSnapshot: analysis.event,
    strategy,
    permanent,
    removedPhotoIds: toRemove,
    preservedPhotoIds: toPreserve,
  })

  return { analysis, removedEvent: true, removedPhotos: removed.removed, preserved: preserved.preserved, trashBatchId: removed.trashBatchId || batchId }
}
