-- 0058: finding people is opt-in, and the directory can't be read out (TRUST-08).
--
-- Every profile was discoverable from the start (0013's default), and search_profiles answered any account up to
-- twenty people for any two letters, with their club and city, so walking «aa» to «zz» read out the directory.
-- Now a new profile starts out of search (Editar perfil › «Aparecer en búsquedas» turns it on); a stranger who
-- chose to be found comes up only from three letters, ten at most, with his handle, name and photo (his club and
-- city stay on his card, which he chose to show); and the people I already know (friends, crews, tournament
-- mates) come up as before. The profiles already saved keep what they have: production held one (the operator's).

alter table public.profiles alter column discoverable set default false;

create or replace function public.search_profiles(q text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  qq text := translate(lower(btrim(coalesce(q, ''))), 'áàäâãéèëêíìïîóòöôõúùüûñç@', 'aaaaaeeeeiiiiooooouuuunc');
  pat text;
begin
  if not public.is_account_user(auth.uid()) or char_length(qq) < 2 then
    return '[]'::jsonb;
  end if;
  -- People I know (friends, crews, tournament mates) come up from two letters with their club and city. A stranger
  -- who chose to be found comes up from three, ten at most, with no club or city: those are on his card.
  pat := replace(replace(replace(qq, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select jsonb_agg(jsonb_build_object('handle', s.handle, 'displayName', s.display_name, 'avatarUrl', s.avatar_url,
        'homeClub', case when s.rel then s.home_club end, 'city', case when s.rel then s.city end) order by s.rel desc, s.exact desc, s.display_name)
    from (
      select pr.handle, pr.display_name, pr.avatar_url, pr.home_club, pr.city, pr.handle = qq as exact, k.rel,
        row_number() over (partition by k.rel order by pr.handle = qq desc, pr.display_name) as n
      from public.profiles pr
      cross join lateral (select public.profile_visible_to_me(pr.id) as rel) k
      where pr.id <> auth.uid()
        and (k.rel or (pr.discoverable and char_length(qq) >= 3))
        and (
          pr.handle like pat
          or translate(lower(pr.display_name), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc') like pat
          or translate(lower(pr.display_name), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc') like '% ' || pat
        )
    ) s
    where s.n <= case when s.rel then 20 else 10 end
  ), '[]'::jsonb);
end;
$$;

