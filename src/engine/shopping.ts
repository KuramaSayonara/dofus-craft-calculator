// Liste de courses : agrégation des ressources à ACHETER pour N crafts,
// après résolution de l'arbre récursif et déduction du stock possédé.
//
// Règle de descente : on descend dans les ingrédients d'un nœud uniquement si
// ce nœud sera effectivement crafté (source 'craft', ou craft forcé même à
// coût encore indéterminé). Un nœud acheté — ou indéterminé en mode auto —
// est une feuille d'achat. La racine, elle, est toujours craftée.
//
// Règle du stock : ce qu'on possède déjà est prélevé AVANT de décider quoi
// acheter ou crafter. Un intermédiaire craftable qu'on a en stock n'est donc
// pas re-crafté, et on ne descend pas dans sa recette pour cette part.
// Le stock n'est jamais prélevé sur la racine : crafter l'objet demandé est
// précisément ce qu'on veut faire.
//
// Deux coûts sont produits, volontairement distincts :
// - `totalCost`   : la SORTIE DE KAMAS réelle (ce qu'il reste à acheter).
// - `fullCost`    : la valeur marchande de TOUTES les ressources consommées,
//                   stock compris. C'est le coût de revient honnête, celui qui
//                   dit si le craft vaut le coup : les ressources possédées
//                   auraient pu être revendues au lieu d'être consommées.

import type { CostNode } from './costing.ts';
import type { Inventory, PriceBook } from './types.ts';

export interface ShoppingLine {
  readonly itemId: number;
  /** quantité totale nécessaire (stock compris) */
  readonly quantity: number;
  /** part couverte par le stock possédé */
  readonly fromStock: number;
  /** part qu'il reste à acheter */
  readonly toBuy: number;
  /** prix unitaire du carnet (null = inconnu) */
  readonly unitPrice: number | null;
  /** coût de ce qu'il reste à acheter (null si prix inconnu) */
  readonly lineCost: number | null;
  /** valeur marchande de la quantité totale (null si prix inconnu) */
  readonly fullLineCost: number | null;
}

export interface ShoppingList {
  readonly lines: ReadonlyArray<ShoppingLine>;
  /** sortie de kamas : total à acheter (null si un prix manque) */
  readonly totalCost: number | null;
  /** coût de revient réel, stock valorisé au prix du marché (null si un prix manque) */
  readonly fullCost: number | null;
  /** somme des lignes à acheter dont le prix est connu */
  readonly knownCost: number;
  /** nombre de lignes au prix inconnu */
  readonly unknownCount: number;
  /** valeur du stock consommé (null si un prix manque) */
  readonly stockValue: number | null;
}

function willBeCrafted(node: CostNode): boolean {
  if (node.children.length === 0) return false;
  return node.source === 'craft' || (node.mode === 'craft' && node.source === 'unknown');
}

interface Requirement {
  quantity: number;
  fromStock: number;
}

function collect(
  node: CostNode,
  quantity: number,
  isRoot: boolean,
  /** stock restant, décrémenté au fur et à mesure */
  pool: Map<number, number>,
  acc: Map<number, Requirement>,
): void {
  let remaining = quantity;

  // le stock couvre d'abord le besoin — sauf pour la racine, qu'on veut crafter
  if (!isRoot) {
    const owned = pool.get(node.itemId) ?? 0;
    const used = Math.min(owned, remaining);
    if (used > 0) {
      pool.set(node.itemId, owned - used);
      remaining -= used;
      const entry = acc.get(node.itemId);
      if (entry === undefined) acc.set(node.itemId, { quantity: used, fromStock: used });
      else {
        entry.quantity += used;
        entry.fromStock += used;
      }
    }
    if (remaining === 0) return;
  }

  if (isRoot ? node.children.length > 0 : willBeCrafted(node)) {
    for (const child of node.children) {
      collect(child.node, remaining * child.quantityPerCraft, false, pool, acc);
    }
  } else {
    const entry = acc.get(node.itemId);
    if (entry === undefined) acc.set(node.itemId, { quantity: remaining, fromStock: 0 });
    else entry.quantity += remaining;
  }
}

/** Construit la liste de courses pour `crafts` exemplaires de la racine. */
export function buildShoppingList(
  root: CostNode,
  crafts: number,
  prices: PriceBook,
  inventory?: Inventory,
): ShoppingList {
  const requirements = new Map<number, Requirement>();
  const pool = new Map<number, number>(inventory ?? []);
  collect(root, crafts, true, pool, requirements);

  const lines: ShoppingLine[] = [...requirements.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([itemId, requirement]) => {
      const unitPrice = prices.get(itemId) ?? null;
      const toBuy = requirement.quantity - requirement.fromStock;
      return {
        itemId,
        quantity: requirement.quantity,
        fromStock: requirement.fromStock,
        toBuy,
        unitPrice,
        lineCost: unitPrice !== null ? unitPrice * toBuy : null,
        fullLineCost: unitPrice !== null ? unitPrice * requirement.quantity : null,
      };
    });

  let knownCost = 0;
  let knownFullCost = 0;
  let unknownCount = 0;
  for (const line of lines) {
    if (line.lineCost === null) unknownCount++;
    else {
      knownCost += line.lineCost;
      knownFullCost += line.fullLineCost!;
    }
  }

  const complete = unknownCount === 0;
  return {
    lines,
    totalCost: complete ? knownCost : null,
    fullCost: complete ? knownFullCost : null,
    knownCost,
    unknownCount,
    stockValue: complete ? knownFullCost - knownCost : null,
  };
}
