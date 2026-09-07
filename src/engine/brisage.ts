// Moteur de brisage : combien de runes sort un objet, ce que ça vaut, et
// surtout à partir de quand ce n'est plus rentable.
//
// Formule retenue (voir SPEC-BRISAGE.md pour les sources) :
//
//   poids d'une ligne = (jet × poids du point × niveau de l'objet × 0,015) + 1
//   poids appliqué    = poids de la ligne × coefficient / 100
//   nombre de runes   = poids appliqué / poids d'UNE rune
//
// où le poids d'UNE rune vaut `poids du point × jet donné par la rune` : une
// Rune Vi donne +5 Vitalité, il en faut donc 5 points pour une rune.
//
// La partie entière du résultat est acquise, la partie décimale est la
// probabilité d'obtenir une rune de plus. Les deux lectures sont conservées
// jusqu'au bout : « garanti » (le pire cas) et « espérance » (la moyenne).
//
// Ankama ne publie pas la formule : les constantes vivent dans config.ts et
// le module de calibrage (phase 6) sert à les confronter au jeu réel.

import type { BrisageFile, BrisageItem } from '../../scripts/schema.ts';
import {
  BRISAGE_FOCUS_OTHER_RATIO,
  BRISAGE_LEVEL_FACTOR,
  BRISAGE_LINE_BONUS,
  DEFAULT_COEFFICIENT,
  DEFAULT_MARGINAL_THRESHOLD_PCT,
  DEFAULT_TAX_RATE,
  MAX_COEFFICIENT,
  MIN_COEFFICIENT,
} from './config.ts';
import { netAfterTax, type Verdict } from './profitability.ts';
import type { PriceBook } from './types.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Une rune : son poids, ce qu'elle donne, et les objets qui la représentent. */
export interface RuneInfo {
  readonly key: string;
  /** libellé de la statistique (« Vitalité ») */
  readonly label: string;
  /** nom de la rune en jeu (« Rune Vi ») */
  readonly rune: string;
  /** poids d'UN point de la statistique */
  readonly weight: number;
  /** points de statistique donnés par UNE rune */
  readonly grant: number;
  /** id de l'objet rune de base — c'est celle que le brisage produit */
  readonly itemId: number;
  /** rune Pa (3 runes de base au Concasseur), null si elle n'existe pas */
  readonly paItemId: number | null;
  /** rune Ra (3 runes Pa), null si elle n'existe pas */
  readonly raItemId: number | null;
}

export type RuneTable = ReadonlyMap<string, RuneInfo>;

/** Une ligne brisable d'un objet : la statistique et sa fourchette de jet. */
export interface BreakableLine {
  readonly key: string;
  readonly min: number;
  readonly max: number;
}

export interface BreakableItem {
  readonly level: number;
  readonly lines: readonly BreakableLine[];
}

/** id d'objet → ce qu'il faut pour le briser. */
export type BreakableCatalog = ReadonlyMap<number, BreakableItem>;

/** Quel jet retenir : le pire, la moyenne, ou le meilleur. */
export type RollMode = 'min' | 'average' | 'max';

export interface YieldOptions {
  /** coefficient de brisage en %, appliqué à toutes les runes sans exception */
  readonly coefficient?: number;
  /** coefficient propre à certaines runes (le jeu les fait varier séparément) */
  readonly coefficients?: ReadonlyMap<string, number>;
  /** statistique focalisée, ou null pour un brisage normal */
  readonly focus?: string | null;
  /** mode de jet (défaut : moyenne) */
  readonly roll?: RollMode;
  /** jets exacts d'un objet précis, lus sur sa fiche (prioritaires sur le mode) */
  readonly customRolls?: ReadonlyMap<string, number>;
}

export interface RuneYield {
  readonly rune: RuneInfo;
  /** coefficient réellement appliqué à cette rune, en % */
  readonly coefficient: number;
  /** poids cumulé des lignes qui alimentent cette rune, avant coefficient */
  readonly weight: number;
  /** runes obtenues à coup sûr */
  readonly guaranteed: number;
  /** probabilité (0 à 1) d'obtenir une rune de plus */
  readonly chance: number;
  /** espérance : garanties + probabilité */
  readonly expected: number;
}

