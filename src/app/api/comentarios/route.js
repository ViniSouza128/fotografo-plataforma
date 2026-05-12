import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateAuthToken } from '@/lib/auth'
import { findClientById } from '@/lib/clients'
import { readEvents } from '@/lib/events'
import { readPhotos } from '@/lib/photos'
import {
  readComentarios,
  writeComentarios,
  applyScopeFilter,
  buildComentarioTree,
  checkCommentRateLimit,
  MAX_COMMENT_LENGTH,
} from '../../../lib/comentarios'
import {
  getEventCoverCandidates,
  getFirstUrl,
  getPhotoCommentPreviewCandidates,
  isUploadsUrl,
} from '@/lib/imagePaths'
import { appendNotificacao } from '@/lib/notificacoes'

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function getBadgeRole(client) {
  if (client?.isSuperAdmin) return 'fotografo'
  if (client?.isAdmin) return 'admin'
  return null
}

function getClientDisplayName(client, fallback) {
  if (fallback?.trim()) return fallback.trim()
  return client?.nomeCompleto || client?.nome || client?.email || 'Cliente'
}

function getScopeLabel(comment) {
  if (comment.photoId) return 'foto'
  if (comment.pasta) return `pasta:${comment.pasta}`
  if (comment.eventId) return 'album'
  return 'indefinido'
}

function getContextType(comment) {
  if (comment.photoId) return 'foto'
  if (comment.pasta) return 'pasta'
  if (comment.eventId) return 'album'
  return 'indefinido'
}

function getPhotoThumbUrl(photo) {
  if (!photo) return null
  const candidates = getPhotoCommentPreviewCandidates(photo)
  return getFirstAvailableUploadsUrl(candidates, { preferDynamic: true })
}

function isThumbUrlSafe(value) {
  if (!isUploadsUrl(value)) return false
  if (
    value.startsWith('/uploads/thumbs/') ||
    value.startsWith('/uploads/mini/') ||
    value.startsWith('/uploads/covers/') ||
    value.startsWith('/uploads/grid/') ||
    value.startsWith('/uploads/wm_')
  ) return true
  // Per-event: /uploads/<eventId>/{thumbs|mini|covers|grid}/...
  return /^\/uploads\/[a-zA-Z0-9._-]+\/(?:thumbs|mini|covers|grid)\//.test(value)
}

function getEventCoverThumbUrl(event) {
  if (!event) return null
  const candidates = getEventCoverCandidates(event, { watermark: 'clean' })
  return getFirstAvailableUploadsUrl(candidates.filter((candidate) => isThumbUrlSafe(candidate)))
}

function uploadsUrlToAbsolutePath(value) {
  if (!isUploadsUrl(value)) return null
  const relative = value.slice('/uploads/'.length)
  if (!relative || relative.includes('..')) return null
  return path.join(process.cwd(), 'public', 'uploads', ...relative.split('/'))
}

function getFirstAvailableUploadsUrl(candidates, { preferDynamic = false } = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  for (const candidate of candidates) {
    if (preferDynamic && typeof candidate === 'string' && candidate.startsWith('/api/images/derive?')) {
      return candidate
    }
    if (!isUploadsUrl(candidate)) continue
    const absolute = uploadsUrlToAbsolutePath(candidate)
    if (absolute && fs.existsSync(absolute)) return candidate
  }
  return getFirstUrl(candidates)
}

function buildDeepLink(comment, { eventId, pasta, photoId } = {}) {
  if (!eventId) return null
  const params = new URLSearchParams()
  // Forca o contexto, para a pagina abrir na aba/pasta correta.
  if (pasta) params.set('pasta', pasta)
  else params.set('pasta', '__album__')
  if (photoId) {
    params.set('foto', photoId)
    params.set('comentarios', '1')
  }
  params.set('comentario', comment.id)
  return `/evento/${eventId}?${params.toString()}`
}

