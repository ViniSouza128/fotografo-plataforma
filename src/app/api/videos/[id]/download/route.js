// src/app/api/videos/[id]/download/route.js
// Download de vídeo (MP4). Suporta seleção por resolução e versão (raw/edited).
// Suporta HTTP Range (206 Partial Content) para seek na timeline do player.
import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { findVideoById, getVideoOriginalAbsolutePath, isAllowedResolution } from '@/lib/videos'
import { readEvents } from '@/lib/events'
import { readPedidos } from '@/lib/pedidos'
import { validateAuthToken, verifyDownloadToken } from '@/lib/auth'
import { getPedidoItens, getPedidoItemPhotoId, normalizePedidoStatus } from '@/lib/commerceUtils'

function parseRange(rangeHeader, fileSize) {
  if (!rangeHeader) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!m) return null
  let start = m[1] ? parseInt(m[1], 10) : 0
  let end   = m[2] ? parseInt(m[2], 10) : fileSize - 1
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  if (end >= fileSize) end = fileSize - 1
  if (start > end || start < 0) return null
  return { start, end }
}

function normalizePhone(v) { return String(v || '').replace(/\D/g, '') }
function normalizeCpf(v) { return String(v || '').replace(/\D/g, '') }
function normalizeEmail(v) { return String(v || '').trim().toLowerCase() }

function isPedidoOwnedByClient(pedido, client) {
  if (!pedido || !client) return false
  if (pedido.clientId && pedido.clientId === client.id) return true
  const cp = normalizePhone(client.whatsapp)
  if (cp && normalizePhone(pedido.whatsapp) === cp) return true
  const cc = normalizeCpf(client.cpf)
  if (cc && normalizeCpf(pedido.cpf) === cc) return true
  const ce = normalizeEmail(client.email)
  if (ce && normalizeEmail(pedido.email) === ce) return true
  return false
}

function pedidoPermiteDownload(pedido) {
  const status = normalizePedidoStatus(pedido?.status)
  if (status === 'reembolsado') return false
  if (status === 'reembolso_solicitado') return false
  return status === 'pago' || status === 'liberado_manual'
}

function pedidoContainsVideo(pedido, videoId) {
  if (!pedido || !videoId) return false
  if (!pedidoPermiteDownload(pedido)) return false
  const itens = getPedidoItens(pedido)
  return itens.some(i =>
    (i.mediaType === 'video' || i.tipo === 'video') &&
    (i.videoId === videoId || i.id === videoId || getPedidoItemPhotoId(i) === videoId)
  )
}

async function getAuthClientFromCookie() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value
    const auth = validateAuthToken(token)
    if (auth?.error) return { payload: null, client: null }
    return { payload: auth.payload, client: auth.client }
  } catch { return { payload: null, client: null } }
}

export async function GET(request, { params }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID do vídeo obrigatório.' }, { status: 400 })

    const video = findVideoById(id)
    if (!video) return NextResponse.json({ error: 'Vídeo não encontrado.' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const resolution = searchParams.get('resolution') || null
    const variantParam = searchParams.get('variant') || 'original' // original | edited

    const { payload, client } = await getAuthClientFromCookie()

    let authorized = false
    if (payload?.isAdmin) authorized = true
    // Vídeos marcados como gratuitos (individual ou álbum gratuito) liberam download.
    if (!authorized) {
      const ev = readEvents().find(e => e.id === video.eventId) || null
      if (video.gratis === true || ev?.albumGratis === true) authorized = true
    }
    if (!authorized && client) {
      const pedidos = readPedidos()
      authorized = pedidos.some(p =>
        isPedidoOwnedByClient(p, client) && pedidoContainsVideo(p, video.id)
      )
    }
    if (!authorized) {
      const pedidoId = searchParams.get('pedidoId')
      const tok = searchParams.get('token')
      if (pedidoId && tok && verifyDownloadToken(tok, pedidoId)) {
        const pedidos = readPedidos()
        const pedido = pedidos.find(p => p.id === pedidoId)
        if (pedido && pedidoContainsVideo(pedido, video.id)) authorized = true
      }
    }
    if (!authorized) {
      return NextResponse.json({ error: 'Sem permissão para baixar este vídeo.' }, { status: 403 })
    }

    // Resolve qual arquivo entregar
    let filenameToServe = video.filename
    let labelInfo = 'original'
    if (variantParam === 'edited' && video.edited?.entregue && video.edited.filename) {
      filenameToServe = video.edited.filename
      labelInfo = 'edited'
    }
    if (resolution) {
      if (!isAllowedResolution(resolution)) {
        return NextResponse.json({ error: 'Resolução inválida.' }, { status: 400 })
      }
      const list = variantParam === 'edited'
        ? (Array.isArray(video.edited?.resolutions) ? video.edited.resolutions : [])
        : (Array.isArray(video.resolutions) ? video.resolutions : [])
      const variant = list.find(r => r.label === resolution)
      if (!variant) {
        return NextResponse.json({ error: `Resolução ${resolution} não disponível.` }, { status: 404 })
      }
      filenameToServe = variant.filename
      labelInfo = `${labelInfo}_${resolution}`
    }

    const absolutePath = getVideoOriginalAbsolutePath({ eventId: video.eventId, filename: filenameToServe })
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      return NextResponse.json({ error: 'Arquivo de vídeo indisponível.' }, { status: 404 })
    }

    const stat = fs.statSync(absolutePath)
    const fileSize = stat.size
    const downloadName = (video.originalName || filenameToServe || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_')
    const encoded = encodeURIComponent(downloadName)
    const disposition = `attachment; filename="${downloadName}"; filename*=UTF-8''${encoded}`

    // Suporte a HTTP Range para seek no player (streaming inline) e download parcial.
    const range = parseRange(request.headers.get('range'), fileSize)
    if (range) {
      const { start, end } = range
      const chunkSize = end - start + 1
      const stream = fs.createReadStream(absolutePath, { start, end })
      return new NextResponse(stream, {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Disposition': disposition,
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
          'X-Video-Variant': labelInfo,
        },
      })
    }

    const stream = fs.createReadStream(absolutePath)
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Content-Disposition': disposition,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'X-Video-Variant': labelInfo,
      },
    })
  } catch (err) {
    console.error('[video download] erro:', err)
    return NextResponse.json({ error: 'Erro ao baixar vídeo.' }, { status: 500 })
  }
}
