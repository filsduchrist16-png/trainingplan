// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { carbsPerHour, gutPlan, type Athlete } from '@/engine';
import { createBlankAthlete } from './athlete';
import { SentierDB } from './db';
import { addNutritionLog, nutritionLogs } from './nutrition';

let db: SentierDB;
let athlete: Athlete;
beforeEach(async () => {
  db = new SentierDB(`t-${crypto.randomUUID()}`);
  athlete = await createBlankAthlete(db);
});
afterEach(() => db.delete());

describe('journal de tolérance', () => {
  it('enregistre les glucides pris, retrouve les g/h et alimente le gut training', async () => {
    await addNutritionLog(db, athlete.id, { date: '2026-04-11', durationMin: 120, carbsG: 100, fluidMl: 800, giTolerance: 1, tempC: 18, notes: 'ok' });
    await addNutritionLog(db, athlete.id, { date: '2026-04-04', durationMin: 90, carbsG: 45, giTolerance: 0, product: { name: 'Gel', carbsG: 25 } });
    const logs = await nutritionLogs(db, athlete.id);
    expect(logs.map((l) => l.date)).toEqual(['2026-04-04', '2026-04-11']);
    expect(logs.map(carbsPerHour)).toEqual([30, 50]);
    expect(logs[1]).toMatchObject({ fluidMl: 800, tempC: 18, notes: 'ok', giTolerance: 1 });
    expect(logs[0]!.products[0]!.count).toBeCloseTo(1.8);
    expect(gutPlan(logs, 240)).toMatchObject({ tolerated: 50, next: 60 });
  });
});
