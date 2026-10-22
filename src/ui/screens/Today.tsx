import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { frCA } from 'date-fns/locale';
import { m } from 'motion/react';
import {
  JOURNEY_DONE, SESSION_LIBRARY, addDays, adjustToday, stageLabel, validationsRequired, findMoveTarget, generateRecovery, healthLight, mondayOf, zoneTarget,
  type Athlete, type DayDecision, type DayState, type HrvStatus, type PlannedSession, type ZoneKey,
} from '@/engine';
import { db } from '@/data/db';
import { swapSessions } from '@/data/log';
import { recentMilestoneRows, syncMilestones } from '@/data/milestones';
import { createRecoveryPlan } from '@/data/planner';
import { saveWellness } from '@/data/wellness';
import { AcwrGauge } from '@/ui/components/AcwrGauge';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { ElevationProfile } from '@/ui/components/ElevationProfile';
import { QuickLogSheet } from '@/ui/components/QuickLogSheet';
import { PHASE_LABEL } from '@/ui/components/PlanTimeline';
import { Ring } from '@/ui/components/Ring';
import { Why } from '@/ui/components/Why';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { useCoach, type CoachContext } from '@/ui/hooks/useCoach';
import { cn } from '@/ui/lib/cn';
import { formatMinutes, sessionColor } from '@/ui/lib/sessionStyle';
import { Welcome } from './Welcome';

export function Today() {
  const athlete = useActiveAthlete();
  if (athlete === undefined) return <TodaySkeleton />;
  if (athlete === null) return <Welcome />;
  return <TodayFor athlete={athlete} />;
}

function TodayFor({ athlete }: { athlete: Athlete }) {
  const ctx = useCoach(athlete);
  if (!ctx) return <TodaySkeleton />;
  const today = parseISO(ctx.today);
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{format(today, 'EEEE d MMMM', { locale: frCA })}</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-3xl font-semibold">Salut {athlete.name.split(' ')[0]}</h1>
          {ctx.week && ctx.weeks.length > 0 && (
            <Link to="/plan" className="num rounded-full bg-surface px-3 py-1 text-xs text-muted hover:text-text">
              Semaine {ctx.weekIndex + 1}/{ctx.weeks.length} · {PHASE_LABEL[ctx.week.phase]}
            </Link>
          )}
        </div>
      </header>

      {ctx.health.level !== 'ok' && <HealthBanner ctx={ctx} />}
      <TodayCore athlete={athlete} ctx={ctx} />
      {athlete.runWalk && <RunWalkCard runWalk={athlete.runWalk} />}
      <MilestoneCard athleteId={athlete.id} today={ctx.today} />
      <RaceCard ctx={ctx} />
      <Glance athlete={athlete} ctx={ctx} />
    </div>
  );
}

/** Jalons des 7 derniers jours : une phrase sobre, la date, rien de plus. */
function MilestoneCard({ athleteId, today }: { athleteId: string; today: string }) {
  const recent = useLiveQuery(async () => {
    await syncMilestones(db, athleteId);
    return recentMilestoneRows(db, athleteId, today);
  }, [athleteId, today]);
  if (!recent?.length) return null;
  return (
    <Card className="space-y-2 border border-accent/40">
      <Eyebrow>Bravo</Eyebrow>
      <ul className="space-y-2">
        {recent.slice(0, 3).map((m) => <li key={m.key}><p className="font-semibold">{m.title}</p><p className="text-sm text-muted">{m.why}</p></li>)}
      </ul>
      <Link to="/progres" className="text-sm underline underline-offset-4">Tous mes jalons</Link>
    </Card>
  );
}

