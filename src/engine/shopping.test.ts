import { describe, expect, it } from 'vitest';
import { analyzeCraftCost, type SourcingMode } from './costing.ts';
import { netAfterTax } from './profitability.ts';
import { buildShoppingList } from './shopping.ts';
import { makeGraph, makePrices } from './test-helpers.ts';

describe('liste de courses', () => {
  it('multiplie les quantités par le nombre de crafts', () => {
    const graph = makeGraph({ 1: [[2, 3], [3, 2]] });
    const prices = makePrices({ 2: 10, 3: 50 });
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 20, prices);
    expect(list.lines.map(l => [l.itemId, l.quantity, l.toBuy, l.lineCost])).toEqual([
      [2, 60, 60, 600],
      [3, 40, 40, 2000],
    ]);
    expect(list.totalCost).toBe(2600);
    expect(list.fullCost).toBe(2600);
    expect(list.unknownCount).toBe(0);
  });

  it('agrège une même ressource venant de plusieurs branches', () => {
    // 1 ← 2×P(10) + 1×Q(11) ; P ← 3×W(20) ; Q ← 5×W — W partout
    const graph = makeGraph({ 1: [[10, 2], [11, 1]], 10: [[20, 3]], 11: [[20, 5]] });
    const prices = makePrices({ 20: 1 });
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 2, prices);
    expect(list.lines.map(l => [l.itemId, l.quantity, l.lineCost])).toEqual([[20, 2 * (2 * 3 + 5), 22]]);
  });

  it('un ingrédient acheté (auto) est une feuille : on ne descend pas dedans', () => {
    const graph = makeGraph({ 1: [[10, 2]], 10: [[20, 3]] });
    // P acheté 2, crafté 3×1=3 → auto achète P
    const prices = makePrices({ 10: 2, 20: 1 });
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 1, prices);
    expect(list.lines.map(l => [l.itemId, l.quantity])).toEqual([[10, 2]]);
  });

  it('prix inconnu → coût total indéterminé mais quantités exactes', () => {
    const graph = makeGraph({ 1: [[2, 4], [3, 1]] });
    const prices = makePrices({ 2: 10 });
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 5, prices);
    expect(list.lines.map(l => [l.itemId, l.quantity, l.lineCost])).toEqual([
      [2, 20, 200],
      [3, 5, null],
    ]);
    expect(list.totalCost).toBeNull();
    expect(list.fullCost).toBeNull();
    expect(list.knownCost).toBe(200);
    expect(list.unknownCount).toBe(1);
  });

  it('en mode auto sans aucun prix, un intermédiaire indéterminé reste une feuille', () => {
    const graph = makeGraph({ 1: [[10, 1]], 10: [[20, 2]] });
    const prices = makePrices({});
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 1, prices);
    expect(list.lines.map(l => l.itemId)).toEqual([10]);
  });

  it('en craft forcé, on descend même à coût indéterminé', () => {
    const graph = makeGraph({ 1: [[10, 1]], 10: [[20, 2]] });
    const prices = makePrices({});
    const modes = new Map<number, SourcingMode>([[10, 'craft']]);
    const { root } = analyzeCraftCost(graph, prices, 1, { modes });
    const list = buildShoppingList(root, 3, prices);
    expect(list.lines.map(l => [l.itemId, l.quantity])).toEqual([[20, 6]]);
  });
});

