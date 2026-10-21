import { describe, expect, it } from 'vitest';
import { addDays, diffDays } from './dates';
import { debrief } from './debrief';
import { GOALS } from './goals';
import { isRunType } from './library';
import { generatePlan, type PlanRequest } from './periodization';
import { bmi, deriveProfile, notesFor, type ProfileInput } from './profiles';
import { buildWeekSessions } from './scheduling';
import { zoneTarget } from './zones';
import type { Availability, GoalKind, HealthProfile, HealthQuestion } from './types';

const TODAY = '2026-04-20';
const avail: Availability = { runDaysPerWeek: 4, allowedDays: [1, 2, 3, 4, 5, 6, 7], longRunDay: 6, maxWeekdayMinutes: 75, maxWeekendMinutes: 150, strengthPerWeek: 2 };
const none: Record<HealthQuestion, boolean> = { q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false, q8: false, q9: true };
const health = (yes: Partial<Record<HealthQuestion, boolean>> = {}, over: Partial<HealthProfile> = {}): HealthProfile => ({ answers: { ...none, ...yes }, answeredAt: '2026-04-01', conditions: [], ...over });
const profile = (over: Partial<ProfileInput> = {}) => deriveProfile({ experience: 'regulier', today: TODAY, ...over });

function plan(goal: GoalKind, p: ReturnType<typeof deriveProfile>, over: Partial<PlanRequest> = {}) {
  const g = GOALS[goal];
  const race = g.family === 'route' || g.family === 'trail' ? { date: addDays(TODAY, 20 * 7 + 5), distanceKm: g.defaultDistanceKm, elevationGainM: g.defaultElevationM } : undefined;
  const req: PlanRequest = { goal, startDate: TODAY, race, experience: 'regulier', difficulty: 'equilibre', currentWeeklyKm: 30, availability: avail, vdot: 45, profile: p, ...over };
  const draft = generatePlan(req);
  const weeks = draft.weeks.map((w, i) => ({
    week: w,
    ...buildWeekSessions(w, { goal, family: draft.family, availability: req.availability, experience: req.experience, vdot: req.vdot, hrMaxEstimated: true, hasPoles: false, planWeek: i, phaseWeek: i - draft.weeks.findIndex((x) => x.phase === w.phase), race: req.race, profile: p }),
  }));
  return { draft, weeks };
}
const ids = (p: ReturnType<typeof deriveProfile>) => p.explanations.map((e) => e.ruleId);
const deloadGaps = (weeks: { kind: string; phase: string }[]) => {
  const idx = weeks.map((w, i) => (w.kind === 'decharge' ? i : -1)).filter((i) => i >= 0);
  return idx.slice(1).map((v, i) => v - idx[i]!);
};

