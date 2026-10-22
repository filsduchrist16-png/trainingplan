import { describe, expect, it } from 'vitest';
import { PRODUCT_PRESETS, carbTarget, carboLoading, carboLoadingStatus, carbsPerHour, gutPlan, racePlan, toleranceByLevel } from './nutrition';
import type { NutritionLog } from './types';

const log = (date: string, carbsG: number, durationMin: number, giTolerance: NutritionLog['giTolerance']): NutritionLog => ({
  id: date, athleteId: 'a', createdAt: '', updatedAt: '', date, durationMin, giTolerance, products: [{ product: { name: 'Gel', carbsG: 25 }, count: carbsG / 25 }],
});

describe('cible de glucides', () => {
  it('0 sous 1 h, 60 g/h jusqu’à 2 h 30, 90 g/h au-delà', () => {
    expect([30, 60, 61, 150, 151, 480].map(carbTarget)).toEqual([0, 0, 60, 60, 90, 90]);
  });
  it('glucides par heure d’une sortie', () => {
    expect(carbsPerHour(log('2026-04-01', 75, 90, 0))).toBe(50);
    expect(carbsPerHour({ products: [], durationMin: 0 })).toBe(0);
  });
});

describe('gut training', () => {
  it('rien à faire sous 1 h', () => {
    expect(gutPlan([], 45)).toMatchObject({ next: 0, goal: 0, explanation: { ruleId: 'gut.none' } });
  });
  it('départ à 30 g/h, plafonné à l’objectif de course', () => {
    expect(gutPlan([], 240)).toMatchObject({ next: 30, goal: 90, tolerated: 0, explanation: { ruleId: 'gut.start' } });
    expect(gutPlan([], 120).goal).toBe(60);
    // Sorties trop courtes : pas un test digestif.
    expect(gutPlan([log('2026-04-01', 25, 60, 4)], 240).explanation.ruleId).toBe('gut.start');
  });
  it('bien toléré → +10 g/h ; au-delà de 60 g/h : mélange glucose et fructose', () => {
    const up = gutPlan([log('2026-04-01', 75, 90, 0)], 240); // 50 g/h
    expect(up).toMatchObject({ next: 60, tolerated: 50, explanation: { ruleId: 'gut.up' } });
    expect(up.explanation.why).toContain('fructose');
    expect(gutPlan([log('2026-04-01', 50, 90, 1)], 240).explanation.why).not.toContain('fructose'); // 33 g/h → 43
  });
  it('objectif atteint', () => {
    const g = gutPlan([log('2026-04-01', 90, 90, 1)], 120); // 60 g/h, objectif 60
    expect(g).toMatchObject({ next: 60, explanation: { ruleId: 'gut.goal' } });
  });
  it('un peu d’inconfort → on garde ; trop d’inconfort → on redescend, jamais sous le départ', () => {
    expect(gutPlan([log('2026-04-01', 75, 90, 2)], 240)).toMatchObject({ next: 50, explanation: { ruleId: 'gut.hold' } });
    expect(gutPlan([log('2026-04-01', 90, 90, 4)], 240)).toMatchObject({ next: 50, explanation: { ruleId: 'gut.down', severity: 'conseil' } });
    expect(gutPlan([log('2026-04-01', 45, 90, 5)], 240).next).toBe(30);
  });
  it('seule la dernière sortie décide ; le niveau toléré garde le meilleur résultat sans inconfort', () => {
    const g = gutPlan([log('2026-04-01', 75, 90, 0), log('2026-04-08', 90, 90, 4)], 240);
    expect(g.tolerated).toBe(50);
    expect(g.explanation.ruleId).toBe('gut.down');
  });
  it('tolérance moyenne par tranche de 20 g/h', () => {
    const b = toleranceByLevel([log('2026-04-01', 30, 90, 0), log('2026-04-02', 75, 90, 1), log('2026-04-03', 75, 90, 2), log('2026-04-04', 100, 90, 4), log('2026-04-05', 100, 40, 5)]);
    expect(b).toEqual([{ from: 20, logs: 1, avgTolerance: 0 }, { from: 40, logs: 2, avgTolerance: 1.5 }, { from: 60, logs: 1, avgTolerance: 4 }]);
  });
});

