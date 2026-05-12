import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { checkRateLimit } from '@/lib/rateLimit'
import { readClients, writeClients } from '@/lib/clients'

export async function GET(request) {
  try {
    const rateLimit = checkRateLimit(request, {
      key: 'curtidas:get',
      limit: 180,
      windowMs: 60 * 1000,
      message: 'Muitas consultas de curtidas em pouco tempo.',
    })
    if (!rateLimit.allowed) return rateLimit.response

    const { searchParams } = new URL(request.url)
    const photoId = searchParams.get('photoId')
    const clientId = searchParams.get('clientId')

    if (!photoId && !clientId) {
      return NextResponse.json(
        { error: 'Parâmetro photoId ou clientId é obrigatório.' },
        { status: 400 }
      )
    }

    const clients = readClients()

    if (photoId) {
      const count = clients.filter(
        c => Array.isArray(c.curtidas) && c.curtidas.includes(photoId)
      ).length

      return NextResponse.json({ photoId, count })
    }

    // clientId case
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    if (auth.payload.id !== clientId && !auth.payload.isAdmin) {
      return NextResponse.json({ error: 'Sem permissao para acessar curtidas deste cliente.' }, { status: 403 })
    }

    const client = clients.find(c => c.id === clientId)

    if (!client) {
      return NextResponse.json(
        { error: 'Cliente não encontrado.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ curtidas: client.curtidas || [] })
  } catch (error) {
    console.error('Erro ao buscar curtidas:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  try {
    const rateLimit = checkRateLimit(request, {
      key: 'curtidas:post',
      limit: 60,
      windowMs: 60 * 1000,
      message: 'Muitas curtidas em pouco tempo.',
    })
    if (!rateLimit.allowed) return rateLimit.response

    const body = await request.json()
    const { clientId, photoId } = body

    if (!clientId || !photoId) {
      return NextResponse.json(
        { error: 'clientId e photoId são obrigatórios.' },
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

    if (!Array.isArray(clients[index].curtidas)) {
      clients[index].curtidas = []
    }

    const curtidaIndex = clients[index].curtidas.indexOf(photoId)
    if (curtidaIndex === -1) {
      clients[index].curtidas.push(photoId)
    } else {
      clients[index].curtidas.splice(curtidaIndex, 1)
    }

    clients[index].atualizadoEm = new Date().toISOString()
    writeClients(clients)

    // Count total likes for this photo across all clients
    const totalCount = clients.filter(
      c => Array.isArray(c.curtidas) && c.curtidas.includes(photoId)
    ).length

    return NextResponse.json({
      curtidas: clients[index].curtidas,
      totalCount,
    })
  } catch (error) {
    console.error('Erro ao alternar curtida:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}
