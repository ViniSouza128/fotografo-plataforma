// src/lib/jobsQueue.js
// Fila de jobs persistida em data/jobs.json. Worker único in-process processa
// jobs em segundo plano (geração de derivadas, poster de vídeo e preview com
// marca d'água via ffmpeg). Após reinício do servidor, jobs em estado
// "processing" voltam a "pending" para serem retomados.
//
// Tipos de job suportados:
//   - photo-derivatives: gera grid/thumbs/mini para uma foto recém criada
//   - video-poster: gera poster (clean + wm) de um vídeo
//   - video-preview-wm: gera o MP4 de preview com marca d'água via ffmpeg
//
// O worker é lazy: só inicia quando o primeiro job é enfileirado ou quando
// `bootstrapJobsQueue()` é chamado.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, 'data')
const JOBS_PATH = path.join(DATA_DIR, 'jobs.json')

const STATUS_PENDING = 'pending'
const STATUS_PROCESSING = 'processing'
const STATUS_FAILED = 'failed'

const MAX_ATTEMPTS = 3
const FAILED_RETENTION_MS = 24 * 60 * 60 * 1000 // 24h
const POLL_INTERVAL_MS = 750
const PROCESS_RETRY_DELAY_MS = 5_000

let _workerStarted = false
let _bootstrapped = false
let _processing = false
let _wakeUpTimer = null

