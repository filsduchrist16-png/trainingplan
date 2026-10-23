import {
  CONTINUOUS_TRANSITION_MIN, RUN_WALK_COOLDOWN_MIN, RUN_WALK_FAILS_TO_STEP_BACK, RUN_WALK_GAP_BACK_DAYS, RUN_WALK_GAP_BACK_STAGES,
  RUN_WALK_GAP_REPEAT_DAYS, RUN_WALK_GAP_RESTART_DAYS, RUN_WALK_LADDER, RUN_WALK_MAX_RPE_OK, RUN_WALK_PAIN_BACK, RUN_WALK_PAIN_HOLD,
  RUN_WALK_RPE_FAIL, RUN_WALK_VALIDATIONS, RUN_WALK_VALIDATIONS_SLOW, RUN_WALK_WARMUP_MIN, WALK_FIRST_START_MIN,
  WALK_FIRST_STEP_MIN, WALK_FIRST_TARGET_MIN,
} from './constants';
import { addDays, diffDays } from './dates';
import { explain } from './explain';
import type { Explanation, ISODate, RunWalkState } from './types';

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

// ─── État et progression (validation par séance) ──────────────────────────────

export type { RunWalkState } from './types';

export interface RunWalkSession {
  date: ISODate;
  /** « J'ai fait tous les intervalles » ; undefined = on ne sait pas. */
  completed?: boolean;
  rpe?: number;
}

export interface RunWalkOptions {
  /** Profil « lent » : 3 séances validées par palier au lieu de 2. */
  slow?: boolean;
  /** Un garde-fou santé (STOP, red flag) est actif : pas de validation possible. */
  healthBlocked?: boolean;
  /** Point d'entrée recalculé (startMode) pour une reprise après 28 jours ou plus ; palier 1 par défaut. */
  entryStage?: number;
  /** Palier plafond (règle santé : grossesse, post-partum → marche seulement = 0). */
  maxStage?: number;
}

const WALK_STEPS_EARLY = Math.ceil((WALK_FIRST_TARGET_MIN - WALK_FIRST_START_MIN) / WALK_FIRST_STEP_MIN);
export const initialRunWalkState = (stage: number): RunWalkState => ({ stage, validatedAtStage: 0, failsAtStage: 0 });

/** Séances validées de suite requises pour quitter ce palier. Marche d'abord : 20 → 25 → 30 min, puis 30 min validées 2 fois. */
export function validationsRequired(stage: number, slow = false): number {
  const perStage = slow ? RUN_WALK_VALIDATIONS_SLOW : RUN_WALK_VALIDATIONS;
  if (stage === STAGE_WALK) return WALK_STEPS_EARLY + perStage;
  return perStage;
}

/** Séances validées nécessaires pour aller d'un état jusqu'à un palier cible (si tout se passe bien). */
export function sessionsToReach(state: Pick<RunWalkState, 'stage' | 'validatedAtStage'>, target: number, slow = false): number {
  let n = 0;
  for (let st = state.stage; st < target; st++) n += validationsRequired(st, slow) - (st === state.stage ? state.validatedAtStage : 0);
  return Math.max(0, n);
}

/** Palier de chaque séance à venir, si chacune est validée (projection du plan). */
export function projectStages(state: RunWalkState, count: number, slow = false, maxStage = JOURNEY_DONE): { stage: number; validatedAtStage: number }[] {
  const out: { stage: number; validatedAtStage: number }[] = [];
  let { stage, validatedAtStage } = state;
  for (let i = 0; i < count; i++) {
    out.push({ stage, validatedAtStage });
    if (stage >= JOURNEY_DONE) continue;
    const required = validationsRequired(stage, slow);
    validatedAtStage++;
    if (validatedAtStage >= required) {
      if (stage >= maxStage) validatedAtStage = required - 1; // plafond : on reste au palier, au maximum de ce palier
      else {
        stage++;
        validatedAtStage = 0;
      }
    }
  }
  return out;
}

const floorOf = (stage: number) => (stage <= STAGE_WALK ? STAGE_WALK : LADDER_FIRST);
const WALK_STEPS = WALK_STEPS_EARLY;
/**
 * Série remise à zéro. En « marche d'abord », les minutes acquises sont gardées (20 → 25 → 30) :
 * seule la série « 30 min validées 2 fois de suite » repart.
 */
const resetStreak = (st: RunWalkState) => (st.stage === STAGE_WALK ? Math.min(st.validatedAtStage, WALK_STEPS) : 0);

