import {
  B_RACE_RECOVERY_RATIO, B_RACE_WEEK_RATIO, BUILD_WEEKS_BEFORE_DELOAD, DELOAD_RATIO, DEMARRAGE_START_KM,
  ELEVATION_PHASE_FACTOR, LONG_GOAL_MIN_LONG_RUN_MIN, RUN_WALK_LONG_DAY_EXTRA_WALK_MIN, ASSUMED_RUNS_PER_WEEK, LONG_RUN_GROWTH, LONG_RUN_GROWTH_MIN_KM, LONG_RUN_GROWTH_MIN_KM_SHORT, LONG_RUN_SHARE_BY_PHASE, LONG_RUN_SHORT_THRESHOLD_KM,
  LONG_RUN_SHARE_LONG_GOALS, LONG_RUN_SHARE_MAX,
  MAX_KEY_SESSIONS, MAX_KEY_SESSIONS_PEAK, MAX_PLAN_WEEKS, MAX_WEEKLY_INCREASE, MIN_WEEKS_BEFORE_FIRST_DELOAD,
  PHASE_RATIOS, RECOVERY_VOLUME_RATIOS, RECOVERY_WEEKS_BY_DISTANCE, TAPER_PROFILES,
} from './constants';
import { addDays, diffDays, mondayOf } from './dates';
import { explain } from './explain';
import { startMode, type StartMode } from './startmode';
import { runWalk as runWalkSession } from './builders';
import { JOURNEY_DONE, initialRunWalkState, projectStages, sessionsToReach, stageRunMinutes, walkFirstMinutes, type RunWalkState } from './runwalk';
import { journeyDays } from './scheduling';
import { DIFFICULTY_FACTOR, GOALS, experienceIndex, type GoalFamily } from './goals';
import { easyMinutes } from './paces';
import { progressionReference } from './progression';
import type { Availability, Difficulty, Experience, Explanation, GoalKind, ISODate, Phase, WeekKind } from './types';

/**
 * Génération d'un plan (périodisation).
 *
 * Entrées : objectif, date de course (ou durée), point de départ réel, disponibilités, difficulté.
 * Sortie : une suite de semaines (phase, type, volume, D+, nb de séances clés, sortie longue), plus les
 * avertissements quand le moteur ne peut pas tout respecter. Il ne triche jamais avec la règle des 10 % :
 * il plafonne et le dit.
 */

export interface PlanRequest {
  goal: GoalKind;
  startDate: ISODate;
  race?: { date: ISODate; distanceKm: number; elevationGainM: number };
  /** Objectifs sans course (« courir de zéro », « garder la forme ») : durée en semaines. */
  durationWeeks?: number;
  experience: Experience;
  difficulty: Difficulty;
  currentWeeklyKm: number;
  /** Volumes des dernières semaines (plus ancienne → plus récente), pour la référence de progression. */
  recentWeeksKm?: number[];
  longestRecentRunKm?: number;
  /** Minutes de course sans s'arrêter (décide de la marche-course). */
  continuousMin?: number;
  /** État courant du parcours de démarrage (re-planification) ; sinon dérivé de startMode. */
  runWalk?: RunWalkState;
  availability: Availability;
  vdot?: number;
  bRaces?: { date: ISODate; distanceKm: number; name?: string }[];
}

export interface WeekPlan {
  index: number;
  startDate: ISODate;
  phase: Phase;
  kind: WeekKind;
  targetKm: number;
  targetElevationM: number;
  keySessions: number;
  longRunKm: number;
  notes: Explanation[];
  raceDate?: ISODate;
  bRaceDate?: ISODate;
  /** Semaine du parcours de démarrage : palier prévu de chaque séance (si toutes sont validées). */
  runWalk?: { sessions: { stage: number; validatedAtStage: number }[] };
  /** Volume du démarrage, exprimé en minutes (les km sont estimés, pour l'affichage). */
  targetMinutes?: number;
}

