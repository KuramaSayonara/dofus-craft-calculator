// Saisie et affichage des montants en kamas.
// Arithmétique entière sur les chiffres : aucune multiplication flottante,
// donc aucune dérive (« 1.2m » vaut exactement 1 200 000).

/** Séparateur de milliers à l'affichage (espace fine insécable U+202F). */
export const KAMAS_GROUP_SEPARATOR = ' ';

// espaces tolérés en saisie : blancs usuels + insécable + fine insécable
const SPACES = /[\s  ]/g;
const KAMAS_PATTERN = /^([0-9]+)(?:\.([0-9]+))?([km]?)$/;

/**
 * Interprète une saisie utilisateur : « 350k » → 350 000, « 1.2m » → 1 200 000,
 * « 1,5k » → 1 500, « 12 000 » → 12 000. Renvoie null si la saisie n'est pas
 * un montant entier de kamas non ambigu (on ne devine jamais).
 */
export function parseKamas(input: string): number | null {
  const cleaned = input.replace(SPACES, '').toLowerCase().replace(',', '.');
  const match = KAMAS_PATTERN.exec(cleaned);
  if (match === null) return null;
  const intPart = match[1]!;
  const fracPart = match[2] ?? '';
  const suffix = match[3]!;
  const shift = suffix === 'm' ? 6 : suffix === 'k' ? 3 : 0;
  // fraction sans suffixe (« 12.5 ») ou plus précise que le suffixe
  // (« 1.2345k » = 1234,5 kamas) → kamas fractionnaires → rejet
  if (fracPart.length > shift) return null;
  const digits = intPart + fracPart.padEnd(shift, '0');
  if (digits.length > 15) return null; // au-delà de la précision entière sûre
  return Number(digits);
}

/** Formate un montant entier : 1234567 → « 1␟234␟567 » (séparateur U+202F). */
export function formatKamas(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`montant non entier : ${amount}`);
  }
  const sign = amount < 0 ? '-' : '';
  const digits = String(Math.abs(amount));
  const grouped = digits.replace(/\B(?=(\d{3})+$)/g, KAMAS_GROUP_SEPARATOR);
  return sign + grouped;
}
