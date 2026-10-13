-- Cardi-Golf · 0043 · The Comité's setup saved key by key, refused when what it read changed (ARCH-13).
--
-- Torneo saved the whole settings blob and the brand columns in one update,
-- and Juegos saved the whole blob too. Neither checked what the row held, so
-- a Torneo draft opened before a change from Juegos (or from the organizer's
-- other device) wrote the old games back when it was saved, and nobody was
-- told: matchups, entrants and prizes that pay real money went back to what
-- they were.
--
-- update_settings(p_tournament_id, p_seen, p_set) takes what the screen
-- started from and what it changed, each an object with the keys it names:
--   settings      an object of top-level settings keys (absent: JSON null)
--   name, tagline, accent_color
-- Under the tournament's row lock, every key in p_seen is compared with the
-- row. If one changed, nothing is written and the answer says which, with the
-- row as it is: {ok: false, changed: ['settings.games', 'name'], now}. Else
-- only the keys in p_set are written (a settings key set to null is removed)
-- and the answer is {ok: true, now}. Every key written must be in p_seen, so
-- nothing is written blind. A screen chooses what it reads: Torneo names
-- every key (its prize check read them all, so the configuration stored is
-- the one it checked), Juegos only the games.
--
-- Security invoker: the update goes through tournaments_update (0003) and
-- the column grants as a direct write does; the Comité check comes first so
-- the refusal is ours. Direct writes of the settings stay for the bundles in
-- the field until the contract (PLAN §2.7).

create or replace function public.update_settings(p_tournament_id uuid, p_seen jsonb, p_set jsonb)
returns jsonb
language plpgsql volatile security invoker
set search_path = public
as $$
declare
  cur public.tournaments;
  seen_s jsonb;
  set_s jsonb;
  k text;
  v jsonb;
  changed text[] := '{}';
  next_s jsonb;
  next_name text;
  next_tagline text;
  next_accent text;
begin
  if p_tournament_id is null or not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité puede cambiar la configuración del torneo' using errcode = '42501';
  end if;
  -- Each argument an object of the keys above; checked in two steps, so the
  -- second never reads the keys of something that is not an object.
  if jsonb_typeof(p_seen) is distinct from 'object' or jsonb_typeof(p_set) is distinct from 'object'
     or jsonb_typeof(coalesce(p_seen -> 'settings', '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_set -> 'settings', '{}'::jsonb)) <> 'object' then
    raise exception 'No pudimos leer ese cambio; abre la configuración otra vez y repítelo' using errcode = '22023';
  end if;
  seen_s := coalesce(p_seen -> 'settings', '{}'::jsonb);
  set_s := coalesce(p_set -> 'settings', '{}'::jsonb);
  if exists (select 1 from jsonb_object_keys(p_seen) x where x not in ('settings', 'name', 'tagline', 'accent_color'))
     or exists (select 1 from jsonb_object_keys(p_set) x where x not in ('settings', 'name', 'tagline', 'accent_color'))
     -- Nothing is written blind: each key set was also seen.
     or exists (select 1 from jsonb_object_keys(set_s) x where not seen_s ? x)
     or exists (select 1 from jsonb_object_keys(p_set) x where x <> 'settings' and not p_seen ? x)
     -- The brand columns: a name is text, the other two text or null, as seen and as set.
     or (p_seen ? 'name' and jsonb_typeof(p_seen -> 'name') <> 'string')
     or (p_set ? 'name' and jsonb_typeof(p_set -> 'name') <> 'string')
     or (p_seen ? 'tagline' and jsonb_typeof(p_seen -> 'tagline') not in ('string', 'null'))
     or (p_set ? 'tagline' and jsonb_typeof(p_set -> 'tagline') not in ('string', 'null'))
     or (p_seen ? 'accent_color' and jsonb_typeof(p_seen -> 'accent_color') not in ('string', 'null'))
     or (p_set ? 'accent_color' and jsonb_typeof(p_set -> 'accent_color') not in ('string', 'null')) then
    raise exception 'No pudimos leer ese cambio; abre la configuración otra vez y repítelo' using errcode = '22023';
  end if;
  if p_set ? 'name' and btrim(p_set ->> 'name') = '' then
    raise exception 'El torneo necesita nombre' using errcode = '22023';
  end if;

  select * into cur from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'Solo el Comité puede cambiar la configuración del torneo' using errcode = '42501';
  end if;

  -- What the screen started from, against the row as it is now. jsonb compares
  -- by content (key order and 1 vs 1.0 aside); a key the row lacks reads as null.
  for k, v in select key, value from jsonb_each(seen_s) loop
    if coalesce(case when jsonb_typeof(cur.settings) = 'object' then cur.settings -> k end, 'null'::jsonb) is distinct from v then
      changed := changed || ('settings.' || k);
    end if;
  end loop;
  if p_seen ? 'name' and to_jsonb(cur.name) is distinct from p_seen -> 'name' then
    changed := changed || 'name'::text;
  end if;
  if p_seen ? 'tagline' and coalesce(to_jsonb(cur.tagline), 'null'::jsonb) is distinct from p_seen -> 'tagline' then
    changed := changed || 'tagline'::text;
  end if;
  if p_seen ? 'accent_color' and coalesce(to_jsonb(cur.accent_color), 'null'::jsonb) is distinct from p_seen -> 'accent_color' then
    changed := changed || 'accent_color'::text;
  end if;
  if cardinality(changed) > 0 then
    return jsonb_build_object(
      'ok', false,
      'changed', to_jsonb(changed),
      'now', jsonb_build_object('settings', cur.settings, 'name', cur.name, 'tagline', cur.tagline, 'accent_color', cur.accent_color)
    );
  end if;

  if set_s = '{}'::jsonb and not (p_set ?| array['name', 'tagline', 'accent_color']) then
    return jsonb_build_object('ok', true, 'now', jsonb_build_object('settings', cur.settings, 'name', cur.name, 'tagline', cur.tagline, 'accent_color', cur.accent_color));
  end if;

  -- The keys set to null go; the rest are written over the row's.
  next_s := ((case when jsonb_typeof(cur.settings) = 'object' then cur.settings else '{}'::jsonb end)
      - coalesce((select array_agg(key) from jsonb_each(set_s) where value = 'null'::jsonb), '{}'::text[]))
    || coalesce((select jsonb_object_agg(key, value) from jsonb_each(set_s) where value <> 'null'::jsonb), '{}'::jsonb);
  next_name := case when p_set ? 'name' then btrim(p_set ->> 'name') else cur.name end;
  next_tagline := case when p_set ? 'tagline' then nullif(btrim(coalesce(p_set ->> 'tagline', '')), '') else cur.tagline end;
  next_accent := case when p_set ? 'accent_color' then p_set ->> 'accent_color' else cur.accent_color end;

  update public.tournaments
     set settings = next_s, name = next_name, tagline = next_tagline, accent_color = next_accent
   where id = p_tournament_id
  returning * into cur;
  if not found then
    raise exception 'Solo el Comité puede cambiar la configuración del torneo' using errcode = '42501';
  end if;

  return jsonb_build_object('ok', true, 'now', jsonb_build_object('settings', cur.settings, 'name', cur.name, 'tagline', cur.tagline, 'accent_color', cur.accent_color));
end;
$$;

comment on function public.update_settings(uuid, jsonb, jsonb) is
  'The Comité''s setup, key by key (ARCH-13): refused with {ok: false, changed, now} when a key the screen saw changed meanwhile; else writes only the keys it set.';

revoke execute on function public.update_settings(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_settings(uuid, jsonb, jsonb) to authenticated;
