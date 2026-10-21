-- Tests du schéma : chaque bloc doit passer, sinon une exception arrête tout (ON_ERROR_STOP).
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"username":"alice","display_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"username":"bob","display_name":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"username":"coach.chantal","display_name":"Chantal"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"username":"BAD NAME!"}');

do $$ begin
  assert (select count(*) from public.profiles) = 4, 'profil créé à l''inscription';
  assert (select username from public.profiles where id = '00000000-0000-0000-0000-00000000000d') like 'coureur\_%', 'username invalide remplacé';
  assert (select count(*) from public.coach_codes) = 4, 'code coach créé';
end $$;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('role', 'authenticated', false);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', false), set_config('request.jwt.claim.sub', '', false);
$$;

-- ── Alice pousse ses données
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a') \gset
do $$ begin
  assert public.push_records('[
    {"tbl":"activities","id":"act1","athlete_id":"ath-a","data":{"date":"2026-10-20","name":"Sortie longue","distanceKm":25,"hrAvg":150,"notes":"genou ok"},"updated_at":"2026-10-20T10:00:00Z"},
    {"tbl":"races","id":"race1","athlete_id":"ath-a","data":{"date":"2026-11-01","name":"Grand-Duc","distanceKm":42,"priority":"A"},"updated_at":"2026-10-20T10:00:00Z"},
    {"tbl":"painLogs","id":"pain1","athlete_id":"ath-a","data":{"date":"2026-10-19","zone":"tibia","intensity":3},"updated_at":"2026-10-20T10:00:00Z"}
  ]') = 3, 'insertion';
  -- Plus vieux : ignoré (dernière modif gagne)
  assert public.push_records('[{"tbl":"activities","id":"act1","data":{"name":"vieux"},"updated_at":"2026-10-19T00:00:00Z"}]') = 0, 'LWW: plus vieux ignoré';
  assert (select data->>'name' from public.records where id = 'act1') = 'Sortie longue', 'LWW: donnée gardée';
  -- Même horodatage : ignoré (renvoyer un lot est sans effet)
  assert public.push_records('[{"tbl":"activities","id":"act1","data":{"name":"pareil"},"updated_at":"2026-10-20T10:00:00Z"}]') = 0, 'idempotent';
  -- Plus récent : appliqué, seq augmente
  perform public.push_records('[{"tbl":"activities","id":"act1","athlete_id":"ath-a","data":{"date":"2026-10-20","name":"Sortie longue","distanceKm":26,"hrAvg":150,"notes":"genou ok"},"updated_at":"2026-10-20T11:00:00Z"}]');
  assert (select (data->>'distanceKm')::int from public.records where id = 'act1') = 26, 'LWW: plus récent appliqué';
  assert (select seq from public.records where id = 'act1') > (select seq from public.records where id = 'race1'), 'seq bumpé à la mise à jour';
end $$;

-- Alice ne peut pas écrire au nom de Bob
do $$ begin
  begin
    insert into public.records (owner, tbl, id, data, updated_at) values ('00000000-0000-0000-0000-00000000000b', 'races', 'x', '{}', now());
    raise exception 'ÉCHEC: écriture pour un autre';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.records where id = 'act1';
    assert not found, 'ÉCHEC: delete physique permis';
  end;
end $$;

