# Candidate findings from the harness build (PG)

**The migration chain itself applies cleanly.** All 24 files applied on the
first real run, in order, exactly as `scripts/db.mjs` applies them, with no
workaround copy (`migrate.log`; `workarounds/` is empty). The only failure
while building was a bug in my own stub, now fixed. The problems below turned
up while building, linting and exercising the schema. They are *candidates*
for the panelists who own each area (DB, SEC, MONEY, REL) to adopt, re-verify
and grade. Every repro runs on a seeded harness db:
`$S/pg/bootstrap.sh <yourdb> --seed`, then
`psql -h 127.0.0.1 -p 5433 -U postgres -X -v ON_ERROR_STOP=1 -d <yourdb> -f $S/pg/tests/<file>`.
They run in a transaction and roll back. Earlier references are to `docs/audit-2026-09-28.md`.

---

## PG-C1 — Since 0020, `restore_tournament` stops restoring side-pot entrants, bet results and hole awards, and nulls every surviving hole award's `group_id`

- **Proposed severity:** P1, arguably P0. It regresses the fix for audit #10, which was a P0, and it loses money-relevant data on the recovery path. **Verdict:** CONFIRMED. **Area:** Data layer and database, and Correctness of rules and money. **Status:** regressed (audit #10: 0010 made restore transactional, 0011 added the game tables, 0020 dropped them).
- **Evidence:**
  - `supabase/migrations/0020_teams.sql:141-147` says the new body is "0010's function with teams and team_members added". It is: `0020_teams.sql:149-303` has no `r_game_entries`, `r_game_results` or `r_hole_awards`, and neither wipes nor inserts those tables. `0011_games.sql:95-259` had all three (temp tables at :131-133, checks :143-144 and :164-166, wipe :187-189, inserts :236-241).
  - The app still exports them: `src/data/backup.ts:21-22` (`game_entries`, `game_results` and `hole_awards` are in `BY_TOURNAMENT` / `BY_ROUND`), and restores through this RPC (`backup.ts:81`).
  - Restore deletes and re-inserts `groups`, and `hole_awards.group_id` is `on delete set null` (`0011_games.sql:30`). The engine reads a null group as **a Comité decision that overrides the groups' claims** (`src/engine/games/contest/index.ts:62-64`). Players can no longer edit those rows either, since the policy keys on `group_id` (`0013_identity.sql:253-273`).
  - `scripts/rls-test.mjs:295-304` passes by accident: nothing in the game tables changes between the backup and the restore, and it only counts rows.
  - `RUNBOOK.md:73` tells the Comité that restore "reemplaza todo".
- **Repro:** `tests/restore-drops-games.sql`. Output: backup carries entrants 2 / results 1 / awards 2. After the current restore: `game_entries 1 (backup 2) | game_results winner Beto (backup Ana) | hole_awards 1 (backup 2) | hole-7 award group_id NULL`. The same backup through 0011's body of the same function restores all of them (`tests/restore_tournament_0011.sql`).
- **Impact:** A Comité that restores the nightly backup to undo a mistake keeps the wrong side-pot entrants and bet winners. Buy-ins and payouts are computed from these, so real pesos go to the wrong people. The contest claims also turn into un-editable "Comité decisions".
- **Fix:** Rebuild `restore_tournament` as 0011's body plus teams and team_members. Add a round-trip test: backup, mutate every exported table, restore, deep-compare. Also assert that every table in `backup.ts` BY_* appears in the function (a list shared with `src/lib/backupTables.ts` is one way). **Effort:** S.

## PG-C2 — A group mate's phone can replace another player's score without the discrepancy flag, by DELETE + INSERT

- **Proposed severity:** P1. It defeats §8's "discrepancia" badge for real-money scores. **Verdict:** CONFIRMED. **Area:** Security and privacy, and Correctness of rules and money. **Status:** new. It is a route around the protection 0010 added for audit #30; the UPDATE route is closed.
- **Evidence:**
  - `0010_admin_safety.sql:472-474` revokes only INSERT and UPDATE from `authenticated` and re-grants them column by column. Table-level **DELETE** stays from the default privileges: `lints.md` E1 shows `scores` authenticated = S,D,T.
  - `scores_write` is `FOR ALL`, so its USING clause (`0003_rls.sql:105-113`: shares a group, round live, card unsigned) authorizes deletes too.
  - Discrepancy detection is a BEFORE UPDATE trigger only (`0008_score_disputes.sql:31-32`, body `0010_admin_safety.sql:427-452`). A fresh INSERT is cleaned to `disputed = false` (`0010_admin_safety.sql:455-470`).
  - The app never deletes scores; it only upserts (`src/data/outbox.ts:232`).
