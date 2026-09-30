# Polo local Postgres harness (shared, port 5433)

A faithful local stand-in for the Supabase project: **Postgres 16.13** with
Supabase-compatible stubs (`stubs.sql`, `ext/`) and **all 24 migrations**
from `supabase/migrations/` applied in order **exactly as `scripts/db.mjs`
applies them** (`public._migrations` first, then each file as
`begin; <file>; insert into _migrations; commit;`, `ON_ERROR_STOP`). The
whole chain applies cleanly with no workaround (log: `migrate.log`).
Migrations are identical to `379ed52` (checked by `build-template.sh`).

`$S` = `/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad`.

**Results at a glance.**
- Chain: 24/24 migrations apply; no workaround was needed.
- Candidate findings (`candidate-findings.md`):
  - PG-C1: since 0020, `restore_tournament` no longer restores side-pot entrants, bet results or hole awards, and it nulls the awards' `group_id` (regression from 0011).
  - PG-C2: a group mate's phone can DELETE + INSERT another player's score without the discrepancy flag.
  - PG-C3: the chain needs `_migrations`, which only `scripts/db.mjs` creates.
  - PG-C4 to C9: grants, re-runs, bucket listing, the anon-callable definer functions, the `cardi.comite` scope, and performance lints.
- Splinter (`lints.md`): 405 results, none at ERROR level (WARN: 128 + 86 SECURITY DEFINER functions callable by `authenticated`/`anon`, 92 multiple permissive policies, 16 `auth_rls_initplan`, 5 mutable search paths, 1 public-bucket listing; INFO: 48 unindexed FKs, 20 unused indexes, 9 RLS-no-policy). The pg_graphql lints, ungated, add 40 + 41.
- Idempotence (`idempotence.md`): 10/24 files fail on re-run; 4 of the re-runnable ones silently downgrade live definitions.

## 1. Get your own database

```bash
$S/pg/bootstrap.sh <yourdb>            # clone polo_template (stubs + 24 migrations), ~0.3 s
$S/pg/bootstrap.sh <yourdb> --seed     # ... plus the two-tenant seed (below)
$S/pg/bootstrap.sh <yourdb> --recreate --seed   # drop it first — ONLY your own db
psql -h 127.0.0.1 -p 5433 -U postgres <yourdb>
```

Name it after your panel code (`sec_1`, `money_a`, …). Never drop or alter
someone else's database. `polo_template` is sealed (no connections); don't
touch it. The server is shared: **don't stop it**. If it is down,
`$S/pg/ctl.sh start` (idempotent); `ctl.sh status` tells you.

Node: there is no `pg` client in the repo's `node_modules`. Use `psql`, or
`npm init -y && npm i pg` in your own scratch dir; connection string
`postgres://postgres@127.0.0.1:5433/<yourdb>` (trust auth, no password).

Quick proof that RLS is on (after `--seed`):

```bash
psql -h 127.0.0.1 -p 5433 -U postgres -X -v ON_ERROR_STOP=1 -d <yourdb> -f $S/pg/selftest.sql
```

It runs 16 checks in one transaction and rolls back (anon reads nothing; an
unclaimed anonymous device reads 0 players; the claimed device reads only
tournament A; organizer A cannot write tournament B; `player_pins` returns
nothing; `service_role` bypasses RLS; `auth.users` is closed to the API
roles; a notification posts one captured `net.http_post`).

## 2. Acting as a role and a user

Supabase semantics: the **anon key without a session** is Postgres role
`anon` with no JWT. **Every signed-in user, including an anonymous device**,
is role `authenticated`; an anonymous device has `"is_anonymous": true` in
its claims (and `auth.users.is_anonymous = true`). `auth.uid()` reads
`request.jwt.claims ->> 'sub'` (or the legacy `request.jwt.claim.sub`), as on
Supabase. Always work inside a transaction so `set local` / `set_config(…, true)`
end with it:

```sql
-- anon: the public key, no session
begin;
set local role anon;
select count(*) from public.players;                 -- 0
rollback;

-- an anonymous device (a phone that hasn't claimed anyone, or has)
begin;
select set_config('request.jwt.claims',
  '{"sub":"<auth uid>","role":"authenticated","aud":"authenticated","is_anonymous":true}', true);
set local role authenticated;
select public.claim_player('<player id>', '1234');   -- RPCs are plain function calls
select * from public.tournaments;                    -- RLS applies
rollback;

-- an account (email / Google)
begin;
select set_config('request.jwt.claims',
  '{"sub":"<auth uid>","role":"authenticated","aud":"authenticated","email":"x@polo.test","is_anonymous":false,"user_metadata":{"display_name":"X"}}', true);
set local role authenticated;
select * from public.create_tournament('Mi torneo', '{}'::jsonb);
rollback;

-- service role (bypasses RLS)
begin; set local role service_role; select count(*) from public.tournaments; rollback;
```

