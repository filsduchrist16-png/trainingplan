import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { C, EXERCISES, GOALS, nextTarget, strengthProgram, tempoSteps, toIsoDate, type Athlete, type NextTarget, type Phase, type PlannedSession, type ProgramRow, type StrengthKind } from '@/engine';
import { db } from '@/data/db';
import { lastSets, saveStrengthSession } from '@/data/strength';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { Field, Stepper } from '@/ui/components/forms';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { cn } from '@/ui/lib/cn';

interface SetState {
  reps: number;
  loadKg: number;
  done: boolean;
}

/** Logger de muscu : le moteur donne le programme et la cible de chaque exercice, l'écran les affiche et note les séries. */
export function Muscu() {
  const athlete = useActiveAthlete();
  if (!athlete) return null;
  return <MuscuFor key={athlete.id} athlete={athlete} />;
}

function MuscuFor({ athlete }: { athlete: Athlete }) {
  const [params] = useSearchParams();
  const sessionId = params.get('seance') ?? undefined;
  const ctx = useLiveQuery(async () => {
    const session = sessionId ? await db.sessions.get(sessionId) : undefined;
    const week = session ? await db.weeks.get(session.weekId) : undefined;
    const block = week ? await db.blocks.get(week.blockId) : await db.blocks.where('status').equals('actif').filter((b) => b.athleteId === athlete.id).first();
    return { session: session ?? null, phase: (week?.phase ?? 'base') as Phase, goal: block?.goal };
  }, [sessionId, athlete.id]);
  if (!ctx) return null;
  const type: StrengthKind = ctx.session && (ctx.session.type === 'muscu_trail' || ctx.session.type === 'plyo' || ctx.session.type === 'muscu_generale') ? ctx.session.type : 'muscu_generale';
  return <Logger athlete={athlete} session={ctx.session ?? undefined} type={type} phase={ctx.phase} trail={ctx.goal ? GOALS[ctx.goal].family === 'trail' : false} />;
}

