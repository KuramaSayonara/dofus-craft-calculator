import { useMemo, useState } from 'react';
import {
  analyzeCraftCost,
  buildShoppingList,
  formatKamas,
  type PriceBook,
  type RecipeGraph,
} from '../../engine/index.ts';
import type { SearchEntry } from '../data.ts';
import { buildNameLookup, parseBulkPrices, type BulkResult } from '../lib/bulk-import.ts';
import { ageLabel, freshnessOf } from '../lib/freshness.ts';
import type { PreparedIndex } from '../search.ts';
import {
  modesOfSavedCraft,
  parseAppData,
  type Action,
  type AppData,
  type PriceEntry,
} from '../state.ts';
import type { StorageBackend } from '../storage.ts';
import { ItemIcon } from './ItemIcon.tsx';
import { PriceInput } from './PriceInput.tsx';

interface PricesViewProps {
  data: AppData;
  dispatch: (action: Action) => void;
  prepared: PreparedIndex;
  entryById: ReadonlyMap<number, SearchEntry>;
  priceEntries: ReadonlyMap<number, PriceEntry>;
  prices: PriceBook;
  graph: RecipeGraph;
  backend: StorageBackend | null;
}

/** Gestion des profils, fraîcheur des prix, import en masse, export/import. */
export function PricesView(props: PricesViewProps) {
  const { data, dispatch, prepared, entryById, priceEntries, prices, graph } = props;
  const [newProfileName, setNewProfileName] = useState('');
  const [renameDraft, setRenameDraft] = useState<{ id: string; name: string } | null>(null);
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [bulkReport, setBulkReport] = useState<BulkResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState<AppData | null>(null);

  const now = Date.now();

  // usage de chaque ressource dans les crafts sauvegardés (liste de courses
  // résolue) : sert à prioriser les prix périmés les plus utilisés
  const usage = useMemo(() => {
    const counts = new Map<number, number>();
    for (const craft of data.savedCrafts) {
      if (!graph.has(craft.itemId)) continue;
      const root = analyzeCraftCost(graph, prices, craft.itemId, {
        modes: modesOfSavedCraft(craft),
      }).root;
      for (const line of buildShoppingList(root, craft.quantity, prices).lines) {
        counts.set(line.itemId, (counts.get(line.itemId) ?? 0) + 1);
      }
    }
    return counts;
  }, [data.savedCrafts, graph, prices]);

  const staleRows = useMemo(() => {
    const rows: { itemId: number; entry: PriceEntry; uses: number }[] = [];
    for (const [itemId, entry] of priceEntries) {
      if (freshnessOf(entry.t, now) !== 'fresh') {
        rows.push({ itemId, entry, uses: usage.get(itemId) ?? 0 });
      }
    }
    rows.sort((a, b) => b.uses - a.uses || a.entry.t - b.entry.t);
    return rows.slice(0, 40);
    // `now` volontairement hors dépendances : recalcul au re-rendu suffit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceEntries, usage]);

  const runBulkImport = () => {
    const lookup = buildNameLookup(prepared);
    const result = parseBulkPrices(bulkText, lookup);
    if (result.ok.length > 0) {
      dispatch({
        type: 'import-prices',
        entries: result.ok.map(line => [line.itemId, line.price] as const),
        now: Date.now(),
      });
    }
    setBulkReport(result);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dofus-craft-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = (file: File) => {
    setImportError(null);
    file
      .text()
      .then(text => {
        const parsed = parseAppData(JSON.parse(text) as unknown);
        if (parsed === null) {
          setImportError("Ce fichier n'est pas un export valide de l'application.");
        } else {
          setConfirmImport(parsed);
        }
      })
      .catch(() => setImportError('Fichier illisible (JSON invalide).'));
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
        <h2 className="font-medium">Profils de serveur</h2>
        <p className="text-xs text-zinc-500">
          Chaque serveur a son propre carnet de prix et ses propres ventes. Basculer ne perd rien.
        </p>
        <ul className="space-y-2">
          {data.profiles.map(profile => (
            <li key={profile.id} className="flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => dispatch({ type: 'switch-profile', profileId: profile.id })}
                aria-pressed={profile.id === data.activeProfileId}
                className={`rounded px-2 py-1 ${
                  profile.id === data.activeProfileId
                    ? 'bg-amber-500/15 font-medium text-amber-300'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {profile.name}
              </button>
              <span className="text-xs text-zinc-500">
                {Object.keys(data.prices[profile.id] ?? {}).length} prix
              </span>
              {renameDraft?.id === profile.id ? (
                <form
                  onSubmit={event => {
                    event.preventDefault();
                    dispatch({ type: 'rename-profile', profileId: profile.id, name: renameDraft.name });
                    setRenameDraft(null);
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    autoFocus
                    value={renameDraft.name}
                    onChange={event => setRenameDraft({ id: profile.id, name: event.target.value })}
                    aria-label={`Nouveau nom pour ${profile.name}`}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-sm"
                  />
                  <button type="submit" className="text-amber-300">OK</button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setRenameDraft({ id: profile.id, name: profile.name })}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  renommer
                </button>
              )}
              {data.profiles.length > 1 &&
                (confirmDeleteProfile === profile.id ? (
                  <span className="flex items-center gap-1 text-xs">
                    <span className="text-red-400">supprimer ce profil et ses données ?</span>
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'delete-profile', profileId: profile.id });
                        setConfirmDeleteProfile(null);
                      }}
                      className="text-red-400 underline"
                    >
                      oui
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteProfile(null)} className="text-zinc-400 underline">
                      non
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteProfile(profile.id)}
                    className="text-xs text-zinc-600 hover:text-red-400"
                  >
                    supprimer
                  </button>
                ))}
            </li>
          ))}
        </ul>
        <form
          onSubmit={event => {
            event.preventDefault();
            const name = newProfileName.trim();
            if (name === '') return;
            dispatch({ type: 'add-profile', id: crypto.randomUUID(), name });
            setNewProfileName('');
          }}
          className="flex items-center gap-2"
        >
          <input
            value={newProfileName}
            onChange={event => setNewProfileName(event.target.value)}
            placeholder="Nouveau serveur…"
            aria-label="Nom du nouveau profil"
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm outline-none focus:border-amber-500"
          />
          <button type="submit" className="rounded bg-amber-500/20 px-3 py-1 text-sm text-amber-300 hover:bg-amber-500/30">
            Ajouter
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
        <h2 className="font-medium">Réglages</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2 text-zinc-400">
            Taxe HDV (%)
            <input
              type="number"
              min={0}
              max={50}
              step={0.1}
              value={data.settings.taxRate * 100}
              onChange={event => {
                const pct = Number(event.target.value);
                if (Number.isFinite(pct) && pct >= 0 && pct <= 50) {
                  dispatch({ type: 'set-settings', patch: { taxRate: pct / 100 } });
                }
              }}
              className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right"
            />
          </label>
          <label className="flex items-center gap-2 text-zinc-400">
            Seuil de marge « marginal » (%)
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              value={data.settings.marginalThresholdPct}
              onChange={event => {
                const pct = Number(event.target.value);
                if (Number.isFinite(pct) && pct >= 0 && pct <= 1000) {
                  dispatch({ type: 'set-settings', patch: { marginalThresholdPct: pct } });
                }
              }}
              className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right"
            />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
        <h2 className="font-medium">Prix à rafraîchir</h2>
        <p className="text-xs text-zinc-500">
          Prix de plus de 3 jours, les plus utilisés dans tes sauvegardes d'abord.
        </p>
        {staleRows.length === 0 ? (
          <p className="text-sm text-zinc-500">Rien à rafraîchir — tous tes prix ont moins de 3 jours.</p>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {staleRows.map(row => {
              const entry = entryById.get(row.itemId);
              return (
                <li key={row.itemId} className="flex items-center gap-3 py-1.5">
                  <ItemIcon icon={entry?.i ?? null} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {entry?.n ?? `Objet ${row.itemId}`}
                    <span className="ml-2 text-xs text-zinc-500">
                      {ageLabel(row.entry.t, now)}
                      {row.uses > 0 ? ` · utilisé par ${row.uses} sauvegarde${row.uses > 1 ? 's' : ''}` : ''}
                    </span>
                  </span>
                  <PriceInput
                    value={row.entry.p}
                    onChange={value => dispatch({ type: 'set-price', itemId: row.itemId, value, now: Date.now() })}
                    label={`Nouveau prix de ${entry?.n ?? row.itemId}`}
                    withLot
                    timestamp={row.entry.t}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
        <h2 className="font-medium">Import en masse</h2>
        <p className="text-xs text-zinc-500">
          Une ligne par prix, au format <code className="text-zinc-300">nom;prix</code> — ex. :{' '}
          <code className="text-zinc-300">Bois de Frêne;12</code>
        </p>
        <textarea
          value={bulkText}
          onChange={event => setBulkText(event.target.value)}
          rows={5}
          aria-label="Liste de prix à importer"
          placeholder={'Bois de Frêne;12\nPlume Chimérique;1.5k'}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm outline-none focus:border-amber-500"
        />
        <button
          type="button"
          onClick={runBulkImport}
          disabled={bulkText.trim() === ''}
          className="rounded bg-amber-500/20 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/30 disabled:opacity-40"
        >
          Importer
        </button>
        {bulkReport !== null && (
          <div className="space-y-1 text-sm">
            <p className="text-emerald-400">{bulkReport.ok.length} prix importé{bulkReport.ok.length > 1 ? 's' : ''}.</p>
            {bulkReport.errors.length > 0 && (
              <div className="text-red-300">
                <p>{bulkReport.errors.length} ligne{bulkReport.errors.length > 1 ? 's' : ''} non reconnue{bulkReport.errors.length > 1 ? 's' : ''} :</p>
                <ul className="ml-4 list-disc text-xs">
                  {bulkReport.errors.map(error => (
                    <li key={error.lineNumber}>
                      ligne {error.lineNumber} « {error.text} » — {error.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
        <h2 className="font-medium">Sauvegarde et transfert</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={exportJson}
            className="rounded border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
          >
            ⬇️ Exporter tout (JSON)
          </button>
          <label className="cursor-pointer rounded border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">
            ⬆️ Importer un export…
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file !== undefined) onImportFile(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>
        {importError !== null && <p className="text-sm text-red-300">{importError}</p>}
        {confirmImport !== null && (
          <div className="flex flex-wrap items-center gap-3 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <span>
              Remplacer TOUTES les données actuelles par cet export ({confirmImport.profiles.length}{' '}
              profil{confirmImport.profiles.length > 1 ? 's' : ''}) ?
            </span>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'import-data', data: confirmImport });
                setConfirmImport(null);
              }}
              className="rounded bg-amber-500/20 px-3 py-1 text-amber-300"
            >
              Remplacer
            </button>
            <button type="button" onClick={() => setConfirmImport(null)} className="text-zinc-400 underline">
              Annuler
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
