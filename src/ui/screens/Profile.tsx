import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { hrMaxFromTest, pacesFromVdot, formatPace, vdotFromRace, isPlausibleVdot, zonesFromHrMax, zonesKarvonen, type Athlete, type Weekday, type ZoneBounds } from '@/engine';
import { db } from '@/data/db';
import { updateAthlete } from '@/data/athlete';
import { parseFile } from '@/data/import';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { Chip, Field, Segmented, Stepper, TextInput } from '@/ui/components/forms';
import { Why } from '@/ui/components/Why';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { cn } from '@/ui/lib/cn';
import { timeToMinutes } from './NewGoal';

const ZONE_NAMES = ['Z1 récup', 'Z2 endurance', 'Z3 soutenu', 'Z4 seuil', 'Z5 max'];
const DAYS: { d: Weekday; short: string }[] = [
  { d: 1, short: 'Lun' }, { d: 2, short: 'Mar' }, { d: 3, short: 'Mer' }, { d: 4, short: 'Jeu' }, { d: 5, short: 'Ven' }, { d: 6, short: 'Sam' }, { d: 7, short: 'Dim' },
];

export function Profile() {
  const athlete = useActiveAthlete();
  if (!athlete) return null;
  return <ProfileFor key={athlete.id} athlete={athlete} />;
}

