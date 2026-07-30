// Ventes observées : combien d'exemplaires partent réellement à l'hôtel de
// vente. Aucune API ne l'expose — c'est une observation saisie à la main, donc
// une estimation. Le moteur se contente d'en tirer un rythme et un délai
// d'écoulement, sans jamais rien inventer : si rien n'est saisi, il n'y a pas
// de lecture, et aucun autre calcul n'en dépend.

/**
 * Exemplaires vus vendus sur 24 h, 7 jours et 30 jours (tous facultatifs).
 * `| undefined` explicite : le type doit rester compatible avec ce que produit
 * la validation Zod du document persisté, sous `exactOptionalPropertyTypes`.
 */
export interface SalesVolume {
  readonly d1?: number | undefined;
  readonly d7?: number | undefined;
  readonly d30?: number | undefined;
}

export type VolumeWindow = '24h' | '7j' | '30j';

export interface VolumeReading {
  /** rythme estimé, en exemplaires par jour */
  readonly perDay: number;
  /** fenêtre retenue pour l'estimation (la plus longue disponible) */
  readonly source: VolumeWindow;
  /** rythme calculé pour chaque fenêtre renseignée, pour comparaison */
  readonly perDayByWindow: ReadonlyArray<{ window: VolumeWindow; perDay: number }>;
  /** jours nécessaires pour écouler la quantité (null si rythme nul) */
  readonly daysToSell: number | null;
  /** profit théorique par jour au rythme observé (null si profit inconnu) */
  readonly profitPerDay: number | null;
}

const WINDOWS: ReadonlyArray<{ window: VolumeWindow; days: number; key: keyof SalesVolume }> = [
  { window: '30j', days: 30, key: 'd30' },
  { window: '7j', days: 7, key: 'd7' },
  { window: '24h', days: 1, key: 'd1' },
];

/**
 * Interprète les ventes observées.
 * @param quantity nombre d'exemplaires que l'utilisateur veut écouler
 * @param unitProfit profit net par exemplaire (null si incalculable)
 * @returns null si aucune observation n'a été saisie
 */
export function readVolume(
  volume: SalesVolume | undefined,
  quantity: number,
  unitProfit: number | null,
): VolumeReading | null {
  if (volume === undefined) return null;

  const perDayByWindow: { window: VolumeWindow; perDay: number }[] = [];
  for (const { window, days, key } of WINDOWS) {
    const sold = volume[key];
    if (sold === undefined || !Number.isFinite(sold) || sold < 0) continue;
    perDayByWindow.push({ window, perDay: sold / days });
  }
  if (perDayByWindow.length === 0) return null;

  // la fenêtre la plus longue lisse le hasard : c'est elle qui sert d'estimation
  const chosen = perDayByWindow[0]!;
  const daysToSell = chosen.perDay > 0 ? quantity / chosen.perDay : null;

  return {
    perDay: chosen.perDay,
    source: chosen.window,
    perDayByWindow,
    daysToSell,
    profitPerDay: unitProfit !== null ? Math.round(unitProfit * chosen.perDay) : null,
  };
}
