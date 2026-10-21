import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, parseISO } from 'date-fns';
import { frCA } from 'date-fns/locale';
import { addDays, healthLight, toIsoDate, zoneLabel, type Athlete, type BodyZone } from '@/engine';
import { db } from '@/data/db';
import { stamp } from '@/data/ids';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
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
