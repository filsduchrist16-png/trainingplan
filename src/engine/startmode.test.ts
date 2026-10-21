import { describe, expect, it } from 'vitest';
import { firstStage, startMode, type StartInput } from './startmode';
import { generatePlan, type PlanRequest } from './periodization';
import { buildWeekSessions } from './scheduling';
import { RUN_WALK_LADDER } from './constants';
const runSecOf = (palier: number) => RUN_WALK_LADDER[palier - 1]!.runSec;
import type { Availability } from './types';

const base: StartInput = { experience: 'debutant', weeklyKm: 10 };

describe('capacité de course continue', () => {
  it('privilégie ce que la personne déclare, puis la plus longue sortie, puis le volume', () => {
    expect(startMode({ ...base, continuousMin: 12, longestRunKm: 5 }).capacitySource).toBe('declaree');
    expect(startMode({ ...base, longestRunKm: 3.2 })).toMatchObject({ capacitySource: 'plus_longue_sortie', capacityMin: 22 }); // 3,2 km × 7 min/km
    expect(startMode({ ...base, weeklyKm: 15 })).toMatchObject({ capacitySource: 'volume', capacityMin: 35 }); // 15 ÷ 3 × 7
    expect(startMode({ ...base, weeklyKm: 0 })).toMatchObject({ capacitySource: 'inconnue', capacityMin: 0 });
  });
  it('utilise l’allure réelle quand on connaît la forme', () => {
    expect(startMode({ ...base, longestRunKm: 5, vdot: 55 }).capacityMin).toBeLessThan(startMode({ ...base, longestRunKm: 5 }).capacityMin);
  });
});

describe('quand commence-t-on en marche-course ?', () => {
  it('jamais couru : sous 30 min continues', () => {
    expect(startMode({ ...base, experience: 'jamais', continuousMin: 25 }).runWalk).toBe(true);
    expect(startMode({ ...base, experience: 'jamais', continuousMin: 30 }).runWalk).toBe(false);
  });
  it('débutant : sous 20 min', () => {
    expect(startMode({ ...base, continuousMin: 19 }).runWalk).toBe(true);
    expect(startMode({ ...base, continuousMin: 20 }).runWalk).toBe(false);
  });
  it('le cas du test : plus longue sortie de 3,2 km (≈ 22 min)', () => {
    expect(startMode({ experience: 'jamais', weeklyKm: 0, longestRunKm: 3.2 }).runWalk).toBe(true);
    expect(startMode({ experience: 'debutant', weeklyKm: 0, longestRunKm: 3.2 }).runWalk).toBe(false);
    expect(startMode({ experience: 'debutant', weeklyKm: 0, longestRunKm: 2 }).runWalk).toBe(true);
  });
  it('régulier : seulement après une grosse pause ; avancé : jamais', () => {
    expect(startMode({ experience: 'regulier', weeklyKm: 25 }).runWalk).toBe(false);
    expect(startMode({ experience: 'regulier', weeklyKm: 0, continuousMin: 5 }).runWalk).toBe(true);
    expect(startMode({ experience: 'avance', weeklyKm: 0 }).runWalk).toBe(false);
  });
  it('information inconnue : prudence', () => {
    expect(startMode({ experience: 'debutant', weeklyKm: 0 }).runWalk).toBe(true);
  });
  it('le volume hebdo seul ne décide plus : 8 km en 2 sorties de 4 km est du continu', () => {
    expect(startMode({ experience: 'debutant', weeklyKm: 8, longestRunKm: 4 }).runWalk).toBe(false);
  });
});

describe('niveau de départ et durée', () => {
  it('le 1er intervalle vaut au plus la moitié de la capacité (palier 1 au minimum)', () => {
    expect(firstStage(0)).toBe(1);
    expect(firstStage(0.5)).toBe(1);
    expect(runSecOf(firstStage(10))).toBe(300); // 10 min → intervalles de 5 min (palier 8)
    expect(runSecOf(firstStage(16))).toBe(420); // 16 min → 7 min (palier 9)
    expect(runSecOf(firstStage(3))).toBe(90); // 3 min → 1 min 30 (palier 4)
  });
  it('on ne dépasse jamais le palier 13 (20 min continues)', () => {
    expect(firstStage(500)).toBe(13);
  });
  it('plus la capacité est grande, moins il y a de semaines de marche-course', () => {
    const none = startMode({ experience: 'jamais', weeklyKm: 0, continuousMin: 0 });
    const some = startMode({ experience: 'jamais', weeklyKm: 0, continuousMin: 20 });
    expect(none.weeksToExit).toBeGreaterThan(some.weeksToExit);
    expect(some.weeksToExit).toBeGreaterThanOrEqual(2);
    expect(startMode({ ...base, continuousMin: 40 }).weeksToExit).toBe(0);
  });
  it('explique sa décision', () => {
    expect(startMode({ experience: 'jamais', weeklyKm: 0, longestRunKm: 3.2 }).explanation.why).toMatch(/alterne course et marche/);
    expect(startMode({ ...base, continuousMin: 40 }).explanation.why).toMatch(/course continue|pas besoin/);
    expect(startMode({ experience: 'jamais', weeklyKm: 0 }).explanation.why).toMatch(/ne sait pas/);
    expect(startMode({ ...base, weeklyKm: 9 }).explanation.ruleId).toBe('start.continuous');
  });
});

