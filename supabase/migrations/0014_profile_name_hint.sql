-- 0014: a new profile takes its name from the player it was saved from.
-- Someone who saves their profile from a tournament ("Guarda tu perfil")
-- has no name on the account, only an email; the player they were ("Nico",
-- "Nicolás Castro") is a far better default than the email's local part.
-- The hints are used only when the profile is created, never to rename one.

drop function if exists public.ensure_my_profile();

create or replace function public.ensure_my_profile(p_display_name text default null, p_full_name text default null)
returns public.profiles
language plpgsql security definer
set search_path = public
as $$
declare
  u auth.users;
  pr public.profiles;
  meta jsonb;
  dn text;
  fn text;
  base text;
  cand text;
  n int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  select * into pr from public.profiles where id = auth.uid();
  if pr.id is not null then
    return pr;
  end if;
  select * into u from auth.users where id = auth.uid();
  if u.id is null or coalesce(u.is_anonymous, false) or u.email is null then
    raise exception 'Primero guarda tu perfil con tu correo o con Google' using errcode = '42501';
  end if;
  meta := coalesce(u.raw_user_meta_data, '{}'::jsonb);
  dn := nullif(btrim(coalesce(meta ->> 'display_name', p_display_name, meta ->> 'full_name', meta ->> 'name', '')), '');
  if dn is null then
    dn := nullif(initcap(btrim(regexp_replace(split_part(u.email, '@', 1), '[._+-]+', ' ', 'g'))), '');
  end if;
  dn := left(coalesce(dn, 'Golfista'), 40);
  fn := left(nullif(btrim(coalesce(meta ->> 'full_name', meta ->> 'name', p_full_name, '')), ''), 80);
  -- The handle reads best from the full name ("nicolas.castro"), else from the display name.
  base := public.handle_base(coalesce(fn, dn));
  cand := base;
  while not public.handle_ok(cand) or exists (select 1 from public.profiles where handle = cand) loop
    n := n + 1;
    cand := rtrim(left(base, 16), '._') || n::text;
    if n > 500 then
      cand := 'golfista' || substr(md5(random()::text), 1, 6);
    end if;
  end loop;
  insert into public.profiles (id, handle, display_name, full_name, avatar_url)
  values (auth.uid(), cand, dn, fn, left(nullif(coalesce(meta ->> 'avatar_url', meta ->> 'picture', ''), ''), 500))
  on conflict (id) do nothing;
  select * into pr from public.profiles where id = auth.uid();
  return pr;
end;
$$;

-- link_my_profile and redeem_link_token call it with no arguments (defaults apply).
