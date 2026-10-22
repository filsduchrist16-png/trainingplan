// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Athlete } from '@/engine';
import { createBlankAthlete } from './athlete';
import { SentierDB } from './db';
import { stamp } from './ids';
import { lastSets, saveStrengthSession } from './strength';

let db: SentierDB;
let athlete: Athlete;
beforeEach(async () => {
  db = new SentierDB(`t-${crypto.randomUUID()}`);
  athlete = await createBlankAthlete(db);
});
afterEach(() => db.delete());

describe('muscu : journal', () => {
  it('garde les séries, coche la séance prévue, et retrouve la dernière séance de chaque exercice', async () => {
    const session = stamp({ athleteId: athlete.id, weekId: 'w', date: '2026-04-21', type: 'muscu_generale' as const, title: 'Muscu', durationMin: 45, steps: [], isKey: false, why: '', status: 'prevue' as const, adjustments: [] });
    await db.sessions.add(session);
    expect(await lastSets(db, athlete.id, 'goblet')).toEqual([]);
    await saveStrengthSession(db, athlete, { date: '2026-04-21', plannedSessionId: session.id, program: 'Muscu générale', sets: [{ exerciseId: 'goblet', reps: 10, loadKg: 16, rpe: 7 }, { exerciseId: 'goblet', reps: 9, loadKg: 16 }, { exerciseId: 'plank', reps: 4 }], notes: 'bien' });
    expect((await db.sessions.get(session.id))!.status).toBe('faite');
    await saveStrengthSession(db, athlete, { date: '2026-04-28', program: 'Muscu générale', sets: [{ exerciseId: 'goblet', reps: 12, loadKg: 18 }] });
    expect(await lastSets(db, athlete.id, 'goblet')).toEqual([{ reps: 12, loadKg: 18 }]);
    expect(await lastSets(db, athlete.id, 'plank')).toEqual([{ reps: 4 }]);
    expect(await lastSets(db, athlete.id, 'rdl')).toEqual([]);
    expect(await db.strengthSessions.count()).toBe(2);
  });
});
