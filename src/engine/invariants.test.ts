import { describe, expect, it } from 'vitest';
import { longRun } from './builders';
import { addDays, diffDays } from './dates';
import { GOALS } from './goals';
import { isRunType } from './library';
import { generatePlan, type PlanRequest } from './periodization';
import { deriveProfile } from './profiles';
import { buildWeekSessions, type SessionDraft } from './scheduling';
import type { Availability, Difficulty, Experience, GoalKind, Weekday } from './types';

/**
 * Balayage : des milliers de plans (objectifs × niveaux × jours × volumes × délais × plages horaires), chaque
 * semaine construite séance par séance, et les règles du coach vérifiées partout. Une seule violation fait échouer.
 */

const START = '2026-04-22';
const LONG = ['longue_facile', 'longue_specifique', 'back_to_back'];
const isRun = (s: SessionDraft) => isRunType(s.type) && s.type !== 'repos' && s.type !== 'croise';

interface Case { goal: GoalKind; experience: Experience; days: number; km: number; difficulty: Difficulty; weeks?: number; wd: number; we: number; longDay: Weekday }

function cases(): Case[] {
  const out: Case[] = [];
  for (const goal of Object.keys(GOALS) as GoalKind[]) {
    const race = GOALS[goal].family === 'route' || GOALS[goal].family === 'trail';
    for (const experience of ['jamais', 'debutant', 'regulier', 'avance'] as Experience[])
      for (const days of [1, 2, 3, 5, 7])
        for (const km of experience === 'jamais' ? [0, 8] : [0, 25, 60])
          for (const weeks of race ? [3, GOALS[goal].idealWeeks, 30] : [undefined, 8])
            for (const [wd, we, longDay] of [[45, 90, 6], [90, 300, 3]] as [number, number, Weekday][])
              out.push({ goal, experience, days, km, difficulty: days === 3 ? 'ambitieux' : 'equilibre', weeks, wd, we, longDay });
  }
  return out;
}

