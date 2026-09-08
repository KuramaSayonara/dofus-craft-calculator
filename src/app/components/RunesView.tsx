import { useMemo, useRef, useState } from 'react';
import { formatKamas, runeWeight, type PriceBook, type RuneTable } from '../../engine/index.ts';
import type { SearchEntry } from '../data.ts';
import type { PriceEntry } from '../state.ts';
import { ageLabel, freshnessOf } from '../lib/freshness.ts';
import { readImageText, type OcrProgress } from '../lib/ocr.ts';
import { parseRunePrices, type ParsedRunePrice, type RuneCatalogEntry } from '../lib/rune-ocr.ts';
import { ItemIcon } from './ItemIcon.tsx';
import { PriceInput } from './PriceInput.tsx';

interface RunesViewProps {
  /** toutes les runes de forgemagie du jeu, issues de l'index de recherche */
  runes: readonly SearchEntry[];
  /** table des runes du brisage : donne le poids (52 runes de base) */
  runeTable: RuneTable | null;
  prices: PriceBook;
  priceEntries: ReadonlyMap<number, PriceEntry>;
  onPriceChange: (itemId: number, value: number | null) => void;
  onImportPrices: (entries: ReadonlyArray<readonly [number, number]>) => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'reading'; progress: OcrProgress }
  | { kind: 'review'; rows: readonly ParsedRunePrice[]; ignored: readonly string[]; kept: Set<number> }
  | { kind: 'error'; message: string };

const CONFIDENCE_STYLE = {
  sure: 'text-emerald-400',
  probable: 'text-amber-400',
  douteux: 'text-red-400',
} as const;

const CONFIDENCE_LABEL = {
  sure: 'sûr',
  probable: 'à vérifier',
  douteux: 'douteux',
} as const;

/**
 * Prix des runes : saisie manuelle, et import depuis une capture d'écran de
 * l'hôtel de vente. Rien n'est enregistré sans relecture — la lecture d'image
 * se trompe, l'utilisateur tranche.
 */
