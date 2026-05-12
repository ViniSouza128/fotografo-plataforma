'use client';
// src/app/page.js — Página inicial com hero e grade de eventos

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import {
  applyNextImageFallback,
  getEventCoverCandidates,
  getFirstUrl,
  getPhotoGridPreviewCandidates,
} from '@/lib/imagePaths';

export default function HomePage() {
  const [events, setEvents]   = useState([]);
  const [photos, setPhotos]   = useState([]);
  const [config, setConfig]   = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado');
      if (raw) { const cli = JSON.parse(raw); if (cli?.isAdmin) setIsAdmin(true); }
    } catch {}
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [evRes, phRes, cfgRes] = await Promise.all([
          fetch('/api/events'),
          fetch('/api/photos'),
          fetch('/api/config'),
        ]);
        setEvents(await evRes.json());
        setPhotos(await phRes.json());
        setConfig(await cfgRes.json());
      } catch { setError('Erro ao carregar eventos.'); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  function formatDate(d) {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  function photoCount(eventId) { return photos.filter(p => p.eventId === eventId).length; }

  // Thumbnail da primeira foto do evento para preview na listagem
  function eventFirstPhoto(eventId) {
    const p = photos.find(ph => ph.eventId === eventId);
    if (!p) return null;
    // Prefere thumbnail (400px) → wm (2048px) → original
    return getPhotoGridPreviewCandidates(p);
  }

  const [busca, setBusca] = useState('');
  const nomeEstudio = config.nomeEstudio || 'Vinícius Rodrigues Fotografia';

  // Filtrar eventos privados; não-listados ficam ocultos para visitantes comuns
  const eventsVisiveis = events.filter(ev => {
    const vis = ev.visibilidade || 'publico';
    if (vis === 'privado') return false;
    if (vis === 'naolistado' && !isAdmin) return false;
    return true;
  });

  // Filtro de busca de álbuns
  const eventsFiltrados = busca.trim()
    ? eventsVisiveis.filter(ev => {
        const termo = busca.toLowerCase();
        const [y, m, d] = (ev.date || '').split('-');
        const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
        const mesNome = m ? meses[parseInt(m) - 1] || '' : '';
        const buscarEm = [ev.name, ev.description, ev.categoria, ev.cidade, ev.date, `${d}/${m}/${y}`, mesNome, m, y].filter(Boolean).join(' ').toLowerCase();
        return buscarEm.includes(termo);
      })
    : eventsVisiveis;

  return (
    <>
      <Navbar />

      {/* ——— HERO ——— */}
      <section style={{
        position: 'relative',
        padding: 'clamp(4rem, 10vw, 8rem) 2rem',
        textAlign: 'center',
        overflow: 'hidden',
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Fundo com gradiente sutil */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(201,169,110,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '680px', margin: '0 auto' }}>
          <p style={{
            fontSize: '0.72rem', letterSpacing: '0.25em', textTransform: 'uppercase',
            color: 'var(--accent)', marginBottom: '1rem',
          }}>
            Fotografia profissional
          </p>
          <h1 style={{
            fontFamily: 'var(--font-heading)', fontSize: 'clamp(2.8rem, 7vw, 5rem)',
            fontWeight: '300', lineHeight: '1.05', letterSpacing: '0.02em',
            color: 'var(--text)', marginBottom: '1.25rem',
          }}>
            {nomeEstudio}
          </h1>
          <p style={{
            color: 'var(--text-muted)', fontSize: '1rem', lineHeight: '1.7',
            maxWidth: '480px', margin: '0 auto 2rem',
          }}>
            {config.homeHeroSubtitulo || "Encontre as fotos do seu evento, selecione os seus salvos e baixe os originais sem marca d'água."}
          </p>

          {/* Social media buttons */}
          {(config.instagram || config.whatsapp) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {config.instagram && (
                <a
                  href={`https://instagram.com/${config.instagram.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.5rem 1rem', borderRadius: '100px',
                    background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)',
                    color: '#fff', fontSize: '0.85rem', fontWeight: 600,
                    textDecoration: 'none', transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  Instagram
                </a>
              )}
              {config.whatsapp && (
                <a
                  href={`https://wa.me/55${config.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.5rem 1rem', borderRadius: '100px',
                    background: '#25D366', color: '#fff', fontSize: '0.85rem', fontWeight: 600,
                    textDecoration: 'none', transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  WhatsApp
                </a>
              )}
            </div>
          )}

          {eventsVisiveis.length > 0 && (
            <a href="#eventos" className="btn btn-primary btn-lg">
              Ver Eventos ↓
            </a>
          )}
        </div>

        {/* Linha decorativa */}
        <div style={{
          position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '60px', height: '2px', background: 'var(--accent)', opacity: 0.4,
        }} />
      </section>

      {/* ——— GRADE DE EVENTOS ——— */}
      <main id="eventos" className="page-container">
        <div className="page-header">
          <div className="flex-between" style={{ flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 className="page-title">{config.homeSecaoTitulo || 'Eventos Recentes'}</h2>
             {!loading && eventsVisiveis.length > 0 && (
  <p className="page-subtitle">
    {eventsVisiveis.length} álbum{eventsVisiveis.length !== 1 ? 's' : ''}{' '}
    {eventsVisiveis.length !== 1 ? 'disponíveis' : 'disponível'}
  </p>
)}
            </div>
            {!loading && eventsVisiveis.length > 3 && (
              <div style={{ position: 'relative', minWidth: '240px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Buscar álbum, mês, ano..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  style={{ paddingLeft: '2.2rem', fontSize: '0.85rem' }}
                />
                <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</span>
              </div>
            )}
          </div>
        </div>

        {loading && (
          <div className="flex-center" style={{ padding: '5rem', gap: '1rem' }}>
            <div className="spinner" style={{ width: '32px', height: '32px' }} />
            <span style={{ color: 'var(--text-muted)' }}>Carregando eventos...</span>
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {!loading && !error && eventsVisiveis.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📷</div>
            <h2 className="empty-state-title">Nenhum evento disponível</h2>
            <p>Em breve novos álbuns serão publicados!</p>
          </div>
        )}

        {!loading && eventsVisiveis.length > 0 && eventsFiltrados.length === 0 && busca.trim() && (
          <div className="empty-state" style={{ padding: '3rem 0' }}>
            <p style={{ color: 'var(--text-muted)' }}>Nenhum álbum encontrado para "{busca}"</p>
          </div>
        )}

        {!loading && eventsFiltrados.length > 0 && (
          <div className="events-grid">
            {eventsFiltrados.map(event => {
              const thumbInfo = eventFirstPhoto(event.id);
              const count     = photoCount(event.id);
              const coverCandidates = getEventCoverCandidates(event, { watermark: 'clean', purpose: 'cover' });
              const imgCandidates = coverCandidates.length > 0 ? coverCandidates : (thumbInfo || []);
              const imgSrc = getFirstUrl(imgCandidates);
              const isAlbumFree = !!event.albumGratis;

              return (
                <Link key={event.id} href={`/evento/${event.id}`} className="event-card">
                  <div className="event-card-cover">
                    {imgSrc ? (
                      <img src={imgSrc} alt={event.name} loading="lazy"
                        onError={e => {
                          if (!applyNextImageFallback(e.target, imgCandidates)) {
                            e.target.style.display = 'none';
                          }
                        }} />
                    ) : (
                      <div className="event-card-cover-placeholder">📷</div>
                    )}

                    {/* Badge com contagem de fotos sobre a capa */}
                    {count > 0 && (
                      <div style={{
                        position: 'absolute', top: '0.75rem', left: '0.75rem',
                        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                        color: 'white', padding: '0.25rem 0.65rem', borderRadius: '100px',
                        fontSize: '0.72rem', letterSpacing: '0.06em',
                      }}>
                        📷 {count} foto{count !== 1 ? 's' : ''}
                      </div>
                    )}
                    {isAlbumFree && (
                      <div style={{
                        position: 'absolute', bottom: '0.75rem', left: '0.75rem',
                        background: 'rgba(34,197,94,0.9)', color: '#0d2e12',
                        padding: '0.25rem 0.65rem', borderRadius: '999px',
                        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em',
                        boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
                      }}>
                        🎁 Álbum gratuito
                      </div>
                    )}
                    {/* Badge "Não listado" visível apenas para admin */}
                    {isAdmin && event.visibilidade === 'naolistado' && (
                      <div style={{
                        position: 'absolute', top: '0.75rem', right: '0.75rem',
                        background: 'rgba(245,158,11,0.9)', color: '#000',
                        padding: '0.2rem 0.55rem', borderRadius: '4px',
                        fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em',
                      }}>
                        🔒 Não listado
                      </div>
                    )}
                  </div>

                  <div className="event-card-body">
                    <h2 className="event-card-title">{event.name}</h2>
                    <div className="event-card-meta">
                      <span>📅 {formatDate(event.date)}</span>
                      <span className="event-card-badge">Ver galeria →</span>
                    </div>
                    {isAlbumFree && (
                      <div style={{
                        marginTop: '0.5rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        background: 'rgba(34,197,94,0.12)',
                        color: 'var(--success)',
                        padding: '0.35rem 0.6rem',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                      }}>
                        🎁 Gratuito para o cliente
                      </div>
                    )}
                    {event.description && (
                      <p style={{
                        marginTop: '0.65rem', fontSize: '0.82rem', color: 'var(--text-muted)',
                        lineHeight: '1.5', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {event.description}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <Footer />
    </>
  );
}
