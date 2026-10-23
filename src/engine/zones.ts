import { GREY_ZONE_FRACTIONS, HR_ZONE_FRACTIONS, TANAKA_INTERCEPT, TANAKA_SLOPE, ZONE_RPE } from './constants';
import type { ActivitySamples, ZoneBounds, ZoneKey } from './types';

/** Zones FC à partir de la FCmax (% FCmax). */
export function zonesFromHrMax(hrMax: number): ZoneBounds {
  return HR_ZONE_FRACTIONS.map((f) => Math.round(hrMax * f)) as ZoneBounds;
}

/**
 * Zones par la réserve cardiaque (Karvonen) : FCrepos + f × (FCmax − FCrepos).
 * Plus individuel quand la FC repos est connue ; mêmes fractions que le modèle % FCmax, recentrées.
 * Les fractions de réserve correspondantes sont plus basses : on convertit f_max → f_réserve
 * en supposant la FC repos « typique » de 60 bpm utilisée pour calibrer HR_ZONE_FRACTIONS sur FCmax 190.
 */
export function zonesKarvonen(hrMax: number, hrRest: number): ZoneBounds {
  const REF_MAX = 190;
  const REF_REST = 60;
  return HR_ZONE_FRACTIONS.map((f) => {
    const reserveFraction = (f * REF_MAX - REF_REST) / (REF_MAX - REF_REST);
    return Math.round(hrRest + reserveFraction * (hrMax - hrRest));
  }) as ZoneBounds;
}

/** FCmax estimée par l'âge (Tanaka). Toujours marquée « estimée » : un test vaut mieux. */
export function estimateHrMax(age: number): number {
  return Math.round(TANAKA_INTERCEPT - TANAKA_SLOPE * age);
}

const KEYS: ZoneKey[] = ['z1', 'z2', 'z3', 'z4', 'z5'];

export function zoneIndexOf(hr: number, bounds: ZoneBounds): number {
  const i = bounds.findIndex((upper) => hr < upper);
  return i === -1 ? 4 : i;
}

export function zoneOf(hr: number, bounds: ZoneBounds): ZoneKey {
  return KEYS[zoneIndexOf(hr, bounds)]!;
}

/** Plage [min, max) bpm d'une zone, pour l'affichage. */
export function zoneRange(zone: ZoneKey, bounds: ZoneBounds, hrMax: number): [number, number] {
  const i = KEYS.indexOf(zone);
  return [i === 0 ? 0 : bounds[i - 1]!, i === 4 ? hrMax : bounds[i]!];
}

/**
 * Cible d'une zone à afficher : en bpm, ou à l'effort perçu (RPE) quand la FC n'est pas fiable
 * (bêtabloquant ou médicament qui modifie la FC). Le ressenti (test de la parole) accompagne toujours.
 */
export function zoneTarget(zone: ZoneKey, opts: { bounds: ZoneBounds; hrMax: number; hrUnreliable?: boolean }): { value: string; unit: string; feel: string } {
  if (opts.hrUnreliable) {
    const [lo, hi] = ZONE_RPE[zone];
    return { value: `${lo}-${hi}`, unit: 'RPE', feel: ZONE_FEEL[zone] };
  }
  const [lo, hi] = zoneRange(zone, opts.bounds, opts.hrMax);
  return { value: `${lo}-${hi}`, unit: 'bpm', feel: ZONE_FEEL[zone] };
}

/** Temps (s) par zone, recalculé avec LES zones de l'athlète (pas celles de la montre). */
export function timeInZones(samples: ActivitySamples, bounds: ZoneBounds): [number, number, number, number, number] {
  const out: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const { t, hr } = samples;
  if (!hr) return out;
  for (let i = 0; i < t.length - 1; i++) {
    const v = hr[i];
    if (v == null) continue;
    const z = zoneIndexOf(v, bounds);
    out[z] = out[z]! + t[i + 1]! - t[i]!;
  }
  return out;
}

/** Plage de la « zone grise » en bpm pour une FCmax. */
export function greyZone(hrMax: number): [number, number] {
  return [Math.round(hrMax * GREY_ZONE_FRACTIONS[0]), Math.round(hrMax * GREY_ZONE_FRACTIONS[1])];
}

/** Ressenti associé à chaque zone (test du « parler »). */
export const ZONE_FEEL: Record<ZoneKey, string> = {
  z1: 'Très facile, tu pourrais jaser longtemps.',
  z2: 'Facile : tu parles en phrases complètes.',
  z3: 'Soutenu : quelques phrases courtes, pas plus.',
  z4: 'Dur : quelques mots à la fois.',
  z5: 'Très dur : parler, oublie ça.',
};

// ─── Calibration ──────────────────────────────────────────────────────────────

/**
 * Test de terrain pour la FCmax (ex. 3 km contre-la-montre ou paliers croissants jusqu'à l'épuisement).
 * On retient la FC max observée, en rejetant les pics aberrants (artefacts du capteur) :
 * la valeur retenue doit être soutenue sur au moins `minSustainSec`.
 */
export function hrMaxFromTest(samples: ActivitySamples, minSustainSec = 10): number | null {
  const { t, hr } = samples;
  if (!hr || t.length < 2) return null;
  let best: number | null = null;
  let start = 0;
  // Fenêtre glissante : min de la FC sur toute fenêtre ≥ minSustainSec ; on prend le max de ces minimums.
  for (let end = 0; end < t.length; end++) {
    while (t[end]! - t[start]! > minSustainSec) start++;
    if (t[end]! - t[start]! < minSustainSec) continue;
    let min = Infinity;
    for (let k = start; k <= end; k++) {
      const v = hr[k];
      if (v != null && v < min) min = v;
    }
    if (min !== Infinity && (best === null || min > best)) best = min;
  }
  return best;
}