function enrichWithContext(comentarios) {
  const events = Array.isArray(comentarios) ? readEvents() : []
  const byEventId = new Map((events || []).map(ev => [ev.id, ev]))

  const needsPhotos = comentarios.some(c => c.photoId || c.pasta || c.eventId)
  const photos = needsPhotos ? readPhotos() : []
  const byPhotoId = new Map((photos || []).map(p => [p.id, p]))

  // Precalcula thumbnails de pasta e fallback de capa do album.
  const folderThumbByKey = new Map()
  const albumThumbByEventId = new Map()
  for (const p of photos || []) {
    if (p?.eventId && !albumThumbByEventId.has(p.eventId)) {
      albumThumbByEventId.set(p.eventId, getPhotoThumbUrl(p))
    }
    if (p?.eventId && p?.pasta) {
      const key = `${p.eventId}::${String(p.pasta).trim().toLowerCase()}`
      if (!folderThumbByKey.has(key)) folderThumbByKey.set(key, getPhotoThumbUrl(p))
    }
  }

  return comentarios.map(c => {
    const type = getContextType(c)
    const photo = c.photoId ? byPhotoId.get(c.photoId) : null
    const resolvedEventId = c.eventId || photo?.eventId || null
    const event = resolvedEventId ? byEventId.get(resolvedEventId) : null
    const resolvedPasta = (c.pasta || photo?.pasta || null)

    let thumbUrl = null
    if (type === 'foto') thumbUrl = getPhotoThumbUrl(photo)
    else if (type === 'pasta' && resolvedEventId && resolvedPasta) {
      const key = `${resolvedEventId}::${String(resolvedPasta).trim().toLowerCase()}`
      thumbUrl = folderThumbByKey.get(key) || null
    } else if (type === 'album') {
      thumbUrl = getEventCoverThumbUrl(event) || albumThumbByEventId.get(resolvedEventId) || null
    }

    // Fallback pedido: pasta sem capa -> capa do album (thumb leve).
    if (type === 'pasta' && !thumbUrl) {
      thumbUrl = getEventCoverThumbUrl(event) || albumThumbByEventId.get(resolvedEventId) || null
    }

    const url = buildDeepLink(c, { eventId: resolvedEventId, pasta: resolvedPasta, photoId: c.photoId || null })

    return {
      ...c,
      contextType: type,
      context: {
        type,
        album: event ? { id: event.id, nome: event.name || null, publicId: event.publicId || null } : (resolvedEventId ? { id: resolvedEventId, nome: null, publicId: null } : null),
        pasta: resolvedPasta ? { nome: resolvedPasta } : null,
        foto: photo ? { id: photo.id, publicId: photo.publicId || null } : (c.photoId ? { id: c.photoId, publicId: null } : null),
        thumbUrl,
        url,
      },
    }
  })
}

async function getAuthContext() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value
    const auth = validateAuthToken(token)
    if (auth?.error) return { payload: null, client: null }
    const { payload, client } = auth
    return { payload, client }
  } catch {
    return { payload: null, client: null }
  }
}

function getCommentPermissions(comment, viewer) {
  const isAdmin = !!viewer?.isAdmin
  const isOwner = !!viewer?.id && viewer.id === comment.clientId
  const isHidden = comment.visivel === false
  const blockedForOwner = comment.bloqueadoEdicaoAutor === true

  return {
    isOwner,
    canEdit: isAdmin || (isOwner && !blockedForOwner && !isHidden),
    canOmit: isAdmin || (isOwner && !isHidden),
    canRestore: isAdmin || (isOwner && isHidden && !comment.omitidoPorAdmin),
    canViewHistory: isAdmin || isOwner,
    canReply: !!viewer?.id && (!isHidden || isAdmin || isOwner),
    canLike: !!viewer?.id && (comment.visivel || isAdmin),
  }
}

function toPublicComment(comment, viewer, { includeHistory = false } = {}) {
  const permissions = getCommentPermissions(comment, viewer)
  const statusOmissao = comment.visivel
    ? 'ativo'
    : (comment.omitidoPorAdmin ? 'omitido_por_admin' : 'omitido_por_autor')
  const curtidasPor = Array.isArray(comment.curtidasPor) ? comment.curtidasPor : []
  const viewerId = viewer?.id || null
  const contextType = getContextType(comment)

  return {
    ...comment,
    historicoEdicoes: (includeHistory && permissions.canViewHistory)
      ? comment.historicoEdicoes
      : [],
    historicoOmissoes: (includeHistory && viewer?.isAdmin)
      ? comment.historicoOmissoes
      : [],
    foiEditado: !!comment.editadoEm,
    foiEditadoPorAdmin: comment.editadoPorAdmin === true,
    statusOmissao,
    scopeLabel: getScopeLabel(comment),
    contextType,
    permissoes: permissions,
    curtidas: curtidasPor.length,
    curtidoPorMim: viewerId ? curtidasPor.includes(viewerId) : false,
  }
}

