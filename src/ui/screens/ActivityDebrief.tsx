import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, parseISO } from 'date-fns';
import { frCA } from 'date-fns/locale';
import { m } from 'motion/react';
import { debrief, formatPace, toIsoDate, type BodyZone } from '@/engine';
import { db } from '@/data/db';
import { stamp } from '@/data/ids';
import { syncRunWalk } from '@/data/runwalk';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { EmptyState } from '@/ui/components/EmptyState';
import { Chip, Field, Segmented } from '@/ui/components/forms';
import { HrChart, ZoneBar } from '@/ui/components/HrChart';
import { Why } from '@/ui/components/Why';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { cn } from '@/ui/lib/cn';
import { formatMinutes } from '@/ui/lib/sessionStyle';

export function ActivityDebrief() {
  const { id } = useParams();
  const navigate = useNavigate();
  const athlete = useActiveAthlete();
  const data = useLiveQuery(async () => {
    if (!id) return null;
    const activity = await db.activities.get(id);
    if (!activity) return null;
    const session = await db.sessions.where('activityId').equals(id).first();
    const subjective = await db.subjectives.where('activityId').equals(id).first();
    return { activity, session, subjective };
  }, [id]);

  const result = useMemo(() => {
    if (!data || !athlete) return undefined;
    const a = data.activity;
    return debrief({
      activity: { durationSec: a.movingSec ?? a.durationSec, distanceKm: a.distanceKm, elevationGainM: a.elevationGainM, hrAvg: a.hrAvg, cadenceAvg: a.cadenceAvg, timeInZonesSec: a.timeInZonesSec, samples: a.samples },
      ...(data.session ? { planned: { type: data.session.type, durationMin: data.session.durationMin, steps: data.session.steps, isKey: data.session.isKey } } : {}),
      bounds: athlete.zones.bounds,
      hrMax: athlete.hrMax,
      cadenceTarget: athlete.cadenceTarget,
    });
  }, [data, athlete]);

  if (data === undefined || !athlete) return null;
  if (data === null || !result) return <EmptyState title="Activité introuvable" />;
  const a = data.activity;
  return (
    <div className="space-y-5">
      <button type="button" onClick={() => navigate(-1)} className="text-sm text-muted hover:text-text">← Retour</button>
      <header>
        <Eyebrow>{format(parseISO(a.startTime), 'EEEE d MMMM · HH:mm', { locale: frCA })}</Eyebrow>
        <h1 className="mt-1 text-3xl font-semibold">{a.name ?? data.session?.title ?? 'Sortie'}</h1>
      </header>
      <m.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <Card className="space-y-3 bg-surface-2">
          <Eyebrow>Debrief</Eyebrow>
          {result.summary.map((sentence, i) => <p key={i} className={cn(i === 0 ? 'text-lg' : 'text-muted')}>{sentence}</p>)}
        </Card>
      </m.div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="temps" value={formatMinutes(Math.round((a.movingSec ?? a.durationSec) / 60))} />
        <Stat label="allure" value={result.metrics.paceMinPerKm ? formatPace(result.metrics.paceMinPerKm) : '—'} />
        <Stat label="D+" value={`${Math.round(a.elevationGainM)} m`} />
        <Stat label="FC moy" value={a.hrAvg ? `${a.hrAvg}` : '—'} />
        <Stat label="cadence" value={a.cadenceAvg ? `${a.cadenceAvg}` : '—'} />
        <Stat label="charge" value={a.load ? `${a.load}` : '—'} />
      </dl>
      {result.metrics.zoneShare && (
        <Card className="space-y-3">
          <Eyebrow>Temps par zone (tes zones)</Eyebrow>
          <ZoneBar share={result.metrics.zoneShare} />
          {a.samples && <HrChart samples={a.samples} bounds={athlete.zones.bounds} hrMax={athlete.hrMax} />}
        </Card>
      )}
      {result.findings.length > 0 && (
        <Card className="space-y-3">
          <Eyebrow>Ce que j'en lis</Eyebrow>
          {result.findings.map((f) => (
            <div key={f.ruleId}>
              <p className={cn('font-medium', f.severity === 'conseil' && 'text-warn')}>{f.title}</p>
              <Why>{f.why}</Why>
            </div>
          ))}
        </Card>
      )}
      {result.adjustments.length > 0 && (
        <Card className="space-y-3">
          <Eyebrow>Pour la suite</Eyebrow>
          {result.adjustments.map((f) => (
            <div key={f.ruleId}>
              <p className="font-medium">{f.title}</p>
              <p className="text-sm text-muted">{f.why}</p>
            </div>
          ))}
        </Card>
      )}
      {!data.subjective && <SubjectiveForm activityId={a.id} athleteId={athlete.id} date={a.date} runWalk={data.session?.type === 'marche_course'} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <dd className="num text-lg font-semibold">{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}

const PAIN: { z: BodyZone; label: string }[] = [
  { z: 'tibia_g', label: 'Tibia G' }, { z: 'tibia_d', label: 'Tibia D' }, { z: 'achille_g', label: 'Achille G' }, { z: 'achille_d', label: 'Achille D' }, { z: 'genou_g', label: 'Genou G' }, { z: 'genou_d', label: 'Genou D' },
];

function SubjectiveForm({ activityId, athleteId, date, runWalk }: { activityId: string; athleteId: string; date: string; runWalk: boolean }) {
  const [rpe, setRpe] = useState(5);
  const [completed, setCompleted] = useState(true);
  const [feeling, setFeeling] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [pain, setPain] = useState<{ zone: BodyZone; intensity: number } | null>(null);
  async function save() {
    await db.transaction('rw', db.subjectives, db.painLogs, async () => {
      await db.subjectives.add(stamp({ athleteId, date, activityId, rpe, ...(runWalk ? { completed } : {}), feeling, pains: pain ? [pain] : [], context: [] }));
      if (pain && pain.intensity > 0) await db.painLogs.add(stamp({ athleteId, date, zone: pain.zone, intensity: pain.intensity, when: 'apres' as const }));
    });
    // Séance importée sans RPE : la marche/course est réévaluée dès qu'il est noté.
    if (runWalk) await syncRunWalk(db, athleteId, toIsoDate(new Date()));
  }
  return (
    <Card className="space-y-4">
      <Eyebrow>Comment c'était?</Eyebrow>
      <Field label={`Effort perçu : ${rpe}/10`}>
        <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label="RPE" />
      </Field>
      {runWalk && <Chip selected={completed} onToggle={() => setCompleted(!completed)}>J'ai fait tous les intervalles</Chip>}
      <Segmented label="Sensations" value={feeling} onChange={setFeeling} options={[{ value: 1, label: '😖' }, { value: 2, label: '😕' }, { value: 3, label: '😐' }, { value: 4, label: '🙂' }, { value: 5, label: '😄' }]} />
      <div className="flex flex-wrap gap-2">
        <Chip selected={!pain} onToggle={() => setPain(null)}>Aucune douleur</Chip>
        {PAIN.map(({ z, label }) => <Chip key={z} selected={pain?.zone === z} onToggle={() => setPain({ zone: z, intensity: 2 })}>{label}</Chip>)}
      </div>
      {pain && (
        <Field label={`Intensité : ${pain.intensity}/10`}>
          <input type="range" min={1} max={10} value={pain.intensity} onChange={(e) => setPain({ ...pain, intensity: Number(e.target.value) })} className="w-full accent-[var(--accent)]" aria-label="Intensité de la douleur" />
        </Field>
      )}
      <Button onClick={save}>Enregistrer</Button>
    </Card>
  );
}
