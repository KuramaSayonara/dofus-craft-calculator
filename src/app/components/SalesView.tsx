import { useMemo, useState } from 'react';
import { formatKamas, netAfterTax } from '../../engine/index.ts';
import type { SearchEntry } from '../data.ts';
import type { Sale } from '../state.ts';
import { ItemIcon } from './ItemIcon.tsx';
import { PriceInput } from './PriceInput.tsx';

interface SalesViewProps {
  sales: ReadonlyArray<Sale>;
  entryById: ReadonlyMap<number, SearchEntry>;
  taxRate: number;
  onMarkSold: (id: string, unitSalePrice: number, comment: string) => void;
  onDelete: (id: string) => void;
}

/** Ventes en cours (coût figé) et historique avec agrégats. */
export function SalesView({ sales, entryById, taxRate, onMarkSold, onDelete }: SalesViewProps) {
  const [soldForm, setSoldForm] = useState<{ id: string; price: number | null; comment: string } | null>(null);

  const listed = useMemo(
    () => [...sales].filter(sale => sale.status === 'listed').sort((a, b) => b.listedAt - a.listedAt),
    [sales],
  );
  const sold = useMemo(
    () => [...sales].filter(sale => sale.status === 'sold').sort((a, b) => (b.soldAt ?? 0) - (a.soldAt ?? 0)),
    [sales],
  );

  const aggregates = useMemo(() => {
    let totalProfit = 0;
    let totalCost = 0;
    const byItem = new Map<number, number>();
    for (const sale of sold) {
      totalProfit += sale.profit ?? 0;
      totalCost += sale.unitCost * sale.quantity;
      byItem.set(sale.itemId, (byItem.get(sale.itemId) ?? 0) + (sale.profit ?? 0));
    }
    const top = [...byItem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      totalProfit,
      avgMarginPct: totalCost > 0 ? (totalProfit / totalCost) * 100 : null,
      top,
    };
  }, [sold]);

  const name = (itemId: number) => entryById.get(itemId)?.n ?? `Objet ${itemId}`;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-medium">Ventes en cours ({listed.length})</h2>
        {listed.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">
            Aucune vente en cours. Depuis une fiche de craft, « 🏷️ Mettre en vente » fige le coût du
            moment.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800/60 rounded-lg border border-zinc-800">
            {listed.map(sale => (
              <li key={sale.id} className="space-y-2 px-3 py-2">
                <div className="flex items-center gap-3">
                  <ItemIcon icon={entryById.get(sale.itemId)?.i ?? null} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {name(sale.itemId)} × {sale.quantity}
                    </span>
                    <span className="text-xs text-zinc-500">
                      listé le {new Date(sale.listedAt).toLocaleDateString('fr-FR')} · coût figé{' '}
                      {formatKamas(sale.unitCost)} K/u
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSoldForm({ id: sale.id, price: null, comment: '' })}
                    className="rounded border border-emerald-500/40 px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10"
                  >
                    Vendu…
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(sale.id)}
                    aria-label="Annuler cette mise en vente"
                    className="px-1 text-xs text-zinc-600 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
                {soldForm?.id === sale.id && (
                  <form
                    onSubmit={event => {
                      event.preventDefault();
                      if (soldForm.price === null) return;
                      onMarkSold(sale.id, soldForm.price, soldForm.comment.trim());
                      setSoldForm(null);
                    }}
                    className="flex flex-wrap items-center gap-2 rounded border border-zinc-800 bg-zinc-900/50 p-2 text-sm"
                  >
                    <span className="text-zinc-400">Prix de vente unitaire</span>
                    <PriceInput
                      value={soldForm.price}
                      onChange={price => setSoldForm(current => (current !== null ? { ...current, price } : current))}
                      label="Prix de vente unitaire"
                    />
                    {soldForm.price !== null && (
                      <span className="text-xs text-zinc-500">
                        profit total :{' '}
                        {formatKamas((netAfterTax(soldForm.price, taxRate) - sale.unitCost) * sale.quantity)} K
                      </span>
                    )}
                    <input
                      value={soldForm.comment}
                      onChange={event =>
                        setSoldForm(current => (current !== null ? { ...current, comment: event.target.value } : current))
                      }
                      placeholder="commentaire (optionnel)"
                      aria-label="Commentaire"
                      className="min-w-40 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={soldForm.price === null}
                      className="rounded bg-emerald-500/20 px-3 py-1 text-emerald-300 disabled:opacity-40"
                    >
                      Valider la vente
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Historique ({sold.length})</h2>
        {sold.length > 0 && (
          <div className="flex flex-wrap gap-4 rounded-lg border border-zinc-800 p-3 text-sm">
            <span>
              Profit total :{' '}
              <strong className={`tabular-nums ${aggregates.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {aggregates.totalProfit >= 0 ? '+' : ''}
                {formatKamas(aggregates.totalProfit)} K
              </strong>
            </span>
            {aggregates.avgMarginPct !== null && (
              <span>
                Marge moyenne :{' '}
                <strong className="tabular-nums">{aggregates.avgMarginPct.toFixed(1)} %</strong>
              </span>
            )}
            {aggregates.top.length > 0 && (
              <span className="text-zinc-400">
                Top :{' '}
                {aggregates.top
                  .map(([itemId, profit]) => `${name(itemId)} (${profit >= 0 ? '+' : ''}${formatKamas(profit)} K)`)
                  .join(' · ')}
              </span>
            )}
          </div>
        )}
        {sold.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">
            Aucune vente terminée pour l'instant.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Objet</th>
                  <th className="px-3 py-2 text-right font-medium">Qté</th>
                  <th className="px-3 py-2 text-right font-medium">Vente/u</th>
                  <th className="px-3 py-2 text-right font-medium">Coût figé/u</th>
                  <th className="px-3 py-2 text-right font-medium">Profit réel</th>
                  <th className="px-3 py-2 font-medium">Commentaire</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sold.map(sale => (
                  <tr key={sale.id} className="border-b border-zinc-800/60 last:border-0">
                    <td className="px-3 py-1.5 text-zinc-400">
                      {sale.soldAt !== undefined ? new Date(sale.soldAt).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="max-w-48 truncate px-3 py-1.5">{name(sale.itemId)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{sale.quantity}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {sale.unitSalePrice !== undefined ? `${formatKamas(sale.unitSalePrice)} K` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatKamas(sale.unitCost)} K</td>
                    <td
                      className={`px-3 py-1.5 text-right font-medium tabular-nums ${
                        (sale.profit ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {(sale.profit ?? 0) >= 0 ? '+' : ''}
                      {formatKamas(sale.profit ?? 0)} K
                    </td>
                    <td className="max-w-40 truncate px-3 py-1.5 text-zinc-400">{sale.comment ?? ''}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => onDelete(sale.id)}
                        aria-label="Supprimer cette vente de l'historique"
                        className="text-xs text-zinc-600 hover:text-red-400"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
