import type { Transaction } from 'dexie';
import { TABLES, type SentierDB, type TableName } from './db';
import { DEMO_ATHLETE_ID } from './seed/demo';
import { nowIso } from './ids';

/**
 * Synchro local-first avec un serveur (Supabase en prod, faux serveur en test).
 *
 * - IndexedDB reste la source de vérité de l'app : tout marche hors-ligne.
 * - Chaque ligne a un `updatedAt` ; « la dernière modif gagne », côté client comme côté serveur.
 * - Les suppressions laissent une pierre tombale (meta `sync.tomb:<table>:<id>`) pour être propagées.
 * - Les données de démo ne quittent jamais l'appareil.
 *
 * Les clés meta `sync.*` sont internes : exclues des backups.
 */

export const SYNCED_TABLES = TABLES.filter((t) => t !== 'meta') as Exclude<TableName, 'meta'>[];
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export const SYNC_META_PREFIX = 'sync.';
const TOMB_PREFIX = 'sync.tomb:';
const K = { owner: 'sync.owner', pushedAt: 'sync.pushedAt', cursor: 'sync.cursor', lastSyncAt: 'sync.lastSyncAt' } as const;

export interface RemoteRow {
  tbl: string;
  id: string;
  athlete_id: string | null;
  data: Record<string, unknown>;
  updated_at: string;
  deleted: boolean;
}

export interface SyncRemote {
  /** Écrit les lignes ; une ligne plus vieille que celle du serveur est ignorée (LWW). */
  push(rows: RemoteRow[]): Promise<void>;
  /** Lignes écrites après `afterSeq`, dans l'ordre croissant de `seq`. */
  pull(afterSeq: number, limit: number): Promise<(RemoteRow & { seq: number })[]>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

type Row = { id: string; updatedAt?: string; athleteId?: string } & Record<string, unknown>;

const PUSH_BATCH = 400;
const PULL_PAGE = 1000;

// Transactions ouvertes par la synchro : les hooks les laissent passer telles quelles.
const fromSync = new WeakSet<Transaction>();
const listeners = new Set<() => void>();
const installed = new WeakSet<SentierDB>();

/** Prévient l'app qu'une donnée locale a changé (pour déclencher une synchro différée). */
export function onLocalChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const isDemo = (table: SyncedTable, row: { id: string; athleteId?: string }) =>
  table === 'athletes' ? row.id === DEMO_ATHLETE_ID : row.athleteId === DEMO_ATHLETE_ID;

/**
 * Branche le suivi des modifications sur la base. À appeler une fois, avant toute écriture.
 * - Mise à jour : `updatedAt` est rafraîchi automatiquement.
 * - Suppression : pierre tombale enregistrée après la transaction.
 */
export function installSyncHooks(db: SentierDB): void {
  if (installed.has(db)) return;
  installed.add(db);
  for (const name of SYNCED_TABLES) {
    const table = db.table(name);
    table.hook('creating', function (_key, _obj, trans) {
      if (!fromSync.has(trans)) trans.on('complete', notify);
    });
    table.hook('updating', function (mods, _key, _obj, trans) {
      if (fromSync.has(trans)) return undefined;
      trans.on('complete', notify);
      return 'updatedAt' in mods ? undefined : { updatedAt: nowIso() };
    });
    table.hook('deleting', function (key, obj, trans) {
      if (fromSync.has(trans)) return;
      const row = obj as Row;
      if (isDemo(name, row)) return;
      const at = nowIso();
      trans.on('complete', () => {
        // Sans compte, rien à propager : pas de pierre tombale qui s'accumule.
        void syncOwner(db).then(async (owner) => {
          if (!owner) return;
          await db.meta.put({ key: `${TOMB_PREFIX}${name}:${String(key)}`, value: { at, athleteId: row.athleteId ?? null } });
          notify();
        });
      });
    });
  }
}

function notify() {
  for (const fn of listeners) fn();
}

async function getMeta<T>(db: SentierDB, key: string, fallback: T): Promise<T> {
  return ((await db.meta.get(key))?.value as T | undefined) ?? fallback;
}

/** Propriétaire des données synchronisées sur cet appareil (null = jamais connecté). */
export function syncOwner(db: SentierDB): Promise<string | null> {
  return getMeta<string | null>(db, K.owner, null);
}

export function lastSyncAt(db: SentierDB): Promise<string | null> {
  return getMeta<string | null>(db, K.lastSyncAt, null);
}

/**
 * Associe l'appareil à un compte. Les données locales existantes (hors démo) seront envoyées
 * au prochain `syncOnce` : c'est comme ça qu'on « monte » ses données en créant un compte.
 * Si l'appareil était associé à un AUTRE compte, ses données locales sont d'abord effacées.
 */
export async function attachOwner(db: SentierDB, userId: string): Promise<void> {
  const current = await syncOwner(db);
  if (current === userId) return;
  if (current) await clearSyncedData(db);
  await db.meta.bulkPut([
    { key: K.owner, value: userId },
    { key: K.pushedAt, value: '' },
    { key: K.cursor, value: 0 },
  ]);
}

/** Efface toutes les données synchronisées et l'état de synchro (déconnexion). Thème, etc. sont gardés. */
export async function clearSyncedData(db: SentierDB): Promise<void> {
  await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.meta], async (tx) => {
    fromSync.add(tx);
    for (const t of SYNCED_TABLES) await db.table(t).clear();
    await db.meta.where('key').startsWith(SYNC_META_PREFIX).delete();
    await db.meta.delete('activeAthleteId');
  });
}

