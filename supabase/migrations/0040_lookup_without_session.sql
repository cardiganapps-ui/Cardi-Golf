-- Cardi-Golf · 0040 · A tournament's faces before any user exists (TRUST-05).
--
-- Opening a tournament's link (or typing its code) used to start an
-- anonymous user for that browser before anything was on screen: the face
-- grid came from lookup_tournament, which refused a caller with no session.
-- The grid is what anyone with the link or the code sees anyway (the notice
-- says so: the tournament's name and logo, and each player's name, photo,
-- category and whether they are the honoree), so it no longer needs a user:
-- without a session the same grid comes back, with nothing that is the
-- caller's (no «it's me», no proposal waiting, no join code). The app starts
-- the anonymous user at the PIN, under the consent line.
--
-- Same body as 0013's, without the session check.

create or replace function public.lookup_tournament(p_code text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  t public.tournaments;
  me uuid;
begin
  select * into t from public.tournaments
  where join_code = upper(trim(p_code)) or slug = lower(trim(p_code))
  limit 1;
  if t.id is null then
    return null;
  end if;
  me := public.my_player_id(t.id);
  return jsonb_build_object(
    'id', t.id,
    'slug', t.slug,
    'name', t.name,
    'tagline', t.tagline,
    'logoUrl', t.logo_url,
    'accentColor', t.accent_color,
    'status', t.status,
    'joinCode', case when public.is_tournament_member(t.id) then t.join_code end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'displayName', p.display_name, 'fullName', p.full_name,
        'tier', p.tier, 'avatarUrl', p.avatar_url, 'isHonoree', p.is_honoree,
        'hasPin', exists (select 1 from public.player_pins pp where pp.player_id = p.id),
        'isMe', p.id is not distinct from me,
        'hasProfile', coalesce(p.profile_status = 'confirmed', false),
        'pendingMe', coalesce(p.profile_status = 'pending' and p.profile_id = auth.uid(), false)
      ) order by p.sort_order, p.display_name)
      from public.players p where p.tournament_id = t.id
    ), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.lookup_tournament(text) to anon, authenticated;
