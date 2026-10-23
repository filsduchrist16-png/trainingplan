import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { newMilestones, recentMilestones, type MilestoneActivity } from './milestones';

const run = (date: string, km: number, over: Partial<MilestoneActivity> = {}): MilestoneActivity => ({ date, sport: 'course', durationSec: km * 360, distanceKm: km, elevationGainM: 0, ...over });
const keys = (acts: MilestoneActivity[], known: string[] = []) => newMilestones(acts, new Set(known)).map((h) => h.key);

describe('jalons', () => {
  it('rien sans course à pied', () => {
    expect(keys([])).toEqual([]);
    expect(keys([run('2026-04-01', 10, { sport: 'velo' }), run('2026-04-02', 0)])).toEqual([]);
  });
  it('première sortie seulement', () => {
    const hits = newMilestones([run('2026-04-01', 2)], new Set());
    expect(hits.map((h) => h.key)).toEqual(['first-run']);
    expect(hits[0]).toMatchObject({ date: '2026-04-01', explanation: { ruleId: 'milestone.first', severity: 'info' } });
  });
  it('30 minutes d’affilée (durée en mouvement), 5 km, 10 km, semi, marathon', () => {
    const acts = [run('2026-04-01', 2), run('2026-04-08', 4, { durationSec: 31 * 60 }), run('2026-04-15', 5.2), run('2026-04-22', 10.4), run('2026-05-01', 21.1), run('2026-06-01', 42.3)];
    const hits = newMilestones(acts, new Set());
    expect(hits.find((h) => h.key === 'continuous-30')!.date).toBe('2026-04-08');
    expect(hits.find((h) => h.key === 'first-5k')).toMatchObject({ date: '2026-04-15', value: 5.2 });
    expect(hits.find((h) => h.key === 'first-10k')!.date).toBe('2026-04-22');
    expect(hits.find((h) => h.key === 'first-21.0975k')!.explanation.title).toBe('Premier semi-marathon');
    expect(hits.find((h) => h.key === 'first-42.195k')!.explanation.title).toBe('Premier marathon');
    expect(hits.some((h) => h.key === 'first-50k')).toBe(false);
    // 4,95 km compte comme un 5 km (tolérance de 2 %).
    expect(keys([run('2026-04-01', 4.95)])).toContain('first-5k');
    expect(keys([run('2026-04-01', 4.8)])).not.toContain('first-5k');
    expect(newMilestones([run('2026-04-01', 50)], new Set()).find((h) => h.key === 'first-50k')!.explanation.title).toBe('Premier 50 km');
  });
  it('1000 m de D+ en une sortie', () => {
    expect(newMilestones([run('2026-04-01', 20, { elevationGainM: 1250, sport: 'trail' })], new Set()).find((h) => h.key === 'climb-1000')).toMatchObject({ value: 1250 });
    expect(keys([run('2026-04-01', 20, { elevationGainM: 900 })])).not.toContain('climb-1000');
  });
  it('cumul : 100 km à la sortie qui le dépasse, plusieurs seuils d’un coup', () => {
    const acts = Array.from({ length: 15 }, (_, i) => run(addDays('2026-01-05', i * 7), 8)); // 120 km
    const hits = newMilestones(acts, new Set());
    expect(hits.find((h) => h.key === 'total-100')!.date).toBe(addDays('2026-01-05', 12 * 7)); // 13e sortie : 104 km
    expect(hits.some((h) => h.key === 'total-250')).toBe(false);
    const big = newMilestones([run('2026-01-01', 60), run('2026-01-08', 60), run('2026-01-15', 140)], new Set());
    expect(big.filter((h) => h.key.startsWith('total-')).map((h) => h.key)).toEqual(['total-100', 'total-250']);
  });
  it('série de semaines : consécutives avec au moins 2 sorties ; une semaine ratée remet à zéro', () => {
    const week = (i: number, n = 2) => Array.from({ length: n }, (_, k) => run(addDays('2026-01-05', i * 7 + k * 2), 5));
    const four = [0, 1, 2, 3].flatMap((i) => week(i));
    expect(newMilestones(four, new Set()).find((h) => h.key === 'streak-4')).toMatchObject({ date: addDays('2026-01-05', 3 * 7 + 6), value: 4 });
    const broken = [0, 1, 2, 4, 5].flatMap((i) => week(i));
    expect(keys(broken)).not.toContain('streak-4');
    const oneRun = [0, 1, 2, 3].flatMap((i) => week(i, 1));
    expect(keys(oneRun)).not.toContain('streak-4');
    const eight = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => week(i));
    expect(keys(eight)).toEqual(expect.arrayContaining(['streak-4', 'streak-8']));
  });
  it('plus longue sortie : le dernier record seulement, pas pour la toute première sortie ni sous 5 km', () => {
    const hits = newMilestones([run('2026-04-01', 6), run('2026-04-08', 8), run('2026-04-15', 11.4), run('2026-04-22', 9)], new Set());
    expect(hits.filter((h) => h.key.startsWith('longest-')).map((h) => h.key)).toEqual(['longest-11']);
    expect(hits.find((h) => h.key === 'longest-11')!.explanation.title).toContain('11.4 km');
    expect(keys([run('2026-04-01', 12)])).not.toContain('longest-12');
    expect(keys([run('2026-04-01', 2), run('2026-04-08', 3)])).not.toContain('longest-3');
  });
  it('idempotent : les jalons connus ne reviennent pas', () => {
    const acts = [run('2026-04-01', 5.2)];
    expect(keys(acts, ['first-run', 'first-5k', 'continuous-30'])).toEqual([]);
    expect(keys(acts, ['first-run', 'continuous-30'])).toEqual(['first-5k']);
  });
  it('triés par date, puis par clé', () => {
    const k = newMilestones([run('2026-04-01', 5.2, { durationSec: 40 * 60 }), run('2026-04-08', 6)], new Set()).map((h) => h.key);
    expect(k.slice(0, 3)).toEqual(['continuous-30', 'first-5k', 'first-run']);
  });
});

describe('jalons récents', () => {
  it('ceux des 7 derniers jours, le plus récent d’abord', () => {
    const all = [{ date: '2026-10-01' }, { date: '2026-10-16' }, { date: '2026-10-20' }, { date: '2026-10-23' }];
    expect(recentMilestones(all, '2026-10-22')).toEqual([{ date: '2026-10-20' }, { date: '2026-10-16' }].filter((m) => m.date > '2026-10-15'));
    expect(recentMilestones(all, '2026-10-22', 30)).toHaveLength(3);
  });
});
