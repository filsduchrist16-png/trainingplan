import { describe, expect, it } from 'vitest';
import { evaluateHealth } from './guards';
import { adjustToday, crossSession, easySession, findMoveTarget, restSession, scaleSession, type TodaySession } from './readiness';

const ok = evaluateHealth({ today: '2026-10-21', pain: [], wellness: [], hrRestBaseline: 52 });
const shinStop = evaluateHealth({ today: '2026-10-21', pain: [{ date: '2026-10-21', zone: 'tibia_d', intensity: 4 }], wellness: [], hrRestBaseline: 52 });
const shinWarn = evaluateHealth({ today: '2026-10-21', pain: [{ date: '2026-10-21', zone: 'tibia_d', intensity: 1 }], wellness: [], hrRestBaseline: 52 });
const oneFlag = evaluateHealth({ today: '2026-10-21', pain: [], wellness: [{ date: '2026-10-21', hrRest: 60 }], hrRestBaseline: 52 });
const twoFlags = evaluateHealth({ today: '2026-10-21', pain: [], wellness: [{ date: '2026-10-20', bodyBattery: 10 }, { date: '2026-10-21', bodyBattery: 10, hrRest: 60 }], hrRestBaseline: 52 });

const seuil: TodaySession = {
  type: 'seuil', title: 'Seuil 4 × 8 min', durationMin: 60, distanceKm: 10, isKey: true, why: 'w',
  steps: [{ kind: 'echauffement', minutes: 15, target: { zone: 'z2' } }, { kind: 'effort', minutes: 8, repeat: 4, target: { pace: 'T' } }, { kind: 'retour_calme', minutes: 10, target: { zone: 'z1' } }],
};
const z2: TodaySession = { type: 'z2_endurance', title: 'Z2 50 min', durationMin: 50, distanceKm: 8, isKey: false, why: 'w', steps: [{ kind: 'continu', minutes: 50, target: { zone: 'z2' } }] };
const long: TodaySession = { type: 'longue_facile', title: 'Longue 2 h', durationMin: 120, isKey: false, why: 'w', steps: [{ kind: 'continu', minutes: 120, target: { zone: 'z2' } }] };
const muscu: TodaySession = { type: 'muscu_trail', title: 'Muscu trail', durationMin: 45, isKey: false, why: 'w', steps: [] };
const ids = (d: ReturnType<typeof adjustToday>) => d.explanations.map((e) => e.ruleId);

describe('santé d’abord', () => {
  it('STOP course → vélo à la place, même durée', () => {
    const d = adjustToday({ session: seuil, health: shinStop, crossTraining: ['velo'], state: 'vert' });
    expect(d.action).toBe('remplacer');
    expect(d.session.type).toBe('croise');
    expect(d.session.title).toBe('Vélo Z2 60 min');
    expect(ids(d)).toContain('shin.stop');
  });
  it('STOP course sans croisé → repos et conseil', () => {
    const d = adjustToday({ session: z2, health: shinStop, crossTraining: [] });
    expect(d.action).toBe('repos');
    expect(ids(d)).toContain('day.nocross');
  });
  it('la muscu n’est pas bloquée par la douleur tibiale', () => {
    expect(adjustToday({ session: muscu, health: shinStop, crossTraining: [] }).action).toBe('garder');
  });
  it('douleur tibiale légère → la séance dure devient du Z2', () => {
    const d = adjustToday({ session: seuil, health: shinWarn, crossTraining: [] });
    expect(d.action).toBe('remplacer');
    expect(d.session.type).toBe('z2_endurance');
    expect(d.session.isKey).toBe(false);
    expect(ids(d)).toContain('shin.warning');
  });
  it('2 flags → repos ; 1 flag → facile allégé', () => {
    expect(adjustToday({ session: z2, health: twoFlags, crossTraining: [] }).action).toBe('repos');
    const one = adjustToday({ session: z2, health: oneFlag, crossTraining: [] });
    expect(one.action).toBe('alleger');
    expect(one.session.durationMin).toBe(35);
    expect(adjustToday({ session: long, health: oneFlag, crossTraining: [] }).session.durationMin).toBe(45);
  });
});

