// Ingestion des données de jeu.
//
// Source principale : DofusDude (items, recettes, icônes, version du jeu).
// Enrichissement : DofusDB (métier + niveau de craft de chaque recette).
// Voir docs/DATA-SOURCES.md pour la justification.
//
// Produit data/items.json, data/recipes.json, data/search-index.json, data/meta.json.
// Sorties déterministes (triées, sans horodatage) : deux runs sur les mêmes
// données API produisent des fichiers identiques au byte près.
//
// Échoue avec un code de sortie ≠ 0 sur toute donnée aberrante ; le seul mode
// dégradé toléré est l'indisponibilité totale de DofusDB (métiers absents,
// signalés dans meta.json). ALLOW_SHRINK=1 autorise un dataset plus petit
// que le run précédent (à n'utiliser qu'après vérification humaine).

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  CATEGORIES,
  type Category,
  type ItemRecord,
  type Meta,
  type RecipeRecord,
  type SearchEntry,
  dofusdudeVersionSchema,
  feathersPageSchema,
  itemRecordSchema,
  metaSchema,
  questNeedsFileSchema,
  rawDbJobSchema,
  rawDbQuestCategorySchema,
  rawDbQuestSchema,
  rawDbRecipeSchema,
  rawItemSchema,
  recipeRecordSchema,
  searchEntrySchema,
  type QuestNeed,
} from './schema.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');

const CONFIG = {
  dudeBase: 'https://api.dofusdu.de/dofus3/v1',
  dbBase: 'https://api.dofusdb.fr',
  language: 'fr',
  requestDelayMs: 500,
  dbPageDelayMs: 250,
  maxRetries: 4,
  retryBaseMs: 1000,
  timeoutMs: 180000,
  // en dessous de ce taux de recettes DofusDude retrouvées côté DofusDB,
  // l'enrichissement est considéré corrompu et le run échoue
  minJobMatchRate: 0.95,
} as const;

const ICON_URL_PATTERN = /^https:\/\/api\.dofusdu\.de\/dofus3\/v1\/img\/item\/(\d+)-64\.png$/;

class IngestError extends Error {}

function fail(message: string): never {
  throw new IngestError(message);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    if (attempt > 0) {
      const backoffMs = CONFIG.retryBaseMs * 2 ** (attempt - 1);
      console.warn(`  échec (${String(lastError)}), nouvelle tentative ${attempt}/${CONFIG.maxRetries} dans ${backoffMs} ms`);
      await sleep(backoffMs);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'dofus-craft-calculator/ingest (site statique non officiel)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as unknown;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`échec réseau définitif sur ${url} : ${String(lastError)}`);
}

// ---------------------------------------------------------------------------
// 1. DofusDude : version du jeu + toutes les catégories d'items
// ---------------------------------------------------------------------------

interface LoadedItem {
  id: number;
  name: string;
  level: number;
  type: string;
  category: Category;
  icon: number | string | null;
  recipe: { itemId: number; subtype: string; quantity: number }[];
}

async function loadDofusdude(): Promise<{ gameVersion: string; items: Map<number, LoadedItem> }> {
  console.log('DofusDude : version du jeu…');
  const version = dofusdudeVersionSchema.parse(await fetchJson(`${CONFIG.dudeBase}/meta/version`));
  console.log(`  version ${version.version}`);

  const items = new Map<number, LoadedItem>();
  for (const category of CATEGORIES) {
    await sleep(CONFIG.requestDelayMs);
    console.log(`DofusDude : catégorie ${category}…`);
    const payload = z.looseObject({ items: z.array(z.unknown()) }).parse(
      await fetchJson(`${CONFIG.dudeBase}/${CONFIG.language}/items/${category}/all`),
    );
    if (payload.items.length === 0) fail(`catégorie ${category} vide — refus de continuer`);

    for (const raw of payload.items) {
      const parsed = rawItemSchema.safeParse(raw);
      if (!parsed.success) {
        const guess = z.looseObject({ ankama_id: z.number().optional(), name: z.string().optional() }).safeParse(raw);
        fail(
          `item invalide dans ${category} (id=${guess.data?.ankama_id ?? '?'}, nom=${guess.data?.name ?? '?'}) : ` +
            parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' ; '),
        );
      }
      const item = parsed.data;
      if (items.has(item.ankama_id)) {
        fail(`ankama_id ${item.ankama_id} présent dans deux catégories (${items.get(item.ankama_id)?.category} et ${category})`);
      }
      const iconUrl = item.image_urls?.icon ?? null;
      const iconMatch = iconUrl === null ? null : ICON_URL_PATTERN.exec(iconUrl);
      items.set(item.ankama_id, {
        id: item.ankama_id,
        name: item.name,
        level: item.level,
        type: item.type.name,
        category,
        icon: iconUrl === null ? null : iconMatch ? Number(iconMatch[1]) : iconUrl,
        recipe: (item.recipe ?? []).map(entry => ({
          itemId: entry.item_ankama_id,
          subtype: entry.item_subtype,
          quantity: entry.quantity,
        })),
      });
    }
    console.log(`  ${payload.items.length} objets`);
  }
  return { gameVersion: version.version, items };
}

