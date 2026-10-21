import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { format, parseISO } from 'date-fns';
import { frCA } from 'date-fns/locale';
import * as social from '@/data/cloud/social';
import type { AthleteView } from '@/data/cloud/social';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { useCloudModule, useCloudState } from '@/ui/hooks/useCloud';
import { cn } from '@/ui/lib/cn';
import { SignInFirst } from './Community';

type People = Awaited<ReturnType<typeof social.listLinks>>;

/** Écran Coach : mon coach (côté athlète) et mes athlètes (côté coach). */
export function Coach() {
  const mod = useCloudModule();
  const cloud = useCloudState(mod);
  const me = cloud.session?.user.id;
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Coach</h1>
      {!mod || !cloud.ready ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : !me ? (
        <SignInFirst what="avoir un coach ou coacher des athlètes" />
      ) : (
        <>
          <MyCoach me={me} />
          <MyAthletes me={me} />
        </>
      )}
    </div>
  );
}

function useMsg() {
  return useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
}

function MyCoach({ me }: { me: string }) {
  const [coaches, setCoaches] = useState<People | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useMsg();
  const reload = useCallback(() => {
    social.listLinks(me, 'coaches').then(setCoaches, (e: Error) => setMsg({ kind: 'error', text: e.message }));
  }, [me, setMsg]);
  useEffect(reload, [reload]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    if (!confirm('Ton coach pourra voir TOUTES tes données : plan, activités, FC, douleurs, sommeil. Tu pourras retirer son accès en tout temps. On continue?')) return;
    try {
      await social.addCoach(code);
      setCode('');
      setMsg({ kind: 'ok', text: 'Coach ajouté.' });
      reload();
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    }
  }

  return (
    <Card className="space-y-3">
      <Eyebrow>Mon coach</Eyebrow>
      <p className="text-sm text-muted">Entre le code que ton coach te donne. Il pourra consulter ton plan et tes données, sans rien modifier.</p>
      {coaches?.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2">
          <span className="text-sm">
            {c.display_name} <span className="text-muted">@{c.username}</span>
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (!confirm(`Retirer l'accès de ${c.display_name}?`)) return;
              await social.removeLink(me, c.id).then(reload, (e: Error) => setMsg({ kind: 'error', text: e.message }));
            }}
          >
            Retirer l'accès
          </Button>
        </div>
      ))}
      <form onSubmit={onAdd} className="flex gap-2">
        <label className="sr-only" htmlFor="coach-code">
          Code du coach
        </label>
        <input
          id="coach-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CODE COACH"
          autoCapitalize="characters"
          maxLength={8}
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 font-mono tracking-widest outline-none focus:border-accent"
        />
        <Button type="submit">Ajouter</Button>
      </form>
      <Status msg={msg} />
    </Card>
  );
}

function MyAthletes({ me }: { me: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [athletes, setAthletes] = useState<People | null>(null);
  const [msg, setMsg] = useMsg();
  const reload = useCallback(() => {
    social.myCoachCode().then(setCode, (e: Error) => setMsg({ kind: 'error', text: e.message }));
    social.listLinks(me, 'athletes').then(setAthletes, (e: Error) => setMsg({ kind: 'error', text: e.message }));
  }, [me, setMsg]);
  useEffect(reload, [reload]);

  return (
    <Card className="space-y-3">
      <Eyebrow>Mes athlètes</Eyebrow>
      <p className="text-sm text-muted">Tu coaches quelqu'un? Donne-lui ce code ; il l'entre de son côté, puis il apparaît ici.</p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-xl bg-surface-2 px-4 py-2 font-mono text-lg tracking-widest">{code ?? '········'}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            if (!confirm("Nouveau code? L'ancien ne marchera plus (tes athlètes actuels restent liés).")) return;
            await social.regenerateCoachCode().then(setCode, (e: Error) => setMsg({ kind: 'error', text: e.message }));
          }}
        >
          Nouveau code
        </Button>
      </div>
      {athletes?.length === 0 && <p className="text-sm text-muted">Aucun athlète pour l'instant.</p>}
      <ul className="space-y-2">
        {athletes?.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2">
            <Link to={`/coach/${a.id}`} className="text-sm underline-offset-4 hover:underline">
              {a.display_name} <span className="text-muted">@{a.username}</span>
            </Link>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!confirm(`Arrêter de coacher ${a.display_name}?`)) return;
                await social.removeLink(a.id, me).then(reload, (e: Error) => setMsg({ kind: 'error', text: e.message }));
              }}
            >
              Retirer
            </Button>
          </li>
        ))}
      </ul>
      <Status msg={msg} />
    </Card>
  );
}

