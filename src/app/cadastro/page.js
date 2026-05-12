'use client';
// src/app/cadastro/page.js
// Pagina de cadastro de novo cliente

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { validarCPF, normalizarCPF, mascararCPFTempoReal } from '@/lib/cpf';
import { validarCNPJ, normalizarCNPJ, mascararCNPJTempoReal } from '@/lib/cnpj';
import { normalizarWhatsApp, mascararWhatsAppTempoReal } from '@/lib/whatsapp';
import { confirmarNomeComUmaPalavra } from '@/lib/nome';

export default function CadastroPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    nomeCompleto: '',
    email: '',
    whatsapp: '',
    cpf: '',
    documentType: 'cpf',
    dataNascimento: '',
    senha: '',
    confirmarSenha: '',
    privacyAccepted: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [ready, setReady] = useState(false);
  const [cameFromGuestCheckout, setCameFromGuestCheckout] = useState(false);

  // Se ja estiver logado, redireciona. Caso contrário, libera o formulário.
  // O estado 'ready' garante que o formulário só renderiza após checar o
  // localStorage — evita o bug onde o componente monta, o useEffect ainda
  // não rodou, o usuário clica em "Criar Conta" e o clique cai no vazio
  // porque o React está no meio de um re-render/hidration.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('clienteLogado');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id) {
          router.replace('/minha-conta');
          return;
        }
      }
    } catch {
      // localStorage corrompido — limpa e segue normalmente
      try { localStorage.removeItem('clienteLogado'); } catch {}
    }
    setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    if (from !== 'checkout-guest') return;

    const nome = params.get('nome') || '';
    const email = params.get('email') || '';
    const whatsapp = params.get('whatsapp') || '';
    const documento = params.get('cpf') || params.get('cnpj') || '';
    const documentType = normalizarCNPJ(documento).length > 11 ? 'cnpj' : 'cpf';

    setForm(prev => ({
      ...prev,
      nomeCompleto: prev.nomeCompleto || nome,
      email: prev.email || email,
      whatsapp: prev.whatsapp || mascararWhatsAppTempoReal(whatsapp),
      cpf: prev.cpf || (documentType === 'cnpj' ? mascararCNPJTempoReal(documento) : mascararCPFTempoReal(documento)),
      documentType,
    }));
    setCameFromGuestCheckout(true);
  }, []);

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleDocumentTypeChange(type) {
    setForm(prev => ({ ...prev, documentType: type, cpf: '' }));
  }

  function handleDocumentoChange(value) {
    setForm(prev => ({
      ...prev,
      cpf: prev.documentType === 'cnpj'
        ? mascararCNPJTempoReal(value)
        : mascararCPFTempoReal(value),
    }));
  }

  function handleWhatsappChange(value) {
    setForm(prev => ({ ...prev, whatsapp: mascararWhatsAppTempoReal(value) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Validacoes do front-end
    if (!form.nomeCompleto.trim()) {
      setError('Nome completo e obrigatorio.');
      return;
    }
    if (!confirmarNomeComUmaPalavra(form.nomeCompleto, 'cadastrar')) {
      return;
    }
    if (!form.email.trim()) {
      setError('E-mail e obrigatorio.');
      return;
    }
    if (!form.whatsapp.trim()) {
      setError('WhatsApp e obrigatorio.');
      return;
    }

    const documentoDigits = form.documentType === 'cnpj'
      ? normalizarCNPJ(form.cpf)
      : normalizarCPF(form.cpf);
    const documentoValido = form.documentType === 'cnpj'
      ? validarCNPJ(documentoDigits)
      : validarCPF(documentoDigits);
    if (!documentoValido) {
      setError(`${form.documentType === 'cnpj' ? 'CNPJ' : 'CPF'} invalido. Verifique os digitos informados.`);
      return;
    }

    if (!form.dataNascimento) {
      setError('Data de nascimento e obrigatoria.');
      return;
    }
    if (form.senha.length < 6) {
      setError('A senha deve ter no minimo 6 caracteres.');
      return;
    }
    if (form.senha !== form.confirmarSenha) {
      setError('As senhas nao coincidem.');
      return;
    }
    if (!form.privacyAccepted) {
      setError('Voce precisa aceitar a politica de privacidade para criar a conta.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeCompleto: form.nomeCompleto.trim(),
          email: form.email.trim(),
          whatsapp: normalizarWhatsApp(form.whatsapp),
          cpf: form.documentType === 'cpf' ? documentoDigits : null,
          cnpj: form.documentType === 'cnpj' ? documentoDigits : null,
          documentType: form.documentType,
          dataNascimento: form.dataNascimento,
          senha: form.senha,
          acceptsPrivacyPolicy: form.privacyAccepted,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erro ao criar conta.');
        setLoading(false);
        return;
      }

      // Armazena o cliente no localStorage (sem senha)
      localStorage.setItem('clienteLogado', JSON.stringify(data.client));
      router.push('/minha-conta');
    } catch (err) {
      setError('Erro de conexao. Tente novamente.');
      setLoading(false);
    }
  }

  // Componente inline do botao de toggle de senha
  function EyeToggle({ show, onToggle }) {
    return (
      <button
        type="button"
        onClick={onToggle}
        style={{
          position: 'absolute',
          right: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
          padding: '0.25rem',
          display: 'flex',
          alignItems: 'center',
        }}
        tabIndex={-1}
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {show ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    );
  }

  // Não renderiza nada até saber se o usuário já está logado.
  // Isso evita o flash de formulário + o bug de clique perdido durante hydration.
  if (!ready) return null;

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 480 }}>
        {/* Titulo */}
        <div className="login-brand">
          <h1 className="login-brand-name">Criar Conta</h1>
          <p className="login-brand-sub">Preencha seus dados para comecar</p>
        </div>

        {/* Mensagem de erro */}
        {error && <div className="login-error">{error}</div>}
        {cameFromGuestCheckout && !error && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.65rem 0.8rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text-muted)',
              fontSize: '0.78rem',
              lineHeight: '1.5',
            }}
          >
            Conta nova com seus dados do checkout guest. Defina a senha para salvar suas compras permanentemente.
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="cad-nome">Nome Completo</label>
            <input
              id="cad-nome"
              type="text"
              className="form-input"
              placeholder="Seu nome completo"
              value={form.nomeCompleto}
              onChange={e => handleChange('nomeCompleto', e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="cad-email">E-mail</label>
            <input
              id="cad-email"
              type="email"
              className="form-input"
              placeholder="seu@email.com"
              value={form.email}
              onChange={e => handleChange('email', e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="cad-whatsapp">WhatsApp (com DDD)</label>
            <input
              id="cad-whatsapp"
              type="tel"
              className="form-input"
              placeholder="(11) 99999-9999"
              value={form.whatsapp}
              onChange={e => handleWhatsappChange(e.target.value)}
              maxLength={15}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="cad-documento">Documento</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              {['cpf', 'cnpj'].map(type => (
                <button
                  key={type}
                  type="button"
                  className={`btn btn-sm ${form.documentType === type ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => handleDocumentTypeChange(type)}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
            <input
              id="cad-documento"
              type="text"
              className="form-input"
              placeholder={form.documentType === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'}
              value={form.cpf}
              onChange={e => handleDocumentoChange(e.target.value)}
              maxLength={form.documentType === 'cnpj' ? 18 : 14}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="cad-nascimento">Data de Nascimento</label>
            <input
              id="cad-nascimento"
              type="date"
              className="form-input"
              value={form.dataNascimento}
              onChange={e => handleChange('dataNascimento', e.target.value)}
              required
              style={{ colorScheme: 'dark' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="cad-senha">Senha (min. 6 caracteres)</label>
            <div style={{ position: 'relative' }}>
              <input
                id="cad-senha"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••"
                value={form.senha}
                onChange={e => handleChange('senha', e.target.value)}
                minLength={6}
                required
                style={{ paddingRight: '3rem' }}
              />
              <EyeToggle
                show={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="cad-confirmar-senha">Confirmar Senha</label>
            <div style={{ position: 'relative' }}>
              <input
                id="cad-confirmar-senha"
                type={showConfirmPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••"
                value={form.confirmarSenha}
                onChange={e => handleChange('confirmarSenha', e.target.value)}
                minLength={6}
                required
                style={{ paddingRight: '3rem' }}
              />
              <EyeToggle
                show={showConfirmPassword}
                onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
              />
            </div>
          </div>

          <label style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', margin: '0.25rem 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.45, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.privacyAccepted}
              onChange={e => handleChange('privacyAccepted', e.target.checked)}
              required
              style={{ marginTop: '0.18rem', accentColor: 'var(--accent)' }}
            />
            <span>
              Li e aceito a politica de privacidade e o tratamento dos meus dados para cadastro, compra e entrega das fotos.
            </span>
          </label>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading}
            style={{ marginTop: '0.5rem' }}
          >
            {loading ? (
              <><div className="spinner" /> Criando conta...</>
            ) : (
              'Criar Conta'
            )}
          </button>
        </form>

        {/* Link para login */}
        <div style={{
          marginTop: '1.75rem',
          textAlign: 'center',
          fontSize: '0.82rem',
          color: 'var(--text-dim)',
        }}>
          <p>
            Ja tem conta?{' '}
            <Link
              href="/login"
              style={{
                color: 'var(--accent)',
                fontWeight: 500,
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
              }}
            >
              Faca login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