-- ── Bob ne voit rien d'Alice
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b') \gset
do $$ begin
  assert (select count(*) from public.records) = 0, 'Bob ne voit pas les données d''Alice';
  assert (select count(*) from public.coach_codes) = 1, 'Bob ne voit que son code coach';
  assert (select count(*) from public.profiles) = 4, 'profils lisibles (recherche)';
  -- Alice est privée par défaut : rien dans le fil, même public
  assert (select count(*) from public.community_feed('public')) = 0, 'privé par défaut';
  -- Tentative de forcer un lien coach ou une amitié acceptée sans passer par les fonctions
  begin
    insert into public.coach_links (athlete, coach) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
    raise exception 'ÉCHEC: lien coach forcé';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.friendships (requester, addressee, status) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'accepted');
    raise exception 'ÉCHEC: amitié forcée';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.are_friends('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
    raise exception 'ÉCHEC: are_friends exposée';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── Coach : Alice entre le code de Chantal
select pg_temp.as_admin() \gset
select code as chantal_code from public.coach_codes where user_id = '00000000-0000-0000-0000-00000000000c' \gset
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a') \gset
select public.add_coach(lower(:'chantal_code')) is not null as ok \gset
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c') \gset
do $$ begin
  assert (select count(*) from public.records where owner = '00000000-0000-0000-0000-00000000000a') = 3, 'le coach voit tout (y compris douleur)';
  begin
    perform public.push_records('[{"tbl":"activities","id":"act1","data":{"name":"hack"},"updated_at":"2030-01-01T00:00:00Z"}]');
  end;
  -- (le push du coach crée une ligne sous SON propre owner, jamais sous celui de l'athlète)
  assert (select count(*) from public.records where owner = '00000000-0000-0000-0000-00000000000a' and data->>'name' = 'hack') = 0, 'le coach ne modifie pas l''athlète';
  update public.records set data = '{}' where owner = '00000000-0000-0000-0000-00000000000a';
  assert not found, 'le coach ne peut pas UPDATE';
end $$;
-- Bob (pas coach) toujours rien ; mauvais code refusé
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b') \gset
do $$ begin
  assert (select count(*) from public.records) = 0, 'non-coach ne voit rien';
  begin
    perform public.add_coach('ZZZZZZZZ');
    raise exception 'ÉCHEC: code bidon accepté';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;
-- Alice rompt le lien → Chantal ne voit plus rien
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a') \gset
delete from public.coach_links where athlete = '00000000-0000-0000-0000-00000000000a';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c') \gset
do $$ begin assert (select count(*) from public.records where owner = '00000000-0000-0000-0000-00000000000a') = 0, 'lien rompu'; end $$;

-- ── Amis et communauté
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b') \gset
do $$ begin assert public.request_friend('Alice') = 'pending', 'demande envoyée'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a') \gset
update public.profiles set share_level = 'friends' where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b') \gset
do $$ begin
  assert (select count(*) from public.community_feed('friends')) = 0, 'demande pas encore acceptée';
  update public.friendships set status = 'accepted';  -- Bob ne peut pas accepter sa propre demande
  assert not found, 'ÉCHEC: le demandeur accepte lui-même';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a') \gset
update public.friendships set status = 'accepted' where requester = '00000000-0000-0000-0000-00000000000b';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b') \gset
do $$
declare s jsonb;
begin
  assert (select count(*) from public.community_feed('friends')) = 2, 'ami voit courses + sorties (pas la douleur)';
  assert (select count(*) from public.community_feed('public')) = 0, 'partage amis ≠ public';
  select summary into s from public.community_feed('friends') where kind = 'activities';
  assert s ->> 'name' = 'Sortie longue' and (s ->> 'distanceKm')::int = 26, 'résumé correct';
  assert not (s ? 'hrAvg') and not (s ? 'notes'), 'pas de FC ni de notes dans le fil';
  assert (select count(*) from public.records) = 0, 'ami ne lit jamais records';
end $$;
-- Chantal (pas amie) voit Alice seulement si elle passe en public
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c') \gset
do $$ begin assert (select count(*) from public.community_feed('public')) = 0, 'pas public'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a') \gset
update public.profiles set share_level = 'public' where id = '00000000-0000-0000-0000-00000000000a';
-- Alice ne peut pas modifier le profil de Bob
update public.profiles set share_level = 'public' where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c') \gset
do $$ begin
  assert (select count(*) from public.community_feed('public')) = 2, 'public visible par tous';
  assert (select share_level from public.profiles where username = 'bob') = 'private', 'profil d''un autre non modifiable';
end $$;
-- Pierre tombale : une sortie supprimée disparaît du fil
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a') \gset
select public.push_records('[{"tbl":"activities","id":"act1","data":{},"updated_at":"2026-10-21T00:00:00Z","deleted":true}]') = 1 as ok \gset
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c') \gset
do $$ begin assert (select count(*) from public.community_feed('public')) = 1, 'supprimé retiré du fil'; end $$;

-- ── Anonyme : rien
select set_config('role', 'anon', false), set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin
    perform count(*) from public.records;
    raise exception 'ÉCHEC: anon lit records';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.community_feed('public');
    raise exception 'ÉCHEC: anon lit le fil';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── Suppression du compte : tout part en cascade
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a') \gset
select public.delete_my_account();
select pg_temp.as_admin() \gset
do $$ begin
  assert (select count(*) from public.records where owner = '00000000-0000-0000-0000-00000000000a') = 0, 'données effacées';
  assert (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 0, 'profil effacé';
  assert (select count(*) from public.friendships) = 0, 'amitiés effacées';
end $$;

\echo 'Tous les tests du schéma passent.'
