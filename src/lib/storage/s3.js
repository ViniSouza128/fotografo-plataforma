// src/lib/storage/s3.js
// Cliente S3-compatível com singleton + helpers de upload/get/delete/sign.
// Carregamento dinâmico do AWS SDK para não bundlar quando não usado.

import { getStorageConfig, isExternalEnabled } from './config'

let _client = null
let _clientFingerprint = null

function fingerprintConfig(s) {
  return [s.endpoint, s.region, s.bucket, s.accessKeyId, s.pathStyle ? 'p' : 'v'].join('|')
}

async function loadSdk() {
  const sdk = await import('@aws-sdk/client-s3')
  const presigner = await import('@aws-sdk/s3-request-presigner')
  return { sdk, presigner }
}

async function getClient() {
  if (!isExternalEnabled()) return null
  const s = getStorageConfig()
  const fp = fingerprintConfig(s)
  if (_client && _clientFingerprint === fp) return { client: _client, cfg: s }
  const { sdk } = await loadSdk()
  _client = new sdk.S3Client({
    region: s.region || 'auto',
    endpoint: s.endpoint,
    forcePathStyle: !!s.pathStyle,
    credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey },
  })
  _clientFingerprint = fp
  return { client: _client, cfg: s }
}

export function resetClient() {
  _client = null; _clientFingerprint = null
}

// ---------- Operações ----------
export async function putObject({ key, body, contentType, acl = null, cacheControl = null }) {
  const ctx = await getClient(); if (!ctx) return { ok: false, reason: 'disabled' }
  const { sdk } = await loadSdk()
  const params = { Bucket: ctx.cfg.bucket, Key: key, Body: body, ContentType: contentType || 'application/octet-stream' }
  if (acl) params.ACL = acl
  if (cacheControl) params.CacheControl = cacheControl
  await ctx.client.send(new sdk.PutObjectCommand(params))
  return { ok: true, key }
}

export async function headObject(key) {
  const ctx = await getClient(); if (!ctx) return null
  const { sdk } = await loadSdk()
  try {
    const out = await ctx.client.send(new sdk.HeadObjectCommand({ Bucket: ctx.cfg.bucket, Key: key }))
    return { exists: true, contentLength: Number(out.ContentLength) || null, contentType: out.ContentType || null }
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return { exists: false }
    throw err
  }
}

export async function getObjectStream(key) {
  const ctx = await getClient(); if (!ctx) return null
  const { sdk } = await loadSdk()
  const out = await ctx.client.send(new sdk.GetObjectCommand({ Bucket: ctx.cfg.bucket, Key: key }))
  return { body: out.Body, contentType: out.ContentType, contentLength: Number(out.ContentLength) || null }
}

export async function getObjectBuffer(key) {
  const obj = await getObjectStream(key); if (!obj) return null
  const chunks = []
  for await (const chunk of obj.body) chunks.push(chunk)
  return { buffer: Buffer.concat(chunks), contentType: obj.contentType }
}

export async function deleteObject(key) {
  const ctx = await getClient(); if (!ctx) return { ok: false, reason: 'disabled' }
  const { sdk } = await loadSdk()
  await ctx.client.send(new sdk.DeleteObjectCommand({ Bucket: ctx.cfg.bucket, Key: key }))
  return { ok: true }
}

export async function getSignedDownloadUrl(key, { ttlSeconds = null, downloadName = null } = {}) {
  const ctx = await getClient(); if (!ctx) return null
  const { sdk } = await loadSdk()
  const { presigner } = await loadSdk()
  const ttl = Number(ttlSeconds || ctx.cfg.signedUrlTtlSeconds || 900)
  const params = { Bucket: ctx.cfg.bucket, Key: key }
  if (downloadName) {
    const safe = String(downloadName).replace(/[^a-zA-Z0-9._-]/g, '_')
    params.ResponseContentDisposition = `attachment; filename="${safe}"`
  }
  const cmd = new sdk.GetObjectCommand(params)
  return presigner.getSignedUrl(ctx.client, cmd, { expiresIn: ttl })
}

// ---------- Test connection ----------
export async function testConnection() {
  if (!isExternalEnabled()) return { ok: false, reason: 'desabilitado ou config incompleta' }
  const testKey = `__healthcheck/${Date.now()}.txt`
  const body = Buffer.from(`storage-check ${new Date().toISOString()}`, 'utf-8')
  try {
    await putObject({ key: testKey, body, contentType: 'text/plain' })
    const head = await headObject(testKey)
    if (!head?.exists) throw new Error('PUT ok mas HEAD não localizou objeto.')
    await deleteObject(testKey).catch(() => {})
    return { ok: true, sample: testKey }
  } catch (err) {
    return { ok: false, reason: err?.message || 'erro desconhecido', code: err?.Code || err?.name || null }
  }
}

// ---------- Listagem (para migração) ----------
export async function listObjects(prefix = '', { continuationToken = null, max = 1000 } = {}) {
  const ctx = await getClient(); if (!ctx) return null
  const { sdk } = await loadSdk()
  const out = await ctx.client.send(new sdk.ListObjectsV2Command({
    Bucket: ctx.cfg.bucket, Prefix: prefix || undefined,
    MaxKeys: max, ContinuationToken: continuationToken || undefined,
  }))
  return {
    keys: (out.Contents || []).map(c => ({ key: c.Key, size: c.Size, etag: c.ETag })),
    nextToken: out.IsTruncated ? out.NextContinuationToken : null,
  }
}
