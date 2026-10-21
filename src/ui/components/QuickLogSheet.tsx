import { useState } from 'react';
import { C, toIsoDate, type Athlete, type BodyZone, type PlannedSession } from '@/engine';
import { db } from '@/data/db';
import { logManual } from '@/data/log';
import { applyEvaluation } from '@/data/planner';
import { Button } from './Button';
import { Chip, Field, Segmented, Stepper } from './forms';
import { Sheet } from './Sheet';

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
  const [ranMin, setRanMin] = useState(C.EVALUATION_MAX_RUN_MIN);
  const [feeling, setFeeling] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [pain, setPain] = useState<{ zone: BodyZone; intensity: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await logManual(db, athlete, {
        date,
        ...(session ? { sessionId: session.id } : {}),
        type: session?.type ?? 'z2_endurance',
        durationMin: duration,
        distanceKm: distance,
        elevationGainM: session?.elevationGainM,
        rpe,
        ...(runWalk ? { completed } : {}),
        feeling,
        pains: pain ? [pain] : [],
      });
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
