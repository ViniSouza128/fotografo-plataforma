// src/app/api/upload-video/route.js
// Upload de MP4 (e poster opcional) por admin/colaborador.
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { requireAuth } from '@/lib/apiAuth'
import { readEvents } from '@/lib/events'
import {
  sanitizeVideoFilename,
  getVideoOriginalAbsolutePath,
  getVideoOriginalRelativePath,
  getVideoPosterAbsolutePath,
  getVideoPosterRelativeUrl,
  isAllowedResolution,
} from '@/lib/videos'
import { canManageEvent } from '@/lib/colaborador'
import { mergeWatermarkConfig } from '@/lib/watermark'
import { readConfig } from '@/lib/config'
import { renderVideoPosterBuffers } from '@/lib/derivedImagesRenderer'
import { ensureJobsBootstrapped } from '@/lib/jobsBootstrap'

export const runtime = 'nodejs'
export const maxDuration = 300

function makeUniqueFilename(originalName) {
  let ext = path.extname(originalName || '').toLowerCase()
  if (!/^\.(mp4|m4v|mov)$/.test(ext)) ext = '.mp4'
  const base = path.basename(originalName || 'video', ext)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'video'
  const random = Math.random().toString(36).slice(2, 8)
  return `${Date.now()}_${random}_${base}${ext}`
}

async function writeStreamToFile(file, destinationPath) {
  // Escreve para arquivo .partial primeiro e renomeia ao final.
  // Se o servidor for morto antes do rename, o boot remove o .partial e
  // o vídeo nunca aparece "meio pronto" para o resto do sistema.
  const partialPath = `${destinationPath}.partial`
  const source = Readable.fromWeb(file.stream())
  const target = fs.createWriteStream(partialPath, { flags: 'wx' })
  try {
    await pipeline(source, target)
  } catch (err) {
    try { await fs.promises.unlink(partialPath) } catch {}
    throw err
  }
  await fs.promises.rename(partialPath, destinationPath)
}

async function safeUnlink(p) {
  if (!p) return
  try { await fs.promises.unlink(p) } catch {}
}

export async function POST(request) {
  let writtenPaths = []
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    const eventId = String(formData.get('eventId') || '').trim() || null
    const role = String(formData.get('role') || 'original').trim()
    const resolutionLabel = String(formData.get('resolution') || '').trim() || null
    const targetVideoId = String(formData.get('videoId') || '').trim() || null
    const poster = formData.get('poster')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Arquivo obrigatório.' }, { status: 400 })
    }
    if (!file.size || file.size <= 0) {
      return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 })
    }
    const lowerName = String(file.name || '').toLowerCase()
    const lowerType = String(file.type || '').toLowerCase()
    const looksLikeVideoExt = /\.(mp4|m4v|mov)$/i.test(lowerName)
    const looksLikeVideoType = lowerType.startsWith('video/')
    if (!looksLikeVideoExt && !looksLikeVideoType) {
      return NextResponse.json({ error: 'Formato não suportado. Envie um arquivo de vídeo (MP4 recomendado).' }, { status: 400 })
    }
    if (!eventId) return NextResponse.json({ error: 'eventId obrigatório.' }, { status: 400 })

    const event = readEvents().find(ev => ev.id === eventId)
    if (!event) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 })

    if (auth.payload.isColaborador && !canManageEvent(auth.payload, event)) {
      return NextResponse.json({ error: 'Sem permissão para este evento.' }, { status: 403 })
    }

    if (resolutionLabel && !isAllowedResolution(resolutionLabel)) {
      return NextResponse.json({ error: 'Resolução inválida.' }, { status: 400 })
    }

    const filename = sanitizeVideoFilename(makeUniqueFilename(file.name || 'video.mp4'))
    if (!filename) return NextResponse.json({ error: 'Nome de arquivo inválido.' }, { status: 400 })
    const targetPath = getVideoOriginalAbsolutePath({ eventId, filename })
    if (!targetPath) return NextResponse.json({ error: 'Falha ao resolver storage.' }, { status: 500 })

    await writeStreamToFile(file, targetPath)
    writtenPaths.push(targetPath)

    const stat = await fs.promises.stat(targetPath)
    const size = stat.size

    // Garante que a fila de jobs em segundo plano está iniciada (lazy init).
    // O poster com marca d'água e o preview MP4 são gerados pelo worker
    // depois que o /api/videos POST registrar o vídeo e enfileirar os jobs.
    ensureJobsBootstrapped()

    // Fast-path: salva o poster clean enviado pelo cliente (já é uma capa
    // pequena, em ~poucos KB; salvar inline acelera o feedback visual no admin).
    // O WM poster e o preview MP4 (pesados) ficam para o worker.
    let posterCleanUrl = null
    if (role === 'original' && !resolutionLabel
        && poster && typeof poster === 'object' && poster.size > 0) {
      try {
        const watermarkConfig = mergeWatermarkConfig(readConfig(), event)
        const arrayBuf = await poster.arrayBuffer()
        const sourceBuffer = Buffer.from(arrayBuf)
        const cleanAbs = getVideoPosterAbsolutePath({ filename, kind: 'clean' })
        if (cleanAbs) {
          // Apenas a versão clean é gerada inline; a WM vai pelo worker.
          const { clean } = await renderVideoPosterBuffers(sourceBuffer, watermarkConfig)
          await fs.promises.writeFile(cleanAbs, clean)
          writtenPaths.push(cleanAbs)
          const stamp = Date.now()
          posterCleanUrl = `${getVideoPosterRelativeUrl({ filename, kind: 'clean' })}?v=${stamp}`
        }
      } catch (err) {
        console.error('[upload-video] poster clean falhou:', err.message)
      }
    }

    return NextResponse.json({
      ok: true,
      role,
      filename,
      originalName: file.name || null,
      originalPath: getVideoOriginalRelativePath({ eventId, filename }),
      size,
      posterClean: posterCleanUrl,
      posterWm: null,
      resolutionLabel,
      targetVideoId,
      previewWmFilename: null,
      previewWmStatus: 'pending',
      previewWmError: null,
    }, { status: 201 })
  } catch (error) {
    await Promise.all(writtenPaths.map(p => safeUnlink(p)))
    console.error('[upload-video] erro:', error)
    return NextResponse.json({ error: `Erro: ${error.message || 'desconhecido'}` }, { status: 500 })
  }
}
