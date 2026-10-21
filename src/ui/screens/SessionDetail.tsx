import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, parseISO } from 'date-fns';
import { frCA } from 'date-fns/locale';
import { SESSION_LIBRARY } from '@/engine';
import { db } from '@/data/db';
import { setSessionStatus } from '@/data/log';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { EmptyState } from '@/ui/components/EmptyState';
import { QuickLogSheet } from '@/ui/components/QuickLogSheet';
import { StepList } from '@/ui/components/StepList';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { formatMinutes, sessionColor } from '@/ui/lib/sessionStyle';

export function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const athlete = useActiveAthlete();
  const session = useLiveQuery(() => (id ? db.sessions.get(id) : undefined), [id], null);
  const block = useLiveQuery(async () => (session ? db.weeks.get(session.weekId).then((w) => (w ? db.blocks.get(w.blockId) : undefined)) : undefined), [session?.weekId]);
  const [logOpen, setLogOpen] = useState(false);
  if (session === null || !athlete) return null;
  if (!session) return <EmptyState title="Séance introuvable" action={<Link to="/plan" className="underline">Retour au plan</Link>} />;

  const info = SESSION_LIBRARY[session.type];
  const trail = ['trail_court', 'trail_moyen', 'ultra'].includes(block?.goal ?? '');
  return (
    <div className="space-y-5">
      <button type="button" onClick={() => navigate(-1)} className="text-sm text-muted hover:text-text">← Retour</button>
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: sessionColor(session.type) }} />
          <Eyebrow>{info.label} · {format(parseISO(session.date), 'EEEE d MMMM', { locale: frCA })}</Eyebrow>
        </div>
        <h1 className="text-3xl font-semibold leading-tight">{session.title}</h1>
        <p className="text-lg text-muted">{session.why}</p>
        <p className="num text-sm">
          {session.durationMin > 0 && formatMinutes(session.durationMin)}{session.distanceKm ? ` · ${session.distanceKm} km` : ''}{session.elevationGainM ? ` · ${session.elevationGainM} m D+` : ''}{session.rpeTarget ? ` · RPE ${session.rpeTarget}/10` : ''}
          {session.isKey && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">séance clé</span>}
        </p>
      </header>

      {session.steps.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xl">Structure</h2>
          <StepList steps={session.steps} athlete={athlete} trail={trail} />
        </section>
      )}
      {session.type.startsWith('muscu') || session.type === 'plyo' ? (
        <Card><p className="text-sm">{info.prescription}</p><Link to="/muscu" className="mt-3 inline-block text-sm underline underline-offset-4">Ouvrir le logger de muscu</Link></Card>
      ) : null}

      <Card className="space-y-4">
        <Fiche title="Pourquoi ça marche" text={`${info.why} ${info.adaptations}`} />
        <Fiche title="Le signe que ça fonctionne" text={info.signWorks} />
        <Fiche title="L'erreur classique" text={info.classicMistake} />
      </Card>

      {session.minimal && session.type !== 'repos' && (
        <Card>
          <Eyebrow>Version minimale viable</Eyebrow>
          <p className="mt-2 font-medium">{session.minimal.title}</p>
          <p className="mt-1 text-sm text-muted">Pour les jours où la vie gagne. Une séance raccourcie vaut toujours mieux qu'une séance sautée.</p>
        </Card>
      )}
      {session.adjustments.length > 0 && (
        <Card>
          <Eyebrow>Ajustements</Eyebrow>
          <ul className="mt-2 space-y-2 text-sm">{session.adjustments.map((a, i) => <li key={i}><strong>{a.title}.</strong> <span className="text-muted">{a.why}</span></li>)}</ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {session.status === 'faite' ? (
          session.activityId && <Button onClick={() => navigate(`/activite/${session.activityId}`)}>Voir le debrief</Button>
        ) : session.type !== 'repos' && (
          <>
            <Button onClick={() => setLogOpen(true)}>C'est fait</Button>
            <Button variant="secondary" onClick={() => navigate('/importer')}>Importer de Garmin</Button>
            {session.status === 'sautee'
              ? <Button variant="ghost" onClick={() => setSessionStatus(db, session.id, 'prevue')}>Remettre au plan</Button>
              : <Button variant="ghost" onClick={() => setSessionStatus(db, session.id, 'sautee')}>Sauter</Button>}
          </>
        )}
      </div>
      {session.status === 'sautee' && <p className="text-sm text-muted">Séance sautée. Aucune culpabilité : le plan continue normalement, sans rattrapage.</p>}
      <QuickLogSheet open={logOpen} onClose={() => setLogOpen(false)} athlete={athlete} session={session} date={session.date} />
    </div>
  );
}

function Fiche({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h3 className="font-display text-lg">{title}</h3>
      <p className="mt-1 text-muted">{text}</p>
    </div>
  );
}
