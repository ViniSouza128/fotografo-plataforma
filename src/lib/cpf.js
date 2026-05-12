// Validação de CPF (algoritmo completo com dígitos verificadores)

export function normalizarCPF(cpf) {
  return String(cpf || '').replace(/\D/g, '').slice(0, 11);
}

export function validarCPF(cpf) {
  const limpo = normalizarCPF(cpf);
  if (limpo.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(limpo)) return false; // todos iguais

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(limpo[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(limpo[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(limpo[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(limpo[10])) return false;

  return true;
}

export function formatarCPF(cpf) {
  const limpo = normalizarCPF(cpf);
  if (limpo.length !== 11) return cpf;
  return `${limpo.slice(0,3)}.${limpo.slice(3,6)}.${limpo.slice(6,9)}-${limpo.slice(9)}`;
}

export function mascararCPF(cpf) {
  const limpo = normalizarCPF(cpf);
  if (limpo.length !== 11) return cpf;
  return `***.***.${limpo.slice(6,9)}-${limpo.slice(9)}`;
}

export function mascararCPFTempoReal(valor) {
  const digits = normalizarCPF(valor);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