export interface PlanDraft {
  goal: GoalKind;
  family: GoalFamily;
  weeks: WeekPlan[];
  targetPeakKm: number;
  peakKm: number;
  warnings: Explanation[];
  ok: boolean;
  /** Marche-course ou course continue au départ, et niveau de départ. */
  start?: StartMode;
}

const roundKm = (km: number) => (km >= 10 ? Math.round(km) : Math.round(km * 2) / 2);
const floorKm = (km: number) => (km >= 10 ? Math.floor(km) : Math.floor(km * 2) / 2);
const round10 = (m: number) => Math.round(m / 10) * 10;

/** Répartit n semaines (hors taper) entre base / spec1 / spec2 / précomp. Les blocs courts compressent la base d'abord. */
export function allocatePhases(n: number): Phase[] {
  if (n <= 0) return [];
  const tail: Phase[][] = [[], ['precomp'], ['spec2', 'precomp'], ['spec1', 'spec2', 'precomp']];
  if (n < 4) return tail[n]!;
  const pre = Math.max(1, Math.round(n * PHASE_RATIOS.precomp));
  const s2 = Math.max(1, Math.round(n * PHASE_RATIOS.spec2));
  const s1 = Math.max(1, Math.round(n * PHASE_RATIOS.spec1));
  const base = n - pre - s2 - s1;
  return [
    ...Array<Phase>(base).fill('base'),
    ...Array<Phase>(s1).fill('spec1'),
    ...Array<Phase>(s2).fill('spec2'),
    ...Array<Phase>(pre).fill('precomp'),
  ];
}

/** Nombre de séances clés selon la phase (pyramidal en base, polarisé à l'approche). */
export function keySessionsFor(phase: Phase, kind: WeekKind, weekIndex: number, experience: Experience, difficulty: Difficulty): number {
  if (kind === 'recup' || phase === 'demarrage') return 0;
  if (kind === 'course') return 1;
  if (kind === 'decharge' || kind === 'taper' || kind === 'maintien') return 1;
  const novice = experienceIndex(experience) === 0;
  switch (phase) {
    case 'base':
      return weekIndex < 2 ? 0 : 1;
    case 'spec1':
      return novice ? 1 : MAX_KEY_SESSIONS;
    case 'spec2':
      return difficulty === 'ambitieux' && experience === 'avance' ? MAX_KEY_SESSIONS_PEAK : MAX_KEY_SESSIONS;
    default:
      return MAX_KEY_SESSIONS;
  }
}

/** Plafond de volume imposé par le temps disponible. */
export function timeCapKm(availability: Availability, vdot: number | undefined, trail: boolean): number {
  const minutes = (availability.runDaysPerWeek - 1) * availability.maxWeekdayMinutes + availability.maxWeekendMinutes;
  return floorKm(minutes / easyMinutes(1, vdot, { trail }));
}

