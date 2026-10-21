import {
  MIN_EASY_RUN_KM, RUN_WALK_LADDER, RUN_WALK_LONG_DAY_EXTRA_WALK_MIN, RUN_WALK_MAX_SESSIONS_PER_WEEK,
  STRENGTH_SESSION_MIN, STRIDES_MIN_CONTINUOUS_MIN, VO2_MIN_BASE_WEEKS, WALK_PACE_MIN_PER_KM,
} from './constants';
import { projectStages, stageKind, stageLabel, stageRunMinutes, walkFirstMinutes, type RunWalkState } from './runwalk';
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
  /** Niveau de départ en marche-course (résultat de startMode). */
  runWalkStage?: number;
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

/**
 * Jours de séance pendant le démarrage : au plus 3, JAMAIS deux jours de suite (les tissus récupèrent en 48 h).
 * On maximise d'abord le nombre de séances, puis on garde le jour de la longue, puis on étale.
 */
export function journeyDays(av: Availability, max = RUN_WALK_MAX_SESSIONS_PER_WEEK): Weekday[] {
  const allowed = [...new Set([...av.allowedDays, av.longRunDay])].sort((a, b) => a - b);
  const want = Math.min(max, av.runDaysPerWeek);
  let best: Weekday[] = [];
  let bestScore = -1;
  for (let mask = 1; mask < 1 << allowed.length; mask++) {
    const set = allowed.filter((_, i) => mask & (1 << i));
    if (set.length > want) continue;
    if (set.some((d, i) => set.some((e, j) => i < j && circ(d, e) < 2))) continue;
    const spread = set.length > 1 ? Math.min(...set.flatMap((d, i) => set.slice(i + 1).map((e) => circ(d, e)))) : 0;
    const score = set.length * 100 + (set.includes(av.longRunDay) ? 10 : 0) + spread;
    if (score > bestScore) {
      best = set;
      bestScore = score;
    }
  }
  return best;
}

function describeStage(stage: number): string {
  const kind = stageKind(stage);
  if (kind === 'marche') return 'en marchant d’un bon pas';
  if (kind === 'continu') return 'en course continue facile';
  const r = RUN_WALK_LADDER[stage - 1]!;
  return `en alternant ${r.runSec < 60 ? `${r.runSec} s` : `${r.runSec / 60} min`} de course et ${r.walkSec / 60} min de marche`;
}

/**
 * Semaine du parcours de démarrage : toutes les séances sont au palier prévu (marche d'abord, marche/course ou
 * continu 20 → 30 min), Y COMPRIS le jour de la longue (+10 min de marche). Ni séance clé, ni strides, ni sprints,
 * ni test, ni plyo. Les jours disponibles en plus deviennent de la marche ou du vélo, facultatifs.
 */
