import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, parseISO } from 'date-fns';
import { frCA } from 'date-fns/locale';
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core';
import { addDays, mondayOf, toIsoDate, validateMove, type Explanation, type PlannedSession, type Week } from '@/engine';
import { db } from '@/data/db';
import { moveSession } from '@/data/log';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { EmptyState } from '@/ui/components/EmptyState';
import { Segmented } from '@/ui/components/forms';
import { PHASE_LABEL, PlanTimeline } from '@/ui/components/PlanTimeline';
import { Sheet } from '@/ui/components/Sheet';
import { Why } from '@/ui/components/Why';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { cn } from '@/ui/lib/cn';
import { t } from '@/ui/lib/strings';
import { formatMinutes, sessionColor } from '@/ui/lib/sessionStyle';

type View = 'semaine' | 'mois' | 'bloc';

export function Plan() {
  const athlete = useActiveAthlete();
  const navigate = useNavigate();
  const today = toIsoDate(new Date());
  const [view, setView] = useState<View>('semaine');
  const [monday, setMonday] = useState(mondayOf(today));
  const data = useLiveQuery(async () => {
    if (!athlete) return undefined;
    const block = await db.blocks.where('status').equals('actif').filter((b) => b.athleteId === athlete.id).first();
    const weeks = block ? await db.weeks.where('blockId').equals(block.id).sortBy('index') : [];
    return { block, weeks };
  }, [athlete?.id]);

  if (!athlete || !data) return null;
  if (!data.block) {
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-semibold">Plan</h1>
        <EmptyState title="Pas encore de plan" action={<Button onClick={() => navigate('/objectif')}>Choisir un objectif</Button>}>{t.empty.plan}</EmptyState>
      </div>
    );
  }
  const weekIdx = data.weeks.findIndex((w) => w.startDate === monday);
  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-3xl font-semibold">Plan</h1>
        <Link to="/objectif" className="text-sm text-muted underline-offset-4 hover:underline">Nouvel objectif</Link>
      </header>
      <Segmented label="Vue" value={view} onChange={setView} options={[{ value: 'semaine', label: 'Semaine' }, { value: 'mois', label: 'Mois' }, { value: 'bloc', label: 'Bloc' }]} />
      {view === 'bloc' && (
        <BlockView weeks={data.weeks} name={data.block.name} warnings={data.block.warnings ?? []} current={data.weeks.findIndex((w) => w.startDate === mondayOf(today))} onPick={(i) => { setMonday(data.weeks[i]!.startDate); setView('semaine'); }} />
      )}
      {view === 'mois' && <MonthView monday={monday} onPick={(m) => { setMonday(m); setView('semaine'); }} athleteId={athlete.id} today={today} />}
      {view === 'semaine' && (
        <>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setMonday(addDays(monday, -7))} aria-label="Semaine précédente">←</Button>
            <div className="text-center">
              <p className="font-medium">Semaine du {format(parseISO(monday), 'd MMMM', { locale: frCA })}</p>
              {weekIdx >= 0 && <p className="num text-xs text-muted">{weekIdx + 1}/{data.weeks.length} · {PHASE_LABEL[data.weeks[weekIdx]!.phase]}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setMonday(addDays(monday, 7))} aria-label="Semaine suivante">→</Button>
          </div>
          <WeekView monday={monday} week={data.weeks[weekIdx]} athleteId={athlete.id} today={today} />
        </>
      )}
    </div>
  );
}

