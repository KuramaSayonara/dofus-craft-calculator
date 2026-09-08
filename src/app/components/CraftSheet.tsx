import { useMemo, useState } from 'react';
import {
  analyzeCraftCost,
  buildShoppingList,
  formatKamas,
  netAfterTax,
  type BreakableItem,
  type Inventory,
  type PriceBook,
  type RecipeGraph,
  type RuneTable,
  type SalesVolume,
  type SourcingMode,
} from '../../engine/index.ts';
import type { QuestNeedsFile, RecipesFile, SearchEntry } from '../data.ts';
import type { PriceEntry } from '../state.ts';
import { BrisageSection } from './BrisageSection.tsx';
import { CraftTree } from './CraftTree.tsx';
import { ItemIcon } from './ItemIcon.tsx';
import { ProfitPanel } from './ProfitPanel.tsx';
import { QuestDemandSection } from './QuestDemandSection.tsx';
import { ShoppingSection } from './ShoppingSection.tsx';
import { VolumeSection } from './VolumeSection.tsx';

interface CraftSheetProps {
  entry: SearchEntry;
  graph: RecipeGraph;
  jobs: RecipesFile['jobs'];
  /** besoins de quête (null tant que le fichier n'est pas chargé) */
  questNeeds: QuestNeedsFile | null;
  entryById: ReadonlyMap<number, SearchEntry>;
  prices: PriceBook;
  priceEntries: ReadonlyMap<number, PriceEntry>;
  onPriceChange: (itemId: number, value: number | null) => void;
  inventory: Inventory;
  onStockChange: (itemId: number, quantity: number | null) => void;
  volume: SalesVolume | undefined;
  onVolumeChange: (window: 'd1' | 'd7' | 'd30', value: number | null) => void;
  modes: ReadonlyMap<number, SourcingMode>;
  onModeChange: (itemId: number, mode: SourcingMode) => void;
  quantity: number;
  onQuantityChange: (value: number) => void;
  /** lignes brisables de cet objet (null s'il ne se brise pas) */
  brisage: BreakableItem | null;
  runeTable: RuneTable | null;
  /** coefficient relevé sur cet objet, daté */
  coefficient: PriceEntry | null;
  referenceCoefficient: number | null;
  onCoefficientChange: (value: number | null) => void;
  taxRate: number;
  marginalThresholdPct: number;
  /** nom/dossier pré-remplis quand la fiche vient d'une sauvegarde */
  saveDefaults: { name: string; folder: string } | null;
  onSaveCraft: (name: string, folder: string) => void;
  onListSale: (unitCost: number) => void;
}

