import {
  DEFAULT_EASY_PACE_MIN_PER_KM, FITNESS_UPDATE_MIN_SESSIONS, FITNESS_UPDATE_STEP, FITNESS_UPDATE_THRESHOLD,
  KM_EFFORT_PER_100M_GAIN, PACE_FRACTIONS, TRAIL_PACE_FACTOR, VDOT_MAX, VDOT_MIN,
} from './constants';
import { explain } from './explain';
import type { Explanation } from './types';

/**
 * Niveau de forme « VDOT » via les équations publiées de Daniels et Gilbert :
 *  - coût en O2 d'une vitesse v (m/min) : VO2 = −4,60 + 0,182258·v + 0,000104·v²
 *  - fraction de VO2max soutenable pendant t minutes : 0,8 + 0,1894393·e^(−0,012778·t) + 0,2989558·e^(−0,1932605·t)
 * Comme Runna, un seul niveau fixe toutes les allures ; le modifier recalcule tout.
 */

export type PaceKey = 'E' | 'M' | 'T' | 'I' | 'R';

export function vo2AtSpeed(metersPerMin: number): number {
  return -4.6 + 0.182258 * metersPerMin + 0.000104 * metersPerMin ** 2;
}

export function sustainableFraction(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
}

/** VDOT à partir d'une performance (distance en km, temps en minutes). */
export function vdotFromRace(distanceKm: number, timeMin: number): number {
  const v = (distanceKm * 1000) / timeMin;
  return vo2AtSpeed(v) / sustainableFraction(timeMin);
}

/** Vitesse (m/min) qui coûte `vo2` ml/kg/min (racine positive du polynôme). */
export function speedForVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/**
 * VDOT à partir d'une VMA (km/h), comme Campus. La VMA ≈ vitesse à VO2max ; on prend le coût en O2 de cette vitesse.
 */
export function vdotFromVma(vmaKmh: number): number {
  return vo2AtSpeed((vmaKmh * 1000) / 60);
}

/** Temps prédit (min) sur une distance pour un VDOT, par bissection. Hypothèse : parcours plat, bonnes conditions. */
export function predictRaceTime(vdot: number, distanceKm: number): number {
  let lo = 1;
  let hi = 60 * 30;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromRace(distanceKm, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Allures cibles (min/km) pour chaque type d'effort. M = allure marathon prédite. */
export function pacesFromVdot(vdot: number): Record<PaceKey, number> {
  const pace = (fraction: number) => 1000 / speedForVo2(vdot * fraction);
  return {
    E: pace(PACE_FRACTIONS.E),
    M: predictRaceTime(vdot, 42.195) / 42.195,
    T: pace(PACE_FRACTIONS.T),
    I: pace(PACE_FRACTIONS.I),
    R: pace(PACE_FRACTIONS.R),
  };
}

export function isPlausibleVdot(vdot: number): boolean {
  return vdot >= VDOT_MIN && vdot <= VDOT_MAX;
}

/** Allure facile utilisée pour convertir km ↔ minutes. Sans référence, valeur par défaut prudente. */
export function easyPace(vdot: number | undefined): number {
  return vdot && isPlausibleVdot(vdot) ? pacesFromVdot(vdot).E : DEFAULT_EASY_PACE_MIN_PER_KM;
}

/** Durée estimée (min) d'une sortie facile, en tenant compte du terrain et du D+. */
export function easyMinutes(km: number, vdot: number | undefined, opts: { trail?: boolean; gainM?: number } = {}): number {
  const effortKm = km + ((opts.gainM ?? 0) / 100) * KM_EFFORT_PER_100M_GAIN;
  return effortKm * easyPace(vdot) * (opts.trail ? TRAIL_PACE_FACTOR : 1);
}

/** Format « m:ss » d'une allure en min/km. */
export function formatPace(minPerKm: number): string {
  let m = Math.floor(minPerKm);
  let s = Math.round((minPerKm - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Adaptation du niveau (à la Runna) ────────────────────────────────────────

export interface QualityResult {
  /** Allure cible et allure réelle moyenne des répétitions valides (min/km). */
  targetPace: number;
  actualPace: number;
  /** RPE déclaré (optionnel) : un « dépassé » à RPE 9-10 n'est pas un signe de forme. */
  rpe?: number;
}

/**
 * Propose un ajustement du VDOT seulement si les N dernières séances qualité concordent.
 * Une séance isolée (bonne journée, vent dans le dos) ne change rien.
 */
export function suggestVdotUpdate(vdot: number, recent: QualityResult[]): { vdot: number; explanation: Explanation } {
  const last = recent.slice(-FITNESS_UPDATE_MIN_SESSIONS);
  if (last.length < FITNESS_UPDATE_MIN_SESSIONS) {
    return {
      vdot,
      explanation: explain('fitness.insufficient', 'info', 'Allures inchangées', `Il faut ${FITNESS_UPDATE_MIN_SESSIONS} séances qualité avant d'ajuster tes allures. Une seule bonne (ou mauvaise) journée, ça ne veut rien dire.`),
    };
  }
  // écart > 0 : plus rapide que la cible
  const gaps = last.map((r) => (r.targetPace - r.actualPace) / r.targetPace);
  const allFaster = gaps.every((g) => g > FITNESS_UPDATE_THRESHOLD);
  const allSlower = gaps.every((g) => g < -FITNESS_UPDATE_THRESHOLD);
  const comfortable = last.every((r) => r.rpe === undefined || r.rpe <= 8);

  if (allFaster && comfortable) {
    return {
      vdot: vdot + FITNESS_UPDATE_STEP,
      explanation: explain('fitness.up', 'conseil', 'Tes allures montent d’un cran', `Tes ${last.length} dernières séances qualité étaient toutes plus rapides que la cible, sans être à bloc. Ta forme a progressé : on ajuste.`, { vdot: vdot + FITNESS_UPDATE_STEP }),
    };
  }
  if (allSlower) {
    return {
      vdot: vdot - FITNESS_UPDATE_STEP,
      explanation: explain('fitness.down', 'conseil', 'On ajuste tes allures', `Tes ${last.length} dernières séances qualité étaient toutes sous la cible. Les cibles étaient trop ambitieuses (ou la fatigue s'accumule) : on baisse d'un cran pour que les séances fassent leur job.`, { vdot: vdot - FITNESS_UPDATE_STEP }),
    };
  }
  return {
    vdot,
    explanation: explain('fitness.stable', 'info', 'Allures confirmées', 'Tes séances qualité tombent dans la cible : on garde les mêmes allures.'),
  };
}
