-- Cardi-Golf · 0004 · pgcrypto lives in the `extensions` schema on Supabase,
-- so the PIN functions must see it.
alter function public.set_player_pin(uuid, text) set search_path = public, extensions;
alter function public.claim_player(uuid, text) set search_path = public, extensions;
