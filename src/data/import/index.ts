import { activityLoad, timeInZones, toIsoDate, isRunType, type Activity, type Athlete, type PlannedSession } from '@/engine';
import type { SentierDB } from '../db';
import { stamp } from '../ids';
import { syncMilestones } from '../milestones';
import { syncRunWalk } from '../runwalk';
import { parseGarminCsv } from './csv';
import { parseFit } from './fit';
import { parseGpx, parseTcx } from './xml';
import type { ParsedActivity } from './types';

export type { ParsedActivity } from './types';

export interface ImportFile {
  name: string;
  data: ArrayBuffer | string;
}

export interface ImportOutcome {
  file: string;
  status: 'ok' | 'doublon' | 'erreur';
  message: string;
  activityIds: string[];
  /** Séance planifiée du même jour à associer (après confirmation). */
  matches: { activityId: string; sessionId: string; title: string }[];
}

const decoder = new TextDecoder();
const asText = (d: ArrayBuffer | string) => (typeof d === 'string' ? d : decoder.decode(d));

/** Détecte le format par l'extension, puis par le contenu. */
export function parseFile(file: ImportFile): ParsedActivity[] {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'fit') {
    if (typeof file.data === 'string') throw new Error('Un FIT doit être lu en binaire.');
    return [parseFit(file.data)];
  }
  const text = asText(file.data);
  if (ext === 'gpx' || /<gpx[\s>]/.test(text)) return [parseGpx(text)];
  if (ext === 'tcx' || /<TrainingCenterDatabase[\s>]/.test(text)) return [parseTcx(text)];
  if (ext === 'csv') return parseGarminCsv(text);
  throw new Error('Format non reconnu. Formats acceptés : FIT, GPX, TCX, CSV (Garmin Connect).');
}

/** Empreinte de dédoublonnage : départ à la minute près + distance à 100 m près. */
export function fingerprint(p: Pick<ParsedActivity, 'startTime' | 'distanceKm'>): string {
  return `${p.startTime.slice(0, 16)}|${Math.round(p.distanceKm * 10)}`;
}

/** Convertit en activité Sentier : zones recalculées avec LES zones de l'athlète, charge calculée. */
export function toActivity(p: ParsedActivity, athlete: Athlete): Activity {
  const bounds = athlete.zones.bounds;
  const tiz = p.samples?.hr ? timeInZones(p.samples, bounds) : undefined;
  const { load } = activityLoad(
    { durationSec: p.movingSec ?? p.durationSec, elevationGainM: p.elevationGainM, timeInZonesSec: tiz, hrAvg: p.hrAvg, garminTrainingLoad: p.garminTrainingLoad },
    bounds,
    athlete.settings.loadMethod,
  );
  return stamp({
    athleteId: athlete.id,
    source: p.source,
    fingerprint: fingerprint(p),
    sport: p.sport,
    startTime: p.startTime,
    date: toIsoDate(new Date(p.startTime)),
    ...(p.name ? { name: p.name } : {}),
    durationSec: p.durationSec,
    ...(p.movingSec !== undefined ? { movingSec: p.movingSec } : {}),
    distanceKm: p.distanceKm,
    elevationGainM: p.elevationGainM,
    elevationLossM: p.elevationLossM,
    ...(p.hrAvg !== undefined ? { hrAvg: p.hrAvg } : {}),
    ...(p.hrMax !== undefined ? { hrMax: p.hrMax } : {}),
    ...(p.cadenceAvg !== undefined ? { cadenceAvg: p.cadenceAvg } : {}),
    ...(tiz ? { timeInZonesSec: tiz } : {}),
    ...(p.garminTrainingLoad !== undefined ? { garminTrainingLoad: p.garminTrainingLoad } : {}),
    load,
    ...(p.terrain ? { terrain: p.terrain } : {}),
    ...(p.samples ? { samples: p.samples } : {}),
  });
}

/** Séance planifiée du même jour, encore « prévue », compatible avec le sport. */
export async function findMatch(db: SentierDB, a: Activity): Promise<PlannedSession | undefined> {
  const sessions = await db.sessions.where('date').equals(a.date).filter((s) => s.athleteId === a.athleteId && s.status === 'prevue').toArray();
  const run = a.sport === 'course' || a.sport === 'trail';
  return sessions.find((s) => (run ? isRunType(s.type) && s.type !== 'repos' : s.type === 'croise' || s.type.startsWith('muscu')));
}

/** Associe une activité à une séance planifiée (après confirmation de l'utilisateur). */
export async function linkActivity(db: SentierDB, sessionId: string, activityId: string): Promise<void> {
  await db.sessions.update(sessionId, { status: 'faite', activityId, updatedAt: new Date().toISOString() });
  const s = await db.sessions.get(sessionId);
  // Séance marche/course importée : sans RPE, on répète le palier ; le debrief le demandera.
  if (s?.type === 'marche_course') await syncRunWalk(db, s.athleteId, toIsoDate(new Date()));
}

/** Import multiple. Rien n'est envoyé nulle part : tout se passe dans le navigateur. */
export async function importFiles(db: SentierDB, athlete: Athlete, files: ImportFile[]): Promise<ImportOutcome[]> {
  const outcomes: ImportOutcome[] = [];
  for (const file of files) {
    let parsed: ParsedActivity[];
    try {
      parsed = parseFile(file);
    } catch (e) {
      outcomes.push({ file: file.name, status: 'erreur', message: (e as Error).message, activityIds: [], matches: [] });
      continue;
    }
    const ids: string[] = [];
    const matches: ImportOutcome['matches'] = [];
    let duplicates = 0;
    for (const p of parsed) {
      const fp = fingerprint(p);
      if (await db.activities.where('fingerprint').equals(fp).count()) {
        duplicates++;
        continue;
      }
      const activity = toActivity(p, athlete);
      await db.activities.add(activity);
      ids.push(activity.id);
      const match = await findMatch(db, activity);
      if (match) matches.push({ activityId: activity.id, sessionId: match.id, title: match.title });
    }
    const status = ids.length ? 'ok' : parsed.length ? 'doublon' : 'erreur';
    const message = ids.length
      ? `${ids.length} activité${ids.length > 1 ? 's' : ''} importée${ids.length > 1 ? 's' : ''}${duplicates ? `, ${duplicates} déjà présente${duplicates > 1 ? 's' : ''}` : ''}.`
      : parsed.length ? 'Déjà importé.' : 'Aucune activité trouvée dans ce fichier.';
    outcomes.push({ file: file.name, status, message, activityIds: ids, matches });
  }
  if (outcomes.some((o) => o.activityIds.length)) await syncMilestones(db, athlete.id);
  return outcomes;
}
