import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SentierDB } from './db';
import { backupFileName, exportBackup, importBackup, parseBackup } from './backup';
import { DEMO_ATHLETE_ID, buildDemo, clearDemo, loadDemo } from './seed/demo';
import { stamp } from './ids';

let db: SentierDB;
const TODAY = new Date('2026-10-21T12:00:00');

beforeEach(async () => {
  db = new SentierDB(`test-${crypto.randomUUID()}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

describe('seed de démo', () => {
  it('est déterministe et réaliste', () => {
    const a = buildDemo(TODAY);
    const b = buildDemo(TODAY);
    expect(a.activities.map((x) => x.distanceKm)).toEqual(b.activities.map((x) => x.distanceKm));
    expect(a.activities.length).toBeGreaterThan(30);
    const weeklyKm = a.activities.reduce((s, x) => s + x.distanceKm, 0) / 8.5;
    expect(weeklyKm).toBeGreaterThan(30);
    expect(weeklyKm).toBeLessThan(60);
    expect(a.wellness).toHaveLength(27);
  });

  it('se charge puis s’efface sans toucher aux vraies données', async () => {
    await loadDemo(db, TODAY);
    const real = stamp({ name: 'Moi', hrMax: 185, hrRest: 50 } as never, 'real');
    await db.athletes.put(real);
    expect(await db.activities.count()).toBeGreaterThan(30);

    await clearDemo(db);
    expect(await db.activities.where('athleteId').equals(DEMO_ATHLETE_ID).count()).toBe(0);
    expect(await db.athletes.get(DEMO_ATHLETE_ID)).toBeUndefined();
    expect(await db.athletes.get('real')).toBeDefined();
    expect(await db.meta.get('demo')).toBeUndefined();
  });
});

describe('backup JSON', () => {
  it('fait un aller-retour complet', async () => {
    await loadDemo(db, TODAY);
    const backup = await exportBackup(db);
    const json = JSON.stringify(backup);

    const other = new SentierDB(`test-${crypto.randomUUID()}`);
    const result = await importBackup(other, json);
    expect(result.ok).toBe(true);
    expect(await other.activities.count()).toBe(await db.activities.count());
    expect(await other.races.toArray()).toEqual(await db.races.toArray());
    await other.delete();
  });

  it('remplace les données existantes (pas de fusion silencieuse)', async () => {
    await loadDemo(db, TODAY);
    const empty = await exportBackup(new SentierDB(`test-${crypto.randomUUID()}`));
    await importBackup(db, empty);
    expect(await db.activities.count()).toBe(0);
  });

  it('refuse un fichier invalide sans rien modifier', async () => {
    await loadDemo(db, TODAY);
    const before = await db.activities.count();

    expect(await importBackup(db, '{pas du json')).toEqual({ ok: false, error: "Ce fichier n'est pas du JSON valide." });
    const bad = await importBackup(db, { app: 'sentier', schemaVersion: 1, exportedAt: 'x', tables: { activities: [{ id: 'a' }] } });
    expect(bad.ok).toBe(false);
    expect(await db.activities.count()).toBe(before);
  });

  it('refuse un backup d’une version plus récente', () => {
    const r = parseBackup({ app: 'sentier', schemaVersion: 999, exportedAt: 'x', tables: {} });
    expect(r.ok).toBe(false);
  });

  it('refuse un JSON qui ne vient pas de Sentier', () => {
    expect(parseBackup({ hello: 'world' }).ok).toBe(false);
  });

  it('nomme le fichier avec la date', () => {
    expect(backupFileName(new Date('2026-10-21T10:00:00Z'))).toBe('sentier-backup-2026-10-21.json');
  });
});
