// Chargement des fichiers data/ générés par l'ingestion.
// Les données ont été validées par Zod côté ingestion ; le navigateur leur
// fait confiance (imports de types uniquement, Zod n'est pas embarqué).

import type { Meta, QuestNeed, QuestNeedsFile, RecipesFile, SearchEntry } from '../../scripts/schema.ts';

export type { Meta, QuestNeed, QuestNeedsFile, RecipesFile, SearchEntry };

const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

async function fetchJson<T>(file: string): Promise<T> {
  const response = await fetch(DATA_BASE + file);
  if (!response.ok) {
    throw new Error(`chargement de ${file} impossible (HTTP ${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const loadSearchIndex = (): Promise<SearchEntry[]> => fetchJson('search-index.json');
export const loadRecipes = (): Promise<RecipesFile> => fetchJson('recipes.json');
export const loadQuestNeeds = (): Promise<QuestNeedsFile> => fetchJson('quest-needs.json');
export const loadMeta = (): Promise<Meta> => fetchJson('meta.json');

/** URL de l'icône d'un objet (null si l'objet n'a pas d'image). */
export function iconUrl(icon: SearchEntry['i']): string | null {
  if (icon === null) return null;
  return typeof icon === 'number' ? `https://api.dofusdu.de/dofus3/v1/img/item/${icon}-64.png` : icon;
}
