// src/app/api/remocoes/route.js

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { checkRateLimit } from '@/lib/rateLimit'
import { readRemocoes, writeRemocoes } from '../../../lib/remocoes'
import { readPhotos, writePhotos } from '../../../lib/photos'
import { readClients, writeClients } from '../../../lib/clients'
import { applyPhotoStrategy, analyzePhotos } from '@/lib/safeDeletion'
import { appendAuditLog } from '@/lib/auditLog'
import { getEmailPrefs, sendEmailRemocao } from '@/lib/email'
import { appendNotificacao } from '@/lib/notificacoes'

const ADMIN_PATCH_FIELDS = ['status', 'comentarioAdmin', 'comentarioAdminPublico', 'acao', 'excluirDefinitivo']
const VALID_STATUSES = ['pendente', 'aceita', 'rejeitada']
const VALID_ADMIN_ACTIONS = ['excluir_definitivo']

// Validação de CPF — dígitos verificadores
function validarCPF(cpf) {
  const n = cpf.replace(/\D/g, '')
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += parseInt(n[i]) * (10 - i)
  let r1 = (s * 10) % 11; if (r1 >= 10) r1 = 0
  if (r1 !== parseInt(n[9])) return false
  s = 0
  for (let i = 0; i < 10; i++) s += parseInt(n[i]) * (11 - i)
  let r2 = (s * 10) % 11; if (r2 >= 10) r2 = 0
  return r2 === parseInt(n[10])
}

