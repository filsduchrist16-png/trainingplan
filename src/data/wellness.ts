import type { Wellness } from '@/engine';
import type { SentierDB } from './db';
import { nowIso, stamp } from './ids';

/** Enregistre (ou complète) le bien-être du jour : un seul enregistrement par athlète et par jour. */
export async function saveWellness(db: SentierDB, athleteId: string, date: string, patch: Partial<Omit<Wellness, 'id' | 'athleteId' | 'date'>>): Promise<void> {
  const existing = await db.wellness.where('[athleteId+date]').equals([athleteId, date]).first();
  if (existing) await db.wellness.update(existing.id, { ...patch, updatedAt: nowIso() });
  else await db.wellness.add(stamp({ athleteId, date, ...patch }));
}
