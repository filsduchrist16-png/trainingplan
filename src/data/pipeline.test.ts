// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SentierDB } from './db';
import { createBlankAthlete } from './athlete';
import { fingerprint, importFiles, linkActivity, parseFile } from './import';
import { CSV_SAMPLE, GPX_SAMPLE, TCX_SAMPLE, makeFit } from './import/fixtures';
import { createPlan, phaseWeekIndex, startingPoint } from './planner';
import type { Athlete, PlanRequest } from '@/engine';

let db: SentierDB;
let athlete: Athlete;
beforeEach(async () => {
  db = new SentierDB(`t-${crypto.randomUUID()}`);
  athlete = await createBlankAthlete(db);
});
afterEach(() => db.delete());

const request = (over: Partial<PlanRequest> = {}): PlanRequest => ({
  goal: 'trail_moyen',
  startDate: '2026-10-21',
  race: { date: '2027-06-05', distanceKm: 30, elevationGainM: 900 },
  experience: 'regulier',
  difficulty: 'equilibre',
  currentWeeklyKm: 30,
  availability: athlete.availability,
  ...over,
});

describe('détection de format', () => {
  it('par extension et par contenu', () => {
    expect(parseFile({ name: 'a.gpx', data: GPX_SAMPLE })[0]!.source).toBe('gpx');
    expect(parseFile({ name: 'sans-extension', data: TCX_SAMPLE })[0]!.source).toBe('tcx');
    expect(parseFile({ name: 'x.csv', data: CSV_SAMPLE })).toHaveLength(3);
    expect(parseFile({ name: 'x.fit', data: makeFit() })[0]!.source).toBe('fit');
    expect(parseFile({ name: 'trace.gpx', data: new TextEncoder().encode(GPX_SAMPLE).buffer as ArrayBuffer })[0]!.source).toBe('gpx');
    expect(() => parseFile({ name: 'x.fit', data: 'texte' })).toThrow(/binaire/);
    expect(() => parseFile({ name: 'x.pdf', data: '%PDF' })).toThrow(/Format non reconnu/);
  });
});

describe('import', () => {
  it('importe, recalcule les zones avec MES zones, calcule la charge, détecte les doublons', async () => {
    const files = [{ name: 'course.fit', data: makeFit() }, { name: 'liste.csv', data: CSV_SAMPLE }];
    const first = await importFiles(db, athlete, files);
    expect(first.map((o) => o.status)).toEqual(['ok', 'ok']);
    expect(first[1]!.message).toBe('3 activités importées.');
    const fit = (await db.activities.toArray()).find((a) => a.source === 'fit')!;
    expect(fit.timeInZonesSec!.reduce((s, x) => s + x, 0)).toBeGreaterThan(1700);
    expect(fit.load).toBeGreaterThan(0);
    expect(fit.date).toBe('2026-10-20');

    const again = await importFiles(db, athlete, files);
    expect(again.map((o) => o.status)).toEqual(['doublon', 'doublon']);
    expect(await db.activities.count()).toBe(4);
  });
  it('signale les erreurs sans bloquer les autres fichiers', async () => {
    const out = await importFiles(db, athlete, [{ name: 'oups.pdf', data: 'x' }, { name: 'vide.csv', data: 'Date,Time\n' }, { name: 'ok.tcx', data: TCX_SAMPLE }]);
    expect(out.map((o) => o.status)).toEqual(['erreur', 'erreur', 'ok']);
    expect(out[1]!.message).toMatch(/Aucune activité/);
  });
  it('import partiel : certaines lignes déjà présentes', async () => {
    await importFiles(db, athlete, [{ name: 'a.csv', data: CSV_SAMPLE.split('\n').slice(0, 2).join('\n') }]);
    const out = await importFiles(db, athlete, [{ name: 'b.csv', data: CSV_SAMPLE }]);
    expect(out[0]!.message).toBe('2 activités importées, 1 déjà présente.');
    const one = await importFiles(db, athlete, [{ name: 'c.gpx', data: GPX_SAMPLE }]);
    expect(one[0]!.message).toBe('1 activité importée.');
  });
  it('empreinte stable', () => {
    expect(fingerprint({ startTime: '2026-10-20T09:30:12.000Z', distanceKm: 10.04 })).toBe('2026-10-20T09:30|100');
  });
  it('propose d’associer la séance prévue du jour, puis l’associe', async () => {
    await createPlan(db, athlete, { request: request({ startDate: '2026-10-19' }) }, '2026-10-19');
    const planned = await db.sessions.where('date').equals('2026-10-20').toArray();
    const run = planned.find((s) => s.type !== 'repos' && !s.type.startsWith('muscu'));
    const out = await importFiles(db, athlete, [{ name: 'run.fit', data: makeFit() }]);
    if (run) {
      expect(out[0]!.matches[0]!.sessionId).toBe(run.id);
      await linkActivity(db, run.id, out[0]!.activityIds[0]!);
      expect((await db.sessions.get(run.id))!.status).toBe('faite');
    } else {
      expect(out[0]!.matches).toEqual([]);
    }
    const bike = await importFiles(db, athlete, [{ name: 'velo.fit', data: makeFit({ sport: 'cycling', subSport: 'road', start: new Date('2026-10-22T10:00:00Z') }) }]);
    expect(bike[0]!.matches).toEqual([]);
  });
});