const _processors = new Map()

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readJobsRaw() {
  try {
    if (!fs.existsSync(JOBS_PATH)) return []
    const raw = fs.readFileSync(JOBS_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeJobsRaw(jobs) {
  ensureDataDir()
  // Escreve em arquivo temporário e renomeia para evitar corrupção em crash.
  const tmp = JOBS_PATH + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), 'utf-8')
  fs.renameSync(tmp, JOBS_PATH)
}

function makeJob(type, payload) {
  return {
    id: crypto.randomUUID(),
    type,
    status: STATUS_PENDING,
    payload: payload || {},
    attempts: 0,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    lastError: null,
  }
}

export function registerJobProcessor(type, fn) {
  if (typeof fn !== 'function') throw new Error('processor deve ser função')
  _processors.set(type, fn)
}

export function listJobs({ statuses = null, type = null } = {}) {
  const jobs = readJobsRaw()
  return jobs.filter(j => {
    if (statuses && !statuses.includes(j.status)) return false
    if (type && j.type !== type) return false
    return true
  })
}

export function getJobsStats() {
  const jobs = readJobsRaw()
  const stats = { total: jobs.length, pending: 0, processing: 0, failed: 0 }
  for (const j of jobs) {
    if (j.status === STATUS_PENDING) stats.pending += 1
    else if (j.status === STATUS_PROCESSING) stats.processing += 1
    else if (j.status === STATUS_FAILED) stats.failed += 1
  }
  return stats
}

function withJobs(mutator) {
  // Atualização atômica simples: lê, muta, escreve.
  // Em servidor single-process do Next isso é suficiente.
  const jobs = readJobsRaw()
  const result = mutator(jobs)
  writeJobsRaw(jobs)
  return result
}

export function enqueueJob(type, payload, { dedupeKey = null } = {}) {
  if (!type) throw new Error('type obrigatório')
  bootstrapJobsQueue()

  const created = withJobs((jobs) => {
    if (dedupeKey) {
      const exists = jobs.find(j =>
        j.type === type
        && j.status !== STATUS_FAILED
        && j.payload?.dedupeKey === dedupeKey
      )
      if (exists) return exists
    }
    const job = makeJob(type, dedupeKey ? { ...payload, dedupeKey } : payload)
    jobs.push(job)
    return job
  })

  scheduleWakeUp()
  return created
}

function scheduleWakeUp(delayMs = 0) {
  if (_wakeUpTimer) return
  _wakeUpTimer = setTimeout(() => {
    _wakeUpTimer = null
    pumpWorker().catch((err) => {
      console.error('[jobsQueue] worker error:', err)
    })
  }, Math.max(0, delayMs))
}

function pickNextPending(jobs) {
  return jobs.find(j => j.status === STATUS_PENDING) || null
}

async function pumpWorker() {
  if (_processing) return
  _processing = true
  try {
    while (true) {
      let job = null
      withJobs((jobs) => {
        job = pickNextPending(jobs)
        if (!job) return
        // Marca como processing
        const idx = jobs.findIndex(j => j.id === job.id)
        if (idx !== -1) {
          jobs[idx] = {
            ...jobs[idx],
            status: STATUS_PROCESSING,
            startedAt: new Date().toISOString(),
            attempts: (jobs[idx].attempts || 0) + 1,
          }
          job = jobs[idx]
        }
      })

      if (!job) break

      const processor = _processors.get(job.type)
      if (!processor) {
        markJobFailed(job.id, `Sem processor registrado para tipo "${job.type}"`)
        continue
      }

      try {
        await processor(job)
        // Sucesso → remove job
        withJobs((jobs) => {
          const idx = jobs.findIndex(j => j.id === job.id)
          if (idx !== -1) jobs.splice(idx, 1)
        })
      } catch (err) {
        const msg = String(err?.message || err)
        const tooManyAttempts = (job.attempts || 0) >= MAX_ATTEMPTS
        if (tooManyAttempts) {
          markJobFailed(job.id, msg)
        } else {
          // Volta para pending, com pequeno atraso
          withJobs((jobs) => {
            const idx = jobs.findIndex(j => j.id === job.id)
            if (idx !== -1) {
              jobs[idx] = {
                ...jobs[idx],
                status: STATUS_PENDING,
                lastError: msg,
              }
            }
          })
          scheduleWakeUp(PROCESS_RETRY_DELAY_MS)
          // Não enfileirar mais agora; sai do loop e deixa o agendado retomar
          break
        }
      }
    }
  } finally {
    _processing = false
  }
}

function markJobFailed(jobId, errorMsg) {
  withJobs((jobs) => {
    const idx = jobs.findIndex(j => j.id === jobId)
    if (idx === -1) return
    jobs[idx] = {
      ...jobs[idx],
      status: STATUS_FAILED,
      lastError: errorMsg || jobs[idx].lastError || 'erro desconhecido',
      completedAt: new Date().toISOString(),
    }
  })
}

function pruneOldFailed() {
  const cutoff = Date.now() - FAILED_RETENTION_MS
  withJobs((jobs) => {
    for (let i = jobs.length - 1; i >= 0; i--) {
      const j = jobs[i]
      if (j.status !== STATUS_FAILED) continue
      const t = j.completedAt ? Date.parse(j.completedAt) : 0
      if (t > 0 && t < cutoff) jobs.splice(i, 1)
    }
  })
}

export function resetStuckProcessingJobs() {
  // Após reinício: jobs em "processing" voltam para "pending" para retentativa.
  let reset = 0
  withJobs((jobs) => {
    for (let i = 0; i < jobs.length; i++) {
      if (jobs[i].status === STATUS_PROCESSING) {
        jobs[i] = {
          ...jobs[i],
          status: STATUS_PENDING,
          startedAt: null,
          lastError: 'Reset após reinício do servidor',
        }
        reset += 1
      }
    }
  })
  return reset
}

export function bootstrapJobsQueue() {
  if (_bootstrapped) return
  _bootstrapped = true
  ensureDataDir()
  resetStuckProcessingJobs()
  pruneOldFailed()
  if (!_workerStarted) {
    _workerStarted = true
    // Polling longo para acordar o worker se algum job ficar pendente
    // (ex.: foi restaurado do disco mas não foi reenfileirado nesta sessão)
    setInterval(() => {
      const stats = getJobsStats()
      if (stats.pending > 0) scheduleWakeUp()
    }, 30_000).unref?.()
  }
  scheduleWakeUp()
}

export function retryFailedJob(jobId) {
  let updated = null
  withJobs((jobs) => {
    const idx = jobs.findIndex(j => j.id === jobId)
    if (idx === -1) return
    jobs[idx] = {
      ...jobs[idx],
      status: STATUS_PENDING,
      attempts: 0,
      lastError: null,
      completedAt: null,
    }
    updated = jobs[idx]
  })
  if (updated) scheduleWakeUp()
  return updated
}

export function cancelJob(jobId) {
  withJobs((jobs) => {
    const idx = jobs.findIndex(j => j.id === jobId)
    if (idx !== -1) jobs.splice(idx, 1)
  })
}
