import { describe, expect, it } from 'vitest';
import { analyzeCraftCost, type SourcingMode } from './costing.ts';
import { buildShoppingList } from './shopping.ts';
import { makeGraph, makePrices } from './test-helpers.ts';

describe('liste de courses', () => {
  it('multiplie les quantités par le nombre de crafts', () => {
    const graph = makeGraph({ 1: [[2, 3], [3, 2]] });
    const prices = makePrices({ 2: 10, 3: 50 });
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 20, prices);
    expect(list.lines).toEqual([
      { itemId: 2, quantity: 60, unitPrice: 10, lineCost: 600 },
      { itemId: 3, quantity: 40, unitPrice: 50, lineCost: 2000 },
    ]);
    expect(list.totalCost).toBe(2600);
    expect(list.unknownCount).toBe(0);
  });

  it('agrège une même ressource venant de plusieurs branches', () => {
    // 1 ← 2×P(10) + 1×Q(11) ; P ← 3×W(20) ; Q ← 5×W — W partout
    const graph = makeGraph({ 1: [[10, 2], [11, 1]], 10: [[20, 3]], 11: [[20, 5]] });
    const prices = makePrices({ 20: 1 });
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 2, prices);
    expect(list.lines).toEqual([{ itemId: 20, quantity: 2 * (2 * 3 + 5), unitPrice: 1, lineCost: 22 }]);
  });

  it('un ingrédient acheté (auto) est une feuille : on ne descend pas dedans', () => {
    const graph = makeGraph({ 1: [[10, 2]], 10: [[20, 3]] });
    // P acheté 2, crafté 3×1=3 → auto achète P
    const prices = makePrices({ 10: 2, 20: 1 });
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 1, prices);
    expect(list.lines).toEqual([{ itemId: 10, quantity: 2, unitPrice: 2, lineCost: 4 }]);
  });

  it('prix inconnu → coût total indéterminé mais quantités exactes', () => {
    const graph = makeGraph({ 1: [[2, 4], [3, 1]] });
    const prices = makePrices({ 2: 10 });
    const { root } = analyzeCraftCost(graph, prices, 1);
    const list = buildShoppingList(root, 5, prices);
    expect(list.lines).toEqual([
      { itemId: 2, quantity: 20, unitPrice: 10, lineCost: 200 },
      { itemId: 3, quantity: 5, unitPrice: null, lineCost: null },
    ]);
    expect(list.totalCost).toBeNull();
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
    expect(list.lines).toEqual([{ itemId: 20, quantity: 6, unitPrice: null, lineCost: null }]);
  });
});
