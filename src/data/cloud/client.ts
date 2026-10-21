import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RemoteRow, SyncRemote } from '../sync';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase non configuré (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).');
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

/** Le serveur de synchro, vu par le moteur de src/data/sync.ts. */
export function supabaseRemote(sb: SupabaseClient, userId: string): SyncRemote {
  return {
    async push(rows: RemoteRow[]) {
      const { error } = await sb.rpc('push_records', { p_rows: rows });
      if (error) throw new Error(error.message);
    },
    async pull(afterSeq: number, limit: number) {
      // Filtre sur owner obligatoire : un coach a aussi le droit de lire les lignes de ses athlètes.
      const { data, error } = await sb
        .from('records')
        .select('tbl, id, athlete_id, data, updated_at, deleted, seq')
        .eq('owner', userId)
        .gt('seq', afterSeq)
        .order('seq', { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as (RemoteRow & { seq: number })[];
    },
  };
}
