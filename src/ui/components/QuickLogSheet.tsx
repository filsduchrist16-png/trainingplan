import { useState } from 'react';
import { C, isRunType, toIsoDate, type Athlete, type BodyZone, type PlannedSession } from '@/engine';
import { db } from '@/data/db';
import { logManual } from '@/data/log';
import { NUTRITION_LOG_FROM_MIN, addNutritionLog } from '@/data/nutrition';
import { applyEvaluation } from '@/data/planner';
import { Button } from './Button';
import { Chip, Field, Segmented, Stepper } from './forms';
import { Sheet } from './Sheet';
import { ShoePicker } from './ShoePicker';

const PAIN: { z: BodyZone; label: string }[] = [
  { z: 'tibia_g', label: 'Tibia G' }, { z: 'tibia_d', label: 'Tibia D' }, { z: 'achille_g', label: 'Achille G' }, { z: 'achille_d', label: 'Achille D' }, { z: 'genou_g', label: 'Genou G' }, { z: 'genou_d', label: 'Genou D' },
];

/** « C'est fait » : log en moins de 30 s (durée et distance pré-remplies avec le prévu). */
export function QuickLogSheet({ open, onClose, athlete, session, date }: { open: boolean; onClose: () => void; athlete: Athlete; session?: PlannedSession; date: string }) {
  const [duration, setDuration] = useState(session?.durationMin ?? 45);
  const [distance, setDistance] = useState(session?.distanceKm ?? 0);
  const [rpe, setRpe] = useState(session?.rpeTarget ?? 4);
  const runWalk = session?.type === 'marche_course';
  const [completed, setCompleted] = useState(true);
  const evaluation = session?.type === 'evaluation';
  const isRunSession = !session || isRunType(session.type);
  const [ranMin, setRanMin] = useState(C.EVALUATION_MAX_RUN_MIN);
  const [fuelOn, setFuelOn] = useState(false);
  const [carbsG, setCarbsG] = useState(0);
  const [fluidMl, setFluidMl] = useState(0);
  const [gi, setGi] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [shoeId, setShoeId] = useState<string | undefined>(undefined);
  const [feeling, setFeeling] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [pain, setPain] = useState<{ zone: BodyZone; intensity: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const activityId = await logManual(db, athlete, {
        date,
        ...(session ? { sessionId: session.id } : {}),
        type: session?.type ?? 'z2_endurance',
        durationMin: duration,
        distanceKm: distance,
        elevationGainM: session?.elevationGainM,
        rpe,
        ...(shoeId ? { shoeId } : {}),
        ...(runWalk ? { completed } : {}),
        feeling,
        pains: pain ? [pain] : [],
      });
      // Sortie longue : ce qui a été pris et comment ça a passé, pour le gut training.
      if (fuelOn && isRunSession) await addNutritionLog(db, athlete.id, { date, activityId, durationMin: duration, carbsG, ...(fluidMl ? { fluidMl } : {}), giTolerance: gi });
      // Évaluation : les minutes courues fixent le point de départ, et le plan se régénère dès demain.
      if (evaluation) await applyEvaluation(db, athlete.id, ranMin, toIsoDate(new Date()));
      if (navigator.vibrate) navigator.vibrate(15);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="C'est fait">
      <div className="space-y-4">
        <Stepper label="Durée" value={duration} onChange={setDuration} step={5} min={5} max={600} unit="min" />
        <Stepper label="Distance" value={distance} onChange={setDistance} step={0.5} max={200} unit="km" />
        {evaluation && (
          <Stepper label="Minutes courues d'affilée" value={ranMin} onChange={setRanMin} min={0} max={C.EVALUATION_MAX_RUN_MIN} unit="min" />
        )}
        {runWalk && (
          <Field label="Marche/course" hint="Décoche si tu as dû raccourcir ou sauter des intervalles : l'échelle s'ajuste." group>
            <Chip selected={completed} onToggle={() => setCompleted(!completed)}>J'ai fait tous les intervalles</Chip>
          </Field>
        )}
        <Field label={`Effort perçu (RPE) : ${rpe}/10`} hint="1 = marche tranquille · 5 = soutenu · 10 = à bloc">
          <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label="RPE" />
        </Field>
        {isRunSession && duration >= NUTRITION_LOG_FROM_MIN && (
          <Field label="Nutrition pendant la sortie" hint="Pour le gut training : ce que tu as pris et comment ça a passé." group>
            <Chip selected={fuelOn} onToggle={() => setFuelOn(!fuelOn)}>Noter ma nutrition</Chip>
          </Field>
        )}
        {fuelOn && isRunSession && duration >= NUTRITION_LOG_FROM_MIN && (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <Stepper label="Glucides pris (total)" value={carbsG} onChange={setCarbsG} step={5} max={600} unit="g" />
            <Stepper label="Liquide bu" value={fluidMl} onChange={setFluidMl} step={100} max={6000} unit="mL" />
            <Field label="Inconfort digestif" hint="0 = aucun · 5 = très mal" group>
              <Segmented label="Inconfort digestif" value={gi} onChange={setGi} options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: n as 0 | 1 | 2 | 3 | 4 | 5, label: String(n) }))} />
            </Field>
          </div>
        )}
        {isRunSession && <ShoePicker athleteId={athlete.id} value={shoeId} onChange={setShoeId} trail={['cotes_longues', 'descentes', 'longue_specifique', 'back_to_back'].includes(session?.type ?? '')} hard={session?.isKey === true} />}
        <Field label="Sensations" group>
          <Segmented label="Sensations" value={feeling} onChange={setFeeling} options={[{ value: 1, label: '😖' }, { value: 2, label: '😕' }, { value: 3, label: '😐' }, { value: 4, label: '🙂' }, { value: 5, label: '😄' }]} />
        </Field>
        <Field label="Une douleur?" group>
          <div className="flex flex-wrap gap-2">
            <Chip selected={!pain} onToggle={() => setPain(null)}>Aucune</Chip>
            {PAIN.map(({ z, label }) => (
              <Chip key={z} selected={pain?.zone === z} onToggle={() => setPain({ zone: z, intensity: pain?.intensity ?? 2 })}>{label}</Chip>
            ))}
          </div>
        </Field>
        {pain && <Stepper label="Intensité" value={pain.intensity} onChange={(v) => setPain({ ...pain, intensity: v })} max={10} unit="/ 10" />}
        <Button size="lg" className="w-full" disabled={busy} onClick={save}>Enregistrer</Button>
      </div>
    </Sheet>
  );
}
