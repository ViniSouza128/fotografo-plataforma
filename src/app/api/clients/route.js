import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import {
  normalizeEmail,
  normalizeWhatsapp,
  readClients,
  writeClients,
} from '@/lib/clients'
import { validarCPF } from '@/lib/cpf'
import { validarCNPJ, normalizarCNPJ } from '@/lib/cnpj'

function normalizeText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeInstagram(value) {
  return normalizeText(value).replace(/^@+/, '')
}

function normalizeStringList(value, maxItems = 10) {
  if (!Array.isArray(value)) return []
  return value
    .map(item => normalizeText(item))
    .filter(Boolean)
    .slice(0, maxItems)
}

function documentMatches(client, documentDigits) {
  if (!documentDigits) return false
  return String(client.cpf || '').replace(/\D/g, '') === documentDigits ||
    String(client.cnpj || '').replace(/\D/g, '') === documentDigits
}

export async function GET() {
  try {
    const auth = await requireAuth({ requireFullAdmin: true })
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      )
    }

    const clients = readClients()

    // Remove senha from each client and sort by criadoEm DESC
    const result = clients
      .map(({ senha, ...rest }) => rest)
      .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Erro ao listar clientes:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      )
    }

    const { payload } = auth
    const body = await request.json()
    const {
      id,
      nomeCompleto,
      email,
      whatsapp,
      dataNascimento,
      cpf,
      cnpj,
      documentType,
      instagram,
      enderecoCompleto,
      enderecoRua,
      enderecoNumero,
      enderecoBairro,
      enderecoCidade,
      enderecoEstado,
      enderecoCep,
      cidade,
      estado,
      times,
      organizacoes,
      escolasOuOrganizacoes,
      emailPrefs,
    } = body

    if (!id) {
      return NextResponse.json(
        { error: 'ID do cliente é obrigatório.' },
        { status: 400 }
      )
    }

    // Check if the token belongs to the client or is admin
    if (payload.id !== id && !payload.isAdmin) {
      return NextResponse.json(
        { error: 'Sem permissão para atualizar este perfil.' },
        { status: 403 }
      )
    }

    const clients = readClients()
    const index = clients.findIndex(c => c.id === id)

    if (index === -1) {
      return NextResponse.json(
        { error: 'Cliente não encontrado.' },
        { status: 404 }
      )
    }

    // Duplicidade de e-mail/WhatsApp
    if (email !== undefined) {
      const normalized = normalizeEmail(email)
      const emailExistente = clients.find(c => c.id !== id && normalizeEmail(c.email) === normalized)
      if (emailExistente) {
        return NextResponse.json(
          { error: 'Este e-mail já está cadastrado.' },
          { status: 409 }
        )
      }
      clients[index].email = normalized
    }

    if (whatsapp !== undefined) {
      const normalized = normalizeWhatsapp(whatsapp)
      const whatsappExistente = clients.find(c => c.id !== id && normalizeWhatsapp(c.whatsapp) === normalized)
      if (whatsappExistente) {
        return NextResponse.json(
          { error: 'Este WhatsApp já está cadastrado.' },
          { status: 409 }
        )
      }
      clients[index].whatsapp = normalized
    }

    // Update only provided fields
    if (nomeCompleto !== undefined) clients[index].nomeCompleto = nomeCompleto
    if (dataNascimento !== undefined) clients[index].dataNascimento = dataNascimento
    if (cpf !== undefined || cnpj !== undefined || documentType !== undefined) {
      const effectiveDocumentType = documentType === 'cnpj' || cnpj ? 'cnpj' : 'cpf'
      const documentDigits = effectiveDocumentType === 'cnpj'
        ? normalizarCNPJ(cnpj || cpf)
        : String(cpf || '').replace(/\D/g, '').slice(0, 11)
      const documentValid = effectiveDocumentType === 'cnpj'
        ? validarCNPJ(documentDigits)
        : validarCPF(documentDigits)
      if (!documentValid) {
        return NextResponse.json(
          { error: `${effectiveDocumentType === 'cnpj' ? 'CNPJ' : 'CPF'} invalido.` },
          { status: 400 }
        )
      }
      const existingDocument = clients.find(c => c.id !== id && documentMatches(c, documentDigits))
      if (existingDocument) {
        return NextResponse.json(
          { error: `Este ${effectiveDocumentType === 'cnpj' ? 'CNPJ' : 'CPF'} ja esta cadastrado.` },
          { status: 409 }
        )
      }
      clients[index].cpf = documentDigits
      clients[index].cnpj = effectiveDocumentType === 'cnpj' ? documentDigits : null
      clients[index].documentType = effectiveDocumentType
    }
    if (instagram !== undefined) clients[index].instagram = normalizeInstagram(instagram)
    if (enderecoCompleto !== undefined) clients[index].enderecoCompleto = normalizeText(enderecoCompleto)
    if (enderecoRua !== undefined) clients[index].enderecoRua = normalizeText(enderecoRua)
    if (enderecoNumero !== undefined) clients[index].enderecoNumero = normalizeText(enderecoNumero)
    if (enderecoBairro !== undefined) clients[index].enderecoBairro = normalizeText(enderecoBairro)
    if (enderecoCidade !== undefined) clients[index].enderecoCidade = normalizeText(enderecoCidade)
    if (enderecoEstado !== undefined) clients[index].enderecoEstado = normalizeText(enderecoEstado)
    if (enderecoCep !== undefined) clients[index].enderecoCep = normalizeText(enderecoCep).replace(/\D/g, '').slice(0, 8)
    if (cidade !== undefined) clients[index].cidade = normalizeText(cidade)
    if (estado !== undefined) clients[index].estado = normalizeText(estado)
    if (emailPrefs !== undefined && emailPrefs && typeof emailPrefs === 'object') {
      const allowed = ['compra', 'pago', 'remocao', 'reembolso', 'senhaAlterada']
      const normalized = {}
      for (const k of allowed) {
        if (k in emailPrefs) normalized[k] = !!emailPrefs[k]
      }
      clients[index].emailPrefs = { ...(clients[index].emailPrefs || {}), ...normalized }
    }

    // Compatibilidade: aceita os dois nomes para o mesmo campo.
    const sourceOrganizacoes = escolasOuOrganizacoes !== undefined
      ? escolasOuOrganizacoes
      : organizacoes

    if (times !== undefined) clients[index].times = normalizeStringList(times, 10)
    if (sourceOrganizacoes !== undefined) {
      clients[index].organizacoes = normalizeStringList(sourceOrganizacoes, 10)
    }
    clients[index].atualizadoEm = new Date().toISOString()

    writeClients(clients)

    const { senha, ...clientData } = clients[index]
    return NextResponse.json(clientData)
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}
