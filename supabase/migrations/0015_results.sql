-- 0015: results history and the Polo index.
--
-- * round_results: one row per player per FINISHED round, computed here in
--   SQL from the scores (never from a client payload), by trigger: when a
--   round becomes or stops being finished, and when a finished round's
--   scores change. Gross, adjusted gross (net double bogey on the WHS course
--   handicap of the tee played; a pick-up counts as net double bogey), the
--   differential, gross counts and the per-hole detail.
-- * The Polo index (profiles.polo_index): WHS, the latest 20 differentials of
--   the profile's confirmed players in tournaments that count for stats.
--   Recomputed by trigger on every path: results, links, deleted players,
--   `counts_for_stats`.
-- * tournament_results (rank, points, awards) and the private
--   tournament_money (net) are published by the Comité from the engine once
--   the tournament is finished; they disappear if it leaves `finished`.
-- All arithmetic is integer tenths, identical to src/engine/profile/whs.ts
-- (shared cases: src/engine/profile/cases/whs.json).

-- ---------------------------------------------------------------------------
-- WHS arithmetic
-- ---------------------------------------------------------------------------
create or replace function public.whs_strokes(ch int, si int)
returns int language sql immutable set search_path = public as $$
  select case
    when ch >= 0 then ch / 18 + case when si <= ch % 18 then 1 else 0 end
    else case when si > 18 + ch then -1 else 0 end
  end
$$;

create or replace function public.whs_course_hcp(index10 int, slope int, rating10 int, par int)
returns int language sql immutable set search_path = public as $$
  select floor((2 * (index10 * slope + (rating10 - par * 10) * 113) + 1130)::numeric / 2260)::int
$$;

create or replace function public.whs_diff10(ags int, rating10 int, slope int)
returns int language sql immutable set search_path = public as $$
  select floor((2 * (ags * 10 - rating10) * 113 + slope)::numeric / (2 * slope))::int
$$;

/** Differentials in tenths, newest first; only the latest 20 count. Null under 3. */
create or replace function public.whs_index10(diffs int[])
returns int language plpgsql immutable set search_path = public as $$
declare
  n int;
  k int;
  adj int := 0;
  s int;
begin
  diffs := diffs[1:20];
  n := coalesce(array_length(diffs, 1), 0);
  if n < 3 then
    return null;
  end if;
  k := case when n <= 5 then 1 when n <= 8 then 2 when n <= 11 then 3 when n <= 14 then 4 when n <= 16 then 5 when n <= 18 then 6 when n = 19 then 7 else 8 end;
  adj := case n when 3 then -20 when 4 then -10 when 6 then -10 else 0 end;
  select sum(d) into s from (select d from unnest(diffs) with ordinality u(d, i) order by d, i limit k) x;
  return least(floor((2 * s + k)::numeric / (2 * k))::int + adj, 540);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
alter table public.tournaments add column counts_for_stats boolean not null default true;
-- The rehearsal is practice: it shows in profiles, tagged, but never moves an index.
update public.tournaments set counts_for_stats = false where slug like 'ensayo%';

