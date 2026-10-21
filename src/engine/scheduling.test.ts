import { describe, expect, it } from 'vitest';
import { addDays, diffDays, weekday } from './dates';
import { GOALS } from './goals';
import { generatePlan, type PlanRequest } from './periodization';
import { buildWeekSessions, pickKeyDays, pickRunDays, qualityTypes, rescheduleJourney, validateMove, type SessionDraft, type WeekContext } from './scheduling';
import { isRunType } from './library';
import { screen } from './screening';
import type { Availability, GoalKind } from './types';

const avail: Availability = { runDaysPerWeek: 5, allowedDays: [1, 2, 3, 4, 5, 6, 7], longRunDay: 6, maxWeekdayMinutes: 90, maxWeekendMinutes: 300, strengthPerWeek: 2 };
const START = '2026-04-20';

function fullPlan(goal: GoalKind, over: Partial<PlanRequest> = {}, ctxOver: Partial<WeekContext> = {}) {
  const raceDate = '2026-10-24';
  const profile = GOALS[goal];
  const race = profile.family === 'route' || profile.family === 'trail' ? { date: raceDate, distanceKm: profile.defaultDistanceKm, elevationGainM: profile.defaultElevationM } : undefined;
  const req: PlanRequest = { goal, startDate: START, race, experience: 'regulier', difficulty: 'equilibre', currentWeeklyKm: 30, availability: avail, vdot: 45, ...over };
  const plan = generatePlan(req);
  const weeks = plan.weeks.map((w, i) => {
    const phaseStart = plan.weeks.findIndex((x) => x.phase === w.phase);
    const ctx: WeekContext = {
      goal, family: plan.family, availability: req.availability, experience: req.experience, vdot: req.vdot, hrMaxEstimated: true, hasPoles: true,
      planWeek: i, phaseWeek: i - phaseStart, race: req.race, ...ctxOver,
    };
    return { week: w, ...buildWeekSessions(w, ctx) };
  });
  return { plan, weeks };
}

const runKm = (s: SessionDraft[]) => s.filter((x) => isRunType(x.type) && x.type !== 'course').reduce((a, x) => a + (x.distanceKm ?? 0), 0);

