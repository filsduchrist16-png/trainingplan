import { useLiveQuery } from 'dexie-react-hooks';
import { format, parseISO } from 'date-fns';
import { frCA } from 'date-fns/locale';
import { addDays, aerobicEfficiency, cadenceByWeek, formatPace, hrvDays, mondayOf, restingHrTrend, toIsoDate, vo2maxSeries, weeklySummaries, zoneDistribution, type Explanation } from '@/engine';
import { db } from '@/data/db';
import { milestones, syncMilestones } from '@/data/milestones';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { EmptyState } from '@/ui/components/EmptyState';
import { Sparkline } from '@/ui/components/Sparkline';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { t } from '@/ui/lib/strings';
import { useNavigate } from 'react-router';

const WEEKS = 12;

/** Volume et D+ sur 12 semaines, puis les tendances calculées par le moteur (efficacité aérobie, zones, cadence, VO2max, récupération). */
export function Progress() {
  const athlete = useActiveAthlete();
  const navigate = useNavigate();
  const today = toIsoDate(new Date());
  const from = addDays(mondayOf(today), -(WEEKS - 1) * 7);
  const data = useLiveQuery(async () => {
    if (!athlete) return undefined;
    // 12 semaines de volume, mais 8 semaines de plus d'historique ne servent qu'à comparer l'efficacité.
    const acts = await db.activities.where('date').aboveOrEqual(addDays(from, -4 * 7)).filter((a) => a.athleteId === athlete.id).toArray();
    const wellness = await db.wellness.where('date').aboveOrEqual(addDays(today, -35)).filter((w) => w.athleteId === athlete.id).toArray();
    await syncMilestones(db, athlete.id); // rattrape l'historique : idempotent
    return { acts, wellness, milestones: await milestones(db, athlete.id), weeks: weeklySummaries(acts.filter((a) => a.date >= from), from, mondayOf(today)) };
  }, [athlete?.id, from, today]);
  if (!data || !athlete) return null;
  const { acts, wellness, weeks } = data;
  const achievements = data.milestones;
  const refHr = Math.round((athlete.zones.bounds[0] + athlete.zones.bounds[1]) / 2);
  const efficiency = athlete.health?.hrUnreliable ? undefined : aerobicEfficiency(acts, refHr, today);
  const distribution = athlete.health?.hrUnreliable ? undefined : zoneDistribution(acts, today);
  const cadence = cadenceByWeek(acts).slice(-12);
  const vo2 = vo2maxSeries(athlete.vo2maxHistory);
  const resting = restingHrTrend(wellness, today);
  const hrv = hrvDays(wellness, today);
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
      {hasData && (
        <>
          {efficiency && efficiency.points.length >= 2 && (
            <Insight title="Efficacité aérobie" eyebrow={`Allure à ${efficiency.refHr} bpm (Z2)`} discovery={efficiency.discovery} empty="Pas encore assez de sorties faciles avec FC pour comparer : il en faut 3 sur les 4 dernières semaines et 3 sur les 4 d'avant.">
              <Sparkline values={efficiency.points.map((p) => p.paceAtRef)} invert label="Allure estimée à la même fréquence cardiaque, semaine après semaine" />
              <p className="num text-center text-sm text-muted">Dernière semaine : {formatPace(efficiency.points.at(-1)!.paceAtRef)} /km</p>
            </Insight>
          )}
          {distribution && (
            <Insight title="Distribution des zones" eyebrow={`${distribution.minutes} min sur 4 semaines`} discovery={distribution.discovery}>
              <div role="img" aria-label={`Répartition : ${distribution.shares.map((x, i) => `Z${i + 1} ${Math.round(x * 100)} %`).join(', ')}`} className="flex h-4 overflow-hidden rounded-full">
                {distribution.shares.map((x, i) => <div key={i} style={{ width: `${x * 100}%`, background: `var(--z${i + 1})` }} />)}
              </div>
              <p className="num text-xs text-muted">Facile {Math.round(distribution.low * 100)} % · soutenu {Math.round(distribution.mid * 100)} % · dur {Math.round(distribution.high * 100)} % (visé : 80 / 10 / 10)</p>
            </Insight>
          )}
          {cadence.length >= 2 && (
            <Insight title="Cadence" eyebrow={`Cible ${athlete.cadenceTarget[0]}-${athlete.cadenceTarget[1]} pas/min`}>
              <Sparkline values={cadence.map((c) => c.spm)} band={athlete.cadenceTarget} label="Cadence moyenne par semaine, avec la zone cible" />
              <p className="num text-center text-sm text-muted">Dernière semaine : {cadence.at(-1)!.spm} pas/min</p>
            </Insight>
          )}
        </>
      )}
      {achievements.length > 0 && (
        <Card className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Jalons</h2>
            <Eyebrow>{achievements.length} atteint{achievements.length > 1 ? 's' : ''}</Eyebrow>
          </div>
          <ul className="space-y-2" aria-label="Jalons atteints">
            {achievements.map((m) => (
              <li key={m.key} className="rounded-xl bg-surface-2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium">{m.title}</p>
                  <span className="num text-xs text-muted">{format(parseISO(m.date), 'd MMM yyyy', { locale: frCA })}</span>
                </div>
                {m.why && <p className="mt-1 text-sm text-muted">{m.why}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {vo2.length >= 2 && (
        <Insight title="VO2max estimée" eyebrow="Lissée sur 3 mesures">
          <Sparkline values={vo2.map((p) => p.smoothed)} label="VO2max estimée, lissée" />
          <p className="num text-center text-sm text-muted">{vo2.at(-1)!.value} ml/kg/min (lissée : {vo2.at(-1)!.smoothed})</p>
        </Insight>
      )}
      {(resting || hrv.total > 0) && (
        <Insight title="Récupération" eyebrow="FC repos et VFC" discovery={resting?.discovery}>
          {resting && <p className="num text-sm">FC repos : <strong>{resting.recent} bpm</strong> cette semaine, base à {resting.baseline} bpm</p>}
          {hrv.total > 0 && <p className="text-sm text-muted">VFC : {hrv.bad} jour{hrv.bad > 1 ? 's' : ''} déséquilibré{hrv.bad > 1 ? 's' : ''} sur {hrv.total} cette semaine.</p>}
        </Insight>
      )}
    </div>
  );
}

/** Carte de tendance : le graphique illustre, la découverte (Explanation du moteur) explique. */
function Insight({ title, eyebrow, discovery, empty, children }: { title: string; eyebrow: string; discovery?: Explanation; empty?: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      {children}
      {discovery ? (
        <p className="text-sm"><strong>{discovery.title}.</strong> <span className="text-muted">{discovery.why}</span></p>
      ) : empty ? <p className="text-xs text-muted">{empty}</p> : null}
    </Card>
  );
}
