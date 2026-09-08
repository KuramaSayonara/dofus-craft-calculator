// @vitest-environment jsdom
//
// Tests d'interface de la section brisage, écrits après deux bugs signalés en
// vrai par l'utilisateur : les prix des runes qui ne s'enregistraient pas, et
// la section qui se dupliquait en changeant d'objet (voir CraftSheet.test.tsx).
// Ils reproduisent une frappe clavier réelle, pas des événements simulés.

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BreakableItem, RuneTable } from '../../engine/index.ts';
import type { SearchEntry } from '../data.ts';
import { BrisageSection } from './BrisageSection.tsx';

afterEach(cleanup);

// Le Blopanneau Griotte Royal, tel qu'il sort des vraies données du jeu.
const VI = { key: 'vi', label: 'Vitalité', rune: 'Rune Vi', weight: 0.2, grant: 5, itemId: 1523, paItemId: 1548, raItemId: 1554 };
const SA = { key: 'sa', label: 'Sagesse', rune: 'Rune Sa', weight: 3, grant: 1, itemId: 1521, paItemId: 1546, raItemId: 1552 };
const INE = { key: 'ine', label: 'Intelligence', rune: 'Rune Ine', weight: 1, grant: 1, itemId: 1522, paItemId: 1547, raItemId: 1553 };
const DO = { key: 'do', label: 'Dommages', rune: 'Rune Do', weight: 20, grant: 1, itemId: 7435, paItemId: null, raItemId: null };

const table: RuneTable = new Map([VI, SA, INE, DO].map(rune => [rune.key, rune]));

const item: BreakableItem = {
  level: 80,
  lines: [
    { key: 'vi', min: 21, max: 35 },
    { key: 'sa', min: 11, max: 15 },
    { key: 'ine', min: 16, max: 30 },
    { key: 'do', min: 4, max: 5 },
  ],
};

const entry: SearchEntry = {
  id: 9126, n: 'Blopanneau Griotte Royal', l: 80, t: 'Anneau', c: 'equipment', i: null, r: 1,
};

function setup(overrides: Partial<Parameters<typeof BrisageSection>[0]> = {}) {
  const onPriceChange = vi.fn();
  const onCoefficientChange = vi.fn();
  const props = {
    entry,
    item,
    table,
    prices: new Map<number, number>(),
    priceEntries: new Map(),
    onPriceChange,
    coefficient: null,
    referenceCoefficient: null,
    onCoefficientChange,
    craftCost: null,
    marketPrice: null,
    taxRate: 0.02,
    marginalThresholdPct: 10,
    ...overrides,
  };
  render(<BrisageSection {...props} />);
  return { onPriceChange, onCoefficientChange };
}

