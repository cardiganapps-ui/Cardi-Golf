-- Cardi-Golf · 0008 · score discrepancies (§8): last write wins by server
-- time, but when a DIFFERENT device overwrites a hole with different values
-- the row is flagged `disputed` and keeps the previous values until the card
-- is signed or the Comité resolves it. Both versions are in audit_log too.
alter table public.scores
  add column if not exists disputed boolean not null default false,
  add column if not exists previous jsonb;

create or replace function public.scores_detect_dispute()
returns trigger
language plpgsql
as $$
begin
  if new.disputed is distinct from old.disputed and new.disputed = false and new.strokes is not distinct from old.strokes
     and new.putts is not distinct from old.putts and new.picked_up = old.picked_up then
    -- Explicit resolution (disputed := false with the same values): clear the memory.
    new.previous := null;
    return new;
  end if;
  if (new.strokes is distinct from old.strokes or new.putts is distinct from old.putts or new.picked_up <> old.picked_up)
     and old.entered_by is not null and new.entered_by is not null and new.entered_by <> old.entered_by then
    new.disputed := true;
    new.previous := jsonb_build_object('strokes', old.strokes, 'putts', old.putts, 'picked_up', old.picked_up,
                                       'entered_by', old.entered_by, 'updated_at', old.updated_at);
  end if;
  return new;
end;
$$;

drop trigger if exists scores_dispute on public.scores;
create trigger scores_dispute before update on public.scores
  for each row execute function public.scores_detect_dispute();

-- Signing a pair's card settles every disputed hole of both partners for that round.
create or replace function public.card_signature_settles()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.scores s
  set disputed = false, previous = null
  from public.pairs p
  where p.id = new.pair_id and s.round_id = new.round_id and s.player_id in (p.player1_id, p.player2_id) and s.disputed;
  return new;
end;
$$;
drop trigger if exists card_signatures_settle on public.card_signatures;
create trigger card_signatures_settle after insert on public.card_signatures
  for each row execute function public.card_signature_settles();
