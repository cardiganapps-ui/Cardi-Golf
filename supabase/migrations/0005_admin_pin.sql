-- Cardi-Golf · 0005 · service-role PIN helper for seeds and rehearsal scripts.
-- Only the service role can call it (revoked from anon/authenticated).
create or replace function public.set_player_pin_admin(p_player_id uuid, p_pin text)
returns void
language plpgsql volatile security definer
set search_path = public, extensions
as $$
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN son 4 dígitos' using errcode = '22023';
  end if;
  insert into public.player_pins (player_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (p_player_id, crypt(p_pin, gen_salt('bf', 8)), 0, null, now())
  on conflict (player_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
end;
$$;
revoke execute on function public.set_player_pin_admin(uuid, text) from public, anon, authenticated;
