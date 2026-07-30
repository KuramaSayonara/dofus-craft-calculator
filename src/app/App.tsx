import { useEffect, useMemo, useReducer, useState } from 'react';
import { graphFromRecipesFile, netAfterTax, type SourcingMode } from '../engine/index.ts';
import { loadRecipes, loadSearchIndex, type RecipesFile, type SearchEntry } from './data.ts';
import { prepareIndex } from './search.ts';
import {
  defaultAppData,
  modesOfSavedCraft,
  parseAppData,
  priceBookOf,
  priceEntriesOf,
  reduce,
  salesOf,
  type SavedCraft,
} from './state.ts';
import { loadPersisted, persist, type StorageBackend } from './storage.ts';
import { CraftSheet } from './components/CraftSheet.tsx';
import { PricesView } from './components/PricesView.tsx';
import { SalesView } from './components/SalesView.tsx';
import { SavesView } from './components/SavesView.tsx';
import { SearchBox } from './components/SearchBox.tsx';
import { TopCraftsView } from './components/TopCraftsView.tsx';

type View = 'craft' | 'top' | 'prices' | 'saves' | 'sales';

const VIEW_LABELS: Record<View, string> = {
  craft: 'Craft',
  top: 'Top crafts',
  prices: 'Prix',
  saves: 'Sauvegardes',
  sales: 'Ventes',
};