- **Repro:** `tests/scores-delete-bypass.sql`. Beto's phone enters holes 1 and 2 (5 strokes). Ana's phone upserts hole 1 to 3: `disputed t, previous {...}` (control). Ana's phone deletes and re-inserts hole 2 as 3: `disputed f, previous null`. `audit_log` holds INSERT, DELETE, INSERT for hole 2, but nothing surfaces it.
- **Impact:** Any player can silently lower a rival's or partner's strokes on any hole of his group while the round is live, using his own session token and the public key (e.g. with curl). No badge, and the signer sees a clean card. This is individual Stableford money, and pairs money for his own pair.
- **Fix:** `revoke delete on public.scores from authenticated, anon`. Or split `scores_write` into INSERT/UPDATE policies plus a DELETE policy for organizers only. Add an rls-test check that a player cannot delete a score. **Effort:** S.

## PG-C3 — The chain depends on `public._migrations`, which only `scripts/db.mjs` creates

- **Proposed severity:** P2. Rebuilding the database from the repo requires tribal knowledge. **Verdict:** CONFIRMED. **Area:** Data layer and database. **Status:** new. It is a side effect of the audit #39 fix.
- **Evidence:** `0010_admin_safety.sql:645-646` alters `public._migrations`, and `0024_platform_ops.sql:339` reads it. It is created by `scripts/db.mjs:21`, never by a migration.
- **Repro:** `tests/no-migrations-table.sh` creates an empty db, applies `stubs.sql`, then each migration with `psql -1 -f` (no db.mjs preamble). Output: `stopped at 0010_admin_safety.sql: 0010_admin_safety.sql:645: ERROR: relation "public._migrations" does not exist`.
- **Impact:** Disaster recovery into a new Supabase project, Supabase branching, `supabase db reset/push`, or any CI that applies the migrations fails at 0010 unless someone knows to create the table first.
- **Fix:** Create it in the chain (`create table if not exists public._migrations …` in 0001, or a `0000_` file). Add CI that applies the chain to a scratch Postgres; this harness does it in 4 s. **Effort:** S.

## PG-C4 — Default table grants survive on `player_pins` (PIN hashes), and `anon` keeps full write grants on `scores`

