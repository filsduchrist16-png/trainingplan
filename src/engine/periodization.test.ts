import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { GOALS } from './goals';
import { allocatePhases, generatePlan, generateRecovery, keySessionsFor, timeCapKm, toMaintenanceWeek, type PlanRequest } from './periodization';
import type { Availability } from './types';

const avail: Availability = { runDaysPerWeek: 5, allowedDays: [1, 2, 3, 4, 5, 6, 7], longRunDay: 6, maxWeekdayMinutes: 90, maxWeekendMinutes: 300, strengthPerWeek: 2 };
const START = '2026-04-20'; // lundi

function req(over: Partial<PlanRequest> = {}): PlanRequest {
  return {
    goal: 'trail_moyen',
    startDate: START,
    race: { date: addDays(START, 26 * 7 + 5), distanceKm: 43, elevationGainM: 1500 }, // samedi de la 27e semaine
    experience: 'regulier',
    difficulty: 'equilibre',
    currentWeeklyKm: 25,
    availability: avail,
    vdot: 45,
    ...over,
  };
}

/** Invariant de sécurité : aucune semaine ne dépasse +10 % du max des 4 précédentes. */
function assertTenPercentRule(kms: number[], history: number[] = []) {
  const all = [...history, ...kms];
  for (let i = history.length; i < all.length; i++) {
    const prev = all.slice(Math.max(0, i - 4), i);
    if (prev.length === 0) continue;
    const ref = Math.max(...prev);
    expect(all[i]!, `semaine ${i - history.length}: ${all[i]} vs réf ${ref}`).toBeLessThanOrEqual(ref * 1.1 + 1e-9);
  }
}

describe('répartition des phases', () => {
  it('bloc de 25 semaines : 9 base / 7 spec1 / 6 spec2 / 3 précomp (comme le brief)', () => {
    const p = allocatePhases(25);
    const count = (x: string) => p.filter((y) => y === x).length;
    expect([count('base'), count('spec1'), count('spec2'), count('precomp')]).toEqual([9, 7, 6, 3]);
  });
  it('blocs très courts : compresse la base d’abord', () => {
    expect(allocatePhases(0)).toEqual([]);
    expect(allocatePhases(1)).toEqual(['precomp']);
    expect(allocatePhases(2)).toEqual(['spec2', 'precomp']);
    expect(allocatePhases(3)).toEqual(['spec1', 'spec2', 'precomp']);
    expect(allocatePhases(4)).toEqual(['base', 'spec1', 'spec2', 'precomp']);
  });
});