export interface BrisageYield {
  readonly runes: readonly RuneYield[];
  /** poids total de l'objet, avant coefficient (utile pour comparer deux objets) */
  readonly totalWeight: number;
  readonly focus: string | null;
  /** clés de ligne absentes de la table des runes (ne devrait jamais arriver) */
  readonly unknownKeys: readonly string[];
}

export interface BrisageValue {
  /** valeur des runes garanties, avant taxe */
  readonly grossGuaranteed: number;
  /** valeur espérée, avant taxe */
  readonly grossExpected: number;
  readonly netGuaranteed: number;
  readonly netExpected: number;
  /** runes dont le prix n'est pas connu : elles comptent pour 0, jamais deviné */
  readonly missing: readonly RuneInfo[];
}

// ---------------------------------------------------------------------------
// Adaptateurs depuis data/brisage.json
// ---------------------------------------------------------------------------

export function runeTableFromFile(file: BrisageFile): RuneTable {
  const table = new Map<string, RuneInfo>();
  for (const record of file.runes) {
    table.set(record.k, {
      key: record.k,
      label: record.n,
      rune: record.r,
      weight: record.w,
      grant: record.g,
      itemId: record.b,
      paItemId: record.pa,
      raItemId: record.ra,
    });
  }
  return table;
}

export function breakablesFromFile(file: BrisageFile): BreakableCatalog {
  const catalog = new Map<number, BreakableItem>();
  for (const [key, record] of Object.entries(file.items)) {
    catalog.set(Number(key), breakableFromRecord(record));
  }
  return catalog;
}

export function breakableFromRecord(record: BrisageItem): BreakableItem {
  return {
    level: record.lv,
    lines: record.l.map(([key, min, max]) => ({ key, min, max })),
  };
}

// ---------------------------------------------------------------------------
// Calcul des runes obtenues
// ---------------------------------------------------------------------------

/** Poids d'UNE rune : ce par quoi on divise le poids d'une ligne. */
export function runeWeight(rune: RuneInfo): number {
  return rune.weight * rune.grant;
}

/** Jet retenu pour une ligne, selon le mode (ou la saisie exacte). */
export function rollOf(line: BreakableLine, options?: YieldOptions): number {
  const custom = options?.customRolls?.get(line.key);
  if (custom !== undefined) return Math.min(Math.max(custom, 0), line.max);
  switch (options?.roll ?? 'average') {
    case 'min':
      return line.min;
    case 'max':
      return line.max;
    default:
      return (line.min + line.max) / 2;
  }
}

/** Poids brut d'une ligne, coefficient non appliqué. */
function lineWeight(roll: number, rune: RuneInfo, level: number): number {
  if (roll <= 0) return 0;
  return roll * rune.weight * level * BRISAGE_LEVEL_FACTOR + BRISAGE_LINE_BONUS;
}

function coefficientFor(key: string, options?: YieldOptions): number {
  const specific = options?.coefficients?.get(key);
  const value = specific ?? options?.coefficient ?? DEFAULT_COEFFICIENT;
  return Math.min(Math.max(value, 0), MAX_COEFFICIENT);
}

/**
 * Combien de runes sort cet objet.
 *
 * Sans focus, chaque ligne alimente sa propre rune. Avec focus, la ligne
 * focalisée compte pour 100 % de son poids et toutes les autres pour 50 %,
 * le total étant converti en runes de la seule statistique focalisée.
 */
export function computeYields(
  item: BreakableItem,
  table: RuneTable,
  options?: YieldOptions,
): BrisageYield {
  const unknownKeys: string[] = [];
  // plusieurs lignes peuvent alimenter la même rune : leurs poids s'additionnent
  const weights = new Map<string, number>();
  let totalWeight = 0;

  for (const line of item.lines) {
    const rune = table.get(line.key);
    if (rune === undefined) {
      if (!unknownKeys.includes(line.key)) unknownKeys.push(line.key);
      continue;
    }
    const weight = lineWeight(rollOf(line, options), rune, item.level);
    if (weight <= 0) continue;
    weights.set(line.key, (weights.get(line.key) ?? 0) + weight);
    totalWeight += weight;
  }

  const focus = options?.focus ?? null;
  const focusRune = focus !== null ? table.get(focus) : undefined;

  // focus sur une statistique que l'objet ne porte pas : rien à concentrer
  if (focus !== null && (focusRune === undefined || !weights.has(focus))) {
    return { runes: [], totalWeight, focus, unknownKeys };
  }

  if (focusRune !== undefined) {
    const own = weights.get(focusRune.key) ?? 0;
    const others = totalWeight - own;
    const concentrated = own + BRISAGE_FOCUS_OTHER_RATIO * others;
    return {
      runes: [yieldOf(focusRune, concentrated, coefficientFor(focusRune.key, options))],
      totalWeight,
      focus,
      unknownKeys,
    };
  }

  const runes: RuneYield[] = [];
  for (const [key, weight] of weights) {
    const rune = table.get(key)!;
    runes.push(yieldOf(rune, weight, coefficientFor(key, options)));
  }
  return { runes, totalWeight, focus: null, unknownKeys };
}

