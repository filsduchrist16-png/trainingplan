// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Athlete } from '@/engine';
import { createBlankAthlete } from './athlete';
import { SentierDB } from './db';
import { addShoe, setActivityShoe, setShoeActive, shoesWithKm } from './gear';
import { logManual } from './log';

let db: SentierDB;
let athlete: Athlete;
beforeEach(async () => {
  db = new SentierDB(`t-${crypto.randomUUID()}`);
  athlete = await createBlankAthlete(db);
});
afterEach(() => db.delete());

describe('équipement : km par paire', () => {
  it('km initiaux + sorties associées ; neuve = rodage, usagée = pas de rodage', async () => {
    const neuve = await addShoe(db, athlete.id, { name: ' Neuve ', initialKm: 0, terrain: 'route' });
    const usagee = await addShoe(db, athlete.id, { name: 'Usagée', model: ' Kiprun ', initialKm: 250, terrain: 'mixte', retireKm: 600 });
    expect(neuve).toMatchObject({ name: 'Neuve', breakInKm: 50, retireKm: 700, active: true });
    expect(usagee).toMatchObject({ model: 'Kiprun', breakInKm: 0, retireKm: 600 });
    await logManual(db, athlete, { date: '2026-04-21', type: 'z2_endurance', durationMin: 50, distanceKm: 8.5, rpe: 4, pains: [], shoeId: neuve.id });
    await logManual(db, athlete, { date: '2026-04-23', type: 'z2_endurance', durationMin: 50, distanceKm: 6, rpe: 4, pains: [], shoeId: neuve.id });
    await logManual(db, athlete, { date: '2026-04-25', type: 'longue_facile', durationMin: 90, distanceKm: 12, rpe: 5, pains: [], shoeId: usagee.id });
    await logManual(db, athlete, { date: '2026-04-26', type: 'z2_endurance', durationMin: 30, distanceKm: 5, rpe: 3, pains: [] });
    expect((await shoesWithKm(db, athlete.id)).map((c) => [c.shoe.name, c.km])).toEqual([['Neuve', 14.5], ['Usagée', 262]]);
  });
  it('changer la paire d’une sortie, désactiver une paire', async () => {
    const a = await addShoe(db, athlete.id, { name: 'A', initialKm: 0, terrain: 'route' });
    const b = await addShoe(db, athlete.id, { name: 'B', initialKm: 0, terrain: 'route' });
    const id = await logManual(db, athlete, { date: '2026-04-21', type: 'z2_endurance', durationMin: 50, distanceKm: 10, rpe: 4, pains: [], shoeId: a.id });
    await setActivityShoe(db, id, b.id);
    expect((await shoesWithKm(db, athlete.id)).map((c) => c.km)).toEqual([0, 10]);
    await setActivityShoe(db, id, undefined);
    expect((await shoesWithKm(db, athlete.id)).map((c) => c.km)).toEqual([0, 0]);
    await setShoeActive(db, a.id, false);
    expect((await db.shoes.get(a.id))!.active).toBe(false);
  });
});