describe('plan de course', () => {
  it('une prise toutes les 30 min, la quantité vise la cible', () => {
    const p = racePlan({ durationMin: 240, carbsPerH: 60, product: PRODUCT_PRESETS.gel! });
    expect(p.schedule[0]).toEqual({ atMin: 30, product: 'Gel', count: 1, carbsG: 25 });
    expect(p.schedule.at(-1)!.atMin).toBe(210);
    expect(p.totalCarbsG).toBeGreaterThanOrEqual(60 * 3.5 - 25);
    expect(p.totalCarbsG).toBeLessThanOrEqual(60 * 3.5 + 25);
    expect(p.fluidMlPerH).toBe(550);
    expect(p.totalFluidMl).toBe(2200);
    expect(p.notes.map((n) => n.ruleId)).toEqual(['fuel.golden']); // le gel de base est déjà glucose et fructose
    expect(racePlan({ durationMin: 240, carbsPerH: 60, product: PRODUCT_PRESETS.barre! }).notes.map((n) => n.ruleId)).toEqual(['fuel.golden', 'fuel.dual']);
  });
  it('30 g/h avec des gels de 25 g : un gel toutes les 50 min environ, jamais une demi-dose', () => {
    const p = racePlan({ durationMin: 240, carbsPerH: 30, product: PRODUCT_PRESETS.gel! });
    expect(p.schedule.every((i) => i.count === 1)).toBe(true);
    expect(p.schedule[0]!.atMin).toBe(60); // rien à la 30e minute : 15 g ne font pas un gel
    expect(p.schedule.length).toBeGreaterThanOrEqual(3);
  });
  it('produit glucose et fructose : pas d’avertissement ; 90 g/h demande plusieurs prises', () => {
    const p = racePlan({ durationMin: 300, carbsPerH: 90, product: PRODUCT_PRESETS.melange! });
    expect(p.notes.map((n) => n.ruleId)).not.toContain('fuel.dual');
    expect(p.schedule.every((i) => i.count >= 1)).toBe(true);
    expect(racePlan({ durationMin: 300, carbsPerH: 90, product: { name: 'x', carbsG: 25, fructoseRatio: 0.2 } }).notes.map((n) => n.ruleId)).toContain('fuel.dual');
  });
  it('chaleur : plus de liquide et de sodium ; froid : moins', () => {
    const hot = racePlan({ durationMin: 120, carbsPerH: 60, tempC: 28, product: PRODUCT_PRESETS.gel! });
    expect(hot).toMatchObject({ fluidMlPerH: 750, sodiumMgPerH: 700 });
    expect(hot.notes.map((n) => n.ruleId)).toContain('fuel.hot');
    expect(racePlan({ durationMin: 120, carbsPerH: 60, tempC: 5, product: PRODUCT_PRESETS.gel! })).toMatchObject({ fluidMlPerH: 400, sodiumMgPerH: 400 });
  });
  it('longue course sans glucides : avertissement ; sans glucides et courte : rien à planifier', () => {
    expect(racePlan({ durationMin: 240, carbsPerH: 0, product: PRODUCT_PRESETS.gel! }).notes.map((n) => n.ruleId)).toContain('fuel.none');
    const short = racePlan({ durationMin: 45, carbsPerH: -5, product: PRODUCT_PRESETS.gel! });
    expect(short.schedule).toEqual([]);
    expect(short.carbsPerH).toBe(0);
  });
  it('caféine : dernier tiers d’une course de 3 h et plus, avec le poids', () => {
    const p = racePlan({ durationMin: 360, carbsPerH: 60, weightKg: 70, caffeine: true, product: PRODUCT_PRESETS.gel! });
    expect(p).toMatchObject({ caffeineMg: 210, caffeineAtMin: 240 });
    expect(p.notes.map((n) => n.ruleId)).toContain('fuel.caffeine');
    expect(racePlan({ durationMin: 120, carbsPerH: 60, weightKg: 70, caffeine: true, product: PRODUCT_PRESETS.gel! }).caffeineMg).toBeUndefined();
    expect(racePlan({ durationMin: 360, carbsPerH: 60, caffeine: true, product: PRODUCT_PRESETS.gel! }).caffeineMg).toBeUndefined();
  });
});

describe('carbo-loading', () => {
  it('plus de 90 min : 8 g/kg pendant 2 jours', () => {
    const c = carboLoading('2026-10-24', 240, 70);
    expect(c.days).toEqual([{ date: '2026-10-22', daysBefore: 2, carbsG: 560 }, { date: '2026-10-23', daysBefore: 1, carbsG: 560 }]);
    expect(c.explanation.ruleId).toBe('carboload.long');
  });
  it('90 min ou moins : un bon repas la veille', () => {
    const c = carboLoading('2026-10-24', 60, 70);
    expect(c.days).toEqual([{ date: '2026-10-23', daysBefore: 1, carbsG: 420 }]);
    expect(c.explanation.ruleId).toBe('carboload.short');
    expect(carboLoading('2026-10-24', 90, 70).days).toHaveLength(1);
  });
  it('avancement : à venir, en cours, passée', () => {
    const c = carboLoading('2026-10-24', 240, 70);
    expect(carboLoadingStatus(c, '2026-10-20')).toBe('a_venir');
    expect(carboLoadingStatus(c, '2026-10-22')).toBe('en_cours');
    expect(carboLoadingStatus(c, '2026-10-23')).toBe('en_cours');
    expect(carboLoadingStatus(c, '2026-10-24')).toBe('passee');
  });
});
