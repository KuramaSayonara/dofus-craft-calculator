// Le moteur de brisage, vérifié sur des cas calculés à la main.
//
// Objet témoin : niveau 100, une ligne Force à 50 et une ligne Vitalité à 200.
//   poids Force    = 50 × 1   × 100 × 0,015 + 1 = 76
//   poids Vitalité = 200 × 0,2 × 100 × 0,015 + 1 = 61
// Une Rune Fo pèse 1 (poids 1 × jet 1), une Rune Vi pèse 1 aussi
// (poids 0,2 × jet 5) : à 100 %, l'objet rend 76 Rune Fo et 61 Rune Vi.

import { describe, expect, it } from 'vitest';
import {
  computeYields,
  evaluateBrisage,
  minCoefficient,
  rankFocus,
  rollOf,
  runeWeight,
  valueOfYields,
  type BreakableItem,
  type RuneInfo,
  type RuneTable,
} from './brisage.ts';

const FO: RuneInfo = {
  key: 'fo', label: 'Force', rune: 'Rune Fo',
  weight: 1, grant: 1, itemId: 1519, paItemId: 1545, raItemId: 1551,
};
const VI: RuneInfo = {
  key: 'vi', label: 'Vitalité', rune: 'Rune Vi',
  weight: 0.2, grant: 5, itemId: 1523, paItemId: 1548, raItemId: 1554,
};
const CRI: RuneInfo = {
  key: 'cri', label: '% Critique', rune: 'Rune Cri',
  weight: 10, grant: 1, itemId: 7433, paItemId: null, raItemId: null,
};

const table: RuneTable = new Map([
  [FO.key, FO],
  [VI.key, VI],
  [CRI.key, CRI],
]);

const item: BreakableItem = {
  level: 100,
  lines: [
    { key: 'fo', min: 50, max: 50 },
    { key: 'vi', min: 200, max: 200 },
  ],
};

const priceOf = (entries: Array<[number, number]>): Map<number, number> => new Map(entries);

describe('poids des runes', () => {
  it('tient compte du jet donné par la rune', () => {
    expect(runeWeight(FO)).toBe(1); // 1 point, +1 par rune
    expect(runeWeight(VI)).toBeCloseTo(1, 10); // 0,2 × 5 points
    expect(runeWeight(CRI)).toBe(10);
  });
});

describe('jets retenus', () => {
  const line = { key: 'fo', min: 10, max: 20 };

  it('prend la moyenne par défaut', () => {
    expect(rollOf(line)).toBe(15);
  });

  it('sait prendre le pire et le meilleur cas', () => {
    expect(rollOf(line, { roll: 'min' })).toBe(10);
    expect(rollOf(line, { roll: 'max' })).toBe(20);
  });

  it('laisse la main à un jet saisi, sans dépasser le maximum du jeu', () => {
    expect(rollOf(line, { roll: 'min', customRolls: new Map([['fo', 18]]) })).toBe(18);
    expect(rollOf(line, { customRolls: new Map([['fo', 999]]) })).toBe(20);
  });
});

