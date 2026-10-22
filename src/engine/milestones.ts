import {
  MILESTONE_BIG_CLIMB_M, MILESTONE_CONTINUOUS_MIN, MILESTONE_DISTANCES_KM, MILESTONE_DISTANCE_TOLERANCE, MILESTONE_LONGEST_MIN_KM, MILESTONE_STREAK_MIN_RUNS,
  MILESTONE_STREAK_WEEKS, MILESTONE_TOTAL_KM,
} from './constants';
import { addDays, mondayOf } from './dates';
import { explain } from './explain';
import type { Explanation, ISODate, Sport } from './types';

/**
 * Jalons : de vrais premiers (30 min d'affilée, premier 5 km, premier semi…), des cumuls (100 km, 1000 km),
 * des séries de semaines régulières, la sortie la plus longue. Sobres : un jalon, une phrase, la date.
 */

export interface MilestoneActivity {
  date: ISODate;
  sport: Sport;
  durationSec: number;
  movingSec?: number;
  distanceKm: number;
  elevationGainM: number;
}

export interface MilestoneHit {
  key: string;
  /** Date à laquelle le jalon a été atteint. */
  date: ISODate;
  value?: number;
  explanation: Explanation;
}

const isRun = (a: MilestoneActivity) => (a.sport === 'course' || a.sport === 'trail') && a.distanceKm > 0;
const label = (km: number) => (km === 21.0975 ? 'semi-marathon' : km === 42.195 ? 'marathon' : `${km} km`);
const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Tous les jalons atteints d'après l'historique, sans ceux déjà enregistrés (`known`).
 * Idempotent : relancé après chaque sortie, il ne renvoie que les nouveaux.
 */
export function newMilestones(acts: MilestoneActivity[], known: Set<string>): MilestoneHit[] {
  const runs = acts.filter(isRun).sort((a, b) => a.date.localeCompare(b.date));
  const hits: MilestoneHit[] = [];
  const add = (key: string, date: ISODate, title: string, why: string, value?: number) => {
    if (!known.has(key)) hits.push({ key, date, ...(value !== undefined ? { value } : {}), explanation: explain(`milestone.${key.split('-')[0]}`, 'info', title, why, value !== undefined ? { valeur: value } : {}) });
  };

  const first = runs[0];
  if (first) add('first-run', first.date, 'Première sortie', 'Tout commence ici : une sortie, puis une autre. La régularité fait le reste.');
  const thirty = runs.find((a) => (a.movingSec ?? a.durationSec) >= MILESTONE_CONTINUOUS_MIN * 60);
  if (thirty) add('continuous-30', thirty.date, 'Tu cours 30 minutes', `${MILESTONE_CONTINUOUS_MIN} min d'une traite : c'est le cap du parcours de démarrage, et le début de la vraie base.`);
  for (const km of MILESTONE_DISTANCES_KM) {
    const hit = runs.find((a) => a.distanceKm >= km * MILESTONE_DISTANCE_TOLERANCE);
    if (hit) add(`first-${km}k`, hit.date, `Premier ${label(km)}`, `${round1(hit.distanceKm)} km d'une traite. Ce que tu viens de faire, tu ne pouvais pas le faire il y a quelques mois.`, round1(hit.distanceKm));
  }
  const climb = runs.find((a) => a.elevationGainM >= MILESTONE_BIG_CLIMB_M);
  if (climb) add('climb-1000', climb.date, '1000 m de D+ en une sortie', `${Math.round(climb.elevationGainM)} m de D+ : tes montées et tes descentes sont devenues solides.`, Math.round(climb.elevationGainM));

  let total = 0;
  const pending = [...MILESTONE_TOTAL_KM];
  for (const a of runs) {
    total += a.distanceKm;
    while (pending.length && total >= pending[0]!) {
      const km = pending.shift()!;
      add(`total-${km}`, a.date, `${km} km au compteur`, `${km} km cumulés depuis ta première sortie. Chaque kilomètre compte, et ils s'additionnent.`, km);
    }
  }

  // Régularité : semaines de suite avec au moins N sorties.
  const perWeek = new Map<ISODate, number>();
  for (const a of runs) perWeek.set(mondayOf(a.date), (perWeek.get(mondayOf(a.date)) ?? 0) + 1);
  const weeks = [...perWeek.entries()].filter(([, n]) => n >= MILESTONE_STREAK_MIN_RUNS).map(([m]) => m).sort();
  let streak = 0;
  const reached = new Set<number>();
  weeks.forEach((monday, i) => {
    streak = i > 0 && addDays(weeks[i - 1]!, 7) === monday ? streak + 1 : 1;
    for (const n of MILESTONE_STREAK_WEEKS) {
      if (streak >= n && !reached.has(n)) {
        reached.add(n);
        add(`streak-${n}`, addDays(monday, 6), `${n} semaines de suite`, `${n} semaines d'affilée avec au moins ${MILESTONE_STREAK_MIN_RUNS} sorties : la régularité est ce qui construit un coureur.`, n);
      }
    }
  });

  // Sortie la plus longue : le dernier record seulement (pas un jalon par kilomètre gagné).
  let best = 0;
  let record: MilestoneActivity | undefined;
  for (const a of runs) {
    if (a.distanceKm > best) {
      best = a.distanceKm;
      if (a.distanceKm >= MILESTONE_LONGEST_MIN_KM) record = a;
    }
  }
  if (record && first && record !== first) add(`longest-${Math.floor(record.distanceKm)}`, record.date, `Ta plus longue sortie : ${round1(record.distanceKm)} km`, 'Nouveau record personnel de distance. On le consolide avec des sorties plus courtes, puis on le repoussera.', round1(record.distanceKm));
  return hits.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

/** Jalons atteints dans les `days` derniers jours (pour la carte « Bravo » d'Aujourd'hui). */
export function recentMilestones<T extends { date: ISODate }>(all: T[], today: ISODate, days = 7): T[] {
  const from = addDays(today, -days);
  return all.filter((m) => m.date > from && m.date <= today).sort((a, b) => b.date.localeCompare(a.date));
}
