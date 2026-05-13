// src/lib/storage/config.js
// Configuração de storage externo (S3-compatível). Lê e escreve em
// data/config.json sob a chave "storageExterno".
//
// Default: { ativo: false } → comportamento legado (apenas FS local).

import { readConfig, writeConfig } from '../config'

const DEFAULTS = {
  ativo: false,
  provider: 'r2',                // 'r2' | 's3' | 'minio' | 'b2' | 'custom'
  endpoint: '',                  // ex: https://<accountid>.r2.cloudflarestorage.com
  region: 'auto',                // 'auto' p/ R2, 'us-east-1' p/ S3, etc.
  bucket: '',
  accessKeyId: '',               // armazenado em texto — apenas para uso local. Em produção, usar .env
  secretAccessKey: '',
  publicBaseUrl: '',             // base CDN para derivadas públicas. Ex: https://cdn.exemplo.com
  pathStyle: false,              // true p/ MinIO; false p/ R2/S3
  mirrorOnUpload: true,          // copia novos arquivos pro bucket após upload
  preferExternalForReads: false, // se true, lê derivadas/originais do S3 antes do local
  signedUrlTtlSeconds: 900,      // 15min
  ultimaConfiguracaoEm: null,
}

const SECRET_KEYS = new Set(['accessKeyId', 'secretAccessKey'])

export function getStorageConfig() {
  const cfg = readConfig() || {}
  const raw = cfg.storageExterno || {}
  return { ...DEFAULTS, ...raw }
}

export function setStorageConfig(patch) {
  const cfg = readConfig() || {}
  const current = { ...DEFAULTS, ...(cfg.storageExterno || {}) }
  const next = { ...current, ...patch, ultimaConfiguracaoEm: new Date().toISOString() }
  writeConfig({ ...cfg, storageExterno: next })
  return next
}

// Versão "pública" sem segredos — para retornar em GET /api/storage/config
export function publicStorageConfig(s = getStorageConfig()) {
  const out = { ...s }
  for (const k of SECRET_KEYS) {
    if (out[k]) out[k] = '••••••' // mascarado
  }
  return out
}

export function isExternalEnabled() {
  const s = getStorageConfig()
  if (!s.ativo) return false
  if (!s.bucket || !s.endpoint || !s.accessKeyId || !s.secretAccessKey) return false
  return true
}

export function getPublicCdnBase() {
  const s = getStorageConfig()
  return s.publicBaseUrl ? String(s.publicBaseUrl).replace(/\/+$/, '') : null
}

export function validateStorageConfig(input) {
  const errors = []
  if (input.ativo) {
    if (!input.endpoint) errors.push('endpoint obrigatório quando ativo.')
    if (!input.bucket) errors.push('bucket obrigatório quando ativo.')
    if (!input.accessKeyId) errors.push('accessKeyId obrigatório quando ativo.')
    if (!input.secretAccessKey) errors.push('secretAccessKey obrigatório quando ativo.')
    if (input.endpoint && !/^https?:\/\//i.test(input.endpoint)) errors.push('endpoint deve começar com http(s)://')
    if (input.publicBaseUrl && !/^https?:\/\//i.test(input.publicBaseUrl)) errors.push('publicBaseUrl deve começar com http(s)://')
  }
  const ttl = Number(input.signedUrlTtlSeconds)
  if (input.signedUrlTtlSeconds !== undefined && (!Number.isFinite(ttl) || ttl < 60 || ttl > 7 * 24 * 3600)) {
    errors.push('signedUrlTtlSeconds deve estar entre 60 e 604800.')
  }
  return errors
}