function WeekView({ monday, week, athleteId, today }: { monday: string; week?: Week; athleteId: string; today: string }) {
  const sessions = useLiveQuery(
    () => db.sessions.where('date').between(addDays(monday, -7), addDays(monday, 13), true, true).filter((s) => s.athleteId === athleteId).toArray(),
    [monday, athleteId],
  );
  const [live, setLive] = useState<Explanation[]>([]);
  const [moving, setMoving] = useState<PlannedSession | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  if (!sessions) return null;
  const inWeek = sessions.filter((s) => s.date >= monday && s.date <= days[6]!);
  const doneKm = inWeek.filter((s) => s.status === 'faite').reduce((a, s) => a + (s.distanceKm ?? 0), 0);

  const check = (id: string, date: string) => validateMove(sessions, id, date);
  const onOver = (e: DragOverEvent) => setLive(e.over ? check(String(e.active.id), String(e.over.id)) : []);
  const onEnd = async (e: DragEndEvent) => {
    setLive([]);
    if (!e.over) return;
    const problems = check(String(e.active.id), String(e.over.id));
    if (problems.some((p) => p.severity === 'stop')) return;
    await moveSession(db, String(e.active.id), String(e.over.id));
  };

  return (
    <div className="space-y-3">
      {week && (
        <Card className="flex items-center justify-between gap-3 py-4">
          <div>
            <Eyebrow>Cible</Eyebrow>
            <p className="num text-lg font-semibold">{week.targetKm} km{week.targetElevationM ? ` · ${week.targetElevationM} m D+` : ''}</p>
            <p className="text-xs text-muted">{week.kind === 'decharge' ? 'Décharge' : week.kind === 'taper' ? 'Affûtage' : week.kind === 'course' ? 'Semaine de course' : week.kind === 'recup' ? 'Récupération' : `${week.keySessions} séance(s) clé(s)`}</p>
          </div>
          <p className="num text-sm text-muted">{Math.round(doneKm)} km faits</p>
        </Card>
      )}
      {week?.notes?.length ? (
        <Why label="Pourquoi cette semaine?">
          <ul className="space-y-2">{week.notes.map((n, i) => <li key={i}><strong className="text-text">{n.title}.</strong> {n.why}</li>)}</ul>
        </Why>
      ) : null}
      <div aria-live="polite" className="min-h-0">
        {live.length > 0 && (
          <div className={cn('rounded-xl p-3 text-sm', live.some((l) => l.severity === 'stop' || l.severity === 'attention') ? 'bg-warn/12 text-warn' : 'bg-surface-2')}>
            {live.map((l) => <p key={l.ruleId}><strong>{l.title}.</strong> <span className="text-muted">{l.why}</span></p>)}
          </div>
        )}
      </div>
      <DndContext sensors={sensors} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => setLive([])}>
        <ol className="space-y-2">
          {days.map((d) => (
            <DayRow key={d} date={d} today={today} sessions={inWeek.filter((s) => s.date === d)} onMove={setMoving} />
          ))}
        </ol>
      </DndContext>
      <p className="text-xs text-muted">Astuce : glisse une séance vers un autre jour (appui long sur mobile). Le moteur vérifie les 48 h et la veille de la longue.</p>
      <MoveSheet session={moving} sessions={sessions} monday={monday} onClose={() => setMoving(null)} />
    </div>
  );
}

function DayRow({ date, today, sessions, onMove }: { date: string; today: string; sessions: PlannedSession[]; onMove: (s: PlannedSession) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  const visible = sessions.filter((s) => s.type !== 'repos');
  return (
    <li ref={setNodeRef} className={cn('flex gap-3 rounded-2xl border p-2 transition', isOver ? 'border-accent bg-accent/5' : 'border-transparent', date === today && 'bg-surface/60')}>
      <div className="w-12 shrink-0 pt-2 text-center">
        <p className={cn('text-xs uppercase', date === today ? 'text-accent' : 'text-muted')}>{format(parseISO(date), 'EEE', { locale: frCA })}</p>
        <p className="num text-lg font-semibold">{format(parseISO(date), 'd')}</p>
      </div>
      <div className="flex-1 space-y-2">
        {visible.length === 0 && <p className="py-3 text-sm text-muted">Repos</p>}
        {visible.map((s) => <SessionChip key={s.id} s={s} onMove={() => onMove(s)} />)}
      </div>
    </li>
  );
}

function SessionChip({ s, onMove }: { s: PlannedSession; onMove: () => void }) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: s.id, disabled: s.status === 'faite' || s.type === 'course' });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} className={cn('relative flex items-center gap-2 overflow-hidden rounded-xl bg-surface p-3 pl-4 shadow-sm', isDragging && 'z-10 shadow-xl ring-2 ring-accent')}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: sessionColor(s.type) }} />
      <button type="button" className="flex-1 text-left" onClick={() => navigate(`/seance/${s.id}`)} {...listeners} {...attributes} aria-roledescription="séance déplaçable">
        <p className={cn('font-medium leading-tight', s.status === 'sautee' && 'text-muted line-through')}>{s.title}</p>
        <p className="num text-xs text-muted">
          {s.durationMin ? formatMinutes(s.durationMin) : ''}{s.distanceKm ? ` · ${s.distanceKm} km` : ''}{s.elevationGainM ? ` · ${s.elevationGainM} m` : ''}
          {s.isKey && <span className="ml-1 text-accent">· clé</span>}
        </p>
      </button>
      {s.status === 'faite' ? <span className="text-ok" aria-label="faite">✓</span> : s.type !== 'course' && (
        <button type="button" onClick={onMove} className="rounded-full px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text" aria-label={`Déplacer ${s.title}`}>⇅</button>
      )}
    </div>
  );
}

