// src/lib/colaborador.js
// Helpers para o papel "colaborador": admin com acesso parcial.
//
// Modelo:
//   - cliente:    isAdmin=false, isColaborador=false
//   - colaborador: isAdmin=true,  isColaborador=true   (acessa /admin com restrições)
//   - admin:      isAdmin=true,  isColaborador=false  (full)
//   - superAdmin: isAdmin=true,  isSuperAdmin=true    (full + áreas sensíveis)
//
// Ownership: events.colaboradorId e photos.colaboradorId apontam para o id do colaborador
// dono. Para conteúdo legado sem dono, considera-se de propriedade do estúdio (admin).

import { readEvents } from './events'
import { readPhotos } from './photos'
import { readClients } from './clients'

export function isColaborador(client) {
  return !!(client && client.isColaborador && client.isAdmin)
}

export function isFullAdmin(client) {
  return !!(client && client.isAdmin && !client.isColaborador)
}

export function isSuperAdmin(client) {
  return !!(client && client.isSuperAdmin)
}

// Retorna o id "dono" segundo o auth (colaborador → seu próprio id; admin → null)
export function getColaboradorId(authPayloadOrClient) {
  if (!authPayloadOrClient) return null
  if (authPayloadOrClient.isColaborador && authPayloadOrClient.isAdmin) {
    return authPayloadOrClient.id
  }
  return null
}

// Pode o colaborador ver/editar este evento?
export function canManageEvent(authPayloadOrClient, event) {
  if (!authPayloadOrClient) return false
  if (!event) return false
  if (authPayloadOrClient.isAdmin && !authPayloadOrClient.isColaborador) return true
  if (authPayloadOrClient.isColaborador) {
    return event.colaboradorId === authPayloadOrClient.id
  }
  return false
}

// Pode o colaborador ver/editar esta foto?
// A foto pode ter colaboradorId direto ou herdar do evento.
export function canManagePhoto(authPayloadOrClient, photo, eventsById) {
  if (!authPayloadOrClient) return false
  if (!photo) return false
  if (authPayloadOrClient.isAdmin && !authPayloadOrClient.isColaborador) return true
  if (!authPayloadOrClient.isColaborador) return false
  if (photo.colaboradorId) return photo.colaboradorId === authPayloadOrClient.id
  const ev = eventsById ? eventsById.get?.(photo.eventId) || eventsById[photo.eventId] : null
  return !!(ev && ev.colaboradorId === authPayloadOrClient.id)
}

// Filtra eventos para a visão de colaborador (mantém só os que ele pode gerenciar)
export function filterEventsForAuth(events, authPayloadOrClient) {
  if (!authPayloadOrClient) return []
  if (authPayloadOrClient.isAdmin && !authPayloadOrClient.isColaborador) return events
  if (authPayloadOrClient.isColaborador) {
    const id = authPayloadOrClient.id
    return events.filter(ev => ev.colaboradorId === id)
  }
  return []
}

// Filtra fotos para a visão de colaborador
export function filterPhotosForAuth(photos, authPayloadOrClient, eventsById) {
  if (!authPayloadOrClient) return []
  if (authPayloadOrClient.isAdmin && !authPayloadOrClient.isColaborador) return photos
  if (!authPayloadOrClient.isColaborador) return []
  const id = authPayloadOrClient.id
  return photos.filter(p => {
    if (p.colaboradorId) return p.colaboradorId === id
    const ev = eventsById?.get?.(p.eventId) || eventsById?.[p.eventId]
    return !!(ev && ev.colaboradorId === id)
  })
}

// Lista pública de colaboradores (super-admin / admin views)
export function listColaboradores() {
  return readClients()
    .filter(c => c.isColaborador && c.isAdmin)
    .map(c => ({
      id: c.id,
      nomeCompleto: c.nomeCompleto || '',
      email: c.email || '',
      whatsapp: c.whatsapp || '',
      ativo: c.ativo !== false,
      percentualRepasse: typeof c.percentualRepasse === 'number' ? c.percentualRepasse : null,
      criadoEm: c.criadoEm || null,
    }))
}

// Resumo de produção do colaborador (eventos + fotos)
export function getColaboradorSummary(colaboradorId) {
  const events = readEvents().filter(ev => ev.colaboradorId === colaboradorId && !ev.removido)
  const photos = readPhotos().filter(p => {
    if (p.removida) return false
    if (p.colaboradorId) return p.colaboradorId === colaboradorId
    return events.some(ev => ev.id === p.eventId)
  })
  return {
    totalEventos: events.length,
    totalFotos: photos.length,
    eventos: events.map(ev => ({ id: ev.id, name: ev.name, publicId: ev.publicId })),
  }
}
