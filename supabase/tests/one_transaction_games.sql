-- ARCH-13 (0044): a hole contest's winners and a custom bet's result, each
-- written in one transaction. Before, each was a delete and then an insert in
-- two requests: a refused insert left the hole, or the bet, with nothing.
-- On the two-tenant seed: org_a runs tournament A (round 1 live, Ana and
-- Beto in group 1), dev_a is Ana's phone, Ceci plays group 2. Rolled back at
-- the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as carla from harness.seed where key = 'player_b1' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
select id as g1 from harness.seed where key = 'group_a1' \gset
begin;

-- A call as a user of the app: its answer, or the SQLSTATE and the message.
create function pg_temp.as_user(uid uuid, q text) returns text language plpgsql as $$
declare
  r text;
begin
  perform set_config('request.jwt.claims', harness.claims(uid), true);
  set local role authenticated;
  execute q into r;
  reset role;
  return coalesce(r, 'null');
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;
-- Hole h of «Más cerca»: who holds a row, and whose row it is.
create function pg_temp.hole(h int) returns text language sql as $$
  select coalesce(string_agg(p.display_name || ':' || a.source || coalesce(':' || d.display_name, ''), ' ' order by p.display_name, a.source), '-')
  from public.hole_awards a join public.players p on p.id = a.player_id left join public.players d on d.id = a.decided_by
  where a.round_id = (select id from harness.seed where key = 'round_a1') and a.game_id = 'closest' and a.hole = h
$$;
create function pg_temp.results(g text) returns text language sql as $$
  select coalesce(string_agg(p.display_name || ':' || r.share::text, ' ' order by p.display_name), '-')
  from public.game_results r join public.players p on p.id = r.player_id
  where r.tournament_id = (select id from harness.seed where key = 'tournament_a') and r.game_id = g
$$;
create function pg_temp.save(uid uuid, grp uuid, h int, winners uuid[], by uuid) returns text language sql as $$
  select pg_temp.as_user(uid, format('select public.save_group_awards(%L, %L, %L, %s, %L::uuid[], %L)::text', (select id from harness.seed where key = 'round_a1'), grp, 'closest', h, winners, by))
$$;
create function pg_temp.rule(uid uuid, h int, winners uuid[]) returns text language sql as $$
  select pg_temp.as_user(uid, format('select public.set_hole_ruling(%L, %L, %s, %L::uuid[], null)::text', (select id from harness.seed where key = 'round_a1'), 'closest', h, winners))
$$;
create function pg_temp.bet(uid uuid, winners jsonb) returns text language sql as $$
  select pg_temp.as_user(uid, format('select public.set_game_results(%L, %L, %L::jsonb)::text', (select id from harness.seed where key = 'tournament_a'), 'tacos', winners))
$$;

-- Ceci in group 2, and round 1 live.
insert into public.players (tournament_id, full_name, display_name, sort_order) values (:'t_a', 'Ceci Alfa', 'Ceci', 2) returning id as ceci \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.upsert_groups(:'r1', jsonb_build_array(
  jsonb_build_object('id', :'g1', 'number', 1, 'tee_time', '09:00', 'start_hole', 1, 'player_ids', jsonb_build_array(:'ana', :'beto')),
  jsonb_build_object('number', 2, 'tee_time', '09:10', 'start_hole', 1, 'player_ids', jsonb_build_array(:'ceci')))) -> 1 ->> 'id' as g2 \gset
update public.rounds set status = 'live' where id = :'r1';
reset role;

-- 1. A group's phone saves its winners, replacing its own and nobody else's
select pg_temp.save(:'dev_a', :'g1', 3, array[:'beto']::uuid[], :'ana') \g /dev/null
insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values (:'r1', :'g2', 3, 'closest', :'ceci', :'ceci');
select pg_temp.save(:'dev_a', :'g1', 3, array[:'ana']::uuid[], :'ana') as out \gset
select harness.check(pg_temp.hole(3) = 'Ana:group:Ana Ceci:group:Ceci', 'the group''s winners replaced, the other group''s claim kept: ' || pg_temp.hole(3));
select harness.check((:'out'::jsonb -> 'deleted') @> jsonb_build_array(jsonb_build_object('player_id', :'beto', 'source', 'group')) and jsonb_array_length(:'out'::jsonb -> 'deleted') = 1
  and (:'out'::jsonb -> 'rows' -> 0 ->> 'player_id') = :'ana', 'the answer names what went and what came, by the keys the phone lands');

