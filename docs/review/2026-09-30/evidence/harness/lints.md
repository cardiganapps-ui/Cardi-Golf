# Supabase advisors (splinter) against the harness

Run 2026-09-30 03:46 UTC by `lints/run-lints.sh` on `lint_check`, a fresh unseeded clone of `polo_template` (stubs + all 24 migrations). Linter: `https://raw.githubusercontent.com/supabase/splinter/main/splinter.sql` (fetched 2026-09-30, `lints/splinter.sql`), run unmodified inside a transaction; exposed schemas default to `public` (as on the hosted project). Raw rows: `lints/splinter-results.csv` (with metadata and cache keys).

## Summary

| lint | level | facing | categories | results |
|---|---|---|---|---|
| `anon_security_definer_function_executable` | WARN | EXTERNAL | SECURITY | 86 |
| `auth_rls_initplan` | WARN | EXTERNAL | PERFORMANCE | 16 |
| `authenticated_security_definer_function_executable` | WARN | EXTERNAL | SECURITY | 128 |
| `function_search_path_mutable` | WARN | EXTERNAL | SECURITY | 5 |
| `multiple_permissive_policies` | WARN | EXTERNAL | PERFORMANCE | 92 |
| `public_bucket_allows_listing` | WARN | EXTERNAL | SECURITY | 1 |
| `rls_enabled_no_policy` | INFO | EXTERNAL | SECURITY | 9 |
| `unindexed_foreign_keys` | INFO | EXTERNAL | PERFORMANCE | 48 |
| `unused_index` | INFO | EXTERNAL | PERFORMANCE | 20 |
| **total** | | | | **405** |

No ERROR-level lint fires: `rls_disabled_in_public`, `policy_exists_rls_disabled`, `security_definer_view`, `auth_users_exposed`, `sensitive_columns_exposed`, `rls_policy_always_true`, `extension_in_public`, `duplicate_index`, `no_primary_key`, `materialized_view_in_api`, `foreign_table_in_api`, `rls_references_user_metadata`, `fkey_to_auth_unique`, `unsupported_reg_types`, `extension_versions_outdated`, `insecure_queue_exposed_in_api`, `table_bloat` and `autovacuum_disabled` all return 0.

**pg_graphql lints (0026/0027)** are gated on pg_graphql being installed; it is not available here but Supabase installs it by default. With the gate removed (`lints/run-splinter-graphql-ungated.sql`, rows in `lints/splinter-graphql-ungated.csv`): `pg_graphql_anon_table_exposed` **40**, `pg_graphql_authenticated_table_exposed` **41** (listed at the end). Whether pg_graphql is enabled on the hosted project could not be checked from here (an anon POST to `/graphql/v1` with an introspection query would tell).

## Every result, by lint

### `anon_security_definer_function_executable` — Public Can Execute SECURITY DEFINER Function (WARN, EXTERNAL, SECURITY) — 86

Detects `SECURITY DEFINER` functions that are callable without signing in. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if it is not meant to be public.  
Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

> Harness note: Callable with the public key and no session. Of the 86: 12 are trigger functions (PostgREST does not expose trigger functions; calling them directly errors), 66 scope themselves to the caller (auth.uid(), membership helpers, a secret), and 8 check nothing: `app_flags` (public by design) and 7 UUID oracles — `card_is_signed`, `group_tournament_id`, `is_account_user`, `lot_tournament_id`, `player_tournament_id`, `round_is_live`, `round_tournament_id` (given a UUID they reveal cross-tenant metadata: which tournament a player/round/group/lot belongs to, whether a uuid is an account). Classification: `lints/anon-definer-classified.txt`.

