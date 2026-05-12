import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { readConfig, writeConfig } from '../../../lib/config'
import { validateAuthToken } from '../../../lib/auth'
import { requireAuth } from '@/lib/apiAuth'
import { PRICE_MIN, PRICE_MAX } from '@/lib/price'
import { appendAuditLog } from '@/lib/auditLog'

// Campos de pagamento com credenciais — nunca expostos ao público
const PAYMENT_CREDENTIAL_FIELDS = ['asaas_sandbox', 'asaas_producao', 'stripe']

// Campos que apenas super-admin pode alterar via PATCH
// (credenciais sensíveis ficam dentro de `pagamento`)
const SUPER_ADMIN_FIELDS = ['pagamento']

function normalizeText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeInstagram(value) {
  return normalizeText(value).replace(/^@+/, '')
}

function validateBusinessData(updates, current) {
  const hasAnyBusinessField = ['cnpj', 'razaoSocial', 'localizacao'].some(field => field in updates)
  if (!hasAnyBusinessField) return null

  const nextBusiness = {
    cnpj: normalizeText(updates.cnpj ?? current.cnpj ?? '').replace(/\D/g, ''),
    razaoSocial: normalizeText(updates.razaoSocial ?? current.razaoSocial ?? ''),
    localizacao: normalizeText(updates.localizacao ?? current.localizacao ?? ''),
  }

  const filledCount = Object.values(nextBusiness).filter(Boolean).length
  if (filledCount !== 0 && filledCount !== 3) {
    return 'Dados empresariais incompletos. Se preencher CNPJ, preencha também razão social e localização.'
  }
  return nextBusiness
}

// Versão segura do objeto pagamento: expõe apenas gateway names e métodos ativos
// As credenciais (api_key, wallet_id, secret_key) são omitidas
function safePagamento(pg) {
  if (!pg) return null
  return {
    metodos_ativos: pg.metodos_ativos,
    gateway_ativo: pg.gateway_ativo,
    gateway_fallback: pg.gateway_fallback,
    gateway_pix: pg.gateway_pix,
    gateway_cartao: pg.gateway_cartao,
    gateway_pix_fallback: pg.gateway_pix_fallback,
    gateway_cartao_fallback: pg.gateway_cartao_fallback,
    // Stripe public key é seguro de expor ao cliente (usado pelo Stripe.js)
    stripe: pg.stripe?.public_key ? { public_key: pg.stripe.public_key } : undefined,
  }
}

// GET /api/config — público, mas filtra credenciais de pagamento para não-super-admins
export async function GET() {
  try {
    const cfg = readConfig()

    // Verifica se é super-admin via cookie
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value
    const auth = validateAuthToken(token)
    if (auth?.payload?.isSuperAdmin) {
      return NextResponse.json(cfg)
    }

    // Para todos os outros: expõe info de pagamento sem credenciais
    const { pagamento, ...publicCfg } = cfg
    return NextResponse.json({ ...publicCfg, pagamento: safePagamento(pagamento) })
  } catch {
    return NextResponse.json({ error: 'Erro ao ler configurações' }, { status: 500 })
  }
}

// PATCH /api/config — requer autenticação; campos de pagamento exigem super-admin
export async function PATCH(request) {
  try {
    const auth = await requireAuth({ requireFullAdmin: true })
    if (auth.error) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }

    const updates = await request.json()

    // Bloqueia alteração de campos sensíveis para não-super-admins
    const tentaSensivel = SUPER_ADMIN_FIELDS.some(f => f in updates)
    if (tentaSensivel && !auth.payload.isSuperAdmin) {
      return NextResponse.json({ error: 'Apenas super-admins podem alterar configurações de pagamento.' }, { status: 403 })
    }

    const current = readConfig()

    const businessValidation = validateBusinessData(updates, current)
    if (typeof businessValidation === 'string') {
      return NextResponse.json({ error: businessValidation }, { status: 400 })
    }

    const normalizedUpdates = { ...updates }
    if ('instagram' in normalizedUpdates) normalizedUpdates.instagram = normalizeInstagram(normalizedUpdates.instagram)
    if ('cpf' in normalizedUpdates) normalizedUpdates.cpf = normalizeText(normalizedUpdates.cpf).replace(/\D/g, '')
    if ('whatsapp' in normalizedUpdates) normalizedUpdates.whatsapp = normalizeText(normalizedUpdates.whatsapp).replace(/\D/g, '')
    if ('precoFotoDefault' in normalizedUpdates) {
      const p = normalizedUpdates.precoFotoDefault
      if (p === null || p === undefined || p === '') {
        normalizedUpdates.precoFotoDefault = null
      } else {
        const num = Number(p)
        if (!Number.isFinite(num) || num < 0 || num > PRICE_MAX || (num > 0 && num < PRICE_MIN)) {
          return NextResponse.json({ error: 'Preço padrão fora da faixa permitida.' }, { status: 400 })
        }
        normalizedUpdates.precoFotoDefault = num
      }
    }
    if (businessValidation && typeof businessValidation === 'object') {
      normalizedUpdates.cnpj = businessValidation.cnpj
      normalizedUpdates.razaoSocial = businessValidation.razaoSocial
      normalizedUpdates.localizacao = businessValidation.localizacao
    }
    if ('downloadTiers' in normalizedUpdates) {
      try {
        const { validateTiersConfig, normalizeTiersConfig } = await import('@/lib/downloadTiers')
        const v = validateTiersConfig(normalizedUpdates.downloadTiers)
        if (!v.ok) {
          return NextResponse.json({ error: v.errors.join(' / ') }, { status: 400 })
        }
        normalizedUpdates.downloadTiers = normalizeTiersConfig(normalizedUpdates.downloadTiers)
      } catch (err) {
        return NextResponse.json({ error: 'Erro ao validar tiers.' }, { status: 400 })
      }
    }

    const updated = { ...current, ...normalizedUpdates }
    writeConfig(updated)

    const changedFields = Object.keys(normalizedUpdates)
    appendAuditLog({
      action: 'config.updated',
      actor: auth.client || auth.payload,
      target: { type: 'config', id: 'global', label: 'configuracoes' },
      details: {
        changedFields,
        paymentChanged: 'pagamento' in normalizedUpdates,
        priceChanged: 'precoFotoDefault' in normalizedUpdates || 'descontosGlobais' in normalizedUpdates || 'descontosGlobaisAtivos' in normalizedUpdates,
        watermarkChanged: 'watermarkVariants' in normalizedUpdates || 'derivatives' in normalizedUpdates,
        precoFotoDefault: 'precoFotoDefault' in normalizedUpdates
          ? { from: current.precoFotoDefault ?? null, to: updated.precoFotoDefault ?? null }
          : undefined,
      },
      request,
    })

    // Retorna sem campos sensíveis se não é super-admin
    if (!auth.payload.isSuperAdmin) {
      const { pagamento, ...publicCfg } = updated
      return NextResponse.json(publicCfg)
    }
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Erro ao salvar configurações' }, { status: 500 })
  }
}
