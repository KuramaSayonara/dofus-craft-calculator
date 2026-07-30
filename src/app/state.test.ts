import { describe, expect, it } from 'vitest';
import {
  defaultAppData,
  modesOfSavedCraft,
  parseAppData,
  priceBookOf,
  priceEntriesOf,
  reduce,
  salesOf,
  type Sale,
  type SavedCraft,
} from './state.ts';

const NOW = 1_800_000_000_000;

describe('prix horodatés', () => {
  it('enregistre prix + horodatage, et null efface', () => {
    let data = defaultAppData();
    data = reduce(data, { type: 'set-price', itemId: 303, value: 12, now: NOW });
    expect(priceBookOf(data).get(303)).toBe(12);
    expect(priceEntriesOf(data).get(303)).toEqual({ p: 12, t: NOW });
    data = reduce(data, { type: 'set-price', itemId: 303, value: null, now: NOW + 1 });
    expect(priceBookOf(data).has(303)).toBe(false);
  });

  it('import en masse : tout au même horodatage', () => {
    const data = reduce(defaultAppData(), {
      type: 'import-prices',
      entries: [[1, 10], [2, 20]],
      now: NOW,
    });
    expect(priceEntriesOf(data).get(1)).toEqual({ p: 10, t: NOW });
    expect(priceEntriesOf(data).get(2)).toEqual({ p: 20, t: NOW });
  });
});

describe('profils', () => {
  it('les prix sont isolés par profil et survivent à la bascule', () => {
    let data = defaultAppData();
    data = reduce(data, { type: 'set-price', itemId: 303, value: 12, now: NOW });
    data = reduce(data, { type: 'add-profile', id: 'p2', name: 'Serveur 2' });
    expect(data.activeProfileId).toBe('p2');
    expect(priceBookOf(data).size).toBe(0); // nouveau profil : carnet vierge
    data = reduce(data, { type: 'set-price', itemId: 303, value: 99, now: NOW });
    data = reduce(data, { type: 'switch-profile', profileId: 'default' });
    expect(priceBookOf(data).get(303)).toBe(12); // rien n'a été perdu
    data = reduce(data, { type: 'switch-profile', profileId: 'p2' });
    expect(priceBookOf(data).get(303)).toBe(99);
  });

  it('refuse de supprimer le dernier profil', () => {
    const data = defaultAppData();
    expect(reduce(data, { type: 'delete-profile', profileId: 'default' })).toBe(data);
  });

  it('supprimer le profil actif bascule sur un autre', () => {
    let data = reduce(defaultAppData(), { type: 'add-profile', id: 'p2', name: 'S2' });
    data = reduce(data, { type: 'delete-profile', profileId: 'p2' });
    expect(data.activeProfileId).toBe('default');
    expect(data.prices['p2']).toBeUndefined();
  });
});

describe('ventes', () => {
  const sale: Sale = {
    id: 's1',
    itemId: 44,
    quantity: 5,
    listedAt: NOW,
    unitCost: 1000,
    status: 'listed',
  };

  it('le coût est figé à la mise en vente et le profit figé à la vente', () => {
    let data = reduce(defaultAppData(), { type: 'list-sale', sale });
    // le prix des ressources change ensuite : le coût figé ne bouge pas
    data = reduce(data, { type: 'set-price', itemId: 44, value: 999_999, now: NOW });
    expect(salesOf(data)[0]!.unitCost).toBe(1000);
    data = reduce(data, {
      type: 'mark-sold',
      id: 's1',
      unitSalePrice: 1500,
      profit: 2350,
      soldAt: NOW + 1000,
      comment: 'vendu vite',
    });
    const sold = salesOf(data)[0]!;
    expect(sold.status).toBe('sold');
    expect(sold.profit).toBe(2350);
    expect(sold.unitCost).toBe(1000);
  });

  it('les ventes sont propres à chaque profil', () => {
    let data = reduce(defaultAppData(), { type: 'list-sale', sale });
    data = reduce(data, { type: 'add-profile', id: 'p2', name: 'S2' });
    expect(salesOf(data)).toHaveLength(0);
    data = reduce(data, { type: 'switch-profile', profileId: 'default' });
    expect(salesOf(data)).toHaveLength(1);
  });
});

describe('sauvegardes de crafts', () => {
  const craft: SavedCraft = {
    id: 'c1',
    itemId: 44,
    name: 'Ma Boisaille',
    folder: 'Forgeron',
    quantity: 10,
    modes: { '16512': 'craft' },
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('crée puis met à jour par id', () => {
    let data = reduce(defaultAppData(), { type: 'save-craft', craft });
    data = reduce(data, { type: 'save-craft', craft: { ...craft, quantity: 20 } });
    expect(data.savedCrafts).toHaveLength(1);
    expect(data.savedCrafts[0]!.quantity).toBe(20);
    expect(modesOfSavedCraft(craft).get(16512)).toBe('craft');
  });
});

describe('parseAppData', () => {
  it('accepte un export valide et rejette le reste', () => {
    const data = defaultAppData();
    expect(parseAppData(JSON.parse(JSON.stringify(data)))).toEqual(data);
    expect(parseAppData({ nimporte: 'quoi' })).toBeNull();
    expect(parseAppData(null)).toBeNull();
    // profil actif inexistant → rejeté
    expect(parseAppData({ ...data, activeProfileId: 'fantome' })).toBeNull();
  });
});