describe('choix des jours', () => {
  it('étale les sorties autour de la longue', () => {
    expect(pickRunDays({ ...avail, runDaysPerWeek: 3 })).toEqual([2, 4, 6]);
    expect(pickRunDays({ ...avail, runDaysPerWeek: 7 })).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('ajoute le jour de la longue même s’il n’est pas coché, et respecte les jours permis', () => {
    expect(pickRunDays({ ...avail, runDaysPerWeek: 3, allowedDays: [1, 3], longRunDay: 7 })).toEqual([1, 3, 7]);
  });
  it('espace les séances clés de 48 h et évite la veille de la longue', () => {
    expect(pickKeyDays([1, 2, 3, 4, 6], 6, 2, true)).toEqual([2, 4]);
    expect(pickKeyDays([1, 2, 3, 4, 6], 6, 3, true)).toEqual([2, 4]);
    expect(pickKeyDays([1, 2, 3, 4, 5, 6, 7], 1, 2, false)).toEqual([4, 6]); // longue lundi : jamais le dimanche
  });
});

describe('types de qualité', () => {
  const week = generatePlan({ goal: 'route_10k', startDate: START, race: { date: '2026-10-24', distanceKm: 10, elevationGainM: 0 }, experience: 'regulier', difficulty: 'equilibre', currentWeeklyKm: 30, availability: avail }).weeks.find((w) => w.phase === 'spec2')!;
  const ctx = { goal: 'route_10k' as const, family: 'route' as const, availability: avail, experience: 'regulier' as const, hrMaxEstimated: false, hasPoles: false, phaseWeek: 0 };
  it('pas de VO2max avant 4 semaines de base (sauf avancé)', () => {
    expect(qualityTypes({ ...ctx, planWeek: 2 }, week, 2)).not.toContain('vo2max');
    expect(qualityTypes({ ...ctx, planWeek: 2, experience: 'avance' }, week, 2)).toContain('vo2max');
  });
  it('au plus un VO2max par semaine', () => {
    expect(qualityTypes({ ...ctx, planWeek: 10 }, week, 3).filter((q) => q === 'vo2max')).toHaveLength(1);
  });
});

describe.each(['trail_moyen', 'trail_court', 'ultra', 'route_5k', 'route_10k', 'route_semi', 'route_marathon'] as GoalKind[])('plan complet %s', (goal) => {
  const { weeks } = fullPlan(goal);

  it('volume de course proche de la cible chaque semaine', () => {
    for (const { week, sessions } of weeks) {
      const km = runKm(sessions);
      expect(Math.abs(km - week.targetKm) / week.targetKm, `${week.startDate} ${km} vs ${week.targetKm}`).toBeLessThan(0.15);
    }
  });
  it('séances clés espacées de 48 h, jamais la veille de la longue', () => {
    for (const { sessions } of weeks) {
      const keys = sessions.filter((s) => s.isKey && s.type !== 'course');
      for (let i = 1; i < keys.length; i++) expect(diffDays(keys[i - 1]!.date, keys[i]!.date)).toBeGreaterThanOrEqual(2);
      const long = sessions.find((s) => s.type.startsWith('longue') || (s.type === 'back_to_back' && s.isKey));
      if (long) for (const k of keys) expect(diffDays(k.date, long.date)).not.toBe(1);
    }
  });
  it('respecte le nombre de séances clés prévu et un VO2max max', () => {
    for (const { week, sessions } of weeks) {
      const keys = sessions.filter((s) => s.isKey);
      if (!sessions.some((s) => s.type === 'test')) expect(keys.length).toBeLessThanOrEqual(Math.max(week.keySessions, 1));
      expect(sessions.filter((s) => s.type === 'vo2max').length).toBeLessThanOrEqual(1);
    }
  });
  it('7 jours planifiés, course le jour J, pas de muscu la veille de la longue', () => {
    for (const { week, sessions } of weeks) {
      expect(new Set(sessions.map((s) => s.date)).size).toBe(7);
      const strength = sessions.filter((s) => s.type.startsWith('muscu') || s.type === 'plyo');
      for (const s of strength) expect(weekday(s.date)).not.toBe(5);
      if (week.raceDate) expect(sessions.find((s) => s.date === week.raceDate)!.type).toBe('course');
    }
  });
  it('chaque séance a un pourquoi et une version minimale', () => {
    for (const { sessions } of weeks) for (const s of sessions) {
      expect(s.why.length).toBeGreaterThan(10);
      expect(s.minimal).toBeDefined();
    }
  });
});

describe('spécificités', () => {
  it('trail : back-to-back en phase pic, test de calibration en semaine 2, descentes en spécifique', () => {
    const { weeks } = fullPlan('trail_moyen');
    const all = weeks.flatMap((w) => w.sessions);
    expect(all.filter((s) => s.type === 'back_to_back').length).toBeGreaterThan(0);
    expect(weeks[1]!.sessions.some((s) => s.type === 'test')).toBe(true);
    expect(weeks[1]!.notes.map((n) => n.ruleId)).toContain('week.test');
    expect(weeks.filter((w) => w.week.phase === 'base').flatMap((w) => w.sessions).some((s) => s.type === 'descentes')).toBe(false);
    expect(weeks.filter((w) => w.week.phase === 'spec1').flatMap((w) => w.sessions).some((s) => s.type === 'descentes')).toBe(true);
    expect(all.some((s) => s.type === 'muscu_trail')).toBe(true);
    expect(all.some((s) => s.type === 'plyo')).toBe(true);
    const gain = weeks[18]!.sessions.reduce((a, s) => a + (s.elevationGainM ?? 0), 0);
    expect(Math.abs(gain - weeks[18]!.week.targetElevationM)).toBeLessThan(100);
  });
  it('pas de test si la FCmax a été mesurée', () => {
    const { weeks } = fullPlan('trail_moyen', {}, { hrMaxEstimated: false });
    expect(weeks.flatMap((w) => w.sessions).some((s) => s.type === 'test')).toBe(false);
  });
  it('route semi/marathon : longue spécifique en pic, allure course', () => {
    const all = fullPlan('route_marathon', { currentWeeklyKm: 45 }).weeks.flatMap((w) => w.sessions);
    expect(all.some((s) => s.type === 'longue_specifique')).toBe(true);
    expect(all.some((s) => s.type === 'tempo')).toBe(true);
    expect(all.some((s) => s.type === 'back_to_back')).toBe(false);
  });
  it('courir de zéro : uniquement marche-course, repos et muscu', () => {
    const { weeks } = fullPlan('debuter', { currentWeeklyKm: 0, experience: 'jamais', vdot: undefined, availability: { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6], strengthPerWeek: 1 } });
    const types = new Set(weeks.flatMap((w) => w.sessions.map((s) => s.type)));
    expect([...types].every((t) => ['marche_course', 'repos', 'muscu_generale'].includes(t))).toBe(true);
    expect(weeks[0]!.sessions.filter((s) => s.type === 'marche_course')).toHaveLength(3);
    expect(weeks[0]!.sessions[1]!.title).toBe('Marche-course 14 × (30 s course / 1 min marche)');
    const last = weeks.at(-1)!.sessions.filter((s) => s.type === 'marche_course').at(-1)!;
    expect(last.title).toMatch(/^(Course continue \d+ min|Marche-course)/);
  });
  it('récup post-course : Z1 puis Z2, sans qualité ni muscu', async () => {
    const { generateRecovery } = await import('./periodization');
    const rec = generateRecovery({ date: '2026-10-24', distanceKm: 43 }, 65);
    const ctx: WeekContext = { goal: 'trail_moyen', family: 'trail', availability: avail, experience: 'regulier', vdot: 45, hrMaxEstimated: false, hasPoles: true, planWeek: 0, phaseWeek: 0 };
    const w0 = buildWeekSessions(rec[0]!, ctx).sessions;
    expect(w0.some((s) => s.isKey || s.type.startsWith('muscu'))).toBe(false);
    expect(w0.filter((s) => isRunType(s.type)).every((s) => s.type === 'z1_recup' || s.type === 'longue_facile')).toBe(true);
    const w1 = buildWeekSessions(rec[1]!, { ...ctx, phaseWeek: 1 }).sessions;
    expect(w1.some((s) => s.type === 'z2_endurance')).toBe(true);
  });
  it('peu de jours disponibles : moins de séances clés et explication', () => {
    const tight = { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6] as Availability['allowedDays'] };
    const { weeks } = fullPlan('trail_moyen', { availability: tight, experience: 'avance', difficulty: 'ambitieux' });
    expect(weeks.flatMap((w) => w.notes).some((n) => n.ruleId === 'week.keys.days' || n.ruleId === 'week.keys.spacing')).toBe(true);
  });
  it('volume trop faible pour toutes les sorties : on retire des jours plutôt que des miettes', () => {
    const { weeks } = fullPlan('route_10k', { currentWeeklyKm: 12, availability: { ...avail, runDaysPerWeek: 6 } });
    const first = weeks[0]!.sessions.filter((s) => isRunType(s.type));
    expect(first.every((s) => (s.distanceKm ?? 0) >= 3)).toBe(true);
    expect(first.length).toBeLessThan(6);
  });
  it('toutes les sorties prises par la qualité : avertissement de volume', () => {
    const tiny = { ...avail, runDaysPerWeek: 2, allowedDays: [2, 6] as Availability['allowedDays'] };
    const { weeks } = fullPlan('route_marathon', { availability: tiny, currentWeeklyKm: 40, experience: 'avance' });
    // Le plan plafonne d'abord le volume à ce que 2 sorties peuvent contenir, et le dit…
    expect(weeks.flatMap((w) => w.week.notes).some((n) => n.ruleId === 'week.sessioncap')).toBe(true);
    // …donc la semaine planifiée colle à la cible plafonnée.
    for (const { week, sessions } of weeks) expect(Math.abs(runKm(sessions) - week.targetKm)).toBeLessThan(week.targetKm * 0.25 + 3);
  });
  it('course B dans la semaine : course le jour J, repos autour', () => {
    const plan = generatePlan({ goal: 'trail_moyen', startDate: START, race: { date: '2026-10-24', distanceKm: 43, elevationGainM: 1500 }, experience: 'regulier', difficulty: 'equilibre', currentWeeklyKm: 30, availability: avail, bRaces: [{ date: '2026-06-06', distanceKm: 30 }] });
    const w = plan.weeks.find((x) => x.bRaceDate)!;
    const { sessions } = buildWeekSessions(w, { goal: 'trail_moyen', family: 'trail', availability: avail, experience: 'regulier', vdot: 45, hrMaxEstimated: false, hasPoles: true, planWeek: w.index, phaseWeek: 2, bRace: { date: '2026-06-06', distanceKm: 30 } });
    expect(sessions.find((s) => s.date === '2026-06-06')!.type).toBe('course');
    expect(sessions.find((s) => s.date === '2026-06-05')!.type).toBe('repos');
    expect(sessions.find((s) => s.date === '2026-06-03')!.type).toBe('tempo');
  });
  it('semaine entamée : ne planifie pas les jours passés', () => {
    const plan = generatePlan({ goal: 'route_10k', startDate: START, race: { date: '2026-10-24', distanceKm: 10, elevationGainM: 0 }, experience: 'regulier', difficulty: 'equilibre', currentWeeklyKm: 30, availability: avail });
    const { sessions } = buildWeekSessions(plan.weeks[0]!, { goal: 'route_10k', family: 'route', availability: avail, experience: 'regulier', hrMaxEstimated: false, hasPoles: false, planWeek: 0, phaseWeek: 0, fromDate: '2026-04-23' });
    expect(sessions.every((s) => s.date >= '2026-04-23')).toBe(true);
  });
  it('longue le dimanche : pas de back-to-back possible le lundi', () => {
    const { weeks } = fullPlan('ultra', { availability: { ...avail, longRunDay: 7 } });
    expect(weeks.flatMap((w) => w.sessions).some((s) => s.type === 'back_to_back')).toBe(false);
  });
});