function Logger({ athlete, session, type, phase, trail }: { athlete: Athlete; session?: PlannedSession; type: StrengthKind; phase: Phase; trail: boolean }) {
  const navigate = useNavigate();
  const age = athlete.birthYear ? new Date().getFullYear() - athlete.birthYear : undefined;
  const pregnant = athlete.health?.answers.q8 === true && athlete.health.pregnancy?.status === 'enceinte';
  const program = useMemo(
    () => strengthProgram({ type, phase, experience: athlete.experience, trail, balance: age !== undefined && age >= C.PROFILE_SENIOR_AGE, pregnancy: pregnant }),
    [type, phase, athlete.experience, trail, age, pregnant],
  );

  const [targets, setTargets] = useState<Record<string, NextTarget> | null>(null);
  const [sets, setSets] = useState<Record<string, SetState[]>>({});
  const [rpe, setRpe] = useState(program.rpeTarget || 6);
  const [rest, setRest] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Cible de chaque exercice : double progression depuis la dernière séance.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const t: Record<string, NextTarget> = {};
      for (const r of program.rows) t[r.exerciseId] = nextTarget(await lastSets(db, athlete.id, r.exerciseId), r, { loaded: EXERCISES[r.exerciseId]!.loaded });
      if (!alive) return;
      setTargets(t);
      setSets(Object.fromEntries(program.rows.map((r) => [r.exerciseId, Array.from({ length: r.sets }, () => ({ reps: t[r.exerciseId]!.reps, loadKg: t[r.exerciseId]!.loadKg ?? 0, done: false }))])));
    })();
    return () => { alive = false; };
  }, [program, athlete.id]);

  // Minuteur de repos : une seconde à la fois, vibration à la fin.
  useEffect(() => {
    if (rest === null) return undefined;
    const id = window.setTimeout(() => {
      if (rest <= 1) {
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
        setRest(null);
      } else setRest(rest - 1);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [rest]);

  const update = (id: string, i: number, patch: Partial<SetState>) => setSets((s) => ({ ...s, [id]: s[id]!.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
  const doneCount = Object.values(sets).flat().filter((s) => s.done).length;

  async function save() {
    setBusy(true);
    try {
      const log = program.rows.flatMap((r) => (sets[r.exerciseId] ?? []).filter((s) => s.done).map((s) => ({
        exerciseId: r.exerciseId, reps: s.reps, ...(EXERCISES[r.exerciseId]!.loaded && s.loadKg > 0 ? { loadKg: s.loadKg } : {}), rpe, ...(r.tempo ? { tempo: r.tempo } : {}),
      })));
      await saveStrengthSession(db, athlete, { date: session?.date ?? toIsoDate(new Date()), ...(session ? { plannedSessionId: session.id } : {}), program: program.name, sets: log });
      navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 pb-28">
      <Link to={session ? `/seance/${session.id}` : '/plus'} className="text-sm text-muted hover:text-text">← Retour</Link>
      <header>
        <Eyebrow>Muscu</Eyebrow>
        <h1 className="mt-1 text-3xl font-semibold">{program.name}</h1>
        <p className="mt-2 text-sm text-muted"><strong className="text-text">{program.explanation.title}.</strong> {program.explanation.why}</p>
      </header>

      {program.rows.length === 0 && <Card><p>On saute cette séance pour l'instant. Une marche ou un repos actif fera très bien.</p></Card>}
      {targets && program.rows.map((r) => (
        <ExerciseCard key={r.exerciseId} row={r} target={targets[r.exerciseId]!} sets={sets[r.exerciseId] ?? []} onChange={(i, p) => update(r.exerciseId, i, p)} onDone={() => setRest(r.restSec)} />
      ))}

      {program.rows.length > 0 && (
        <Card className="space-y-3">
          <Field label={`Effort perçu de la séance (RPE) : ${rpe}/10`} hint={`Visé : environ ${program.rpeTarget}. À 9-10, on ne monte pas la charge.`}>
            <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label="RPE de la séance" />
          </Field>
          <Button size="lg" className="w-full" disabled={busy || doneCount === 0} onClick={save}>Enregistrer la séance ({doneCount} série{doneCount > 1 ? 's' : ''})</Button>
        </Card>
      )}

      {rest !== null && (
        <div role="timer" aria-label="Repos" className="fixed inset-x-4 bottom-24 z-30 flex items-center justify-between rounded-2xl border border-line bg-surface p-4 shadow-lg">
          <div>
            <p className="text-xs text-muted">Repos</p>
            <p className="num text-3xl font-semibold" data-testid="rest-left">{Math.floor(rest / 60)}:{String(rest % 60).padStart(2, '0')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRest(null)}>Passer</Button>
        </div>
      )}
    </div>
  );
}

function ExerciseCard({ row, target, sets, onChange, onDone }: { row: ProgramRow; target: NextTarget; sets: SetState[]; onChange: (i: number, patch: Partial<SetState>) => void; onDone: () => void }) {
  const ex = EXERCISES[row.exerciseId]!;
  const [open, setOpen] = useState(false);
  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{ex.name}</h2>
        <span className="num text-xs text-muted">{row.sets} × {row.repsMin}-{row.repsMax}{row.tempo ? ` · ${row.tempo}` : ''}</span>
      </div>
      <p className="text-sm"><strong>{target.explanation.title}.</strong> <span className="text-muted">{target.explanation.why}</span></p>
      {row.note && <p className="text-xs text-muted">{row.note}</p>}
      <button type="button" className="text-sm underline underline-offset-4" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Masquer la technique' : 'Technique'}</button>
      {open && (
        <div className="space-y-2">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{ex.cues.map((c) => <li key={c}>{c}</li>)}</ul>
          {row.tempo && <TempoGuide tempo={row.tempo} />}
        </div>
      )}
      <ul className="space-y-2">
        {sets.map((s, i) => (
          <li key={i} className={cn('space-y-2 rounded-xl p-3', s.done ? 'bg-ok/10' : 'bg-surface-2')}>
            <Stepper label={`${ex.name}, série ${i + 1} : reps`} value={s.reps} onChange={(v) => onChange(i, { reps: v })} min={0} max={60} />
            {ex.loaded && <Stepper label={`${ex.name}, série ${i + 1} : charge`} value={s.loadKg} onChange={(v) => onChange(i, { loadKg: v })} step={0.5} min={0} max={300} unit="kg" />}
            <Button size="sm" variant={s.done ? 'secondary' : 'primary'} aria-pressed={s.done} onClick={() => { onChange(i, { done: !s.done }); if (!s.done) onDone(); }}>{s.done ? `Série ${i + 1} faite ✓` : `Série ${i + 1} faite`}</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Tempo guidé : « Descends… Pause… Monte… » en grand, à la seconde. */
function TempoGuide({ tempo }: { tempo: string }) {
  const steps = tempoSteps(tempo);
  const [at, setAt] = useState<{ step: number; left: number } | null>(null);
  useEffect(() => {
    if (!at) return undefined;
    const id = window.setTimeout(() => {
      if (at.left > 1) setAt({ ...at, left: at.left - 1 });
      else if (at.step < steps.length - 1) setAt({ step: at.step + 1, left: steps[at.step + 1]!.sec });
      else setAt(null);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [at, steps]);
  return at ? (
    <p role="status" className="num rounded-xl bg-accent/15 p-3 text-center text-2xl font-semibold">{steps[at.step]!.label} {at.left}</p>
  ) : (
    <Button size="sm" variant="outline" onClick={() => setAt({ step: 0, left: steps[0]!.sec })}>Guider un tempo {tempo}</Button>
  );
}
