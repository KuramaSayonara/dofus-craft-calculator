import { useMemo, useState } from 'react';
import {
  computeYields,
  evaluateBrisage,
  formatKamas,
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
  /** taux de référence du profil, utilisé faute de mieux */
  referenceCoefficient: number | null;
  onCoefficientChange: (value: number | null) => void;
  craftCost: number | null;
  marketPrice: number | null;
  taxRate: number;
  marginalThresholdPct: number;
}

const ROLL_LABELS: Record<RollMode, string> = {
  min: 'Jets minimum',
  average: 'Jets moyens',
  max: 'Jets maximum',
};

const VERDICT_STYLE = {
  profitable: 'text-emerald-400',
  marginal: 'text-amber-400',
  loss: 'text-red-400',
} as const;

const VERDICT_LABEL = {
  profitable: 'Rentable',
  marginal: 'Marginal',
  loss: 'Perdant',
} as const;

const signed = (value: number): string => `${value >= 0 ? '+' : '−'}${formatKamas(Math.abs(value))}`;

/**
 * Brisage d'un objet : ce qu'il rend en runes, ce que ça vaut, et surtout
 * jusqu'où c'est rentable — prix plafond et coefficient plancher.
 *
 * Rien n'est deviné : sans coefficient saisi, la section demande le taux
 * affiché en jeu au lieu d'en inventer un ; une rune sans prix compte pour
 * zéro et le dit.
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

  // le taux de l'objet prime ; à défaut le taux de référence du profil, signalé
  const rate = coefficient?.p ?? referenceCoefficient ?? null;
  const rateIsReference = coefficient === null && referenceCoefficient !== null;

  const ranking = useMemo(
    () => (rate === null ? [] : rankFocus(item, table, prices, { coefficient: rate, roll }, taxRate)),
    [item, table, prices, rate, roll, taxRate],
  );

  const focus = focusChoice === 'auto' ? (ranking[0]?.key ?? null) : focusChoice;

  const evaluation = useMemo(() => {
    if (rate === null) return null;
    return evaluateBrisage({
      item, table, prices,
      cost: craftCost ?? 0,
      options: { coefficient: rate, roll, focus },
      taxRate,
      marginalThresholdPct,
    });
  }, [item, table, prices, rate, roll, focus, craftCost, taxRate, marginalThresholdPct]);

  // toutes les runes que l'objet peut rendre : celles à prix manquant doivent
  // rester saisissables même quand on regarde un focus qui ne les produit pas
  const allRunes = useMemo(() => {
    const keys = [...new Set(item.lines.map(line => line.key))];
    return keys.map(key => table.get(key)).filter(rune => rune !== undefined);
  }, [item, table]);

  const rateInput = (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-zinc-400">Coefficient</span>
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
        placeholder="38"
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
        className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right tabular-nums outline-none focus:border-amber-500"
      />
      <span className="text-zinc-400">%</span>
    </label>
  );

  return (
    <section className="space-y-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-sm font-medium text-sky-300">🔨 Brisage</h3>
        {rateInput}
        <select
          aria-label="Jets de l'objet"
          value={roll}
          onChange={event => setRoll(event.target.value as RollMode)}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-300"
        >
          {(['average', 'min', 'max'] as const).map(mode => (
            <option key={mode} value={mode}>{ROLL_LABELS[mode]}</option>
          ))}
        </select>
      </div>

      {rate === null && (
        <p className="text-sm text-zinc-400">
          Saisis le <strong className="text-zinc-200">coefficient affiché en jeu</strong> pour cet
          objet (fenêtre de brisage). Il change d'un objet à l'autre et dans le temps : sans lui, le
          site ne peut pas calculer — et il n'inventera pas de valeur.
        </p>
      )}

      {rateIsReference && (
        <p className="text-xs text-amber-400">
          Calcul basé sur ton <strong>taux de référence ({referenceCoefficient} %)</strong>, pas sur
          le taux réel de cet objet. Saisis-le pour un chiffre juste.
        </p>
      )}

      {rate !== null && evaluation !== null && (
        <>
          {/* --- Stratégie : sans focus, ou focus sur une statistique ------- */}
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Stratégie — focaliser concentre tout l'objet sur une seule rune
            </div>
            {ranking.some(option => option.incomplete) && (
              <p className="text-xs text-amber-400">
                Classement incomplet : renseigne les prix manquants plus bas, sinon le « meilleur
                focus » n'est que le mieux placé parmi les runes dont tu connais le prix.
              </p>
            )}
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
                        {index === 0 && <span className="ml-1 text-xs text-emerald-400">← le mieux</span>}
                      </span>
                      {option.incomplete && (
                        <span className="text-xs text-amber-400" title="Il manque un prix de rune">
                          incomplet
                        </span>
                      )}
                      <span className="shrink-0 tabular-nums">{formatKamas(option.netExpected)} K</span>
                      {option.gainPct !== null && option.key !== null && (
                        <span
                          className={`w-14 shrink-0 text-right text-xs tabular-nums ${
                            option.gainPct >= 0 ? 'text-emerald-400' : 'text-zinc-500'
                          }`}
                        >
                          {option.gainPct >= 0 ? '+' : ''}{option.gainPct.toFixed(0)} %
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* --- Runes obtenues -------------------------------------------- */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-1 text-left font-normal">Rune</th>
                  <th className="py-1 text-right font-normal">Obtenues</th>
                  <th className="py-1 text-right font-normal">Prix unitaire</th>
                  <th className="py-1 text-right font-normal">Valeur</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.yields.runes.map(entryYield => {
                  const price = prices.get(entryYield.rune.itemId) ?? null;
                  const timestamp = priceEntries.get(entryYield.rune.itemId)?.t;
                  return (
                    <tr key={entryYield.rune.key} className="border-t border-zinc-800/60">
                      <td className="py-1 pr-2">
                        <span className="text-zinc-200">{entryYield.rune.rune}</span>
                        <span className="ml-1 text-xs text-zinc-500">{entryYield.rune.label}</span>
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        <strong>{entryYield.guaranteed}</strong>
                        {entryYield.chance > 0.005 && (
                          <span className="ml-1 text-xs text-zinc-500">
                            +{Math.round(entryYield.chance * 100)} %
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-2 text-right">
                        <PriceInput
                          value={price}
                          onChange={value => onPriceChange(entryYield.rune.itemId, value)}
                          label={`Prix unitaire de ${entryYield.rune.rune}`}
                          {...(timestamp !== undefined ? { timestamp } : {})}
                        />
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {price !== null ? (
                          `${formatKamas(Math.floor(entryYield.expected * price))} K`
                        ) : (
                          <span className="text-amber-400">prix manquant</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {evaluation.value.missing.length > 0 && (
            <p className="text-xs text-amber-400">
              {evaluation.value.missing.length} rune
              {evaluation.value.missing.length > 1 ? 's' : ''} sans prix : comptée
              {evaluation.value.missing.length > 1 ? 's' : ''} pour zéro. Le gain réel est plus élevé.
            </p>
          )}

          {/* --- Ce que ça rapporte ---------------------------------------- */}
          <div className="grid gap-2 border-t border-sky-500/20 pt-2 sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-zinc-400">Valeur nette moyenne</span>
              <strong className="tabular-nums">{formatKamas(evaluation.value.netExpected)} K</strong>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-zinc-400">Valeur nette garantie</span>
              <strong className="tabular-nums">{formatKamas(evaluation.value.netGuaranteed)} K</strong>
            </div>
          </div>

          {/* --- Jusqu'où c'est rentable ----------------------------------- */}
          <div className="space-y-2 rounded border border-zinc-800 bg-zinc-900/40 p-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Jusqu'où c'est rentable</div>
            <p className="text-sm">
              Ne paie pas cet objet plus de{' '}
              <strong className="tabular-nums text-emerald-300">
                {formatKamas(evaluation.value.netGuaranteed)} K
              </strong>{' '}
              pour gagner à coup sûr, ni plus de{' '}
              <strong className="tabular-nums text-amber-300">
                {formatKamas(evaluation.value.netExpected)} K
              </strong>{' '}
              pour gagner en moyenne.
            </p>

            {(craftCost !== null || marketPrice !== null) && (
              <table className="w-full text-sm">
                <tbody>
                  {craftCost !== null && (
                    <CostRow
                      label="Crafter puis briser"
                      cost={craftCost}
                      net={evaluation.value.netExpected}
                      guaranteed={evaluation.value.netGuaranteed}
                      threshold={marginalThresholdPct}
                    />
                  )}
                  {marketPrice !== null && (
                    <CostRow
                      label="Acheter puis briser"
                      cost={marketPrice}
                      net={evaluation.value.netExpected}
                      guaranteed={evaluation.value.netGuaranteed}
                      threshold={marginalThresholdPct}
                    />
                  )}
                </tbody>
              </table>
            )}

            {craftCost !== null && (
              <p className="text-sm text-zinc-300">
                Coefficient plancher pour ce coût de craft :{' '}
                <strong className="text-zinc-100">
                  {evaluation.minCoefficientExpected === null
                    ? 'hors d’atteinte'
                    : `${evaluation.minCoefficientExpected} %`}
                </strong>
                {evaluation.minCoefficientGuaranteed !== null && (
                  <span className="text-zinc-500">
                    {' '}(garanti : {evaluation.minCoefficientGuaranteed} %)
                  </span>
                )}
                . En dessous, arrête de briser cet objet.
              </p>
            )}
          </div>

          <SensitivityTable
            item={item}
            table={table}
            prices={prices}
            rate={rate}
            roll={roll}
            focus={focus}
            craftCost={craftCost}
            taxRate={taxRate}
          />

          {/* --- Prix des runes que le focus ne produit pas ---------------- */}
          {allRunes.some(rune => prices.get(rune!.itemId) === undefined) && (
            <details className="text-sm" open>
              <summary className="cursor-pointer text-zinc-400">
                Prix des runes de cet objet — à compléter pour comparer les focus
              </summary>
              <ul className="mt-2 space-y-1">
                {allRunes.map(rune => (
                  <li key={rune!.key} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="text-zinc-300">{rune!.rune}</span>
                      <span className="text-xs text-zinc-500">
                        poids {runeWeight(rune!)} · {rune!.label}
                      </span>
                    </span>
                    <PriceInput
                      value={prices.get(rune!.itemId) ?? null}
                      onChange={value => onPriceChange(rune!.itemId, value)}
                      label={`Prix unitaire de ${rune!.rune}`}
                    />
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-xs text-zinc-500">
            {entry.n} · niveau {item.level} · {item.lines.length} ligne
            {item.lines.length > 1 ? 's' : ''} brisable{item.lines.length > 1 ? 's' : ''}. Le brisage
            ne rend que des runes de base ; les Pa et Ra s'obtiennent en les fusionnant au Concasseur.
          </p>
        </>
      )}
    </section>
  );
}

interface CostRowProps {
  label: string;
  cost: number;
  net: number;
  guaranteed: number;
  threshold: number;
}

function CostRow({ label, cost, net, guaranteed, threshold }: CostRowProps) {
  const profit = net - cost;
  const marginPct = cost > 0 ? (profit / cost) * 100 : null;
  const verdict = profit < 0 ? 'loss' : marginPct !== null && marginPct < threshold ? 'marginal' : 'profitable';
  return (
    <tr className="border-t border-zinc-800/60">
      <td className="py-1 pr-2 text-zinc-400">{label}</td>
      <td className="py-1 pr-2 text-right tabular-nums text-zinc-400">{formatKamas(cost)} K</td>
      <td className={`py-1 pr-2 text-right tabular-nums ${VERDICT_STYLE[verdict]}`}>
        {signed(profit)} K
      </td>
      <td className={`py-1 text-right text-xs ${VERDICT_STYLE[verdict]}`}>
        {VERDICT_LABEL[verdict]}
        {guaranteed - cost < 0 && profit >= 0 && (
          <span className="ml-1 text-zinc-500">(pas garanti)</span>
        )}
      </td>
    </tr>
  );
}

interface SensitivityTableProps {
  item: BreakableItem;
  table: RuneTable;
  prices: PriceBook;
  rate: number;
  roll: RollMode;
  focus: string | null;
  craftCost: number | null;
  taxRate: number;
}

/**
 * Le coefficient d'un objet bouge : ce tableau montre où bascule la
 * rentabilité, autour du taux actuel.
 */
function SensitivityTable(props: SensitivityTableProps) {
  const { item, table, prices, rate, roll, focus, craftCost, taxRate } = props;

  const rows = useMemo(() => {
    const steps = [0.5, 0.75, 1, 1.25, 1.5, 2].map(factor => Math.max(1, Math.round(rate * factor)));
    return [...new Set(steps)].map(coefficient => {
      const value = valueOfYields(
        computeYields(item, table, { coefficient, roll, focus }),
        prices,
        taxRate,
      );
      return {
        coefficient,
        net: value.netExpected,
        guaranteed: value.netGuaranteed,
        profit: craftCost === null ? null : value.netExpected - craftCost,
      };
    });
  }, [item, table, prices, rate, roll, focus, craftCost, taxRate]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-zinc-500">
            <th className="py-1 text-left font-normal">Si le coefficient était…</th>
            <th className="py-1 text-right font-normal">Prix plafond</th>
            {craftCost !== null && <th className="py-1 text-right font-normal">Profit au craft</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.coefficient}
              className={`border-t border-zinc-800/60 ${row.coefficient === rate ? 'bg-sky-500/10' : ''}`}
            >
              <td className="py-1 pr-2 tabular-nums">
                {row.coefficient} %{row.coefficient === rate && <span className="ml-1 text-xs text-sky-300">actuel</span>}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{formatKamas(row.net)} K</td>
              {craftCost !== null && (
                <td
                  className={`py-1 text-right tabular-nums ${
                    row.profit === null ? '' : row.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {row.profit === null ? '—' : `${signed(row.profit)} K`}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
