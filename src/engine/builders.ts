import { EVALUATION_MAX_RUN_MIN, EVALUATION_WALK_MIN, GUT_TRAINING_MIN_MINUTES, STRIDES_MIN_BASE_MIN, RUN_WALK_COOLDOWN_MIN, RUN_WALK_LADDER, RUN_WALK_WARMUP_MIN, TRAIL_PACE_FACTOR, WALK_FIRST_START_MIN, WALK_PACE_MIN_PER_KM } from './constants';
import { STAGE_WALK, TRANSITION_LAST, continuousMinutes, stageDurationMinutes, stageKind, stageRunMinutes, stageWalkMinutes } from './runwalk';
import { pacesFromVdot, easyPace, type PaceKey } from './paces';
import { SESSION_LIBRARY } from './library';
import type { GoalKind, Intensity, SessionType, Step } from './types';

/**
 * Construction concrète des séances (structure, durée, distance) avec progression d'une semaine à l'autre.
 */

export interface BuildContext {
  goal: GoalKind;
  trail: boolean;
  vdot?: number;
  /** Semaine courante dans la phase (0 = première) : fait progresser les intervalles. */
  phaseWeek: number;
  /** Phase de base : versions légères (pyramidal). */
  light?: boolean;
  /** Taper : versions courtes, intensité maintenue. */
  taper?: boolean;
  hasPoles?: boolean;
  /** Semaine du plan (pour la marche-course). */
  planWeek?: number;
  /** Niveau de départ dans l'échelle de marche-course (voir startmode.ts). */
  runWalkStage?: number;
}

export interface BuiltSession {
  type: SessionType;
  title: string;
  durationMin: number;
  distanceKm: number;
  steps: Step[];
  rpeTarget?: number;
  why: string;
}

