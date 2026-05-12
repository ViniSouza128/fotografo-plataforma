import { NextResponse } from 'next/server'
import { readClients, writeClients } from '@/lib/clients'
import { requireAuth } from '@/lib/apiAuth'
import { PRICE_MIN, PRICE_MAX } from '@/lib/price'
import { invalidateIfCartChanged, cartSignature } from '@/lib/propostas'

// DELETE /api/carrinhos?clientId=xxx
// Somente admin pode limpar carrinho de terceiros.
export async function DELETE(request) {
  try {
    const auth = await requireAuth({ requireFullAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    if (!clientId) {
      return NextResponse.json({ error: 'clientId obrigatorio.' }, { status: 400 })
    }

    const clients = readClients()
    const index = clients.findIndex(client => client.id === clientId)
    if (index === -1) {
      return NextResponse.json({ error: 'Cliente nao encontrado.' }, { status: 404 })
    }

    clients[index].carrinho = []
    clients[index].checkoutComment = null
    clients[index].atualizadoEm = new Date().toISOString()
    writeClients(clients)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const meu = searchParams.get('meu')

    // ?meu=1 -> retorna somente o carrinho do usuario autenticado
    if (meu) {
      const auth = await requireAuth()
      if (auth.error) {
        return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
      }

      const clients = readClients()
      const client = clients.find(item => item.id === auth.payload.id)
      if (!client) {
        return NextResponse.json({ error: 'Cliente nao encontrado.' }, { status: 404 })
      }

      return NextResponse.json({
        carrinho: Array.isArray(client.carrinho) ? client.carrinho : [],
        clientComment: client.checkoutComment || null,
      })
    }

    // Sem query: somente admin.
    const auth = await requireAuth({ requireFullAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const clients = readClients()
    const result = clients
      .filter(client => Array.isArray(client.carrinho) && client.carrinho.length > 0)
      .map(client => ({
        clienteId: client.id,
        id: client.id,
        nome: client.nomeCompleto,
        nomeCompleto: client.nomeCompleto,
        email: client.email,
        whatsapp: client.whatsapp,
        itens: client.carrinho,
        carrinho: client.carrinho,
        clientComment: client.checkoutComment || null,
      }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Erro ao listar carrinhos:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}

// POST /api/carrinhos — admin: ajustar preços em carrinhos existentes
// Body: { photoIds: [...], action: 'update' | 'preserve', newPrice?: number }
export async function POST(request) {
  try {
    const auth = await requireAuth({ requireFullAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const body = await request.json()
    const { photoIds, action, newPrice } = body || {}

    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return NextResponse.json({ error: 'photoIds obrigatorio.' }, { status: 400 })
    }
    if (!['update', 'preserve'].includes(action)) {
      return NextResponse.json({ error: 'Acao invalida.' }, { status: 400 })
    }

    let priceNum = null
    if (action === 'update') {
      priceNum = Number(newPrice)
      if (!Number.isFinite(priceNum) || priceNum < 0 || priceNum > PRICE_MAX || (priceNum > 0 && priceNum < PRICE_MIN)) {
        return NextResponse.json({ error: 'PreÃ§o fora da faixa permitida.' }, { status: 400 })
      }
    }

    const idSet = new Set(photoIds)
    const clients = readClients()
    let updatedCarts = 0
    let updatedItems = 0

    clients.forEach((client, idx) => {
      if (!Array.isArray(client.carrinho) || client.carrinho.length === 0) return
      let touched = false
      const nextCart = client.carrinho.map(item => {
        if (!idSet.has(item?.id)) return item
        const clone = { ...item }
        if (action === 'update') {
          clone.price = priceNum
          if (clone.priceLocked) delete clone.priceLocked
        } else if (action === 'preserve') {
          const val = Number(clone.price)
          if (Number.isFinite(val)) {
            clone.priceLocked = {
              value: val,
              lockedAt: new Date().toISOString(),
              lockedByAdmin: true,
            }
          }
        }
        touched = true
        updatedItems++
        return clone
      })
      if (touched) {
        updatedCarts++
        clients[idx].carrinho = nextCart
      }
    })

    writeClients(clients)
    return NextResponse.json({ updatedCarts, updatedItems })
  } catch (error) {
    console.error('Erro ao ajustar carrinhos:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const body = await request.json()
    const { carrinho, clientComment } = body

    if (!Array.isArray(carrinho)) {
      return NextResponse.json({ error: 'Carrinho deve ser um array.' }, { status: 400 })
    }

    const clients = readClients()
    const index = clients.findIndex(client => client.id === auth.payload.id)
    if (index === -1) {
      return NextResponse.json({ error: 'Cliente nao encontrado.' }, { status: 404 })
    }

    const existingCart = Array.isArray(clients[index].carrinho) ? clients[index].carrinho : []
    const lockedMap = new Map()
    const adminPolicyMap = new Map()
    existingCart.forEach(item => {
      if (item?.id && item?.priceLocked?.lockedByAdmin) lockedMap.set(item.id, item.priceLocked)
      if (item?.id && item?.priceChangePolicy?.decisionId) adminPolicyMap.set(item.id, item.priceChangePolicy)
    })

    const sanitizedCart = carrinho.map(item => {
      const base = { ...item }
      const locked = lockedMap.get(item?.id)
      const adminPolicy = adminPolicyMap.get(item?.id)
      if (locked) {
        base.priceLocked = locked
        if (locked.value !== undefined) base.price = locked.value
        if (locked.value !== undefined) base.priceOriginal = locked.value
        if (locked.value !== undefined) base.priceEffective = locked.value
        if (adminPolicy) base.priceChangePolicy = adminPolicy
      } else if (adminPolicy?.action === 'update_carts') {
        const value = Number(adminPolicy.newPhotoPrice)
        if (Number.isFinite(value)) {
          base.price = value
          base.priceOriginal = value
          base.priceEffective = value
        }
        base.priceChangePolicy = adminPolicy
      } else if (base.priceLocked && !base.priceLocked.lockedByAdmin) {
        delete base.priceLocked
      }
      return base
    })

    clients[index].carrinho = sanitizedCart
    if (typeof clientComment === 'string' || clientComment == null) {
      const normalizedComment = String(clientComment || '').trim()
      clients[index].checkoutComment = normalizedComment || null
    }
    clients[index].atualizadoEm = new Date().toISOString()
    writeClients(clients)

    // Invalida propostas ativas se a assinatura mudou
    try {
      const sig = cartSignature(sanitizedCart)
      invalidateIfCartChanged(auth.payload.id, sig)
    } catch {}

    return NextResponse.json({
      carrinho: clients[index].carrinho,
      clientComment: clients[index].checkoutComment || null,
    })
  } catch (error) {
    console.error('Erro ao salvar carrinho:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
