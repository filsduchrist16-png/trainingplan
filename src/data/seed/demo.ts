import { addDays, format, startOfDay, startOfWeek, subWeeks } from 'date-fns';
import type { Activity, Athlete, Race, Shoe, Wellness } from '@/engine/types';
import type { SentierDB } from '../db';
import { stamp } from '../ids';
import { createPlan } from '../planner';
import { activityLoad, addDays as addIso, isRunType, mondayOf, toIsoDate } from '@/engine';

/**
 * Données de démo réalistes pour voir l'app vivante dès le premier lancement.
 * Profil : coureur trail québécois, ~45 km/sem, historique de périostite dormante.
 * Déterministe (PRNG à graine) pour que les tests et les captures soient stables.
 * Tout ce qui est créé ici est marqué `source: 'demo'` ou listé dans meta.demoIds pour l'effacement.
 */

export const DEMO_ATHLETE_ID = 'demo-athlete';
const DEMO_WEEKS = 8;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export function buildDemo(today: Date = new Date()) {
  const rand = rng(42);
  const jitter = (v: number, pct: number) => v * (1 + (rand() * 2 - 1) * pct);

  const athlete: Athlete = stamp(
    {
      name: 'Nicolas (démo)',
      sex: 'homme' as const,
      birthYear: 1990,
      weightKg: 75,
      experience: 'regulier' as const,
      hrMax: 190,
      hrMaxSource: 'estimee' as const,
      hrRest: 52,
      zones: { mode: 'auto' as const, bounds: [123, 143, 162, 176] as [number, number, number, number] },
      vdot: 45,
      vdotSource: 'course' as const,
      vo2maxHistory: [
        { date: iso(subWeeks(today, 8)), value: 44 },
        { date: iso(subWeeks(today, 4)), value: 45 },
        { date: iso(today), value: 46 },
      ],
      cadenceTarget: [172, 176] as [number, number],
      injuries: [{ zone: 'tibia_d' as const, label: 'Périostite tibiale', status: 'dormante' as const }],
      painFreeBaselineKm: 50,
      availability: {
        runDaysPerWeek: 5,
        allowedDays: [1, 2, 3, 4, 5, 6, 7] as (1 | 2 | 3 | 4 | 5 | 6 | 7)[],
        longRunDay: 6 as const,
        maxWeekdayMinutes: 75,
        maxWeekendMinutes: 240,
        strengthPerWeek: 2 as const,
      },
      crossTraining: ['velo' as const],
      hasPoles: true,
      localVertical: 'montagneux' as const,
      settings: { loadMethod: 'sentier' as const, theme: 'dark' as const },
    },
    DEMO_ATHLETE_ID,
  );

  const owned = { athleteId: DEMO_ATHLETE_ID };

  const races: Race[] = [
    stamp({
      ...owned,
      name: 'Trail du Grand-Duc 40 km',
      date: iso(addDays(today, 4)),
      distanceKm: 43,
      elevationGainM: 1500,
      terrain: 'sentier' as const,
      priority: 'A' as const,
      intent: 'finir' as const,
      location: 'Parc national de la Jacques-Cartier',
      profile: grandDucProfile(),
    }),
    stamp({
      ...owned,
      name: 'Lac Beauport 30 km',
      date: iso(subWeeks(today, 19)),
      distanceKm: 30,
      elevationGainM: 900,
      terrain: 'sentier' as const,
      priority: 'B' as const,
      intent: 'effort_test' as const,
      location: 'Lac-Beauport',
      result: { timeMin: 214 },
    }),
  ];

  const shoes: Shoe[] = [
    stamp({ ...owned, name: 'Peregrine 15', model: 'Saucony Peregrine 15', initialKm: 310, breakInKm: 0, retireKm: 700, active: true, terrain: 'sentier' as const }),
    stamp({ ...owned, name: 'Décathlon à rôder', model: 'Kiprun', initialKm: 0, breakInKm: 200, retireKm: 700, active: true, terrain: 'mixte' as const }),
  ];

  // Semaine type : mar Z2, mer qualité, jeu Z2 court, sam longue sentier, dim Z1/Z2.
  const template = [
    { dow: 1, km: 8, pace: 6.1, hr: 136, dplus: 60, sport: 'course' as const, name: 'Z2 + strides' },
    { dow: 2, km: 10, pace: 5.4, hr: 152, dplus: 180, sport: 'trail' as const, name: 'Côtes longues' },
    { dow: 3, km: 7, pace: 6.2, hr: 134, dplus: 40, sport: 'course' as const, name: 'Z2 facile' },
    { dow: 5, km: 20, pace: 7.4, hr: 141, dplus: 650, sport: 'trail' as const, name: 'Longue sentier' },
    { dow: 6, km: 8, pace: 6.4, hr: 130, dplus: 90, sport: 'trail' as const, name: 'Z1/Z2 récup' },
  ];

  const activities: Activity[] = [];
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
  for (let w = DEMO_WEEKS; w >= 0; w--) {
    const monday = subWeeks(thisMonday, w);
    const deload = w === 4 || w <= 1; // décharge, puis affûtage avant la course (semaine en cours incluse)
    const scale = w === 0 ? 0.5 : deload ? 0.65 : 0.9 + (DEMO_WEEKS - w) * 0.03;
    for (const t of template) {
      if (rand() < 0.08) continue; // séance ratée (vie de parent)
      const day = addDays(monday, t.dow);
      if (day >= startOfDay(today)) continue; // rien dans le futur
      const km = Math.round(jitter(t.km * scale, 0.08) * 10) / 10;
      const pace = jitter(t.pace - (DEMO_WEEKS - w) * 0.02, 0.03); // le Z2 s'améliore doucement
      const durationSec = Math.round(km * pace * 60);
      const hrAvg = Math.round(jitter(t.hr, 0.02));
      const dplus = Math.round(jitter(t.dplus * scale, 0.1));
      const start = new Date(day);
      start.setHours(t.dow >= 5 ? 7 : 5, 30, 0, 0);
      activities.push(
        stamp({
          ...owned,
          source: 'demo' as const,
          fingerprint: `demo-${iso(day)}-${t.dow}`,
          sport: t.sport,
          startTime: start.toISOString(),
          date: iso(day),
          name: t.name,
          durationSec,
          movingSec: Math.round(durationSec * 0.97),
          distanceKm: km,
          elevationGainM: dplus,
          elevationLossM: dplus,
          hrAvg,
          hrMax: hrAvg + Math.round(15 + rand() * 12),
          cadenceAvg: Math.round(jitter(169 + (DEMO_WEEKS - w) * 0.3, 0.01)),
          // Répartition des zones plausible : facile quand la FC moyenne reste en Z2, plus de soutenu sinon.
          timeInZonesSec: ((easy) => (easy ? [0.1, 0.78, 0.09, 0.03, 0] : [0.05, 0.4, 0.25, 0.25, 0.05]).map((x) => Math.round(x * durationSec * 0.97)) as [number, number, number, number, number])(hrAvg <= athlete.zones.bounds[1]),
          terrain: t.sport === 'trail' ? ('sentier' as const) : ('route' as const),
          shoeId: t.sport === 'trail' ? shoes[0]!.id : shoes[1]!.id,
          load: activityLoad({ durationSec, elevationGainM: dplus, hrAvg }, athlete.zones.bounds).load,
        }),
      );
    }
  }

  const wellness: Wellness[] = [];
  for (let d = 27; d >= 0; d--) {
    const day = addDays(today, -d);
    // Le matin même reste vierge : c'est à toi de dire comment tu te sens.
    if (d === 0) continue;
    const shortNight = rand() < 0.2;
    wellness.push(
      stamp({
        ...owned,
        date: iso(day),
        shortNight,
        sleepHours: Math.round((shortNight ? 4 + rand() * 1.5 : 6 + rand() * 1.8) * 10) / 10,
        bodyBattery: Math.round(shortNight ? 25 + rand() * 25 : 50 + rand() * 40),
        hrRest: Math.round(52 + (shortNight ? 3 : 0) + (rand() * 4 - 2)),
        hrv: shortNight ? ('desequilibre' as const) : ('equilibre' as const),
      }),
    );
  }

  return { athlete, races, shoes, activities, wellness };
}

