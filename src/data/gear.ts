import { C, type Shoe, type ShoeChoice, type Terrain } from '@/engine';
import type { SentierDB } from './db';
import { nowIso, stamp } from './ids';

/** Paires de l'athlète avec leurs km : km initiaux + km des sorties associées. */
export async function shoesWithKm(db: SentierDB, athleteId: string): Promise<ShoeChoice[]> {
  const shoes = await db.shoes.where('athleteId').equals(athleteId).toArray();
  const acts = await db.activities.where('athleteId').equals(athleteId).filter((a) => a.shoeId !== undefined).toArray();
  const km = new Map<string, number>();
  for (const a of acts) km.set(a.shoeId!, (km.get(a.shoeId!) ?? 0) + a.distanceKm);
  return shoes.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name)).map((shoe) => ({ shoe, km: Math.round((shoe.initialKm + (km.get(shoe.id) ?? 0)) * 10) / 10 }));
}

export interface NewShoe {
  name: string;
  model?: string;
  /** Neuve : km initiaux à 0 et rodage ; déjà utilisée : km déjà faits, pas de rodage. */
  initialKm: number;
  terrain: Terrain;
  retireKm?: number;
  breakInKm?: number;
}

export async function addShoe(db: SentierDB, athleteId: string, s: NewShoe): Promise<Shoe> {
  const shoe: Shoe = stamp({
    athleteId, name: s.name.trim(), ...(s.model?.trim() ? { model: s.model.trim() } : {}), initialKm: s.initialKm,
    breakInKm: s.breakInKm ?? (s.initialKm === 0 ? C.SHOE_BREAK_IN_KM : 0), retireKm: s.retireKm ?? C.SHOE_RETIRE_KM, active: true, terrain: s.terrain,
  });
  await db.shoes.add(shoe);
  return shoe;
}

/** Associe (ou dissocie) une paire à une activité. */
export async function setActivityShoe(db: SentierDB, activityId: string, shoeId: string | undefined): Promise<void> {
  await db.activities.update(activityId, { shoeId, updatedAt: nowIso() });
}

export async function setShoeActive(db: SentierDB, shoeId: string, active: boolean): Promise<void> {
  await db.shoes.update(shoeId, { active, updatedAt: nowIso() });
}
