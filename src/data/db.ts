import Dexie, { type EntityTable } from 'dexie';
import type {
  Activity, Athlete, Block, Exercise, Milestone, NutritionLog, PainLog, PlannedSession,
  PreventionCheck, Race, Shoe, StrengthSession, Subjective, Week, Wellness,
} from '@/engine/types';

export interface Meta {
  key: string;
  value: unknown;
}

/**
 * Base IndexedDB locale. Rien ne quitte l'appareil.
 * Chaque changement de schéma = nouvelle `version()` avec migration ; ne jamais modifier une version publiée.
 */
export class SentierDB extends Dexie {
  athletes!: EntityTable<Athlete, 'id'>;
  races!: EntityTable<Race, 'id'>;
  blocks!: EntityTable<Block, 'id'>;
  weeks!: EntityTable<Week, 'id'>;
  sessions!: EntityTable<PlannedSession, 'id'>;
  activities!: EntityTable<Activity, 'id'>;
  subjectives!: EntityTable<Subjective, 'id'>;
  wellness!: EntityTable<Wellness, 'id'>;
  painLogs!: EntityTable<PainLog, 'id'>;
  strengthSessions!: EntityTable<StrengthSession, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;
  shoes!: EntityTable<Shoe, 'id'>;
  nutritionLogs!: EntityTable<NutritionLog, 'id'>;
  preventionChecks!: EntityTable<PreventionCheck, 'id'>;
  milestones!: EntityTable<Milestone, 'id'>;
  meta!: EntityTable<Meta, 'key'>;

  constructor(name = 'sentier') {
    super(name);
    this.version(1).stores({
      athletes: 'id',
      races: 'id, athleteId, date, priority',
      blocks: 'id, athleteId, status, raceId, startDate',
      weeks: 'id, athleteId, blockId, startDate, [blockId+index]',
      sessions: 'id, athleteId, weekId, date, status, activityId',
      activities: 'id, athleteId, date, startTime, &fingerprint, shoeId',
      subjectives: 'id, athleteId, date, activityId',
      wellness: 'id, athleteId, &[athleteId+date], date',
      painLogs: 'id, athleteId, date, zone',
      strengthSessions: 'id, athleteId, date',
      exercises: 'id, category',
      shoes: 'id, athleteId, active',
      nutritionLogs: 'id, athleteId, date, activityId',
      preventionChecks: 'id, athleteId, date',
      milestones: 'id, athleteId, &[athleteId+key]',
      meta: 'key',
    });
  }
}

export const TABLES = [
  'athletes', 'races', 'blocks', 'weeks', 'sessions', 'activities', 'subjectives', 'wellness',
  'painLogs', 'strengthSessions', 'exercises', 'shoes', 'nutritionLogs', 'preventionChecks', 'milestones', 'meta',
] as const;
export type TableName = (typeof TABLES)[number];

export const SCHEMA_VERSION = 1;

export const db = new SentierDB();

/** Demande au navigateur de ne pas purger nos données (iOS Safari purge sinon après ~7 jours d'inactivité). */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
