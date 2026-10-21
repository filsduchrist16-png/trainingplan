import type { Entity, ISODateTime } from '@/engine/types';

export const newId = (): string => crypto.randomUUID();
export const nowIso = (): ISODateTime => new Date().toISOString();

/** Ajoute id/createdAt/updatedAt à un objet métier. */
export function stamp<T extends object>(data: T, id: string = newId()): T & Entity {
  const now = nowIso();
  return { ...data, id, createdAt: now, updatedAt: now };
}
