import { MIN_EASY_RUN_KM, MIN_RUN_WALK_KM, STRENGTH_SESSION_MIN, VO2_MIN_BASE_WEEKS } from './constants';
import { dayOfWeek, diffDays, weekday } from './dates';
import { explain } from './explain';
import type { GoalFamily } from './goals';
import {
  backToBackSecond, calibrationTest, descents, easyRun, hillSprints, longHills, longRun, raceDay, racePace,
  paceForTarget, rest, runWalk, strength, strides, threshold, vo2, type BuildContext, type BuiltSession,
} from './builders';
import { SESSION_LIBRARY, isKeyType, isRunType } from './library';
import type { WeekPlan } from './periodization';
import type { Availability, Experience, Explanation, GoalKind, ISODate, SessionType, Step, Weekday } from './types';

/**
 * Planification d'une semaine : quels jours, quelles séances, quel volume.
 * Principes : séances clés espacées de 48 h, jamais la veille de la longue ; « jours durs durs, jours faciles faciles »
 * (la muscu se greffe aux jours de qualité) ; le volume restant va aux sorties faciles.
 */

export interface WeekContext {
  goal: GoalKind;
  family: GoalFamily;
  availability: Availability;
  experience: Experience;
  vdot?: number;
  hrMaxEstimated: boolean;
  hasPoles: boolean;
  /** Index de la semaine dans le plan. */
  planWeek: number;
  /** Index de la semaine dans sa phase. */
  phaseWeek: number;
  race?: { date: ISODate; distanceKm: number };
  bRace?: { date: ISODate; distanceKm: number };
  /** Date à partir de laquelle planifier (les jours passés d'une semaine entamée sont laissés vides). */
  fromDate?: ISODate;
}

export interface SessionDraft {
  date: ISODate;
  type: SessionType;
  title: string;
  durationMin: number;
  distanceKm?: number;
  elevationGainM?: number;
  steps: Step[];
  rpeTarget?: number;
  isKey: boolean;
  minimal: { title: string; durationMin: number; steps: Step[] };
  why: string;
}

const circ = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));

/** Choisit les jours de course : la longue d'abord, puis les jours les plus espacés possible. */
export function pickRunDays(av: Availability): Weekday[] {
  const allowed = [...new Set([...av.allowedDays, av.longRunDay])].sort((a, b) => a - b);
  const n = Math.min(av.runDaysPerWeek, allowed.length);
  const selected: Weekday[] = [av.longRunDay];
  while (selected.length < n) {
    let best: Weekday | null = null;
    let bestGap = -1;
    for (const d of allowed) {
      if (selected.includes(d)) continue;
      const gap = Math.min(...selected.map((s) => circ(s, d)));
      if (gap > bestGap) {
        best = d;
        bestGap = gap;
      }
    }
    selected.push(best!);
  }
  return selected.sort((a, b) => a - b);
}

/** Choisit les jours de séances clés : ≥ 2 jours entre elles et avec la longue (si `longIsHard`). */
export function pickKeyDays(runDays: Weekday[], longDay: Weekday, count: number, longIsHard: boolean): Weekday[] {
  const candidates = runDays.filter((d) => d !== longDay).sort((a, b) => circ(b, longDay) - circ(a, longDay) || a - b);
  const keys: Weekday[] = [];
  for (const d of candidates) {
    if (keys.length >= count) break;
    if (keys.some((k) => circ(k, d) < 2)) continue;
    // Jamais la veille de la longue ; à 48 h de la longue quand elle est elle-même une séance clé.
    if (d === longDay - 1 || (longDay === 1 && d === 7)) continue;
    if (longIsHard && circ(d, longDay) < 2) continue;
    keys.push(d);
  }
  return keys.sort((a, b) => a - b);
}

function longIsKeyFor(ctx: WeekContext, week: WeekPlan): boolean {
  if (week.kind !== 'build') return false;
  if (ctx.family === 'trail') return week.phase === 'spec1' || week.phase === 'spec2' || week.phase === 'precomp';
  if (ctx.goal === 'route_semi' || ctx.goal === 'route_marathon') return week.phase === 'spec2' || week.phase === 'precomp';
  return false;
}

type Quality = 'seuil' | 'vo2max' | 'cotes_longues' | 'tempo';