function applyVisibilityFilter(comentarios, { viewer, adminMode, includeHidden, includeMineHidden }) {
  if (adminMode) return comentarios

  if (includeHidden) return comentarios

  if (includeMineHidden && viewer?.id) {
    return comentarios.filter(c => c.visivel || c.clientId === viewer.id)
  }

  return comentarios.filter(c => c.visivel)
}

function parseAction(body) {
  if (body?.action) return body.action
  if (typeof body?.visivel === 'boolean') {
    return body.visivel ? 'restore' : 'omit'
  }
  return null
}

function pushEditHistory(comment, actor, textoAnterior, textoNovo, nowIso) {
  const entry = {
    id: crypto.randomUUID(),
    editadoEm: nowIso,
    editadoPorId: actor.id,
    editadoPorNome: actor.nome,
    editadoPorAdmin: actor.isAdmin,
    textoAnterior,
    textoNovo,
  }
  comment.historicoEdicoes = Array.isArray(comment.historicoEdicoes) ? comment.historicoEdicoes : []
  comment.historicoEdicoes.push(entry)
}

function pushModerationHistory(comment, actor, action, nowIso) {
  const entry = {
    id: crypto.randomUUID(),
    acao: action === 'restore' ? 'restore' : 'omit',
    feitoEm: nowIso,
    feitoPorId: actor.id,
    feitoPorNome: actor.nome,
    feitoPorAdmin: actor.isAdmin,
  }
  comment.historicoOmissoes = Array.isArray(comment.historicoOmissoes) ? comment.historicoOmissoes : []
  comment.historicoOmissoes.push(entry)
}

function canUserManageComment(comment, actor) {
  return actor.isAdmin || comment.clientId === actor.id
}

function validateCommentText(rawText) {
  const texto = normalizeText(rawText)
  if (!texto) {
    return { ok: false, status: 400, error: 'Comentario vazio. Escreva algo antes de enviar.' }
  }
  if (texto.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `Comentario muito longo. Limite de ${MAX_COMMENT_LENGTH} caracteres.`,
    }
  }
  return { ok: true, texto }
}

// GET /api/comentarios?photoId=xxx
// GET /api/comentarios?eventId=xxx&pasta=__album__
// GET /api/comentarios?eventId=xxx&pasta=NomeDaPasta
// GET /api/comentarios?clientId=xxx
// GET /api/comentarios?admin=1&all=1
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const photoId = searchParams.get('photoId')
    const eventId = searchParams.get('eventId')
    const clientId = searchParams.get('clientId')
    const pasta = searchParams.get('pasta')
    const adminMode = searchParams.get('admin') === '1'
    const includeHidden = searchParams.get('includeHidden') === '1'
    const includeMineHidden = searchParams.get('includeMineHidden') === '1'
    const includeHistory = searchParams.get('includeHistory') === '1'
    const includeContext = searchParams.get('includeContext') === '1'
    const tree = searchParams.get('tree') === '1'
    const all = searchParams.get('all') === '1'
    const sort = (searchParams.get('sort') || 'top').toLowerCase() // top | recent

    const { payload, client } = await getAuthContext()
    const viewer = payload && client
      ? { id: client.id, nome: getClientDisplayName(client), isAdmin: !!payload.isAdmin }
      : null

    if (adminMode && !viewer?.isAdmin) {
      return NextResponse.json({ error: 'Sem permissao para visualizar modo admin.' }, { status: 403 })
    }

    if (all && !adminMode) {
      return NextResponse.json({ error: 'Consulta global permitida apenas para admin.' }, { status: 403 })
    }

    if (includeMineHidden && !viewer?.id) {
      return NextResponse.json({ error: 'Faca login para visualizar seus comentarios omitidos.' }, { status: 401 })
    }

    if (includeHidden && !adminMode) {
      const allowed = !!(viewer && clientId && (viewer.isAdmin || viewer.id === clientId))
      if (!allowed) {
        return NextResponse.json({ error: 'Sem permissao para ver comentarios ocultos.' }, { status: 403 })
      }
    }

    const scoped = applyScopeFilter(readComentarios(), {
      photoId,
      eventId,
      clientId,
      pasta,
      allowAll: all && adminMode,
    })

    if (!scoped) {
      return NextResponse.json({ error: 'photoId, eventId, clientId ou all=1 obrigatorio' }, { status: 400 })
    }

    let comentarios = applyVisibilityFilter(scoped, {
      viewer,
      adminMode,
      includeHidden,
      includeMineHidden,
    })

    const byRecent = (a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0)
    const byTop = (a, b) => {
      const la = Array.isArray(a.curtidasPor) ? a.curtidasPor.length : 0
      const lb = Array.isArray(b.curtidasPor) ? b.curtidasPor.length : 0
      if (lb !== la) return lb - la
      return byRecent(a, b)
    }
    const useTop = sort !== 'recent'
    comentarios.sort(useTop ? byTop : byRecent)
    let decorated = comentarios.map(c => toPublicComment(c, viewer, { includeHistory }))
    if (includeContext) {
      decorated = enrichWithContext(decorated)
    }

    if (tree) {
      // Ordena a arvore de forma previsivel:
      // - raizes: sort (top/recent)
      // - respostas: sempre por mais antigas primeiro (leitura natural)
      const sorted = [...decorated].sort(useTop ? byTop : byRecent)
      const treeItems = buildComentarioTree(sorted, { dropOrphans: !adminMode, preserveRootOrder: true })
      return NextResponse.json(treeItems)
    }

    return NextResponse.json(decorated)
  } catch {
    return NextResponse.json({ error: 'Erro ao ler comentarios.' }, { status: 500 })
  }
}