export function RunesView(props: RunesViewProps) {
  const { runes, runeTable, prices, priceEntries, onPriceChange, onImportPrices } = props;

  const [search, setSearch] = useState('');
  const [onlyBreakable, setOnlyBreakable] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const fileInput = useRef<HTMLInputElement>(null);

  /** poids par id d'objet, pour la colonne prix ÷ poids */
  const weights = useMemo(() => {
    const map = new Map<number, number>();
    if (runeTable !== null) {
      for (const rune of runeTable.values()) map.set(rune.itemId, runeWeight(rune));
    }
    return map;
  }, [runeTable]);

  const catalog: RuneCatalogEntry[] = useMemo(
    () => runes.map(entry => ({ id: entry.id, name: entry.n, level: entry.l })),
    [runes],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return runes
      .filter(entry => (onlyBreakable ? weights.has(entry.id) : true))
      .filter(entry => needle === '' || entry.n.toLowerCase().includes(needle))
      .sort((a, b) => {
        // les runes dont on connaît le prix rapporté au poids d'abord
        const wa = weights.get(a.id);
        const wb = weights.get(b.id);
        const pa = prices.get(a.id);
        const pb = prices.get(b.id);
        const ra = wa !== undefined && pa !== undefined ? pa / wa : -1;
        const rb = wb !== undefined && pb !== undefined ? pb / wb : -1;
        if (ra !== rb) return rb - ra;
        return a.n.localeCompare(b.n, 'fr');
      });
  }, [runes, search, onlyBreakable, weights, prices]);

  const known = runes.filter(entry => prices.get(entry.id) !== undefined).length;

  const handleImage = async (file: Blob) => {
    setStatus({ kind: 'reading', progress: { label: 'préparation', value: 0 } });
    try {
      const text = await readImageText(file, progress => setStatus({ kind: 'reading', progress }));
      const { rows, ignored } = parseRunePrices(text, catalog);
      if (rows.length === 0) {
        setStatus({
          kind: 'error',
          message:
            'Aucune rune reconnue sur cette image. Vérifie qu’on y voit bien les colonnes Nom, Niveau et Prix moyen, et essaie une capture moins réduite.',
        });
        return;
      }
      setStatus({
        kind: 'review',
        rows,
        ignored,
        kept: new Set(rows.filter(row => row.confidence !== 'douteux').map(row => row.id)),
      });
    } catch (error) {
      setStatus({ kind: 'error', message: String(error instanceof Error ? error.message : error) });
    }
  };

  const applyReview = () => {
    if (status.kind !== 'review') return;
    const entries = status.rows
      .filter(row => status.kept.has(row.id))
      .map(row => [row.id, row.price] as const);
    if (entries.length > 0) onImportPrices(entries);
    setStatus({ kind: 'idle' });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">Prix des runes</h2>
        <span className="text-sm text-zinc-400">
          {known} prix connu{known > 1 ? 's' : ''} sur {runes.length} runes
        </span>
      </header>

      {/* --- Import par capture d'écran ----------------------------------- */}
      <section
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file !== undefined && file.type.startsWith('image/')) void handleImage(file);
        }}
        onPaste={event => {
          const item = [...event.clipboardData.items].find(entry => entry.type.startsWith('image/'));
          const file = item?.getAsFile();
          if (file !== null && file !== undefined) void handleImage(file);
        }}
        className="space-y-2 rounded-lg border border-dashed border-sky-500/40 bg-sky-500/5 p-3"
      >
        <h3 className="text-sm font-medium text-sky-300">📷 Importer depuis une capture de l'hôtel de vente</h3>
        <p className="text-sm text-zinc-400">
          Ouvre l'hôtel de vente sur la catégorie « Rune de forgemagie », fais une capture d'écran,
          et dépose-la ici (ou colle-la avec Ctrl+V). Les noms sont recalés sur le catalogue du jeu
          et le niveau affiché sert de vérification. <strong className="text-zinc-300">Tu relis
          tout avant que quoi que ce soit ne soit enregistré.</strong> L'image ne quitte pas ton
          appareil.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file !== undefined) void handleImage(file);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={status.kind === 'reading'}
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-40"
          >
            Choisir une image…
          </button>
          {status.kind === 'reading' && (
            <span className="text-sm text-zinc-400">
              {status.progress.label}… {Math.round(status.progress.value * 100)} %
              <span className="ml-2 text-xs text-zinc-500">
                (la première lecture télécharge le moteur, ~5 Mo)
              </span>
            </span>
          )}
        </div>

        {status.kind === 'error' && (
          <p className="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-300">
            {status.message}
          </p>
        )}

        {status.kind === 'review' && (
          <div className="space-y-2 rounded border border-zinc-700 bg-zinc-900/60 p-2">
            <p className="text-sm">
              <strong>{status.rows.length} rune{status.rows.length > 1 ? 's' : ''} lue
              {status.rows.length > 1 ? 's' : ''}</strong> — décoche ce qui est faux, corrige un prix
              si besoin, puis enregistre.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-zinc-500">
                    <th className="py-1 text-left font-normal">Garder</th>
                    <th className="py-1 text-left font-normal">Rune</th>
                    <th className="py-1 text-right font-normal">Prix lu</th>
                    <th className="py-1 text-right font-normal">Prix actuel</th>
                    <th className="py-1 text-left font-normal">Lecture</th>
                  </tr>
                </thead>
                <tbody>
                  {status.rows.map(row => {
                    const previous = prices.get(row.id) ?? null;
                    return (
                      <tr key={row.id} className="border-t border-zinc-800/60">
                        <td className="py-1 pr-2">
                          <input
                            type="checkbox"
                            checked={status.kept.has(row.id)}
                            aria-label={`Garder le prix lu pour ${row.name}`}
                            onChange={event => {
                              const kept = new Set(status.kept);
                              if (event.target.checked) kept.add(row.id);
                              else kept.delete(row.id);
                              setStatus({ ...status, kept });
                            }}
                          />
                        </td>
                        <td className="py-1 pr-2 text-zinc-200">
                          {row.name}
                          <span className="ml-1 text-xs text-zinc-500">niv. {row.level}</span>
                        </td>
                        <td className="py-1 pr-2 text-right">
                          <PriceInput
                            value={row.price}
                            onChange={value => {
                              if (value === null) return;
                              setStatus({
                                ...status,
                                rows: status.rows.map(other =>
                                  other.id === row.id ? { ...other, price: value } : other,
                                ),
                              });
                            }}
                            label={`Prix lu pour ${row.name}`}
                          />
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums text-zinc-500">
                          {previous !== null ? `${formatKamas(previous)} K` : '—'}
                        </td>
                        <td className={`py-1 text-xs ${CONFIDENCE_STYLE[row.confidence]}`}>
                          {CONFIDENCE_LABEL[row.confidence]}
                          {row.issue !== undefined && (
                            <span className="text-zinc-500"> · {row.issue}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {status.ignored.length > 0 && (
              <details className="text-xs text-zinc-500">
                <summary className="cursor-pointer">
                  {status.ignored.length} ligne{status.ignored.length > 1 ? 's' : ''} non
                  reconnue{status.ignored.length > 1 ? 's' : ''}, laissée
                  {status.ignored.length > 1 ? 's' : ''} de côté
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {status.ignored.map((line, index) => (
                    <li key={index} className="truncate font-mono">{line}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyReview}
                className="rounded bg-amber-500/20 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/30"
              >
                Enregistrer {status.kept.size} prix
              </button>
              <button
                type="button"
                onClick={() => setStatus({ kind: 'idle' })}
                className="px-2 py-1.5 text-sm text-zinc-400 hover:text-zinc-200"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>

      {/* --- Liste des runes ----------------------------------------------- */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Filtrer une rune…"
            aria-label="Filtrer les runes"
            className="w-48 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm outline-none focus:border-amber-500"
          />
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={onlyBreakable}
              onChange={event => setOnlyBreakable(event.target.checked)}
            />
            Runes du brisage uniquement
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-1 text-left font-normal">Rune</th>
                <th className="py-1 text-right font-normal">Niveau</th>
                <th className="py-1 text-right font-normal">Poids</th>
                <th className="py-1 text-right font-normal">Prix unitaire</th>
                <th
                  className="py-1 text-right font-normal"
                  title="Prix divisé par le poids : plus c'est haut, plus la rune est intéressante à focaliser"
                >
                  Prix ÷ poids
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map(entry => {
                const weight = weights.get(entry.id);
                const price = prices.get(entry.id) ?? null;
                const timestamp = priceEntries.get(entry.id)?.t;
                return (
                  <tr key={entry.id} className="border-t border-zinc-800/60">
                    <td className="py-1 pr-2">
                      <span className="flex items-center gap-2">
                        <ItemIcon icon={entry.i} size={8} />
                        <span className="text-zinc-200">{entry.n}</span>
                        {timestamp !== undefined && price !== null && (
                          <span
                            title={`prix relevé ${ageLabel(timestamp, Date.now())}`}
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              { fresh: 'bg-zinc-600', aging: 'bg-amber-400', stale: 'bg-red-500' }[
                                freshnessOf(timestamp, Date.now())
                              ]
                            }`}
                          />
                        )}
                      </span>
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-zinc-500">{entry.l}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-zinc-500">
                      {weight !== undefined ? weight : '—'}
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <PriceInput
                        value={price}
                        onChange={value => onPriceChange(entry.id, value)}
                        label={`Prix unitaire de ${entry.n}`}
                        {...(timestamp !== undefined ? { timestamp } : {})}
                      />
                    </td>
                    <td className="py-1 text-right tabular-nums text-zinc-300">
                      {price !== null && weight !== undefined
                        ? formatKamas(Math.round(price / weight))
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && (
          <p className="text-sm text-zinc-500">Aucune rune ne correspond à ce filtre.</p>
        )}
      </section>
    </div>
  );
}
