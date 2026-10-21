import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Race } from '@/engine/types';
import { SentierDB } from './db';
import { exportBackup, importBackup } from './backup';
import { createBlankAthlete } from './athlete';
import { stamp } from './ids';
import { DEMO_ATHLETE_ID, loadDemo } from './seed/demo';
import { attachOwner, clearSyncedData, installSyncHooks, lastSyncAt, onLocalChange, syncOnce, type RemoteRow, type SyncRemote } from './sync';

/** Faux serveur : mêmes règles que supabase/migrations (LWW strict sur updated_at, seq croissant). */
class FakeRemote implements SyncRemote {
  rows = new Map<string, RemoteRow & { seq: number }>();
  seq = 0;
  async push(rows: RemoteRow[]) {
    for (const r of rows) {
      const k = `${r.tbl}:${r.id}`;
      const cur = this.rows.get(k);
      if (cur && new Date(cur.updated_at) >= new Date(r.updated_at)) continue;
      // Postgres renvoie les timestamptz au format « +00:00 » : on imite pour tester la normalisation.
      this.rows.set(k, { ...structuredClone(r), updated_at: r.updated_at.replace('Z', '+00:00'), seq: ++this.seq });
    }
  }
  async pull(afterSeq: number, limit: number) {
    return [...this.rows.values()].filter((r) => r.seq > afterSeq).sort((a, b) => a.seq - b.seq).slice(0, limit).map((r) => structuredClone(r));
  }
  live(tbl: string) {
    return [...this.rows.values()].filter((r) => r.tbl === tbl && !r.deleted);
  }
}

const USER = 'user-1';
const tick = () => new Promise((r) => setTimeout(r, 5));

function race(athleteId: string, name: string): Race {
  return stamp({ athleteId, name, date: '2026-11-01', distanceKm: 21, elevationGainM: 300, terrain: 'trail' as Race['terrain'], priority: 'A' as const, intent: 'finir' as const });
}

let dbs: SentierDB[] = [];
async function device(): Promise<SentierDB> {
  const db = new SentierDB(`sync-${crypto.randomUUID()}`);
  installSyncHooks(db);
  await db.open();
  dbs.push(db);
  return db;
}
let remote: FakeRemote;

beforeEach(() => {
  remote = new FakeRemote();
});
afterEach(async () => {
  for (const db of dbs) await db.delete();
  dbs = [];
});