function ProfileFor({ athlete }: { athlete: Athlete }) {
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (patch: Partial<Athlete>, note?: string) => {
    await updateAthlete(db, athlete.id, patch);
    setMsg(note ?? 'Enregistré.');
  };
  const manual = athlete.zones.mode === 'manuel';
  const auto = zonesFromHrMax(athlete.hrMax);

  return (
    <div className="space-y-5">
      <Link to="/plus" className="text-sm text-muted hover:text-text">← Plus</Link>
      <h1 className="text-3xl font-semibold">Profil</h1>

      <Card className="space-y-4">
        <Eyebrow>Toi</Eyebrow>
        <Field label="Nom"><TextInput defaultValue={athlete.name} onBlur={(e) => e.target.value.trim() && e.target.value !== athlete.name && void save({ name: e.target.value.trim() })} /></Field>
        <Stepper label="FC max" value={athlete.hrMax} min={140} max={220} unit="bpm" onChange={(v) => void save({ hrMax: v, hrMaxSource: 'estimee', ...(manual ? {} : { zones: { mode: 'auto', bounds: zonesFromHrMax(v) } }) })} />
        <p className="text-xs text-muted">
          {athlete.hrMaxSource === 'test' ? '✓ Mesurée lors d’un test.' : 'Estimée : peut être à ±10 bpm de la réalité. Un test la rend juste (plus bas).'}
        </p>
        <Stepper label="FC repos" value={athlete.hrRest} min={30} max={100} unit="bpm" onChange={(v) => void save({ hrRest: v })} />
        <Field label="Cadence cible (pas/min)">
          <div className="grid grid-cols-2 gap-2">
            <Stepper label="Min" value={athlete.cadenceTarget[0]} min={150} max={200} onChange={(v) => void save({ cadenceTarget: [v, Math.max(v, athlete.cadenceTarget[1])] })} />
            <Stepper label="Max" value={athlete.cadenceTarget[1]} min={150} max={200} onChange={(v) => void save({ cadenceTarget: [Math.min(v, athlete.cadenceTarget[0]), v] })} />
          </div>
        </Field>
      </Card>

      <Card className="space-y-4">
        <Eyebrow>Zones cardiaques</Eyebrow>
        <Segmented label="Mode des zones" value={manual ? 'manuel' : 'auto'} onChange={(v) => void save({ zones: { mode: v, bounds: v === 'auto' ? auto : athlete.zones.bounds } })} options={[{ value: 'auto', label: 'Automatiques' }, { value: 'manuel', label: 'Manuelles' }]} />
        <ZonesTable athlete={athlete} manual={manual} onChange={(bounds) => void save({ zones: { mode: 'manuel', bounds } })} />
        {!manual && (
          <Button variant="outline" size="sm" onClick={() => void save({ zones: { mode: 'auto', bounds: zonesKarvonen(athlete.hrMax, athlete.hrRest) } }, 'Zones recalculées avec ta FC repos (Karvonen).')}>
            Recalculer avec ma FC repos (Karvonen)
          </Button>
        )}
        <Why>Les zones en % de la FC max donnent Z2 entre 65 et 75 % : le « test du parler » (phrases complètes). En mode manuel, tes bornes remplacent le calcul ; elles sont utilisées pour le temps par zone, la charge et le debrief de toutes tes activités.</Why>
      </Card>

      <Calibration athlete={athlete} onSave={save} />

      <Card className="space-y-4">
        <Eyebrow>Disponibilités</Eyebrow>
        <Field label="Sorties par semaine" group>
          <Segmented label="Sorties par semaine" value={athlete.availability.runDaysPerWeek} onChange={(v) => void save({ availability: { ...athlete.availability, runDaysPerWeek: v } })} options={[2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))} />
        </Field>
        <Field label="Jours possibles" group>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(({ d, short }) => (
              <Chip key={d} selected={athlete.availability.allowedDays.includes(d)} onToggle={() => {
                const allowed = (athlete.availability.allowedDays.includes(d) ? athlete.availability.allowedDays.filter((x) => x !== d) : [...athlete.availability.allowedDays, d]).sort() as Weekday[];
                if (allowed.length) void save({ availability: { ...athlete.availability, allowedDays: allowed, longRunDay: allowed.includes(athlete.availability.longRunDay) ? athlete.availability.longRunDay : allowed.at(-1)! } });
              }}>{short}</Chip>
            ))}
          </div>
        </Field>
        <Field label="Jour de la sortie longue" group>
          <div className="flex flex-wrap gap-2">
            {DAYS.filter(({ d }) => athlete.availability.allowedDays.includes(d)).map(({ d, short }) => (
              <Chip key={d} selected={athlete.availability.longRunDay === d} onToggle={() => void save({ availability: { ...athlete.availability, longRunDay: d } })}>{short}</Chip>
            ))}
          </div>
        </Field>
        <Stepper label="Max en semaine" value={athlete.availability.maxWeekdayMinutes} step={15} min={20} max={180} unit="min" onChange={(v) => void save({ availability: { ...athlete.availability, maxWeekdayMinutes: v } })} />
        <Stepper label="Max la fin de semaine" value={athlete.availability.maxWeekendMinutes} step={15} min={30} max={480} unit="min" onChange={(v) => void save({ availability: { ...athlete.availability, maxWeekendMinutes: v } })} />
        <p className="text-xs text-muted">Ça s'applique aux prochains plans. Pour refaire le plan actuel avec ces dispos, crée un <Link to="/objectif" className="underline underline-offset-4">nouvel objectif</Link> : l'ancien est archivé, tes séances faites restent.</p>
      </Card>

      {msg && <p role="status" className="text-center text-sm text-ok">{msg}</p>}
    </div>
  );
}

