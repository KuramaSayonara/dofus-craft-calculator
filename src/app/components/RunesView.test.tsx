// @vitest-environment jsdom
//
// Import des prix par capture d'écran, de bout en bout : la lecture d'image est
// remplacée par le texte qu'elle renvoie (le moteur de reconnaissance lui-même
// n'a rien à faire dans un test), le reste est exercé pour de vrai.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuneTable } from '../../engine/index.ts';
import type { SearchEntry } from '../data.ts';
import { RunesView } from './RunesView.tsx';

const readImageText = vi.hoisted(() => vi.fn());
vi.mock('../lib/ocr.ts', () => ({ readImageText }));

afterEach(() => {
  cleanup();
  readImageText.mockReset();
});

const runes: SearchEntry[] = [
  { id: 1523, n: 'Rune Vi', l: 1, t: 'Rune de forgemagie', c: 'resources', i: null, r: 0 },
  { id: 1521, n: 'Rune Sa', l: 15, t: 'Rune de forgemagie', c: 'resources', i: null, r: 0 },
  { id: 11639, n: 'Rune Tac', l: 55, t: 'Rune de forgemagie', c: 'resources', i: null, r: 0 },
  { id: 1545, n: 'Rune Pa Fo', l: 5, t: 'Rune de forgemagie', c: 'resources', i: null, r: 0 },
];

const runeTable: RuneTable = new Map([
  ['vi', { key: 'vi', label: 'Vitalité', rune: 'Rune Vi', weight: 0.2, grant: 5, itemId: 1523, paItemId: 1548, raItemId: 1554 }],
  ['sa', { key: 'sa', label: 'Sagesse', rune: 'Rune Sa', weight: 3, grant: 1, itemId: 1521, paItemId: 1546, raItemId: 1552 }],
  ['tac', { key: 'tac', label: 'Tacle', rune: 'Rune Tac', weight: 4, grant: 1, itemId: 11639, paItemId: 11640, raItemId: null }],
]);

const CAPTURE = `Nom Niveau Prix moyen
Rune Vi
Rune de forgemagie 1 158
Rune Sa
Rune de forgemagie 15 355
Rune Tac
Rune de forgemagie 55 936
Bidule inconnu 42`;

function setup(prices = new Map<number, number>()) {
  const onImportPrices = vi.fn();
  const onPriceChange = vi.fn();
  render(
    <RunesView
      runes={runes}
      runeTable={runeTable}
      prices={prices}
      priceEntries={new Map()}
      onPriceChange={onPriceChange}
      onImportPrices={onImportPrices}
    />,
  );
  return { onImportPrices, onPriceChange };
}

const image = () => new File(['fausse image'], 'hdv.png', { type: 'image/png' });

describe('écran des runes', () => {
  it('liste les runes du brisage avec leur poids', () => {
    setup(new Map([[1523, 158]]));
    expect(screen.getByLabelText('Prix unitaire de Rune Vi')).toBeDefined();
    // Rune Pa Fo n'a pas de poids de brisage : masquée par le filtre par défaut
    expect(screen.queryByLabelText('Prix unitaire de Rune Pa Fo')).toBeNull();
  });

  it('affiche le prix rapporté au poids, qui décide du focus', () => {
    setup(new Map([[1523, 158], [1521, 355]]));
    const ligne = screen.getByText('Rune Vi').closest('tr')!;
    // 158 / (0,2 × 5) = 158 par point de poids
    expect(within(ligne).getByText('158', { selector: 'td' })).toBeDefined();
    const ligneSa = screen.getByText('Rune Sa').closest('tr')!;
    // 355 / 3 = 118
    expect(within(ligneSa).getByText('118', { selector: 'td' })).toBeDefined();
  });

  it('lit une capture, propose les prix, et n’enregistre qu’après relecture', async () => {
    const user = userEvent.setup();
    readImageText.mockResolvedValue(CAPTURE);
    const { onImportPrices } = setup();

    await user.upload(document.querySelector<HTMLInputElement>('input[type=file]')!, image());

    await waitFor(() => expect(screen.getByText(/3 runes lues/)).toBeDefined());
    // rien n'est enregistré tant qu'on n'a pas validé
    expect(onImportPrices).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Enregistrer 3 prix/ }));
    expect(onImportPrices).toHaveBeenCalledWith([
      [1523, 158],
      [1521, 355],
      [11639, 936],
    ]);
  });

  it('laisse décocher une ligne douteuse avant d’enregistrer', async () => {
    const user = userEvent.setup();
    readImageText.mockResolvedValue(CAPTURE);
    const { onImportPrices } = setup();
    await user.upload(document.querySelector('input[type=file]')!, image());
    await waitFor(() => expect(screen.getByText(/3 runes lues/)).toBeDefined());

    await user.click(screen.getByLabelText('Garder le prix lu pour Rune Sa'));
    await user.click(screen.getByRole('button', { name: /Enregistrer 2 prix/ }));
    expect(onImportPrices).toHaveBeenCalledWith([[1523, 158], [11639, 936]]);
  });

  it('montre ce qu’il n’a pas su lire', async () => {
    const user = userEvent.setup();
    readImageText.mockResolvedValue(CAPTURE);
    setup();
    await user.upload(document.querySelector('input[type=file]')!, image());
    await waitFor(() => expect(screen.getByText(/1 ligne non reconnue/)).toBeDefined());
  });

  it('dit clairement quand aucune rune n’est reconnue', async () => {
    const user = userEvent.setup();
    readImageText.mockResolvedValue('capture floue, rien de lisible');
    setup();
    await user.upload(document.querySelector('input[type=file]')!, image());
    await waitFor(() => expect(screen.getByText(/Aucune rune reconnue/)).toBeDefined());
  });

  it('explique l’échec au lieu de rester bloqué', async () => {
    const user = userEvent.setup();
    readImageText.mockRejectedValue(new Error('téléchargement du moteur de lecture impossible'));
    setup();
    await user.upload(document.querySelector('input[type=file]')!, image());
    await waitFor(() =>
      expect(screen.getByText(/téléchargement du moteur de lecture impossible/)).toBeDefined(),
    );
  });
});
