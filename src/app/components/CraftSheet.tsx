import { useMemo } from 'react';
import {
  analyzeCraftCost,
  buildShoppingList,
  formatKamas,
  type PriceBook,
  type RecipeGraph,
} from '../../engine/index.ts';
import type { RecipesFile, SearchEntry } from '../data.ts';
import { ItemIcon } from './ItemIcon.tsx';
import { PriceInput } from './PriceInput.tsx';
import { ProfitPanel } from './ProfitPanel.tsx';

interface CraftSheetProps {
  entry: SearchEntry;
  graph: RecipeGraph;
  jobs: RecipesFile['jobs'];
  entryById: ReadonlyMap<number, SearchEntry>;
  prices: PriceBook;
  onPriceChange: (itemId: number, value: number | null) => void;
  quantity: number;
  onQuantityChange: (value: number) => void;
}

/** Fiche de craft : ingrédients, prix, coût total, rentabilité. */
export function CraftSheet(props: CraftSheetProps) {
  const { entry, graph, jobs, entryById, prices, onPriceChange, quantity, onQuantityChange } = props;

  // Phase 3 : fiche « à plat » — les ingrédients sont achetés à leur prix
  // saisi (maxDepth 1 : pas encore d'arbre récursif, prévu en Phase 4).
  const root = useMemo(
    () => analyzeCraftCost(graph, prices, entry.id, { maxDepth: 1 }).root,
    [graph, prices, entry.id],
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

      <section className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2 font-medium" colSpan={2}>Ingrédient</th>
              <th className="px-3 py-2 text-right font-medium">Qté ×{quantity}</th>
              <th className="px-3 py-2 text-right font-medium">Prix unitaire</th>
              <th className="px-3 py-2 text-right font-medium">Sous-total</th>
            </tr>
          </thead>
          <tbody>
            {root.children.map(child => {
              const ing = entryById.get(child.node.itemId);
              const totalQty = child.quantityPerCraft * quantity;
              const unit = child.node.buyUnitPrice;
              return (
                <tr key={child.node.itemId} className="border-b border-zinc-800/60 last:border-0">
                  <td className="w-10 py-1 pl-3">
                    <ItemIcon icon={ing?.i ?? null} />
                  </td>
                  <td className="px-3 py-1">
                    <span className="block truncate">{ing?.n ?? `Objet ${child.node.itemId}`}</span>
                    {child.node.craftable && (
                      <span className="text-xs text-zinc-500">craftable — arbre en Phase 4</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums text-zinc-300">
                    {formatKamas(totalQty)}
                  </td>
                  <td className="px-3 py-1 text-right">
                    <PriceInput
                      value={unit}
                      onChange={value => onPriceChange(child.node.itemId, value)}
                      label={`Prix unitaire de ${ing?.n ?? child.node.itemId}`}
                    />
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums">
                    {unit !== null ? `${formatKamas(unit * totalQty)} K` : <span className="text-zinc-500">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-900/60 font-medium">
              <td className="px-3 py-2" colSpan={4}>
                Coût du craft {quantity > 1 ? `(× ${quantity})` : ''}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {totalCost !== null ? (
                  `${formatKamas(totalCost)} K`
                ) : (
                  <span className="font-normal text-amber-400">
                    {formatKamas(list.knownCost)} K + {list.unknownCount} prix manquant{list.unknownCount > 1 ? 's' : ''}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
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
