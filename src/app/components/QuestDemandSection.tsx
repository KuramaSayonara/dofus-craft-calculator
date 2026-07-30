import { formatKamas } from '../../engine/index.ts';
import type { QuestNeed, QuestNeedsFile } from '../data.ts';

interface QuestDemandSectionProps {
  needs: ReadonlyArray<QuestNeed>;
  categories: QuestNeedsFile['categories'];
  /** quantité de craft actuellement demandée, pour proposer le lot */
  quantity: number;
  onQuantityChange: (value: number) => void;
}

/**
 * Pourquoi cet objet se vend : les quêtes qui le réclament et en quelle
 * quantité. C'est l'information qui manque le plus quand on débute — un
 * Bâton de Boisaille ne se vend pas à l'unité, la quête en demande 10.
 */
export function QuestDemandSection(props: QuestDemandSectionProps) {
  const { needs, categories, quantity, onQuantityChange } = props;
  if (needs.length === 0) return null;

  // les besoins arrivent triés par quantité décroissante
  const biggest = needs[0]!;
  const lots = [...new Set(needs.map(need => need.x))].filter(x => x > 1).sort((a, b) => a - b);

  return (
    <section className="space-y-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
      <h3 className="text-sm font-medium text-violet-300">
        📜 Pourquoi cet objet s'achète — {needs.length} quête{needs.length > 1 ? 's' : ''} le réclame
        {needs.length > 1 ? 'nt' : ''}
      </h3>

      <ul className="space-y-1 text-sm">
        {needs.map(need => {
          const category = need.c !== null ? categories[String(need.c)] : undefined;
          return (
            <li key={need.q} className="flex flex-wrap items-baseline gap-x-2">
              <span className="rounded bg-violet-500/20 px-1.5 py-0.5 font-medium tabular-nums text-violet-200">
                × {formatKamas(need.x)}
              </span>
              <span className="text-zinc-200">« {need.n} »</span>
              <span className="text-xs text-zinc-500">
                {category !== undefined ? category : 'quête'}
                {need.lv !== null ? ` · niv. ${need.lv}` : ''}
              </span>
            </li>
          );
        })}
      </ul>

      {lots.length > 0 && (
        <div className="space-y-1 border-t border-violet-500/20 pt-2">
          <p className="text-xs text-zinc-400">
            Les joueurs qui font {needs.length > 1 ? 'ces quêtes' : 'cette quête'} en achètent{' '}
            <strong className="text-violet-300">
              {lots.map(l => formatKamas(l)).join(' ou ')} d'un coup
            </strong>
            , pas à l'unité. Pense à vendre par lot — et à comparer ton prix à celui du lot entier.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">Calculer pour un lot :</span>
            {lots.map(lot => (
              <button
                key={lot}
                type="button"
                onClick={() => onQuantityChange(lot)}
                aria-pressed={quantity === lot}
                className={`rounded border px-2 py-1 text-xs ${
                  quantity === lot
                    ? 'border-violet-400/60 bg-violet-500/20 font-medium text-violet-200'
                    : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                × {formatKamas(lot)}
              </button>
            ))}
          </div>
        </div>
      )}

      {lots.length === 0 && (
        <p className="text-xs text-zinc-400">
          Demandé à l'unité ({formatKamas(biggest.x)} exemplaire
          {biggest.x > 1 ? 's' : ''} par quête).
        </p>
      )}
    </section>
  );
}
