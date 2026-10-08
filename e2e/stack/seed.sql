-- ===========================================================================
-- e2e-stack seed: the throwaway tournaments the stack suite plays
-- (e2e/stack/*.spec.ts) on the local Supabase stack (`supabase start`).
--   psql "$E2E_DB_URL" -X -v ON_ERROR_STOP=1 -f e2e/stack/seed.sql
-- e2e/stack/global-setup.ts runs it before every run, after refusing any
-- database that is not on this machine. Re-runnable: it deletes what an
-- earlier run left (tournaments whose slug starts with "e2e-", the e2e course)
-- and makes them again, so every run starts from the same field.
--
-- Every tournament is the same field, which e2e/stack/field.ts mirrors (and
-- global-setup.ts checks the two agree):
--   * one live round of 18 holes on «Campo E2E» (par 72, rating 72.0, slope 113);
--   * 8 players with a typed handicap (`manual`: the number is the course
--     handicap), played at 80%: individual Stableford only, as in
--     scripts/fixtures/settings-minimal.json (the settings below);
--   * two groups of four, both off the 1st;
--   * PIN 1234 for everyone, set by set_player_pin_admin (0005): the same
--     crypt(pin, gen_salt('bf', 8)) as the Comité's set_player_pin, which is
--     what claim_player checks.
-- Names are invented. Nothing here is a secret: the stack is local and is
-- thrown away with the runner.
-- ===========================================================================
\set ON_ERROR_STOP 1
\set QUIET 1

-- scripts/fixtures/settings-minimal.json, on one line: individual Stableford at 80%, 8 × $500 = $2,500 + $1,000 + $500.
\set settings '{"modules":{"individual":{"enabled":true,"label":"Individual","format":"stableford"},"bestRound":{"enabled":false,"label":"Mejor ronda"},"pairs":{"enabled":false,"label":"Parejas","pairing":[],"honoreePicks":false},"snake":{"enabled":false,"label":"La Víbora","puttsThreshold":3},"fewestPutts":{"enabled":false,"label":"Menos putts"},"auction":{"enabled":false,"label":"La Calcutta"}},"tiers":[],"rounds":1,"groupSize":4,"labels":{"lastPlace":"Último lugar","honoree":"Homenajeado"},"entryFee":500,"handicap":{"allowance":0.8,"cap":54,"rounding":"halfUp","perRoundSlope":false,"estimateWeights":[0.45,0.4,0.15]},"day2Cut":{"threshold":36,"pointsPerStroke":2,"maxStrokes":4},"prizes":{"stableford":[2500,1000,500],"pairs":[],"bestRoundPerDay":0,"snakePerSurvivor":0,"fewestPutts":0},"auction":{"openingBid":250,"increment":250,"maxPlayersPerOwner":3,"selfOwnedCountsTowardMax":true,"guestsCanBid":false,"buybackMaxPct":50,"payout":[{"slot":"place","place":1,"share":0.55},{"slot":"place","place":2,"share":0.2},{"slot":"bestOfTier","tier":"C","share":0.1},{"slot":"bestOfTier","tier":"D","share":0.1},{"slot":"lastPlace","share":0.05}]},"pickupPuttsForFewestPutts":3,"tieFallback":"split","spectatorLink":false,"timezone":"America/Mazatlan","currency":"MXN"}'

-- A database holding any other tournament is not a throwaway stack: stop before touching it.
do $$
begin
  if exists (select 1 from public.tournaments where slug not like 'e2e-%') then
    raise exception 'e2e seed: this database holds tournaments other than e2e-*, so it is not a throwaway local stack. Nothing was changed.';
  end if;
end
$$;

begin;

-- What an earlier run left: its tournaments (players, rounds, groups, scores and
-- device links go with them) and the course.
delete from public.tournaments where slug like 'e2e-%';
delete from public.courses where name = 'Campo E2E';

-- The course: one tee, par 72. (par, stroke index) per hole, holes 1 to 18.
insert into public.courses (name, location, source) values ('Campo E2E', 'Local (e2e-stack)', 'manual') returning id as course_id \gset
insert into public.tees (course_id, name, color, rating, slope, par_total, sort_order)
  values (:'course_id', 'Blancas', 'white', 72.0, 113, 72, 0) returning id as tee_id \gset
insert into public.holes (tee_id, number, par, stroke_index)
select :'tee_id', h.number, h.par, h.si
from (values
  (1, 4, 7), (2, 4, 11), (3, 3, 17), (4, 5, 3), (5, 4, 1), (6, 4, 13), (7, 3, 15), (8, 4, 9), (9, 5, 5),
  (10, 4, 8), (11, 3, 18), (12, 4, 2), (13, 5, 12), (14, 4, 4), (15, 4, 10), (16, 3, 16), (17, 4, 6), (18, 5, 14)
) as h(number, par, si);

-- One tournament: the field above, its round live, both groups out.
create function pg_temp.e2e_tournament(p_slug text, p_name text, p_settings jsonb, p_course uuid, p_tee uuid)
returns void
language plpgsql
as $fn$
declare
  tid uuid;
  rid uuid;
  g1 uuid;
  g2 uuid;
  pid uuid;
  p record;
begin
  insert into public.tournaments (slug, name, tagline, join_code, status, settings, counts_for_stats)
  values (p_slug, p_name, 'Torneo de prueba (e2e-stack)', public.generate_join_code(), 'live', p_settings, false)
  returning id into tid;
  insert into public.rounds (tournament_id, number, date, course_id, holes, status)
  values (tid, 1, current_date, p_course, 18, 'live')
  returning id into rid;
  update public.tournaments set current_round_id = rid where id = tid;
  insert into public.groups (round_id, number, tee_time, start_hole) values (rid, 1, '09:00', 1) returning id into g1;
  insert into public.groups (round_id, number, tee_time, start_hole) values (rid, 2, '09:10', 1) returning id into g2;
  for p in
    select * from (values
      (0, 'Ana Alfa', 'Ana', 0, 1),
      (1, 'Beto Bravo', 'Beto', 20, 1),
      (2, 'Caro Cruz', 'Caro', 10, 1),
      (3, 'Dani Díaz', 'Dani', 30, 1),
      (4, 'Eli Estrada', 'Eli', 5, 2),
      (5, 'Fede Fuentes', 'Fede', 15, 2),
      (6, 'Gabi Gómez', 'Gabi', 25, 2),
      (7, 'Hugo Huerta', 'Hugo', 35, 2)
    ) as v(sort_order, full_name, display_name, base_hcp, grp)
  loop
    insert into public.players (tournament_id, full_name, display_name, base_hcp, handicap_source, default_tee_id, sort_order)
    values (tid, p.full_name, p.display_name, p.base_hcp, 'manual', p_tee, p.sort_order)
    returning id into pid;
    perform public.set_player_pin_admin(pid, '1234');
    insert into public.group_members (group_id, player_id) values (case when p.grp = 1 then g1 else g2 end, pid);
  end loop;
end
$fn$;

\o /dev/null
select pg_temp.e2e_tournament('e2e-humo', 'E2E Humo', :'settings'::jsonb, :'course_id', :'tee_id');
select pg_temp.e2e_tournament('e2e-dos-telefonos', 'E2E Dos teléfonos', :'settings'::jsonb, :'course_id', :'tee_id');
select pg_temp.e2e_tournament('e2e-sin-senal', 'E2E Sin señal', :'settings'::jsonb, :'course_id', :'tee_id');
select pg_temp.e2e_tournament('e2e-sesion', 'E2E Sesión', :'settings'::jsonb, :'course_id', :'tee_id');
\o

commit;

\unset QUIET
select t.slug, t.join_code, count(p.*) as players
from public.tournaments t join public.players p on p.tournament_id = t.id
where t.slug like 'e2e-%'
group by t.slug, t.join_code
order by t.slug;
