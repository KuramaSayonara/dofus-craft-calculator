import { describe, expect, it } from 'vitest';
import { breakEvenPrice, evaluateSale, netAfterTax, taxOn } from './profitability.ts';

describe('taxe HDV', () => {
  it('arrondit la taxe au kama inférieur', () => {
    expect(taxOn(100, 0.02)).toBe(2);
    expect(taxOn(49, 0.02)).toBe(0); // 0.98 → 0
    expect(taxOn(50, 0.02)).toBe(1);
    expect(taxOn(0, 0.02)).toBe(0);
  });

  it('ne subit aucune dérive flottante', () => {
    // en flottant, 1150 × 0.02 = 22.999999999999996 → floor donnerait 22
    expect(taxOn(1150, 0.02)).toBe(23);
    expect(taxOn(4950, 0.02)).toBe(99);
    expect(taxOn(1_000_000_000, 0.02)).toBe(20_000_000);
  });

  it('net = prix - taxe', () => {
    expect(netAfterTax(10_000, 0.02)).toBe(9_800);
    expect(netAfterTax(10_000, 0)).toBe(10_000);
  });

  it('rejette les taux invalides', () => {
    expect(() => taxOn(100, 1)).toThrow(RangeError);
    expect(() => taxOn(100, -0.1)).toThrow(RangeError);
  });
});

describe('seuil de rentabilité', () => {
  it('trouve le plus petit prix qui couvre le coût', () => {
    // net(99) = 99 - 1 = 98 ; net(98) = 98 - 1 = 97 → seuil = 99
    expect(breakEvenPrice(98, 0.02)).toBe(99);
    // net(9999) = 9999 - 199 = 9800 → seuil = 9999 (pas 10000)
    expect(breakEvenPrice(9_800, 0.02)).toBe(9_999);
  });

  it('est exact par propriété : net(seuil) ≥ coût et net(seuil-1) < coût', () => {
    for (const cost of [1, 7, 49, 98, 999, 1_234, 98_765, 1_000_000, 123_456_789]) {
      for (const rate of [0.02, 0.01, 0.05, 0.1]) {
        const be = breakEvenPrice(cost, rate);
        expect(netAfterTax(be, rate)).toBeGreaterThanOrEqual(cost);
        expect(netAfterTax(be - 1, rate)).toBeLessThan(cost);
      }
    }
  });

  it('coût nul ou négatif → seuil 0', () => {
    expect(breakEvenPrice(0, 0.02)).toBe(0);
    expect(breakEvenPrice(-5, 0.02)).toBe(0);
  });

  it('à taux nul, le seuil est le coût lui-même', () => {
    expect(breakEvenPrice(1234, 0)).toBe(1234);
  });
});

describe('evaluateSale', () => {
  it('calcule net, profit, marge et verdict', () => {
    const sale = evaluateSale({ craftCost: 1000, salePrice: 1200, taxRate: 0.02 });
    expect(sale.tax).toBe(24);
    expect(sale.net).toBe(1176);
    expect(sale.profit).toBe(176);
    expect(sale.marginPct).toBeCloseTo(17.6);
    expect(sale.verdict).toBe('profitable');
  });

  it('verdict marginal sous le seuil de marge', () => {
    const sale = evaluateSale({ craftCost: 1000, salePrice: 1030, taxRate: 0.02, marginalThresholdPct: 10 });
    expect(sale.profit).toBe(10); // net 1010
    expect(sale.verdict).toBe('marginal');
  });

  it('verdict profitable exactement au seuil', () => {
    // net(1122) = 1122 - 22 = 1100 → marge exactement 10 %
    const sale = evaluateSale({ craftCost: 1000, salePrice: 1122, taxRate: 0.02, marginalThresholdPct: 10 });
    expect(sale.marginPct).toBeCloseTo(10);
    expect(sale.verdict).toBe('profitable');
  });

  it('verdict à perte', () => {
    const sale = evaluateSale({ craftCost: 1000, salePrice: 900, taxRate: 0.02 });
    expect(sale.profit).toBe(-118);
    expect(sale.verdict).toBe('loss');
  });

  it('multiplie le profit par la quantité', () => {
    const sale = evaluateSale({ craftCost: 1000, salePrice: 1200, quantity: 20, taxRate: 0.02 });
    expect(sale.totalProfit).toBe(176 * 20);
  });

  it('coût nul : marge indéfinie mais verdict cohérent', () => {
    const sale = evaluateSale({ craftCost: 0, salePrice: 100, taxRate: 0.02 });
    expect(sale.marginPct).toBeNull();
    expect(sale.verdict).toBe('profitable');
  });
});
