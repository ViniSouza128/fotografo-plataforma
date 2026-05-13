// src/app/layout.js
// Layout raiz - envolve todas as paginas do site
import './globals.css';
import ThemeInjector from '../components/ThemeInjector';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://fotografo-plataforma.onrender.com').replace(/\/+$/, '');
const title = 'Vinícius Rodrigues | Fotografia';
const description = 'Plataforma de venda de fotos — Vinícius Rodrigues de Souza';

export const viewport = {
  themeColor: '#111418',
};

export const metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: title,
  title,
  description,
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/brand/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/brand/favicon-32.png'],
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: title,
    title,
    description,
    url: '/',
    images: [
      {
        url: '/brand/og-preview.png',
        width: 1200,
        height: 630,
        alt: 'Identidade visual da plataforma Vinícius Rodrigues Fotografia',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/brand/og-preview.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <ThemeInjector />
        {children}
      </body>
    </html>
  );
}
