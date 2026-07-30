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

describe('filtres cumulables', () => {
  const richIndex = prepareIndex([
    { id: 1, n: 'Épée du Dus', l: 40, t: 'Épée', c: 'equipment', i: null, r: 1, j: 11 },
    { id: 2, n: 'Marteau Réel', l: 40, t: 'Marteau', c: 'equipment', i: null, r: 1, j: 11 },
    { id: 3, n: 'Épée Basse', l: 10, t: 'Épée', c: 'equipment', i: null, r: 1, j: 27 },
    { id: 4, n: 'Bois Rond', l: 1, t: 'Bois', c: 'resources', i: null, r: 0 },
  ]);

  it('filtre par type', () => {
    expect(searchItems(richIndex, 'epee', { type: 'Épée' }).map(e => e.id)).toEqual([3, 1]);
    expect(searchItems(richIndex, 'reel', { type: 'Épée' })).toEqual([]);
  });

  it('filtre par plage de niveaux', () => {
    expect(searchItems(richIndex, 'epee', { levelMin: 20 }).map(e => e.id)).toEqual([1]);
    expect(searchItems(richIndex, 'epee', { levelMax: 20 }).map(e => e.id)).toEqual([3]);
  });

  it('filtre par métier', () => {
    expect(searchItems(richIndex, 'epee', { jobId: 27 }).map(e => e.id)).toEqual([3]);
  });

  it('filtre les objets réclamés par une quête', () => {
    const quested = prepareIndex([
      { id: 140, n: 'Bâton de Boisaille', l: 9, t: 'Bâton', c: 'equipment', i: null, r: 1, qn: 10 },
      { id: 44, n: 'Épée de Boisaille', l: 7, t: 'Épée', c: 'equipment', i: null, r: 1 },
    ]);
    expect(searchItems(quested, 'boisaille').map(e => e.id).sort((a, b) => a - b)).toEqual([44, 140]);
    expect(searchItems(quested, 'boisaille', { questDemandedOnly: true }).map(e => e.id)).toEqual([140]);
    // utilisable seul, sans requête texte
    expect(searchItems(quested, '', { questDemandedOnly: true }).map(e => e.id)).toEqual([140]);
  });

  it('sans requête, les filtres permettent de parcourir le catalogue', () => {
    expect(searchItems(richIndex, '', { type: 'Épée' }).map(e => e.id).sort()).toEqual([1, 3]);
    expect(searchItems(richIndex, '', { jobId: 11, levelMin: 30 })).toHaveLength(2);
    // sans requête ni filtre : rien (le « craftable seulement » ne suffit pas)
    expect(searchItems(richIndex, '', { craftableOnly: true })).toEqual([]);
  });
});