describe('plan trail moyen 27 semaines (cas Grand-Duc)', () => {
  const plan = generatePlan(req());

  it('couvre toutes les semaines jusqu’à la course', () => {
    expect(plan.ok).toBe(true);
    expect(plan.weeks).toHaveLength(27);
    expect(plan.weeks.at(-1)!.kind).toBe('course');
    expect(plan.weeks.at(-1)!.raceDate).toBe(req().race!.date);
    expect(plan.weeks.at(-2)!.kind).toBe('taper');
  });
  it('respecte la règle des 10 %', () => {
    assertTenPercentRule(plan.weeks.map((w) => w.targetKm), [25]);
  });
  it('place une décharge au moins toutes les 4 semaines pendant le développement', () => {
    const kinds = plan.weeks.slice(0, -2).map((w) => w.kind);
    let run = 0;
    for (const k of kinds) {
      run = k === 'decharge' ? 0 : run + 1;
      expect(run).toBeLessThanOrEqual(4);
    }
  });
  it('monte vers le pic visé et fait un taper -40 % puis -60 %', () => {
    expect(plan.targetPeakKm).toBe(65);
    expect(plan.peakKm).toBeGreaterThanOrEqual(60);
    expect(plan.weeks.at(-2)!.targetKm).toBe(Math.round(plan.peakKm * 0.6));
    expect(plan.weeks.at(-1)!.targetKm).toBe(Math.round(plan.peakKm * 0.4));
  });
  it('tient le volume à l’entrée d’une nouvelle phase d’intensité', () => {
    const i = plan.weeks.findIndex((w) => w.phase === 'spec1');
    expect(plan.weeks[i]!.notes.some((n) => n.ruleId === 'week.hold')).toBe(true);
    const prevBuild = plan.weeks.slice(0, i).filter((w) => w.kind === 'build').at(-1)!;
    expect(plan.weeks[i]!.targetKm).toBe(prevBuild.targetKm);
  });
  it('fait monter le D+ avec les phases', () => {
    const base = plan.weeks.find((w) => w.phase === 'base' && w.kind === 'build')!;
    const spec2 = plan.weeks.find((w) => w.phase === 'spec2' && w.kind === 'build')!;
    expect(spec2.targetElevationM / spec2.targetKm).toBeGreaterThan(base.targetElevationM / base.targetKm);
    expect(spec2.targetElevationM).toBeGreaterThan(1500);
  });
  it('allonge la sortie longue progressivement, sous 5 h', () => {
    const longs = plan.weeks.filter((w) => w.kind === 'build').map((w) => w.longRunKm);
    for (let i = 1; i < longs.length; i++) expect(longs[i]!).toBeLessThanOrEqual(Math.max(...longs.slice(0, i)) * 1.1 + 1.5 + 0.5);
    expect(Math.max(...longs)).toBeGreaterThanOrEqual(25);
  });
  it('limite les séances clés : 0 au début, 2-3 en spécifique', () => {
    expect(plan.weeks[0]!.keySessions).toBe(0);
    expect(Math.max(...plan.weeks.map((w) => w.keySessions))).toBeLessThanOrEqual(3);
    expect(plan.weeks.find((w) => w.phase === 'spec1' && w.kind === 'build')!.keySessions).toBe(2);
  });
});

