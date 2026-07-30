import { describe, expect, it } from 'vitest';
import { formatKamas, parseKamas } from './kamas.ts';

describe('parseKamas', () => {
  it('lit les montants simples', () => {
    expect(parseKamas('0')).toBe(0);
    expect(parseKamas('12000')).toBe(12000);
    expect(parseKamas('12 000')).toBe(12000);
    expect(parseKamas('12 000')).toBe(12000); // espace insécable
    expect(parseKamas('12 000')).toBe(12000); // espace fine insécable
  });

  it('lit les suffixes k et m', () => {
    expect(parseKamas('350k')).toBe(350_000);
    expect(parseKamas('350K')).toBe(350_000);
    expect(parseKamas('1.2m')).toBe(1_200_000);
    expect(parseKamas('1,5k')).toBe(1_500);
    expect(parseKamas('0.5k')).toBe(500);
    expect(parseKamas('1.234k')).toBe(1_234);
    expect(parseKamas('999.999999m')).toBe(999_999_999);
    expect(parseKamas('350 k')).toBe(350_000);
  });

  it('ne subit aucune dérive flottante', () => {
    // en flottant, 1.1 * 1e6 = 1100000.0000000002
    expect(parseKamas('1.1m')).toBe(1_100_000);
    expect(parseKamas('4.575m')).toBe(4_575_000);
  });

  it('rejette les saisies ambiguës ou invalides', () => {
    expect(parseKamas('')).toBeNull();
    expect(parseKamas('abc')).toBeNull();
    expect(parseKamas('12.5')).toBeNull(); // kamas fractionnaires sans suffixe
    expect(parseKamas('1.2345k')).toBeNull(); // précision sous le kama
    expect(parseKamas('-5')).toBeNull();
    expect(parseKamas('1.2.3')).toBeNull();
    expect(parseKamas('5g')).toBeNull();
    expect(parseKamas('1234567890123456')).toBeNull(); // 16 chiffres
  });
});

describe('formatKamas', () => {
  it('groupe par milliers avec une espace fine insécable', () => {
    expect(formatKamas(0)).toBe('0');
    expect(formatKamas(999)).toBe('999');
    expect(formatKamas(1000)).toBe('1 000');
    expect(formatKamas(1234567)).toBe('1 234 567');
    expect(formatKamas(-1234)).toBe('-1 234');
  });

  it('fait l\'aller-retour avec parseKamas', () => {
    for (const value of [0, 999, 1000, 350_000, 1_200_000, 999_999_999]) {
      expect(parseKamas(formatKamas(value))).toBe(value);
    }
  });

  it('refuse les montants non entiers', () => {
    expect(() => formatKamas(1.5)).toThrow(RangeError);
    expect(() => formatKamas(Number.NaN)).toThrow(RangeError);
  });
});
