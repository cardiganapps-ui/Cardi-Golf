-- The course catalog (0075, STRAT-14) on the two-tenant seed: who may verify a card and when, a change to the card
-- taking the mark off and dated, nobody writing the marks directly, the seed's import, the funnel's courses and the
-- Admin de Polo's Campos filters. The whole file is one transaction, so `now()` never moves: a course made here is
-- in its creating transaction until its `created_at` is set back, which is how a later save is played. Rolled
-- back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as padmin from harness.seed where key = 'platform_admin' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as r_a from harness.seed where key = 'round_a1' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
begin;

-- Runs a statement as whoever the session is now; answers 'ok' or the SQLSTATE and message.
create function pg_temp.try(q text) returns text language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
-- A card of 18 holes: par 4 everywhere but holes 3 and 12 (par 3) and 6 and 15 (par 5); stroke index = hole.
create function pg_temp.card(tee_name text, rating numeric, slope int, tee_id uuid default null, par1 int default 4) returns jsonb language sql as $$
  select jsonb_build_object('id', tee_id, 'name', tee_name, 'color', null, 'rating', rating, 'slope', slope,
    'holes', (select jsonb_agg(jsonb_build_object('number', n, 'par', case when n = 1 then par1 when n in (3, 12) then 3 when n in (6, 15) then 5 else 4 end,
                                                   'stroke_index', n, 'yards', 300 + n) order by n) from generate_series(1, 18) n))
$$;
create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', harness.claims(uid), true)
$$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
set local role anon;
select pg_temp.try($$select public.verify_course(gen_random_uuid(), gen_random_uuid(), 'motivo')$$) as anon_verify \gset
select pg_temp.try($$select public.platform_verify_course(gen_random_uuid(), true, 'motivo')$$) as anon_pverify \gset
reset role;
select harness.check(:'anon_verify' like '42501%' and :'anon_pverify' like '42501%', 'a browser with no session verifies nothing: ' || :'anon_verify');
select pg_temp.as_user(:'org_a');
set local role authenticated;
select pg_temp.try($$select public.catalog_import_course('{}'::jsonb)$$) as auth_import \gset
select pg_temp.try($$select public.course_card_mark(gen_random_uuid(), true)$$) as auth_mark \gset
reset role;
select harness.check(:'auth_import' like '42501%', 'a signed-in phone cannot use the seed''s import: ' || :'auth_import');
select harness.check(:'auth_mark' like '42501%', 'nor mark a card changed by hand: ' || :'auth_mark');

-- ---------------------------------------------------------------------------
-- A course saved: unverified, unchanged
-- ---------------------------------------------------------------------------
select pg_temp.as_user(:'org_a');
set local role authenticated;
select public.save_course(jsonb_build_object('name', 'Campo de Prueba Norte', 'source', 'manual', 'tees', jsonb_build_array(pg_temp.card('Azules', 71.5, 128)))) as c1 \gset
reset role;
select harness.check((select verified_at is null and card_changed_at is null and card_corrected_at is null from public.courses where id = :'c1'),
  'a course saved for the first time is unverified and unchanged, its holes and tees written in the same save');

-- Nobody writes the marks directly: not the course's own creator, not the superuser.
select pg_temp.as_user(:'org_a');
set local role authenticated;
select pg_temp.try(format($$update public.courses set verified_at = now(), verified_via = 'comite' where id = %L$$, :'c1')) as direct_a \gset
select pg_temp.try($$insert into public.courses (name, verified_at, verified_via) values ('Atajo', now(), 'comite')$$) as direct_ins \gset
reset role;
select pg_temp.try(format($$update public.courses set card_corrected_at = null, card_changed_at = now() where id = %L$$, :'c1')) as direct_su \gset
select harness.check(:'direct_a' like '42501%' and :'direct_ins' like '42501%', 'the Comité cannot write the verified mark directly: ' || :'direct_a');
select harness.check(:'direct_su' like '42501%', 'nor can any role outside the functions: ' || :'direct_su');

-- An account deleted leaves the marks it made, with nobody's name on them (on delete set null goes through the guard).
insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000c0de', 'verificador@polo.test');
select set_config('cardi.course_card', 'on', true) \g /dev/null
update public.courses set verified_at = now(), verified_via = 'platform', verified_by = '00000000-0000-4000-8000-00000000c0de',
  card_changed_at = now(), card_corrected_at = now(), card_corrected_by = '00000000-0000-4000-8000-00000000c0de' where id = :'c1';
