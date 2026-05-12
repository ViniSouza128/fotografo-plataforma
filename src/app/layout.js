// src/app/layout.js
// Layout raiz - envolve todas as páginas do site
import './globals.css';
import ThemeInjector from '../components/ThemeInjector';

export const metadata = {
  title: 'Vinícius Rodrigues | Fotografia',
  description: 'Plataforma de venda de fotos — Vinícius Rodrigues de Souza',
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
