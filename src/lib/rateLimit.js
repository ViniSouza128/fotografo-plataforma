import { NextResponse } from 'next/server'

const buckets = new Map()
const MAX_BUCKETS = 5000

function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()

  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'local'
  )
}

function cleanup(now) {
  if (buckets.size <= MAX_BUCKETS) return

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function checkRateLimit(request, {
  key,
  limit,
  windowMs,
  message = 'Muitas tentativas. Aguarde um pouco e tente novamente.',
} = {}) {
  const safeLimit = Number(limit)
  const safeWindowMs = Number(windowMs)

  if (!key || !Number.isFinite(safeLimit) || !Number.isFinite(safeWindowMs) || safeLimit <= 0 || safeWindowMs <= 0) {
    return { allowed: true }
  }

  const now = Date.now()
  cleanup(now)

  const ip = getClientIp(request)
  const bucketKey = `${key}:${ip}`
  const current = buckets.get(bucketKey)

  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + safeWindowMs })
    return { allowed: true }
  }

  current.count += 1

  if (current.count <= safeLimit) {
    return { allowed: true }
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  return {
    allowed: false,
    retryAfterSeconds,
    response: NextResponse.json(
      {
        error: `${message} Tente novamente em ${retryAfterSeconds}s.`,
        code: 'RATE_LIMITED',
        retryAfterSeconds,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
      }
    ),
  }
}