describe('synchro', () => {
  it('monte les données locales existantes à la première connexion, sans la démo', async () => {
    const a = await device();
    await loadDemo(a);
    const me = await createBlankAthlete(a, 'Nico');
    await a.races.add(race(me.id, 'Grand-Duc'));
    await attachOwner(a, USER);
    const r = await syncOnce(a, remote);
    expect(r.pushed).toBe(2);
    expect(remote.live('races').map((x) => x.data.name)).toEqual(['Grand-Duc']);
    expect([...remote.rows.values()].some((x) => x.athlete_id === DEMO_ATHLETE_ID || x.id === DEMO_ATHLETE_ID)).toBe(false);
    expect(await lastSyncAt(a)).toBeTruthy();
  });

  it('retrouve tout sur un deuxième appareil et choisit le profil actif', async () => {
    const a = await device();
    const me = await createBlankAthlete(a, 'Nico');
    await a.races.add(race(me.id, 'Grand-Duc'));
    await attachOwner(a, USER);
    await syncOnce(a, remote);

    const b = await device();
    await attachOwner(b, USER);
    const r = await syncOnce(b, remote);
    expect(r.pulled).toBe(2);
    expect((await b.races.toArray()).map((x) => x.name)).toEqual(['Grand-Duc']);
    expect((await b.meta.get('activeAthleteId'))?.value).toBe(me.id);
    // Un 2e passage n'apporte rien de neuf
    expect(await syncOnce(b, remote)).toEqual({ pushed: 0, pulled: 0 });
  });

  it('propage les modifications : updatedAt rafraîchi automatiquement, la dernière modif gagne', async () => {
    const a = await device();
    const me = await createBlankAthlete(a);
    const r1 = race(me.id, 'v1');
    await a.races.add(r1);
    await attachOwner(a, USER);
    await syncOnce(a, remote);
    const b = await device();
    await attachOwner(b, USER);
    await syncOnce(b, remote);

    await tick();
    await b.races.update(r1.id, { name: 'v2 (b)' });
    expect((await b.races.get(r1.id))!.updatedAt > r1.updatedAt).toBe(true);
    await syncOnce(b, remote);
    await syncOnce(a, remote);
    expect((await a.races.get(r1.id))!.name).toBe('v2 (b)');

    // Conflit : a modifie hors-ligne puis b modifie plus tard → b gagne partout
    await tick();
    await a.races.update(r1.id, { name: 'v3 (a, plus vieux)' });
    await tick();
    await b.races.update(r1.id, { name: 'v4 (b, plus récent)' });
    await syncOnce(b, remote);
    await syncOnce(a, remote);
    await syncOnce(b, remote);
    expect((await a.races.get(r1.id))!.name).toBe('v4 (b, plus récent)');
    expect((await b.races.get(r1.id))!.name).toBe('v4 (b, plus récent)');
    expect(remote.live('races')[0]!.data.name).toBe('v4 (b, plus récent)');
  });

  it('propage les suppressions (pierres tombales) mais pas celles de la démo', async () => {
    const a = await device();
    await loadDemo(a);
    const me = await createBlankAthlete(a);
    const r1 = race(me.id, 'à supprimer');
    await a.races.add(r1);
    await attachOwner(a, USER);
    await syncOnce(a, remote);
    const b = await device();
    await attachOwner(b, USER);
    await syncOnce(b, remote);

    await tick();
    await a.races.delete(r1.id);
    await a.races.where('athleteId').equals(DEMO_ATHLETE_ID).delete();
    await tick();
    const r = await syncOnce(a, remote);
    expect(r.pushed).toBe(1);
    expect(remote.live('races')).toHaveLength(0);
    expect(await a.meta.where('key').startsWith('sync.tomb:').count()).toBe(0);

    await syncOnce(b, remote);
    expect(await b.races.get(r1.id)).toBeUndefined();
  });

  it("n'écrase pas une modif locale plus récente avec une vieille version du serveur", async () => {
    const a = await device();
    const me = await createBlankAthlete(a);
    const r1 = race(me.id, 'serveur');
    await a.races.add(r1);
    await attachOwner(a, USER);
    await syncOnce(a, remote);
    // Le serveur renvoie encore la vieille ligne (curseur remis à zéro), la locale est plus récente
    await tick();
    await a.races.update(r1.id, { name: 'local récent' });
    await a.meta.put({ key: 'sync.cursor', value: 0 });
    await a.meta.put({ key: 'sync.pushedAt', value: '9999' }); // simule un push pas encore fait
    await syncOnce(a, remote);
    expect((await a.races.get(r1.id))!.name).toBe('local récent');
  });

  it('se déconnecter efface les données ; changer de compte ne mélange pas les données', async () => {
    const a = await device();
    const me = await createBlankAthlete(a);
    await a.races.add(race(me.id, 'à moi'));
    await attachOwner(a, USER);
    await syncOnce(a, remote);
    await a.meta.put({ key: 'theme', value: 'light' });

    await clearSyncedData(a);
    expect(await a.races.count()).toBe(0);
    expect(await a.athletes.count()).toBe(0);
    expect(await a.meta.where('key').startsWith('sync.').count()).toBe(0);
    expect((await a.meta.get('theme'))?.value).toBe('light');
    expect(remote.live('races')).toHaveLength(1); // rien n'est supprimé côté serveur

    // Données d'un compte A encore présentes, connexion au compte B → effacées d'abord
    await attachOwner(a, USER);
    await syncOnce(a, remote);
    expect(await a.races.count()).toBe(1);
    await attachOwner(a, 'user-2');
    expect(await a.races.count()).toBe(0);
  });

  it('un backup n\'emporte pas l\'état de synchro, et un import repart vers le serveur', async () => {
    const a = await device();
    const me = await createBlankAthlete(a);
    await a.races.add(race(me.id, 'avant'));
    await attachOwner(a, USER);
    await syncOnce(a, remote);
    const backup = await exportBackup(a);
    expect((backup.tables.meta as { key: string }[]).some((m) => m.key.startsWith('sync.'))).toBe(false);

    const result = await importBackup(a, backup);
    expect(result.ok).toBe(true);
    expect((await a.meta.get('sync.owner'))?.value).toBe(USER); // toujours associé
    expect((await a.meta.get('sync.pushedAt'))?.value).toBe('');
    const r = await syncOnce(a, remote);
    expect(r.pushed).toBe(2); // renvoyées ; le serveur les ignore car pas plus récentes
  });

  it('prévient l\'app quand une donnée locale change, pas pour les écritures de la synchro', async () => {
    const b = await device();
    const a = await device();
    const me = await createBlankAthlete(a);
    await attachOwner(a, USER);
    await syncOnce(a, remote);
    let calls = 0;
    const off = onLocalChange(() => calls++);
    await attachOwner(b, USER);
    await syncOnce(b, remote);
    await tick();
    expect(calls).toBe(0);
    await a.races.add(race(me.id, 'nouvelle'));
    await tick();
    expect(calls).toBeGreaterThan(0);
    off();
  });

  it('refuse de synchroniser un appareil non associé', async () => {
    const a = await device();
    await expect(syncOnce(a, remote)).rejects.toThrow(/non associé/);
  });
});

describe('sans compte', () => {
  it("ne garde aucune pierre tombale tant que l'appareil n'est pas associé", async () => {
    const a = await device();
    const me = await createBlankAthlete(a);
    const r1 = race(me.id, 'x');
    await a.races.add(r1);
    await a.races.delete(r1.id);
    await tick();
    expect(await a.meta.where('key').startsWith('sync.').count()).toBe(0);
  });
});