select set_config('cardi.course_card', '', true) \g /dev/null
select pg_temp.try($$delete from auth.users where id = '00000000-0000-4000-8000-00000000c0de'$$) as gone \gset
select harness.check(:'gone' = 'ok' and (select verified_by is null and card_corrected_by is null and verified_at is not null and card_corrected_at is not null
                                         from public.courses where id = :'c1'),
  'deleting the account that verified and corrected a card keeps the marks, nameless: ' || :'gone');
select pg_temp.try(format($$update public.courses set verified_by = %L where id = %L$$, :'org_a', :'c1')) as rename \gset
select harness.check(:'rename' like '42501%', 'but nobody names another account on them: ' || :'rename');
select set_config('cardi.course_card', 'on', true) \g /dev/null
update public.courses set verified_at = null, verified_via = null, card_changed_at = null, card_corrected_at = null where id = :'c1';
select set_config('cardi.course_card', '', true) \g /dev/null

-- Play «a later save»: the course was made yesterday.
update public.courses set created_at = now() - interval '1 day' where id = :'c1';

-- ---------------------------------------------------------------------------
-- The Admin de Polo's mark
-- ---------------------------------------------------------------------------
select pg_temp.as_user(:'org_a');
set local role authenticated;
select pg_temp.try(format($$select public.platform_verify_course(%L, true, 'Comparada con la impresa')$$, :'c1')) as org_pverify \gset
reset role;
select harness.check(:'org_pverify' like '42501%', 'an organizer cannot use the Admin de Polo''s verification: ' || :'org_pverify');
select pg_temp.as_user(:'padmin');
set local role authenticated;
select pg_temp.try(format($$select public.platform_verify_course(%L, true, '  ok ')$$, :'c1')) as short_reason \gset
select public.platform_verify_course(:'c1', true, 'Comparada con la tarjeta impresa del club') ->> 'verifiedAt' as v1 \gset
reset role;
select harness.check(:'short_reason' like '22023%', 'a reason under three letters is refused: ' || :'short_reason');
select harness.check((select verified_at is not null and verified_via = 'platform' and verified_by = :'padmin' from public.courses where id = :'c1'),
  'the Admin de Polo verifies it, as himself, by the platform');
select harness.check((select count(*) = 1 from public.platform_audit_log where action = 'course_verify' and target_id = :'c1' and reason = 'Comparada con la tarjeta impresa del club'),
  'and his verification is a line of the operator''s log, with its reason');

-- Saving the same card again changes nothing: the mark stays.
select pg_temp.as_user(:'org_a');
set local role authenticated;
select public.save_course(jsonb_build_object('id', :'c1', 'name', 'Campo de Prueba Norte', 'source', 'manual',
  'tees', jsonb_build_array(pg_temp.card('Azules', 71.5, 128, (select id from public.tees where course_id = :'c1'))))) \g /dev/null
reset role;
select harness.check((select verified_at is not null and card_changed_at is null from public.courses where id = :'c1'),
  'a save that writes every hole again with the same values leaves the card verified and unchanged');

-- A hole's par changed: the mark goes, and the correction is dated with who made it.
select pg_temp.as_user(:'org_a');
set local role authenticated;
select public.save_course(jsonb_build_object('id', :'c1', 'name', 'Campo de Prueba Norte', 'source', 'manual',
  'tees', jsonb_build_array(pg_temp.card('Azules', 71.5, 128, (select id from public.tees where course_id = :'c1'), 5)))) \g /dev/null
reset role;
select harness.check((select verified_at is null and verified_by is null and verified_via is null and card_changed_at = now()
                             and card_corrected_at = now() and card_corrected_by = :'org_a' from public.courses where id = :'c1'),
  'a par corrected takes the mark off and dates the correction, with who made it');

-- The Admin de Polo takes his mark off again.
select pg_temp.as_user(:'padmin');
set local role authenticated;
select public.platform_verify_course(:'c1', true, 'Revisada otra vez') \g /dev/null
select public.platform_verify_course(:'c1', false, 'No era la tarjeta del club') \g /dev/null
reset role;
select harness.check((select verified_at is null from public.courses where id = :'c1')
  and (select count(*) = 1 from public.platform_audit_log where action = 'course_unverify' and target_id = :'c1'),
  'he takes the mark off, logged as well');

