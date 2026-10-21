import type { Session } from '@supabase/supabase-js';
import { db } from '../db';
import { attachOwner, clearSyncedData, onLocalChange, syncOnce } from '../sync';
import { supabase, supabaseRemote } from './client';

/**
 * État du compte et synchro automatique. Chargé à la demande (import dynamique) seulement si
 * Supabase est configuré, pour ne pas alourdir l'app locale.
 */

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline';

export interface CloudState {
  ready: boolean;
  session: Session | null;
  sync: SyncState;
  error: string | null;
  /** L'utilisateur arrive d'un lien « mot de passe oublié » : il doit en choisir un nouveau. */
  recovery: boolean;
}

let state: CloudState = { ready: false, session: null, sync: 'idle', error: null, recovery: false };
const subscribers = new Set<() => void>();

function set(patch: Partial<CloudState>) {
  state = { ...state, ...patch };
  for (const fn of subscribers) fn();
}

export const cloudStore = {
  get: () => state,
  subscribe(fn: () => void) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
};

let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Lance l'écoute de la session et la synchro automatique. Idempotent. */
export function startCloud(): void {
  if (started) return;
  started = true;
  const sb = supabase();

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') set({ recovery: true });
    set({ session, ready: true });
    // Hors du callback : supabase-js interdit d'attendre d'autres appels auth ici.
    if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) setTimeout(() => void syncNow(), 0);
  });

  onLocalChange(() => schedule(3000));
  window.addEventListener('online', () => schedule(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(500);
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') schedule(0);
  }, 5 * 60_000);
}

function schedule(ms: number) {
  if (!state.session) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

/** Synchro immédiate (bouton « Synchroniser »). Ne lance jamais d'exception : l'erreur va dans l'état. */
export async function syncNow(): Promise<void> {
  const session = state.session;
  if (!session) return;
  if (!navigator.onLine) return set({ sync: 'offline' });
  set({ sync: 'syncing', error: null });
  try {
    await attachOwner(db, session.user.id);
    await syncOnce(db, supabaseRemote(supabase(), session.user.id));
    set({ sync: 'idle' });
  } catch (e) {
    set({ sync: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

const redirectTo = () => `${location.origin}/plus`;

export async function signIn(email: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(translateAuthError(error.message));
}

/** Retourne true si un courriel de confirmation a été envoyé (session pas encore ouverte). */
export async function signUp(input: { email: string; password: string; username: string; displayName: string }) {
  const { data, error } = await supabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: { emailRedirectTo: redirectTo(), data: { username: input.username.toLowerCase(), display_name: input.displayName } },
  });
  if (error) throw new Error(translateAuthError(error.message));
  return !data.session;
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
  if (error) throw new Error(translateAuthError(error.message));
}

export async function updatePassword(password: string) {
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw new Error(translateAuthError(error.message));
  set({ recovery: false });
}

/** Dernière synchro, puis déconnexion et effacement des données de l'appareil (elles restent sur le serveur). */
export async function signOut() {
  await syncNow();
  if (state.sync === 'error' && !confirm("La dernière synchro a échoué : des changements récents pourraient être perdus. Se déconnecter quand même?")) return;
  await supabase().auth.signOut();
  await clearSyncedData(db);
}

/** Supprime le compte et TOUTES ses données côté serveur, puis sur l'appareil. */
export async function deleteAccount() {
  const { error } = await supabase().rpc('delete_my_account');
  if (error) throw new Error(error.message);
  await supabase().auth.signOut({ scope: 'local' });
  await clearSyncedData(db);
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  share_level: 'private' | 'friends' | 'public';
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase().from('profiles').select('id, username, display_name, share_level').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Profile | null;
}

export async function updateProfile(userId: string, patch: Partial<Pick<Profile, 'display_name' | 'share_level'>>) {
  const { error } = await supabase().from('profiles').update(patch).eq('id', userId);
  if (error) throw new Error(error.message);
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Courriel ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return "Confirme d'abord ton courriel (regarde tes indésirables).";
  if (m.includes('already registered')) return 'Un compte existe déjà avec ce courriel. Connecte-toi.';
  if (m.includes('password should be')) return 'Mot de passe trop faible : au moins 8 caractères.';
  if (m.includes('rate limit')) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  return msg;
}