describe('cas limites', () => {
  it('course passée → pas de plan, message de récup', () => {
    const p = generatePlan(req({ race: { date: '2026-04-01', distanceKm: 43, elevationGainM: 1500 } }));
    expect(p.ok).toBe(false);
    expect(p.warnings[0]!.ruleId).toBe('race.past');
  });
  it('course cette semaine → une seule semaine de course', () => {
    const p = generatePlan(req({ race: { date: '2026-04-25', distanceKm: 43, elevationGainM: 1500 } }));
    expect(p.weeks).toHaveLength(1);
    expect(p.weeks[0]!.kind).toBe('course');
    expect(p.warnings.map((w) => w.ruleId)).toContain('plan.short');
  });
  it('délai très court : respecte quand même les 10 % et le dit', () => {
    const p = generatePlan(req({ race: { date: addDays(START, 4 * 7 + 5), distanceKm: 43, elevationGainM: 1500 } }));
    expect(p.weeks).toHaveLength(5);
    assertTenPercentRule(p.weeks.map((w) => w.targetKm), [25]);
    expect(p.warnings.map((w) => w.ruleId)).toEqual(expect.arrayContaining(['plan.short', 'peak.unreachable']));
  });
  it('course dans plus d’un an : le plan démarre plus tard', () => {
    const p = generatePlan(req({ race: { date: addDays(START, 70 * 7), distanceKm: 43, elevationGainM: 1500 } }));
    expect(p.weeks).toHaveLength(52);
    expect(p.weeks[0]!.startDate > START).toBe(true);
    expect(p.warnings.map((w) => w.ruleId)).toContain('plan.long');
  });
  it('démarrage en cours de semaine : le plan commence au lundi', () => {
    expect(generatePlan(req({ startDate: '2026-04-23' })).weeks[0]!.startDate).toBe(START);
  });
  it('utilise l’historique récent comme référence', () => {
    const p = generatePlan(req({ currentWeeklyKm: 30, recentWeeksKm: [50, 45, 40] }));
    expect(p.weeks[0]!.targetKm).toBe(55); // max(50,45,40,30) × 1,1
    assertTenPercentRule(p.weeks.map((w) => w.targetKm), [50, 45, 40, 30]);
  });
  it('sans aucune sortie connue : pas de plus longue sortie de référence à l’affûtage', () => {
    const p = generatePlan(req({ experience: 'avance', currentWeeklyKm: 0 }));
    expect(p.weeks.filter((w) => w.phase === 'taper').every((w) => w.longestRunKm === undefined)).toBe(true);
  });
  it('ne force pas de baisse chez quelqu’un déjà au-dessus du pic', () => {
    const p = generatePlan(req({ currentWeeklyKm: 90 }));
    // Pas de baisse vers le pic : seule la contenance des sorties (temps dispo en semaine) plafonne, et c'est dit.
    expect(p.weeks[0]!.targetKm).toBeGreaterThan(p.targetPeakKm);
    expect(p.weeks[0]!.targetKm).toBeGreaterThan(85);
  });
  it('plafonne au temps disponible et le dit', () => {
    const tight = { ...avail, runDaysPerWeek: 3, maxWeekdayMinutes: 45, maxWeekendMinutes: 90 };
    const p = generatePlan(req({ availability: tight }));
    expect(p.warnings.map((w) => w.ruleId)).toContain('peak.timecap');
    expect(p.peakKm).toBeLessThanOrEqual(timeCapKm(tight, 45, true));
  });
  it('course B : mini-taper et reprise', () => {
    const p = generatePlan(req({ bRaces: [{ date: addDays(START, 10 * 7 + 5), distanceKm: 30, name: 'Lac Beauport' }, { date: '2030-01-01', distanceKm: 10 }] }));
    const without = generatePlan(req());
    const w = p.weeks[10]!;
    expect(w.bRaceDate).toBe(addDays(START, 10 * 7 + 5));
    expect(w.targetKm).toBeLessThan(without.weeks[10]!.targetKm);
    expect(w.notes.map((n) => n.ruleId)).toContain('week.brace');
  });
  it('course B la semaine avant une décharge : pas de reprise à appliquer', () => {
    const base = generatePlan(req());
    const i = base.weeks.findIndex((_w, k) => k > 0 && base.weeks[k + 1]?.kind === 'decharge');
    const p = generatePlan(req({ bRaces: [{ date: addDays(START, i * 7 + 5), distanceKm: 20 }] }));
    expect(p.weeks[i + 1]!.notes.map((n) => n.ruleId)).not.toContain('week.brace.recovery');
  });
  it('course B suivie d’une semaine de développement : reprise allégée', () => {
    const base = generatePlan(req());
    const i = base.weeks.findIndex((w, k) => k > 2 && w.kind === 'build' && base.weeks[k + 1]?.kind === 'build');
    const p = generatePlan(req({ bRaces: [{ date: addDays(START, i * 7 + 5), distanceKm: 20 }] }));
    expect(p.weeks[i + 1]!.notes.map((n) => n.ruleId)).toContain('week.brace.recovery');
    expect(p.weeks[i + 1]!.keySessions).toBeLessThanOrEqual(1);
    expect(p.weeks[i]!.notes.find((n) => n.ruleId === 'week.brace')!.title).toBe('Course B');
  });
  it('course B ignorée pendant le taper', () => {
    const p = generatePlan(req({ bRaces: [{ date: addDays(START, 25 * 7 + 2), distanceKm: 10 }] }));
    expect(p.weeks[25]!.bRaceDate).toBeUndefined();
  });
});