export function generatePlan(req: PlanRequest): PlanDraft {
  const profile = GOALS[req.goal];
  const family = profile.family;
  const trail = family === 'trail';
  const warnings: Explanation[] = [];
  const fail = (e: Explanation): PlanDraft => ({ goal: req.goal, family, weeks: [], targetPeakKm: 0, peakKm: 0, warnings: [e], ok: false });

  // ── Calendrier ────────────────────────────────────────────────────────────
  let startMonday = mondayOf(req.startDate);
  let totalWeeks: number;
  const raceMonday = req.race ? mondayOf(req.race.date) : undefined;
  if (req.race) {
    if (req.race.date < req.startDate) {
      return fail(explain('race.past', 'info', 'Course déjà passée', 'Cette course est derrière toi. Bravo! On enchaîne avec une récupération, puis un nouvel objectif.'));
    }
    totalWeeks = diffDays(startMonday, raceMonday!) / 7 + 1;
    if (totalWeeks > MAX_PLAN_WEEKS) {
      startMonday = addDays(raceMonday!, -(MAX_PLAN_WEEKS - 1) * 7);
      totalWeeks = MAX_PLAN_WEEKS;
      warnings.push(explain('plan.long', 'info', 'Plan qui commence plus tard', `Ta course est loin : le plan démarre le ${startMonday}. D'ici là, garde la forme avec un objectif « Garder la forme ».`, { start: startMonday }));
    }
    if (totalWeeks < profile.minWeeks) {
      warnings.push(explain('plan.short', 'attention', 'Délai court', `${totalWeeks} semaine(s) pour un ${profile.label}, c'est serré (minimum conseillé : ${profile.minWeeks}). On fait au mieux sans sauter la règle des 10 % : l'objectif devient de finir en santé.`, { weeks: totalWeeks, min: profile.minWeeks }));
    }
  } else {
    totalWeeks = Math.min(MAX_PLAN_WEEKS, Math.max(1, req.durationWeeks ?? profile.idealWeeks));
  }

  // ── Volumes cible ─────────────────────────────────────────────────────────
  const exp = experienceIndex(req.experience);
  // « Courir de zéro » est toujours évalué comme un premier départ.
  const start = startMode({ experience: family === 'debuter' ? 'jamais' : req.experience, weeklyKm: req.currentWeeklyKm, longestRunKm: req.longestRecentRunKm, continuousMin: req.continuousMin, vdot: req.vdot });
  const needsDemarrage = family !== 'forme' && (family === 'debuter' || start.runWalk);
  if (family !== 'forme') warnings.unshift(start.explanation);
  const startKm = needsDemarrage || family === 'forme' ? Math.max(req.currentWeeklyKm, DEMARRAGE_START_KM) : req.currentWeeklyKm;
  let targetPeak = Math.round(profile.peakKm[exp] * DIFFICULTY_FACTOR[req.difficulty]);
  const cap = timeCapKm(req.availability, req.vdot, trail);
  if (cap < targetPeak) {
    warnings.push(explain('peak.timecap', 'conseil', 'Le temps disponible limite le volume', `Avec ${req.availability.runDaysPerWeek} sorties et tes plages horaires, le volume plafonne autour de ${cap} km/sem (visé : ${targetPeak}). C'est correct : on mise sur la qualité.`, { cap, target: targetPeak }));
    targetPeak = cap;
  }
  // « Garder la forme » = maintenir le volume actuel, pas le pousser.
  if (family === 'forme') targetPeak = startKm;

  // ── Phases ────────────────────────────────────────────────────────────────
  const taperWeeks = req.race ? Math.min(profile.taperWeeks, totalWeeks) : 0;
  const buildWeeks = totalWeeks - taperWeeks;
  // Parcours de démarrage : il dure jusqu'à 30 min continues (projection si chaque séance est validée), JAMAIS tronqué.
  const journeyState = needsDemarrage ? (req.runWalk ?? initialRunWalkState(start.stage)) : undefined;
  const spw = Math.max(1, journeyDays(req.availability).length);
  const journeyWeeksNeeded = journeyState ? Math.ceil(sessionsToReach(journeyState, JOURNEY_DONE) / spw) : 0;
  const dem = Math.min(journeyWeeksNeeded, buildWeeks);
  let phases: Phase[];
  if (family === 'forme') phases = Array<Phase>(buildWeeks).fill('maintien');
  else if (family === 'debuter') phases = [...Array<Phase>(dem).fill('demarrage'), ...Array<Phase>(buildWeeks - dem).fill('base')];
  else phases = [...Array<Phase>(dem).fill('demarrage'), ...allocatePhases(buildWeeks - dem)];

  // ── Parcours de démarrage : paliers projetés, séance par séance ───────────
  const projected = journeyState ? projectStages(journeyState, dem * spw) : [];
  const buildCtx = { goal: req.goal, trail, vdot: req.vdot, phaseWeek: 0 };

  // ── Construction semaine par semaine ──────────────────────────────────────
  const history = [...(req.recentWeeksKm ?? []), ...(req.currentWeeklyKm > 0 ? [req.currentWeeklyKm] : [])];
  const weeks: WeekPlan[] = [];
  let level = startKm;
  let buildCount = 0;
  // Plus longue sortie récente : déclarée, sinon estimée depuis le volume (jamais « inconnue » : c'est le garde-fou).
  let longest = req.longestRecentRunKm ?? (req.currentWeeklyKm > 0 ? req.currentWeeklyKm / ASSUMED_RUNS_PER_WEEK : 0);
  const gainPerKm = trail ? (req.race ? req.race.elevationGainM / Math.max(1, req.race.distanceKm) : profile.defaultElevationM / profile.defaultDistanceKm) : 0;

  for (let i = 0; i < buildWeeks; i++) {
    const phase = phases[i]!;
    const notes: Explanation[] = [];
    if (phase === 'demarrage' && journeyState) {
      // Semaine de démarrage : pilotée en minutes et en séances validées, pas en km ni en décharges.
      const chunk = projected.slice(i * spw, (i + 1) * spw);
      const built = chunk.map((p, k) => runWalkSession(p.stage, buildCtx, { walkMin: walkFirstMinutes(p.validatedAtStage), extraWalkMin: k === chunk.length - 1 ? RUN_WALK_LONG_DAY_EXTRA_WALK_MIN : 0 }));
      const km = Math.round(built.reduce((a, x) => a + x.distanceKm, 0) * 10) / 10;
      weeks.push({
        index: i,
        startDate: addDays(startMonday, i * 7),
        phase,
        kind: 'build',
        targetKm: km,
        targetMinutes: built.reduce((a, x) => a + x.durationMin, 0),
        targetElevationM: 0,
        keySessions: 0,
        longRunKm: built.at(-1)!.distanceKm,
        notes,
        runWalk: { sessions: chunk },
      });
      history.push(km);
      level = km;
      // Plus longue sortie de COURSE atteinte (pour faire grandir la longue après le démarrage).
      longest = Math.max(longest, stageRunMinutes(Math.min(chunk.at(-1)!.stage, JOURNEY_DONE)) / easyMinutes(1, req.vdot));
      continue;
    }
    const isLastBeforeTaper = req.race !== undefined && i === buildWeeks - 1;
    let kind: WeekKind;
    let km: number;
    if (buildCount >= BUILD_WEEKS_BEFORE_DELOAD && i >= MIN_WEEKS_BEFORE_FIRST_DELOAD && !isLastBeforeTaper) {
      kind = 'decharge';
      km = roundKm(level * DELOAD_RATIO);
      buildCount = 0;
      notes.push(explain('week.deload', 'info', 'Semaine de décharge', `Volume à ~${Math.round(DELOAD_RATIO * 100)} % : le corps assimile les 3 dernières semaines. C'est ici que la forme apparaît.`));
    } else {
      kind = family === 'forme' ? 'maintien' : 'build';
      const ref = progressionReference(history.map((k) => ({ km: k })));
      const allowed = ref > 0 ? ref * (1 + MAX_WEEKLY_INCREASE) : level;
      const newIntensity = i > 0 && phase !== phases[i - 1] && (phase === 'spec1' || phase === 'spec2');
      if (newIntensity) {
        km = level;
        notes.push(explain('week.hold', 'info', 'Nouvelle phase, volume tenu', 'On ajoute de l’intensité cette semaine : le volume reste stable. Un seul nouveau stress à la fois.'));
      } else if (phase === 'precomp' || family === 'forme') {
        km = level; // pré-compétition polarisée et maintien : on tient le volume
      } else {
        km = Math.max(level, Math.min(targetPeak, floorKm(allowed)));
      }
      level = km;
      buildCount++;
    }

    const longRunKm = longRunFor(km, phase, longest, profile.longRunMaxMin, req, trail, gainPerKm);
    // Aucune sortie ne dépasse la sortie longue de la semaine : le volume est plafonné par ce que les sorties
    // PEUVENT contenir. Sans ça, 15 km/sem sur 3 jours donnent 5 km par sortie à quelqu'un dont la plus longue est 3 km.
    const sessionRoom = longest > 0 && phase !== 'demarrage' ? floorKm(req.availability.runDaysPerWeek * longRunKm) : Infinity;
    if (km > sessionRoom && sessionRoom > 0) {
      notes.push(explain('week.sessioncap', 'conseil', 'Volume limité par tes sorties', `Ta plus longue sortie récente est ${Math.round(longest * 10) / 10} km : on l'allonge de ~10 % à la fois. Avec ${req.availability.runDaysPerWeek} sorties, ça fait ${sessionRoom} km cette semaine plutôt que ${km}. Plus de sorties par semaine, plutôt que plus longues, est la façon sûre de monter.`, { sortie: longRunKm, volume: sessionRoom, voulu: km }));
      km = sessionRoom;
      if (kind !== 'decharge') level = km;
    }
    history.push(km);
    if (kind !== 'decharge') longest = Math.max(longest, longRunKm);
    weeks.push({
      index: i,
      startDate: addDays(startMonday, i * 7),
      phase,
      kind,
      targetKm: km,
      targetElevationM: round10(km * gainPerKm * ELEVATION_PHASE_FACTOR[phase]),
      // « Courir de zéro » : aucune séance clé, la régularité est l'objectif.
      keySessions: family === 'debuter' ? 0 : keySessionsFor(phase, kind, i, req.experience, req.difficulty),
      longRunKm,
      notes,
    });
  }

  const peakKm = Math.max(0, ...weeks.map((w) => w.targetKm));

  // ── Taper ─────────────────────────────────────────────────────────────────
  if (req.race && taperWeeks > 0) {
    const profileRatios = TAPER_PROFILES[taperWeeks as 1 | 2 | 3];
    const ref = peakKm || startKm;
    profileRatios.forEach((ratio, t) => {
      const i = buildWeeks + t;
      const isRaceWeek = t === profileRatios.length - 1;
      const km = roundKm(ref * ratio);
      weeks.push({
        index: i,
        startDate: addDays(startMonday, i * 7),
        phase: 'taper',
        kind: isRaceWeek ? 'course' : 'taper',
        targetKm: km,
        targetElevationM: round10(km * gainPerKm * ELEVATION_PHASE_FACTOR.taper),
        keySessions: keySessionsFor('taper', isRaceWeek ? 'course' : 'taper', i, req.experience, req.difficulty),
        longRunKm: isRaceWeek ? 0 : roundKm(Math.min(longest * 0.6, km * LONG_RUN_SHARE_BY_PHASE.taper * 1.6)),
        notes: [explain('week.taper', 'info', isRaceWeek ? 'Semaine de course' : 'Affûtage', `Volume à ${Math.round(ratio * 100)} % du pic, intensité maintenue (strides, efforts courts). La fatigue s'en va, la forme reste.`, { ratio })],
        ...(isRaceWeek ? { raceDate: req.race!.date } : {}),
      });
    });
  }
  if (req.race && taperWeeks === 0) weeks[weeks.length - 1]!.raceDate = req.race.date;

  // ── Courses B : mini-taper et reprise ─────────────────────────────────────
  for (const b of req.bRaces ?? []) {
    const idx = diffDays(startMonday, mondayOf(b.date)) / 7;
    const w = weeks[idx];
    if (!w || w.kind === 'taper' || w.kind === 'course') continue;
    w.targetKm = roundKm(w.targetKm * B_RACE_WEEK_RATIO);
    w.bRaceDate = b.date;
    w.notes.push(explain('week.brace', 'info', `Course B${b.name ? ` : ${b.name}` : ''}`, 'Effort test : mini-taper de 3-4 jours avant, puis reprise en Z1/Z2 3 à 5 jours. On ne casse pas le bloc pour une course B.'));
    const next = weeks[idx + 1];
    if (next && next.kind === 'build') {
      next.targetKm = roundKm(next.targetKm * B_RACE_RECOVERY_RATIO);
      next.keySessions = Math.min(next.keySessions, 1);
      next.notes.push(explain('week.brace.recovery', 'info', 'Reprise après la course B', 'Début de semaine en Z1/Z2, une seule séance clé.'));
    }
  }

  // ── Bilan ─────────────────────────────────────────────────────────────────
  if (family !== 'forme' && peakKm < targetPeak * 0.95) {
    warnings.push(explain('peak.unreachable', 'conseil', 'Pic plafonné', `Pic visé ${targetPeak} km/sem, atteignable ${peakKm} km d'ici la course en respectant +10 %/sem et les décharges. Pas grave : on arrive en santé, c'est ce qui compte.`, { target: targetPeak, reached: peakKm }));
  }
  return { goal: req.goal, family, weeks, targetPeakKm: targetPeak, peakKm, warnings, ok: true, start };
}

