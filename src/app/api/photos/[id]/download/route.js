import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { readPhotos } from '@/lib/photos'
import { readPedidos } from '@/lib/pedidos'
import { validateAuthToken, verifyDownloadToken } from '@/lib/auth'
import { findClientById } from '@/lib/clients'
import { getPedidoItens, getPedidoItemPhotoId, normalizePedidoStatus } from '@/lib/commerceUtils'
import { resolveOriginalPath } from '@/lib/imageStorage'
import { readEvents } from '@/lib/events'
import { isPhotoFree } from '@/lib/freeAccess'
import { resolveOriginalForDownload } from '@/lib/storage'
import {
  getEffectiveTiersConfig,
  findTier,
  findPreset,
  applyPresetPipeline,
  applyTierPipeline,
  buildSizedFilename,
  getMaxPurchasedTier,
  getIncludedTierIds,
  isTierEligibleForPhoto,
} from '@/lib/downloadTiers'

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function sanitizeFileName(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const safe = path.basename(raw)
  if (!safe || safe === '.' || safe === '..') return null
  return safe
}

function isPedidoOwnedByClient(pedido, client) {
  if (!pedido || !client) return false
  if (pedido.clientId && pedido.clientId === client.id) return true

  const clientPhone = normalizePhone(client.whatsapp)
  if (clientPhone && normalizePhone(pedido.whatsapp) === clientPhone) return true

  const clientCpf = normalizeCpf(client.cpf)
  if (clientCpf && normalizeCpf(pedido.cpf) === clientCpf) return true

  const clientEmail = normalizeEmail(client.email)
  if (clientEmail && normalizeEmail(pedido.email) === clientEmail) return true

  return false
}

function pedidoPermiteDownload(pedido) {
  const status = normalizePedidoStatus(pedido?.status)
  if (status === 'reembolsado') return false
  if (status === 'reembolso_solicitado') return false
  return status === 'pago' || status === 'liberado_manual'
}

function paidPedidoContainsPhoto(pedido, photoId) {
  if (!pedido || !photoId) return false
  if (!pedidoPermiteDownload(pedido)) return false
  const itens = getPedidoItens(pedido)
  return itens.some(item => getPedidoItemPhotoId(item) === photoId)
}

function buildContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

function buildDownloadName(photo) {
  const fallback = sanitizeFileName(photo?.filename) || 'foto-original.jpg'
  const preferred = sanitizeFileName(photo?.originalName)
  return preferred || fallback
}

async function getAuthClientFromCookie() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value
    const auth = validateAuthToken(token)
    if (auth?.error) return { payload: null, client: null }
    const { payload, client } = auth
    return { payload, client }
  } catch {
    return { payload: null, client: null }
  }
}

