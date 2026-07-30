import { useState } from 'react';
import { formatKamas, type ShoppingList } from '../../engine/index.ts';
import type { SearchEntry } from '../data.ts';
import { ItemIcon } from './ItemIcon.tsx';
import { StockInput } from './StockInput.tsx';

interface ShoppingSectionProps {
  list: ShoppingList;
  entryById: ReadonlyMap<number, SearchEntry>;
  inventory: ReadonlyMap<number, number>;
  onStockChange: (itemId: number, quantity: number | null) => void;
  quantity: number;
  itemName: string;
}

/**
 * Liste de courses : ce qu'il reste réellement à acheter une fois le stock
 * déduit. Cases à cocher pour suivre les achats, export texte copiable.
 * À monter avec key={itemId} pour remettre les cases à zéro en changeant d'objet.
 */
export function ShoppingSection(props: ShoppingSectionProps) {
  const { list, entryById, inventory, onStockChange, quantity, itemName } = props;
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  const [copied, setCopied] = useState(false);

  if (list.lines.length === 0) return null;

  const toggle = (itemId: number) => {
    setChecked(previous => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const nameOf = (itemId: number) => entryById.get(itemId)?.n ?? `Objet ${itemId}`;
  const toBuyLines = list.lines.filter(line => line.toBuy > 0);
  const usesStock = list.lines.some(line => line.fromStock > 0);

  const copyText = () => {
    const lines = [
      `Liste de courses — ${quantity} × ${itemName}`,
      ...list.lines.map(line => {
        const price =
          line.lineCost !== null
            ? `${formatKamas(line.lineCost)} K (${formatKamas(line.unitPrice!)} K/u)`
            : 'prix inconnu';
        const stock = line.fromStock > 0 ? ` [${formatKamas(line.fromStock)} déjà en stock]` : '';
        return line.toBuy > 0
          ? `- ${formatKamas(line.toBuy)} × ${nameOf(line.itemId)} — ${price}${stock}`
          : `- ${nameOf(line.itemId)} : rien à acheter (${formatKamas(line.fromStock)} en stock)`;
      }),
      list.totalCost !== null
        ? `À acheter : ${formatKamas(list.totalCost)} K`
        : `À acheter (connu) : ${formatKamas(list.knownCost)} K (${list.unknownCount} prix manquant${list.unknownCount > 1 ? 's' : ''})`,
    ];
    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // clipboard indisponible : rien à faire de mieux que ne pas confirmer
      });
  };

  return (
    <section className="rounded-lg border border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Liste de courses — {checked.size}/{toBuyLines.length} acheté{checked.size > 1 ? 's' : ''}
        </h3>
        <button
          type="button"
          onClick={copyText}
          className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
        >
          {copied ? '✓ Copiée !' : '📋 Copier la liste'}
        </button>
      </div>
      <ul className="divide-y divide-zinc-800/60">
        {list.lines.map(line => {
          const done = checked.has(line.itemId);
          const covered = line.toBuy === 0;
          return (
            <li key={line.itemId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
              <div className={`flex min-w-0 flex-1 basis-48 items-center gap-3 ${done ? 'opacity-50' : ''}`}>
                {covered ? (
                  <span aria-hidden className="w-4 shrink-0 text-center text-sky-400" title="couvert par ton stock">
                    ✓
                  </span>
                ) : (
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggle(line.itemId)}
                    aria-label={`Marquer ${nameOf(line.itemId)} comme acheté`}
                    className="h-4 w-4 shrink-0 accent-amber-500"
                  />
                )}
                <ItemIcon icon={entryById.get(line.itemId)?.i ?? null} />
                <div className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${done ? 'line-through' : ''}`}>
                    {nameOf(line.itemId)}
                  </span>
                  <span className="text-xs text-zinc-500">
                    besoin {formatKamas(line.quantity)}
                    {line.fromStock > 0 && (
                      <span className="text-sky-400"> · stock {formatKamas(line.fromStock)}</span>
                    )}
                    {covered ? (
                      <span className="text-sky-400"> · rien à acheter</span>
                    ) : (
                      <> · à acheter <strong className="text-zinc-300">{formatKamas(line.toBuy)}</strong></>
                    )}
                  </span>
                </div>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <StockInput
                  value={inventory.get(line.itemId) ?? 0}
                  onChange={stock => onStockChange(line.itemId, stock)}
                  itemName={nameOf(line.itemId)}
                  needed={line.quantity}
                />
                <span className="w-24 text-right text-sm tabular-nums sm:w-28">
                  {line.lineCost !== null ? (
                    <span className={covered ? 'text-sky-400' : ''}>{formatKamas(line.lineCost)} K</span>
                  ) : (
                    <span className="text-amber-400">prix ?</span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="space-y-1 border-t border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
        <div className="flex items-center justify-between font-medium">
          <span>À acheter maintenant</span>
          <span className="tabular-nums">
            {list.totalCost !== null ? (
              `${formatKamas(list.totalCost)} K`
            ) : (
              <span className="font-normal text-amber-400">
                {formatKamas(list.knownCost)} K + {list.unknownCount} prix manquant{list.unknownCount > 1 ? 's' : ''}
              </span>
            )}
          </span>
        </div>
        {usesStock && list.stockValue !== null && list.stockValue > 0 && (
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Fourni par ton stock (valeur marchande)</span>
            <span className="tabular-nums text-sky-400">{formatKamas(list.stockValue)} K</span>
          </div>
        )}
      </div>
    </section>
  );
}