function check(c: Case): string[] {
  const errors: string[] = [];
  const allowed = (c.days === 7 ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7].slice(0, Math.max(c.days + 1, 3))) as Weekday[];
  const av: Availability = { runDaysPerWeek: c.days, allowedDays: allowed, longRunDay: c.longDay, maxWeekdayMinutes: c.wd, maxWeekendMinutes: c.we, strengthPerWeek: 1 };
  const g = GOALS[c.goal];
  const race = c.weeks && (g.family === 'route' || g.family === 'trail') ? { date: addDays(START, (c.weeks - 1) * 7 + 3), distanceKm: g.defaultDistanceKm, elevationGainM: g.defaultElevationM } : undefined;
  const profile = deriveProfile({ experience: c.experience, today: START });
  const req: PlanRequest = { goal: c.goal, startDate: START, experience: c.experience, difficulty: c.difficulty, currentWeeklyKm: c.km, availability: av, profile, ...(race ? { race } : { durationWeeks: c.weeks }), ...(c.km > 0 ? { continuousMin: Math.min(90, c.km * 2) } : {}) };
  const draft = generatePlan(req);
  const err = (rule: string, where: string) => errors.push(`${rule} — ${c.goal}/${c.experience}/${c.days}j/${c.km}km/${c.weeks}s/${c.wd}-${c.we} ${where}`);
  if (!draft.ok) {
    if (!draft.warnings.length) err('refus sans explication', '');
    return errors;
  }
  if (draft.weeks.every((w) => w.targetKm <= 0)) err('plan à 0 km', '');
  if (race && draft.weeks.at(-1)!.raceDate !== race.date) err('course pas sur la dernière semaine', '');
  let longestMin = 0;
  draft.weeks.forEach((w, i) => {
    const at = `s${i} ${w.phase}/${w.kind}`;
    if (![w.targetKm, w.longRunKm, w.targetElevationM].every((v) => Number.isFinite(v) && v >= 0)) err('valeur invalide', at);
    if (i > 0 && w.phase !== 'demarrage' && w.kind !== 'taper' && w.kind !== 'course') {
      const ref = Math.max(...draft.weeks.slice(Math.max(0, i - 4), i).map((x) => x.targetKm));
      if (w.targetKm > ref * 1.1 + 0.05) err('volume > +10 %', at);
    }
    const { sessions } = buildWeekSessions(w, {
      goal: c.goal, family: draft.family, availability: av, experience: c.experience, hrMaxEstimated: true, hasPoles: false,
      planWeek: i, phaseWeek: i - draft.weeks.findIndex((x) => x.phase === w.phase), race, profile,
    });
    const runs = sessions.filter(isRun);
    for (const s of sessions) {
      const d = diffDays(w.startDate, s.date);
      if (d < 0 || d > 6) err('séance hors semaine', at);
      if (!Number.isFinite(s.durationMin) || (s.type !== 'repos' && s.durationMin <= 0)) err('durée invalide', `${at} ${s.type}`);
      if (isRun(s) && s.type !== 'course') {
        const wd = (d + 1) as Weekday;
        if (!allowed.includes(wd) && wd !== c.longDay) err('jour non disponible', `${at} ${s.type}`);
        const cap = wd === c.longDay || wd >= 6 ? c.we : c.wd;
        if (!LONG.includes(s.type) && s.durationMin > cap) err('plus long que le temps du jour', `${at} ${s.type} ${s.durationMin}>${cap}`);
      }
    }
    if (runs.length !== new Set(runs.map((s) => s.date)).size) err('deux sorties le même jour', at);
    const keys = sessions.filter((s) => s.isKey).map((s) => diffDays(w.startDate, s.date)).sort((a, b) => a - b);
    for (let k = 1; k < keys.length; k++) if (keys[k]! - keys[k - 1]! < 2) err('séances clés collées', at);
    const long = sessions.find((s) => LONG.includes(s.type));
    if (long && w.kind !== 'course') for (const s of runs) if (s.durationMin > long.durationMin) err('la longue n’est pas la plus longue', `${at} ${s.type}`);
    if (!long && !w.runWalk && w.kind !== 'course' && w.longRunKm > 0) err('longue manquante', at);
    if (race && diffDays(w.startDate, race.date) >= 0 && diffDays(w.startDate, race.date) < 7) {
      if (!sessions.some((s) => s.type === 'course' && s.date === race.date)) err('pas de séance de course', at);
      if (sessions.some((s) => s.isKey && s.type !== 'course' && diffDays(s.date, race.date) >= 0 && diffDays(s.date, race.date) < 3)) err('séance clé à moins de 3 jours de la course', at);
    }
    if (!w.runWalk && w.kind !== 'course' && w.targetKm >= 12) {
      const planned = runs.reduce((a, s) => a + (s.distanceKm ?? 0), 0) / w.targetKm;
      if (planned < 0.75 || planned > 1.25) err('volume planifié loin de la cible', `${at} ${planned.toFixed(2)}`);
    }
    // +10 % de temps de course sur la plus longue sortie (référence : la plus longue déjà faite, en km-effort).
    const maxRun = Math.max(0, ...runs.filter((s) => s.type !== 'course').map((s) => s.durationMin));
    const ref = Math.max(longestMin, w.longestRunKm ? longRun(w.longestRunKm, { goal: c.goal, trail: draft.family === 'trail', phaseWeek: 0 }, false).durationMin : 0);
    if (ref > 0 && !w.runWalk && w.kind !== 'course' && maxRun > ref * 1.1 + 1.5) err('sortie > +10 %', `${at} ${maxRun}>${ref}`);
    if (!w.runWalk) longestMin = Math.max(longestMin, maxRun);
    const longD = long ? diffDays(w.startDate, long.date) : -9;
    if (sessions.some((s) => (s.type.startsWith('muscu') || s.type === 'plyo') && diffDays(w.startDate, s.date) === longD - 1)) err('muscu la veille de la longue', at);
  });
  return errors;
}

describe('invariants du coach sur un balayage de plans', () => {
  const all = cases();
  it(`${all.length} plans : aucune règle violée`, () => {
    const errors = all.flatMap(check);
    expect(errors.slice(0, 20)).toEqual([]);
  }, 60_000);
});
