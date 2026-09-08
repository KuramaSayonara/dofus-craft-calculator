import { useMemo, useState } from 'react';
import {
  computeYields,
  formatKamas,
  minCoefficient,
  rankFocus,
  runeWeight,
  valueOfYields,
  type BreakableItem,
  type PriceBook,
  type RollMode,
  type RuneTable,
} from '../../engine/index.ts';
import type { SearchEntry } from '../data.ts';
import type { PriceEntry } from '../state.ts';
import { ageLabel, freshnessOf } from '../lib/freshness.ts';
import { PriceInput } from './PriceInput.tsx';

interface BrisageSectionProps {
  entry: SearchEntry;
  item: BreakableItem;
  table: RuneTable;
  prices: PriceBook;
  priceEntries: ReadonlyMap<number, PriceEntry>;
  onPriceChange: (itemId: number, value: number | null) => void;
  /** coefficient relevé sur CET objet (le jeu le fait varier objet par objet) */
  coefficient: PriceEntry | null;
  referenceCoefficient: number | null;
  onCoefficientChange: (value: number | null) => void;
  craftCost: number | null;
  marketPrice: number | null;
  taxRate: number;
  marginalThresholdPct: number;
}

/** Coefficient de référence des calculs quand le vrai n'est pas connu. */
const BASE = 100;

const ROLL_LABELS: Record<RollMode, string> = {
  min: 'Jets minimum',
  average: 'Jets moyens',
  max: 'Jets maximum',
};

const signed = (value: number): string => `${value >= 0 ? '+' : '−'}${formatKamas(Math.abs(value))}`;

/**
 * Brisage d'un objet, dans l'ordre où les questions se posent vraiment :
 *
 *   1. le prix des runes qu'il rend ;
 *   2. quel focus faire — ce choix NE DÉPEND PAS du coefficient, puisque
 *      celui-ci multiplie toutes les lignes dans la même proportion ;
 *   3. combien ça rapporte, et surtout à partir de quel coefficient c'est
 *      rentable — le coefficient ne se connaît qu'au moment de briser.
 *
 * Il est donc facultatif : sans lui, le site répond « il t'en faut au moins
 * X % », ce qui se compare d'un coup d'œil au taux affiché en jeu.
 */
