// src/app/not-found.js
// Página 404 personalizada

import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '1rem',
      padding: '2rem',
      textAlign: 'center',
      background: 'var(--bg)',
      color: 'var(--text)',
    }}>
      <p style={{ fontSize: '4rem' }}>📷</p>
      <h1 style={{
        fontFamily: 'var(--font-heading)',
        fontSize: '3rem',
        fontWeight: '300',
        color: 'var(--text)',
      }}>
        Página não encontrada
      </h1>
      <p style={{ color: 'var(--text-muted)' }}>
        O que você procura não está aqui.
      </p>
      <Link href="/" style={{
        marginTop: '1rem',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: 'var(--accent)',
        color: '#1a1200',
        padding: '0.65rem 1.5rem',
        borderRadius: '6px',
        fontFamily: 'var(--font-body)',
        fontSize: '0.85rem',
        textDecoration: 'none',
      }}>
        ← Voltar ao início
      </Link>
    </div>
  );
}
