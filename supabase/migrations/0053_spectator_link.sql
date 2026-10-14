-- 0053: a link to watch a tournament without a PIN (STRAT-05, §18.9).
--
-- The group chat, partners and the villa TV could see the boards only by
-- claiming a player with his PIN, and the TV then ran inside that player's
-- session, able to save scores in his name. Now the Comité can make a link to
-- watch: whoever has it opens /v/<token> and sees the boards with no account
-- and no session, and nothing there writes.
--   * The token: 144 random bits, URL-safe, in a table of its own and never in
--     the settings (every member reads those, the export carries them and
--     duplicate_tournament copies them). Only the Comité reads it, gives it a
--     new token (the old one stops working at once) or switches it off. RLS on,
--     no policies, no client grants: only the functions below touch it.
--   * Each save names the link as the Comité's screen showed it. One made
--     against a link that changed meanwhile (another Comité phone made it,
--     changed its money or its token, or switched it off) is refused whole,
--     so a stale screen never shows the money on a link already shared
--     without the question the card asks first.
--   * «Sin dinero» (the default) or «Con dinero». Without money the answer has
--     no payment, no Comité decision on money, no Calcutta lot, bid or buyback,
--     no banker, and the settings come with every peso at zero, the Calcutta
--     off and each side game for fun: what the boards compute from it has no
--     money in it. A side pot is left out altogether, with who is in it: who
--     is in a side pot is who paid into it.
--   * The settings carry only the keys the settings schema knows, at every
--     depth (`spectator_settings_spec`): a key typed by hand never reaches it.
--   * The answer is what the boards need and nothing else: each player's short
--     name (no full name, photo or form guide), no PIN, no account or profile,
--     no join code or slug, no handicap note, and none of the free text a
--     Comité types beyond names (a correction's reason, a payment's note, a
--     decision's reason, a custom bet's description).
--   * spectator_board answers null for a token that is wrong, was changed or
--     was switched off, as for one that never was: it says nothing about
--     whether a tournament exists.
--   * The history records each creation, change and switch-off, never the
--     token itself.
--   * Not in the nightly backup (src/lib/backupTables.ts NOT_BACKED_UP): a
--     restore must never bring back a link the Comité changed or switched off.
--     After one, the Comité makes a new link in a tap.
--
-- Release order: this reaches production before the bundle that reads it.

set local lock_timeout = '10s';

create table public.spectator_links (
  tournament_id uuid primary key references public.tournaments (id) on delete cascade,
  -- 18 random bytes in URL-safe base64: 24 characters, no padding.
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24}$'),
  -- «Con dinero»: the link also shows what each person wins, pays and owes, and the Calcutta with its prices.
  money boolean not null default false,
  created_at timestamptz not null default now(),
  -- When «Cambiar enlace» last gave it a new token; null until the first time.
  rotated_at timestamptz
);
comment on table public.spectator_links is
  'A tournament''s link to watch it without a PIN (STRAT-05): its token and whether it shows money. Written only by save_spectator_link and delete_spectator_link, read only by spectator_link (the Comité) and spectator_board (whoever has the token).';
alter table public.spectator_links enable row level security;
-- No policies and no client grants: nobody but the definer functions below.
revoke all on public.spectator_links from public, anon, authenticated;

-- audit_row's line for this table, with the token left out of both images: whoever reads the history (the
-- Comité, the operator, the nightly backup) can't open the boards with it.
create or replace function public.spectator_links_audit()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  tid uuid;
begin
  tid := case when tg_op = 'DELETE' then old.tournament_id else new.tournament_id end;
  insert into public.audit_log (tournament_id, table_name, row_id, actor_auth_user_id, actor_player_id, action, before, after, reason, actor_platform)
  values (
    tid, tg_table_name, tid::text, auth.uid(), public.my_player_id(tid), tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'token' end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'token' end,
    null,
    auth.uid() is not null and public.is_platform_admin() and not public.is_tournament_participant(tid)
  );
  return coalesce(new, old);
end;
$$;
revoke execute on function public.spectator_links_audit() from public, anon, authenticated;
create trigger spectator_links_audit after insert or update or delete on public.spectator_links
  for each row execute function public.spectator_links_audit();

