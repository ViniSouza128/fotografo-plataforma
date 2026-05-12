// Helpers centralizados para parsing, validação e formatação de preços
// Mantém padrão brasileiro (vírgula) e limitações de negócio.

export const PRICE_MIN = 1.49
export const PRICE_LOW_WARNING = 5
export const PRICE_MAX = 9999.99

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

// Converte qualquer entrada do usuário em número seguro e texto formatado.
// Aceita vírgula ou ponto. Remove caracteres não numéricos (exceto , .).
export function parsePriceInput(raw) {
  if (raw === null || raw === undefined) return { value: null, text: '' }
  const cleaned = String(raw)
    .replace(/[^\d.,]/g, '')
    .replace(',', '.')
  if (!cleaned) return { value: null, text: '' }

  let num = Number.parseFloat(cleaned)
  if (!Number.isFinite(num)) return { value: null, text: '' }

  // Limita casas e faixa
  num = round2(num)
  if (num > PRICE_MAX) num = PRICE_MAX
  if (num < 0) num = 0

  const text = formatPrice(num, { currency: false })
  return { value: num, text }
}

export function formatPrice(value, { currency = true, fallback = '' } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback
  const formatted = round2(value).toFixed(2).replace('.', ',')
  return currency ? `R$ ${formatted}` : formatted
}

export function validatePriceRange(value, { allowZero = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return { ok: false, reason: 'invalid' }
  }
  const num = Number(value)
  if (!allowZero && num === 0) return { ok: false, reason: 'min' }
  if (num < PRICE_MIN && !(allowZero && num === 0)) return { ok: false, reason: 'min' }
  if (num > PRICE_MAX) return { ok: false, reason: 'max' }
  return { ok: true }
}

export function shouldWarnLowPrice(value) {
  if (value === null || value === undefined) return false
  const num = Number(value)
  if (!Number.isFinite(num)) return false
  return num > 0 && num < PRICE_LOW_WARNING
}

// Normaliza uma string para exibição (força vírgula e 2 casas).
export function normalizePriceText(value) {
  const { text } = parsePriceInput(value)
  return text
}