describe('état du jour (3 taps)', () => {
  it('🟢 → on garde', () => {
    const d = adjustToday({ session: seuil, health: ok, crossTraining: [], state: 'vert' });
    expect(d.action).toBe('garder');
    expect(d.session).toBe(seuil);
  });
  it('🔴 → repos, et la qualité est à replacer', () => {
    const d = adjustToday({ session: seuil, health: ok, crossTraining: [], state: 'rouge' });
    expect(d.action).toBe('repos');
    expect(d.moveQuality).toBe(true);
  });
  it('🟡 → version allégée (une répétition de moins)', () => {
    const d = adjustToday({ session: seuil, health: ok, crossTraining: [], state: 'jaune' });
    expect(d.action).toBe('alleger');
    expect(d.session.steps[1]!.repeat).toBe(3);
    expect(adjustToday({ session: z2, health: ok, crossTraining: [], state: 'jaune' }).session.durationMin).toBe(40);
  });
  it('nuit courte en 2 taps : la qualité est déplacée, Z2 court aujourd’hui', () => {
    const d = adjustToday({ session: seuil, health: ok, crossTraining: [], state: 'vert', shortNight: true });
    expect(d.action).toBe('deplacer');
    expect(d.moveQuality).toBe(true);
    expect(d.session.title).toBe('Z2 30 min');
    expect(d.explanations[0]!.why).toMatch(/plus tard dans la semaine/);
  });
  it('nuit < 4 h avec nouveau-né : qualité déplacée et repos', () => {
    const d = adjustToday({ session: seuil, health: ok, crossTraining: [], sleepHours: 3.5 });
    expect(d.action).toBe('deplacer');
    expect(d.session.type).toBe('repos');
    expect(adjustToday({ session: z2, health: ok, crossTraining: [], sleepHours: 3 }).action).toBe('repos');
  });
  it('nuit courte : facile raccourci, muscu allégée', () => {
    expect(adjustToday({ session: z2, health: ok, crossTraining: [], shortNight: true }).session.durationMin).toBe(35);
    expect(adjustToday({ session: muscu, health: ok, crossTraining: [], shortNight: true }).session.title).toMatch(/allégée/);
  });
  it('jour de repos : rien à ajuster', () => {
    expect(adjustToday({ session: restSession(), health: shinStop, crossTraining: [] }).action).toBe('garder');
  });
});

describe('outils', () => {
  it('séances de remplacement', () => {
    expect(easySession(22, 'z1').title).toBe('Z1 20 min');
    expect(crossSession(200, 'natation').durationMin).toBe(75);
  });
  it('réduit une séance (durées et répétitions)', () => {
    const s = scaleSession(seuil, 0.5);
    expect(s.steps[1]!.repeat).toBe(2);
    expect(s.steps[0]!.minutes).toBe(15); // échauffement intact
    expect(s.distanceKm).toBe(5);
    expect(scaleSession(long, 0.5).steps[0]!.minutes).toBe(60);
    expect(scaleSession({ ...long, distanceKm: undefined }, 0.5).distanceKm).toBeUndefined();
  });
  it('trouve un jour pour déplacer la qualité sans casser les 48 h', () => {
    const week = [
      { id: 'q', date: '2026-10-20', type: 'seuil' as const, isKey: true },
      { id: 'e1', date: '2026-10-21', type: 'z2_endurance' as const, isKey: false },
      { id: 'e2', date: '2026-10-22', type: 'z2_endurance' as const, isKey: false },
      { id: 'k', date: '2026-10-23', type: 'vo2max' as const, isKey: true },
      { id: 'r', date: '2026-10-24', type: 'repos' as const, isKey: false },
      { id: 'l', date: '2026-10-25', type: 'longue_facile' as const, isKey: false },
    ];
    expect(findMoveTarget(week, 'q', '2026-10-25')).toBe('2026-10-21'); // 48 h avant le VO2max du 23 : OK
    // VO2max le 22 : le 21 et le 23 sont trop près, le 22 est pris → le 24 (veille de longue : simple conseil).
    const tight = week.map((s) => (s.id === 'k' ? { ...s, date: '2026-10-22' } : s.id === 'e2' ? { ...s, date: '2026-10-23' } : s));
    expect(findMoveTarget(tight, 'q', '2026-10-25')).toBe('2026-10-24');
    expect(findMoveTarget(week, 'k', '2026-10-23')).toBeNull();
    expect(findMoveTarget([...week, { id: 'c', date: '2026-10-24', type: 'course' as const, isKey: true }], 'k', '2026-10-24')).toBeNull();
    expect(findMoveTarget(week, 'zzz', '2026-10-25')).toBeNull();
  });
});
