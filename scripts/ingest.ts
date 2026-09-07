// Ingestion des données de jeu.
//
// Source principale : DofusDude (items, recettes, icônes, version du jeu).
// Enrichissement : DofusDB (métier + niveau de craft de chaque recette).
// Voir docs/DATA-SOURCES.md pour la justification.
//
// Produit data/items.json, data/recipes.json, data/search-index.json,
// data/brisage.json et data/meta.json.
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
  rawDbQuestObjectiveSchema,
  rawDbQuestSchema,
  rawDbQuestStepSchema,
  rawDbRecipeSchema,
  rawItemSchema,
  recipeRecordSchema,
  searchEntrySchema,
  brisageFileSchema,
  brisageItemSchema,
  type BrisageItem,
  type BrisageLine,
  type RawEffect,
  type RuneRecord,
  type QuestNeed,
} from './schema.ts';

import { BREAKABLE_TYPES, IGNORED_EFFECT_IDS, RUNES } from './runes.ts';

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
  effects: RawEffect[];
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
        // les effets ne servent qu'au brisage : inutile de les garder ailleurs
        effects: category === 'equipment' ? (item.effects ?? []) : [],
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

/**
 * @param items catalogue connu : `parameter1` peut porter un id de monstre ou
 *   de PNJ selon le type d'objectif, on ne garde que les vrais objets.
 */
