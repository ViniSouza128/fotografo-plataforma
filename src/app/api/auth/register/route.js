import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { hashPassword, createToken } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rateLimit'
import {
  readClients,
  writeClients,
  findClientByEmail,
  findClientByWhatsapp,
  normalizeEmail,
  normalizeWhatsapp,
} from '@/lib/clients'
import { validarCPF } from '@/lib/cpf'
import { validarCNPJ, normalizarCNPJ } from '@/lib/cnpj'

function documentMatches(client, documentDigits) {
  if (!documentDigits) return false
  return String(client.cpf || '').replace(/\D/g, '') === documentDigits ||
    String(client.cnpj || '').replace(/\D/g, '') === documentDigits
}

export async function POST(request) {
  try {
    const rateLimit = checkRateLimit(request, {
      key: 'auth:register',
      limit: 5,
      windowMs: 10 * 60 * 1000,
      message: 'Muitas tentativas de cadastro neste dispositivo.',
    })
    if (!rateLimit.allowed) return rateLimit.response

    const body = await request.json()
    const { nomeCompleto, email, whatsapp, cpf, cnpj, documentType, dataNascimento, senha, acceptsPrivacyPolicy } = body
    const effectiveDocumentType = documentType === 'cnpj' || cnpj ? 'cnpj' : 'cpf'

    if (!nomeCompleto || !email || !whatsapp || !(cpf || cnpj) || !dataNascimento || !senha) {
      return NextResponse.json(
        { error: 'Todos os campos sao obrigatorios.' },
        { status: 400 }
      )
    }

    if (acceptsPrivacyPolicy !== true) {
      return NextResponse.json(
        { error: 'Aceite a politica de privacidade para criar a conta.' },
        { status: 400 }
      )
    }

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

    const normalizedEmail = normalizeEmail(email)
    const normalizedWhatsapp = normalizeWhatsapp(whatsapp)

    const existingEmail = findClientByEmail(normalizedEmail)
    if (existingEmail) {
      return NextResponse.json(
        { error: 'Este e-mail ja esta cadastrado.' },
        { status: 409 }
      )
    }

    const existingWhatsapp = findClientByWhatsapp(normalizedWhatsapp)
    if (existingWhatsapp) {
      return NextResponse.json(
        { error: 'Este WhatsApp ja esta cadastrado.' },
        { status: 409 }
      )
    }

    const clients = readClients()
    const existingDocument = clients.find(client => documentMatches(client, documentDigits))
    if (existingDocument) {
      return NextResponse.json(
        { error: `Este ${effectiveDocumentType === 'cnpj' ? 'CNPJ' : 'CPF'} ja esta cadastrado.` },
        { status: 409 }
      )
    }

    const senhaHash = hashPassword(senha)
    const now = new Date().toISOString()
    const newClient = {
      id: crypto.randomUUID(),
      nomeCompleto,
      email: normalizedEmail,
      whatsapp: normalizedWhatsapp,
      cpf: documentDigits,
      cnpj: effectiveDocumentType === 'cnpj' ? documentDigits : null,
      documentType: effectiveDocumentType,
      dataNascimento,
      instagram: '',
      enderecoCompleto: '',
      cidade: '',
      estado: '',
      times: [],
      organizacoes: [],
      senha: senhaHash,
      ativo: true,
      sessionVersion: 0,
      mustChangePassword: false,
      favoritos: [],
      curtidas: [],
      carrinho: [],
      privacyPolicyAcceptedAt: now,
      privacyPolicyVersion: '2026-05',
      criadoEm: now,
      atualizadoEm: now,
    }

    clients.push(newClient)
    writeClients(clients)

    const token = createToken({
      id: newClient.id,
      email: newClient.email,
      sessionVersion: newClient.sessionVersion,
      mustChangePassword: newClient.mustChangePassword,
    })

    const { senha: _, ...clientData } = newClient

    const response = NextResponse.json(
      { client: clientData, token },
      { status: 201 }
    )

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    })

    return response
  } catch (error) {
    console.error('Erro no registro:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}
