import { describe, expect, it } from 'vitest';
import { acwr, acwrEwma, activityLoad, dailyLoads } from './load';
import { addDays } from './dates';
import { zonesFromHrMax } from './zones';

const B = zonesFromHrMax(190);

describe('charge par activité', () => {
  it('utilise le temps par zone et compte les trous de FC', () => {
    expect(activityLoad({ durationSec: 3600, timeInZonesSec: [0, 3600, 0, 0, 0] }, B)).toEqual({ load: 120, basis: 'zones' });
    // 30 min captées en Z2, 30 min de trou → extrapolé au même poids
    expect(activityLoad({ durationSec: 3600, timeInZonesSec: [0, 1800, 0, 0, 0] }, B).load).toBe(120);
  });
  it('ajoute le bonus D+', () => {
    expect(activityLoad({ durationSec: 3600, timeInZonesSec: [0, 3600, 0, 0, 0], elevationGainM: 500 }, B).load).toBe(180);
  });
  it('se rabat sur la FC moyenne, puis le RPE, puis la durée', () => {
    expect(activityLoad({ durationSec: 3600, hrAvg: 150, timeInZonesSec: [0, 0, 0, 0, 0] }, B)).toEqual({ load: 180, basis: 'fc_moyenne' });
    expect(activityLoad({ durationSec: 3600, rpe: 8 }, B)).toEqual({ load: 240, basis: 'rpe' });
    expect(activityLoad({ durationSec: 3600, rpe: 0 }, B).load).toBe(60);
    expect(activityLoad({ durationSec: 3600, rpe: 10 }, B).load).toBe(300);
    expect(activityLoad({ durationSec: 3600 }, B)).toEqual({ load: 120, basis: 'duree' });
  });
  it('utilise la charge Garmin seulement si demandé ET disponible', () => {
    expect(activityLoad({ durationSec: 3600, garminTrainingLoad: 95 }, B, 'garmin')).toEqual({ load: 95, basis: 'garmin' });
    expect(activityLoad({ durationSec: 3600 }, B, 'garmin').basis).toBe('duree');
    expect(activityLoad({ durationSec: 3600, garminTrainingLoad: 95 }, B).basis).toBe('duree');
  });
});

function steadyHistory(days: number, perDay: number, end = '2026-10-21') {
  return Array.from({ length: days }, (_, i) => ({ date: addDays(end, -i), load: perDay }));
}

describe('ACWR', () => {
  it('additionne les charges d’un même jour', () => {
    expect(dailyLoads([{ date: 'x', load: 10 }, { date: 'x', load: 5 }, { date: 'y' }]).get('x')).toBe(15);
  });
  it('reste en calibration sans 28 jours d’historique', () => {
    const daily = dailyLoads(steadyHistory(10, 100));
    const r = acwr(daily, '2026-10-21', { firstActivity: '2026-10-12' });
    expect(r.status).toBe('calibration');
    expect(r.ratio).toBeNull();
    expect(acwr(daily, '2026-10-21').status).toBe('calibration');
  });
  it('vaut 1 pour une charge stable', () => {
    const r = acwr(dailyLoads(steadyHistory(40, 100)), '2026-10-21', { firstActivity: '2026-09-01' });
    expect(r.ratio).toBe(1);
    expect(r.status).toBe('optimal');
  });
  it('détecte une hausse brutale', () => {
    const hist = steadyHistory(40, 100).map((d, i) => (i < 7 ? { ...d, load: 200 } : d));
    expect(acwr(dailyLoads(hist), '2026-10-21', { firstActivity: '2026-09-01' }).status).toBe('danger');
    const mid = steadyHistory(40, 100).map((d, i) => (i < 7 ? { ...d, load: 160 } : d));
    expect(acwr(dailyLoads(mid), '2026-10-21', { firstActivity: '2026-09-01' }).status).toBe('eleve');
  });
  it('distingue semaine légère voulue et sous-entraînement en build', () => {
    const hist = steadyHistory(40, 100).map((d, i) => (i < 7 ? { ...d, load: 40 } : d));
    const daily = dailyLoads(hist);
    expect(acwr(daily, '2026-10-21', { firstActivity: '2026-09-01' }).explanation.ruleId).toBe('acwr.low');
    expect(acwr(daily, '2026-10-21', { firstActivity: '2026-09-01', inBuildPhase: true }).explanation.ruleId).toBe('acwr.low.build');
  });
  it('EWMA ≈ 1 pour une charge stable et null sans charge', () => {
    const daily = dailyLoads(steadyHistory(90, 100));
    expect(acwrEwma(daily, addDays('2026-10-21', -89), '2026-10-21')).toBeCloseTo(1, 1);
    expect(acwrEwma(new Map(), '2026-10-01', '2026-10-21')).toBeNull();
  });
});
