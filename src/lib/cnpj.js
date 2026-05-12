export function normalizarCNPJ(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 14);
}

export function validarCNPJ(value) {
  const digits = normalizarCNPJ(value);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const calcDigit = (base, weights) => {
    const sum = base
      .split('')
      .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const first = calcDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calcDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(digits[12]) && second === Number(digits[13]);
}

export function formatarCNPJ(value) {
  const digits = normalizarCNPJ(value);
  if (digits.length !== 14) return String(value || '');
  const [a, b, c, d] = [
    digits.slice(0, 2),
    digits.slice(2, 5),
    digits.slice(5, 8),
    digits.slice(8, 12),
  ];
  const e = digits.slice(12);
  return `${a}.${b}.${c}/${d}-${e}`;
}

export function mascararCNPJ(value) {
  const digits = normalizarCNPJ(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export const mascararCNPJTempoReal = mascararCNPJ;