const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5);
/** Une sortie de moins de 20 min ne vaut pas le déplacement : 20 min minimum. */
const MIN_RUN_MINUTES = 20;
const formatDuration = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`);
const pick = <T>(list: T[], i: number): T => list[Math.min(i, list.length - 1)]!;

/** Allure (min/km) estimée pour une cible, utilisée pour convertir durée ↔ distance. */
export function paceForTarget(target: Intensity, ctx: Pick<BuildContext, 'vdot' | 'trail'>): number {
  const E = easyPace(ctx.vdot);
  const p: Record<PaceKey, number> = ctx.vdot ? pacesFromVdot(ctx.vdot) : { E, M: E * 0.88, T: E * 0.82, I: E * 0.76, R: E * 0.72 };
  let pace: number;
  if ('pace' in target) pace = p[target.pace];
  else if ('zone' in target) pace = { z1: E * 1.08, z2: E, z3: (E + p.T) / 2, z4: p.T, z5: p.I }[target.zone];
  else pace = target.rpe >= 9 ? p.R : target.rpe >= 7 ? p.T : E;
  return ctx.trail ? pace * TRAIL_PACE_FACTOR : pace;
}

export function stepSeconds(s: Step): number {
  const one = (s.minutes ?? 0) * 60 + (s.seconds ?? 0);
  return one * (s.repeat ?? 1);
}

/** Durée (min) et distance (km) d'une structure. Les répétitions incluent une récup égale (trot) sauf indication. */
export function measure(steps: Step[], ctx: Pick<BuildContext, 'vdot' | 'trail'>): { minutes: number; km: number } {
  let minutes = 0;
  let km = 0;
  const easy = paceForTarget({ zone: 'z1' }, ctx);
  for (const s of steps) {
    if (s.distanceKm) {
      const pace = paceForTarget(s.target, ctx);
      minutes += s.distanceKm * pace;
      km += s.distanceKm;
      continue;
    }
    const sec = stepSeconds(s);
    minutes += sec / 60;
    km += sec / 60 / paceForTarget(s.target, ctx);
    const reps = s.repeat ?? 1;
    if (reps > 1 && s.kind === 'effort') {
      // récupération entre répétitions ≈ même durée en trottinant (ou marche)
      const recSec = (s.recoverySeconds ?? stepSeconds({ ...s, repeat: 1 })) * (reps - 1);
      minutes += recSec / 60;
      km += recSec / 60 / easy / (s.recoveryWalk ? 2 : 1);
    }
  }
  return { minutes: Math.round(minutes), km: Math.round(km * 10) / 10 };
}

function make(type: SessionType, title: string, steps: Step[], ctx: BuildContext, extra: Partial<BuiltSession> = {}): BuiltSession {
  const { minutes, km } = measure(steps, ctx);
  return { type, title, durationMin: minutes, distanceKm: km, steps, why: SESSION_LIBRARY[type].oneLiner, ...extra };
}

const wu = (minutes = 15): Step => ({ kind: 'echauffement', minutes, target: { zone: 'z2' } });
const cd = (minutes = 10): Step => ({ kind: 'retour_calme', minutes, target: { zone: 'z1' } });

/** Sortie facile. `maxMin` : jamais plus longue que la sortie longue de la semaine (passe avant le minimum de 20 min). */
export function easyRun(km: number, ctx: BuildContext, zone: 'z1' | 'z2' = 'z2', maxMin = Infinity): BuiltSession {
  const minutes = Math.min(Math.floor(maxMin), Math.max(MIN_RUN_MINUTES, round5(km * paceForTarget({ zone }, ctx))));
  const type = zone === 'z1' ? 'z1_recup' : 'z2_endurance';
  return make(type, `${zone === 'z1' ? 'Récup Z1' : 'Z2'} ${minutes} min`, [{ kind: 'continu', minutes, target: { zone } }], ctx);
}

/**
 * Z2 + strides. `maxMin` : la durée totale (strides et récup comprises) ne dépasse pas la sortie longue ; si
 * même 10 min de Z2 + strides n'y tiennent pas, on garde une sortie facile (corrige F7).
 */
export function strides(km: number, ctx: BuildContext, maxMin = Infinity): BuiltSession {
  const reps = pick([6, 6, 8], ctx.phaseWeek);
  const block: Step = { kind: 'effort', seconds: 20, repeat: reps, target: { rpe: 7 }, recoverySeconds: 60, recoveryWalk: true, note: 'Rapide et relâché, pas un sprint. Cadence vive.' };
  const blockMin = Math.ceil(measure([block], ctx).minutes);
  const base = Math.min(Math.max(15, round5(km * paceForTarget({ zone: 'z2' }, ctx)) - 5), Math.floor(maxMin) - blockMin);
  if (base < STRIDES_MIN_BASE_MIN) return easyRun(km, ctx, 'z2', maxMin);
  return make('strides', `Z2 ${base} min + ${reps} strides`, [{ kind: 'continu', minutes: base, target: { zone: 'z2' } }, block], ctx);
}

export function hillSprints(km: number, ctx: BuildContext): BuiltSession {
  const reps = pick([6, 8, 8, 10], ctx.phaseWeek);
  const easyMin = Math.max(10, round5(km * paceForTarget({ zone: 'z2' }, ctx)) - 25);
  return make('hill_sprints', `${reps} sprints en côte de 10 s`, [
    wu(),
    { kind: 'effort', seconds: 10, repeat: reps, target: { rpe: 9 }, recoverySeconds: 120, recoveryWalk: true, note: 'Côte raide, à fond, récup complète 2 min en marchant.' },
    { kind: 'continu', minutes: easyMin, target: { zone: 'z2' } },
  ], ctx);
}

export function descents(km: number, ctx: BuildContext): BuiltSession {
  const reps = pick([4, 5, 6, 8], ctx.phaseWeek);
  return make('descentes', `Z2 + ${reps} descentes techniques`, [
    wu(Math.max(15, round5(km * paceForTarget({ zone: 'z2' }, ctx)) - reps * 4 - 10)),
    { kind: 'effort', minutes: 2, repeat: reps, target: { zone: 'z2' }, recoverySeconds: 180, recoveryWalk: true, note: 'Descente contrôlée : regard loin, pas courts et rapides. Remontée en marchant.' },
    cd(),
  ], ctx);
}

export function threshold(ctx: BuildContext): BuiltSession {
  const ladder: [number, number][] = ctx.light ? [[3, 6], [3, 8], [4, 6], [3, 8]] : ctx.taper ? [[2, 8]] : [[3, 8], [4, 8], [3, 10], [4, 10], [2, 15], [1, 25]];
  const [reps, min] = pick(ladder, ctx.phaseWeek);
  const target: Intensity = ctx.trail ? { zone: 'z4' } : { pace: 'T' };
  const effort: Step = reps > 1
    ? { kind: 'effort', minutes: min, repeat: reps, target, recoverySeconds: 120, note: 'Seuil : « confortablement dur », récup 2 min trot.' }
    : { kind: 'effort', minutes: min, target, note: 'Seuil continu, effort régulier.' };
  return make('seuil', reps > 1 ? `Seuil ${reps} × ${min} min` : `Seuil continu ${min} min`, [wu(), effort, cd()], ctx, { rpeTarget: 7 });
}

export function vo2(ctx: BuildContext): BuiltSession {
  const ladder: [number, number, number][] = ctx.taper ? [[4, 2, 0]] : [[5, 3, 0], [6, 3, 0], [5, 4, 0], [12, 0, 30], [6, 4, 0]];
  const [reps, min, sec] = pick(ladder, ctx.phaseWeek);
  const hill = ctx.trail ? ' en côte' : '';
  const target: Intensity = ctx.trail ? { zone: 'z5' } : { pace: 'I' };
  const effort: Step = min
    ? { kind: 'effort', minutes: min, repeat: reps, target, note: `Récup égale en trot${ctx.trail ? ' (redescente)' : ''}.` }
    : { kind: 'effort', seconds: sec, repeat: reps, target, note: '30 s vite / 30 s trot.' };
  const title = min ? `VO2max${hill} ${reps} × ${min} min` : `VO2max${hill} ${reps} × 30/30`;
  return make('vo2max', title, [wu(), effort, cd()], ctx, { rpeTarget: 9 });
}

export function longHills(ctx: BuildContext): BuiltSession {
  const ladder: [number, number][] = ctx.light ? [[4, 3], [5, 3]] : ctx.taper ? [[3, 4]] : [[4, 4], [5, 4], [4, 6], [5, 6], [6, 5]];
  const [reps, min] = pick(ladder, ctx.phaseWeek);
  const zone = ctx.light ? 'z3' : 'z4';
  const poles = ctx.hasPoles && !ctx.light ? ' Bâtons permis : pratique-les comme le jour J.' : '';
  return make('cotes_longues', `Côtes longues ${reps} × ${min} min`, [
    wu(),
    { kind: 'effort', minutes: min, repeat: reps, target: { zone }, note: `Montée régulière, redescente en trottinant.${poles}` },
    cd(),
  ], ctx, { rpeTarget: ctx.light ? 6 : 7 });
}

/** Allure spécifique à l'objectif route. */
function racePaceKey(goal: GoalKind): PaceKey {
  return goal === 'route_marathon' ? 'M' : goal === 'route_5k' ? 'I' : 'T';
}

export function racePace(ctx: BuildContext): BuiltSession {
  if (ctx.trail) {
    // En trail, « allure course » = effort de course sur le terrain de course.
    const [reps, min] = ctx.taper ? [2, 6] : pick([[2, 12], [3, 12], [2, 20]] as [number, number][], ctx.phaseWeek);
    return make('tempo', `Effort course ${reps} × ${min} min`, [wu(), { kind: 'effort', minutes: min, repeat: reps, target: { zone: 'z3' }, recoverySeconds: 180, note: 'Effort de course sur terrain race-like, montées comprises.' }, cd()], ctx, { rpeTarget: 6 });
  }
  const key = racePaceKey(ctx.goal);
  const ladder: [number, number][] = ctx.taper ? [[2, 5]] : key === 'M' ? [[2, 10], [2, 15], [3, 15], [2, 20]] : [[3, 8], [3, 10], [2, 15]];
  const [reps, min] = pick(ladder, ctx.phaseWeek);
  return make('tempo', `Allure course ${reps} × ${min} min`, [wu(), { kind: 'effort', minutes: min, repeat: reps, target: { pace: key }, recoverySeconds: 120, note: 'Exactement l’allure objectif : pas plus vite.' }, cd()], ctx, { rpeTarget: 7 });
}

export function longRun(km: number, ctx: BuildContext, specific: boolean, gainM = 0): BuiltSession {
  const pace = paceForTarget({ zone: 'z2' }, ctx);
  const effortKm = km + gainM / 100;
  // Arrondie à la minute inférieure : la croissance de 10 % se lit à la minute près.
  const minutes = Math.floor(effortKm * pace);
  const gut = minutes >= GUT_TRAINING_MIN_MINUTES ? ' Gut training : glucides dès 30-45 min.' : '';
  const hm = formatDuration(minutes);
  if (!specific) {
    const s = make('longue_facile', `Longue ${hm}`, [{ kind: 'continu', minutes, target: { zone: 'z2' }, note: `Z2 du début à la fin.${gut}` }], ctx);
    return { ...s, distanceKm: km };
  }
  const steps: Step[] = ctx.trail
    ? [
        { kind: 'continu', minutes: round5(minutes * 0.4), target: { zone: 'z2' } },
        { kind: 'effort', minutes: round5(minutes * 0.4), target: { zone: 'z3' }, note: 'Effort course dans les montées, descentes fluides. Matériel et nutrition du jour J.' },
        { kind: 'continu', minutes: round5(minutes * 0.2), target: { zone: 'z2' }, note: gut.trim() || undefined },
      ]
    : [
        { kind: 'continu', minutes: round5(minutes * 0.6), target: { zone: 'z2' } },
        { kind: 'effort', minutes: round5(minutes * 0.3), target: { pace: racePaceKey(ctx.goal) }, note: 'Fin de longue à allure objectif.' },
        { kind: 'retour_calme', minutes: round5(minutes * 0.1), target: { zone: 'z1' }, note: gut.trim() || undefined },
      ];
  return { ...make('longue_specifique', `Longue spécifique ${hm}`, steps, ctx, { rpeTarget: 6 }), distanceKm: km, durationMin: minutes };
}

export function backToBackSecond(minutes: number, ctx: BuildContext): BuiltSession {
  const m = round5(minutes);
  return make('back_to_back', `Back-to-back : ${m} min Z2 sur jambes fatiguées`, [{ kind: 'continu', minutes: m, target: { zone: 'z2' }, note: 'Même facile que d’habitude, sur la fatigue d’hier.' }], ctx);
}

/** « 30 s », « 1 min », « 1 min 30 ». */
function formatSec(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r ? `${m} min ${r}` : `${m} min`;
}

/**
 * Séance du parcours de démarrage au palier donné, en MINUTES (pas en km) :
 * 5 min de marche rapide + bloc (marche, marche/course ou course continue) + 5 min de marche lente.
 * Les km affichés sont estimés : course à l'allure facile, marche à WALK_PACE_MIN_PER_KM.
 */
export function runWalk(stage: number, ctx: BuildContext, opts: { walkMin?: number; extraWalkMin?: number } = {}): BuiltSession {
  const s = Math.max(STAGE_WALK, Math.min(stage, TRANSITION_LAST));
  const kind = stageKind(s);
  const extra = opts.extraWalkMin ?? 0;
  const runPace = paceForTarget({ zone: 'z2' }, ctx);
  const why = SESSION_LIBRARY.marche_course.oneLiner;
  if (kind === 'marche') {
    const minutes = (opts.walkMin ?? WALK_FIRST_START_MIN) + extra;
    return {
      type: 'marche_course', title: `Marche rapide ${minutes} min`, durationMin: minutes, distanceKm: Math.round((minutes / WALK_PACE_MIN_PER_KM) * 10) / 10,
      steps: [{ kind: 'continu', minutes, target: { rpe: 4 }, note: "D'un bon pas : tu peux parler, mais tu sens que tu marches vite." }], why,
    };
  }
  const warm: Step = { kind: 'echauffement', minutes: RUN_WALK_WARMUP_MIN, target: { rpe: 3 }, note: 'Marche rapide.' };
  const cool: Step = { kind: 'retour_calme', minutes: RUN_WALK_COOLDOWN_MIN + extra, target: { rpe: 2 }, note: extra ? `Marche lente, puis ${extra} min de marche en plus (jour de la longue).` : 'Marche lente.' };
  const runMin = stageRunMinutes(s);
  const walkMin = stageWalkMinutes(s) + RUN_WALK_WARMUP_MIN + RUN_WALK_COOLDOWN_MIN + extra;
  const distanceKm = Math.round((runMin / runPace + walkMin / WALK_PACE_MIN_PER_KM) * 10) / 10;
  const durationMin = stageDurationMinutes(s) + extra;
  if (kind === 'continu') {
    const minutes = continuousMinutes(s);
    return {
      type: 'marche_course', title: `Course continue ${minutes} min`, durationMin, distanceKm,
      steps: [warm, { kind: 'continu', minutes, target: { zone: 'z2' }, note: 'Facile : tu dois pouvoir parler. Ralentis plutôt que de marcher.' }, cool], why,
    };
  }
  const r = RUN_WALK_LADDER[s - 1]!;
  return {
    type: 'marche_course',
    title: `Marche-course ${r.reps} × (${formatSec(r.runSec)} course / ${formatSec(r.walkSec)} marche)`,
    durationMin,
    distanceKm,
    steps: [
      warm,
      { kind: 'effort', seconds: r.runSec, repeat: r.reps, target: { zone: 'z2' }, recoverySeconds: r.walkSec, recoveryWalk: true, note: 'La course doit rester facile : si tu ne peux pas parler, ralentis.' },
      cool,
    ],
    why,
  };
}

export function calibrationTest(ctx: BuildContext): BuiltSession {
  return make('test', 'Test 3 km', [wu(15), { kind: 'effort', distanceKm: 3, target: { rpe: 10 }, note: 'Le plus vite possible, régulier, finis fort. Ta FC max et ton niveau en sortent.' }, cd(10)], ctx, { rpeTarget: 10 });
}

export function raceDay(distanceKm: number, ctx: BuildContext): BuiltSession {
  return make('course', `Course : ${distanceKm} km`, [{ kind: 'continu', distanceKm, target: { rpe: 8 }, note: 'Rien de nouveau aujourd’hui. Pars en dedans.' }], ctx);
}

export function strength(type: 'muscu_generale' | 'muscu_trail' | 'plyo', minutes: number): BuiltSession {
  const info = SESSION_LIBRARY[type];
  return { type, title: info.label, durationMin: type === 'plyo' ? 20 : minutes, distanceKm: 0, steps: [], why: info.oneLiner };
}

export function rest(): BuiltSession {
  return { type: 'repos', title: 'Repos', durationMin: 0, distanceKm: 0, steps: [], why: SESSION_LIBRARY.repos.oneLiner };
}

/**
 * Séance d'évaluation (« Je sais pas » chez un débutant ou un régulier) : 5 min de marche rapide, puis course
 * facile jusqu'à 10 min au plus, arrêt dès que parler devient difficile. Les minutes tenues fixent le palier.
 */
export function evaluationRun(ctx: BuildContext): BuiltSession {
  return make('evaluation', `Évaluation : jusqu'à ${EVALUATION_MAX_RUN_MIN} min de course facile`, [
    { kind: 'echauffement', minutes: EVALUATION_WALK_MIN, target: { rpe: 3 }, note: 'Marche rapide.' },
    { kind: 'continu', minutes: EVALUATION_MAX_RUN_MIN, target: { zone: 'z2' }, note: 'Course très facile. Arrête dès que parler devient difficile, et note combien de minutes tu as couru.' },
    { kind: 'retour_calme', minutes: EVALUATION_WALK_MIN, target: { rpe: 2 }, note: 'Marche tranquille.' },
  ], ctx);
}