describe('validation d’un déplacement', () => {
  const week = [
    { id: 'a', date: '2026-10-13', type: 'seuil' as const, isKey: true },
    { id: 'b', date: '2026-10-15', type: 'z2_endurance' as const, isKey: false },
    { id: 'c', date: '2026-10-17', type: 'longue_facile' as const, isKey: false },
    { id: 'd', date: '2026-10-16', type: 'descentes' as const, isKey: false },
    { id: 'e', date: '2026-10-18', type: 'course' as const, isKey: true },
    { id: 'f', date: '2026-10-12', type: 'vo2max' as const, isKey: true },
    { id: 'g', date: '2026-10-14', type: 'cotes_longues' as const, isKey: true },
  ];
  const ids = (r: { ruleId: string }[]) => r.map((x) => x.ruleId);

  it('signale deux séances clés à moins de 48 h', () => {
    expect(ids(validateMove(week, 'a', '2026-10-13'))).toContain('move.keys48h');
  });
  it('signale une qualité la veille de la longue', () => {
    expect(ids(validateMove(week, 'g', '2026-10-16'))).toContain('move.beforelong');
  });
  it('signale des descentes la veille d’une séance dure', () => {
    expect(ids(validateMove(week, 'd', '2026-10-16'))).toContain('move.descents');
  });
  it('refuse le jour de course', () => {
    expect(ids(validateMove(week, 'b', '2026-10-18'))).toContain('move.raceday');
  });
  it('signale deux sorties le même jour', () => {
    expect(ids(validateMove(week, 'b', '2026-10-17'))).toContain('move.sameday');
  });
  it('signale trop de séances clés dans la semaine', () => {
    const many = [...week, { id: 'h', date: '2026-10-19', type: 'seuil' as const, isKey: true }];
    expect(ids(validateMove(many, 'h', '2026-10-16'))).toContain('move.toomanykeys');
  });
  it('accepte un déplacement sain et ignore un id inconnu', () => {
    expect(validateMove(week, 'b', '2026-10-15')).toEqual([]);
    expect(validateMove(week, 'zzz', '2026-10-15')).toEqual([]);
  });
});

