import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { GOALS } from './goals';
import { isRunType } from './library';
import { generatePlan, type PlanDraft, type PlanRequest } from './periodization';
import { deriveProfile, type ProfileInput } from './profiles';
import { stageRunMinutes, JOURNEY_DONE, LADDER_LAST } from './runwalk';
import { buildWeekSessions, type SessionDraft } from './scheduling';
import { screen } from './screening';
import type { Availability, Experience, GoalKind, HealthProfile, HealthQuestion } from './types';

/**
 * Régression globale (docs/AUDIT-POUR-TOUS.md) : un plan complet (plan + séances de chaque semaine) par persona,
 * et les 5 invariants vérifiés sur chacun.
 */

const START = '2026-04-20';
const days = (n: number): Availability => ({ runDaysPerWeek: n, allowedDays: [1, 2, 3, 4, 5, 6, 7], longRunDay: 6, maxWeekdayMinutes: 60, maxWeekendMinutes: 120, strengthPerWeek: 1 });
const none: Record<HealthQuestion, boolean> = { q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false, q8: false, q9: true };
const health = (yes: Partial<Record<HealthQuestion, boolean>> = {}, over: Partial<HealthProfile> = {}): HealthProfile => ({ answers: { ...none, ...yes }, answeredAt: '2026-04-01', conditions: [], ...over });

interface Persona {
  name: string;
  goal: GoalKind;
  experience: Experience;
  weeks?: number;
  raceKm?: number;
  request?: Partial<PlanRequest>;
  body?: Partial<ProfileInput>;
}

const PERSONAS: Persona[] = [
  { name: 'jamais couru, 3 j/sem, ne marche pas 30 min → Courir de zéro', goal: 'debuter', experience: 'jamais', request: { availability: days(3) }, body: { health: health({ q9: false }) } },
  { name: 'jamais couru, 3 j/sem → 5 km dans 10 semaines', goal: 'route_5k', experience: 'jamais', weeks: 10, request: { availability: days(3) } },
  { name: 'jamais couru, 3 j/sem → 5 km dans 20 semaines', goal: 'route_5k', experience: 'jamais', weeks: 20, request: { availability: days(3) } },
  { name: 'débutant, court 4 min, 3 j/sem → 10 km dans 12 semaines', goal: 'route_10k', experience: 'debutant', weeks: 12, request: { availability: days(3), continuousMin: 4, currentWeeklyKm: 3 } },
  { name: 'jamais couru, 2 j/sem → Courir de zéro', goal: 'debuter', experience: 'jamais', request: { availability: days(2) } },
  { name: '62 ans, IMC 32, bêtabloquant → Garder la forme', goal: 'forme', experience: 'debutant', request: { availability: days(3), currentWeeklyKm: 8 }, body: { birthYear: 1964, heightCm: 165, weightKg: 87, health: health({ q1: true, q5: true }, { hrUnreliable: true }) } },
  { name: '62 ans, IMC 32, bêtabloquant → 5 km', goal: 'route_5k', experience: 'debutant', weeks: 24, request: { availability: days(3), currentWeeklyKm: 8 }, body: { birthYear: 1964, heightCm: 165, weightKg: 87, health: health({ q1: true, q5: true }, { hrUnreliable: true }) } },
  { name: 'post-partum 4 mois, ancienne coureuse régulière → 10 km', goal: 'route_10k', experience: 'regulier', weeks: 26, request: { availability: days(4), currentWeeklyKm: 0, continuousMin: 40 }, body: { health: health({ q8: true }, { pregnancy: { status: 'post_partum', dueOrBirthDate: addDays(START, -17 * 7), returnTest: { date: START, allDone: true, symptoms: false } } }) } },
  { name: 'régulier, « Je sais pas » → semi-marathon', goal: 'route_semi', experience: 'regulier', weeks: 20, request: { availability: days(4), currentWeeklyKm: 0 } },
];

function build(p: Persona): { draft: PlanDraft; weeks: { sessions: SessionDraft[] }[]; req: PlanRequest } {
  const g = GOALS[p.goal];
  const profile = deriveProfile({ experience: p.experience, today: START, ...p.body });
  const req: PlanRequest = {
    goal: p.goal, startDate: START, experience: p.experience, difficulty: 'equilibre', currentWeeklyKm: 0, availability: days(3),
    ...(p.weeks ? { race: { date: addDays(START, (p.weeks - 1) * 7 + 5), distanceKm: p.raceKm ?? g.defaultDistanceKm, elevationGainM: 0 } } : {}),
    screening: screen(p.body?.health, START), profile, ...p.request,
  };
  const draft = generatePlan(req);
  const weeks = draft.weeks.map((w, i) => buildWeekSessions(w, {
    goal: p.goal, family: draft.family, availability: req.availability, experience: req.experience, vdot: req.vdot, hrMaxEstimated: true, hasPoles: false,
    planWeek: i, phaseWeek: i - draft.weeks.findIndex((x) => x.phase === w.phase), race: req.race, profile,
  }));
  return { draft, weeks, req };
}

