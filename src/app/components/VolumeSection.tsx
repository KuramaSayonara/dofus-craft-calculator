import { useState } from 'react';
import { formatKamas, readVolume, type SalesVolume } from '../../engine/index.ts';

interface VolumeSectionProps {
  volume: SalesVolume | undefined;
  onChange: (window: 'd1' | 'd7' | 'd30', value: number | null) => void;
  /** quantité que l'utilisateur veut écouler */
  quantity: number;
  /** profit net par exemplaire (null si incalculable) */
  unitProfit: number | null;
}

const WINDOWS: ReadonlyArray<{ key: 'd1' | 'd7' | 'd30'; label: string }> = [
  { key: 'd1', label: '24 h' },
  { key: 'd7', label: '7 jours' },
  { key: 'd30', label: '30 jours' },
];

function CountInput({
  value,
  onCommit,
  label,
}: {
  value: number | undefined;
  onCommit: (value: number | null) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const commit = () => {
    if (draft === null) return;
    const trimmed = draft.replace(/[\s ]/g, '');
    if (trimmed === '') onCommit(null);
    else {
      const parsed = Number(trimmed);
      if (Number.isSafeInteger(parsed) && parsed >= 0) onCommit(parsed);
    }
    setDraft(null);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      placeholder="—"
      value={editing ? draft : value !== undefined ? String(value) : ''}
      onFocus={() => setDraft(value !== undefined ? String(value) : '')}
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
      className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right tabular-nums outline-none focus:border-sky-500"
    />
  );
}

/** Nombre de ventes observées à l'hôtel : facultatif, jamais bloquant. */
export function VolumeSection({ volume, onChange, quantity, unitProfit }: VolumeSectionProps) {
  const reading = readVolume(volume, quantity, unitProfit);

  const round = (value: number) =>
    value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;

  return (
    <section className="space-y-2 rounded-lg border border-zinc-800 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-200">📈 Ventes observées à l'hôtel</h3>
        <span className="text-xs text-zinc-500">facultatif — aucun autre calcul n'en dépend</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {WINDOWS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-zinc-400">
            {label}
            <CountInput
              value={volume?.[key]}
              onCommit={value => onChange(key, value)}
              label={`Exemplaires vendus sur ${label}`}
            />
          </label>
        ))}
      </div>

      {reading === null ? (
        <p className="text-xs text-zinc-500">
          Compte les ventes dans l'historique de l'hôtel de vente et note-les ici : l'outil te dira
          en combien de temps ta production s'écoulerait.
        </p>
      ) : (
        <div className="space-y-1 rounded-md bg-sky-500/10 px-3 py-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-zinc-300">Rythme estimé (sur {reading.source})</span>
            <span className="tabular-nums text-sky-300">{round(reading.perDay)} / jour</span>
          </div>
          {reading.daysToSell !== null ? (
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-zinc-300">
                Écouler tes {quantity} exemplaire{quantity > 1 ? 's' : ''}
              </span>
              <span className="tabular-nums text-sky-300">
                ≈ {round(reading.daysToSell)} jour{reading.daysToSell >= 2 ? 's' : ''}
              </span>
            </div>
          ) : (
            <p className="text-amber-400">
              Aucune vente observée sur cette période — cet objet ne semble pas s'écouler.
            </p>
          )}
          {reading.profitPerDay !== null && (
            <div className="flex flex-wrap justify-between gap-2 font-medium">
              <span className="text-zinc-300">Profit au rythme observé</span>
              <span className={`tabular-nums ${reading.profitPerDay >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {reading.profitPerDay >= 0 ? '+' : ''}
                {formatKamas(reading.profitPerDay)} K / jour
              </span>
            </div>
          )}
          {reading.perDayByWindow.length > 1 && (
            <p className="text-xs text-zinc-500">
              Autres fenêtres :{' '}
              {reading.perDayByWindow
                .slice(1)
                .map(w => `${round(w.perDay)}/j sur ${w.window}`)
                .join(' · ')}
              . Un écart important signale une demande irrégulière.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