describe('cas d’espacement', () => {
  it('aucun jour à 48 h de la longue clé : séance retirée et expliquée', () => {
    const av = { ...avail, runDaysPerWeek: 3, allowedDays: [5, 6, 7] as Availability['allowedDays'] };
    const plan = generatePlan({ goal: 'trail_moyen', startDate: START, race: { date: '2026-10-24', distanceKm: 43, elevationGainM: 1500 }, experience: 'regulier', difficulty: 'equilibre', currentWeeklyKm: 30, availability: av });
    const w = plan.weeks.find((x) => x.phase === 'spec2' && x.kind === 'build')!;
    const r = buildWeekSessions(w, { goal: 'trail_moyen', family: 'trail', availability: av, experience: 'regulier', vdot: 45, hrMaxEstimated: false, hasPoles: true, planWeek: 18, phaseWeek: 0 });
    expect(r.notes.map((n) => n.ruleId)).toContain('week.keys.spacing');
  });
});

describe('back-to-back', () => {
  it('ajoute le lendemain de la longue s’il est permis mais pas déjà choisi', () => {
    const av = { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6, 7] as Availability['allowedDays'] };
    const { weeks } = fullPlan('trail_moyen', { availability: av });
    const w = weeks.find((x) => x.sessions.some((s) => s.type === 'back_to_back' && !s.isKey))!;
    expect(w.sessions.find((s) => weekday(s.date) === 7)!.type).toBe('back_to_back');
  });
});

describe('back-to-back sur 7 jours', () => {
  it('remplace la sortie prévue le lendemain', () => {
    const { weeks } = fullPlan('trail_moyen', { availability: { ...avail, runDaysPerWeek: 7 } });
    const w = weeks.find((x) => x.sessions.some((s) => s.type === 'back_to_back' && !s.isKey))!;
    expect(w.sessions.filter((s) => weekday(s.date) === 7 && isRunType(s.type))).toHaveLength(1);
  });
});

describe('cohérence des sorties dans la semaine', () => {
  it('aucune sortie facile n’est plus longue que la sortie longue de la semaine', () => {
    const { weeks } = fullPlan('route_5k', { experience: 'debutant', currentWeeklyKm: 15, longestRecentRunKm: 3.2, availability: { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6] } });
    for (const { week, sessions } of weeks) {
      if (week.kind === 'taper' || week.kind === 'course' || !week.longRunKm) continue;
      const easy = sessions.filter((s) => s.type === 'z2_endurance' || s.type === 'strides' || s.type === 'z1_recup');
      for (const s of easy) expect(s.distanceKm ?? 0, `${s.date} ${s.title}`).toBeLessThanOrEqual(Math.max(week.longRunKm, 3) + 1.2);
    }
  });
  it('première semaine du débutant en course continue : rien au-dessus de ~4,5 km', () => {
    // Sans VDOT (7 min/km), 3,2 km ≈ 22 min : au-dessus du seuil de 20 min, donc pas de marche/course.
    const { weeks } = fullPlan('route_5k', { experience: 'debutant', currentWeeklyKm: 15, longestRecentRunKm: 3.2, vdot: undefined, availability: { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6] } });
    expect(weeks[0]!.week.phase).toBe('base');
    for (const s of weeks[0]!.sessions.filter((x) => x.distanceKm)) expect(s.distanceKm!).toBeLessThanOrEqual(4.5);
  });
});

describe('débutant : ni test à fond ni séance dure plus longue que la longue', () => {
  const novice = { experience: 'debutant' as const, currentWeeklyKm: 15, longestRecentRunKm: 3.2, vdot: undefined, availability: { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6] as Availability['allowedDays'] } };
  it('pas de test 3 km chrono', () => {
    const { weeks } = fullPlan('route_5k', novice);
    expect(weeks.flatMap((w) => w.sessions).some((s) => s.type === 'test')).toBe(false);
  });
  it('aucune séance de course de la 1re semaine ne dépasse la longue + marge', () => {
    const { weeks } = fullPlan('route_5k', novice);
    const w0 = weeks[0]!;
    for (const s of w0.sessions.filter((x) => x.distanceKm)) expect(s.distanceKm!).toBeLessThanOrEqual(Math.max(w0.week.longRunKm * 1.3, 4.5));
  });
  it('une séance dure trop longue est remplacée par du facile, avec explication', () => {
    const { weeks } = fullPlan('route_5k', novice);
    const notes = weeks.flatMap((w) => w.notes).map((n) => n.ruleId);
    expect(notes).toContain('week.quality.light');
    const w = weeks.find((x) => x.notes.some((n) => n.ruleId === 'week.quality.light'))!;
    expect(w.sessions.some((s) => s.isKey && s.type !== 'course')).toBe(false);
  });
  it('un coureur confirmé garde ses séances dures et son test', () => {
    const { weeks } = fullPlan('route_10k', { experience: 'regulier', currentWeeklyKm: 40, longestRecentRunKm: 14 });
    expect(weeks[1]!.sessions.some((s) => s.type === 'test')).toBe(true);
    expect(weeks.flatMap((w) => w.notes).map((n) => n.ruleId)).not.toContain('week.quality.light');
  });
});

