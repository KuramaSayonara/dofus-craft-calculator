// Recherche d'objets : insensible à la casse et aux accents, par jetons
// (« epee dus » trouve « Épée du Dus »). Pur et synchrone : l'index est
// normalisé une fois, chaque frappe ne fait que des comparaisons de chaînes.

import type { SearchEntry } from './data.ts';

/**
 * minuscules + suppression des diacritiques (é → e).
 * La classe de la regex ci-dessous est la plage brute U+0300–U+036F
 * (caractères combinants NFD) — invisible à l'œil mais bien présente.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export interface PreparedIndex {
  readonly entries: ReadonlyArray<SearchEntry>;
  readonly normalized: ReadonlyArray<string>;
}

export function prepareIndex(entries: ReadonlyArray<SearchEntry>): PreparedIndex {
  return { entries, normalized: entries.map(entry => normalizeText(entry.n)) };
}

export interface SearchOptions {
  readonly craftableOnly?: boolean;
  readonly limit?: number;
}

/**
 * Tous les jetons de la requête doivent apparaître dans le nom (dans n'importe
 * quel ordre). Score : préfixe du nom < début de mot < milieu de mot, puis
 * noms courts d'abord — les correspondances exactes remontent naturellement.
 */
export function searchItems(
  index: PreparedIndex,
  query: string,
  options: SearchOptions = {},
): SearchEntry[] {
  const limit = options.limit ?? 50;
  const tokens = normalizeText(query).split(/\s+/).filter(token => token.length > 0);
  if (tokens.length === 0) return [];

  const scored: { entry: SearchEntry; score: number }[] = [];
  for (let i = 0; i < index.entries.length; i++) {
    const entry = index.entries[i]!;
    if (options.craftableOnly === true && entry.r !== 1) continue;
    const name = index.normalized[i]!;
    let score = 0;
    let match = true;
    for (const token of tokens) {
      const at = name.indexOf(token);
      if (at === -1) {
        match = false;
        break;
      }
      if (at === 0) score += 0; // préfixe du nom
      else if (name[at - 1] === ' ' || name[at - 1] === "'") score += 1; // début de mot
      else score += 3; // milieu de mot
    }
    if (!match) continue;
    scored.push({ entry, score: score * 100 + name.length });
  }

  scored.sort((a, b) => a.score - b.score || a.entry.n.localeCompare(b.entry.n, 'fr'));
  return scored.slice(0, limit).map(s => s.entry);
}
