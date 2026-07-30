// Fraîcheur d'un prix saisi : les prix de l'hôtel de vente bougent vite,
// un prix vieux de plus d'une semaine est probablement faux.

export const FRESH_MS = 3 * 24 * 60 * 60 * 1000; // < 3 jours : neutre
export const AGING_MS = 7 * 24 * 60 * 60 * 1000; // < 7 jours : à surveiller

export type Freshness = 'fresh' | 'aging' | 'stale';

export function freshnessOf(timestamp: number, now: number): Freshness {
  const age = now - timestamp;
  if (age < FRESH_MS) return 'fresh';
  if (age < AGING_MS) return 'aging';
  return 'stale';
}

/** « il y a 3 j », « il y a 2 h », « à l'instant » */
export function ageLabel(timestamp: number, now: number): string {
  const age = Math.max(0, now - timestamp);
  const hours = Math.floor(age / 3_600_000);
  if (hours < 1) return "à l'instant";
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}
