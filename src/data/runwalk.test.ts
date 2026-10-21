// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Athlete, PlanRequest } from '@/engine';
import { createBlankAthlete } from './athlete';
import { SentierDB } from './db';
import { linkActivity } from './import';
import { logManual } from './log';
import { createPlan } from './planner';
import { syncRunWalk } from './runwalk';
import { stamp } from './ids';

let db: SentierDB;
let athlete: Athlete;
beforeEach(async () => {
  db = new SentierDB(`t-${crypto.randomUUID()}`);
  athlete = await createBlankAthlete(db);
});
afterEach(() => db.delete());

const START = '2026-04-20'; // lundi ; séances mardi, jeudi, samedi
const request = (over: Partial<PlanRequest> = {}): PlanRequest => ({
  goal: 'debuter', startDate: START, experience: 'jamais', difficulty: 'prudent', currentWeeklyKm: 0, continuousMin: 3, availability: athlete.availability, ...over,
});
const sessionOn = (date: string) => db.sessions.where('date').equals(date).filter((s) => s.type === 'marche_course').first();
async function log(date: string, rpe: number, completed = true) {
  const s = (await sessionOn(date))!;
  await logManual(db, (await db.athletes.get(athlete.id))!, { date, sessionId: s.id, type: 'marche_course', durationMin: s.durationMin, rpe, completed, pains: [] });
}

describe('T7 — l’échelle suit le réalisé', () => {
  it('le plan enregistre l’état d’entrée, et l’athlète part de là', async () => {
    await createPlan(db, athlete, { request: request() }, START, START);
    const block = (await db.blocks.toArray())[0]!;
    expect(block.runWalkStart!.stage).toBe(4); // < 5 min d'affilée → palier 4 (1 min 30 / 1 min)
    expect((await db.athletes.get(athlete.id))!.runWalk!.state.stage).toBe(4);
  });

  it('2 séances validées → la séance suivante passe au palier suivant, avec l’explication', async () => {
    await createPlan(db, athlete, { request: request() }, START, START);
    // Sans réalisé, le plan projette déjà le palier 5 le samedi ; on vérifie que c'est le RÉALISÉ qui décide.
    await log('2026-04-21', 4);
    await log('2026-04-23', 3);
    const rw = await syncRunWalk(db, athlete.id, '2026-04-24');
    expect(rw!.state).toMatchObject({ stage: 5, validatedAtStage: 0 });
    expect(rw!.last!.ruleId).toBe('runwalk.advance');
    expect((await sessionOn('2026-04-25'))!.title).toMatch(/2 min course/);
    expect((await db.athletes.get(athlete.id))!.runWalk!.state.stage).toBe(5);
  });

  it('séance à RPE 8 → palier répété, séances suivantes re-projetées', async () => {
    await createPlan(db, athlete, { request: request() }, START, START);
    await log('2026-04-21', 4);
    await log('2026-04-23', 8);
    const rw = await syncRunWalk(db, athlete.id, '2026-04-24');
    expect(rw!.state.stage).toBe(4);
    expect(rw!.last!.ruleId).toBe('runwalk.repeat');
    expect((await sessionOn('2026-04-25'))!.title).toMatch(/1 min 30 course/);
    // Plus loin dans le plan, tout est décalé d'autant : mardi suivant = palier 4 validé une fois → toujours 4.
    expect((await sessionOn('2026-04-28'))!.title).toMatch(/1 min 30 course/);
  });

  it('intervalles pas tous faits → pas de validation', async () => {
    await createPlan(db, athlete, { request: request() }, START, START);
    await log('2026-04-21', 4, false);
    await log('2026-04-23', 4);
    const rw = await syncRunWalk(db, athlete.id, '2026-04-24');
    expect(rw!.state).toMatchObject({ stage: 4, validatedAtStage: 1 });
  });

  it('séance importée sans RPE : on répète ; le RPE noté plus tard la fait compter', async () => {
    await createPlan(db, athlete, { request: request() }, START, START);
    await log('2026-04-21', 4);
    const s = (await sessionOn('2026-04-23'))!;
    const activityId = 'imp-1';
    await db.activities.add(stamp({ athleteId: athlete.id, source: 'fit' as const, fingerprint: 'f', sport: 'course' as const, startTime: '2026-04-23T07:00:00Z', date: '2026-04-23', durationSec: 1800, distanceKm: 4, elevationGainM: 0, elevationLossM: 0, load: 30 }, activityId));
    await linkActivity(db, s.id, activityId);
    expect((await syncRunWalk(db, athlete.id, '2026-04-24'))!.state).toMatchObject({ stage: 4, validatedAtStage: 1 });
    await db.subjectives.add(stamp({ athleteId: athlete.id, date: '2026-04-23', activityId, rpe: 4, completed: true, pains: [], context: [] }));
    expect((await syncRunWalk(db, athlete.id, '2026-04-24'))!.state.stage).toBe(5);
  });

  it('sans démarrage : rien à suivre', async () => {
    await createPlan(db, athlete, { request: request({ goal: 'route_10k', experience: 'regulier', currentWeeklyKm: 30, continuousMin: 60, race: { date: '2026-09-12', distanceKm: 10, elevationGainM: 0 } }) }, START, START);
    expect(await syncRunWalk(db, athlete.id, '2026-04-24')).toBeUndefined();
    expect((await db.athletes.get(athlete.id))!.runWalk).toBeUndefined();
  });
});
