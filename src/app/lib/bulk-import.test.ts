import { describe, expect, it } from 'vitest';
import type { SearchEntry } from '../data.ts';
import { prepareIndex } from '../search.ts';
import { buildNameLookup, parseBulkPrices } from './bulk-import.ts';

const entry = (id: number, n: string): SearchEntry => ({
  id,
  n,
  l: 1,
  t: 'Ressource',
  c: 'resources',
  i: null,
  r: 0,
});

const lookup = buildNameLookup(
  prepareIndex([
    entry(303, 'Bois de Frêne'),
    entry(16512, 'Plume Chimérique'),
    entry(900, 'Héritage écailleux'),
    entry(901, 'Héritage écailleux'),
  ]),
);

describe('parseBulkPrices', () => {
  it('importe les lignes valides (accents et suffixes tolérés)', () => {
    const result = parseBulkPrices('bois de frene;12\nPlume Chimérique ; 1.5k\n', lookup);
    expect(result.ok).toEqual([
      { itemId: 303, name: 'Bois de Frêne', price: 12 },
      { itemId: 16512, name: 'Plume Chimérique', price: 1500 },
    ]);
    expect(result.errors).toEqual([]);
  });

  it('rapporte chaque ligne rejetée avec sa raison', () => {
    const result = parseBulkPrices(
      'Bois de Frêne 12\nInconnu;5\nBois de Frêne;abc\nHéritage écailleux;10\n;5\n',
      lookup,
    );
    expect(result.ok).toEqual([]);
    expect(result.errors.map(e => [e.lineNumber, e.reason])).toEqual([
      [1, 'pas de « ; » entre le nom et le prix'],
      [2, 'objet introuvable'],
      [3, 'prix illisible : « abc »'],
      [4, 'nom ambigu (2 objets distincts portent ce nom)'],
      [5, 'nom vide'],
    ]);
  });

  it('ignore les lignes vides', () => {
    const result = parseBulkPrices('\n\nBois de Frêne;10\n\n', lookup);
    expect(result.ok).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });
});