/** Alternative accessible au glisser-déposer : choisir le jour, avec l'avis du moteur pour chacun. */
function MoveSheet({ session, sessions, monday, onClose }: { session: PlannedSession | null; sessions: PlannedSession[]; monday: string; onClose: () => void }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  return (
    <Sheet open={Boolean(session)} onClose={onClose} title={session ? `Déplacer « ${session.title} »` : ''}>
      {session && (
        <ul className="space-y-2">
          {days.map((d) => {
            const issues = validateMove(sessions, session.id, d);
            const blocked = issues.some((i) => i.severity === 'stop');
            const warn = issues.some((i) => i.severity === 'attention');
            return (
              <li key={d}>
                <button type="button" disabled={blocked || d === session.date} onClick={async () => { await moveSession(db, session.id, d); onClose(); }}
                  className={cn('w-full rounded-xl border p-3 text-left transition disabled:opacity-50', warn ? 'border-warn/50' : 'border-line hover:border-accent')}>
                  <span className="font-medium capitalize">{format(parseISO(d), 'EEEE d', { locale: frCA })}</span>
                  {d === session.date && <span className="ml-2 text-xs text-muted">(actuel)</span>}
                  {issues.map((i) => <span key={i.ruleId} className={cn('mt-1 block text-xs', i.severity === 'info' || i.severity === 'conseil' ? 'text-muted' : 'text-warn')}>{i.title}</span>)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

function BlockView({ weeks, name, warnings, current, onPick }: { weeks: Week[]; name: string; warnings: Explanation[]; current: number; onPick: (i: number) => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <Eyebrow>{name}</Eyebrow>
        <PlanTimeline weeks={weeks} current={current} className="mt-4" onSelect={onPick} />
      </Card>
      {warnings.map((w) => <p key={w.ruleId} className="rounded-xl bg-surface-2 p-3 text-sm"><strong>{w.title}.</strong> <span className="text-muted">{w.why}</span></p>)}
      <ol className="space-y-1">
        {weeks.map((w, i) => (
          <li key={w.id}>
            <button type="button" onClick={() => onPick(i)} className={cn('flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-surface', i === current && 'bg-surface')}>
              <span><span className="num text-muted">S{i + 1}</span> · {PHASE_LABEL[w.phase]}{w.kind === 'decharge' ? ' · décharge' : ''}{w.raceDate ? ' · ★ course' : ''}{w.bRaceDate ? ' · ☆ course B' : ''}</span>
              <span className="num text-muted">{w.targetKm} km{w.targetElevationM ? ` · ${w.targetElevationM} m` : ''}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MonthView({ monday, onPick, athleteId, today }: { monday: string; onPick: (monday: string) => void; athleteId: string; today: string }) {
  const first = mondayOf(monday.slice(0, 8) + '01');
  const start = first;
  const end = addDays(start, 41);
  const sessions = useLiveQuery(() => db.sessions.where('date').between(start, end, true, true).filter((s) => s.athleteId === athleteId && s.type !== 'repos').toArray(), [start, end, athleteId]);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const month = monday.slice(0, 7);
  return (
    <Card>
      <p className="mb-3 text-center font-medium capitalize">{format(parseISO(monday), 'MMMM yyyy', { locale: frCA })}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}
        {days.map((d) => {
          const ss = sessions?.filter((s) => s.date === d) ?? [];
          return (
            <button key={d} type="button" onClick={() => onPick(mondayOf(d))} className={cn('flex aspect-square flex-col items-center justify-start gap-1 rounded-lg p-1 hover:bg-surface-2', d.slice(0, 7) !== month && 'opacity-40', d === today && 'ring-1 ring-accent')}>
              <span className="num text-text">{Number(d.slice(8))}</span>
              <span className="flex gap-0.5">
                {ss.slice(0, 3).map((s) => <span key={s.id} className="h-1.5 w-1.5 rounded-full" style={{ background: sessionColor(s.type), opacity: s.status === 'faite' ? 1 : 0.7 }} />)}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