-- A new token: 18 random bytes (144 bits) in URL-safe base64. Internal.
create or replace function public.new_spectator_token()
returns text
language sql volatile
set search_path = public, extensions
as $$
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')
$$;
revoke execute on function public.new_spectator_token() from public, anon, authenticated;

-- The link as the Comité's screen reads it.
create or replace function public.spectator_link_json(l public.spectator_links)
returns jsonb
language sql immutable
set search_path = public
as $$
  select case when l.tournament_id is null then null else
    jsonb_build_object('token', l.token, 'money', l.money, 'createdAt', l.created_at, 'rotatedAt', l.rotated_at) end
$$;
revoke execute on function public.spectator_link_json(public.spectator_links) from public, anon, authenticated;

-- The tournament's link, for its Comité: its token and whether it shows money. Null when there is none.
create or replace function public.spectator_link(p_tournament_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  l public.spectator_links;
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité ve el enlace para ver' using errcode = '42501';
  end if;
  select * into l from public.spectator_links where tournament_id = p_tournament_id;
  return public.spectator_link_json(l);
end;
$$;
revoke execute on function public.spectator_link(uuid) from public, anon;
grant execute on function public.spectator_link(uuid) to authenticated;

-- «Crear enlace para ver», «Con dinero» / «Sin dinero» and «Cambiar enlace»: the link is made when there is
-- none, its money choice is set, and `p_new_token` gives it a new token (the old one stops working at once).
-- `p_seen` is the link as the Comité's screen showed it when the choice was made: null for none, else its
-- token and money. A link that is not that one any more (another Comité phone made it, changed its money,
-- gave it a new token or switched it off meanwhile) refuses the whole save and writes nothing: a stale
-- «Crear» or «Cambiar enlace» would otherwise turn a shared «Sin dinero» link into «Con dinero» without the
-- question the card asks first. The screen reads the link again. A call that changes nothing writes nothing.
create or replace function public.save_spectator_link(p_tournament_id uuid, p_money boolean, p_seen jsonb, p_new_token boolean default false)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  l public.spectator_links;
  seen jsonb := case when p_seen is null or jsonb_typeof(p_seen) = 'null' then null else p_seen end;
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité cambia el enlace para ver' using errcode = '42501';
  end if;
  if p_money is null then
    raise exception 'Falta decir si el enlace muestra el dinero' using errcode = '22023';
  end if;
  if seen is not null and (jsonb_typeof(seen) <> 'object' or jsonb_typeof(seen -> 'token') is distinct from 'string'
      or jsonb_typeof(seen -> 'money') is distinct from 'boolean') then
    raise exception 'No pudimos leer cómo estaba el enlace para ver; vuelve a abrirlo' using errcode = '22023';
  end if;
  -- One save of a tournament's link at a time, «Apagar» included: two phones never both pass the check below.
  perform pg_advisory_xact_lock(hashtextextended('spectator_link:' || p_tournament_id::text, 0));
  select * into l from public.spectator_links where tournament_id = p_tournament_id for update;
  if (l.tournament_id is null) <> (seen is null)
     or (l.tournament_id is not null and (l.token is distinct from seen ->> 'token' or l.money is distinct from (seen ->> 'money')::boolean)) then
    raise exception 'El enlace para ver cambió en otro teléfono mientras lo veías: revisa cómo quedó y vuelve a elegir' using errcode = '22023';
  end if;
  if l.tournament_id is null then
    insert into public.spectator_links (tournament_id, token, money)
    values (p_tournament_id, public.new_spectator_token(), p_money)
    returning * into l;
  elsif l.money is distinct from p_money or coalesce(p_new_token, false) then
    update public.spectator_links
      set money = p_money,
          token = case when coalesce(p_new_token, false) then public.new_spectator_token() else token end,
          rotated_at = case when coalesce(p_new_token, false) then now() else rotated_at end
      where tournament_id = p_tournament_id
      returning * into l;
  end if;
  return public.spectator_link_json(l);
end;
$$;
revoke execute on function public.save_spectator_link(uuid, boolean, jsonb, boolean) from public, anon;
grant execute on function public.save_spectator_link(uuid, boolean, jsonb, boolean) to authenticated;

-- «Apagar»: nobody opens the boards with it any more. A link made afterwards has a new token.
create or replace function public.delete_spectator_link(p_tournament_id uuid)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité apaga el enlace para ver' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('spectator_link:' || p_tournament_id::text, 0));
  delete from public.spectator_links where tournament_id = p_tournament_id;
end;
$$;
revoke execute on function public.delete_spectator_link(uuid) from public, anon;
grant execute on function public.delete_spectator_link(uuid) to authenticated;

-- A side game paid from a side pot: whoever is in it paid its buy-in. Internal.
create or replace function public.spectator_side_pot(g jsonb)
returns boolean
language sql immutable
set search_path = public
as $$
  select jsonb_typeof(g) = 'object' and jsonb_typeof(g -> 'money') = 'object' and g -> 'money' ->> 'source' = 'side'
$$;
revoke execute on function public.spectator_side_pot(jsonb) from public, anon, authenticated;

-- What of the settings a link carries: the keys the settings schema knows (src/engine/settings/schema.ts),
-- at every depth, and nothing else. The same tree as src/data/spectatorSettingsSpec.json, which a test holds to
-- the schema and to this literal. "s" is a plain value (text, number, true or false, null); {"o": {...}} an
-- object with those keys; {"a": ...} a list of those; {"u": [...]} either; {"d": key, "by": {...}} an object
-- whose `key` says which shape it is. A key the schema doesn't know (a setting the Comité typed by hand, one a
-- later build adds before this list knows it) never reaches the link. Internal.
create or replace function public.spectator_settings_spec()
returns jsonb
language sql immutable
set search_path = public
as $$
  select '{"o":{"modules":{"o":{"individual":{"o":{"enabled":"s","label":"s","format":"s","formatOptions":{"o":{"scoring":"s","matchMode":"s","teamMode":"s","teamScoring":"s"}}}},"bestRound":{"o":{"enabled":"s","label":"s"}},"pairs":{"o":{"enabled":"s","label":"s","pairing":{"a":{"a":"s"}},"honoreePicks":"s"}},"snake":{"o":{"enabled":"s","label":"s","puttsThreshold":"s"}},"fewestPutts":{"o":{"enabled":"s","label":"s"}},"auction":{"o":{"enabled":"s","label":"s"}}}},"tiers":{"a":"s"},"rounds":"s","groupSize":"s","expectedPlayers":"s","labels":{"o":{"lastPlace":"s","honoree":"s","trophy":"s"}},"entryFee":"s","houseCut":"s","handicap":{"o":{"allowance":"s","cap":"s","rounding":"s","perRoundSlope":"s","estimateWeights":{"a":"s"}}},"day2Cut":{"o":{"threshold":"s","pointsPerStroke":"s","maxStrokes":"s","mode":"s"}},"prizes":{"o":{"stableford":{"a":"s"},"stablefordMode":"s","pairs":{"a":"s"},"bestRoundPerDay":"s","snakePerSurvivor":"s","fewestPutts":"s"}},"auction":{"o":{"openingBid":"s","increment":"s","maxPlayersPerOwner":"s","selfOwnedCountsTowardMax":"s","guestsCanBid":"s","buybackMaxPct":"s","payout":{"a":{"d":"slot","by":{"place":{"o":{"slot":"s","place":"s","share":"s"}},"bestOfTier":{"o":{"slot":"s","tier":"s","share":"s"}},"lastPlace":{"o":{"slot":"s","share":"s"}}}}}}},"games":{"a":{"d":"type","by":{"skins":{"o":{"id":"s","label":"s","enabled":"s","rounds":{"u":["s",{"a":"s"}]},"entrants":"s","money":{"o":{"source":"s","buyIn":"s","amount":"s","stake":"s","split":{"a":"s"}}},"type":"s","options":{"o":{"basis":"s","carryOver":"s"}}}},"lowScore":{"o":{"id":"s","label":"s","enabled":"s","rounds":{"u":["s",{"a":"s"}]},"entrants":"s","money":{"o":{"source":"s","buyIn":"s","amount":"s","stake":"s","split":{"a":"s"}}},"type":"s","options":{"o":{"basis":"s","scope":"s"}}}},"eventPot":{"o":{"id":"s","label":"s","enabled":"s","rounds":{"u":["s",{"a":"s"}]},"entrants":"s","money":{"o":{"source":"s","buyIn":"s","amount":"s","stake":"s","split":{"a":"s"}}},"type":"s","options":{"o":{"event":"s","basis":"s"}}}},"match":{"o":{"id":"s","label":"s","enabled":"s","rounds":{"u":["s",{"a":"s"}]},"entrants":"s","money":{"o":{"source":"s","buyIn":"s","amount":"s","stake":"s","split":{"a":"s"}}},"type":"s","options":{"o":{"format":"s","basis":"s","pairScoring":"s","pressAt":"s","maxPresses":"s","matches":{"a":{"o":{"id":"s","a":{"a":"s"},"b":{"a":"s"}}}}}}}},"contest":{"o":{"id":"s","label":"s","enabled":"s","rounds":{"u":["s",{"a":"s"}]},"entrants":"s","money":{"o":{"source":"s","buyIn":"s","amount":"s","stake":"s","split":{"a":"s"}}},"type":"s","options":{"o":{"kind":"s","holes":{"u":["s",{"a":"s"}]}}}}},"custom":{"o":{"id":"s","label":"s","enabled":"s","rounds":{"u":["s",{"a":"s"}]},"entrants":"s","money":{"o":{"source":"s","buyIn":"s","amount":"s","stake":"s","split":{"a":"s"}}},"type":"s","options":{"o":{"description":"s"}}}}}}},"pickupPuttsForFewestPutts":"s","tieFallback":"s","spectatorLink":"s","timezone":"s","currency":"s"}}'::jsonb
