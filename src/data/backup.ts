import { z } from 'zod';
import { SCHEMA_VERSION, TABLES, type Meta, type SentierDB, type TableName } from './db';
import { SYNC_META_PREFIX, markAllForPush } from './sync';

/**
 * Backup JSON complet. Format :
 * { app: "sentier", schemaVersion, exportedAt, tables: { <table>: [...] } }
 * L'import valide tout AVANT d'écrire, puis remplace la base dans une seule transaction :
 * un fichier corrompu ne laisse jamais la base à moitié importée.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue YYYY-MM-DD');
const entity = z.looseObject({ id: z.string().min(1), createdAt: z.string(), updatedAt: z.string() });
const owned = entity.extend({ athleteId: z.string().min(1) });
const dated = owned.extend({ date: isoDate });

const rowSchemas: Record<TableName, z.ZodType> = {
  athletes: entity.extend({ name: z.string(), hrMax: z.number(), hrRest: z.number() }),
  races: dated.extend({ name: z.string(), distanceKm: z.number().nonnegative(), priority: z.enum(['A', 'B', 'C']) }),
  blocks: owned.extend({ startDate: isoDate, endDate: isoDate, status: z.string() }),
  weeks: owned.extend({ blockId: z.string(), index: z.number().int().nonnegative(), startDate: isoDate }),
  sessions: dated.extend({ weekId: z.string(), type: z.string(), durationMin: z.number().nonnegative() }),
  activities: dated.extend({ fingerprint: z.string(), startTime: z.string(), durationSec: z.number().nonnegative(), distanceKm: z.number().nonnegative() }),
  subjectives: dated,
  wellness: dated,
  painLogs: dated.extend({ zone: z.string(), intensity: z.number().min(0).max(10) }),
  strengthSessions: dated,
  exercises: entity.extend({ name: z.string() }),
  shoes: owned.extend({ name: z.string(), initialKm: z.number() }),
  nutritionLogs: dated,
  preventionChecks: dated,
  milestones: dated.extend({ key: z.string() }),
  meta: z.looseObject({ key: z.string() }),
};

const backupSchema = z.object({
  app: z.literal('sentier'),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  tables: z.object(Object.fromEntries(TABLES.map((t) => [t, z.array(rowSchemas[t]).default([])]))),
});

export interface Backup {
  app: 'sentier';
  schemaVersion: number;
  exportedAt: string;
  tables: Record<TableName, unknown[]>;
}

export async function exportBackup(db: SentierDB): Promise<Backup> {
  const tables = {} as Record<TableName, unknown[]>;
  await db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) tables[t] = await db.table(t).toArray();
  });
  // L'état de synchro (curseurs, pierres tombales) est propre à l'appareil : jamais dans un backup.
  tables.meta = (tables.meta as Meta[]).filter((m) => !m.key.startsWith(SYNC_META_PREFIX));
  return { app: 'sentier', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables };
}

export type ImportResult =
  | { ok: true; counts: Record<TableName, number> }
  | { ok: false; error: string };

/** Valide un backup (objet déjà parsé ou texte JSON) sans rien écrire. */
export function parseBackup(input: unknown): { ok: true; backup: Backup } | { ok: false; error: string } {
  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      return { ok: false, error: "Ce fichier n'est pas du JSON valide." };
    }
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Backup invalide (${issue?.path.join('.') || 'racine'}) : ${issue?.message}` };
  }
  if (parsed.data.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'Ce backup vient d’une version plus récente de Sentier. Mets l’app à jour avant d’importer.' };
  }
  return { ok: true, backup: parsed.data as Backup };
}

/** Remplace TOUTES les données par celles du backup (transaction unique). */
export async function importBackup(db: SentierDB, input: unknown): Promise<ImportResult> {
  const parsed = parseBackup(input);
  if (!parsed.ok) return parsed;
  const counts = {} as Record<TableName, number>;
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    // On garde l'état de synchro de l'appareil (compte associé, curseurs).
    const syncState = await db.meta.where('key').startsWith(SYNC_META_PREFIX).toArray();
    for (const t of TABLES) {
      const rows = (parsed.backup.tables[t] ?? []) as Meta[];
      await db.table(t).clear();
      await db.table(t).bulkAdd(t === 'meta' ? rows.filter((m) => !m.key.startsWith(SYNC_META_PREFIX)) : rows);
      counts[t] = rows.length;
    }
    await db.meta.bulkPut(syncState);
  });
  // Avec un compte, les données importées repartent vers le serveur au prochain passage.
  await markAllForPush(db);
  return { ok: true, counts };
}

export function backupFileName(date = new Date()): string {
  return `sentier-backup-${date.toISOString().slice(0, 10)}.json`;
}
