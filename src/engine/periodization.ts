import {
  B_RACE_RECOVERY_RATIO, B_RACE_WEEK_RATIO, BUILD_WEEKS_BEFORE_DELOAD, DELOAD_RATIO, DEMARRAGE_START_KM,
  BASE_WEEKS_AFTER_RUNWALK, HEALTH_PRUDENT_EASY_WEEKS, ELEVATION_PHASE_FACTOR, LONG_GOAL_MIN_LONG_RUN_MIN, RUN_WALK_LONG_DAY_EXTRA_WALK_MIN, ASSUMED_RUNS_PER_WEEK, LONG_RUN_GROWTH, LONG_RUN_SHARE_BY_PHASE,
  LONG_RUN_SHARE_LONG_GOALS, LONG_RUN_SHARE_MAX,
  MAX_KEY_SESSIONS, MAX_KEY_SESSIONS_PEAK, MAX_PLAN_WEEKS, MAX_WEEKLY_INCREASE, MIN_WEEKS_BEFORE_FIRST_DELOAD,
  PHASE_RATIOS, RECOVERY_VOLUME_RATIOS, RECOVERY_WEEKS_BY_DISTANCE, TAPER_PROFILES,
} from './constants';
import { addDays, diffDays, mondayOf } from './dates';
import { explain } from './explain';
import { firstStage, startMode, type StartMode } from './startmode';
import type { Screening } from './screening';
import { runWalk as runWalkSession } from './builders';
import { JOURNEY_DONE, initialRunWalkState, projectStages, sessionsToReach, stageLabel, stageRunMinutes, walkFirstMinutes, type RunWalkState } from './runwalk';
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
  /**
   * Objectifs sans course : durée en semaines. « Courir de zéro » sans durée : calculée depuis le palier d'entrée
   * (le temps qu'il faut pour courir 30 min d'affilée si chaque séance est validée).
   */
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
  /** Résultat du questionnaire santé (`screen`) : bloque le plan ou le rend prudent. */
  screening?: Screening;
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
  /** Plus longue sortie déjà faite avant cette semaine (km) : en décharge et à l'affûtage, la longue peut remonter jusque-là. */
  longestRunKm?: number;
  /** Plan prudent (dépistage santé) : rien au-dessus de Z2 cette semaine (ni clé, ni strides, ni test). */
  easyOnly?: boolean;
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
  /** Choix à proposer quand la course tombe avant la fin du démarrage + 4 semaines de base. */
  options?: ('course_en_marche_course' | 'decaler')[];
  /** État d'entrée du parcours de démarrage : point de départ du journal (recalcul après chaque séance). */
  runWalkStart?: RunWalkState;
}

