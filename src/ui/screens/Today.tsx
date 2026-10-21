import { differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import { frCA } from 'date-fns/locale';
import { useLiveQuery } from 'dexie-react-hooks';
import { m } from 'motion/react';
import { Link } from 'react-router';
import { db } from '@/data/db';
import type { Athlete } from '@/engine/types';
import { Card, Eyebrow } from '@/ui/components/Card';
import { ElevationProfile } from '@/ui/components/ElevationProfile';
import { Ring } from '@/ui/components/Ring';
import { Why } from '@/ui/components/Why';
import { Button } from '@/ui/components/Button';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { Welcome } from './Welcome';

export function Today() {
  const athlete = useActiveAthlete();
  if (athlete === undefined) return <TodaySkeleton />;
  if (athlete === null) return <Welcome />;
  return <TodayFor athlete={athlete} />;
}

function TodayFor({ athlete }: { athlete: Athlete }) {
  const today = new Date();
  const todayIso = format(today, 'yyyy-MM-dd');
  const mondayIso = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const nextRace = useLiveQuery(
    () => db.races.where('date').aboveOrEqual(todayIso).filter((r) => r.athleteId === athlete.id && r.priority === 'A').first(),
    [athlete.id, todayIso],
  );
  const week = useLiveQuery(
    async () => {
      const acts = await db.activities.where('date').aboveOrEqual(mondayIso).filter((a) => a.athleteId === athlete.id).toArray();
      return {
        km: acts.reduce((s, a) => s + a.distanceKm, 0),
        dplus: acts.reduce((s, a) => s + a.elevationGainM, 0),
        count: acts.length,
      };
    },
    [athlete.id, mondayIso],
    { km: 0, dplus: 0, count: 0 },
  );

  const daysToRace = nextRace ? differenceInCalendarDays(parseISO(nextRace.date), today) : null;

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between">
        <div>
          <Eyebrow>{format(today, 'EEEE d MMMM', { locale: frCA })}</Eyebrow>
          <h1 className="mt-1 text-3xl font-semibold">Salut {athlete.name.split(' ')[0]}</h1>
        </div>
      </header>

      <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Card className="relative overflow-hidden bg-surface-2">
          <Eyebrow>Séance du jour</Eyebrow>
          <h2 className="mt-2 text-2xl">Le coach se réchauffe</h2>
          <p className="mt-2 text-muted">
            La génération de plan arrive avec le moteur de coaching. En attendant, ton historique et tes courses sont déjà là.
          </p>
          <Why className="mt-3">
            Sentier ne propose jamais une séance sans pouvoir expliquer pourquoi. Le moteur passe d'abord par ses tests.
          </Why>
          <div className="mt-4">
            <Button variant="secondary" size="sm" disabled>
              Version minimale viable
            </Button>
          </div>
        </Card>
      </m.div>

      {nextRace && daysToRace !== null && (
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Eyebrow>Prochaine course A</Eyebrow>
              <h2 className="mt-1 text-xl">{nextRace.name}</h2>
              <p className="num text-sm text-muted">
                {nextRace.distanceKm} km · {nextRace.elevationGainM} m D+ · {format(parseISO(nextRace.date), 'd MMM', { locale: frCA })}
              </p>
            </div>
            <div className="text-right">
              <p className="num text-4xl font-semibold tracking-tight text-accent">{daysToRace}</p>
              <p className="text-xs text-muted">{daysToRace === 1 ? 'jour' : 'jours'}</p>
            </div>
          </div>
          {nextRace.profile && <ElevationProfile points={nextRace.profile} className="mt-4 h-20 w-full" />}
        </Card>
      )}

      <Card>
        <Eyebrow>Cette semaine</Eyebrow>
        <div className="mt-4 flex justify-around">
          <Ring value={week.km} max={45} label="Volume" display={`${Math.round(week.km)} km`} />
          <Ring value={week.dplus} max={1200} label="D+" display={`${Math.round(week.dplus)}`} color="var(--z3)" />
          <Ring value={week.count} max={athlete.availability.runDaysPerWeek} label="Sorties" display={`${week.count}`} color="var(--ok)" />
        </div>
        <p className="mt-3 text-xs text-muted">Les cibles hebdo viendront de ton plan. Pour l'instant, repères indicatifs.</p>
      </Card>

      <p className="text-center text-sm text-muted">
        <Link to="/plus" className="underline underline-offset-4 hover:text-text">Réglages, backup et vie privée</Link>
      </p>
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Chargement">
      <div className="h-10 w-48 animate-pulse rounded-lg bg-surface" />
      <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-surface" />
      <div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-surface" />
    </div>
  );
}
