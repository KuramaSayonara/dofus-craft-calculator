// Point d'entrée public du moteur de calcul.
// Le moteur est du TypeScript pur, sans effet de bord ni dépendance
// d'exécution : il prend un graphe de recettes + un carnet de prix.

export { DEFAULT_MARGINAL_THRESHOLD_PCT, DEFAULT_MAX_DEPTH, DEFAULT_TAX_RATE } from './config.ts';
export type { Inventory, PriceBook, RecipeGraph, RecipeInfo } from './types.ts';
export { graphFromRecipesFile } from './graph.ts';
export { formatKamas, KAMAS_GROUP_SEPARATOR, parseKamas, unitPriceFromLot } from './kamas.ts';
export {
  analyzeCraftCost,
  createCostAnalyzer,
  type CostAnalyzer,
  type CostChild,
  type CostingOptions,
  type CostingStats,
  type CostNode,
  type CostSource,
  type SourcingMode,
} from './costing.ts';
export {
  breakEvenPrice,
  evaluateSale,
  netAfterTax,
  taxOn,
  type SaleEvaluation,
  type SaleInput,
  type Verdict,
} from './profitability.ts';
export { buildShoppingList, type ShoppingLine, type ShoppingList } from './shopping.ts';
export { scanCrafts, type CraftScan, type CraftScanRow, type ScanOptions } from './topcrafts.ts';
