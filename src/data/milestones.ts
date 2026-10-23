import { addDays, newMilestones, type ISODate, type Milestone } from '@/engine';
import type { SentierDB } from './db';
import { stamp } from './ids';

/**
 * Enregistre les jalons atteints d'après l'historique (idempotent : clé unique par athlète).
 * Appelé après un log, un import, et à l'ouverture de Progrès : le premier appel rattrape tout l'historique.
 */
export async function syncMilestones(db: SentierDB, athleteId: string): Promise<Milestone[]> {
  const known = new Set((await db.milestones.where('athleteId').equals(athleteId).toArray()).map((m) => m.key));
  const acts = await db.activities.where('athleteId').equals(athleteId).toArray();
  const hits = newMilestones(acts, known);
  const rows = hits.map((h) => stamp({ athleteId, key: h.key, date: h.date, ...(h.value !== undefined ? { value: h.value } : {}), title: h.explanation.title, why: h.explanation.why }));
  if (rows.length) await db.milestones.bulkAdd(rows).catch(() => undefined); // course entre deux appels : l'unicité garde un seul exemplaire
  return rows;
}

export async function milestones(db: SentierDB, athleteId: string): Promise<Milestone[]> {
  return (await db.milestones.where('athleteId').equals(athleteId).toArray()).sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}

/** Jalons atteints dans les `days` derniers jours, plus récent d'abord. */
export async function recentMilestoneRows(db: SentierDB, athleteId: string, today: ISODate, days = 7): Promise<Milestone[]> {
  const all = await milestones(db, athleteId);
  return all.filter((m) => m.date > addDays(today, -days) && m.date <= today);
}
