// src/lib/chat.js
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { DATA_DIR, ensureRuntimeDirs } from './runtimePaths'

const CHAT_PATH = path.join(DATA_DIR, 'chat.json')
const MAX_MSG_PER_THREAD = 500
const MAX_TEXTO = 2000

function ensureDir() {
  ensureRuntimeDirs()
}

export function readChat() {
  try {
    if (!fs.existsSync(CHAT_PATH)) return []
    const raw = fs.readFileSync(CHAT_PATH, 'utf-8')
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function writeChat(data) {
  ensureDir()
  fs.writeFileSync(CHAT_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getOrCreateThread(clientId, clientNome) {
  const all = readChat()
  const existing = all.find(t => t.clientId === clientId)
  if (existing) return { all, thread: existing }
  const thread = {
    id: crypto.randomUUID(),
    clientId,
    clientNome: clientNome || '',
    mensagens: [],
    criadaEm: new Date().toISOString(),
    atualizadaEm: new Date().toISOString(),
  }
  all.push(thread)
  writeChat(all)
  return { all, thread }
}

export function appendMensagem(clientId, clientNome, { de, texto }) {
  let all = readChat()
  let idx = all.findIndex(t => t.clientId === clientId)
  if (idx === -1) {
    const thread = {
      id: crypto.randomUUID(),
      clientId,
      clientNome: clientNome || '',
      mensagens: [],
      criadaEm: new Date().toISOString(),
      atualizadaEm: new Date().toISOString(),
    }
    all.push(thread)
    idx = all.length - 1
  }
  const msg = {
    id: crypto.randomUUID(),
    de: de === 'admin' ? 'admin' : 'client',
    texto: String(texto || '').trim().slice(0, MAX_TEXTO),
    criadaEm: new Date().toISOString(),
    lidaPorAdmin: de === 'admin',
    lidaPorCliente: de === 'client',
  }
  all[idx].mensagens.push(msg)
  if (all[idx].mensagens.length > MAX_MSG_PER_THREAD) {
    all[idx].mensagens = all[idx].mensagens.slice(-MAX_MSG_PER_THREAD)
  }
  all[idx].atualizadaEm = new Date().toISOString()
  if (clientNome) all[idx].clientNome = clientNome
  writeChat(all)
  return { thread: all[idx], msg }
}

export function marcarLidasPorAdmin(clientId) {
  const all = readChat()
  const idx = all.findIndex(t => t.clientId === clientId)
  if (idx === -1) return false
  all[idx].mensagens.forEach(m => { m.lidaPorAdmin = true })
  writeChat(all)
  return true
}

export function marcarLidasPorCliente(clientId) {
  const all = readChat()
  const idx = all.findIndex(t => t.clientId === clientId)
  if (idx === -1) return false
  all[idx].mensagens.forEach(m => { m.lidaPorCliente = true })
  writeChat(all)
  return true
}

export function getThread(clientId) {
  return readChat().find(t => t.clientId === clientId) || null
}

export function contarNaoLidasAdmin() {
  return readChat().reduce((acc, t) => {
    return acc + t.mensagens.filter(m => !m.lidaPorAdmin && m.de === 'client').length
  }, 0)
}

export function contarNaoLidasCliente(clientId) {
  const thread = getThread(clientId)
  if (!thread) return 0
  return thread.mensagens.filter(m => !m.lidaPorCliente && m.de === 'admin').length
}

export function listarThreadsAdmin() {
  return readChat()
    .map(t => ({
      clientId: t.clientId,
      clientNome: t.clientNome,
      atualizadaEm: t.atualizadaEm,
      criadaEm: t.criadaEm,
      totalMensagens: t.mensagens.length,
      naoLidasAdmin: t.mensagens.filter(m => !m.lidaPorAdmin && m.de === 'client').length,
      ultimaMensagem: t.mensagens.length > 0 ? t.mensagens[t.mensagens.length - 1] : null,
    }))
    .sort((a, b) => new Date(b.atualizadaEm) - new Date(a.atualizadaEm))
}
