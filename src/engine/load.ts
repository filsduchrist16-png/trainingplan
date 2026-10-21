import {
  ACUTE_DAYS, ACWR_DANGER, ACWR_HIGH, ACWR_LOW, ACWR_MIN_HISTORY_DAYS, CHRONIC_DAYS, ELEVATION_LOAD_PER_100M, ZONE_LOAD_WEIGHTS,
} from './constants';
import { addDays, diffDays } from './dates';
import { explain } from './explain';
import { zoneIndexOf } from './zones';
import type { Activity, Explanation, ISODate, LoadMethod, ZoneBounds } from './types';

/**
 * Charge d'entraînement.
 *
 * Charge Sentier = Σ (minutes dans la zone × poids de la zone) + bonus D+.
 *  - Priorité au temps par zone (le plus précis) ; à défaut la FC moyenne ; à défaut le RPE (méthode sRPE ramenée à la même échelle).
 *  - Le bonus D+ reflète le coût musculaire des montées et surtout des descentes, que la FC sous-estime.
 * Une seule méthode par fenêtre ACWR : mélanger la charge Garmin (basée sur l'EPOC) et la nôtre fausserait le ratio.
 */

export interface LoadInput {
  durationSec: number;
  elevationGainM?: number;
  timeInZonesSec?: [number, number, number, number, number];
  hrAvg?: number;
  rpe?: number;
  garminTrainingLoad?: number;
}

export type LoadBasis = 'zones' | 'fc_moyenne' | 'rpe' | 'duree' | 'garmin';

export function activityLoad(a: LoadInput, bounds: ZoneBounds, method: LoadMethod = 'sentier'): { load: number; basis: LoadBasis } {
  if (method === 'garmin' && a.garminTrainingLoad != null) return { load: a.garminTrainingLoad, basis: 'garmin' };

  const minutes = a.durationSec / 60;
  const elevation = ((a.elevationGainM ?? 0) / 100) * ELEVATION_LOAD_PER_100M;
  let base: number;
  let basis: LoadBasis;
  const zoneTotal = a.timeInZonesSec?.reduce((s, x) => s + x, 0) ?? 0;
  if (a.timeInZonesSec && zoneTotal > 0) {
    base = a.timeInZonesSec.reduce((s, sec, i) => s + (sec / 60) * ZONE_LOAD_WEIGHTS[i]!, 0);
    // Les trous de FC (capteur décroché) sont comptés au poids de la zone dominante, pas ignorés.
    const missing = Math.max(0, a.durationSec - zoneTotal) / 60;
    base += missing * (base / (zoneTotal / 60));
    basis = 'zones';
  } else if (a.hrAvg) {
    base = minutes * ZONE_LOAD_WEIGHTS[zoneIndexOf(a.hrAvg, bounds)]!;
    basis = 'fc_moyenne';
  } else if (a.rpe != null) {
    // RPE 0-10 → poids 1-5 (RPE 2 ≈ Z1, RPE 10 ≈ Z5).
    base = minutes * Math.min(5, Math.max(1, a.rpe / 2));
    basis = 'rpe';
  } else {
    base = minutes * ZONE_LOAD_WEIGHTS[1]; // hypothèse prudente : facile
    basis = 'duree';
  }
  return { load: Math.round(base + elevation), basis };
}

/** Charge totale par jour. */
export function dailyLoads(activities: Pick<Activity, 'date' | 'load'>[]): Map<ISODate, number> {
  const map = new Map<ISODate, number>();
  for (const a of activities) map.set(a.date, (map.get(a.date) ?? 0) + (a.load ?? 0));
  return map;
}

function sumWindow(daily: Map<ISODate, number>, end: ISODate, days: number): number {
  let s = 0;
  for (let i = 0; i < days; i++) s += daily.get(addDays(end, -i)) ?? 0;
  return s;
}

export type AcwrStatus = 'calibration' | 'bas' | 'optimal' | 'eleve' | 'danger';