$$;
revoke execute on function public.spectator_settings_spec() from public, anon, authenticated;

-- `v` as `spec` allows it: an object keeps only the keys the spec names, each as its own spec says, a list
-- each element; a value of another kind than the spec's is null, and an object whose kind the spec doesn't
-- know is {}. What the settings schema reads parses exactly as before (it drops unknown keys itself, and a
-- value of the wrong kind fails it either way), and nothing else comes through. Internal.
create or replace function public.spectator_pick(v jsonb, spec jsonb)
returns jsonb
language plpgsql immutable
set search_path = public
as $$
declare
  kind text := jsonb_typeof(v);
  opt jsonb;
begin
  if v is null then
    return null;
  end if;
  if jsonb_typeof(spec) = 'string' then
    return case when kind in ('string', 'number', 'boolean', 'null') then v else 'null'::jsonb end;
  end if;
  if spec ? 'o' then
    if kind is distinct from 'object' then
      return 'null'::jsonb;
    end if;
    return coalesce((select jsonb_object_agg(k, public.spectator_pick(v -> k, spec -> 'o' -> k))
      from jsonb_object_keys(spec -> 'o') k where v ? k), '{}'::jsonb);
  end if;
  if spec ? 'a' then
    if kind is distinct from 'array' then
      return 'null'::jsonb;
    end if;
    return coalesce((select jsonb_agg(public.spectator_pick(e, spec -> 'a') order by i)
      from jsonb_array_elements(v) with ordinality x(e, i)), '[]'::jsonb);
  end if;
  if spec ? 'd' then
    if kind is distinct from 'object' then
      return 'null'::jsonb;
    end if;
    if jsonb_typeof(v -> (spec ->> 'd')) = 'string' and (spec -> 'by') ? (v ->> (spec ->> 'd')) then
      return public.spectator_pick(v, spec -> 'by' -> (v ->> (spec ->> 'd')));
    end if;
    return '{}'::jsonb;
  end if;
  if spec ? 'u' then
    for opt in select o from jsonb_array_elements(spec -> 'u') o loop
      if (jsonb_typeof(opt) = 'string' and kind in ('string', 'number', 'boolean', 'null'))
         or (opt ? 'a' and kind = 'array') or ((opt ? 'o' or opt ? 'd') and kind = 'object') then
        return public.spectator_pick(v, opt);
      end if;
    end loop;
    return 'null'::jsonb;
  end if;
  return 'null'::jsonb;
