-- Deleting an account takes the person off what stays (0031, TRUST-03). On the
-- two-tenant seed: an account (Zoé) confirms Ana, in tournament A, as her own
-- player and is proposed for Carla, in B, without confirming. Ana gets Zoé's
-- name, photo, form guide and a handicap, a score, and the Comité edits her
-- (so the audit log holds her images). The platform admin previews and
-- deletes the account. Then nothing in any table of the public schema, the
-- audit log and the deletion log included, holds Zoé's name, email, photo or
-- form guide, while Ana's holes and handicap, and Carla, are as they were.
-- Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as padmin from harness.seed where key = 'platform_admin' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as carla from harness.seed where key = 'player_b1' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
begin;

-- The account, its profile and its players.
select gen_random_uuid() as zoe \gset
insert into auth.users (id, email, email_confirmed_at, is_anonymous, raw_user_meta_data)
  values (:'zoe', 'zoe.zeta@polo.test', now(), false, '{"display_name":"Zoé Zeta Única"}');
insert into public.profiles (id, handle, display_name, full_name, avatar_url)
  values (:'zoe', 'zoezeta', 'Zoé', 'Zoé Zeta Única', 'https://example.test/profiles/zoe-perfil.jpg');
update public.players set profile_id = :'zoe', profile_status = 'confirmed',
    full_name = 'Zoé Zeta Única', display_name = 'Zoé', avatar_url = 'https://example.test/t/zoe-jugadora.jpg',
    form_guide = 'zoeforma: 88, 91, 85', base_hcp = 14.2, handicap_source = 'index', handicap_index = 14.2
  where id = :'ana';
update public.players set profile_id = :'zoe', profile_status = 'pending' where id = :'carla';
-- Two copies of her, left pending (PR 114's verifier): a friend's Ronda rápida builds her player from
-- her profile (0017), and a duplicate of A copies Ana as she is (0013). Each in a tournament of its own.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select id as t_quick from public.create_tournament('Ronda de Bob', '{}'::jsonb) \gset
select id as t_copy from public.create_tournament('Torneo A, ensayo', '{}'::jsonb) \gset
reset role;
insert into public.players (tournament_id, full_name, display_name, avatar_url, sort_order, profile_id, profile_status)
  values (:'t_quick', 'Zoé Zeta Única', 'Zoé', 'https://example.test/profiles/zoe-perfil.jpg', 0, :'zoe', 'pending') returning id as quick_copy \gset
insert into public.players (tournament_id, full_name, display_name, avatar_url, form_guide, sort_order, profile_id, profile_status)
  values (:'t_copy', 'Zoé Zeta Única', 'Zoé', 'https://example.test/t/zoe-jugadora.jpg', 'zoeforma: 88, 91, 85', 0, :'zoe', 'pending') returning id as dup_copy \gset
-- A copy the Comité renamed but left with her photo: it keeps the Comité's name and loses the photo.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select id as t_photo from public.create_tournament('Copa del Comité', '{}'::jsonb) \gset
reset role;
-- It came from a duplicate (her name, form guide and photo); the Comité then renamed it, so its history holds her.
insert into public.players (tournament_id, full_name, display_name, avatar_url, form_guide, sort_order, profile_id, profile_status)
  values (:'t_photo', 'Zoé Zeta Única', 'Zoé', 'https://example.test/profiles/zoe-perfil.jpg', 'zoeforma: 88, 91, 85', 0, :'zoe', 'pending') returning id as photo_copy \gset
update public.players set full_name = 'Z. Zeta, la del Comité', display_name = 'Z.' where id = :'photo_copy';
-- Two more duplicates' copies (PR 114's fourth verifier): one the Comité renamed and gave its own photo,
-- one it renamed in full name only (the boards still say «Zoé»).
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select id as t_copy_b from public.create_tournament('Torneo A, copia B', '{}'::jsonb) \gset
select id as t_copy_c from public.create_tournament('Torneo A, copia C', '{}'::jsonb) \gset
reset role;
insert into public.players (tournament_id, full_name, display_name, avatar_url, form_guide, sort_order, profile_id, profile_status)
  values (:'t_copy_b', 'Zoé Zeta Única', 'Zoé', 'https://example.test/t/zoe-jugadora.jpg', 'zoeforma: 88, 91, 85', 0, :'zoe', 'pending') returning id as copy_b \gset
update public.players set full_name = 'Renombrado B', display_name = 'RB', avatar_url = 'https://example.test/t/comite-b.jpg' where id = :'copy_b';
insert into public.players (tournament_id, full_name, display_name, avatar_url, form_guide, sort_order, profile_id, profile_status)
  values (:'t_copy_c', 'Zoé Zeta Única', 'Zoé', null, 'zoeforma: 88, 91, 85', 0, :'zoe', 'pending') returning id as copy_c \gset