function longRunFor(km: number, phase: Phase, longest: number, maxMin: number, req: PlanRequest, trail: boolean, gainPerKm: number): number {
  const longGoal = maxMin >= LONG_GOAL_MIN_LONG_RUN_MIN && (phase === 'spec1' || phase === 'spec2' || phase === 'precomp');
  const share = Math.min(LONG_RUN_SHARE_MAX, longGoal ? LONG_RUN_SHARE_LONG_GOALS[phase] : LONG_RUN_SHARE_BY_PHASE[phase]);
  let long = km * share;
  // Limite de temps : objectif ET disponibilité de fin de semaine.
  const maxMinutes = Math.min(maxMin, req.availability.maxWeekendMinutes);
  const minutesPerKm = easyMinutes(1, req.vdot, { trail, gainM: gainPerKm * 100 * ELEVATION_PHASE_FACTOR[phase] / 100 });
  long = Math.min(long, maxMinutes / minutesPerKm);
  // Croissance graduelle de la plus longue sortie.
  if (longest > 0) {
    const minStep = longest < LONG_RUN_SHORT_THRESHOLD_KM ? LONG_RUN_GROWTH_MIN_KM_SHORT : LONG_RUN_GROWTH_MIN_KM;
    long = Math.min(long, longest + Math.max(minStep, longest * LONG_RUN_GROWTH));
  }
  return roundKm(long);
}

