// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Athlete } from '@/engine';
import { createBlankAthlete } from './athlete';
import { SentierDB } from './db';
import { logManual } from './log';
import { milestones, recentMilestoneRows, syncMilestones } from './milestones';

let db: SentierDB;
let athlete: Athlete;
beforeEach(async () => {
  db = new SentierDB(`t-${crypto.randomUUID()}`);
  athlete = await createBlankAthlete(db);
});
afterEach(() => db.delete());

describe('jalons : journal', () => {
  it('un log qui franchit un cap enregistre le jalon, une seule fois', async () => {
    await logManual(db, athlete, { date: '2026-10-20', type: 'z2_endurance', durationMin: 40, distanceKm: 5.3, rpe: 4, pains: [] });
    const rows = await milestones(db, athlete.id);
    expect(rows.map((m) => m.key).sort()).toEqual(['continuous-30', 'first-5k', 'first-run']);
    expect(rows.find((m) => m.key === 'first-5k')).toMatchObject({ date: '2026-10-20', value: 5.3, title: 'Premier 5 km' });
    expect(await syncMilestones(db, athlete.id)).toEqual([]); // idempotent
    await logManual(db, athlete, { date: '2026-10-22', type: 'z2_endurance', durationMin: 60, distanceKm: 10.6, rpe: 5, pains: [] });
    expect((await milestones(db, athlete.id)).map((m) => m.key)).toEqual(expect.arrayContaining(['first-10k', 'longest-10']));
    expect(await db.milestones.count()).toBe(5);
  });
  it('récents : seulement les 7 derniers jours', async () => {
    await logManual(db, athlete, { date: '2026-10-01', type: 'z2_endurance', durationMin: 20, distanceKm: 3, rpe: 4, pains: [] });
    await logManual(db, athlete, { date: '2026-10-21', type: 'z2_endurance', durationMin: 60, distanceKm: 10.2, rpe: 5, pains: [] });
    const recent = await recentMilestoneRows(db, athlete.id, '2026-10-22');
    expect(recent.map((m) => m.key)).toEqual(expect.arrayContaining(['first-5k', 'first-10k']));
    expect(recent.some((m) => m.key === 'first-run')).toBe(false);
  });
  it('pas de course à pied : aucun jalon', async () => {
    await logManual(db, athlete, { date: '2026-10-20', type: 'croise', durationMin: 60, distanceKm: 20, rpe: 4, pains: [] });
    expect(await milestones(db, athlete.id)).toEqual([]);
  });
});
