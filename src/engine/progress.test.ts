import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { aerobicEfficiency, cadenceByWeek, easyActivities, hrvDays, restingHrTrend, vo2maxSeries, zoneDistribution, type ProgressActivity } from './progress';

const TODAY = '2026-10-21'; // mercredi ; semaine du 2026-10-19
const run = (daysAgo: number, over: Partial<ProgressActivity> = {}): ProgressActivity => ({
  date: addDays(TODAY, -daysAgo), sport: 'course', durationSec: 3600, distanceKm: 8, elevationGainM: 40, hrAvg: 140, cadenceAvg: 170, timeInZonesSec: [600, 2800, 200, 0, 0], ...over,
});
/** Allure (min/km) → distance (km) d'une heure de course. */
const hourAt = (paceMinKm: number) => 60 / paceMinKm;

describe('efficacité aérobie', () => {
  it('ne garde que les sorties faciles, sur terrain roulant, avec FC', () => {
    const acts = [run(1), run(2, { sport: 'velo' }), run(3, { hrAvg: undefined }), run(4, { elevationGainM: 400 }), run(5, { timeInZonesSec: [0, 100, 3000, 400, 100] }), run(6, { timeInZonesSec: undefined }), run(7, { distanceKm: 0 }), run(8, { movingSec: 0 })];
    expect(easyActivities(acts)).toHaveLength(1);
    expect(easyActivities([run(1, { sport: 'trail' })])).toHaveLength(1);
  });

  it('même FC, allure plus rapide : « ton Z2 est X s/km plus rapide »', () => {
    // Les 4 semaines d'avant : 6:00 /km à 140 bpm ; les 4 dernières : 5:40 /km à 140 bpm.
    const before = [35, 32, 29, 26].map((d) => run(d, { distanceKm: hourAt(6) }));
    const recent = [8, 6, 3, 1].map((d) => run(d, { distanceKm: hourAt(5 + 40 / 60) }));
    const e = aerobicEfficiency([...before, ...recent], 140, TODAY);
    expect(e.deltaSecPerKm).toBe(-20);
    expect(e.recentPace).toBeCloseTo(5.67, 2);
    expect(e.previousPace).toBeCloseTo(6, 2);
    expect(e.discovery).toMatchObject({ ruleId: 'progress.efficiency.up', severity: 'info', title: 'Ton Z2 est 20 s/km plus rapide' });
    expect(e.discovery!.why).toContain('140 bpm');
    expect(e.points.length).toBeGreaterThanOrEqual(4);
    expect(e.points.every((p, i, a) => i === 0 || a[i - 1]!.monday < p.monday)).toBe(true);
  });

  it('une FC plus haute pour la même allure = efficacité en baisse, dit sans alarmer', () => {
    const before = [35, 32, 29, 26].map((d) => run(d, { distanceKm: hourAt(6), hrAvg: 140 }));
    const recent = [8, 6, 3, 1].map((d) => run(d, { distanceKm: hourAt(6), hrAvg: 148 }));
    const e = aerobicEfficiency([...before, ...recent], 140, TODAY);
    expect(e.deltaSecPerKm).toBeGreaterThan(0);
    expect(e.discovery).toMatchObject({ ruleId: 'progress.efficiency.down', severity: 'conseil' });
    expect(e.discovery!.title).toMatch(/plus lent/);
  });

  it('écart trop petit (bruit) ou pas assez de sorties : aucune découverte', () => {
    const before = [35, 32, 29, 26].map((d) => run(d, { distanceKm: hourAt(6) }));
    const same = [8, 6, 3, 1].map((d) => run(d, { distanceKm: hourAt(5.97) }));
    const e = aerobicEfficiency([...before, ...same], 140, TODAY);
    expect(Math.abs(e.deltaSecPerKm!)).toBeLessThan(5);
    expect(e.discovery).toBeUndefined();
    const few = aerobicEfficiency([...before, run(1), run(2)], 140, TODAY);
    expect(few.deltaSecPerKm).toBeUndefined();
    expect(few.points.length).toBeGreaterThan(0);
    expect(aerobicEfficiency([], 140, TODAY)).toEqual({ points: [], refHr: 140 });
  });

  it('plusieurs sorties la même semaine : moyenne pondérée par la durée', () => {
    const e = aerobicEfficiency([run(1, { distanceKm: hourAt(6) }), run(2, { distanceKm: hourAt(5) , durationSec: 3600 })], 140, TODAY);
    expect(e.points).toHaveLength(1);
    expect(e.points[0]).toMatchObject({ activities: 2 });
    expect(e.points[0]!.paceAtRef).toBeGreaterThan(5);
    expect(e.points[0]!.paceAtRef).toBeLessThan(6);
  });
});