describe('T3 — semaines de démarrage', () => {
  const zero = { experience: 'jamais' as const, currentWeeklyKm: 0, vdot: undefined, availability: { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6] as Availability['allowedDays'] } };
  const forbidden = ['longue_facile', 'longue_specifique', 'back_to_back', 'strides', 'hill_sprints', 'descentes', 'test', 'plyo'];

  it('jamais couru + 5 km en 10 semaines : ni longue, ni strides, ni test, ni séance clé pendant le démarrage (F1)', () => {
    const { weeks } = fullPlan('route_5k', zero);
    const demarrage = weeks.filter((w) => w.week.phase === 'demarrage');
    expect(demarrage.length).toBeGreaterThan(0);
    for (const { sessions } of demarrage) {
      for (const s of sessions) {
        expect(forbidden, `${s.date} ${s.title}`).not.toContain(s.type);
        if (s.type !== 'course') expect(s.isKey).toBe(false);
      }
    }
  });
  it('le jour de la longue est une marche/course au même palier, +10 min de marche', async () => {
    const { weeks } = fullPlan('route_5k', zero);
    const { stageDurationMinutes } = await import('./runwalk');
    const saturday = weeks[0]!.sessions.find((s) => s.type === 'marche_course' && weekday(s.date) === 6)!;
    const stage = weeks[0]!.week.runWalk!.sessions.at(-1)!.stage;
    expect(saturday.durationMin).toBe(stageDurationMinutes(stage) + 10);
  });
  it('régulier sans info de capacité : pas de test en semaine 2 pendant le démarrage (F9)', () => {
    const { weeks } = fullPlan('route_semi', { experience: 'regulier', currentWeeklyKm: 0 });
    expect(weeks[1]!.week.phase).toBe('demarrage');
    expect(weeks.filter((w) => w.week.phase === 'demarrage').flatMap((w) => w.sessions).some((s) => s.type === 'test')).toBe(false);
  });
  it('au plus 3 séances, jamais deux jours de suite ; les jours en plus deviennent marche ou vélo', () => {
    const { weeks } = fullPlan('route_5k', { ...zero, availability: { ...avail, runDaysPerWeek: 6, allowedDays: [1, 2, 3, 4, 5, 6] } });
    const runs = weeks[0]!.sessions.filter((s) => s.type === 'marche_course');
    expect(runs).toHaveLength(3);
    for (let i = 1; i < runs.length; i++) expect(diffDays(runs[i - 1]!.date, runs[i]!.date)).toBeGreaterThanOrEqual(2);
    expect(weeks[0]!.sessions.filter((s) => s.type === 'croise').length).toBeGreaterThan(0);
  });
  it('seulement muscu générale, jamais de plyo', () => {
    const { weeks } = fullPlan('route_5k', { ...zero, availability: { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6], strengthPerWeek: 2 } });
    const strength = weeks.filter((w) => w.week.phase === 'demarrage').flatMap((w) => w.sessions).filter((s) => s.type.startsWith('muscu') || s.type === 'plyo');
    expect(strength.length).toBeGreaterThan(0);
    expect(strength.every((s) => s.type === 'muscu_generale')).toBe(true);
  });
  it('strides et sprints seulement à partir de 30 min de course continue, même hors marche/course', () => {
    const { weeks } = fullPlan('route_5k', { experience: 'debutant', currentWeeklyKm: 10, longestRecentRunKm: 3.5, vdot: undefined, availability: { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6] } });
    for (const { week, sessions } of weeks) {
      if (week.longRunKm * 7 < 30) expect(sessions.some((s) => s.type === 'strides' || s.type === 'hill_sprints'), week.startDate).toBe(false);
    }
  });
});

describe('jours de démarrage', () => {
  it('maximise le nombre de séances sans jamais deux jours de suite', async () => {
    const { journeyDays } = await import('./scheduling');
    expect(journeyDays({ ...avail, runDaysPerWeek: 3, allowedDays: [5, 6, 7], longRunDay: 6 })).toEqual([5, 7]);
    expect(journeyDays({ ...avail, runDaysPerWeek: 5 })).toHaveLength(3);
    expect(journeyDays({ ...avail, runDaysPerWeek: 2, allowedDays: [2, 4, 6] })).toEqual([2, 6]);
    expect(journeyDays({ ...avail, runDaysPerWeek: 1, allowedDays: [3], longRunDay: 3 })).toEqual([3]);
  });
});

describe('T3 — course pendant le démarrage (semaine construite à la main)', () => {
  const ctx: WeekContext = { goal: 'route_5k', family: 'route', availability: { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6] }, experience: 'jamais', hrMaxEstimated: true, hasPoles: false, planWeek: 8, phaseWeek: 8, race: { date: '2026-11-07', distanceKm: 5 } };
  const week = (stage: number) => ({
    index: 8, startDate: '2026-11-02', phase: 'demarrage' as const, kind: 'course' as const, targetKm: 10, targetElevationM: 0, keySessions: 0, longRunKm: 3, notes: [],
    runWalk: { sessions: [{ stage, validatedAtStage: 0 }, { stage, validatedAtStage: 1 }, { stage, validatedAtStage: 1 }] },
  });
  it('la course se fait en marche/course au palier courant, sans « allure course », pas la veille', () => {
    const { sessions, notes } = buildWeekSessions(week(6), ctx);
    const race = sessions.find((s) => s.date === '2026-11-07')!;
    expect(race.type).toBe('course');
    expect(race.title).toBe('Course : 5 km en marche/course');
    expect(race.steps[0]!.note).toMatch(/3 min de course et 1 min de marche/);
    expect(sessions.some((s) => s.type === 'tempo')).toBe(false);
    expect(sessions.find((s) => s.date === '2026-11-06')!.type).toBe('repos');
    expect(sessions.filter((s) => s.type === 'marche_course').length).toBeLessThanOrEqual(2);
    expect(notes.map((n) => n.ruleId)).toContain('week.runwalk.race');
  });
  it('libellé selon le palier : marche, intervalles courts, course continue', () => {
    const note = (stage: number) => buildWeekSessions(week(stage), ctx).sessions.find((s) => s.type === 'course')!.steps[0]!.note;
    expect(note(0)).toMatch(/en marchant/);
    expect(note(1)).toMatch(/30 s de course/);
    expect(note(15)).toMatch(/course continue/);
  });
  it('durée estimée cohérente : plus lente en marche/course qu’en continu', () => {
    const dur = (stage: number) => buildWeekSessions(week(stage), ctx).sessions.find((s) => s.type === 'course')!.durationMin;
    expect(dur(0)).toBeGreaterThan(dur(6));
    expect(dur(6)).toBeGreaterThan(dur(15));
  });
});

