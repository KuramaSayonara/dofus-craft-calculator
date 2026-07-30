import { useMemo } from 'react';
import {
  analyzeCraftCost,
  buildShoppingList,
  formatKamas,
  type PriceBook,
  type RecipeGraph,
  type SourcingMode,
} from '../../engine/index.ts';
import type { RecipesFile, SearchEntry } from '../data.ts';
import { CraftTree } from './CraftTree.tsx';
import { ItemIcon } from './ItemIcon.tsx';
import { ProfitPanel } from './ProfitPanel.tsx';

interface CraftSheetProps {
  entry: SearchEntry;
  graph: RecipeGraph;
  jobs: RecipesFile['jobs'];
  entryById: ReadonlyMap<number, SearchEntry>;
  prices: PriceBook;
  onPriceChange: (itemId: number, value: number | null) => void;
  modes: ReadonlyMap<number, SourcingMode>;
  onModeChange: (itemId: number, mode: SourcingMode) => void;
  quantity: number;
  onQuantityChange: (value: number) => void;
}

/** Fiche de craft : arbre récursif, prix, coût total, rentabilité. */
export function CraftSheet(props: CraftSheetProps) {
  const {
    entry,
    graph,
    jobs,
    entryById,
    prices,
    onPriceChange,
    modes,
    onModeChange,
    quantity,
    onQuantityChange,
  } = props;

  // arbre récursif complet : profondeur par défaut du moteur, arbitrage
  // acheter / crafter / auto par ingrédient via `modes`
  const root = useMemo(
    () => analyzeCraftCost(graph, prices, entry.id, { modes }).root,
    [graph, prices, modes, entry.id],
  );
  const list = useMemo(() => buildShoppingList(root, quantity, prices), [root, quantity, prices]);

  const recipe = graph.get(entry.id);
  if (recipe === undefined || root.children.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">
        Cet objet n'a pas de recette de craft.
      </p>
    );
  }
  const jobName = recipe.jobId !== null ? (jobs[String(recipe.jobId)] ?? `Métier ${recipe.jobId}`) : null;
  const totalCost = root.craftUnitCost !== null ? root.craftUnitCost * quantity : null;

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <ItemIcon icon={entry.i} size={10} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{entry.n}</h2>
          <p className="text-sm text-zinc-400">
            {entry.t} · niv. {entry.l}
            {jobName !== null && (
              <>
                {' '}· {jobName}
                {recipe.level !== null ? ` niv. ${recipe.level}` : ''}
              </>
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Quantité
          <input
            type="number"
            min={1}
            max={9999}
            value={quantity}
            onChange={event => {
              const parsed = Number(event.target.value);
              onQuantityChange(Number.isInteger(parsed) && parsed >= 1 ? parsed : 1);
            }}
            aria-label="Nombre de crafts"
            className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right tabular-nums outline-none focus:border-amber-500"
          />
        </label>
      </header>

      <section className="rounded-lg border border-zinc-800">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">
          <span>Ingrédients — Auto choisit le moins cher (achat ou craft)</span>
          <span>Prix unitaire · Coût</span>
        </div>
        <CraftTree
          root={root}
          quantity={quantity}
          entryById={entryById}
          modes={modes}
          onModeChange={onModeChange}
          onPriceChange={onPriceChange}
        />
        <div className="flex items-center justify-between gap-2 bg-zinc-900/60 px-3 py-2 font-medium">
          <span>Coût du craft {quantity > 1 ? `(× ${quantity})` : ''}</span>
          <span className="text-right tabular-nums">
            {totalCost !== null ? (
              `${formatKamas(totalCost)} K`
            ) : (
              <span className="font-normal text-amber-400">
                {formatKamas(list.knownCost)} K + {list.unknownCount} prix manquant{list.unknownCount > 1 ? 's' : ''}
              </span>
            )}
          </span>
        </div>
      </section>

      <ProfitPanel
        craftCost={root.craftUnitCost}
        quantity={quantity}
        marketPrice={prices.get(entry.id) ?? null}
        onMarketPriceChange={value => onPriceChange(entry.id, value)}
      />
    </div>
  );
}
