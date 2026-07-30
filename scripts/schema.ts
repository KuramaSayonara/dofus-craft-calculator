import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schémas BRUTS : ce que les APIs renvoient réellement.
// Toute dérive de format côté API doit faire échouer l'ingestion, pas produire
// des données silencieusement fausses.
// ---------------------------------------------------------------------------

export const rawRecipeEntrySchema = z.object({
  item_ankama_id: z.number().int().positive(),
  item_subtype: z.string().min(1),
  quantity: z.number().int().positive(),
});

export const rawItemSchema = z.looseObject({
  ankama_id: z.number().int().positive(),
  name: z.string().min(1),
  level: z.number().int().min(0),
  type: z.looseObject({ name: z.string().min(1), id: z.number().int() }),
  image_urls: z.looseObject({ icon: z.string().min(1) }).nullish(),
  recipe: z.array(rawRecipeEntrySchema).nullish(),
});
export type RawItem = z.infer<typeof rawItemSchema>;

export const dofusdudeVersionSchema = z.looseObject({
  version: z.string().min(1),
  update_stamp: z.string().min(1).optional(),
});

export const feathersPageSchema = z.looseObject({
  total: z.number().int().min(0),
  data: z.array(z.unknown()),
});

export const rawDbRecipeSchema = z.looseObject({
  resultId: z.number().int().positive(),
  jobId: z.number().int().nullish(),
  resultLevel: z.number().int().nullish(),
});

export const rawDbJobSchema = z.looseObject({
  id: z.number().int(),
  name: z.looseObject({ fr: z.string().min(1) }),
});

// ---------------------------------------------------------------------------
// Schémas de SORTIE : les fichiers committés dans data/.
// L'app (Phase 3+) dérivera ses types d'ici — source de vérité unique.
// ---------------------------------------------------------------------------

export const CATEGORIES = ['equipment', 'resources', 'consumables', 'quest', 'cosmetics'] as const;
export type Category = (typeof CATEGORIES)[number];

// data/items.json — un objet par ligne, trié par id.
// `icon` : id numérique quand l'URL DofusDude suit le motif standard
// (l'app reconstruit l'URL), URL complète sinon, null si aucune image.
export const itemRecordSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  level: z.number().int().min(0),
  type: z.string().min(1),
  category: z.enum(CATEGORIES),
  icon: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
});
export type ItemRecord = z.infer<typeof itemRecordSchema>;

// data/recipes.json — { jobs: {id: nomFr}, recipes: {resultId: RecipeRecord} }
// j = id du métier (null si l'enrichissement DofusDB était indisponible)
// lv = niveau du craft ; ing = [idIngrédient, quantité][]
export const recipeRecordSchema = z.object({
  j: z.number().int().nullable(),
  lv: z.number().int().nullable(),
  ing: z.array(z.tuple([z.number().int().positive(), z.number().int().positive()])).min(1),
});
export type RecipeRecord = z.infer<typeof recipeRecordSchema>;

export const recipesFileSchema = z.object({
  jobs: z.record(z.string(), z.string().min(1)),
  recipes: z.record(z.string(), recipeRecordSchema),
});
export type RecipesFile = z.infer<typeof recipesFileSchema>;

// data/search-index.json — index léger chargé au premier rendu.
// Clés courtes volontairement : n=nom, l=niveau, t=type, c=catégorie,
// i=icône, r=1 si craftable, j=id métier (seulement si craftable et connu).
export const searchEntrySchema = z.object({
  id: z.number().int().positive(),
  n: z.string().min(1),
  l: z.number().int().min(0),
  t: z.string().min(1),
  c: z.enum(CATEGORIES),
  i: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  r: z.union([z.literal(0), z.literal(1)]),
  j: z.number().int().optional(),
});
export type SearchEntry = z.infer<typeof searchEntrySchema>;

// data/meta.json — version du jeu + comptages (sert aussi de garde-fou
// anti-régression au run suivant). Volontairement sans horodatage local
// pour que deux runs identiques produisent des fichiers identiques.
export const metaSchema = z.object({
  gameVersion: z.string().min(1),
  jobsSource: z.enum(['dofusdb', 'unavailable']),
  counts: z.object({
    itemsTotal: z.number().int().min(0),
    craftableTotal: z.number().int().min(0),
    byCategory: z.record(z.string(), z.object({ items: z.number().int(), craftable: z.number().int() })),
    craftableByJob: z.record(z.string(), z.number().int()),
  }),
});
export type Meta = z.infer<typeof metaSchema>;
