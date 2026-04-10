/**
 * Normaliza um número de telefone para o formato E.164 sem o '+':
 * "(14) 99999-9999" | "+55 14 99999-9999" | "14999999999" → "5514999999999"
 * Retorna null se o número não puder ser identificado como brasileiro válido.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = raw.replace(/\D/g, '');

  // Já em formato E.164: 55 + DDD (2) + número (8 ou 9) = 12 ou 13 dígitos
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // DDD (2) + número (8 ou 9) = 10 ou 11 dígitos — prefixar com 55
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return null;
}
