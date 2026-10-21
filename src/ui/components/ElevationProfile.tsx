import { m, useReducedMotion } from 'motion/react';
import { useId, useMemo } from 'react';

interface Props {
  /** Points [km, altitude m]. */
  points: [number, number][];
  className?: string;
  label?: string;
}

/** Profil de dénivelé en SVG, dessiné comme une ligne de relief. */
export function ElevationProfile({ points, className, label }: Props) {
  const gradientId = useId();
  const reduce = useReducedMotion();
  const { line, area, gain } = useMemo(() => buildPaths(points), [points]);
  if (points.length < 2) return null;

  return (
    <svg viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label={label ?? `Profil : ${gain} m de dénivelé positif`} className={className}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <m.path
        d={area}
        fill={`url(#${gradientId})`}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.6 }}
      />
      <m.path
        d={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: 'easeInOut' }}
      />
    </svg>
  );
}

function buildPaths(points: [number, number][]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => ((x - minX) / (maxX - minX || 1)) * 300;
  const sy = (y: number) => 74 - ((y - minY) / (maxY - minY || 1)) * 66;
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join(' ');
  const area = `${line} L300 80 L0 80 Z`;
  let gain = 0;
  for (let i = 1; i < ys.length; i++) gain += Math.max(0, ys[i]! - ys[i - 1]!);
  return { line, area, gain: Math.round(gain) };
}