// ---------------------------------------------------------------------------
// 2. Contrôles d'intégrité sur le graphe de recettes
// ---------------------------------------------------------------------------

function checkIntegrity(items: Map<number, LoadedItem>): void {
  const knownCategories = new Set<string>(CATEGORIES);
  const orphans: string[] = [];
  for (const item of items.values()) {
    for (const ing of item.recipe) {
      if (!knownCategories.has(ing.subtype)) {
        fail(
          `sous-type d'ingrédient inconnu « ${ing.subtype} » (recette de ${item.name}, id ${item.id}) — ` +
            `une nouvelle catégorie est peut-être apparue côté API, à ajouter à CATEGORIES`,
        );
      }
      if (!items.has(ing.itemId) && orphans.length < 10) {
        orphans.push(`ingrédient ${ing.itemId} introuvable (recette de ${item.name}, id ${item.id})`);
      }
    }
  }
  if (orphans.length > 0) {
    fail(`ingrédients orphelins détectés :\n  ${orphans.join('\n  ')}`);
  }
}

// ---------------------------------------------------------------------------
// 3. DofusDB : métier + niveau de craft par recette
// ---------------------------------------------------------------------------

interface JobInfo {
  jobs: Map<number, string>;
  byResultId: Map<number, { jobId: number; level: number | null }>;
}

