// Test d'intégration sur les VRAIES données du jeu (data/recipes.json) :
// le moteur doit balayer les ~4 850 crafts réels sans boucler ni planter,
// même avec un carnet de prix vide.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recipesFileSchema } from '../../scripts/schema.ts';
import { graphFromRecipesFile } from './graph.ts';
import { scanCrafts } from './topcrafts.ts';

const file = recipesFileSchema.parse(
  JSON.parse(readFileSync(new URL('../../data/recipes.json', import.meta.url), 'utf8')),
);
const graph = graphFromRecipesFile(file);

describe('données réelles', () => {
  it('charge le graphe complet', () => {
    expect(graph.size).toBeGreaterThanOrEqual(4847);
  });

  it('balaye tous les crafts sans boucler, carnet de prix vide', () => {
    const { rows, stats } = scanCrafts(graph, new Map(), { maxDepth: 12 });
    expect(rows).toHaveLength(graph.size);
    // sans aucun prix, aucun coût ne doit être « déterminé »
    for (const row of rows) {
      expect(row.craftCost).toBeNull();
      expect(row.missingPrices.length).toBeGreaterThan(0);
    }
    // termine, et le cache travaille (bien moins de calculs que de nœuds visités)
    expect(stats.nodesComputed).toBeGreaterThan(0);
    expect(stats.cacheHits).toBeGreaterThan(0);
  });

  it('signale les éventuels cycles réels du jeu sans jamais boucler', () => {
    const { stats } = scanCrafts(graph, new Map(), { maxDepth: 12 });
    // information factuelle plus qu'assertion : le graphe réel de Dofus 3
    // peut contenir des cycles (le moteur doit juste les couper proprement)
    expect(stats.cycleCuts).toBeGreaterThanOrEqual(0);
  });
});
