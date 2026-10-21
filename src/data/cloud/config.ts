/**
 * Comptes et synchro : actifs seulement si le build fournit les clés Supabase.
 * Sans elles, l'app reste 100 % locale (et n'embarque pas le client Supabase).
 * La clé publique (« publishable » / « anon ») est faite pour être dans le navigateur :
 * c'est la RLS de supabase/migrations qui protège les données.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
export const cloudConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