export function App() {
  // données de jeu (statiques)
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [recipesFile, setRecipesFile] = useState<RecipesFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // état persisté
  const [data, dispatch] = useReducer(reduce, undefined, defaultAppData);
  const [hydrated, setHydrated] = useState(false);
  const [backend, setBackend] = useState<StorageBackend | null>(null);

  // état de session (volontairement non persisté)
  const [view, setView] = useState<View>('craft');
  const [selected, setSelected] = useState<SearchEntry | null>(null);
  const [modes, setModes] = useState<ReadonlyMap<number, SourcingMode>>(new Map());
  const [quantity, setQuantity] = useState(1);
  const [editingSave, setEditingSave] = useState<SavedCraft | null>(null);

  useEffect(() => {
    loadSearchIndex().then(setIndex).catch((error: unknown) => setLoadError(String(error)));
    loadRecipes().then(setRecipesFile).catch((error: unknown) => setLoadError(String(error)));
    loadPersisted()
      .then(result => {
        if (result !== null) {
          const parsed = parseAppData(result.raw);
          if (parsed !== null) {
            dispatch({ type: 'import-data', data: parsed });
            setBackend(result.backend);
          }
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  // persistance debouncée : toute modification est écrite ~400 ms plus tard
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void persist(data).then(used => setBackend(used));
    }, 400);
    return () => clearTimeout(timer);
  }, [data, hydrated]);

  const prepared = useMemo(() => (index !== null ? prepareIndex(index) : null), [index]);
  const entryById = useMemo(() => new Map((index ?? []).map(entry => [entry.id, entry])), [index]);
  const graph = useMemo(
    () => (recipesFile !== null ? graphFromRecipesFile(recipesFile) : null),
    [recipesFile],
  );
  const prices = useMemo(() => priceBookOf(data), [data]);
  const priceEntries = useMemo(() => priceEntriesOf(data), [data]);
  const sales = salesOf(data);
  const listedCount = sales.filter(sale => sale.status === 'listed').length;

  const setPrice = (itemId: number, value: number | null) =>
    dispatch({ type: 'set-price', itemId, value, now: Date.now() });

  const setMode = (itemId: number, mode: SourcingMode) => {
    setModes(previous => {
      const next = new Map(previous);
      if (mode === 'auto') next.delete(itemId);
      else next.set(itemId, mode);
      return next;
    });
  };

  const saveCraft = (name: string, folder: string) => {
    if (selected === null) return;
    const now = Date.now();
    const storedModes: Record<string, 'buy' | 'craft'> = {};
    for (const [itemId, mode] of modes) {
      if (mode !== 'auto') storedModes[String(itemId)] = mode;
    }
    dispatch({
      type: 'save-craft',
      craft: {
        id: editingSave?.id ?? crypto.randomUUID(),
        itemId: selected.id,
        name,
        folder,
        quantity,
        modes: storedModes,
        createdAt: editingSave?.createdAt ?? now,
        updatedAt: now,
      },
    });
  };

  const openSavedCraft = (craft: SavedCraft) => {
    const entry = entryById.get(craft.itemId);
    if (entry === undefined) return;
    setSelected(entry);
    setQuantity(craft.quantity);
    setModes(modesOfSavedCraft(craft));
    setEditingSave(craft);
    setView('craft');
  };

  /** ouvre la fiche d'un objet depuis le tableau de bord */
  const openItem = (itemId: number) => {
    const entry = entryById.get(itemId);
    if (entry === undefined) return;
    setSelected(entry);
    setQuantity(1);
    setModes(new Map());
    setEditingSave(null);
    setView('craft');
  };

  const listSale = (unitCost: number) => {
    if (selected === null) return;
    dispatch({
      type: 'list-sale',
      sale: {
        id: crypto.randomUUID(),
        itemId: selected.id,
        quantity,
        listedAt: Date.now(),
        unitCost,
        status: 'listed',
      },
    });
    setView('sales');
  };

  const markSold = (saleId: string, unitSalePrice: number, comment: string) => {
    const sale = sales.find(s => s.id === saleId);
    if (sale === undefined) return;
    const profit = (netAfterTax(unitSalePrice, data.settings.taxRate) - sale.unitCost) * sale.quantity;
    dispatch({ type: 'mark-sold', id: saleId, unitSalePrice, profit, soldAt: Date.now(), comment });
  };

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6">
      <header className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">
            Calculateur de craft <span className="font-normal text-zinc-400">— Dofus 3</span>
          </h1>
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            Serveur
            <select
              value={data.activeProfileId}
              onChange={event => dispatch({ type: 'switch-profile', profileId: event.target.value })}
              aria-label="Profil de serveur actif"
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
            >
              {data.profiles.map(profile => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto">
          {(Object.keys(VIEW_LABELS) as View[]).map(key => (
            <button
              key={key}
              type="button"
              aria-current={view === key ? 'page' : undefined}
              onClick={() => setView(key)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${
                view === key
                  ? 'bg-amber-500/15 font-medium text-amber-300'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              {VIEW_LABELS[key]}
              {key === 'sales' && listedCount > 0 ? ` (${listedCount})` : ''}
            </button>
          ))}
        </nav>
      </header>

      {loadError !== null && (
        <p role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          Impossible de charger les données du jeu : {loadError}
        </p>
      )}

      {prepared === null || graph === null || recipesFile === null || !hydrated ? (
        loadError === null ? <p className="text-sm text-zinc-400">Chargement…</p> : null
      ) : view === 'craft' ? (
        <div className="space-y-5">
          <SearchBox
            index={prepared}
            jobs={recipesFile.jobs}
            onSelect={entry => {
              setSelected(entry);
              setQuantity(1);
              setModes(new Map());
              setEditingSave(null);
            }}
          />
          {selected !== null ? (
            <CraftSheet
              entry={selected}
              graph={graph}
              jobs={recipesFile.jobs}
              entryById={entryById}
              prices={prices}
              priceEntries={priceEntries}
              onPriceChange={setPrice}
              modes={modes}
              onModeChange={setMode}
              quantity={quantity}
              onQuantityChange={setQuantity}
              taxRate={data.settings.taxRate}
              marginalThresholdPct={data.settings.marginalThresholdPct}
              saveDefaults={
                editingSave !== null ? { name: editingSave.name, folder: editingSave.folder } : null
              }
              onSaveCraft={saveCraft}
              onListSale={listSale}
            />
          ) : (
            <p className="text-sm text-zinc-500">
              Recherche un objet craftable pour afficher sa fiche : ingrédients, coût du craft,
              seuil de rentabilité.
            </p>
          )}
        </div>
      ) : view === 'top' ? (
        <TopCraftsView
          graph={graph}
          prices={prices}
          entryById={entryById}
          jobs={recipesFile.jobs}
          taxRate={data.settings.taxRate}
          marginalThresholdPct={data.settings.marginalThresholdPct}
          onOpenItem={openItem}
        />
      ) : view === 'prices' ? (
        <PricesView
          data={data}
          dispatch={dispatch}
          prepared={prepared}
          entryById={entryById}
          priceEntries={priceEntries}
          prices={prices}
          graph={graph}
          backend={backend}
        />
      ) : view === 'saves' ? (
        <SavesView
          crafts={data.savedCrafts}
          entryById={entryById}
          graph={graph}
          prices={prices}
          onOpen={openSavedCraft}
          onDelete={id => dispatch({ type: 'delete-craft', id })}
        />
      ) : (
        <SalesView
          sales={sales}
          entryById={entryById}
          taxRate={data.settings.taxRate}
          onMarkSold={markSold}
          onDelete={id => dispatch({ type: 'delete-sale', id })}
        />
      )}

      <footer className="mt-8 text-xs text-zinc-600">
        Données stockées uniquement sur cet appareil
        {backend !== null ? ` (${backend === 'indexeddb' ? 'IndexedDB' : 'localStorage'})` : ''} — rien
        n'est envoyé en ligne.
      </footer>
    </div>
  );
}
