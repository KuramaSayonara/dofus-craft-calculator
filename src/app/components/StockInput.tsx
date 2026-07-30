import { useState } from 'react';
import { formatKamas } from '../../engine/index.ts';

interface StockInputProps {
  /** quantité possédée (0 = rien en stock) */
  value: number;
  onChange: (quantity: number | null) => void;
  /** nom de l'objet, pour l'étiquette d'accessibilité */
  itemName: string;
  /** quantité nécessaire, pour signaler un stock suffisant */
  needed?: number;
}

/** Saisie de la quantité déjà possédée en jeu (« j'ai déjà 1000 sauge »). */
export function StockInput({ value, onChange, itemName, needed }: StockInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const covers = needed !== undefined && value >= needed && needed > 0;

  const commit = () => {
    if (draft === null) return;
    const trimmed = draft.replace(/[\s ]/g, '');
    if (trimmed === '') onChange(null);
    else {
      const parsed = Number(trimmed);
      if (Number.isSafeInteger(parsed) && parsed >= 0) onChange(parsed === 0 ? null : parsed);
    }
    setDraft(null);
  };

  return (
    <span className="inline-flex items-center gap-1" title={`Quantité de ${itemName} déjà en ta possession`}>
      <span aria-hidden className="text-xs text-zinc-600">
        📦
      </span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`Quantité de ${itemName} déjà possédée`}
        placeholder="0"
        value={editing ? draft : value > 0 ? formatKamas(value) : ''}
        onFocus={() => setDraft(value > 0 ? String(value) : '')}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            commit();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
        className={`w-16 rounded border bg-zinc-900 px-1.5 py-1 text-right tabular-nums outline-none focus:border-sky-500 sm:w-20 ${
          covers ? 'border-sky-500/50 text-sky-300' : 'border-zinc-700'
        }`}
      />
    </span>
  );
}