describe('autres objectifs', () => {
  it('courir de zéro : démarrage en marche-course, sans taper', () => {
    const p = generatePlan({ goal: 'debuter', startDate: START, experience: 'jamais', difficulty: 'prudent', currentWeeklyKm: 0, availability: { ...avail, runDaysPerWeek: 3 } });
    // Durée calculée : 12 semaines depuis le palier 1 à 3 séances/sem.
    expect(p.weeks).toHaveLength(12);
    expect(p.weeks[0]!.phase).toBe('demarrage');
    expect(p.weeks[0]!.keySessions).toBe(0);
    // Volume du démarrage en minutes : paliers 1, 1, 2 (31 + 31 + 30 min), +10 min de marche le jour de la longue.
    expect(p.weeks[0]!.targetMinutes).toBe(31 + 31 + 30 + 10);
    expect(p.weeks[0]!.runWalk!.sessions.map((x) => x.stage)).toEqual([1, 1, 2]);
    expect(p.weeks.every((w) => w.phase === 'demarrage')).toBe(true);
  });

  describe('T6 — « Courir de zéro » à durée calculée', () => {
    const zero = (over: Partial<PlanRequest> = {}) => generatePlan({ goal: 'debuter', startDate: START, experience: 'jamais', difficulty: 'prudent', currentWeeklyKm: 0, availability: { ...avail, runDaysPerWeek: 3 }, ...over });
    it('durée par défaut = estimation depuis le palier d’entrée', () => {
      expect(zero().weeks).toHaveLength(12);
      // Court déjà 5 à 10 min : palier d'entrée plus haut, plan plus court.
      const p = zero({ continuousMin: 8 });
      expect(p.weeks.length).toBeLessThan(12);
      expect(p.weeks.length).toBeGreaterThan(0);
      // 2 séances par semaine : plus long.
      expect(zero({ availability: { ...avail, runDaysPerWeek: 2, allowedDays: [2, 6] } }).weeks).toHaveLength(18);
      expect(zero().warnings.map((w) => w.ruleId)).not.toContain('plan.debuter.short');
    });
    it('durée plus courte choisie : avertissement avec le palier de fin, échelle pas accélérée (F5)', () => {
      const short = zero({ durationWeeks: 6 });
      const auto = zero();
      expect(short.weeks).toHaveLength(6);
      const w = short.warnings.find((x) => x.ruleId === 'plan.debuter.short')!;
      expect(w.severity).toBe('attention');
      const end = short.weeks.at(-1)!.runWalk!.sessions.at(-1)!.stage;
      expect(end).toBeLessThan(13);
      expect(w.values).toMatchObject({ palier: end, semaines: 6, estimation: 12 });
      expect(w.title).toBe(`Ton plan finira au palier ${end} sur 13`);
      // Mêmes paliers que le plan complet sur les 6 premières semaines : rien n'est compressé.
      expect(short.weeks.map((x) => x.runWalk!.sessions)).toEqual(auto.weeks.slice(0, 6).map((x) => x.runWalk!.sessions));
      expect(short.weeks.at(-1)!.notes.find((n) => n.ruleId === 'plan.debuter.end')!.why).toContain('nouveau plan');
    });
    it('fin de plan : bilan « tu cours 30 min » et proposition de la suite', () => {
      const p = zero();
      const end = p.weeks.at(-1)!.notes.find((n) => n.ruleId === 'plan.debuter.end')!;
      expect(end.title).toBe('À la fin : tu cours 30 min');
      expect(end.why).toMatch(/5 km/);
      expect(end.why).toMatch(/Garder la forme/);
      expect(p.warnings.map((x) => x.ruleId)).toContain('plan.debuter.end');
    });
    it('durée plus longue choisie : de la base après le parcours', () => {
      const p = zero({ durationWeeks: 16 });
      expect(p.weeks.filter((w) => w.phase === 'demarrage')).toHaveLength(12);
      expect(p.weeks.filter((w) => w.phase === 'base')).toHaveLength(4);
    });
    it('court déjà 30 min : durée par défaut de l’objectif', () => {
      const p = zero({ continuousMin: 40 });
      expect(p.weeks).toHaveLength(GOALS.debuter.idealWeeks);
      expect(p.weeks.at(-1)!.notes.map((n) => n.ruleId)).toContain('plan.debuter.end');
    });
  });
  it('objectif course pour un débutant à faible volume : phase démarrage d’abord', () => {
    const p = generatePlan(req({ goal: 'route_10k', experience: 'jamais', currentWeeklyKm: 4, race: { date: addDays(START, 15 * 7 + 6), distanceKm: 10, elevationGainM: 0 } }));
    expect(p.weeks.slice(0, 3).every((w) => w.phase === 'demarrage')).toBe(true);
    expect(p.weeks.every((w) => w.targetElevationM === 0)).toBe(true);
  });
  it('garder la forme : volume tenu, cycles avec décharge, sans course', () => {
    const p = generatePlan({ goal: 'forme', startDate: START, durationWeeks: 8, experience: 'regulier', difficulty: 'equilibre', currentWeeklyKm: 30, availability: avail });
    expect(p.weeks).toHaveLength(8);
    expect(p.weeks.filter((w) => w.kind === 'maintien').every((w) => w.targetKm === 30)).toBe(true);
    expect(p.weeks.some((w) => w.kind === 'decharge')).toBe(true);
    expect(p.warnings).toEqual([]);
  });
  it('garder la forme depuis zéro : volume minimal, durée par défaut', () => {
    const p = generatePlan({ goal: 'forme', startDate: START, experience: 'debutant', difficulty: 'equilibre', currentWeeklyKm: 0, availability: avail });
    expect(p.weeks).toHaveLength(8);
    expect(p.weeks[0]!.targetKm).toBe(6);
  });
  it('5 km route sans taper long, course marquée', () => {
    const p = generatePlan(req({ goal: 'route_5k', race: { date: addDays(START, 9 * 7 + 5), distanceKm: 5, elevationGainM: 0 } }));
    expect(p.weeks.at(-1)!.kind).toBe('course');
    expect(p.weeks.filter((w) => w.phase === 'taper')).toHaveLength(1);
  });
  it('ultra sans D+ fourni utilise le profil par défaut ; avancé ambitieux peut avoir 3 clés en pic', () => {
    const p = generatePlan(req({ goal: 'ultra', experience: 'avance', difficulty: 'ambitieux', currentWeeklyKm: 60 }));
    expect(Math.max(...p.weeks.map((w) => w.keySessions))).toBe(3);
    const noRace = generatePlan({ ...req({ goal: 'trail_court' }), race: undefined, durationWeeks: 12 });
    expect(noRace.weeks.some((w) => w.targetElevationM > 0)).toBe(true);
    expect(noRace.weeks.some((w) => w.raceDate)).toBe(false);
  });
  it('objectif sans taper avec course (débuter + 5 km) : la dernière semaine porte la course', () => {
    const p = generatePlan({ goal: 'debuter', startDate: START, race: { date: addDays(START, 9 * 7 + 6), distanceKm: 5, elevationGainM: 0 }, experience: 'jamais', difficulty: 'prudent', currentWeeklyKm: 0, availability: avail });
    expect(p.weeks.at(-1)!.raceDate).toBe(addDays(START, 9 * 7 + 6));
  });
});

