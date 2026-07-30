import { useMemo, useState } from 'react';
import {
  formatKamas,
  scanCrafts,
  type CraftScanRow,
  type PriceBook,
  type RecipeGraph,
} from '../../engine/index.ts';
import type { RecipesFile, SearchEntry } from '../data.ts';
import { ItemIcon } from './ItemIcon.tsx';

interface TopCraftsViewProps {
  graph: RecipeGraph;
  prices: PriceBook;
  entryById: ReadonlyMap<number, SearchEntry>;
  jobs: RecipesFile['jobs'];
  taxRate: number;
  marginalThresholdPct: number;
  onOpenItem: (itemId: number) => void;
}

type SortKey = 'margin' | 'profit' | 'cost';

/**
 * Balaye TOUS les crafts du jeu avec le carnet de prix actuel : ceux dont
 * toutes les ressources (et le prix marché) sont connus, triés par marge,
 * plus les « presque calculables » avec leur nombre de prix manquants.
 */
export function TopCraftsView(props: TopCraftsViewProps) {
  const { graph, prices, entryById, jobs, taxRate, marginalThresholdPct, onOpenItem } = props;
  const [jobFilter, setJobFilter] = useState<number | null>(null);
  const [levelMin, setLevelMin] = useState('');
  const [levelMax, setLevelMax] = useState('');
  const [sort, setSort] = useState<SortKey>('margin');

  const scan = useMemo(() => scanCrafts(graph, prices, { taxRate }), [graph, prices, taxRate]);

  const filterRow = (row: CraftScanRow): boolean => {
    if (jobFilter !== null && row.jobId !== jobFilter) return false;
    const level = row.craftLevel ?? entryById.get(row.itemId)?.l ?? 0;
    const min = levelMin === '' ? null : Number(levelMin);
    const max = levelMax === '' ? null : Number(levelMax);
    if (min !== null && Number.isFinite(min) && level < min) return false;
    if (max !== null && Number.isFinite(max) && level > max) return false;
    return true;
  };

  const computable = useMemo(() => {
    const rows = scan.rows.filter(row => row.profit !== null && filterRow(row));
    rows.sort((a, b) => {
      if (sort === 'margin') {
        return (b.marginPct ?? Number.NEGATIVE_INFINITY) - (a.marginPct ?? Number.NEGATIVE_INFINITY);
      }
      if (sort === 'profit') return b.profit! - a.profit!;
      return (a.craftCost ?? 0) - (b.craftCost ?? 0);
    });
    return rows.slice(0, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, jobFilter, levelMin, levelMax, sort]);

  const almost = useMemo(() => {
    const rows = scan.rows
      .filter(row => row.profit === null && filterRow(row))
      .map(row => ({
        row,
        missing: row.missingPrices.length + (row.craftCost !== null && row.salePrice === null ? 1 : 0),
      }))
      .filter(entry => entry.missing >= 1 && entry.missing <= 3);
    rows.sort((a, b) => a.missing - b.missing);
    return rows.slice(0, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, jobFilter, levelMin, levelMax]);

  const jobOptions = useMemo(
    () => Object.entries(jobs).sort((a, b) => a[1].localeCompare(b[1], 'fr')),
    [jobs],
  );

  const marginClass = (row: CraftScanRow): string => {
    if (row.profit === null) return 'text-zinc-400';
    if (row.profit < 0) return 'text-red-400';
    if (row.marginPct !== null && row.marginPct < marginalThresholdPct) return 'text-amber-400';
    return 'text-emerald-400';
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-zinc-400">
          Métier
          <select
            value={jobFilter ?? ''}
            onChange={event => setJobFilter(event.target.value === '' ? null : Number(event.target.value))}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
          >
            <option value="">Tous</option>
            {jobOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-zinc-400">
          Niveau
          <input
            type="number"
            min={0}
            max={200}
            value={levelMin}
            onChange={event => setLevelMin(event.target.value)}
            placeholder="min"
            aria-label="Niveau minimum"
            className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right"
          />
          –
          <input
            type="number"
            min={0}
            max={200}
            value={levelMax}
            onChange={event => setLevelMax(event.target.value)}
            placeholder="max"
            aria-label="Niveau maximum"
            className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right"
          />
        </label>
        <label className="flex items-center gap-2 text-zinc-400">
          Tri
          <select
            value={sort}
            onChange={event => setSort(event.target.value as SortKey)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
          >
            <option value="margin">Marge %</option>
            <option value="profit">Profit / craft</option>
            <option value="cost">Coût croissant</option>
          </select>
        </label>
      </div>

      {computable.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">
          Aucun craft entièrement calculable avec tes prix actuels
          {jobFilter !== null || levelMin !== '' || levelMax !== '' ? ' et ces filtres' : ''}. Il faut
          le prix de chaque ingrédient ET le prix marché de l'objet. Les « presque calculables »
          ci-dessous te disent combien de prix il manque.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2 font-medium" colSpan={2}>Objet</th>
                <th className="px-3 py-2 font-medium">Métier</th>
                <th className="px-3 py-2 text-right font-medium">Coût</th>
                <th className="px-3 py-2 text-right font-medium">Prix marché</th>
                <th className="px-3 py-2 text-right font-medium">Profit</th>
                <th className="px-3 py-2 text-right font-medium">Marge</th>
              </tr>
            </thead>
            <tbody>
              {computable.map(row => {
                const entry = entryById.get(row.itemId);
                return (
                  <tr
                    key={row.itemId}
                    onClick={() => onOpenItem(row.itemId)}
                    className="cursor-pointer border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/70"
                  >
                    <td className="w-10 py-1 pl-3">
                      <ItemIcon icon={entry?.i ?? null} />
                    </td>
                    <td className="px-3 py-1">
                      <span className="block max-w-56 truncate">{entry?.n ?? `Objet ${row.itemId}`}</span>
                      <span className="text-xs text-zinc-500">niv. {entry?.l ?? '?'}</span>
                    </td>
                    <td className="px-3 py-1 text-zinc-400">
                      {row.jobId !== null ? (jobs[String(row.jobId)] ?? '?') : '—'}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">{formatKamas(row.craftCost!)} K</td>
                    <td className="px-3 py-1 text-right tabular-nums">{formatKamas(row.salePrice!)} K</td>
                    <td className={`px-3 py-1 text-right font-medium tabular-nums ${marginClass(row)}`}>
                      {row.profit! >= 0 ? '+' : ''}
                      {formatKamas(row.profit!)} K
                    </td>
                    <td className={`px-3 py-1 text-right tabular-nums ${marginClass(row)}`}>
                      {row.marginPct !== null ? `${row.marginPct.toFixed(1)} %` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {almost.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">
            Presque calculables — renseigne les prix manquants pour les débloquer
          </h3>
          <ul className="divide-y divide-zinc-800/60 rounded-lg border border-zinc-800">
            {almost.map(({ row, missing }) => {
              const entry = entryById.get(row.itemId);
              return (
                <li
                  key={row.itemId}
                  onClick={() => onOpenItem(row.itemId)}
                  className="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-zinc-900/70"
                >
                  <ItemIcon icon={entry?.i ?? null} />
                  <span className="min-w-0 flex-1 truncate text-sm">{entry?.n ?? `Objet ${row.itemId}`}</span>
                  <span className="text-xs text-zinc-400">
                    {row.jobId !== null ? (jobs[String(row.jobId)] ?? '') : ''}
                  </span>
                  <span className="shrink-0 rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                    {missing} prix manquant{missing > 1 ? 's' : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
