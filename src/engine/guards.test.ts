import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { evaluateHealth, healthLight, zoneLabel, type HealthInput } from './guards';

const TODAY = '2026-10-21';
const base = (over: Partial<HealthInput> = {}): HealthInput => ({ today: TODAY, pain: [], wellness: [], hrRestBaseline: 52, ...over });
const ids = (s: ReturnType<typeof evaluateHealth>) => s.explanations.map((e) => e.ruleId);

describe('feu vert', () => {
  it('rien à signaler', () => {
    const s = evaluateHealth(base());
    expect(s.level).toBe('ok');
    expect(ids(s)).toEqual(['health.ok']);
    expect(healthLight(s)).toBe('vert');
  });
});

describe('périostite (garde-fou n° 1)', () => {
  it('douleur tibiale ≥ 1 aujourd’hui → avertissement, pas de hausse, pas de dur', () => {
    const s = evaluateHealth(base({ pain: [{ date: TODAY, zone: 'tibia_d', intensity: 1 }] }));
    expect(s.level).toBe('prudence');
    expect(s.noIncrease && s.blockHardRunning && !s.blockAllRunning).toBe(true);
    expect(ids(s)).toContain('shin.warning');
    expect(healthLight(s)).toBe('jaune');
  });
  it('douleur persistante (2 jours) → STOP course', () => {
    const s = evaluateHealth(base({ pain: [{ date: addDays(TODAY, -1), zone: 'tibia_d', intensity: 1 }, { date: TODAY, zone: 'soleaire_d', intensity: 2 }], injuries: [{ zone: 'tibia_d', label: 'Périostite', status: 'dormante' }] }));
    expect(s.level).toBe('stop_course');
    expect(s.blockAllRunning).toBe(true);
    expect(s.explanations[0]!.ruleId).toBe('shin.stop');
    expect(s.explanations[0]!.why).toMatch(/historique/);
    expect(healthLight(s)).toBe('rouge');
  });
  it('douleur forte (≥ 3) d’un coup → STOP course', () => {
    const s = evaluateHealth(base({ pain: [{ date: TODAY, zone: 'tibia_g', intensity: 4 }] }));
    expect(s.level).toBe('stop_course');
    expect(s.explanations[0]!.why).toMatch(/4\/10/);
  });
  it('reprise : 2 jours sans douleur → Z1/Z2 seulement ; 4 jours → libre', () => {
    const two = evaluateHealth(base({ pain: [{ date: addDays(TODAY, -2), zone: 'tibia_d', intensity: 3 }] }));
    expect(ids(two)).toContain('shin.resume');
    expect(two.blockHardRunning).toBe(true);
    const four = evaluateHealth(base({ pain: [{ date: addDays(TODAY, -4), zone: 'tibia_d', intensity: 3 }] }));
    expect(four.level).toBe('ok');
  });
  it('5 jours de douleur sur 2 semaines → suggestion physio', () => {
    const pain = [0, 2, 4, 6, 8].map((d) => ({ date: addDays(TODAY, -d - 2), zone: 'tibia_d' as const, intensity: 1 }));
    const s = evaluateHealth(base({ pain }));
    expect(s.suggestPro).toBe(true);
    expect(ids(s)).toContain('shin.pro');
  });
  it('ignore le futur, les vieux logs et les douleurs à 0', () => {
    const s = evaluateHealth(base({ pain: [{ date: addDays(TODAY, 1), zone: 'tibia_d', intensity: 5 }, { date: addDays(TODAY, -30), zone: 'tibia_d', intensity: 5 }, { date: TODAY, zone: 'tibia_d', intensity: 0 }] }));
    expect(s.level).toBe('ok');
  });
});

describe('tendon d’Achille', () => {
  it('douleur > 48 h → red flag et STOP course', () => {
    const pain = [0, 1, 2].map((d) => ({ date: addDays(TODAY, -d), zone: 'achille_g' as const, intensity: 2 }));
    const s = evaluateHealth(base({ pain }));
    expect(s.flags).toContain('tendon');
    expect(s.level).toBe('stop_course');
    expect(s.explanations.find((e) => e.ruleId === 'tendon.stop')!.why).toMatch(/48 h/);
  });
  it('douleur forte d’un coup → STOP', () => {
    const s = evaluateHealth(base({ pain: [{ date: TODAY, zone: 'achille_d', intensity: 4 }] }));
    expect(s.explanations.find((e) => e.ruleId === 'tendon.stop')!.why).toMatch(/4\/10/);
  });
  it('douleur légère récente → surveillance', () => {
    const s = evaluateHealth(base({ pain: [{ date: TODAY, zone: 'achille_d', intensity: 1 }] }));
    expect(ids(s)).toContain('tendon.warning');
    expect(s.blockHardRunning).toBe(true);
  });
});

