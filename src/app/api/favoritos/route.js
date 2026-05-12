import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { checkRateLimit } from '@/lib/rateLimit'
import { readClients, writeClients } from '@/lib/clients'

function buildFavoriteKey({ photoId, targetType, targetId, eventId }) {
  if (photoId) return String(photoId)
  if (targetType === 'photo' && targetId) return String(targetId)

  if (targetType === 'album') {
    const albumId = targetId || eventId
    if (!albumId) return null
    return `album:${String(albumId)}`
  }

  return null
}

export async function GET(request) {
  try {
    const rateLimit = checkRateLimit(request, {
      key: 'favoritos:get',
      limit: 120,
      windowMs: 60 * 1000,
      message: 'Muitas consultas de favoritos em pouco tempo.',
    })
    if (!rateLimit.allowed) return rateLimit.response

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')

    if (!clientId) {
      return NextResponse.json(
        { error: 'Parâmetro clientId é obrigatório.' },
        { status: 400 }
      )
    }

    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    if (auth.payload.id !== clientId && !auth.payload.isAdmin) {
      return NextResponse.json({ error: 'Sem permissao para acessar favoritos deste cliente.' }, { status: 403 })
    }

    const clients = readClients()
    const client = clients.find(c => c.id === clientId)

    if (!client) {
      return NextResponse.json(
        { error: 'Cliente não encontrado.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ favoritos: client.favoritos || [] })
  } catch (error) {
    console.error('Erro ao buscar favoritos:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  try {
    const rateLimit = checkRateLimit(request, {
      key: 'favoritos:post',
      limit: 60,
      windowMs: 60 * 1000,
      message: 'Muitas alteracoes de favoritos em pouco tempo.',
    })
    if (!rateLimit.allowed) return rateLimit.response

    const body = await request.json()
    const { clientId } = body
    const favoriteKey = buildFavoriteKey(body)

    if (!clientId || !favoriteKey) {
      return NextResponse.json(
        { error: 'clientId e destino para salvar são obrigatórios.' },
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

    const clients = readClients()
    const index = clients.findIndex(c => c.id === clientId)

    if (index === -1) {
      return NextResponse.json(
        { error: 'Cliente não encontrado.' },
        { status: 404 }
      )
    }

    if (!Array.isArray(clients[index].favoritos)) {
      clients[index].favoritos = []
    }

    const favIndex = clients[index].favoritos.indexOf(favoriteKey)
    if (favIndex === -1) {
      clients[index].favoritos.push(favoriteKey)
    } else {
      clients[index].favoritos.splice(favIndex, 1)
    }

    clients[index].atualizadoEm = new Date().toISOString()
    writeClients(clients)

    return NextResponse.json({
      favoritos: clients[index].favoritos,
      target: favoriteKey,
    })
  } catch (error) {
    console.error('Erro ao alternar favorito:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}
