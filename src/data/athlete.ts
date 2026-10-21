import type { Athlete } from '@/engine/types';
import type { SentierDB } from './db';
import { stamp } from './ids';

/**
 * Profil vierge avec des valeurs par défaut prudentes, à affiner dans l'assistant « Nouvel objectif ».
 * FCmax 190 et FC repos 60 sont des placeholders signalés comme « estimés » : l'app propose un test.
 */
export async function createBlankAthlete(db: SentierDB, name = 'Moi'): Promise<Athlete> {
  const athlete: Athlete = stamp({
    name,
    experience: 'debutant',
    hrMax: 190,
    hrMaxSource: 'estimee',
    hrRest: 60,
    zones: { mode: 'auto', bounds: [123, 143, 162, 176] },
    vo2maxHistory: [],
    cadenceTarget: [170, 180],
    injuries: [],
    availability: {
      runDaysPerWeek: 3,
      allowedDays: [2, 4, 6],
      longRunDay: 6,
      maxWeekdayMinutes: 60,
      maxWeekendMinutes: 90,
      strengthPerWeek: 1,
    },
    crossTraining: [],
    hasPoles: false,
    localVertical: 'vallonne',
    settings: { loadMethod: 'sentier', theme: 'dark' },
  });
  await db.transaction('rw', db.athletes, db.meta, async () => {
    await db.athletes.add(athlete);
    await db.meta.put({ key: 'activeAthleteId', value: athlete.id });
  });
  return athlete;
}