describe('runes obtenues', () => {
  it('applique la formule ligne par ligne à 100 %', () => {
    const result = computeYields(item, table, { coefficient: 100 });
    const fo = result.runes.find(entry => entry.rune.key === 'fo')!;
    const vi = result.runes.find(entry => entry.rune.key === 'vi')!;
    expect(fo.guaranteed).toBe(76);
    expect(fo.chance).toBeCloseTo(0, 10);
    expect(vi.guaranteed).toBe(61);
    expect(result.totalWeight).toBeCloseTo(137, 10);
  });

  it('monte proportionnellement avec le coefficient', () => {
    const result = computeYields(item, table, { coefficient: 200 });
    const fo = result.runes.find(entry => entry.rune.key === 'fo')!;
    expect(fo.expected).toBeCloseTo(152, 10);
  });

  it('sépare les runes acquises de la probabilité d’en avoir une de plus', () => {
    // 76 × 1,10 = 83,6 → 83 runes sûres, 60 % de chances d'une 84e
    const result = computeYields(item, table, { coefficient: 110 });
    const fo = result.runes.find(entry => entry.rune.key === 'fo')!;
    expect(fo.guaranteed).toBe(83);
    expect(fo.chance).toBeCloseTo(0.6, 8);
    expect(fo.expected).toBeCloseTo(83.6, 8);
  });

  it('accepte un coefficient propre à une rune', () => {
    const result = computeYields(item, table, {
      coefficient: 100,
      coefficients: new Map([['vi', 200]]),
    });
    expect(result.runes.find(entry => entry.rune.key === 'fo')!.expected).toBeCloseTo(76, 10);
    expect(result.runes.find(entry => entry.rune.key === 'vi')!.expected).toBeCloseTo(122, 10);
  });

  it('additionne deux lignes qui donnent la même rune', () => {
    const twin: BreakableItem = {
      level: 100,
      lines: [
        { key: 'fo', min: 50, max: 50 },
        { key: 'fo', min: 50, max: 50 },
      ],
    };
    const result = computeYields(twin, table, { coefficient: 100 });
    expect(result.runes).toHaveLength(1);
    expect(result.runes[0]!.expected).toBeCloseTo(152, 10); // 76 + 76
  });

  it('signale une ligne dont la rune est inconnue au lieu de planter', () => {
    const odd: BreakableItem = { level: 100, lines: [{ key: 'inconnue', min: 5, max: 5 }] };
    const result = computeYields(odd, table);
    expect(result.runes).toHaveLength(0);
    expect(result.unknownKeys).toEqual(['inconnue']);
  });
});

describe('brisage focalisé', () => {
  it('concentre 100 % de la ligne visée et 50 % des autres', () => {
    // 76 + 0,5 × 61 = 106,5 Rune Fo
    const result = computeYields(item, table, { coefficient: 100, focus: 'fo' });
    expect(result.runes).toHaveLength(1);
    expect(result.runes[0]!.rune.key).toBe('fo');
    expect(result.runes[0]!.guaranteed).toBe(106);
    expect(result.runes[0]!.chance).toBeCloseTo(0.5, 8);
  });

  it('rend moins de runes chères quand elles pèsent lourd', () => {
    // focaliser sur le % Critique (poids 10) sur un objet qui n'en a pas :
    // rien à concentrer
    const result = computeYields(item, table, { focus: 'cri' });
    expect(result.runes).toHaveLength(0);
  });
});

describe('valeur en kamas', () => {
  const prices = priceOf([[FO.itemId, 100], [VI.itemId, 10]]);

  it('valorise les runes et retire la taxe de l’hôtel de vente', () => {
    const yields = computeYields(item, table, { coefficient: 100 });
    const value = valueOfYields(yields, prices);
    // 76 × 100 + 61 × 10 = 8 210 bruts, taxe 2 % = 164
    expect(value.grossGuaranteed).toBe(8210);
    expect(value.netGuaranteed).toBe(8046);
  });

  it('compte une rune sans prix pour zéro et la signale', () => {
    const yields = computeYields(item, table, { coefficient: 100 });
    const value = valueOfYields(yields, priceOf([[FO.itemId, 100]]));
    expect(value.grossExpected).toBe(7600); // la Vitalité n'est pas comptée
    expect(value.missing.map(rune => rune.rune)).toEqual(['Rune Vi']);
  });

  it('n’invente jamais de kama : la valeur espérée est tronquée', () => {
    const yields = computeYields(item, table, { coefficient: 110 });
    const value = valueOfYields(yields, priceOf([[FO.itemId, 100]]));
    expect(value.grossExpected).toBe(8360); // 83,6 × 100
    expect(value.grossGuaranteed).toBe(8300); // 83 × 100
  });
});