describe('T3 — cas particuliers de la semaine de démarrage', () => {
  const week = { index: 0, startDate: '2026-11-02', phase: 'demarrage' as const, kind: 'build' as const, targetKm: 10, targetElevationM: 0, keySessions: 0, longRunKm: 3, notes: [], runWalk: { sessions: [{ stage: 3, validatedAtStage: 0 }, { stage: 3, validatedAtStage: 1 }, { stage: 4, validatedAtStage: 0 }] } };
  const ctx: WeekContext = { goal: 'route_5k', family: 'route', availability: { ...avail, runDaysPerWeek: 5, allowedDays: [1, 2, 3, 4, 5, 6, 7] }, experience: 'jamais', hrMaxEstimated: true, hasPoles: false, planWeek: 0, phaseWeek: 0 };
  it('semaine entamée : rien avant aujourd’hui', () => {
    const { sessions } = buildWeekSessions(week, { ...ctx, fromDate: '2026-11-05' });
    expect(sessions.every((s) => s.date >= '2026-11-05')).toBe(true);
  });
  it('semaine de course : les jours en plus restent avant la veille de la course', () => {
    const { sessions } = buildWeekSessions(week, { ...ctx, race: { date: '2026-11-07', distanceKm: 5 } });
    const extras = sessions.filter((s) => s.type === 'croise');
    expect(extras.every((s) => s.date < '2026-11-06')).toBe(true);
  });
});

describe('semaine sans sortie longue prévue', () => {
  it('pas de longue fantôme à 0 km', () => {
    const week = { index: 3, startDate: '2026-11-02', phase: 'base' as const, kind: 'build' as const, targetKm: 12, targetElevationM: 0, keySessions: 0, longRunKm: 0, notes: [] };
    const { sessions } = buildWeekSessions(week, { goal: 'route_10k', family: 'route', availability: avail, experience: 'regulier', hrMaxEstimated: false, hasPoles: false, planWeek: 3, phaseWeek: 3 });
    expect(sessions.some((s) => s.type.startsWith('longue'))).toBe(false);
  });
});

describe('T4 — démarrage jamais tronqué, objectif course adapté', () => {
  const three = { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6] as Availability['allowedDays'] };
  const isContinuousRun = (s: SessionDraft) => isRunType(s.type) && !['marche_course', 'course', 'repos'].includes(s.type);

  it('débutant qui court 4 min, 10 km dans 12 semaines : avertissement et aucune course continue avant le palier 13 (F2)', () => {
    const { plan, weeks } = fullPlan('route_10k', { experience: 'debutant', currentWeeklyKm: 0, continuousMin: 4, vdot: undefined, availability: three, race: { date: addDays(START, 11 * 7 + 5), distanceKm: 10, elevationGainM: 0 } });
    expect(plan.warnings.map((w) => w.ruleId)).toContain('plan.runwalk.short');
    expect(plan.options).toEqual(['course_en_marche_course', 'decaler']);
    let reached13 = false;
    for (const { week, sessions } of weeks) {
      if (!reached13) for (const s of sessions) expect(isContinuousRun(s), `${s.date} ${s.title}`).toBe(false);
      if (week.runWalk?.sessions.some((x) => x.stage >= 13) || !week.runWalk) reached13 = true;
    }
  });
  it('course pendant le démarrage : pas d’affûtage, course en marche/course, pas d’« allure course » (F10)', () => {
    const { plan, weeks } = fullPlan('route_5k', { experience: 'jamais', currentWeeklyKm: 0, vdot: undefined, availability: three, race: { date: addDays(START, 9 * 7 + 5), distanceKm: 5, elevationGainM: 0 } });
    expect(plan.weeks.every((w) => w.phase === 'demarrage')).toBe(true);
    const last = weeks.at(-1)!;
    expect(last.week.kind).toBe('course');
    const race = last.sessions.find((s) => s.type === 'course')!;
    expect(race.title).toMatch(/en marche\/course/);
    expect(weeks.flatMap((w) => w.sessions).some((s) => s.type === 'tempo')).toBe(false);
  });
  it('assez de temps : démarrage, puis 4 semaines de base SANS séance clé, puis les phases de l’objectif', () => {
    const { plan, weeks } = fullPlan('route_5k', { experience: 'jamais', currentWeeklyKm: 0, vdot: undefined, availability: three, race: { date: addDays(START, 29 * 7 + 5), distanceKm: 5, elevationGainM: 0 } });
    expect(plan.warnings.map((w) => w.ruleId)).not.toContain('plan.runwalk.short');
    const dem = plan.weeks.filter((w) => w.phase === 'demarrage').length;
    expect(dem).toBe(12); // 36 séances ÷ 3 par semaine
    expect(plan.weeks.slice(dem, dem + 4).every((w) => w.phase === 'base' && w.keySessions === 0)).toBe(true);
    expect(weeks.slice(dem, dem + 4).flatMap((w) => w.sessions).some((s) => s.isKey)).toBe(false);
    expect(plan.weeks.slice(dem + 4).some((w) => w.keySessions > 0)).toBe(true);
    expect(plan.weeks.slice(0, dem + 4).some((w) => ['spec1', 'spec2', 'precomp'].includes(w.phase))).toBe(false);
  });
  it('2 jours par semaine : le démarrage dure plus longtemps (on compte en séances)', () => {
    const two = { ...avail, runDaysPerWeek: 2, allowedDays: [2, 6] as Availability['allowedDays'] };
    const d = (av: Availability) => fullPlan('route_5k', { experience: 'jamais', currentWeeklyKm: 0, vdot: undefined, availability: av, race: { date: addDays(START, 40 * 7 + 5), distanceKm: 5, elevationGainM: 0 } }).plan.weeks.filter((w) => w.phase === 'demarrage').length;
    expect(d(two)).toBe(18); // 36 séances ÷ 2
    expect(d(three)).toBe(12);
  });
});

