// src/app/api/videos/[id]/poster/route.js
// Substitui o poster (capa/miniatura) de um vídeo. Admin/colaborador autorizado.
// Aceita upload de arquivo de imagem (form-data 'file').
// O arquivo é redimensionado e salvo em /public/uploads/video-posters/clean
// e a versão com marca d'água é salva em /public/uploads/video-posters/wm.
import fs from 'fs'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import {
  findVideoById,
  getVideoPosterAbsolutePath,
  getVideoPosterRelativeUrl,
  updateVideo,
} from '@/lib/videos'
import { readEvents } from '@/lib/events'
import { canManageEvent } from '@/lib/colaborador'
import { readConfig } from '@/lib/config'
import { mergeWatermarkConfig } from '@/lib/watermark'
import { renderVideoPosterBuffers } from '@/lib/derivedImagesRenderer'

export const runtime = 'nodejs'

const MAX_BYTES = 8 * 1024 * 1024

export async function POST(request, { params }) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const { id } = await params
    const video = findVideoById(id)
    if (!video) return NextResponse.json({ error: 'Vídeo não encontrado.' }, { status: 404 })

    const event = readEvents().find(ev => ev.id === video.eventId)
    if (auth.payload.isColaborador && !canManageEvent(auth.payload, event)) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file !== 'object' || !file.size) {
      return NextResponse.json({ error: 'Arquivo obrigatório.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `Imagem muito grande. Máx. ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB.` }, { status: 413 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const cleanAbs = getVideoPosterAbsolutePath({ filename: video.filename, kind: 'clean' })
    const wmAbs = getVideoPosterAbsolutePath({ filename: video.filename, kind: 'wm' })
    if (!cleanAbs || !wmAbs) return NextResponse.json({ error: 'Falha ao resolver storage.' }, { status: 500 })

    const cfg = mergeWatermarkConfig(readConfig(), event)
    const { clean, wm } = await renderVideoPosterBuffers(buf, cfg)

    await Promise.all([
      fs.promises.writeFile(cleanAbs, clean),
      fs.promises.writeFile(wmAbs, wm),
    ])

    const cleanUrl = getVideoPosterRelativeUrl({ filename: video.filename, kind: 'clean' })
    const wmUrl = getVideoPosterRelativeUrl({ filename: video.filename, kind: 'wm' })
    const stamp = Date.now()
    const posterClean = `${cleanUrl}?v=${stamp}`
    const posterWm = `${wmUrl}?v=${stamp}`

    updateVideo(video.id, { posterClean, posterWm })

    return NextResponse.json({ ok: true, posterClean, posterWm })
  } catch (err) {
    console.error('[video poster] erro:', err)
    return NextResponse.json({ error: err.message || 'Erro ao salvar miniatura.' }, { status: 500 })
  }
}
