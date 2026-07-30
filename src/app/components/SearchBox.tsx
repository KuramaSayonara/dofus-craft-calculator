import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecipesFile, SearchEntry } from '../data.ts';
import { searchItems, type PreparedIndex, type SearchOptions } from '../search.ts';
import { ItemIcon } from './ItemIcon.tsx';

interface SearchBoxProps {
  index: PreparedIndex;
  jobs: RecipesFile['jobs'];
  onSelect: (entry: SearchEntry) => void;
}

const CATEGORY_LABELS: Record<SearchEntry['c'], string> = {
  equipment: 'Équipement',
  resources: 'Ressource',
  consumables: 'Consommable',
  quest: 'Quête',
  cosmetics: 'Cosmétique',
};

/** Recherche avec navigation clavier complète et filtres cumulables. */
export function SearchBox({ index, jobs, onSelect }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [craftableOnly, setCraftableOnly] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [type, setType] = useState('');
  const [levelMin, setLevelMin] = useState('');
  const [levelMax, setLevelMax] = useState('');
  const [jobId, setJobId] = useState('');
  const [questOnly, setQuestOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Un clic hors de la zone de recherche referme la liste de résultats.
  // Sans ça, cocher un filtre laissait la liste ouverte par-dessus la fiche.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const types = useMemo(
    () => [...new Set(index.entries.map(entry => entry.t))].sort((a, b) => a.localeCompare(b, 'fr')),
    [index],
  );

  const options = useMemo<SearchOptions>(() => {
    const min = levelMin === '' ? undefined : Number(levelMin);
    const max = levelMax === '' ? undefined : Number(levelMax);
    return {
      craftableOnly,
      limit: 30,
      ...(type !== '' ? { type } : {}),
      ...(min !== undefined && Number.isFinite(min) ? { levelMin: min } : {}),
      ...(max !== undefined && Number.isFinite(max) ? { levelMax: max } : {}),
      ...(jobId !== '' ? { jobId: Number(jobId) } : {}),
      ...(questOnly ? { questDemandedOnly: true } : {}),
    };
  }, [craftableOnly, type, levelMin, levelMax, jobId, questOnly]);

  const activeFilterCount =
    (type !== '' ? 1 : 0) +
    (levelMin !== '' ? 1 : 0) +
    (levelMax !== '' ? 1 : 0) +
    (jobId !== '' ? 1 : 0) +
    (questOnly ? 1 : 0);

  const results = useMemo(() => searchItems(index, query, options), [index, query, options]);

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
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="search-results"
          aria-activedescendant={open ? `search-option-${highlighted}` : undefined}
          aria-label="Rechercher un objet"
          placeholder="Rechercher un objet…"
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
        <button
          type="button"
          onClick={() => {
            // refermer le panneau referme aussi la liste de résultats qu'un
            // changement de filtre avait pu ouvrir
            setShowFilters(show => {
              if (show) setOpen(false);
              return !show;
            });
          }}
          aria-expanded={showFilters}
          className={`shrink-0 rounded-md border px-3 py-2 text-sm ${
            activeFilterCount > 0
              ? 'border-amber-500/40 text-amber-300'
              : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Filtres{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''} {showFilters ? '▴' : '▾'}
        </button>
      </div>

      {showFilters && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-zinc-800 p-3 text-sm">
          <label className="flex items-center gap-2 text-zinc-400">
            <input
              type="checkbox"
              checked={craftableOnly}
              onChange={event => setCraftableOnly(event.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            Craftables uniquement
          </label>
          <label className="flex items-center gap-2 text-zinc-400">
            <input
              type="checkbox"
              checked={questOnly}
              onChange={event => {
                setQuestOnly(event.target.checked);
                setOpen(true);
              }}
              className="h-4 w-4 accent-violet-500"
            />
            📜 Demandé par une quête
          </label>
          <label className="flex items-center gap-2 text-zinc-400">
            Type
            <select
              value={type}
              onChange={event => {
                setType(event.target.value);
                setOpen(true);
              }}
              className="max-w-40 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
            >
              <option value="">Tous</option>
              {types.map(name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-zinc-400">
            Niveau
            <input
              type="number"
              min={0}
              max={200}
              value={levelMin}
              onChange={event => {
                setLevelMin(event.target.value);
                setOpen(true);
              }}
              placeholder="min"
              aria-label="Niveau minimum"
              className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right"
            />
            –
            <input
              type="number"
              min={0}
              max={200}
              value={levelMax}
              onChange={event => {
                setLevelMax(event.target.value);
                setOpen(true);
              }}
              placeholder="max"
              aria-label="Niveau maximum"
              className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right"
            />
          </label>
          <label className="flex items-center gap-2 text-zinc-400">
            Métier
            <select
              value={jobId}
              onChange={event => {
                setJobId(event.target.value);
                setOpen(true);
              }}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
            >
              <option value="">Tous</option>
              {Object.entries(jobs)
                .sort((a, b) => a[1].localeCompare(b[1], 'fr'))
                .map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
        </div>
      )}

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
              {entry.qn !== undefined && (
                <span
                  title={`Réclamé par une quête, ${entry.qn} exemplaire${entry.qn > 1 ? 's' : ''}`}
                  className="shrink-0 rounded bg-violet-500/20 px-1.5 py-0.5 text-xs tabular-nums text-violet-300"
                >
                  📜 ×{entry.qn}
                </span>
              )}
              {/* sur téléphone, seul le niveau tient à côté du nom */}
              <span className="shrink-0 text-xs text-zinc-400">
                <span className="hidden sm:inline">
                  {CATEGORY_LABELS[entry.c]} · {entry.t} ·{' '}
                </span>
                niv. {entry.l}
                {entry.r === 1 ? '' : ' · non craftable'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && (query.trim() !== '' || activeFilterCount > 0) && results.length === 0 && (
        <p className="absolute z-10 mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
          Aucun objet trouvé{craftableOnly ? ' (essaie sans « Craftables uniquement »)' : ''}.
        </p>
      )}
    </div>
  );
}
