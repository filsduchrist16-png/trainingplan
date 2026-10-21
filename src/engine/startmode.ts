import { ASSUMED_RUNS_PER_WEEK, EVALUATION_MAX_RUN_MIN, EVALUATION_WALK_MIN, RUN_WALK_BELOW_CONTINUOUS_MIN, RUN_WALK_FIRST_INTERVAL_SHARE, RUN_WALK_LADDER } from './constants';
import { JOURNEY_DONE, LADDER_FIRST, LADDER_LAST } from './runwalk';
import { explain } from './explain';
import { easyPace } from './paces';
import type { Experience, Explanation } from './types';

/**
 * Faut-il commencer en marche-course ? Et à quel niveau ?
 *
 * Règle : on compare la capacité de course CONTINUE (minutes qu'on peut courir sans marcher) à un seuil selon l'expérience.
 * - capacité déclarée en minutes, sinon plus longue sortie × allure facile, sinon volume hebdo ÷ 3 sorties × allure, sinon inconnue.
 * - inconnue = prudence : marche-course (sauf avancé).
 * Le premier intervalle de course vaut au plus la moitié de la capacité (marge). La progression se fait ensuite
 * séance par séance (voir runwalk.ts), jusqu'à 30 min de course continue.
 */

export interface StartInput {
  experience: Experience;
  weeklyKm: number;
  longestRunKm?: number;
  /** Minutes de course sans s'arrêter, déclarées par la personne (la meilleure information). */
  continuousMin?: number;
  vdot?: number;
}

export interface StartMode {
  runWalk: boolean;
  /** Minutes de course continue estimées. */
  capacityMin: number;
  capacitySource: 'declaree' | 'plus_longue_sortie' | 'volume' | 'inconnue';
  /** Palier d'entrée (1 à 13, voir runwalk.ts) ; JOURNEY_DONE si pas de marche-course. */
  stage: number;
  /** Semaines estimées (2 séances validées par palier, 3 séances/sem) pour courir 30 min d'affilée. */
  weeksToExit: number;
  threshold: number;
  /** « Je sais pas » chez un débutant ou un régulier : 1re séance = évaluation, qui fixe le palier (F12). */
  evaluation: boolean;
  explanation: Explanation;
}

/** Palier d'entrée : le plus haut dont l'intervalle de course est ≤ 50 % de la capacité continue (palier 1 au minimum). */
export function firstStage(capacityMin: number): number {
  const limitSec = capacityMin * 60 * RUN_WALK_FIRST_INTERVAL_SHARE;
  let stage = LADDER_FIRST;
  RUN_WALK_LADDER.forEach((r, i) => {
    if (r.runSec <= limitSec) stage = i + LADDER_FIRST;
  });
  return Math.min(stage, LADDER_LAST);
}

/** Estimation grossière utilisée pour l'explication : 2 séances validées par palier, 3 séances par semaine. */
function weeksFrom(stage: number): number {
  return Math.ceil(((JOURNEY_DONE - stage) * 2) / 3);
}

export function startMode(input: StartInput): StartMode {
  const pace = easyPace(input.vdot);
  let capacityMin: number;
  let source: StartMode['capacitySource'];
  if (input.continuousMin !== undefined) {
    capacityMin = input.continuousMin;
    source = 'declaree';
  } else if (input.longestRunKm !== undefined && input.longestRunKm > 0) {
    capacityMin = input.longestRunKm * pace;
    source = 'plus_longue_sortie';
  } else if (input.weeklyKm > 0) {
    capacityMin = (input.weeklyKm / ASSUMED_RUNS_PER_WEEK) * pace;
    source = 'volume';
  } else {
    capacityMin = 0;
    source = 'inconnue';
  }
  capacityMin = Math.round(capacityMin);
  const threshold = RUN_WALK_BELOW_CONTINUOUS_MIN[input.experience];
  const runWalk = capacityMin < threshold;
  const stage = runWalk ? firstStage(capacityMin) : JOURNEY_DONE;
  const weeksToExit = runWalk ? weeksFrom(stage) : 0;

  const basis = {
    declaree: `Tu cours ${capacityMin} min d'affilée`,
    plus_longue_sortie: `Ta plus longue sortie (${input.longestRunKm} km) représente environ ${capacityMin} min de course`,
    volume: `Ton volume actuel suggère environ ${capacityMin} min par sortie`,
    inconnue: 'On ne sait pas ce que tu peux courir d’affilée',
  }[source];
  const evaluation = source === 'inconnue' && (input.experience === 'debutant' || input.experience === 'regulier');
  if (evaluation) {
    const explanation = explain('start.evaluation', 'conseil', 'Ta 1re séance : une évaluation', `On ne sait pas encore combien de minutes tu cours d'affilée. Ta 1re séance : ${EVALUATION_WALK_MIN} min de marche, puis course facile jusqu'à ${EVALUATION_MAX_RUN_MIN} min, en arrêtant dès que parler devient difficile. Le temps tenu fixe ton point de départ et le plan s'ajuste ; d'ici là, on part prudemment.`, { max: EVALUATION_MAX_RUN_MIN });
    return { runWalk, capacityMin, capacitySource: source, stage, weeksToExit, threshold, evaluation, explanation };
  }
  const explanation = runWalk
    ? explain('start.runwalk', 'info', 'On commence en marche-course', `${basis} ; en dessous de ${threshold} min, os, tendons et périoste ne sont pas encore prêts à courir en continu, même si le souffle suit. On alterne course et marche, et on allonge les intervalles chaque semaine (environ ${weeksToExit} semaines pour courir 30 min d'affilée, au rythme de tes séances réussies).`, { capacite: capacityMin, seuil: threshold, semaines: weeksToExit })
    : explain('start.continuous', 'info', 'On démarre en course continue', `${basis} : au-dessus du seuil de ${threshold} min pour ton niveau, pas besoin de marche-course. Les sorties restent courtes et on les allonge d'environ 10 % à la fois.`, { capacite: capacityMin, seuil: threshold });
  return { runWalk, capacityMin, capacitySource: source, stage, weeksToExit, threshold, evaluation, explanation };
}
