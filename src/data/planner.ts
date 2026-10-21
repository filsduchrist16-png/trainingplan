import {
  addDays, buildWeekSessions, generatePlan, generateRecovery, mondayOf, weeklySummaries, GOALS,
  type Athlete, type Block, type GoalKind, type ISODate, type PlannedSession, type PlanRequest, type Race, type Week, type WeekPlan,
} from '@/engine';
import type { SentierDB } from './db';
import { newId, nowIso, stamp } from './ids';

/** Point de départ réel tiré de l'historique (pré-remplit l'assistant « Nouvel objectif »). */
export async function startingPoint(db: SentierDB, athleteId: string, today: ISODate): Promise<{ currentWeeklyKm: number; recentWeeksKm: number[]; longestRecentRunKm: number; hasHistory: boolean }> {
  const from = addDays(mondayOf(today), -28);
  const acts = await db.activities.where('date').between(from, today, true, true).filter((a) => a.athleteId === athleteId).toArray();
  const weeks = weeklySummaries(acts, from, addDays(mondayOf(today), -7));
  const recentWeeksKm = weeks.map((w) => Math.round(w.km));
  const runs = acts.filter((a) => a.sport === 'course' || a.sport === 'trail');
  return {
    currentWeeklyKm: recentWeeksKm.at(-1) ?? 0,
    recentWeeksKm: recentWeeksKm.slice(0, -1),
    longestRecentRunKm: Math.round(Math.max(0, ...runs.map((a) => a.distanceKm)) * 10) / 10,
    hasHistory: runs.length > 0,
  };
}

export interface NewGoalInput {
  request: PlanRequest;
  raceName?: string;
  raceLocation?: string;
  raceTerrain?: Race['terrain'];
  /** Course existante (sinon créée si `request.race`). */
  raceId?: string;
}

/** Index de la semaine dans sa phase (fait progresser les intervalles). */
export function phaseWeekIndex(weeks: Pick<WeekPlan, 'phase'>[], i: number): number {
  let k = i;
  while (k > 0 && weeks[k - 1]!.phase === weeks[i]!.phase) k--;
  return i - k;
}

/**
 * Crée un plan complet : course (si besoin), bloc, semaines, séances.
 * L'ancien bloc actif est archivé ; ses séances futures non faites sont retirées (l'historique reste).
 */
export async function createPlan(
  db: SentierDB,
  athlete: Athlete,
  input: NewGoalInput,
  today: ISODate,
  /** Planifier à partir de cette date (par défaut : aujourd'hui). La démo planifie aussi le passé. */
  planFrom: ISODate = today,
): Promise<{ blockId: string; ok: boolean; warnings: Block['warnings'] }> {
  const req = input.request;
  const draft = generatePlan(req);
  if (!draft.ok) return { blockId: '', ok: false, warnings: draft.warnings };

  const blockId = newId();
  const profile = GOALS[req.goal as GoalKind];
  let raceId = input.raceId;
  const races: Race[] = [];
  if (!raceId && req.race) {
    const race: Race = stamp({
      athleteId: athlete.id,
      name: input.raceName || profile.label,
      date: req.race.date,
      distanceKm: req.race.distanceKm,
      elevationGainM: req.race.elevationGainM,
      terrain: input.raceTerrain ?? (draft.family === 'trail' ? 'sentier' : 'route'),
      priority: 'A',
      intent: 'finir',
      ...(input.raceLocation ? { location: input.raceLocation } : {}),
    });
    races.push(race);
    raceId = race.id;
  }

  const block: Block = stamp(
    {
      athleteId: athlete.id,
      goal: req.goal,
      ...(raceId ? { raceId } : {}),
      name: input.raceName || profile.label,
      startDate: draft.weeks[0]!.startDate,
      endDate: addDays(draft.weeks.at(-1)!.startDate, 6),
      status: 'actif',
      difficulty: req.difficulty,
      startVolumeKm: req.currentWeeklyKm,
      peakVolumeKm: draft.peakKm,
      warnings: draft.warnings,
      request: req,
    },
    blockId,
  );

  const weeks: Week[] = [];
  const sessions: PlannedSession[] = [];
  draft.weeks.forEach((w, i) => {
    const week: Week = stamp({
      athleteId: athlete.id,
      blockId,
      index: w.index,
      startDate: w.startDate,
      phase: w.phase,
      kind: w.kind,
      targetKm: w.targetKm,
      targetElevationM: w.targetElevationM,
      keySessions: w.keySessions,
      longRunKm: w.longRunKm,
      notes: w.notes,
      ...(w.raceDate ? { raceDate: w.raceDate } : {}),
      ...(w.bRaceDate ? { bRaceDate: w.bRaceDate } : {}),
    });
    weeks.push(week);
    const bRace = req.bRaces?.find((b) => b.date === w.bRaceDate);
    const { sessions: drafts, notes } = buildWeekSessions(w, {
      goal: req.goal,
      family: draft.family,
      availability: req.availability,
      experience: req.experience,
      vdot: req.vdot,
      hrMaxEstimated: athlete.hrMaxSource === 'estimee',
      hasPoles: athlete.hasPoles,
      planWeek: i,
      phaseWeek: phaseWeekIndex(draft.weeks, i),
      ...(req.race ? { race: { date: req.race.date, distanceKm: req.race.distanceKm } } : {}),
      ...(bRace ? { bRace: { date: bRace.date, distanceKm: bRace.distanceKm } } : {}),
      fromDate: planFrom,
    });
    if (notes.length) week.notes = [...(week.notes ?? []), ...notes];
    for (const d of drafts) sessions.push(stamp({ ...d, athleteId: athlete.id, weekId: week.id, status: 'prevue' as const, adjustments: [] }));
  });

  await persist(db, athlete.id, today, block, weeks, sessions, races);
  return { blockId, ok: true, warnings: draft.warnings };
}

