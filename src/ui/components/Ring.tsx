import { m, useReducedMotion } from 'motion/react';

/** Anneau de progression (volume, D+, séances clés de la semaine). */
export function Ring({ value, max, label, display, color = 'var(--accent)', size = 88 }: {
  value: number;
  max: number;
  label: string;
  display: string;
  color?: string;
  size?: number;
}) {
  const reduce = useReducedMotion();
  const r = 40;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <figure className="flex flex-col items-center gap-1" aria-label={`${label} : ${display}`}>
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
        <m.circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} transform="rotate(-90 50 50)"
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
        <text x="50" y="55" textAnchor="middle" className="num" fill="var(--text)" fontSize="17" fontWeight="600">{display}</text>
      </svg>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}