describe('création de plan', () => {
  it('applique le questionnaire santé de l’athlète : bloqué sans autorisation, prudent avec', async () => {
    const answers = { q1: false, q2: true, q3: false, q4: false, q5: false, q6: false, q7: false, q8: false, q9: true };
    const sick = { ...athlete, health: { answers, answeredAt: '2026-10-01', conditions: [] } };
    const blocked = await createPlan(db, sick, { request: request() }, '2026-10-21');
    expect(blocked.ok).toBe(false);
    expect(blocked.warnings![0]!.ruleId).toBe('health.clearance');
    expect(await db.blocks.count()).toBe(0);
    const ok = await createPlan(db, { ...sick, health: { ...sick.health, clearance: '2026-10-15' } }, { request: request() }, '2026-10-21');
    expect(ok.ok).toBe(true);
    expect((await db.weeks.toArray()).filter((w) => w.easyOnly)).toHaveLength(4);
  });
  it('crée course, bloc, semaines et séances ; ne planifie pas avant aujourd’hui', async () => {
    const r = await createPlan(db, athlete, { request: request(), raceName: 'Trail de printemps', raceLocation: 'Québec' }, '2026-10-21');
    expect(r.ok).toBe(true);
    const block = (await db.blocks.get(r.blockId))!;
    expect(block.status).toBe('actif');
    expect(block.name).toBe('Trail de printemps');
    expect((await db.races.toArray())[0]!.name).toBe('Trail de printemps');
    const weeks = await db.weeks.where('blockId').equals(r.blockId).sortBy('index');
    expect(weeks.at(-1)!.raceDate).toBe('2027-06-05');
    const sessions = await db.sessions.toArray();
    expect(sessions.every((s) => s.date >= '2026-10-21')).toBe(true);
    expect(sessions.find((s) => s.date === '2027-06-05')!.type).toBe('course');
  });
  it('un nouvel objectif archive l’ancien et retire ses séances futures', async () => {
    const a = await createPlan(db, athlete, { request: request() }, '2026-10-21');
    const b = await createPlan(db, athlete, { request: request({ goal: 'forme', race: undefined, durationWeeks: 6 }) }, '2026-10-28');
    expect((await db.blocks.get(a.blockId))!.status).toBe('archive');
    const oldWeeks = await db.weeks.where('blockId').equals(a.blockId).primaryKeys();
    const leftovers = await db.sessions.where('weekId').anyOf(oldWeeks).filter((s) => s.date >= '2026-10-28').count();
    expect(leftovers).toBe(0);
    expect((await db.blocks.get(b.blockId))!.raceId).toBeUndefined();
  });
  it('course passée : refusée proprement', async () => {
    const r = await createPlan(db, athlete, { request: request({ race: { date: '2026-01-01', distanceKm: 10, elevationGainM: 0 } }) }, '2026-10-21');
    expect(r.ok).toBe(false);
    expect(r.warnings![0]!.ruleId).toBe('race.past');
  });
  it('course B intégrée au plan', async () => {
    const r = await createPlan(db, athlete, { request: request({ bRaces: [{ date: '2027-03-13', distanceKm: 15 }] }), raceId: 'existante' }, '2026-10-21');
    expect((await db.blocks.get(r.blockId))!.raceId).toBe('existante');
    expect((await db.sessions.where('date').equals('2027-03-13').first())!.type).toBe('course');
  });
  it('index de semaine dans la phase', () => {
    const w = [{ phase: 'base' }, { phase: 'base' }, { phase: 'spec1' }] as const;
    expect([0, 1, 2].map((i) => phaseWeekIndex([...w], i))).toEqual([0, 1, 0]);
  });
});

describe('point de départ depuis l’historique', () => {
  it('vide → zéro', async () => {
    expect(await startingPoint(db, athlete.id, '2026-10-21')).toEqual({ currentWeeklyKm: 0, recentWeeksKm: [0, 0, 0], longestRecentRunKm: 0, hasHistory: false });
  });
  it('avec historique importé', async () => {
    await importFiles(db, athlete, [{ name: 'l.csv', data: CSV_SAMPLE }]);
    const sp = await startingPoint(db, athlete.id, '2026-10-21');
    expect(sp.hasHistory).toBe(true);
    expect(sp.currentWeeklyKm).toBe(21); // semaine du lundi 12 oct. : la sortie de 21,35 km
    expect(sp.recentWeeksKm.at(-1)).toBe(8); // semaine du 5 oct. : 8,02 km
    expect(sp.longestRecentRunKm).toBe(21.4);
  });
});

describe('après la course', () => {
  it('crée un bloc de récupération et archive le bloc de course', async () => {
    const { createRecoveryPlan } = await import('./planner');
    const a = await createPlan(db, athlete, { request: request() }, '2026-10-21');
    const id = await createRecoveryPlan(db, athlete, { date: '2027-06-05', distanceKm: 30, name: 'Trail de printemps' }, 50, '2027-06-06');
    expect((await db.blocks.get(a.blockId))!.status).toBe('archive');
    const rec = (await db.blocks.get(id))!;
    expect(rec.name).toBe('Récupération : Trail de printemps');
    const weeks = await db.weeks.where('blockId').equals(id).toArray();
    expect(weeks.every((w) => w.kind === 'recup')).toBe(true);
    const sessions = await db.sessions.where('weekId').anyOf(weeks.map((w) => w.id)).toArray();
    expect(sessions.some((s) => s.isKey)).toBe(false);
  });
});