/** Semaines de récupération après une course A, à partir du lundi suivant la course. */
export function generateRecovery(race: { date: ISODate; distanceKm: number }, peakKm: number): WeekPlan[] {
  const weeksCount = RECOVERY_WEEKS_BY_DISTANCE.find((r) => race.distanceKm <= r.maxKm)!.weeks;
  const start = addDays(mondayOf(race.date), 7);
  return Array.from({ length: weeksCount }, (_, i) => {
    const km = roundKm(peakKm * RECOVERY_VOLUME_RATIOS[i]!);
    return {
      index: i,
      startDate: addDays(start, i * 7),
      phase: 'recup' as const,
      kind: 'recup' as const,
      targetKm: km,
      targetElevationM: 0,
      keySessions: 0,
      longRunKm: roundKm(km * LONG_RUN_SHARE_BY_PHASE.recup),
      notes: [explain('week.recovery', 'info', 'Récupération post-course', i === 0 ? 'Reprise inversée : courtes sorties Z1, beaucoup de repos. Les fibres musculaires et les tendons réparent, même si tu te sens bien.' : 'On remonte doucement. Pas de qualité avant la fin de la récup.')],
    };
  });
}

/** Convertit une semaine en semaine « maintien » (fatigue de vie cumulée) : 60-70 % du volume, 0 qualité. */
export function toMaintenanceWeek(week: WeekPlan, ratio: number): WeekPlan {
  return {
    ...week,
    kind: 'maintien',
    targetKm: roundKm(week.targetKm * ratio),
    targetElevationM: round10(week.targetElevationM * ratio),
    keySessions: 0,
    longRunKm: roundKm(week.longRunKm * ratio),
    notes: [...week.notes, explain('week.maintenance', 'conseil', 'Semaine maintien', 'La vie a pris le dessus (nuits courtes, fatigue) : on garde le moteur au chaud sans creuser le trou. Zéro culpabilité, c’est la décision intelligente.')],
  };
}