update public.players set full_name = 'Renombrada C' where id = :'copy_c';
-- Before she changed her email, the operator gave her a Comité under the old one.
insert into public.platform_audit_log (actor_auth_user_id, action, target_kind, target_id, tournament_id, reason, payload)
  values (:'padmin', 'set_organizer', 'tournament', :'t_quick', :'t_quick', 'Comité nuevo', jsonb_build_object('userId', :'zoe', 'email', 'zoe.antes@polo.test', 'role', 'owner'));
-- The operator gave her a Comité once: platform_set_organizer logs her email (0022).
insert into public.platform_audit_log (actor_auth_user_id, action, target_kind, target_id, tournament_id, reason, payload)
  values (:'padmin', 'set_organizer', 'tournament', :'t_a', :'t_a', 'Se quedó sin Comité', jsonb_build_object('userId', :'zoe', 'email', 'zoe.zeta@polo.test', 'role', 'admin'));
-- GoTrue's own audit log (stubbed as Supabase has it): a sign-in of hers and one of the Comité's.
insert into auth.audit_log_entries (id, payload, created_at) values
  (gen_random_uuid(), json_build_object('actor_id', :'zoe', 'actor_username', 'zoe.zeta@polo.test', 'action', 'login'), now()),
  (gen_random_uuid(), json_build_object('actor_id', :'org_a', 'actor_username', 'org-a@polo.test', 'action', 'login'), now()),
  -- An admin action about her: GoTrue files it under the admin, with her in traits.
  (gen_random_uuid(), json_build_object('actor_id', :'padmin', 'actor_username', 'admin@polo.test', 'action', 'user_modified', 'traits', json_build_object('user_id', :'zoe', 'user_email', 'zoe.zeta@polo.test')), now());
update public.rounds set status = 'live' where id = :'r1';
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) values (:'r1', :'ana', 1, 5, 2, false);
-- The Comité edits her once more: one more pair of images in the audit log.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.players set display_name = 'Zoé Z.' where id = :'ana';
reset role;
select harness.check((select count(*) from public.audit_log where table_name = 'players' and row_id = :'ana' and (before::text || after::text) like '%Zoé Zeta Única%') >= 2,
  'before the deletion, the audit log holds her name');

-- Nobody but the deletion reaches the internal functions.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
create function pg_temp.try_anon(u uuid) returns text language plpgsql as $$
begin
  perform public.anonymize_person(u);
  return 'taken';
exception when others then
  return sqlstate;
end $$;
reset role;
grant execute on function pg_temp.try_anon(uuid) to authenticated;
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_anon(:'zoe') as direct \gset
reset role;
select harness.check(:'direct' = '42501', 'a signed-in account cannot call anonymize_person: ' || :'direct');

-- The preview says who will be renamed, and where.
select set_config('request.jwt.claims', harness.claims(:'padmin'), true) \g /dev/null
set local role authenticated;
select public.platform_delete_preview(:'zoe')::text as preview \gset
select public.platform_delete_account(:'zoe', 'Zoe.Zeta@polo.test', 'Pidió borrar su cuenta') \g /dev/null
reset role;
select harness.check((:'preview'::jsonb ->> 'anonymizedPlayers')::int = 3 and (:'preview'::jsonb ->> 'linkedPlayers')::int = 7
  and :'preview'::jsonb -> 'anonymizedIn' = '["Ronda de Bob", "Seed Torneo A", "Torneo A, ensayo"]'::jsonb,
  'the preview: 7 linked, 3 renamed (hers and the two copies; not the Comité''s name with her photo), and where: ' || :'preview');

-- Her player stays, without her.
select harness.check((select full_name = 'Jugador borrado' and display_name = 'Borrado' and avatar_url is null and form_guide is null and profile_id is null
  from public.players where id = :'ana'), 'Ana is «Jugador borrado», with no photo and no form guide');
select harness.check((select base_hcp = 14.2 and handicap_index = 14.2 and handicap_source = 'index' from public.players where id = :'ana'),
  'her handicap stays: the results are made of it');
select harness.check((select count(*) = 1 from public.scores where player_id = :'ana' and hole = 1 and strokes = 5 and putts = 2), 'her hole stays as it was');
select harness.check((select full_name = 'Carla Beta' and display_name = 'Carla' and profile_id is null from public.players where id = :'carla'),
  'a player the Comité named otherwise, never confirmed, keeps the Comité''s name and loses the link');
select harness.check((select bool_and(full_name = 'Jugador borrado' and display_name = 'Borrado' and avatar_url is null and form_guide is null)
  from public.players where id in (:'quick_copy', :'dup_copy')), 'the copies of her (a Ronda rápida''s, a duplicate''s) are «Jugador borrado» too');