export async function GET(request, { params }) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'ID da foto obrigatorio.' }, { status: 400 })
    }

    const photos = readPhotos()
    const photo = photos.find(p => p.id === id)
    if (!photo) {
      return NextResponse.json({ error: 'Foto nao encontrada.' }, { status: 404 })
    }

    const events = readEvents()
    const event = events.find(ev => ev.id === photo.eventId)

    const originalPath = resolveOriginalPath(photo)
    if (!originalPath) {
      return NextResponse.json({ error: 'Original indisponivel no servidor.' }, { status: 404 })
    }

    let authorized = isPhotoFree(photo, event)

    const { payload, client } = await getAuthClientFromCookie()
    if (!authorized && payload?.isAdmin) {
      authorized = true
    }

    if (!authorized && client) {
      const pedidos = readPedidos()
      authorized = pedidos.some(pedido =>
        isPedidoOwnedByClient(pedido, client) && paidPedidoContainsPhoto(pedido, photo.id)
      )
    }

    if (!authorized) {
      const { searchParams } = new URL(request.url)
      const pedidoId = searchParams.get('pedidoId')
      const token = searchParams.get('token')

      if (pedidoId && token && verifyDownloadToken(token, pedidoId)) {
        const pedidos = readPedidos()
        const pedido = pedidos.find(p => p.id === pedidoId)
        if (pedido && paidPedidoContainsPhoto(pedido, photo.id)) {
          authorized = true
        }
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Sem permissao para baixar este original.' }, { status: 403 })
    }

    // Tier/preset (downloads por resolução)
    const { searchParams } = new URL(request.url)
    const tierId = searchParams.get('tier')
    const presetId = searchParams.get('preset')

    if (tierId || presetId) {
      const tCfg = getEffectiveTiersConfig(event)
      if (!tCfg.ativo) {
        return NextResponse.json({ error: 'Recurso de download por resolução está desativado.' }, { status: 400 })
      }

      // Determina tier máximo já comprado para esta foto (para validar acesso).
      // Admins sempre passam; clientes precisam ter pago com tier compatível.
      let purchasedTier = null
      if (!payload?.isAdmin && client) {
        const pedidos = readPedidos()
        const itens = pedidos.filter(p => isPedidoOwnedByClient(p, client) && pedidoPermiteDownload(p))
          .flatMap(p => getPedidoItens(p))
        purchasedTier = getMaxPurchasedTier({ pedidoItens: itens, photoId: photo.id, cfg: tCfg })
      }

      // Resolve qual tier o request pediu (preset usa min de tier necessário)
      const requestedTier = tierId ? findTier(tCfg, tierId) : null
      const requestedPreset = presetId ? findPreset(tCfg, presetId) : null

      if (tierId && !requestedTier) {
        return NextResponse.json({ error: `Tier "${tierId}" inválido.` }, { status: 400 })
      }
      if (presetId && !requestedPreset) {
        return NextResponse.json({ error: `Preset "${presetId}" inválido.` }, { status: 400 })
      }

      if (requestedTier && !isTierEligibleForPhoto(requestedTier, photo)) {
        return NextResponse.json({ error: 'Foto não atende à resolução mínima do tier.' }, { status: 400 })
      }

      // Validação de acesso: cliente só baixa tiers ≤ ao comprado.
      if (!payload?.isAdmin && requestedTier) {
        if (!purchasedTier) {
          return NextResponse.json({ error: 'Compra não localizada para esta foto.' }, { status: 403 })
        }
        if (Number(requestedTier.ordem) > Number(purchasedTier.ordem)) {
          return NextResponse.json({ error: `Tier "${requestedTier.label}" requer compra superior.`, code: 'tier_not_unlocked' }, { status: 403 })
        }
      }
      // Para preset, exige pelo menos a compra de qualquer tier (qualquer compra paga libera presets).
      if (!payload?.isAdmin && requestedPreset && !purchasedTier) {
        return NextResponse.json({ error: 'Compra não localizada para esta foto.' }, { status: 403 })
      }

      // Tier "full" sem maxLongSide → entrega o original sem reencodar.
      if (requestedTier && !requestedPreset && !requestedTier.maxLongSide) {
        const buffer = await fs.promises.readFile(originalPath)
        const downloadName = buildDownloadName(photo)
        const encodedName = encodeURIComponent(downloadName)
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': buildContentType(originalPath),
            'Content-Length': String(buffer.length),
            'Content-Disposition': `attachment; filename="${downloadName}"; filename*=UTF-8''${encodedName}`,
            'Cache-Control': 'private, no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
            'X-Tier': `tier:${requestedTier.id}`,
          },
        })
      }

      // Gera arquivo on-demand
      try {
        let pipeline = sharp(originalPath)
        if (requestedPreset) pipeline = applyPresetPipeline(pipeline, requestedPreset)
        else pipeline = applyTierPipeline(pipeline, requestedTier)
        const buffer = await pipeline.toBuffer()
        const downloadName = buildSizedFilename({
          originalName: photo.originalName || photo.filename,
          photoId: photo.id,
          tier: requestedPreset ? null : requestedTier,
          preset: requestedPreset || null,
        })
        const encodedName = encodeURIComponent(downloadName)
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': String(buffer.length),
            'Content-Disposition': `attachment; filename="${downloadName}"; filename*=UTF-8''${encodedName}`,
            'Cache-Control': 'private, no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
            'X-Tier': requestedPreset ? `preset:${requestedPreset.id}` : `tier:${requestedTier.id}`,
          },
        })
      } catch (err) {
        console.error('Erro ao gerar download por tier/preset:', err)
        return NextResponse.json({ error: 'Erro ao gerar arquivo redimensionado.' }, { status: 500 })
      }
    }

    const downloadName = buildDownloadName(photo)
    const encodedName = encodeURIComponent(downloadName)

    // Tenta resolver via storage externo (signed URL) se ligado, senão local.
    const resolution = await resolveOriginalForDownload({
      eventId: photo.eventId,
      filename: photo.filename,
      absolutePathLocal: originalPath,
      downloadName,
    })

    if (resolution.mode === 'signed') {
      return NextResponse.redirect(resolution.url, { status: 302 })
    }
    if (resolution.mode === 'missing') {
      return NextResponse.json({ error: 'Original indisponivel.' }, { status: 404 })
    }

    const buffer = await fs.promises.readFile(resolution.absolutePath)
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': buildContentType(resolution.absolutePath),
        'Content-Length': String(buffer.length),
        'Content-Disposition': `attachment; filename="${downloadName}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Erro ao baixar original:', error)
    return NextResponse.json({ error: 'Erro ao processar download.' }, { status: 500 })
  }
}
