-- 0061: the public bucket can't be listed (TRUST-07).
--
-- tournament-assets is a public bucket: its files (logos, players' photos, profile photos, scorecard photos) are
-- served at their public URL to anyone who has it, with no policy involved. But assets_public_read (0003) also let
-- anyone, with no session at all, read storage.objects for the bucket, which is what the Storage API's «list»
-- reads: every file's path, tournament by tournament, with its size and dates. The read now admits exactly the
-- rows the caller may upload: a tournament's folder to its members, courses/ to whoever manages courses, and
-- profiles/<uid>/ to that account. An upload with upsert, which every one of the app's uploads is, needs that read
-- on the row it writes, and that is all it needs. Public URLs are unchanged, so every image still shows; nobody
-- can list another tournament's or another account's files, and nobody without a session can list anything.
-- How long a file is kept is the operator's call (handoff 5e).

drop policy if exists assets_public_read on storage.objects;
create policy assets_member_read on storage.objects for select to authenticated
  using (
    bucket_id = 'tournament-assets' and auth.uid() is not null and (
      (split_part(name, '/', 1) = 'courses' and public.can_manage_courses())
      or (split_part(name, '/', 1) = 'profiles' and split_part(name, '/', 2) = auth.uid()::text and public.is_account_user(auth.uid()))
      or public.is_tournament_member(public.try_uuid(split_part(name, '/', 1)))
    )
  );
