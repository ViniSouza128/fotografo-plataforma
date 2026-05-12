import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { normalizarWhatsApp } from '@/lib/whatsapp'

const CONTACTS_PATH = path.join(process.cwd(), 'data', 'contatos.json')
const STATUS_VALUES = new Set(['novo', 'em_atendimento', 'resolvido', 'arquivado'])

function normalizeText(value, max = 2000) {
  return String(value || '').trim().slice(0, max)
}

function normalizeEmail(value) {
  return normalizeText(value, 160).toLowerCase()
}

function readContacts() {
  if (!fs.existsSync(CONTACTS_PATH)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(CONTACTS_PATH, 'utf-8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeContacts(items) {
  fs.mkdirSync(path.dirname(CONTACTS_PATH), { recursive: true })
  fs.writeFileSync(CONTACTS_PATH, JSON.stringify(items, null, 2), 'utf-8')
}

function adminError(auth) {
  if (!auth?.error) return null
  return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
}

export async function GET() {
  const auth = await requireAuth({ requireAdmin: true })
  const denied = adminError(auth)
  if (denied) return denied

  const contacts = readContacts()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))

  return NextResponse.json(contacts)
}

export async function POST(request) {
  try {
    const body = await request.json()
    const nome = normalizeText(body.nome, 120)
    const email = normalizeEmail(body.email)
    const whatsapp = normalizarWhatsApp(body.whatsapp)
    const assunto = normalizeText(body.assunto, 140)
    const mensagem = normalizeText(body.mensagem, 2000)

    if (!nome || !assunto || !mensagem) {
      return NextResponse.json({ error: 'Informe nome, assunto e mensagem.' }, { status: 400 })
    }

    if (!email && !whatsapp) {
      return NextResponse.json({ error: 'Informe e-mail ou WhatsApp para retorno.' }, { status: 400 })
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'E-mail invalido.' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const item = {
      id: crypto.randomUUID(),
      nome,
      email,
      whatsapp,
      assunto,
      mensagem,
      status: 'novo',
      adminNote: '',
      createdAt: now,
      updatedAt: now,
    }

    const contacts = readContacts()
    contacts.push(item)
    writeContacts(contacts)

    return NextResponse.json({ ok: true, id: item.id }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Erro ao salvar contato.' }, { status: 500 })
  }
}

export async function PATCH(request) {
  const auth = await requireAuth({ requireAdmin: true })
  const denied = adminError(auth)
  if (denied) return denied

  try {
    const body = await request.json()
    const id = normalizeText(body.id, 80)
    const status = normalizeText(body.status, 40)
    const adminNote = normalizeText(body.adminNote, 1000)

    if (!id) {
      return NextResponse.json({ error: 'Contato nao informado.' }, { status: 400 })
    }
    if (status && !STATUS_VALUES.has(status)) {
      return NextResponse.json({ error: 'Status invalido.' }, { status: 400 })
    }

    const contacts = readContacts()
    const index = contacts.findIndex(item => item.id === id)
    if (index === -1) {
      return NextResponse.json({ error: 'Contato nao encontrado.' }, { status: 404 })
    }

    contacts[index] = {
      ...contacts[index],
      status: status || contacts[index].status || 'novo',
      adminNote,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.client?.id || auth.payload?.id || null,
    }
    writeContacts(contacts)

    return NextResponse.json(contacts[index])
  } catch {
    return NextResponse.json({ error: 'Erro ao atualizar contato.' }, { status: 500 })
  }
}
