import { describe, expect, it } from 'vitest';
import { readVolume } from './volume.ts';

describe('ventes observées', () => {
  it('aucune observation → aucune lecture (rien n\'est inventé)', () => {
    expect(readVolume(undefined, 10, 100)).toBeNull();
    expect(readVolume({}, 10, 100)).toBeNull();
  });

  it('calcule un rythme par jour depuis la fenêtre la plus longue', () => {
    const reading = readVolume({ d30: 60 }, 10, null)!;
    expect(reading.perDay).toBe(2);
    expect(reading.source).toBe('30j');
    expect(reading.daysToSell).toBe(5);
  });

  it('préfère 30 j à 7 j et 24 h, mais expose les trois', () => {
    const reading = readVolume({ d1: 10, d7: 35, d30: 60 }, 10, null)!;
    expect(reading.source).toBe('30j');
    expect(reading.perDay).toBe(2);
    expect(reading.perDayByWindow).toEqual([
      { window: '30j', perDay: 2 },
      { window: '7j', perDay: 5 },
      { window: '24h', perDay: 10 },
    ]);
  });

  it('se rabat sur 7 j puis 24 h si besoin', () => {
    expect(readVolume({ d7: 14 }, 4, null)!.source).toBe('7j');
    expect(readVolume({ d7: 14 }, 4, null)!.perDay).toBe(2);
    expect(readVolume({ d1: 3 }, 6, null)!.source).toBe('24h');
    expect(readVolume({ d1: 3 }, 6, null)!.daysToSell).toBe(2);
  });

  it('rythme nul : délai indéterminé plutôt qu\'une division par zéro', () => {
    const reading = readVolume({ d30: 0 }, 10, 500)!;
    expect(reading.perDay).toBe(0);
    expect(reading.daysToSell).toBeNull();
    expect(reading.profitPerDay).toBe(0);
  });

  it('profit par jour au rythme observé', () => {
    expect(readVolume({ d30: 60 }, 10, 500)!.profitPerDay).toBe(1000);
    expect(readVolume({ d30: 60 }, 10, null)!.profitPerDay).toBeNull();
    // profit négatif : la lecture reste honnête
    expect(readVolume({ d30: 30 }, 10, -200)!.profitPerDay).toBe(-200);
  });

  it('ignore les valeurs aberrantes sans planter', () => {
    expect(readVolume({ d30: -5 }, 10, 100)).toBeNull();
    expect(readVolume({ d30: Number.NaN }, 10, 100)).toBeNull();
    expect(readVolume({ d30: -5, d7: 14 }, 4, null)!.source).toBe('7j');
  });
});
