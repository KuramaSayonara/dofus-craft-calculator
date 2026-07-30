// Import en masse de prix depuis une liste collée : une ligne = « nom;prix ».
// Chaque ligne non reconnue est rapportée avec sa raison — rien n'est deviné.

import { parseKamas } from '../../engine/index.ts';
import type { SearchEntry } from '../data.ts';
import { normalizeText, type PreparedIndex } from '../search.ts';

export interface BulkLine {
  readonly itemId: number;
  readonly name: string;
  readonly price: number;
}

export interface BulkError {
  readonly lineNumber: number;
  readonly text: string;
  readonly reason: string;
}

export interface BulkResult {
  readonly ok: ReadonlyArray<BulkLine>;
  readonly errors: ReadonlyArray<BulkError>;
}

/** index nom normalisé → entrées portant ce nom (les doublons existent en jeu) */
export function buildNameLookup(index: PreparedIndex): Map<string, SearchEntry[]> {
  const lookup = new Map<string, SearchEntry[]>();
  for (let i = 0; i < index.entries.length; i++) {
    const key = index.normalized[i]!;
    const list = lookup.get(key);
    if (list === undefined) lookup.set(key, [index.entries[i]!]);
    else list.push(index.entries[i]!);
  }
  return lookup;
}

export function parseBulkPrices(text: string, lookup: Map<string, SearchEntry[]>): BulkResult {
  const ok: BulkLine[] = [];
  const errors: BulkError[] = [];

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (raw === '') continue;
    const lineNumber = i + 1;

    const separator = raw.lastIndexOf(';');
    if (separator === -1) {
      errors.push({ lineNumber, text: raw, reason: 'pas de « ; » entre le nom et le prix' });
      continue;
    }
    const namePart = raw.slice(0, separator).trim();
    const pricePart = raw.slice(separator + 1).trim();
    if (namePart === '') {
      errors.push({ lineNumber, text: raw, reason: 'nom vide' });
      continue;
    }
    const price = parseKamas(pricePart);
    if (price === null) {
      errors.push({ lineNumber, text: raw, reason: `prix illisible : « ${pricePart} »` });
      continue;
    }
    const matches = lookup.get(normalizeText(namePart));
    if (matches === undefined || matches.length === 0) {
      errors.push({ lineNumber, text: raw, reason: 'objet introuvable' });
      continue;
    }
    if (matches.length > 1) {
      // même nom porté par plusieurs objets : on ne devine pas lequel
      errors.push({
        lineNumber,
        text: raw,
        reason: `nom ambigu (${matches.length} objets distincts portent ce nom)`,
      });
      continue;
    }
    ok.push({ itemId: matches[0]!.id, name: matches[0]!.n, price });
  }

  return { ok, errors };
}
