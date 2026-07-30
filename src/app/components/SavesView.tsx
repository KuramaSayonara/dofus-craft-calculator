import { useMemo, useState } from 'react';
import {
  analyzeCraftCost,
  formatKamas,
  netAfterTax,
  type PriceBook,
  type RecipeGraph,
} from '../../engine/index.ts';
import type { SearchEntry } from '../data.ts';
import { normalizeText } from '../search.ts';
import { modesOfSavedCraft, type SavedCraft } from '../state.ts';
import { ItemIcon } from './ItemIcon.tsx';

interface SavesViewProps {
  crafts: ReadonlyArray<SavedCraft>;
  entryById: ReadonlyMap<number, SearchEntry>;
  graph: RecipeGraph;
  prices: PriceBook;
  onOpen: (craft: SavedCraft) => void;
  onDelete: (id: string) => void;
}

type SortKey = 'date' | 'name' | 'profit';

interface Row {
  craft: SavedCraft;
  unitCost: number | null;
  marginPct: number | null;
}

/** Crafts sauvegardés : dossiers, recherche, tri par date / nom / rentabilité. */
export function SavesView({ crafts, entryById, graph, prices, onOpen, onDelete }: SavesViewProps) {
  const [sort, setSort] = useState<SortKey>('date');
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const rows = useMemo<Row[]>(
    () =>
      crafts.map(craft => {
        const unitCost = graph.has(craft.itemId)
          ? analyzeCraftCost(graph, prices, craft.itemId, { modes: modesOfSavedCraft(craft) }).root
              .craftUnitCost
          : null;
        const market = prices.get(craft.itemId) ?? null;
        const marginPct =
          unitCost !== null && unitCost > 0 && market !== null
            ? ((netAfterTax(market) - unitCost) / unitCost) * 100
            : null;
        return { craft, unitCost, marginPct };
      }),
    [crafts, graph, prices],
  );

  const filtered = useMemo(() => {
    const needle = normalizeText(query.trim());
    const matching =
      needle === ''
        ? rows
        : rows.filter(row => {
            const itemName = entryById.get(row.craft.itemId)?.n ?? '';
            return (
              normalizeText(row.craft.name).includes(needle) ||
              normalizeText(itemName).includes(needle) ||
              normalizeText(row.craft.folder).includes(needle)
            );
          });
    const sorted = [...matching];
    if (sort === 'date') sorted.sort((a, b) => b.craft.updatedAt - a.craft.updatedAt);
    else if (sort === 'name') sorted.sort((a, b) => a.craft.name.localeCompare(b.craft.name, 'fr'));
    else {
      sorted.sort(
        (a, b) => (b.marginPct ?? Number.NEGATIVE_INFINITY) - (a.marginPct ?? Number.NEGATIVE_INFINITY),
      );
    }
    return sorted;
  }, [rows, query, sort, entryById]);

  const byFolder = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const row of filtered) {
      const key = row.craft.folder;
      const list = groups.get(key);
      if (list === undefined) groups.set(key, [row]);
      else list.push(row);
    }
    // dossiers triés, « sans dossier » en dernier
    return [...groups.entries()].sort((a, b) => {
      if (a[0] === '') return 1;
      if (b[0] === '') return -1;
      return a[0].localeCompare(b[0], 'fr');
    });
  }, [filtered]);

  if (crafts.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">
        Aucun craft sauvegardé. Depuis la fiche d'un objet, utilise « 💾 Sauvegarder ce craft ».
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Chercher dans les sauvegardes…"
          aria-label="Chercher dans les sauvegardes"
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-amber-500"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Tri
          <select
            value={sort}
            onChange={event => setSort(event.target.value as SortKey)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
          >
            <option value="date">Plus récents</option>
            <option value="name">Nom</option>
            <option value="profit">Rentabilité</option>
          </select>
        </label>
      </div>

      {byFolder.map(([folder, list]) => (
        <section key={folder === '' ? '(sans dossier)' : folder} className="space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {folder === '' ? 'Sans dossier' : `📁 ${folder}`}
          </h3>
          <ul className="divide-y divide-zinc-800/60 rounded-lg border border-zinc-800">
            {list.map(({ craft, unitCost, marginPct }) => {
              const entry = entryById.get(craft.itemId);
              return (
                <li key={craft.id} className="flex items-center gap-3 px-3 py-2">
                  <ItemIcon icon={entry?.i ?? null} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{craft.name}</span>
                    <span className="text-xs text-zinc-500">
                      {entry?.n ?? `Objet ${craft.itemId}`} × {craft.quantity} ·{' '}
                      {new Date(craft.updatedAt).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <span className="text-right text-sm tabular-nums">
                    {unitCost !== null ? `${formatKamas(unitCost)} K` : <span className="text-zinc-500">coût ?</span>}
                    {marginPct !== null && (
                      <span
                        className={`block text-xs ${marginPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                      >
                        {marginPct >= 0 ? '+' : ''}
                        {marginPct.toFixed(1)} %
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpen(craft)}
                    className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                  >
                    Ouvrir
                  </button>
                  {confirmDelete === craft.id ? (
                    <span className="flex items-center gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(craft.id);
                          setConfirmDelete(null);
                        }}
                        className="text-red-400 underline"
                      >
                        confirmer
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)} className="text-zinc-400 underline">
                        non
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(craft.id)}
                      aria-label={`Supprimer ${craft.name}`}
                      className="px-1 text-xs text-zinc-600 hover:text-red-400"
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
