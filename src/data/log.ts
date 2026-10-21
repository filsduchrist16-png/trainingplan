import { activityLoad, isRunType, toIsoDate, type Athlete, type BodyZone, type SessionType, type Subjective } from '@/engine';
import type { SentierDB } from './db';
import { newId, nowIso, stamp } from './ids';
import { syncRunWalk } from './runwalk';

export interface QuickLog {
  date: string;
  sessionId?: string;
  type: SessionType;
  durationMin: number;
  distanceKm?: number;
  elevationGainM?: number;
  rpe: number;
  /** Marche/course : « J'ai fait tous les intervalles ». */
  completed?: boolean;
  feeling?: Subjective['feeling'];
  pains: { zone: BodyZone; intensity: number }[];
  notes?: string;
}

/**
 * Saisie manuelle en moins de 30 s : crée l'activité (charge estimée au RPE), le ressenti,
 * les douleurs éventuelles, et coche la séance prévue.
 */
export async function logManual(db: SentierDB, athlete: Athlete, q: QuickLog): Promise<string> {
  const id = newId();
  const run = isRunType(q.type) && q.type !== 'repos';
  const trail = q.type === 'cotes_longues' || q.type === 'descentes' || q.type === 'longue_specifique' || q.type === 'back_to_back' || (q.elevationGainM ?? 0) / Math.max(q.distanceKm ?? 1, 1) > 20;
  const { load } = activityLoad({ durationSec: q.durationMin * 60, elevationGainM: q.elevationGainM, rpe: q.rpe }, athlete.zones.bounds);
  await db.transaction('rw', [db.activities, db.subjectives, db.painLogs, db.sessions], async () => {
    await db.activities.add(stamp({
      athleteId: athlete.id,
      source: 'manuel' as const,
      fingerprint: `manuel-${id}`,
      sport: run ? (trail ? ('trail' as const) : ('course' as const)) : q.type === 'croise' ? ('velo' as const) : q.type.startsWith('muscu') || q.type === 'plyo' ? ('muscu' as const) : ('autre' as const),
      startTime: new Date(`${q.date}T12:00:00`).toISOString(),
      date: q.date,
      durationSec: q.durationMin * 60,
      distanceKm: q.distanceKm ?? 0,
      elevationGainM: q.elevationGainM ?? 0,
      elevationLossM: q.elevationGainM ?? 0,
      load,
    }, id));
    await db.subjectives.add(stamp({ athleteId: athlete.id, date: q.date, activityId: id, rpe: q.rpe, ...(q.completed !== undefined ? { completed: q.completed } : {}), ...(q.feeling ? { feeling: q.feeling } : {}), pains: q.pains, context: [], ...(q.notes ? { notes: q.notes } : {}) }));
    for (const p of q.pains.filter((x) => x.intensity > 0)) await db.painLogs.add(stamp({ athleteId: athlete.id, date: q.date, zone: p.zone, intensity: p.intensity, when: 'apres' as const }));
    if (q.sessionId) await db.sessions.update(q.sessionId, { status: 'faite', activityId: id, updatedAt: nowIso() });
  });
  // Marche/course : l'échelle avance (ou pas) selon cette séance, et les suivantes sont re-projetées.
  if (q.type === 'marche_course') await syncRunWalk(db, athlete.id, q.date > toIsoDate(new Date()) ? q.date : toIsoDate(new Date()));
  return id;
}

/** Déplace une séance (glisser-déposer ou « Déplacer vers… »). */
export async function moveSession(db: SentierDB, sessionId: string, date: string): Promise<void> {
  await db.sessions.update(sessionId, { date, updatedAt: nowIso() });
}

/** Échange les dates de deux séances (déplacer la qualité sans perdre la séance facile). */
export async function swapSessions(db: SentierDB, a: string, b: string): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const [sa, sb] = await Promise.all([db.sessions.get(a), db.sessions.get(b)]);
    if (!sa || !sb) return;
    await db.sessions.update(a, { date: sb.date, updatedAt: nowIso() });
    await db.sessions.update(b, { date: sa.date, updatedAt: nowIso() });
  });
}

export async function setSessionStatus(db: SentierDB, sessionId: string, status: 'prevue' | 'sautee' | 'faite'): Promise<void> {
  await db.sessions.update(sessionId, { status, updatedAt: nowIso() });
}