function normalizeWhatsapp(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function cleanCpf(value) {
  return String(value || '').replace(/\D/g, '')
}

function authErrorResponse(auth) {
  return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
}

function isOwnedByClient(item, client) {
  if (!item || !client) return false
  if (item.clientId && item.clientId === client.id) return true

  const itemCpf = cleanCpf(item.cpf)
  const clientCpf = cleanCpf(client.cpf)
  if (itemCpf && clientCpf && itemCpf === clientCpf) return true

  const itemEmail = normalizeEmail(item.contatoEmail)
  const clientEmail = normalizeEmail(client.email)
  if (itemEmail && clientEmail && itemEmail === clientEmail) return true

  const itemPhone = normalizeWhatsapp(item.contatoWhatsapp || item.contato)
  const clientPhone = normalizeWhatsapp(client.whatsapp)
  return !!(itemPhone && clientPhone && itemPhone === clientPhone)
}

function findClientForRemoval(item, clients = readClients()) {
  if (!item) return null
  if (item.clientId) {
    const byId = clients.find(client => client.id === item.clientId)
    if (byId) return byId
  }

  const cpf = cleanCpf(item.cpf)
  if (cpf) {
    const byCpf = clients.find(client => cleanCpf(client.cpf) === cpf)
    if (byCpf) return byCpf
  }

  const email = normalizeEmail(item.contatoEmail)
  if (email) {
    const byEmail = clients.find(client => normalizeEmail(client.email) === email)
    if (byEmail) return byEmail
  }

  const phone = normalizeWhatsapp(item.contatoWhatsapp || item.contato)
  if (phone) {
    return clients.find(client => normalizeWhatsapp(client.whatsapp) === phone) || null
  }

  return null
}

function buildClientSummary(client) {
  if (!client) return null
  return {
    id: client.id,
    nome: client.nomeCompleto || client.nome || null,
    email: client.email || null,
    whatsapp: client.whatsapp || null,
  }
}

function appendHistory(item, field, value, actor) {
  const text = String(value || '').trim()
  if (!text) return
  const historyField = `${field}Historico`
  const current = Array.isArray(item[historyField]) ? item[historyField] : []
  item[historyField] = [
    ...current,
    {
      texto: text,
      criadoEm: new Date().toISOString(),
      autorId: actor?.id || null,
      autorNome: actor?.nome || null,
      admin: !!actor?.admin,
    },
  ]
}

function findLinkedPhoto(item, photos = readPhotos()) {
  const byPhotoId = new Map(photos.map((photo) => [String(photo.id), photo]))
  const byPublicId = new Map(photos.map((photo) => [String(photo.publicId), photo]))
  return byPhotoId.get(String(item.photoId || '')) || byPublicId.get(String(item.publicId || '')) || null
}

function limparReferenciasDeFoto(photoId) {
  if (!photoId) return
  const clients = readClients()
  let mudou = false

  const updated = clients.map((client) => {
    let alterou = false
    const clone = { ...client }

    if (Array.isArray(clone.favoritos) && clone.favoritos.includes(photoId)) {
      clone.favoritos = clone.favoritos.filter(id => id !== photoId)
      alterou = true
    }

    if (Array.isArray(clone.curtidas) && clone.curtidas.includes(photoId)) {
      clone.curtidas = clone.curtidas.filter(id => id !== photoId)
      alterou = true
    }

    if (Array.isArray(clone.carrinho) && clone.carrinho.some(item => (item?.id || item?.photoId) === photoId)) {
      clone.carrinho = clone.carrinho.filter(item => (item?.id || item?.photoId) !== photoId)
      alterou = true
    }

    if (alterou) {
      clone.atualizadoEm = new Date().toISOString()
      mudou = true
    }
    return clone
  })

  if (mudou) writeClients(updated)
}

function buildPermanentDeleteBlockedResponse(analysis) {
  const vinculos = analysis?.importantes?.[0]?.vinculos || {}
  const detalhes = [
    vinculos.compras ? `${vinculos.compras} compra(s)` : null,
    vinculos.carrinhos ? `${vinculos.carrinhos} carrinho(s)` : null,
    vinculos.favoritos ? `${vinculos.favoritos} favorito(s)` : null,
    vinculos.curtidas ? `${vinculos.curtidas} curtida(s)` : null,
  ].filter(Boolean).join(', ')

  return NextResponse.json(
    {
      error: detalhes
        ? `Exclusao definitiva bloqueada: ainda ha ${detalhes}.`
        : 'Exclusao definitiva bloqueada: ainda ha vinculos importantes.',
      reason: 'permanent_not_safe',
      analysis,
    },
    { status: 409 }
  )
}

// GET /api/remocoes
export async function GET(request) {
  try {
    const rateLimit = checkRateLimit(request, {
      key: 'remocoes:get',
      limit: 60,
      windowMs: 60 * 1000,
      message: 'Muitas consultas de remocoes em pouco tempo.',
    })
    if (!rateLimit.allowed) return rateLimit.response

    const auth = await requireAuth()
    if (auth.error) return authErrorResponse(auth)

    const items = readRemocoes()
    const photos = readPhotos()
    const clients = readClients()
    const visibleItems = auth.payload.isAdmin
      ? items
      : items.filter((item) => isOwnedByClient(item, auth.client))

    const enriched = visibleItems.map((item) => {
      const linkedPhoto = findLinkedPhoto(item, photos)
      const linkedClient = findClientForRemoval(item, clients)
      return {
        ...item,
        clientId: item.clientId || linkedClient?.id || null,
        cliente: buildClientSummary(linkedClient),
        photoId: item.photoId || linkedPhoto?.id || null,
        publicId: item.publicId || linkedPhoto?.publicId || null,
        eventId: linkedPhoto?.eventId || item.eventId || null,
        originalFilename: item.filename || linkedPhoto?.originalName || null,
        storedFilename: linkedPhoto?.filename || null,
        storedFilenameWm: linkedPhoto?.filenameWm || null,
        storedFilenameThumb: linkedPhoto?.filenameThumb || null,
        storedFilenameMini: linkedPhoto?.filenameMini || null,
        pathGridWm: linkedPhoto?.pathGridWm || null,
        pathGridClean: linkedPhoto?.pathGridClean || null,
        pathThumbWm: linkedPhoto?.pathThumbWm || null,
        pathThumbClean: linkedPhoto?.pathThumbClean || null,
        pathMiniClean: linkedPhoto?.pathMiniClean || null,
        fotoRemovida: !!linkedPhoto?.removida,
        fotoOrfaFuncional: !!linkedPhoto?.orfaoFuncional,
        fotoExiste: !!linkedPhoto,
      }
    })
    enriched.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
    return NextResponse.json(enriched)
  } catch {
    return NextResponse.json({ error: 'Erro ao ler solicitações' }, { status: 500 })
  }
}

// POST /api/remocoes
// Body: { photoId, publicId, eventName, filename, nome, cpf, contato?, contatoWhatsapp?, contatoEmail?, motivo }
export async function POST(request) {
  try {
    const rateLimit = checkRateLimit(request, {
      key: 'remocoes:post',
      limit: 5,
      windowMs: 60 * 60 * 1000,
      message: 'Muitas solicitacoes de remocao foram enviadas recentemente.',
    })
    if (!rateLimit.allowed) return rateLimit.response

    const body = await request.json()
    const {
      photoId, publicId, eventName, filename, nome, cpf, motivo, clientId,
      contato, contatoWhatsapp, contatoEmail,
    } = body

    const nomeLimpo = String(nome || '').trim()
    const cpfLimpo = String(cpf || '').replace(/\D/g, '')
    const contatoRaw = String(contato || '').trim()
    const whatsappLimpo = normalizeWhatsapp(contatoWhatsapp || (!contatoRaw.includes('@') ? contatoRaw : ''))
    const emailLimpo = normalizeEmail(contatoEmail || (contatoRaw.includes('@') ? contatoRaw : ''))
    const motivoLimpo = String(motivo || '').trim()
    const contatoLegado = whatsappLimpo || emailLimpo || contatoRaw

    if (!nomeLimpo || !cpfLimpo || !motivoLimpo) {
      return NextResponse.json({ error: 'nome, CPF e motivo são obrigatórios' }, { status: 400 })
    }

    if (!whatsappLimpo && !emailLimpo && !contatoLegado) {
      return NextResponse.json({ error: 'Informe WhatsApp ou e-mail para contato' }, { status: 400 })
    }

    if (!validarCPF(cpfLimpo))
      return NextResponse.json({ error: 'CPF inválido. Informe um CPF real.' }, { status: 400 })

    if (emailLimpo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpo)) {
      return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
    }

    if (clientId) {
      const auth = await requireAuth()
      if (auth.error) return authErrorResponse(auth)
      if (auth.payload.id !== clientId && !auth.payload.isAdmin) {
        return NextResponse.json({ error: 'clientId invalido para o usuario autenticado.' }, { status: 403 })
      }
    }

    const items = readRemocoes()
    const linkedClient = clientId
      ? readClients().find(client => client.id === clientId)
      : findClientForRemoval({
          cpf: cpfLimpo,
          contato: contatoLegado,
          contatoWhatsapp: whatsappLimpo || null,
          contatoEmail: emailLimpo || null,
        })

    const nova = {
      id: crypto.randomUUID(),
      photoId:         photoId   || null,
      publicId:        publicId  || null,
      eventName:       eventName || null,
      filename:        filename  || null,
      nome:            nomeLimpo,
      cpf:             cpfLimpo,
      contato:         contatoLegado,
      contatoWhatsapp: whatsappLimpo || null,
      contatoEmail:    emailLimpo || null,
      motivo:          motivoLimpo,
      clientId:        clientId || linkedClient?.id || null,
      clienteSnapshot: buildClientSummary(linkedClient),
      notasCliente:    '',
      notasClienteHistorico: [],
      status:          'pendente',   // pendente | aceita | rejeitada
      comentarioAdmin: '',
      comentarioAdminPublico: '',
      comentarioAdminHistorico: [],
      comentarioAdminPublicoHistorico: [],
      criadoEm:        new Date().toISOString(),
      resolvidoEm:     null,
      fisicamenteExcluidaEm: null,
      exclusaoDefinitiva: null,
    }

    items.push(nova)
    writeRemocoes(items)

    // Notify admin (fire-and-forget)
    try {
      appendNotificacao({
        tipo: 'remocao',
        destinatario: 'admin',
        titulo: 'Solicitação de remoção de foto',
        mensagem: `${nomeLimpo} solicitou a remoção de uma foto.`,
        link: '/admin/remocoes',
      })
    } catch {}

    // Fire-and-forget: notify client via email
    const emailTo = emailLimpo || linkedClient?.email || null
    if (emailTo) {
      const emailPrefs = getEmailPrefs(linkedClient)
      if (emailPrefs.remocao) {
        sendEmailRemocao({
          to: emailTo,
          nome: nomeLimpo,
          status: 'pendente',
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
        }).catch(() => {})
      }
    }

    return NextResponse.json(nova, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Erro ao salvar solicitação' }, { status: 500 })
  }
}

// PATCH /api/remocoes
// { id, status?, comentarioAdmin?, comentarioAdminPublico?, notasCliente? }
// status = 'aceita'    → marca foto como removida em photos.json
// status = 'rejeitada' → apenas registra
// status = 'pendente'  → desfaz (restaura foto se estava aceita)
export async function PATCH(request) {
  try {
    const rateLimit = checkRateLimit(request, {
      key: 'remocoes:patch',
      limit: 30,
      windowMs: 60 * 1000,
      message: 'Muitas atualizacoes de remocao em pouco tempo.',
    })
    if (!rateLimit.allowed) return rateLimit.response

    const body = await request.json()
    const { id, status, comentarioAdmin, acao } = body
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

    const hasAdminFields = ADMIN_PATCH_FIELDS.some((field) => body[field] !== undefined)
    const hasClientNote = body.notasCliente !== undefined || body.notaClienteAdicionar !== undefined

    if (!hasAdminFields && !hasClientNote) {
      return NextResponse.json({ error: 'Nenhum campo permitido informado.' }, { status: 400 })
    }

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Status de remocao invalido.' }, { status: 400 })
    }
    if (acao !== undefined && !VALID_ADMIN_ACTIONS.includes(acao)) {
      return NextResponse.json({ error: 'Acao de remocao invalida.' }, { status: 400 })
    }

    const auth = await requireAuth(hasAdminFields ? { requireAdmin: true } : {})
    if (auth.error) return authErrorResponse(auth)

    const items = readRemocoes()
    const idx   = items.findIndex(i => i.id === id)
    if (idx === -1) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })

    const item        = items[idx]
    const statusAntes = item.status

    if (!auth.payload.isAdmin && !isOwnedByClient(item, auth.client)) {
      return NextResponse.json({ error: 'Sem permissao para atualizar esta solicitacao.' }, { status: 403 })
    }

    if (auth.payload.isAdmin && !item.clientId) {
      const linkedClient = findClientForRemoval(item)
      if (linkedClient) {
        item.clientId = linkedClient.id
        item.clienteSnapshot = buildClientSummary(linkedClient)
      }
    }

    if (acao === 'excluir_definitivo' || body.excluirDefinitivo === true) {
      if (item.status !== 'aceita') {
        return NextResponse.json(
          { error: 'Aceite a solicitacao antes de excluir arquivos definitivamente.' },
          { status: 409 }
        )
      }
      if (!item.photoId && !item.publicId) {
        return NextResponse.json({ error: 'Solicitacao sem foto vinculada.' }, { status: 400 })
      }
      if (item.fisicamenteExcluidaEm) {
        return NextResponse.json(item)
      }

      const linkedPhoto = findLinkedPhoto(item)
      if (!linkedPhoto) {
        item.fisicamenteExcluidaEm = item.fisicamenteExcluidaEm || new Date().toISOString()
        item.exclusaoDefinitiva = item.exclusaoDefinitiva || {
          status: 'foto_ja_indisponivel',
          registradoEm: item.fisicamenteExcluidaEm,
        }
        items[idx] = item
        writeRemocoes(items)
        appendAuditLog({
          action: 'removal.permanent_delete',
          actor: auth.client || auth.payload,
          target: { type: 'remocao', id: item.id, publicId: item.publicId, label: item.nome },
          details: { status: 'foto_ja_indisponivel', photoId: item.photoId || null },
          request,
        })
        return NextResponse.json(item)
      }

      limparReferenciasDeFoto(linkedPhoto.id)
      const analysis = analyzePhotos({ photoIds: [linkedPhoto.id] })
      if (analysis.totalImportantes > 0) {
        return buildPermanentDeleteBlockedResponse(analysis)
      }

      const result = applyPhotoStrategy({
        photoIds: [linkedPhoto.id],
        strategy: 'agressivo',
        permanent: true,
      })

      if (result.rejectedPermanent) {
        return buildPermanentDeleteBlockedResponse(result.analysis || analysis)
      }

      item.photoId = linkedPhoto.id
      item.publicId = item.publicId || linkedPhoto.publicId || null
      item.fisicamenteExcluidaEm = new Date().toISOString()
      item.exclusaoDefinitiva = {
        executadaEm: item.fisicamenteExcluidaEm,
        adminId: auth.payload.id || null,
        adminNome: auth.client?.nomeCompleto || auth.client?.nome || auth.client?.email || null,
        trashBatchId: result.trashBatchId || null,
        removed: result.removed || 0,
        preserved: result.preserved || 0,
      }
      items[idx] = item
      writeRemocoes(items)
      appendAuditLog({
        action: 'removal.permanent_delete',
        actor: auth.client || auth.payload,
        target: { type: 'remocao', id: item.id, publicId: item.publicId, label: item.nome },
        details: {
          photoId: linkedPhoto.id,
          trashBatchId: result.trashBatchId || null,
          removed: result.removed || 0,
          preserved: result.preserved || 0,
        },
        request,
      })
      return NextResponse.json(item)
    }

    if (status !== undefined) {
      item.status      = status
      item.resolvidoEm = status !== 'pendente' ? new Date().toISOString() : null

      // Aceitar → marca foto como removida e limpa referências do cliente
      if (status === 'aceita') {
        const linkedPhoto = findLinkedPhoto(item)
        if (linkedPhoto) {
          item.photoId = linkedPhoto.id
          item.publicId = item.publicId || linkedPhoto.publicId || null
        }
        const photos = readPhotos()
        const pidx   = photos.findIndex(p => p.id === item.photoId)
        if (pidx !== -1) {
          photos[pidx].removida   = true
          photos[pidx].removidaEm = new Date().toISOString()
          writePhotos(photos)
        }
        limparReferenciasDeFoto(item.photoId)
      }

      // Desfazer aceitação → restaura foto (mas não re-adiciona em listas antigas)
      if (status === 'pendente' && statusAntes === 'aceita' && item.photoId) {
        if (item.fisicamenteExcluidaEm) {
          return NextResponse.json(
            { error: 'Nao e possivel restaurar pela solicitacao: os arquivos ja foram excluidos definitivamente.' },
            { status: 409 }
          )
        }
        const photos = readPhotos()
        const pidx   = photos.findIndex(p => p.id === item.photoId)
        if (pidx !== -1) {
          photos[pidx].removida   = false
          photos[pidx].removidaEm = null
          writePhotos(photos)
        }
      }
    }

    const actor = {
      id: auth.payload.id || null,
      nome: auth.client?.nomeCompleto || auth.client?.nome || auth.client?.email || null,
      admin: !!auth.payload.isAdmin,
    }

    if (comentarioAdmin !== undefined) {
      item.comentarioAdmin = comentarioAdmin
      appendHistory(item, 'comentarioAdmin', comentarioAdmin, actor)
    }
    if (body.comentarioAdminPublico !== undefined) {
      item.comentarioAdminPublico = body.comentarioAdminPublico
      appendHistory(item, 'comentarioAdminPublico', body.comentarioAdminPublico, actor)
    }
    if (body.notaClienteAdicionar !== undefined) {
      const nota = String(body.notaClienteAdicionar || '').trim()
      if (nota) {
        item.notasCliente = item.notasCliente ? `${item.notasCliente}\n${nota}` : nota
        appendHistory(item, 'notasCliente', nota, actor)
      }
    } else if (body.notasCliente !== undefined) {
      item.notasCliente = body.notasCliente
      appendHistory(item, 'notasCliente', body.notasCliente, actor)
    }

    items[idx] = item
    writeRemocoes(items)
    if (status !== undefined && statusAntes !== item.status && auth.payload.isAdmin) {
      const actionByStatus = {
        aceita: 'removal.accepted',
        rejeitada: 'removal.rejected',
        pendente: 'removal.restored',
      }
      appendAuditLog({
        action: actionByStatus[item.status] || 'removal.status_changed',
        actor: auth.client || auth.payload,
        target: { type: 'remocao', id: item.id, publicId: item.publicId, label: item.nome },
        details: { from: statusAntes, to: item.status, photoId: item.photoId || null },
        request,
      })

      // Fire-and-forget: notify client of status update
      if (item.status === 'aceita' || item.status === 'rejeitada') {
        const linkedClient = item.clientId ? readClients().find(c => c.id === item.clientId) : null
        const notifyEmail = item.contatoEmail || linkedClient?.email || null
        if (notifyEmail) {
          const emailPrefs = getEmailPrefs(linkedClient)
          if (emailPrefs.remocao) {
            sendEmailRemocao({
              to: notifyEmail,
              nome: item.nome || 'Cliente',
              status: item.status,
              comentarioPublico: item.comentarioAdminPublico || '',
              siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
            }).catch(() => {})
          }
        }
      }
    }
    return NextResponse.json(item)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