describe('distribution des zones', () => {
  it('sans temps par zone : rien', () => {
    expect(zoneDistribution([run(1, { timeInZonesSec: undefined }), run(2, { sport: 'velo' })], TODAY)).toBeUndefined();
  });
  it('80/10/10 : bonne répartition', () => {
    const d = zoneDistribution([run(1, { timeInZonesSec: [800, 3200, 400, 300, 100] })], TODAY)!;
    expect(d.shares.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 2);
    expect(d.low).toBeCloseTo(0.8, 1);
    expect(d.discovery).toMatchObject({ ruleId: 'progress.distribution.ok' });
    expect(d.minutes).toBe(80);
  });
  it('trop de soutenu : la zone grise', () => {
    const d = zoneDistribution([run(1, { timeInZonesSec: [100, 1500, 1800, 200, 0] })], TODAY)!;
    expect(d.discovery).toMatchObject({ ruleId: 'progress.distribution.hard', severity: 'conseil' });
    expect(d.discovery!.why).toContain('Z3');
  });
  it('que du facile : très bien pour la base', () => {
    expect(zoneDistribution([run(1, { timeInZonesSec: [600, 3000, 0, 0, 0] })], TODAY)!.discovery).toMatchObject({ ruleId: 'progress.distribution.easy' });
  });
  it('seules les 4 dernières semaines comptent', () => {
    const d = zoneDistribution([run(1, { timeInZonesSec: [0, 3000, 0, 0, 0] }), run(60, { timeInZonesSec: [0, 0, 0, 3000, 0] })], TODAY)!;
    expect(d.high).toBe(0);
  });
});

describe('cadence', () => {
  it('moyenne hebdomadaire pondérée, course seulement', () => {
    const c = cadenceByWeek([run(1, { cadenceAvg: 170, durationSec: 3600 }), run(2, { cadenceAvg: 176, durationSec: 3600 }), run(9, { cadenceAvg: 160 }), run(3, { sport: 'velo', cadenceAvg: 90 }), run(4, { cadenceAvg: undefined })]);
    expect(c).toEqual([{ monday: '2026-10-12', spm: 160 }, { monday: '2026-10-19', spm: 173 }]);
  });
});

describe('VO2max', () => {
  it('moyenne glissante sur 3 points, triée par date', () => {
    const s = vo2maxSeries([{ date: '2026-03-01', value: 48 }, { date: '2026-01-01', value: 44 }, { date: '2026-02-01', value: 46 }, { date: '2026-04-01', value: 50 }]);
    expect(s.map((p) => p.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
    expect(s.map((p) => p.smoothed)).toEqual([44, 45, 46, 48]);
    expect(vo2maxSeries([])).toEqual([]);
  });
});

describe('FC repos et VFC', () => {
  const series = (recent: number, base: number) => [
    ...Array.from({ length: 7 }, (_, i) => ({ date: addDays(TODAY, -i), hrRest: recent })),
    ...Array.from({ length: 28 }, (_, i) => ({ date: addDays(TODAY, -(i + 7)), hrRest: base })),
  ];
  it('+5 bpm sur la base : à surveiller', () => {
    const r = restingHrTrend(series(60, 54), TODAY)!;
    expect(r).toMatchObject({ recent: 60, baseline: 54, delta: 6 });
    expect(r.discovery).toMatchObject({ ruleId: 'progress.restinghr.up', severity: 'attention' });
  });
  it('−5 bpm : forme qui monte', () => {
    expect(restingHrTrend(series(50, 56), TODAY)!.discovery).toMatchObject({ ruleId: 'progress.restinghr.down', severity: 'info' });
  });
  it('stable : pas de découverte ; trop peu de données : rien', () => {
    expect(restingHrTrend(series(55, 55), TODAY)!.discovery).toBeUndefined();
    expect(restingHrTrend(series(55, 55).slice(0, 5), TODAY)).toBeUndefined();
    expect(restingHrTrend([...series(55, 55).slice(0, 7), ...series(55, 55).slice(7, 12)], TODAY)).toBeUndefined();
    expect(restingHrTrend([{ date: TODAY }], TODAY)).toBeUndefined();
  });
  it('VFC : jours déséquilibrés sur 7 jours', () => {
    const w = [{ date: TODAY, hrv: 'equilibre' as const }, { date: addDays(TODAY, -1), hrv: 'bas' as const }, { date: addDays(TODAY, -2), hrv: 'desequilibre' as const }, { date: addDays(TODAY, -3) }, { date: addDays(TODAY, -20), hrv: 'bas' as const }];
    expect(hrvDays(w, TODAY)).toEqual({ total: 3, bad: 2 });
  });
});