describe('autres douleurs', () => {
  it('douleur marquée → facile ; persistante → pas de course', () => {
    const one = evaluateHealth(base({ pain: [{ date: TODAY, zone: 'genou_d', intensity: 3 }, { date: TODAY, zone: 'dos', intensity: 1 }] }));
    expect(one.level).toBe('prudence');
    expect(one.explanations[0]!.title).toMatch(/genou droit/);
    const two = evaluateHealth(base({ pain: [{ date: addDays(TODAY, -1), zone: 'itb_g', intensity: 3 }, { date: TODAY, zone: 'itb_g', intensity: 3 }] }));
    expect(two.level).toBe('stop_course');
    expect(two.blockAllRunning).toBe(true);
  });
  it('douleur légère ailleurs : pas d’alerte', () => {
    expect(evaluateHealth(base({ pain: [{ date: TODAY, zone: 'hanche_g', intensity: 2 }] })).level).toBe('ok');
  });
  it('libellés de zones', () => {
    expect(zoneLabel('tibia_d')).toBe('tibia droit');
  });
});

describe('red flags et protocole', () => {
  const w = (d: number, extra: object) => ({ date: addDays(TODAY, -d), ...extra });
  it('1 flag → journée légère', () => {
    const s = evaluateHealth(base({ wellness: [w(0, { hrRest: 58 })] }));
    expect(s.flags).toEqual(['hr_rest']);
    expect(s.level).toBe('alleger');
    expect(s.noQuality).toBe(true);
  });
  it('2 flags → journée off', () => {
    const s = evaluateHealth(base({ wellness: [w(1, { bodyBattery: 15 }), w(0, { bodyBattery: 10, hrRest: 60 })] }));
    expect(s.flags).toEqual(['body_battery', 'hr_rest']);
    expect(s.level).toBe('repos');
  });
  it('flag + symptôme → décharge anticipée', () => {
    const s = evaluateHealth(base({ wellness: [w(0, { hrRest: 60 })], pain: [{ date: TODAY, zone: 'hanche_g', intensity: 1 }] }));
    expect(s.level).toBe('decharge');
    expect(s.recommendDeload).toBe(true);
  });
  it('VFC basse > 3 jours', () => {
    const s = evaluateHealth(base({ wellness: [4, 3, 2, 1, 0].map((d) => w(d, { hrv: 'bas' })) }));
    expect(s.flags).toContain('hrv');
    const short = evaluateHealth(base({ wellness: [5, 4, 3, 2, 1, 0].map((d) => w(d, { hrv: d === 1 ? 'equilibre' : 'bas' })) }));
    expect(short.flags).not.toContain('hrv');
  });
  it('malade → pas de qualité, journée allégée', () => {
    const s = evaluateHealth(base({ wellness: [w(0, { sick: true })] }));
    expect(s.flags).toEqual(['sick']);
    expect(s.level).toBe('alleger');
    expect(s.noQuality).toBe(true);
  });
  it('malade + autre flag → journée off', () => {
    const s = evaluateHealth(base({ wellness: [w(0, { sick: true, hrRest: 60 })] }));
    expect(s.level).toBe('repos');
  });
  it('fatigue persistante (3 jours rouges)', () => {
    const s = evaluateHealth(base({ wellness: [2, 1, 0].map((d) => w(d, { state: 'rouge' })) }));
    expect(s.flags).toContain('fatigue');
  });
  it('nuits courtes répétées → semaine maintien, sans culpabiliser', () => {
    const s = evaluateHealth(base({ wellness: [6, 5, 4, 3].map((d) => w(d, { shortNight: d % 2 === 0, sleepHours: 4.5 })) }));
    expect(s.recommendMaintenanceWeek).toBe(true);
    expect(healthLight(s)).toBe('jaune');
    expect(s.explanations.find((e) => e.ruleId === 'protocol.maintenance')!.why).toMatch(/Ça reviendra/);
  });
});

describe('cumul', () => {
  it('le niveau le plus grave l’emporte', () => {
    const s = evaluateHealth(base({ pain: [{ date: TODAY, zone: 'tibia_d', intensity: 5 }, { date: TODAY, zone: 'achille_d', intensity: 1 }] }));
    expect(s.level).toBe('stop_course');
    expect(s.explanations[0]!.severity).toBe('stop');
  });
});
