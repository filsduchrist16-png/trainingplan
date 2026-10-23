import type { ActivitySamples } from '@/engine/types';
import type { RawPoint } from './types';

/** Pas de rééchantillonnage : 5 s suffit pour les zones et la dérive, et garde la base légère. */
export const SAMPLE_STEP_SEC = 5;
/** Seuil d'hystérésis pour le D+ calculé depuis l'altitude (filtre le bruit GPS/baro). */
const ELEVATION_HYSTERESIS_M = 3;

/** Rééchantillonne à pas fixe (dernière valeur connue). */
export function resample(points: RawPoint[], step = SAMPLE_STEP_SEC): ActivitySamples {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const end = sorted.at(-1)?.t ?? 0;
  const t: number[] = [];
  const pick = (key: keyof Omit<RawPoint, 't'>) => {
    const out: (number | null)[] = [];
    let j = 0;
    let last: number | null = null;
    for (let s = 0; s <= end; s += step) {
      while (j < sorted.length && sorted[j]!.t <= s) {
        const v = sorted[j]![key];
        if (v != null && Number.isFinite(v)) last = v;
        j++;
      }
      out.push(last);
    }
    return out;
  };
  for (let s = 0; s <= end; s += step) t.push(s);
  const samples: ActivitySamples = { t };
  const has = (k: keyof Omit<RawPoint, 't'>) => sorted.some((p) => p[k] != null);
  if (has('hr')) samples.hr = pick('hr');
  if (has('speed')) samples.speed = pick('speed');
  if (has('altitude')) samples.altitude = pick('altitude');
  if (has('cadence')) samples.cadence = pick('cadence');
  if (has('distance')) samples.distance = pick('distance');
  return samples;
}

/** D+ / D- avec hystérésis. */
export function elevationFromAltitude(alts: (number | null | undefined)[]): { gain: number; loss: number } {
  let gain = 0;
  let loss = 0;
  let ref: number | null = null;
  for (const a of alts) {
    if (a == null) continue;
    if (ref === null) {
      ref = a;
      continue;
    }
    const d = a - ref;
    if (d >= ELEVATION_HYSTERESIS_M) {
      gain += d;
      ref = a;
    } else if (d <= -ELEVATION_HYSTERESIS_M) {
      loss -= d;
      ref = a;
    }
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
}

/** Distance (m) entre deux coordonnées (haversine). */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function mean(values: (number | null | undefined)[]): number | undefined {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x) && x > 0);
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : undefined;
}

export function max(values: (number | null | undefined)[]): number | undefined {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? Math.max(...v) : undefined;
}

/** Temps en mouvement : somme des pas où la vitesse dépasse ~2 km/h. */
export function movingTime(points: RawPoint[]): number | undefined {
  if (!points.some((p) => p.speed != null)) return undefined;
  let moving = 0;
  for (let i = 1; i < points.length; i++) if ((points[i]!.speed ?? 0) > 0.5) moving += points[i]!.t - points[i - 1]!.t;
  return Math.round(moving);
}
