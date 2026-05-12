// src/lib/vision/storage.js
// Persistência local + caminhos privados para reconhecimento.
//
// Nada de imagem de referência fica em /public — sempre em storage/vision/refs/.
// Embeddings e índice ficam em data/vision/*.json.
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
export const VISION_DATA_DIR = path.join(ROOT, 'data', 'vision')
export const VISION_REFS_DIR = path.join(ROOT, 'storage', 'vision', 'refs')
export const VISION_MODELS_DIR = path.join(VISION_DATA_DIR, 'models')

const CONFIG_PATH = path.join(VISION_DATA_DIR, 'config.json')
const INDEX_PATH = path.join(VISION_DATA_DIR, 'index.json')
const REFS_PATH = path.join(VISION_DATA_DIR, 'references.json')
const BLOCKS_PATH = path.join(VISION_DATA_DIR, 'blocks.json')

const DEFAULT_CONFIG = {
  ativo: false,
  permitirCliente: false,
  exigirConsentimento: true,
  engine: 'manual',           // 'manual' | 'face-api-local' | 'ocr-tesseract' | 'external'
  externoConfigurado: false,  // só vira true quando admin completa o setup
  externoEndpoint: null,
  externoNome: null,
  similarityThreshold: 0.6,
  numericPattern: '\\b\\d{1,4}\\b',
  registrarLog: true,
  ultimaAlteracaoEm: null,
}

function ensureDirs() {
  if (!fs.existsSync(VISION_DATA_DIR)) fs.mkdirSync(VISION_DATA_DIR, { recursive: true })
  if (!fs.existsSync(VISION_REFS_DIR)) fs.mkdirSync(VISION_REFS_DIR, { recursive: true })
  if (!fs.existsSync(VISION_MODELS_DIR)) fs.mkdirSync(VISION_MODELS_DIR, { recursive: true })
}

function readJsonOrDefault(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback
    const raw = fs.readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw || (Array.isArray(fallback) ? '[]' : '{}'))
    return parsed ?? fallback
  } catch { return fallback }
}

function writeJsonAtomic(p, data) {
  ensureDirs()
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
}

// CONFIG
export function readVisionConfig() {
  return { ...DEFAULT_CONFIG, ...readJsonOrDefault(CONFIG_PATH, DEFAULT_CONFIG) }
}

export function writeVisionConfig(patch) {
  const current = readVisionConfig()
  const next = { ...current, ...patch, ultimaAlteracaoEm: new Date().toISOString() }
  writeJsonAtomic(CONFIG_PATH, next)
  return next
}

// INDEX (fotos indexadas)
export function readVisionIndex() {
  const arr = readJsonOrDefault(INDEX_PATH, [])
  return Array.isArray(arr) ? arr : []
}

export function writeVisionIndex(rows) {
  writeJsonAtomic(INDEX_PATH, Array.isArray(rows) ? rows : [])
}

export function upsertIndexEntry(entry) {
  const all = readVisionIndex()
  const idx = all.findIndex(e => e.photoId === entry.photoId)
  if (idx === -1) all.push(entry)
  else all[idx] = { ...all[idx], ...entry }
  writeVisionIndex(all)
  return entry
}

export function findIndexByPhotoId(photoId) {
  return readVisionIndex().find(e => e.photoId === photoId) || null
}

export function findIndexByEvent(eventId) {
  return readVisionIndex().filter(e => e.eventId === eventId)
}

export function deleteIndexEntries({ photoIds = [], eventId = null }) {
  const all = readVisionIndex()
  const remove = new Set(photoIds)
  const next = all.filter(e =>
    !remove.has(e.photoId) && (eventId ? e.eventId !== eventId : true)
  )
  writeVisionIndex(next)
  return all.length - next.length
}

// REFERENCES
export function readReferences() {
  const arr = readJsonOrDefault(REFS_PATH, [])
  return Array.isArray(arr) ? arr : []
}

export function writeReferences(rows) {
  writeJsonAtomic(REFS_PATH, Array.isArray(rows) ? rows : [])
}

export function appendReference(ref) {
  const all = readReferences()
  all.push(ref)
  writeReferences(all)
  return ref
}

export function deleteReference(id) {
  const all = readReferences()
  const target = all.find(r => r.id === id)
  if (!target) return null
  // Remove arquivo de imagem
  if (target.filename) {
    try {
      const owner = target.ownerType === 'admin' ? '__admin' : (target.ownerId || '__unknown')
      const fp = path.join(VISION_REFS_DIR, owner, target.filename)
      if (fs.existsSync(fp)) fs.unlinkSync(fp)
    } catch {}
  }
  writeReferences(all.filter(r => r.id !== id))
  return target
}

export function findReferenceById(id) {
  return readReferences().find(r => r.id === id) || null
}

export function listReferencesForOwner({ ownerId, ownerType = 'client' }) {
  return readReferences().filter(r => r.ownerType === ownerType && r.ownerId === ownerId)
}

export function getReferenceFileAbsPath({ ownerId, ownerType, filename }) {
  ensureDirs()
  const safeOwner = ownerType === 'admin' ? '__admin' : String(ownerId || '__unknown').replace(/[^a-zA-Z0-9._-]/g, '_')
  const dir = path.join(VISION_REFS_DIR, safeOwner)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const safeName = String(filename || '').replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(dir, safeName)
}

// BLOCKS (solicitações de remoção/omissão)
export function readBlocks() {
  const arr = readJsonOrDefault(BLOCKS_PATH, [])
  return Array.isArray(arr) ? arr : []
}

export function writeBlocks(rows) {
  writeJsonAtomic(BLOCKS_PATH, Array.isArray(rows) ? rows : [])
}

export function appendBlock(block) {
  const all = readBlocks()
  all.push(block)
  writeBlocks(all)
  return block
}

export function updateBlock(id, patch) {
  const all = readBlocks()
  const idx = all.findIndex(b => b.id === id)
  if (idx === -1) return null
  all[idx] = { ...all[idx], ...patch }
  writeBlocks(all)
  return all[idx]
}

// Lista de photoIds bloqueados/aprovados — usado para filtrar resultados de busca
export function getBlockedPhotoIds() {
  return new Set(
    readBlocks()
      .filter(b => b.status === 'aprovado' && b.escopo === 'foto')
      .map(b => b.fotoId)
      .filter(Boolean)
  )
}

ensureDirs()
