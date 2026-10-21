import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';

/** Athlète actif (v1 : un seul profil à la fois). `undefined` pendant le chargement, `null` si aucun. */
export function useActiveAthlete() {
  return useLiveQuery(async () => {
    const meta = await db.meta.get('activeAthleteId');
    if (!meta) return null;
    return (await db.athletes.get(meta.value as string)) ?? null;
  });
}

export function useIsDemo() {
  return useLiveQuery(async () => Boolean((await db.meta.get('demo'))?.value), [], false);
}
