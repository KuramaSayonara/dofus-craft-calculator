import { useState } from 'react';
import { formatKamas, type CostNode, type SourcingMode } from '../../engine/index.ts';
import type { SearchEntry } from '../data.ts';
import type { PriceEntry } from '../state.ts';
import { ItemIcon } from './ItemIcon.tsx';
import { PriceInput } from './PriceInput.tsx';

interface CraftTreeProps {
  root: CostNode;
  /** nombre de crafts de la racine */
  quantity: number;
  entryById: ReadonlyMap<number, SearchEntry>;
  /** entrées de prix horodatées (pastilles de fraîcheur) */
  priceEntries: ReadonlyMap<number, PriceEntry>;
  modes: ReadonlyMap<number, SourcingMode>;
  onModeChange: (itemId: number, mode: SourcingMode) => void;
  onPriceChange: (itemId: number, value: number | null) => void;
}

const MODE_OPTIONS: ReadonlyArray<readonly [SourcingMode, string]> = [
  ['auto', 'Auto'],
  ['buy', 'Achat'],
  ['craft', 'Craft'],
];

function ModeSwitch({
  itemName,
  value,
  onChange,
}: {
  itemName: string;
  value: SourcingMode;
  onChange: (mode: SourcingMode) => void;
}) {
  return (
    <div role="group" aria-label={`Approvisionnement de ${itemName}`} className="flex overflow-hidden rounded border border-zinc-700 text-xs">
      {MODE_OPTIONS.map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
          className={`px-2 py-1 ${
            value === mode
              ? 'bg-amber-500/20 font-medium text-amber-300'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SavingsBadge({ node }: { node: CostNode }) {
  if (!node.craftable || node.craftSavings === null) return null;
  if (node.craftSavings > 0) {
    return (
      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-400">
        craft −{formatKamas(node.craftSavings)} K
      </span>
    );
  }
  return (
    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
      craft +{formatKamas(-node.craftSavings)} K
    </span>
  );
}

const SOURCE_LABELS: Record<CostNode['source'], string> = {
  buy: 'acheté',
  craft: 'crafté',
  unknown: 'prix ?',
};

/** Arbre de craft dépliable avec arbitrage acheter / crafter par ingrédient. */
export function CraftTree(props: CraftTreeProps) {
  const { root, quantity, entryById, priceEntries, modes, onModeChange, onPriceChange } = props;
  // état d'expansion par chemin (un même objet peut apparaître dans
  // plusieurs branches et se déplier indépendamment)
  const [expanded, setExpanded] = useState<ReadonlyMap<string, boolean>>(new Map());

  const toggle = (key: string, fallback: boolean) => {
    setExpanded(previous => {
      const next = new Map(previous);
      next.set(key, !(previous.get(key) ?? fallback));
      return next;
    });
  };

  function renderNode(node: CostNode, neededQty: number, depth: number, pathKey: string) {
    const entry = entryById.get(node.itemId);
    const name = entry?.n ?? `Objet ${node.itemId}`;
    const hasChildren = node.children.length > 0;
    const defaultOpen = node.source === 'craft';
    const open = expanded.get(pathKey) ?? defaultOpen;
    const totalCost = node.unitCost !== null ? node.unitCost * neededQty : null;

    return (
      <li key={pathKey}>
        <div
          className="flex min-w-[560px] items-center gap-2 border-b border-zinc-800/60 py-1.5 pr-3"
          style={{ paddingLeft: `${depth * 1.25}rem` }}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${open ? 'Replier' : 'Déplier'} ${name}`}
              onClick={() => toggle(pathKey, defaultOpen)}
              className="w-5 shrink-0 text-zinc-400 hover:text-zinc-100"
            >
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <ItemIcon icon={entry?.i ?? null} />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm">
              {name} <span className="tabular-nums text-zinc-400">× {formatKamas(neededQty)}</span>
            </span>
            <span className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">
              {node.craftable && <span>{SOURCE_LABELS[node.source]}</span>}
              {node.cycle && (
                <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-400">cycle coupé</span>
              )}
              {node.depthLimited && (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-400">profondeur max</span>
              )}
              {!node.craftable && node.buyUnitPrice === null && (
                <span className="text-amber-400">prix à renseigner</span>
              )}
            </span>
          </div>
          <SavingsBadge node={node} />
          {node.craftable && (
            <ModeSwitch
              itemName={name}
              value={modes.get(node.itemId) ?? 'auto'}
              onChange={mode => onModeChange(node.itemId, mode)}
            />
          )}
          <PriceInput
            value={node.buyUnitPrice}
            onChange={value => onPriceChange(node.itemId, value)}
            label={`Prix unitaire de ${name}`}
            withLot
            {...(priceEntries.get(node.itemId) !== undefined
              ? { timestamp: priceEntries.get(node.itemId)!.t }
              : {})}
          />
          <span className="w-28 shrink-0 text-right text-sm tabular-nums">
            {totalCost !== null ? `${formatKamas(totalCost)} K` : <span className="text-zinc-500">—</span>}
          </span>
        </div>
        {hasChildren && open && (
          <ul>
            {node.children.map(child =>
              renderNode(
                child.node,
                neededQty * child.quantityPerCraft,
                depth + 1,
                `${pathKey}/${child.node.itemId}`,
              ),
            )}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="overflow-x-auto">
      <ul aria-label="Arbre de craft">
        {root.children.map(child =>
          renderNode(child.node, child.quantityPerCraft * quantity, 0, `r/${child.node.itemId}`),
        )}
      </ul>
    </div>
  );
}