/** Où en est l'échelle marche/course, et pourquoi (dernière décision du moteur). */
function RunWalkCard({ runWalk }: { runWalk: NonNullable<Athlete['runWalk']> }) {
  const { state, last } = runWalk;
  const done = state.stage >= JOURNEY_DONE;
  const needed = validationsRequired(state.stage);
  return (
    <Card className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>Ton démarrage</Eyebrow>
        {!done && <span className="num text-xs text-muted">{state.validatedAtStage} / {needed} séance{needed > 1 ? 's' : ''} validée{state.validatedAtStage > 1 ? 's' : ''}</span>}
      </div>
      <p className="text-xl font-semibold" data-testid="runwalk-stage">{stageLabel(state.stage)}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Avancement du démarrage" aria-valuemin={0} aria-valuemax={JOURNEY_DONE} aria-valuenow={state.stage}>
        <div className="h-full bg-accent" style={{ width: `${(Math.min(state.stage, JOURNEY_DONE) / JOURNEY_DONE) * 100}%` }} />
      </div>
      {last && (
        <p className="text-sm"><strong>{last.title}.</strong> <span className="text-muted">{last.why}</span></p>
      )}
    </Card>
  );
}

function HealthBanner({ ctx }: { ctx: CoachContext }) {
  const light = healthLight(ctx.health);
  const top = ctx.health.explanations[0]!;
  return (
    <Link to="/corps" className={cn('block rounded-2xl border p-4', light === 'rouge' ? 'border-danger/60 bg-danger/10' : 'border-warn/50 bg-warn/10')}>
      <p className={cn('font-semibold', light === 'rouge' ? 'text-danger' : 'text-warn')}>{top.title}</p>
      <p className="mt-1 text-sm text-muted">{top.why}</p>
    </Link>
  );
}

