-- DB panel seed (run as postgres in the panelist's own harness database).
-- Builds, with deterministic ids (md5 → uuid):
--   * one course "Campo Panel" with a rated 18-hole tee
--   * polo_seed_tournament(tag, n_players, linked):
--       n players with accounts + confirmed profiles, 2 rounds (R1 finished,
--       R2 live), groups of 4, R1 fully scored, R2 scored through hole 9,
--       pairs, a few snake tiebreaks, payments, a Calcutta with lots and bids,
--       two instance games (side-pot entrants, a custom-bet result, contest claims).
--   * rivalries between consecutive linked profiles
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.u(k text) returns uuid language sql immutable as $$ select md5(k)::uuid $$;

-- Course + tee + 18 holes (par 72, SI permutation)
insert into public.courses (id, name, source) values (pg_temp.u('course'), 'Campo Panel', 'manual') on conflict do nothing;
insert into public.tees (id, course_id, name, color, rating, slope, par_total) values (pg_temp.u('tee'), pg_temp.u('course'), 'Azul', 'azul', 71.2, 128, 72) on conflict do nothing;
insert into public.holes (tee_id, number, par, stroke_index)
select pg_temp.u('tee'), h, (array[4,4,3,5,4,4,3,4,5,4,4,3,5,4,4,3,4,5])[h], (array[7,3,15,1,11,9,17,5,13,8,4,16,2,12,10,18,6,14])[h]
from generate_series(1, 18) h on conflict do nothing;

-- Organizer account
insert into auth.users (id, email, is_anonymous) values (pg_temp.u('org'), 'org@panel.test', false) on conflict do nothing;

create or replace function public.polo_seed_tournament(tag text, n int, linked boolean default true)
returns uuid
language plpgsql
as $$
declare
  t uuid := md5('t:' || tag)::uuid;
  r1 uuid := md5('r1:' || tag)::uuid;
  r2 uuid := md5('r2:' || tag)::uuid;
  pid uuid;
  uid uuid;
  i int;
  g int;
  ngroups int := ceil(n / 4.0);
  pars int[] := array[4,4,3,5,4,4,3,4,5,4,4,3,5,4,4,3,4,5];
begin
  insert into public.tournaments (id, slug, name, join_code, status, settings, created_by)
  values (t, 'panel-' || tag, 'Panel ' || tag, upper(substr(translate(md5(tag), '01lo', '2345'), 1, 6)), 'live', '{}'::jsonb, md5('org')::uuid);
  -- join_code must match ^[A-Z2-9]{6}$
  update public.tournaments set join_code = translate(join_code, 'ABCDEF0189', 'ABCDEFGHJK') where id = t;
  insert into public.tournament_organizers (tournament_id, auth_user_id, role) values (t, md5('org')::uuid, 'owner');
  insert into public.rounds (id, tournament_id, number, course_id, holes, status, date)
  values (r1, t, 1, md5('course')::uuid, 18, 'live', date '2027-04-09'), (r2, t, 2, md5('course')::uuid, 18, 'live', date '2027-04-10');

  for i in 1..n loop
    pid := md5('p:' || tag || ':' || i)::uuid;
    uid := md5('u:' || tag || ':' || i)::uuid;
    insert into auth.users (id, email, is_anonymous) values (uid, 'p' || i || '.' || tag || '@panel.test', false) on conflict do nothing;
    if linked then
      insert into public.profiles (id, handle, display_name) values (uid, left(tag || 'p' || lpad(i::text, 3, '0'), 20), 'Jugador ' || i) on conflict do nothing;
    end if;
    insert into public.players (id, tournament_id, full_name, display_name, tier, base_hcp, handicap_source, handicap_index, default_tee_id, sort_order, profile_id, profile_status)
    values (pid, t, 'Jugador ' || i || ' ' || tag, 'J' || i, (array['A','B','C','D'])[1 + (i - 1) % 4], 8 + (i % 20), 'index', 8 + (i % 20), md5('tee')::uuid, i,
            case when linked then uid end, case when linked then 'confirmed' end);
  end loop;

  -- Groups of four, both rounds
  for g in 1..ngroups loop
    insert into public.groups (id, round_id, number, start_hole) values (md5('g1:' || tag || ':' || g)::uuid, r1, g, 1), (md5('g2:' || tag || ':' || g)::uuid, r2, g, 1);
    insert into public.group_members (group_id, player_id)
    select md5('g1:' || tag || ':' || g)::uuid, md5('p:' || tag || ':' || gs.j)::uuid from generate_series((g - 1) * 4 + 1, least(g * 4, n)) gs(j);
    insert into public.group_members (group_id, player_id)
    select md5('g2:' || tag || ':' || g)::uuid, md5('p:' || tag || ':' || gs.j)::uuid from generate_series((g - 1) * 4 + 1, least(g * 4, n)) gs(j);
  end loop;

  -- Pairs (1-2, 3-4, ...)
  insert into public.pairs (id, tournament_id, name, player1_id, player2_id, kind, drawn_at)
  select md5('pair:' || tag || ':' || gs.k)::uuid, t, 'Pareja ' || gs.k, md5('p:' || tag || ':' || (2 * gs.k - 1))::uuid, md5('p:' || tag || ':' || (2 * gs.k))::uuid, 'AD', now()
  from generate_series(1, n / 2) gs(k);

  -- Scores: R1 all 18 holes, R2 holes 1-9 (one statement each, as a restore or a bulk fix would)
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
  select r1, md5('p:' || tag || ':' || a.j)::uuid, b.h, pars[b.h] + ((a.j * 7 + b.h * 3) % 4) - 1, least(1 + ((a.j + b.h) % 3), pars[b.h] + ((a.j * 7 + b.h * 3) % 4) - 1), false,
         md5('p:' || tag || ':' || (((a.j - 1) / 4) * 4 + 1))::uuid, now()
  from generate_series(1, n) a(j), generate_series(1, 18) b(h);
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
  select r2, md5('p:' || tag || ':' || a.j)::uuid, b.h, pars[b.h] + ((a.j * 5 + b.h) % 4) - 1, least(1 + ((a.j * 3 + b.h) % 3), pars[b.h] + ((a.j * 5 + b.h) % 4) - 1), false,
         md5('p:' || tag || ':' || (((a.j - 1) / 4) * 4 + 1))::uuid, now()
  from generate_series(1, n) a(j), generate_series(1, 9) b(h);

  -- Snake tiebreaks (R1, group 1, holes 3 and 7)
  insert into public.snake_tiebreaks (round_id, group_id, hole, last_holed_player_id, decided_by)
  values (r1, md5('g1:' || tag || ':1')::uuid, 3, md5('p:' || tag || ':2')::uuid, md5('p:' || tag || ':1')::uuid),
         (r1, md5('g1:' || tag || ':1')::uuid, 7, md5('p:' || tag || ':4')::uuid, md5('p:' || tag || ':1')::uuid);

  -- Card signatures for R1 (every pair)
  insert into public.card_signatures (round_id, pair_id, signed_by)
  select r1, md5('pair:' || tag || ':' || gs.k)::uuid, md5('p:' || tag || ':' || (case when gs.k % 2 = 1 then 2 * gs.k + 1 else 2 * gs.k - 3 end))::uuid
  from generate_series(1, n / 2) gs(k);

  -- Calcutta: one lot per player, sold to the next player, a bid each
  insert into public.calcutta_lots (id, tournament_id, player_id, lot_number, status, price, owner_id, sold_at)
  select md5('lot:' || tag || ':' || gs.j)::uuid, t, md5('p:' || tag || ':' || gs.j)::uuid, gs.j, 'sold', 250 * (1 + gs.j % 5), md5('p:' || tag || ':' || (1 + gs.j % n))::uuid, now()
  from generate_series(1, n) gs(j);
  insert into public.calcutta_bids (lot_id, bidder_id, amount)
  select md5('lot:' || tag || ':' || gs.j)::uuid, md5('p:' || tag || ':' || (1 + gs.j % n))::uuid, 250 * (1 + gs.j % 5) from generate_series(1, n) gs(j);
  insert into public.calcutta_buybacks (lot_id, pct, amount, paid) values (md5('lot:' || tag || ':1')::uuid, 50, 125, false);

  -- Payments: entry per player (paid), one payout
  insert into public.payments (tournament_id, from_player_id, to_player_id, amount, kind, paid)
  select t, md5('p:' || tag || ':' || gs.j)::uuid, null, 2500, 'entry', true from generate_series(1, n) gs(j);

  -- Instance games: side-pot entrants (game 'skins'), a custom bet result ('tacos'),
  -- closest-to-the-pin claims on R1 hole 3 by groups 1 and 2 (different winners)
  insert into public.game_entries (tournament_id, game_id, player_id)
  select t, 'skins', md5('p:' || tag || ':' || gs.j)::uuid from generate_series(1, least(n, 8)) gs(j);
  insert into public.game_results (tournament_id, game_id, player_id, share) values (t, 'tacos', md5('p:' || tag || ':3')::uuid, 1);
  insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by)
  values (r1, md5('g1:' || tag || ':1')::uuid, 3, 'ctp', md5('p:' || tag || ':1')::uuid, md5('p:' || tag || ':1')::uuid),
         (r1, md5('g1:' || tag || ':2')::uuid, 3, 'ctp', md5('p:' || tag || ':5')::uuid, md5('p:' || tag || ':5')::uuid),
         (r1, md5('g1:' || tag || ':1')::uuid, 7, 'ctp', md5('p:' || tag || ':2')::uuid, md5('p:' || tag || ':1')::uuid);

  -- Rivalries between consecutive linked profiles (active since before the rounds)
  if linked then
    insert into public.rivalries (a, b, status, start_strokes, cap, strokes, started_at)
    select md5('u:' || tag || ':' || gs.j)::uuid, md5('u:' || tag || ':' || (gs.j + 1))::uuid, 'active', 0, 18, 0, timestamptz '2027-01-01'
    from generate_series(1, n - 1, 2) gs(j);
  end if;

  -- Finish round 1 (fires refresh_round_results, the index and rivalry replays)
  update public.rounds set status = 'finished' where id = r1;
  update public.tournaments set current_round_id = r2 where id = t;
  return t;
end;
$$;

select public.polo_seed_tournament('t12', 12);
select public.polo_seed_tournament('t60', 60);

-- A device (anonymous) PIN-claimed as player 2 of t12 and of t60 (for "as a player" tests)
insert into auth.users (id, is_anonymous) values (md5('dev12')::uuid, true), (md5('dev60')::uuid, true) on conflict do nothing;
insert into public.device_sessions (auth_user_id, player_id, tournament_id)
values (md5('dev12')::uuid, md5('p:t12:2')::uuid, md5('t:t12')::uuid),
       (md5('dev60')::uuid, md5('p:t60:2')::uuid, md5('t:t60')::uuid)
on conflict do nothing;

select t.slug, (select count(*) from public.players p where p.tournament_id = t.id) players,
       (select count(*) from public.scores s join public.rounds r on r.id = s.round_id where r.tournament_id = t.id) scores,
       (select count(*) from public.round_results rr where rr.tournament_id = t.id) round_results,
       (select count(*) from public.audit_log a where a.tournament_id = t.id) audit_rows
from public.tournaments t where t.slug like 'panel-%' order by 1;