create table public.round_results (
  round_id uuid not null references public.rounds (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  played_on date,
  round_number integer not null,
  holes integer not null,
  thru integer not null,
  complete boolean not null,
  tee_id uuid,
  tee_name text,
  course_name text,
  rating numeric(4, 1),
  slope integer,
  par integer,
  course_hcp integer,
  gross integer,
  ags integer,
  differential numeric(4, 1),
  putts integer,
  eagles integer not null default 0,
  birdies integer not null default 0,
  pars integer not null default 0,
  bogeys integer not null default 0,
  doubles integer not null default 0,
  pickups integer not null default 0,
  detail jsonb not null default '[]',
  computed_at timestamptz not null default now(),
  primary key (round_id, player_id)
);
create index round_results_player_idx on public.round_results (player_id);
create index round_results_tournament_idx on public.round_results (tournament_id);

create table public.tournament_results (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  rank integer,
  rank_label text,
  field integer not null,
  points integer,
  per_round integer[] not null default '{}',
  awards text[] not null default '{}',
  published_at timestamptz not null default now(),
  primary key (tournament_id, player_id)
);

create table public.tournament_money (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  net integer not null,
  currency text not null,
  published_at timestamptz not null default now(),
  primary key (tournament_id, player_id)
);

alter table public.round_results enable row level security;
alter table public.tournament_results enable row level security;
alter table public.tournament_money enable row level security;
create policy round_results_read on public.round_results for select using (public.is_tournament_member(tournament_id));
create policy tournament_results_read on public.tournament_results for select using (public.is_tournament_member(tournament_id));
-- Money is private: its owner (a confirmed profile) and the tournament's Comité.
create policy tournament_money_read on public.tournament_money for select using (
  public.is_tournament_organizer(tournament_id)
  or exists (select 1 from public.players p where p.id = tournament_money.player_id and p.profile_id = auth.uid() and p.profile_status = 'confirmed')
);
revoke insert, update, delete on public.round_results, public.tournament_results, public.tournament_money from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Round results
-- ---------------------------------------------------------------------------
create or replace function public.refresh_round_results(p_round uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.rounds;
  pl record;
  t public.tees;
  cname text;
  tee uuid;
  idx numeric;
  ch int;
  par18 int;
  agg record;
begin
  select * into r from public.rounds where id = p_round;
  delete from public.round_results where round_id = p_round;
  if r.id is null or r.status <> 'finished' then
    return;
  end if;
  select name into cname from public.courses where id = r.course_id;
  for pl in
    select p.* from public.players p
    where p.tournament_id = r.tournament_id
      and exists (select 1 from public.scores s where s.round_id = r.id and s.player_id = p.id)
  loop
    -- The tee played, exactly as the engine picks it (teeForPlayerRound).
    tee := coalesce(
      (select rt.tee_id from public.round_tees rt where rt.round_id = r.id and rt.player_id = pl.id),
      (select x.id from public.tees x where x.id = pl.default_tee_id and (r.course_id is null or x.course_id = r.course_id)),
      (select x.id from public.tees x where x.course_id = r.course_id order by x.sort_order, x.name, x.id limit 1)
    );
    t := null;
    select * into t from public.tees where id = tee;
    select coalesce(sum(h.par), 0) into par18 from public.holes h where h.tee_id = t.id and h.number <= 18;

    -- WHS course handicap on that tee: the profile's index if it has one, else the tournament's index.
    idx := null;
    if pl.profile_status = 'confirmed' then
      select case when pr.index_source = 'manual' then pr.manual_index else pr.polo_index end into idx from public.profiles pr where pr.id = pl.profile_id;
    end if;
    if idx is null and pl.handicap_source in ('index', 'estimate') then
      idx := coalesce(pl.handicap_index, pl.base_hcp);
    end if;
    if idx is not null and t.slope is not null and t.rating is not null and par18 > 0 then
      ch := public.whs_course_hcp(round(idx * 10)::int, t.slope, round(t.rating * 10)::int, par18);
    else
      -- A manual handicap is already a course handicap (§13b-D).
      ch := round(coalesce(idx, pl.base_hcp))::int;
    end if;

    select
      count(*) filter (where s.strokes is not null or s.picked_up) as thru,
      count(*) as tee_holes,
      sum(case when s.picked_up then h.par + 2 + public.whs_strokes(ch, h.stroke_index) else least(s.strokes, h.par + 2 + public.whs_strokes(ch, h.stroke_index)) end) as ags,
      sum(s.strokes) filter (where not s.picked_up) as gross,
      bool_or(coalesce(s.picked_up, false)) as any_pick,
      sum(h.par) as par,
      sum(s.putts) as putts,
      count(*) filter (where not s.picked_up and s.strokes - h.par <= -2) as eagles,
      count(*) filter (where not s.picked_up and s.strokes - h.par = -1) as birdies,
      count(*) filter (where not s.picked_up and s.strokes = h.par) as pars,
      count(*) filter (where not s.picked_up and s.strokes - h.par = 1) as bogeys,
      count(*) filter (where not s.picked_up and s.strokes - h.par >= 2) as doubles,
      count(*) filter (where s.picked_up) as pickups,
      coalesce(jsonb_agg(jsonb_build_array(h.number, h.par, h.stroke_index, s.strokes, s.putts, coalesce(s.picked_up, false)) order by h.number), '[]'::jsonb) as detail
    into agg
    from public.holes h
    left join public.scores s on s.round_id = r.id and s.player_id = pl.id and s.hole = h.number
    where h.tee_id = t.id and h.number <= r.holes;

    insert into public.round_results (
      round_id, player_id, tournament_id, played_on, round_number, holes, thru, complete, tee_id, tee_name, course_name, rating, slope, par, course_hcp,
      gross, ags, differential, putts, eagles, birdies, pars, bogeys, doubles, pickups, detail
    ) values (
      r.id, pl.id, r.tournament_id, r.date, r.number, r.holes, coalesce(agg.thru, 0),
      coalesce(agg.thru, 0) = r.holes and coalesce(agg.tee_holes, 0) = r.holes,
      t.id, t.name, cname, t.rating, t.slope, agg.par, ch,
      case when coalesce(agg.thru, 0) = r.holes and agg.tee_holes = r.holes and not agg.any_pick then agg.gross end,
      case when coalesce(agg.thru, 0) = r.holes and agg.tee_holes = r.holes then agg.ags end,
      -- A differential needs a complete 18-hole round on a rated tee.
      case when r.holes = 18 and coalesce(agg.thru, 0) = 18 and agg.tee_holes = 18 and t.rating is not null and t.slope is not null
        then public.whs_diff10(agg.ags::int, round(t.rating * 10)::int, t.slope) / 10.0 end,
      agg.putts, coalesce(agg.eagles, 0), coalesce(agg.birdies, 0), coalesce(agg.pars, 0), coalesce(agg.bogeys, 0), coalesce(agg.doubles, 0), coalesce(agg.pickups, 0),
      coalesce(agg.detail, '[]'::jsonb)
    );
  end loop;
end;
$$;
revoke execute on function public.refresh_round_results(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The Polo index
-- ---------------------------------------------------------------------------
create or replace function public.recompute_profile_index(pid uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  d int[];
  n int;
  idx int;
begin
  if pid is null then
    return;
  end if;
  select array_agg(x.diff10 order by x.played desc nulls last, x.num desc, x.computed desc), count(*)
  into d, n
  from (
    select round(rr.differential * 10)::int as diff10, rr.played_on as played, rr.round_number as num, rr.computed_at as computed
    from public.round_results rr
    join public.players p on p.id = rr.player_id
    join public.tournaments tr on tr.id = rr.tournament_id
    where p.profile_id = pid and p.profile_status = 'confirmed' and tr.counts_for_stats and rr.differential is not null
    order by rr.played_on desc nulls last, rr.round_number desc, rr.computed_at desc
    limit 20
  ) x;
  idx := public.whs_index10(d);
  update public.profiles
  set polo_index = idx / 10.0, polo_index_rounds = coalesce(n, 0), polo_index_at = case when idx is null then null else now() end
  where id = pid
    and (polo_index is distinct from idx / 10.0 or polo_index_rounds is distinct from coalesce(n, 0));
end;
$$;
revoke execute on function public.recompute_profile_index(uuid) from public, anon, authenticated;

-- Computed columns don't count as the person editing their profile (the "first time" welcome reads updated_at).
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row
  when ((old.handle, old.display_name, old.full_name, old.avatar_url, old.home_club, old.city, old.bio, old.index_source, old.manual_index, old.discoverable)
    is distinct from (new.handle, new.display_name, new.full_name, new.avatar_url, new.home_club, new.city, new.bio, new.index_source, new.manual_index, new.discoverable))
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Triggers: every path that changes an input
-- ---------------------------------------------------------------------------
/** Scores of a finished round changed (statement-level: a restore or a bulk fix refreshes each round once). */
create or replace function public.scores_refresh_results()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.refresh_round_results(x.round_id)
  from (select distinct c.round_id from changed c) x
  join public.rounds r on r.id = x.round_id and r.status = 'finished';
  return null;
end;
$$;
create trigger scores_results_ins after insert on public.scores referencing new table as changed for each statement execute function public.scores_refresh_results();
create trigger scores_results_upd after update on public.scores referencing new table as changed for each statement execute function public.scores_refresh_results();
create trigger scores_results_del after delete on public.scores referencing old table as changed for each statement execute function public.scores_refresh_results();

/** A round became finished, or stopped being finished (reopened, cancelled). */
create or replace function public.rounds_refresh_results()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.refresh_round_results(new.id);
  return null;
end;
$$;
create trigger rounds_results after update of status on public.rounds
  for each row when (old.status is distinct from new.status and (old.status = 'finished' or new.status = 'finished'))
  execute function public.rounds_refresh_results();
create trigger rounds_results_new after insert on public.rounds
  for each row when (new.status = 'finished')
  execute function public.rounds_refresh_results();

/** Results changed: recompute the index of every profile they belong to. */
create or replace function public.round_results_reindex()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.recompute_profile_index(x.pid)
  from (select distinct p.profile_id as pid from changed c join public.players p on p.id = c.player_id where p.profile_id is not null) x;
  return null;
end;
$$;
create trigger round_results_reindex_ins after insert on public.round_results referencing new table as changed for each statement execute function public.round_results_reindex();
create trigger round_results_reindex_upd after update on public.round_results referencing new table as changed for each statement execute function public.round_results_reindex();
create trigger round_results_reindex_del after delete on public.round_results referencing old table as changed for each statement execute function public.round_results_reindex();

/** A link changed or a linked player was deleted: both profiles' indexes. */
create or replace function public.players_reindex()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_profile_index(old.profile_id);
    return null;
  end if;
  if old.profile_id is distinct from new.profile_id or old.profile_status is distinct from new.profile_status then
    perform public.recompute_profile_index(old.profile_id);
    if new.profile_id is distinct from old.profile_id then
      perform public.recompute_profile_index(new.profile_id);
    end if;
  end if;
  return null;
end;
$$;
create trigger players_reindex after update of profile_id, profile_status on public.players for each row execute function public.players_reindex();
create trigger players_reindex_del after delete on public.players for each row when (old.profile_id is not null) execute function public.players_reindex();

/** `counts_for_stats` flipped, or the tournament left `finished` (its published results go). */
create or replace function public.tournaments_results_state()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if old.counts_for_stats is distinct from new.counts_for_stats then
    perform public.recompute_profile_index(p.profile_id)
    from public.players p where p.tournament_id = new.id and p.profile_id is not null and p.profile_status = 'confirmed';
  end if;
  if old.status = 'finished' and new.status <> 'finished' then
    delete from public.tournament_results where tournament_id = new.id;
    delete from public.tournament_money where tournament_id = new.id;
  end if;
  return null;
end;
$$;
create trigger tournaments_results_state after update of counts_for_stats, status on public.tournaments for each row execute function public.tournaments_results_state();

-- ---------------------------------------------------------------------------
-- Tournament results (from the engine, by the Comité)
-- ---------------------------------------------------------------------------
/**
 * p_rows: [{ playerId, rank, rankLabel, points, perRound: int[], awards: text[], net }]
 * Replaces the tournament's published results; also refreshes every finished
 * round's results (tee or rating edits since the round finished).
 */
create or replace function public.publish_tournament_results(p_tournament_id uuid, p_rows jsonb, p_currency text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  t public.tournaments;
  n int;
  f int;
begin
  select * into t from public.tournaments where id = p_tournament_id;
  if t.id is null or not public.is_tournament_organizer(t.id) then
    raise exception 'Solo el Comité publica resultados' using errcode = '42501';
  end if;
  if t.status <> 'finished' then
    raise exception 'El torneo todavía no termina' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Resultados inválidos' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as x("playerId" uuid)
    where x."playerId" is null or public.player_tournament_id(x."playerId") is distinct from t.id
  ) then
    raise exception 'Un jugador no es de este torneo' using errcode = '22023';
  end if;

  perform public.refresh_round_results(r.id) from public.rounds r where r.tournament_id = t.id and r.status = 'finished';

  delete from public.tournament_results where tournament_id = t.id;
  delete from public.tournament_money where tournament_id = t.id;
  select count(*) filter (where x.rank is not null) into f from jsonb_to_recordset(p_rows) as x(rank int);
  insert into public.tournament_results (tournament_id, player_id, rank, rank_label, field, points, per_round, awards)
  select t.id, x."playerId", x.rank, x."rankLabel", f, x.points, coalesce(x."perRound", '{}'), coalesce(x.awards, '{}')
  from jsonb_to_recordset(p_rows) as x("playerId" uuid, rank int, "rankLabel" text, points int, "perRound" int[], awards text[]);
  get diagnostics n = row_count;
  insert into public.tournament_money (tournament_id, player_id, net, currency)
  select t.id, x."playerId", x.net, coalesce(nullif(p_currency, ''), 'MXN')
  from jsonb_to_recordset(p_rows) as x("playerId" uuid, net int)
  where x.net is not null;
  return jsonb_build_object('players', n, 'field', f);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads for profiles
-- ---------------------------------------------------------------------------
/** A profile's rounds, newest first, for people who may see the full profile. */
create or replace function public.profile_rounds(p_handle text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  pr public.profiles;
begin
  select * into pr from public.profiles where handle = lower(btrim(coalesce(p_handle, '')));
  if pr.id is null or not public.profile_visible_to_me(pr.id) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'roundId', rr.round_id, 'tournamentId', tr.id, 'slug', tr.slug, 'tournament', tr.name, 'practice', not tr.counts_for_stats,
      'playedOn', rr.played_on, 'roundNumber', rr.round_number, 'holes', rr.holes, 'complete', rr.complete,
      'course', rr.course_name, 'tee', rr.tee_name, 'rating', rr.rating, 'slope', rr.slope, 'par', rr.par, 'courseHcp', rr.course_hcp,
      'gross', rr.gross, 'ags', rr.ags, 'differential', rr.differential, 'putts', rr.putts,
      'eagles', rr.eagles, 'birdies', rr.birdies, 'pars', rr.pars, 'bogeys', rr.bogeys, 'doubles', rr.doubles, 'pickups', rr.pickups,
      'detail', rr.detail
    ) order by rr.played_on desc nulls last, rr.round_number desc, rr.computed_at desc)
    from public.round_results rr
    join public.players p on p.id = rr.player_id
    join public.tournaments tr on tr.id = rr.tournament_id
    where p.profile_id = pr.id and p.profile_status = 'confirmed'
  ), '[]'::jsonb);
end;
$$;

/** A profile's tournaments with their published finish, for people who may see the full profile. */
create or replace function public.profile_tournaments(p_handle text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  pr public.profiles;
begin
  select * into pr from public.profiles where handle = lower(btrim(coalesce(p_handle, '')));
  if pr.id is null or not public.profile_visible_to_me(pr.id) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'tournamentId', tr.id, 'slug', tr.slug, 'name', tr.name, 'logoUrl', tr.logo_url, 'status', tr.status, 'practice', not tr.counts_for_stats,
      'playerId', p.id, 'displayName', p.display_name,
      'startsOn', (select min(r.date) from public.rounds r where r.tournament_id = tr.id),
      'rank', res.rank, 'rankLabel', res.rank_label, 'field', res.field, 'points', res.points, 'awards', coalesce(res.awards, '{}')
    ) order by tr.created_at desc)
    from public.players p
    join public.tournaments tr on tr.id = p.tournament_id
    left join public.tournament_results res on res.tournament_id = tr.id and res.player_id = p.id
    where p.profile_id = pr.id and p.profile_status = 'confirmed'
  ), '[]'::jsonb);