- Function `public.app_flags()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/app_flags`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.audit_row()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/audit_row`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.can_edit_course(cid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/can_edit_course`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.can_manage_courses()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/can_manage_courses`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.card_is_signed(rid uuid, pid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/card_is_signed`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.card_signature_settles()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/card_signature_settles`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.claim_player(p_player_id uuid, p_pin text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/claim_player`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.comite_link_profile(p_player_id uuid, p_handle text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/comite_link_profile`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.comite_unlink_profile(p_player_id uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/comite_unlink_profile`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.create_crew(p_name text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/create_crew`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.create_link_token()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/create_link_token`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.create_tournament(p_name text, p_settings jsonb, p_slug text, p_tagline text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/create_tournament`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.crew_page(p_slug text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/crew_page`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.crew_preview(p_code text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/crew_preview`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.current_player_id()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/current_player_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.current_tournament_id()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/current_tournament_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.delete_push_subscription(p_endpoint text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/delete_push_subscription`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.duplicate_tournament(p_source_id uuid, p_name text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/duplicate_tournament`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.ensure_my_profile(p_display_name text, p_full_name text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/ensure_my_profile`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friend_block(p_handle text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friend_block`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friend_remove(p_handle text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friend_remove`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friend_request(p_handle text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friend_request`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friend_respond(p_handle text, p_accept boolean)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friend_respond`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friends_feed(p_limit integer)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friends_feed`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friendship_with(p_handle text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friendship_with`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.group_tournament_id(gid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/group_tournament_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.guard_new_profiles()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/guard_new_profiles`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.guard_new_tournaments()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/guard_new_tournaments`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.head_to_head(p_handle text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/head_to_head`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_account_user(uid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_account_user`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_admin_player()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_admin_player`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_crew_member(cid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_crew_member`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_platform_admin()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_platform_admin`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_tournament_member(tid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_tournament_member`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_tournament_organizer_own(tid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_tournament_organizer_own`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_tournament_organizer(tid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_tournament_organizer`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_tournament_owner(tid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_tournament_owner`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_tournament_participant(tid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_tournament_participant`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.join_crew(p_code text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/join_crew`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.leave_crew(p_crew_id uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/leave_crew`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.link_my_profile(p_player_id uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/link_my_profile`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.lookup_tournament(p_code text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/lookup_tournament`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.lot_tournament_id(lid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/lot_tournament_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.mark_notifications_read(p_ids uuid[])` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/mark_notifications_read`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_crews()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_crews`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_friends()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_friends`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_links()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_links`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_membership(tid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_membership`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_money()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_money`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_notifications(p_limit integer)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_notifications`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_player_id(tid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_player_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_tournament_role(tid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_tournament_role`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.notifications_push()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/notifications_push`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.player_tournament_id(pid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/player_tournament_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.players_reindex()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/players_reindex`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.players_with_pin(p_tournament_id uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/players_with_pin`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.profile_card(p_handle text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/profile_card`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.profile_rounds(p_handle text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/profile_rounds`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.profile_tournaments(p_handle text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/profile_tournaments`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.profile_visible_to_me(pid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/profile_visible_to_me`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.publish_tournament_results(p_tournament_id uuid, p_rows jsonb, p_currency text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/publish_tournament_results`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.push_prune(p_secret text, p_endpoints text[])` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/push_prune`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.redeem_link_token(p_token text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/redeem_link_token`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.release_device()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/release_device`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rivalry_end(p_id uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rivalry_end`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rivalry_propose(p_handle text, p_strokes integer, p_cap integer)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rivalry_propose`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rivalry_respond(p_id uuid, p_accept boolean)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rivalry_respond`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rivalry_suggestion(p_handle text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rivalry_suggestion`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rotate_crew_code(p_crew_id uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rotate_crew_code`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.round_is_live(rid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/round_is_live`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.round_results_reindex()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/round_results_reindex`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.round_rivalries(tid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/round_rivalries`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.round_tournament_id(rid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/round_tournament_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rounds_refresh_results()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rounds_refresh_results`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/save_push_subscription`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.scores_refresh_results()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/scores_refresh_results`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.search_profiles(q text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/search_profiles`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.set_player_pin(p_player_id uuid, p_pin text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/set_player_pin`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.set_tournament_crew(p_tournament_id uuid, p_crew_id uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/set_tournament_crew`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.shares_group(rid uuid, pid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/shares_group`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.tees_guard_delete()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/tees_guard_delete`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.tournament_profiles(tid uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/tournament_profiles`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.tournament_results_notify()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/tournament_results_notify`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.tournaments_results_state()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/tournaments_results_state`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.unlink_my_profile(p_player_id uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/unlink_my_profile`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.unread_notifications()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/unread_notifications`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.

### `auth_rls_initplan` — Auth RLS Initialization Plan (WARN, EXTERNAL, PERFORMANCE) — 16

Detects if calls to `current_setting()` and `auth.<function>()` in RLS policies are being unnecessarily re-evaluated for each row  
Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

> Harness note: Policies calling auth.uid()/auth.jwt() directly (re-evaluated per row); wrap as `(select auth.uid())`. Most policies here call SECURITY DEFINER helpers per row instead (e.g. is_tournament_member(tournament_id)), which this lint does not see but which cost more.

- Table `public.course_documents` has a row level security policy `course_documents_read` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.courses` has a row level security policy `courses_delete` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.courses` has a row level security policy `courses_read` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.device_sessions` has a row level security policy `device_sessions_self` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.friendships` has a row level security policy `friendships_own` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.holes` has a row level security policy `holes_read` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.notifications` has a row level security policy `notifications_own` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.organizers` has a row level security policy `organizers_self` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.profiles` has a row level security policy `profiles_self_read` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.profiles` has a row level security policy `profiles_self_update` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.push_subscriptions` has a row level security policy `push_subscriptions_own` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.rivalries` has a row level security policy `rivalries_own` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.rivalry_rounds` has a row level security policy `rivalry_rounds_own` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.tees` has a row level security policy `tees_read` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.tournament_money` has a row level security policy `tournament_money_read` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- Table `public.tournament_organizers` has a row level security policy `tournament_organizers_read` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing `auth.<function>()` with `(select auth.<function>())`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.

### `authenticated_security_definer_function_executable` — Signed-In Users Can Execute SECURITY DEFINER Function (WARN, EXTERNAL, SECURITY) — 128

Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it.  
Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

> Harness note: Every public SECURITY DEFINER function a signed-in session (including an anonymous device) can call over /rest/v1/rpc. Includes all 86 anon-callable ones plus 42 granted to `authenticated` only (the Comité RPCs and every `platform_*`). Each must guard itself; the platform_* ones all start with `is_platform_admin()` (see E2).

- Function `public.admin_save_score(p_round_id uuid, p_player_id uuid, p_hole integer, p_strokes integer, p_putts integer, p_picked_up boolean, p_reason text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/admin_save_score`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.app_flags()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/app_flags`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.audit_row()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/audit_row`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.can_edit_course(cid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/can_edit_course`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.can_manage_courses()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/can_manage_courses`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.card_is_signed(rid uuid, pid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/card_is_signed`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.card_signature_settles()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/card_signature_settles`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.claim_player(p_player_id uuid, p_pin text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/claim_player`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.comite_link_profile(p_player_id uuid, p_handle text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/comite_link_profile`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.comite_unlink_profile(p_player_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/comite_unlink_profile`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.create_crew(p_name text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/create_crew`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.create_link_token()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/create_link_token`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.create_quick_round(p jsonb)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/create_quick_round`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.create_tournament(p_name text, p_settings jsonb, p_slug text, p_tagline text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/create_tournament`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.crew_page(p_slug text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/crew_page`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.crew_preview(p_code text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/crew_preview`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.current_player_id()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/current_player_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.current_tournament_id()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/current_tournament_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.delete_course(p_course_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/delete_course`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.delete_push_subscription(p_endpoint text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/delete_push_subscription`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.duplicate_tournament(p_source_id uuid, p_name text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/duplicate_tournament`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.ensure_my_profile(p_display_name text, p_full_name text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/ensure_my_profile`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friend_block(p_handle text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friend_block`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friend_remove(p_handle text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friend_remove`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friend_request(p_handle text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friend_request`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friend_respond(p_handle text, p_accept boolean)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friend_respond`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friends_feed(p_limit integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friends_feed`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friendship_with(p_handle text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friendship_with`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.group_tournament_id(gid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/group_tournament_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.guard_new_profiles()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/guard_new_profiles`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.guard_new_tournaments()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/guard_new_tournaments`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.head_to_head(p_handle text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/head_to_head`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_account_user(uid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_account_user`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_admin_player()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_admin_player`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_crew_member(cid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_crew_member`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_platform_admin()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_platform_admin`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_tournament_member(tid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_tournament_member`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_tournament_organizer_own(tid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_tournament_organizer_own`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_tournament_organizer(tid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_tournament_organizer`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_tournament_owner(tid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_tournament_owner`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_tournament_participant(tid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_tournament_participant`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.join_crew(p_code text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/join_crew`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.leave_crew(p_crew_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/leave_crew`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.link_my_profile(p_player_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/link_my_profile`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.lookup_tournament(p_code text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/lookup_tournament`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.lot_tournament_id(lid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/lot_tournament_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.mark_notifications_read(p_ids uuid[])` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/mark_notifications_read`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_crews()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_crews`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_friends()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_friends`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_links()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_links`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_membership(tid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_membership`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_money()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_money`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_notifications(p_limit integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_notifications`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_player_id(tid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_player_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_tournament_role(tid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_tournament_role`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.notifications_push()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/notifications_push`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_audience()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_audience`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_audit_entry(p_source text, p_id bigint)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_audit_entry`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_audit(p_source text, p_before timestamp with time zone, p_limit integer, p_q text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_audit`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_block(p_user_id uuid, p_reason text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_block`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_broadcast(p_title text, p_body text, p_to uuid, p_url text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_broadcast`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_course(p_course_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_course`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_courses(p_q text, p_filter text, p_limit integer, p_offset integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_courses`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_crew(p_crew_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_crew`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_crew_remove_member(p_crew_id uuid, p_profile_id uuid, p_reason text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_crew_remove_member`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_crews(p_q text, p_limit integer, p_offset integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_crews`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_daily(p_days integer, p_tz text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_daily`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_delete_account(p_user_id uuid, p_confirm text, p_reason text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_delete_account`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_delete_course(p_course_id uuid, p_reason text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_delete_course`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_delete_crew(p_crew_id uuid, p_confirm text, p_reason text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_delete_crew`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_delete_preview(p_user_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_delete_preview`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_health()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_health`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_merge_courses(p_keep uuid, p_drop uuid, p_tee_map jsonb, p_reason text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_merge_courses`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_overview()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_overview`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_people(p_q text, p_filter text, p_limit integer, p_offset integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_people`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_person(p_user_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_person`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_refresh_course_results(p_course_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_refresh_course_results`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_relock(p_tournament_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_relock`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_reset_pin_lock(p_user_id uuid, p_player_id uuid, p_reason text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_reset_pin_lock`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_set_flag(p_key text, p_value jsonb, p_reason text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_set_flag`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_set_organizer(p_tournament_id uuid, p_user_id uuid, p_role text, p_reason text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_set_organizer`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_tournament(p_tournament_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_tournament`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_tournaments(p_q text, p_status text, p_kind text, p_limit integer, p_offset integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_tournaments`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_unblock(p_user_id uuid, p_reason text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_unblock`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.platform_unlock(p_tournament_id uuid, p_reason text, p_minutes integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/platform_unlock`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.player_tournament_id(pid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/player_tournament_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.players_reindex()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/players_reindex`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.players_with_pin(p_tournament_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/players_with_pin`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.profile_card(p_handle text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/profile_card`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.profile_rounds(p_handle text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/profile_rounds`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.profile_tournaments(p_handle text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/profile_tournaments`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.profile_visible_to_me(pid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/profile_visible_to_me`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.publish_tournament_results(p_tournament_id uuid, p_rows jsonb, p_currency text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/publish_tournament_results`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.push_prune(p_secret text, p_endpoints text[])` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/push_prune`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.redeem_link_token(p_token text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/redeem_link_token`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.release_device()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/release_device`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rename_team(p_team_id uuid, p_name text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rename_team`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.resolve_score_dispute(p_round_id uuid, p_player_id uuid, p_hole integer, p_keep boolean)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/resolve_score_dispute`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.restore_tournament(p_tournament_id uuid, p_backup jsonb)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/restore_tournament`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rivalry_end(p_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rivalry_end`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rivalry_propose(p_handle text, p_strokes integer, p_cap integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rivalry_propose`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rivalry_respond(p_id uuid, p_accept boolean)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rivalry_respond`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rivalry_suggestion(p_handle text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rivalry_suggestion`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rotate_crew_code(p_crew_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rotate_crew_code`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rotate_join_code(p_tournament_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rotate_join_code`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.round_is_live(rid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/round_is_live`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.round_results_reindex()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/round_results_reindex`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.round_rivalries(tid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/round_rivalries`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.round_tournament_id(rid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/round_tournament_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.rounds_refresh_results()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/rounds_refresh_results`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.save_draw(p_tournament_id uuid, p_pairs jsonb, p_round1_groups jsonb, p_go_live boolean)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/save_draw`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/save_push_subscription`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.save_teams(p_tournament_id uuid, p_teams jsonb)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/save_teams`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.scores_refresh_results()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/scores_refresh_results`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.search_profiles(q text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/search_profiles`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.set_payment_paid(p_tournament_id uuid, p_kind text, p_from uuid, p_to uuid, p_amount integer, p_paid boolean, p_note text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/set_payment_paid`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.set_player_pin(p_player_id uuid, p_pin text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/set_player_pin`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.set_tournament_crew(p_tournament_id uuid, p_crew_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/set_tournament_crew`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.set_tournament_protected(p_tournament_id uuid, p_on boolean, p_reason text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/set_tournament_protected`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.shares_group(rid uuid, pid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/shares_group`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.tees_guard_delete()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/tees_guard_delete`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.tournament_audit(p_tournament_id uuid, p_before bigint, p_limit integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/tournament_audit`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.tournament_profiles(tid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/tournament_profiles`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.tournament_results_notify()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/tournament_results_notify`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.tournaments_results_state()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/tournaments_results_state`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.unlink_my_profile(p_player_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/unlink_my_profile`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.unread_notifications()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/unread_notifications`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.upsert_groups(p_round_id uuid, p_groups jsonb)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/upsert_groups`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.

### `function_search_path_mutable` — Function Search Path Mutable (WARN, EXTERNAL, SECURITY) — 5

Detects functions where the search_path parameter is not set.  
Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

> Harness note: Five non-definer functions without `set search_path` (four trigger functions and slugify). Low risk (not SECURITY DEFINER), trivial to pin.

- Function `public.scores_clean_insert` has a role mutable search_path
- Function `public.scores_detect_dispute` has a role mutable search_path
- Function `public.slugify` has a role mutable search_path
- Function `public.touch_updated_at` has a role mutable search_path
- Function `public.tournaments_guard_protect` has a role mutable search_path

### `multiple_permissive_policies` — Multiple Permissive Policies (WARN, EXTERNAL, PERFORMANCE) — 92

Detects if multiple permissive row level security policies are present on a table for the same `role` and `action` (e.g. insert). Multiple permissive policies are suboptimal for performance as each policy must be executed for every relevant query.  
Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

> Harness note: Tables with a `*_read` (SELECT) policy plus a `*_write` FOR ALL policy: both run for every SELECT. Reported per role; the role list is the harness's (anon, authenticated, authenticator, dashboard_user) — the hosted project may list a few more roles for the same 23 tables.

- Table `public.calcutta_bids` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{calcutta_bids_read,calcutta_bids_write}`
- Table `public.calcutta_bids` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{calcutta_bids_read,calcutta_bids_write}`
- Table `public.calcutta_bids` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{calcutta_bids_read,calcutta_bids_write}`
- Table `public.calcutta_bids` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{calcutta_bids_read,calcutta_bids_write}`
- Table `public.calcutta_buybacks` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{calcutta_buybacks_read,calcutta_buybacks_write}`
- Table `public.calcutta_buybacks` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{calcutta_buybacks_read,calcutta_buybacks_write}`
- Table `public.calcutta_buybacks` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{calcutta_buybacks_read,calcutta_buybacks_write}`
- Table `public.calcutta_buybacks` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{calcutta_buybacks_read,calcutta_buybacks_write}`
- Table `public.calcutta_lots` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{calcutta_lots_read,calcutta_lots_write}`
- Table `public.calcutta_lots` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{calcutta_lots_read,calcutta_lots_write}`
- Table `public.calcutta_lots` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{calcutta_lots_read,calcutta_lots_write}`
- Table `public.calcutta_lots` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{calcutta_lots_read,calcutta_lots_write}`
- Table `public.course_documents` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{course_documents_read,course_documents_write}`
- Table `public.course_documents` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{course_documents_read,course_documents_write}`
- Table `public.course_documents` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{course_documents_read,course_documents_write}`
- Table `public.course_documents` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{course_documents_read,course_documents_write}`
- Table `public.game_entries` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{game_entries_read,game_entries_write}`
- Table `public.game_entries` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{game_entries_read,game_entries_write}`
- Table `public.game_entries` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{game_entries_read,game_entries_write}`
- Table `public.game_entries` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{game_entries_read,game_entries_write}`
- Table `public.game_results` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{game_results_read,game_results_write}`
- Table `public.game_results` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{game_results_read,game_results_write}`
- Table `public.game_results` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{game_results_read,game_results_write}`
- Table `public.game_results` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{game_results_read,game_results_write}`
- Table `public.group_members` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{group_members_read,group_members_write}`
- Table `public.group_members` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{group_members_read,group_members_write}`
- Table `public.group_members` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{group_members_read,group_members_write}`
- Table `public.group_members` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{group_members_read,group_members_write}`
- Table `public.groups` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{groups_read,groups_write}`
- Table `public.groups` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{groups_read,groups_write}`
- Table `public.groups` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{groups_read,groups_write}`
- Table `public.groups` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{groups_read,groups_write}`
- Table `public.handicap_overrides` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{handicap_overrides_read,handicap_overrides_write}`
- Table `public.handicap_overrides` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{handicap_overrides_read,handicap_overrides_write}`
- Table `public.handicap_overrides` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{handicap_overrides_read,handicap_overrides_write}`
- Table `public.handicap_overrides` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{handicap_overrides_read,handicap_overrides_write}`
- Table `public.hole_awards` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{hole_awards_read,hole_awards_write}`
- Table `public.hole_awards` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{hole_awards_read,hole_awards_write}`
- Table `public.hole_awards` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{hole_awards_read,hole_awards_write}`
- Table `public.hole_awards` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{hole_awards_read,hole_awards_write}`
- Table `public.holes` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{holes_read,holes_write}`
- Table `public.holes` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{holes_read,holes_write}`
- Table `public.holes` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{holes_read,holes_write}`
- Table `public.holes` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{holes_read,holes_write}`
- Table `public.pairs` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{pairs_read,pairs_write}`
- Table `public.pairs` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{pairs_read,pairs_write}`
- Table `public.pairs` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{pairs_read,pairs_write}`
- Table `public.pairs` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{pairs_read,pairs_write}`
- Table `public.payments` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{payments_read,payments_write}`
- Table `public.payments` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{payments_read,payments_write}`
- Table `public.payments` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{payments_read,payments_write}`
- Table `public.payments` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{payments_read,payments_write}`
- Table `public.photos` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{photos_read,photos_write}`
- Table `public.photos` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{photos_read,photos_write}`
- Table `public.photos` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{photos_read,photos_write}`
- Table `public.photos` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{photos_read,photos_write}`
- Table `public.players` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{players_read,players_write}`
- Table `public.players` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{players_read,players_write}`
- Table `public.players` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{players_read,players_write}`
- Table `public.players` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{players_read,players_write}`
- Table `public.round_tees` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{round_tees_read,round_tees_write}`
- Table `public.round_tees` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{round_tees_read,round_tees_write}`
- Table `public.round_tees` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{round_tees_read,round_tees_write}`
- Table `public.round_tees` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{round_tees_read,round_tees_write}`
- Table `public.rounds` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{rounds_read,rounds_write}`
- Table `public.rounds` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{rounds_read,rounds_write}`
- Table `public.rounds` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{rounds_read,rounds_write}`
- Table `public.rounds` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{rounds_read,rounds_write}`
- Table `public.scores` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{scores_read,scores_write}`
- Table `public.scores` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{scores_read,scores_write}`
- Table `public.scores` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{scores_read,scores_write}`
- Table `public.scores` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{scores_read,scores_write}`
- Table `public.snake_tiebreaks` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{snake_tiebreaks_read,snake_tiebreaks_write}`
- Table `public.snake_tiebreaks` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{snake_tiebreaks_read,snake_tiebreaks_write}`
- Table `public.snake_tiebreaks` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{snake_tiebreaks_read,snake_tiebreaks_write}`
- Table `public.snake_tiebreaks` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{snake_tiebreaks_read,snake_tiebreaks_write}`
- Table `public.team_members` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{team_members_read,team_members_write}`
- Table `public.team_members` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{team_members_read,team_members_write}`
- Table `public.team_members` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{team_members_read,team_members_write}`
- Table `public.team_members` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{team_members_read,team_members_write}`
- Table `public.teams` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{teams_read,teams_write}`
- Table `public.teams` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{teams_read,teams_write}`
- Table `public.teams` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{teams_read,teams_write}`
- Table `public.teams` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{teams_read,teams_write}`
- Table `public.tees` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{tees_read,tees_write}`
- Table `public.tees` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{tees_read,tees_write}`
- Table `public.tees` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{tees_read,tees_write}`
- Table `public.tees` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{tees_read,tees_write}`
- Table `public.tournament_organizers` has multiple permissive policies for role `anon` for action `SELECT`. Policies include `{tournament_organizers_read,tournament_organizers_write}`
- Table `public.tournament_organizers` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{tournament_organizers_read,tournament_organizers_write}`
- Table `public.tournament_organizers` has multiple permissive policies for role `authenticator` for action `SELECT`. Policies include `{tournament_organizers_read,tournament_organizers_write}`
- Table `public.tournament_organizers` has multiple permissive policies for role `dashboard_user` for action `SELECT`. Policies include `{tournament_organizers_read,tournament_organizers_write}`

### `public_bucket_allows_listing` — Public Bucket Allows Listing (WARN, EXTERNAL, SECURITY) — 1

Detects public storage buckets with a broad SELECT policy on `storage.objects`, which allows clients to list all files in the bucket.  
Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0025_public_bucket_allows_listing

> Harness note: Policy `assets_public_read` (0003) lets anyone with the public key list every object in `tournament-assets`: object names are `<tournament_id>/…`, `courses/<course_id>/…` and `profiles/<auth uid>/…`, so the listing enumerates tournament ids and account ids. Public URLs do not need this policy. Proven in E3: `anon` reads the storage.objects row.

- Public bucket `tournament-assets` has 1 broad SELECT policy on `storage.objects` (assets_public_read), allowing clients to list all files. Public buckets don't need this for object URL access and it may expose more data than intended.

### `rls_enabled_no_policy` — RLS Enabled No Policy (INFO, EXTERNAL, SECURITY) — 9

Detects cases where row level security (RLS) has been enabled on a table but no RLS policies have been created.  
Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

> Harness note: All nine are deliberately definer-only (no client access): _migrations, backup_runs, pin_attempts, platform_admins, platform_audit_log, platform_settings, platform_unlocks, player_pins, profile_link_tokens. Note `player_pins` still carries the default table grants to anon/authenticated (E1), unlike the others.

- Table `public._migrations` has RLS enabled, but no policies exist
- Table `public.backup_runs` has RLS enabled, but no policies exist
- Table `public.pin_attempts` has RLS enabled, but no policies exist
- Table `public.platform_admins` has RLS enabled, but no policies exist
- Table `public.platform_audit_log` has RLS enabled, but no policies exist
- Table `public.platform_settings` has RLS enabled, but no policies exist
- Table `public.platform_unlocks` has RLS enabled, but no policies exist
- Table `public.player_pins` has RLS enabled, but no policies exist
- Table `public.profile_link_tokens` has RLS enabled, but no policies exist

### `unindexed_foreign_keys` — Unindexed foreign keys (INFO, EXTERNAL, PERFORMANCE) — 48

Identifies foreign key constraints without a covering index, which can impact database performance.  
Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

> Harness note: FK columns without a covering index (joins and ON DELETE cascades scan). Several are on hot paths: scores.player_id, scores.entered_by, pairs.player1_id/player2_id, payments.from/to, round_tees.player_id, hole_awards.player_id/group_id, snake_tiebreaks.group_id.

- Table `public.calcutta_bids` has a foreign key `calcutta_bids_bidder_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.calcutta_lots` has a foreign key `calcutta_lots_owner_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.calcutta_lots` has a foreign key `calcutta_lots_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.card_signatures` has a foreign key `card_signatures_pair_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.card_signatures` has a foreign key `card_signatures_signed_by_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.course_documents` has a foreign key `course_documents_course_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.course_documents` has a foreign key `course_documents_created_by_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.courses` has a foreign key `courses_created_by_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.crews` has a foreign key `crews_created_by_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.device_sessions` has a foreign key `device_sessions_tournament_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.friendships` has a foreign key `friendships_b_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.game_entries` has a foreign key `game_entries_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.game_results` has a foreign key `game_results_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.handicap_overrides` has a foreign key `handicap_overrides_by_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.handicap_overrides` has a foreign key `handicap_overrides_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.hole_awards` has a foreign key `hole_awards_decided_by_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.hole_awards` has a foreign key `hole_awards_group_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.hole_awards` has a foreign key `hole_awards_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.notifications` has a foreign key `notifications_actor_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.pairs` has a foreign key `pairs_player1_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.pairs` has a foreign key `pairs_player2_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.payments` has a foreign key `payments_from_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.payments` has a foreign key `payments_to_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.photos` has a foreign key `photos_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.photos` has a foreign key `photos_round_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.platform_unlocks` has a foreign key `platform_unlocks_tournament_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.players` has a foreign key `players_default_tee_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.profile_link_tokens` has a foreign key `profile_link_tokens_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.rivalries` has a foreign key `rivalries_a_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.rivalries` has a foreign key `rivalries_b_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.rivalry_rounds` has a foreign key `rivalry_rounds_round_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.round_tees` has a foreign key `round_tees_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.round_tees` has a foreign key `round_tees_tee_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.rounds` has a foreign key `rounds_course_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.scores` has a foreign key `scores_entered_by_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.scores` has a foreign key `scores_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.snake_tiebreaks` has a foreign key `snake_tiebreaks_decided_by_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.snake_tiebreaks` has a foreign key `snake_tiebreaks_group_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.snake_tiebreaks` has a foreign key `snake_tiebreaks_last_holed_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.team_members` has a foreign key `team_members_player_id_tournament_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.team_members` has a foreign key `team_members_team_id_tournament_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.tournament_money` has a foreign key `tournament_money_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.tournament_organizers` has a foreign key `tournament_organizers_auth_user_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.tournament_results` has a foreign key `tournament_results_player_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.tournaments` has a foreign key `tournaments_banker_fk` without a covering index. This can lead to suboptimal query performance.
- Table `public.tournaments` has a foreign key `tournaments_created_by_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.tournaments` has a foreign key `tournaments_crew_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.tournaments` has a foreign key `tournaments_current_round_fk` without a covering index. This can lead to suboptimal query performance.

### `unused_index` — Unused Index (INFO, EXTERNAL, PERFORMANCE) — 20

Detects if an index has never been used and may be a candidate for removal.  
Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

> Harness note: **Not meaningful here**: a freshly cloned database has no index usage statistics, so every non-unique index is "unused". Kept for completeness.

- Index `audit_log_platform_idx` on table `public.audit_log` has not been used
- Index `audit_log_tournament_idx` on table `public.audit_log` has not been used
- Index `backup_runs_at_idx` on table `public.backup_runs` has not been used
- Index `calcutta_bids_lot_idx` on table `public.calcutta_bids` has not been used
- Index `crew_members_profile_idx` on table `public.crew_members` has not been used
- Index `device_sessions_player_idx` on table `public.device_sessions` has not been used
- Index `group_members_player_idx` on table `public.group_members` has not been used
- Index `notifications_unread` on table `public.notifications` has not been used
- Index `pairs_tournament_idx` on table `public.pairs` has not been used
- Index `payments_tournament_idx` on table `public.payments` has not been used
- Index `platform_audit_log_at_idx` on table `public.platform_audit_log` has not been used
- Index `players_profile_idx` on table `public.players` has not been used
- Index `players_tournament_idx` on table `public.players` has not been used
- Index `push_subscriptions_profile_idx` on table `public.push_subscriptions` has not been used
- Index `round_results_player_idx` on table `public.round_results` has not been used
- Index `round_results_tournament_idx` on table `public.round_results` has not been used
- Index `scores_round_idx` on table `public.scores` has not been used
- Index `team_members_player_idx` on table `public.team_members` has not been used
- Index `teams_tournament_idx` on table `public.teams` has not been used
- Index `tees_course_idx` on table `public.tees` has not been used

### pg_graphql lints with the install gate removed

#### `pg_graphql_anon_table_exposed` — Public Can See Object in GraphQL Schema (WARN, EXTERNAL) — 40

Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed

`audit_log`, `calcutta_bids`, `calcutta_buybacks`, `calcutta_lots`, `card_signatures`, `course_documents`, `courses`, `crew_members`, `crews`, `device_sessions`, `friendships`, `game_entries`, `game_results`, `group_members`, `groups`, `handicap_overrides`, `hole_awards`, `holes`, `notifications`, `organizers`, `pairs`, `payments`, `photos`, `player_pins`, `players`, `push_subscriptions`, `rivalries`, `rivalry_rounds`, `round_results`, `round_tees`, `rounds`, `scores`, `snake_tiebreaks`, `team_members`, `teams`, `tees`, `tournament_money`, `tournament_organizers`, `tournament_results`, `tournaments`

#### `pg_graphql_authenticated_table_exposed` — Signed-In Users Can See Object in GraphQL Schema (WARN, EXTERNAL) — 41

Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed

`audit_log`, `calcutta_bids`, `calcutta_buybacks`, `calcutta_lots`, `card_signatures`, `course_documents`, `courses`, `crew_members`, `crews`, `device_sessions`, `friendships`, `game_entries`, `game_results`, `group_members`, `groups`, `handicap_overrides`, `hole_awards`, `holes`, `notifications`, `organizers`, `pairs`, `payments`, `photos`, `player_pins`, `players`, `profiles`, `push_subscriptions`, `rivalries`, `rivalry_rounds`, `round_results`, `round_tees`, `rounds`, `scores`, `snake_tiebreaks`, `team_members`, `teams`, `tees`, `tournament_money`, `tournament_organizers`, `tournament_results`, `tournaments`

## Harness extras (not splinter)

Run by `lints/extras.sql` on `lint_seeded` (a seeded clone), inside a transaction that is rolled back.

### E1. Table privileges of the API roles and RLS (`lints/e1-table-privileges.csv`)

S/I/U/D/T = SELECT/INSERT/UPDATE/DELETE/TRUNCATE held by the role (default privileges grant all of them unless a migration revokes). RLS filters S/I/U/D rows; **TRUNCATE is not subject to RLS** (PostgREST cannot issue it, so it matters only for defense in depth and GraphQL introspection).

| table | RLS | policies (cmds) | anon | authenticated | authenticated column grants |
|---|---|---|---|---|---|
| _migrations | on | 0 (—) | — | — |  |
| audit_log | on | 1 (SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| backup_runs | on | 0 (—) | — | — |  |
| calcutta_bids | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| calcutta_buybacks | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| calcutta_lots | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| card_signatures | on | 3 (DELETE,INSERT,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| course_documents | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| courses | on | 4 (DELETE,INSERT,SELECT,UPDATE) | S,I,U,D,T | S,I,U,D,T |  |
| crew_members | on | 1 (SELECT) | S,T | S,T |  |
| crews | on | 1 (SELECT) | S,T | S,T |  |
| device_sessions | on | 1 (SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| friendships | on | 1 (SELECT) | S,T | S,T |  |
| game_entries | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| game_results | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| group_members | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| groups | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| handicap_overrides | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| hole_awards | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| holes | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| notifications | on | 1 (SELECT) | S,T | S,T |  |
| organizers | on | 1 (ALL) | S,I,U,D,T | S,I,U,D,T |  |
| pairs | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| payments | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| photos | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| pin_attempts | on | 0 (—) | — | — |  |
| platform_admins | on | 0 (—) | — | — |  |
| platform_audit_log | on | 0 (—) | — | — |  |
| platform_settings | on | 0 (—) | — | — |  |
| platform_unlocks | on | 0 (—) | — | — |  |
| player_pins | on | 0 (—) | S,I,U,D,T | S,I,U,D,T |  |
| players | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| profile_link_tokens | on | 0 (—) | — | — |  |
| profiles | on | 2 (SELECT,UPDATE) | — | S | handle,display_name,full_name,avatar_url,home_club,city,bio,index_source,manual_index,discoverable |
| push_subscriptions | on | 1 (SELECT) | S,T | S,T |  |
| rivalries | on | 1 (SELECT) | S,T | S,T |  |
| rivalry_rounds | on | 1 (SELECT) | S,T | S,T |  |
| round_results | on | 1 (SELECT) | S,T | S,T |  |
| round_tees | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| rounds | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| scores | on | 2 (ALL,SELECT) | S,I,U,D,T | S,D,T | id,round_id,player_id,hole,strokes,putts,picked_up,entered_by,client_ts |
| snake_tiebreaks | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| team_members | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| teams | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| tees | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| tournament_money | on | 1 (SELECT) | S,T | S,T |  |
| tournament_organizers | on | 2 (ALL,SELECT) | S,I,U,D,T | S,I,U,D,T |  |
| tournament_results | on | 1 (SELECT) | S,T | S,T |  |
| tournaments | on | 3 (DELETE,SELECT,UPDATE) | S,I,U,D,T | S,I,U,D,T |  |

Reading it: every public table has RLS on. Two inconsistencies stand out: **`player_pins`** (PIN hashes, no policy by design) still carries all default grants to `anon` and `authenticated` including TRUNCATE, while its siblings `pin_attempts` and `profile_link_tokens` revoke everything; **`scores`**: 0010 moved `authenticated` to column grants (INSERT/UPDATE of the card columns only) but left it table-level **DELETE**, and left `anon` with full S/I/U/D/T. See candidate-findings.md C2 and C4.

### E2. SECURITY DEFINER functions that read auth.users / auth.sessions (`lints/e2-definer-auth-users.csv`)

| function | anon | authenticated | `is_platform_admin()` guard | touches auth.sessions | writes auth.users |
|---|---|---|---|---|---|
| `ensure_my_profile(text,text)` | yes | yes | — | — | — |
| `is_account_user(uuid)` | yes | yes | — | — | — |
| `platform_audit(text,timestamp with time zone,integer,text)` | — | yes | yes | — | — |
| `platform_block(uuid,text)` | — | yes | yes | yes | yes |
| `platform_course(uuid)` | — | yes | yes | — | — |
| `platform_courses(text,text,integer,integer)` | — | yes | yes | — | — |
| `platform_daily(integer,text)` | — | yes | yes | — | — |
| `platform_delete_account(uuid,text,text)` | — | yes | yes | — | yes |
| `platform_health()` | — | yes | yes | — | — |
| `platform_overview()` | — | yes | yes | — | — |
| `platform_people(text,text,integer,integer)` | — | yes | yes | — | — |
| `platform_person(uuid)` | — | yes | yes | — | — |
| `platform_person_target(uuid,text)` | — | — | — | — | — |
| `platform_set_organizer(uuid,uuid,text,text)` | — | yes | yes | — | — |
| `platform_tournament(uuid)` | — | yes | yes | — | — |
| `platform_tournaments(text,text,text,integer,integer)` | — | yes | yes | — | — |
| `platform_unblock(uuid,text)` | — | yes | yes | — | yes |

Every `platform_*` function that reads or writes auth data is revoked from anon and starts with the platform-admin guard; `platform_person_target` is internal (revoked from both). The two anon-callable ones are `ensure_my_profile` (refuses without a session / for anonymous users) and `is_account_user(uuid)`, a boolean oracle: given any uuid it says whether it is a non-anonymous account.

### E3. Who reads how many rows (`lints/e3-read-matrix.csv`)

Seeded db plus, written the way the app writes them: organizer A made a profile, set round A1 live, marked one payment, created a course; the claimed device wrote one score; a stranger account (profile only) exists; one object `<tournament A id>/logo.png` in `tournament-assets`. Counts of rows each identity reads with `select count(*)` (−1 = permission denied). Tables empty for everyone are omitted (32).

| table | total | anon (no session) | anonymous device, no claim | stranger account | device that claimed Ana (A) | organizer A |
|---|---|---|---|---|---|---|
| _migrations | 24 | -1 | -1 | -1 | -1 | -1 |
| audit_log | 20 | 0 | 0 | 0 | 0 | 11 |
| courses | 1 | 0 | 1 | 1 | 1 | 1 |
| device_sessions | 1 | 0 | 0 | 0 | 1 | 0 |
| group_members | 4 | 0 | 0 | 0 | 2 | 2 |
| groups | 2 | 0 | 0 | 0 | 1 | 1 |
| organizers | 2 | 0 | 0 | 0 | 0 | 1 |
| payments | 1 | 0 | 0 | 0 | 1 | 1 |
| pin_attempts | 1 | -1 | -1 | -1 | -1 | -1 |
| platform_admins | 1 | -1 | -1 | -1 | -1 | -1 |
| player_pins | 4 | 0 | 0 | 0 | 0 | 0 |
| players | 4 | 0 | 0 | 0 | 2 | 2 |
| profiles | 2 | -1 | 0 | 1 | 0 | 1 |
| rounds | 2 | 0 | 0 | 0 | 1 | 1 |
| scores | 1 | 0 | 0 | 0 | 1 | 1 |
| tournament_organizers | 2 | 0 | 0 | 0 | 0 | 1 |
| tournaments | 2 | 0 | 0 | 0 | 1 | 1 |
| storage.buckets | 1 | 0 | 0 | 0 | 0 | 0 |
| storage.objects | 1 | 1 | 1 | 1 | 1 | 1 |

Nothing leaks across tenants: the claimed device and organizer A see only tournament A rows, the stranger only their own profile. `courses` is readable by any session including an unclaimed anonymous device (shared reference data, by design). The only row `anon` reads anywhere is the storage object (the public-bucket listing above).

