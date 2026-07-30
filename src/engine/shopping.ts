// Liste de courses : agrégation des ressources à ACHETER pour N crafts,
// après résolution de l'arbre récursif.
//
// Règle : on descend dans les ingrédients d'un nœud uniquement si ce nœud
// sera effectivement crafté (source 'craft', ou craft forcé même à coût
// encore indéterminé). Un nœud acheté — ou indéterminé en mode auto — est
// une feuille d'achat. La racine, elle, est toujours craftée.

import type { CostNode } from './costing.ts';
import type { PriceBook } from './types.ts';

export interface ShoppingLine {
  readonly itemId: number;
  readonly quantity: number;
  /** prix unitaire du carnet (null = inconnu) */
  readonly unitPrice: number | null;
  /** coût de la ligne (null si prix inconnu) */
  readonly lineCost: number | null;
}

export interface ShoppingList {
  readonly lines: ReadonlyArray<ShoppingLine>;
  /** coût total (null si au moins un prix est inconnu) */
  readonly totalCost: number | null;
  /** somme des lignes dont le prix est connu */
  readonly knownCost: number;
  /** nombre de lignes au prix inconnu */
  readonly unknownCount: number;
}

function willBeCrafted(node: CostNode): boolean {
  if (node.children.length === 0) return false;
  return node.source === 'craft' || (node.mode === 'craft' && node.source === 'unknown');
}

function collect(node: CostNode, quantity: number, isRoot: boolean, acc: Map<number, number>): void {
  if (isRoot ? node.children.length > 0 : willBeCrafted(node)) {
    for (const child of node.children) {
      collect(child.node, quantity * child.quantityPerCraft, false, acc);
    }
  } else {
    acc.set(node.itemId, (acc.get(node.itemId) ?? 0) + quantity);
  }
}

/** Construit la liste de courses pour `crafts` exemplaires de la racine. */
export function buildShoppingList(root: CostNode, crafts: number, prices: PriceBook): ShoppingList {
  const quantities = new Map<number, number>();
  collect(root, crafts, true, quantities);

  const lines: ShoppingLine[] = [...quantities.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([itemId, quantity]) => {
      const unitPrice = prices.get(itemId) ?? null;
      return {
        itemId,
        quantity,
        unitPrice,
        lineCost: unitPrice !== null ? unitPrice * quantity : null,
      };
    });

  let knownCost = 0;
  let unknownCount = 0;
  for (const line of lines) {
    if (line.lineCost === null) unknownCount++;
    else knownCost += line.lineCost;
  }

  return {
    lines,
    totalCost: unknownCount === 0 ? knownCost : null,
    knownCost,
    unknownCount,
  };
}