function buildJourneyWeek(week: WeekPlan, ctx: WeekContext): { sessions: SessionDraft[]; notes: Explanation[] } {
  const notes: Explanation[] = [];
  const av = ctx.availability;
  const b: BuildContext = { goal: ctx.goal, trail: ctx.family === 'trail', vdot: ctx.vdot, phaseWeek: ctx.phaseWeek };
  const plan = week.runWalk!.sessions;
  let days = journeyDays(av, plan.length);
  const raceInWeek = [ctx.race, ctx.bRace].find((r) => r && diffDays(week.startDate, r.date) >= 0 && diffDays(week.startDate, r.date) < 7);
  const raceWd = raceInWeek ? weekday(raceInWeek.date) : undefined;
  if (raceWd) days = days.filter((d) => d < raceWd - 1).slice(0, 2);
  const longDay = days.includes(av.longRunDay) ? av.longRunDay : days.at(-1);
  const byDay = new Map<Weekday, SessionDraft>();
  days.forEach((d, i) => {
    const p = plan[Math.min(i, plan.length - 1)]!;
    const built = runWalk(p.stage, b, { walkMin: walkFirstMinutes(p.validatedAtStage), extraWalkMin: d === longDay && !raceWd ? RUN_WALK_LONG_DAY_EXTRA_WALK_MIN : 0 });
    byDay.set(d, toDraft(dayOfWeek(week.startDate, d), built, false));
  });
  if (raceInWeek && raceWd) {
    // Course pendant le démarrage : en marche/course au palier courant. Marcher fait partie de la stratégie.
    const stage = plan.at(-1)!.stage;
    const runShare = stageKind(stage) === 'marche' ? 0 : stageKind(stage) === 'continu' ? 1 : stageRunMinutes(stage) / (stageRunMinutes(stage) + (RUN_WALK_LADDER[stage - 1]!.walkSec * RUN_WALK_LADDER[stage - 1]!.reps) / 60);
    const pace = runShare * paceForTarget({ zone: 'z2' }, b) + (1 - runShare) * WALK_PACE_MIN_PER_KM;
    const minutes = Math.round(raceInWeek.distanceKm * pace);
    byDay.set(raceWd, toDraft(raceInWeek.date, {
      type: 'course', title: `Course : ${raceInWeek.distanceKm} km en marche/course`, durationMin: minutes, distanceKm: raceInWeek.distanceKm,
      steps: [{ kind: 'continu', distanceKm: raceInWeek.distanceKm, target: { rpe: 6 }, note: `Comme à l'entraînement (${stageLabel(stage).toLowerCase()}) : ${describeStage(stage)}. Marcher fait partie de la stratégie, pas un échec.` }],
      why: 'Jour de course, à ton rythme : tu la finis en marche/course, en santé.',
    }, true));
    notes.push(explain('week.runwalk.race', 'info', 'Course en marche/course', `La course tombe pendant ton démarrage : tu la fais ${describeStage(stage)}. Pas de séance « allure course » cette semaine.`));
  }
  // Jours disponibles en plus : marche ou vélo facile, facultatif (jamais de course en plus).
  const used = new Set<number>([...byDay.keys()]);
  const extra = [...new Set(av.allowedDays)].filter((d) => !used.has(d) && (!raceWd || d < raceWd - 1)).slice(0, Math.max(0, av.runDaysPerWeek - days.length));
  for (const d of extra) {
    byDay.set(d as Weekday, toDraft(dayOfWeek(week.startDate, d as Weekday), { type: 'croise', title: 'Marche active ou vélo facile 30 min (facultatif)', durationMin: 30, distanceKm: 0, steps: [{ kind: 'continu', minutes: 30, target: { rpe: 3 } }], why: 'Bouger sans ajouter d’impact : la course reste à 3 séances, jamais deux jours de suite.' }, false));
  }
  // Muscu générale permise (poids du corps), jamais de plyo : sur un jour de séance, pas la veille de la course.
  const strengthDays = days.filter((d) => d !== longDay && (!raceWd || (d !== raceWd - 1 && d !== raceWd - 2))).slice(0, av.strengthPerWeek);
  const sessions: SessionDraft[] = [];
  for (let d = 1 as Weekday; d <= 7; d = (d + 1) as Weekday) {
    const date = dayOfWeek(week.startDate, d);
    if (ctx.fromDate && date < ctx.fromDate) continue;
    sessions.push(byDay.get(d) ?? toDraft(date, rest(), false));
    if (strengthDays.includes(d)) sessions.push(toDraft(date, strength('muscu_generale', STRENGTH_SESSION_MIN), false));
  }
  notes.push(explain('week.runwalk', 'info', 'Semaine de démarrage', `${days.length} séance(s) au ${stageLabel(plan[0]!.stage).toLowerCase()}, jamais deux jours de suite. Tu avances d'un palier quand tes séances sont faciles : c'est ton corps qui donne le rythme, pas le calendrier.`));
  return { sessions, notes };
}

