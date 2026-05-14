// src/app/api/videos/[id]/regenerate-preview/route.js
// Recria o MP4 de preview com marca d'água queimada para um vídeo já existente
// e regenera os posters (clean + wm) usando o frame do vídeo ou poster atual.
// Usado para corrigir vídeos antigos enviados antes do ffmpeg estar no stack
// ou quando a geração inicial falhou ou quando a WM/config mudou.
import fs from 'fs'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import {
  findVideoById,
  getVideoOriginalAbsolutePath,
  getVideoPreviewWmFilename,
  getVideoPreviewWmAbsolutePath,
  getVideoPosterAbsolutePath,
  getVideoPosterRelativeUrl,
  updateVideo,
} from '@/lib/videos'
import { generateWatermarkedPreview, extractVideoFrameBuffer } from '@/lib/videoProcessing'
import { readEvents } from '@/lib/events'
import { canManageEvent } from '@/lib/colaborador'
import { mergeWatermarkConfig, getVideoWatermarkPath } from '@/lib/watermark'
import { readConfig } from '@/lib/config'
import { renderVideoPosterBuffers } from '@/lib/derivedImagesRenderer'
import {
  assertCanUpload,
  isStorageQuotaExceededError,
  toStorageQuotaErrorPayload,
} from '@/lib/storageQuota'

export const runtime = 'nodejs'
export const maxDuration = 300

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

    const originalAbs = getVideoOriginalAbsolutePath({ eventId: video.eventId, filename: video.filename })
    if (!originalAbs) {
      return NextResponse.json({ error: 'Caminho original indisponível.' }, { status: 500 })
    }

    const watermarkConfig = mergeWatermarkConfig(readConfig(), event)

    assertCanUpload({ kind: 'video', incomingBytes: 0 })

    updateVideo(video.id, { previewWmStatus: 'processing' })

    let posterClean = null
    let posterWm = null
    try {
      // Tenta usar o poster clean atual como fonte; senão, extrai um frame.
      let sourceBuffer = null
      const cleanAbs = getVideoPosterAbsolutePath({ filename: video.filename, kind: 'clean' })
      if (cleanAbs && fs.existsSync(cleanAbs)) {
        sourceBuffer = await fs.promises.readFile(cleanAbs)
      } else {
        try { sourceBuffer = await extractVideoFrameBuffer(originalAbs, 1.0) }
        catch { try { sourceBuffer = await extractVideoFrameBuffer(originalAbs, 0) } catch {} }
      }
      if (sourceBuffer) {
        const wmAbs = getVideoPosterAbsolutePath({ filename: video.filename, kind: 'wm' })
        const { clean, wm } = await renderVideoPosterBuffers(sourceBuffer, watermarkConfig)
        if (cleanAbs) await fs.promises.writeFile(cleanAbs, clean)
        if (wmAbs) await fs.promises.writeFile(wmAbs, wm)
        const stamp = Date.now()
        posterClean = `${getVideoPosterRelativeUrl({ filename: video.filename, kind: 'clean' })}?v=${stamp}`
        posterWm = `${getVideoPosterRelativeUrl({ filename: video.filename, kind: 'wm' })}?v=${stamp}`
      }
    } catch (err) {
      console.error('[regenerate-preview] poster falhou:', err.message)
    }

    try {
      const wmName = getVideoPreviewWmFilename(video.filename)
      const wmAbs = getVideoPreviewWmAbsolutePath({ eventId: video.eventId, filename: wmName })
      const wmText = `PREVIEW · ${(event?.name || 'ALBUM').toUpperCase()}`
      const videoWmPath = getVideoWatermarkPath(watermarkConfig)
      const result = await generateWatermarkedPreview(originalAbs, wmAbs, {
        text: wmText,
        watermarkImagePath: videoWmPath,
        watermarkConfig,
      })
      const updated = updateVideo(video.id, {
        previewWmFilename: wmName,
        previewWmStatus: 'ready',
        ...(posterClean ? { posterClean } : {}),
        ...(posterWm ? { posterWm } : {}),
      })
      return NextResponse.json({ ok: true, video: updated, result, posterClean, posterWm })
    } catch (err) {
      updateVideo(video.id, {
        previewWmStatus: 'failed',
        previewWmError: String(err?.message || err).slice(0, 400),
      })
      return NextResponse.json({
        error: 'Falha ao gerar preview: ' + String(err?.message || err),
      }, { status: 500 })
    }
  } catch (err) {
    if (isStorageQuotaExceededError(err)) {
      return NextResponse.json(toStorageQuotaErrorPayload(err), { status: err.status || 507 })
    }
    console.error('[regenerate-preview] erro:', err)
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}
