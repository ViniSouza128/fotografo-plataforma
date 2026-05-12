// src/lib/pedidos.js
// Leitura e escrita de pedidos no JSON local

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { useDb } from './db/router'
import { pedidosRepo } from './db/repositories'

const DATA_PATH = path.join(process.cwd(), 'data', 'pedidos.json')
export const PAYMENT_LINK_TTL_MS = 48 * 60 * 60 * 1000

function ensureFile() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, '[]', 'utf-8')
  }
}

export function readPedidos() {
  if (useDb()) return pedidosRepo.readAll()
  ensureFile()
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'))
}

export function writePedidos(pedidos) {
  if (useDb()) { pedidosRepo.writeAll(pedidos); return }
  fs.writeFileSync(DATA_PATH, JSON.stringify(pedidos, null, 2), 'utf-8')
}

export function getPaymentExpiresAt(baseDate = new Date()) {
  return new Date(baseDate.getTime() + PAYMENT_LINK_TTL_MS).toISOString()
}

export function getPedidoPaymentAttempts(pedido) {
  return Array.isArray(pedido?.pagamentoTentativas) ? pedido.pagamentoTentativas : []
}

export function getPedidoPhotoIds(pedidoOrItems) {
  const items = Array.isArray(pedidoOrItems)
    ? pedidoOrItems
    : (Array.isArray(pedidoOrItems?.itens) ? pedidoOrItems.itens : pedidoOrItems?.items || [])
  return items
    .map(item => item?.photoId || item?.id)
    .filter(Boolean)
    .sort()
}

export function haveSamePedidoPhotos(a, b) {
  const left = getPedidoPhotoIds(a)
  const right = getPedidoPhotoIds(b)
  if (left.length !== right.length) return false
  return left.every((id, index) => id === right[index])
}

export function isPaymentLinkExpired(pedido, now = new Date()) {
  if (!pedido?.paymentExpiresAt) return false
  const expiresAt = new Date(pedido.paymentExpiresAt)
  if (Number.isNaN(expiresAt.getTime())) return false
  return expiresAt.getTime() < now.getTime()
}

export function appendPaymentAttempt(pedido, attempt) {
  const current = getPedidoPaymentAttempts(pedido)
  const nextAttempt = {
    id: crypto.randomUUID(),
    criadoEm: new Date().toISOString(),
    ...attempt,
  }
  pedido.pagamentoTentativas = [nextAttempt, ...current].slice(0, 30)
  return nextAttempt
}