-- A tee added to a card: the mark goes, but nothing it held was corrected.
select pg_temp.as_user(:'org_a');
set local role authenticated;
select public.save_course(jsonb_build_object('name', 'Campo de Prueba Sur', 'source', 'manual', 'tees', jsonb_build_array(pg_temp.card('Blancas', 69.0, 120)))) as c2 \gset
reset role;
update public.courses set created_at = now() - interval '1 day' where id = :'c2';
select pg_temp.as_user(:'padmin');
set local role authenticated;
select public.platform_verify_course(:'c2', true, 'Comparada con la impresa') \g /dev/null
reset role;
select pg_temp.as_user(:'org_a');
set local role authenticated;
select public.save_course(jsonb_build_object('id', :'c2', 'name', 'Campo de Prueba Sur', 'source', 'manual',
  'tees', jsonb_build_array(pg_temp.card('Blancas', 69.0, 120, (select id from public.tees where course_id = :'c2')), pg_temp.card('Rojas', 66.0, 110)))) \g /dev/null
reset role;
select harness.check((select verified_at is null and card_changed_at = now() and card_corrected_at is null from public.courses where id = :'c2'),
  'a tee added takes the mark off and dates the change, but is no correction');
-- A tee taken out is a correction.
select pg_temp.as_user(:'org_a');
set local role authenticated;
select public.save_course(jsonb_build_object('id', :'c2', 'name', 'Campo de Prueba Sur', 'source', 'manual',
  'tees', jsonb_build_array(pg_temp.card('Blancas', 69.0, 120, (select id from public.tees where course_id = :'c2' and name = 'Blancas'))))) \g /dev/null
reset role;
select harness.check((select card_corrected_at = now() from public.courses where id = :'c2'), 'a tee taken out is a correction');

-- A course created from a location-only hit gets its tees later: changed, never corrected.
select pg_temp.as_user(:'org_a');
set local role authenticated;
select public.save_course(jsonb_build_object('name', 'Campo de Prueba Este', 'source', 'opengolfapi', 'external_id', 'oga-este', 'tees', '[]'::jsonb)) as c3 \gset
reset role;
update public.courses set created_at = now() - interval '1 day' where id = :'c3';
select pg_temp.as_user(:'org_a');
set local role authenticated;
select public.save_course(jsonb_build_object('id', :'c3', 'name', 'Campo de Prueba Este', 'source', 'scorecard_photo', 'external_id', 'oga-este',
  'tees', jsonb_build_array(pg_temp.card('Única', 70.0, 125)))) \g /dev/null
reset role;
select harness.check((select card_changed_at is not null and card_corrected_at is null from public.courses where id = :'c3'),
  'a card that arrived after its course is a change, not a correction');

-- A course deleted takes its tees and holes with it, with nothing left to mark.
select pg_temp.as_user(:'org_a');
set local role authenticated;
select public.delete_course(:'c3') \g /dev/null
reset role;
select harness.check(not exists (select 1 from public.courses where id = :'c3'), 'a course deleted cascades through the triggers without a fault');

-- ---------------------------------------------------------------------------
-- The Comité's verification
-- ---------------------------------------------------------------------------
-- Tournament A plays course 1 (its card fixed yesterday, unverified).
select pg_temp.as_user(:'padmin');
set local role authenticated;
select public.platform_verify_course(:'c1', false, 'Para la prueba del Comité') \g /dev/null
reset role;
select set_config('cardi.course_card', 'on', true) \g /dev/null
update public.courses set card_changed_at = now() - interval '1 day', card_corrected_at = now() - interval '1 day' where id = :'c1';
select set_config('cardi.course_card', '', true) \g /dev/null
update public.rounds set course_id = :'c1' where id = :'r_a';

create function pg_temp.verify_as(uid uuid, course uuid, tid uuid, why text default 'Comparamos con la tarjeta impresa del club') returns text
language plpgsql as $$
begin
  perform pg_temp.as_user(uid);
  set local role authenticated;
  perform public.verify_course(course, tid, why);
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;

select pg_temp.verify_as(:'org_a', :'c1', :'t_a') as not_finished \gset
select harness.check(:'not_finished' like '22023%Solo el Comité de un torneo terminado%', 'a tournament not Terminado does not verify: ' || :'not_finished');

update public.rounds set status = 'live' where id = :'r_a';
insert into public.scores (round_id, player_id, hole, strokes, putts) select :'r_a', :'ana', n, 4, 2 from generate_series(1, 17) n;
update public.rounds set status = 'finished' where id = :'r_a';
update public.tournaments set status = 'finished' where id = :'t_a';
-- The first hole was saved an hour ago.
update public.audit_log set at = now() - interval '1 hour' where tournament_id = :'t_a' and table_name = 'scores';
update public.scores set updated_at = now() - interval '1 hour' where round_id = :'r_a';

