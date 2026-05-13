// src/lib/storage/index.js
// Fachada principal de storage. Resolve URLs/paths para originais e derivadas
// dispatchando entre local e S3 (com fallback).
//
// Mantém local como source-of-truth: writes vão sempre para FS local + (se ligado)
// espelham assincronamente para o bucket. Reads preferem local, com fallback S3.

import path from 'path'
import fs from 'fs'
import { getStorageConfig, isExternalEnabled, getPublicCdnBase } from './config'
import { putObject, getSignedDownloadUrl, headObject, getObjectBuffer } from './s3'

const ROOT = process.cwd()

// ---------- Chaves S3 (mesma estrutura do FS) ----------
function originalKey({ eventId, filename }) {
  const bucket = String(eventId || '__unassigned').replace(/[^a-zA-Z0-9._-]/g, '_')
  const safe = String(filename || '').replace(/[^a-zA-Z0-9._-]/g, '_')
  return `originals/${bucket}/${safe}`
}

function derivativeKey({ kind, watermark, filename }) {
  const safe = String(filename || '').replace(/[^a-zA-Z0-9._-]/g, '_')
  return `uploads/${kind}/${watermark}/${safe}`
}

// ---------- URL pública (via CDN) ----------
export function getPublicDerivativeUrl(relativePath) {
  if (!relativePath) return null
  // No formato local: relativePath é "kind/watermark/filename" sob /uploads/
  const cdn = getPublicCdnBase()
  if (cdn) return `${cdn}/uploads/${String(relativePath).replace(/^\/+/, '')}`
  return `/uploads/${String(relativePath).replace(/^\/+/, '')}`
}

// ---------- Mirror após upload (fire-and-forget) ----------
export async function mirrorOriginalToExternal({ eventId, filename, absolutePath, contentType }) {
  if (!isExternalEnabled()) return { ok: false, reason: 'disabled' }
  const cfg = getStorageConfig()
  if (!cfg.mirrorOnUpload) return { ok: false, reason: 'mirror_off' }
  try {
    const buffer = await fs.promises.readFile(absolutePath)
    const key = originalKey({ eventId, filename })
    await putObject({ key, body: buffer, contentType: contentType || 'application/octet-stream' })
    return { ok: true, key }
  } catch (err) {
    console.error('[storage] mirror original falhou:', err.message)
    return { ok: false, reason: err.message }
  }
}

export async function mirrorDerivativeToExternal({ kind, watermark, filename, absolutePath, contentType, cacheControl = 'public, max-age=31536000, immutable' }) {
  if (!isExternalEnabled()) return { ok: false, reason: 'disabled' }
  const cfg = getStorageConfig()
  if (!cfg.mirrorOnUpload) return { ok: false, reason: 'mirror_off' }
  try {
    const buffer = await fs.promises.readFile(absolutePath)
    const key = derivativeKey({ kind, watermark, filename })
    await putObject({
      key, body: buffer,
      contentType: contentType || 'image/jpeg',
      acl: 'public-read',
      cacheControl,
    })
    return { ok: true, key }
  } catch (err) {
    console.error('[storage] mirror derivative falhou:', err.message)
    return { ok: false, reason: err.message }
  }
}

// ---------- Resolução de leitura (download autorizado) ----------
// Retorna { mode: 'local', absolutePath } ou { mode: 'signed', url }.
// Caller decide como entregar.
export async function resolveOriginalForDownload({ eventId, filename, absolutePathLocal, downloadName = null }) {
  // Se admin priorizou external para reads OU local não existe e external está ligado:
  const cfg = getStorageConfig()
  const localExists = absolutePathLocal && fs.existsSync(absolutePathLocal)
  if (isExternalEnabled() && (cfg.preferExternalForReads || !localExists)) {
    try {
      const key = originalKey({ eventId, filename })
      const head = await headObject(key)
      if (head?.exists) {
        const url = await getSignedDownloadUrl(key, { downloadName, ttlSeconds: cfg.signedUrlTtlSeconds })
        if (url) return { mode: 'signed', url }
      }
    } catch (err) {
      console.warn('[storage] fallback S3 falhou, tentando local:', err.message)
    }
  }
  if (localExists) return { mode: 'local', absolutePath: absolutePathLocal }
  // Última tentativa: S3 mesmo se preferExternal estiver desligado
  if (isExternalEnabled()) {
    try {
      const key = originalKey({ eventId, filename })
      const head = await headObject(key)
      if (head?.exists) {
        const url = await getSignedDownloadUrl(key, { downloadName, ttlSeconds: cfg.signedUrlTtlSeconds })
        if (url) return { mode: 'signed', url }
      }
    } catch {}
  }
  return { mode: 'missing' }
}

// Para fetch direto (ex: regenerar derivadas a partir do original que mora no S3)
export async function fetchOriginalAsBuffer({ eventId, filename, absolutePathLocal }) {
  if (absolutePathLocal && fs.existsSync(absolutePathLocal)) {
    return await fs.promises.readFile(absolutePathLocal)
  }
  if (isExternalEnabled()) {
    const key = originalKey({ eventId, filename })
    const obj = await getObjectBuffer(key).catch(() => null)
    if (obj?.buffer) return obj.buffer
  }
  return null
}

// ---------- Helpers para a UI ----------
export function getDerivativeUrl({ kind, watermark, filename }) {
  // Tenta CDN; cai para /uploads/ local
  const cdn = getPublicCdnBase()
  const safe = String(filename || '').replace(/[^a-zA-Z0-9._-]/g, '_')
  if (cdn) return `${cdn}/uploads/${kind}/${watermark}/${safe}`
  return `/uploads/${kind}/${watermark}/${safe}`
}

export { originalKey, derivativeKey }
