# Idempotence of the 24 migrations (informational)

Supabase applies each migration once, and `scripts/db.mjs migrate` wraps
each file in one transaction, records it in `public._migrations`, and **stops
at the first failing file**. So a failed file never half-applies, and an
accidental full re-run through `db.mjs migrate` stops at 0001 and changes
nothing. The real exposure is **re-applying one file by hand**: `db.mjs file
<path>` is documented for exactly that (header of `scripts/db.mjs`), and the
SQL editor accepts a pasted file. Such a re-run of an early file that still
succeeds silently puts an older definition back.

Script: `idempotence.sh`. Its raw outputs are in `idem/`: per-file logs, `A.tsv`, `B.tsv` and
`B-final-diff.tsv`. Database: `idem_check` / `idem_chain`, fresh clones of `polo_template`.
The definition snapshot covers public functions (full `pg_get_functiondef`),
function and table ACLs, column grants, RLS flags, policies (public and
storage), triggers, constraints, indexes and columns. The harness's own snapshot
table is excluded.

## A. Each file re-applied alone on top of the final schema (`begin; <file>; rollback;`)

| migration | re-run | definitions it would silently change |
|---|---|---|
| 0001_schema | **fails** at `0001_schema.sql:11` `create table public.organizers`: relation already exists | — |
| 0002_functions | **fails** at `0002_functions.sql:373` `create trigger scores_touch`: already exists | — |
| 0003_rls | **fails** at `0003_rls.sql:33` `create policy organizers_self`: already exists | — |
| 0004_pin_search_path | OK | none |
| 0005_admin_pin | OK | none |
| 0006_course_provenance | OK | none |
| 0007_audit_row_id | OK | **`audit_row()`** → 0007 body |
| 0008_score_disputes | OK | **`scores_detect_dispute()`** → 0008 body |
| 0009_score_reason | OK | **`scores_detect_dispute()`** → 0009 body |
| 0010_admin_safety | **fails** at `0010_admin_safety.sql:315` `add constraint payments_flow_key`: already exists | — |
| 0011_games | **fails** at `0011_games.sql:18` `create table public.game_entries`: already exists | — |
| 0012_storage_guard | OK | **3 storage policies** (`assets_member_write`, `assets_organizer_update`, `assets_organizer_delete`) → 0012 versions |
| 0013_identity | **fails** at `0013_identity.sql:51` `create table public.profiles`: already exists | — |
| 0014_profile_name_hint | OK | none |
| 0015_results | **fails** at `0015_results.sql:64` `add column counts_for_stats`: already exists | — |
| 0016_social | **fails** at `0016_social.sql:19` `create table public.friendships`: already exists | — |
| 0017_quick_round | OK | none |
| 0018_crews | **fails** at `0018_crews.sql:8` `create table public.crews`: already exists | — |
| 0019_push | **fails** at `0019_push.sql:13` `create table public.push_subscriptions`: already exists | — |
| 0020_teams | OK | none |
| 0021_platform_admin | OK | none |
| 0022_platform_people | OK | none |
| 0023_platform_catalog | OK | none |
| 0024_platform_ops | OK | none |

Locations are the first statement of each file that cannot run twice (repo
line numbers; psql reported them in the wrapped copies under `idem/`). **10 files fail on re-run** because they use plain `create table/policy/trigger`
or `add column/constraint` without guards. They roll back cleanly. **14
re-run**, and 10 of those are true no-ops. 0014, 0017 and 0020–0024 redefine only their own
latest objects (`create or replace`, `if not exists`, `drop … if exists`).
**4 re-run "successfully" and downgrade live definitions.** Verified
consequences, from `tests/rerun-0009-0012.sql` against the control
`tests/control-0010-dispute.sql`, on a seeded clone, rolled back:

- **0012 re-applied**: the storage policies lose 0013's `profiles/<uid>/` branch,
  so an account's own avatar upload is refused (`42501`).
- **0009 (or 0008) re-applied**: take a hole the Comité corrected with a reason, then
  overwritten by a player's phone. With the current 0010 body the overwrite is
  flagged (`disputed t`, reason cleared). With 0009's body it is **not
  flagged** and keeps the Comité's reason (`disputed f`, `reason 'Se equivocó
  el anotador'`). So the discrepancy badge (§8) silently stops working for corrected holes.
- **0007 re-applied**: `audit_row()` loses 0013's `my_player_id(tid)` actor,
  0021's `actor_platform` marking, the tournament id on the tournaments row and
  readable hole row ids. The platform admin's actions would stop being marked
  (by inspection of the two bodies; not exercised).

## B. The whole chain replayed on itself, file by file, continuing past failures

This simulates an emptied `_migrations`, applied by a runner that does not stop at the first
failure (e.g. someone pasting files in order in the SQL editor). The same 10
files fail and roll back and the other 14 apply. The end state differs
from a clean build in exactly **4 definitions** (`idem/B-final-diff.tsv`):

| kind | object | left at |
|---|---|---|
| function | `scores_detect_dispute()` | 0009 body (0010's re-run failed, so it never re-overrides) |
| policy | `storage.objects.assets_member_write` | 0012 version (0013's re-run failed) |
| policy | `storage.objects.assets_organizer_update` | 0012 version |
| policy | `storage.objects.assets_organizer_delete` | 0012 version |

`audit_row()` ends up correct only because 0021 re-runs and redefines it last.

## What a top team would do

Make every migration re-runnable (`if not exists`, `drop … if exists` before
`create policy/trigger`, guarded `add constraint`). Never redefine an object in
a later file without the earlier definition being unreachable, e.g. one
`create or replace` per object in a "current definitions" file that CI diffs
against the live schema. Or use the Supabase CLI's migration history
(`supabase_migrations.schema_migrations`), which refuses to re-apply a file.
Add a CI job that applies the chain twice to a scratch Postgres (this harness
does it in 5 s) and fails on any definition drift.
