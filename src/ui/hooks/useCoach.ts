import { useLiveQuery } from 'dexie-react-hooks';
import {
  acwr, addDays, dailyLoads, evaluateHealth, mondayOf, toIsoDate,
  type AcwrResult, type Athlete, type Block, type HealthStatus, type PlannedSession, type Race, type Week, type Wellness,
} from '@/engine';
import { db } from '@/data/db';

export interface CoachContext {
  today: string;
  block?: Block;
  weeks: Week[];
  weekIndex: number;
  week?: Week;
  race?: Race;
  nextRace?: Race;
  todaySessions: PlannedSession[];
  weekSessions: PlannedSession[];
  wellnessToday?: Wellness;
  health: HealthStatus;
  acwr: AcwrResult;
  weekDone: { km: number; gain: number; keys: number };
  hrRestTrend: number[];
  lastSleep?: number;
}

/** Tout ce dont l'écran Aujourd'hui a besoin, recalculé en direct quand les données changent. */
export function useCoach(athlete: Athlete): CoachContext | undefined {
  return useLiveQuery(async () => {
    const today = toIsoDate(new Date());
    const block = await db.blocks.where('status').equals('actif').filter((b) => b.athleteId === athlete.id).first();
    const weeks = block ? await db.weeks.where('blockId').equals(block.id).sortBy('index') : [];
    const monday = mondayOf(today);
    const weekIndex = weeks.findIndex((w) => w.startDate === monday);
    const week = weekIndex >= 0 ? weeks[weekIndex] : undefined;
    const race = block?.raceId ? await db.races.get(block.raceId) : undefined;
    const nextRace = await db.races.where('date').aboveOrEqual(today).filter((r) => r.athleteId === athlete.id && r.priority === 'A').first();
    const weekSessions = await db.sessions.where('date').between(monday, addDays(monday, 6), true, true).filter((s) => s.athleteId === athlete.id).toArray();
    const todaySessions = weekSessions.filter((s) => s.date === today);

    const since = addDays(today, -40);
    const [acts, pain, wellness] = await Promise.all([
      db.activities.where('date').between(since, today, true, true).filter((a) => a.athleteId === athlete.id).toArray(),
      db.painLogs.where('date').between(addDays(today, -14), today, true, true).filter((p) => p.athleteId === athlete.id).toArray(),
      db.wellness.where('date').between(addDays(today, -14), today, true, true).filter((w) => w.athleteId === athlete.id).toArray(),
    ]);
    const first = await db.activities.where('athleteId').equals(athlete.id).toArray().then((all) => all.reduce<string | undefined>((m, a) => (!m || a.date < m ? a.date : m), undefined));
    const health = evaluateHealth({ today, pain, wellness, hrRestBaseline: athlete.hrRest, injuries: athlete.injuries });
    const inBuild = week?.kind === 'build';
    const ratio = acwr(dailyLoads(acts), today, { ...(first ? { firstActivity: first } : {}), inBuildPhase: inBuild });
    const thisWeek = acts.filter((a) => a.date >= monday && (a.sport === 'course' || a.sport === 'trail'));
    const doneKeys = weekSessions.filter((s) => s.isKey && s.status === 'faite').length;
    const sorted = wellness.sort((a, b) => a.date.localeCompare(b.date));
    return {
      today, block, weeks, weekIndex, week, race, nextRace, todaySessions, weekSessions,
      wellnessToday: sorted.find((w) => w.date === today),
      health,
      acwr: ratio,
      weekDone: { km: thisWeek.reduce((s, a) => s + a.distanceKm, 0), gain: thisWeek.reduce((s, a) => s + a.elevationGainM, 0), keys: doneKeys },
      hrRestTrend: sorted.filter((w) => w.hrRest).slice(-7).map((w) => w.hrRest!),
      lastSleep: sorted.filter((w) => w.sleepHours).at(-1)?.sleepHours,
    };
  }, [athlete.id, athlete.hrRest, athlete.injuries]);
}
