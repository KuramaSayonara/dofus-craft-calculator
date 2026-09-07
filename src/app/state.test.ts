import { describe, expect, it } from 'vitest';
import {
  coefficientsOf,
  defaultAppData,
  inventoryOf,
  modesOfSavedCraft,
  parseAppData,
  priceBookOf,
  priceEntriesOf,
  reduce,
  salesOf,
  type AppData,
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

describe('stock possédé', () => {
  it('enregistre, met à jour et efface une quantité', () => {
    let data = reduce(defaultAppData(), { type: 'set-stock', itemId: 289, quantity: 1000 });
    expect(inventoryOf(data).get(289)).toBe(1000);
    data = reduce(data, { type: 'set-stock', itemId: 289, quantity: 40 });
    expect(inventoryOf(data).get(289)).toBe(40);
    data = reduce(data, { type: 'set-stock', itemId: 289, quantity: null });
    expect(inventoryOf(data).has(289)).toBe(false);
  });

  it('traite 0 (ou négatif) comme une absence de stock', () => {
    let data = reduce(defaultAppData(), { type: 'set-stock', itemId: 1, quantity: 0 });
    expect(inventoryOf(data).has(1)).toBe(false);
    data = reduce(data, { type: 'set-stock', itemId: 1, quantity: -5 });
    expect(inventoryOf(data).has(1)).toBe(false);
  });

  it('le stock est isolé par profil', () => {
    let data = reduce(defaultAppData(), { type: 'set-stock', itemId: 289, quantity: 1000 });
    data = reduce(data, { type: 'add-profile', id: 'p2', name: 'Serveur 2' });
    expect(inventoryOf(data).size).toBe(0);
    data = reduce(data, { type: 'switch-profile', profileId: 'default' });
    expect(inventoryOf(data).get(289)).toBe(1000);
  });

  it('se vide entièrement sur demande', () => {
    let data = reduce(defaultAppData(), { type: 'set-stock', itemId: 1, quantity: 5 });
    data = reduce(data, { type: 'set-stock', itemId: 2, quantity: 7 });
    data = reduce(data, { type: 'clear-stock' });
    expect(inventoryOf(data).size).toBe(0);
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

  it('relit sans perte des données enregistrées avant l\'arrivée du stock', () => {
    // sauvegarde d'une version antérieure : aucun champ `inventory`
    const ancien = defaultAppData();
    ancien.prices['default'] = { '289': { p: 101, t: 1 } };
    const { inventory: _absent, ...sansStock } = JSON.parse(JSON.stringify(ancien)) as AppData;
    const relu = parseAppData(sansStock);
    expect(relu).not.toBeNull();
    expect(relu!.prices['default']).toEqual({ '289': { p: 101, t: 1 } });
    expect(relu!.inventory).toEqual({});
    expect(inventoryOf(relu!).size).toBe(0);
  });
});

describe('coefficients de brisage', () => {
  it('se relèvent par objet, horodatés, et null efface', () => {
    // le taux varie d'un objet à l'autre : il se stocke comme un prix
    let data = defaultAppData();
    data = reduce(data, { type: 'set-coefficient', itemId: 9126, value: 38, now: NOW });
    expect(coefficientsOf(data).get(9126)).toEqual({ p: 38, t: NOW });
    data = reduce(data, { type: 'set-coefficient', itemId: 9126, value: 52, now: NOW + 1 });
    expect(coefficientsOf(data).get(9126)).toEqual({ p: 52, t: NOW + 1 });
    data = reduce(data, { type: 'set-coefficient', itemId: 9126, value: null, now: NOW + 2 });
    expect(coefficientsOf(data).has(9126)).toBe(false);
  });

  it('sont isolés par profil, comme les kamas', () => {
    let data = defaultAppData();
    data = reduce(data, { type: 'set-coefficient', itemId: 9126, value: 38, now: NOW });
    data = reduce(data, { type: 'add-profile', id: 'imagiro', name: 'Imagiro' });
    expect(coefficientsOf(data).has(9126)).toBe(false);
    data = reduce(data, { type: 'set-coefficient', itemId: 9126, value: 145, now: NOW });
    expect(coefficientsOf(data).get(9126)!.p).toBe(145);
    data = reduce(data, { type: 'switch-profile', profileId: 'default' });
    expect(coefficientsOf(data).get(9126)!.p).toBe(38);
  });

  it('disparaissent avec leur profil', () => {
    let data = defaultAppData();
    data = reduce(data, { type: 'add-profile', id: 'imagiro', name: 'Imagiro' });
    data = reduce(data, { type: 'set-coefficient', itemId: 9126, value: 38, now: NOW });
    data = reduce(data, { type: 'delete-profile', profileId: 'imagiro' });
    expect(data.coefficients['imagiro']).toBeUndefined();
  });

  it('relit sans perte une sauvegarde antérieure au brisage', () => {
    const ancien = defaultAppData();
    ancien.prices['default'] = { '1519': { p: 187, t: 1 } };
    const brut = JSON.parse(JSON.stringify(ancien)) as Record<string, unknown>;
    delete brut['coefficients'];
    (brut['settings'] as Record<string, unknown>)['referenceCoefficient'] = undefined;
    delete (brut['settings'] as Record<string, unknown>)['referenceCoefficient'];
    const relu = parseAppData(brut);
    expect(relu).not.toBeNull();
    expect(relu!.coefficients).toEqual({});
    expect(relu!.settings.referenceCoefficient).toBeNull();
    expect(relu!.prices['default']).toEqual({ '1519': { p: 187, t: 1 } });
  });
});
