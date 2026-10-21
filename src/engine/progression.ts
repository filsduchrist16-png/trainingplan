import { MAX_WEEKLY_INCREASE, PROGRESSION_REFERENCE_WEEKS } from './constants';
import { addDays, mondayOf } from './dates';
import { explain } from './explain';
import type { Activity, Explanation, ISODate } from './types';

/**
 * Règle de progression.
 *
 * - Volume : ≤ +10 % par semaine, mesuré contre le MAX des 4 dernières semaines.
 *   Comparer à la semaine précédente pénaliserait à tort la remontée après une décharge (+40 % « apparent »)
 *   et laisserait passer une remontée trop rapide après une coupure longue.
 * - Volume OU intensité, jamais les deux la même semaine : deux nouveaux stress à la fois, c'est la recette de la blessure.
 */

export interface WeekSummary {
  monday: ISODate;
  km: number;
  elevationGainM: number;
  /** Minutes en Z4 et Z5 : mesure de l'intensité. */
  hardMinutes: number;
  runs: number;
}

const RUN_SPORTS = new Set(['course', 'trail']);

export function weeklySummaries(activities: Pick<Activity, 'date' | 'sport' | 'distanceKm' | 'elevationGainM' | 'timeInZonesSec'>[], fromMonday: ISODate, toMonday: ISODate): WeekSummary[] {
  const weeks: WeekSummary[] = [];
  for (let m = fromMonday; m <= toMonday; m = addDays(m, 7)) weeks.push({ monday: m, km: 0, elevationGainM: 0, hardMinutes: 0, runs: 0 });
  const byMonday = new Map(weeks.map((w) => [w.monday, w]));
  for (const a of activities) {
    if (!RUN_SPORTS.has(a.sport)) continue;
    const w = byMonday.get(mondayOf(a.date));
    if (!w) continue;
    w.km += a.distanceKm;
    w.elevationGainM += a.elevationGainM;
    w.runs += 1;
    if (a.timeInZonesSec) w.hardMinutes += (a.timeInZonesSec[3] + a.timeInZonesSec[4]) / 60;
  }
  return weeks;
}

/** Référence de progression : max des N dernières semaines (les décharges s'excluent d'elles-mêmes). */
export function progressionReference(history: Pick<WeekSummary, 'km'>[]): number {
  return Math.max(0, ...history.slice(-PROGRESSION_REFERENCE_WEEKS).map((w) => w.km));
}

/** Volume maximal autorisé la semaine suivante. */
export function maxAllowedVolume(history: Pick<WeekSummary, 'km'>[]): number {
  return progressionReference(history) * (1 + MAX_WEEKLY_INCREASE);
}

/** Vérifie une semaine (planifiée ou modifiée) contre l'historique. */
export function checkWeekProgression(
  planned: { km: number; hardMinutes: number },
  history: Pick<WeekSummary, 'km' | 'hardMinutes'>[],
): Explanation[] {
  const recent = history.slice(-PROGRESSION_REFERENCE_WEEKS);
  const ref = progressionReference(recent);
  if (ref === 0) return [];
  const out: Explanation[] = [];
  const increase = planned.km / ref - 1;
  const pct = Math.round(increase * 100);
  if (increase > MAX_WEEKLY_INCREASE + 1e-9) {
    out.push(
      explain('progression.volume', 'attention', `+${pct} % de volume`, `La limite est +${MAX_WEEKLY_INCREASE * 100} % par rapport à ton max des ${PROGRESSION_REFERENCE_WEEKS} dernières semaines (${Math.round(ref)} km). Os, tendons et périoste s'adaptent plus lentement que le cardio.`, { pct, reference: Math.round(ref), max: Math.round(ref * (1 + MAX_WEEKLY_INCREASE)) }),
    );
  }
  const refHard = Math.max(0, ...recent.map((w) => w.hardMinutes));
  if (increase > 0.02 && planned.hardMinutes > refHard * 1.1 && refHard > 0) {
    out.push(
      explain('progression.both', 'attention', 'Volume ET intensité en hausse', 'On monte un des deux à la fois. Deux nouveaux stress la même semaine, c’est là que les blessures arrivent.', { pct, hardMinutes: Math.round(planned.hardMinutes), refHard: Math.round(refHard) }),
    );
  }
  return out;
}
