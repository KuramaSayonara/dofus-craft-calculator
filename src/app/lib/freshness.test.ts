import { describe, expect, it } from 'vitest';
import { ageLabel, freshnessOf } from './freshness.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe('freshnessOf', () => {
  it('neutre sous 3 jours', () => {
    expect(freshnessOf(NOW, NOW)).toBe('fresh');
    expect(freshnessOf(NOW - 2.9 * DAY, NOW)).toBe('fresh');
  });

  it('à surveiller entre 3 et 7 jours', () => {
    expect(freshnessOf(NOW - 3 * DAY, NOW)).toBe('aging');
    expect(freshnessOf(NOW - 6.9 * DAY, NOW)).toBe('aging');
  });

  it('périmé au-delà de 7 jours', () => {
    expect(freshnessOf(NOW - 7 * DAY, NOW)).toBe('stale');
    expect(freshnessOf(NOW - 30 * DAY, NOW)).toBe('stale');
  });
});

describe('ageLabel', () => {
  it('formate les âges', () => {
    expect(ageLabel(NOW, NOW)).toBe("à l'instant");
    expect(ageLabel(NOW - 5 * 3_600_000, NOW)).toBe('il y a 5 h');
    expect(ageLabel(NOW - 3 * DAY, NOW)).toBe('il y a 3 j');
  });
});