select pg_temp.verify_as(:'org_a', :'c1', :'t_a') as short_round \gset
select harness.check(:'short_round' like '22023%no terminó un día completo%', 'a day with a hole nobody scored does not verify: ' || :'short_round');
insert into public.scores (round_id, player_id, hole, strokes, putts, updated_at) values (:'r_a', :'ana', 18, 4, 2, now() - interval '1 hour');

select pg_temp.verify_as(:'org_b', :'c1', :'t_a') as other_comite \gset
select harness.check(:'other_comite' like '42501%', 'another tournament''s Comité cannot verify through it: ' || :'other_comite');
select pg_temp.verify_as(:'org_a', :'c1', :'t_a', 'no') as short_why \gset
select harness.check(:'short_why' like '22023%', 'the Comité writes a reason: ' || :'short_why');

-- A card changed after the first hole: the Comité played another card.
select set_config('cardi.course_card', 'on', true) \g /dev/null
update public.courses set card_changed_at = now() - interval '30 minutes' where id = :'c1';
select set_config('cardi.course_card', '', true) \g /dev/null
select pg_temp.verify_as(:'org_a', :'c1', :'t_a') as changed_after \gset
select harness.check(:'changed_after' like '22023%cambió después%', 'a card changed after the tournament''s first hole does not verify: ' || :'changed_after');
select set_config('cardi.course_card', 'on', true) \g /dev/null
update public.courses set card_changed_at = now() - interval '1 day' where id = :'c1';
select set_config('cardi.course_card', '', true) \g /dev/null

-- Practice does not verify.
update public.tournaments set counts_for_stats = false where id = :'t_a';
select pg_temp.verify_as(:'org_a', :'c1', :'t_a') as practice \gset
select harness.check(:'practice' like '22023%', 'an Ensayo does not verify: ' || :'practice');
update public.tournaments set counts_for_stats = true where id = :'t_a';

-- Now it holds.
select pg_temp.verify_as(:'org_a', :'c1', :'t_a') as verified \gset
select harness.check(:'verified' = 'ok', 'the Comité of a Terminado tournament that played the card unchanged verifies it: ' || :'verified');
select harness.check((select verified_via = 'comite' and verified_by = :'org_a' and verified_at = now() from public.courses where id = :'c1'),
  'as itself, by the Comité');
select harness.check((select count(*) = 1 from public.audit_log where table_name = 'courses' and row_id = :'c1' and action = 'UPDATE'
                        and reason = 'Comparamos con la tarjeta impresa del club' and after ->> 'verified_via' = 'comite'),
  'its verification is a line of the history, with its reason');
select pg_temp.verify_as(:'org_a', :'c1', :'t_a') as again \gset
select harness.check(:'again' = 'ok' and (select count(*) = 1 from public.audit_log where table_name = 'courses' and row_id = :'c1' and after ->> 'verified_via' = 'comite'),
  'verifying a verified card answers as it is and writes nothing');

-- A broken card is never verified, by anyone.
select pg_temp.as_user(:'org_a');
set local role authenticated;
select public.save_course(jsonb_build_object('name', 'Campo Roto', 'source', 'manual', 'tees', '[]'::jsonb)) as c4 \gset
reset role;
select pg_temp.as_user(:'padmin');
set local role authenticated;
select pg_temp.try(format($$select public.platform_verify_course(%L, true, 'Sin tees')$$, :'c4')) as broken \gset
reset role;
select harness.check(:'broken' like '22023%Corrige la tarjeta%', 'a course with no tee is not verified: ' || :'broken');

-- ---------------------------------------------------------------------------
-- The seed's import
-- ---------------------------------------------------------------------------
-- scripts/seed-courses.mjs reduces names as course_dupe_key does: the same strings as src/lib/seedCourses.test.ts.
select harness.check(public.course_dupe_key('Club de Golf Chapultepec') = 'chapultepec' and public.course_dupe_key('Quivira Golf Club') = 'quivira'
  and public.course_dupe_key('Querétaro Country Club') = 'queretaro' and public.course_dupe_key('Campo de Golf Ñandú') = 'nandu'
  and public.course_dupe_key('El Camaleón Mayakoba') = 'camaleonmayakoba' and public.course_dupe_key('The Links at Cabo') = 'atcabo'
  and public.course_keys_match(public.course_dupe_key('Quivira'), public.course_dupe_key('Quivira Los Cabos'))
  and not public.course_keys_match(public.course_dupe_key('Solmar'), public.course_dupe_key('Quivira')),
  'the duplicate key reads the script''s cases as the script does');
