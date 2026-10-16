# What Supabase's advisors still say, and why it stays

The `db` job runs Supabase's advisors (splinter, `supabase/tests/harness/splinter.sql`) on the database replayed
from zero and fails on any lint over `supabase/tests/harness/lint-baseline.json`, which only ever goes down
(`scripts/db-lints.mjs`). After 0065 (DB-15, DB-16, 2026-10-16) it held 154 findings, from 382; 0068 to 0071 (TRUST-22, TRUST-18, TRUST-09, TRUST-11, TRUST-13, TRUST-16) add seventeen on purpose, 171:

| Lint | Before | After | Why the rest stays |
|---|---|---|---|
| `anon_security_definer_function_executable` | 87 | 4 | The four calls a page with no session makes: `app_flags` (the shell's switches and banner), `lookup_tournament` (Entrar's faces, 0040), `spectator_board` (the link to watch, 0053) and `push_prune` (the push route prunes dead addresses with the publishable key, 0019). Each checks what it is given and answers nothing private. |
| `authenticated_security_definer_function_executable` | 151 | 147 | 129 are the app's RPCs (0068's `my_admin_accesses`; 0070's self-service, `my_data_export`, `my_delete_preview`, `delete_my_account`, `confirm_adult`, `confirm_adults` and the three of «Pedir corrección»; 0071's crew controls, `join_crew_request`, `crew_requests`, `crew_respond`, `crew_remove_member`, `set_crew_approval`, among them): a signed-in phone is meant to call them, and each checks the caller first (the Comité, the player, the platform admin). 18 are helpers the policies call (`is_tournament_member`, `my_tournament_ids`, `round_tournament_id`, `can_edit_course`…): a policy runs as the caller, so the caller needs EXECUTE; they must be definers to read the tables their own policies guard. |
| `rls_enabled_no_policy` (INFO) | 16 | 19 | On purpose: tables no client reads or writes, only definer functions (`player_pins`, `pin_claims`, `pin_attempts`, `profile_link_tokens`, `spectator_links`, `player_notices`, `pin_push_subscriptions`, `legal_acceptances`, `client_events`, `device_status`, `backup_runs`, `retention_runs` (0069), `player_corrections` (0070), `crew_requests` (0071), `platform_*`, `_migrations`). RLS on with no policy is the deny-all they need. |
| `unindexed_foreign_keys` (INFO) | 45 | 1 | `team_members (player_id, tournament_id)` is covered by its table's unique key on `(tournament_id, player_id)`, the same columns in another order; the advisor reads only the key's own order. `supabase/tests/fk_indexes.sql` reads any order. |
| `multiple_permissive_policies`, `auth_rls_initplan`, `function_search_path_mutable` | 8, 16, 5 | 0 | |
| `unused_index` (INFO) | 54 | not counted | It reads `pg_stat_user_indexes`, empty on a database nothing has queried, so in CI it counts every plain index and rose with each index DB-15 added. `db-lints.mjs` leaves it out; the live project's advisor (Dashboard › Advisors › Performance) reads real use. |

Three tests hold what the counts can't say:
- `supabase/tests/function_grants.sql`: anon calls exactly those four; no function in public is anyone's through
  PUBLIC; no trigger function and no internal helper is callable by a session; every policy in public is for
  sessions (never `to public` or anon); no policy, in public or on Storage's objects, calls `auth.uid()` row by row;
  every function sets its `search_path`.
- `supabase/tests/fk_indexes.sql`: every foreign key in public has an index on its columns, and no plain index is
  another's prefix.
- `supabase/tests/tenant_write_matrix.sql`: who may read and write each tournament table, unchanged.

A new function keeps Supabase's default grants (anon, authenticated, PUBLIC) unless its migration says otherwise:
`revoke execute on function … from public, anon;` (and `authenticated` for an internal one), then grant what it
needs. `function_grants.sql` fails until it does.