const roundKm = (km: number) => (km >= 10 ? Math.round(km) : Math.round(km * 2) / 2);
const floorKm = (km: number) => (km >= 10 ? Math.floor(km) : Math.floor(km * 2) / 2);
/** Arrondi au 0,1 km inférieur (le petit epsilon absorbe les erreurs de virgule flottante : 3 × 1,1 = 3,3000…01). */
const floorTenth = (km: number) => Math.floor(km * 10 + 1e-9) / 10;
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

  // ── Santé : le dépistage passe avant tout ─────────────────────────────────
  if (req.screening?.level === 'bloque') return { goal: req.goal, family, weeks: [], targetPeakKm: 0, peakKm: 0, warnings: req.screening.explanations, ok: false };
  const prudent = req.screening?.level === 'prudent';
  const difficulty = prudent ? 'prudent' : req.difficulty;
  if (prudent) {
    warnings.push(...req.screening!.explanations);
    warnings.push(explain('plan.prudent', 'conseil', 'Plan prudent', `Selon ton questionnaire santé : difficulté « prudent », rien au-dessus de Z2 les ${HEALTH_PRUDENT_EASY_WEEKS} premières semaines (ni séance clé, ni strides), pas de test à fond${req.experience === 'jamais' || req.experience === 'debutant' ? ', et on commence en marche/course' : ''}.`, { semaines: HEALTH_PRUDENT_EASY_WEEKS }));
  }

  // ── Point de départ ───────────────────────────────────────────────────────
  // « Courir de zéro » est toujours évalué comme un premier départ.
  let start = startMode({ experience: family === 'debuter' ? 'jamais' : req.experience, weeklyKm: req.currentWeeklyKm, longestRunKm: req.longestRecentRunKm, continuousMin: req.continuousMin, vdot: req.vdot });
  // Plan prudent : marche/course d'office pour qui n'a jamais couru ou débute (au plus haut palier que permet sa capacité).
  if (prudent && !start.runWalk && (req.experience === 'jamais' || req.experience === 'debutant')) start = { ...start, runWalk: true, stage: firstStage(start.capacityMin) };
  const needsDemarrage = family !== 'forme' && (family === 'debuter' || start.runWalk);
  // Parcours de démarrage : il dure jusqu'à 30 min continues (projection si chaque séance est validée), JAMAIS tronqué.
  const journeyState = needsDemarrage ? (req.runWalk ?? initialRunWalkState(start.stage)) : undefined;
  const spw = Math.max(1, journeyDays(req.availability).length);
  const journeyWeeksNeeded = journeyState ? Math.ceil(sessionsToReach(journeyState, JOURNEY_DONE) / spw) : 0;

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
  } else if (family === 'debuter' && req.durationWeeks === undefined && journeyWeeksNeeded > 0) {
    // « Courir de zéro » : durée calculée depuis le palier d'entrée, pas fixée.
    totalWeeks = Math.min(MAX_PLAN_WEEKS, journeyWeeksNeeded);
  } else {
    totalWeeks = Math.min(MAX_PLAN_WEEKS, Math.max(1, req.durationWeeks ?? profile.idealWeeks));
  }

  // ── Volumes cible ─────────────────────────────────────────────────────────
  const exp = experienceIndex(req.experience);
  if (family !== 'forme') warnings.unshift(start.explanation);
  const startKm = needsDemarrage || family === 'forme' ? Math.max(req.currentWeeklyKm, DEMARRAGE_START_KM) : req.currentWeeklyKm;
  let targetPeak = Math.round(profile.peakKm[exp] * DIFFICULTY_FACTOR[difficulty]);
  const cap = timeCapKm(req.availability, req.vdot, trail);
  if (cap < targetPeak) {
    warnings.push(explain('peak.timecap', 'conseil', 'Le temps disponible limite le volume', `Avec ${req.availability.runDaysPerWeek} sorties et tes plages horaires, le volume plafonne autour de ${cap} km/sem (visé : ${targetPeak}). C'est correct : on mise sur la qualité.`, { cap, target: targetPeak }));
    targetPeak = cap;
  }
  // « Garder la forme » = maintenir le volume actuel, pas le pousser.
  if (family === 'forme') targetPeak = startKm;

  // ── Phases ────────────────────────────────────────────────────────────────
  let options: PlanDraft['options'];
  let taperWeeks = req.race ? Math.min(profile.taperWeeks, totalWeeks) : 0;
  if (req.race && journeyWeeksNeeded > 0 && journeyWeeksNeeded + BASE_WEEKS_AFTER_RUNWALK > totalWeeks - taperWeeks) {
    options = ['course_en_marche_course', 'decaler'];
    const minWeeks = journeyWeeksNeeded + BASE_WEEKS_AFTER_RUNWALK + taperWeeks;
    warnings.push(explain('plan.runwalk.short', 'attention', 'La course arrive avant la fin de ton démarrage', `Il faut environ ${journeyWeeksNeeded} semaines pour courir 30 min d'affilée, puis ${BASE_WEEKS_AFTER_RUNWALK} semaines de base, soit ${minWeeks} semaines ; ta course est dans ${totalWeeks}. Deux bonnes options : la courir en marche/course (une vraie stratégie, pas un échec), ou décaler l'objectif.`, { semaines: totalWeeks, minimum: minWeeks }));
    // Si le démarrage ne finit pas avant l'affûtage, pas d'affûtage : la course se fait en marche/course.
    if (journeyWeeksNeeded >= totalWeeks - taperWeeks) taperWeeks = 0;
  }
  const buildWeeks = totalWeeks - taperWeeks;
  const dem = Math.min(journeyWeeksNeeded, buildWeeks);
  // Après le démarrage : au moins 4 semaines de base sans séance clé, puis les phases de l'objectif.
  const baseAfter = journeyState && family !== 'debuter' ? Math.min(BASE_WEEKS_AFTER_RUNWALK, buildWeeks - dem) : 0;
  let phases: Phase[];
  if (family === 'forme') phases = Array<Phase>(buildWeeks).fill('maintien');
  else if (family === 'debuter') phases = [...Array<Phase>(dem).fill('demarrage'), ...Array<Phase>(buildWeeks - dem).fill('base')];
  else phases = [...Array<Phase>(dem).fill('demarrage'), ...Array<Phase>(baseAfter).fill('base'), ...allocatePhases(buildWeeks - dem - baseAfter)];

  // ── Parcours de démarrage : paliers projetés, séance par séance ───────────
  const projected = journeyState ? projectStages(journeyState, dem * spw) : [];
  // « Courir de zéro » plus court que le parcours : on n'accélère JAMAIS l'échelle, on dit où le plan finira (F5).
  const journeyDone = dem >= journeyWeeksNeeded;
  const endStage = projected.at(-1)?.stage ?? JOURNEY_DONE;
  if (family === 'debuter' && !journeyDone) {
    warnings.push(explain('plan.debuter.short', 'attention', `Ton plan finira au ${stageLabel(endStage).toLowerCase()}`, `Il faut environ ${journeyWeeksNeeded} semaines pour courir 30 min d'affilée en validant chaque séance ; en ${totalWeeks}, tu finiras au ${stageLabel(endStage).toLowerCase()}. On n'accélère pas l'échelle pour autant : c'est elle qui protège tes tendons. Tu pourras enchaîner avec un nouveau plan, qui repartira de là.`, { semaines: totalWeeks, estimation: journeyWeeksNeeded, palier: endStage }));
  }
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
    // PEUVENT contenir (la longue + les autres sorties, chacune ≤ la longue et ≤ le temps dispo en semaine).
    // La longue, elle, continue de croître de 10 % même quand le volume est plafonné.
    const otherKm = Math.min(longRunKm, req.availability.maxWeekdayMinutes / easyMinutes(1, req.vdot, { trail }));
    const sessionRoom = longest > 0 ? floorTenth(longRunKm + (req.availability.runDaysPerWeek - 1) * otherKm) : Infinity;
    if (km > sessionRoom && sessionRoom > 0) {
      notes.push(explain('week.sessioncap', 'conseil', 'Volume limité par tes sorties', `Ta plus longue sortie récente est ${Math.round(longest * 10) / 10} km : on l'allonge de 10 % à la fois. Avec ${req.availability.runDaysPerWeek} sorties, aucune plus longue que la longue (${longRunKm} km), ça fait ${sessionRoom} km cette semaine plutôt que ${km}. Plus de sorties par semaine, plutôt que plus longues, est la façon sûre de monter.`, { sortie: longRunKm, volume: sessionRoom, voulu: km }));
      km = sessionRoom;
      level = Math.min(level, km);
    }
    history.push(km);
    const before = floorTenth(longest);
    if (kind !== 'decharge') longest = Math.max(longest, longRunKm);
    weeks.push({
      index: i,
      startDate: addDays(startMonday, i * 7),
      phase,
      kind,
      targetKm: km,
      targetElevationM: round10(km * gainPerKm * ELEVATION_PHASE_FACTOR[phase]),
      // « Courir de zéro » : aucune séance clé, la régularité est l'objectif. Après un démarrage : 4 semaines de base sans clé.
      keySessions: family === 'debuter' || (journeyState && i < dem + baseAfter) || (prudent && i < HEALTH_PRUDENT_EASY_WEEKS) ? 0 : keySessionsFor(phase, kind, i, req.experience, difficulty),
      ...(prudent && i < HEALTH_PRUDENT_EASY_WEEKS ? { easyOnly: true } : {}),
      longRunKm,
      ...(before > 0 ? { longestRunKm: before } : {}),
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
        keySessions: prudent && i < HEALTH_PRUDENT_EASY_WEEKS ? 0 : keySessionsFor('taper', isRaceWeek ? 'course' : 'taper', i, req.experience, difficulty),
        ...(prudent && i < HEALTH_PRUDENT_EASY_WEEKS ? { easyOnly: true } : {}),
        longRunKm: isRaceWeek ? 0 : roundKm(Math.min(longest * 0.6, km * LONG_RUN_SHARE_BY_PHASE.taper * 1.6)),
        ...(longest > 0 ? { longestRunKm: floorTenth(longest) } : {}),
        notes: [explain('week.taper', 'info', isRaceWeek ? 'Semaine de course' : 'Affûtage', `Volume à ${Math.round(ratio * 100)} % du pic, intensité maintenue (strides, efforts courts). La fatigue s'en va, la forme reste.`, { ratio })],
        ...(isRaceWeek ? { raceDate: req.race!.date } : {}),
      });
    });
  }
  if (req.race && taperWeeks === 0) {
    const last = weeks[weeks.length - 1]!;
    last.raceDate = req.race.date;
    if (last.runWalk) last.kind = 'course';
  }

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
  if (family === 'debuter') {
    const end = journeyDone
      ? explain('plan.debuter.end', 'info', 'À la fin : tu cours 30 min', "Si chaque séance est validée, à la fin de ce plan tu cours 30 min sans t'arrêter. Prochaine étape : un objectif 5 km, ou « Garder la forme » pour courir régulièrement sans course.", { palier: JOURNEY_DONE })
      : explain('plan.debuter.end', 'info', `À la fin : ${stageLabel(endStage).toLowerCase()}`, `À la fin de ce plan, tu seras au ${stageLabel(endStage).toLowerCase()}. Pour aller jusqu'à 30 min continues, enchaîne avec un nouveau plan « Courir de zéro » : il repartira de ton palier.`, { palier: endStage });
    warnings.push(end);
    weeks.at(-1)!.notes.push(end);
  }
  if (family !== 'forme' && peakKm < targetPeak * 0.95) {
    warnings.push(explain('peak.unreachable', 'conseil', 'Pic plafonné', `Pic visé ${targetPeak} km/sem, atteignable ${peakKm} km d'ici la course en respectant +10 %/sem et les décharges. Pas grave : on arrive en santé, c'est ce qui compte.`, { target: targetPeak, reached: peakKm }));
  }
  return { goal: req.goal, family, weeks, targetPeakKm: targetPeak, peakKm, warnings, ok: true, start, ...(options ? { options } : {}), ...(journeyState ? { runWalkStart: journeyState } : {}) };
}