describe('dans le plan', () => {
  const av: Availability = { runDaysPerWeek: 3, allowedDays: [2, 4, 6], longRunDay: 6, maxWeekdayMinutes: 60, maxWeekendMinutes: 90, strengthPerWeek: 1 };
  const req = (over: Partial<PlanRequest> = {}): PlanRequest => ({
    goal: 'route_5k', startDate: '2026-10-19', race: { date: '2027-01-23', distanceKm: 5, elevationGainM: 0 },
    experience: 'jamais', difficulty: 'equilibre', currentWeeklyKm: 0, availability: av, ...over,
  });
  const week1 = (r: PlanRequest) => {
    const p = generatePlan(r);
    const ctx = { goal: r.goal, family: p.family, availability: av, experience: r.experience, hrMaxEstimated: true, hasPoles: false, planWeek: 0, phaseWeek: 0, runWalkStage: p.start?.stage };
    return { p, titles: buildWeekSessions(p.weeks[0]!, ctx).sessions.filter((s) => s.type === 'marche_course').map((s) => s.title) };
  };

  it('jamais couru, rien de connu : intervalles de 1 min', () => {
    const { p, titles } = week1(req());
    expect(p.weeks[0]!.phase).toBe('demarrage');
    expect(titles[0]).toMatch(/30 s course \/ 1 min marche/);
    expect(p.warnings.map((w) => w.ruleId)).toContain('start.runwalk');
  });
  it('tient 10 min d’affilée : on démarre à 5 min de course, pas à 1', () => {
    const { titles } = week1(req({ experience: 'debutant', continuousMin: 10 }));
    expect(titles[0]).toMatch(/5 min course/);
  });
  it('capable de courir en continu : aucune marche-course, phase de base', () => {
    const { p, titles } = week1(req({ experience: 'debutant', continuousMin: 25, currentWeeklyKm: 10, longestRecentRunKm: 4 }));
    expect(p.weeks[0]!.phase).toBe('base');
    expect(titles).toEqual([]);
    expect(p.warnings.map((w) => w.ruleId)).toContain('start.continuous');
  });
  it('la durée de la phase de démarrage suit la capacité', () => {
    const count = (r: PlanRequest) => generatePlan(r).weeks.filter((w) => w.phase === 'demarrage').length;
    const far = { race: { date: '2027-09-25', distanceKm: 5, elevationGainM: 0 } };
    expect(count(req({ continuousMin: 0, ...far }))).toBeGreaterThan(count(req({ continuousMin: 20, ...far })));
  });
  it('courir de zéro : toujours évalué comme un premier départ', () => {
    const p = generatePlan({ goal: 'debuter', startDate: '2026-10-19', experience: 'avance', difficulty: 'prudent', currentWeeklyKm: 0, availability: av });
    expect(p.start!.runWalk).toBe(true);
  });
  it('« courir de zéro » avec déjà 40 min continues : pas de démarrage à faire, on passe à la base', () => {
    const p = generatePlan({ goal: 'debuter', startDate: '2026-10-19', experience: 'jamais', difficulty: 'prudent', currentWeeklyKm: 0, continuousMin: 40, availability: av });
    expect(p.weeks.filter((w) => w.phase === 'demarrage')).toHaveLength(0);
  });
  it('« garder la forme » : pas de verdict de marche-course', () => {
    const p = generatePlan({ goal: 'forme', startDate: '2026-10-19', durationWeeks: 6, experience: 'regulier', difficulty: 'equilibre', currentWeeklyKm: 20, availability: av });
    expect(p.warnings.map((w) => w.ruleId)).not.toContain('start.continuous');
  });
});
