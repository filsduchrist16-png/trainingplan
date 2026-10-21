import { Decoder, Stream } from '@garmin/fitsdk';
import type { Sport, Terrain } from '@/engine/types';
import { elevationFromAltitude, max, mean, movingTime, resample } from './samples';
import type { ParsedActivity, RawPoint } from './types';

interface FitRecord {
  timestamp?: Date;
  heartRate?: number;
  speed?: number;
  enhancedSpeed?: number;
  altitude?: number;
  enhancedAltitude?: number;
  cadence?: number;
  fractionalCadence?: number;
  distance?: number;
}

interface FitSession {
  startTime?: Date;
  sport?: string;
  subSport?: string;
  totalElapsedTime?: number;
  totalTimerTime?: number;
  totalDistance?: number;
  totalAscent?: number;
  totalDescent?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgCadence?: number;
  avgRunningCadence?: number;
  avgFractionalCadence?: number;
  trainingLoadPeak?: number;
}

function sportOf(sport?: string, subSport?: string): { sport: Sport; terrain?: Terrain } {
  if (sport === 'running') return subSport === 'trail' ? { sport: 'trail', terrain: 'sentier' } : { sport: 'course', terrain: subSport === 'track' || subSport === 'street' || subSport === 'generic' ? 'route' : undefined };
  if (sport === 'cycling') return { sport: 'velo' };
  if (sport === 'swimming') return { sport: 'natation' };
  if (sport === 'walking' || sport === 'hiking') return { sport: 'marche', terrain: sport === 'hiking' ? 'sentier' : undefined };
  if (sport === 'training') return { sport: 'muscu' };
  return { sport: 'autre' };
}

/**
 * Lit un fichier FIT (Garmin) avec le SDK officiel.
 * La cadence de course FIT est en foulées/min (un pied) : on la double pour obtenir des pas/min.
 */
export function parseFit(buffer: ArrayBuffer): ParsedActivity {
  const stream = Stream.fromArrayBuffer(buffer);
  if (!Decoder.isFIT(stream)) throw new Error("Ce fichier n'est pas un FIT valide.");
  const { messages, errors } = new Decoder(stream).read();
  const records = (messages.recordMesgs ?? []) as FitRecord[];
  const session = ((messages.sessionMesgs ?? [])[0] ?? {}) as FitSession;
  if (records.length === 0 && !session.startTime) throw new Error(errors[0]?.message ?? 'Aucune donnée d’activité dans ce FIT.');

  const start = session.startTime ?? records[0]?.timestamp ?? new Date();
  const t0 = start.getTime();
  const isRun = session.sport === 'running' || session.sport === undefined;
  const points: RawPoint[] = records
    .filter((r) => r.timestamp)
    .map((r) => ({
      t: Math.round((r.timestamp!.getTime() - t0) / 1000),
      hr: r.heartRate ?? null,
      speed: r.enhancedSpeed ?? r.speed ?? null,
      altitude: r.enhancedAltitude ?? r.altitude ?? null,
      cadence: r.cadence != null ? (isRun ? (r.cadence + (r.fractionalCadence ?? 0)) * 2 : r.cadence) : null,
      distance: r.distance ?? null,
    }))
    .filter((p) => p.t >= 0);

  const elevation = elevationFromAltitude(points.map((p) => p.altitude));
  const lastDistance = max(points.map((p) => p.distance)) ?? 0;
  const runCadence = session.avgRunningCadence ?? session.avgCadence;
  const { sport, terrain } = sportOf(session.sport, session.subSport);
  return {
    source: 'fit',
    sport,
    ...(terrain ? { terrain } : {}),
    startTime: start.toISOString(),
    durationSec: Math.round(session.totalElapsedTime ?? points.at(-1)?.t ?? 0),
    movingSec: session.totalTimerTime !== undefined ? Math.round(session.totalTimerTime) : movingTime(points),
    distanceKm: Math.round(((session.totalDistance ?? lastDistance) / 1000) * 100) / 100,
    elevationGainM: session.totalAscent ?? elevation.gain,
    elevationLossM: session.totalDescent ?? elevation.loss,
    hrAvg: session.avgHeartRate ?? mean(points.map((p) => p.hr)),
    hrMax: session.maxHeartRate ?? max(points.map((p) => p.hr)),
    cadenceAvg: runCadence != null ? Math.round(isRun ? (runCadence + (session.avgFractionalCadence ?? 0)) * 2 : runCadence) : mean(points.map((p) => p.cadence)),
    ...(session.trainingLoadPeak != null ? { garminTrainingLoad: Math.round(session.trainingLoadPeak) } : {}),
    ...(points.length > 1 ? { samples: resample(points) } : {}),
  };
}