/**
 * Sortie longue de la semaine, calculée AVANT le volume : la plus grande de « part de la phase × volume »,
 * « volume ÷ jours de course » (elle est la plus longue sortie) et « ce que les autres sorties ne peuvent pas
 * contenir » (temps dispo en semaine), plafonnée par le temps disponible et par +10 %
 * de la plus longue sortie récente. Arrondie au 0,1 km inférieur.
 */
function longRunFor(km: number, phase: Phase, longest: number, maxMin: number, req: PlanRequest, trail: boolean, gainPerKm: number): number {
  const longGoal = maxMin >= LONG_GOAL_MIN_LONG_RUN_MIN && (phase === 'spec1' || phase === 'spec2' || phase === 'precomp');
  const share = Math.min(LONG_RUN_SHARE_MAX, longGoal ? LONG_RUN_SHARE_LONG_GOALS[phase] : LONG_RUN_SHARE_BY_PHASE[phase]);
  // Les autres sorties tiennent au plus le temps dispo en semaine : ce qu'elles ne peuvent pas contenir va dans la longue.
  const days = req.availability.runDaysPerWeek;
  const weekdayKm = req.availability.maxWeekdayMinutes / easyMinutes(1, req.vdot, { trail });
  let long = Math.max(km * share, km / days, km - (days - 1) * weekdayKm);
  // Limite de temps : objectif ET disponibilité de fin de semaine.
  const maxMinutes = Math.min(maxMin, req.availability.maxWeekendMinutes);
  const minutesPerKm = easyMinutes(1, req.vdot, { trail, gainM: gainPerKm * 100 * ELEVATION_PHASE_FACTOR[phase] / 100 });
  // Arrondi au 0,1 km SUPÉRIEUR de la cible : sinon jours × longue resterait sous le volume voulu, et il se figerait.
  long = Math.min(Math.ceil(long * 10 - 1e-9) / 10, maxMinutes / minutesPerKm);
  // Croissance graduelle : +10 % de la plus longue sortie récente, sans pas minimum.
  if (longest > 0) long = Math.min(long, longest * (1 + LONG_RUN_GROWTH));
  return floorTenth(long);
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
