// src/app/api/avaliacoes/route.js

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { checkRateLimit } from '@/lib/rateLimit'
import { readAvaliacoes, writeAvaliacoes } from '../../../lib/avaliacoes'

// GET /api/avaliacoes?photoId=xxx  — ratings for a photo + average
// GET /api/avaliacoes?clientId=xxx — all ratings by a client
export async function GET(request) {
  try {
    const rateLimit = checkRateLimit(request, {
      key: 'avaliacoes:get',
      limit: 120,
      windowMs: 60 * 1000,
      message: 'Muitas consultas de avaliacoes em pouco tempo.',
    })
    if (!rateLimit.allowed) return rateLimit.response

    const { searchParams } = new URL(request.url)
    const photoId = searchParams.get('photoId')
    const clientId = searchParams.get('clientId')

    const avaliacoes = readAvaliacoes()

    if (photoId) {
      const ratings = avaliacoes.filter(a => a.photoId === photoId)
      const total = ratings.length
      const media = total > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / total
        : 0

      return NextResponse.json({ ratings, media: Math.round(media * 100) / 100, total })
    }

    if (clientId) {
      const auth = await requireAuth()
      if (auth.error) {
        return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
      }
      if (auth.payload.id !== clientId && !auth.payload.isAdmin) {
        return NextResponse.json({ error: 'Sem permissao para acessar avaliacoes deste cliente.' }, { status: 403 })
      }

      const ratings = avaliacoes.filter(a => a.clientId === clientId)
      return NextResponse.json({ ratings })
    }

    return NextResponse.json({ error: 'photoId ou clientId obrigatório' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Erro ao ler avaliações' }, { status: 500 })
  }
}

// POST /api/avaliacoes
// Body: { clientId, photoId, rating }  — rating de 1 a 5
// Se o cliente já avaliou essa foto, atualiza a nota existente.
export async function POST(request) {
  try {
    const rateLimit = checkRateLimit(request, {
      key: 'avaliacoes:post',
      limit: 30,
      windowMs: 60 * 1000,
      message: 'Muitas avaliacoes enviadas em pouco tempo.',
    })
    if (!rateLimit.allowed) return rateLimit.response

    const body = await request.json()
    const { clientId, photoId, rating } = body

    if (!clientId || !photoId || rating == null) {
      return NextResponse.json(
        { error: 'clientId, photoId e rating são obrigatórios' },
        { status: 400 }
      )
    }

    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    if (auth.payload.id !== clientId && !auth.payload.isAdmin) {
      return NextResponse.json({ error: 'clientId invalido para o usuario autenticado.' }, { status: 403 })
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'rating deve ser um inteiro entre 1 e 5' },
        { status: 400 }
      )
    }

    const avaliacoes = readAvaliacoes()
    const idx = avaliacoes.findIndex(a => a.clientId === clientId && a.photoId === photoId)

    let avaliacao

    if (idx !== -1) {
      // Atualiza avaliação existente
      avaliacoes[idx].rating = rating
      avaliacao = avaliacoes[idx]
    } else {
      // Cria nova avaliação
      avaliacao = {
        id: crypto.randomUUID(),
        clientId,
        photoId,
        rating,
        criadoEm: new Date().toISOString(),
      }
      avaliacoes.push(avaliacao)
    }

    writeAvaliacoes(avaliacoes)

    return NextResponse.json(avaliacao, { status: idx !== -1 ? 200 : 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro ao salvar avaliação' }, { status: 500 })
  }
}
