import type { Difficulty, Experience, GoalKind } from './types';

/**
 * Profils d'objectifs (catalogue à la Campus / Runna).
 * Volumes de pointe par niveau : ordres de grandeur courants dans les plans publics. À VALIDER, configurables.
 */

export type GoalFamily = 'route' | 'trail' | 'debuter' | 'forme';

export interface GoalProfile {
  label: string;
  family: GoalFamily;
  defaultDistanceKm: number;
  defaultElevationM: number;
  minWeeks: number;
  idealWeeks: number;
  taperWeeks: 0 | 1 | 2 | 3;
  /** Volume de pointe (km/sem) : débutant, régulier, avancé. */
  peakKm: [number, number, number];
  /** Sortie longue max (minutes). */
  longRunMaxMin: number;
}

export const GOALS: Record<GoalKind, GoalProfile> = {
  route_5k: { label: '5 km', family: 'route', defaultDistanceKm: 5, defaultElevationM: 0, minWeeks: 6, idealWeeks: 10, taperWeeks: 1, peakKm: [25, 40, 60], longRunMaxMin: 75 },
  route_10k: { label: '10 km', family: 'route', defaultDistanceKm: 10, defaultElevationM: 0, minWeeks: 6, idealWeeks: 12, taperWeeks: 1, peakKm: [30, 50, 70], longRunMaxMin: 95 },
  route_semi: { label: 'Semi-marathon', family: 'route', defaultDistanceKm: 21.1, defaultElevationM: 0, minWeeks: 8, idealWeeks: 14, taperWeeks: 2, peakKm: [35, 55, 80], longRunMaxMin: 130 },
  route_marathon: { label: 'Marathon', family: 'route', defaultDistanceKm: 42.2, defaultElevationM: 0, minWeeks: 12, idealWeeks: 18, taperWeeks: 2, peakKm: [45, 70, 100], longRunMaxMin: 210 },
  trail_court: { label: 'Trail court (< 30 km)', family: 'trail', defaultDistanceKm: 20, defaultElevationM: 800, minWeeks: 8, idealWeeks: 14, taperWeeks: 1, peakKm: [35, 50, 70], longRunMaxMin: 180 },
  trail_moyen: { label: 'Trail moyen (30-60 km)', family: 'trail', defaultDistanceKm: 43, defaultElevationM: 1500, minWeeks: 12, idealWeeks: 24, taperWeeks: 2, peakKm: [45, 65, 90], longRunMaxMin: 300 },
  ultra: { label: 'Ultra (60 km +)', family: 'trail', defaultDistanceKm: 80, defaultElevationM: 3500, minWeeks: 16, idealWeeks: 28, taperWeeks: 3, peakKm: [55, 80, 110], longRunMaxMin: 360 },
  debuter: { label: 'Courir de zéro', family: 'debuter', defaultDistanceKm: 5, defaultElevationM: 0, minWeeks: 6, idealWeeks: 10, taperWeeks: 0, peakKm: [15, 20, 25], longRunMaxMin: 40 },
  forme: { label: 'Garder la forme', family: 'forme', defaultDistanceKm: 0, defaultElevationM: 0, minWeeks: 4, idealWeeks: 8, taperWeeks: 0, peakKm: [20, 35, 50], longRunMaxMin: 90 },
};

/** Multiplicateur de difficulté (sur le pic et la densité de qualité ; jamais sur la règle des 10 %). */
export const DIFFICULTY_FACTOR: Record<Difficulty, number> = { prudent: 0.85, equilibre: 1, ambitieux: 1.12 };

export function experienceIndex(e: Experience): 0 | 1 | 2 {
  return e === 'avance' ? 2 : e === 'regulier' ? 1 : 0;
}

/** Devine l'objectif trail d'après la distance. */
export function trailGoalFor(distanceKm: number): GoalKind {
  return distanceKm < 30 ? 'trail_court' : distanceKm <= 60 ? 'trail_moyen' : 'ultra';
}
