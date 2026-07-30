import { describe, expect, it } from 'vitest';
import { analyzeCraftCost, createCostAnalyzer, type SourcingMode } from './costing.ts';
import { makeGraph, makePrices } from './test-helpers.ts';

describe('coût simple', () => {
  it('additionne quantité × prix unitaire', () => {
    const graph = makeGraph({ 1: [[2, 3], [3, 2]] });
    const prices = makePrices({ 2: 10, 3: 50 });
    const { root } = analyzeCraftCost(graph, prices, 1);
    expect(root.craftUnitCost).toBe(3 * 10 + 2 * 50);
    expect(root.unitCost).toBe(130);
    expect(root.source).toBe('craft');
    expect(root.missingPrices).toEqual([]);
    expect(root.children).toHaveLength(2);
  });

  it('un objet sans recette ne peut être que acheté', () => {
    const graph = makeGraph({});
    const { root } = analyzeCraftCost(graph, makePrices({ 7: 42 }), 7);
    expect(root.craftable).toBe(false);
    expect(root.craftUnitCost).toBeNull();
    expect(root.unitCost).toBe(42);
    expect(root.source).toBe('buy');
  });
});

describe('imbrication', () => {
  it('résout les recettes intermédiaires en profondeur', () => {
    // épée(1) ← 2 planches(10) ; planche ← 3 bois(20) ; bois à 5 kamas
    const graph = makeGraph({ 1: [[10, 2]], 10: [[20, 3]] });
    const { root } = analyzeCraftCost(graph, makePrices({ 20: 5 }), 1);
    expect(root.craftUnitCost).toBe(2 * (3 * 5));
    const plank = root.children[0]!.node;
    expect(plank.source).toBe('craft'); // pas de prix d'achat → craft
    expect(plank.unitCost).toBe(15);
    expect(plank.children[0]!.node.unitCost).toBe(5);
  });

  it('gère 4 niveaux d\'imbrication', () => {
    const graph = makeGraph({ 1: [[2, 2]], 2: [[3, 2]], 3: [[4, 2]], 4: [[5, 2]] });
    const { root } = analyzeCraftCost(graph, makePrices({ 5: 1 }), 1);
    expect(root.craftUnitCost).toBe(16); // 2^4
  });
});

describe('prix inconnus', () => {
  it('un prix manquant rend le coût indéterminé, jamais 0', () => {
    const graph = makeGraph({ 1: [[2, 1], [3, 1]] });
    const { root } = analyzeCraftCost(graph, makePrices({ 2: 100 }), 1);
    expect(root.craftUnitCost).toBeNull();
    expect(root.unitCost).toBeNull();
    expect(root.source).toBe('unknown');
    expect(root.missingPrices).toEqual([3]);
  });

  it('remonte tous les prix manquants des sous-arbres', () => {
    const graph = makeGraph({ 1: [[10, 1], [11, 1]], 10: [[20, 1]], 11: [[21, 1]] });
    const { root } = analyzeCraftCost(graph, makePrices({}), 1);
    expect([...root.missingPrices].sort()).toEqual([10, 11, 20, 21].sort());
  });

  it('en auto, un coût connu bat un coût inconnu', () => {
    // l'ingrédient 10 est craftable mais son sous-prix manque ; son prix d'achat est connu
    const graph = makeGraph({ 1: [[10, 1]], 10: [[20, 1]] });
    const { root } = analyzeCraftCost(graph, makePrices({ 10: 30 }), 1);
    expect(root.craftUnitCost).toBe(30);
    expect(root.children[0]!.node.source).toBe('buy');
    expect(root.missingPrices).toEqual([]);
  });
});

describe('arbitrage acheter / crafter', () => {
  const graph = makeGraph({ 1: [[10, 1]], 10: [[20, 2]] });

  it('auto choisit le moins cher des deux coûts connus', () => {
    // craft de 10 : 2 × 40 = 80
    const cheapBuy = analyzeCraftCost(graph, makePrices({ 10: 70, 20: 40 }), 1).root;
    expect(cheapBuy.children[0]!.node.source).toBe('buy');
    expect(cheapBuy.craftUnitCost).toBe(70);

    const cheapCraft = analyzeCraftCost(graph, makePrices({ 10: 95, 20: 40 }), 1).root;
    expect(cheapCraft.children[0]!.node.source).toBe('craft');
    expect(cheapCraft.craftUnitCost).toBe(80);
  });

  it('à égalité, auto achète', () => {
    const { root } = analyzeCraftCost(graph, makePrices({ 10: 80, 20: 40 }), 1);
    expect(root.children[0]!.node.source).toBe('buy');
  });

  it('expose l\'économie du craft (positive ou négative)', () => {
    const { root } = analyzeCraftCost(graph, makePrices({ 10: 95, 20: 40 }), 1);
    expect(root.children[0]!.node.craftSavings).toBe(95 - 80);
    const { root: worse } = analyzeCraftCost(graph, makePrices({ 10: 70, 20: 40 }), 1);
    expect(worse.children[0]!.node.craftSavings).toBe(70 - 80);
  });

  it('respecte les modes forcés', () => {
    const modes = new Map<number, SourcingMode>([[10, 'craft']]);
    const forced = analyzeCraftCost(graph, makePrices({ 10: 70, 20: 40 }), 1, { modes }).root;
    expect(forced.children[0]!.node.source).toBe('craft');
    expect(forced.craftUnitCost).toBe(80);

    const modesBuy = new Map<number, SourcingMode>([[10, 'buy']]);
    const forcedBuy = analyzeCraftCost(graph, makePrices({ 10: 95, 20: 40 }), 1, { modes: modesBuy }).root;
    expect(forcedBuy.children[0]!.node.source).toBe('buy');
    expect(forcedBuy.craftUnitCost).toBe(95);
  });

  it('mode craft forcé sans prix des ingrédients → indéterminé (pas de repli caché)', () => {
    const modes = new Map<number, SourcingMode>([[10, 'craft']]);
    const { root } = analyzeCraftCost(graph, makePrices({ 10: 70 }), 1, { modes });
    expect(root.craftUnitCost).toBeNull();
    expect(root.missingPrices).toEqual([20]);
  });
});

