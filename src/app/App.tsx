import { useEffect, useMemo, useState } from 'react';
import { graphFromRecipesFile, type PriceBook } from '../engine/index.ts';
import { loadRecipes, loadSearchIndex, type RecipesFile, type SearchEntry } from './data.ts';
import { prepareIndex } from './search.ts';
import { CraftSheet } from './components/CraftSheet.tsx';
import { SearchBox } from './components/SearchBox.tsx';

export function App() {
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [recipesFile, setRecipesFile] = useState<RecipesFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SearchEntry | null>(null);
  const [prices, setPrices] = useState<PriceBook>(new Map());
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    // l'index d'abord (la recherche devient utilisable), les recettes suivent
    loadSearchIndex().then(setIndex).catch((error: unknown) => setLoadError(String(error)));
    loadRecipes().then(setRecipesFile).catch((error: unknown) => setLoadError(String(error)));
  }, []);

  const prepared = useMemo(() => (index !== null ? prepareIndex(index) : null), [index]);
  const entryById = useMemo(
    () => new Map((index ?? []).map(entry => [entry.id, entry])),
    [index],
  );
  const graph = useMemo(
    () => (recipesFile !== null ? graphFromRecipesFile(recipesFile) : null),
    [recipesFile],
  );

  const setPrice = (itemId: number, value: number | null) => {
    setPrices(previous => {
      const next = new Map(previous);
      if (value === null) next.delete(itemId);
      else next.set(itemId, value);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold">
          Calculateur de craft <span className="font-normal text-zinc-400">— Dofus 3</span>
        </h1>
        <p className="text-xs text-zinc-500">
          Les prix ne sont pas encore sauvegardés (persistance prévue en Phase 5).
        </p>
      </header>

      {loadError !== null && (
        <p role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          Impossible de charger les données du jeu : {loadError}
        </p>
      )}

      {prepared !== null ? (
        <div className="space-y-5">
          <SearchBox
            index={prepared}
            onSelect={entry => {
              setSelected(entry);
              setQuantity(1);
            }}
          />
          {selected !== null &&
            (graph !== null && recipesFile !== null ? (
              <CraftSheet
                entry={selected}
                graph={graph}
                jobs={recipesFile.jobs}
                entryById={entryById}
                prices={prices}
                onPriceChange={setPrice}
                quantity={quantity}
                onQuantityChange={setQuantity}
              />
            ) : (
              <p className="text-sm text-zinc-400">Chargement des recettes…</p>
            ))}
          {selected === null && (
            <p className="text-sm text-zinc-500">
              Recherche un objet craftable pour afficher sa fiche : ingrédients, coût du craft,
              seuil de rentabilité.
            </p>
          )}
        </div>
      ) : loadError === null ? (
        <p className="text-sm text-zinc-400">Chargement de l'index des objets…</p>
      ) : null}
    </div>
  );
}
