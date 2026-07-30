import { useState } from 'react';
import { formatKamas, parseKamas } from '../../engine/index.ts';

interface PriceInputProps {
  /** prix actuel en kamas (null = non renseigné) */
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  placeholder?: string;
}

/**
 * Champ de prix en kamas : accepte « 350k », « 1.2m », « 12 000 »…
 * Affiche le montant formaté hors édition ; une saisie invalide est
 * signalée et n'écrase jamais la valeur précédente.
 */
export function PriceInput({ value, onChange, label, placeholder }: PriceInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const invalid = editing && draft.trim() !== '' && parseKamas(draft) === null;

  const commit = () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    if (trimmed === '') onChange(null);
    else {
      const parsed = parseKamas(trimmed);
      if (parsed !== null) onChange(parsed);
      // saisie invalide : on garde l'ancienne valeur
    }
    setDraft(null);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid}
      placeholder={placeholder ?? 'prix'}
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
          event.currentTarget.blur();
        }
      }}
      className={`w-28 rounded border bg-zinc-900 px-2 py-1 text-right tabular-nums outline-none focus:border-amber-500 ${
        invalid ? 'border-red-500' : 'border-zinc-700'
      }`}
    />
  );
}