With a seeded db, `harness.claims('<auth uid>')` builds the claims from the
`auth.users` row (call it **before** `set local role`, it lives in the
`harness` schema that the API roles can't use):

```sql
begin;
select set_config('request.jwt.claims', harness.claims('dddddddd-dddd-4ddd-8ddd-00000000000d'), true);
set local role authenticated;
...
reset role;          -- back to postgres inside the same transaction
rollback;
```

New users: insert into `auth.users` yourself (that is GoTrue's job; there is
no GoTrue). Keep the JWT's `is_anonymous` equal to the row's: Polo checks the
claim in some places (`create_tournament`, `can_manage_courses`) and the row
in others (`is_account_user`).

```sql
insert into auth.users (id, email, email_confirmed_at, is_anonymous, raw_user_meta_data)
values (gen_random_uuid(), 'someone@polo.test', now(), false, '{"display_name":"Someone"}') returning id;
insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id;  -- a phone
```

Expecting an error without aborting your transaction: wrap the statement in a
`DO` block with an exception handler and stash `sqlstate` in a GUC (see
`selftest.sql`), or use psql's `\set ON_ERROR_STOP 0`, a `savepoint`, the
`:SQLSTATE` variable and `rollback to savepoint`.

**One transaction is not one request.** On Supabase every PostgREST request
is its own transaction; in a test script you usually chain several "requests"
in one transaction. Transaction-local state then leaks between them. The one
that matters: `admin_save_score` / `resolve_score_dispute` set the Comité
trust mark `cardi.comite` with `set_config(…, true)`, and it stays set until
commit, so every later score write in the same transaction is treated as a
Comité write (no discrepancy flag). Between "requests" clear it:
`select set_config('cardi.comite', '', true);` (see
`tests/control-0010-dispute.sql`). The same applies to `request.jwt.claims`,
which is why each step sets its own claims.

## 3. The seed (`seed-two-tenants.sql`)

Created the way the app creates it (each step impersonating its user):
organizer → `create_tournament(name, settings-minimal.json)`, `insert into
players … returning id` under RLS, `set_player_pin(…, '1234')`, `insert into
rounds`, `upsert_groups`; anonymous device → `claim_player`. Ids:

```sql
select key, id, note from harness.seed order by key;
```

| key | what |
|---|---|
| `org_a` `aaaaaaaa-aaaa-4aaa-8aaa-00000000000a` | organizer A (`org-a@polo.test`), owner of tournament A |
| `org_b` `bbbbbbbb-bbbb-4bbb-8bbb-00000000000b` | organizer B (`org-b@polo.test`), owner of tournament B |
| `dev_a` `dddddddd-dddd-4ddd-8ddd-00000000000d` | anonymous device that claimed `player_a1` (Ana) with PIN 1234 |
| `dev_x` `eeeeeeee-eeee-4eee-8eee-00000000000e` | anonymous device with no claim |
| `platform_admin` `ffffffff-ffff-4fff-8fff-00000000000f` | extra: a platform admin (`admin@polo.test`, in `platform_admins`) |
| `tournament_a`, `tournament_b` | "Seed Torneo A/B" (random ids; slug and join code in `note`) |
| `player_a1` Ana, `player_a2` Beto, `player_b1` Carla, `player_b2` Dani | two players per tournament, PIN 1234 |
| `round_a1`, `round_b1` | round 1 of each (status `scheduled`, 18 holes, no course) |
| `group_a1`, `group_b1` | group 1 of each round, both players, 09:00, hole 1 |

No profiles are created. As an account, `select public.ensure_my_profile();`
makes one (needed for friends, crews, push, rivalries, Ronda rápida).
No course either: insert `courses`/`tees`/`holes` as an account (see
`scripts/rls-test.mjs` for the shapes).

## 4. pg_net capture (push) and Vault

`net.http_post` is a stub: it queues like pg_net and records every call in
**`net.harness_requests`** (`url`, `headers` incl. `Authorization`, `body`
as jsonb, `jwt_claims` at call time); nothing is sent, `net._http_response`
stays empty. `net.http_request_queue` holds the raw queue (never drained).
The push trigger (0019) fires only when Vault holds both secrets and the
profile has a subscription:

```sql
select vault.create_secret('https://harness.invalid/api/push-dispatch', 'push_dispatch_url');
select vault.create_secret('some-secret', 'push_dispatch_secret');
-- as the account: ensure_my_profile(); save_push_subscription('https://…', 'p256dh', 'auth');
select public.notify('<profile id>', 'probe', 'probe:1', null, '{}');   -- as postgres (notify is revoked from the API roles)
select id, url, headers, body from net.harness_requests order by id desc;
```

Vault is a stub too (`vault.secrets`, `vault.decrypted_secrets`,
`vault.create_secret/update_secret`), **plaintext**, readable by postgres only.

## 5. Known differences from real Supabase

1. **`postgres` is a superuser here.** On Supabase it is not (it has
   BYPASSRLS, membership in the API roles and supautils grants). Anything
   that needs ownership of Supabase-owned objects (e.g. `alter table
   storage.objects`, triggers on `auth.users`, event triggers) succeeds here
   but may fail there. SECURITY DEFINER functions owned by postgres bypass
   RLS in both.
2. **No PostgREST.** RPCs are plain calls here: no HTTP, no named-argument
   resolution, no `db-max-rows`, and **no pg-safeupdate** (Supabase API
   sessions refuse `UPDATE`/`DELETE` without `WHERE`; here they succeed).
   Per-role `statement_timeout` (anon 3 s, authenticated 8 s) is set but only
   PostgREST applies it; `set role` does not. Log in as `authenticator` and
   `set role …` to get PostgREST's search_path (`public, extensions`).
3. **No GoTrue.** No JWT signing or expiry: claims are whatever you set.
   `banned_until` and `auth.sessions` are plain data (a blocked user still
   "works" here). Rows in `auth.users` carry harness defaults (`created_at`,
   `aud`, `role`, metadata `{}`) that GoTrue would supply.
4. **No storage-api.** `storage.objects` rows are inserted with SQL (the API
   does the same insert as the caller's role, so RLS tests are meaningful),
   but bucket `file_size_limit` / `allowed_mime_types` are not enforced and no
   files exist.
5. **No Realtime server.** The `supabase_realtime` publication exists
   (`wal_level = logical`), but Realtime's per-subscriber RLS check isn't run.
6. **Stubs:** pg_net never sends; Vault stores plaintext. **No pg_graphql**
   (installed by default on Supabase): lints 0026/0027 are reported separately
   in `lints.md` without their "pg_graphql installed" gate.
7. `platform_admins` is seeded by 0021 from one real email that doesn't
   exist here; the seed adds a fictitious admin instead.
8. Version: Postgres 16.13 here; the hosted project's major version could not
   be checked from this container (no Management API). Locale `C.UTF-8` and
   timezone UTC, as on Supabase.
9. Durability is off (`fsync`, `synchronous_commit`, `full_page_writes`) for
   speed. Timings are indicative only (shared 4-CPU box, other clusters
   running); `pg_stat_statements` is on (`extensions.pg_stat_statements`).

## 6. Files

| file | what |
|---|---|
| `bootstrap.sh` | your database from the template (`--seed`, `--recreate`) |
| `seed-two-tenants.sql`, `selftest.sql` | the seed and the 16-check self-test |
| `stubs.sql`, `ext/` | Supabase stubs (roles, grants, default privileges, auth, storage, extensions) and the stub `pg_net` / `supabase_vault` extensions |
| `build-template.sh`, `migrate.log`, `work/` | template build (don't rerun without asking: it drops `polo_template`), its log, the wrapped migration files it applied |
| `candidate-findings.md` | real migration problems found while building and testing (PG-C1…C9, with repros) |
| `tests/` | the repros behind them: `restore-drops-games.sql`, `scores-delete-bypass.sql`, `rerun-0009-0012.sql` (+ `control-0010-dispute.sql`), `no-migrations-table.sh` |
| `idempotence.md`, `idempotence.sh`, `idem/` | what happens when each migration is re-applied (report, script, raw output) |
| `lints.md`, `lints/` | Supabase splinter advisors run against a fresh copy, plus harness extras (`lints/run-lints.sh`, CSVs) |
| `setup-cluster.sh`, `ctl.sh`, `data/`, `postgres.log`, `run/` | the cluster itself |

Databases the harness itself uses (bootstrap refuses these names):
`polo_template`, `idem_check`, `idem_chain`, `lint_check`, `lint_seeded`,
`pg_seedtest`, `pg_restore_test` (and `pg_nomig`, created and dropped by
`tests/no-migrations-table.sh`).

How the cluster runs (for whoever maintains it): the server tree is a copy of
the system `postgres`/`pg_ctl` in `/var/lib/postgresql/polo-harness/inst`
(`$S/pg/inst` links to it), whose `share/extension` adds the two stubs; the
data dir is `$S/pg/data`. It runs as the `postgres` OS user with the ambient
`CAP_DAC_READ_SEARCH` capability, because the scratch dir's ancestors are
`0700 root` (and `/tmp/claude-0` is reset to 0700 by the tool harness).