end;
$$;
revoke execute on function public.spectator_pick(jsonb, jsonb) from public, anon, authenticated;

-- The settings as a link shows them: only the keys the schema knows (`spectator_settings_spec`), and never a
-- custom bet's description, the Comité's free text, with money or without. Without money, also every peso at
-- zero, the Calcutta off, every side game for fun, and a side pot left out altogether: who is in one is who
-- paid into it. The boards computed from them carry no money, and they still parse (src/data/spectator.ts
-- `spectatorSettings` does the same on the phone). Internal.
create or replace function public.spectator_settings(p_settings jsonb, p_money boolean)
returns jsonb
language sql immutable
set search_path = public
as $$
  with s as (select public.spectator_pick(p_settings, public.spectator_settings_spec()) as v),
  games as (
    select coalesce(jsonb_agg(case when jsonb_typeof(g) is distinct from 'object' then g else
        g
        || case when p_money then '{}'::jsonb
             else jsonb_build_object('money', jsonb_build_object('source', 'none', 'buyIn', 0, 'amount', 0, 'stake', 0, 'split', jsonb_build_array(100))) end
        || case when g ->> 'type' = 'custom' and jsonb_typeof(g -> 'options') = 'object'
             then jsonb_build_object('options', (g -> 'options') || jsonb_build_object('description', '')) else '{}'::jsonb end
      end order by i), '[]'::jsonb) as list
    from s, jsonb_array_elements(case when jsonb_typeof(s.v -> 'games') = 'array' then s.v -> 'games' else '[]'::jsonb end) with ordinality as x(g, i)
    where p_money or not public.spectator_side_pot(g)
  )
  select case
    when jsonb_typeof(s.v) is distinct from 'object' then s.v
    when p_money then
      case when jsonb_typeof(s.v -> 'games') = 'array' then s.v || jsonb_build_object('games', games.list) else s.v end
    else jsonb_set(
      s.v || jsonb_build_object(
        'entryFee', 0,
        'houseCut', 0,
        'prizes', jsonb_build_object('stableford', '[]'::jsonb, 'stablefordMode', 'amount', 'pairs', '[]'::jsonb,
          'bestRoundPerDay', 0, 'snakePerSurvivor', 0, 'fewestPutts', 0),
        'auction', jsonb_build_object('openingBid', 1, 'increment', 1, 'maxPlayersPerOwner', 1, 'selfOwnedCountsTowardMax', true,
          'guestsCanBid', false, 'buybackMaxPct', 0, 'payout', jsonb_build_array(jsonb_build_object('slot', 'place', 'place', 1, 'share', 1))),
        'games', games.list
      ),
      '{modules,auction,enabled}', 'false'::jsonb, false)
  end
  from s, games