export function BrisageSection(props: BrisageSectionProps) {
  const {
    entry, item, table, prices, priceEntries, onPriceChange,
    coefficient, referenceCoefficient, onCoefficientChange,
    craftCost, marketPrice, taxRate, marginalThresholdPct,
  } = props;

  const [roll, setRoll] = useState<RollMode>('average');
  const [focusChoice, setFocusChoice] = useState<'auto' | string | null>('auto');
  const [draft, setDraft] = useState<string | null>(null);

  const rate = coefficient?.p ?? referenceCoefficient ?? null;
  const rateIsReference = coefficient === null && referenceCoefficient !== null;

  // Les runes de l'objet, dans l'ordre de ses lignes. Cette liste ne bouge
  // JAMAIS, quel que soit le focus : on saisit ses prix au calme, sans voir
  // les champs disparaître sous ses doigts.
  const lines = useMemo(() => {
    const seen = new Set<string>();
    const rows: { line: { key: string; min: number; max: number }; rune: NonNullable<ReturnType<RuneTable['get']>> }[] = [];
    for (const line of item.lines) {
      if (seen.has(line.key)) continue;
      const rune = table.get(line.key);
      if (rune === undefined) continue;
      seen.add(line.key);
      rows.push({ line, rune });
    }
    return rows;
  }, [item, table]);

  /** quantités obtenues à 100 %, sans focus : la base de comparaison */
  const baseCount = useMemo(() => {
    const yields = computeYields(item, table, { coefficient: BASE, roll });
    return new Map(yields.runes.map(entryYield => [entryYield.rune.key, entryYield.expected]));
  }, [item, table, roll]);

  // Le classement des focus est indépendant du coefficient : calculé à 100 %,
  // il reste valable à n'importe quel taux.
  const ranking = useMemo(
    () => rankFocus(item, table, prices, { coefficient: BASE, roll }, taxRate),
    [item, table, prices, roll, taxRate],
  );
  const focus = focusChoice === 'auto' ? (ranking[0]?.key ?? null) : focusChoice;

  const missing = lines.filter(row => prices.get(row.rune.itemId) === undefined);

  /** valeur nette du brisage à un coefficient donné, avec le focus courant */
  const valueAt = useMemo(() => {
    return (percent: number) =>
      valueOfYields(
        computeYields(item, table, { coefficient: percent, roll, focus }),
        prices,
        taxRate,
      );
  }, [item, table, prices, roll, focus, taxRate]);

  const atBase = useMemo(() => valueAt(BASE), [valueAt]);
  const atRate = rate === null ? null : valueAt(rate);

  const cost = craftCost ?? marketPrice ?? null;
  const costLabel = craftCost !== null ? 'ton coût de craft' : "le prix d'achat";

  const floor = useMemo(() => {
    if (cost === null) return null;
    const input = { item, table, prices, cost, options: { roll, focus }, taxRate };
    return {
      expected: minCoefficient(input, 'expected'),
      guaranteed: minCoefficient(input, 'guaranteed'),
    };
  }, [item, table, prices, cost, roll, focus, taxRate]);

  return (
    <section className="space-y-4 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-sm font-medium text-sky-300">🔨 Brisage</h3>
        <span className="text-xs text-zinc-500">
          niveau {item.level} · {lines.length} rune{lines.length > 1 ? 's' : ''}
        </span>
        <select
          aria-label="Jets de l'objet"
          value={roll}
          onChange={event => setRoll(event.target.value as RollMode)}
          className="ml-auto rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-300"
        >
          {(['average', 'min', 'max'] as const).map(mode => (
            <option key={mode} value={mode}>{ROLL_LABELS[mode]}</option>
          ))}
        </select>
      </div>

      {/* --- 1. Prix des runes : la seule saisie vraiment indispensable ----- */}
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          1 · Prix des runes que cet objet rend
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-1 text-left font-normal">Ligne de l'objet</th>
                <th className="py-1 text-right font-normal">Runes à 100 %</th>
                <th className="py-1 text-right font-normal">Prix unitaire</th>
                <th
                  className="py-1 text-right font-normal"
                  title="Prix de la rune divisé par son poids : c'est ce chiffre qui décide du meilleur focus"
                >
                  Prix ÷ poids
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ line, rune }) => {
                const price = prices.get(rune.itemId) ?? null;
                const timestamp = priceEntries.get(rune.itemId)?.t;
                const count = baseCount.get(rune.key) ?? 0;
                const best = ranking[0]?.key === rune.key && missing.length === 0;
                return (
                  <tr key={rune.key} className="border-t border-zinc-800/60">
                    <td className="py-1 pr-2">
                      <span className="text-zinc-200">
                        {line.min === line.max ? line.min : `${line.min} à ${line.max}`} {rune.label}
                      </span>
                      <span className="ml-1 text-xs text-zinc-500">{rune.rune}</span>
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-zinc-400">
                      {count.toFixed(count < 10 ? 1 : 0)}
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <PriceInput
                        value={price}
                        onChange={value => onPriceChange(rune.itemId, value)}
                        label={`Prix unitaire de ${rune.rune}`}
                        {...(timestamp !== undefined ? { timestamp } : {})}
                      />
                    </td>
                    <td
                      className={`py-1 text-right tabular-nums ${
                        best ? 'font-medium text-emerald-300' : 'text-zinc-400'
                      }`}
                    >
                      {price !== null ? formatKamas(Math.round(price / runeWeight(rune))) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {missing.length > 0 && (
          <p className="text-xs text-amber-400">
            {missing.length} prix manquant{missing.length > 1 ? 's' : ''} (
            {missing.map(row => row.rune.rune).join(', ')}) : ces runes comptent pour zéro, et le
            classement ci-dessous n'est pas fiable tant qu'elles n'ont pas de prix.
          </p>
        )}
      </div>

      {/* --- 2. Le focus : indépendant du coefficient ---------------------- */}
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          2 · Quel focus faire — ce choix ne dépend pas du coefficient
        </div>
        <ul className="space-y-0.5">
          {ranking.map((option, index) => {
            const active = option.key === focus;
            return (
              <li key={option.key ?? 'none'}>
                <button
                  type="button"
                  onClick={() => setFocusChoice(option.key)}
                  aria-pressed={active}
                  className={`flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-sm ${
                    active ? 'bg-sky-500/20 text-sky-100' : 'text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {option.rune === null ? 'Sans focus' : `Focus ${option.rune.label}`}
                    {index === 0 && missing.length === 0 && (
                      <span className="ml-1 text-xs text-emerald-400">← le mieux</span>
                    )}
                  </span>
                  {option.incomplete && (
                    <span className="text-xs text-amber-400" title="Il manque un prix de rune">
                      incomplet
                    </span>
                  )}
                  <span
                    className="shrink-0 tabular-nums"
                    title="Valeur nette pour un coefficient de 100 %"
                  >
                    {formatKamas(option.netExpected)} K
                  </span>
                  {option.gainPct !== null && option.key !== null && (
                    <span
                      className={`w-14 shrink-0 text-right text-xs tabular-nums ${
                        option.gainPct >= 0 ? 'text-emerald-400' : 'text-zinc-500'
                      }`}
                    >
                      {option.gainPct >= 0 ? '+' : ''}
                      {option.gainPct.toFixed(0)} %
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-zinc-500">
          Montants donnés pour un coefficient de 100 %. Un autre taux les multiplie tous dans la
          même proportion : l'ordre du classement, lui, ne change jamais.
        </p>
      </div>

      {/* --- 3. Rentabilité ------------------------------------------------ */}
      <div className="space-y-2 rounded border border-zinc-800 bg-zinc-900/40 p-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs uppercase tracking-wide text-zinc-500">3 · Est-ce rentable</span>
          <label className="ml-auto flex items-center gap-1.5 text-sm">
            <span className="text-zinc-400">Coefficient de cet objet</span>
            {coefficient !== null && (
              <span
                title={`relevé ${ageLabel(coefficient.t, Date.now())}`}
                className={`h-2 w-2 shrink-0 rounded-full ${
                  { fresh: 'bg-zinc-600', aging: 'bg-amber-400', stale: 'bg-red-500' }[
                    freshnessOf(coefficient.t, Date.now())
                  ]
                }`}
              />
            )}
            <input
              type="text"
              inputMode="numeric"
              aria-label="Coefficient de brisage de cet objet, en pourcent"
              placeholder="facultatif"
              value={draft ?? (coefficient !== null ? String(coefficient.p) : '')}
              onFocus={() => setDraft(coefficient !== null ? String(coefficient.p) : '')}
              onChange={event => setDraft(event.target.value)}
              onBlur={() => {
                if (draft === null) return;
                const trimmed = draft.trim();
                const parsed = Number(trimmed);
                if (trimmed === '') onCoefficientChange(null);
                else if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 4000) {
                  onCoefficientChange(Math.round(parsed));
                }
                setDraft(null);
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') event.currentTarget.blur();
                else if (event.key === 'Escape') {
                  setDraft(null);
                  event.currentTarget.blur();
                }
              }}
              className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right tabular-nums outline-none focus:border-amber-500"
            />
            <span className="text-zinc-400">%</span>
          </label>
        </div>

        {cost === null ? (
          <p className="text-sm text-zinc-400">
            Renseigne le prix des ingrédients (ou le prix d'achat de l'objet) pour savoir à partir
            de quel coefficient briser devient rentable.
          </p>
        ) : (
          <>
            <p className="text-sm">
              Il te faut au moins{' '}
              <strong className="tabular-nums text-sky-200">
                {floor?.expected == null ? 'plus de 4 000' : floor.expected} %
              </strong>{' '}
              de coefficient pour rentrer dans tes frais ({costLabel} :{' '}
              <span className="tabular-nums">{formatKamas(cost)} K</span>)
              {floor?.guaranteed != null && (
                <span className="text-zinc-500"> — {floor.guaranteed} % pour un gain garanti</span>
              )}
              .
            </p>
            <p className="text-xs text-zinc-500">
              Compare ce chiffre au taux affiché dans la fenêtre de brisage, en jeu. En dessous, ne
              brise pas.
            </p>
          </>
        )}

        {rateIsReference && (
          <p className="text-xs text-amber-400">
            Chiffres calculés avec ton taux de référence ({referenceCoefficient} %), pas avec le
            taux réel de cet objet.
          </p>
        )}

        {atRate !== null && rate !== null && (
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t border-zinc-800/60">
                <td className="py-1 pr-2 text-zinc-400">À {rate} %, le brisage rapporte</td>
                <td className="py-1 text-right tabular-nums">
                  {formatKamas(atRate.netExpected)} K
                  <span className="ml-1 text-xs text-zinc-500">
                    ({formatKamas(atRate.netGuaranteed)} garantis)
                  </span>
                </td>
              </tr>
              {craftCost !== null && (
                <ResultRow
                  label="Crafter puis briser"
                  cost={craftCost}
                  net={atRate.netExpected}
                  threshold={marginalThresholdPct}
                />
              )}
              {marketPrice !== null && (
                <ResultRow
                  label="Acheter puis briser"
                  cost={marketPrice}
                  net={atRate.netExpected}
                  threshold={marginalThresholdPct}
                />
              )}
              <tr className="border-t border-zinc-800/60">
                <td className="py-1 pr-2 text-zinc-400">Ne paie jamais cet objet plus de</td>
                <td className="py-1 text-right tabular-nums text-emerald-300">
                  {formatKamas(atRate.netExpected)} K
                </td>
              </tr>
            </tbody>
          </table>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-400">
            Ce que ça donnerait à d'autres coefficients
          </summary>
          <div className="overflow-x-auto">
            <table className="mt-1 w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-1 text-left font-normal">Coefficient</th>
                  <th className="py-1 text-right font-normal">Rapporte</th>
                  {cost !== null && <th className="py-1 text-right font-normal">Profit</th>}
                </tr>
              </thead>
              <tbody>
                {[25, 50, 100, 150, 200, 300, 500].map(percent => {
                  const value = valueAt(percent);
                  const profit = cost === null ? null : value.netExpected - cost;
                  return (
                    <tr
                      key={percent}
                      className={`border-t border-zinc-800/60 ${rate === percent ? 'bg-sky-500/10' : ''}`}
                    >
                      <td className="py-1 pr-2 tabular-nums">{percent} %</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {formatKamas(value.netExpected)} K
                      </td>
                      {profit !== null && (
                        <td
                          className={`py-1 text-right tabular-nums ${
                            profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {signed(profit)} K
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <p className="text-xs text-zinc-500">
        {entry.n} rend {formatKamas(atBase.netExpected)} K net à 100 % de coefficient avec le focus
        choisi. Le brisage ne donne que des runes de base : les Pa et Ra s'obtiennent en fusionnant
        trois runes du palier inférieur au Concasseur.
      </p>
    </section>
  );
}

interface ResultRowProps {
  label: string;
  cost: number;
  net: number;
  threshold: number;
}

function ResultRow({ label, cost, net, threshold }: ResultRowProps) {
  const profit = net - cost;
  const marginPct = cost > 0 ? (profit / cost) * 100 : null;
  const style =
    profit < 0
      ? 'text-red-400'
      : marginPct !== null && marginPct < threshold
        ? 'text-amber-400'
        : 'text-emerald-400';
  return (
    <tr className="border-t border-zinc-800/60">
      <td className="py-1 pr-2 text-zinc-400">
        {label} <span className="tabular-nums text-zinc-500">({formatKamas(cost)} K)</span>
      </td>
      <td className={`py-1 text-right tabular-nums ${style}`}>{signed(profit)} K</td>
    </tr>
  );
}