/** Types de qualité par famille et phase (au plus un VO2max par semaine, jamais avant la base). */
export function qualityTypes(ctx: WeekContext, week: WeekPlan, count: number): Quality[] {
  const vo2ok = ctx.planWeek >= VO2_MIN_BASE_WEEKS || ctx.experience === 'avance';
  const longRoad = ctx.goal === 'route_semi' || ctx.goal === 'route_marathon';
  const alt = ctx.phaseWeek % 2 === 0;
  let pool: Quality[];
  if (week.kind === 'taper' || week.kind === 'course') pool = ['tempo'];
  else if (week.kind !== 'build' || !['spec1', 'spec2', 'precomp'].includes(week.phase)) pool = ctx.family === 'trail' && !alt ? ['cotes_longues'] : ['seuil'];
  else if (ctx.family === 'trail') {
    pool = {
      spec1: alt ? ['seuil', 'cotes_longues'] : ['cotes_longues', 'seuil'],
      spec2: ['vo2max', 'cotes_longues', 'seuil'],
      precomp: ['tempo', 'seuil', 'cotes_longues'],
    }[week.phase as 'spec1' | 'spec2' | 'precomp'] as Quality[];
  } else {
    pool = {
      spec1: ['seuil', 'vo2max', 'seuil'],
      spec2: longRoad ? ['tempo', 'vo2max', 'seuil'] : ['vo2max', 'seuil', 'tempo'],
      precomp: longRoad ? ['tempo', 'seuil', 'vo2max'] : ['tempo', 'vo2max', 'seuil'],
    }[week.phase as 'spec1' | 'spec2' | 'precomp'] as Quality[];
  }
  return pool.map((q) => (q === 'vo2max' && !vo2ok ? 'seuil' : q)).slice(0, count);
}

function buildQuality(q: Quality, b: BuildContext): BuiltSession {
  return q === 'seuil' ? threshold(b) : q === 'vo2max' ? vo2(b) : q === 'cotes_longues' ? longHills(b) : racePace(b);
}

