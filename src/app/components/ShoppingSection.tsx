import { useState } from 'react';
import { formatKamas, type ShoppingList } from '../../engine/index.ts';
import type { SearchEntry } from '../data.ts';
import { ItemIcon } from './ItemIcon.tsx';

interface ShoppingSectionProps {
  list: ShoppingList;
  entryById: ReadonlyMap<number, SearchEntry>;
  quantity: number;
  itemName: string;
}

/**
 * Liste de courses : ressources à acheter après résolution de l'arbre,
 * cases à cocher pour suivre les achats, export texte copiable.
 * À monter avec key={itemId} pour remettre les cases à zéro en changeant d'objet.
 */
export function ShoppingSection({ list, entryById, quantity, itemName }: ShoppingSectionProps) {
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

  const copyText = () => {
    const lines = [
      `Liste de courses — ${quantity} × ${itemName}`,
      ...list.lines.map(line => {
        const price =
          line.lineCost !== null
            ? `${formatKamas(line.lineCost)} K (${formatKamas(line.unitPrice!)} K/u)`
            : 'prix inconnu';
        return `- ${formatKamas(line.quantity)} × ${nameOf(line.itemId)} — ${price}`;
      }),
      list.totalCost !== null
        ? `Total : ${formatKamas(list.totalCost)} K`
        : `Total connu : ${formatKamas(list.knownCost)} K (${list.unknownCount} prix manquant${list.unknownCount > 1 ? 's' : ''})`,
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
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Liste de courses ({checked.size}/{list.lines.length} coché{checked.size > 1 ? 's' : ''})
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
          return (
            <li key={line.itemId}>
              <label
                className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 ${done ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => toggle(line.itemId)}
                  className="h-4 w-4 shrink-0 accent-amber-500"
                />
                <ItemIcon icon={entryById.get(line.itemId)?.i ?? null} />
                <span className={`min-w-0 flex-1 truncate text-sm ${done ? 'line-through' : ''}`}>
                  {nameOf(line.itemId)}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-zinc-300">
                  × {formatKamas(line.quantity)}
                </span>
                <span className="w-28 shrink-0 text-right text-sm tabular-nums">
                  {line.lineCost !== null ? (
                    `${formatKamas(line.lineCost)} K`
                  ) : (
                    <span className="text-amber-400">prix ?</span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm font-medium">
        <span>Total des achats</span>
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
    </section>
  );
}
