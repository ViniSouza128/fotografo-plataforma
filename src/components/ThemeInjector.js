'use client'

import { useEffect } from 'react'

function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return { r, g, b }
}

function darken(hex, amount = 0.2) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const r = Math.max(0, Math.round(rgb.r * (1 - amount)))
  const g = Math.max(0, Math.round(rgb.g * (1 - amount)))
  const b = Math.max(0, Math.round(rgb.b * (1 - amount)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export function buildThemeStyleContent(accentColor) {
  if (!accentColor || !/^#[0-9a-fA-F]{6}$/.test(accentColor)) return ''
  const rgb = hexToRgb(accentColor)
  if (!rgb) return ''
  const hover = darken(accentColor, 0.2)
  const dim = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`
  return `:root { --accent: ${accentColor}; --accent-hover: ${hover}; --accent-dim: ${dim}; }`
}

export default function ThemeInjector() {
  useEffect(() => {
    let active = true

    async function applyTheme() {
      try {
        const res = await fetch('/api/config')
        if (!res.ok || !active) return
        const cfg = await res.json()

        const tema = cfg.tema || 'escuro'
        if (tema === 'escuro') {
          document.documentElement.removeAttribute('data-theme')
        } else {
          document.documentElement.setAttribute('data-theme', tema)
        }

        let styleEl = document.getElementById('theme-custom-vars')
        const styleContent = buildThemeStyleContent(cfg.accentColor)
        if (styleContent) {
          if (!styleEl) {
            styleEl = document.createElement('style')
            styleEl.id = 'theme-custom-vars'
            document.head.appendChild(styleEl)
          }
          styleEl.textContent = styleContent
        } else if (styleEl) {
          styleEl.remove()
        }
      } catch {}
    }

    applyTheme()
    return () => { active = false }
  }, [])

  return null
}