const isRun = (s: SessionDraft) => isRunType(s.type) && s.type !== 'repos';
const CONTINUOUS_OR_HARD = ['z1_recup', 'z2_endurance', 'longue_facile', 'longue_specifique', 'back_to_back', 'strides', 'hill_sprints', 'descentes', 'test', 'seuil', 'vo2max', 'tempo', 'cotes_longues', 'plyo'];
const LONG = ['longue_facile', 'longue_specifique'];

describe.each(PERSONAS)('persona : $name', (p) => {
  const { draft, weeks } = build(p);

  it('le plan est généré (ou refusé avec une explication)', () => {
    if (!draft.ok) expect(draft.warnings.length).toBeGreaterThan(0);
    expect(draft.ok).toBe(true);
    expect(draft.weeks.length).toBeGreaterThan(0);
  });

  it('1. aucune séance continue, longue, clé, strides ou test avant le palier 13 validé', () => {
    draft.weeks.forEach((w, i) => {
      const journey = w.runWalk?.sessions ?? [];
      if (!journey.length || journey.every((s) => s.stage > LADDER_LAST)) return;
      const bad = weeks[i]!.sessions.filter((s) => CONTINUOUS_OR_HARD.includes(s.type) || (s.isKey && s.type !== 'course'));
      expect(bad.map((s) => `${s.date} ${s.title}`), `semaine ${i}`).toEqual([]);
    });
  });

  it('2. temps de course : jamais plus de +25 % d’une séance à l’autre en marche/course, +10 % ensuite', () => {
    // Marche/course : séance par séance, comme l'échelle est construite.
    const ladder = draft.weeks.flatMap((w) => w.runWalk?.sessions ?? []).map((s) => stageRunMinutes(Math.min(s.stage, JOURNEY_DONE)));
    for (let i = 1; i < ladder.length; i++) if (ladder[i - 1]! > 0) expect(ladder[i]!, `séance ${i}`).toBeLessThanOrEqual(ladder[i - 1]! * 1.25 + 1e-9);
    // Ensuite : la plus longue séance de la semaine (+10 %, arrondie à la minute).
    let longest = Math.max(0, ...ladder);
    draft.weeks.forEach((w, i) => {
      if (w.runWalk || w.kind === 'course') return;
      const max = Math.max(0, ...weeks[i]!.sessions.filter(isRun).map((s) => s.durationMin));
      if (longest > 0) expect(max, `semaine ${i}`).toBeLessThanOrEqual(longest * 1.1 + 1);
      longest = Math.max(longest, max);
    });
  });

  it('3. la longue est toujours la plus longue sortie de la semaine', () => {
    draft.weeks.forEach((w, i) => {
      if (w.kind === 'course') return;
      const long = weeks[i]!.sessions.find((s) => LONG.includes(s.type));
      if (!long) return;
      for (const s of weeks[i]!.sessions.filter(isRun)) expect(s.durationMin, `semaine ${i} : ${s.title}`).toBeLessThanOrEqual(long.durationMin);
    });
  });

  it('4. volume hebdo jamais au-delà de +10 % du max des 4 dernières semaines (hors démarrage)', () => {
    draft.weeks.forEach((w, i) => {
      if (w.phase === 'demarrage' || i === 0) return;
      const ref = Math.max(...draft.weeks.slice(Math.max(0, i - 4), i).map((x) => x.targetKm));
      expect(w.targetKm, `semaine ${i}`).toBeLessThanOrEqual(ref * 1.1 + 0.05);
    });
  });

  it('5. toute restriction est accompagnée d’une Explanation', () => {
    const rules = draft.warnings.map((e) => e.ruleId);
    if (draft.start?.runWalk && !draft.start.evaluation) expect(rules).toContain(draft.start.explanation.ruleId);
    if (draft.start?.runWalk) expect(draft.start.explanation.ruleId).not.toBe('start.continuous');
    // Départ provisoire (évaluation à venir) : on ne juge pas encore l'objectif.
    if (draft.start?.evaluation) expect(rules).not.toContain('plan.unrealistic');
    if (draft.start?.evaluation) expect(rules).toContain('start.evaluation');
    if (draft.weeks.some((w) => w.easyOnly)) expect(rules.some((r) => r === 'plan.prudent' || r === 'profile.pregnancy')).toBe(true);
    for (const e of build(p).draft.warnings) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.why.length).toBeGreaterThan(0);
    }
    const prof = deriveProfile({ experience: p.experience, today: START, ...p.body });
    for (const e of prof.explanations) expect(rules).toContain(e.ruleId);
    draft.weeks.filter((w) => w.kind === 'decharge').forEach((w) => expect(w.notes.map((n) => n.ruleId)).toContain('week.deload'));
    draft.weeks.filter((w) => w.keySessions === 0 && w.kind === 'build' && !w.runWalk && w.phase !== 'base' && w.phase !== 'maintien').forEach((w) => {
      const why = [...w.notes.map((n) => n.ruleId), ...rules];
      expect(why.some((r) => ['week.twodays', 'plan.prudent', 'profile.pregnancy', 'profile.masters'].includes(r) || r.startsWith('start.') || w.easyOnly), `semaine ${w.index}`).toBe(true);
    });
  });
});
