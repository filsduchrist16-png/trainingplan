import { describe, expect, it } from 'vitest';
import { checkWeekProgression, maxAllowedVolume, progressionReference, weeklySummaries } from './progression';

const w = (km: number, hardMinutes = 0) => ({ km, hardMinutes });

describe('résumés hebdomadaires', () => {
  it('regroupe par semaine ISO, ignore les sports non course et les dates hors fenêtre', () => {
    const acts = [
      { date: '2026-10-19', sport: 'course' as const, distanceKm: 10, elevationGainM: 100, timeInZonesSec: [0, 0, 0, 600, 300] as [number, number, number, number, number] },
      { date: '2026-10-25', sport: 'trail' as const, distanceKm: 20, elevationGainM: 800 },
      { date: '2026-10-21', sport: 'velo' as const, distanceKm: 40, elevationGainM: 0 },
      { date: '2026-11-30', sport: 'course' as const, distanceKm: 5, elevationGainM: 0 },
    ];
    const weeks = weeklySummaries(acts, '2026-10-12', '2026-10-19');
    expect(weeks).toHaveLength(2);
    expect(weeks[1]).toEqual({ monday: '2026-10-19', km: 30, elevationGainM: 900, hardMinutes: 15, runs: 2 });
    expect(weeks[0]!.km).toBe(0);
  });
});

describe('règle des 10 %', () => {
  it('la référence est le max des 4 dernières semaines (la décharge ne pénalise pas la remontée)', () => {
    const history = [w(40), w(44), w(48), w(31)]; // 31 = décharge
    expect(progressionReference(history)).toBe(48);
    expect(maxAllowedVolume(history)).toBeCloseTo(52.8);
    expect(checkWeekProgression(w(48), history)).toEqual([]); // revenir au niveau d'avant la décharge : OK
  });
  it('signale un dépassement', () => {
    const r = checkWeekProgression(w(56), [w(40), w(44), w(48), w(31)]);
    expect(r[0]!.ruleId).toBe('progression.volume');
    expect(r[0]!.values!.pct).toBe(17);
  });
  it('une vieille grosse semaine (> 4 sem.) ne sert pas de référence', () => {
    expect(progressionReference([w(80), w(20), w(20), w(20), w(20)])).toBe(20);
  });
  it('signale volume ET intensité en hausse', () => {
    const r = checkWeekProgression(w(44, 30), [w(40, 20), w(40, 20)]);
    expect(r.map((e) => e.ruleId)).toEqual(['progression.both']);
  });
  it('accepte la hausse d’intensité à volume stable', () => {
    expect(checkWeekProgression(w(40, 40), [w(40, 20)])).toEqual([]);
  });
  it('ne juge pas sans historique', () => {
    expect(checkWeekProgression(w(30), [])).toEqual([]);
    expect(progressionReference([])).toBe(0);
  });
});
