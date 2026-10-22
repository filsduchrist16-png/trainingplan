import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, parseISO } from 'date-fns';
import { frCA } from 'date-fns/locale';
import { addDays, bodyMap, healthLight, mondayOf, preventionPlan, toIsoDate, zoneLabel, type Athlete, type BodyZone } from '@/engine';
import { db } from '@/data/db';
import { stamp } from '@/data/ids';
import { checkRoutine, preventionChecks, uncheckRoutine } from '@/data/prevention';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { BodyMap } from '@/ui/components/BodyMap';
import { Chip, Field } from '@/ui/components/forms';
import { Why } from '@/ui/components/Why';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { useCoach } from '@/ui/hooks/useCoach';
import { cn } from '@/ui/lib/cn';
import { t } from '@/ui/lib/strings';

const ZONES: BodyZone[] = ['tibia_g', 'tibia_d', 'soleaire_g', 'soleaire_d', 'achille_g', 'achille_d', 'genou_g', 'genou_d', 'itb_g', 'itb_d', 'hanche_g', 'hanche_d', 'pied_g', 'pied_d', 'dos'];

export function Body() {
  const athlete = useActiveAthlete();
  if (!athlete) return null;
  return <BodyFor athlete={athlete} />;
}

function BodyFor({ athlete }: { athlete: Athlete }) {
  const ctx = useCoach(athlete);
  const today = toIsoDate(new Date());
  const history = useLiveQuery(() => db.painLogs.where('date').aboveOrEqual(addDays(today, -14)).filter((p) => p.athleteId === athlete.id).reverse().sortBy('date'), [athlete.id, today]);
  const recent = useLiveQuery(() => db.painLogs.where('date').aboveOrEqual(addDays(today, -28)).filter((p) => p.athleteId === athlete.id).toArray(), [athlete.id, today]);
  const checks = useLiveQuery(() => preventionChecks(db, athlete.id, mondayOf(today)), [athlete.id, today]);
  const [openRoutine, setOpenRoutine] = useState<string | null>(null);
  const [zone, setZone] = useState<BodyZone | null>(null);
  const [intensity, setIntensity] = useState(2);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!zone) return;
    await db.painLogs.add(stamp({ athleteId: athlete.id, date: today, zone, intensity, when: 'matin' as const }));
    setZone(null);
    setSaved(true);
  }
  if (!ctx) return null;
  const light = healthLight(ctx.health);
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Corps</h1>
      <Card>
        <div className="flex items-center gap-3">
          <span aria-hidden className={cn('h-4 w-4 rounded-full', light === 'vert' ? 'bg-ok' : light === 'jaune' ? 'bg-warn' : 'bg-danger')} />
          <Eyebrow>État santé : {light === 'vert' ? 'feu vert' : light === 'jaune' ? 'prudence' : 'stop'}</Eyebrow>
        </div>
        <ul className="mt-3 space-y-3">
          {ctx.health.explanations.map((e) => (
            <li key={e.ruleId}>
              <p className={cn('font-medium', e.severity === 'stop' ? 'text-danger' : e.severity === 'attention' ? 'text-warn' : '')}>{e.title}</p>
              <p className="text-sm text-muted">{e.why}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <Eyebrow>Carte du corps · 28 derniers jours</Eyebrow>
        <BodyMap zones={bodyMap(recent ?? [], today)} selected={zone} onSelect={(z) => { setZone(zone === z ? null : z); setSaved(false); }} />
        <p className="text-center text-xs text-muted">Gris : rien · jaune : gêne · orange : douleur · rouge : forte. Touche une zone pour déclarer une douleur.</p>
      </Card>

      <Card className="space-y-3">
        <Eyebrow>Prévention de la semaine</Eyebrow>
        <ul className="space-y-3">
          {preventionPlan(checks ?? [], today, recent ?? [], athlete.injuries).map((it) => {
            const doneToday = (checks ?? []).some((c) => c.routine === it.routine.id && c.date === today);
            return (
              <li key={it.routine.id} className="space-y-1.5 rounded-xl bg-surface-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{it.routine.title}{it.targeted && <span className="ml-2 rounded-full border border-accent/60 px-2 py-0.5 text-xs text-text">ciblée</span>}</p>
                    <p className="num text-xs text-muted">{it.done}/{it.routine.perWeek} cette semaine · {it.routine.minutes} min</p>
                  </div>
                  <Chip selected={doneToday} onToggle={() => void (doneToday ? uncheckRoutine(db, athlete.id, it.routine.id, today) : checkRoutine(db, athlete.id, it.routine.id, today))}>{`${it.routine.title} fait aujourd'hui`}</Chip>
                </div>
                <p className="text-sm text-muted">{it.advice.why}</p>
                <button type="button" className="text-sm underline underline-offset-4" aria-expanded={openRoutine === it.routine.id} onClick={() => setOpenRoutine(openRoutine === it.routine.id ? null : it.routine.id)}>{openRoutine === it.routine.id ? 'Masquer les exercices' : 'Voir les exercices'}</button>
                {openRoutine === it.routine.id && <ul className="list-disc space-y-1 pl-5 text-sm">{it.routine.steps.map((s) => <li key={s}>{s}</li>)}</ul>}
              </li>
            );
          })}
        </ul>
        <Why>Le renforcement préventif (mollets, hanches) est l'un des moyens les mieux appuyés de réduire les blessures de course. Si une douleur dure ou revient, consulte un physio.</Why>
      </Card>

      <Card className="space-y-4">
        <Eyebrow>Déclarer une douleur</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {ZONES.map((z) => <Chip key={z} selected={zone === z} onToggle={() => { setZone(zone === z ? null : z); setSaved(false); }}>{zoneLabel(z)}</Chip>)}
        </div>
        {zone && (
          <>
            <Field label={`Intensité : ${intensity}/10`} hint="1 = je la sens · 3 = elle change ma foulée · 6+ = je boite">
              <input type="range" min={1} max={10} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label="Intensité" />
            </Field>
            <Button onClick={save}>Enregistrer</Button>
          </>
        )}
        {saved && <p role="status" className="text-sm text-ok">Noté. Le plan d'aujourd'hui en tient compte.</p>}
        <Why>Une douleur au tibia, même légère, bloque les hausses de volume et les séances dures. Deux jours de suite ou 3/10 et plus : STOP course, croisé à la place. Aucun gain de forme ne vaut une blessure.</Why>
      </Card>

      <Card>
        <Eyebrow>14 derniers jours</Eyebrow>
        {history?.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {history.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{format(parseISO(p.date), 'EEE d MMM', { locale: frCA })} · {zoneLabel(p.zone)}</span>
                <span className="num text-muted">{p.intensity}/10</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-muted">Aucune douleur déclarée. On continue comme ça.</p>}
      </Card>
      <p className="text-xs text-muted">{t.disclaimer}</p>
    </div>
  );
}
