import fs from 'fs'
import path from 'path'
import { useDb } from './db/router'
import { photosRepo } from './db/repositories'
import { DATA_DIR, ensureRuntimeDirs } from './runtimePaths'

const LEGACY_DATA_PATH = path.join(DATA_DIR, 'photos.json')
const PHOTOS_DIR = path.join(DATA_DIR, 'photos')
const UNASSIGNED_BUCKET = '_unassigned'

const EVENT_BUCKET_REGEX = /^[a-zA-Z0-9._-]+$/

function ensureDir() {
  ensureRuntimeDirs()
  if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true })
}

function sanitizeBucket(value) {
  if (value === null || value === undefined) return UNASSIGNED_BUCKET
  const raw = String(value).trim()
  if (!raw) return UNASSIGNED_BUCKET
  if (raw === '.' || raw === '..') return UNASSIGNED_BUCKET
  if (!EVENT_BUCKET_REGEX.test(raw)) return UNASSIGNED_BUCKET
  return raw
}

function bucketFilePath(bucket) {
  return path.join(PHOTOS_DIR, `${bucket}.json`)
}

function readBucketFile(bucket) {
  const filePath = bucketFilePath(bucket)
  if (!fs.existsSync(filePath)) return []
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeBucketFile(bucket, photos) {
  ensureDir()
  const filePath = bucketFilePath(bucket)
  fs.writeFileSync(filePath, JSON.stringify(photos, null, 2), 'utf-8')
}

function listBucketFiles() {
  if (!fs.existsSync(PHOTOS_DIR)) return []
  try {
    return fs.readdirSync(PHOTOS_DIR)
      .filter(name => name.endsWith('.json'))
      .map(name => name.slice(0, -'.json'.length))
  } catch {
    return []
  }
}

function readLegacyMonolith() {
  if (!fs.existsSync(LEGACY_DATA_PATH)) return []
  try {
    const raw = fs.readFileSync(LEGACY_DATA_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readAllFromBuckets() {
  const buckets = listBucketFiles()
  if (buckets.length === 0) return null
  const all = []
  for (const bucket of buckets) {
    const items = readBucketFile(bucket)
    for (const item of items) all.push(item)
  }
  return all
}

function readPhotosJson() {
  ensureDir()
  const fromBuckets = readAllFromBuckets()
  if (fromBuckets !== null) return fromBuckets
  // Fallback: lê o arquivo monolítico antigo (compatibilidade pré-migração)
  return readLegacyMonolith()
}

function writePhotosJson(photos) {
  ensureDir()
  const list = Array.isArray(photos) ? photos : []
  const groups = new Map()
  for (const photo of list) {
    const bucket = sanitizeBucket(photo?.eventId)
    if (!groups.has(bucket)) groups.set(bucket, [])
    groups.get(bucket).push(photo)
  }
  const seen = new Set()
  for (const [bucket, items] of groups) {
    writeBucketFile(bucket, items)
    seen.add(bucket)
  }
  // Buckets sem fotos são removidos para manter o disco limpo
  for (const bucket of listBucketFiles()) {
    if (!seen.has(bucket)) {
      try { fs.unlinkSync(bucketFilePath(bucket)) } catch {}
    }
  }
  // Mantém um espelho do photos.json monolítico para integrações legadas/scripts
  try {
    fs.writeFileSync(LEGACY_DATA_PATH, JSON.stringify(list, null, 2), 'utf-8')
  } catch {}
}

export function readPhotos() {
  if (useDb()) return photosRepo.readAll()
  return readPhotosJson()
}

export function writePhotos(photos) {
  if (useDb()) {
    photosRepo.writeAll(photos)
    // Mirror para os arquivos por evento — mantém data/photos/<eventId>.json em sincronia
    try { writePhotosJson(photos) } catch (e) { /* mirror best-effort */ }
    return
  }
  writePhotosJson(photos)
}

export function readPhotosByEvent(eventId) {
  if (useDb()) {
    return photosRepo.readAll().filter(p => p?.eventId === eventId)
  }
  const bucket = sanitizeBucket(eventId)
  ensureDir()
  if (fs.existsSync(bucketFilePath(bucket))) {
    return readBucketFile(bucket)
  }
  // Fallback: pode estar no monolítico antigo
  return readPhotosJson().filter(p => p?.eventId === eventId)
}

export const PHOTOS_DATA_DIR = PHOTOS_DIR
export const PHOTOS_UNASSIGNED_BUCKET = UNASSIGNED_BUCKET