/** Après un import de backup : tout renvoyer au prochain passage. */
export async function markAllForPush(db: SentierDB): Promise<void> {
  if (await syncOwner(db)) await db.meta.put({ key: K.pushedAt, value: '' });
}

let running: Promise<SyncResult> | null = null;

/** Un aller-retour complet : envoyer les changements locaux, puis récupérer ceux du serveur. */
export function syncOnce(db: SentierDB, remote: SyncRemote): Promise<SyncResult> {
  // Une seule synchro à la fois ; un appel pendant qu'une tourne attend celle-ci.
  running ??= (async () => {
    try {
      if (!(await syncOwner(db))) throw new Error('Appareil non associé à un compte (attachOwner).');
      const pushed = await push(db, remote);
      const pulled = await pull(db, remote);
      await db.meta.put({ key: K.lastSyncAt, value: nowIso() });
      return { pushed, pulled };
    } finally {
      running = null;
    }
  })();
  return running;
}

async function push(db: SentierDB, remote: SyncRemote): Promise<number> {
  const since = await getMeta(db, K.pushedAt, '');
  const startedAt = nowIso();
  const rows: RemoteRow[] = [];

  for (const name of SYNCED_TABLES) {
    const changed = (await db.table(name).filter((r: Row) => (r.updatedAt ?? '') > since).toArray()) as Row[];
    for (const r of changed) {
      if (isDemo(name, r)) continue;
      rows.push({ tbl: name, id: r.id, athlete_id: name === 'athletes' ? r.id : (r.athleteId ?? null), data: r, updated_at: r.updatedAt ?? startedAt, deleted: false });
    }
  }

  const tombs = await db.meta.where('key').startsWith(TOMB_PREFIX).toArray();
  const sentTombs: string[] = [];
  for (const t of tombs) {
    const rest = t.key.slice(TOMB_PREFIX.length);
    const sep = rest.indexOf(':');
    const name = rest.slice(0, sep);
    const id = rest.slice(sep + 1);
    sentTombs.push(t.key);
    // Recréée depuis (ex. import de backup) : la ligne vivante gagne, la pierre tombale est jetée.
    if (sep < 0 || !SYNCED_TABLES.includes(name as SyncedTable) || (await db.table(name).get(id))) continue;
    const v = t.value as { at: string; athleteId: string | null };
    rows.push({ tbl: name, id, athlete_id: v.athleteId, data: {}, updated_at: v.at, deleted: true });
  }

  for (let i = 0; i < rows.length; i += PUSH_BATCH) await remote.push(rows.slice(i, i + PUSH_BATCH));

  await db.transaction('rw', db.meta, async () => {
    await db.meta.bulkDelete(sentTombs);
    await db.meta.put({ key: K.pushedAt, value: startedAt });
  });
  return rows.length;
}

async function pull(db: SentierDB, remote: SyncRemote): Promise<number> {
  let cursor = await getMeta(db, K.cursor, 0);
  let total = 0;
  for (;;) {
    const page = await remote.pull(cursor, PULL_PAGE);
    if (page.length === 0) break;
    await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.meta], async (tx) => {
      fromSync.add(tx);
      for (const r of page) {
        if (!SYNCED_TABLES.includes(r.tbl as SyncedTable)) continue; // table d'une version plus récente de l'app
        const table = db.table(r.tbl);
        const local = (await table.get(r.id)) as Row | undefined;
        const remoteAt = r.deleted ? new Date(r.updated_at).toISOString() : String(r.data.updatedAt ?? '');
        if (local && (local.updatedAt ?? '') >= remoteAt) continue; // la version locale est aussi récente : on la garde
        if (r.deleted) {
          if (local) await table.delete(r.id);
        } else {
          await table.put(r.data);
        }
        total++;
      }
      cursor = page[page.length - 1]!.seq;
      await db.meta.put({ key: K.cursor, value: cursor });
    });
    if (page.length < PULL_PAGE) break;
  }
  await ensureActiveAthlete(db);
  return total;
}

/** Sur un nouvel appareil, après le premier pull : choisir l'athlète reçu comme profil actif. */
async function ensureActiveAthlete(db: SentierDB): Promise<void> {
  const active = await db.meta.get('activeAthleteId');
  if (active && (await db.athletes.get(active.value as string))) return;
  const first = await db.athletes.filter((a) => a.id !== DEMO_ATHLETE_ID).first();
  if (first) await db.meta.put({ key: 'activeAthleteId', value: first.id });
}
