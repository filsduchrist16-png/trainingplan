import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatDistanceToNow } from 'date-fns';
import { frCA } from 'date-fns/locale';
import { db } from '@/data/db';
import type { Profile } from '@/data/cloud/session';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { useIsDemo } from '@/ui/hooks/useAthlete';
import { useCloudModule, useCloudState } from '@/ui/hooks/useCloud';
import { cn } from '@/ui/lib/cn';

type Msg = { kind: 'ok' | 'error'; text: string } | null;
export type Mode = 'signin' | 'signup' | 'reset';

const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;

/** Carte « Compte » des Réglages : connexion, synchro, partage. Affichée seulement si Supabase est configuré. */
export function Account() {
  const mod = useCloudModule();
  const cloud = useCloudState(mod);

  if (!mod || !cloud.ready) {
    return (
      <Card>
        <Eyebrow>Compte</Eyebrow>
        <p className="mt-2 text-sm text-muted">Chargement…</p>
      </Card>
    );
  }
  if (cloud.session && cloud.recovery) return <NewPassword mod={mod} />;
  if (cloud.session) return <SignedIn mod={mod} userId={cloud.session.user.id} email={cloud.session.user.email ?? ''} />;
  return <SignedOut mod={mod} />;
}

export type Mod = NonNullable<ReturnType<typeof useCloudModule>>;

function SignedOut({ mod }: { mod: Mod }) {
  return (
    <Card className="space-y-4">
      <div>
        <Eyebrow>Compte</Eyebrow>
        <p className="mt-2 text-sm text-muted">
          Optionnel. Un compte synchronise tes plans entre tes appareils, te permet d'avoir un coach et de partager tes courses avec tes amis.
        </p>
      </div>
      <AuthForm mod={mod} />
    </Card>
  );
}

