import sharp from 'sharp'
import { NextResponse } from 'next/server'
import { readPhotos, writePhotos } from '@/lib/photos'
import { resolveOriginalPath } from '@/lib/imageStorage'

export async function GET(_request, { params }) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'ID da foto obrigatório.' }, { status: 400 })
    }

    const photos = readPhotos()
    const index = photos.findIndex(p => p.id === id)
    if (index === -1) {
      return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 })
    }

    const current = photos[index]
    const currentWidth = Number(current.originalWidth)
    const currentHeight = Number(current.originalHeight)

    if (currentWidth > 0 && currentHeight > 0) {
      return NextResponse.json({
        originalWidth: currentWidth,
        originalHeight: currentHeight,
        megapixels: Number(((currentWidth * currentHeight) / 1_000_000).toFixed(2)),
        source: 'metadata',
      })
    }

    const originalPath = resolveOriginalPath(current)
    if (!originalPath) {
      return NextResponse.json({
        originalWidth: null,
        originalHeight: null,
        megapixels: null,
        source: 'missing',
      })
    }

    const metadata = await sharp(originalPath).metadata()
    const width = Number(metadata.width || 0)
    const height = Number(metadata.height || 0)

    if (width > 0 && height > 0) {
      photos[index] = {
        ...current,
        originalWidth: width,
        originalHeight: height,
      }
      writePhotos(photos)

      return NextResponse.json({
        originalWidth: width,
        originalHeight: height,
        megapixels: Number(((width * height) / 1_000_000).toFixed(2)),
        source: 'backfilled',
      })
    }

    return NextResponse.json({
      originalWidth: null,
      originalHeight: null,
      megapixels: null,
      source: 'unavailable',
    })
  } catch (error) {
    console.error('Erro ao resolver resolução da foto:', error)
    return NextResponse.json({ error: 'Erro ao resolver resolução.' }, { status: 500 })
  }
}
