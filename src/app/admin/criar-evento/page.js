'use client';
// src/app/admin/criar-evento/page.js
// Página para criar um novo evento fotográfico

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CriarEventoPage() {
  const router = useRouter();

  // Dados do formulário
  const [form, setForm] = useState({
    name: '',
    date: '',
    description: '',
  });

  // Arquivo de imagem de capa (opcional)
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [draggingCover, setDraggingCover] = useState(false);   // ← NOVO

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [successMsg, setSuccessMsg] = useState('');

  // Atualiza o campo e limpa o erro correspondente
  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  }

  // Quando o usuário seleciona uma imagem de capa (clique)
  function handleCoverChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({ ...prev, cover: 'Apenas imagens são aceitas.' }));
      return;
    }

    setCoverFile(file);

    const reader = new FileReader();
    reader.onload = ev => setCoverPreview(ev.target.result);
    reader.readAsDataURL(file);

    setErrors(prev => ({ ...prev, cover: '' }));
  }

  // ==================== DRAG & DROP DA CAPA ====================
  function handleCoverDragOver(e) {
    e.preventDefault();
    setDraggingCover(true);
  }

  function handleCoverDragLeave(e) {
    e.preventDefault();
    setDraggingCover(false);
  }

  function handleCoverDrop(e) {
    e.preventDefault();
    setDraggingCover(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({ ...prev, cover: 'Apenas imagens são aceitas.' }));
      return;
    }

    setCoverFile(file);

    const reader = new FileReader();
    reader.onload = ev => setCoverPreview(ev.target.result);
    reader.readAsDataURL(file);

    setErrors(prev => ({ ...prev, cover: '' }));
  }
  // ===========================================================

  // Valida o formulário
  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Nome do evento é obrigatório.';
    if (!form.date) errs.date = 'Data do evento é obrigatória.';
    return errs;
  }

  // Envia o formulário
  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      let coverImageFilename = null;

      if (coverFile) {
        const fd = new FormData();
        fd.append('file', coverFile);

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: fd,
        });

        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) throw new Error(uploadData.error || 'Falha no upload da capa');
        coverImageFilename = uploadData.filename;
      }

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          date: form.date,
          description: form.description.trim(),
          coverImage: coverImageFilename,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao criar álbum');
      }

      const newEvent = await res.json();

      setSuccessMsg('Álbum criado com sucesso!');

      setTimeout(() => {
        router.push(`/admin/upload-fotos/${newEvent.id}`);
      }, 1200);

    } catch (err) {
      setErrors({ submit: err.message });
      setLoading(false);
    }
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <Link href="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            ← Dashboard
          </Link>
          <h1 className="admin-page-title" style={{ marginTop: '0.25rem' }}>Criar Novo Álbum</h1>
        </div>
      </div>

      <div style={{ maxWidth: '680px' }}>

        {successMsg && (
          <div className="alert alert-success mb-3">
            ✅ {successMsg} Redirecionando para upload de fotos...
          </div>
        )}

        {errors.submit && (
          <div className="alert alert-error mb-3">⚠ {errors.submit}</div>
        )}

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '2rem',
        }}>
          <form onSubmit={handleSubmit}>

            <div className="form-group">
              <label className="form-label">Nome do Álbum *</label>
              <input aria-label="Nome do Álbum *"
                type="text"
                className="form-input"
                placeholder="Ex: Casamento João e Maria"
                value={form.name}
                onChange={e => handleChange('name', e.target.value)}
                autoFocus
              />
              {errors.name && <span style={{ color: 'var(--danger)', fontSize: '0.78rem' }}>{errors.name}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Data do Álbum *</label>
              <input aria-label="Data do Álbum *"
                type="date"
                className="form-input"
                value={form.date}
                onChange={e => handleChange('date', e.target.value)}
              />
              {errors.date && <span style={{ color: 'var(--danger)', fontSize: '0.78rem' }}>{errors.date}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Descrição (opcional)</label>
              <textarea aria-label="Descrição (opcional)"
                className="form-textarea"
                placeholder="Descreva o álbum, local, contexto..."
                value={form.description}
                onChange={e => handleChange('description', e.target.value)}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Imagem de Capa (opcional)</label>

              {coverPreview && (
                <div style={{
                  position: 'relative',
                  marginBottom: '0.75rem',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  height: '160px',
                  background: 'var(--bg-secondary)',
                }}>
                  <img
                    src={coverPreview}
                    alt="Preview da capa"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <button
                    type="button"
                    onClick={() => { setCoverFile(null); setCoverPreview(null); }}
                    style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      background: 'rgba(0,0,0,0.7)',
                      border: 'none',
                      color: 'white',
                      padding: '0.3rem 0.6rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                    }}
                  >
                    ✕ Remover
                  </button>
                </div>
              )}

              <input aria-label="Imagem de Capa (opcional)"
                type="file"
                id="cover-input"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleCoverChange}
                style={{ display: 'none' }}
              />

              {!coverPreview && (
                <label htmlFor="cover-input" style={{ cursor: 'pointer' }}>
                  <div
                    className={`upload-zone ${draggingCover ? 'dragging' : ''}`}
                    onDragOver={handleCoverDragOver}
                    onDragLeave={handleCoverDragLeave}
                    onDrop={handleCoverDrop}
                    style={{ padding: '1.5rem' }}
                  >
                    <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🖼️</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Arraste a imagem de capa ou clique para selecionar
                    </p>
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      JPG, PNG ou WebP
                    </p>
                  </div>
                </label>
              )}

              {errors.cover && <span style={{ color: 'var(--danger)', fontSize: '0.78rem' }}>{errors.cover}</span>}
            </div>

            <hr className="divider" />

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading || !!successMsg}
              >
                {loading ? (
                  <><div className="spinner" /> Criando álbum...</>
                ) : (
                  '✅ Criar Álbum'
                )}
              </button>

              <Link href="/admin" className="btn btn-secondary btn-lg">
                Cancelar
              </Link>
            </div>

            <p style={{
              marginTop: '1rem',
              fontSize: '0.78rem',
              color: 'var(--text-dim)',
            }}>
              * Após criar, você será redirecionado para fazer o upload das fotos.
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
