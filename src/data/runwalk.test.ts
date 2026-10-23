// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Athlete, PlanRequest } from '@/engine';
import { createBlankAthlete } from './athlete';
import { SentierDB } from './db';
import { linkActivity } from './import';
import { logManual } from './log';
import { createPlan, replanActive } from './planner';
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

describe('refaire le plan avec de nouvelles dispos', () => {
  it('même objectif, séances faites gardées, progression de l’échelle conservée, nouvelles dispos appliquées', async () => {
    await createPlan(db, athlete, { request: request() }, START, START);
    await log('2026-04-21', 4);
    await log('2026-04-23', 3);
    await syncRunWalk(db, athlete.id, '2026-04-24'); // palier 5
    await db.athletes.update(athlete.id, { availability: { ...athlete.availability, runDaysPerWeek: 2, allowedDays: [3, 6] } });
    const r = await replanActive(db, athlete.id, '2026-04-24');
    expect(r.ok).toBe(true);
    const blocks = await db.blocks.toArray();
    expect(blocks.map((b) => b.status).sort()).toEqual(['actif', 'archive']);
    expect((await db.sessions.where('status').equals('faite').toArray())).toHaveLength(2);
    const future = (await db.sessions.where('date').aboveOrEqual('2026-04-24').toArray()).filter((s) => s.type === 'marche_course');
    expect(future.length).toBeGreaterThan(0);
    // 2 sorties par semaine : mercredi et samedi seulement.
    expect(new Set(future.map((s) => new Date(`${s.date}T12:00:00`).getDay()))).toEqual(new Set([3, 6]));
    expect((await db.athletes.get(athlete.id))!.runWalk!.state.stage).toBe(5);
    expect(future[0]!.title).toMatch(/2 min course/);
  });
  it('sans plan actif, ou plan refusé par le moteur : rien ne change', async () => {
    expect(await replanActive(db, athlete.id, START)).toEqual({ ok: false, warnings: [] });
    await createPlan(db, athlete, { request: request() }, START, START);
    await db.athletes.update(athlete.id, { availability: { ...athlete.availability, runDaysPerWeek: 3 } });
    const before = await db.sessions.count();
    // Un questionnaire bloquant refuse le nouveau plan.
    await db.athletes.update(athlete.id, { health: { answers: { q1: false, q2: true, q3: false, q4: false, q5: false, q6: false, q7: false, q8: false, q9: true }, answeredAt: '2026-04-01', conditions: [] } });
    const r = await replanActive(db, athlete.id, START);
    expect(r.ok).toBe(false);
    expect(r.warnings![0]!.ruleId).toBe('health.clearance');
    expect(await db.sessions.count()).toBe(before);
    expect((await db.blocks.toArray()).map((b) => b.status)).toEqual(['actif']);
  });
});
