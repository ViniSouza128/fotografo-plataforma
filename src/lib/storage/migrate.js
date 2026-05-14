// src/lib/storage/migrate.js
// Lógica principal de migração local → bucket externo. Idempotente: se o objeto
// já existir no bucket (HEAD ok) e tiver tamanho igual, é pulado.

import fs from 'fs'
import path from 'path'
import { putObject, headObject } from './s3'
import { isExternalEnabled } from './config'
import { readMigrationState, writeMigrationState, resetMigrationState } from './migrationState'
import { STORAGE_DIR, UPLOADS_DIR } from '../runtimePaths'

const ORIGINALS_DIR = path.join(STORAGE_DIR, 'originals')

function* walk(dir) {
  if (!fs.existsSync(dir)) return
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    let entries
    try { entries = fs.readdirSync(cur, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      const full = path.join(cur, entry.name)
      if (entry.isDirectory()) {
        // Não migrar lixeira ou pastas legadas de uso interno
        if (entry.name === 'trash' || entry.name === 'migrations') continue
        if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue
        stack.push(full)
      } else if (entry.isFile()) {
        if (entry.name.startsWith('.')) continue
        yield full
      }
    }
  }
}

function originalKeyFromPath(absPath) {
  const rel = path.relative(ORIGINALS_DIR, absPath).replace(/\\/g, '/')
  // Aceita "{eventId}/{filename}" e "{eventId}/videos/{filename}" etc.
  return `originals/${rel}`
}

function derivativeKeyFromPath(absPath) {
  const rel = path.relative(UPLOADS_DIR, absPath).replace(/\\/g, '/')
  return `uploads/${rel}`
}

function contentTypeFor(filename) {
  const ext = (path.extname(filename) || '').toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.mp4') return 'video/mp4'
  return 'application/octet-stream'
}

async function shouldUpload(key, localSize) {
  try {
    const head = await headObject(key)
    if (!head?.exists) return true
    if (head.contentLength != null && Number(head.contentLength) === Number(localSize)) return false
    return true
  } catch { return true }
}

export async function runMigration({ onlyOriginals = false, onlyDerivatives = false } = {}) {
  if (!isExternalEnabled()) {
    return { ok: false, reason: 'storage_externo_desativado' }
  }
  if (readMigrationState().running) {
    return { ok: false, reason: 'ja_em_execucao' }
  }
  resetMigrationState()
  writeMigrationState({ running: true, startedAt: new Date().toISOString(), fase: 'discover' })

  const originals = []
  const derivatives = []
  if (!onlyDerivatives) for (const f of walk(ORIGINALS_DIR)) originals.push(f)
  if (!onlyOriginals) for (const f of walk(UPLOADS_DIR)) derivatives.push(f)

  const total = originals.length + derivatives.length
  writeMigrationState({ totalDescobertos: total })

  let enviados = 0, erros = 0, ultimaErroMsg = null

  // Originais (privados)
  if (originals.length > 0) {
    writeMigrationState({ fase: 'originals' })
    for (const abs of originals) {
      try {
        const stat = fs.statSync(abs)
        const key = originalKeyFromPath(abs)
        const need = await shouldUpload(key, stat.size)
        if (need) {
          const buf = await fs.promises.readFile(abs)
          await putObject({ key, body: buf, contentType: contentTypeFor(abs) })
        }
        enviados++
      } catch (err) {
        erros++; ultimaErroMsg = err.message
      }
      if (enviados % 10 === 0 || erros > 0) {
        writeMigrationState({ totalEnviados: enviados, totalErros: erros, ultimaErroMsg, ultimoArquivo: path.basename(abs) })
      }
    }
  }

  // Derivadas (públicas, com Cache-Control)
  if (derivatives.length > 0) {
    writeMigrationState({ fase: 'derivatives' })
    for (const abs of derivatives) {
      try {
        const stat = fs.statSync(abs)
        const key = derivativeKeyFromPath(abs)
        const need = await shouldUpload(key, stat.size)
        if (need) {
          const buf = await fs.promises.readFile(abs)
          await putObject({
            key, body: buf,
            contentType: contentTypeFor(abs),
            acl: 'public-read',
            cacheControl: 'public, max-age=31536000, immutable',
          })
        }
        enviados++
      } catch (err) {
        erros++; ultimaErroMsg = err.message
      }
      if (enviados % 25 === 0 || erros > 0) {
        writeMigrationState({ totalEnviados: enviados, totalErros: erros, ultimaErroMsg, ultimoArquivo: path.basename(abs) })
      }
    }
  }

  writeMigrationState({
    running: false,
    finishedAt: new Date().toISOString(),
    totalEnviados: enviados,
    totalErros: erros,
    ultimaErroMsg,
    fase: erros > 0 ? 'error' : 'done',
  })

  return { ok: erros === 0, total, enviados, erros, ultimaErroMsg }
}
