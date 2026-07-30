// Petits constructeurs de graphes et de carnets de prix pour les tests.

import type { PriceBook, RecipeGraph, RecipeInfo } from './types.ts';

/** makeGraph({ 1: [[2, 3]] }) : l'objet 1 se craft avec 3 exemplaires de l'objet 2. */
export function makeGraph(recipes: Record<number, ReadonlyArray<readonly [number, number]>>): RecipeGraph {
  const graph = new Map<number, RecipeInfo>();
  for (const [id, ingredients] of Object.entries(recipes)) {
    graph.set(Number(id), { ingredients, jobId: null, level: null });
  }
  return graph;
}

/** makePrices({ 2: 10 }) : l'objet 2 vaut 10 kamas l'unité. */
export function makePrices(prices: Record<number, number>): PriceBook {
  return new Map(Object.entries(prices).map(([id, price]) => [Number(id), price]));
}