// POST /api/comentarios
// Body: { texto, eventId?, photoId?, pasta?, parentId? }
export async function POST(request) {
  try {
    const { payload, client } = await getAuthContext()
    if (!payload || !client) {
      return NextResponse.json({ error: 'Faca login para comentar.' }, { status: 401 })
    }

    const actor = {
      id: client.id,
      nome: getClientDisplayName(client),
      isAdmin: !!payload.isAdmin,
    }

    const body = await request.json()
    const parentId = body?.parentId || null
    const textoCheck = validateCommentText(body?.texto)
    if (!textoCheck.ok) {
      return NextResponse.json({ error: textoCheck.error }, { status: textoCheck.status })
    }

    const comentarios = readComentarios()
    const limitCheck = checkCommentRateLimit(comentarios, actor.id)
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: `${limitCheck.error} Aguarde ${limitCheck.retryAfterSeconds}s para tentar novamente.`,
          code: limitCheck.code,
          retryAfterSeconds: limitCheck.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(limitCheck.retryAfterSeconds) },
        }
      )
    }

    let scope = {
      photoId: body?.photoId || null,
      eventId: body?.eventId || null,
      pasta: body?.pasta?.trim?.() || null,
      parentId: null,
    }

    if (parentId) {
      const parent = comentarios.find(c => c.id === parentId)
      if (!parent) {
        return NextResponse.json({ error: 'Comentario de origem nao encontrado.' }, { status: 404 })
      }

      if (!parent.visivel && !actor.isAdmin && parent.clientId !== actor.id) {
        return NextResponse.json({ error: 'Nao e possivel responder um comentario omitido.' }, { status: 403 })
      }

      scope = {
        photoId: parent.photoId || null,
        eventId: parent.eventId || null,
        pasta: parent.pasta || null,
        parentId: parent.parentId || parent.id,
      }
    }

    // Comentario especifico de foto: recomenda-se fornecer eventId junto para contexto.
    // Mantem compatibilidade: se vier apenas photoId, aceita e grava eventId/pasta como null.
    if (!scope.photoId && !scope.eventId) {
      return NextResponse.json(
        { error: 'photoId ou eventId deve ser informado.' },
        { status: 400 }
      )
    }

    const nowIso = new Date().toISOString()
    const novoComentario = {
      id: crypto.randomUUID(),
      clientId: actor.id,
      clienteNome: getClientDisplayName(client, body?.clienteNome),
      badgeRole: getBadgeRole(client),
      photoId: scope.photoId,
      eventId: scope.eventId,
      pasta: scope.pasta,
      parentId: scope.parentId,
      texto: textoCheck.texto,
      curtidasPor: [],
      visivel: true,
      criadoEm: nowIso,
      atualizadoEm: null,
      editadoEm: null,
      editadoPorId: null,
      editadoPorNome: null,
      editadoPorAdmin: false,
      bloqueadoEdicaoAutor: false,
      historicoEdicoes: [],
      omitidoEm: null,
      omitidoPorId: null,
      omitidoPorNome: null,
      omitidoPorAdmin: false,
      restauradoEm: null,
      restauradoPorId: null,
      restauradoPorNome: null,
      restauradoPorAdmin: false,
      historicoOmissoes: [],
    }

    comentarios.push(novoComentario)
    writeComentarios(comentarios)

    // Notificações (fire-and-forget)
    try {
      const trecho = textoCheck.texto.slice(0, 100) + (textoCheck.texto.length > 100 ? '…' : '')
      if (!parentId) {
        // New root comment → notify admin (unless admin themselves commented)
        if (!actor.isAdmin) {
          appendNotificacao({
            tipo: 'comentario',
            destinatario: 'admin',
            titulo: 'Novo comentário',
            mensagem: `${actor.nome}: ${trecho}`,
            link: '/admin/comentarios',
          })
        }
      } else {
        // Reply — notify admin if not admin commenting
        if (!actor.isAdmin) {
          appendNotificacao({
            tipo: 'comentario',
            destinatario: 'admin',
            titulo: 'Nova resposta em comentário',
            mensagem: `${actor.nome}: ${trecho}`,
            link: '/admin/comentarios',
          })
        }
        // Notify the parent commenter if they're a non-admin and different person
        const parentComment = comentarios.find(c => c.id === parentId)
        if (
          parentComment &&
          parentComment.clientId &&
          parentComment.clientId !== actor.id &&
          !parentComment.badgeRole
        ) {
          appendNotificacao({
            tipo: 'resposta',
            destinatario: parentComment.clientId,
            titulo: 'Resposta ao seu comentário',
            mensagem: `${actor.nome}: ${trecho}`,
            link: '/minha-conta/comentarios',
          })
        }
      }
    } catch {}

    return NextResponse.json(
      toPublicComment(novoComentario, actor, { includeHistory: true }),
      { status: 201 }
    )
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro ao criar comentario.' }, { status: 500 })
  }
}

