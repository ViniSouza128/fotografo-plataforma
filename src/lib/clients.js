import fs from 'fs'
import path from 'path'
import { useDb } from './db/router'
import { clientsRepo } from './db/repositories'
import { DATA_DIR, ensureRuntimeDirs } from './runtimePaths'

const CLIENTS_PATH = path.join(DATA_DIR, 'clients.json')

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function normalizeWhatsapp(value) {
  return String(value || '').replace(/\D/g, '')
}

export function stripClientSecrets(client) {
  if (!client) return null
  const { senha, resetToken, token, ...safeClient } = client
  return safeClient
}

export function readClients() {
  if (useDb()) return clientsRepo.readAll()
  if (!fs.existsSync(CLIENTS_PATH)) {
    ensureRuntimeDirs()
    fs.writeFileSync(CLIENTS_PATH, '[]')
    return []
  }
  return JSON.parse(fs.readFileSync(CLIENTS_PATH, 'utf-8'))
}

export function writeClients(clients) {
  if (useDb()) { clientsRepo.writeAll(clients); return }
  ensureRuntimeDirs()
  fs.writeFileSync(CLIENTS_PATH, JSON.stringify(clients, null, 2), 'utf-8')
}

export function findClientByEmail(email) {
  const normalized = normalizeEmail(email)
  return readClients().find(c => normalizeEmail(c.email) === normalized)
}

export function findClientByCPF(cpf) {
  const limpo = cpf.replace(/\D/g, '')
  return readClients().find(c => c.cpf === limpo)
}

export function findClientById(id) {
  return readClients().find(c => c.id === id)
}

export function findClientByWhatsapp(whatsapp) {
  const normalized = normalizeWhatsapp(whatsapp)
  if (!normalized) return null
  return readClients().find(c => normalizeWhatsapp(c.whatsapp) === normalized)
}
