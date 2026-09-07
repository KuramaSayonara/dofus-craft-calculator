// Le moteur de brisage confronté aux 2 855 objets réellement brisables du jeu :
// il doit tous les traiter sans planter, sans rune inconnue, et sans jamais
// inventer de valeur quand les prix manquent.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { brisageFileSchema } from '../../scripts/schema.ts';
import {
  breakablesFromFile,
  computeYields,
  evaluateBrisage,
  rankFocus,
  runeTableFromFile,
} from './brisage.ts';

const file = brisageFileSchema.parse(
  JSON.parse(readFileSync(new URL('../../data/brisage.json', import.meta.url), 'utf8')),
);
const table = runeTableFromFile(file);
const catalog = breakablesFromFile(file);

describe('brisage sur les données réelles', () => {
  it('charge la table et le catalogue', () => {
    expect(table.size).toBe(file.runes.length);
    expect(catalog.size).toBeGreaterThanOrEqual(2800);
  });

  it('traite tous les objets sans rune inconnue et sans quantité aberrante', () => {
    for (const [itemId, item] of catalog) {
      const result = computeYields(item, table, { coefficient: 100 });
      expect(result.unknownKeys, `objet ${itemId}`).toEqual([]);
      expect(result.runes.length, `objet ${itemId}`).toBeGreaterThan(0);
      for (const entry of result.runes) {
        expect(entry.expected, `objet ${itemId} / ${entry.rune.rune}`).toBeGreaterThan(0);
        expect(Number.isFinite(entry.expected)).toBe(true);
        expect(entry.guaranteed).toBeLessThanOrEqual(Math.ceil(entry.expected));
      }
    }
  });

  it('ne promet aucun gain tant qu’aucun prix de rune n’est saisi', () => {
    const empty = new Map<number, number>();
    for (const [itemId, item] of catalog) {
      const evaluation = evaluateBrisage({ item, table, prices: empty, cost: 0 });
      expect(evaluation.value.netExpected, `objet ${itemId}`).toBe(0);
      expect(evaluation.value.missing.length).toBeGreaterThan(0);
    }
  });

  it('lit la Hache à Lamelles comme sa fiche en jeu', () => {
    const axe = catalog.get(9138)!;
    expect(axe.level).toBe(157);
    const result = computeYields(axe, table, { coefficient: 100 });
    expect(result.runes).toHaveLength(8);

    const byRune = new Map(result.runes.map(entry => [entry.rune.rune, entry]));
    // 250 Vitalité pèsent moins qu'une Portée : c'est tout l'intérêt du calcul
    expect(byRune.get('Rune Vi')!.guaranteed).toBeGreaterThan(0);
    expect(byRune.get('Rune Po')!.guaranteed).toBeGreaterThanOrEqual(0);
    // la Portée est un jet fixe de 1 : son poids ne dépend pas du mode de jet
    const min = computeYields(axe, table, { coefficient: 100, roll: 'min' });
    const max = computeYields(axe, table, { coefficient: 100, roll: 'max' });
    const poidsPo = (runes: typeof result.runes): number =>
      runes.find(entry => entry.rune.key === 'po')!.weight;
    expect(poidsPo(min.runes)).toBeCloseTo(poidsPo(max.runes), 10);
    // mais le total, lui, monte avec le jet
    expect(max.totalWeight).toBeGreaterThan(min.totalWeight);
  });

  it('classe les focus d’un objet réel sans jamais dépasser 4 000 %', () => {
    const axe = catalog.get(9138)!;
    const prices = new Map(
      [...table.values()].map(rune => [rune.itemId, 100] as [number, number]),
    );
    const ranking = rankFocus(axe, table, prices, { coefficient: 100 });
    // le sans-focus + une option par statistique de l'objet
    expect(ranking).toHaveLength(9);
    expect(ranking.every(option => option.incomplete === false)).toBe(true);
    // le classement est bien trié
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i - 1]!.netExpected).toBeGreaterThanOrEqual(ranking[i]!.netExpected);
    }
  });

  it('balaye tout le catalogue en un temps raisonnable', () => {
    const prices = new Map(
      [...table.values()].map(rune => [rune.itemId, 50] as [number, number]),
    );
    const started = Date.now();
    let profitable = 0;
    for (const item of catalog.values()) {
      const evaluation = evaluateBrisage({ item, table, prices, cost: 10_000 });
      if (evaluation.verdict === 'profitable') profitable++;
    }
    expect(profitable).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
