import { NextResponse } from 'next/server'
import fs from 'fs'
import { requireAuth } from '@/lib/apiAuth'
import { readEvents, writeEvents } from '@/lib/events'
import { readPhotos } from '@/lib/photos'
import { readConfig } from '@/lib/config'
import {
  buildCoverStorageFields,
  ensureImageStorageDirs,
  getDerivedAbsolutePath,
  resolveOriginalPath,
} from '@/lib/imageStorage'
import { renderCoverBuffers, renderPhotoBuffers } from '@/lib/derivedImagesRenderer'
import { mergeWatermarkConfig } from '@/lib/watermark'

export async function POST(request, { params }) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    ensureImageStorageDirs()

    const { id } = await params
    const { type = 'cover' } = await request.json()

    const events = readEvents()
    const eventIndex = events.findIndex((item) => item.id === id)
    if (eventIndex === -1) {
      return NextResponse.json({ error: 'Evento nao encontrado' }, { status: 404 })
    }
    const event = events[eventIndex]

    const config = mergeWatermarkConfig(readConfig(), event)
    const results = { cover: null, thumbsRegenerated: 0, errors: [] }

    if (type === 'cover' || type === 'all') {
      if (!event.coverImage) {
        results.errors.push('Nenhuma foto de capa definida para o evento.')
      } else {
    const originalPath = resolveOriginalPath({
      filename: event.coverImage,
      eventId: event.id,
      originalPath: event.coverOriginalPath,
    })
        if (!originalPath || !fs.existsSync(originalPath)) {
          results.errors.push(`Original da capa nao encontrado: ${event.coverImage}`)
        } else {
          try {
            const coverFilename = event.coverImageFile || `cover_${event.coverImage}`
            const coverPaths = buildCoverStorageFields(coverFilename, event.id)
            const cleanPath = getDerivedAbsolutePath({
              kind: 'covers',
              watermark: 'clean',
              filename: coverFilename,
              eventId: event.id,
            })
            const wmPath = getDerivedAbsolutePath({
              kind: 'covers',
              watermark: 'wm',
              filename: coverFilename,
              eventId: event.id,
            })
            const { clean: resized, wm: wmBuffer } = await renderCoverBuffers(originalPath, config)

            await Promise.all([
              cleanPath ? fs.promises.writeFile(cleanPath, resized) : Promise.resolve(),
              wmPath ? fs.promises.writeFile(wmPath, wmBuffer) : Promise.resolve(),
            ])

            events[eventIndex].coverImageFile = coverFilename
            events[eventIndex].coverImagePathClean = coverPaths.coverImagePathClean || null
            events[eventIndex].coverImagePathWm = coverPaths.coverImagePathWm || null
            writeEvents(events)

            results.cover = coverFilename
          } catch (err) {
            results.errors.push(`Erro ao gerar capa: ${err.message}`)
          }
        }
      }
    }

    if (type === 'thumbs' || type === 'all') {
      const photos = readPhotos().filter((photo) => photo.eventId === id && !photo.removida)

      for (const photo of photos) {
      const originalPath = resolveOriginalPath(photo)
        if (!originalPath || !fs.existsSync(originalPath)) {
          results.errors.push(`Original nao encontrado: ${photo.filename}`)
          continue
        }

        try {
          const buffers = await renderPhotoBuffers(originalPath, config)

          const thumbCleanPath = getDerivedAbsolutePath({
            kind: 'thumbs',
            watermark: 'clean',
            filename: photo.filename,
            eventId: photo.eventId,
          })
          const thumbWmPath = getDerivedAbsolutePath({
            kind: 'thumbs',
            watermark: 'wm',
            filename: photo.filename,
            eventId: photo.eventId,
          })
          const miniCleanPath = getDerivedAbsolutePath({
            kind: 'mini',
            watermark: 'clean',
            filename: photo.filename,
            eventId: photo.eventId,
          })
          const miniWmPath = getDerivedAbsolutePath({
            kind: 'mini',
            watermark: 'wm',
            filename: photo.filename,
            eventId: photo.eventId,
          })
          await Promise.all([
            thumbCleanPath ? fs.promises.writeFile(thumbCleanPath, buffers.thumbs.clean) : Promise.resolve(),
            thumbWmPath ? fs.promises.writeFile(thumbWmPath, buffers.thumbs.wm) : Promise.resolve(),
            miniCleanPath ? fs.promises.writeFile(miniCleanPath, buffers.mini.clean) : Promise.resolve(),
            miniWmPath ? fs.promises.writeFile(miniWmPath, buffers.mini.wm) : Promise.resolve(),
          ])
          results.thumbsRegenerated += 1
        } catch (err) {
          results.errors.push(`Erro em ${photo.filename}: ${err.message}`)
        }
      }
    }

    return NextResponse.json({ success: true, ...results })
  } catch (error) {
    console.error('Erro ao regenerar imagens:', error)
    return NextResponse.json({ error: 'Erro ao regenerar imagens: ' + error.message }, { status: 500 })
  }
}
