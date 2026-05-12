// src/lib/vision/engines/manual.js
// Engine "manual": índice por tags textuais/numéricas + extração simples de
// códigos numéricos do nome do arquivo + EXIF (se disponível).
// Não envia nada para fora. Funciona sem dependências adicionais.

import path from 'path'

function extractNumericCodes(text, pattern) {
  if (!text) return []
  let re
  try { re = new RegExp(pattern || '\\b\\d{1,4}\\b', 'g') }
  catch { re = /\b\d{1,4}\b/g }
  const codes = new Set()
  let m
  while ((m = re.exec(text)) !== null) {
    const v = m[0].trim()
    if (v) codes.add(v)
  }
  return Array.from(codes)
}

function tokenize(text) {
  if (!text) return []
  return String(text)
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && t.length <= 32)
}

export async function indexPhotoManual({ photo, event, pattern }) {
  const candidates = [
    photo?.originalName,
    photo?.filename,
    photo?.author,
    photo?.legenda,
    photo?.descricao,
    event?.name,
    event?.organizador,
  ].filter(Boolean).join(' ')
  const codes = extractNumericCodes(candidates, pattern)
  const tokens = tokenize(candidates)
  return {
    codes,
    tokens,
    embeddings: null,
    facesCount: 0,
    engine: 'manual',
    indexedAt: new Date().toISOString(),
  }
}

// Buscar fotos compatíveis com codigo numérico ou tags textuais.
// Retorna: [{ photoId, score, matched: { codes:[], tokens:[] } }]
export function searchManual({ entries, code = null, tokens = [] }) {
  const results = []
  const tokensLower = tokens.map(t => String(t).toLowerCase())
  const codeStr = code != null ? String(code).trim() : null

  for (const entry of entries) {
    const matchedCodes = []
    const matchedTokens = []
    if (codeStr && Array.isArray(entry.codes)) {
      if (entry.codes.includes(codeStr)) matchedCodes.push(codeStr)
    }
    if (tokensLower.length > 0 && Array.isArray(entry.tokens)) {
      for (const t of tokensLower) {
        if (entry.tokens.includes(t)) matchedTokens.push(t)
      }
    }
    if (matchedCodes.length === 0 && matchedTokens.length === 0) continue
    const score = matchedCodes.length * 1.0 + matchedTokens.length * 0.3
    results.push({
      photoId: entry.photoId,
      eventId: entry.eventId,
      score,
      matched: { codes: matchedCodes, tokens: matchedTokens },
    })
  }
  results.sort((a, b) => b.score - a.score)
  return results
}
