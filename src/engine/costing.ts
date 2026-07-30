// Cœur du moteur : coût de revient d'un craft, récursif.
//
// Principes :
// - Tous les coûts sont des kamas entiers ; un prix absent du carnet est
//   INCONNU et rend le coût indéterminé (null), jamais 0.
// - Chaque ingrédient a un mode d'approvisionnement : acheter, crafter, ou
//   automatique (le moins cher des coûts CONNUS — un coût inconnu n'est
//   jamais présumé moins cher).
// - Cycles (A nécessite B qui nécessite A) : la branche craft du descendant
//   déjà en cours de craft est coupée (cycle=true) ; jamais de boucle infinie.
// - Profondeur maximale configurable ; branche coupée → depthLimited=true.
// - Mémoïsation par (item, profondeur restante, mode). Un résultat qui dépend
//   d'un cycle avec un ancêtre encore « ouvert » n'est pas mémoïsé, car il
//   n'est pas valable hors de ce chemin.

import { DEFAULT_MAX_DEPTH } from './config.ts';
import type { PriceBook, RecipeGraph } from './types.ts';

export type SourcingMode = 'buy' | 'craft' | 'auto';
export type CostSource = 'buy' | 'craft' | 'unknown';

export interface CostChild {
  /** quantité de cet ingrédient pour UN craft du parent */
  readonly quantityPerCraft: number;
  readonly node: CostNode;
}

/** Analyse de coût d'UNE unité d'un objet. */
export interface CostNode {
  readonly itemId: number;
  /** mode demandé pour ce nœud */
  readonly mode: SourcingMode;
  readonly craftable: boolean;
  /** prix d'achat unitaire du carnet (null = prix inconnu) */
  readonly buyUnitPrice: number | null;
  /** coût de craft unitaire (null = pas de recette exploitable ou coût indéterminé) */
  readonly craftUnitCost: number | null;
  /** coût unitaire retenu selon le mode (null = indéterminé) */
  readonly unitCost: number | null;
  /** provenance du coût retenu ('unknown' si indéterminé) */
  readonly source: CostSource;
  /** branche craft coupée : objet déjà en cours de craft plus haut dans l'arbre */
  readonly cycle: boolean;
  /** branche craft coupée par la profondeur maximale */
  readonly depthLimited: boolean;
  /** prix à renseigner pour rendre unitCost déterminé (vide si déterminé) */
  readonly missingPrices: ReadonlyArray<number>;
  /** économie unitaire du craft vs achat (positif = crafter est moins cher) */
  readonly craftSavings: number | null;
  /** détail des ingrédients (vide si la recette n'a pas été expansée) */
  readonly children: ReadonlyArray<CostChild>;
}

export interface CostingOptions {
  /** profondeur maximale d'expansion (défaut : DEFAULT_MAX_DEPTH) */
  readonly maxDepth?: number;
  /** mode par objet ; tout objet absent est en 'auto' */
  readonly modes?: ReadonlyMap<number, SourcingMode>;
}

export interface CostingStats {
  nodesComputed: number;
  cacheHits: number;
  cycleCuts: number;
  depthCuts: number;
}

export interface CostAnalyzer {
  /** analyse le craft d'un objet (la racine est toujours évaluée en mode craft) */
  analyze(itemId: number): CostNode;
  readonly stats: CostingStats;
}

interface InternalResult {
  node: CostNode;
  /** ancêtres « ouverts » dont ce résultat dépend (null = aucun → mémoïsable) */
  cuts: Set<number> | null;
}

/**
 * Crée un analyseur avec cache partagé : le carnet de prix et les options
 * sont figés à la création. À jeter et recréer si un prix ou un mode change.
 */
