import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { format, parseISO } from 'date-fns';
import { frCA } from 'date-fns/locale';
import * as social from '@/data/cloud/social';
import type { FeedItem, Friend } from '@/data/cloud/social';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { useCloudModule, useCloudState } from '@/ui/hooks/useCloud';
import { cn } from '@/ui/lib/cn';

/** Écran Communauté : fil des amis, fil public, gestion des amis. Nécessite un compte. */
export function Community() {
  const mod = useCloudModule();
  const cloud = useCloudState(mod);
  const me = cloud.session?.user.id;

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Communauté</h1>
      {!mod || !cloud.ready ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : !me ? (
        <SignInFirst what="voir les courses de tes amis" />
      ) : (
        <>
          <Feed />
          <Friends me={me} />
        </>
      )}
    </div>
  );
}

export function SignInFirst({ what }: { what: string }) {
  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">Il faut un compte pour {what}. C'est gratuit et optionnel.</p>
      <Link to="/plus" className="inline-block text-sm underline underline-offset-4">
        Créer un compte ou me connecter
      </Link>
    </Card>
  );
}

function Feed() {
  const [scope, setScope] = useState<'friends' | 'public'>('friends');
  return (
    <section className="space-y-3" aria-label="Fil">
      <div role="tablist" aria-label="Fil" className="grid grid-cols-2 gap-2">
        {(
          [
            ['friends', 'Mes amis'],
            ['public', 'Tout le monde'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={scope === value}
            onClick={() => setScope(value)}
            className={cn('h-10 rounded-full border text-sm transition', scope === value ? 'border-accent bg-accent/15 text-text' : 'border-line text-muted hover:text-text')}
          >
            {label}
          </button>
        ))}
      </div>
      {/* key : changer d'onglet repart d'un état vierge (chargement) */}
      <FeedList key={scope} scope={scope} />
    </section>
  );
}

function FeedList({ scope }: { scope: 'friends' | 'public' }) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    social.communityFeed(scope).then(
      (r) => alive && setItems(r),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [scope]);

  return (
    <>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!items && !error && <p className="text-sm text-muted">Chargement…</p>}
      {items?.length === 0 && (
        <Card>
          <p className="text-sm text-muted">
            {scope === 'friends'
              ? "Rien à voir pour l'instant. Ajoute des amis plus bas : leurs courses et sorties apparaîtront ici s'ils les partagent."
              : 'Personne ne partage publiquement pour le moment.'}
          </p>
        </Card>
      )}
      <ul className="space-y-3">
        {items?.map((it) => (
          <li key={`${it.owner}:${it.kind}:${it.record_id}`}>
            <FeedCard item={it} />
          </li>
        ))}
      </ul>
    </>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  const s = item.summary;
  const race = item.kind === 'races';
  const facts = [
    s.distanceKm != null && `${Number(s.distanceKm).toFixed(1).replace('.', ',')} km`,
    s.elevationGainM ? `${Math.round(Number(s.elevationGainM))} m D+` : null,
    !race && s.durationSec ? duration(Number(s.durationSec)) : null,
    race && s.resultTimeMin ? `Résultat ${duration(Number(s.resultTimeMin) * 60)}` : null,
  ].filter(Boolean);
  return (
    <Card className="flex gap-3">
      <div aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 font-semibold">
        {item.display_name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm">
          <span className="font-medium">{item.display_name}</span> <span className="text-muted">@{item.username}</span>
        </p>
        <p className="font-medium">
          {race ? '🏁 ' : ''}
          {s.name || (race ? 'Course' : 'Sortie')}
          {race && s.priority ? <span className="ml-2 text-xs text-muted">course {s.priority}</span> : null}
        </p>
        <p className="text-sm text-muted">
          {item.day ? format(parseISO(item.day), 'EEE d MMM yyyy', { locale: frCA }) : ''}
          {s.location ? ` · ${s.location}` : ''}
        </p>
        {facts.length > 0 && <p className="text-sm">{facts.join(' · ')}</p>}
      </div>
    </Card>
  );
}

function duration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

function Friends({ me }: { me: string }) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [username, setUsername] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const reload = useCallback(() => {
    social.listFriends(me).then(setFriends, (e: Error) => setMsg({ kind: 'error', text: e.message }));
  }, [me]);
  useEffect(reload, [reload]);

  async function run(action: () => Promise<unknown>, ok?: string) {
    setMsg(null);
    try {
      await action();
      if (ok) setMsg({ kind: 'ok', text: ok });
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    await run(async () => {
      const status = await social.requestFriend(name);
      setUsername('');
      setMsg({ kind: 'ok', text: status === 'accepted' ? 'Vous êtes maintenant amis!' : 'Demande envoyée.' });
    });
  }

  const incoming = friends?.filter((f) => f.status === 'pending' && f.incoming) ?? [];
  const outgoing = friends?.filter((f) => f.status === 'pending' && !f.incoming) ?? [];
  const accepted = friends?.filter((f) => f.status === 'accepted') ?? [];

  return (
    <Card className="space-y-4">
      <Eyebrow>Amis</Eyebrow>
      <form onSubmit={onAdd} className="flex gap-2">
        <label className="sr-only" htmlFor="friend-username">
          Nom d'utilisateur
        </label>
        <input
          id="friend-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="@nom_utilisateur"
          autoCapitalize="none"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 outline-none focus:border-accent"
        />
        <Button type="submit">Ajouter</Button>
      </form>
      {msg && (
        <p role="status" className={cn('text-sm', msg.kind === 'ok' ? 'text-ok' : 'text-danger')}>
          {msg.text}
        </p>
      )}

      {incoming.length > 0 && (
        <List title="Demandes reçues">
          {incoming.map((f) => (
            <Row key={f.id} f={f}>
              <Button size="sm" onClick={() => void run(() => social.acceptFriend(me, f.id))}>
                Accepter
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void run(() => social.removeFriend(me, f.id))}>
                Refuser
              </Button>
            </Row>
          ))}
        </List>
      )}
      {accepted.length > 0 && (
        <List title="Mes amis">
          {accepted.map((f) => (
            <Row key={f.id} f={f}>
              <Button size="sm" variant="ghost" onClick={() => confirm(`Retirer ${f.display_name} de tes amis?`) && void run(() => social.removeFriend(me, f.id))}>
                Retirer
              </Button>
            </Row>
          ))}
        </List>
      )}
      {outgoing.length > 0 && (
        <List title="En attente">
          {outgoing.map((f) => (
            <Row key={f.id} f={f}>
              <Button size="sm" variant="ghost" onClick={() => void run(() => social.removeFriend(me, f.id))}>
                Annuler
              </Button>
            </Row>
          ))}
        </List>
      )}
      {friends?.length === 0 && <p className="text-sm text-muted">Pas encore d'amis. Demande-leur leur nom d'utilisateur!</p>}
      <p className="text-xs text-muted">
        Ce que tes amis voient de toi dépend de ton réglage de partage dans <Link to="/plus" className="underline">Plus → Compte</Link>.
      </p>
    </Card>
  );
}

function List({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function Row({ f, children }: { f: Friend; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-sm">
        {f.display_name} <span className="text-muted">@{f.username}</span>
      </span>
      <span className="flex shrink-0 gap-1">{children}</span>
    </li>
  );
}
