#!/usr/bin/env bash
# DB-12 seed: a tournament with N players at the busiest moment (Day 1 finished, Day 2 live after 9 holes),
# created by an organizer account via create_tournament, one anonymous phone claimed as player 1.
# Usage: seed.sh <db> <N>    (prints: tid dev). The database needs the harness seed (harness.claims).
# Ported from docs/review/2026-09-30/evidence/verify/V4/perf-seed.sh (DB-12, 0030).
set -euo pipefail
DB=$1; N=$2
case "$DB" in polo_ci*|postgres|template*) echo "refusing: $DB"; exit 2;; esac
P="psql -X -q -At -v ON_ERROR_STOP=1 -d $DB"
ORG=$(cat /proc/sys/kernel/random/uuid); DEV=$(cat /proc/sys/kernel/random/uuid)
$P -c "insert into auth.users (id, email, email_confirmed_at, is_anonymous, raw_user_meta_data) values ('$ORG', 'perf-$N@polo.test', now(), false, '{\"display_name\":\"Org $N\"}'); insert into auth.users (id, is_anonymous) values ('$DEV', true);"
TID=$($P <<SQL | sed -n 's/^TID://p'
begin;
select set_config('request.jwt.claims', harness.claims('$ORG'), true) \g /dev/null
set local role authenticated;
select 'TID:' || id from public.create_tournament('Perf $N', '{}'::jsonb, 'perf-$N', null);
commit;
SQL
)
[ -n "$TID" ] || { echo "create_tournament failed"; exit 1; }
$P <<SQL >/dev/null
do \$\$
declare
  tid uuid := '$TID'; n int := $N; cid uuid; teeid uuid; r1 uuid; r2 uuid; rid uuid; pids uuid[]; g uuid; k int;
begin
  insert into public.courses (name) values ('Perf course ' || n) returning id into cid;
  insert into public.tees (course_id, name, rating, slope, par_total) values (cid, 'Azules', 71.8, 128, 72) returning id into teeid;
  insert into public.holes (tee_id, number, par, stroke_index)
    select teeid, h, (array[4,4,3,5,4,4,3,4,5,4,4,3,5,4,4,3,4,5])[h], (array[7,3,15,1,11,5,17,9,13,8,4,16,2,12,6,18,10,14])[h]
    from generate_series(1, 18) h;
  insert into public.players (tournament_id, full_name, display_name, base_hcp, default_tee_id, sort_order)
    select tid, 'Jugador ' || i, 'J' || i, 4 + (i % 26), teeid, i from generate_series(1, n) i;
  select array_agg(id order by sort_order) into pids from public.players where tournament_id = tid;
  insert into public.rounds (tournament_id, number, date, course_id, holes, status) values (tid, 1, '2027-04-09', cid, 18, 'scheduled') returning id into r1;
  insert into public.rounds (tournament_id, number, date, course_id, holes, status) values (tid, 2, '2027-04-10', cid, 18, 'scheduled') returning id into r2;
  foreach rid in array array[r1, r2] loop
    for k in 0 .. (n / 4) - 1 loop
      insert into public.groups (round_id, number, tee_time, start_hole) values (rid, k + 1, time '09:00' + k * interval '10 minutes', 1) returning id into g;
      insert into public.group_members (group_id, player_id) select g, pids[k * 4 + j] from generate_series(1, 4) j;
    end loop;
    insert into public.round_tees (round_id, player_id, tee_id) select rid, p, teeid from unnest(pids) p;
  end loop;
  -- Day 1: 18 holes each; Day 2: 9 holes each (mid-round).
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
    select r1, p, h, 3 + floor(random() * 4)::int, 1 + floor(random() * 2)::int, false, p, now() from unnest(pids) p, generate_series(1, 18) h;
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
    select r2, p, h, 3 + floor(random() * 4)::int, 1 + floor(random() * 2)::int, false, p, now() from unnest(pids) p, generate_series(1, 9) h;
  update public.rounds set status = 'finished' where id = r1;
  update public.rounds set status = 'live' where id = r2;
  update public.tournaments set status = 'live', current_round_id = r2 where id = tid;
  insert into public.device_sessions (auth_user_id, player_id, tournament_id) values ('$DEV', pids[1], tid);
end \$\$;
analyze;
SQL
echo "$TID $DEV"