// PATCH /api/comentarios
// Body:
// - { id, action: 'edit', texto }
// - { id, action: 'omit' }
// - { id, action: 'restore' }
// - { id, action: 'toggleLike' }
// Compat legada: { id, visivel: boolean }
export async function PATCH(request) {
  try {
    const { payload, client } = await getAuthContext()
    if (!payload || !client) {
      return NextResponse.json({ error: 'Faca login para alterar comentarios.' }, { status: 401 })
    }

    const actor = {
      id: client.id,
      nome: getClientDisplayName(client),
      isAdmin: !!payload.isAdmin,
    }

    const body = await request.json()
    const id = body?.id
    const action = parseAction(body)

    if (!id) {
      return NextResponse.json({ error: 'id obrigatorio.' }, { status: 400 })
    }

    if (!['edit', 'omit', 'restore', 'toggleLike'].includes(action)) {
      return NextResponse.json({ error: 'Acao invalida para comentario.' }, { status: 400 })
    }

    const comentarios = readComentarios()
    const idx = comentarios.findIndex(c => c.id === id)
    if (idx === -1) {
      return NextResponse.json({ error: 'Comentario nao encontrado.' }, { status: 404 })
    }

    const comment = comentarios[idx]
    const isOwner = comment.clientId === actor.id
    const nowIso = new Date().toISOString()

    if (!canUserManageComment(comment, actor)) {
      return NextResponse.json({ error: 'Sem permissao para alterar este comentario.' }, { status: 403 })
    }

    if (action === 'toggleLike') {
      if (!comment.visivel && !actor.isAdmin) {
        return NextResponse.json({ error: 'Nao e possivel curtir comentario omitido.' }, { status: 403 })
      }
      comment.curtidasPor = Array.isArray(comment.curtidasPor) ? comment.curtidasPor : []
      const idxLike = comment.curtidasPor.indexOf(actor.id)
      if (idxLike >= 0) comment.curtidasPor.splice(idxLike, 1)
      else comment.curtidasPor.push(actor.id)
      comment.atualizadoEm = nowIso

      writeComentarios(comentarios)
      return NextResponse.json(toPublicComment(comment, actor, { includeHistory: true }))
    }

    if (action === 'edit') {
      const check = validateCommentText(body?.texto)
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: check.status })
      }

      if (!actor.isAdmin && comment.bloqueadoEdicaoAutor) {
        return NextResponse.json(
          { error: 'Este comentario foi editado por admin e nao pode mais ser alterado pelo autor.' },
          { status: 403 }
        )
      }

      if (!actor.isAdmin && !comment.visivel) {
        return NextResponse.json(
          { error: 'Nao e possivel editar comentario omitido. Restaure antes de editar.' },
          { status: 400 }
        )
      }

      if (comment.texto === check.texto) {
        return NextResponse.json(toPublicComment(comment, actor, { includeHistory: true }))
      }

      pushEditHistory(comment, actor, comment.texto, check.texto, nowIso)
      comment.texto = check.texto
      comment.atualizadoEm = nowIso
      comment.editadoEm = nowIso
      comment.editadoPorId = actor.id
      comment.editadoPorNome = actor.nome
      if (actor.isAdmin) {
        comment.editadoPorAdmin = true
        comment.bloqueadoEdicaoAutor = true
      } else if (isOwner && !comment.editadoPorAdmin) {
        comment.editadoPorAdmin = false
      }
    }

    if (action === 'omit') {
      if (!comment.visivel) {
        return NextResponse.json(toPublicComment(comment, actor, { includeHistory: true }))
      }

      comment.visivel = false
      comment.atualizadoEm = nowIso
      comment.omitidoEm = nowIso
      comment.omitidoPorId = actor.id
      comment.omitidoPorNome = actor.nome
      comment.omitidoPorAdmin = actor.isAdmin
      pushModerationHistory(comment, actor, 'omit', nowIso)
    }

    if (action === 'restore') {
      if (comment.visivel) {
        return NextResponse.json(toPublicComment(comment, actor, { includeHistory: true }))
      }

      if (!actor.isAdmin && comment.omitidoPorAdmin) {
        return NextResponse.json(
          { error: 'Este comentario foi omitido por admin e somente admin pode restaurar.' },
          { status: 403 }
        )
      }

      comment.visivel = true
      comment.atualizadoEm = nowIso
      comment.restauradoEm = nowIso
      comment.restauradoPorId = actor.id
      comment.restauradoPorNome = actor.nome
      comment.restauradoPorAdmin = actor.isAdmin
      pushModerationHistory(comment, actor, 'restore', nowIso)

      // Mantem historico de omissao, mas limpa o estado de omissao ativa.
      comment.omitidoEm = null
      comment.omitidoPorId = null
      comment.omitidoPorNome = null
      comment.omitidoPorAdmin = false
    }

    writeComentarios(comentarios)
    return NextResponse.json(toPublicComment(comment, actor, { includeHistory: true }))
  } catch {
    return NextResponse.json({ error: 'Erro ao atualizar comentario.' }, { status: 500 })
  }
}

