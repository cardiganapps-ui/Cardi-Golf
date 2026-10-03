# Database test harness

What the `db` job (`.github/workflows/db.yml`, `scripts/db-test.sh`) runs the
migrations on: plain Postgres made to look like a Supabase project, so every
migration is proven before it reaches the one database that holds the
tournament (DB-09). Ported from the 2026-09-30 review's harness
(`docs/review/2026-09-30/evidence/harness/`, which stays as the review ran it).

| File | What it is |
|---|---|
| `stubs.sql` | The roles, schemas and functions a hosted project has and the migrations use (`auth.uid()`, `auth.users`, `storage`, `realtime`, the API roles and their grants). Applied before `0000`. Differences from real Supabase: the review harness README, «Known differences». |
| `ext/` | Two stub extensions installed in the server's `share/extension`: `pg_net` (requests recorded in `net.harness_requests`, never sent) and `supabase_vault` (plaintext). |
| `seed-two-tenants.sql` | Two organizers, two tournaments, players with PINs, a round, groups, a claimed device: made the way the app makes them, each step as its user. Ids in `harness.seed`. |
| `selftest.sql` | The harness checking itself on the seed (tenant isolation, PIN claims, impersonation). |
| `splinter.sql` | Supabase's advisors (the dashboard's «Advisors»), into a temp table `_lint`. |
| `lint-baseline.json` | The advisors' findings per lint at the last accepted chain. The job fails on any lint over it; when one goes down, lower it (`POLO_LINT_WRITE=1`). |

Each `supabase/tests/*.sql` runs on its own copy of the migrated database with
the seed, as `postgres`, and fails on the first error (`ON_ERROR_STOP`). Write
a test the way `restore_roundtrip.sql` is written: read ids from
`harness.seed`, act as a user with
`select set_config('request.jwt.claims', harness.claims('<uid>'), true); set local role authenticated;`,
check with `harness.check(<condition>, '<what it proves>')`.

## Running it locally

Any Postgres 16 you are superuser of, with `ext/` copied into its
`share/postgresql/16/extension/`:

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres scripts/db-test.sh
```

It makes and drops its own databases (`polo_ci*`; `POLO_DB_PREFIX` changes
the name). In a Claude session the review harness's server on port 5433
already has the extensions.