function yieldOf(rune: RuneInfo, weight: number, coefficient: number): RuneYield {
  const applied = (weight * coefficient) / 100;
  const count = applied / runeWeight(rune);
  const guaranteed = Math.floor(count);
  return {
    rune,
    coefficient,
    weight,
    guaranteed,
    chance: count - guaranteed,
    expected: count,
  };
}

// ---------------------------------------------------------------------------
// Valeur en kamas
// ---------------------------------------------------------------------------

/**
 * Ce que rapportent ces runes, revendues à l'hôtel de vente.
 * Une rune sans prix connu compte pour zéro et ressort dans `missing` :
 * le site ne devine jamais un prix.
 */
export function valueOfYields(
  brisage: BrisageYield,
  prices: PriceBook,
  taxRate: number = DEFAULT_TAX_RATE,
): BrisageValue {
  let grossGuaranteed = 0;
  let grossExpected = 0;
  const missing: RuneInfo[] = [];

  for (const entry of brisage.runes) {
    const price = prices.get(entry.rune.itemId);
    if (price === undefined) {
      // une rune sans prix ne bloque pas le calcul, mais le rend incomplet
      if (entry.expected > 0) missing.push(entry.rune);
      continue;
    }
    grossGuaranteed += entry.guaranteed * price;
    grossExpected += entry.expected * price;
  }

  // le moteur ne rend que des kamas entiers : on tronque, jamais on n'arrondit
  // vers le haut (mieux vaut annoncer un gain trop petit qu'un gain imaginaire)
  const gg = Math.floor(grossGuaranteed);
  const ge = Math.floor(grossExpected);
  return {
    grossGuaranteed: gg,
    grossExpected: ge,
    netGuaranteed: netAfterTax(gg, taxRate),
    netExpected: netAfterTax(ge, taxRate),
    missing,
  };
}

// ---------------------------------------------------------------------------
// Rentabilité : les seuils
// ---------------------------------------------------------------------------

export interface BrisageInput {
  readonly item: BreakableItem;
  readonly table: RuneTable;
  readonly prices: PriceBook;
  /** ce que coûte UN exemplaire : coût de craft ou prix d'achat */
  readonly cost: number;
  readonly options?: YieldOptions;
  readonly taxRate?: number;
  readonly marginalThresholdPct?: number;
}

export interface BrisageEvaluation {
  readonly yields: BrisageYield;
  readonly value: BrisageValue;
  /** gain si l'objet ne donne que les runes garanties */
  readonly profitGuaranteed: number;
  /** gain moyen attendu */
  readonly profitExpected: number;
  readonly marginPctExpected: number | null;
  readonly verdict: Verdict;
  /**
   * Prix d'acquisition maximum pour rester à l'équilibre. Au-delà, briser perd
   * de l'argent. Deux lectures : au-dessus de `maxPriceGuaranteed` le brisage
   * n'est plus sûr, au-dessus de `maxPriceExpected` il est perdant en moyenne.
   */
  readonly maxPriceGuaranteed: number;
  readonly maxPriceExpected: number;
  /**
   * Coefficient uniforme minimum pour rentrer dans ses frais, en %.
   * null si même 4 000 % ne suffit pas (ou si aucun prix de rune n'est connu).
   */
  readonly minCoefficientGuaranteed: number | null;
  readonly minCoefficientExpected: number | null;
}

