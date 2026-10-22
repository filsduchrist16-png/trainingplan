import type { Athlete, ISODate, SetLog, SetResult, StrengthKind } from '@/engine';
import type { SentierDB } from './db';
import { nowIso, stamp } from './ids';

/** Séries de la dernière séance où cet exercice a été fait (pour la double progression). */
export async function lastSets(db: SentierDB, athleteId: string, exerciseId: string): Promise<SetResult[]> {
  const sessions = (await db.strengthSessions.where('date').above('').filter((s) => s.athleteId === athleteId && s.sets.some((x) => x.exerciseId === exerciseId)).toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const last = sessions[0];
  if (!last) return [];
  return last.sets.filter((x) => x.exerciseId === exerciseId).map((x) => ({ reps: x.reps, ...(x.loadKg !== undefined ? { loadKg: x.loadKg } : {}), ...(x.rpe !== undefined ? { rpe: x.rpe } : {}) }));
}

export interface StrengthLog {
  date: ISODate;
  plannedSessionId?: string;
  program: string;
  sets: SetLog[];
  notes?: string;
}

/** Enregistre la séance de muscu et coche la séance prévue. Rien d'envoyé nulle part. */
export async function saveStrengthSession(db: SentierDB, athlete: Pick<Athlete, 'id'>, log: StrengthLog): Promise<string> {
  const row = stamp({ athleteId: athlete.id, date: log.date, ...(log.plannedSessionId ? { plannedSessionId: log.plannedSessionId } : {}), program: log.program, sets: log.sets, ...(log.notes ? { notes: log.notes } : {}) });
  await db.transaction('rw', [db.strengthSessions, db.sessions], async () => {
    await db.strengthSessions.add(row);
    if (log.plannedSessionId) await db.sessions.update(log.plannedSessionId, { status: 'faite', updatedAt: nowIso() });
  });
  return row.id;
}

export type { StrengthKind };
