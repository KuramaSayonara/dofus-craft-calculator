import { describe, expect, it } from 'vitest';
import { scanCrafts } from './topcrafts.ts';
import { makeGraph, makePrices } from './test-helpers.ts';

describe('balayage des crafts', () => {
  it('évalue chaque craft avec le carnet de prix', () => {
    const graph = makeGraph({ 1: [[2, 2]], 3: [[2, 1], [4, 1]] });
    // prix : ingrédient 2 connu, ingrédient 4 inconnu, prix marché de 1 connu
    const prices = makePrices({ 1: 50, 2: 10 });
    const { rows } = scanCrafts(graph, prices, { taxRate: 0.02 });
    expect(rows).toHaveLength(2);

    const row1 = rows.find(r => r.itemId === 1)!;
    expect(row1.craftCost).toBe(20);
    expect(row1.missingPrices).toEqual([]);
    expect(row1.salePrice).toBe(50);
    expect(row1.profit).toBe(49 - 20); // taxe sur 50 = 1
    expect(row1.marginPct).toBeCloseTo(145);
    expect(row1.breakEven).toBe(20); // net(20) = 20 (taxe 0.4 → 0)

    const row3 = rows.find(r => r.itemId === 3)!;
    expect(row3.craftCost).toBeNull();
    expect(row3.missingPrices).toEqual([4]);
    expect(row3.salePrice).toBeNull();
    expect(row3.profit).toBeNull();
    expect(row3.breakEven).toBeNull();
  });

  it('compte les prix manquants des crafts presque calculables', () => {
    const graph = makeGraph({ 1: [[2, 1], [3, 1], [4, 1]] });
    const { rows } = scanCrafts(graph, makePrices({ 2: 5 }), {});
    expect([...rows[0]!.missingPrices].sort()).toEqual([3, 4]);
  });

  it('propage métier et niveau depuis le graphe', () => {
    const graph = new Map([[1, { ingredients: [[2, 1]] as const, jobId: 11, level: 42 }]]);
    const { rows } = scanCrafts(graph, makePrices({ 2: 1 }), {});
    expect(rows[0]!.jobId).toBe(11);
    expect(rows[0]!.craftLevel).toBe(42);
  });
});
