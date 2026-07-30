// Calculs de rentabilité : taxe HDV, profit, marge, seuil de rentabilité.
//
// La taxe est calculée en arithmétique entière (points de base) pour éviter
// toute dérive flottante : avec un taux de 2 %, 1150 × 0.02 vaut
// 22.999999999999996 en flottant — ici la taxe vaut exactement 23.
//
// Convention d'arrondi retenue (documentée, testée) : la taxe est arrondie
// À L'ENTIER INFÉRIEUR au niveau du kama. Le mécanisme exact d'arrondi du
// jeu n'est pas documenté publiquement ; l'écart éventuel est d'au plus
// 1 kama sur le net.

import { DEFAULT_MARGINAL_THRESHOLD_PCT, DEFAULT_TAX_RATE } from './config.ts';

export type Verdict = 'profitable' | 'marginal' | 'loss';

function toBasisPoints(taxRate: number): number {
  const bp = Math.round(taxRate * 10_000);
  if (!Number.isInteger(bp) || bp < 0 || bp >= 10_000) {
    throw new RangeError(`taux de taxe invalide : ${taxRate}`);
  }
  return bp;
}

/** Taxe prélevée sur un prix de vente (arrondie au kama inférieur). */
export function taxOn(salePrice: number, taxRate: number = DEFAULT_TAX_RATE): number {
  const bp = toBasisPoints(taxRate);
  return Math.floor((salePrice * bp) / 10_000);
}

/** Montant net perçu par le vendeur après taxe. */
export function netAfterTax(salePrice: number, taxRate: number = DEFAULT_TAX_RATE): number {
  return salePrice - taxOn(salePrice, taxRate);
}

/**
 * Prix de vente minimum pour être à l'équilibre : le plus petit prix entier p
 * tel que net(p) >= craftCost. Exact par construction (vérifié en remontant
 * et descendant autour de l'estimation).
 */
export function breakEvenPrice(craftCost: number, taxRate: number = DEFAULT_TAX_RATE): number {
  if (craftCost <= 0) return 0;
  const bp = toBasisPoints(taxRate);
  let price = Math.ceil((craftCost * 10_000) / (10_000 - bp));
  while (price > 0 && netAfterTax(price - 1, taxRate) >= craftCost) price--;
  while (netAfterTax(price, taxRate) < craftCost) price++;
  return price;
}

export interface SaleEvaluation {
  readonly salePrice: number;
  readonly tax: number;
  readonly net: number;
  /** profit pour UN craft */
  readonly profit: number;
  /** profit total pour la quantité demandée */
  readonly totalProfit: number;
  /** marge en % du coût (null si le coût est nul) */
  readonly marginPct: number | null;
  readonly breakEven: number;
  readonly verdict: Verdict;
}

export interface SaleInput {
  /** coût de revient d'UN craft (kamas entiers) */
  readonly craftCost: number;
  /** prix de vente unitaire évalué */
  readonly salePrice: number;
  /** nombre de crafts (défaut 1) */
  readonly quantity?: number;
  readonly taxRate?: number;
  /** marge (%) sous laquelle le verdict est « marginal » */
  readonly marginalThresholdPct?: number;
}

/** Évalue une vente : net, profit, marge, seuil de rentabilité, verdict. */
export function evaluateSale(input: SaleInput): SaleEvaluation {
  const quantity = input.quantity ?? 1;
  const taxRate = input.taxRate ?? DEFAULT_TAX_RATE;
  const threshold = input.marginalThresholdPct ?? DEFAULT_MARGINAL_THRESHOLD_PCT;

  const tax = taxOn(input.salePrice, taxRate);
  const net = input.salePrice - tax;
  const profit = net - input.craftCost;
  const marginPct = input.craftCost > 0 ? (profit / input.craftCost) * 100 : null;

  let verdict: Verdict;
  if (profit < 0) verdict = 'loss';
  else if (marginPct !== null && marginPct < threshold) verdict = 'marginal';
  else verdict = 'profitable';

  return {
    salePrice: input.salePrice,
    tax,
    net,
    profit,
    totalProfit: profit * quantity,
    marginPct,
    breakEven: breakEvenPrice(input.craftCost, taxRate),
    verdict,
  };
}