export function buildWeekSessions(week: WeekPlan, ctx: WeekContext): { sessions: SessionDraft[]; notes: Explanation[] } {
  const notes: Explanation[] = [];
  const av = ctx.availability;
  const trail = ctx.family === 'trail';
  const b: BuildContext = {
    goal: ctx.goal, trail, vdot: ctx.vdot, phaseWeek: ctx.phaseWeek, planWeek: ctx.planWeek, hasPoles: ctx.hasPoles,
    light: week.phase === 'base' || week.kind === 'decharge' || week.kind === 'maintien',
    taper: week.kind === 'taper' || week.kind === 'course',
  };
  const runDays = pickRunDays(av);
  const longDay = av.longRunDay;
  const byDay = new Map<Weekday, BuiltSession & { isKey: boolean }>();
  const setDay = (d: Weekday, s: BuiltSession, isKey = SESSION_LIBRARY[s.type].isKey) => byDay.set(d, { ...s, isKey });

  // ── Course de la semaine (A ou B) ──────────────────────────────────────────
  const raceInWeek = [ctx.race, ctx.bRace].find((r) => r && diffDays(week.startDate, r.date) >= 0 && diffDays(week.startDate, r.date) < 7);
  const raceWd = raceInWeek ? weekday(raceInWeek.date) : undefined;

  // ── Séances clés ──────────────────────────────────────────────────────────
  const longIsKey = longIsKeyFor(ctx, week) && !raceInWeek;
  const needsTest = ctx.hrMaxEstimated && ctx.planWeek === 1 && ctx.family !== 'debuter' && week.kind !== 'course';
  let qualityCount = Math.max(0, week.keySessions - (longIsKey ? 1 : 0) - (raceInWeek ? 1 : 0));
  if (needsTest) qualityCount = Math.max(qualityCount, 1);
  const maxByDays = Math.floor((runDays.length - 1) / 2);
  if (qualityCount > maxByDays) {
    notes.push(explain('week.keys.days', 'info', 'Moins de séances clés', `Avec ${runDays.length} jours de course, on ne peut pas espacer ${qualityCount} séances clés de 48 h. On en garde ${maxByDays} : la récupération passe avant.`, { voulu: qualityCount, garde: maxByDays }));
    qualityCount = maxByDays;
  }
  let keyDays = pickKeyDays(runDays.filter((d) => raceWd === undefined || d < raceWd - 2), longDay, qualityCount, longIsKey);
  if (keyDays.length < qualityCount) {
    notes.push(explain('week.keys.spacing', 'info', 'Séances clés réduites', 'Pas assez de jours bien espacés cette semaine pour toutes les séances clés : on en retire une plutôt que de les coller.'));
  }
  const qualities = needsTest ? (['test'] as const) : qualityTypes(ctx, week, keyDays.length);
  keyDays = keyDays.slice(0, qualities.length);
  keyDays.forEach((d, i) => {
    const q = qualities[i]!;
    setDay(d, q === 'test' ? calibrationTest(b) : buildQuality(q, b));
  });
  if (needsTest) notes.push(explain('week.test', 'conseil', 'Test de calibration', 'Ta FC max est estimée. Un test de 3 km cette semaine, et tes zones et allures deviennent justes.'));

  // ── Course et sortie longue ───────────────────────────────────────────────
  if (raceInWeek && raceWd) {
    setDay(raceWd, raceDay(raceInWeek.distanceKm, b), true);
    // Pas d'effort la veille, Z1 court l'avant-veille.
    for (const d of [raceWd - 1, raceWd + 1]) if (d >= 1 && d <= 7 && runDays.includes(d as Weekday) && !byDay.has(d as Weekday)) setDay(d as Weekday, rest(), false);
  } else if (week.longRunKm > 0 && ctx.family !== 'debuter') {
    const gain = trail ? Math.round(week.targetElevationM * 0.4) : 0;
    setDay(longDay, longRun(week.longRunKm, b, longIsKey, gain), longIsKey);
  }

  // Back-to-back : trail long, pic, une semaine sur deux, lendemain disponible.
  const nextDay = (longDay === 7 ? 1 : longDay + 1) as Weekday;
  const b2b = trail && (ctx.goal === 'trail_moyen' || ctx.goal === 'ultra') && week.phase === 'spec2' && week.kind === 'build' && ctx.phaseWeek % 2 === 1
    && longDay !== 7 && av.allowedDays.includes(nextDay) && !raceInWeek;
  if (b2b) {
    // On répartit la longue sur deux jours (~75 % + ~50 %) plutôt que d'ajouter une 2e longue complète.
    const gain = Math.round(week.targetElevationM * 0.4);
    const first = longRun(week.longRunKm * 0.75, b, true, gain * 0.75);
    setDay(longDay, { ...first, type: 'back_to_back', title: first.title.replace(/^Longue spécifique/, 'Back-to-back, jour 1 :'), why: SESSION_LIBRARY.back_to_back.oneLiner }, true);
    setDay(nextDay, backToBackSecond(first.durationMin * 0.6, b), false);
    if (!runDays.includes(nextDay)) runDays.push(nextDay);
  }

  // Semaine de course : un rappel d'allure à J-3 (intensité maintenue, volume réduit).
  if (raceWd && raceWd - 3 >= 1 && runDays.includes((raceWd - 3) as Weekday) && !byDay.has((raceWd - 3) as Weekday)) {
    setDay((raceWd - 3) as Weekday, racePace({ ...b, taper: true }), false);
  }

  // ── Sorties faciles ───────────────────────────────────────────────────────
  const plannedKm = [...byDay.values()].filter((s) => s.type !== 'course').reduce((s, x) => s + x.distanceKm, 0);
  let easyDays = runDays.filter((d) => !byDay.has(d));
  let remaining = week.targetKm - plannedKm;
  // En marche-course, une sortie courte reste utile (c'est la régularité qui adapte les tissus).
  const minEasy = week.phase === 'demarrage' || ctx.family === 'debuter' ? MIN_RUN_WALK_KM : MIN_EASY_RUN_KM;
  while (easyDays.length > 0 && remaining / easyDays.length < minEasy) {
    // Trop peu de volume pour toutes les sorties : on retire le jour le plus proche d'une séance clé.
    const drop = [...easyDays].sort((a, c) => Math.min(...[...byDay.keys()].map((k) => circ(k, a)), 7) - Math.min(...[...byDay.keys()].map((k) => circ(k, c)), 7))[0]!;
    easyDays = easyDays.filter((d) => d !== drop);
  }
  remaining = Math.max(0, remaining);
  const perEasy = easyDays.length ? remaining / easyDays.length : 0;
  let unplaced = easyDays.length ? 0 : remaining;
  const keyDaySet = new Set([...byDay.entries()].filter(([, s]) => s.isKey).map(([d]) => d));
  let stridesPlaced = false;
  let sprintsPlaced = false;
  let descentsPlaced = false;
  for (const d of easyDays) {
    // Plafond horaire du jour : on ne transforme pas une sortie facile en longue cachée.
    const maxMin = d >= 6 ? av.maxWeekendMinutes : av.maxWeekdayMinutes;
    const capKm = maxMin / paceForTarget({ zone: 'z2' }, b);
    const km = Math.round(Math.min(perEasy, capKm) * 2) / 2;
    unplaced += Math.max(0, perEasy - capKm);
    const dayAfterLong = d === nextDay && byDay.has(longDay);
    // Les séances neuromusculaires (sprints, descentes) ne vont ni la veille ni le lendemain d'une séance dure.
    const dayBeforeKey = keyDaySet.has(((d % 7) + 1) as Weekday) || d === longDay - 1 || keyDaySet.has((((d + 5) % 7) + 1) as Weekday);
    let s: BuiltSession;
    if (week.phase === 'demarrage' || ctx.family === 'debuter') s = runWalk(km, b);
    else if (week.kind === 'recup') s = easyRun(km, b, ctx.phaseWeek === 0 ? 'z1' : 'z2');
    else if (dayAfterLong) s = easyRun(km, b, 'z1');
    else if (!sprintsPlaced && week.phase === 'base' && week.kind === 'build' && ctx.planWeek >= 1 && !dayBeforeKey) {
      s = hillSprints(km, b);
      sprintsPlaced = true;
    } else if (!descentsPlaced && trail && ['spec1', 'spec2', 'precomp'].includes(week.phase) && week.kind === 'build' && !dayBeforeKey) {
      s = descents(km, b);
      descentsPlaced = true;
    } else if (!stridesPlaced) {
      s = strides(km, b);
      stridesPlaced = true;
    } else s = easyRun(km, b);
    setDay(d, s, false);
  }

  if (unplaced > minEasy && week.kind !== 'course') {
    notes.push(explain('week.volume.short', 'info', 'Volume un peu sous la cible', `Il manque environ ${Math.round(unplaced)} km : tes jours et plages horaires sont déjà pleins. On ne compense pas en allongeant tout : c'est correct.`, { km: Math.round(unplaced) }));
  }

  // ── D+ (trail) : réparti selon le type de séance ─────────────────────────
  const elevationWeight: Partial<Record<SessionType, number>> = { cotes_longues: 2, vo2max: 1.5, descentes: 1.5, hill_sprints: 1.2, longue_facile: 1.3, longue_specifique: 1.3, back_to_back: 1.3, z1_recup: 0.5, seuil: 0.5 };
  if (trail && week.targetElevationM > 0) {
    const runs = [...byDay.entries()].filter(([, s]) => isRunType(s.type) && s.type !== 'course' && s.distanceKm > 0);
    const total = runs.reduce((acc, [, s]) => acc + s.distanceKm * (elevationWeight[s.type] ?? 1), 0);
    for (const [d, s] of runs) byDay.set(d, { ...s, elevationGainM: Math.round(((week.targetElevationM * s.distanceKm * (elevationWeight[s.type] ?? 1)) / total) / 10) * 10 } as never);
  }

  // ── Muscu : greffée aux jours durs, jamais la veille de la longue ou d'une course ──
  const strengthCount = week.kind === 'recup' || week.kind === 'course' ? 0 : week.kind === 'taper' ? Math.min(1, av.strengthPerWeek) : av.strengthPerWeek;
  const strengthType = week.phase === 'precomp' ? 'plyo' : (week.phase === 'spec1' || week.phase === 'spec2') && trail ? 'muscu_trail' : 'muscu_generale';
  const forbidden = new Set<number>([longDay - 1, ...(raceWd ? [raceWd - 1, raceWd - 2, raceWd] : [])]);
  const strengthDays = [...[...keyDaySet].filter((d) => d !== longDay), ...([1, 2, 3, 4, 5, 6, 7] as Weekday[]).filter((d) => !keyDaySet.has(d))]
    .filter((d) => !forbidden.has(d) && d !== longDay)
    .filter((d, i, arr) => arr.indexOf(d) === i);
  const strengthPicked: Weekday[] = [];
  for (const d of strengthDays) {
    if (strengthPicked.length >= strengthCount) break;
    if (strengthPicked.some((p) => circ(p, d) < 2)) continue;
    strengthPicked.push(d);
  }

  // ── Assemblage ────────────────────────────────────────────────────────────
  const sessions: SessionDraft[] = [];
  for (let d = 1 as Weekday; d <= 7; d = (d + 1) as Weekday) {
    const date = dayOfWeek(week.startDate, d);
    if (ctx.fromDate && date < ctx.fromDate) continue;
    const s = byDay.get(d) ?? rest();
    sessions.push(toDraft(date, s, byDay.get(d)?.isKey ?? false));
    if (strengthPicked.includes(d)) {
      const st = strength(strengthPicked.indexOf(d) === 1 && strengthType === 'plyo' ? 'muscu_trail' : strengthType, STRENGTH_SESSION_MIN);
      sessions.push(toDraft(date, st, false));
    }
  }
  return { sessions, notes };
}