describe('T5 — volume débloqué après le démarrage, la longue reste la plus longue', () => {
  const three = { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6] as Availability['allowedDays'] };
  const cases: [string, GoalKind, Partial<PlanRequest>][] = [
    ['jamais couru, 5 km en 16 semaines', 'route_5k', { experience: 'jamais', currentWeeklyKm: 0, vdot: undefined, availability: three, race: { date: addDays(START, 16 * 7 - 2), distanceKm: 5, elevationGainM: 0 } }],
    ['jamais couru, 5 km en 30 semaines', 'route_5k', { experience: 'jamais', currentWeeklyKm: 0, vdot: undefined, availability: three, race: { date: addDays(START, 30 * 7 - 2), distanceKm: 5, elevationGainM: 0 } }],
    ['débutant (longue 2,5 km), 10 km en 24 semaines', 'route_10k', { experience: 'debutant', currentWeeklyKm: 7.5, longestRecentRunKm: 2.5, vdot: undefined, availability: three, race: { date: addDays(START, 24 * 7 - 2), distanceKm: 10, elevationGainM: 0 } }],
    ['débutant qui court 20 min, 5 km', 'route_5k', { experience: 'debutant', currentWeeklyKm: 8, longestRecentRunKm: 3, vdot: undefined, availability: three }],
  ];

  it.each(cases)('%s : le volume augmente au moins toutes les 3 semaines hors décharge (F6)', (_, goal, over) => {
    const { plan } = fullPlan(goal, over);
    const growth = plan.weeks.filter((w) => w.phase !== 'demarrage' && w.phase !== 'taper' && w.kind === 'build');
    expect(growth.length).toBeGreaterThan(0);
    for (let i = 0; i + 3 < growth.length; i++) {
      if (growth[i]!.targetKm >= plan.targetPeakKm) continue;
      expect(Math.max(...growth.slice(i + 1, i + 4).map((w) => w.targetKm)), `semaine ${growth[i]!.index}`).toBeGreaterThan(growth[i]!.targetKm);
    }
    // La longue n'est plus figée : elle dépasse la plus longue sortie de départ.
    const longs = plan.weeks.filter((w) => w.phase !== 'demarrage').map((w) => w.longRunKm);
    expect(Math.max(...longs)).toBeGreaterThan(longs[0]!);
  });

  it.each(cases)('%s : chaque semaine, la longue dure au moins autant que toute autre sortie (F7)', (_, goal, over) => {
    const { weeks } = fullPlan(goal, over);
    for (const { week, sessions } of weeks) {
      const long = sessions.find((s) => s.type === 'longue_facile' || s.type === 'longue_specifique');
      if (!long || week.kind === 'course') continue;
      for (const s of sessions.filter((x) => isRunType(x.type) && x !== long)) expect(s.durationMin ?? 0, `${s.date} ${s.title} vs ${long.title}`).toBeLessThanOrEqual(long.durationMin ?? 0);
    }
  });

  it('confirmé, toutes distances : la longue reste la plus longue, décharge et affûtage compris', () => {
    for (const goal of ['route_5k', 'route_10k', 'route_semi', 'route_marathon', 'trail_court', 'trail_moyen'] as GoalKind[]) {
      const { weeks } = fullPlan(goal, { currentWeeklyKm: 40, longestRecentRunKm: 14 });
      for (const { week, sessions } of weeks) {
        const long = sessions.find((s) => s.type === 'longue_facile' || s.type === 'longue_specifique');
        if (!long || week.kind === 'course') continue;
        for (const s of sessions.filter((x) => isRunType(x.type) && x !== long)) expect(s.durationMin ?? 0, `${goal} ${s.date} ${s.title}`).toBeLessThanOrEqual(long.durationMin ?? 0);
      }
    }
  });

  it('la longue croît de 10 % au plus d’une semaine à l’autre, sans pas minimum', () => {
    const { plan } = fullPlan('route_10k', { experience: 'debutant', currentWeeklyKm: 15, longestRecentRunKm: 3.3, vdot: undefined, availability: three });
    expect(plan.weeks[0]!.phase).toBe('base');
    let longest = 3.3;
    for (const w of plan.weeks) {
      expect(w.longRunKm, `semaine ${w.index}`).toBeLessThanOrEqual(Math.round(longest * 1.1 * 10) / 10 + 1e-9);
      longest = Math.max(longest, w.longRunKm);
    }
    expect(plan.weeks[0]!.longRunKm).toBe(3.6); // 3,3 × 1,1 = 3,63 → 3,6 (0,1 km inférieur), plus de pas minimum
  });

  it('volume limité par les sorties : expliqué', () => {
    const { plan } = fullPlan('route_10k', { experience: 'debutant', currentWeeklyKm: 15, longestRecentRunKm: 3.3, vdot: undefined, availability: three });
    const note = plan.weeks.flatMap((w) => w.notes).find((n) => n.ruleId === 'week.sessioncap')!;
    expect(note.why).toContain('10 %');
  });
});

