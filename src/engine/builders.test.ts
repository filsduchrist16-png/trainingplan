import { describe, expect, it } from 'vitest';
import {
  backToBackSecond, calibrationTest, descents, easyRun, hillSprints, longHills, longRun, measure, paceForTarget,
  raceDay, racePace, rest, runWalk, strength, strides, threshold, vo2, type BuildContext,
} from './builders';
import { trailGoalFor } from './goals';
import { sessionInfo, SESSION_LIBRARY } from './library';

const road: BuildContext = { goal: 'route_10k', trail: false, vdot: 45, phaseWeek: 0 };
const trail: BuildContext = { goal: 'trail_moyen', trail: true, vdot: 45, phaseWeek: 0, hasPoles: true };

describe('allures et mesures', () => {
  it('ordonne les allures par cible, y compris au RPE et sans VDOT', () => {
    const p = (t: Parameters<typeof paceForTarget>[0], c = road) => paceForTarget(t, c);
    expect(p({ zone: 'z1' })).toBeGreaterThan(p({ zone: 'z2' }));
    expect(p({ zone: 'z3' })).toBeGreaterThan(p({ zone: 'z4' }));
    expect(p({ zone: 'z4' })).toBeGreaterThan(p({ zone: 'z5' }));
    expect(p({ rpe: 9 })).toBeLessThan(p({ rpe: 7 }));
    expect(p({ rpe: 7 })).toBeLessThan(p({ rpe: 4 }));
    expect(p({ pace: 'M' }, { ...road, vdot: undefined })).toBeLessThan(7);
    expect(p({ zone: 'z2' }, trail)).toBeGreaterThan(p({ zone: 'z2' }));
  });
  it('compte la récup entre répétitions (trot ou marche) et les étapes en distance', () => {
    const trot = measure([{ kind: 'effort', minutes: 3, repeat: 3, target: { zone: 'z5' } }], road);
    expect(trot.minutes).toBe(15); // 9 min d'effort + 2 × 3 min de récup
    const walk = measure([{ kind: 'effort', minutes: 3, repeat: 3, target: { zone: 'z5' }, recoveryWalk: true }], road);
    expect(walk.km).toBeLessThan(trot.km);
    expect(measure([{ kind: 'effort', distanceKm: 3, target: { rpe: 10 } }], road).km).toBe(3);
  });
});

