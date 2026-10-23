import type { ActivitySamples, ActivitySource, Sport, Terrain } from '@/engine/types';

/** Activité normalisée, indépendante du format d'origine. */
export interface ParsedActivity {
  source: ActivitySource;
  sport: Sport;
  terrain?: Terrain;
  name?: string;
  startTime: string; // ISO
  durationSec: number;
  movingSec?: number;
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  hrAvg?: number;
  hrMax?: number;
  cadenceAvg?: number;
  garminTrainingLoad?: number;
  samples?: ActivitySamples;
}

export interface RawPoint {
  t: number; // secondes depuis le départ
  hr?: number | null;
  speed?: number | null; // m/s
  altitude?: number | null;
  cadence?: number | null; // pas/min
  distance?: number | null; // m cumulés
}
