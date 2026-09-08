// @vitest-environment jsdom
//
// Régression signalée en vrai : en passant d'un objet à un autre, la section
// brisage se dupliquait à l'écran et les champs de prix devenaient
// inutilisables. Cause : elle partageait sa clé React avec la liste de courses,
// deux enfants d'un même parent ne peuvent pas avoir la même clé.

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BreakableItem, RecipeGraph, RuneTable } from '../../engine/index.ts';
import type { SearchEntry } from '../data.ts';
import { CraftSheet } from './CraftSheet.tsx';

afterEach(cleanup);

const VI = { key: 'vi', label: 'Vitalité', rune: 'Rune Vi', weight: 0.2, grant: 5, itemId: 1523, paItemId: 1548, raItemId: 1554 };
const FO = { key: 'fo', label: 'Force', rune: 'Rune Fo', weight: 1, grant: 1, itemId: 1519, paItemId: 1545, raItemId: 1551 };
const table: RuneTable = new Map([[VI.key, VI], [FO.key, FO]]);

const anneau: SearchEntry = { id: 9126, n: 'Blopanneau Griotte Royal', l: 80, t: 'Anneau', c: 'equipment', i: null, r: 1 };
const hache: SearchEntry = { id: 9138, n: 'Hache à Lamelles', l: 157, t: 'Hache', c: 'equipment', i: null, r: 1 };
const ressource: SearchEntry = { id: 303, n: 'Frêne', l: 1, t: 'Bois', c: 'resources', i: null, r: 0 };

const graph: RecipeGraph = new Map([
  [anneau.id, { ingredients: [[303, 2] as const], jobId: 1, level: 80 }],
  [hache.id, { ingredients: [[303, 4] as const], jobId: 2, level: 157 }],
]);

const brisages: Record<number, BreakableItem> = {
  [anneau.id]: { level: 80, lines: [{ key: 'vi', min: 21, max: 35 }] },
  [hache.id]: { level: 157, lines: [{ key: 'fo', min: 31, max: 50 }] },
};

function props(entry: SearchEntry) {
  return {
    entry,
    graph,
    jobs: { '1': 'Bijoutier', '2': 'Forgeron' },
    questNeeds: null,
    entryById: new Map([[ressource.id, ressource], [anneau.id, anneau], [hache.id, hache]]),
    prices: new Map<number, number>([[303, 100]]),
    priceEntries: new Map(),
    onPriceChange: vi.fn(),
    inventory: new Map<number, number>(),
    onStockChange: vi.fn(),
    volume: undefined,
    onVolumeChange: vi.fn(),
    modes: new Map(),
    onModeChange: vi.fn(),
    quantity: 1,
    onQuantityChange: vi.fn(),
    brisage: brisages[entry.id] ?? null,
    runeTable: table,
    coefficient: null,
    referenceCoefficient: null,
    onCoefficientChange: vi.fn(),
    taxRate: 0.02,
    marginalThresholdPct: 10,
    saveDefaults: null,
    onSaveCraft: vi.fn(),
    onListSale: vi.fn(),
  };
}

describe('fiche de craft', () => {
  it('n’affiche qu’une seule section brisage, même après avoir changé d’objet', async () => {
    const { rerender } = render(<CraftSheet {...props(anneau)} />);
    expect(screen.getAllByText('🔨 Brisage')).toHaveLength(1);

    rerender(<CraftSheet {...props(hache)} />);
    expect(screen.getAllByText('🔨 Brisage')).toHaveLength(1);
    expect(screen.getByText(/31 à 50 Force/)).toBeDefined();

    rerender(<CraftSheet {...props(anneau)} />);
    expect(screen.getAllByText('🔨 Brisage')).toHaveLength(1);
    expect(screen.getByText(/21 à 35 Vitalité/)).toBeDefined();
  });

  it('garde les champs de prix utilisables après un changement d’objet', async () => {
    const user = userEvent.setup();
    const premier = props(anneau);
    const { rerender } = render(<CraftSheet {...premier} />);

    const second = props(hache);
    rerender(<CraftSheet {...second} />);

    await user.click(screen.getByLabelText('Prix unitaire de Rune Fo'));
    await user.keyboard('250{Enter}');
    expect(second.onPriceChange).toHaveBeenCalledWith(FO.itemId, 250);
  });

  it('montre le brisage d’un objet non craftable, qui s’achète pour être brisé', () => {
    const trophee: SearchEntry = { id: 9999, n: 'Anneau du Voyageur', l: 60, t: 'Anneau', c: 'equipment', i: null, r: 0 };
    render(<CraftSheet {...props(trophee)} brisage={{ level: 60, lines: [{ key: 'vi', min: 10, max: 20 }] }} />);
    expect(screen.getByText(/n'a pas de recette de craft/)).toBeDefined();
    expect(screen.getAllByText('🔨 Brisage')).toHaveLength(1);
  });
});
