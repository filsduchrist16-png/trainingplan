// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Athlete } from '@/engine';
import { createBlankAthlete } from './athlete';
import { SentierDB } from './db';
import { checkRoutine, preventionChecks, uncheckRoutine } from './prevention';

let db: SentierDB;
let athlete: Athlete;
beforeEach(async () => {
  db = new SentierDB(`t-${crypto.randomUUID()}`);
  athlete = await createBlankAthlete(db);
});
afterEach(() => db.delete());

describe('prévention : journal', () => {
  it('une coche par jour et par routine, décochable, filtrée par date', async () => {
    await checkRoutine(db, athlete.id, 'mollets', '2026-10-20');
    await checkRoutine(db, athlete.id, 'mollets', '2026-10-20');
    await checkRoutine(db, athlete.id, 'hanches', '2026-10-20');
    await checkRoutine(db, athlete.id, 'mollets', '2026-10-01');
    expect(await preventionChecks(db, athlete.id, '2026-10-19')).toHaveLength(2);
    await uncheckRoutine(db, athlete.id, 'mollets', '2026-10-20');
    expect((await preventionChecks(db, athlete.id, '2026-10-19')).map((c) => c.routine)).toEqual(['hanches']);
    expect(await preventionChecks(db, athlete.id, '2026-09-01')).toHaveLength(2);
  });
});
