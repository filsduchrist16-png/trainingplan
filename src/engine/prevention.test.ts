import { describe, expect, it } from 'vitest';
import { ROUTINES, ROUTINE_FOR_ZONE, bodyMap, preventionPlan } from './prevention';

const TODAY = '2026-10-22'; // jeudi ; semaine du 2026-10-19

describe('plan de prévention', () => {
  it('routines de base : mollets 2×/sem, hanches 2×/sem, chevilles 3×/sem', () => {
    const p = preventionPlan([], TODAY, []);
    expect(p.map((i) => i.routine.id)).toEqual(['mollets', 'hanches', 'chevilles']);
    expect(p.map((i) => i.remaining)).toEqual([2, 2, 3]);
    expect(p.every((i) => !i.targeted && i.advice.ruleId === 'prevention.due')).toBe(true);
    expect(p[0]!.advice.why).toContain('10 min');
  });
  it('compte les jours cochés cette semaine seulement, un jour compte une fois', () => {
    const checks = [{ date: '2026-10-19', routine: 'mollets' }, { date: '2026-10-19', routine: 'mollets' }, { date: '2026-10-21', routine: 'mollets' }, { date: '2026-10-14', routine: 'hanches' }];
    const p = preventionPlan(checks, TODAY, []);
    expect(p[0]).toMatchObject({ done: 2, remaining: 0, advice: { ruleId: 'prevention.done' } });
    expect(p[1]).toMatchObject({ done: 0, remaining: 2 });
  });
  it('une douleur récente ajoute la routine ciblée, une ancienne ou nulle non', () => {
    const p = preventionPlan([], TODAY, [{ zone: 'tibia_d', intensity: 3, date: '2026-10-18' }, { zone: 'genou_g', intensity: 4, date: '2026-08-01' }, { zone: 'dos', intensity: 0, date: '2026-10-20' }]);
    expect(p.map((i) => i.routine.id)).toEqual(['mollets', 'hanches', 'chevilles', 'tibias']);
    expect(p[3]).toMatchObject({ targeted: true, advice: { ruleId: 'prevention.targeted' } });
    expect(p[3]!.advice.why).toContain('une douleur ou d’une blessure récente'.replace('’', "'"));
  });
  it('une blessure non résolue cible sa routine ; la routine de base ciblée ne double pas', () => {
    const p = preventionPlan([], TODAY, [{ zone: 'soleaire_g', intensity: 2, date: TODAY }], [{ zone: 'achille_g', status: 'dormante' }, { zone: 'genou_d', status: 'resolue' }]);
    expect(p.map((i) => i.routine.id)).toEqual(['mollets', 'hanches', 'chevilles', 'achille']);
    expect(p[0]!.targeted).toBe(true);
    expect(preventionPlan([{ date: TODAY, routine: 'achille' }], TODAY, [], [{ zone: 'achille_d', status: 'active' }]).find((i) => i.routine.id === 'achille')).toMatchObject({ done: 1, remaining: 2 });
  });
  it('chaque zone a sa routine, et chaque routine existe', () => {
    for (const id of Object.values(ROUTINE_FOR_ZONE)) expect(ROUTINES[id], id).toBeDefined();
    for (const r of Object.values(ROUTINES)) expect(r.steps.length).toBeGreaterThan(0);
  });
});

describe('carte corporelle', () => {
  it('niveau selon la douleur la plus forte des 28 derniers jours', () => {
    const map = bodyMap([
      { zone: 'tibia_d', intensity: 2, date: '2026-10-20' }, { zone: 'tibia_d', intensity: 4, date: '2026-10-21' },
      { zone: 'genou_g', intensity: 7, date: '2026-10-01' }, { zone: 'achille_g', intensity: 1, date: '2026-10-22' },
      { zone: 'dos', intensity: 5, date: '2026-08-01' }, { zone: 'pied_d', intensity: 0, date: '2026-10-22' },
    ], TODAY);
    const by = Object.fromEntries(map.map((z) => [z.zone, z]));
    expect(by.tibia_d).toMatchObject({ level: 2, max: 4, count: 2, last: '2026-10-21' });
    expect(by.genou_g).toMatchObject({ level: 3, max: 7 });
    expect(by.achille_g).toMatchObject({ level: 1 });
    expect(by.dos).toMatchObject({ level: 0, count: 0 });
    expect(by.dos!.last).toBeUndefined();
    expect(by.pied_d!.level).toBe(0);
    expect(map.some((z) => (z.zone as string) === 'autre')).toBe(false);
    expect(map).toHaveLength(15);
  });
});
