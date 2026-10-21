-- Sentier — schéma Supabase v1 : comptes, synchro, coach, communauté.
--
-- Principe : l'app reste local-first (IndexedDB). Chaque ligne locale est copiée telle quelle
-- dans `records` (une table générique, données en jsonb). La synchro est « la dernière modif gagne »
-- sur `updated_at` (horodatage client). Ajouter une table côté app ne demande aucune migration ici.
--
-- Sécurité : RLS partout. Par défaut on ne voit QUE ses propres données.
--   - Un coach lit (sans modifier) toutes les données d'un athlète qui a entré son code coach.
--   - Les amis / la communauté ne voient jamais `records` directement : seulement un résumé
--     (courses et sorties, sans FC ni notes) via `community_feed`, et seulement si l'auteur partage.
--
-- À exécuter une fois dans Supabase → SQL Editor (voir docs/SUPABASE.md).

-- ─── Profils ──────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  -- Qui voit mes courses et sorties dans l'onglet communauté.
  share_level text not null default 'private' check (share_level in ('private', 'friends', 'public')),
  created_at timestamptz not null default now()
);

-- Code à donner à son coach. Table séparée : personne d'autre ne doit pouvoir le lire.
create table public.coach_codes (
  user_id uuid primary key references auth.users on delete cascade,
  code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8))
);

