// src/lib/vision/index.js
// Orquestrador do reconhecimento.
//
// Filosofia: nada é enviado para fora sem consentimento + configuração explícita
// (ver readVisionConfig().externoConfigurado). Engines locais por padrão.

import path from 'path'
import { resolveOriginalPath } from '@/lib/imageStorage'
import { readPhotos } from '@/lib/photos'
import { readEvents } from '@/lib/events'
import {
  readVisionConfig,
  readVisionIndex,
  upsertIndexEntry,
  findIndexByPhotoId,
  getBlockedPhotoIds,
} from './storage'
import { indexPhotoManual, searchManual } from './engines/manual'
import {
  isFaceApiAvailable,
  extractEmbeddingsFromImage,
  searchByEmbedding,
} from './engines/faceApi'

export async function getEngineStatus() {
  const cfg = readVisionConfig()
  const status = {
    ativo: !!cfg.ativo,
    engine: cfg.engine,
    permitirCliente: !!cfg.permitirCliente,
    exigirConsentimento: !!cfg.exigirConsentimento,
    similarityThreshold: Number(cfg.similarityThreshold) || 0.55,
    numericPattern: cfg.numericPattern || '\\b\\d{1,4}\\b',
    externoConfigurado: !!cfg.externoConfigurado,
    backends: {
      manual: { available: true, reason: null },
      'face-api-local': await isFaceApiAvailable(),
      external: { available: !!cfg.externoConfigurado, reason: cfg.externoConfigurado ? null : 'not-configured' },
    },
  }
  return status
}

// Indexa uma foto. Engine seguido conforme config; fallback para manual.
export async function indexPhoto(photo, { event = null } = {}) {
  const cfg = readVisionConfig()
  const finalEvent = event || readEvents().find(ev => ev.id === photo.eventId) || null
  const baseEntry = {
    photoId: photo.id,
    eventId: photo.eventId,
    eventVisibilidade: finalEvent?.visibilidade || 'publico',
    indexedAt: new Date().toISOString(),
  }

  // Sempre roda o manual para tags/codes
  const manual = await indexPhotoManual({
    photo, event: finalEvent, pattern: cfg.numericPattern,
  })

  let embeddings = null
  let facesCount = 0
  let engineUsed = 'manual'

  if (cfg.engine === 'face-api-local') {
    const status = await isFaceApiAvailable()
    if (status.available) {
      try {
        const abs = resolveOriginalPath(photo)
        if (abs) {
          const detections = await extractEmbeddingsFromImage(abs)
          embeddings = detections.map(d => d.embedding)
          facesCount = detections.length
          engineUsed = 'face-api-local'
        }
      } catch (err) {
        // Falhou: cai para manual
      }
    }
  }

  const entry = {
    ...baseEntry,
    codes: manual.codes,
    tokens: manual.tokens,
    embeddings,
    facesCount,
    engine: engineUsed,
  }
  upsertIndexEntry(entry)
  return entry
}

// Indexa um lote (para botão "indexar evento")
export async function indexPhotos(photos, { event = null } = {}) {
  const out = []
  for (const photo of photos) {
    try {
      const entry = await indexPhoto(photo, { event })
      out.push({ photoId: photo.id, ok: true, entry })
    } catch (err) {
      out.push({ photoId: photo.id, ok: false, error: err.message })
    }
  }
  return out
}

// Busca por código numérico/tags textuais.
export function searchByText({ code = null, tokens = [], eventId = null, includeEventScopes = ['publico'] }) {
  const allEntries = readVisionIndex()
  const entries = allEntries.filter(e => {
    if (eventId && e.eventId !== eventId) return false
    if (Array.isArray(includeEventScopes) && !includeEventScopes.includes(e.eventVisibilidade)) return false
    return true
  })
  return searchManual({ entries, code, tokens })
}

// Busca por embedding (referência facial).
export async function searchByFace({ queryEmbedding, threshold = null, eventId = null, includeEventScopes = ['publico'] }) {
  const cfg = readVisionConfig()
  const t = Number(threshold ?? cfg.similarityThreshold ?? 0.55)
  const allEntries = readVisionIndex()
  const entries = allEntries.filter(e => {
    if (!Array.isArray(e.embeddings) || e.embeddings.length === 0) return false
    if (eventId && e.eventId !== eventId) return false
    if (Array.isArray(includeEventScopes) && !includeEventScopes.includes(e.eventVisibilidade)) return false
    return true
  })
  return searchByEmbedding({ entries, queryEmbedding, threshold: t })
}

// Aplica filtros de bloqueio na lista resultante (LGPD)
export function applyBlocksFilter(results) {
  const blocked = getBlockedPhotoIds()
  if (blocked.size === 0) return results
  return results.filter(r => !blocked.has(r.photoId))
}