function TodayCore({ athlete, ctx }: { athlete: Athlete; ctx: CoachContext }) {
  const navigate = useNavigate();
  const [logOpen, setLogOpen] = useState(false);
  const [showMvv, setShowMvv] = useState(false);
  const planned = ctx.todaySessions.find((s) => SESSION_LIBRARY[s.type].isRun || s.type === 'croise') ?? ctx.todaySessions.find((s) => s.type !== 'repos') ?? ctx.todaySessions[0];
  const strength = ctx.todaySessions.filter((s) => s !== planned && s.type !== 'repos');
  const w = ctx.wellnessToday;

  // Calcul pur et léger : recalculé à chaque rendu, sans mémoïsation.
  const decision: DayDecision | undefined = !planned || planned.status === 'faite' ? undefined : adjustToday({
      session: planned,
      ...(w?.state ? { state: w.state } : {}),
      ...(w?.shortNight ? { shortNight: true } : {}),
      ...(w?.sleepHours !== undefined ? { sleepHours: w.sleepHours } : {}),
      health: ctx.health,
      crossTraining: athlete.crossTraining,
    });
  const moveTarget = decision?.moveQuality && planned ? findMoveTarget(ctx.weekSessions, planned.id, addDays(mondayOf(ctx.today), 6)) : null;

  // Course A passée : récup puis nouvel objectif.
  if (ctx.race && ctx.race.date < ctx.today && ctx.block?.goal !== 'forme') {
    return <AfterRace athlete={athlete} ctx={ctx} />;
  }
  if (!ctx.block) {
    return (
      <Card className="bg-surface-2">
        <Eyebrow>Pas encore de plan</Eyebrow>
        <h2 className="mt-2 text-2xl">On part sur quoi?</h2>
        <p className="mt-2 text-muted">5 km, marathon, ultra, ou juste garder la forme : choisis un objectif et le plan se construit autour de ta vie.</p>
        <Button className="mt-4" onClick={() => navigate('/objectif')}>Choisir un objectif</Button>
      </Card>
    );
  }

  const shown = decision?.session ?? planned;
  const adjusted = decision && decision.action !== 'garder';
  return (
    <>
      <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <Card className="relative overflow-hidden bg-surface-2">
          <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: shown ? sessionColor(shown.type) : 'var(--line)' }} />
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>Séance du jour</Eyebrow>
            {planned?.status === 'faite' && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs text-ok">✓ faite</span>}
            {adjusted && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs text-warn">ajustée</span>}
            {shown?.isKey && !adjusted && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">séance clé</span>}
          </div>
          {!shown ? (
            <h2 className="mt-2 text-2xl">Rien de prévu</h2>
          ) : (
            <m.div key={shown.title} initial={{ opacity: 0.3 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                <h2 className="mt-2 text-2xl leading-tight">{showMvv && planned?.minimal ? planned.minimal.title : shown.title}</h2>
                <p className="mt-2 text-muted">{shown.why}</p>
                {shown.type !== 'repos' && !showMvv && <SessionFacts athlete={athlete} session={shown as PlannedSession} />}
            </m.div>
          )}
          {strength.map((x) => <p key={x.id} className="mt-3 text-sm text-muted">+ {x.title} ({x.durationMin} min)</p>)}

          {decision && decision.explanations.length > 0 && (
            <Why className="mt-3">
              <ul className="space-y-2">
                {decision.explanations.map((e) => <li key={e.ruleId}><strong className="text-text">{e.title}.</strong> {e.why}</li>)}
              </ul>
            </Why>
          )}
          {decision?.moveQuality && planned && (
            <div className="mt-3 rounded-xl bg-bg/40 p-3 text-sm">
              {moveTarget ? (
                <>
                  <p>Meilleur jour pour « {planned.title} » : <strong>{format(parseISO(moveTarget), 'EEEE d', { locale: frCA })}</strong> (48 h respectées).</p>
                  <Button size="sm" variant="secondary" className="mt-2" onClick={async () => {
                    const target = ctx.weekSessions.find((s) => s.date === moveTarget && SESSION_LIBRARY[s.type].isRun) ?? ctx.weekSessions.find((s) => s.date === moveTarget && s.type === 'repos');
                    if (target) await swapSessions(db, planned.id, target.id);
                  }}>Déplacer</Button>
                </>
              ) : <p>Pas de bon jour cette semaine pour la replacer : on la laisse tomber, et c'est correct.</p>}
            </div>
          )}
          {planned && planned.status !== 'faite' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => setLogOpen(true)}>C'est fait</Button>
              <Button variant="outline" onClick={() => setShowMvv(!showMvv)}>{showMvv ? 'Séance complète' : 'Version minimale viable'}</Button>
              <Button variant="outline" onClick={() => navigate(`/seance/${planned.id}`)}>Détails</Button>
            </div>
          )}
          {planned?.status === 'faite' && planned.activityId && (
            <Button className="mt-4" variant="secondary" onClick={() => navigate(`/activite/${planned.activityId}`)}>Voir le debrief</Button>
          )}
        </Card>
      </m.div>

      {planned?.status !== 'faite' && <DayState ctx={ctx} athlete={athlete} />}
      <QuickLogSheet open={logOpen} onClose={() => setLogOpen(false)} athlete={athlete} session={planned} date={ctx.today} />
    </>
  );
}

function SessionFacts({ athlete, session }: { athlete: Athlete; session: Pick<PlannedSession, 'durationMin' | 'distanceKm' | 'elevationGainM' | 'steps'> }) {
  const zone = session.steps.map((s) => ('zone' in s.target ? s.target.zone : undefined)).find((z): z is ZoneKey => Boolean(z) && z !== 'z1') ?? 'z2';
  const z = zoneTarget(zone, { bounds: athlete.zones.bounds, hrMax: athlete.hrMax, hrUnreliable: athlete.health?.hrUnreliable });
  return (
    <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
      <Fact label="durée" value={formatMinutes(session.durationMin)} />
      <Fact label={session.elevationGainM ? 'D+' : 'distance'} value={session.elevationGainM ? `${session.elevationGainM} m` : session.distanceKm ? `${session.distanceKm} km` : '—'} />
      <Fact label={z.unit === 'RPE' ? `${zone.toUpperCase()} · RPE` : zone.toUpperCase()} value={z.value} />
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg/40 p-2">
      <dd className="num text-lg font-semibold">{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}

/** Sélecteur d'état du jour : 3 taps + nuit courte, et le matin en 10 s. */
function DayState({ ctx, athlete }: { ctx: CoachContext; athlete: Athlete }) {
  const w = ctx.wellnessToday;
  const [morning, setMorning] = useState(false);
  const save = (patch: Parameters<typeof saveWellness>[3]) => {
    if (navigator.vibrate) navigator.vibrate(10);
    return saveWellness(db, athlete.id, ctx.today, patch);
  };
  const states: { v: DayState; emoji: string; label: string }[] = [
    { v: 'vert', emoji: '🟢', label: 'En forme' },
    { v: 'jaune', emoji: '🟡', label: 'Moyen' },
    { v: 'rouge', emoji: '🔴', label: 'Brûlé' },
  ];
  return (
    <Card>
      <Eyebrow>Comment tu te sens?</Eyebrow>
      <div role="radiogroup" aria-label="État du jour" className="mt-3 grid grid-cols-3 gap-2">
        {states.map((s) => (
          <button key={s.v} type="button" role="radio" aria-checked={w?.state === s.v} onClick={() => save({ state: s.v })}
            className={cn('flex flex-col items-center gap-1 rounded-2xl border py-3 transition', w?.state === s.v ? 'border-accent bg-accent/10' : 'border-line hover:border-muted')}>
            <span aria-hidden className="text-2xl">{s.emoji}</span>
            <span className="text-sm">{s.label}</span>
          </button>
        ))}
      </div>
      <button type="button" aria-pressed={Boolean(w?.shortNight)} onClick={() => save({ shortNight: !w?.shortNight })}
        className={cn('mt-2 flex w-full items-center justify-between rounded-2xl border px-4 py-3 transition', w?.shortNight ? 'border-accent bg-accent/10' : 'border-line hover:border-muted')}>
        <span>😴 Nuit courte</span>
        <span className="text-sm text-muted">{w?.shortNight ? 'oui' : 'non'}</span>
      </button>
      <button type="button" onClick={() => setMorning(!morning)} className="mt-3 text-sm text-muted underline-offset-4 hover:underline" aria-expanded={morning}>
        {morning ? 'Masquer' : 'Ajouter'} mes chiffres du matin (Body Battery, VFC, FC repos)
      </button>
      {morning && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniNumber label="Body Battery" value={w?.bodyBattery} onChange={(v) => save({ bodyBattery: v })} />
          <MiniNumber label="FC repos" value={w?.hrRest} onChange={(v) => save({ hrRest: v })} />
          <MiniNumber label="Sommeil (h)" value={w?.sleepHours} step={0.5} onChange={(v) => save({ sleepHours: v })} />
          <label className="col-span-3 flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-2 text-sm">
            <span className="text-muted">VFC</span>
            <select value={w?.hrv ?? ''} onChange={(e) => save({ hrv: (e.target.value || undefined) as HrvStatus | undefined })} className="rounded-lg bg-surface px-2 py-1">
              <option value="">—</option>
              <option value="equilibre">Équilibrée</option>
              <option value="desequilibre">Déséquilibrée</option>
              <option value="bas">Basse</option>
              <option value="faible">Faible</option>
            </select>
          </label>
          <label className="col-span-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(w?.sick)} onChange={(e) => save({ sick: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />
            Rhume / malade
          </label>
        </div>
      )}
    </Card>
  );
}

function MiniNumber({ label, value, onChange, step = 1 }: { label: string; value?: number; onChange: (v: number | undefined) => void; step?: number }) {
  return (
    <label className="flex flex-col rounded-xl bg-surface-2 p-2 text-center">
      <span className="text-[11px] text-muted">{label}</span>
      <input inputMode="decimal" step={step} type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="num w-full bg-transparent text-center text-lg font-semibold outline-none" />
    </label>
  );
}

function RaceCard({ ctx }: { ctx: CoachContext }) {
  const r = ctx.nextRace;
  if (!r) return null;
  const days = differenceInCalendarDays(parseISO(r.date), parseISO(ctx.today));
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Prochaine course A</Eyebrow>
          <h2 className="mt-1 text-xl">{r.name}</h2>
          <p className="num text-sm text-muted">{r.distanceKm} km{r.elevationGainM ? ` · ${r.elevationGainM} m D+` : ''} · {format(parseISO(r.date), 'd MMM', { locale: frCA })}</p>
        </div>
        <div className="text-right">
          <p className="num text-4xl font-semibold tracking-tight text-accent">{days}</p>
          <p className="text-xs text-muted">{days === 1 ? 'jour' : 'jours'}</p>
        </div>
      </div>
      {r.profile && <ElevationProfile points={r.profile} className="mt-4 h-20 w-full" />}
    </Card>
  );
}

function Glance({ athlete, ctx }: { athlete: Athlete; ctx: CoachContext }) {
  const target = ctx.week;
  const trend = ctx.hrRestTrend;
  const delta = trend.length >= 2 ? trend.at(-1)! - athlete.hrRest : 0;
  return (
    <Card>
      <Eyebrow>En un coup d'œil</Eyebrow>
      <div className="mt-4 flex flex-wrap items-center justify-around gap-4">
        <Ring value={ctx.weekDone.km} max={target?.targetKm ?? 40} label={target ? `Volume / ${target.targetKm} km` : 'Volume'} display={`${Math.round(ctx.weekDone.km)} km`} />
        {(target?.targetElevationM ?? 0) > 0 && <Ring value={ctx.weekDone.gain} max={target!.targetElevationM} label={`D+ / ${target!.targetElevationM} m`} display={`${Math.round(ctx.weekDone.gain)}`} color="var(--z3)" />}
        <Ring value={ctx.weekDone.keys} max={Math.max(1, target?.keySessions ?? 1)} label="Séances clés" display={`${ctx.weekDone.keys}/${target?.keySessions ?? 0}`} color="var(--ok)" />
        <AcwrGauge result={ctx.acwr} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xs text-muted">Sommeil</p>
          <p className="num text-lg font-semibold">{ctx.lastSleep ? `${ctx.lastSleep} h` : '—'}</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xs text-muted">FC repos (base {athlete.hrRest})</p>
          <p className={cn('num text-lg font-semibold', delta >= 5 ? 'text-danger' : delta >= 3 ? 'text-warn' : '')}>{trend.at(-1) ?? '—'}{trend.length >= 2 && <span className="text-xs text-muted"> {delta >= 0 ? '+' : ''}{delta}</span>}</p>
        </div>
      </div>
      <Why className="mt-3">{ctx.acwr.explanation.title}. {ctx.acwr.explanation.why}</Why>
    </Card>
  );
}

function AfterRace({ athlete, ctx }: { athlete: Athlete; ctx: CoachContext }) {
  const navigate = useNavigate();
  const race = ctx.race!;
  const recovery = generateRecovery({ date: race.date, distanceKm: race.distanceKm }, ctx.block?.peakVolumeKm ?? 40);
  return (
    <Card className="bg-surface-2">
      <Eyebrow>{race.name}</Eyebrow>
      <h2 className="mt-2 text-3xl">C'est fait. Bravo.</h2>
      <p className="mt-2 text-muted">
        Prochaine étape : {recovery.length} semaine{recovery.length > 1 ? 's' : ''} de récupération ({recovery.map((w) => `${w.targetKm} km`).join(', ')}), puis un nouvel objectif.
        Les fibres et les tendons réparent, même si tu te sens bien.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => navigate('/objectif')}>Nouvel objectif</Button>
        <Button variant="secondary" onClick={() => createRecoveryPlan(db, athlete, race, ctx.block?.peakVolumeKm ?? 40, ctx.today)}>Récup d'abord</Button>
      </div>
      <Why className="mt-3">Récupération post-course : reprise inversée (Z1 courtes, beaucoup de repos), pas de qualité avant la fin de la récup. Durée selon la distance courue.</Why>
    </Card>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Chargement">
      <div className="h-10 w-48 animate-pulse rounded-lg bg-surface" />
      <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-surface" />
      <div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-surface" />
    </div>
  );
}