describe('stock possédé', () => {
  const graph = makeGraph({ 1: [[2, 10], [3, 20]] });
  const prices = makePrices({ 2: 101, 3: 146 });

  it('déduit le stock de ce qu\'il faut acheter', () => {
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 1, prices, new Map([[2, 1000]]));
    const sauge = list.lines.find(l => l.itemId === 2)!;
    expect(sauge.quantity).toBe(10);
    expect(sauge.fromStock).toBe(10);
    expect(sauge.toBuy).toBe(0);
    expect(sauge.lineCost).toBe(0);
    expect(sauge.fullLineCost).toBe(1010);
  });

  it('distingue sortie de kamas et coût de revient réel', () => {
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 1, prices, new Map([[2, 1000]]));
    expect(list.totalCost).toBe(2920); // 20 orties seulement
    expect(list.fullCost).toBe(3930); // 10×101 + 20×146
    expect(list.stockValue).toBe(1010);
  });

  it('un stock partiel ne couvre que ce qu\'il peut', () => {
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 1, prices, new Map([[2, 4]]));
    const sauge = list.lines.find(l => l.itemId === 2)!;
    expect(sauge.fromStock).toBe(4);
    expect(sauge.toBuy).toBe(6);
    expect(sauge.lineCost).toBe(6 * 101);
  });

  it('le stock s\'épuise sur plusieurs crafts', () => {
    const { root } = analyzeCraftCost(graph, prices, 1);
    // 25 crafts → 250 sauge nécessaires, on en a 100
    const list = buildShoppingList(root, 25, prices, new Map([[2, 100]]));
    const sauge = list.lines.find(l => l.itemId === 2)!;
    expect(sauge.quantity).toBe(250);
    expect(sauge.fromStock).toBe(100);
    expect(sauge.toBuy).toBe(150);
  });

  it('le stock d\'un intermédiaire évite de le crafter (pas de descente)', () => {
    // 1 ← 2×Aluminite(10) ; Aluminite ← 10 Fer + 10 Cuivre
    const nested = makeGraph({ 1: [[10, 2]], 10: [[20, 10], [21, 10]] });
    const nestedPrices = makePrices({ 10: 600, 20: 20, 21: 30 });
    const { root } = analyzeCraftCost(nested, nestedPrices, 1);
    // sans stock : on craft l'Aluminite → Fer + Cuivre
    expect(buildShoppingList(root, 1, nestedPrices).lines.map(l => l.itemId)).toEqual([20, 21]);
    // avec 2 Aluminite en stock : plus rien à acheter
    const withStock = buildShoppingList(root, 1, nestedPrices, new Map([[10, 2]]));
    expect(withStock.lines.map(l => [l.itemId, l.fromStock, l.toBuy])).toEqual([[10, 2, 0]]);
    expect(withStock.totalCost).toBe(0);
    expect(withStock.fullCost).toBe(1200);
  });

  it('un stock partiel d\'intermédiaire : le reste est bien crafté', () => {
    const nested = makeGraph({ 1: [[10, 2]], 10: [[20, 10], [21, 10]] });
    const nestedPrices = makePrices({ 10: 600, 20: 20, 21: 30 });
    const { root } = analyzeCraftCost(nested, nestedPrices, 1);
    const list = buildShoppingList(root, 1, nestedPrices, new Map([[10, 1]]));
    // 1 Aluminite prise au stock, la seconde craftée → 10 Fer + 10 Cuivre
    expect(list.lines.map(l => [l.itemId, l.fromStock, l.toBuy])).toEqual([
      [10, 1, 0],
      [20, 0, 10],
      [21, 0, 10],
    ]);
    expect(list.totalCost).toBe(500);
  });

  it('le stock de l\'objet final n\'est jamais consommé (on veut le crafter)', () => {
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 1, prices, new Map([[1, 50]]));
    expect(list.totalCost).toBe(10 * 101 + 20 * 146);
  });

  it('un stock plus grand que le besoin ne crée pas de quantité négative', () => {
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 1, prices, new Map([[2, 5000], [3, 5000]]));
    expect(list.lines.every(l => l.toBuy === 0)).toBe(true);
    expect(list.totalCost).toBe(0);
  });
});

describe('scénario réel : Potion de Souvenir', () => {
  // recette réelle du jeu : 10 Sauge + 20 Ortie (Alchimiste niv. 30)
  const graph = makeGraph({ 7652: [[289, 10], [311, 20]] });
  const prices = makePrices({ 289: 101, 311: 146 });
  const VENTE = 2706;

  it('à perte quand on achète tout', () => {
    const { root } = analyzeCraftCost(graph, prices, 7652);
    const list = buildShoppingList(root, 1, prices);
    expect(list.fullCost).toBe(3930);
    expect(netAfterTax(VENTE) - list.fullCost!).toBe(-1278);
  });

  it('avec 1000 sauge en stock : sortie de kamas réduite, mais toujours à perte', () => {
    const { root } = analyzeCraftCost(graph, prices, 7652);
    const list = buildShoppingList(root, 1, prices, new Map([[289, 1000]]));
    expect(list.totalCost).toBe(2920); // on n'achète que les orties
    expect(netAfterTax(VENTE) - list.totalCost!).toBe(-268);
    // le coût de revient réel, lui, n'a pas changé
    expect(list.fullCost).toBe(3930);
  });
});