-- 2. The old bug: a refused winner leaves the group's claim as it was
select pg_temp.save(:'dev_a', :'g1', 3, array[:'ceci']::uuid[], :'ana') as out \gset
select harness.check(:'out' = '22023 Ese jugador no está en este grupo', 'a winner outside the group is refused: ' || :'out');
select harness.check(pg_temp.hole(3) = 'Ana:group:Ana Ceci:group:Ceci', 'and the claim stands, untouched: ' || pg_temp.hole(3));
select pg_temp.save(:'dev_a', :'g1', 3, array[:'carla']::uuid[], :'ana') as out \gset
select harness.check(:'out' = '22023 Ese jugador no es de este torneo', 'a player of another tournament: ' || :'out');
select pg_temp.save(:'dev_a', :'g1', 3, array[:'ana', :'ana']::uuid[], :'ana') as out \gset
select harness.check(:'out' = '22023 Cada ganador va una sola vez', 'one winner twice: ' || :'out');
select pg_temp.as_user(:'dev_a', format('select public.save_group_awards(%L, %L, null, 3, %L::uuid[], null)::text', :'r1', :'g1', array[:'ana']::uuid[])) as out \gset
select harness.check(:'out' like '22023 %', 'no game: ' || :'out');
select pg_temp.save(:'dev_a', :'g1', 19, array[:'ana']::uuid[], :'ana') as out \gset
select harness.check(:'out' like '22023 %', 'a hole past 18: ' || :'out');
select harness.check(pg_temp.hole(3) = 'Ana:group:Ana Ceci:group:Ceci', 'none of them changed the hole');

-- 3. The phone's own player decides, whoever the call names
select pg_temp.save(:'dev_a', :'g1', 4, array[:'beto']::uuid[], :'beto') \g /dev/null
select harness.check(pg_temp.hole(4) = 'Beto:group:Ana', 'decided_by is the phone''s player: ' || pg_temp.hole(4));

-- 4. Only the group's phones while the round is live; the Comité, any group of the round
select pg_temp.save(:'dev_a', :'g2', 5, array[:'ceci']::uuid[], :'ana') as out \gset
select harness.check(:'out' = '42501 Solo alguien del grupo captura este concurso', 'a phone outside the group: ' || :'out');
select pg_temp.save(:'org_b', :'g1', 5, array[:'ana']::uuid[], null) as out \gset
select harness.check(:'out' like '42501 %', 'another tournament''s Comité: ' || :'out');
select pg_temp.save(:'org_a', :'g2', 5, array[:'ceci']::uuid[], null) as out \gset
select harness.check(pg_temp.hole(5) = 'Ceci:group', 'the Comité saves a group''s claim: ' || pg_temp.hole(5));
update public.rounds set status = 'finished' where id = :'r1';
select pg_temp.save(:'dev_a', :'g1', 3, array[:'beto']::uuid[], :'ana') as out \gset
select harness.check(:'out' = '42501 La ronda ya no está en juego; el Comité tiene que capturarlo' and pg_temp.hole(3) = 'Ana:group:Ana Ceci:group:Ceci', 'a closed round refuses the phone and keeps the claim: ' || :'out');
select pg_temp.save(:'org_a', :'g1', 3, array[:'beto']::uuid[], null) as out \gset
select harness.check(pg_temp.hole(3) = 'Beto:group Ceci:group:Ceci', 'the Comité still corrects it after the round: ' || pg_temp.hole(3));
insert into public.rounds (tournament_id, number, holes) values (:'t_a', 2, 18) returning id as r2 \gset
insert into public.groups (round_id, number) values (:'r2', 1) returning id as g_r2 \gset
select pg_temp.save(:'org_a', :'g_r2', 3, array[:'ana']::uuid[], null) as out \gset
select harness.check(:'out' = '22023 Ese grupo no es de esta ronda', 'a group of another round: ' || :'out');
update public.rounds set status = 'live' where id = :'r1';

-- 5. An empty list takes the group's claim, and only its own
select pg_temp.save(:'dev_a', :'g1', 3, array[]::uuid[], :'ana') \g /dev/null
select harness.check(pg_temp.hole(3) = 'Ceci:group:Ceci', 'nobody from this group: its claim goes, the other stays: ' || pg_temp.hole(3));

