import type { Phase, WeekKind } from '@/engine';
import { cn } from '@/ui/lib/cn';

export const PHASE_LABEL: Record<Phase, string> = {
  demarrage: 'Démarrage', base: 'Base', spec1: 'Spécifique 1', spec2: 'Spécifique 2', precomp: 'Pré-compétition', taper: 'Affûtage', recup: 'Récupération', maintien: 'Maintien',
};
export const PHASE_COLOR: Record<Phase, string> = {
  demarrage: 'var(--z1)', base: 'var(--z2)', spec1: 'var(--z3)', spec2: 'var(--z4)', precomp: 'var(--z5)', taper: 'var(--accent)', recup: 'var(--z1)', maintien: 'var(--z2)',
};

interface TimelineWeek {
  startDate: string;
  phase: Phase;
  kind: WeekKind;
  targetKm: number;
  raceDate?: string;
  bRaceDate?: string;
}

/** Frise de périodisation : barres de volume colorées par phase, décharges en creux, courses marquées. */
export function PlanTimeline({ weeks, current, className, onSelect }: { weeks: TimelineWeek[]; current?: number; className?: string; onSelect?: (i: number) => void }) {
  const max = Math.max(1, ...weeks.map((w) => w.targetKm));
  const phases = weeks.reduce<{ phase: Phase; count: number }[]>((acc, w) => {
    const last = acc.at(-1);
    if (last && last.phase === w.phase) last.count++;
    else acc.push({ phase: w.phase, count: 1 });
    return acc;
  }, []);
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={`Plan de ${weeks.length} semaines, pic à ${Math.round(max)} km`}>
        {weeks.map((w, i) => (
          <button
            key={w.startDate}
            type="button"
            tabIndex={onSelect ? 0 : -1}
            onClick={() => onSelect?.(i)}
            aria-label={`Semaine ${i + 1} : ${PHASE_LABEL[w.phase]}, ${w.targetKm} km${w.kind === 'decharge' ? ', décharge' : ''}`}
            className={cn('relative flex-1 rounded-t-sm transition', i === current && 'outline outline-2 outline-offset-2 outline-text', !onSelect && 'cursor-default')}
            style={{ height: `${Math.max(6, (w.targetKm / max) * 100)}%`, background: PHASE_COLOR[w.phase], opacity: w.kind === 'decharge' || w.kind === 'taper' ? 0.55 : 1 }}
          >
            {(w.raceDate || w.bRaceDate) && (
              <span aria-hidden className={cn('absolute -top-5 left-1/2 -translate-x-1/2 text-xs', w.raceDate ? 'text-accent' : 'text-muted')}>{w.raceDate ? '★' : '☆'}</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex gap-[3px] text-[10px] text-muted">
        {phases.map((p, i) => (
          <div key={i} style={{ flex: p.count }} className="truncate border-t-2 pt-1" title={PHASE_LABEL[p.phase]}>
            <span style={{ color: PHASE_COLOR[p.phase] }}>●</span> {p.count >= 3 ? PHASE_LABEL[p.phase] : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
