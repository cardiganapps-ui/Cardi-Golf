# Evidence from the 2026-09-30 panel review

The scripts, tests and SQL the panel and its verifiers wrote to reproduce findings, kept as they ran them so each fix can promote the matching repro into a real test.

**Not run by CI and not product code.** These files are ignored by ESLint and aren't matched by Vitest's `src/**` include. Paths inside them still point at the reviewers' scratch directories and at the preview ports they used. When a fix lands, its repro moves into `src/**` (or `supabase/tests/`, `e2e/`) as a proper regression test, and `docs/quality/ledger.json` records it.

| Folder | What it holds |
|---|---|
| `panel/<CODE>/` | Each panelist's probes, journeys and test files (ARCH, MONEY, DB, REL, QA, PERF, UX, VIS, MOT, A11Y, COPY, PWA, STRAT, SHOTS-*) |
| `verify/V<n>/` | The adversarial verifiers' independent repros of every P0/P1 |
| `harness/` | The local Postgres 16 harness with Supabase-compatible stubs (`stubs.sql`, `ext/`), the two-tenant seed, the selftest, splinter lints and the idempotence report. See `harness/README.md` |

**Withheld while the repository is public (CHAIR-02):** the SEC and TRUST panel evidence and verifier batch V5. They are added once the repository is private. The Ensayo PIN is never stored here; scripts read it from `$ENSAYO_PIN`.
