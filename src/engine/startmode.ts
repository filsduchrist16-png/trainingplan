import { RUN_WALK_BELOW_CONTINUOUS_MIN, RUN_WALK_EXIT_MIN, RUN_WALK_FIRST_INTERVAL_SHARE, RUN_WALK_LADDER_MIN, ASSUMED_RUNS_PER_WEEK } from './constants';
import { explain } from './explain';
import { easyPace } from './paces';
import type { Experience, Explanation } from './types';

/**
 * Faut-il commencer en marche-course ? Et à quel niveau ?
 *
 * Règle : on compare la capacité de course CONTINUE (minutes qu'on peut courir sans marcher) à un seuil selon l'expérience.
 * - capacité déclarée en minutes, sinon plus longue sortie × allure facile, sinon volume hebdo ÷ 3 sorties × allure, sinon inconnue.
 * - inconnue = prudence : marche-course (sauf avancé).
 * Le premier intervalle de course vaut la moitié de la capacité (marge), et on monte d'un cran par semaine
 * jusqu'à 20 min de course continue : là, la marche-course n'a plus de raison d'être.
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
  /** Index dans RUN_WALK_LADDER_MIN du premier intervalle. */
  stage: number;
  /** Semaines de marche-course avant de pouvoir courir 20 min d'affilée. */
  weeksToExit: number;
  threshold: number;
  explanation: Explanation;
}

const EXIT_INDEX = RUN_WALK_LADDER_MIN.findIndex((m) => m >= RUN_WALK_EXIT_MIN);

export function firstStage(capacityMin: number): number {
  const target = capacityMin * RUN_WALK_FIRST_INTERVAL_SHARE;
  let stage = 0;
  RUN_WALK_LADDER_MIN.forEach((m, i) => {
    if (m <= target) stage = i;
  });
  return Math.min(stage, EXIT_INDEX - 1);
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
  const stage = runWalk ? firstStage(capacityMin) : EXIT_INDEX;
  const weeksToExit = runWalk ? Math.max(2, EXIT_INDEX - stage) : 0;

  const basis = {
    declaree: `Tu cours ${capacityMin} min d'affilée`,
    plus_longue_sortie: `Ta plus longue sortie (${input.longestRunKm} km) représente environ ${capacityMin} min de course`,
    volume: `Ton volume actuel suggère environ ${capacityMin} min par sortie`,
    inconnue: 'On ne sait pas ce que tu peux courir d’affilée',
  }[source];
  const explanation = runWalk
    ? explain('start.runwalk', 'info', 'On commence en marche-course', `${basis} ; en dessous de ${threshold} min, os, tendons et périoste ne sont pas encore prêts à courir en continu, même si le souffle suit. On alterne course et marche, et on allonge les intervalles chaque semaine (environ ${weeksToExit} semaines avant de courir ${RUN_WALK_EXIT_MIN} min d'affilée).`, { capacite: capacityMin, seuil: threshold, semaines: weeksToExit })
    : explain('start.continuous', 'info', 'On démarre en course continue', `${basis} : au-dessus du seuil de ${threshold} min pour ton niveau, pas besoin de marche-course. Les sorties restent courtes et on les allonge d'environ 10 % à la fois.`, { capacite: capacityMin, seuil: threshold });
  return { runWalk, capacityMin, capacitySource: source, stage, weeksToExit, threshold, explanation };
}