describe('section brisage', () => {
  it('affiche toutes les runes de l’objet sans réclamer le coefficient', () => {
    setup();
    for (const rune of ['Rune Vi', 'Rune Sa', 'Rune Ine', 'Rune Do']) {
      expect(screen.getByLabelText(`Prix unitaire de ${rune}`)).toBeDefined();
    }
    // le classement des focus est là, alors qu'aucun coefficient n'est saisi
    expect(screen.getByText(/Quel focus faire/)).toBeDefined();
    expect(screen.getByText('Sans focus')).toBeDefined();
    expect(screen.getByLabelText(/Coefficient de brisage/)).toHaveProperty('placeholder', 'facultatif');
  });

  it('enregistre le prix tapé au clavier, pour la bonne rune', async () => {
    const user = userEvent.setup();
    const { onPriceChange } = setup();

    await user.click(screen.getByLabelText('Prix unitaire de Rune Vi'));
    await user.keyboard('187{Enter}');
    expect(onPriceChange).toHaveBeenCalledWith(VI.itemId, 187);

    // et la suivante aussi : c'est l'enchaînement qui échouait
    await user.click(screen.getByLabelText('Prix unitaire de Rune Sa'));
    await user.keyboard('296{Enter}');
    expect(onPriceChange).toHaveBeenCalledWith(SA.itemId, 296);
    expect(onPriceChange).toHaveBeenCalledTimes(2);
  });

  it('accepte les raccourcis de saisie et efface sur champ vide', async () => {
    const user = userEvent.setup();
    const { onPriceChange } = setup({ prices: new Map([[VI.itemId, 187]]) });

    await user.click(screen.getByLabelText('Prix unitaire de Rune Sa'));
    await user.keyboard('12k{Enter}');
    expect(onPriceChange).toHaveBeenCalledWith(SA.itemId, 12_000);

    await user.clear(screen.getByLabelText('Prix unitaire de Rune Vi'));
    await user.tab();
    expect(onPriceChange).toHaveBeenCalledWith(VI.itemId, null);
  });

  it('garde la table des runes intacte quand on change de focus', async () => {
    const user = userEvent.setup();
    setup({ prices: new Map([[VI.itemId, 187], [SA.itemId, 296], [INE.itemId, 36], [DO.itemId, 868]]) });

    const avant = screen.getAllByLabelText(/Prix unitaire de/).length;
    await user.click(screen.getByRole('button', { name: /Focus Sagesse/ }));
    // les quatre champs de prix doivent rester saisissables
    expect(screen.getAllByLabelText(/Prix unitaire de/)).toHaveLength(avant);
    expect(screen.getByLabelText('Prix unitaire de Rune Do')).toBeDefined();
  });

  it('classe les focus par prix rapporté au poids de la rune', () => {
    // Vi vaut 187 pour un poids de 1 ; Do vaut 868 pour un poids de 20 (43 par
    // point) : focaliser la Vitalité doit passer devant les Dommages.
    setup({ prices: new Map([[VI.itemId, 187], [SA.itemId, 296], [INE.itemId, 36], [DO.itemId, 868]]) });
    const options = screen.getAllByRole('button').filter(node => /^(Sans focus|Focus )/.test(node.textContent ?? ''));
    const ordre = options.map(node => node.textContent ?? '');
    const rangVi = ordre.findIndex(texte => texte.includes('Focus Vitalité'));
    const rangDo = ordre.findIndex(texte => texte.includes('Focus Dommages'));
    expect(rangVi).toBeGreaterThanOrEqual(0);
    expect(rangVi).toBeLessThan(rangDo);
    expect(ordre[0]).toContain('le mieux');
  });

  it('donne le coefficient minimum sans qu’on connaisse le coefficient', () => {
    setup({
      prices: new Map([[VI.itemId, 187], [SA.itemId, 296], [INE.itemId, 36], [DO.itemId, 868]]),
      craftCost: 8084,
    });
    expect(screen.getByText(/Il te faut au moins/)).toBeDefined();
    expect(screen.getByText(/de coefficient pour rentrer dans tes frais/)).toBeDefined();
  });

  it('prévient quand un prix manque au lieu de laisser croire au classement', () => {
    setup({ prices: new Map([[VI.itemId, 187]]) });
    expect(screen.getByText(/3 prix manquants/)).toBeDefined();
    expect(screen.queryByText('← le mieux')).toBeNull();
  });

  it('enregistre le coefficient saisi, et refuse une valeur hors bornes', async () => {
    const user = userEvent.setup();
    const { onCoefficientChange } = setup();
    const champ = screen.getByLabelText(/Coefficient de brisage/);

    await user.click(champ);
    await user.keyboard('38{Enter}');
    expect(onCoefficientChange).toHaveBeenCalledWith(38);

    await user.clear(champ);
    await user.keyboard('99999{Enter}');
    expect(onCoefficientChange).toHaveBeenCalledTimes(1); // 99 999 % ignoré
  });

  it('chiffre le brisage une fois le coefficient connu', () => {
    setup({
      prices: new Map([[VI.itemId, 187], [SA.itemId, 296], [INE.itemId, 36], [DO.itemId, 868]]),
      coefficient: { p: 38, t: Date.now() },
      craftCost: 8084,
    });
    const ligne = screen.getByText(/À 38 %, le brisage rapporte/).closest('tr');
    expect(ligne).not.toBeNull();
    expect(within(ligne!).getByText(/garantis/)).toBeDefined();
    expect(screen.getByText('Crafter puis briser')).toBeDefined();
  });
});
