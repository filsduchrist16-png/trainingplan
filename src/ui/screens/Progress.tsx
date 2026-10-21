import { useLiveQuery } from 'dexie-react-hooks';
import { format, parseISO } from 'date-fns';
import { frCA } from 'date-fns/locale';
import { addDays, mondayOf, toIsoDate, weeklySummaries } from '@/engine';
import { db } from '@/data/db';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { EmptyState } from '@/ui/components/EmptyState';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { t } from '@/ui/lib/strings';
import { useNavigate } from 'react-router';

const WEEKS = 12;

/** MVP : volume et D+ des 12 dernières semaines. Les courbes d'efficacité aérobie viendront ensuite. */
export function Progress() {
  const athlete = useActiveAthlete();
  const navigate = useNavigate();
  const today = toIsoDate(new Date());
  const from = addDays(mondayOf(today), -(WEEKS - 1) * 7);
  const weeks = useLiveQuery(async () => {
    if (!athlete) return undefined;
    const acts = await db.activities.where('date').aboveOrEqual(from).filter((a) => a.athleteId === athlete.id).toArray();
    return weeklySummaries(acts, from, mondayOf(today));
  }, [athlete?.id, from, today]);
  if (!weeks) return null;
  const max = Math.max(1, ...weeks.map((w) => w.km));
  const hasData = weeks.some((w) => w.km > 0);
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Progrès</h1>
      {!hasData ? (
        <EmptyState title="Pas encore de données" action={<Button onClick={() => navigate('/importer')}>Importer mon historique</Button>}>{t.empty.progress}</EmptyState>
      ) : (
        <Card>
          <Eyebrow>Volume par semaine (12 sem.)</Eyebrow>
          <div className="mt-4 flex h-40 items-end gap-1" role="img" aria-label={`Volume des ${WEEKS} dernières semaines`}>
            {weeks.map((w) => (
              <div key={w.monday} className="flex flex-1 flex-col items-center gap-1">
                <span className="num text-[10px] text-muted">{Math.round(w.km)}</span>
                <div className="w-full rounded-t-sm bg-z2" style={{ height: `${(w.km / max) * 100}%`, minHeight: 2 }} title={`${Math.round(w.km)} km · ${Math.round(w.elevationGainM)} m D+`} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1 text-[10px] text-muted">
            {weeks.map((w, i) => <span key={w.monday} className="flex-1 text-center">{i % 3 === 0 ? format(parseISO(w.monday), 'd MMM', { locale: frCA }) : ''}</span>)}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-surface-2 p-3"><dd className="num text-lg font-semibold">{Math.round(weeks.reduce((s, w) => s + w.km, 0) / WEEKS)} km</dd><dt className="text-xs text-muted">moyenne / sem.</dt></div>
            <div className="rounded-xl bg-surface-2 p-3"><dd className="num text-lg font-semibold">{Math.round(weeks.reduce((s, w) => s + w.elevationGainM, 0))} m</dd><dt className="text-xs text-muted">D+ sur 12 sem.</dt></div>
          </dl>
        </Card>
      )}
      <p className="text-sm text-muted">Bientôt : FC vs allure en Z2, distribution par zones, VO2max, cadence.</p>
    </div>
  );
}
