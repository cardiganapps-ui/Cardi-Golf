-- Cardi-Golf · 0009 · Comité corrections carry a reason (§7 "Admins can
-- always write, but must give a reason once a card is signed"). The audit
-- trigger already copies `reason` into audit_log; a correction with a reason
-- never counts as a discrepancy.
alter table public.scores add column if not exists reason text;

create or replace function public.scores_detect_dispute()
returns trigger
language plpgsql
as $$
begin
  if new.reason is not null and new.reason <> '' then
    -- Comité correction: authoritative, settles any dispute.
    new.disputed := false;
    new.previous := null;
    return new;
  end if;
  if new.disputed is distinct from old.disputed and new.disputed = false and new.strokes is not distinct from old.strokes
     and new.putts is not distinct from old.putts and new.picked_up = old.picked_up then
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
