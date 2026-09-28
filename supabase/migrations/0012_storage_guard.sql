-- 0012: storage guard.
--
-- 1. Close a live hole: the update/delete policies on tournament-assets had
--    no role and no session check on the `courses/` branch, so anyone with
--    the public key could overwrite or delete scorecard files.
-- 2. Folder names are cast to a tournament uuid only when they look like
--    one (`try_uuid`), so new top-level folders (e.g. `profiles/`) are
--    refused cleanly instead of raising 22P02.

create or replace function public.try_uuid(p text)
returns uuid
language sql immutable
set search_path = public
as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

drop policy if exists assets_member_write on storage.objects;
create policy assets_member_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tournament-assets' and auth.uid() is not null and (
      (split_part(name, '/', 1) = 'courses' and public.can_manage_courses())
      or public.is_tournament_member(public.try_uuid(split_part(name, '/', 1)))
    )
  );

drop policy if exists assets_organizer_update on storage.objects;
create policy assets_organizer_update on storage.objects for update to authenticated
  using (
    bucket_id = 'tournament-assets' and auth.uid() is not null and (
      (split_part(name, '/', 1) = 'courses' and public.can_manage_courses())
      or public.is_tournament_organizer(public.try_uuid(split_part(name, '/', 1)))
    )
  );

drop policy if exists assets_organizer_delete on storage.objects;
create policy assets_organizer_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'tournament-assets' and auth.uid() is not null and (
      (split_part(name, '/', 1) = 'courses' and public.can_manage_courses())
      or public.is_tournament_organizer(public.try_uuid(split_part(name, '/', 1)))
    )
  );
