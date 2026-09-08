// Lecture d'une capture de l'hôtel de vente.
//
// Le cas de référence est une vraie capture fournie par l'utilisateur :
// 8 runes, colonnes Nom / Niveau / Prix moyen, sous-titre « Rune de forgemagie »
// répété sous chaque nom.

import { describe, expect, it } from 'vitest';
import {
  editDistance,
  joinThousands,
  normalize,
  parseRunePrices,
  readNumberTokens,
  type RuneCatalogEntry,
} from './rune-ocr.ts';

// extrait réel du catalogue du jeu (id, nom, niveau)
const catalog: RuneCatalogEntry[] = [
  { id: 10057, name: 'Rune de chasse', level: 10 },
  { id: 7508, name: 'Rune de Signature', level: 100 },
  { id: 1523, name: 'Rune Vi', level: 1 },
  { id: 11639, name: 'Rune Tac', level: 55 },
  { id: 7434, name: 'Rune So', level: 80 },
  { id: 1521, name: 'Rune Sa', level: 15 },
  { id: 7455, name: 'Rune Ré Terre', level: 30 },
  { id: 11651, name: 'Rune Ré Pou', level: 30 },
  { id: 7459, name: 'Rune Ré Per Terre', level: 75 },
  { id: 1519, name: 'Rune Fo', level: 1 },
  { id: 1545, name: 'Rune Pa Fo', level: 5 },
];

/** Ce que la reconnaissance rend sur la capture, une ligne par rangée. */
const CAPTURE = `Nom Niveau Prix moyen
Rune de chasse
Rune de forgemagie 10 15 886
Rune de Signature
Rune de forgemagie 100 2 459
Rune Vi
Rune de forgemagie 1 158
Rune Tac
Rune de forgemagie 55 936
Rune So
Rune de forgemagie 80 631
Rune Sa
Rune de forgemagie 15 355
Rune Ré Terre
Rune de forgemagie 30 394
Rune Ré Pou
Rune de forgemagie 30 244`;

describe('outils de lecture', () => {
  it('normalise sans accents ni ponctuation', () => {
    expect(normalize('Rune Ré Per Terre')).toBe('rune re per terre');
    expect(normalize('  Rune  Vi  ✳ ')).toBe('rune vi');
  });

  it('lit les nombres sans les interpréter', () => {
    expect(readNumberTokens('15 886')).toEqual([15, 886]);
    expect(readNumberTokens('100 2 459')).toEqual([100, 2, 459]);
    expect(readNumberTokens('Rune Vi 936 ✳')).toEqual([936]);
    expect(readNumberTokens('rien ici')).toEqual([]);
  });

  it('recolle un prix écrit avec des espaces de milliers', () => {
    expect(joinThousands([15, 886])).toBe(15_886);
    expect(joinThousands([2, 459])).toBe(2459);
    expect(joinThousands([158])).toBe(158);
    expect(joinThousands([])).toBe(0);
  });

  it('mesure la distance entre deux mots', () => {
    expect(editDistance('rune re pou', 'rune re pau')).toBe(1);
    expect(editDistance('rune vi', 'rune vi')).toBe(0);
    expect(editDistance('rune vi', 'completement autre')).toBeGreaterThan(3);
  });
});

describe('lecture d’une capture de l’hôtel de vente', () => {
  it('retrouve les 8 runes avec leur prix', () => {
    const { rows } = parseRunePrices(CAPTURE, catalog);
    const byName = new Map(rows.map(row => [row.name, row]));
    expect(byName.get('Rune de chasse')!.price).toBe(15_886);
    expect(byName.get('Rune de Signature')!.price).toBe(2459);
    expect(byName.get('Rune Vi')!.price).toBe(158);
    expect(byName.get('Rune Tac')!.price).toBe(936);
    expect(byName.get('Rune So')!.price).toBe(631);
    expect(byName.get('Rune Sa')!.price).toBe(355);
    expect(byName.get('Rune Ré Terre')!.price).toBe(394);
    expect(byName.get('Rune Ré Pou')!.price).toBe(244);
    expect(rows).toHaveLength(8);
  });

  it('juge sûre une ligne dont le niveau confirme le nom', () => {
    const { rows } = parseRunePrices(CAPTURE, catalog);
    expect(rows.every(row => row.confidence === 'sure')).toBe(true);
    expect(rows.every(row => row.readLevel === row.level)).toBe(true);
  });

  it('ne confond pas le sous-titre répété avec un nom de rune', () => {
    const { rows, ignored } = parseRunePrices('Rune de forgemagie\nRune de forgemagie', catalog);
    expect(rows).toHaveLength(0);
    expect(ignored).toHaveLength(0);
  });

  it('ne confond pas « Ré Terre » avec « Ré Per Terre »', () => {
    const { rows } = parseRunePrices('Rune Ré Per Terre 75 1 200\nRune Ré Terre 30 394', catalog);
    expect(rows.map(row => row.name)).toEqual(['Rune Ré Per Terre', 'Rune Ré Terre']);
    expect(rows[0]!.price).toBe(1200);
    expect(rows[1]!.price).toBe(394);
  });

  it('rattrape une faute de lecture sur le nom, sans prétendre être sûr', () => {
    // « Rune Ré Pau » au lieu de « Rune Ré Pou », niveau correct
    const { rows } = parseRunePrices('Rune Ré Pau 30 244', catalog);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Rune Ré Pou');
    expect(rows[0]!.confidence).toBe('probable');
    expect(rows[0]!.issue).toMatch(/approximativement/);
  });

  it('signale une ligne dont le niveau ne colle pas, et garde le prix', () => {
    // l'hôtel affiche toujours le niveau avant le prix : 99 est pris pour le
    // niveau (mal lu), 355 reste le prix
    const { rows } = parseRunePrices('Rune Sa 99 355', catalog);
    expect(rows[0]!.confidence).toBe('probable');
    expect(rows[0]!.issue).toMatch(/niveau 15 attendu, 99 lu/);
    expect(rows[0]!.price).toBe(355);
    expect(rows[0]!.readLevel).toBe(99);
  });

  it('accepte une ligne sans niveau, en le signalant', () => {
    const { rows } = parseRunePrices('Rune Tac 936', catalog);
    expect(rows[0]!.price).toBe(936);
    expect(rows[0]!.readLevel).toBeNull();
    expect(rows[0]!.issue).toMatch(/aucun lu/);
  });

  it('n’avale pas une ligne parasite dans le prix de la rune précédente', () => {
    // sans garde-fou, « 42 » se collait au prix de la Rune Tac (936 042)
    const { rows, ignored } = parseRunePrices(
      `Rune Tac
Rune de forgemagie 55 936
Bidule inconnu 42`,
      catalog,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.price).toBe(936);
    expect(ignored).toEqual(['Bidule inconnu 42']);
  });

  it('laisse de côté ce qu’il ne comprend pas, et le dit', () => {
    const { rows, ignored } = parseRunePrices('Bidule Machin 42\nRune Vi 1 158', catalog);
    expect(rows).toHaveLength(1);
    expect(ignored).toEqual(['Bidule Machin 42']);
  });

  it('ignore un doublon de défilement plutôt que d’écraser un prix', () => {
    const { rows, ignored } = parseRunePrices('Rune Vi 1 158\nRune Vi 1 158', catalog);
    expect(rows).toHaveLength(1);
    expect(ignored).toHaveLength(1);
  });

  it('ne retient jamais un prix nul', () => {
    const { rows, ignored } = parseRunePrices('Rune Vi 1 0', catalog);
    expect(rows).toHaveLength(0);
    expect(ignored).toHaveLength(1);
  });
});