export function createCostAnalyzer(
  graph: RecipeGraph,
  prices: PriceBook,
  options: CostingOptions = {},
): CostAnalyzer {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const modes = options.modes;
  const stats: CostingStats = { nodesComputed: 0, cacheHits: 0, cycleCuts: 0, depthCuts: 0 };
  const memo = new Map<string, CostNode>();
  /** objets dont le craft est en cours d'expansion sur le chemin actuel */
  const path = new Set<number>();

  const modeOf = (itemId: number): SourcingMode => modes?.get(itemId) ?? 'auto';

  function buildNode(
    itemId: number,
    mode: SourcingMode,
    craftable: boolean,
    cycle: boolean,
    depthLimited: boolean,
    craftUnitCost: number | null,
    craftMissing: ReadonlyArray<number>,
    children: ReadonlyArray<CostChild>,
  ): CostNode {
    const buyUnitPrice = prices.get(itemId) ?? null;
    let unitCost: number | null;
    let source: CostSource;
    let missingPrices: ReadonlyArray<number>;

    const craftForced = mode === 'craft' && craftable && !cycle && !depthLimited;
    if (craftForced) {
      unitCost = craftUnitCost;
      source = unitCost !== null ? 'craft' : 'unknown';
      missingPrices = unitCost !== null ? [] : craftMissing;
    } else if (mode === 'auto' && craftable) {
      if (buyUnitPrice !== null && craftUnitCost !== null) {
        // les deux coûts sont connus : le moins cher gagne (achat à égalité)
        if (craftUnitCost < buyUnitPrice) {
          unitCost = craftUnitCost;
          source = 'craft';
        } else {
          unitCost = buyUnitPrice;
          source = 'buy';
        }
        missingPrices = [];
      } else if (craftUnitCost !== null) {
        unitCost = craftUnitCost;
        source = 'craft';
        missingPrices = [];
      } else if (buyUnitPrice !== null) {
        unitCost = buyUnitPrice;
        source = 'buy';
        missingPrices = [];
      } else {
        unitCost = null;
        source = 'unknown';
        missingPrices = [...new Set([itemId, ...craftMissing])];
      }
    } else {
      // mode 'buy', objet non craftable, ou craft forcé mais branche coupée
      unitCost = buyUnitPrice;
      source = unitCost !== null ? 'buy' : 'unknown';
      missingPrices = unitCost !== null ? [] : [itemId];
    }

    const craftSavings =
      buyUnitPrice !== null && craftUnitCost !== null ? buyUnitPrice - craftUnitCost : null;

    return {
      itemId,
      mode,
      craftable,
      buyUnitPrice,
      craftUnitCost,
      unitCost,
      source,
      cycle,
      depthLimited,
      missingPrices,
      craftSavings,
      children,
    };
  }

  function analyzeItem(itemId: number, depthRemaining: number, mode: SourcingMode): InternalResult {
    const recipe = graph.get(itemId);
    const craftable = recipe !== undefined;

    // cycle : ce craft est déjà ouvert plus haut → branche craft coupée ;
    // résultat valable uniquement sur ce chemin, donc jamais mémoïsé
    if (craftable && path.has(itemId)) {
      stats.cycleCuts++;
      return {
        node: buildNode(itemId, mode, true, true, false, null, [], []),
        cuts: new Set([itemId]),
      };
    }

    const key = `${itemId}:${depthRemaining}:${mode}`;
    const cached = memo.get(key);
    if (cached !== undefined) {
      stats.cacheHits++;
      return { node: cached, cuts: null };
    }
    stats.nodesComputed++;

    let craftUnitCost: number | null = null;
    let craftMissing: ReadonlyArray<number> = [];
    let children: CostChild[] = [];
    let depthLimited = false;
    let cuts: Set<number> | null = null;

    if (recipe !== undefined) {
      if (depthRemaining <= 0) {
        depthLimited = true;
        stats.depthCuts++;
      } else {
        path.add(itemId);
        let sum = 0;
        let determinate = true;
        const missing = new Set<number>();
        for (const [ingredientId, quantity] of recipe.ingredients) {
          const child = analyzeItem(ingredientId, depthRemaining - 1, modeOf(ingredientId));
          children.push({ quantityPerCraft: quantity, node: child.node });
          if (child.cuts !== null) {
            cuts ??= new Set();
            for (const cut of child.cuts) cuts.add(cut);
          }
          if (child.node.unitCost === null) {
            determinate = false;
            for (const missingId of child.node.missingPrices) missing.add(missingId);
          } else {
            sum += quantity * child.node.unitCost;
          }
        }
        path.delete(itemId);
        // les cycles dont CE nœud est l'ancêtre sont résolus ici même
        if (cuts !== null) {
          cuts.delete(itemId);
          if (cuts.size === 0) cuts = null;
        }
        if (determinate) craftUnitCost = sum;
        else craftMissing = [...missing];
      }
    }

    const node = buildNode(itemId, mode, craftable, false, depthLimited, craftUnitCost, craftMissing, children);
    if (cuts === null) memo.set(key, node);
    return { node, cuts };
  }

  return {
    analyze: (itemId: number): CostNode => analyzeItem(itemId, maxDepth, 'craft').node,
    stats,
  };
}

/** Analyse ponctuelle du coût de craft d'un objet. */
export function analyzeCraftCost(
  graph: RecipeGraph,
  prices: PriceBook,
  itemId: number,
  options: CostingOptions = {},
): { root: CostNode; stats: CostingStats } {
  const analyzer = createCostAnalyzer(graph, prices, options);
  const root = analyzer.analyze(itemId);
  return { root, stats: analyzer.stats };
}
