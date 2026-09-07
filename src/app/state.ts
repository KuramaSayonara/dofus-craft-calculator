// État applicatif persisté : profils de serveur, carnets de prix horodatés,
// crafts sauvegardés, ventes. Un document unique, versionné, validé par Zod
// à l'import (fichier fourni par l'utilisateur = données non fiables).
// Le reducer est pur : la génération d'ids et les horodatages viennent des
// créateurs d'action, jamais de l'intérieur.

import { z } from 'zod';
import type { SalesVolume, SourcingMode } from '../engine/index.ts';

// ---------------------------------------------------------------------------
// Schémas et types
// ---------------------------------------------------------------------------

const priceEntrySchema = z.object({
  p: z.number().int().min(0), // prix unitaire en kamas
  t: z.number().int().min(0), // horodatage de saisie (ms epoch)
});
export type PriceEntry = z.infer<typeof priceEntrySchema>;

const profileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
export type Profile = z.infer<typeof profileSchema>;

const savedModeSchema = z.union([z.literal('buy'), z.literal('craft')]);

const savedCraftSchema = z.object({
  id: z.string().min(1),
  itemId: z.number().int().positive(),
  name: z.string().min(1),
  folder: z.string(), // '' = sans dossier
  quantity: z.number().int().min(1),
  // seuls les écarts au défaut 'auto' sont stockés
  modes: z.record(z.string(), savedModeSchema),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type SavedCraft = z.infer<typeof savedCraftSchema>;

const saleSchema = z.object({
  id: z.string().min(1),
  itemId: z.number().int().positive(),
  quantity: z.number().int().min(1),
  listedAt: z.number().int(),
  /** coût de craft unitaire FIGÉ au moment de la mise en vente */
  unitCost: z.number().int().min(0),
  status: z.union([z.literal('listed'), z.literal('sold')]),
  soldAt: z.number().int().optional(),
  unitSalePrice: z.number().int().min(0).optional(),
  /** profit total FIGÉ au moment de la vente (taxe du moment incluse) */
  profit: z.number().int().optional(),
  comment: z.string().optional(),
});
export type Sale = z.infer<typeof saleSchema>;

const settingsSchema = z.object({
  taxRate: z.number().min(0).max(0.5),
  marginalThresholdPct: z.number().min(0).max(1000),
  /**
   * Taux de brisage « habituel » du serveur, en %. Sert de repli quand le
   * coefficient d'un objet précis n'a pas été relevé — jamais deviné, il reste
   * null tant que l'utilisateur ne l'a pas saisi.
   */
  referenceCoefficient: z.number().min(1).max(4000).nullable().default(null),
});
export type Settings = z.infer<typeof settingsSchema>;

export const appDataSchema = z.object({
  version: z.literal(1),
  activeProfileId: z.string().min(1),
  profiles: z.array(profileSchema).min(1),
  /** profileId → (itemId → prix horodaté) */
  prices: z.record(z.string(), z.record(z.string(), priceEntrySchema)),
  /**
   * profileId → (itemId → quantité possédée).
   * Champ ajouté après coup : le défaut permet de relire sans perte les
   * données enregistrées avant l'arrivée du stock.
   */
  inventory: z.record(z.string(), z.record(z.string(), z.number().int().min(0))).default({}),
  /**
   * profileId → (itemId → exemplaires vus vendus sur 24 h / 7 j / 30 j).
   * Observation manuelle et facultative : rien d'autre n'en dépend.
   */
  volumes: z
    .record(
      z.string(),
      z.record(
        z.string(),
        z.object({
          d1: z.number().int().min(0).optional(),
          d7: z.number().int().min(0).optional(),
          d30: z.number().int().min(0).optional(),
        }),
      ),
    )
    .default({}),
  /**
   * profileId → (itemId → coefficient de brisage relevé, horodaté).
   * Le taux varie d'un objet à l'autre ET dans le temps : il se relève comme
   * un prix, avec sa date, et vieillit de la même façon.
   */
  coefficients: z.record(z.string(), z.record(z.string(), priceEntrySchema)).default({}),
  savedCrafts: z.array(savedCraftSchema),
  /** profileId → ventes (les kamas sont propres à un serveur) */
  sales: z.record(z.string(), z.array(saleSchema)),
  settings: settingsSchema,
});
export type AppData = z.infer<typeof appDataSchema>;

export function defaultAppData(): AppData {
  const id = 'default';
  return {
    version: 1,
    activeProfileId: id,
    profiles: [{ id, name: 'Mon serveur' }],
    prices: { [id]: {} },
    inventory: { [id]: {} },
    volumes: { [id]: {} },
    coefficients: { [id]: {} },
    savedCrafts: [],
    sales: { [id]: [] },
    settings: { taxRate: 0.02, marginalThresholdPct: 10, referenceCoefficient: null },
  };
}

/** Valide des données importées ou rechargées ; null si illisibles. */
export function parseAppData(raw: unknown): AppData | null {
  const parsed = appDataSchema.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data;
  // cohérence minimale : le profil actif existe
  if (!data.profiles.some(profile => profile.id === data.activeProfileId)) return null;
  return data;
}

// ---------------------------------------------------------------------------
// Actions et reducer
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'set-price'; itemId: number; value: number | null; now: number }
  | { type: 'import-prices'; entries: ReadonlyArray<readonly [number, number]>; now: number }
  | { type: 'set-stock'; itemId: number; quantity: number | null }
  | { type: 'clear-stock' }
  | { type: 'set-volume'; itemId: number; window: 'd1' | 'd7' | 'd30'; value: number | null }
  | { type: 'set-coefficient'; itemId: number; value: number | null; now: number }
  | { type: 'switch-profile'; profileId: string }
  | { type: 'add-profile'; id: string; name: string }
  | { type: 'rename-profile'; profileId: string; name: string }
  | { type: 'delete-profile'; profileId: string }
  | { type: 'save-craft'; craft: SavedCraft }
  | { type: 'delete-craft'; id: string }
  | { type: 'list-sale'; sale: Sale }
  | { type: 'mark-sold'; id: string; unitSalePrice: number; profit: number; soldAt: number; comment: string }
  | { type: 'delete-sale'; id: string }
  | { type: 'set-settings'; patch: Partial<Settings> }
  | { type: 'import-data'; data: AppData };

const activePrices = (data: AppData): Record<string, PriceEntry> =>
  data.prices[data.activeProfileId] ?? {};

const activeStock = (data: AppData): Record<string, number> =>
  data.inventory[data.activeProfileId] ?? {};

const activeVolumes = (data: AppData): Record<string, SalesVolume> =>
  data.volumes[data.activeProfileId] ?? {};

const activeCoefficients = (data: AppData): Record<string, PriceEntry> =>
  data.coefficients[data.activeProfileId] ?? {};

const activeSales = (data: AppData): Sale[] => data.sales[data.activeProfileId] ?? [];

export function reduce(data: AppData, action: Action): AppData {
  switch (action.type) {
    case 'set-price': {
      const prices = { ...activePrices(data) };
      if (action.value === null) delete prices[String(action.itemId)];
      else prices[String(action.itemId)] = { p: action.value, t: action.now };
      return { ...data, prices: { ...data.prices, [data.activeProfileId]: prices } };
    }
    case 'import-prices': {
      const prices = { ...activePrices(data) };
      for (const [itemId, price] of action.entries) {
        prices[String(itemId)] = { p: price, t: action.now };
      }
      return { ...data, prices: { ...data.prices, [data.activeProfileId]: prices } };
    }
    case 'set-stock': {
      const stock = { ...activeStock(data) };
      // 0 comme absence : ne pas encombrer le stock de lignes vides
      if (action.quantity === null || action.quantity <= 0) delete stock[String(action.itemId)];
      else stock[String(action.itemId)] = action.quantity;
      return { ...data, inventory: { ...data.inventory, [data.activeProfileId]: stock } };
    }
    case 'clear-stock':
      return { ...data, inventory: { ...data.inventory, [data.activeProfileId]: {} } };
    case 'set-volume': {
      const volumes = { ...activeVolumes(data) };
      const key = String(action.itemId);
      const current = { ...(volumes[key] ?? {}) };
      if (action.value === null || action.value < 0) delete current[action.window];
      else current[action.window] = action.value;
      // plus aucune observation pour cet objet → on retire la ligne
      if (Object.keys(current).length === 0) delete volumes[key];
      else volumes[key] = current;
      return { ...data, volumes: { ...data.volumes, [data.activeProfileId]: volumes } };
    }
    case 'set-coefficient': {
      const coefficients = { ...activeCoefficients(data) };
      if (action.value === null) delete coefficients[String(action.itemId)];
      else coefficients[String(action.itemId)] = { p: action.value, t: action.now };
      return {
        ...data,
        coefficients: { ...data.coefficients, [data.activeProfileId]: coefficients },
      };
    }
    case 'switch-profile': {
      if (!data.profiles.some(profile => profile.id === action.profileId)) return data;
      return { ...data, activeProfileId: action.profileId };
    }
    case 'add-profile': {
      const name = action.name.trim();
      if (name === '' || data.profiles.some(profile => profile.id === action.id)) return data;
      return {
        ...data,
        profiles: [...data.profiles, { id: action.id, name }],
        prices: { ...data.prices, [action.id]: {} },
        inventory: { ...data.inventory, [action.id]: {} },
        volumes: { ...data.volumes, [action.id]: {} },
        coefficients: { ...data.coefficients, [action.id]: {} },
        sales: { ...data.sales, [action.id]: [] },
        activeProfileId: action.id,
      };
    }
    case 'rename-profile': {
      const name = action.name.trim();
      if (name === '') return data;
      return {
        ...data,
        profiles: data.profiles.map(profile =>
          profile.id === action.profileId ? { ...profile, name } : profile,
        ),
      };
    }
    case 'delete-profile': {
      if (data.profiles.length <= 1) return data; // toujours au moins un profil
      const profiles = data.profiles.filter(profile => profile.id !== action.profileId);
      if (profiles.length === data.profiles.length) return data;
      const { [action.profileId]: _prices, ...prices } = data.prices;
      const { [action.profileId]: _stock, ...inventory } = data.inventory;
      const { [action.profileId]: _volumes, ...volumes } = data.volumes;
      const { [action.profileId]: _coefficients, ...coefficients } = data.coefficients;
      const { [action.profileId]: _sales, ...sales } = data.sales;
      return {
        ...data,
        profiles,
        prices,
        inventory,
        volumes,
        coefficients,
        sales,
        activeProfileId:
          data.activeProfileId === action.profileId ? profiles[0]!.id : data.activeProfileId,
      };
    }
    case 'save-craft': {
      const existing = data.savedCrafts.findIndex(craft => craft.id === action.craft.id);
      const savedCrafts =
        existing === -1
          ? [...data.savedCrafts, action.craft]
          : data.savedCrafts.map(craft => (craft.id === action.craft.id ? action.craft : craft));
      return { ...data, savedCrafts };
    }
    case 'delete-craft':
      return { ...data, savedCrafts: data.savedCrafts.filter(craft => craft.id !== action.id) };
    case 'list-sale':
      return {
        ...data,
        sales: {
          ...data.sales,
          [data.activeProfileId]: [...activeSales(data), action.sale],
        },
      };
    case 'mark-sold':
      return {
        ...data,
        sales: {
          ...data.sales,
          [data.activeProfileId]: activeSales(data).map(sale =>
            sale.id === action.id && sale.status === 'listed'
              ? {
                  ...sale,
                  status: 'sold' as const,
                  soldAt: action.soldAt,
                  unitSalePrice: action.unitSalePrice,
                  profit: action.profit,
                  comment: action.comment,
                }
              : sale,
          ),
        },
      };
    case 'delete-sale':
      return {
        ...data,
        sales: {
          ...data.sales,
          [data.activeProfileId]: activeSales(data).filter(sale => sale.id !== action.id),
        },
      };
    case 'set-settings':
      return { ...data, settings: { ...data.settings, ...action.patch } };
    case 'import-data':
      return action.data;
  }
}

// ---------------------------------------------------------------------------
// Sélecteurs
// ---------------------------------------------------------------------------

/** Carnet de prix du profil actif au format moteur (Map id → prix). */
export function priceBookOf(data: AppData): Map<number, number> {
  const book = new Map<number, number>();
  for (const [itemId, entry] of Object.entries(activePrices(data))) {
    book.set(Number(itemId), entry.p);
  }
  return book;
}

/** Horodatages du profil actif (Map id → entrée complète). */
export function priceEntriesOf(data: AppData): Map<number, PriceEntry> {
  const entries = new Map<number, PriceEntry>();
  for (const [itemId, entry] of Object.entries(activePrices(data))) {
    entries.set(Number(itemId), entry);
  }
  return entries;
}

/** Stock du profil actif au format moteur (Map id → quantité possédée). */
export function inventoryOf(data: AppData): Map<number, number> {
  const stock = new Map<number, number>();
  for (const [itemId, quantity] of Object.entries(activeStock(data))) {
    stock.set(Number(itemId), quantity);
  }
  return stock;
}

/** Ventes observées du profil actif (Map id → fenêtres renseignées). */
export function volumesOf(data: AppData): Map<number, SalesVolume> {
  const volumes = new Map<number, SalesVolume>();
  for (const [itemId, volume] of Object.entries(activeVolumes(data))) {
    volumes.set(Number(itemId), volume);
  }
  return volumes;
}

/** Coefficients de brisage relevés sur le profil actif (Map id → taux daté). */
export function coefficientsOf(data: AppData): Map<number, PriceEntry> {
  const coefficients = new Map<number, PriceEntry>();
  for (const [itemId, entry] of Object.entries(activeCoefficients(data))) {
    coefficients.set(Number(itemId), entry);
  }
  return coefficients;
}

export function salesOf(data: AppData): Sale[] {
  return activeSales(data);
}

/** Modes d'une sauvegarde au format moteur. */
export function modesOfSavedCraft(craft: SavedCraft): Map<number, SourcingMode> {
  return new Map(
    Object.entries(craft.modes).map(([itemId, mode]) => [Number(itemId), mode]),
  );
}