function ZonesTable({ athlete, manual, onChange }: { athlete: Athlete; manual: boolean; onChange: (b: ZoneBounds) => void }) {
  const b = athlete.zones.bounds;
  const edges = [0, ...b, athlete.hrMax];
  return (
    <ul className="space-y-2">
      {ZONE_NAMES.map((name, i) => (
        <li key={name} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
          <span aria-hidden className="h-8 w-1.5 rounded-full" style={{ background: `var(--z${i + 1})` }} />
          <span className="flex-1 text-sm">{name}</span>
          {manual && i < 4 ? (
            <label className="flex items-center gap-2 text-sm text-muted">
              jusqu'à
              <input
                key={`${name}-${b[i]}`}
                type="number" inputMode="numeric" aria-label={`${name} : limite haute`}
                defaultValue={b[i]}
                // Validé à la sortie du champ : on peut taper un nombre chiffre par chiffre.
                onBlur={(e) => {
                  const next = [...b] as ZoneBounds;
                  next[i] = Number(e.target.value);
                  if (next.every((v, k) => v > (next[k - 1] ?? 0) && v < athlete.hrMax)) onChange(next);
                  else e.target.value = String(b[i]);
                }}
                className="num h-9 w-16 rounded-lg border border-line bg-surface text-center text-text"
              />
            </label>
          ) : (
            <span className={cn('num text-sm', manual ? 'text-muted' : '')}>{edges[i] === 0 ? '<' : edges[i]}{edges[i] === 0 ? ` ${edges[i + 1]}` : `–${edges[i + 1]}`} bpm</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Calibration : FC max depuis un fichier de test (FIT/GPX/TCX), niveau de forme depuis un temps de test. */
function Calibration({ athlete, onSave }: { athlete: Athlete; onSave: (p: Partial<Athlete>, note?: string) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [found, setFound] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [km, setKm] = useState(3);
  const [time, setTime] = useState('');
  const minutes = timeToMinutes(time);
  const vdot = minutes ? vdotFromRace(km, minutes) : undefined;
  const ok = vdot !== undefined && isPlausibleVdot(vdot);

  async function onFile(f: File) {
    setError(null);
    setFound(null);
    try {
      const data = f.name.toLowerCase().endsWith('.fit') ? await f.arrayBuffer() : await f.text();
      const hr = hrMaxFromTest(parseFile({ name: f.name, data })[0]?.samples ?? { t: [] });
      if (hr === null) setError('Pas assez de données cardio dans ce fichier.');
      else setFound(hr);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card className="space-y-4">
      <Eyebrow>Calibration</Eyebrow>
      <p className="text-sm text-muted">
        Test pratique : échauffement 15 min, puis 3 km le plus vite possible sur terrain plat (effort régulier, finis fort), retour au calme. Importe le fichier pour lire ta FC max, et note ton temps pour recalculer tes allures.
      </p>
      <div className="space-y-2">
        <Button variant="secondary" onClick={() => input.current?.click()}>Lire la FC max d'un fichier de test</Button>
        <input ref={input} type="file" accept=".fit,.gpx,.tcx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {found !== null && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-3">
            <p className="flex-1 text-sm">FC maximale soutenue : <strong className="num">{found} bpm</strong> {found < athlete.hrMax - 15 && <span className="text-muted">(bien sous ton estimée : effort peut-être pas à bloc)</span>}</p>
            <Button size="sm" onClick={() => { void onSave({ hrMax: found, hrMaxSource: 'test', zones: athlete.zones.mode === 'manuel' ? athlete.zones : { mode: 'auto', bounds: zonesFromHrMax(found) } }, `FC max mise à jour : ${found} bpm.`); setFound(null); }}>Adopter</Button>
          </div>
        )}
      </div>
      <div className="space-y-3">
        <Stepper label="Distance du test" value={km} step={0.5} min={1} max={42.2} unit="km" onChange={setKm} />
        <Field label="Ton temps" hint="mm:ss ou h:mm:ss"><TextInput inputMode="numeric" placeholder="ex. 13:30" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        {ok && vdot && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-3">
            <p className="flex-1 text-sm">Niveau <strong className="num">{vdot.toFixed(1)}</strong> · facile <span className="num">{formatPace(pacesFromVdot(vdot).E)}</span> /km · seuil <span className="num">{formatPace(pacesFromVdot(vdot).T)}</span> /km</p>
            <Button size="sm" onClick={() => { void onSave({ vdot: Math.round(vdot * 10) / 10, vdotSource: 'test' }, 'Niveau de forme mis à jour : tes allures suivront aux prochains plans.'); setTime(''); }}>Adopter</Button>
          </div>
        )}
        {athlete.vdot && <p className="text-xs text-muted">Niveau actuel : {athlete.vdot} ({athlete.vdotSource ?? 'estimé'}).</p>}
      </div>
    </Card>
  );
}
