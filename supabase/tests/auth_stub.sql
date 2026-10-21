-- Imitation minimale de Supabase pour tester le schéma sur un Postgres nu (scripts/test-db.sh).
-- Pas à exécuter dans Supabase.
create role anon nologin;
create role authenticated nologin;
create schema auth;
grant usage on schema auth, public to anon, authenticated;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase donne ces droits par défaut ; la RLS fait le tri.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