/**
 * Rejoue les séances du parcours dans l'ordre et applique la règle de validation.
 * Recalculé depuis l'état d'entrée à chaque fois (comme un journal) : un RPE noté plus tard
 * ou une séance corrigée est réévalué automatiquement, et le calcul est idempotent.
 *
 * - validée = intervalles tous faits + RPE ≤ 5 + aucune douleur le jour même ou le lendemain + aucun garde-fou actif ;
 * - 2 validées de suite (3 en profil lent) → palier suivant ;
 * - RPE 6-7 ou douleur 1-2 → on répète ; non terminée ou RPE ≥ 8 → échec, 2 échecs de suite → un palier plus bas ;
 * - douleur ≥ 3 ou garde-fou → un palier plus bas ;
 * - trou de 7-13 j → on répète ; 14-27 j → 2 paliers plus bas ; 28 j et plus → point d'entrée recalculé.
 *
 * `today` sert à la projection : `upcoming` est le palier de la PROCHAINE séance si elle a lieu aujourd'hui.
 */
export function nextRunWalkState(
  initial: RunWalkState,
  sessions: RunWalkSession[],
  painLogs: { date: ISODate; intensity: number }[],
  today: ISODate,
  opts: RunWalkOptions = {},
): { state: RunWalkState; explanations: Explanation[]; upcoming: RunWalkState; upcomingExplanation?: Explanation } {
  let st: RunWalkState = { ...initial };
  const explanations: Explanation[] = [];
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  for (const s of sorted) {
    if (st.lastSessionDate) {
      const gap = applyGap(st, diffDays(st.lastSessionDate, s.date), opts);
      st = gap.state;
      if (gap.explanation) explanations.push(gap.explanation);
    }
    const r = evaluate(st, s, painLogs, opts);
    st = { ...r.state, lastSessionDate: s.date };
    explanations.push(r.explanation);
  }
  const pending = st.lastSessionDate ? applyGap(st, diffDays(st.lastSessionDate, today), opts) : { state: st, explanation: undefined };
  return { state: st, explanations, upcoming: pending.state, ...(pending.explanation ? { upcomingExplanation: pending.explanation } : {}) };
}

function applyGap(st: RunWalkState, gap: number, opts: RunWalkOptions): { state: RunWalkState; explanation?: Explanation } {
  if (st.stage >= JOURNEY_DONE || gap < RUN_WALK_GAP_REPEAT_DAYS) return { state: st };
  if (gap >= RUN_WALK_GAP_RESTART_DAYS) {
    const entry = Math.min(opts.entryStage ?? LADDER_FIRST, st.stage);
    return {
      state: { ...st, stage: entry, validatedAtStage: 0, failsAtStage: 0 },
      explanation: explain('runwalk.restart', 'conseil', 'On repart du point d’entrée', `${gap} jours sans séance : la forme et surtout les tendons ont perdu leur adaptation. On repart au ${stageLabel(entry).toLowerCase()}, sans culpabilité : ça remonte vite.`, { jours: gap, palier: entry }),
    };
  }
  if (gap >= RUN_WALK_GAP_BACK_DAYS) {
    const stage = Math.max(floorOf(st.stage), st.stage - RUN_WALK_GAP_BACK_STAGES);
    return {
      state: { ...st, stage, validatedAtStage: 0, failsAtStage: 0 },
      explanation: explain('runwalk.gap', 'info', 'Petite marche arrière après une pause', `${gap} jours sans séance : on recule de ${st.stage - stage} palier(s) pour reprendre en douceur.`, { jours: gap, palier: stage }),
    };
  }
  return {
    state: { ...st, validatedAtStage: resetStreak(st), failsAtStage: 0 },
    explanation: explain('runwalk.gap', 'info', 'On répète le palier après une pause', `${gap} jours sans séance : on refait le palier avant d'avancer.`, { jours: gap, palier: st.stage }),
  };
}