select harness.check((select count(*) from auth.audit_log_entries where payload ->> 'actor_id' = :'zoe' or payload -> 'traits' ->> 'user_id' = :'zoe') = 0
  and (select count(*) from auth.audit_log_entries where payload ->> 'actor_id' = :'org_a') = 1, 'GoTrue''s audit rows by her and about her go, nobody else''s');
select harness.check((select full_name = 'Z. Zeta, la del Comité' and display_name = 'Z.' and avatar_url is null and form_guide is null from public.players where id = :'photo_copy'),
  'a copy the Comité renamed keeps that name and loses her photo and her form guide');
select harness.check((select full_name = 'Renombrado B' and display_name = 'RB' and avatar_url = 'https://example.test/t/comite-b.jpg' and form_guide is null
  from public.players where id = :'copy_b'), 'a copy the Comité renamed with its own photo keeps both and loses her form guide');
select harness.check((select full_name = 'Renombrada C' and display_name = 'Renombrada C' and form_guide is null from public.players where id = :'copy_c'),
  'a copy renamed in full name only no longer shows her short name');
select harness.check((select count(*) from public.audit_log where table_name = 'players' and row_id = :'copy_b' and (before::text || coalesce(after::text, '')) like '%comite-b.jpg%') >= 1,
  'its history keeps the photo the Comité set');
select harness.check((select count(*) from public.audit_log where table_name = 'players' and row_id = :'photo_copy'
  and (before::text || coalesce(after::text, '')) like '%la del Comité%') >= 1, 'its history keeps the Comité''s name');
select harness.check((select payload ->> 'emailHash' = encode(extensions.digest('zoe.antes@polo.test:' || :'zoe', 'sha256'), 'hex') and not payload ? 'email'
  from public.platform_audit_log where action = 'set_organizer' and target_id = :'t_quick'), 'a row with the email she had before keeps that email''s fingerprint');
select harness.check((select payload ->> 'emailHash' = encode(extensions.digest('zoe.zeta@polo.test:' || :'zoe', 'sha256'), 'hex') and not payload ? 'email' and payload ->> 'role' = 'admin'
  from public.platform_audit_log where action = 'set_organizer' and target_id = :'t_a'), 'an earlier log row with her email keeps the fingerprint and the rest');

-- Nothing of hers anywhere in the public schema.
create function pg_temp.hits(needle text) returns text language plpgsql as $$
declare
  t record;
  n int;
  out text := '';
begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r' order by c.relname loop
    execute format('select count(*) from public.%I x where lower(x::text) like $1', t.relname) into n using '%' || lower(needle) || '%';
    if n > 0 then out := out || t.relname || ':' || n || ' '; end if;
  end loop;
  return coalesce(nullif(out, ''), 'none');
end $$;
select pg_temp.hits('Zoé Zeta Única') as name_hits \gset
select pg_temp.hits('zoe.zeta@polo.test') as email_hits \gset
select pg_temp.hits('zoe-jugadora.jpg') as photo_hits \gset
select pg_temp.hits('zoe-perfil.jpg') as profile_photo_hits \gset
select pg_temp.hits('zoeforma') as form_hits \gset
select harness.check(:'name_hits' = 'none', 'her name is in no table: ' || :'name_hits');
select harness.check(:'email_hits' = 'none', 'her email is in no table: ' || :'email_hits');
select harness.check((select count(*) from auth.audit_log_entries x where x::text ilike '%zoe.zeta@polo.test%') = 0, 'nor in GoTrue''s audit log');
select pg_temp.hits('zoe.antes@polo.test') as old_email_hits \gset
select harness.check(:'old_email_hits' = 'none', 'her old email is in no table: ' || :'old_email_hits');
select harness.check(:'photo_hits' = 'none', 'her player photo is in no table: ' || :'photo_hits');
select harness.check(:'profile_photo_hits' = 'none', 'her profile photo is in no table: ' || :'profile_photo_hits');
select harness.check(:'form_hits' = 'none', 'her form guide is in no table: ' || :'form_hits');

-- The deletion log: the fingerprint of the email, never the email.
select harness.check((select count(*) = 1 from public.platform_audit_log
  where action = 'delete' and target_id = :'zoe' and not payload ? 'email'
    and payload ->> 'emailHash' = encode(extensions.digest('zoe.zeta@polo.test:' || :'zoe', 'sha256'), 'hex')),
  'the deletion log keeps the email''s fingerprint, not the email');
-- A phone has no email: nothing to fingerprint.
select harness.check(public.email_fingerprint(null, 'x') is null and public.email_fingerprint('', 'x') is null, 'no email, no fingerprint');
-- The audit images kept everything else about Ana.
select harness.check((select bool_and(coalesce(after ->> 'base_hcp', before ->> 'base_hcp') is not null) from public.audit_log where table_name = 'players' and row_id = :'ana'),
  'her audit images keep the rest of the row');

rollback;
