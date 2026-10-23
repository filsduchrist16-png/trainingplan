import { C, type ISODate, type NutritionLog, type NutritionProduct } from '@/engine';
import type { SentierDB } from './db';
import { stamp } from './ids';

export interface NutritionEntry {
  date: ISODate;
  activityId?: string;
  durationMin: number;
  /** Glucides pris au total (g), liquides (mL) et tolérance digestive (0 = aucun inconfort … 5). */
  carbsG: number;
  fluidMl?: number;
  giTolerance: NutritionLog['giTolerance'];
  product?: NutritionProduct;
  tempC?: number;
  notes?: string;
}

/** Enregistre ce qui a été pris pendant une sortie et comment ça a passé (journal de tolérance). */
export async function addNutritionLog(db: SentierDB, athleteId: string, e: NutritionEntry): Promise<string> {
  const product: NutritionProduct = e.product ?? { name: 'Glucides (total)', carbsG: 1 };
  const row = stamp({
    athleteId, date: e.date, ...(e.activityId ? { activityId: e.activityId } : {}), durationMin: e.durationMin,
    products: [{ product, count: e.product ? e.carbsG / e.product.carbsG : e.carbsG }],
    ...(e.fluidMl ? { fluidMl: e.fluidMl } : {}), giTolerance: e.giTolerance, ...(e.tempC !== undefined ? { tempC: e.tempC } : {}), ...(e.notes ? { notes: e.notes } : {}),
  });
  await db.nutritionLogs.add(row);
  return row.id;
}

/** Journal de tolérance, plus ancien d'abord. */
export async function nutritionLogs(db: SentierDB, athleteId: string): Promise<NutritionLog[]> {
  return (await db.nutritionLogs.where('athleteId').equals(athleteId).toArray()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Seuil à partir duquel on propose de noter la nutrition (une sortie plus courte n'est pas un test digestif). */
export const NUTRITION_LOG_FROM_MIN = C.GUT_TRAINING_MIN_MINUTES;