-- 6. The Comité's ruling: beside the claims, replaced whole, cleared, or «nadie»
select pg_temp.rule(:'org_a', 3, array[:'ana']::uuid[]) \g /dev/null
select harness.check(pg_temp.hole(3) = 'Ana:comite Ceci:group:Ceci', 'a ruling sits beside the claims: ' || pg_temp.hole(3));
select pg_temp.rule(:'org_a', 3, array[:'beto', :'ceci']::uuid[]) as out \gset
select harness.check(pg_temp.hole(3) = 'Beto:comite Ceci:comite Ceci:group:Ceci' and jsonb_array_length(:'out'::jsonb -> 'deleted') = 1, 'a new ruling replaces the old one whole: ' || pg_temp.hole(3));
select pg_temp.rule(:'org_a', 3, array[:'carla']::uuid[]) as out \gset
select harness.check(:'out' = '22023 Ese jugador no es de este torneo' and pg_temp.hole(3) = 'Beto:comite Ceci:comite Ceci:group:Ceci', 'a refused ruling keeps the one in place: ' || :'out');
select pg_temp.rule(:'org_a', 3, null) \g /dev/null
select harness.check(pg_temp.hole(3) = 'Ceci:group:Ceci', 'null clears the ruling, the claims count again: ' || pg_temp.hole(3));
select pg_temp.rule(:'org_a', 3, array[]::uuid[]) as out \gset
select harness.check(pg_temp.hole(3) = '-' and jsonb_array_length(:'out'::jsonb -> 'deleted') = 1, '«nadie» takes the claims too, as the sheet did: ' || pg_temp.hole(3));
select pg_temp.rule(:'dev_a', 3, array[:'ana']::uuid[]) as out \gset
select harness.check(:'out' = '42501 Solo el Comité decide un concurso', 'a player''s phone rules nothing: ' || :'out');

-- 7. A custom bet's result: replaced whole, and never left empty by a refusal
select pg_temp.bet(:'org_a', jsonb_build_array(jsonb_build_object('player_id', :'ana', 'share', 1))) \g /dev/null
select pg_temp.bet(:'org_a', jsonb_build_array(jsonb_build_object('player_id', :'beto', 'share', 1), jsonb_build_object('player_id', :'ceci', 'share', 2))) \g /dev/null
select harness.check(pg_temp.results('tacos') = 'Beto:1 Ceci:2', 'a new result replaces the old: ' || pg_temp.results('tacos'));
select pg_temp.bet(:'org_a', jsonb_build_array(jsonb_build_object('player_id', :'ana', 'share', 0))) as out \gset
select harness.check(:'out' like '22023 %' and pg_temp.results('tacos') = 'Beto:1 Ceci:2', 'a share of 0 is refused and the result stays (it used to be deleted first): ' || :'out');
select pg_temp.bet(:'org_a', jsonb_build_array(jsonb_build_object('player_id', :'carla', 'share', 1))) as out \gset
select harness.check(:'out' = '22023 Ese jugador no es de este torneo' and pg_temp.results('tacos') = 'Beto:1 Ceci:2', 'a winner of another tournament: ' || :'out');
select pg_temp.bet(:'org_a', jsonb_build_array(jsonb_build_object('player_id', :'ana', 'share', 1), jsonb_build_object('player_id', :'ana', 'share', 1))) as out \gset
select harness.check(:'out' = '22023 Cada ganador va una sola vez', 'one winner twice: ' || :'out');
select pg_temp.bet(:'org_a', '{"player_id": "x"}') as out \gset
select harness.check(:'out' like '22023 %', 'not a list: ' || :'out');
select pg_temp.bet(:'dev_a', '[]') as out \gset
select harness.check(:'out' like '42501 %', 'a player''s phone: ' || :'out');
select pg_temp.bet(:'org_a', '[]') \g /dev/null
select harness.check(pg_temp.results('tacos') = '-', 'an empty list clears it');

-- 8. Nobody calls them without a session
select harness.check(not has_function_privilege('anon', 'public.save_group_awards(uuid, uuid, text, int, uuid[], uuid)', 'execute')
  and not has_function_privilege('anon', 'public.set_hole_ruling(uuid, text, int, uuid[], uuid)', 'execute')
  and not has_function_privilege('anon', 'public.set_game_results(uuid, text, jsonb)', 'execute'), 'no session, no call');

rollback;
