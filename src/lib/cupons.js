// src/lib/cupons.js
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { DATA_DIR, ensureRuntimeDirs } from './runtimePaths'

const CUPONS_PATH = path.join(DATA_DIR, 'cupons.json')

function ensureDir() {
  ensureRuntimeDirs()
}

function round2(v) { return Math.round(Number(v || 0) * 100) / 100 }

export function readCupons() {
  try {
    if (!fs.existsSync(CUPONS_PATH)) return []
    const raw = fs.readFileSync(CUPONS_PATH, 'utf-8')
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function writeCupons(data) {
  ensureDir()
  fs.writeFileSync(CUPONS_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function normalizarCodigo(codigo) {
  return String(codigo || '').trim().toUpperCase().replace(/\s+/g, '')
}

export function findCupomByCodigo(codigo) {
  const norm = normalizarCodigo(codigo)
  if (!norm) return null
  return readCupons().find(c => normalizarCodigo(c.codigo) === norm) || null
}

function matchesEscopoMidia(item, escopo) {
  const tipo = item?.mediaType || item?.tipo || 'photo'
  if (escopo === 'foto') return tipo !== 'video'
  if (escopo === 'video') return tipo === 'video'
  return true
}

function getApplicableSubtotalAndCount(items, albunsScope, escopoMidias = 'ambos') {
  const safe = Array.isArray(items) ? items : []
  const albunsList = (Array.isArray(albunsScope) && albunsScope.length > 0)
    ? safe.filter(i => i?.eventId && albunsScope.includes(i.eventId))
    : safe
  const list = albunsList.filter(i => matchesEscopoMidia(i, escopoMidias))
  const subtotal = list.reduce((s, i) => s + Number(i.priceComDesconto ?? i.price ?? 0), 0)
  const count = list.filter(i => Number(i.priceComDesconto ?? i.price ?? 0) > 0).length
  return { subtotal: round2(subtotal), count }
}

export function getCupomStatus(cupom, now = new Date()) {
  if (!cupom) return 'inexistente'
  if (!cupom.ativo) return 'suspenso'
  if (cupom.validoDe && new Date(cupom.validoDe) > now) return 'agendado'
  if (cupom.validoAte && new Date(cupom.validoAte) < now) return 'expirado'
  if (cupom.limiteTotal && Number(cupom.totalUsado || 0) >= Number(cupom.limiteTotal)) return 'esgotado'
  return 'ativo'
}

function pickTierValor(cupom, base) {
  if (!cupom.tiersAtivos || !Array.isArray(cupom.tiers) || cupom.tiers.length === 0) {
    return Number(cupom.valor) || 0
  }
  // sort descending by min, return first matched
  const sorted = [...cupom.tiers]
    .map(t => ({ min: Math.max(0, Number(t.min) || 0), valor: Math.max(0, Number(t.valor) || 0) }))
    .filter(t => t.valor > 0)
    .sort((a, b) => b.min - a.min)
  const matched = sorted.find(t => base >= t.min)
  return matched ? matched.valor : (Number(cupom.valor) || 0)
}

export function calcularDescontoCupom(cupom, { items } = {}) {
  const albunsScope = Array.isArray(cupom.albuns) ? cupom.albuns : []
  const escopoMidias = cupom.escopoMidias === 'foto' || cupom.escopoMidias === 'video' ? cupom.escopoMidias : 'ambos'
  const { subtotal, count } = getApplicableSubtotalAndCount(items, albunsScope, escopoMidias)
  const tiersBase = cupom.tiersTipo === 'quantidade' ? count : subtotal
  const valorEfetivo = pickTierValor(cupom, tiersBase)

  let desconto = 0
  if (cupom.tipo === 'percentual') {
    desconto = subtotal * (Number(valorEfetivo) / 100)
  } else if (cupom.tipo === 'fixo') {
    desconto = Number(valorEfetivo)
  }
  desconto = Math.max(0, Math.min(round2(desconto), subtotal))
  return {
    desconto: round2(desconto),
    valorEfetivo,
    subtotalAplicavel: subtotal,
    quantidadeAplicavel: count,
  }
}

export function validarCupom({ codigo, items = [], clientId = null } = {}) {
  const cupom = findCupomByCodigo(codigo)
  if (!cupom) return { valido: false, error: 'Cupom não encontrado.', code: 'not_found' }

  const status = getCupomStatus(cupom)
  if (status === 'suspenso') return { valido: false, error: 'Cupom suspenso.', code: 'suspenso', cupom }
  if (status === 'expirado') return { valido: false, error: 'Cupom expirado.', code: 'expirado', cupom }
  if (status === 'agendado') return { valido: false, error: 'Este cupom ainda não está disponível.', code: 'agendado', cupom }
  if (status === 'esgotado') return { valido: false, error: 'Cupom esgotado (limite total atingido).', code: 'esgotado', cupom }

  const albunsScope = Array.isArray(cupom.albuns) ? cupom.albuns : []
  if (albunsScope.length > 0) {
    const hasMatch = items.some(i => i?.eventId && albunsScope.includes(i.eventId))
    if (!hasMatch) {
      return { valido: false, error: 'Cupom válido apenas para álbuns específicos não presentes no carrinho.', code: 'sem_album_compativel', cupom }
    }
  }

  const escopoMidias = cupom.escopoMidias === 'foto' || cupom.escopoMidias === 'video' ? cupom.escopoMidias : 'ambos'
  if (escopoMidias !== 'ambos') {
    const hasMidia = items.some(i => matchesEscopoMidia(i, escopoMidias))
    if (!hasMidia) {
      return { valido: false, error: `Cupom válido apenas para ${escopoMidias === 'foto' ? 'fotos' : 'vídeos'} — nenhum item compatível no carrinho.`, code: 'escopo_midia', cupom }
    }
  }
  const { subtotal, count } = getApplicableSubtotalAndCount(items, albunsScope, escopoMidias)

  if (cupom.minSubtotal && subtotal < Number(cupom.minSubtotal)) {
    return { valido: false, error: `Subtotal mínimo de R$ ${Number(cupom.minSubtotal).toFixed(2).replace('.', ',')} não atingido.`, code: 'min_subtotal', cupom }
  }
  if (cupom.minQuantidade && count < Number(cupom.minQuantidade)) {
    return { valido: false, error: `Quantidade mínima de ${cupom.minQuantidade} foto(s) não atingida.`, code: 'min_quantidade', cupom }
  }

  if (clientId && cupom.limitePorUsuario) {
    const usados = Number(cupom.usosPorCliente?.[clientId] || 0)
    if (usados >= Number(cupom.limitePorUsuario)) {
      return { valido: false, error: 'Limite de uso por usuário atingido.', code: 'limite_usuario', cupom }
    }
  }

  const calc = calcularDescontoCupom(cupom, { items })
  if (calc.desconto <= 0) {
    return { valido: false, error: 'Desconto calculado é zero. Verifique os valores do cupom.', code: 'desconto_zero', cupom }
  }

  return {
    valido: true,
    cupom,
    desconto: calc.desconto,
    valorEfetivo: calc.valorEfetivo,
    subtotalAplicavel: calc.subtotalAplicavel,
    quantidadeAplicavel: calc.quantidadeAplicavel,
    status,
  }
}

export function registrarUsoCupom(cupomId, clientId) {
  const all = readCupons()
  const idx = all.findIndex(c => c.id === cupomId)
  if (idx === -1) return false
  all[idx].totalUsado = Number(all[idx].totalUsado || 0) + 1
  if (clientId) {
    all[idx].usosPorCliente = { ...(all[idx].usosPorCliente || {}) }
    all[idx].usosPorCliente[clientId] = Number(all[idx].usosPorCliente[clientId] || 0) + 1
  }
  all[idx].atualizadoEm = new Date().toISOString()
  writeCupons(all)
  return true
}

function normalizeCupomInput(data) {
  const tipo = data.tipo === 'fixo' ? 'fixo' : 'percentual'
  let valor = Math.max(0, Number(data.valor) || 0)
  if (tipo === 'percentual' && valor > 100) valor = 100

  return {
    codigo: normalizarCodigo(data.codigo),
    descricao: String(data.descricao || '').slice(0, 200),
    tipo,
    valor,
    tiers: Array.isArray(data.tiers) ? data.tiers
      .map(t => ({
        min: Math.max(0, Number(t.min) || 0),
        valor: Math.max(0, Number(t.valor) || 0),
      }))
      .filter(t => t.valor > 0)
      .sort((a, b) => a.min - b.min)
      : [],
    tiersAtivos: !!data.tiersAtivos,
    tiersTipo: data.tiersTipo === 'quantidade' ? 'quantidade' : 'subtotal',
    minSubtotal: Math.max(0, Number(data.minSubtotal) || 0),
    minQuantidade: Math.max(0, Number(data.minQuantidade) || 0),
    validoDe: data.validoDe || null,
    validoAte: data.validoAte || null,
    limitePorUsuario: data.limitePorUsuario ? Math.max(1, Number(data.limitePorUsuario)) : null,
    limiteTotal: data.limiteTotal ? Math.max(1, Number(data.limiteTotal)) : null,
    albuns: Array.isArray(data.albuns) ? data.albuns.filter(Boolean) : [],
    escopoMidias: data.escopoMidias === 'foto' || data.escopoMidias === 'video' ? data.escopoMidias : 'ambos',
    ativo: data.ativo !== false,
  }
}

export function appendCupom(data, actor = null) {
  const norm = normalizeCupomInput(data)
  if (!norm.codigo) throw new Error('Código obrigatório.')
  if (norm.valor <= 0) throw new Error('Valor de desconto inválido.')
  if (norm.validoDe && norm.validoAte && new Date(norm.validoDe) > new Date(norm.validoAte)) {
    throw new Error('Data inicial não pode ser posterior à data final.')
  }

  const all = readCupons()
  if (all.some(c => normalizarCodigo(c.codigo) === norm.codigo)) {
    throw new Error('Já existe um cupom com este código.')
  }

  const novo = {
    id: crypto.randomUUID(),
    ...norm,
    totalUsado: 0,
    usosPorCliente: {},
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
    criadoPor: actor?.id || null,
  }
  all.push(novo)
  writeCupons(all)
  return novo
}

export function updateCupom(id, data) {
  const all = readCupons()
  const idx = all.findIndex(c => c.id === id)
  if (idx === -1) throw new Error('Cupom não encontrado.')

  const current = { ...all[idx] }

  if (data.codigo !== undefined) {
    const codigoNorm = normalizarCodigo(data.codigo)
    if (!codigoNorm) throw new Error('Código obrigatório.')
    if (all.some(c => c.id !== id && normalizarCodigo(c.codigo) === codigoNorm)) {
      throw new Error('Já existe um cupom com este código.')
    }
    current.codigo = codigoNorm
  }
  if (data.descricao !== undefined) current.descricao = String(data.descricao || '').slice(0, 200)
  if (data.tipo !== undefined) current.tipo = data.tipo === 'fixo' ? 'fixo' : 'percentual'
  if (data.valor !== undefined) {
    let v = Math.max(0, Number(data.valor) || 0)
    if (current.tipo === 'percentual' && v > 100) v = 100
    current.valor = v
  }
  if (data.tiers !== undefined) {
    current.tiers = Array.isArray(data.tiers) ? data.tiers
      .map(t => ({ min: Math.max(0, Number(t.min) || 0), valor: Math.max(0, Number(t.valor) || 0) }))
      .filter(t => t.valor > 0)
      .sort((a, b) => a.min - b.min)
      : []
  }
  if (data.tiersAtivos !== undefined) current.tiersAtivos = !!data.tiersAtivos
  if (data.tiersTipo !== undefined) current.tiersTipo = data.tiersTipo === 'quantidade' ? 'quantidade' : 'subtotal'
  if (data.minSubtotal !== undefined) current.minSubtotal = Math.max(0, Number(data.minSubtotal) || 0)
  if (data.minQuantidade !== undefined) current.minQuantidade = Math.max(0, Number(data.minQuantidade) || 0)
  if (data.validoDe !== undefined) current.validoDe = data.validoDe || null
  if (data.validoAte !== undefined) current.validoAte = data.validoAte || null
  if (current.validoDe && current.validoAte && new Date(current.validoDe) > new Date(current.validoAte)) {
    throw new Error('Data inicial não pode ser posterior à data final.')
  }
  if (data.limitePorUsuario !== undefined) current.limitePorUsuario = data.limitePorUsuario ? Math.max(1, Number(data.limitePorUsuario)) : null
  if (data.limiteTotal !== undefined) current.limiteTotal = data.limiteTotal ? Math.max(1, Number(data.limiteTotal)) : null
  if (data.albuns !== undefined) current.albuns = Array.isArray(data.albuns) ? data.albuns.filter(Boolean) : []
  if (data.ativo !== undefined) current.ativo = !!data.ativo

  current.atualizadoEm = new Date().toISOString()
  all[idx] = current
  writeCupons(all)
  return current
}

export function deleteCupom(id) {
  const all = readCupons()
  const next = all.filter(c => c.id !== id)
  if (next.length === all.length) return false
  writeCupons(next)
  return true
}

export function listCuponsForAdmin() {
  return readCupons()
    .map(c => ({ ...c, status: getCupomStatus(c) }))
    .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
}