async function loadDofusdbJobs(): Promise<JobInfo | null> {
  try {
    console.log('DofusDB : liste des métiers…');
    const jobsPage = feathersPageSchema.parse(await fetchJson(`${CONFIG.dbBase}/jobs?$limit=50`));
    const jobs = new Map<number, string>();
    for (const raw of jobsPage.data) {
      const job = rawDbJobSchema.parse(raw);
      jobs.set(job.id, job.name.fr);
    }
    if (jobs.size === 0) throw new Error('liste des métiers vide');

    console.log('DofusDB : recettes (pagination)…');
    const select = '$select[]=resultId&$select[]=jobId&$select[]=resultLevel';
    const first = feathersPageSchema.parse(await fetchJson(`${CONFIG.dbBase}/recipes?$limit=100&$skip=0&${select}`));
    const pageSize = first.data.length;
    if (pageSize === 0 || first.total === 0) throw new Error('première page de recettes vide');

    const byResultId = new Map<number, { jobId: number; level: number | null }>();
    const ingestPage = (data: unknown[]) => {
      for (const raw of data) {
        const recipe = rawDbRecipeSchema.parse(raw);
        if (recipe.jobId === null || recipe.jobId === undefined) continue;
        byResultId.set(recipe.resultId, { jobId: recipe.jobId, level: recipe.resultLevel ?? null });
      }
    };
    ingestPage(first.data);
    for (let skip = pageSize; skip < first.total; skip += pageSize) {
      await sleep(CONFIG.dbPageDelayMs);
      const page = feathersPageSchema.parse(await fetchJson(`${CONFIG.dbBase}/recipes?$limit=${pageSize}&$skip=${skip}&${select}`));
      ingestPage(page.data);
    }
    console.log(`  ${byResultId.size} recettes avec métier`);

    for (const { jobId } of byResultId.values()) {
      if (!jobs.has(jobId)) fail(`jobId ${jobId} référencé par une recette mais absent de /jobs`);
    }
    return { jobs, byResultId };
  } catch (error) {
    if (error instanceof IngestError) throw error;
    console.warn(`AVERTISSEMENT : DofusDB indisponible (${String(error)}).`);
    console.warn('Les données seront générées SANS information de métier (signalé dans meta.json).');
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3 bis. DofusDB : ce que les quêtes réclament, et en quelle quantité
//
// C'est ce qui explique pourquoi certains crafts se vendent par lot : personne
// n'achète un Bâton de Boisaille à l'unité, la quête en demande 10.
// ---------------------------------------------------------------------------

interface QuestInfo {
  categories: Map<number, string>;
  needsByItem: Map<number, QuestNeed[]>;
}

async function loadDofusdbQuests(): Promise<QuestInfo | null> {
  try {
    console.log('DofusDB : catégories de quête…');
    const categories = new Map<number, string>();
    const categoryPage = feathersPageSchema.parse(await fetchJson(`${CONFIG.dbBase}/quest-categories?$limit=100`));
    for (const raw of categoryPage.data) {
      const category = rawDbQuestCategorySchema.parse(raw);
      categories.set(category.id, category.name.fr);
    }

    console.log('DofusDB : quêtes (pagination)…');
    const select = '$select[]=id&$select[]=name&$select[]=need&$select[]=categoryId&$select[]=levelMin';
    const first = feathersPageSchema.parse(await fetchJson(`${CONFIG.dbBase}/quests?$limit=100&$skip=0&${select}`));
    const pageSize = first.data.length;
    if (pageSize === 0 || first.total === 0) throw new Error('première page de quêtes vide');

    const needsByItem = new Map<number, QuestNeed[]>();
    let questsWithNeeds = 0;
    const ingestPage = (data: unknown[]) => {
      for (const raw of data) {
        const quest = rawDbQuestSchema.parse(raw);
        const items = quest.need?.items ?? [];
        const quantities = quest.need?.quantities ?? [];
        if (items.length === 0) continue;
        // les deux tableaux sont parallèles ; une désynchro signalerait un
        // changement de format côté API et rendrait les quantités fausses
        if (items.length !== quantities.length) {
          fail(
            `quête ${quest.id} : ${items.length} objets mais ${quantities.length} quantités — ` +
              `format DofusDB modifié, les quantités ne sont plus fiables`,
          );
        }
        const name = quest.name?.fr;
        if (name === undefined || name === null || name === '') continue;
        questsWithNeeds++;
        for (let i = 0; i < items.length; i++) {
          const quantity = quantities[i]!;
          if (quantity <= 0) continue;
          const list = needsByItem.get(items[i]!) ?? [];
          list.push({
            q: quest.id,
            n: name,
            x: quantity,
            c: quest.categoryId ?? null,
            lv: quest.levelMin ?? null,
          });
          needsByItem.set(items[i]!, list);
        }
      }
    };
    ingestPage(first.data);
    for (let skip = pageSize; skip < first.total; skip += pageSize) {
      await sleep(CONFIG.dbPageDelayMs);
      const page = feathersPageSchema.parse(await fetchJson(`${CONFIG.dbBase}/quests?$limit=${pageSize}&$skip=${skip}&${select}`));
      ingestPage(page.data);
    }
    console.log(`  ${questsWithNeeds} quêtes réclament ${needsByItem.size} objets distincts`);
    return { categories, needsByItem };
  } catch (error) {
    if (error instanceof IngestError) throw error;
    console.warn(`AVERTISSEMENT : quêtes DofusDB indisponibles (${String(error)}).`);
    console.warn('Les données seront générées SANS les besoins de quête.');
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. Garde-fou anti-régression par rapport au run précédent
// ---------------------------------------------------------------------------

function checkAgainstPreviousRun(meta: Meta): void {
  const metaPath = join(DATA_DIR, 'meta.json');
  if (!existsSync(metaPath)) return;
  const previous = metaSchema.safeParse(JSON.parse(readFileSync(metaPath, 'utf8')));
  if (!previous.success) {
    console.warn('AVERTISSEMENT : meta.json existant illisible, garde-fou anti-régression ignoré.');
    return;
  }
  if (process.env['ALLOW_SHRINK'] === '1') {
    console.warn('ALLOW_SHRINK=1 : garde-fou anti-régression désactivé pour ce run.');
    return;
  }
  const before = previous.data.counts;
  const after = meta.counts;
  if (after.itemsTotal < before.itemsTotal) {
    fail(
      `régression : ${after.itemsTotal} objets contre ${before.itemsTotal} au run précédent. ` +
        `Si la baisse est légitime (retrait de contenu par Ankama), relancer avec ALLOW_SHRINK=1.`,
    );
  }
  if (after.craftableTotal < before.craftableTotal) {
    fail(
      `régression : ${after.craftableTotal} objets craftables contre ${before.craftableTotal} au run précédent. ` +
        `Si la baisse est légitime, relancer avec ALLOW_SHRINK=1.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Écriture déterministe (un enregistrement par ligne → diffs git lisibles)
// ---------------------------------------------------------------------------

function writeJsonArray(path: string, records: unknown[]): void {
  writeFileSync(path, `[\n${records.map(r => JSON.stringify(r)).join(',\n')}\n]\n`);
}

function writeQuestNeedsFile(
  path: string,
  categories: Record<string, string>,
  needs: Record<string, QuestNeed[]>,
): void {
  const body = Object.entries(needs)
    .map(([itemId, list]) => `${JSON.stringify(itemId)}:${JSON.stringify(list)}`)
    .join(',\n');
  writeFileSync(path, `{\n"categories": ${JSON.stringify(categories)},\n"needs": {\n${body}\n}\n}\n`);
}

function writeRecipesFile(path: string, jobs: Map<number, string>, recipes: [number, RecipeRecord][]): void {
  const jobsObj = Object.fromEntries([...jobs.entries()].sort((a, b) => a[0] - b[0]).map(([id, name]) => [String(id), name]));
  const body = recipes.map(([id, record]) => `${JSON.stringify(String(id))}:${JSON.stringify(record)}`).join(',\n');
  writeFileSync(path, `{\n"jobs": ${JSON.stringify(jobsObj)},\n"recipes": {\n${body}\n}\n}\n`);
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { gameVersion, items } = await loadDofusdude();
  checkIntegrity(items);

  const jobInfo = await loadDofusdbJobs();
  const questInfo = await loadDofusdbQuests();

  const sorted = [...items.values()].sort((a, b) => a.id - b.id);
  const craftables = sorted.filter(item => item.recipe.length > 0);
  if (craftables.length === 0) fail('aucun objet craftable — refus de continuer');

  // jointure DofusDude <-> DofusDB
  let matched = 0;
  const usedJobs = new Map<number, string>();
  const recipeEntries: [number, RecipeRecord][] = [];
  for (const item of craftables) {
    const db = jobInfo?.byResultId.get(item.id);
    if (db !== undefined) {
      matched++;
      usedJobs.set(db.jobId, jobInfo!.jobs.get(db.jobId)!);
    }
    recipeEntries.push([
      item.id,
      {
        j: db?.jobId ?? null,
        lv: db?.level ?? null,
        ing: item.recipe.map(ing => [ing.itemId, ing.quantity] as [number, number]),
      },
    ]);
  }
  if (jobInfo !== null && matched / craftables.length < CONFIG.minJobMatchRate) {
    fail(
      `seulement ${matched}/${craftables.length} recettes retrouvées côté DofusDB ` +
        `(< ${CONFIG.minJobMatchRate * 100} %) — enrichissement métier considéré corrompu`,
    );
  }

  // fichiers de sortie
  const itemRecords: ItemRecord[] = sorted.map(item => ({
    id: item.id,
    name: item.name,
    level: item.level,
    type: item.type,
    category: item.category,
    icon: item.icon,
  }));

  const recipesById = new Map(recipeEntries.map(([id, record]) => [id, record]));

  // besoins de quête, restreints aux objets réellement présents dans le dataset
  const questNeeds: Record<string, QuestNeed[]> = {};
  let questDemandedCraftables = 0;
  if (questInfo !== null) {
    for (const [itemId, needs] of [...questInfo.needsByItem.entries()].sort((a, b) => a[0] - b[0])) {
      if (!items.has(itemId)) continue; // objet hors de notre catalogue
      questNeeds[String(itemId)] = [...needs].sort((a, b) => b.x - a.x || a.q - b.q);
      if (recipesById.has(itemId)) questDemandedCraftables++;
    }
  }
  const maxQuestQuantity = (itemId: number): number | undefined => {
    const needs = questNeeds[String(itemId)];
    return needs === undefined ? undefined : needs[0]!.x;
  };

  const searchEntries: SearchEntry[] = sorted.map(item => {
    const recipe = recipesById.get(item.id);
    const questQuantity = maxQuestQuantity(item.id);
    return {
      id: item.id,
      n: item.name,
      l: item.level,
      t: item.type,
      c: item.category,
      i: item.icon,
      r: recipe !== undefined ? 1 : 0,
      ...(recipe !== undefined && recipe.j !== null ? { j: recipe.j } : {}),
      ...(questQuantity !== undefined ? { qn: questQuantity } : {}),
    };
  });

  const byCategory: Record<string, { items: number; craftable: number }> = {};
  for (const category of CATEGORIES) {
    const inCategory = sorted.filter(item => item.category === category);
    byCategory[category] = {
      items: inCategory.length,
      craftable: inCategory.filter(item => item.recipe.length > 0).length,
    };
  }
  const craftableByJob: Record<string, number> = {};
  for (const [, record] of recipeEntries) {
    const jobName = record.j !== null ? usedJobs.get(record.j)! : '(métier inconnu)';
    craftableByJob[jobName] = (craftableByJob[jobName] ?? 0) + 1;
  }
  const meta: Meta = {
    gameVersion,
    jobsSource: jobInfo !== null ? 'dofusdb' : 'unavailable',
    counts: {
      itemsTotal: sorted.length,
      craftableTotal: craftables.length,
      byCategory,
      craftableByJob: Object.fromEntries(Object.entries(craftableByJob).sort((a, b) => b[1] - a[1])),
      questDemandedItems: Object.keys(questNeeds).length,
      questDemandedCraftables,
    },
  };

  checkAgainstPreviousRun(meta);

  // auto-contrôle : chaque fichier écrit doit respecter son propre schéma
  itemRecords.forEach(record => itemRecordSchema.parse(record));
  searchEntries.forEach(entry => searchEntrySchema.parse(entry));
  recipeEntries.forEach(([, record]) => recipeRecordSchema.parse(record));
  metaSchema.parse(meta);

  // catégories réduites à celles réellement citées par un besoin retenu
  const usedCategories: Record<string, string> = {};
  if (questInfo !== null) {
    for (const needs of Object.values(questNeeds)) {
      for (const need of needs) {
        if (need.c === null) continue;
        const label = questInfo.categories.get(need.c);
        if (label !== undefined) usedCategories[String(need.c)] = label;
      }
    }
  }
  const questNeedsFile = { categories: usedCategories, needs: questNeeds };
  questNeedsFileSchema.parse(questNeedsFile);

  mkdirSync(DATA_DIR, { recursive: true });
  writeJsonArray(join(DATA_DIR, 'items.json'), itemRecords);
  writeJsonArray(join(DATA_DIR, 'search-index.json'), searchEntries);
  writeRecipesFile(join(DATA_DIR, 'recipes.json'), usedJobs, recipeEntries);
  writeQuestNeedsFile(join(DATA_DIR, 'quest-needs.json'), usedCategories, questNeeds);
  writeFileSync(join(DATA_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');

  console.log('');
  console.log(`Terminé — Dofus ${gameVersion}`);
  console.log(`  objets : ${meta.counts.itemsTotal} | craftables : ${meta.counts.craftableTotal}`);
  console.log(`  métiers : ${jobInfo !== null ? `${usedJobs.size} (source DofusDB)` : 'INDISPONIBLES'}`);
  console.log(
    `  quêtes  : ${
      questInfo !== null
        ? `${meta.counts.questDemandedItems} objets réclamés, dont ${questDemandedCraftables} craftables`
        : 'INDISPONIBLES'
    }`,
  );
  for (const [job, count] of Object.entries(meta.counts.craftableByJob)) {
    console.log(`    ${job.padEnd(20)} ${count}`);
  }
}

main().catch((error: unknown) => {
  console.error('');
  console.error(`ÉCHEC DE L'INGESTION : ${error instanceof IngestError ? error.message : String(error)}`);
  process.exitCode = 1;
});