// DELETE /api/comentarios?id=xxx
// Soft delete/omissao para manter auditoria.
export async function DELETE(request) {
  try {
    const { payload, client } = await getAuthContext()
    if (!payload || !client) {
      return NextResponse.json({ error: 'Faca login para excluir comentario.' }, { status: 401 })
    }

    const actor = {
      id: client.id,
      nome: getClientDisplayName(client),
      isAdmin: !!payload.isAdmin,
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id obrigatorio.' }, { status: 400 })
    }

    const comentarios = readComentarios()
    const idx = comentarios.findIndex(c => c.id === id)
    if (idx === -1) {
      return NextResponse.json({ error: 'Comentario nao encontrado.' }, { status: 404 })
    }

    const comment = comentarios[idx]
    if (!canUserManageComment(comment, actor)) {
      return NextResponse.json({ error: 'Sem permissao para excluir este comentario.' }, { status: 403 })
    }

    if (!comment.visivel) {
      return NextResponse.json(toPublicComment(comment, actor, { includeHistory: true }))
    }

    const nowIso = new Date().toISOString()
    comment.visivel = false
    comment.atualizadoEm = nowIso
    comment.omitidoEm = nowIso
    comment.omitidoPorId = actor.id
    comment.omitidoPorNome = actor.nome
    comment.omitidoPorAdmin = actor.isAdmin
    pushModerationHistory(comment, actor, 'omit', nowIso)

    writeComentarios(comentarios)
    return NextResponse.json(toPublicComment(comment, actor, { includeHistory: true }))
  } catch {
    return NextResponse.json({ error: 'Erro ao excluir comentario.' }, { status: 500 })
  }
}
