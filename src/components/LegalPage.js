import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { formatarCNPJ } from '@/lib/cnpj'
import { formatarCPF } from '@/lib/cpf'
import { formatarWhatsApp, buildWhatsAppHref } from '@/lib/whatsapp'
import { getStudioDisplayName, getPublicStudioConfig } from '@/lib/publicStudio'

function getDocumentLabel(studio) {
  if (studio.cnpj) return `CNPJ: ${formatarCNPJ(studio.cnpj) || studio.cnpj}`
  if (studio.cpf) return `CPF: ${formatarCPF(studio.cpf) || studio.cpf}`
  return 'Documento nao informado'
}

export function StudioSummary({ studio }) {
  const displayName = getStudioDisplayName(studio)
  const whatsappHref = buildWhatsAppHref(studio.whatsapp)

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: '8px',
      background: 'var(--bg-card)',
      padding: '1rem',
      color: 'var(--text-muted)',
      fontSize: '0.92rem',
      lineHeight: 1.7,
    }}>
      <strong style={{ color: 'var(--text)' }}>{displayName}</strong><br />
      {getDocumentLabel(studio)}<br />
      {studio.localizacao ? <>{studio.localizacao}<br /></> : null}
      {whatsappHref ? (
        <a href={whatsappHref} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
          WhatsApp: {formatarWhatsApp(studio.whatsapp)}
        </a>
      ) : (
        <span>WhatsApp nao informado</span>
      )}
    </div>
  )
}

export default function LegalPage({ title, intro, children }) {
  const studio = getPublicStudioConfig()

  return (
    <>
      <Navbar />
      <main style={{
        width: 'min(920px, calc(100% - 2rem))',
        margin: '0 auto',
        padding: '3rem 0 4rem',
      }}>
        <div style={{ marginBottom: '2rem' }}>
          <p style={{
            color: 'var(--accent)',
            fontSize: '0.78rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: '0.75rem',
          }}>
            Informacoes legais
          </p>
          <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.4rem)', marginBottom: '1rem' }}>{title}</h1>
          <p style={{ color: 'var(--text-muted)', maxWidth: '700px', fontSize: '1rem' }}>{intro}</p>
        </div>

        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <StudioSummary studio={studio} />
          <article style={{
            border: '1px solid var(--border)',
            borderRadius: '8px',
            background: 'var(--bg-card)',
            padding: 'clamp(1.25rem, 4vw, 2rem)',
          }}>
            {children}
          </article>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <Link className="btn btn-secondary" href="/contato">Falar com o estudio</Link>
            <Link className="btn btn-ghost" href="/minha-conta/remocoes">Solicitacoes LGPD</Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

export function LegalSection({ title, children }) {
  return (
    <section style={{ marginBottom: '1.75rem' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{title}</h2>
      <div style={{ color: 'var(--text-muted)' }}>{children}</div>
    </section>
  )
}

export function LegalList({ items }) {
  return (
    <ul style={{ paddingLeft: '1.1rem', display: 'grid', gap: '0.55rem' }}>
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  )
}
