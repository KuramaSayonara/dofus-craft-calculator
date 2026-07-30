// Balayage de TOUS les crafts du jeu avec le carnet de prix actuel :
// la matière première du tableau de bord « top crafts ».
// Un seul analyseur (cache partagé) pour tout le balayage.

import { createCostAnalyzer, type CostingOptions, type CostingStats } from './costing.ts';
import { breakEvenPrice, netAfterTax } from './profitability.ts';
import type { PriceBook, RecipeGraph } from './types.ts';

export interface CraftScanRow {
  readonly itemId: number;
  readonly jobId: number | null;
  readonly craftLevel: number | null;
  /** coût de craft d'une unité (null = indéterminé) */
  readonly craftCost: number | null;
  /** prix à renseigner pour rendre ce craft calculable */
  readonly missingPrices: ReadonlyArray<number>;
  /** prix marché de l'objet lui-même, s'il est dans le carnet */
  readonly salePrice: number | null;
  /** prix de vente minimum à l'équilibre (null si coût indéterminé) */
  readonly breakEven: number | null;
  /** profit net pour un craft vendu au prix marché (null si incalculable) */
  readonly profit: number | null;
  /** marge en % du coût (null si incalculable ou coût nul) */
  readonly marginPct: number | null;
}

export interface CraftScan {
  readonly rows: ReadonlyArray<CraftScanRow>;
  readonly stats: CostingStats;
}

export interface ScanOptions extends CostingOptions {
  readonly taxRate?: number;
}

/** Évalue chaque objet craftable du graphe avec le carnet de prix donné. */
export function scanCrafts(graph: RecipeGraph, prices: PriceBook, options: ScanOptions = {}): CraftScan {
  const { taxRate, ...costingOptions } = options;
  const analyzer = createCostAnalyzer(graph, prices, costingOptions);

  const rows: CraftScanRow[] = [];
  for (const [itemId, recipe] of graph) {
    const node = analyzer.analyze(itemId);
    const craftCost = node.craftUnitCost;
    const salePrice = prices.get(itemId) ?? null;

    let breakEven: number | null = null;
    let profit: number | null = null;
    let marginPct: number | null = null;
    if (craftCost !== null) {
      breakEven = breakEvenPrice(craftCost, taxRate);
      if (salePrice !== null) {
        profit = netAfterTax(salePrice, taxRate) - craftCost;
        marginPct = craftCost > 0 ? (profit / craftCost) * 100 : null;
      }
    }

    rows.push({
      itemId,
      jobId: recipe.jobId,
      craftLevel: recipe.level,
      craftCost,
      missingPrices: node.missingPrices,
      salePrice,
      breakEven,
      profit,
      marginPct,
    });
  }

  return { rows, stats: analyzer.stats };
}