function evaluate(st: RunWalkState, s: RunWalkSession, painLogs: { date: ISODate; intensity: number }[], opts: RunWalkOptions): { state: RunWalkState; explanation: Explanation } {
  const label = stageLabel(st.stage);
  if (st.stage >= JOURNEY_DONE) return { state: st, explanation: explain('runwalk.done', 'info', 'Parcours terminé', 'Tu cours 30 min en continu : la base normale a pris le relais.') };
  const pain = Math.max(0, ...painLogs.filter((p) => p.date === s.date || p.date === addDays(s.date, 1)).map((p) => p.intensity));
  const back = (why: string, title: string): { state: RunWalkState; explanation: Explanation } => {
    const stage = Math.max(floorOf(st.stage), st.stage - 1);
    // Marche d'abord : « un palier plus bas » = 5 min de marche en moins.
    const validatedAtStage = st.stage === STAGE_WALK ? Math.max(0, resetStreak(st) - 1) : 0;
    return { state: { ...st, stage, validatedAtStage, failsAtStage: 0 }, explanation: explain('runwalk.back', 'attention', title, why, { palier: stage }) };
  };
  if (pain >= RUN_WALK_PAIN_BACK || opts.healthBlocked) {
    return back(pain >= RUN_WALK_PAIN_BACK
      ? `Douleur à ${pain}/10 après la séance : les garde-fous santé passent d'abord, puis on reprend un palier plus bas.`
      : 'Un garde-fou santé est actif : on reprendra un palier plus bas quand il sera levé.', 'Un palier plus bas');
  }
  if (pain >= RUN_WALK_PAIN_HOLD) {
    return { state: { ...st, validatedAtStage: resetStreak(st), failsAtStage: 0 }, explanation: explain('runwalk.repeat', 'conseil', 'On répète le palier', `Une douleur légère (${pain}/10) : pas d'avancement tant qu'elle est là. On refait ${label.toLowerCase()}.`, { douleur: pain }) };
  }
  if (s.completed === false || (s.rpe !== undefined && s.rpe >= RUN_WALK_RPE_FAIL)) {
    const fails = st.failsAtStage + 1;
    if (fails >= RUN_WALK_FAILS_TO_STEP_BACK) return back(`${fails} séances difficiles de suite : on recule d'un palier pour retrouver de l'aisance. C'est normal, et ça repart vite.`, 'Un palier plus bas');
    return { state: { ...st, validatedAtStage: resetStreak(st), failsAtStage: fails }, explanation: explain('runwalk.repeat', 'info', 'On répète le palier', s.completed === false ? 'Séance pas terminée : on la refait. Ralentis la course plutôt que de forcer.' : `Effort à ${s.rpe}/10 : c'était trop dur. On refait ce palier en courant plus lentement.`, { echecs: fails }) };
  }
  if (s.completed === undefined || s.rpe === undefined) {
    return { state: st, explanation: explain('runwalk.repeat', 'info', 'Note ton effort pour avancer', 'Il manque le RPE (ou si tous les intervalles ont été faits) : on ne peut pas valider la séance. Note-le dans le debrief et elle sera réévaluée.') };
  }
  if (s.rpe > RUN_WALK_MAX_RPE_OK) {
    return { state: { ...st, validatedAtStage: resetStreak(st), failsAtStage: 0 }, explanation: explain('runwalk.repeat', 'info', 'On répète le palier', `Effort à ${s.rpe}/10 : faite, mais pas encore facile. On avance quand tu peux parler tout du long (RPE 5 ou moins).`, { rpe: s.rpe }) };
  }
  const validated = st.validatedAtStage + 1;
  const required = validationsRequired(st.stage, opts.slow);
  if (validated >= required && st.stage >= (opts.maxStage ?? JOURNEY_DONE)) {
    return {
      state: { ...st, validatedAtStage: required - 1, failsAtStage: 0 },
      explanation: explain('runwalk.hold', 'info', 'Séance validée, on reste à ce palier', 'Bien fait! Une règle santé (grossesse ou reprise post-partum) garde ton plan à la marche pour l’instant.', { palier: st.stage }),
    };
  }
  if (validated >= required) {
    const stage = st.stage + 1;
    return {
      state: { ...st, stage, validatedAtStage: 0, failsAtStage: 0 },
      explanation: explain('runwalk.advance', 'info', stage >= JOURNEY_DONE ? 'Tu cours 30 min d’affilée!' : `Prochaine séance : ${stageLabel(stage).toLowerCase()}`, stage >= JOURNEY_DONE ? 'Parcours de démarrage terminé : on passe à la base normale.' : `${required} séances réussies de suite : on monte d'un cran.`, { palier: stage }),
    };
  }
  return {
    state: { ...st, validatedAtStage: validated, failsAtStage: 0 },
    explanation: explain('runwalk.validated', 'info', `Séance validée (${validated} sur ${required})`, `Encore ${required - validated} séance(s) réussie(s) à ce palier avant de monter.`, { valide: validated, requis: required }),
  };
}
