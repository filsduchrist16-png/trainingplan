import { m, useReducedMotion } from 'motion/react';
import type { AcwrResult } from '@/engine';

/** Jauge ACWR : arc 0 → 2, zone verte 0,8-1,3, aiguille animée. */
export function AcwrGauge({ result }: { result: AcwrResult }) {
  const reduce = useReducedMotion();
  const toAngle = (v: number) => -90 + (Math.min(Math.max(v, 0), 2) / 2) * 180;
  const arc = (from: number, to: number) => {
    const a0 = (toAngle(from) - 90) * (Math.PI / 180);
    const a1 = (toAngle(to) - 90) * (Math.PI / 180);
    const r = 40;
    return `M ${50 + r * Math.cos(a0)} ${50 + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${50 + r * Math.cos(a1)} ${50 + r * Math.sin(a1)}`;
  };
  const ratio = result.ratio;
  const color = { calibration: 'var(--text-muted)', bas: 'var(--warn)', optimal: 'var(--ok)', eleve: 'var(--warn)', danger: 'var(--danger)' }[result.status];
  return (
    <figure className="flex flex-col items-center" aria-label={ratio === null ? 'Charge : calibration en cours' : `Ratio de charge ${ratio}`}>
      <svg viewBox="0 0 100 60" className="w-36" aria-hidden>
        <path d={arc(0, 0.8)} stroke="var(--warn)" strokeOpacity="0.45" strokeWidth="8" fill="none" />
        <path d={arc(0.8, 1.3)} stroke="var(--ok)" strokeWidth="8" fill="none" />
        <path d={arc(1.3, 1.5)} stroke="var(--warn)" strokeOpacity="0.7" strokeWidth="8" fill="none" />
        <path d={arc(1.5, 2)} stroke="var(--danger)" strokeOpacity="0.7" strokeWidth="8" fill="none" />
        {ratio !== null && (
          <m.line
            x1="50" y1="50" x2="50" y2="16" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round"
            style={{ originX: '50px', originY: '50px' }}
            initial={reduce ? false : { rotate: -90 }}
            animate={{ rotate: toAngle(ratio) }}
            transition={{ type: 'spring', stiffness: 60, damping: 12 }}
          />
        )}
        <circle cx="50" cy="50" r="3.5" fill="var(--text)" />
      </svg>
      <figcaption className="num -mt-1 text-xl font-semibold" style={{ color }}>{ratio ?? '—'}</figcaption>
      <span className="text-xs text-muted">{result.status === 'calibration' ? 'calibration' : 'charge 7 j / 28 j'}</span>
    </figure>
  );
}