-- Profil + code créés à l'inscription (username et display_name passés dans les métadonnées du signUp).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  wanted text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  uname text;
begin
  if wanted ~ '^[a-z0-9_.]{3,24}$' and not exists (select 1 from public.profiles where username = wanted) then
    uname := wanted;
  else
    uname := 'coureur_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, uname, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), uname));
  insert into public.coach_codes (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Relations : coach et amis ────────────────────────────────────────────────

-- L'athlète crée le lien (il entre le code de son coach) : c'est lui qui consent.
create table public.coach_links (
  athlete uuid not null references auth.users on delete cascade,
  coach uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (athlete, coach),
  check (athlete <> coach)
);

create table public.friendships (
  requester uuid not null references auth.users on delete cascade,
  addressee uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

create function public.is_coach_of(p_athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coach_links where athlete = p_athlete and coach = (select auth.uid()));
$$;

create function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

-- ─── Données synchronisées ────────────────────────────────────────────────────

create sequence public.records_seq;

create table public.records (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  tbl text not null check (tbl ~ '^[a-zA-Z]{1,40}$'),
  id text not null check (char_length(id) between 1 and 100),
  athlete_id text,
  data jsonb not null,
  updated_at timestamptz not null,             -- horodatage client : arbitre des conflits
  deleted boolean not null default false,      -- pierre tombale : la suppression se synchronise aussi
  seq bigint not null default nextval('public.records_seq'), -- curseur de « pull », croissant à chaque écriture
  primary key (owner, tbl, id),
  check (pg_column_size(data) < 512000)
);

create index records_owner_seq on public.records (owner, seq);
create index records_feed on public.records (tbl, owner) where not deleted;

create function public.records_bump_seq() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.seq := nextval('public.records_seq');
  return new;
end $$;

create trigger records_bump_seq before update on public.records
  for each row execute function public.records_bump_seq();

-- Envoi d'un lot de lignes. « La dernière modif gagne » : une ligne plus vieille que celle du serveur
-- est ignorée, ce qui rend l'envoi idempotent (renvoyer deux fois le même lot ne change rien).
-- security invoker : la RLS s'applique, on ne peut écrire que sous son propre `owner`.
create function public.push_records(p_rows jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  n integer;
begin
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'lot trop gros (max 500 lignes)';
  end if;
  insert into public.records as r (owner, tbl, id, athlete_id, data, updated_at, deleted)
  select (select auth.uid()), x.tbl, x.id, x.athlete_id, coalesce(x.data, '{}'::jsonb), x.updated_at, coalesce(x.deleted, false)
  from jsonb_to_recordset(p_rows) as x(tbl text, id text, athlete_id text, data jsonb, updated_at timestamptz, deleted boolean)
  on conflict (owner, tbl, id) do update
    set athlete_id = excluded.athlete_id, data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
    where r.updated_at < excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.coach_codes enable row level security;
alter table public.coach_links enable row level security;
alter table public.friendships enable row level security;
alter table public.records enable row level security;

-- Profils : lisibles par tout utilisateur connecté (recherche d'amis par nom d'utilisateur).
-- Ils ne contiennent que username, nom affiché et niveau de partage.
create policy "profils lisibles par les connectés" on public.profiles
  for select to authenticated using (true);
create policy "je modifie mon profil" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "je lis mon code coach" on public.coach_codes
  for select to authenticated using (user_id = (select auth.uid()));

create policy "liens coach visibles par les deux" on public.coach_links
  for select to authenticated using (athlete = (select auth.uid()) or coach = (select auth.uid()));
create policy "chacun peut rompre le lien coach" on public.coach_links
  for delete to authenticated using (athlete = (select auth.uid()) or coach = (select auth.uid()));
-- Pas d'insert direct : passer par add_coach(code).

create policy "amitiés visibles par les deux" on public.friendships
  for select to authenticated using (requester = (select auth.uid()) or addressee = (select auth.uid()));
create policy "j'accepte une demande reçue" on public.friendships
  for update to authenticated using (addressee = (select auth.uid())) with check (addressee = (select auth.uid()) and status = 'accepted');
create policy "chacun peut retirer l'amitié" on public.friendships
  for delete to authenticated using (requester = (select auth.uid()) or addressee = (select auth.uid()));
-- Pas d'insert direct : passer par request_friend(username).

create policy "je lis mes données" on public.records
  for select to authenticated using (owner = (select auth.uid()));
create policy "mon coach lit mes données" on public.records
  for select to authenticated using (public.is_coach_of(owner));
create policy "j'écris mes données" on public.records
  for insert to authenticated with check (owner = (select auth.uid()));
create policy "je modifie mes données" on public.records
  for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
-- Pas de delete physique depuis le client : les suppressions sont des pierres tombales (deleted = true).

-- Rien pour les visiteurs anonymes.
revoke all on public.profiles, public.coach_codes, public.coach_links, public.friendships, public.records from anon;
revoke all on sequence public.records_seq from anon;

-- ─── Fonctions appelées par l'app ─────────────────────────────────────────────

create function public.add_coach(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  c uuid;
begin
  if me is null then raise exception 'non connecté'; end if;
  select user_id into c from public.coach_codes where code = upper(trim(p_code));
  if c is null then raise exception 'code coach inconnu'; end if;
  if c = me then raise exception 'tu ne peux pas être ton propre coach'; end if;
  insert into public.coach_links (athlete, coach) values (me, c) on conflict do nothing;
  return c;
end $$;

-- Nouveau code (l'ancien ne marche plus ; les liens existants sont gardés).
create function public.regenerate_coach_code() returns text
language sql security definer set search_path = '' as $$
  update public.coach_codes set code = upper(substr(md5(gen_random_uuid()::text), 1, 8))
  where user_id = (select auth.uid()) returning code;
$$;

-- Demande d'ami par nom d'utilisateur. Si l'autre m'avait déjà demandé, ça accepte directement.
create function public.request_friend(p_username text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  other uuid;
begin
  if me is null then raise exception 'non connecté'; end if;
  select id into other from public.profiles where username = lower(trim(p_username));
  if other is null then raise exception 'utilisateur introuvable'; end if;
  if other = me then raise exception 'c''est toi!'; end if;
  update public.friendships set status = 'accepted' where requester = other and addressee = me;
  if found then return 'accepted'; end if;
  insert into public.friendships (requester, addressee) values (me, other) on conflict do nothing;
  return 'pending';
end $$;

-- Fil amis / communauté : résumé des courses et sorties, jamais la FC, les notes ni la santé.
-- p_scope = 'friends' : mes amis qui partagent (friends ou public) ; 'public' : tous ceux en public.
create function public.community_feed(p_scope text default 'friends', p_limit int default 50, p_before text default null)
returns table (
  owner uuid, username text, display_name text, kind text, record_id text, day text, summary jsonb
)
language sql stable security definer set search_path = '' as $$
  select r.owner, p.username, p.display_name, r.tbl, r.id, r.data ->> 'date',
    case r.tbl
      when 'activities' then jsonb_build_object(
        'name', r.data ->> 'name', 'sport', r.data ->> 'sport',
        'distanceKm', r.data -> 'distanceKm', 'durationSec', r.data -> 'durationSec',
        'elevationGainM', r.data -> 'elevationGainM')
      else jsonb_build_object(
        'name', r.data ->> 'name', 'distanceKm', r.data -> 'distanceKm',
        'elevationGainM', r.data -> 'elevationGainM', 'terrain', r.data ->> 'terrain',
        'priority', r.data ->> 'priority', 'location', r.data ->> 'location',
        'resultTimeMin', r.data -> 'result' -> 'timeMin')
    end
  from public.records r
  join public.profiles p on p.id = r.owner
  where (select auth.uid()) is not null
    and r.tbl in ('activities', 'races')
    and not r.deleted
    and r.owner <> (select auth.uid())
    and (p_before is null or r.data ->> 'date' < p_before)
    and case p_scope
      when 'public' then p.share_level = 'public'
      else p.share_level in ('friends', 'public') and public.are_friends(r.owner, (select auth.uid()))
    end
  order by r.data ->> 'date' desc, r.seq desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- Droit à l'effacement (Loi 25) : supprime le compte et, en cascade, toutes ses données.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'non connecté'; end if;
  delete from auth.users where id = (select auth.uid());
end $$;

revoke execute on function public.handle_new_user, public.records_bump_seq from public, anon, authenticated;
-- are_friends ne sert qu'à l'intérieur de community_feed : pas exposée (sinon on pourrait sonder les amitiés des autres).
revoke execute on function public.are_friends from public, anon, authenticated;
revoke execute on function public.is_coach_of, public.push_records, public.add_coach,
  public.regenerate_coach_code, public.request_friend, public.community_feed, public.delete_my_account from public, anon;
grant execute on function public.is_coach_of, public.push_records, public.add_coach,
  public.regenerate_coach_code, public.request_friend, public.community_feed, public.delete_my_account to authenticated;