/** Archive le bloc actif (séances futures non faites retirées) et enregistre le nouveau. */
async function persist(db: SentierDB, athleteId: string, today: ISODate, block: Block, weeks: Week[], sessions: PlannedSession[], races: Race[] = []) {
  await db.transaction('rw', [db.blocks, db.weeks, db.sessions, db.races], async () => {
    const actives = await db.blocks.where('status').equals('actif').filter((b) => b.athleteId === athleteId).toArray();
    for (const old of actives) {
      await db.blocks.update(old.id, { status: 'archive', updatedAt: nowIso() });
      const oldWeeks = await db.weeks.where('blockId').equals(old.id).primaryKeys();
      await db.sessions.where('weekId').anyOf(oldWeeks).filter((s) => s.date >= today && s.status === 'prevue').delete();
    }
    await db.races.bulkAdd(races);
    await db.blocks.add(block);
    await db.weeks.bulkAdd(weeks);
    await db.sessions.bulkAdd(sessions);
  });
}

/** Récupération après une course A : 1 à 3 semaines faciles, puis l'app propose un nouvel objectif. */
export async function createRecoveryPlan(db: SentierDB, athlete: Athlete, race: Pick<Race, 'date' | 'distanceKm' | 'name'>, peakKm: number, today: ISODate): Promise<string> {
  const plan = generateRecovery(race, peakKm);
  const blockId = newId();
  const block: Block = stamp({
    athleteId: athlete.id, goal: 'forme', name: `Récupération : ${race.name}`, startDate: plan[0]!.startDate, endDate: addDays(plan.at(-1)!.startDate, 6),
    status: 'actif', difficulty: 'prudent', startVolumeKm: plan[0]!.targetKm, peakVolumeKm: plan.at(-1)!.targetKm,
  }, blockId);
  const weeks: Week[] = [];
  const sessions: PlannedSession[] = [];
  plan.forEach((w, i) => {
    const week: Week = stamp({ athleteId: athlete.id, blockId, index: i, startDate: w.startDate, phase: w.phase, kind: w.kind, targetKm: w.targetKm, targetElevationM: 0, keySessions: 0, longRunKm: w.longRunKm, notes: w.notes });
    weeks.push(week);
    const { sessions: drafts } = buildWeekSessions(w, {
      goal: 'forme', family: 'forme', availability: athlete.availability, experience: athlete.experience, vdot: athlete.vdot,
      hrMaxEstimated: false, hasPoles: athlete.hasPoles, planWeek: i, phaseWeek: i, fromDate: today,
    });
    for (const d of drafts) sessions.push(stamp({ ...d, athleteId: athlete.id, weekId: week.id, status: 'prevue' as const, adjustments: [] }));
  });
  await persist(db, athlete.id, today, block, weeks, sessions);
  return blockId;
}
