import {
  CONTINUOUS_TRANSITION_MIN, RUN_WALK_COOLDOWN_MIN, RUN_WALK_LADDER, RUN_WALK_WARMUP_MIN, WALK_FIRST_START_MIN,
  WALK_FIRST_STEP_MIN, WALK_FIRST_TARGET_MIN,
} from './constants';

/**
 * Le parcours de démarrage, en un seul nombre (« palier ») :
 *   0       marche d'abord (20 → 30 min de marche rapide)
 *   1 à 13  échelle de marche/course (13 = 20 min continues)
 *   14 à 18 transition continue : 22, 24, 26, 28, 30 min
 *   19      parcours terminé : la base normale reprend la main
 */
export const STAGE_WALK = 0;
export const LADDER_FIRST = 1;
export const LADDER_LAST = RUN_WALK_LADDER.length; // 13
export const TRANSITION_LAST = LADDER_LAST + CONTINUOUS_TRANSITION_MIN.length - 1; // 18
export const JOURNEY_DONE = TRANSITION_LAST + 1; // 19

export type StageKind = 'marche' | 'marche_course' | 'continu' | 'termine';

export function stageKind(stage: number): StageKind {
  if (stage <= STAGE_WALK) return 'marche';
  if (stage < LADDER_LAST) return 'marche_course';
  if (stage <= TRANSITION_LAST) return 'continu';
  return 'termine';
}

/** Minutes de course continue du bloc d'un palier continu (13 à 18). */
export function continuousMinutes(stage: number): number {
  return CONTINUOUS_TRANSITION_MIN[Math.min(Math.max(stage, LADDER_LAST), TRANSITION_LAST) - LADDER_LAST]!;
}

/** Temps de course total d'une séance à ce palier (minutes). */
export function stageRunMinutes(stage: number): number {
  const kind = stageKind(stage);
  if (kind === 'marche') return 0;
  if (kind === 'marche_course') {
    const r = RUN_WALK_LADDER[stage - 1]!;
    return (r.runSec * r.reps) / 60;
  }
  return continuousMinutes(Math.min(stage, TRANSITION_LAST));
}

/** Temps de marche (hors échauffement et retour au calme) d'une séance à ce palier (minutes). */
export function stageWalkMinutes(stage: number): number {
  if (stageKind(stage) !== 'marche_course') return 0;
  const r = RUN_WALK_LADDER[stage - 1]!;
  return (r.walkSec * r.reps) / 60;
}

/** Durée totale d'une séance (échauffement et retour au calme marchés inclus). */
export function stageDurationMinutes(stage: number, walkMin = WALK_FIRST_START_MIN): number {
  if (stageKind(stage) === 'marche') return walkMin;
  return RUN_WALK_WARMUP_MIN + stageRunMinutes(stage) + stageWalkMinutes(stage) + RUN_WALK_COOLDOWN_MIN;
}

/** Minutes de marche d'une séance « marche d'abord » après n séances validées. */
export function walkFirstMinutes(validated: number): number {
  return Math.min(WALK_FIRST_TARGET_MIN, WALK_FIRST_START_MIN + WALK_FIRST_STEP_MIN * validated);
}

/** « Palier 5 sur 13 », « Marche d'abord », « Transition : 24 min »… */
export function stageLabel(stage: number): string {
  const kind = stageKind(stage);
  if (kind === 'marche') return "Marche d'abord";
  if (stage <= LADDER_LAST) return `Palier ${stage} sur ${LADDER_LAST}`;
  if (kind === 'continu') return `Transition : ${continuousMinutes(stage)} min continues`;
  return 'Parcours terminé';
}
