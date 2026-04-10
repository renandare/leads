// src/shared/utils/nameFormatter.ts
// This file implements a utility function to normalize business names by removing common suffixes
// and formatting them in title case.

const BUSINESS_SUFFIXES = [
  'LTDA', 'LTDA.', 'S/A', 'S.A.', 'SA', 'ME', 'EPP', 'EIRELI', 'EIRELE', 'EI',
  'MICROEMPRESA', 'INDIVIDUAL', 'MEI'
];

// Regex to match business suffixes at the end of the name
const SUFFIX_REGEX = new RegExp(
  `\\s*[\\-,]?\\s*\\b(${BUSINESS_SUFFIXES.map(s => s.replace('.', '\\.')).join('|')})\\b[.\\s]*$`,
  'i',
);

 // Normalizes business names by removing common suffixes and formatting in title case.:
 // "ELETRICA SILVA LTDA" → "Eletrica Silva"
 // "João eletricista ME." → "João Eletricista"
 
export function normalizeName(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const cleaned = raw
    .trim()
    .replace(SUFFIX_REGEX, '')
    .replace(/[,\-]\s*$/, '')
    .trim();

  if (!cleaned) return null;

  // Preserve accents and convert to title case
  return cleaned
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
