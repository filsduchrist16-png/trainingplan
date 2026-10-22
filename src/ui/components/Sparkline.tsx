/** Courbe simple (SVG) : tendance sur quelques points, avec une zone cible facultative. Le texte explique, la courbe illustre. */
export function Sparkline({ values, label, band, invert = false, className }: { values: number[]; label: string; band?: [number, number]; invert?: boolean; className?: string }) {
  if (values.length < 2) return null;
  const w = 280;
  const h = 64;
  const pad = 6;
  const all = band ? [...values, ...band] : values;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - 2 * pad);
  const y = (v: number) => {
    const t = (v - lo) / span;
    return pad + (invert ? t : 1 - t) * (h - 2 * pad); // invert : plus petit = plus haut (allure : plus rapide en haut)
  };
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} className={className ?? 'h-16 w-full'} preserveAspectRatio="none">
      {band && <rect x={0} y={Math.min(y(band[0]), y(band[1]))} width={w} height={Math.abs(y(band[1]) - y(band[0]))} fill="var(--z2)" opacity={0.15} />}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r={3.5} fill="var(--accent)" />
    </svg>
  );
}