describe('T7 — re-projection des séances marche/course depuis le réalisé', () => {
  const ctx = { goal: 'debuter' as GoalKind, family: 'debuter' as const, vdot: undefined, availability: { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6] as Availability['allowedDays'] } };
  const slots = [
    { id: 'a', date: '2026-04-21', weekStart: '2026-04-20' },
    { id: 'c', date: '2026-04-25', weekStart: '2026-04-20' },
    { id: 'b', date: '2026-04-23', weekStart: '2026-04-20' },
    { id: 'd', date: '2026-04-28', weekStart: '2026-04-27' },
    { id: 'e', date: '2026-04-30', weekStart: '2026-04-27', raceWeek: true },
  ];
  it('chaque séance au palier projeté depuis l’état réel, dans l’ordre des dates', () => {
    const r = rescheduleJourney({ stage: 5, validatedAtStage: 1, failsAtStage: 0 }, slots, ctx);
    expect(r.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(r.map((x) => x.stage)).toEqual([5, 6, 6, 7, 7]);
    expect(r.every((x) => x.session.type === 'marche_course' && !x.session.isKey)).toBe(true);
  });
  it('+10 min de marche le jour de la longue (samedi), sinon la dernière de la semaine, jamais en semaine de course', () => {
    const r = rescheduleJourney({ stage: 6, validatedAtStage: 0, failsAtStage: 0 }, slots, ctx, true);
    expect(r.map((x) => x.stage)).toEqual([6, 6, 6, 7, 7]); // profil lent : 3 validations par palier
    const [a, b, c, d, e] = r.map((x) => x.session.durationMin);
    expect(c! - b!).toBe(10); // même palier 6 ; le samedi a +10 min
    expect(a).toBe(b);
    expect(e).toBe(d); // semaine de course : pas de marche en plus
  });
  it('parcours terminé : séances de 30 min continues', () => {
    const r = rescheduleJourney({ stage: 19, validatedAtStage: 0, failsAtStage: 0 }, slots.slice(0, 1), ctx);
    expect(r[0]!.stage).toBe(19);
  });
});

describe('T9 — le dépistage santé s’applique au plan', () => {
  const answers = { q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false, q8: false, q9: true };
  const health = (yes: Partial<typeof answers>, clearance?: string) => ({ answers: { ...answers, ...yes }, answeredAt: '2026-04-01', conditions: [], ...(clearance ? { clearance } : {}) });
  const forbidden = ['test', 'strides', 'hill_sprints', 'descentes', 'longue_specifique', 'seuil', 'vo2max', 'tempo', 'cotes_longues'];

  it('bloqué : pas de plan, explication health.clearance', () => {
    const { plan } = fullPlan('route_10k', { screening: screen(health({ q2: true }), START) });
    expect(plan.ok).toBe(false);
    expect(plan.weeks).toHaveLength(0);
    expect(plan.warnings[0]!.ruleId).toBe('health.clearance');
  });

  it('prudent : difficulté prudente, rien au-dessus de Z2 ni test les 4 premières semaines, explications', () => {
    const base = fullPlan('route_10k', { difficulty: 'ambitieux' });
    const { plan, weeks } = fullPlan('route_10k', { difficulty: 'ambitieux', screening: screen(health({ q1: true }), START) });
    expect(plan.ok).toBe(true);
    expect(plan.targetPeakKm).toBeLessThan(base.plan.targetPeakKm);
    expect(plan.warnings.map((w) => w.ruleId)).toEqual(expect.arrayContaining(['health.cardio', 'plan.prudent']));
    for (const { week, sessions } of weeks.slice(0, 4)) {
      expect(week.easyOnly).toBe(true);
      expect(week.keySessions).toBe(0);
      expect(sessions.filter((s) => s.isKey || forbidden.includes(s.type)), `semaine ${week.index}`).toEqual([]);
    }
    expect(weeks[4]!.week.easyOnly).toBeUndefined();
    // Sans dépistage prudent, ce coureur aurait eu son test en semaine 2.
    expect(base.weeks[1]!.sessions.some((s) => s.type === 'test')).toBe(true);
  });

  it('blocage levé par un médecin : plan prudent', () => {
    const { plan, weeks } = fullPlan('route_10k', { screening: screen(health({ q3: true }, '2026-04-10'), START) });
    expect(plan.ok).toBe(true);
    expect(plan.warnings.map((w) => w.ruleId)).toContain('health.cleared');
    expect(weeks[0]!.week.easyOnly).toBe(true);
  });

  it('prudent : marche/course d’office pour un débutant, pas pour un régulier', () => {
    const prudent = screen(health({ q4: true }), START);
    const deb = fullPlan('route_10k', { experience: 'debutant', currentWeeklyKm: 15, continuousMin: 40, screening: prudent });
    expect(deb.plan.weeks[0]!.phase).toBe('demarrage');
    expect(deb.plan.start!.stage).toBe(13);
    const reg = fullPlan('route_10k', { experience: 'regulier', screening: prudent });
    expect(reg.plan.weeks[0]!.phase).not.toBe('demarrage');
    expect(fullPlan('route_10k', { experience: 'debutant', currentWeeklyKm: 15, continuousMin: 40 }).plan.weeks[0]!.phase).not.toBe('demarrage');
  });

  it('plan court en prudent : l’affûtage des 4 premières semaines reste facile aussi', () => {
    const { plan } = fullPlan('route_5k', { screening: screen(health({ q1: true }), START), race: { date: addDays(START, 3 * 7 + 5), distanceKm: 5, elevationGainM: 0 } });
    expect(plan.weeks.every((w) => w.keySessions === 0 && w.easyOnly)).toBe(true);
  });
});