- **Proposed severity:** P3 (defense in depth). **Verdict:** CONFIRMED. **Area:** Security and privacy. **Status:** new.
- **Evidence:**
  - `lints.md` E1: `player_pins` anon = S,I,U,D,T and authenticated = S,I,U,D,T, with RLS on and no policy. Its siblings revoke everything: `pin_attempts` (`0010_admin_safety.sql:348`) and `profile_link_tokens` (`0013_identity.sql:850`).
  - `scores`: 0010 moved only `authenticated` to column grants (`0010_admin_safety.sql:472`), so `anon` keeps S,I,U,D,T.
  - RLS returns zero rows (E3), but TRUNCATE is not subject to RLS.
  - With pg_graphql on (Supabase's default), `player_pins` and its `pin_hash` column are listed in anon GraphQL introspection (`lints.md`, ungated 0026).
- **Fix:** `revoke all on public.player_pins from anon, authenticated; revoke all on public.scores from anon;`. Add a CI lint that fails when an API role holds privileges on a table with no policy, or TRUNCATE on any table. **Effort:** S.

## PG-C5 — Re-applying some migrations by hand succeeds silently and downgrades live definitions

- **Proposed severity:** P3. It needs a human to re-run a file, which `db.mjs file` invites. **Verdict:** CONFIRMED. **Area:** Data layer and database. **Status:** new.
- **Evidence:** `idempotence.md`.
  - 0007, 0008, 0009 and 0012 re-run without error and put back older `audit_row()`, `scores_detect_dispute()` and three storage policies.
  - Consequences verified in `tests/rerun-0009-0012.sql` against the control `tests/control-0010-dispute.sql`: an account's own avatar upload is refused (42501); an overwrite of a Comité-corrected hole is no longer flagged and keeps the Comité's reason (audit #30 reopened).
  - 10 of 24 files cannot run twice at all.
- **Fix:** Make the files re-runnable and stop redefining objects across files; see `idempotence.md` ("What a top team would do"). **Effort:** M.

## PG-C6 — The public bucket lets anyone list every object (tournament ids, account ids)

- **Proposed severity:** P3. **Verdict:** CONFIRMED in the harness; production not probed from here. **Area:** Security and privacy. **Status:** new.
- **Evidence:** splinter `public_bucket_allows_listing` on policy `assets_public_read` (`0003_rls.sql:185`, `for select using (bucket_id = 'tournament-assets')`, all roles). E3: `anon` reads the `storage.objects` row `<tournament id>/logo.png`. Object names are `<tournament_id>/…`, `courses/<id>/…` and `profiles/<auth uid>/…`.
- **Prod check (SEC):** `POST /storage/v1/object/list/tournament-assets` with the anon key and body `{"prefix":"","limit":100}`. Record counts only.
- **Fix:** Drop the SELECT policy (public object URLs don't need it), or limit it to what a client must list. **Effort:** S.

## PG-C7 — 86 SECURITY DEFINER functions are executable by `anon`; 7 are unscoped cross-tenant oracles

- **Proposed severity:** P3 (hygiene). **Verdict:** CONFIRMED. **Area:** Security and privacy. **Status:** new.
- **Evidence:**
  - `lints.md` (splinter 0028: 86; 0029: 128 for `authenticated`) and `lints/anon-definer-classified.txt`.
  - 12 are trigger functions.
  - 66 scope themselves to the caller.
  - 7 check nothing and answer for any UUID: `is_account_user(uuid)` (is this uuid an account?), `player_tournament_id`, `round_tournament_id`, `group_tournament_id`, `lot_tournament_id`, `card_is_signed`, `round_is_live`.
  - They are callable because Supabase's default privileges grant EXECUTE on new functions to `anon`, and only some migrations revoke it.
- **Fix:** `alter default privileges for role postgres in schema public revoke execute on functions from anon, public;`, then revoke from existing functions and re-grant only the intended ones (`app_flags`, `push_prune`). Move internal helpers to a non-exposed schema. **Effort:** S–M.

## PG-C8 — The Comité trust mark `cardi.comite` is a transaction-scoped GUC that any role can set

- **Proposed severity:** P3 (design fragility; not exploitable through PostgREST today). **Verdict:** CONFIRMED (mechanics). **Area:** Security and privacy. **Status:** new.
- **Evidence:**
  - `admin_save_score` and `resolve_score_dispute` call `set_config('cardi.comite', '1', true)` (`0013_identity.sql:304,330`; 0010 :502,531). The trigger trusts it (`0010_admin_safety.sql:432`).
  - `is_local = true` means it lasts until **the end of the transaction**, not the end of the function. In a single transaction, every score write after a Comité RPC is treated as a Comité write. The first run of `tests/control-0010-dispute.sql` showed exactly that (the overwrite was not flagged) until the mark was cleared between steps.
  - `set_config` on a custom GUC is allowed to every role.
  - It is safe today only because PostgREST runs one client request per transaction and exposes no `set_config`.
- **Fix:** Scope the mark to the call with a function attribute (`alter function public.admin_save_score(...) set cardi.comite = '1'`, likewise for `resolve_score_dispute`). Or have the trigger check `current_user` / a definer-only helper. **Effort:** S.

## PG-C9 — Advisor performance lints (for PERF/DB)

- **Proposed severity:** P3. **Verdict:** CONFIRMED (lint output). **Area:** Performance / Data layer and database. **Status:** new.
- **Evidence:** `lints.md`.
  - 16 `auth_rls_initplan` policies call `auth.uid()`/`auth.jwt()` per row.
  - 23 tables × 4 roles `multiple_permissive_policies`: a `*_read` policy plus a `*_write FOR ALL` policy both run on every SELECT.
  - 48 `unindexed_foreign_keys`, including hot ones: `scores.player_id`, `scores.entered_by`, `pairs.player1_id`/`player2_id`, `payments.from_player_id`/`to_player_id`, `round_tees.player_id`, `hole_awards.group_id`/`player_id`, `snake_tiebreaks.group_id`.
  - Beyond the lints, most read policies call SECURITY DEFINER helpers per row (`is_tournament_member(round_tournament_id(round_id))`), which splinter does not measure.
  - `pg_stat_statements` is on in the harness for anyone who wants numbers.
- **Fix:** Scope write policies to INSERT/UPDATE/DELETE, wrap `auth.*()` in `(select …)`, and index the FKs used in joins and cascades. **Effort:** S–M.

## Also noted (for SEC/TRUST, not new)

- **`lookup_tournament` still returns every player's `fullName`, avatar and tier to any session**, including a brand-new anonymous one, given a slug or join code (`0013_identity.sql:381-422`). Slugs derive from the tournament name (`/t/ensayo`). Harness evidence: `selftest.sql`, check 4 (an unclaimed anonymous device gets the grid with 2 players). Audit #39 is **partly fixed**: 0010 added the session requirement and hid the join code from non-members, but anonymous sessions are free and full names still go out.