export function buildWeekSessions(week: WeekPlan, ctx: WeekContext): { sessions: SessionDraft[]; notes: Explanation[] } {
  if (week.runWalk) return buildJourneyWeek(week, ctx);
  const notes: Explanation[] = [];
  const av = ctx.availability;
  const trail = ctx.family === 'trail';
  const b: BuildContext = {
    goal: ctx.goal, trail, vdot: ctx.vdot, phaseWeek: ctx.phaseWeek, planWeek: ctx.planWeek, hasPoles: ctx.hasPoles, runWalkStage: ctx.runWalkStage,
    light: week.phase === 'base' || week.kind === 'decharge' || week.kind === 'maintien',
    taper: week.kind === 'taper' || week.kind === 'course',
  };
  const runDays = pickRunDays(av);
  const longDay = av.longRunDay;
  const byDay = new Map<Weekday, BuiltSession & { isKey: boolean }>();
  // Strides et sprints : seulement si on court au moins 30 min d'affilée (la sortie longue en donne la mesure).
  const neuroOk = week.longRunKm * paceForTarget({ zone: 'z2' }, b) >= STRIDES_MIN_CONTINUOUS_MIN;
  const setDay = (d: Weekday, s: BuiltSession, isKey = SESSION_LIBRARY[s.type].isKey) => byDay.set(d, { ...s, isKey });

  // ── Course de la semaine (A ou B) ──────────────────────────────────────────
  const raceInWeek = [ctx.race, ctx.bRace].find((r) => r && diffDays(week.startDate, r.date) >= 0 && diffDays(week.startDate, r.date) < 7);
  const raceWd = raceInWeek ? weekday(raceInWeek.date) : undefined;

  // ── Séances clés ──────────────────────────────────────────────────────────
  const longIsKey = longIsKeyFor(ctx, week) && !raceInWeek;
  // Test à fond (3 km chrono) : réservé aux coureurs expérimentés. Un débutant garde ses zones estimées,
  // et peut calibrer plus tard depuis le Profil quand il a la base.
  const needsTest = ctx.hrMaxEstimated && ctx.planWeek === 1 && ctx.family !== 'debuter' && week.phase !== 'demarrage' && week.kind !== 'course' && (ctx.experience === 'regulier' || ctx.experience === 'avance');
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
  // La sortie longue est construite d'abord : c'est la plus longue sortie de la semaine, aucune autre ne la dépasse.
  const gain = trail ? Math.round(week.targetElevationM * 0.4) : 0;
  let long = !raceInWeek && week.longRunKm > 0 ? longRun(week.longRunKm, b, longIsKey, gain) : undefined;
  // Une séance dure plus longue que la longue (échauffement et retour au calme compris) dépasserait ce que le corps
  // a déjà fait : du facile avec strides à la place, et on le dit. En décharge et à l'affûtage, l'intensité est
  // gardée : la longue a déjà été plus longue les semaines d'avant, c'est elle qui s'allonge jusqu'à la séance dure.
  const lowerWeek = week.kind === 'taper' || week.kind === 'decharge';
  const done = lowerWeek && week.longestRunKm ? longRun(week.longestRunKm, b, false, gain).durationMin : 0;
  const qualityCap = long ? Math.max(long.durationMin, done) : Infinity;
  const built = qualities.map((q) => (q === 'test' ? calibrationTest(b) : buildQuality(q, b)));
  keyDays.forEach((d, i) => {
    const q = built[i]!;
    if (q.durationMin > qualityCap) {
      const longMin = long!.durationMin;
      setDay(d, neuroOk ? strides(week.longRunKm, b, longMin) : easyRun(week.longRunKm, b, 'z2', longMin), false);
      notes.push(explain('week.quality.light', 'info', 'Qualité reportée', `Cette séance dure ferait ${q.durationMin} min au total, plus que ta sortie longue (${longMin} min). On garde du facile${neuroOk ? ' avec strides' : ''} et on bâtit d'abord la base : la qualité reviendra quand tes sorties seront plus longues.`, { seance: q.durationMin, longue: longMin }));
      return;
    }
    setDay(d, q);
  });
  const hardest = Math.max(0, ...built.slice(0, keyDays.length).map((q) => q.durationMin).filter((m) => m <= qualityCap));
  if (long && hardest > long.durationMin) {
    const pace = paceForTarget({ zone: 'z2' }, b);
    long = longRun(Math.ceil((hardest / pace - gain / 100) * 10) / 10, b, longIsKey, gain);
  }
  // Plafond de durée de toutes les autres sorties de la semaine.
  const capMin = long ? long.durationMin : Infinity;
  if (needsTest) notes.push(explain('week.test', 'conseil', 'Test de calibration', 'Ta FC max est estimée. Un test de 3 km cette semaine, et tes zones et allures deviennent justes.'));

  // ── Course et sortie longue ───────────────────────────────────────────────
  if (raceInWeek && raceWd) {
    setDay(raceWd, raceDay(raceInWeek.distanceKm, b), true);
    // Pas d'effort la veille, Z1 court l'avant-veille.
    for (const d of [raceWd - 1, raceWd + 1]) if (d >= 1 && d <= 7 && runDays.includes(d as Weekday) && !byDay.has(d as Weekday)) setDay(d as Weekday, rest(), false);
  } else if (long) {
    setDay(longDay, long, longIsKey);
  }

  // Back-to-back : trail long, pic, une semaine sur deux, lendemain disponible.
  const nextDay = (longDay === 7 ? 1 : longDay + 1) as Weekday;
  const b2b = trail && (ctx.goal === 'trail_moyen' || ctx.goal === 'ultra') && week.phase === 'spec2' && week.kind === 'build' && ctx.phaseWeek % 2 === 1
    && longDay !== 7 && av.allowedDays.includes(nextDay) && !raceInWeek;
  if (b2b) {
    // On répartit la longue sur deux jours (~75 % + ~50 %) plutôt que d'ajouter une 2e longue complète.
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
  const minEasy = MIN_EASY_RUN_KM;
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
    // Jamais plus long que la sortie longue de la semaine (sinon la « longue » n'en est plus une).
    const fit = (x: BuiltSession) => (x.durationMin <= capMin ? x : strides(km, b, capMin));
    if (week.kind === 'recup') s = easyRun(km, b, ctx.phaseWeek === 0 ? 'z1' : 'z2', capMin);
    else if (dayAfterLong) s = easyRun(km, b, 'z1', capMin);
    else if (!neuroOk) s = easyRun(km, b, 'z2', capMin);
    else if (!sprintsPlaced && week.phase === 'base' && week.kind === 'build' && ctx.planWeek >= 1 && !dayBeforeKey) {
      s = fit(hillSprints(km, b));
      sprintsPlaced = true;
    } else if (!descentsPlaced && trail && ['spec1', 'spec2', 'precomp'].includes(week.phase) && week.kind === 'build' && !dayBeforeKey) {
      s = fit(descents(km, b));
      descentsPlaced = true;
    } else if (!stridesPlaced) {
      s = strides(km, b, capMin);
      stridesPlaced = true;
    } else s = easyRun(km, b, 'z2', capMin);
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

// ─── Parcours de démarrage : re-projection depuis le réalisé ─────────────────

export interface JourneySlot {
  id: string;
  date: ISODate;
  /** Lundi de la semaine de la séance. */
  weekStart: ISODate;
  /** Semaine avec une course : pas de marche en plus le jour de la longue. */
  raceWeek?: boolean;
}

/**
 * Re-projette les séances marche/course À VENIR depuis l'état réel de l'échelle (après chaque séance notée).
 * Même règle que la génération : chaque séance au palier projeté si toutes sont validées, +10 min de marche
 * le jour de la longue (le jour prévu s'il a une séance, sinon la dernière de la semaine).
 */
export function rescheduleJourney(
  state: RunWalkState,
  slots: JourneySlot[],
  ctx: Pick<WeekContext, 'goal' | 'family' | 'vdot' | 'availability'>,
  slow = false,
): { id: string; stage: number; session: SessionDraft }[] {
  const sorted = [...slots].sort((a, b) => a.date.localeCompare(b.date));
  const stages = projectStages(state, sorted.length, slow);
  const b: BuildContext = { goal: ctx.goal, trail: ctx.family === 'trail', vdot: ctx.vdot, phaseWeek: 0 };
  return sorted.map((slot, i) => {
    const p = stages[i]!;
    const week = sorted.filter((x) => x.weekStart === slot.weekStart);
    const longSlot = week.find((x) => weekday(x.date) === ctx.availability.longRunDay) ?? week.at(-1)!;
    const extra = slot === longSlot && !slot.raceWeek ? RUN_WALK_LONG_DAY_EXTRA_WALK_MIN : 0;
    return { id: slot.id, stage: p.stage, session: toDraft(slot.date, runWalk(p.stage, b, { walkMin: walkFirstMinutes(p.validatedAtStage), extraWalkMin: extra }), false) };
  });
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

