export function temApenasUmNome(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return parts.length === 1;
}

export function confirmarNomeComUmaPalavra(value, acao = 'salvar') {
  if (!temApenasUmNome(value)) return true;
  if (typeof window === 'undefined') return true;

  return window.confirm(
    `⚠️ Atenção\n\nParece que você informou apenas um nome.\nDeseja mesmo ${acao} assim?`
  );
}