async function loadDofusdbQuests(items: Map<number, LoadedItem>): Promise<QuestInfo | null> {
  try {
    console.log('DofusDB : catégories de quête…');
    const categories = new Map<number, string>();
    const categoryPage = feathersPageSchema.parse(await fetchJson(`${CONFIG.dbBase}/quest-categories?$limit=100`));
    for (const raw of categoryPage.data) {
      const category = rawDbQuestCategorySchema.parse(raw);
      categories.set(category.id, category.name.fr);
    }

    /** parcourt entièrement une collection Feathers page par page */
    const paginate = async (path: string, select: string, onPage: (data: unknown[]) => void) => {
      const first = feathersPageSchema.parse(await fetchJson(`${CONFIG.dbBase}${path}?$limit=100&$skip=0&${select}`));
      const pageSize = first.data.length;
      if (pageSize === 0 || first.total === 0) throw new Error(`première page vide pour ${path}`);
      onPage(first.data);
      for (let skip = pageSize; skip < first.total; skip += pageSize) {
        await sleep(CONFIG.dbPageDelayMs);
        const page = feathersPageSchema.parse(
          await fetchJson(`${CONFIG.dbBase}${path}?$limit=${pageSize}&$skip=${skip}&${select}`),
        );
        onPage(page.data);
      }
      return first.total;
    };

    console.log('DofusDB : quêtes…');
    interface QuestMeta {
      name: string;
      categoryId: number | null;
      levelMin: number | null;
    }
    const questMeta = new Map<number, QuestMeta>();
    /** besoins déclarés au niveau de la quête : incomplets, gardés en filet */
    const questLevelNeeds = new Map<number, Map<number, number>>();
    await paginate(
      '/quests',
      '$select[]=id&$select[]=name&$select[]=need&$select[]=categoryId&$select[]=levelMin',
      data => {
        for (const raw of data) {
          const quest = rawDbQuestSchema.parse(raw);
          const name = quest.name?.fr;
          if (name === undefined || name === null || name === '') continue;
          questMeta.set(quest.id, {
            name,
            categoryId: quest.categoryId ?? null,
            levelMin: quest.levelMin ?? null,
          });
          const items = quest.need?.items ?? [];
          const quantities = quest.need?.quantities ?? [];
          if (items.length === 0) continue;
          if (items.length !== quantities.length) {
            fail(
              `quête ${quest.id} : ${items.length} objets mais ${quantities.length} quantités — ` +
                `format DofusDB modifié, les quantités ne sont plus fiables`,
            );
          }
          const perItem = questLevelNeeds.get(quest.id) ?? new Map<number, number>();
          for (let i = 0; i < items.length; i++) {
            const quantity = quantities[i]!;
            if (quantity > 0) perItem.set(items[i]!, Math.max(perItem.get(items[i]!) ?? 0, quantity));
          }
          questLevelNeeds.set(quest.id, perItem);
        }
      },
    );
    console.log(`  ${questMeta.size} quêtes`);

    console.log('DofusDB : étapes de quête…');
    const questOfStep = new Map<number, number>();
    await paginate('/quest-steps', '$select[]=id&$select[]=questId', data => {
      for (const raw of data) {
        const step = rawDbQuestStepSchema.parse(raw);
        if (step.questId !== null && step.questId !== undefined) questOfStep.set(step.id, step.questId);
      }
    });
    console.log(`  ${questOfStep.size} étapes`);

    console.log('DofusDB : objectifs de quête (source complète des besoins)…');
    /** questId → (itemId → quantité cumulée sur tous les objectifs) */
    const objectiveNeeds = new Map<number, Map<number, number>>();
    let orphanObjectives = 0;
    /** objectif « apporter N exemplaires » : l'objet est dans parameters */
    const BRING_OBJECTIVE_TYPE = 3;
    const objectiveTotal = await paginate(
      '/quest-objectives',
      '$select[]=id&$select[]=stepId&$select[]=typeId&$select[]=parameters&$select[]=need',
      data => {
        for (const raw of data) {
          const objective = rawDbQuestObjectiveSchema.parse(raw);
          const stepId = objective.stepId;
          const questId = stepId !== null && stepId !== undefined ? questOfStep.get(stepId) : undefined;

          const add = (itemId: number, quantity: number) => {
            if (quantity <= 0 || !items.has(itemId)) return;
            if (questId === undefined) {
              orphanObjectives++;
              return;
            }
            const perItem = objectiveNeeds.get(questId) ?? new Map<number, number>();
            perItem.set(itemId, (perItem.get(itemId) ?? 0) + quantity);
            objectiveNeeds.set(questId, perItem);
          };

          if (objective.typeId === BRING_OBJECTIVE_TYPE) {
            // `need.generated` liste ici la recette décomposée de l'objet
            // demandé : l'utiliser inventerait une demande sur des ingrédients
            // que DofusDB ne relie pas à la quête.
            const itemId = objective.parameters?.parameter1;
            const quantity = objective.parameters?.parameter2;
            if (typeof itemId === 'number' && typeof quantity === 'number') add(itemId, quantity);
            continue;
          }

          const generated = objective.need?.generated;
          const needItems = generated?.items ?? [];
          const quantities = generated?.quantities ?? [];
          const toUse = generated?.itemToUse ?? [];
          if (needItems.length === 0 && toUse.length === 0) continue;
          if (needItems.length !== quantities.length) {
            fail(
              `objectif ${objective.id} : ${needItems.length} objets mais ${quantities.length} quantités — ` +
                `format DofusDB modifié, les quantités ne sont plus fiables`,
            );
          }
          for (let i = 0; i < needItems.length; i++) add(needItems[i]!, quantities[i]!);
          // un objet à utiliser compte pour 1 exemplaire s'il n'est pas déjà listé
          for (const itemId of toUse) {
            if (!(objectiveNeeds.get(questId ?? -1)?.has(itemId) ?? false)) add(itemId, 1);
          }
        }
      },
    );
    console.log(`  ${objectiveTotal} objectifs (${orphanObjectives} sans quête rattachée)`);

    // union des deux sources : on garde la plus grande quantité par couple
    // (quête, objet) pour ne jamais compter deux fois le même besoin
    const needsByItem = new Map<number, QuestNeed[]>();
    const questIds = new Set([...objectiveNeeds.keys(), ...questLevelNeeds.keys()]);
    let questsWithNeeds = 0;
    for (const questId of questIds) {
      const meta = questMeta.get(questId);
      if (meta === undefined) continue;
      const merged = new Map<number, number>(objectiveNeeds.get(questId) ?? []);
      for (const [itemId, quantity] of questLevelNeeds.get(questId) ?? []) {
        merged.set(itemId, Math.max(merged.get(itemId) ?? 0, quantity));
      }
      if (merged.size === 0) continue;
      questsWithNeeds++;
      for (const [itemId, quantity] of merged) {
        const list = needsByItem.get(itemId) ?? [];
        list.push({ q: questId, n: meta.name, x: quantity, c: meta.categoryId, lv: meta.levelMin });
        needsByItem.set(itemId, list);
      }
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
// 4. Brisage : lignes brisables de chaque équipement
// ---------------------------------------------------------------------------

/**
 * Combien de fois un effet non mappé peut apparaître avant que le run échoue.
 * Au-delà, c'est probablement une rune oubliée dans la table — et l'oublier
 * reviendrait à sous-estimer silencieusement tous les brisages concernés.
 */
const UNMAPPED_EFFECT_LIMIT = 25;

interface BrisageBuild {
  runes: RuneRecord[];
  items: [number, BrisageItem][];
  breakableCraftables: number;
}

/**
 * Jet retenu pour une ligne : [min, max].
 * `ignore_int_max` signale un jet fixe (la valeur est int_minimum).
 * Une ligne « drapeau » sans valeur chiffrée (Arme de chasse) compte pour 1.
 * Une ligne négative ne rend aucune rune : elle est écartée.
 */
function lineRoll(effect: RawEffect): [number, number] | null {
  const flag = effect.ignore_int_min === true && effect.ignore_int_max === true;
  if (flag) {
    const value = effect.int_minimum <= 0 ? 1 : effect.int_minimum;
    return [value, value];
  }
  const max = effect.ignore_int_max === true ? effect.int_minimum : effect.int_maximum;
  if (max <= 0) return null; // ligne négative ou nulle
  return [Math.max(1, effect.int_minimum), Math.max(1, max)];
}

function buildBrisage(items: Map<number, LoadedItem>): BrisageBuild {
  const byEffectId = new Map(RUNES.map(rune => [rune.dude, rune]));
  const seenEffects = new Set<number>();
  const unmapped = new Map<number, { name: string; count: number }>();

  const entries: [number, BrisageItem][] = [];
  let breakableCraftables = 0;

  for (const item of [...items.values()].sort((a, b) => a.id - b.id)) {
    if (item.category !== 'equipment' || !BREAKABLE_TYPES.has(item.type)) continue;

    const lines: BrisageLine[] = [];
    for (const effect of item.effects) {
      // les effets « actifs » sont les dégâts de l'arme et les effets de sort :
      // ils ne donnent aucune rune
      if (effect.type.is_active === true || effect.type.is_meta === true) continue;
      const rune = byEffectId.get(effect.type.id);
      if (rune === undefined) {
        if (!IGNORED_EFFECT_IDS.has(effect.type.id)) {
          const seen = unmapped.get(effect.type.id) ?? { name: effect.type.name, count: 0 };
          seen.count++;
          unmapped.set(effect.type.id, seen);
        }
        continue;
      }
      seenEffects.add(effect.type.id);
      const roll = lineRoll(effect);
      if (roll === null) continue;
      lines.push([rune.key, roll[0], roll[1]]);
    }

    if (lines.length === 0) continue;
    entries.push([item.id, { lv: item.level, l: lines }]);
    if (item.recipe.length > 0) breakableCraftables++;
  }

  // garde-fou : un effet fréquent hors table est probablement une rune oubliée
  const suspicious = [...unmapped.entries()]
    .filter(([, seen]) => seen.count >= UNMAPPED_EFFECT_LIMIT)
    .sort((a, b) => b[1].count - a[1].count);
  if (suspicious.length > 0) {
    fail(
      "effets non mappés fréquents (rune oubliée dans scripts/runes.ts, " +
        "ou effet à ajouter à IGNORED_EFFECT_IDS) :\n  " +
        suspicious
          .map(([id, seen]) => `id ${id} « ${seen.name} » sur ${seen.count} objets`)
          .join('\n  '),
    );
  }
  if (unmapped.size > 0) {
    const rare = [...unmapped.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    console.warn(
      `  effets rares non mappés (ignorés) : ${rare
        .map(([id, seen]) => `${seen.name} (id ${id}, ×${seen.count})`)
        .join(', ')}`,
    );
  }

  // garde-fou : chaque rune de la table doit exister dans le catalogue
  const runes: RuneRecord[] = RUNES.map(rune => {
    const tiers = [
      ['de base', rune.basic] as const,
      ['Pa', rune.pa] as const,
      ['Ra', rune.ra] as const,
    ];
    for (const [label, id] of tiers) {
      if (id !== null && !items.has(id)) {
        fail(`rune ${label} introuvable dans le catalogue : ${rune.rune} (id ${id})`);
      }
    }
    const catalog = items.get(rune.basic)!;
    if (catalog.name !== rune.rune) {
      fail(`la rune ${rune.rune} (id ${rune.basic}) s'appelle « ${catalog.name} » côté API`);
    }
    return {
      k: rune.key,
      n: rune.label,
      r: rune.rune,
      w: rune.weight,
      g: rune.grant,
      b: rune.basic,
      pa: rune.pa,
      ra: rune.ra,
    };
  });

  // information : une statistique de la table qu'aucun équipement ne porte
  const unused = RUNES.filter(rune => !seenEffects.has(rune.dude));
  if (unused.length > 0) {
    console.warn(`  runes jamais rencontrées sur un objet : ${unused.map(r => r.rune).join(', ')}`);
  }

  if (entries.length === 0) fail('aucun équipement brisable — refus de continuer');
  return { runes, items: entries, breakableCraftables };
}

/**
 * Revérifie la table des runes contre DofusDB : l'effet porté par chaque rune
 * et son jet (une Rune Vi donne bien +5 Vitalité). Silencieux si DofusDB est
 * indisponible — c'est un contrôle, pas une source.
 */
async function verifyRunes(): Promise<void> {
  const byId = new Map(RUNES.map(rune => [rune.basic, rune]));
  const ids = [...byId.keys()];
  const CHUNK = 20;
  const checked = new Set<number>();
  try {
    for (let start = 0; start < ids.length; start += CHUNK) {
      const chunk = ids.slice(start, start + CHUNK);
      const query = chunk.map(id => `id[$in][]=${id}`).join('&');
      const page = feathersPageSchema.parse(
        await fetchJson(`${CONFIG.dbBase}/items?${query}&$limit=${CHUNK}`),
      );
      for (const raw of page.data) {
        const parsed = z
          .looseObject({
            id: z.number().int(),
            possibleEffects: z
              .array(z.looseObject({ effectId: z.number().int(), diceNum: z.number().int() }))
              .nullish(),
          })
          .parse(raw);
        const rune = byId.get(parsed.id);
        if (rune === undefined) continue;
        const effect = parsed.possibleEffects?.[0];
        if (effect === undefined) continue;
        if (effect.effectId !== rune.db) {
          fail(
            `${rune.rune} : effet ${effect.effectId} côté DofusDB, ${rune.db} dans la table ` +
              `(scripts/runes.ts à corriger — le brisage attribuerait les mauvaises runes)`,
          );
        }
        // les runes-drapeau (Rune de chasse) portent diceNum 0 pour un jet de 1
        const grant = effect.diceNum === 0 ? 1 : effect.diceNum;
        if (grant !== rune.grant) {
          fail(`${rune.rune} : jet ${grant} côté DofusDB, ${rune.grant} dans la table`);
        }
        checked.add(parsed.id);
      }
      await sleep(CONFIG.dbPageDelayMs);
    }
  } catch (error) {
    if (error instanceof IngestError) throw error;
    console.warn(`  vérification des runes impossible (DofusDB) : ${String(error)}`);
    return;
  }
  console.log(`  ${checked.size}/${ids.length} runes vérifiées contre DofusDB`);
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
  if (after.breakableItems < before.breakableItems) {
    fail(
      `régression : ${after.breakableItems} objets brisables contre ${before.breakableItems} ` +
        `au run précédent. Si la baisse est légitime, relancer avec ALLOW_SHRINK=1.`,
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

function writeBrisageFile(path: string, runes: RuneRecord[], items: [number, BrisageItem][]): void {
  const runeLines = runes.map(rune => JSON.stringify(rune)).join(',\n');
  const itemLines = items
    .map(([id, record]) => `${JSON.stringify(String(id))}:${JSON.stringify(record)}`)
    .join(',\n');
  writeFileSync(path, `{\n"runes": [\n${runeLines}\n],\n"items": {\n${itemLines}\n}\n}\n`);
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
  const questInfo = await loadDofusdbQuests(items);

  console.log('Brisage : lignes brisables et table des runes…');
  const brisage = buildBrisage(items);
  console.log(`  ${brisage.items.length} objets brisables, ${brisage.runes.length} runes`);
  await verifyRunes();

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
      breakableItems: brisage.items.length,
      breakableCraftables: brisage.breakableCraftables,
    },
  };

  checkAgainstPreviousRun(meta);

  // auto-contrôle : chaque fichier écrit doit respecter son propre schéma
  itemRecords.forEach(record => itemRecordSchema.parse(record));
  searchEntries.forEach(entry => searchEntrySchema.parse(entry));
  recipeEntries.forEach(([, record]) => recipeRecordSchema.parse(record));
  brisage.items.forEach(([, record]) => brisageItemSchema.parse(record));
  brisageFileSchema.parse({
    runes: brisage.runes,
    items: Object.fromEntries(brisage.items.map(([id, record]) => [String(id), record])),
  });
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
  writeBrisageFile(join(DATA_DIR, 'brisage.json'), brisage.runes, brisage.items);
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
  console.log(
    `  brisage : ${meta.counts.breakableItems} objets brisables, dont ` +
      `${meta.counts.breakableCraftables} craftables`,
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