/** Profil approximatif d'un 43 km / 1500 m D+ en forêt boréale (illustratif, pas le tracé officiel). */
function grandDucProfile(): [number, number][] {
  const pts: [number, number][] = [];
  for (let km = 0; km <= 43; km += 0.5) {
    const alt = 240 + 180 * Math.sin(km / 4.2) + 120 * Math.sin(km / 1.7 + 1) + 90 * Math.sin(km / 9 + 0.5) + km * 2;
    pts.push([km, Math.round(alt)]);
  }
  return pts;
}

export async function loadDemo(db: SentierDB, today: Date = new Date()): Promise<void> {
  const demo = buildDemo(today);
  await db.transaction('rw', [db.athletes, db.races, db.shoes, db.activities, db.wellness, db.meta], async () => {
    await db.athletes.put(demo.athlete);
    await db.races.bulkPut(demo.races);
    await db.shoes.bulkPut(demo.shoes);
    await db.activities.bulkPut(demo.activities);
    await db.wellness.bulkPut(demo.wellness);
    await db.meta.put({ key: 'activeAthleteId', value: DEMO_ATHLETE_ID });
    await db.meta.put({ key: 'demo', value: true });
  });

  // Un vrai plan généré par le moteur : le bloc de 27 semaines vers le Grand-Duc, passé compris.
  const race = demo.races[0]!;
  const lac = demo.races[1]!;
  const todayIso = toIsoDate(today);
  const start = addIso(mondayOf(race.date), -26 * 7);
  await createPlan(
    db,
    demo.athlete,
    {
      request: {
        goal: 'trail_moyen',
        startDate: start,
        race: { date: race.date, distanceKm: race.distanceKm, elevationGainM: race.elevationGainM },
        experience: 'regulier',
        difficulty: 'equilibre',
        currentWeeklyKm: 25,
        availability: demo.athlete.availability,
        vdot: demo.athlete.vdot,
        bRaces: [{ date: lac.date, distanceKm: lac.distanceKm, name: lac.name }],
      },
      raceId: race.id,
      raceName: race.name,
    },
    todayIso,
    start,
  );
  // Associe l'historique de démo aux séances passées du même jour.
  const past = await db.sessions.where('date').below(todayIso).filter((x) => x.athleteId === DEMO_ATHLETE_ID).toArray();
  const byDate = new Map(demo.activities.map((a) => [a.date, a]));
  await db.transaction('rw', db.sessions, async () => {
    for (const ses of past) {
      if (ses.type === 'repos' || !isRunType(ses.type)) continue;
      const act = byDate.get(ses.date);
      await db.sessions.update(ses.id, act ? { status: 'faite', activityId: act.id } : { status: ses.date < demo.activities[0]!.date ? 'faite' : 'sautee' });
    }
  });
}

/** Efface tout ce qui appartient à l'athlète de démo, sans toucher aux vraies données. */
export async function clearDemo(db: SentierDB): Promise<void> {
  const ownedTables = [
    db.races, db.blocks, db.weeks, db.sessions, db.activities, db.subjectives, db.wellness, db.painLogs,
    db.strengthSessions, db.shoes, db.nutritionLogs, db.preventionChecks, db.milestones,
  ];
  await db.transaction('rw', [...ownedTables, db.athletes, db.meta], async () => {
    for (const table of ownedTables) await table.where('athleteId').equals(DEMO_ATHLETE_ID).delete();
    await db.athletes.delete(DEMO_ATHLETE_ID);
    await db.meta.delete('demo');
    const active = await db.meta.get('activeAthleteId');
    if (active?.value === DEMO_ATHLETE_ID) await db.meta.delete('activeAthleteId');
  });
}
