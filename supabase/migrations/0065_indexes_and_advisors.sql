-- 0065: the indexes every key needs, and the advisors' warnings that were still open (DB-15, DB-16).
--
-- DB-15. Forty-four foreign keys had no index whose leading columns are the key's: every delete of a player, a
-- round, a tee, a course, a pair or an account scanned the tables that point at it, across every tournament on the
-- platform (scores twice: player_id cascades, entered_by is set null), and a few app paths filtered on them
-- (tournament_organizers by account, rounds by course in can_edit_course). Each gets one, its columns in the key's
-- order, as the advisor reads a covering index. The one key left to the advisor, team_members (player_id,
-- tournament_id), is covered by team_members' own (tournament_id, player_id) unique key: the same two columns, so
-- a second index on them would be maintained for nothing. Four plain indexes were a leading prefix of another index
-- on the same table and served nothing it doesn't: scores (round_id) of its (round_id, player_id, hole) key,
-- players (tournament_id) of players_tenant_uk, payments (tournament_id) of its flow key, teams (tournament_id) of
-- its (tournament_id, number) key. None backs a constraint; they go. supabase/tests/fk_indexes.sql holds both
-- rules for every later migration.
--
-- DB-16. What changes nobody's rights:
--   1. Every policy in public written TO PUBLIC is now TO authenticated. Each one asks for a session already
--      (auth.uid(), or a helper that is false without one), so the browser with no session (anon) is refused or
--      reads nothing as before; it just no longer evaluates them, which is what lets it lose the helpers below.
--   2. The sixteen policies that called auth.uid() for every row call it once per statement: (select auth.uid()),
--      the same value; so do the bucket's four on storage.objects, which the advisor doesn't read.
--   3. The two FOR ALL policies that overlapped their table's read policy are split by command, as 0030 split the
--      tournament tables': course_documents (its read already admits every session can_edit_course admits) and
--      tournament_organizers, whose read now says in one policy what the two said together (one's own row, or any
--      row of a tournament one owns).
--   4. The five functions with no search_path get public's, the schema every other function names.
--   5. EXECUTE. A browser with no session (anon) keeps exactly the four calls it makes: app_flags, spectator_board,
--      lookup_tournament, push_prune (the push route's). Every other function in public loses anon and PUBLIC, and
--      keeps authenticated and service_role where it had them. Trigger functions lose authenticated too: a trigger
--      fires whatever its function's grants (EXECUTE is checked when the trigger is created), and nobody calls one
--      directly. Six internal helpers no policy, check, default, invoker function or app build ever called lose
--      authenticated: current_player_id, current_tournament_id, is_admin_player, is_tournament_organizer_own,
--      is_tournament_participant, profile_visible_to_me; the definer functions that use them run as their owner.
--      supabase/tests/function_grants.sql holds the anon list, the triggers and the policies' roles.
-- What stays, and why, is in docs/db-advisors.md.

-- ---------------------------------------------------------------------------
-- DB-15. One index per foreign key, none twice
-- ---------------------------------------------------------------------------
create index calcutta_bids_bidder_id_tournament_id_idx on public.calcutta_bids (bidder_id, tournament_id);
create index calcutta_lots_owner_id_tournament_id_idx on public.calcutta_lots (owner_id, tournament_id);
create index card_signatures_pair_id_idx on public.card_signatures (pair_id);
create index card_signatures_signed_by_tournament_id_idx on public.card_signatures (signed_by, tournament_id);
create index course_documents_course_id_idx on public.course_documents (course_id);
create index course_documents_created_by_idx on public.course_documents (created_by);
create index courses_created_by_idx on public.courses (created_by);
create index crews_created_by_idx on public.crews (created_by);
create index device_sessions_tournament_id_idx on public.device_sessions (tournament_id);
create index friendships_b_idx on public.friendships (b);
create index game_entries_player_id_tournament_id_idx on public.game_entries (player_id, tournament_id);
create index game_results_player_id_tournament_id_idx on public.game_results (player_id, tournament_id);
create index handicap_overrides_by_tournament_id_idx on public.handicap_overrides (by, tournament_id);
create index handicap_overrides_player_id_tournament_id_idx on public.handicap_overrides (player_id, tournament_id);
create index hole_awards_decided_by_tournament_id_idx on public.hole_awards (decided_by, tournament_id);
create index hole_awards_group_id_idx on public.hole_awards (group_id);
create index hole_awards_player_id_tournament_id_idx on public.hole_awards (player_id, tournament_id);
create index notifications_actor_idx on public.notifications (actor);
create index pairs_player1_id_tournament_id_idx on public.pairs (player1_id, tournament_id);
create index pairs_player2_id_tournament_id_idx on public.pairs (player2_id, tournament_id);
create index payments_from_player_id_tournament_id_idx on public.payments (from_player_id, tournament_id);
create index payments_to_player_id_tournament_id_idx on public.payments (to_player_id, tournament_id);
create index photos_player_id_tournament_id_idx on public.photos (player_id, tournament_id);
create index photos_round_id_idx on public.photos (round_id);
create index platform_unlocks_tournament_id_idx on public.platform_unlocks (tournament_id);
create index players_default_tee_id_idx on public.players (default_tee_id);
create index profile_link_tokens_player_id_idx on public.profile_link_tokens (player_id);
create index rivalries_a_idx on public.rivalries (a);
create index rivalries_b_idx on public.rivalries (b);
create index rivalry_rounds_round_id_idx on public.rivalry_rounds (round_id);
create index round_tees_player_id_tournament_id_idx on public.round_tees (player_id, tournament_id);
create index round_tees_tee_id_idx on public.round_tees (tee_id);
create index rounds_course_id_idx on public.rounds (course_id);
create index scores_entered_by_tournament_id_idx on public.scores (entered_by, tournament_id);
create index scores_player_id_tournament_id_idx on public.scores (player_id, tournament_id);
create index snake_tiebreaks_decided_by_tournament_id_idx on public.snake_tiebreaks (decided_by, tournament_id);
create index snake_tiebreaks_group_id_idx on public.snake_tiebreaks (group_id);
create index snake_tiebreaks_last_holed_player_id_tournament_id_idx on public.snake_tiebreaks (last_holed_player_id, tournament_id);
create index team_members_team_id_tournament_id_idx on public.team_members (team_id, tournament_id);
create index tournament_organizers_auth_user_id_idx on public.tournament_organizers (auth_user_id);
create index tournaments_banker_player_id_id_idx on public.tournaments (banker_player_id, id);
create index tournaments_created_by_idx on public.tournaments (created_by);
create index tournaments_crew_id_idx on public.tournaments (crew_id);
create index tournaments_current_round_id_idx on public.tournaments (current_round_id);

drop index public.scores_round_idx;
drop index public.players_tournament_idx;
drop index public.payments_tournament_idx;
drop index public.teams_tournament_idx;

-- ---------------------------------------------------------------------------
-- DB-16.1 Policies for sessions only
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in select tablename, policyname from pg_policies where schemaname = 'public' and roles = '{public}' loop
    execute format('alter policy %I on public.%I to authenticated', p.policyname, p.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- DB-16.2 auth.uid() once per statement
-- ---------------------------------------------------------------------------
alter policy courses_read on public.courses using ((select auth.uid()) is not null);
alter policy courses_delete on public.courses using (created_by = (select auth.uid()) or public.is_platform_admin());
alter policy tees_read on public.tees using ((select auth.uid()) is not null);
alter policy holes_read on public.holes using ((select auth.uid()) is not null);
alter policy course_documents_read on public.course_documents using ((select auth.uid()) is not null);
alter policy device_sessions_self on public.device_sessions using (auth_user_id = (select auth.uid()));
alter policy friendships_own on public.friendships using (a = (select auth.uid()) or b = (select auth.uid()));
alter policy notifications_own on public.notifications using (profile_id = (select auth.uid()));
alter policy organizers_self on public.organizers using (auth_user_id = (select auth.uid())) with check (auth_user_id = (select auth.uid()));
alter policy profiles_self_read on public.profiles using (id = (select auth.uid()));
alter policy profiles_self_update on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy push_subscriptions_own on public.push_subscriptions using (profile_id = (select auth.uid()));
alter policy rivalries_own on public.rivalries using (a = (select auth.uid()) or b = (select auth.uid()));
alter policy rivalry_rounds_own on public.rivalry_rounds using (exists (
  select 1 from public.rivalries r where r.id = rivalry_rounds.rivalry_id and (r.a = (select auth.uid()) or r.b = (select auth.uid()))
));
alter policy tournament_money_read on public.tournament_money using (public.is_tournament_organizer(tournament_id) or exists (
  select 1 from public.players p
  where p.id = tournament_money.player_id and p.profile_id = (select auth.uid()) and p.profile_status = 'confirmed'
));
-- The bucket's four (0013, 0061): every file of the bucket is a row they are asked about.
alter policy assets_member_read on storage.objects using (
  bucket_id = 'tournament-assets' and (select auth.uid()) is not null and (
    (split_part(name, '/', 1) = 'courses' and public.can_manage_courses())
    or (split_part(name, '/', 1) = 'profiles' and split_part(name, '/', 2) = (select auth.uid())::text and public.is_account_user((select auth.uid())))
    or public.is_tournament_member(public.try_uuid(split_part(name, '/', 1)))
  )
);
alter policy assets_member_write on storage.objects with check (
  bucket_id = 'tournament-assets' and (select auth.uid()) is not null and (
    (split_part(name, '/', 1) = 'courses' and public.can_manage_courses())
    or (split_part(name, '/', 1) = 'profiles' and split_part(name, '/', 2) = (select auth.uid())::text and public.is_account_user((select auth.uid())))
    or public.is_tournament_member(public.try_uuid(split_part(name, '/', 1)))
  )
);
alter policy assets_organizer_update on storage.objects using (
  bucket_id = 'tournament-assets' and (select auth.uid()) is not null and (
    (split_part(name, '/', 1) = 'courses' and public.can_manage_courses())
    or (split_part(name, '/', 1) = 'profiles' and split_part(name, '/', 2) = (select auth.uid())::text and public.is_account_user((select auth.uid())))
    or public.is_tournament_organizer(public.try_uuid(split_part(name, '/', 1)))
  )
);
alter policy assets_organizer_delete on storage.objects using (
  bucket_id = 'tournament-assets' and (select auth.uid()) is not null and (
    (split_part(name, '/', 1) = 'courses' and public.can_manage_courses())
    or (split_part(name, '/', 1) = 'profiles' and split_part(name, '/', 2) = (select auth.uid())::text and public.is_account_user((select auth.uid())))
    or public.is_tournament_organizer(public.try_uuid(split_part(name, '/', 1)))
  )
);

-- ---------------------------------------------------------------------------
-- DB-16.3 One permissive policy per command
-- ---------------------------------------------------------------------------
drop policy course_documents_write on public.course_documents;
create policy course_documents_insert on public.course_documents for insert to authenticated
  with check (public.can_edit_course(course_id));
create policy course_documents_update on public.course_documents for update to authenticated
  using (public.can_edit_course(course_id)) with check (public.can_edit_course(course_id));
create policy course_documents_delete on public.course_documents for delete to authenticated
  using (public.can_edit_course(course_id));

drop policy tournament_organizers_write on public.tournament_organizers;
alter policy tournament_organizers_read on public.tournament_organizers
  using (auth_user_id = (select auth.uid()) or public.is_tournament_owner(tournament_id));
create policy tournament_organizers_insert on public.tournament_organizers for insert to authenticated
  with check (public.is_tournament_owner(tournament_id) and public.is_account_user(auth_user_id));
create policy tournament_organizers_update on public.tournament_organizers for update to authenticated
  using (public.is_tournament_owner(tournament_id)) with check (public.is_tournament_owner(tournament_id) and public.is_account_user(auth_user_id));
create policy tournament_organizers_delete on public.tournament_organizers for delete to authenticated
  using (public.is_tournament_owner(tournament_id));

-- ---------------------------------------------------------------------------
-- DB-16.4 A search_path on every function
-- ---------------------------------------------------------------------------
alter function public.slugify(text) set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.scores_detect_dispute() set search_path = public;
alter function public.scores_clean_insert() set search_path = public;
alter function public.tournaments_guard_protect() set search_path = public;

-- ---------------------------------------------------------------------------
-- DB-16.5 EXECUTE: what a browser with no session calls, and nothing a trigger or an internal helper is
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  anon_calls text[] := array['app_flags', 'spectator_board', 'lookup_tournament', 'push_prune'];
  internal text[] := array['current_player_id', 'current_tournament_id', 'is_admin_player', 'is_tournament_organizer_own',
                           'is_tournament_participant', 'profile_visible_to_me'];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname, p.prorettype = 'trigger'::regtype as is_trigger,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authd, has_function_privilege('service_role', p.oid, 'EXECUTE') as svc
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    if f.proname = any(anon_calls) then
      -- Theirs by name; through PUBLIC, nobody's.
      execute format('grant execute on function %s to anon, authenticated', f.sig);
      if f.svc then
        execute format('grant execute on function %s to service_role', f.sig);
      end if;
      execute format('revoke execute on function %s from public', f.sig);
      continue;
    end if;
    -- Whoever had it through PUBLIC keeps it by name before PUBLIC goes.
    if f.authd and not f.is_trigger and not f.proname = any(internal) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if f.svc then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.is_trigger or f.proname = any(internal) then
      execute format('revoke execute on function %s from authenticated', f.sig);
    end if;
  end loop;
end;
$$;