describe('séances', () => {
  it('Z2 et Z1 : 20 min minimum', () => {
    expect(easyRun(1, road).durationMin).toBe(20);
    expect(easyRun(8, road, 'z1').type).toBe('z1_recup');
  });
  it('jamais plus longues que la longue (F7) : Z2 raccourcie, strides gardées si possible, sinon facile', () => {
    expect(easyRun(8, road, 'z2', 17).durationMin).toBe(17);
    const s = strides(6, road, 25);
    expect(s.type).toBe('strides');
    expect(s.durationMin).toBeLessThanOrEqual(25);
    const tooShort = strides(6, road, 15);
    expect(tooShort.type).toBe('z2_endurance');
    expect(tooShort.durationMin).toBe(15);
  });
  it('longue arrondie à la minute', () => {
    const l = longRun(4.4, road, false);
    expect(l.durationMin).toBe(Math.floor(4.4 * paceForTarget({ zone: 'z2' }, road)));
  });
  it('strides, sprints, descentes progressent avec les semaines', () => {
    expect(strides(6, { ...road, phaseWeek: 5 }).title).toMatch(/8 strides/);
    expect(hillSprints(6, { ...road, phaseWeek: 5 }).title).toMatch(/^10 sprints/);
    expect(descents(8, { ...trail, phaseWeek: 9 }).title).toMatch(/8 descentes/);
  });
  it('seuil : léger en base, court en taper, continu en fin d’échelle', () => {
    expect(threshold({ ...road, light: true }).title).toBe('Seuil 3 × 6 min');
    expect(threshold({ ...road, taper: true }).title).toBe('Seuil 2 × 8 min');
    expect(threshold({ ...road, phaseWeek: 9 }).title).toBe('Seuil continu 25 min');
    expect(threshold(trail).steps[1]!.target).toEqual({ zone: 'z4' });
  });
  it('VO2max : 30/30, version taper, en côte en trail', () => {
    expect(vo2({ ...road, phaseWeek: 3 }).title).toBe('VO2max 12 × 30/30');
    expect(vo2({ ...road, taper: true }).title).toBe('VO2max 4 × 2 min');
    expect(vo2(trail).title).toMatch(/en côte/);
  });
  it('côtes longues : version légère, taper, bâtons en spécifique', () => {
    expect(longHills({ ...trail, light: true }).title).toBe('Côtes longues 4 × 3 min');
    expect(longHills({ ...trail, taper: true }).title).toBe('Côtes longues 3 × 4 min');
    expect(longHills(trail).steps[1]!.note).toMatch(/Bâtons/);
    expect(longHills({ ...trail, hasPoles: false }).steps[1]!.note).not.toMatch(/Bâtons/);
  });
  it('allure course selon l’objectif', () => {
    expect(racePace({ ...road, goal: 'route_marathon' }).steps[1]!.target).toEqual({ pace: 'M' });
    expect(racePace({ ...road, goal: 'route_5k' }).steps[1]!.target).toEqual({ pace: 'I' });
    expect(racePace({ ...road, taper: true }).title).toBe('Allure course 2 × 5 min');
    expect(racePace(trail).title).toMatch(/Effort course/);
    expect(racePace({ ...trail, taper: true }).title).toBe('Effort course 2 × 6 min');
  });
  it('longues : facile, spécifique trail et route, gut training au-delà de 75 min', () => {
    const easy = longRun(20, road, false);
    expect(easy.type).toBe('longue_facile');
    expect(easy.steps[0]!.note).toMatch(/Gut training/);
    expect(longRun(5, road, false).steps[0]!.note).not.toMatch(/Gut/);
    expect(longRun(5, road, false).title).toMatch(/min$/);
    const spec = longRun(25, trail, true, 900);
    expect(spec.type).toBe('longue_specifique');
    expect(spec.steps[2]!.note).toMatch(/Gut/);
    expect(longRun(25, { ...road, goal: 'route_marathon' }, true).steps[1]!.target).toEqual({ pace: 'M' });
    expect(longRun(3, { ...road, goal: 'route_marathon' }, true).steps[2]!.note).toBeUndefined();
    expect(longRun(3, trail, true).steps[2]!.note).toBeUndefined();
  });
  it('back-to-back, marche-course, test, course, muscu, repos', () => {
    expect(backToBackSecond(103, trail).durationMin).toBe(105);
    expect(runWalk(1, { ...road, vdot: undefined }).title).toBe('Marche-course 14 × (30 s course / 1 min marche)');
    expect(runWalk(4, road).title).toBe('Marche-course 8 × (1 min 30 course / 1 min marche)');
    expect(calibrationTest(road).type).toBe('test');
    expect(raceDay(43, trail).distanceKm).toBe(43);
    expect(strength('plyo', 45).durationMin).toBe(20);
    expect(strength('muscu_trail', 45).durationMin).toBe(45);
    expect(rest().durationMin).toBe(0);
  });
});

describe('bibliothèque', () => {
  it('chaque type a une fiche complète', () => {
    for (const [type, info] of Object.entries(SESSION_LIBRARY)) {
      expect(sessionInfo(type as keyof typeof SESSION_LIBRARY)).toBe(info);
      for (const field of [info.prescription, info.adaptations, info.why, info.signWorks, info.classicMistake, info.oneLiner]) expect(field.length).toBeGreaterThan(5);
    }
  });
  it('devine l’objectif trail', () => {
    expect(trailGoalFor(20)).toBe('trail_court');
    expect(trailGoalFor(43)).toBe('trail_moyen');
    expect(trailGoalFor(80)).toBe('ultra');
  });
});