/** Vue lecture seule d'un athlète, pour son coach. */
export function CoachAthlete() {
  const { athleteId = '' } = useParams();
  const mod = useCloudModule();
  const cloud = useCloudState(mod);
  const [view, setView] = useState<AthleteView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cloud.session) return;
    social.athleteView(athleteId).then(setView, (e: Error) => setError(e.message));
  }, [athleteId, cloud.session]);

  const d = (iso: string) => format(parseISO(iso), 'd MMM yyyy', { locale: frCA });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <Link to="/coach" className="text-sm text-muted underline underline-offset-4">
        ← Mes athlètes
      </Link>
      <h1 className="text-3xl font-semibold">{view?.profile?.display_name ?? 'Athlète'}</h1>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!view && !error && <p className="text-sm text-muted">Chargement…</p>}
      {view && (
        <>
          <p className="text-sm text-muted">Lecture seule. Données à jour à la dernière synchro de l'athlète.</p>
          <Card className="space-y-2">
            <Eyebrow>Courses</Eyebrow>
            {view.races.length === 0 && <p className="text-sm text-muted">Aucune course.</p>}
            {view.races.map((r) => (
              <p key={r.id} className={cn('text-sm', r.date < today && 'text-muted')}>
                <span className="font-medium">{r.name}</span> · {d(r.date)} · {r.distanceKm} km, {r.elevationGainM} m D+ · course {r.priority}
                {r.result ? ` · résultat ${Math.floor(r.result.timeMin / 60)} h ${String(Math.round(r.result.timeMin % 60)).padStart(2, '0')}` : ''}
              </p>
            ))}
          </Card>
          <Card className="space-y-2">
            <Eyebrow>Douleurs récentes</Eyebrow>
            {view.painLogs.length === 0 && <p className="text-sm text-muted">Rien de signalé.</p>}
            {view.painLogs.map((p) => (
              <p key={p.id} className={cn('text-sm', p.intensity >= 4 && 'text-danger')}>
                {d(p.date)} · {p.zone} · {p.intensity}/10 ({p.when}){p.note ? ` · ${p.note}` : ''}
              </p>
            ))}
          </Card>
          <Card className="space-y-2">
            <Eyebrow>Dernières activités</Eyebrow>
            {view.activities.length === 0 && <p className="text-sm text-muted">Aucune activité.</p>}
            {view.activities.map((a) => (
              <p key={a.id} className="text-sm">
                {d(a.date)} · {a.name ?? a.sport} · {a.distanceKm.toFixed(1).replace('.', ',')} km · {Math.round(a.durationSec / 60)} min
                {a.elevationGainM ? ` · ${Math.round(a.elevationGainM)} m D+` : ''}
                {a.hrAvg ? ` · FC ${Math.round(a.hrAvg)}` : ''}
              </p>
            ))}
          </Card>
          <Card className="space-y-2">
            <Eyebrow>Forme (14 derniers jours)</Eyebrow>
            {view.wellness.length === 0 && <p className="text-sm text-muted">Pas de données.</p>}
            {view.wellness.map((w) => (
              <p key={w.id} className="text-sm">
                {d(w.date)}
                {w.sleepHours != null ? ` · sommeil ${w.sleepHours} h` : ''}
                {w.hrRest != null ? ` · FC repos ${w.hrRest}` : ''}
                {w.shortNight ? ' · nuit courte' : ''}
                {w.sick ? ' · malade' : ''}
              </p>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

function Status({ msg }: { msg: { kind: 'ok' | 'error'; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role="status" className={cn('text-sm', msg.kind === 'ok' ? 'text-ok' : 'text-danger')}>
      {msg.text}
    </p>
  );
}
