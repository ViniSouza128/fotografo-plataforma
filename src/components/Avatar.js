'use client'
// src/components/Avatar.js
// Mostra a foto de perfil do cliente (thumb por padrão) com fallback de iniciais.

const SIZE_DEFAULT = 40

function getInitials(client) {
  const src = client?.nomeCompleto || client?.nome || client?.email || '?'
  return String(src)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || '?'
}

export default function Avatar({
  client,
  size = SIZE_DEFAULT,
  variant = 'thumb',
  rounded = true,
  bordered = true,
  fontScale = 0.42,
  style,
  alt,
}) {
  const url = variant === 'large'
    ? (client?.avatar?.large || client?.avatar?.thumb || null)
    : (client?.avatar?.thumb || client?.avatar?.large || null)
  const v = client?.avatar?.updatedAt ? `?v=${encodeURIComponent(client.avatar.updatedAt)}` : ''
  const src = url ? `${url}${v}` : null
  const initials = getInitials(client)
  const radius = rounded ? '50%' : 'var(--radius)'

  const baseStyle = {
    width: size, height: size,
    borderRadius: radius,
    background: 'var(--bg-secondary)',
    border: bordered ? '1px solid var(--border)' : 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--accent)',
    fontFamily: 'var(--font-heading)',
    fontSize: Math.max(10, Math.round(size * fontScale)),
    overflow: 'hidden',
    flexShrink: 0,
    ...(style || {}),
  }

  if (src) {
    return (
      <img
        src={src}
        alt={alt || client?.nomeCompleto || client?.nome || 'Avatar'}
        loading="lazy"
        decoding="async"
        style={{ ...baseStyle, objectFit: 'cover', color: 'transparent' }}
      />
    )
  }
  return <div aria-label={alt || 'Sem foto'} style={baseStyle}>{initials}</div>
}
