import type { ActivitySamples, ZoneBounds } from '@/engine';

/** Courbe de FC avec les bandes de zones en fond. */
export function HrChart({ samples, bounds, hrMax }: { samples: ActivitySamples; bounds: ZoneBounds; hrMax: number }) {
  const hr = samples.hr;
  if (!hr) return null;
  const pts = samples.t.map((t, i) => [t, hr[i]] as const).filter(([, h]) => h != null) as [number, number][];
  if (pts.length < 2) return null;
  const tMax = pts.at(-1)![0];
  const lo = Math.min(bounds[0] - 15, ...pts.map((p) => p[1]));
  const hi = Math.max(hrMax, ...pts.map((p) => p[1]));
  const y = (h: number) => 100 - ((h - lo) / (hi - lo)) * 100;
  const step = Math.max(1, Math.floor(pts.length / 300));
  const d = pts.filter((_, i) => i % step === 0).map(([t, h], i) => `${i ? 'L' : 'M'}${((t / tMax) * 300).toFixed(1)} ${y(h).toFixed(1)}`).join(' ');
  const bands = [lo, ...bounds, hi];
  return (
    <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="h-36 w-full" role="img" aria-label="Fréquence cardiaque pendant la séance">
      {bands.slice(0, -1).map((b, i) => (
        <rect key={i} x="0" width="300" y={y(bands[i + 1]!)} height={Math.max(0, y(b) - y(bands[i + 1]!))} fill={`var(--z${i + 1})`} opacity="0.12" />
      ))}
      <path d={d} fill="none" stroke="var(--danger)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Barre de répartition du temps par zone. */
export function ZoneBar({ share }: { share: number[] }) {
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full" role="img" aria-label={share.map((s, i) => `Z${i + 1} ${Math.round(s * 100)} %`).join(', ')}>
        {share.map((s, i) => <div key={i} style={{ width: `${s * 100}%`, background: `var(--z${i + 1})` }} />)}
      </div>
      <div className="num mt-1 flex justify-between text-[11px] text-muted">
        {share.map((s, i) => <span key={i}>Z{i + 1} {Math.round(s * 100)}%</span>)}
      </div>
    </div>
  );
}