end;
$$;

/** My money, tournament by tournament (only mine, only published). */
create or replace function public.my_money()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tournamentId', tr.id, 'slug', tr.slug, 'name', tr.name, 'net', m.net, 'currency', m.currency, 'publishedAt', m.published_at, 'practice', not tr.counts_for_stats
  ) order by m.published_at desc), '[]'::jsonb)
  from public.tournament_money m
  join public.players p on p.id = m.player_id
  join public.tournaments tr on tr.id = m.tournament_id
  where p.profile_id = auth.uid() and p.profile_status = 'confirmed'
$$;

/** Now with each profile's index (for "Usar índice Polo" in Comité › Jugadores). */
create or replace function public.tournament_profiles(tid uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId', p.id, 'handle', pr.handle, 'displayName', pr.display_name, 'avatarUrl', pr.avatar_url, 'status', p.profile_status,
    'index', case when pr.index_source = 'manual' then pr.manual_index else pr.polo_index end, 'indexSource', pr.index_source
  )), '[]'::jsonb)
  from public.players p join public.profiles pr on pr.id = p.profile_id
  where p.tournament_id = tid
    and public.is_tournament_member(tid)
    and (p.profile_status = 'confirmed' or public.is_tournament_organizer(tid))
$$;

-- Results for the rounds already finished.
select public.refresh_round_results(r.id) from public.rounds r where r.status = 'finished';
