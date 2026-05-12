// src/app/api/videos/regenerate-all-previews/route.js
// Regenera em lote os previews MP4 com marca d'água queimada para todos os
// vídeos (ou para os de um evento específico). Útil após trocar o PNG de
// marca d'água de vídeo ou após importar vídeos antigos.
//
// GET  → retorna estatísticas de status de todos os vídeos
// POST → dispara a regeneração (síncrona, até maxDuration=300s)
import fs from 'fs'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import {
  readVideos,
  getVideoOriginalAbsolutePath,
  getVideoPreviewWmFilename,
  getVideoPreviewWmAbsolutePath,
  getVideoPosterAbsolutePath,
  getVideoPosterRelativeUrl,
  updateVideo,
} from '@/lib/videos'
import { generateWatermarkedPreview, extractVideoFrameBuffer } from '@/lib/videoProcessing'
import { readEvents } from '@/lib/events'
import { mergeWatermarkConfig, getVideoWatermarkPath, watermarkExists } from '@/lib/watermark'
import { readConfig } from '@/lib/config'
import { renderVideoPosterBuffers } from '@/lib/derivedImagesRenderer'

export const runtime = 'nodejs'
export const maxDuration = 300

// GET /api/videos/regenerate-all-previews?eventId=xxx
// Retorna contagens de status de preview para todos os vídeos.
export async function GET(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId') || null

    const all = readVideos().filter((v) => !v.removida)
    const videos = eventId ? all.filter((v) => v.eventId === eventId) : all

    const stats = {
      total: videos.length,
      ready: videos.filter((v) => v.previewWmStatus === 'ready' && v.previewWmFilename).length,
      pending: videos.filter((v) => !v.previewWmStatus || v.previewWmStatus === 'pending').length,
      processing: videos.filter((v) => v.previewWmStatus === 'processing').length,
      failed: videos.filter((v) => v.previewWmStatus === 'failed').length,
    }

    return NextResponse.json({
      stats,
      videoWatermarkExists: watermarkExists('video'),
    })
  } catch (err) {
    console.error('[regen-all-previews GET]', err)
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}

// POST /api/videos/regenerate-all-previews
// Body (JSON, todos opcionais):
//   eventId    – limita a um evento específico
//   onlyFailed – true → pula os que já têm previewWmStatus=ready
//   force      – true → reprocessa mesmo os que já têm status ready
export async function POST(request) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const body = await request.json().catch(() => ({}))
    const { eventId = null, onlyFailed = false, force = false } = body

    const events = readEvents()
    const eventMap = Object.fromEntries(events.map((e) => [e.id, e]))
    const baseConfig = readConfig()

    const all = readVideos().filter((v) => !v.removida)
    const scope = eventId ? all.filter((v) => v.eventId === eventId) : all

    // Determina quais vídeos precisam de regeneração.
    const candidates = scope.filter((v) => {
      if (force) return true
      if (v.previewWmStatus === 'ready' && v.previewWmFilename) {
        // já está pronto → só inclui se force=true (já tratado acima)
        return false
      }
      // status pending, processing, failed, ou sem previewWmFilename → inclui
      return true
    })

    let done = 0
    let failed = 0
    let skipped = 0

    for (const video of candidates) {
      const originalAbs = getVideoOriginalAbsolutePath({
        eventId: video.eventId,
        filename: video.filename,
      })
      if (!originalAbs || !fs.existsSync(originalAbs)) {
        skipped++
        continue
      }

      const event = eventMap[video.eventId]
      const watermarkConfig = mergeWatermarkConfig(baseConfig, event)
      const videoWmPath = getVideoWatermarkPath(watermarkConfig)
      const wmText = `PREVIEW · ${(event?.name || 'ALBUM').toUpperCase()}`
      const wmName = getVideoPreviewWmFilename(video.filename)
      const wmAbs = getVideoPreviewWmAbsolutePath({ eventId: video.eventId, filename: wmName })

      updateVideo(video.id, { previewWmStatus: 'processing' })

      // Regenera os posters (clean + wm) também
      let posterClean = null
      let posterWm = null
      try {
        let sourceBuffer = null
        const cleanAbs = getVideoPosterAbsolutePath({ filename: video.filename, kind: 'clean' })
        if (cleanAbs && fs.existsSync(cleanAbs)) {
          sourceBuffer = await fs.promises.readFile(cleanAbs)
        } else {
          try { sourceBuffer = await extractVideoFrameBuffer(originalAbs, 1.0) }
          catch { try { sourceBuffer = await extractVideoFrameBuffer(originalAbs, 0) } catch {} }
        }
        if (sourceBuffer) {
          const wmPosterAbs = getVideoPosterAbsolutePath({ filename: video.filename, kind: 'wm' })
          const { clean, wm } = await renderVideoPosterBuffers(sourceBuffer, watermarkConfig)
          if (cleanAbs) await fs.promises.writeFile(cleanAbs, clean)
          if (wmPosterAbs) await fs.promises.writeFile(wmPosterAbs, wm)
          const stamp = Date.now()
          posterClean = `${getVideoPosterRelativeUrl({ filename: video.filename, kind: 'clean' })}?v=${stamp}`
          posterWm = `${getVideoPosterRelativeUrl({ filename: video.filename, kind: 'wm' })}?v=${stamp}`
        }
      } catch (err) {
        // best-effort: não bloqueia a geração do MP4
        console.error('[regen-all-previews] poster falhou:', err.message)
      }

      try {
        await generateWatermarkedPreview(originalAbs, wmAbs, {
          text: wmText,
          watermarkImagePath: videoWmPath,
          watermarkConfig,
        })
        updateVideo(video.id, {
          previewWmFilename: wmName,
          previewWmStatus: 'ready',
          ...(posterClean ? { posterClean } : {}),
          ...(posterWm ? { posterWm } : {}),
        })
        done++
      } catch (err) {
        updateVideo(video.id, {
          previewWmStatus: 'failed',
          previewWmError: String(err?.message || err).slice(0, 400),
        })
        failed++
      }
    }

    return NextResponse.json({
      ok: true,
      total: candidates.length,
      done,
      failed,
      skipped,
    })
  } catch (err) {
    console.error('[regen-all-previews POST]', err)
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}
