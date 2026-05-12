// src/app/api/upload-sponsor-logo/route.js
// Upload de logo de patrocinador. Aceita PNG, JPG, GIF, WEBP e SVG.
// Salva em public/uploads/sponsors/<eventId>/<sponsorId>.<ext>.

import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { requireAuth } from '@/lib/apiAuth'
import { readEvents } from '@/lib/events'
import { canManageEvent } from '@/lib/colaborador'
import {
  isAllowedSponsorMime,
  isAllowedSponsorExt,
  getSponsorAbsolutePath,
  getSponsorPublicUrl,
  newSponsorId,
} from '@/lib/sponsors'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_SIZE_BYTES = 5 * 1024 * 1024  // 5MB para logos é generoso
const RASTER_MAX_DIMENSION = 800        // logos são pequenos

function pickExt(mime, originalName) {
  const m = String(mime || '').toLowerCase()
  if (m === 'image/png') return '.png'
  if (m === 'image/gif') return '.gif'
  if (m === 'image/webp') return '.webp'
  if (m === 'image/svg+xml') return '.svg'
  if (m === 'image/jpeg') return '.jpg'
  const guess = (path.extname(originalName || '') || '').toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(guess)) return guess === '.jpeg' ? '.jpg' : guess
  return '.png'
}

export async function POST(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    const eventId = String(formData.get('eventId') || '').trim()
    const sponsorId = String(formData.get('sponsorId') || '').trim() || newSponsorId()

    if (!file || typeof file !== 'object') {
      return NextResponse.json({ error: 'Arquivo obrigatório.' }, { status: 400 })
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: `Logo muito grande. Máximo ${(MAX_SIZE_BYTES / 1024 / 1024).toFixed(1)} MB.` }, { status: 413 })
    }
    if (!isAllowedSponsorMime(file.type) && !isAllowedSponsorExt(file.name)) {
      return NextResponse.json({ error: 'Formato não permitido. Use PNG, JPG, GIF, WEBP ou SVG.' }, { status: 400 })
    }
    if (!eventId) {
      return NextResponse.json({ error: 'eventId obrigatório.' }, { status: 400 })
    }

    const event = readEvents().find(ev => ev.id === eventId)
    if (!event) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 })

    if (auth.payload.isColaborador && !canManageEvent(auth.payload, event)) {
      return NextResponse.json({ error: 'Sem permissão para este evento.' }, { status: 403 })
    }

    const ext = pickExt(file.type, file.name)
    const filename = `${sponsorId}${ext}`
    const absPath = getSponsorAbsolutePath(eventId, filename)
    const buffer = Buffer.from(await file.arrayBuffer())

    if (ext === '.svg') {
      // Sanitização leve: rejeita SVG com <script> inline ou tags suspeitas comuns
      const svgText = buffer.toString('utf-8')
      const lower = svgText.toLowerCase()
      if (/<script[\s>]/i.test(lower) || /\bon\w+\s*=\s*/i.test(lower) || /<foreignobject/i.test(lower)) {
        return NextResponse.json({ error: 'SVG contém tags ou atributos não permitidos (script/eventos).' }, { status: 400 })
      }
      await fs.promises.writeFile(absPath, buffer)
    } else if (ext === '.gif') {
      // GIFs preservamos o original (animação). Sharp poderia recomprimir mas perderia frames.
      await fs.promises.writeFile(absPath, buffer)
    } else {
      // Raster: redimensiona se for muito grande
      try {
        const meta = await sharp(buffer).metadata()
        if ((meta.width || 0) > RASTER_MAX_DIMENSION || (meta.height || 0) > RASTER_MAX_DIMENSION) {
          const optimized = await sharp(buffer)
            .resize({ width: RASTER_MAX_DIMENSION, height: RASTER_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
            .toFormat(ext === '.png' ? 'png' : ext === '.webp' ? 'webp' : 'jpeg', { quality: 85 })
            .toBuffer()
          await fs.promises.writeFile(absPath, optimized)
        } else {
          await fs.promises.writeFile(absPath, buffer)
        }
      } catch {
        // Se sharp falhar (ex: arquivo corrompido), grava o buffer cru
        await fs.promises.writeFile(absPath, buffer)
      }
    }

    return NextResponse.json({
      ok: true,
      sponsorId,
      filename,
      logoUrl: getSponsorPublicUrl(eventId, filename),
    }, { status: 201 })
  } catch (err) {
    console.error('[upload-sponsor-logo] erro:', err)
    return NextResponse.json({ error: err.message || 'Erro ao salvar logo.' }, { status: 500 })
  }
}
