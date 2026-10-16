-- 0074: a tournament's time zone and currency are its settings (ARCH-06).
--
-- `tournaments.timezone` and `tournaments.currency` (0001) were a second copy
-- of `settings.timezone` and `settings.currency` that nothing wrote:
-- create_tournament, a Ronda rápida and duplicate_tournament insert the
-- settings and leave the columns at their defaults (America/Mazatlan, MXN),
-- while the wizard writes the organizer's own zone into the settings. So the
-- Admin de Polo read every tournament as Mazatlán, and the phones showed the
-- Comité's history in a zone nobody chose.
--
-- The settings are the source: the wizard, Comité › Torneo and
-- `update_settings` write them, the engine and every screen read them. The
-- columns stay, for SQL readers (the platform panel, a report, an older
-- bundle that reads the row), as the settings' mirror: a trigger writes them
-- from the settings on every insert and update, so a write of the column
-- alone changes nothing, and a row whose settings hold no usable value keeps
-- what it had. Then every stored tournament gets its settings' values, with
-- the history's trigger off (copying a value is no change anyone made: it
-- would read in Comité › Historial as one with no author).
--
-- Nothing is lost: a row whose settings hold no zone or currency keeps its
-- column, and no setting is written.

create or replace function public.tournaments_settings_mirror()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  zone text := case when jsonb_typeof(new.settings -> 'timezone') = 'string' then nullif(btrim(new.settings ->> 'timezone'), '') end;
  money text := case when jsonb_typeof(new.settings -> 'currency') = 'string' and new.settings ->> 'currency' ~ '^[A-Z]{3}$' then new.settings ->> 'currency' end;
begin
  if zone is not null then
    new.timezone := zone;
  elsif tg_op = 'UPDATE' then
    new.timezone := old.timezone;
  end if;
  if money is not null then
    new.currency := money;
  elsif tg_op = 'UPDATE' then
    new.currency := old.currency;
  end if;
  return new;
end;
$$;

revoke all on function public.tournaments_settings_mirror() from public, anon, authenticated;

drop trigger if exists tournaments_settings_mirror on public.tournaments;
create trigger tournaments_settings_mirror before insert or update on public.tournaments
  for each row execute function public.tournaments_settings_mirror();

-- The stored tournaments, with the history's trigger off and put back in the mode it had.
do $$
declare
  mode "char";
begin
  select tgenabled into mode from pg_trigger
  where tgrelid = 'public.tournaments'::regclass and tgname = 'tournaments_audit' and not tgisinternal;
  if mode is not null and mode <> 'D' then
    alter table public.tournaments disable trigger tournaments_audit;
  end if;
  update public.tournaments t
  set timezone = t.timezone, currency = t.currency -- the mirror writes both from the settings
  where (jsonb_typeof(t.settings -> 'timezone') = 'string' and nullif(btrim(t.settings ->> 'timezone'), '') is distinct from t.timezone and nullif(btrim(t.settings ->> 'timezone'), '') is not null)
     or (jsonb_typeof(t.settings -> 'currency') = 'string' and t.settings ->> 'currency' ~ '^[A-Z]{3}$' and t.settings ->> 'currency' is distinct from t.currency);
  if mode is not null and mode <> 'D' then
    execute format('alter table public.tournaments %s trigger tournaments_audit',
      case mode when 'A' then 'enable always' when 'R' then 'enable replica' else 'enable' end);
  end if;
end;
$$;
