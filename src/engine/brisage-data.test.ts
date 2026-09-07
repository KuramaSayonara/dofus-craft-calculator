// Contrôles sur les VRAIES données de brisage (data/brisage.json) :
// la table des runes et les lignes brisables doivent être cohérentes avec le
// catalogue d'objets, sans quoi tous les calculs de brisage seraient faux.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { brisageFileSchema, itemRecordSchema } from '../../scripts/schema.ts';
import { BREAKABLE_TYPES } from '../../scripts/runes.ts';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), 'utf8'));

const file = brisageFileSchema.parse(read('brisage.json'));
const items = new Map(
  (read('items.json') as unknown[])
    .map(raw => itemRecordSchema.parse(raw))
    .map(item => [item.id, item] as const),
);

describe('données de brisage', () => {
  it('couvre une bonne part des équipements du jeu', () => {
    expect(file.runes.length).toBeGreaterThanOrEqual(50);
    expect(Object.keys(file.items).length).toBeGreaterThanOrEqual(2000);
  });

  it('ne référence que des runes existantes dans le catalogue', () => {
    for (const rune of file.runes) {
      const basic = items.get(rune.b);
      expect(basic, `rune de base ${rune.r} (id ${rune.b})`).toBeDefined();
      expect(basic!.name).toBe(rune.r);
      for (const id of [rune.pa, rune.ra]) {
        if (id !== null) expect(items.get(id), `rune ${id}`).toBeDefined();
      }
    }
  });

  it('n’utilise que des clés de rune déclarées', () => {
    const keys = new Set(file.runes.map(rune => rune.k));
    for (const [itemId, record] of Object.entries(file.items)) {
      for (const [key] of record.l) {
        expect(keys.has(key), `objet ${itemId} : clé « ${key} » inconnue`).toBe(true);
      }
    }
  });

  it('ne retient que des objets brisables, avec des jets cohérents', () => {
    for (const [itemId, record] of Object.entries(file.items)) {
      const item = items.get(Number(itemId));
      expect(item, `objet ${itemId} absent du catalogue`).toBeDefined();
      expect(BREAKABLE_TYPES.has(item!.type), `${item!.name} : type ${item!.type}`).toBe(true);
      expect(record.lv).toBe(item!.level);
      for (const [key, min, max] of record.l) {
        expect(min, `${item!.name} / ${key}`).toBeGreaterThan(0);
        expect(max, `${item!.name} / ${key}`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('exclut les Dofus, trophées, familiers et montures', () => {
    for (const itemId of Object.keys(file.items)) {
      const type = items.get(Number(itemId))!.type;
      expect(['Dofus', 'Trophée', 'Prysmaradite', 'Familier', 'Montilier', 'Dragodinde']).not.toContain(type);
    }
  });

  it('lit correctement une épée connue (Épée de Boisaille)', () => {
    // Sur la fiche : « 8 à 10 dommages Neutre », « 7 à 10 Force », « 1 Dommage Terre ».
    // Les dégâts de l'arme ne donnent pas de runes ; la Force garde son
    // intervalle, et le Dommage Terre est un jet FIXE de 1 (pas de fourchette).
    const sword = file.items['44'];
    expect(sword).toBeDefined();
    expect(sword!.lv).toBe(7);
    expect(sword!.l).toEqual([
      ['fo', 7, 10],
      ['doterre', 1, 1],
    ]);
  });

  it('compte une arme de chasse comme un jet de 1', () => {
    // La Triste Lame porte le drapeau « Arme de chasse » (ligne sans valeur)
    const blade = file.items['58'];
    expect(blade).toBeDefined();
    expect(blade!.l.some(([key, min, max]) => key === 'chasse' && min === 1 && max === 1)).toBe(true);
  });

  it('donne à chaque rune un poids et un jet strictement positifs', () => {
    for (const rune of file.runes) {
      expect(rune.w).toBeGreaterThan(0);
      expect(rune.g).toBeGreaterThanOrEqual(1);
    }
  });
});
