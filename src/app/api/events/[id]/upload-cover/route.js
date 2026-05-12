import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { PUBLIC_UPLOADS_DIR } from '@/lib/imageStorage'
import { sanitizeEventBucket } from '@/lib/imagePaths'
import path from 'path'
import fs from 'fs'

export async function POST(request, { params }) {
  try {
    const auth = await requireAuth({ requireAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    const { id } = await params
    const safeEventId = sanitizeEventBucket(id)
    if (!safeEventId) {
      return NextResponse.json({ error: 'Evento inválido' }, { status: 400 })
    }

    const ext = path.extname(file.name || '').toLowerCase() || '.jpg'
    const allowed = ['.jpg', '.jpeg', '.png', '.webp']
    if (!allowed.includes(ext)) {
      return NextResponse.json({ error: 'Tipo de arquivo não suportado' }, { status: 400 })
    }

    const filename = `cover_custom_${id}_${Date.now()}${ext}`
    const destDir = path.join(PUBLIC_UPLOADS_DIR, safeEventId)
    const destPath = path.join(destDir, filename)

    const buffer = Buffer.from(await file.arrayBuffer())
    fs.mkdirSync(destDir, { recursive: true })
    fs.writeFileSync(destPath, buffer)

    return NextResponse.json({ filename: `${safeEventId}/${filename}` })
  } catch (error) {
    console.error('Erro ao fazer upload de capa personalizada:', error)
    return NextResponse.json({ error: 'Erro ao processar upload' }, { status: 500 })
  }
}