create function pg_temp.import_as_service(p jsonb) returns text language plpgsql as $$
declare r jsonb;
begin
  set local role service_role;
  r := public.catalog_import_course(p);
  reset role;
  return r::text;
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;
select jsonb_build_object('name', 'Quivira Golf Club', 'location', 'Cabo San Lucas, BCS, Mexico', 'source', 'golfcourseapi', 'external_id', 'mz9gqcpj',
  'tees', jsonb_build_array(pg_temp.card('Black', 74.1, 142) - 'id', pg_temp.card('Gold', 72.0, 137) - 'id')) as quivira \gset
select pg_temp.import_as_service(:'quivira') as imp1 \gset
select harness.check((:'imp1'::jsonb ->> 'status') = 'created' and (:'imp1'::jsonb ->> 'tees') = '2', 'a complete card is imported: ' || :'imp1');
select harness.check((select c.source = 'golfcourseapi' and c.external_id = 'mz9gqcpj' and c.imported_at = now() and c.created_by is null
                             and c.verified_at is null and c.card_changed_at is null
                             and (select count(*) from public.holes h join public.tees t on t.id = h.tee_id where t.course_id = c.id) = 36
                        from public.courses c where c.id = (:'imp1'::jsonb ->> 'id')::uuid),
  'with its provenance, its 36 holes, unverified and unchanged');
select pg_temp.import_as_service(:'quivira') as imp2 \gset
select harness.check((:'imp2'::jsonb ->> 'status') = 'exists' and (:'imp2'::jsonb ->> 'id') = (:'imp1'::jsonb ->> 'id'), 'the same course again is left alone: ' || :'imp2');
select pg_temp.import_as_service(jsonb_set(jsonb_set(:'quivira'::jsonb, '{name}', '"Quivira Los Cabos"'), '{external_id}', '"otro"')) as imp3 \gset
select harness.check((:'imp3'::jsonb ->> 'status') = 'exists', 'a name the catalog already has (by its duplicate key) is left alone: ' || :'imp3');
select pg_temp.import_as_service(jsonb_set(:'quivira'::jsonb, '{name}', '"Campo de Prueba Norte"')) as imp4 \gset
select harness.check((:'imp4'::jsonb ->> 'status') = 'exists' and (:'imp4'::jsonb ->> 'id') = (:'imp1'::jsonb ->> 'id'), 'so is one from the same provider id under another name: ' || :'imp4');

select jsonb_build_object('name', 'Diamante Dunes', 'source', 'opengolfapi', 'external_id', 'oga-dunes', 'tees', jsonb_build_array(pg_temp.card('Tee', 74.0, 140) - 'id')) as dunes \gset
select pg_temp.import_as_service(jsonb_set(:'dunes'::jsonb, '{tees,0,slope}', 'null')) as no_slope \gset
select pg_temp.import_as_service(jsonb_set(:'dunes'::jsonb, '{tees,0,holes}', (select jsonb_path_query_array(:'dunes'::jsonb -> 'tees' -> 0 -> 'holes', '$[0 to 16]')))) as holes17 \gset
select pg_temp.import_as_service(jsonb_set(:'dunes'::jsonb, '{tees,0,holes,1,stroke_index}', '1')) as si_twice \gset
select pg_temp.import_as_service(jsonb_set(:'dunes'::jsonb, '{tees,0,holes,1,par}', 'null')) as no_par \gset
select pg_temp.import_as_service(jsonb_set(:'dunes'::jsonb, '{source}', '"manual"')) as not_provider \gset
select harness.check(:'no_slope' like '22023%' and :'holes17' like '22023%' and :'si_twice' like '22023%' and :'no_par' like '22023%' and :'not_provider' like '22023%',
  'an incomplete card is refused whole: no slope, 17 holes, a stroke index twice, a par missing, not a provider: ' || :'si_twice');
select harness.check(not exists (select 1 from public.courses where name = 'Diamante Dunes'), 'and nothing of it is written');

