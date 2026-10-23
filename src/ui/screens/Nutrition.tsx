import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { PRODUCT_PRESETS, addDays, carbTarget, carboLoading, carboLoadingStatus, carbsPerHour, easyMinutes, gutPlan, racePlan, toIsoDate, toleranceByLevel, type Athlete, type Explanation } from '@/engine';
import { db } from '@/data/db';
import { nutritionLogs } from '@/data/nutrition';
import { Card, Eyebrow } from '@/ui/components/Card';
import { Chip, Field, Stepper } from '@/ui/components/forms';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { cn } from '@/ui/lib/cn';

/** Nutrition d'effort : gut training, plan de course et carbo-loading, calculés par le moteur à partir du journal de tolérance. */
export function Nutrition() {
  const athlete = useActiveAthlete();
  if (!athlete) return null;
  return <NutritionFor key={athlete.id} athlete={athlete} />;
}

function NutritionFor({ athlete }: { athlete: Athlete }) {
  const today = toIsoDate(new Date());
  const data = useLiveQuery(async () => {
    const logs = await nutritionLogs(db, athlete.id);
    const race = (await db.races.where('date').aboveOrEqual(today).filter((r) => r.athleteId === athlete.id && r.priority === 'A').sortBy('date'))[0];
    return { logs, race };
  }, [athlete.id, today]);
  // Durée de l'effort visé : estimation de la course A (allure facile + D+), modifiable.
  const estimate = data?.race ? Math.round(easyMinutes(data.race.distanceKm, athlete.vdot, { trail: data.race.terrain !== 'route', gainM: data.race.elevationGainM })) : 240;
  const [duration, setDuration] = useState<number | null>(null);
  const [productKey, setProductKey] = useState('gel');
  const [temp, setTemp] = useState(15);
  const [caffeine, setCaffeine] = useState(false);
  const [weight, setWeight] = useState(athlete.weightKg ?? 70);
  const minutes = duration ?? estimate;
  const gut = useMemo(() => gutPlan(data?.logs ?? [], minutes), [data?.logs, minutes]);
  if (!data) return null;
  const buckets = toleranceByLevel(data.logs);
  const goalG = carbTarget(minutes);
  // Le plan de course utilise le niveau déjà toléré, sans dépasser l'objectif ; sinon la cible du prochain test.
  const planCarbs = Math.min(goalG, gut.tolerated || gut.next);
  const plan = racePlan({ durationMin: minutes, carbsPerH: planCarbs, tempC: temp, weightKg: weight, caffeine, product: PRODUCT_PRESETS[productKey]! });
  const loading = data.race ? carboLoading(data.race.date, minutes, weight) : undefined;
  return (
    <div className="space-y-5">
      <Link to="/plus" className="text-sm text-muted hover:text-text">← Plus</Link>
      <h1 className="text-3xl font-semibold">Nutrition d'effort</h1>
      <p className="text-sm text-muted">Des repères prudents, pas une prescription : un nutritionniste du sport ajuste mieux, surtout en cas de diabète. Règle d'or : rien de nouveau le jour de la course.</p>

      <Card className="space-y-3">
        <Stepper label="Durée de l'effort visé" value={minutes} onChange={setDuration} step={15} min={30} max={1800} unit="min" />
        {data.race && <p className="text-xs text-muted">Estimée pour ta course {data.race.name} ({data.race.distanceKm} km). Modifie-la au besoin.</p>}
      </Card>

      <Card className="space-y-3">
        <Eyebrow>Gut training</Eyebrow>
        <p className="num text-2xl font-semibold" data-testid="gut-next">{gut.next > 0 ? `${gut.next} g de glucides par heure` : 'Pas besoin de glucides'}</p>
        <Say e={gut.explanation} />
        {goalG > 0 && <p className="text-xs text-muted">Objectif de course : {goalG} g/h. Niveau toléré jusqu'ici : {gut.tolerated} g/h.</p>}
        <p className="text-xs text-muted">Après une sortie de plus de 75 min, note ce que tu as pris et comment ça a passé (bouton « C'est fait » d'Aujourd'hui).</p>
      </Card>

      <Card className="space-y-3">
        <Eyebrow>Plan de course</Eyebrow>
        <Field label="Produit principal" group>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PRODUCT_PRESETS).map(([k, p]) => <Chip key={k} selected={productKey === k} onToggle={() => setProductKey(k)}>{p.name} ({p.carbsG} g)</Chip>)}
          </div>
        </Field>
        <Stepper label="Température prévue" value={temp} onChange={setTemp} min={-10} max={40} unit="°C" />
        <Stepper label="Ton poids" value={weight} onChange={setWeight} step={1} min={30} max={200} unit="kg" />
        <Chip selected={caffeine} onToggle={() => setCaffeine(!caffeine)}>Caféine (déjà testée)</Chip>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <Stat label="glucides / h" value={`${plan.carbsPerH} g`} />
          <Stat label="liquide / h" value={`${plan.fluidMlPerH} mL`} />
          <Stat label="sodium / h" value={`${plan.sodiumMgPerH} mg`} />
        </dl>
        {plan.schedule.length > 0 ? (
          <ol className="space-y-1 text-sm" aria-label="Horaire des prises">
            {plan.schedule.map((i) => <li key={i.atMin} className="flex justify-between rounded-lg bg-surface-2 px-3 py-2"><span className="num">{Math.floor(i.atMin / 60)} h {String(i.atMin % 60).padStart(2, '0')}</span><span>{i.count} × {i.product} · {i.carbsG} g</span></li>)}
          </ol>
        ) : <p className="text-sm text-muted">Pas de prise de glucides prévue pour cet effort.</p>}
        {plan.notes.map((n) => <Say key={n.ruleId} e={n} />)}
      </Card>

      {loading && data.race && (
        <Card className="space-y-2">
          <Eyebrow>Carbo-loading · {data.race.name}</Eyebrow>
          <Say e={loading.explanation} />
          <ul className="space-y-1 text-sm">
            {loading.days.map((d) => <li key={d.date} className="flex justify-between rounded-lg bg-surface-2 px-3 py-2"><span>{d.date} (J−{d.daysBefore})</span><span className="num">{d.carbsG} g</span></li>)}
          </ul>
          <p className="text-xs text-muted">{{ a_venir: 'La charge commence bientôt.', en_cours: 'La charge est en cours.', passee: 'La charge est passée.' }[carboLoadingStatus(loading, today)]} Calculée pour {weight} kg ; départ le {addDays(data.race.date, 0)}.</p>
        </Card>
      )}

      <Card className="space-y-2">
        <Eyebrow>Journal de tolérance</Eyebrow>
        {data.logs.length === 0 ? <p className="text-sm text-muted">Rien encore. Chaque longue sortie notée affine ton niveau toléré.</p> : (
          <>
            <ul className="space-y-1 text-sm">
              {[...data.logs].reverse().slice(0, 8).map((l) => (
                <li key={l.id} className="flex justify-between rounded-lg bg-surface-2 px-3 py-2">
                  <span>{l.date} · {l.durationMin} min</span>
                  <span className={cn('num', l.giTolerance >= 3 && 'text-warn')}>{carbsPerHour(l)} g/h · inconfort {l.giTolerance}/5</span>
                </li>
              ))}
            </ul>
            {buckets.length > 1 && <p className="text-xs text-muted">Par niveau : {buckets.map((b) => `${b.from}-${b.from + 19} g/h → ${b.avgTolerance}/5`).join(' · ')}</p>}
          </>
        )}
      </Card>
    </div>
  );
}

function Say({ e }: { e: Explanation }) {
  return <p className="text-sm"><strong>{e.title}.</strong> <span className="text-muted">{e.why}</span></p>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-surface-2 p-3"><dd className="num text-lg font-semibold">{value}</dd><dt className="text-xs text-muted">{label}</dt></div>;
}
