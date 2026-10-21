import type { Activity, PainLog, Race, Wellness } from '@/engine/types';
import { supabase } from './client';
import type { Profile } from './session';

/**
 * Coach, amis et communauté : lecture en ligne directe (pas de copie locale).
 * Les droits sont appliqués côté serveur (RLS + fonctions de supabase/migrations).
 */

type PublicProfile = Pick<Profile, 'id' | 'username' | 'display_name'>;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(translate(error.message));
}

function translate(msg: string): string {
  if (msg.includes('code coach inconnu')) return 'Code coach inconnu. Vérifie avec ton coach.';
  if (msg.includes('propre coach')) return 'Tu ne peux pas être ton propre coach.';
  if (msg.includes('utilisateur introuvable')) return "Personne avec ce nom d'utilisateur.";
  if (msg.includes("c'est toi")) return "C'est toi, ça!";
  return msg;
}

async function profilesById(ids: string[]): Promise<Map<string, PublicProfile>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase().from('profiles').select('id, username, display_name').in('id', ids);
  fail(error);
  return new Map((data ?? []).map((p) => [p.id as string, p as PublicProfile]));
}

// ─── Communauté ──────────────────────────────────────────────────────────────

export interface FeedItem {
  owner: string;
  username: string;
  display_name: string;
  kind: 'activities' | 'races';
  record_id: string;
  day: string;
  summary: {
    name?: string | null;
    sport?: string | null;
    distanceKm?: number | null;
    durationSec?: number | null;
    elevationGainM?: number | null;
    terrain?: string | null;
    priority?: string | null;
    location?: string | null;
    resultTimeMin?: number | null;
  };
}

export async function communityFeed(scope: 'friends' | 'public', before?: string): Promise<FeedItem[]> {
  const { data, error } = await supabase().rpc('community_feed', { p_scope: scope, p_limit: 30, p_before: before ?? null });
  fail(error);
  return (data ?? []) as FeedItem[];
}

// ─── Amis ────────────────────────────────────────────────────────────────────

export interface Friend extends PublicProfile {
  status: 'pending' | 'accepted';
  /** true si c'est l'autre qui m'a fait la demande (je peux l'accepter). */
  incoming: boolean;
}

export async function listFriends(me: string): Promise<Friend[]> {
  const { data, error } = await supabase().from('friendships').select('requester, addressee, status');
  fail(error);
  const rows = (data ?? []) as { requester: string; addressee: string; status: Friend['status'] }[];
  const others = rows.map((r) => (r.requester === me ? r.addressee : r.requester));
  const profiles = await profilesById(others);
  return rows
    .map((r, i) => {
      const p = profiles.get(others[i]!);
      return p ? { ...p, status: r.status, incoming: r.addressee === me } : null;
    })
    .filter((f): f is Friend => f !== null)
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'fr'));
}

/** 'accepted' si l'autre m'avait déjà demandé, sinon 'pending'. */
export async function requestFriend(username: string): Promise<'accepted' | 'pending'> {
  const { data, error } = await supabase().rpc('request_friend', { p_username: username.replace(/^@/, '') });
  fail(error);
  return data as 'accepted' | 'pending';
}

export async function acceptFriend(me: string, requester: string): Promise<void> {
  const { error } = await supabase().from('friendships').update({ status: 'accepted' }).eq('requester', requester).eq('addressee', me);
  fail(error);
}

export async function removeFriend(me: string, other: string): Promise<void> {
  const { error } = await supabase()
    .from('friendships')
    .delete()
    .or(`and(requester.eq.${me},addressee.eq.${other}),and(requester.eq.${other},addressee.eq.${me})`);
  fail(error);
}

// ─── Coach ───────────────────────────────────────────────────────────────────

export async function myCoachCode(): Promise<string | null> {
  const { data, error } = await supabase().from('coach_codes').select('code').maybeSingle();
  fail(error);
  return (data?.code as string | undefined) ?? null;
}

export async function regenerateCoachCode(): Promise<string> {
  const { data, error } = await supabase().rpc('regenerate_coach_code');
  fail(error);
  return data as string;
}

export async function addCoach(code: string): Promise<void> {
  const { error } = await supabase().rpc('add_coach', { p_code: code });
  fail(error);
}

/** Mes coachs (côté athlète) ou mes athlètes (côté coach). */
export async function listLinks(me: string, side: 'coaches' | 'athletes'): Promise<PublicProfile[]> {
  const mine = side === 'coaches' ? 'athlete' : 'coach';
  const other = side === 'coaches' ? 'coach' : 'athlete';
  const { data, error } = await supabase().from('coach_links').select('athlete, coach').eq(mine, me);
  fail(error);
  const ids = (data ?? []).map((r) => r[other] as string);
  const profiles = await profilesById(ids);
  return ids.map((id) => profiles.get(id)).filter((p): p is PublicProfile => Boolean(p));
}

export async function removeLink(athlete: string, coach: string): Promise<void> {
  const { error } = await supabase().from('coach_links').delete().eq('athlete', athlete).eq('coach', coach);
  fail(error);
}

export interface AthleteView {
  profile: PublicProfile | null;
  races: Race[];
  activities: Activity[];
  painLogs: PainLog[];
  wellness: Wellness[];
}

/** Données d'un athlète, en lecture seule (la RLS refuse si je ne suis pas son coach). */
export async function athleteView(athleteUserId: string): Promise<AthleteView> {
  const sb = supabase();
  const read = async <T>(tbl: string, limit: number): Promise<T[]> => {
    const { data, error } = await sb
      .from('records')
      .select('data')
      .eq('owner', athleteUserId)
      .eq('tbl', tbl)
      .eq('deleted', false)
      .order('data->>date', { ascending: false })
      .limit(limit);
    fail(error);
    return (data ?? []).map((r) => r.data as T);
  };
  const [profiles, races, activities, painLogs, wellness] = await Promise.all([
    profilesById([athleteUserId]),
    read<Race>('races', 20),
    read<Activity>('activities', 30),
    read<PainLog>('painLogs', 20),
    read<Wellness>('wellness', 14),
  ]);
  return { profile: profiles.get(athleteUserId) ?? null, races, activities, painLogs, wellness };
}
