import type { ISODate, PreventionCheck } from '@/engine';
import type { SentierDB } from './db';
import { stamp } from './ids';

/** Coche une routine de prévention pour un jour (une seule fois par jour et par routine). */
export async function checkRoutine(db: SentierDB, athleteId: string, routine: string, date: ISODate): Promise<void> {
  const exists = await db.preventionChecks.where('date').equals(date).filter((c) => c.athleteId === athleteId && c.routine === routine).count();
  if (!exists) await db.preventionChecks.add(stamp({ athleteId, date, routine }));
}

/** Décoche une routine pour un jour. */
export async function uncheckRoutine(db: SentierDB, athleteId: string, routine: string, date: ISODate): Promise<void> {
  await db.preventionChecks.where('date').equals(date).filter((c) => c.athleteId === athleteId && c.routine === routine).delete();
}

export async function preventionChecks(db: SentierDB, athleteId: string, from: ISODate): Promise<PreventionCheck[]> {
  return db.preventionChecks.where('date').aboveOrEqual(from).filter((c) => c.athleteId === athleteId).toArray();
}
