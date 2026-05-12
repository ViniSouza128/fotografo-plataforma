'use client'
// src/components/Footer.js

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatarCNPJ } from '@/lib/cnpj'

const legalLinks = [
  { href: '/termos-de-uso', label: 'Termos de Uso' },
  { href: '/politica-de-privacidade', label: 'Privacidade' },
  { href: '/politica-de-cookies', label: 'Cookies' },
  { href: '/autenticidade', label: 'Autenticidade' },
  { href: '/contato', label: 'Contato' },
]

function hasBusinessData(cfg) {
  return Boolean(cfg?.cnpj && cfg?.razaoSocial && cfg?.localizacao)
}

export default function Footer() {
  const [config, setConfig] = useState({
    nomeEstudio: 'Vinicius Rodrigues de Souza',
    cnpj: '',
    razaoSocial: '',
    localizacao: '',
  })

  useEffect(() => {
    let active = true

    async function loadConfig() {
      try {
        const res = await fetch('/api/config')
        if (!res.ok) return
        const cfg = await res.json()
        if (!active) return
        setConfig(prev => ({ ...prev, ...cfg }))
      } catch {}
    }

    loadConfig()
    return () => {
      active = false
    }
  }, [])

  const showBusiness = hasBusinessData(config)

  return (
    <footer className="footer">
      {showBusiness ? (
        <p>
          © {new Date().getFullYear()} <span>{config.razaoSocial}</span> · CNPJ: {formatarCNPJ(config.cnpj) || config.cnpj} · {config.localizacao}
        </p>
      ) : (
        <p>
          © {new Date().getFullYear()} <span>{config.nomeEstudio || 'Vinicius Rodrigues de Souza'}</span> · Todos os direitos reservados
        </p>
      )}
      <div className="footer-links">
        {legalLinks.map((item, index) => (
          <span key={item.href} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem' }}>
            {index > 0 && <span className="footer-sep">·</span>}
            <Link href={item.href}>{item.label}</Link>
          </span>
        ))}
      </div>
    </footer>
  )
}
