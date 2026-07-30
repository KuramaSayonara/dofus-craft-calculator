import { describe, expect, it } from 'vitest';
import type { SearchEntry } from './data.ts';
import { normalizeText, prepareIndex, searchItems } from './search.ts';

const entry = (id: number, n: string, r: 0 | 1 = 1): SearchEntry => ({
  id,
  n,
  l: 10,
  t: 'Épée',
  c: 'equipment',
  i: null,
  r,
});

const index = prepareIndex([
  entry(1, 'Épée du Dus'),
  entry(2, 'Épée de Boisaille'),
  entry(3, 'Marteau du Dus'),
  entry(4, 'Dagues du Crépuscule', 0),
  entry(5, 'Épée'),
]);

describe('normalizeText', () => {
  it('retire accents et casse', () => {
    expect(normalizeText('Épée du Dus')).toBe('epee du dus');
    expect(normalizeText('CRÂNE brûlé')).toBe('crane brule');
  });
});

describe('searchItems', () => {
  it('« epee dus » trouve « Épée du Dus »', () => {
    const results = searchItems(index, 'epee dus');
    expect(results[0]!.n).toBe('Épée du Dus');
  });

  it('ignore l\'ordre des jetons', () => {
    expect(searchItems(index, 'dus epee')[0]!.n).toBe('Épée du Dus');
  });

  it('est insensible à la casse', () => {
    expect(searchItems(index, 'ÉPÉE BOISAILLE')[0]!.n).toBe('Épée de Boisaille');
  });

  it('préfère le nom exact le plus court', () => {
    expect(searchItems(index, 'epee')[0]!.n).toBe('Épée');
  });

  it('filtre les non-craftables sur demande', () => {
    expect(searchItems(index, 'dagues').map(e => e.id)).toEqual([4]);
    expect(searchItems(index, 'dagues', { craftableOnly: true })).toEqual([]);
  });

  it('requête vide → aucun résultat', () => {
    expect(searchItems(index, '   ')).toEqual([]);
  });

  it('respecte la limite', () => {
    expect(searchItems(index, 'du', { limit: 2 })).toHaveLength(2);
  });
});
