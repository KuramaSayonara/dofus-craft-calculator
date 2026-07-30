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
  /** nom de type exact (« Épée », « Bois »…) */
  readonly type?: string;
  readonly levelMin?: number;
  readonly levelMax?: number;
  /** id du métier qui craft l'objet */
  readonly jobId?: number;
  /** ne garder que les objets réclamés par au moins une quête */
  readonly questDemandedOnly?: boolean;
}

function matchesFilters(entry: SearchEntry, options: SearchOptions): boolean {
  if (options.craftableOnly === true && entry.r !== 1) return false;
  if (options.type !== undefined && entry.t !== options.type) return false;
  if (options.levelMin !== undefined && entry.l < options.levelMin) return false;
  if (options.levelMax !== undefined && entry.l > options.levelMax) return false;
  if (options.jobId !== undefined && entry.j !== options.jobId) return false;
  if (options.questDemandedOnly === true && entry.qn === undefined) return false;
  return true;
}

/** au moins un filtre restrictif au-delà de « craftable seulement » */
function hasBrowseFilters(options: SearchOptions): boolean {
  return (
    options.type !== undefined ||
    options.levelMin !== undefined ||
    options.levelMax !== undefined ||
    options.jobId !== undefined ||
    options.questDemandedOnly === true
  );
}

/**
 * Tous les jetons de la requête doivent apparaître dans le nom (dans n'importe
 * quel ordre). Score : préfixe du nom < début de mot < milieu de mot, puis
 * noms courts d'abord — les correspondances exactes remontent naturellement.
 * Les filtres (type, niveau, métier, craftable) se cumulent à la requête ;
 * sans requête, ils permettent de parcourir le catalogue filtré.
 */
export function searchItems(
  index: PreparedIndex,
  query: string,
  options: SearchOptions = {},
): SearchEntry[] {
  const limit = options.limit ?? 50;
  const tokens = normalizeText(query).split(/\s+/).filter(token => token.length > 0);
  if (tokens.length === 0 && !hasBrowseFilters(options)) return [];

  const scored: { entry: SearchEntry; score: number }[] = [];
  for (let i = 0; i < index.entries.length; i++) {
    const entry = index.entries[i]!;
    if (!matchesFilters(entry, options)) continue;
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