describe('seuils de rentabilité', () => {
  const prices = priceOf([[FO.itemId, 100]]);
  const base = { item, table, prices, options: { coefficient: 100 } };

  it('donne le prix d’achat plafond', () => {
    // 76 runes × 100 = 7 600 bruts → 7 448 nets : au-delà, briser perd
    const evaluation = evaluateBrisage({ ...base, cost: 5000 });
    expect(evaluation.maxPriceExpected).toBe(7448);
    expect(evaluation.profitExpected).toBe(2448);
    expect(evaluation.verdict).toBe('profitable');
  });

  it('bascule en perte au kama près', () => {
    expect(evaluateBrisage({ ...base, cost: 7448 }).profitExpected).toBe(0);
    expect(evaluateBrisage({ ...base, cost: 7449 }).profitExpected).toBe(-1);
    expect(evaluateBrisage({ ...base, cost: 7449 }).verdict).toBe('loss');
  });

  it('juge « marginal » un gain trop maigre', () => {
    const evaluation = evaluateBrisage({ ...base, cost: 7000 });
    expect(evaluation.marginPctExpected).toBeCloseTo(6.4, 1);
    expect(evaluation.verdict).toBe('marginal');
  });

  it('donne le coefficient plancher, lecture par lecture', () => {
    // à 100 % le net vaut exactement 7 448 : c'est le plancher pour ce coût
    expect(minCoefficient({ ...base, cost: 7448 }, 'expected')).toBe(100);
    // un kama de plus et il faut monter d'un point
    expect(minCoefficient({ ...base, cost: 7449 }, 'expected')).toBe(101);
    // en runes garanties, il faut attendre la 77e rune entière : 102 %
    expect(minCoefficient({ ...base, cost: 7449 }, 'guaranteed')).toBe(102);
  });

  it('renvoie null quand même 4 000 % ne suffirait pas', () => {
    expect(minCoefficient({ ...base, cost: 999_999_999 })).toBeNull();
  });

  it('ignore les coefficients par rune pour répondre « à taux uniforme »', () => {
    const withOverride = {
      ...base,
      options: { coefficient: 100, coefficients: new Map([['fo', 4000]]) },
      cost: 7449,
    };
    expect(minCoefficient(withOverride, 'expected')).toBe(101);
  });
});

describe('choix du focus', () => {
  it('classe le brisage normal et chaque focus par valeur nette', () => {
    // Rune Fo à 100 kamas, Rune Vi à 1 : focaliser sur la Force doit gagner
    const prices = priceOf([[FO.itemId, 100], [VI.itemId, 1]]);
    const ranking = rankFocus(item, table, prices, { coefficient: 100 });
    expect(ranking[0]!.key).toBe('fo');
    expect(ranking[0]!.gainPct).toBeGreaterThan(0);
    expect(ranking.map(option => option.key)).toContain(null); // le sans-focus est là
  });

  it('préfère ne pas focaliser quand la rune visée ne vaut rien', () => {
    const prices = priceOf([[FO.itemId, 1], [VI.itemId, 100]]);
    const ranking = rankFocus(item, table, prices, { coefficient: 100 });
    expect(ranking[0]!.key).toBe('vi');
    const none = ranking.find(option => option.key === null)!;
    const worst = ranking[ranking.length - 1]!;
    expect(worst.key).toBe('fo');
    expect(none.netExpected).toBeGreaterThan(worst.netExpected);
  });

  it('n’annonce aucun écart tant que la référence est incomplète', () => {
    // comparer à un « sans focus » amputé de 2 prix donnerait des « +1500 % »
    const ranking = rankFocus(item, table, priceOf([[FO.itemId, 100]]), { coefficient: 100 });
    expect(ranking.every(option => option.gainPct === null)).toBe(true);
  });

  it('marque une option incomplète tant qu’un prix manque', () => {
    const ranking = rankFocus(item, table, priceOf([[FO.itemId, 100]]), { coefficient: 100 });
    expect(ranking.find(option => option.key === null)!.incomplete).toBe(true);
    expect(ranking.find(option => option.key === 'fo')!.incomplete).toBe(false);
  });
});