export function evaluateBrisage(input: BrisageInput): BrisageEvaluation {
  const taxRate = input.taxRate ?? DEFAULT_TAX_RATE;
  const threshold = input.marginalThresholdPct ?? DEFAULT_MARGINAL_THRESHOLD_PCT;

  const yields = computeYields(input.item, input.table, input.options);
  const value = valueOfYields(yields, input.prices, taxRate);

  const profitGuaranteed = value.netGuaranteed - input.cost;
  const profitExpected = value.netExpected - input.cost;
  const marginPctExpected = input.cost > 0 ? (profitExpected / input.cost) * 100 : null;

  let verdict: Verdict;
  if (profitExpected < 0) verdict = 'loss';
  else if (marginPctExpected !== null && marginPctExpected < threshold) verdict = 'marginal';
  else verdict = 'profitable';

  return {
    yields,
    value,
    profitGuaranteed,
    profitExpected,
    marginPctExpected,
    verdict,
    // profit ≥ 0 ⟺ coût ≤ net : le net EST le prix plafond
    maxPriceGuaranteed: value.netGuaranteed,
    maxPriceExpected: value.netExpected,
    minCoefficientGuaranteed: minCoefficient(input, 'guaranteed'),
    minCoefficientExpected: minCoefficient(input, 'expected'),
  };
}

/**
 * Plus petit coefficient uniforme (en %) qui rend l'opération non perdante.
 *
 * La valeur ne décroît jamais quand le coefficient monte : une recherche
 * dichotomique sur les pourcentages entiers donne donc le seuil exact.
 * Les coefficients par rune sont ignorés ici — la réponse est « à taux
 * uniforme, il faut au moins X % ».
 */
export function minCoefficient(
  input: BrisageInput,
  reading: 'guaranteed' | 'expected' = 'expected',
): number | null {
  const taxRate = input.taxRate ?? DEFAULT_TAX_RATE;
  const netAt = (coefficient: number): number => {
    const options: YieldOptions = { ...input.options, coefficient, coefficients: new Map() };
    const value = valueOfYields(computeYields(input.item, input.table, options), input.prices, taxRate);
    return reading === 'guaranteed' ? value.netGuaranteed : value.netExpected;
  };

  if (input.cost <= 0) return MIN_COEFFICIENT;
  if (netAt(MAX_COEFFICIENT) < input.cost) return null; // hors d'atteinte

  let low = MIN_COEFFICIENT;
  let high = MAX_COEFFICIENT;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (netAt(middle) >= input.cost) high = middle;
    else low = middle + 1;
  }
  return low;
}

// ---------------------------------------------------------------------------
// Choix du focus
// ---------------------------------------------------------------------------

export interface FocusOption {
  /** null = brisage normal, sans focus */
  readonly key: string | null;
  readonly rune: RuneInfo | null;
  readonly netGuaranteed: number;
  readonly netExpected: number;
  /** écart en % face au brisage sans focus (null si celui-ci ne vaut rien) */
  readonly gainPct: number | null;
  /** true si au moins un prix de rune manque pour trancher */
  readonly incomplete: boolean;
}

/**
 * Classe le brisage normal et chaque focus possible, du plus rentable au moins
 * rentable. Focaliser concentre tout l'objet sur une seule rune : c'est
 * gagnant quand cette rune vaut cher, perdant sinon.
 */
export function rankFocus(
  item: BreakableItem,
  table: RuneTable,
  prices: PriceBook,
  options?: YieldOptions,
  taxRate: number = DEFAULT_TAX_RATE,
): FocusOption[] {
  const evaluate = (focus: string | null): FocusOption => {
    const yields = computeYields(item, table, { ...options, focus });
    const value = valueOfYields(yields, prices, taxRate);
    return {
      key: focus,
      rune: focus === null ? null : (table.get(focus) ?? null),
      netGuaranteed: value.netGuaranteed,
      netExpected: value.netExpected,
      gainPct: null,
      incomplete: value.missing.length > 0,
    };
  };

  const base = evaluate(null);
  const keys = [...new Set(item.lines.map(line => line.key))].filter(key => table.has(key));
  const options_ = [base, ...keys.map(evaluate)];

  // comparer à une référence incomplète produirait des écarts absurdes
  // (« +1516 % » alors qu'il manque cinq prix) : mieux vaut ne rien annoncer
  const comparable = base.netExpected > 0 && !base.incomplete;
  const withGain = options_.map(option => ({
    ...option,
    gainPct:
      comparable && !option.incomplete
        ? ((option.netExpected - base.netExpected) / base.netExpected) * 100
        : null,
  }));

  return withGain.sort((a, b) => b.netExpected - a.netExpected || b.netGuaranteed - a.netGuaranteed);
}
