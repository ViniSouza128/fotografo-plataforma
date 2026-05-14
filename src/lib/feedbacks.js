import fs from 'fs'
import path from 'path'
import { useDb } from './db/router'
import { feedbacksRepo } from './db/repositories'
import { DATA_DIR, ensureRuntimeDirs } from './runtimePaths'

const FILE_PATH = path.join(DATA_DIR, 'feedbacks.json')

function ensureFile() {
  if (!fs.existsSync(FILE_PATH)) {
    ensureRuntimeDirs()
    fs.writeFileSync(FILE_PATH, '[]', 'utf-8')
  }
}

export function getFeedbackOrderId(item) {
  return item?.orderId || item?.pedidoId || null
}

export function getFeedbackUserId(item) {
  return item?.userId || item?.clientId || null
}

export function normalizeFeedback(item = {}) {
  const orderId = getFeedbackOrderId(item)
  const userId = getFeedbackUserId(item)
  const comment = item.comment ?? item.texto ?? null
  const createdAt = item.createdAt || item.criadoEm || null
  const updatedAt = item.updatedAt || item.atualizadoEm || createdAt || null

  return {
    id: item.id || crypto.randomUUID(),
    orderId,
    pedidoId: orderId,
    userId,
    clientId: userId,
    rating: Number(item.rating) || 0,
    comment,
    texto: comment,
    clienteNome: item.clienteNome || null,
    createdAt,
    criadoEm: createdAt,
    updatedAt,
    atualizadoEm: updatedAt,
  }
}

export function readFeedbacks() {
  if (useDb()) return feedbacksRepo.readAll().map(normalizeFeedback)
  ensureFile()
  const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'))
  if (!Array.isArray(raw)) return []
  return raw.map(item => normalizeFeedback(item))
}

export function writeFeedbacks(items) {
  if (useDb()) { feedbacksRepo.writeAll(items); return }
  ensureFile()
  ensureRuntimeDirs()
  fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2), 'utf-8')
}