/** Fiche de craft : arbre récursif, prix, coût total, rentabilité, actions. */
export function CraftSheet(props: CraftSheetProps) {
  const {
    entry,
    graph,
    jobs,
    questNeeds,
    entryById,
    prices,
    priceEntries,
    onPriceChange,
    inventory,
    onStockChange,
    volume,
    onVolumeChange,
    modes,
    onModeChange,
    quantity,
    onQuantityChange,
    brisage,
    runeTable,
    coefficient,
    referenceCoefficient,
    onCoefficientChange,
    taxRate,
    marginalThresholdPct,
    saveDefaults,
    onSaveCraft,
    onListSale,
  } = props;

  const [saveForm, setSaveForm] = useState<{ name: string; folder: string } | null>(null);
  const [confirmSale, setConfirmSale] = useState(false);

  const root = useMemo(
    () => analyzeCraftCost(graph, prices, entry.id, { modes }).root,
    [graph, prices, modes, entry.id],
  );
  const list = useMemo(
    () => buildShoppingList(root, quantity, prices, inventory),
    [root, quantity, prices, inventory],
  );
  const usesStock = list.lines.some(line => line.fromStock > 0);
  const marketPrice = prices.get(entry.id) ?? null;

  const recipe = graph.get(entry.id);
  const craftable = recipe !== undefined && root.children.length > 0;
  const jobName =
    recipe?.jobId != null ? (jobs[String(recipe.jobId)] ?? `Métier ${recipe.jobId}`) : null;
  const totalCost = root.craftUnitCost !== null ? root.craftUnitCost * quantity : null;

  const header = (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <ItemIcon icon={entry.i} size={10} />
      <div className="min-w-0 flex-1 basis-48">
        <h2 className="text-lg font-semibold">{entry.n}</h2>
        <p className="text-sm text-zinc-400">
          {entry.t} · niv. {entry.l}
          {jobName !== null && (
            <>
              {' '}· {jobName}
              {recipe?.level != null ? ` niv. ${recipe.level}` : ''}
            </>
          )}
        </p>
      </div>
      {craftable && (
        <label className="ml-auto flex items-center gap-2 text-sm text-zinc-400">
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
      )}
    </header>
  );

  // un objet non craftable peut quand même s'acheter pour être brisé :
  // la section brisage doit rester accessible
  const brisageSection =
    brisage !== null && runeTable !== null ? (
      <BrisageSection
        // clé distincte de celle de la liste de courses : deux enfants d'un même
        // parent qui partagent une clé, React en duplique un et perd l'état de
        // l'autre (les champs de prix devenaient inutilisables)
        key={`brisage-${entry.id}`}
        entry={entry}
        item={brisage}
        table={runeTable}
        prices={prices}
        priceEntries={priceEntries}
        onPriceChange={onPriceChange}
        coefficient={coefficient}
        referenceCoefficient={referenceCoefficient}
        onCoefficientChange={onCoefficientChange}
        craftCost={root.craftUnitCost}
        marketPrice={marketPrice}
        taxRate={taxRate}
        marginalThresholdPct={marginalThresholdPct}
      />
    ) : null;

  if (!craftable) {
    return (
      <div className="space-y-4">
        {header}
        <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">
          Cet objet n'a pas de recette de craft.
          {brisageSection !== null && ' Il peut en revanche s’acheter puis se briser.'}
        </p>
        {brisageSection}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      {questNeeds !== null && questNeeds.needs[String(entry.id)] !== undefined && (
        <QuestDemandSection
          needs={questNeeds.needs[String(entry.id)]!}
          categories={questNeeds.categories}
          quantity={quantity}
          onQuantityChange={onQuantityChange}
        />
      )}

      <section className="rounded-lg border border-zinc-800">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">
          <span>Ingrédients — Auto choisit le moins cher (achat ou craft)</span>
          <span>Prix unitaire · Coût</span>
        </div>
        <CraftTree
          root={root}
          quantity={quantity}
          entryById={entryById}
          priceEntries={priceEntries}
          inventory={inventory}
          modes={modes}
          onModeChange={onModeChange}
          onPriceChange={onPriceChange}
          onStockChange={onStockChange}
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

      {brisageSection}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSaveForm(saveDefaults ?? { name: entry.n, folder: '' })}
          className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
        >
          💾 Sauvegarder ce craft
        </button>
        <button
          type="button"
          disabled={root.craftUnitCost === null}
          title={
            root.craftUnitCost === null
              ? 'Renseigne tous les prix pour figer le coût'
              : 'Fige le coût de craft actuel'
          }
          onClick={() => setConfirmSale(true)}
          className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          🏷️ Mettre en vente
        </button>
      </div>

      {saveForm !== null && (
        <form
          onSubmit={event => {
            event.preventDefault();
            if (saveForm.name.trim() === '') return;
            onSaveCraft(saveForm.name.trim(), saveForm.folder.trim());
            setSaveForm(null);
          }}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 p-3 text-sm"
        >
          <label className="flex flex-col gap-1 text-zinc-400">
            Nom de la sauvegarde
            <input
              autoFocus
              value={saveForm.name}
              onChange={event => setSaveForm({ ...saveForm, name: event.target.value })}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100 outline-none focus:border-amber-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-zinc-400">
            Dossier (optionnel)
            <input
              value={saveForm.folder}
              onChange={event => setSaveForm({ ...saveForm, folder: event.target.value })}
              placeholder="ex. : Forgeron"
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100 outline-none focus:border-amber-500"
            />
          </label>
          <button type="submit" className="rounded bg-amber-500/20 px-3 py-1.5 text-amber-300 hover:bg-amber-500/30">
            Enregistrer
          </button>
          <button type="button" onClick={() => setSaveForm(null)} className="px-2 py-1.5 text-zinc-400 hover:text-zinc-200">
            Annuler
          </button>
        </form>
      )}

      {confirmSale && root.craftUnitCost !== null && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 p-3 text-sm">
          <span>
            Mettre en vente <strong>{quantity} × {entry.n}</strong> avec un coût figé de{' '}
            <strong className="tabular-nums">{formatKamas(root.craftUnitCost)} K</strong> l'unité ?
          </span>
          <button
            type="button"
            onClick={() => {
              onListSale(root.craftUnitCost!);
              setConfirmSale(false);
            }}
            className="rounded bg-amber-500/20 px-3 py-1.5 text-amber-300 hover:bg-amber-500/30"
          >
            Confirmer
          </button>
          <button type="button" onClick={() => setConfirmSale(false)} className="px-2 py-1.5 text-zinc-400 hover:text-zinc-200">
            Annuler
          </button>
        </div>
      )}

      <ShoppingSection
        key={entry.id}
        list={list}
        entryById={entryById}
        inventory={inventory}
        onStockChange={onStockChange}
        quantity={quantity}
        itemName={entry.n}
      />

      <VolumeSection
        volume={volume}
        onChange={onVolumeChange}
        quantity={quantity}
        unitProfit={
          root.craftUnitCost !== null && marketPrice !== null
            ? netAfterTax(marketPrice, taxRate) - root.craftUnitCost
            : null
        }
      />

      <ProfitPanel
        craftCost={root.craftUnitCost}
        quantity={quantity}
        marketPrice={marketPrice}
        onMarketPriceChange={value => onPriceChange(entry.id, value)}
        taxRate={taxRate}
        marginalThresholdPct={marginalThresholdPct}
        stock={
          usesStock && list.totalCost !== null && list.stockValue !== null
            ? { cashTotal: list.totalCost, stockValue: list.stockValue }
            : null
        }
      />
    </div>
  );
}
