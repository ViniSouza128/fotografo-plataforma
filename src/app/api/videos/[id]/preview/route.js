// src/app/api/videos/[id]/preview/route.js
// Streaming público da PRÉ-VISUALIZAÇÃO de vídeo. Serve o MP4 com marca d'água
// "queimada" (gerado por ffmpeg no upload). NUNCA serve o original.
// Suporta HTTP Range para que o player permita seek na timeline.
//
// Se o preview ainda não foi gerado (status pending) ou falhou, retorna 425/503
// com payload JSON. O cliente decide o que mostrar.
import fs from 'fs'
import { NextResponse } from 'next/server'
import {
  findVideoById,
  getVideoPreviewWmAbsolutePath,
} from '@/lib/videos'

export const runtime = 'nodejs'

function parseRange(rangeHeader, fileSize) {
  if (!rangeHeader) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!m) return null
  let start = m[1] ? parseInt(m[1], 10) : 0
  let end = m[2] ? parseInt(m[2], 10) : fileSize - 1
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  if (end >= fileSize) end = fileSize - 1
  if (start > end || start < 0) return null
  return { start, end }
}

export async function GET(request, { params }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })

    const video = findVideoById(id)
    if (!video || video.removida) {
      return NextResponse.json({ error: 'Vídeo não encontrado.' }, { status: 404 })
    }

    if (!video.previewWmFilename) {
      return NextResponse.json({
        error: 'Pré-visualização ainda não disponível.',
        code: 'preview_not_ready',
        status: video.previewWmStatus || 'pending',
      }, { status: 425 })
    }

    const absPath = getVideoPreviewWmAbsolutePath({
      eventId: video.eventId,
      filename: video.previewWmFilename,
    })
    if (!absPath || !fs.existsSync(absPath)) {
      return NextResponse.json({
        error: 'Arquivo de pré-visualização indisponível.',
        code: 'preview_missing',
      }, { status: 503 })
    }

    const stat = fs.statSync(absPath)
    const fileSize = stat.size
    const range = parseRange(request.headers.get('range'), fileSize)

    if (range) {
      const { start, end } = range
      const chunkSize = end - start + 1
      const stream = fs.createReadStream(absPath, { start, end })
      return new NextResponse(stream, {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    const stream = fs.createReadStream(absPath)
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    console.error('[video preview] erro:', err)
    return NextResponse.json({ error: 'Erro ao servir vídeo.' }, { status: 500 })
  }
}