describe('cycles', () => {
  it('ne boucle jamais sur un cycle A ↔ B et coupe la branche', () => {
    const graph = makeGraph({ 1: [[2, 1]], 2: [[1, 1]] });
    const { root } = analyzeCraftCost(graph, makePrices({}), 1);
    expect(root.craftUnitCost).toBeNull();
    const b = root.children[0]!.node;
    const aCut = b.children[0]!.node;
    expect(aCut.cycle).toBe(true);
    expect(aCut.children).toHaveLength(0);
  });

  it('un cycle coupé retombe sur le prix d\'achat s\'il est connu', () => {
    const graph = makeGraph({ 1: [[2, 1]], 2: [[1, 1]] });
    const { root } = analyzeCraftCost(graph, makePrices({ 1: 100 }), 1);
    // crafter 1 = crafter 2 = acheter 1 à 100
    expect(root.craftUnitCost).toBe(100);
  });

  it('gère l\'auto-cycle (une recette qui se référence elle-même)', () => {
    const graph = makeGraph({ 3: [[3, 2]] });
    const { root } = analyzeCraftCost(graph, makePrices({ 3: 10 }), 3);
    expect(root.craftUnitCost).toBe(20);
    expect(root.children[0]!.node.cycle).toBe(true);
  });

  it('le coût dépend du point d\'entrée dans le cycle (pas d\'empoisonnement du cache)', () => {
    // A(1) ← 2×B(2) ; B ← 1×A ; achat : A=100, B=1000
    const graph = makeGraph({ 1: [[2, 2]], 2: [[1, 1]] });
    const prices = makePrices({ 1: 100, 2: 1000 });
    const analyzer = createCostAnalyzer(graph, prices);
    // racine A : B se craft depuis A acheté (100) → craft A = 2 × 100
    expect(analyzer.analyze(1).craftUnitCost).toBe(200);
    // racine B (même analyseur, cache partagé) : A s'achète à 100 → craft B = 100
    expect(analyzer.analyze(2).craftUnitCost).toBe(100);
    // et dans l'ordre inverse avec un analyseur neuf
    const fresh = createCostAnalyzer(graph, prices);
    expect(fresh.analyze(2).craftUnitCost).toBe(100);
    expect(fresh.analyze(1).craftUnitCost).toBe(200);
  });
});

describe('profondeur maximale', () => {
  const chain = makeGraph({ 1: [[2, 1]], 2: [[3, 1]], 3: [[4, 1]] });

  it('coupe l\'expansion et retombe sur l\'achat', () => {
    const prices = makePrices({ 3: 100, 4: 7 });
    const depth2 = analyzeCraftCost(chain, prices, 1, { maxDepth: 2 }).root;
    // 1 → 2 → 3 (coupé) : 3 acheté à 100
    expect(depth2.craftUnitCost).toBe(100);
    const cut = depth2.children[0]!.node.children[0]!.node;
    expect(cut.depthLimited).toBe(true);
    expect(cut.source).toBe('buy');

    const depth3 = analyzeCraftCost(chain, prices, 1, { maxDepth: 3 }).root;
    expect(depth3.craftUnitCost).toBe(7);
  });

  it('maxDepth 0 : la racine elle-même ne peut pas être expansée', () => {
    const { root } = analyzeCraftCost(chain, makePrices({ 1: 55 }), 1, { maxDepth: 0 });
    expect(root.depthLimited).toBe(true);
    expect(root.craftUnitCost).toBeNull();
    expect(root.children).toHaveLength(0);
  });
});

describe('mémoïsation', () => {
  it('calcule chaque nœud une seule fois (graphe en diamant)', () => {
    const graph = makeGraph({ 1: [[2, 1], [3, 1]], 2: [[4, 1]], 3: [[4, 1]] });
    const { root, stats } = analyzeCraftCost(graph, makePrices({ 4: 5 }), 1);
    expect(root.craftUnitCost).toBe(10);
    expect(stats.nodesComputed).toBe(4); // 1, 2, 3, 4 — pas 5
    expect(stats.cacheHits).toBe(1); // le second 4
  });

  it('réutilise le cache entre deux analyses du même analyseur', () => {
    const graph = makeGraph({ 1: [[10, 1]], 2: [[10, 1]], 10: [[20, 4]] });
    const analyzer = createCostAnalyzer(graph, makePrices({ 20: 3 }));
    expect(analyzer.analyze(1).craftUnitCost).toBe(12);
    const before = analyzer.stats.nodesComputed;
    expect(analyzer.analyze(2).craftUnitCost).toBe(12);
    // seule la racine 2 a dû être calculée (10 est en cache à cette profondeur)
    expect(analyzer.stats.nodesComputed).toBe(before + 1);
  });
});
