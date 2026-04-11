// src/shared/utils/addressParser.ts
// This file implements a utility function to parse city and state from a formatted address string
// specifically tailored for Brazilian addresses.

const BR_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const CITY_STATE_REGEX = new RegExp(
  `([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\\s]+?)\\s*(?:-|,)\\s*(${BR_STATES.join('|')})(?=[,\\s\\d]|$)`,
  'gi',
);

/**
 * Extracts city and state from a formatted address string provided by Google Maps.
 * "R. Silva, 123 - Centro, Botucatu - SP, 18600-000, Brasil" - it will return { city: "Botucatu", state: "SP" }.
 */
export function parseAddressFromGoogle(formattedAddress: string | null | undefined): {
  city: string | null;
  state: string | null;
} {
  if (!formattedAddress) return { city: null, state: null };

  CITY_STATE_REGEX.lastIndex = 0;

  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = CITY_STATE_REGEX.exec(formattedAddress)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) return { city: null, state: null };

  return {
    city: lastMatch[1].trim() || null,
    state: lastMatch[2].toUpperCase(),
  };
}
