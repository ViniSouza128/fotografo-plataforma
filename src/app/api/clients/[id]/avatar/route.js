// src/app/api/clients/[id]/avatar/route.js
// Upload e remoção da foto de perfil. Qualquer cliente pode editar a sua;
// admin pode editar a de qualquer um. Gera duas variantes JPEG (large 512, thumb 96)
// e mantém o original (até ~12MB) em storage/originals/avatars.

import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { requireAuth } from '@/lib/apiAuth'
import { readClients, writeClients } from '@/lib/clients'
import {
  AVATAR_ALLOWED_MIME,
  AVATAR_LARGE_SIZE,
  AVATAR_MAX_BYTES,
  AVATAR_THUMB_SIZE,
  deleteAvatarFiles,
  ensureAvatarDirs,
  findExistingOriginal,
  getAvatarOriginalPath,
  safeUnlinkSync,
} from '@/lib/avatars'
import {
  assertCanUpload,
  isStorageQuotaExceededError,
  toStorageQuotaErrorPayload,
} from '@/lib/storageQuota'

export const runtime = 'nodejs'
export const maxDuration = 60

function canEditAvatar(payload, targetId) {
  if (!payload) return false
  if (payload.id === targetId) return true
  return !!payload.isAdmin
}

export async function POST(request, { params }) {
  try {
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    const { id } = params || {}
    if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })
    if (!canEditAvatar(auth.payload, id)) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
    }

    const clients = readClients()
    const idx = clients.findIndex(c => c.id === id)
    if (idx === -1) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Arquivo obrigatório.' }, { status: 400 })
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return NextResponse.json({ error: `Arquivo grande demais (máx ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB).` }, { status: 413 })
    }
    const mime = String(file.type || '').toLowerCase()
    if (mime && !AVATAR_ALLOWED_MIME.includes(mime)) {
      return NextResponse.json({ error: 'Formato não suportado. Use JPG, PNG, WebP ou AVIF.' }, { status: 400 })
    }

    assertCanUpload({ kind: 'avatar', incomingBytes: Number(file.size) || 0 })

    const arrayBuf = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuf)

    let meta
    try {
      meta = await sharp(buffer).metadata()
    } catch {
      return NextResponse.json({ error: 'Arquivo inválido ou corrompido.' }, { status: 400 })
    }
    if (!meta.width || !meta.height) {
      return NextResponse.json({ error: 'Imagem inválida.' }, { status: 400 })
    }

    const paths = ensureAvatarDirs(id)
    if (!paths) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

    // grava original (mantém formato), removendo qualquer original anterior
    const existingOriginal = findExistingOriginal(id)
    if (existingOriginal) safeUnlinkSync(existingOriginal)
    const ext = (meta.format || path.extname(file.name || '').replace('.', '') || 'jpg').toLowerCase()
    const originalPath = getAvatarOriginalPath(id, ext)
    if (originalPath) await fs.promises.writeFile(originalPath, buffer)

    // grandes e miniaturas (JPEG, EXIF strip via sharp default)
    const large = await sharp(buffer)
      .rotate()
      .resize({ width: AVATAR_LARGE_SIZE, height: AVATAR_LARGE_SIZE, fit: 'cover', position: 'attention' })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer()
    const thumb = await sharp(buffer)
      .rotate()
      .resize({ width: AVATAR_THUMB_SIZE, height: AVATAR_THUMB_SIZE, fit: 'cover', position: 'attention' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer()
    await fs.promises.writeFile(paths.largeAbs, large)
    await fs.promises.writeFile(paths.thumbAbs, thumb)

    const updatedAt = new Date().toISOString()
    const avatar = {
      large: paths.largeUrl,
      thumb: paths.thumbUrl,
      updatedAt,
    }
    clients[idx].avatar = avatar
    clients[idx].atualizadoEm = updatedAt
    writeClients(clients)

    const { senha, ...safe } = clients[idx]
    return NextResponse.json({ ok: true, avatar, client: safe })
  } catch (err) {
    if (isStorageQuotaExceededError(err)) {
      return NextResponse.json(toStorageQuotaErrorPayload(err), { status: err.status || 507 })
    }
    console.error('[avatar] POST error:', err)
    return NextResponse.json({ error: 'Erro ao processar imagem.' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    const { id } = params || {}
    if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })
    if (!canEditAvatar(auth.payload, id)) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
    }

    const clients = readClients()
    const idx = clients.findIndex(c => c.id === id)
    if (idx === -1) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

    deleteAvatarFiles(id)
    clients[idx].avatar = null
    clients[idx].atualizadoEm = new Date().toISOString()
    writeClients(clients)

    const { senha, ...safe } = clients[idx]
    return NextResponse.json({ ok: true, client: safe })
  } catch (err) {
    console.error('[avatar] DELETE error:', err)
    return NextResponse.json({ error: 'Erro ao remover.' }, { status: 500 })
  }
}