-- ---------------------------------------------------------------------------
-- The funnel's courses
-- ---------------------------------------------------------------------------
-- Tournament A (org_a's first) plays course 1, made after it (added, by hand), and a course from the catalog on a second day.
select id as old_c from public.courses where id = (:'imp1'::jsonb ->> 'id')::uuid \gset
update public.courses set created_at = (select created_at from public.tournaments where id = :'t_a') + interval '1 minute' where id = :'c1';
update public.courses set created_at = now() - interval '30 days' where id = :'old_c';
select pg_temp.as_user(:'org_a');
set local role authenticated;
insert into public.rounds (tournament_id, number, holes, course_id) values (:'t_a', 2, 18, :'old_c');
reset role;
-- org_b's second tournament plays the same imported course (in the catalog before it).
insert into public.tournaments (slug, name, join_code, created_by) values ('cat-b2', 'Segundo de B', 'CATBB2', :'org_b') returning id as t_b2 \gset
insert into public.rounds (tournament_id, number, holes, course_id) values (:'t_b2', 1, 18, :'old_c');
select pg_temp.as_user(:'padmin');
set local role authenticated;
select public.platform_funnel(90) as f \gset
reset role;
select harness.check(jsonb_typeof(:'f'::jsonb -> 'steps') = 'array' and (:'f'::jsonb ->> 'northStar') is not null and (:'f'::jsonb ->> 'organizers') = '2',
  'the funnel keeps every key it had: ' || (:'f'::jsonb - 'courses')::text);
select harness.check((:'f'::jsonb #>> '{courses,all,tournaments}') = '3' and (:'f'::jsonb #>> '{courses,all,withCourse}') = '2'
  and (:'f'::jsonb #> '{courses,all,found}') = '{"search": 2, "photo": 0, "manual": 0}'::jsonb
  and (:'f'::jsonb #> '{courses,all,added}') = '{"search": 0, "photo": 0, "manual": 1}'::jsonb,
  'every tournament: each course its days play, found in the catalog or added, by how it arrived: ' || (:'f'::jsonb -> 'courses' -> 'all')::text);
select harness.check((:'f'::jsonb #>> '{courses,first,tournaments}') = '2' and (:'f'::jsonb #>> '{courses,first,withCourse}') = '1'
  and (:'f'::jsonb #> '{courses,first,found}') = '{"search": 1, "photo": 0, "manual": 0}'::jsonb
  and (:'f'::jsonb #> '{courses,first,added}') = '{"search": 0, "photo": 0, "manual": 1}'::jsonb,
  'an organizer''s first tournament on its own (B''s second is not): ' || (:'f'::jsonb -> 'courses' -> 'first')::text);

-- ---------------------------------------------------------------------------
-- The Admin de Polo's Campos
-- ---------------------------------------------------------------------------
select pg_temp.as_user(:'padmin');
set local role authenticated;
select public.platform_courses(null, 'verified', 50, 0) as fv \gset
select public.platform_courses(null, 'unverified', 50, 0) as fu \gset
select public.platform_courses(null, 'corrected', 50, 0) as fc \gset
select public.platform_course(:'c1') as one \gset
reset role;
select harness.check((select array_agg(r ->> 'id') from jsonb_array_elements(:'fv'::jsonb -> 'rows') r) = array[:'c1'::text]
  and (:'fv'::jsonb -> 'rows' -> 0 ->> 'verifiedVia') = 'comite',
  'Verificadas lists the verified card, saying by whom: ' || (:'fv'::jsonb ->> 'total'));
select harness.check(not exists (select 1 from jsonb_array_elements(:'fu'::jsonb -> 'rows') r where r ->> 'id' = :'c1')
  and (:'fu'::jsonb ->> 'total')::int = (select count(*) from public.courses where verified_at is null),
  'Sin verificar lists the rest');
select harness.check((select array_agg(r ->> 'id' order by r ->> 'id') from jsonb_array_elements(:'fc'::jsonb -> 'rows') r) = (select array_agg(x order by x) from unnest(array[:'c1'::text, :'c2'::text]) x)
  and (:'fc'::jsonb -> 'rows' -> 0 ->> 'id') = :'c2',
  'Corregidas lists the cards corrected since they were first saved, the latest first: ' || (:'fc'::jsonb ->> 'total'));
select harness.check((:'one'::jsonb ->> 'verifiedVia') = 'comite' and (:'one'::jsonb ->> 'verifierEmail') is not null and (:'one'::jsonb ? 'correctedAt')
  and (:'one'::jsonb ->> 'correctorEmail') is not null and jsonb_typeof(:'one'::jsonb -> 'tees') = 'array',
  'one course says its verification and its last correction, with who');

rollback;
