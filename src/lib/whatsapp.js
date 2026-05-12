export function normalizarWhatsApp(value) {
  let digits = String(value || '').replace(/\D/g, '');

  if (digits.length > 11 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }

  return digits.slice(0, 11);
}

export function formatarWhatsApp(value) {
  const digits = normalizarWhatsApp(value);
  if (!digits) return '';

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  return String(value || '');
}

export function mascararWhatsAppTempoReal(value) {
  const digits = normalizarWhatsApp(value);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function buildWhatsAppHref(value) {
  const digits = normalizarWhatsApp(value);
  if (!digits) return '';
  return `https://wa.me/55${digits}`;
}