export interface AcwrResult {
  acute: number; // charge des 7 derniers jours
  chronic: number; // moyenne hebdomadaire des 28 derniers jours
  ratio: number | null;
  status: AcwrStatus;
  explanation: Explanation;
}

/**
 * ACWR glissant : charge 7 j / (charge 28 j / 4).
 * Avant 28 jours d'historique, on ne prétend rien : statut « calibration ».
 * `inBuildPhase` : un ACWR bas pendant un bloc de développement signale un sous-entraînement.
 */
export function acwr(daily: Map<ISODate, number>, asOf: ISODate, opts: { firstActivity?: ISODate; inBuildPhase?: boolean } = {}): AcwrResult {
  const acute = sumWindow(daily, asOf, ACUTE_DAYS);
  const chronic = sumWindow(daily, asOf, CHRONIC_DAYS) / (CHRONIC_DAYS / ACUTE_DAYS);
  const history = opts.firstActivity ? diffDays(opts.firstActivity, asOf) + 1 : 0;

  if (history < ACWR_MIN_HISTORY_DAYS || chronic === 0) {
    return {
      acute, chronic, ratio: null, status: 'calibration',
      explanation: explain('acwr.calibration', 'info', 'Calibration en cours', `Il faut ${ACWR_MIN_HISTORY_DAYS} jours d'historique pour comparer ta charge récente à ta charge habituelle. Importe ton historique pour aller plus vite.`, { jours: Math.max(0, history) }),
    };
  }
  const ratio = Math.round((acute / chronic) * 100) / 100;
  const values = { ratio, aigu: Math.round(acute), chronique: Math.round(chronic) };
  if (ratio > ACWR_DANGER) {
    return { acute, chronic, ratio, status: 'danger', explanation: explain('acwr.danger', 'attention', 'Charge en flèche', `Ta semaine est ${ratio}× plus chargée que ta moyenne des 4 dernières. Le corps n'a pas eu le temps de s'adapter : on allège.`, values) };
  }
  if (ratio > ACWR_HIGH) {
    return { acute, chronic, ratio, status: 'eleve', explanation: explain('acwr.high', 'conseil', 'Charge élevée', `Ratio ${ratio} : au-dessus de la zone ${ACWR_LOW}-${ACWR_HIGH}. Une ou deux séances plus faciles ramèneraient ça dans le vert.`, values) };
  }
  if (ratio < ACWR_LOW) {
    return opts.inBuildPhase
      ? { acute, chronic, ratio, status: 'bas', explanation: explain('acwr.low.build', 'conseil', 'Sous ta charge habituelle', `Ratio ${ratio} en plein bloc de développement : si ça dure, la forme s'érode. Si c'est voulu (fatigue, vie), parfait.`, values) }
      : { acute, chronic, ratio, status: 'bas', explanation: explain('acwr.low', 'info', 'Semaine légère', `Ratio ${ratio} : normal en décharge, en taper ou en récup.`, values) };
  }
  return { acute, chronic, ratio, status: 'optimal', explanation: explain('acwr.ok', 'info', 'Charge dans le vert', `Ratio ${ratio} : ta charge récente suit ta charge habituelle.`, values) };
}

/**
 * Variante EWMA (moyennes mobiles exponentielles) : réagit plus finement que la somme glissante.
 * λ = 2 / (N + 1). Fournie pour comparaison ; l'app affiche la version glissante par défaut (plus lisible).
 */
export function acwrEwma(daily: Map<ISODate, number>, from: ISODate, asOf: ISODate): number | null {
  const la = 2 / (ACUTE_DAYS + 1);
  const lc = 2 / (CHRONIC_DAYS + 1);
  let a = 0;
  let c = 0;
  const n = diffDays(from, asOf);
  for (let i = 0; i <= n; i++) {
    const l = daily.get(addDays(from, i)) ?? 0;
    a = l * la + a * (1 - la);
    c = l * lc + c * (1 - lc);
  }
  return c > 0 ? Math.round((a / c) * 100) / 100 : null;
}
