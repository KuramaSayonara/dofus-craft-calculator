import { useMemo, useRef, useState } from 'react';
import type { SearchEntry } from '../data.ts';
import { searchItems, type PreparedIndex } from '../search.ts';
import { ItemIcon } from './ItemIcon.tsx';

interface SearchBoxProps {
  index: PreparedIndex;
  onSelect: (entry: SearchEntry) => void;
}

const CATEGORY_LABELS: Record<SearchEntry['c'], string> = {
  equipment: 'Équipement',
  resources: 'Ressource',
  consumables: 'Consommable',
  quest: 'Quête',
  cosmetics: 'Cosmétique',
};

/** Recherche avec navigation clavier complète (flèches, Entrée, Échap). */
export function SearchBox({ index, onSelect }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [craftableOnly, setCraftableOnly] = useState(true);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => searchItems(index, query, { craftableOnly, limit: 30 }),
    [index, query, craftableOnly],
  );

  const select = (entry: SearchEntry) => {
    onSelect(entry);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted(h => Math.min(h + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = results[highlighted];
      if (entry !== undefined) select(entry);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="search-results"
          aria-activedescendant={open ? `search-option-${highlighted}` : undefined}
          aria-label="Rechercher un objet"
          placeholder="Rechercher un objet… (ex. : epee dus)"
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-base outline-none placeholder:text-zinc-500 focus:border-amber-500"
        />
        <label className="flex shrink-0 items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={craftableOnly}
            onChange={event => setCraftableOnly(event.target.checked)}
            className="h-4 w-4 accent-amber-500"
          />
          Craftables
        </label>
      </div>

      {open && results.length > 0 && (
        <ul
          id="search-results"
          role="listbox"
          className="absolute z-10 mt-2 max-h-96 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
        >
          {results.map((entry, i) => (
            <li
              key={entry.id}
              id={`search-option-${i}`}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={event => {
                event.preventDefault(); // ne pas voler le focus avant la sélection
                select(entry);
              }}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${
                i === highlighted ? 'bg-zinc-700/60' : ''
              }`}
            >
              <ItemIcon icon={entry.i} />
              <span className="min-w-0 flex-1 truncate">{entry.n}</span>
              <span className="shrink-0 text-xs text-zinc-400">
                {CATEGORY_LABELS[entry.c]} · {entry.t} · niv. {entry.l}
                {entry.r === 1 ? '' : ' · non craftable'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() !== '' && results.length === 0 && (
        <p className="absolute z-10 mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
          Aucun objet trouvé{craftableOnly ? ' (essaie sans le filtre « Craftables »)' : ''}.
        </p>
      )}
    </div>
  );
}
