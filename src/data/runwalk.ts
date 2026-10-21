import { GOALS, addDays, mondayOf, nextRunWalkState, rescheduleJourney, type Athlete, type GoalKind, type ISODate, type RunWalkSession } from '@/engine';
import type { SentierDB } from './db';
import { nowIso } from './ids';

/**
 * Branche l'échelle marche/course sur le réalisé. Rejoue le journal (séances marche/course faites du plan actif,
 * avec RPE et « tous les intervalles faits »), persiste l'état dans `athlete.runWalk`, puis re-projette les
 * séances marche/course à venir. Idempotent : à appeler après chaque log, import ou RPE noté plus tard.
 */
export async function syncRunWalk(db: SentierDB, athleteId: string, today: ISODate): Promise<Athlete['runWalk']> {
  const athlete = await db.athletes.get(athleteId);
  const block = await db.blocks.where('status').equals('actif').filter((b) => b.athleteId === athleteId).first();
  if (!athlete || !block?.runWalkStart) return undefined;
  const weeks = await db.weeks.where('blockId').equals(block.id).toArray();
  const sessions = (await db.sessions.where('weekId').anyOf(weeks.map((w) => w.id)).toArray()).filter((s) => s.type === 'marche_course');

  // Journal : séances marche/course faites, jusqu'à aujourd'hui.
  const done = sessions.filter((s) => s.status === 'faite' && s.date <= today);
  const subjectives = await db.subjectives.where('activityId').anyOf(done.flatMap((s) => (s.activityId ? [s.activityId] : []))).toArray();
  const journal: RunWalkSession[] = done.map((s) => {
    const sub = subjectives.find((x) => x.activityId === s.activityId);
    return { date: s.date, ...(sub?.rpe !== undefined ? { rpe: sub.rpe } : {}), ...(sub?.completed !== undefined ? { completed: sub.completed } : {}) };
  });
  const pains = (await db.painLogs.where('athleteId').equals(athleteId).toArray()).filter((p) => p.date >= block.startDate);
  const r = nextRunWalkState(block.runWalkStart, journal, pains, today, { entryStage: block.runWalkStart.stage });
  const last = r.upcomingExplanation ?? r.explanations.at(-1);
  const runWalk: NonNullable<Athlete['runWalk']> = { state: r.upcoming, ...(last ? { last } : {}), updatedOn: today };

  // Séances à venir re-projetées depuis l'état réel (à partir de demain si celle du jour est déjà faite).
  const upcoming = sessions.filter((s) => s.status === 'prevue' && s.date >= today);
  const raceDays = weeks.flatMap((w) => [w.raceDate, w.bRaceDate].filter((d): d is ISODate => Boolean(d)));
  const slots = upcoming.map((s) => {
    const weekStart = mondayOf(s.date);
    return { id: s.id, date: s.date, weekStart, raceWeek: raceDays.some((d) => d >= weekStart && d <= addDays(weekStart, 6)) };
  });
  const goal = block.goal as GoalKind;
  const rebuilt = rescheduleJourney(r.upcoming, slots, { goal, family: GOALS[goal].family, vdot: athlete.vdot, availability: athlete.availability });
  await db.transaction('rw', [db.athletes, db.sessions], async () => {
    await db.athletes.update(athleteId, { runWalk, updatedAt: nowIso() });
    for (const { id, session } of rebuilt) {
      await db.sessions.update(id, { title: session.title, durationMin: session.durationMin, distanceKm: session.distanceKm, steps: session.steps, why: session.why, updatedAt: nowIso() });
    }
  });
  return runWalk;
}