describe('séances clés', () => {
  it('suivent la phase et le niveau', () => {
    expect(keySessionsFor('demarrage', 'build', 5, 'regulier', 'equilibre')).toBe(0);
    expect(keySessionsFor('recup', 'recup', 5, 'regulier', 'equilibre')).toBe(0);
    expect(keySessionsFor('taper', 'course', 5, 'regulier', 'equilibre')).toBe(1);
    expect(keySessionsFor('spec1', 'decharge', 5, 'regulier', 'equilibre')).toBe(1);
    expect(keySessionsFor('base', 'build', 1, 'regulier', 'equilibre')).toBe(0);
    expect(keySessionsFor('base', 'build', 3, 'regulier', 'equilibre')).toBe(1);
    expect(keySessionsFor('spec1', 'build', 5, 'debutant', 'equilibre')).toBe(1);
    expect(keySessionsFor('spec2', 'build', 5, 'avance', 'ambitieux')).toBe(3);
    expect(keySessionsFor('spec2', 'build', 5, 'regulier', 'ambitieux')).toBe(2);
    expect(keySessionsFor('precomp', 'build', 5, 'regulier', 'equilibre')).toBe(2);
  });
});

describe('récupération et maintien', () => {
  it('récup après un 43 km : 2 semaines en remontée douce', () => {
    const r = generateRecovery({ date: '2026-10-25', distanceKm: 43 }, 65);
    expect(r).toHaveLength(2);
    expect(r[0]!.startDate).toBe('2026-10-26');
    expect(r[0]!.targetKm).toBeLessThan(r[1]!.targetKm);
    expect(r.every((w) => w.keySessions === 0)).toBe(true);
    expect(generateRecovery({ date: '2026-10-25', distanceKm: 10 }, 40)).toHaveLength(1);
    expect(generateRecovery({ date: '2026-10-25', distanceKm: 100 }, 90)).toHaveLength(3);
  });
  it('semaine maintien : 0 qualité, volume réduit, explication sans culpabilité', () => {
    const w = generatePlan(req()).weeks[10]!;
    const m = toMaintenanceWeek(w, 0.65);
    expect(m.kind).toBe('maintien');
    expect(m.keySessions).toBe(0);
    expect(m.targetKm).toBeLessThan(w.targetKm);
    expect(m.notes.at(-1)!.ruleId).toBe('week.maintenance');
  });
});