$$;
revoke execute on function public.spectator_settings(jsonb, boolean) from public, anon, authenticated;

-- The boards, for whoever has the link: no session needed (anon), none created. What the screens compute
-- from, column by column, with money only when the link shows it. `p_seen` is the version the page already
-- holds: when nothing changed the answer is that version alone, so a TV polling all day costs a few bytes.
-- A token that is wrong, was changed or was switched off answers null, as one that never was.
create or replace function public.spectator_board(p_token text, p_seen text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  l public.spectator_links;
  t public.tournaments;
  courses uuid[];
  -- «Sin dinero»: the side pots, left out of the settings with their entries, claims and results.
  hidden text[] := '{}';
  answer jsonb;
  v text;
begin
  -- A token is 24 URL-safe characters: anything else is no link, before any lookup.
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{24}$' then
    return null;
  end if;
  select * into l from public.spectator_links where token = p_token;
  if l.tournament_id is null then
    return null;
  end if;
  select * into t from public.tournaments where id = l.tournament_id;
  if t.id is null then
    return null;
  end if;
  -- The courses its days play, as the phone's own snapshot reads them (src/data/tournamentStore.ts).
  select coalesce(array_agg(distinct r.course_id) filter (where r.course_id is not null), '{}') into courses
  from public.rounds r where r.tournament_id = t.id;
  if not l.money then
    select coalesce(array_agg(g ->> 'id') filter (where g ->> 'id' is not null), '{}') into hidden
    from jsonb_array_elements(case when jsonb_typeof(t.settings -> 'games') = 'array' then t.settings -> 'games' else '[]'::jsonb end) g
    where public.spectator_side_pot(g);
  end if;

  answer := jsonb_build_object(
    'money', l.money,
    'tournament', jsonb_build_object(
      'name', t.name, 'tagline', t.tagline, 'logo_url', t.logo_url, 'accent_color', t.accent_color,
      'status', t.status, 'current_round_id', t.current_round_id, 'timezone', t.timezone, 'currency', t.currency,
      'settings', public.spectator_settings(t.settings, l.money)
    ) || case when l.money then jsonb_build_object('banker_player_id', t.banker_player_id) else '{}'::jsonb end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'display_name', p.display_name, 'tier', p.tier, 'base_hcp', p.base_hcp,
        'handicap_source', p.handicap_source, 'handicap_index', p.handicap_index, 'estimate_inputs', p.estimate_inputs,
        'default_tee_id', p.default_tee_id, 'is_honoree', p.is_honoree, 'sort_order', p.sort_order
      ) order by p.sort_order, p.id)
      from public.players p where p.tournament_id = t.id), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.id)
      from public.courses c where c.id = any (courses)), '[]'::jsonb),
    'tees', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'course_id', e.course_id, 'name', e.name, 'color', e.color,
        'rating', e.rating, 'slope', e.slope, 'sort_order', e.sort_order) order by e.course_id, e.sort_order, e.id)
      from public.tees e where e.course_id = any (courses)), '[]'::jsonb),
    'holes', coalesce((
      select jsonb_agg(jsonb_build_object('tee_id', h.tee_id, 'number', h.number, 'par', h.par, 'stroke_index', h.stroke_index,
        'yards', h.yards) order by h.tee_id, h.number)
      from public.holes h join public.tees e on e.id = h.tee_id where e.course_id = any (courses)), '[]'::jsonb),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'number', r.number, 'date', r.date, 'course_id', r.course_id,
        'holes', r.holes, 'status', r.status) order by r.number, r.id)
      from public.rounds r where r.tournament_id = t.id), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'round_id', g.round_id, 'number', g.number, 'tee_time', g.tee_time,
        'start_hole', g.start_hole) order by g.round_id, g.number, g.id)
      from public.groups g where g.tournament_id = t.id), '[]'::jsonb),
    'group_members', coalesce((
      select jsonb_agg(jsonb_build_object('group_id', m.group_id, 'player_id', m.player_id) order by m.group_id, m.player_id)
      from public.group_members m where m.tournament_id = t.id), '[]'::jsonb),
    'round_tees', coalesce((
      select jsonb_agg(jsonb_build_object('round_id', x.round_id, 'player_id', x.player_id, 'tee_id', x.tee_id) order by x.round_id, x.player_id)
      from public.round_tees x where x.tournament_id = t.id), '[]'::jsonb),
    'pairs', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'player1_id', p.player1_id, 'player2_id', p.player2_id,
        'kind', p.kind, 'picked_by_honoree', p.picked_by_honoree, 'drawn_at', p.drawn_at) order by p.id)
      from public.pairs p where p.tournament_id = t.id), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'number', x.number, 'drawn_at', x.drawn_at) order by x.number, x.id)
      from public.teams x where x.tournament_id = t.id), '[]'::jsonb),
    'team_members', coalesce((
      select jsonb_agg(jsonb_build_object('team_id', m.team_id, 'player_id', m.player_id) order by m.team_id, m.player_id)
      from public.team_members m where m.tournament_id = t.id), '[]'::jsonb),
    'scores', coalesce((
      select jsonb_agg(jsonb_build_object('round_id', s.round_id, 'player_id', s.player_id, 'hole', s.hole, 'strokes', s.strokes,
        'putts', s.putts, 'picked_up', s.picked_up, 'updated_at', s.updated_at) order by s.round_id, s.player_id, s.hole)
      from public.scores s where s.tournament_id = t.id), '[]'::jsonb),
    'snake_tiebreaks', coalesce((
      select jsonb_agg(jsonb_build_object('round_id', x.round_id, 'group_id', x.group_id, 'hole', x.hole,
        'last_holed_player_id', x.last_holed_player_id) order by x.round_id, x.group_id, x.hole)
      from public.snake_tiebreaks x where x.tournament_id = t.id), '[]'::jsonb),
    'card_signatures', coalesce((
      select jsonb_agg(jsonb_build_object('round_id', x.round_id, 'pair_id', x.pair_id, 'signed_by', x.signed_by,
        'signed_at', x.signed_at) order by x.round_id, x.pair_id)
      from public.card_signatures x where x.tournament_id = t.id), '[]'::jsonb),
    -- The Comité's playing handicap counts on the boards; why it set it (free text) and who did stay with the members.
    'handicap_overrides', coalesce((
      select jsonb_agg(jsonb_build_object('round_id', x.round_id, 'player_id', x.player_id, 'playing_hcp', x.playing_hcp,
        'at', x.at) order by x.round_id, x.player_id)
      from public.handicap_overrides x where x.tournament_id = t.id), '[]'::jsonb),
    'game_entries', coalesce((
      select jsonb_agg(jsonb_build_object('game_id', x.game_id, 'player_id', x.player_id) order by x.game_id, x.player_id)
      from public.game_entries x where x.tournament_id = t.id and x.game_id <> all (hidden)), '[]'::jsonb),
    'hole_awards', coalesce((
      select jsonb_agg(jsonb_build_object('round_id', x.round_id, 'group_id', x.group_id, 'hole', x.hole, 'game_id', x.game_id,
        'player_id', x.player_id, 'source', x.source) order by x.round_id, x.game_id, x.hole, x.player_id, x.source)
      from public.hole_awards x where x.tournament_id = t.id and x.game_id <> all (hidden)), '[]'::jsonb),
    'game_results', coalesce((
      select jsonb_agg(jsonb_build_object('game_id', x.game_id, 'player_id', x.player_id, 'share', x.share) order by x.game_id, x.player_id)
      from public.game_results x where x.tournament_id = t.id and x.game_id <> all (hidden)), '[]'::jsonb)
  );
  -- The money, only when the link shows it.
  if l.money then
    answer := answer || jsonb_build_object(
      'calcutta_lots', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'player_id', x.player_id, 'lot_number', x.lot_number, 'status', x.status,
          'price', x.price, 'owner_id', x.owner_id, 'sold_at', x.sold_at) order by x.lot_number, x.id)
        from public.calcutta_lots x where x.tournament_id = t.id), '[]'::jsonb),
      'calcutta_bids', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'lot_id', x.lot_id, 'bidder_id', x.bidder_id, 'amount', x.amount,
          'created_at', x.created_at) order by x.lot_id, x.created_at, x.id)
        from public.calcutta_bids x where x.tournament_id = t.id), '[]'::jsonb),
      'calcutta_buybacks', coalesce((
        select jsonb_agg(jsonb_build_object('lot_id', x.lot_id, 'pct', x.pct, 'amount', x.amount, 'paid', x.paid) order by x.lot_id)
        from public.calcutta_buybacks x where x.tournament_id = t.id), '[]'::jsonb),
      -- A payment's note is the Comité's free text: it stays with the members.
      'payments', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'from_player_id', x.from_player_id, 'to_player_id', x.to_player_id,
          'amount', x.amount, 'kind', x.kind, 'paid', x.paid) order by x.id)
        from public.payments x where x.tournament_id = t.id), '[]'::jsonb),
      -- A decision's reasons are the Comité's free text, and who wrote it an account: they stay with the members.
      'money_adjustments', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'source_key', x.source_key, 'kind', x.kind, 'to_player_id', x.to_player_id,
          'amount', x.amount, 'call_id', x.call_id, 'created_at', x.created_at, 'voided_at', x.voided_at) order by x.created_at, x.id)
        from public.money_adjustments x where x.tournament_id = t.id), '[]'::jsonb)
    );
  end if;
  v := md5(answer::text);
  if p_seen is not distinct from v then
    return jsonb_build_object('version', v, 'same', true);
  end if;
  return answer || jsonb_build_object('version', v);
end;
$$;
comment on function public.spectator_board(text, text) is
  'The boards for whoever has a tournament''s link to watch (STRAT-05): no session needed. Short names, scores, groups, games; money only with «Con dinero». Null for a token that is wrong, changed or off.';
revoke execute on function public.spectator_board(text, text) from public;
grant execute on function public.spectator_board(text, text) to anon, authenticated;