/** Formulaire connexion / inscription / mot de passe oublié (Réglages et écran de connexion). */
export function AuthForm({ mod, initialMode = 'signin' }: { mod: Mod; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [form, setForm] = useState({ email: '', password: '', username: '', displayName: '', consent: false });
  const hasLocalData = useLiveQuery(async () => (await db.athletes.filter((a) => a.id !== 'demo-athlete').count()) > 0, [], false);
  const field = (k: keyof typeof form) => ({
    value: String(form[k]),
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await mod.signIn(form.email.trim(), form.password);
      } else if (mode === 'reset') {
        await mod.sendPasswordReset(form.email.trim());
        setMsg({ kind: 'ok', text: 'Courriel envoyé. Clique le lien reçu pour choisir un nouveau mot de passe.' });
      } else {
        const needsConfirm = await mod.signUp({ email: form.email.trim(), password: form.password, username: form.username.trim(), displayName: form.displayName.trim() });
        setMsg({ kind: 'ok', text: needsConfirm ? 'Compte créé! Confirme ton courriel avec le lien reçu, puis connecte-toi.' : 'Compte créé, bienvenue!' });
      }
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const usernameInvalid = mode === 'signup' && form.username !== '' && !USERNAME_RE.test(form.username.trim().toLowerCase());

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Connexion ou inscription" className="grid grid-cols-2 gap-2">
        {(
          [
            ['signin', 'Se connecter'],
            ['signup', 'Créer un compte'],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m || (m === 'signin' && mode === 'reset')}
            onClick={() => {
              setMode(m);
              setMsg(null);
            }}
            className={cn('h-10 rounded-full border text-sm transition', mode === m || (m === 'signin' && mode === 'reset') ? 'border-accent bg-accent/15 text-text' : 'border-line text-muted hover:text-text')}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        {mode === 'signup' && (
          <>
            <Field label="Nom affiché" autoComplete="nickname" required maxLength={60} {...field('displayName')} />
            <Field
              label="Nom d'utilisateur"
              hint="3 à 24 caractères : lettres minuscules, chiffres, « _ » ou « . ». Tes amis te trouvent avec."
              autoComplete="username"
              autoCapitalize="none"
              required
              invalid={usernameInvalid}
              {...field('username')}
            />
          </>
        )}
        <Field label="Courriel" type="email" autoComplete="email" autoCapitalize="none" required {...field('email')} />
        {mode !== 'reset' && (
          <Field
            label="Mot de passe"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={mode === 'signup' ? 8 : undefined}
            hint={mode === 'signup' ? 'Au moins 8 caractères.' : undefined}
            required
            {...field('password')}
          />
        )}

        {mode === 'signup' && (
          <>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                required
                checked={form.consent}
                onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
                className="mt-1 size-4 accent-[var(--accent)]"
              />
              <span className="text-muted">
                J'accepte que mes données d'entraînement et de santé (activités, fréquence cardiaque, douleurs, sommeil) soient stockées sur le serveur de Sentier pour la synchro. Elles sont privées par défaut ; je choisis ce que je partage et je peux supprimer mon compte et toutes mes données en tout temps.
              </span>
            </label>
            {hasLocalData && <p className="text-sm text-muted">Les données déjà sur cet appareil seront envoyées dans ton nouveau compte.</p>}
          </>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || usernameInvalid}>
            {busy ? '…' : mode === 'signin' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Envoyer le lien'}
          </Button>
          {mode === 'signin' && (
            <button type="button" className="text-sm text-muted underline underline-offset-4" onClick={() => setMode('reset')}>
              Mot de passe oublié?
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" className="text-sm text-muted underline underline-offset-4" onClick={() => setMode('signin')}>
              Retour
            </button>
          )}
        </div>
      </form>
      <Status msg={msg} />
    </div>
  );
}

function SignedIn({ mod, userId, email }: { mod: Mod; userId: string; email: string }) {
  const cloud = useCloudState(mod);
  const isDemo = useIsDemo();
  const last = useLiveQuery(async () => (await db.meta.get('sync.lastSyncAt'))?.value as string | undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    mod.getProfile(userId).then(setProfile, (e: Error) => setMsg({ kind: 'error', text: e.message }));
  }, [mod, userId]);

  async function setShare(level: Profile['share_level']) {
    if (!profile) return;
    const prev = profile;
    setProfile({ ...profile, share_level: level });
    try {
      await mod.updateProfile(userId, { share_level: level });
    } catch (e) {
      setProfile(prev);
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  }

  async function onDelete() {
    const typed = prompt('Ça supprime ton compte et TOUTES tes données sur le serveur et sur cet appareil. Fais un backup avant si tu veux les garder.\n\nÉcris SUPPRIMER pour confirmer.');
    if (typed?.trim().toUpperCase() !== 'SUPPRIMER') return;
    try {
      await mod.deleteAccount();
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  }

  const syncLabel =
    cloud.sync === 'syncing'
      ? 'Synchro en cours…'
      : cloud.sync === 'offline'
        ? 'Hors-ligne : la synchro reprendra toute seule.'
        : cloud.sync === 'error'
          ? `Synchro en échec : ${cloud.error}`
          : last
            ? `Synchronisé ${formatDistanceToNow(new Date(last), { addSuffix: true, locale: frCA })}.`
            : 'Pas encore synchronisé.';

  return (
    <Card className="space-y-4">
      <div>
        <Eyebrow>Compte</Eyebrow>
        <p className="mt-2 font-medium">{profile ? `${profile.display_name} · @${profile.username}` : email}</p>
        <p className="text-sm text-muted">{email}</p>
      </div>

      <div className="space-y-2">
        <p role="status" className={cn('text-sm', cloud.sync === 'error' ? 'text-danger' : 'text-muted')}>
          {syncLabel}
        </p>
        {isDemo && <p className="text-sm text-muted">Les données de démo restent sur cet appareil : elles ne sont jamais synchronisées.</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={cloud.sync === 'syncing'} onClick={() => void mod.syncNow()}>
            Synchroniser maintenant
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void mod.signOut()}>
            Se déconnecter
          </Button>
        </div>
      </div>

      {profile && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Qui voit mes courses et sorties?</p>
          <div role="radiogroup" aria-label="Partage" className="grid grid-cols-3 gap-2">
            {(
              [
                ['private', 'Personne'],
                ['friends', 'Mes amis'],
                ['public', 'Tout le monde'],
              ] as [Profile['share_level'], string][]
            ).map(([value, label]) => (
              <button
                key={value}
                role="radio"
                aria-checked={profile.share_level === value}
                onClick={() => void setShare(value)}
                className={cn('h-10 rounded-full border text-sm transition', profile.share_level === value ? 'border-accent bg-accent/15 text-text' : 'border-line text-muted hover:text-text')}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            On partage seulement un résumé (nom, date, distance, durée, dénivelé, résultat). Jamais ta fréquence cardiaque, tes douleurs ni tes notes. Ton coach, lui, voit tout.
          </p>
        </div>
      )}

      <button type="button" onClick={() => void onDelete()} className="text-sm text-danger underline underline-offset-4">
        Supprimer mon compte et mes données
      </button>
      <Status msg={msg} />
    </Card>
  );
}

export function NewPassword({ mod }: { mod: Mod }) {
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await mod.updatePassword(password);
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    }
  }
  return (
    <Card className="space-y-3">
      <Eyebrow>Nouveau mot de passe</Eyebrow>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Nouveau mot de passe" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit">Enregistrer</Button>
      </form>
      <Status msg={msg} />
    </Card>
  );
}

function Field({ label, hint, invalid, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; invalid?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        {...props}
        aria-invalid={invalid || undefined}
        className={cn('h-11 w-full rounded-xl border bg-surface-2 px-3 text-text outline-none transition focus:border-accent', invalid ? 'border-danger' : 'border-line', className)}
      />
      {hint && <span className={cn('block text-xs', invalid ? 'text-danger' : 'text-muted')}>{hint}</span>}
    </label>
  );
}

function Status({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role="status" className={cn('text-sm', msg.kind === 'ok' ? 'text-ok' : 'text-danger')}>
      {msg.text}
    </p>
  );
}