function toDraft(date: ISODate, s: BuiltSession & { elevationGainM?: number }, isKey: boolean): SessionDraft {
  const info = SESSION_LIBRARY[s.type];
  return {
    date,
    type: s.type,
    title: s.title,
    durationMin: s.durationMin,
    ...(s.distanceKm ? { distanceKm: s.distanceKm } : {}),
    ...(s.elevationGainM ? { elevationGainM: s.elevationGainM } : {}),
    steps: s.steps,
    ...(s.rpeTarget ? { rpeTarget: s.rpeTarget } : {}),
    isKey,
    minimal: { title: info.mvv.title, durationMin: info.mvv.minutes, steps: info.mvv.steps },
    why: s.why,
  };
}

// ─── Validation d'un déplacement (glisser-déposer) ────────────────────────────

export interface MovableSession {
  id: string;
  date: ISODate;
  type: SessionType;
  isKey: boolean;
}

/** Vérifie en direct un déplacement de séance. Ne bloque rien : explique. */
export function validateMove(sessions: MovableSession[], id: string, newDate: ISODate): Explanation[] {
  const moved = sessions.find((s) => s.id === id);
  if (!moved) return [];
  const others = sessions.filter((s) => s.id !== id);
  const after = { ...moved, date: newDate };
  const out: Explanation[] = [];
  const hard = (s: MovableSession) => s.isKey || s.type === 'longue_facile' || s.type === 'course';

  if (others.some((s) => s.type === 'course' && s.date === newDate) && moved.type !== 'repos') {
    out.push(explain('move.raceday', 'stop', 'Jour de course', 'Ce jour-là, c’est la course. Rien d’autre.'));
  }
  if (hard(after) && isRunType(after.type)) {
    for (const s of others) {
      const gap = Math.abs(diffDays(s.date, newDate));
      if (s.isKey && after.isKey && gap < 2) {
        out.push(explain('move.keys48h', 'attention', 'Deux séances clés à moins de 48 h', `Avec « ${SESSION_LIBRARY[s.type].label} » le ${s.date}, tu n'as pas le temps de récupérer : la 2e séance sera de moins bonne qualité, et le risque de blessure monte.`, { autre: s.date }));
      }
    }
  }
  if (after.isKey) {
    const next = others.find((s) => diffDays(newDate, s.date) === 1 && (s.type === 'longue_facile' || s.type === 'longue_specifique' || s.type === 'back_to_back'));
    if (next && !next.isKey) out.push(explain('move.beforelong', 'conseil', 'Qualité la veille de la longue', 'Tu vas commencer ta longue fatigué. Possible, mais la longue risque de glisser en Z3.'));
  }
  if (after.type === 'descentes' && others.some((s) => diffDays(newDate, s.date) === 1 && hard(s))) {
    out.push(explain('move.descents', 'attention', 'Descentes la veille d’une séance clé', 'Les quads ne récupèrent pas en 24 h d’une séance excentrique : la séance clé du lendemain en souffrira.'));
  }
  if (isRunType(after.type) && others.some((s) => s.date === newDate && isRunType(s.type) && s.type !== 'repos')) {
    out.push(explain('move.sameday', 'info', 'Deux sorties le même jour', 'Possible (double), mais compte le volume total de la journée.'));
  }
  if (isKeyType(after.type)) {
    const week = others.filter((s) => s.isKey && Math.abs(diffDays(s.date, newDate)) < 7 && Math.floor(diffDays(sessions[0]!.date, s.date) / 7) === Math.floor(diffDays(sessions[0]!.date, newDate) / 7));
    if (week.length + 1 > 3) out.push(explain('move.toomanykeys', 'attention', 'Trop de séances clés dans la semaine', 'Maximum 2 (3 en phase pic si tout va bien). Le reste, c’est du facile.'));
  }
  return out;
}

