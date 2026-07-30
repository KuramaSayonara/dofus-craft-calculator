import { useState } from 'react';
import {
  breakEvenPrice,
  evaluateSale,
  formatKamas,
  netAfterTax,
  type SaleEvaluation,
  type Verdict,
} from '../../engine/index.ts';
import { PriceInput } from './PriceInput.tsx';

interface ProfitPanelProps {
  /** coût de revient d'UNE unité, stock valorisé au marché (null = prix manquants) */
  craftCost: number | null;
  quantity: number;
  /** prix marché constaté (partagé avec le carnet de prix) */
  marketPrice: number | null;
  onMarketPriceChange: (value: number | null) => void;
  taxRate: number;
  marginalThresholdPct: number;
  /** présent seulement si du stock possédé couvre une partie des ressources */
  stock: { cashTotal: number; stockValue: number } | null;
}

const VERDICTS: Record<Verdict, { label: string; cls: string }> = {
  profitable: { label: 'Rentable', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' },
  marginal: { label: 'Marginal', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/40' },
  loss: { label: 'À perte', cls: 'bg-red-500/15 text-red-400 border-red-500/40' },
};

export function SaleColumn({ title, sale, quantity }: { title: string; sale: SaleEvaluation; quantity: number }) {
  const verdict = VERDICTS[sale.verdict];
  return (
    <div className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-zinc-300">{title}</h4>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${verdict.cls}`}>
          {verdict.label}
        </span>
      </div>
      <dl className="space-y-1 text-sm tabular-nums">
        <div className="flex justify-between text-zinc-400">
          <dt>Taxe</dt>
          <dd>−{formatKamas(sale.tax)} K</dd>
        </div>
        <div className="flex justify-between text-zinc-400">
          <dt>Net après taxe</dt>
          <dd>{formatKamas(sale.net)} K</dd>
        </div>
        <div className="flex justify-between font-medium">
          <dt>Profit / craft</dt>
          <dd className={sale.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {sale.profit >= 0 ? '+' : ''}
            {formatKamas(sale.profit)} K
          </dd>
        </div>
        {quantity > 1 && (
          <div className="flex justify-between font-medium">
            <dt>Profit × {quantity}</dt>
            <dd className={sale.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {sale.totalProfit >= 0 ? '+' : ''}
              {formatKamas(sale.totalProfit)} K
            </dd>
          </div>
        )}
        <div className="flex justify-between text-zinc-400">
          <dt>Marge</dt>
          <dd>{sale.marginPct !== null ? `${sale.marginPct.toFixed(1)} %` : '—'}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Rentabilité : seuil d'équilibre, comparaison prix marché / prix envisagé. */
export function ProfitPanel(props: ProfitPanelProps) {
  const { craftCost, quantity, marketPrice, onMarketPriceChange, taxRate, marginalThresholdPct, stock } =
    props;
  const [myPrice, setMyPrice] = useState<number | null>(null);

  if (craftCost === null) {
    return (
      <section className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">
        <h3 className="mb-1 font-medium text-zinc-200">Rentabilité</h3>
        Renseigne le prix de tous les ingrédients pour calculer la rentabilité.
      </section>
    );
  }

  const breakEven = breakEvenPrice(craftCost, taxRate);

  // Vue « trésorerie » : ce qui sort réellement de ta bourse une fois le stock
  // déduit. Le coût unitaire est arrondi au kama supérieur pour ne jamais
  // annoncer un seuil trop optimiste.
  const cashUnitCost =
    stock !== null && quantity > 0 ? Math.ceil(stock.cashTotal / quantity) : null;
  const cashBreakEven = cashUnitCost !== null ? breakEvenPrice(cashUnitCost, taxRate) : null;

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-zinc-200">Rentabilité</h3>
        <span className="text-xs text-zinc-500">
          taxe HDV {(taxRate * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %
        </span>
      </div>

      <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm">
        <span className="text-zinc-300">Prix de vente minimum pour être à l'équilibre : </span>
        <strong className="tabular-nums text-amber-400">{formatKamas(breakEven)} K</strong>
        {stock !== null && (
          <span className="block text-xs text-zinc-500">
            coût de revient complet, ton stock compté à sa valeur marchande
          </span>
        )}
      </p>

      {stock !== null && cashBreakEven !== null && (
        <div className="space-y-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm">
          <p className="font-medium text-sky-300">📦 En comptant ton stock</p>
          <div className="flex justify-between text-zinc-300">
            <span>Kamas à sortir pour {quantity} craft{quantity > 1 ? 's' : ''}</span>
            <span className="tabular-nums">{formatKamas(stock.cashTotal)} K</span>
          </div>
          <div className="flex justify-between text-zinc-300">
            <span>Prix de vente pour rentrer dans tes frais</span>
            <span className="tabular-nums text-sky-300">{formatKamas(cashBreakEven)} K</span>
          </div>
          {marketPrice !== null &&
            (() => {
              const gain = netAfterTax(marketPrice, taxRate) * quantity - stock.cashTotal;
              return (
                <div className="flex justify-between font-medium">
                  <span className="text-zinc-300">
                    Kamas en poche si tu vends {quantity > 1 ? `les ${quantity} ` : ''}à{' '}
                    {formatKamas(marketPrice)} K
                  </span>
                  <span className={`tabular-nums ${gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {gain >= 0 ? '+' : ''}
                    {formatKamas(gain)} K
                  </span>
                </div>
              );
            })()}
          <p className="text-xs text-zinc-500">
            Tu possèdes déjà pour {formatKamas(stock.stockValue)} K de ressources. Attention : les
            revendre telles quelles rapporterait aussi des kamas — le seuil du dessus reste le vrai
            juge de la rentabilité.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2 text-zinc-400">
          Prix marché constaté
          <PriceInput value={marketPrice} onChange={onMarketPriceChange} label="Prix marché constaté" />
        </label>
        <label className="flex items-center gap-2 text-zinc-400">
          Mon prix de vente
          <PriceInput value={myPrice} onChange={setMyPrice} label="Mon prix de vente" />
        </label>
      </div>

      {(marketPrice !== null || myPrice !== null) && (
        <div className="flex flex-col gap-3 sm:flex-row">
          {marketPrice !== null && (
            <SaleColumn
              title="Au prix marché"
              sale={evaluateSale({
                craftCost,
                salePrice: marketPrice,
                quantity,
                taxRate,
                marginalThresholdPct,
              })}
              quantity={quantity}
            />
          )}
          {myPrice !== null && (
            <SaleColumn
              title="À mon prix"
              sale={evaluateSale({
                craftCost,
                salePrice: myPrice,
                quantity,
                taxRate,
                marginalThresholdPct,
              })}
              quantity={quantity}
            />
          )}
        </div>
      )}
    </section>
  );
}