describe('débutant dont la plus longue sortie est courte (garde-fou de séance)', () => {
  const beginner = (over: Partial<PlanRequest> = {}) => generatePlan({
    goal: 'route_5k', startDate: '2026-10-19', race: { date: '2027-01-23', distanceKm: 5, elevationGainM: 0 },
    experience: 'debutant', difficulty: 'equilibre', currentWeeklyKm: 15, longestRecentRunKm: 3.2,
    availability: { ...avail, runDaysPerWeek: 3, allowedDays: [2, 4, 6] }, ...over,
  });

  it('la sortie longue ne grimpe que de ~10 % par rapport à la plus longue sortie', () => {
    const p = beginner();
    expect(p.weeks[0]!.longRunKm).toBeLessThanOrEqual(3.5);
  });
  it('le volume est plafonné par ce que 3 sorties peuvent contenir, et le plan l’explique', () => {
    const w = beginner().weeks[0]!;
    expect(w.targetKm).toBeLessThanOrEqual(10.5);
    expect(w.notes.map((n) => n.ruleId)).toContain('week.sessioncap');
  });
  it('plus de sorties = plus de volume permis (c’est la façon sûre de monter)', () => {
    const three = beginner().weeks[0]!.targetKm;
    const five = beginner({ availability: { ...avail, runDaysPerWeek: 5, allowedDays: [1, 2, 4, 5, 6] } }).weeks[0]!.targetKm;
    expect(five).toBeGreaterThan(three);
  });
  it('sans plus longue sortie déclarée, on l’estime depuis le volume (jamais « illimitée »)', () => {
    const w = beginner({ longestRecentRunKm: undefined, currentWeeklyKm: 12 }).weeks[0]!;
    expect(w.longRunKm).toBeLessThanOrEqual(4.5); // 12 / 3 sorties = 4 km → ≤ ~4,5
  });
  it('un coureur confirmé n’est pas bridé', () => {
    const w = generatePlan({ ...beginnerBase(), currentWeeklyKm: 40, longestRecentRunKm: 16, experience: 'regulier' }).weeks[0]!;
    expect(w.notes.map((n) => n.ruleId)).not.toContain('week.sessioncap');
  });
});

function beginnerBase(): PlanRequest {
  return { goal: 'route_10k', startDate: '2026-10-19', race: { date: '2027-03-20', distanceKm: 10, elevationGainM: 0 }, experience: 'regulier', difficulty: 'equilibre', currentWeeklyKm: 40, availability: avail };
}