describe('profils (T10)', () => {
  it('profil neutre : aucun ajustement', () => {
    const p = profile({ health: health(), birthYear: 1990, heightCm: 175, weightKg: 70 });
    expect(p).toMatchObject({ slow: false, walkFirst: false, hrUnreliable: false, noVo2: false, noConsecutiveDays: false, injuryActive: false, forbiddenGoals: [], sessionNotes: [], explanations: [] });
    expect(p.buildWeeksBeforeDeload).toBeUndefined();
  });

  it('niveau 0 (ne marche pas 30 min) : marche d’abord, profil lent', () => {
    const p = profile({ experience: 'jamais', health: health({ q9: false }) });
    expect(p).toMatchObject({ walkFirst: true, slow: true });
    expect(ids(p)).toEqual(['profile.slow', 'profile.walk_first']);
    const { draft } = plan('route_5k', p, { experience: 'jamais', currentWeeklyKm: 0, vdot: undefined });
    expect(draft.weeks[0]!.runWalk!.sessions[0]!.stage).toBe(0);
  });

  it('profil lent (60 ans) : 3 validations par palier, décharge toutes les 3 semaines', () => {
    const p = profile({ birthYear: 1965 });
    expect(p.slow).toBe(true);
    expect(p.explanations[0]!.why).toContain('61 ans');
    const lent = plan('debuter', p, { experience: 'jamais', currentWeeklyKm: 0, vdot: undefined, availability: { ...avail, runDaysPerWeek: 3 } }).draft;
    const normal = plan('debuter', profile(), { experience: 'jamais', currentWeeklyKm: 0, vdot: undefined, availability: { ...avail, runDaysPerWeek: 3 } }).draft;
    expect(lent.weeks.length).toBeGreaterThan(normal.weeks.length); // 3 séances par palier : parcours plus long
    expect(lent.weeks[0]!.runWalk!.sessions.map((s) => s.stage)).toEqual([1, 1, 1]);
    const { draft } = plan('route_10k', p);
    expect(deloadGaps(draft.weeks.filter((w) => w.phase !== 'taper'))).toEqual(expect.arrayContaining([3]));
    expect(deloadGaps(draft.weeks.filter((w) => w.phase !== 'taper')).every((g) => g === 3)).toBe(true);
    expect(draft.warnings.map((w) => w.ruleId)).toContain('profile.slow');
  });

  it('50 ans et plus : décharge 2:1 par défaut, au plus 1 séance clé pour qui débute, muscu conseillée', () => {
    const p = profile({ birthYear: 1974, experience: 'debutant' });
    expect(p).toMatchObject({ slow: false, buildWeeksBeforeDeload: 2, maxKeySessions: 1 });
    expect(p.explanations[0]!.why).toMatch(/renforcement/);
    const { draft } = plan('route_10k', p, { experience: 'debutant', currentWeeklyKm: 20, longestRecentRunKm: 8 });
    expect(Math.max(...draft.weeks.map((w) => w.keySessions))).toBe(1);
    expect(profile({ birthYear: 1974 }).maxKeySessions).toBeUndefined(); // régulier : pas de plafond
  });

  it('65 ans et plus : marche/course sous 20 min, pas de VO2max pour qui débute, équilibre en muscu', () => {
    const p = profile({ birthYear: 1958 });
    expect(p.runWalkMinCapacity).toBe(20);
    expect(p.noVo2).toBe(false);
    const { draft } = plan('route_5k', p, { continuousMin: 15 });
    expect(draft.weeks[0]!.phase).toBe('demarrage');
    expect(plan('route_5k', profile(), { continuousMin: 15 }).draft.weeks[0]!.phase).not.toBe('demarrage');
    const novice = profile({ birthYear: 1958, experience: 'debutant' });
    expect(novice.noVo2).toBe(true);
    const { weeks } = plan('route_5k', novice, { experience: 'debutant', continuousMin: 40, currentWeeklyKm: 20 });
    expect(weeks.flatMap((w) => w.sessions).some((s) => s.type === 'vo2max')).toBe(false);
    const strength = weeks.flatMap((w) => w.sessions).find((s) => s.type.startsWith('muscu'))!;
    expect(strength.notes!.join(' ')).toMatch(/équilibre/);
  });

  it('IMC ≥ 30 : profil lent, jamais deux jours de course de suite, surfaces souples', () => {
    expect(bmi(170, 90)).toBe(31.1);
    expect(bmi(undefined, 90)).toBeUndefined();
    const p = profile({ heightCm: 170, weightKg: 90 });
    expect(p).toMatchObject({ slow: true, noConsecutiveDays: true });
    const { weeks } = plan('trail_moyen', p, { availability: { ...avail, runDaysPerWeek: 6 } });
    for (const { sessions } of weeks) {
      const days = sessions.filter((s) => isRunType(s.type) && s.type !== 'repos').map((s) => s.date).sort();
      for (let i = 1; i < days.length; i++) expect(diffDays(days[i - 1]!, days[i]!), days.join(',')).toBeGreaterThan(1);
    }
    const run = weeks[0]!.sessions.find((s) => isRunType(s.type) && s.type !== 'repos')!;
    expect(run.notes!.join(' ')).toMatch(/surfaces souples/);
  });

  it('FC non fiable (Q5 + médicament) : zones au RPE, pas de test, debrief sans FC', () => {
    const p = profile({ health: health({ q5: true }, { hrUnreliable: true }) });
    expect(p.hrUnreliable).toBe(true);
    expect(ids(p)).toContain('profile.hr_unreliable');
    expect(profile({ health: health({ q5: true }) }).hrUnreliable).toBe(false);
    const { weeks } = plan('route_10k', p);
    expect(weeks.flatMap((w) => w.sessions).some((s) => s.type === 'test')).toBe(false);
    expect(plan('route_10k', profile()).weeks[1]!.sessions.some((s) => s.type === 'test')).toBe(true);
    expect(zoneTarget('z2', { bounds: [120, 140, 160, 175], hrMax: 190, hrUnreliable: true })).toMatchObject({ value: '3-4', unit: 'RPE' });
    expect(zoneTarget('z2', { bounds: [120, 140, 160, 175], hrMax: 190 })).toMatchObject({ value: '120-140', unit: 'bpm' });
    const d = debrief({ activity: { durationSec: 3600, distanceKm: 10, elevationGainM: 0, timeInZonesSec: [0, 600, 3000, 0, 0], samples: { t: [0, 3600], hr: [150, 150], speed: [3, 3] } }, planned: { type: 'z2_endurance', durationMin: 60, steps: [], isKey: false }, bounds: [120, 140, 160, 175], hrMax: 190, cadenceTarget: [170, 180], hrUnreliable: true });
    expect(d.findings.map((f) => f.ruleId)).toEqual(['debrief.hr_unreliable']);
  });

  it('diabète : note sur les séances de plus de 45 min seulement', () => {
    const p = profile({ health: health({ q4: true }, { conditions: ['diabete'] }) });
    expect(notesFor(p.sessionNotes, { type: 'longue_facile', durationMin: 60 }, true)[0]).toMatch(/sucre rapide/);
    expect(notesFor(p.sessionNotes, { type: 'z2_endurance', durationMin: 40 }, true)).toEqual([]);
    expect(notesFor(p.sessionNotes, { type: 'muscu_generale', durationMin: 60 }, false)).toEqual([]);
  });

  it('asthme : inhalateur et échauffement de 10 min sur chaque sortie', () => {
    const p = profile({ health: health({ q4: true }, { conditions: ['asthme'] }) });
    const { weeks } = plan('route_10k', p);
    const runs = weeks[0]!.sessions.filter((s) => isRunType(s.type) && s.type !== 'repos');
    expect(runs.every((s) => s.notes?.some((n) => /inhalateur/.test(n)))).toBe(true);
    expect(weeks[0]!.sessions.filter((s) => s.type === 'repos').every((s) => !s.notes)).toBe(true);
  });

  it('blessure active : pas de plan de course', () => {
    const p = profile({ injuries: [{ zone: 'tibia_g', label: 'périostite', status: 'active' }] });
    expect(p.injuryActive).toBe(true);
    const { draft } = plan('route_10k', p);
    expect(draft.ok).toBe(false);
    expect(draft.warnings[0]!.ruleId).toBe('profile.injury.active');
  });

  it('blessure récente (< 12 sem.) : un niveau plus bas, marche/course sous 20 min ; Q6 : profil lent', () => {
    const p = profile({ injuries: [{ zone: 'achille_d', label: 'tendinopathie', status: 'dormante', since: '2026-03-01' }] });
    expect(p).toMatchObject({ experience: 'debutant', runWalkMinCapacity: 20, slow: true });
    expect(plan('route_10k', p, { continuousMin: 15 }).draft.weeks[0]!.phase).toBe('demarrage');
    const old = profile({ injuries: [{ zone: 'achille_d', label: 'tendinopathie', status: 'dormante', since: '2025-06-01' }] });
    expect(old).toMatchObject({ experience: 'regulier', slow: true });
    expect(profile({ injuries: [{ zone: 'achille_d', label: 'x', status: 'resolue', since: '2026-03-01' }] }).slow).toBe(false);
    expect(profile({ health: health({ q6: true }) }).slow).toBe(true);
    expect(profile({ experience: 'jamais', injuries: [{ zone: 'genou_d', label: 'x', status: 'dormante', since: '2026-04-01' }] }).experience).toBe('jamais');
  });

  it('mineur : pas de marathon, trail moyen ni ultra ; difficulté au plus « équilibré »', () => {
    const p = profile({ birthYear: 2010 });
    expect(p.forbiddenGoals).toEqual(['route_marathon', 'trail_moyen', 'ultra']);
    const refused = plan('route_marathon', p).draft;
    expect(refused.ok).toBe(false);
    expect(refused.warnings[0]!.ruleId).toBe('profile.goal.forbidden');
    const ok = plan('route_10k', p, { difficulty: 'ambitieux' }).draft;
    const eq = plan('route_10k', profile(), { difficulty: 'equilibre' }).draft;
    expect(ok.targetPeakKm).toBe(eq.targetPeakKm);
    expect(plan('route_10k', p, { difficulty: 'prudent' }).draft.targetPeakKm).toBeLessThan(eq.targetPeakKm);
  });
});
