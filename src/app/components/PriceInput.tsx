import { useState } from 'react';
import { formatKamas, parseKamas, unitPriceFromLot } from '../../engine/index.ts';
import { ageLabel, freshnessOf } from '../lib/freshness.ts';

type LotSize = 1 | 10 | 100;

interface PriceInputProps {
  /** prix unitaire actuel en kamas (null = non renseigné) */
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  placeholder?: string;
  /** affiche le sélecteur de lot ×1/×10/×100 (prix saisi = prix du lot) */
  withLot?: boolean;
  /** horodatage de la saisie → pastille de fraîcheur */
  timestamp?: number;
}

const FRESHNESS_STYLE = {
  fresh: 'bg-zinc-600',
  aging: 'bg-amber-400',
  stale: 'bg-red-500',
} as const;

const FRESHNESS_LABEL = {
  fresh: 'prix récent',
  aging: 'prix à surveiller',
  stale: 'prix périmé',
} as const;

/**
 * Champ de prix en kamas : accepte « 350k », « 1.2m », « 12 000 »…
 * En mode lot, le montant saisi est le prix du lot ; l'unitaire est calculé
 * (arrondi supérieur) et le sélecteur revient sur ×1.
 */
export function PriceInput({ value, onChange, label, placeholder, withLot, timestamp }: PriceInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [lot, setLot] = useState<LotSize>(1);
  const editing = draft !== null;
  const invalid = editing && draft.trim() !== '' && parseKamas(draft) === null;

  const commit = () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    if (trimmed === '') onChange(null);
    else {
      const parsed = parseKamas(trimmed);
      if (parsed !== null) onChange(lot === 1 ? parsed : unitPriceFromLot(parsed, lot));
      // saisie invalide : on garde l'ancienne valeur
    }
    setDraft(null);
    setLot(1);
  };

  const freshness = timestamp !== undefined && value !== null ? freshnessOf(timestamp, Date.now()) : null;

  return (
    <span className="inline-flex items-center gap-1">
      {freshness !== null && (
        <span
          title={`${FRESHNESS_LABEL[freshness]} (${ageLabel(timestamp!, Date.now())})`}
          className={`h-2 w-2 shrink-0 rounded-full ${FRESHNESS_STYLE[freshness]}`}
        />
      )}
      {withLot === true && (
        <select
          aria-label={`Taille du lot pour ${label}`}
          value={lot}
          onChange={event => setLot(Number(event.target.value) as LotSize)}
          className="rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-xs text-zinc-300"
        >
          <option value={1}>×1</option>
          <option value={10}>×10</option>
          <option value={100}>×100</option>
        </select>
      )}
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid}
        placeholder={lot === 1 ? (placeholder ?? 'prix') : `prix du lot ×${lot}`}
        value={editing ? draft : value !== null ? formatKamas(value) : ''}
        onFocus={() => setDraft(value !== null ? String(value) : '')}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            commit();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setDraft(null);
            setLot(1);
            event.currentTarget.blur();
          }
        }}
        className={`w-20 rounded border bg-zinc-900 px-2 py-1 text-right tabular-nums outline-none focus:border-amber-500 sm:w-28 ${
          invalid ? 'border-red-500' : 'border-zinc-700'
        }`}
      />
    </span>
  );
}
