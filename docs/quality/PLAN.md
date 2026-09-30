# Polo: from 59 (F) to 100/100 (A+) before the trip

> **Amendment 1 (2026-09-30), from the independent architect review. Where this block and the sections below disagree, this block wins.**
> 1. **Week 1 patches the data-loss P0s on the client and in the engine.** The work needs no migration and no secrets:
>    - ARCH-01: the outbox never drops a newer write.
>    - REL-14: timeouts.
>    - REL-16: no anonymous re-sign-in; queued writes pause for re-authentication.
>    - REL-05, mitigated: only touched players are written.
>    - UX-02 and PWA-01: the double-tap guard, and the toast moved off «Guardar hoyo».
>    - MONEY-01: dues net of what was already paid, in `money.ts`.
>
>    The structural rebuild in Phase 1 keeps the same regression tests.
> 2. **PWA-03 part 1 moves to week 1:**
>    - a monotonic build ID;
>    - an `app_flags.minBuild` reader, checked at boot, on resume and every 10 minutes;
>    - update checks;
>    - an outbox that opens tolerantly when the schema is newer, so a rollback can't brick it.
>
>    Old bundles can't learn the switch later.
> 3. **The sync lane is serial from 8 Oct:** registry and generated types → `tournament_id` expand → set-based RLS with split policies → `save_hole` → client v2 with outbox v3 → broadcast apply → snapshot RPC → cache-first open. The other lanes (money, CI/DB, UI/a11y/copy, privacy/docs) run in parallel worktrees, and P2/P3 items are spread across all lanes continuously.
> 4. **Generated types and the table registry open Phase 1**, before any new RPC. The registry is defined in SQL with a TypeScript mirror, and pgTAP enforces its coverage. DB-02 still ships as a targeted 0025 immediately.
> 5. **The engine refactors run Nov–Dec, not over the holidays:** one seam (ARCH-15) and i18n keys (ARCH-05), after the money fixes, with the oracle and property tests requiring identical outputs.
>    - ARCH-18 covers non-tournament screens only.
>    - «Sol» mode comes early, because it matters on the course.
>    - Dark mode comes last, with its own baselines.
> 6. **Re-reviews:**
>    - Mini re-reviews (3–5 panelists) at G1 and G2.
>    - **The blind G4 moves to Mon 1 – Fri 5 Mar**, with fixes 6–12 Mar. Rehearsal 2 (13–14 Mar) then validates them.
>    - After Rehearsal 2, only trip-path P0/P1 fixes.
>    - Diego agrees the rubric in writing before G4. Owner decisions made for free alternatives (Supabase Pro, counsel, trademark, GitHub Pro) are recorded as accepted residuals, and the panel is told about them.
> 7. **Sync rollout details:**
>    - `scores.version bigint` and a `score_versions` history for the three-way merge; a `score_mutations` idempotency table; a `rejected_writes` table.
>    - A legacy-write trigger sets `entered_by` on the server immediately (SEC-02).
>    - The `FOR ALL` policy is split, so organizers get no bypass of the live/unsigned rule (REL-09).
>    - Structured statuses (`unauthenticated`, `not_member`, `update_required`) replace error-text regexes.
>    - Outbox v3 keeps a `mutations` table. Legacy items merge with `baseVersion: 'unknown'`.
>    - **Contract** (revoking direct writes on scores, tiebreaks, awards and signatures, with signatures moving to `sign_card`) happens only after all three hold:
>      - 14 days with no legacy writes;
>      - every heartbeat device at or above `minBuild`;
>      - Rehearsal 1 run on v2.
>
>      Target: late February. Rollbacks are forward-only.
> 8. **Realtime:**
>    - Replay is only a fast path. A per-tournament monotonic `seq` rides every payload and the snapshot watermark, and a gap triggers `tournament_changes_since` or a snapshot.
>    - Broadcast triggers send curated column projections.
>    - Bulk operations send one statement-level «refetch».
>    - postgres_changes stays published for old bundles until the contract.
>    - Tenant ids use composite foreign keys. The backfill runs with user triggers disabled while no round is live, and `photos` is included.
> 9. **Money:**
>    - `set_payment_paid` stays as a compatibility shim.
>    - Adjustments get their own table.
>    - Settlements carry a mutation id.
>    - A netted vía-banco payment is allocated deterministically across its obligations.
>    - A correction after payment produces an explicit reversal transfer.
> 10. **CI and deploys:**
>     - One gate job derives the required suites from the paths changed. Draft and docs-only PRs are skipped.
>     - Production waits on the gate result for the merged change: `release.yml` promotes only a SHA whose required suites passed.
>     - Hooks: PreToolUse refuses pushes and GitHub MCP writes to `main`, and SessionStart sets `core.hooksPath`.
>     - A weekly minutes watchdog alerts at 70%. The emergency path is the full local preflight, then `vercel deploy`.
>     - `supabase start -x` trims unused services.
>     - Trip-window hourly backups run from **pg_cron + pg_net**, since Vercel Hobby crons run at most daily.
> 11. **New risk: Vercel Hobby and private repositories.** Previews for commits not authored by the owner may be blocked. A canary PR runs right after the repo flip; the fallback is deploying from Actions.
> 12. **New decisions for Diego:**
>     - Conflict policy: the first committed value wins, and the second phone is asked. This amends brief §8's «last write wins».
>     - Whether surfaces he chooses not to launch (hidden behind flags) are out of scope for G4.
>     - The G4 rubric.
>     - One day-1 batch of clicks: Claude environment secrets; GitHub Actions secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SUPABASE_PAT` and `CRON_SECRET`; the staging project; the repo flip followed by the canary.
> 13. **A `/diagnostico` page** reports device capabilities (standalone mode, storage persistence, Web Locks, WebKit quirks) to telemetry, so iOS gaps show up before the rehearsals.

## Context

**Where Polo stands.** The 2026-09-30 panel review graded Polo **59/100 (F)**. It raised **282 findings**: 11 P0, 47 P1, 163 P2 and 61 P3.
- `main` is still d585553, the review merge. No product code has changed since the reviewed commit (379ed52).
- The engine and the tenant boundary are already flagship-grade.
- What fails is the sync layer:
  - live updates are dead in production (REL-01);
  - scores get overwritten (REL-05), dropped (ARCH-01) or rejected after a session lapse (REL-16).
- The money settlement fails too (MONEY-01/04).
- So do the TV, Ceremonia and Comité forms, and the safety nets: no telemetry, no database or browser CI, an unprotected `main`, and no disaster-recovery drill.
- This plan closes every finding and brings Polo to A+ under the same rubric: "a specialist from Apple, Stripe or Linear would find nothing above a nit". The target is to get there **before** the launch trip: Calcutta dinner Thu 8 Apr 2027, rounds 9–10 Apr.

**Diego's decisions (2026-09-30), and what each implies:**

| Decision | Consequence in this plan |
|---|---|
| **A+ before the trip** | All 282 findings and the deep refactors land by 31 Jan. Two 12-phone rehearsals follow, then a **blind A+ re-review on 15–19 Mar**. Code freeze is 25 Mar. |
| **Private repo, free plan** | GitHub can't protect `main` on this plan. QA-10 is closed with compensating controls (§5.6): production deploys only after CI passes, and Claude-side guards block pushes to `main`. CI has to fit in **2,000 Actions minutes a month**. |
| **No paid items** | No Supabase Pro, GitHub Pro, lawyer, trademark search or Sentry. Free substitutes are named in each workstream. Four residual gaps can keep a sub-score just under 100: server-enforced branch protection, point-in-time recovery, a counsel-checked privacy notice, and trademark clearance. The ledger records each one; Diego can buy any of them later. |
| **First-party telemetry** | Errors, sync SLOs, outbox depth and device heartbeats go to our own Supabase tables and show in Admin de Polo › Salud (§5.7). |

**Constraints:**
- CLAUDE.md §0: standing autonomy, except money and real tournament data.
- §0.4 loop, with a note to Diego in Spanish after every merge.
- §0.5: the platform stays generic.
- This container has no `SUPABASE_PAT`, `SUPABASE_SECRET_KEY` or `VERCEL_TOKEN` yet.
- The Docker daemon is unavailable locally, so the Supabase CLI stack runs only in GitHub Actions. Postgres 16 and Chromium are available locally.
- The scratchpad holding the review's repro scripts and database harness is ephemeral, so harvesting it is the first act.

## 1. Definition of done: A+

**For each of the 13 areas:**
- **(a) Findings closed.** Every 2026-09-30 finding is closed by a merged PR, and its regression test failed before the fix.
  - Process and document findings get an automated check instead. For example, CI asserts `github.event.repository.private` (CHAIR-02), and a data-inventory test checks the privacy notice against the migrations (TRUST-04). A written artifact (the trademark memo, the strategy page) is only for items that can't be tested.
  - A P3 may instead be waived in writing by Diego.
- **(b) World-class practice in place.** The area's practice from report §3.3 is enforced by a gate.
- **(c) A blind re-review** (same `PANEL_BRIEF.md`, fresh agents, no access to the ledger's claims) finds nothing above P3.
  - That scores the area **≥ 95**.
  - The area scores **100** when the re-review finds nothing at all.

**Overall:** weighted **≥ 97**, with no area below 95.

**Field proof:**
- Both rehearsals, then the trip, show save → other phone **p95 < 2 s**, zero lost or overwritten scores, zero rejected writes left unresolved, and money closed **to the peso** with the real banker.

## 2. How every change is made

1. **Quality ledger.** `docs/quality/ledger.json` has one row per finding: `id, severity, area, workstream, phase, status (open|fixed|verified|waived), pr, tests[], verifiedBy, residual`.
   - `npm run quality` prints the burn-down by area, severity and gate.
   - `src/lib/qualityLedger.test.ts` fails if a `fixed` row names no test file, or names a missing one.
   - The ledger feeds every progress note to Diego.
2. **Repro first.** The panel's reproduction becomes a failing test in the repo (`it.fails`, tagged with the finding ID). The fix flips it.
3. **§0.4 loop.** One PR per coherent chunk, about 800 lines of diff at most.
   - Preflight and the relevant CI jobs must be green before merge.
   - After merge, a Spanish note to Diego saying what to try.
   - `docs/handoff.md` is updated in the same PR.
   - The first PR goes on `claude/new-session-yg4z09`; later ones on `claude/<topic>` branches (§0.1).
4. **Adversarial verification.** Every P0/P1 fix gets a separate verifier agent before merge. It re-runs the original repro against the PR preview or the harness and tries to break the fix. Its verdict goes in the PR body and in `verifiedBy`.
5. **Protect what's excellent** (report §9): the oracle agreement, the tenant matrix, outbox durability, and the token and motion tests. Gates keep all of these, and no fix may weaken them.
6. **Parallelism.** Independent workstreams run as parallel subagents in isolated worktrees. Hot files are sequenced, never edited concurrently: `ScorecardScreen.tsx`, `outbox.ts`, `tournamentStore.ts`, `money.ts`, `es-MX.ts` and the next migration number.
7. **Expand, then contract.** Phones in the field run old bundles. A schema change ships backward-compatible first; the old path is removed only after the minimum-build switch (§5.1) proves every active device has updated.
8. **Docs move with the code.** CLAUDE.md (§3 infrastructure, §7 data model, §0.3/§0.4 gates), `RUNBOOK.md` and `docs/handoff.md` change in the same PR as the behaviour they describe.

## 3. Timeline and gates

| Phase | Dates | Goal | Exit gate |
|---|---|---|---|
| **0: Stop the bleeding + foundations** | Thu 1 – Wed 7 Oct 2026 | Live updates back; Comité can type; team draws load; no stalled outbox; wrong-money configurations hidden. Plus the ledger, the repro harvest, the first Playwright job, and Diego's setup clicks | REL-01, UX-01, ARCH-09 closed and verified in production; the repo is private; secrets are in the environment |
| **1: Zero P0 + safety nets** | Thu 8 Oct – Sun 15 Nov | Sync writes rebuilt (`save_hole`, outbox v2); money ledger core; restore; the 9-hole, stroke and team money fixes. Nets: database CI, full-stack e2e, the fixture browser suite, migrations shipped from the pipeline, a staging project, telemetry v1 | **G1**: every P0 closed and verified; focused re-review of areas 1, 3, 4, 5 and 9, whose caps must lift |
| **2: Zero P1** | Mon 16 Nov – Sun 20 Dec | Sync read path (tenant ids, set-based RLS, payload-applied Realtime, snapshot RPC, cache-first open); generated types; TV and Ceremonia at room scale; PWA update lifecycle; the accessibility, privacy and copy P1s; disaster recovery on the free plan; organizer readiness | **G2**: zero open P1; focused re-review of every area that had P1s; overall ≥ 85 |
| **3: Everything else** | Mon 21 Dec – Sun 31 Jan 2027 | Every P2/P3. Deep refactors: one engine seam, engine i18n keys, a server-state layer, design-system closure (dark and «sol» modes, laptop layouts, vector mark). Trust surfaces, product and strategy items, performance budgets | **G3**: ledger at zero open (or waived); an internal dry-run re-review of all 13 areas (the same method as G4) so the blind review finds as little as possible |
| **4: Prove it** | Mon 1 Feb – Wed 24 Mar | **Rehearsal 1** (Sat 13 – Sun 14 Feb); fixes by Sun 28 Feb; **Rehearsal 2**, the dress rehearsal on the candidate build (Sat 13 – Sun 14 Mar); **G4 blind A+ re-review** (Mon 15 – Fri 19 Mar); G4 fixes by Wed 24 Mar | **G4**: ≥ 97 overall, no area < 95; field SLOs met in both rehearsals |
| **5: Freeze and trip** | Thu 25 Mar – Fri 16 Apr | Code freeze on 25 Mar: hotfixes only, through the gated pipeline. Go/no-go on Wed 7 Apr; deploy freeze 7–12 Apr; the trip 8–11 Apr; field report by 16 Apr | Field proof (§1) recorded as an addendum to the G4 report |

**Two rules protect the trip while chasing A+:**
- **The trip-safe subset is non-negotiable by Rehearsal 1 (13 Feb).** It covers:
  - every P0 and P1;
  - W1 and W2 in full;
  - the W3 money rules and ledger;
  - the W4 Tarjeta flows;
  - the W5 show surfaces;
  - the W7 update lifecycle;
  - telemetry, disaster recovery and the go/no-go tooling.
- **A refactor that isn't green by 31 Jan doesn't enter the trip build.** This applies to the deep refactors (one engine seam, engine keys, server state, dark mode) and any P2/P3.
  - It lands after the trip.
  - The G4 report states which area it holds below 100.
  - Diego decides that trade at G3.

**Diego's tournament data** is due **Sun 31 Jan 2027**. The Solmar card, tiers and handicaps, player 12, Nacho, the banker, the Comité and tee times are already on the handoff list. With them, Rehearsal 1 runs on a duplicate of the real configuration.

## 4. Work by phase

The workstreams (W0–W14) and every finding ID are in §9. Within a phase, the order is P0 → P1 → P2 → P3, trip path first, then platform.

### Phase 0 (1–7 Oct): 9 PRs
1. **`quality: ledger, review method, repro harvest`**, with no product change.
   - The ledger, `npm run quality` and the ledger test.
   - `docs/review/method/` gets PANEL_BRIEF, VERIFY_BRIEF and the report tools.
   - `tests/repro/` gets the non-sensitive repro tests as `it.fails`: the ARCH outbox race, hang and undo; overlay mutation; nine holes; settings-forward; teams-load; the MONEY oracle, property test, generator and WHS parity; UX via-bank; the COPY money checks.
   - `supabase/tests/harness/` gets the stubs, seeds and selftest.
   - The security repros and the unredacted report come in PR 9, once the repo is private.
2. **`fix(realtime): live updates again`**: REL-01.
   - Remove `teams`/`team_members` from `REALTIME_TABLES` (`tournamentStore.ts:197-218`). This is client-only and needs no migration.
   - Add a `system` error handler: show «Sin actualizaciones en vivo» and poll every 15 s while degraded.
   - Test: channel tables ⊆ publication, parsed from the migrations.
3. **`fix(comité): typing in sheets`**: UX-01.
   - `Sheet` in `src/components/ui.tsx`: keep `onClose` in a ref; the effect depends on `[open, id]`; restore focus only on close.
   - Add `@playwright/test`, `playwright.config.ts` and an `e2e-fixtures` CI job.
   - The first specs type «Camilo Duarte» and «13» at 100 ms per key into the player, override and score sheets.
4. **`fix(store): team draws load`**: ARCH-09.
   - Create the first `src/lib/tournamentTables.ts` registry (table, parent key, primary key, realtime flag). The store's PK map, `REALTIME_TABLES` and backup's PK map all read from it.
   - Its test checks the registry against the migrations.
5. **`fix(sync): every request times out`**: REL-14.
   - A custom `fetch` with an AbortController (10 s) in `createClient` (`src/lib/supabase.ts`).
   - The outbox treats a timeout as retryable; `online` and `visibilitychange` abort and restart the flush.
   - Add `fake-indexeddb` and a happy-dom project for `src/data` (QA-06 begins).
6. **`chore(ops): keep-alive, env, Node 24`**:
   - DB-01: `keepalive.yml` → `POST /rest/v1/rpc/app_flags`.
   - CHAIR-01: `.env.example`, plus a test that scans every `process.env`/`import.meta.env` name.
   - QA-23: `.nvmrc` and CI on Node 24.
7. **`fix(money): hide what pays wrong money`**, the stop-gap for MONEY-02/03/20 (the real fixes land in Phase 1):
   - the 9-hole option;
   - stroke / team-on-strokes / Low neto in the wizard and Comité;
   - Calcutta under team formats.
   - Tests assert these can't be enabled.
   - A tournament already set up this way keeps its settings but shows a Comité warning that its money isn't final until the Phase 1 fix.
8. **`chore(delivery): main is guarded without GitHub Pro`**: QA-10's compensating controls (§5.6). Ship it only after Diego has added the deploy secret.
9. **`docs(review): the full private record`**, after the repo is private (CHAIR-02): `REPORT.full.md`, the full `findings.json`, the SEC/TRUST repro SQL and scripts, and `docs/handoff.md` updated with §6.

### Phase 1 (8 Oct – 15 Nov): zero P0 + nets
- **Database CI and pipeline (W12):**
  - `0000` creates `_migrations` inside the chain (DB-22), and `db.mjs` refuses to re-apply a migration or accept a changed checksum (DB-17).
  - A `db` CI job: Supabase Postgres image + ported stubs, full replay, pgTAP suite, splinter held at the current baseline.
  - **0025**: `restore_tournament` = 0020 plus the three game tables, re-inserted after groups (DB-02), plus the teams publication and audit. The registry test covers the restore body; a round trip mutates every table.
  - A staging project (free, Diego approves the prompt) with Vercel Preview pointed at it.
  - `release.yml` applies migrations to staging, then takes an on-demand backup, applies to production and deploys (DB-09).
- **Full-stack e2e (W14):**
  - `supabase/config.toml`, a seed, and an `e2e-stack` job on `supabase start`.
  - Specs: two-context realtime; the smoke rewritten without tautologies (QA-12); the auth lapse.
- **Sync writes (W1, §5.1):**
  - Outbox v2: mutation ids, seq-guarded replace and delete, Web Locks, `storage.persist` (ARCH-01, REL-18, REL-17).
  - Session-lapse handling (REL-16).
  - The **`save_hole` RPC** (REL-05/06/07/09, SEC-02, TRUST-24, DB-14), and the Tarjeta sending touched fields only.
  - Rejected writes go to a server inbox the Comité sees; a device heartbeat (REL-08).
  - The rollout switch comes first. It is the first half of PWA-03: the build ID becomes the git SHA, and an `app_flags.min_build` gate refuses writes from old bundles. Direct score writes are contracted only once heartbeats show every active device is past the minimum.
  - UX-02 settle guard, MOT-02 hole transition, PWA-01 save status in the save bar (W4).
- **Money (W3, §5.3):**
  - Ledger core: settlements with void/undo, outstanding-based vía banco / sin banco, «Pagado» per transfer (MONEY-01/04, UX-21).
  - WHS 9-hole allocation (MONEY-03), complete-card eligibility (MONEY-02), team as the Calcutta entrant (MONEY-20); then un-hide those configurations.
  - The oracle and property tests move into CI (1,000 cases per run, 20,000 weekly). The golden snapshot is replaced by the oracle plus hand-worked cases (QA-03/04/18).
- **Telemetry v1 (W12, §5.7)** and **fixture browser suite v1**: axe, no page errors, no horizontal scroll, visual baselines of key screens (QA-11).
- **G1 (9–15 Nov):**
  - Verifiers re-run every P0 repro against production.
  - A focused panel (MONEY, REL, ARCH, DB, UX) re-grades areas 1, 3, 4, 5 and 9.

### Phase 2 (16 Nov – 20 Dec): zero P1
- **Sync reads (W2, §5.2):**
  - `tournament_id` on every round-, group- and lot-scoped table, and set-based RLS through `my_tournament_ids()` (DB-12, SEC-05).
  - Realtime moves to Broadcast from the database on a private per-tournament topic (DB-05). Payloads are applied by primary key, with Replay or `tournament_changes` to catch up (REL-11, PERF-07).
  - A `tournament_snapshot(tid)` RPC (REL-10, DB-20).
  - Cache-first cold open (PERF-08, REL-02/03/15) and honest freshness labels (REL-04/19/21).
  - Store and mapper tests (QA-07); a 4-phone SLO spec in CI (QA-17).
- **Generated DB types plus zod at the boundaries** (ARCH-03). The new RPC contracts are typed from day one.
- **Show surfaces (W5):** VIS-03, 04, 06; A11Y-04; MOT-04; UX-13.
- **PWA lifecycle (W7):**
  - PWA-02, 04 and 05.
  - PWA-03, the second half: `registration.update()` on resume and every 30 min, and a persistent «Actualizar» that waits while a hole is half-entered.
- **Accessibility (W8):** A11Y-01 and 02, with axe and accessibility-tree gates in CI.
- **Copy (W10):** COPY-04 (`humanError`, plus a lint banning `e.message` in screens) and COPY-24 (copy lint).
- **Trust (W11):**
  - TRUST-01: Cloudflare Email Routing for golf@cardigan.mx.
  - TRUST-02 to 05: the notice matches the product; `anonymize_person`; an aviso integral generated from a data inventory checked against the migrations (drafted without counsel, and labelled so); acceptance recorded.
  - SEC-01: headers asserted in CI.
- **Disaster recovery on the free plan (W12):** DB-07 (§5.5).
- **Money (W3):** MONEY-05 (assign «Por asignar», and a «Cerrar torneo» gate), MONEY-06 (live pool check), MONEY-07 (every transfer explained); Dinero as a per-person ledger (COPY-03/07/08/09).
- **Organizer (W6):** UX-06 (rounds created from the wizard, and a «Para empezar» checklist); STRAT-03 (hide formats that contradict their boards until parity lands in Phase 3).
- **Design (W9):** VIS-01 (the row grid).
- **Brand clearance first:** the free trademark memo (STRAT-13), from IMPI Marcanet, WIPO Global Brand Database and USPTO searches. It comes before any Phase 3 investment in the mark, so Diego decides on the name with the facts in hand.
- **G2 (14–20 Dec)**: focused re-review.

### Phase 3 (21 Dec – 31 Jan): every remaining P2/P3 + deep refactors
- **Engine (W13, §5.8):**
  - **One extension seam** for modules, games and formats (ARCH-15): one split utility, one «final» rule, one no-money-before-hole-1 gate. It unlocks real format parity (STRAT-03) and the MONEY P2/P3s.
  - **The engine returns `{code, params}`** and one formatter per locale renders it (ARCH-05). That unlocks COPY-10/15/19/23/26, the Reglamento generated from settings with «En corto» and a glossary (COPY-11/12), and A11Y-22.
  - Forward-compatible settings (ARCH-04), currency and timezone as data (ARCH-06), dev code kept out of production (ARCH-07).
  - Type-aware lint with zero warnings (ARCH-17), and cleanup (ARCH-19/20).
- **A server-state layer** (TanStack Query) for profile, social, organizer and admin screens (ARCH-18). The tournament store stays custom.
- **Design-system closure (W9):**
  - Primitives that own layout, naming and focus (VIS-17); dark and «sol» modes (VIS-11, A11Y-19); hover (VIS-12); laptop and iPad layouts (VIS-19).
  - A vector P mark vectorized from the approved sheet (VIS-14, free); the signature devices (VIS-15, STRAT-15).
  - The rest of VIS and MOT.
- **Accessibility:** the rest of W8 (focus trap, 200% text, Dynamic Type, AAA figures, real tabs, announcements).
- **Trust:** the rest of W11:
  - «Tus datos» (download and delete); retention jobs; encrypted backups with retention.
    - Diego approves the retention periods: Claude proposes them.
    - No retention job ever purges a real tournament's scores, money or results (§0.1).
  - The operator access log and its disclosure; crew controls; an age gate; card history for players.
  - Shared-device session isolation; rate limits with Cloudflare Turnstile (free); the SSRF allow-list; spam limits.
- **Product (W6, Diego decides each at a checkpoint):**
  - Per-player invite links (UX-20); one account door (STRAT-06); a coherent home (STRAT-07).
  - The retention loop at the end of the ceremony (STRAT-08); a pre-round home (STRAT-10); first-tournament leaks made settings (STRAT-11).
  - Spectator and TV links without a PIN (STRAT-05; this builds §18.9); a public demo (STRAT-17).
  - A plan for the course catalog (STRAT-14).
  - A strategy one-pager with a north-star metric, and acceptance criteria back in CLAUDE.md (STRAT-01/09/12).
  - **Five organizer sessions** with people who aren't Diego. Diego recruits friends who organize golf trips; each creates a tournament cold, and telemetry and a 15-minute call record where they stall. The findings feed W6 before G3.
  - Share cards become ambassadors (PWA-06, VIS-15): money appears only on the settlement card, and every card carries the pencil notation, the event accent and a «polo» footer with a link.
- **The rest:**
  - PWA-07 to 16, REL-13 and service-worker tests (QA-16).
  - Performance: route splitting, logo renditions, dead weight, lighter chart, precache trim, font preload, plus budgets and Lighthouse CI (W13).
  - Remaining gates: component and API tests, coverage thresholds, Dependabot, screenshot weight, weekly mutation testing (W14).
  - Remaining database work: audit gaps, foreign-key indexes, advisors at zero or with documented exceptions, correction cost, the outage runbook (W12).
- **G3 (25–31 Jan)**: the dry-run re-review.

### Phase 4 (1 Feb – 24 Mar): prove it
- **Rehearsal 1 (13–14 Feb).** A duplicate of the real tournament, played by 12 real phones (iOS and Android):
  - both days simulated on a nearby course;
  - Calcutta night on a TV;
  - settlement by the real banker with toy money;
  - scripted VoiceOver/TalkBack checks;
  - notch checks;
  - airplane-mode stretches;
  - a deploy mid-round to prove the update flow;
  - telemetry watched live in Salud.
- **Fixes** by 28 Feb.
- **Rehearsal 2 (13–14 Mar)**, on the candidate build.
- **G4 (15–19 Mar).**
  - A full 15-panelist blind review plus verifiers, graded with the same weights and caps.
  - Anything above P3 is fixed by 24 Mar, or goes to Diego as an explicit waiver.

### Phase 5 (25 Mar – 16 Apr): freeze and trip
- **Freeze:** hotfixes only, through `release.yml`.
- **Go/no-go on Wed 7 Apr:**
  - the live suites against production: `rls-test`, `platform-test`, the smoke and `push-check`;
  - a backup and a restore drill;
  - every one of the 12 phones on the minimum build (from heartbeats);
  - Supabase awake;
  - the real tournament Protegido.
- **Trip mode:** hourly backups, the deploy freeze, the polling fallback armed, and Claude check-ins through `send_later`.
- **Field report** by 16 Apr.

## 5. The architecture moves

These are the root-cause fixes. Each one closes a whole cluster of findings. They are listed in dependency order.

### 5.1 Sync writes (W1): `save_hole`, outbox v2, session lapse
- **Schema, as an expand migration.**
  - `scores.version bigint`, bumped by trigger on every change.
  - `scores.device_id uuid` and `scores.mutation_id uuid`.
  - `device_sessions.device_id`: a random id per install, kept in IndexedDB.
- **`save_hole(p jsonb)`**, a definer RPC in the jsonb style of `upsert_groups` (0010:71-146).
  - **Input:** `{round_id, group_id, hole, mutation_id, device_id, entries:[{player_id, fields:{strokes?,putts?,picked_up?}, base_version}], tiebreak?, awards?}`.
  - **Rules for every caller, organizers included:** the caller shares the group, the round is live, and the card is unsigned. Comité corrections go only through `admin_save_score`, with a reason (REL-09).
  - **Only the fields sent change.** If an entry's base version is stale and its values differ, nothing is overwritten: the RPC answers `conflict` with the server row and records it in the inbox (REL-05/06).
  - **Idempotent** by `mutation_id`.
  - `entered_by = my_player_id()` and the device id come from the server, not the client (SEC-02, TRUST-24).
  - **One statement per hole**, so the results triggers fire once (DB-14).
  - **Returns** the new rows and versions, and the client reconciles its optimistic copy with them (REL-07).
- **Tarjeta.**
  - GroupCard tracks touched fields per player and sends only those. It already computes "untouched" (`ScorecardScreen.tsx:542`).
  - A remote save that lands on the open hole merges into untouched drafts: «Diego ya capturó a Justo: 6».
  - A conflict asks which value is right.
  - Undo, contests and the tiebreak go through the same call.
  - The signed-card Comité path stays on `admin_save_score` with its reason. It gains the same per-hole batching and base-version check, and when offline it queues through the outbox instead of failing (REL-22).
  - Tiebreak: «No me acuerdo: que decida el Comité» saves it as pending instead of blocking the hole (UX-08). Answers stay editable until the card is signed (UX-22).
- **Outbox v2** (`outbox.ts`, Dexie v3 migration).
  - Items carry `{mutationId, key, seq, payload, attempts, state}`.
  - A pending item for the same key merges field by field. An item already in flight is never touched: the newer write is queued behind it. Deletes are guarded by `seq` inside a Dexie transaction, and the loop walks the live queue (ARCH-01).
  - `navigator.locks` gives one flusher across tabs; BroadcastChannel carries the pending counts; `navigator.storage.persist()` is requested on the first save (REL-18).
  - Errors are classified by code:
    - network or timeout → retry;
    - auth → pause and re-authenticate (REL-16);
    - conflict → conflict inbox;
    - business-rule rejection → server inbox (REL-08);
    - validation → rejected, with its message.
  - Pending and rejected counts are visible in the shell on every screen (REL-17).
- **Session lapse (REL-16).**
  - `ensureSession()` never calls `signInAnonymously()` while a stored session exists or the outbox is non-empty. A failed refresh keeps the session and retries on `online` or `visibilitychange`.
  - If the refresh token really is dead, the outbox pauses and asks «Vuelve a entrar con tu PIN para subir 9 hoyos». Claiming the same player re-authorizes the queued writes, because the RPC checks `my_player_id`, not the original uid.
  - «Cambiar de jugador» and account switches check pending writes across all tournaments (UX-09).
- **Server inbox (REL-08).** `score_inbox` (round, hole, player, device, payload, reason, status) holds rejected and conflicted submissions.
  - The player sees «Tu hoyo 14 quedó para el Comité».
  - Comité › Rondas and Tarjetas can apply one (with a reason) or dismiss it.
  - «Terminar ronda» warns about open inbox items, and about devices whose heartbeat shows pending holes.
- **Contract.**
  - `app_flags.min_build` blocks writes from old bundles with «Actualiza para seguir». Their outbox waits, then migrates and flushes after the update.
  - Once heartbeats show no active device below the minimum (or after 72 h), direct insert, update and delete on `scores` are revoked for `authenticated`.
- **Tests:**
  - fake-indexeddb concurrency: re-enqueue while in flight, while pending, after a failure and after a reject; reload; v2→v3; timer retry; lock.
  - pgTAP `save_hole` matrix: roles × round state × signed × stale base version × idempotency.
  - e2e-stack: two phones on one card (the REL-05 repro); a double tap; nine holes offline then reconnect; token expiry offline.

### 5.2 Sync reads (W2): tenant ids, set-based RLS, applied payloads, one snapshot RPC
- **Tenant key.**
  - `tournament_id` goes on groups, group_members, round_tees, scores, snake_tiebreaks, card_signatures, handicap_overrides, hole_awards, calcutta_bids, calcutta_buybacks and team_members.
  - It is backfilled idempotently, then set by a BEFORE INSERT trigger from the parent, and indexed.
- **Set-based RLS (DB-12, DB-16).**
  - One `my_tournament_ids()` (STABLE SECURITY DEFINER).
  - Policies read `tournament_id = any ((select my_tournament_ids()))`: one call per statement instead of about 15 per row.
  - `FOR ALL` is split into per-command policies.
  - Target: a 12-player reload under 100 ms of database time, and a 60-player reload under 0.5 s, measured in pgTAP and in the harness.
- **Realtime.** Recommended: **Broadcast from the database**, which is Supabase's own guidance. Its docs position Postgres Changes for "quick testing and low amount of connected users" and advise migrating to Broadcast.
  - Triggers call `realtime.broadcast_changes` into a private topic `tournament:<id>`, authorized by an RLS policy on `realtime.messages`.
  - This removes the cross-tenant DELETE leak (DB-05) and the per-subscriber RLS cost of postgres_changes.
  - The client applies each payload by primary key through one reducer per table, from the registry (§5.4), and recomputes (REL-11, PERF-07).
  - **Catch-up after a reconnect:**
    - Short gaps use **Broadcast Replay** (`replay: {since, limit}` on private channels; messages are kept 3 days).
    - Longer gaps use `tournament_changes(tid, since)`, or a fresh snapshot.
  - Prove it first on the `e2e-stack` job before production.
- **`tournament_snapshot(tid)`.** One definer RPC that returns every table as jsonb plus a watermark. It replaces the 3 waves and 23 requests (REL-10, DB-20).
  - The cache stores the raw result, and `compute()` becomes pure (ARCH-21).
- **Cold open is cache-first.** The cached board shows immediately with «Actualizado hace N min» (a relative time, REL-04), and the session and snapshot revalidate in the background with retries (PERF-08, REL-02/03/15).
  - There is one connection-state model: live, reconnecting, offline, or degraded (polling). It reads the same everywhere (REL-19/21).
- **Rendering.** Store selectors stop whole-screen re-renders (PERF-09). A save computes once, not four times (PERF-10). The engine memoizes per module and moves to a worker if large60 exceeds 50 ms (PERF-14).
- **SLO proof.**
  - e2e-stack runs 4 browser contexts under 4G throttling (150 ms, 1.6 Mbps), each saving holes. Performance marks must show p95 < 2 s from save to render on the other phones (QA-17).
  - In the field, telemetry measures it (§5.7).

### 5.3 Money as a ledger (W3)
- **Obligations stay derived.**
  - Every `Flow` in `money.ts` gets a stable key (kind, from, to, pot, reference).
  - A new kind, **`adjustment`**, covers Comité awards of unassigned money, each with a reason (MONEY-05).
- **Settlements are events.** A new append-only table `settlements(id, tournament_id, from, to, amount, kind, flow_key?, transfer_ref?, note, recorded_by, recorded_at, voided_at, void_reason)`.
  - It allows partial and repeated payments, and undo by voiding (UX-21), all audited.
  - `payments` rows with paid = true are backfilled into it once, verified by a sum-per-party check. The old table becomes read-only. It is never dropped without Diego's explicit yes, because dropping it deletes tournament data (§0.1).
- **Outstanding balance** = obligations − settlements, per party, with the bank and «la casa» as parties.
  - Every screen reads from it: people, «Quién debe qué», vía banco, sin banco, the bank verdict, the share text, the ceremony, the CSV and published results.
  - **Vía banco** and **sin banco** (minimized) run on what is still owed (MONEY-01).
  - «Pagado» records a settlement for exactly the transfer line shown (MONEY-04).
  - The house cut is a creditor in sin banco (MONEY-12).
- **Por asignar.** Every unassigned peso is listed with its source: an unfilled slot, a pot nobody won, an undecided bet, places beyond the field, a cancelled round. Each gets one Comité action: award it with a reason, refund it pro rata, or send it to the house (MONEY-05/10, COPY-09).
- **«Cerrar torneo» gate.** Terminado and publishing wait for these to be cleared: pending tiebreaks, unsold lots, unassigned pesos, open inbox items, unsigned cards and outstanding balances.
- **Rules.**
  - WHS 9-hole allocation: rank the nine holes by their 18-hole SI, and use the 9-hole par and rating (MONEY-03).
  - Complete-card eligibility for stroke play, team play and Low score, which rank live by score to par over the holes played (MONEY-02).
  - The team is the Calcutta entrant, one place per team, and `covered` skips slots already paid (MONEY-20).
  - Integer pesos throughout, with one `splitEvenly` (MONEY-08/16/17).
  - Lots never auctioned don't cash (MONEY-11).
  - The pool check runs live inside `computeTournament`, with a blocking flag (MONEY-06/09/13).
  - The rest of MONEY-15 to 22, and base handicaps locked before the Calcutta (UX-28).
- **Proof.**
  - The panel's independent oracle and generators move into `src/engine/__oracle__/`: 1,000 cases per CI run, 20,000 weekly.
  - Ledger property tests: outstanding sums to 0 including bank and house; marking every shown transfer paid empties the list; no flow is charged twice; void restores the prior state; integer pesos throughout.
  - Hand-worked buyback, slot-tie and settlement-leg cases (QA-03/04/05).
  - The 950-line golden snapshot, which pins MONEY-01, is replaced by structured expectations (QA-18).

### 5.4 One registry of tournament tables (W0 → W12)
- `src/lib/tournamentTables.ts` holds, per table: scope, parent key, primary key, whether it is realtime/broadcast, backup and restore order, audit flag, label key, and snapshot inclusion.
- It feeds the store, the snapshot contract, `backup.ts`, `backupTables.ts`, the export and the audit labels.
- `tournamentTables.test.ts` parses the migrations and fails on any drift: create-table columns and primary keys, the publication or broadcast triggers, the latest `restore_tournament` body, audit triggers and es-MX labels. That test would have caught REL-01, ARCH-09 and DB-02.

### 5.5 Database as code and disaster recovery on the free plan (W12)
- **Replay from zero.** The chain replays with no help (DB-22), and checksums refuse a re-applied or edited migration (DB-17).
- **The `db` CI job.** The Supabase Postgres image at production's major version, plus the stubs ported from the panel's harness. Replay, then pgTAP:
  - the tenancy matrix, rewritten from `rls-test.mjs` with `set local request.jwt.claims`;
  - a restore round trip that mutates every table;
  - WHS parity on the shared case file (ARCH-16);
  - the `save_hole` matrix;
  - ledger invariants.
  - Splinter fails on any new warning. The baseline goes to zero, or to documented exceptions, in Phase 3 (DB-16).
- **`release.yml`,** after CI is green on `main`:
  1. migrations to staging, then a smoke test;
  2. an on-demand production backup;
  3. migrations to production;
  4. deploy;
  5. a post-deploy smoke test.
  - Nothing is applied by hand any more (DB-09). `db.mjs` gains local, staging and production targets.
- **Disaster recovery without Pro (DB-07).**
  - The nightly R2 dump adds the essentials of `auth.users` and `storage.objects`, is encrypted with a key kept on Vercel, and has retention of 30 daily plus 12 monthly dumps (TRUST-10).
  - `scripts/restore-r2.mjs` rebuilds a database in foreign-key order.
  - `drill.yml` restores the latest dump weekly into CI Postgres, checks integrity and records the time taken (evidence for the RTO).
  - **Staging is the warm standby.** A documented switch points Vercel's env at staging and redeploys. Targets: RTO ≤ 30 min, and RPO ≤ 1 h during the rehearsal and trip windows (hourly backups on an Actions schedule).
  - The RUNBOOK covers a Supabase outage on Calcutta night (DB-19).
  - Both projects are kept alive.
- **Also:** tournament-attributed audit rows for cascades, teams, PIN resets, device claims and settlements (DB-13); foreign-key indexes (DB-15); results rebuilt incrementally under an advisory lock (DB-14/21).

### 5.6 Quality gates, the CI budget, and `main` without GitHub Pro (W14)

**CI jobs.** The private free plan gives 2,000 Actions minutes a month, and the budget is real.
- The repo has run CI 190 times in 5 days, about 1 minute each. At that pace, heavy suites on every push would cost more than 10,000 minutes a month.
- So heavy suites don't run on every push:

| Job | What it runs | When |
|---|---|---|
| `check` | typecheck, lint, unit tests, build, ledger test (≈2 min) | Every PR push, and `main` |
| `db` | replay, pgTAP, splinter (≈2 min) | PR marked ready (not draft) and touching `supabase/**`, the registry or `scripts/db*`; nightly on `main` |
| `e2e-fixtures` | Playwright on the fixture routes, Chromium: flows, human-speed typing, axe plus accessibility-tree names, no page errors, no horizontal scroll, visual baselines (≈6 min) | PR marked ready and touching `src/**` or `e2e/**`; nightly on `main` |
| `e2e-stack` | `supabase start` + multi-context sync, realtime, auth lapse, chaos, 4-phone SLO (≈10 min) | PR marked ready and touching `src/data/**`, `supabase/**`, `api/**` or the Tarjeta; nightly on `main` |
| `weekly` | WebKit fixture run, Lighthouse CI, bundle budgets, Stryker mutation on engine and outbox, 20,000-case oracle, R2 restore drill | Sundays, and before each rehearsal |

- **Local first.** PRs open as drafts. The `db` and fixture suites run **locally** in the pre-push guard for the paths they cover (Postgres 16 and Chromium are in the sandbox), and cost no minutes.
- **Keep it lean.** Jobs are consolidated, since each job is billed rounded up to the minute. Every job cancels the previous run on the same branch. The npm and Playwright caches are kept.
- **Expected spend:** about 1,100–1,300 minutes a month at 20–25 PRs a month.
- **Tripwire.** Minutes are tallied weekly from the runs API. Past 1,500 in a month, heavy suites go nightly-only for the rest of that month.
- **The alternative stays open.** GitHub Pro (3,000 minutes plus rulesets) or a public repo (unlimited) would remove this constraint.
- **Visual regression.** Curated `toHaveScreenshot` baselines: 14 fixtures across 375, 393, 1024, 1440 and 1920 px, in light and (from Phase 3) dark. The weight is watched (QA-20).
- **Budgets** (from Phase 3): entry ≤ 150 KB gzip after splitting; precache ≤ 1.2 MB; Lighthouse Perf ≥ 90, A11y 100, BP 100 on Entrar and `/t/_/full12-live`.
- **Coverage thresholds:** engine ≥ 95%, `src/data` ≥ 85%, and critical components via component tests. **Mutation score** ≥ 85% on money, rules and outbox. **Dependabot** weekly, and `npm audit` in `check`.
- **`main` without rulesets (QA-10):**
  1. Production deploys only after CI, through **staged production deployments**. Turn off auto-assigning the production domains (`PATCH /v9/projects/<id>` with `VERCEL_TOKEN`). A push to `main` then builds a production deployment that stays unassigned. `release.yml` waits for CI on that SHA, runs the migrations, promotes the deployment (`POST /v10/projects/<id>/promote/<deploymentId>`), then smoke-tests it.
     - Fallback: a Vercel project check that blocks alias assignment.
     - PR 8 proves the flow on a harmless commit before relying on it.
  2. Claude-side guards. `prepush-guard.sh` refuses pushes to `main`, and a PreToolUse hook refuses the GitHub MCP write tools on `main`.
  3. A red `main` never deploys.
  - The residual (no server-side enforcement) is recorded in the ledger; GitHub Pro would remove it.

### 5.7 First-party telemetry (W12, STRAT-02)
- **Tables.**
  - `client_events(at, device_id, auth_uid, tournament_id, build, kind, name, value, data ≤2 KB)`.
  - `device_status(device_id, tournament_id, player_id, build, pending, rejected, oldest_pending_at, last_sync_at, last_seen_at)`.
  - Written only through the definer RPCs `log_client_events(batch)` and `heartbeat(p)`. Both are rate-limited and size-capped, and PII is scrubbed.
  - Retention is 30 days, through pg_cron.
  - RLS: the platform admin reads everything; a Comité reads its own tournament's devices.
- **Client (`src/lib/telemetry.ts`).** It records:
  - errors: `onerror`, `unhandledrejection`, RootBoundary and RouteError;
  - outbox events;
  - save → ack on the sender;
  - commit → apply on receivers, corrected by a clock offset estimated from RPC responses;
  - web vitals, through the `web-vitals` package;
  - about 10 funnel events.
  - Events are batched with `fetch keepalive`, and queued in IndexedDB while offline.
- **Symbolication.** Hidden source maps are uploaded to R2 at production build time and removed from `dist`. `scripts/symbolicate.mjs` decodes a stack.
- **Where it shows.**
  - Salud: error groups by build, SLO p50/p95 per tournament and day, outbox depth, devices on old builds, and vitals.
  - Comité › Rondas: device heartbeats.
  - A daily digest notice to the admin when thresholds break.
  - The north-star metric and funnel (STRAT-02/09).

### 5.8 One engine seam, and explanations as data (W13 + W10, Phase 3)
- **One `GameDefinition` contract.** It has: id, a forward-compatible zod settings schema (unknown games are kept and flagged, never thrown: ARCH-04), defaults and labels, entrants, compute, prizes, board, warnings, and `explain → {code, params}`.
  - Formats become rankers that the modules consume.
  - Core provides one `splitEvenly`, one `isFinal` and one no-money-before-hole-1 gate.
  - A single registry generates the settings union, the catalog and the prize check (ARCH-15).
- **Explanations as data.** The engine returns keys. `es-MX.ts` renders them with plural and gender helpers and one money formatter driven by the tournament's currency (ARCH-05/06).
- **The guardrail.** The oracle, the property tests and the structured golden cases must produce identical numbers before and after. Visual regression catches any change in rendered text.

### 5.9 Show surfaces and the design system (W5, W9)
- **Broadcast layout.**
  - A type scale by viewing distance: a name's cap height is at least 20′ of arc at 4 m on a 55" screen (VIS-05). That is 23 mm, or 3.4 vh, so name text is about 4.9 vh.
  - Plates; pagination by measured height, «1–9 de 12» (VIS-03); labelled grids (VIS-04); a lower-third ticker; the logo on a plate (VIS-08).
  - A broadcast motion scale (MOT-11).
- **Auction TV.**
  - The sold moment: «Vendido a X, $Y» with the gavel, and the newest sale first (MOT-04).
  - A pot count-up and the hat-draw shuffle (MOT-05).
  - The pairs draw on the TV (UX-17).
- **Ceremonia.**
  - Full-bleed reveals, count-ups and the event accent (VIS-06, MOT-23).
  - A remote from the admin phone over Realtime broadcast, plus keyboard and clicker (UX-18).
- **A TV link with no PIN,** using a read-only token and no money (STRAT-05).
- **Tests.** At 1920×1080 and 1280×720, every player appears on some page, nothing overflows, and every slide has a baseline.
- **Design system.**
  - Primitives own the row grid, names and focus (VIS-01/17).
  - Dark and «sol» tokens; hover states; laptop and iPad layouts; one link style.
  - A vector P mark traced from the approved sheet (free).
  - The signature devices (plate, figure, pencil notation) used in the product, not only in the style guide.

## 6. What Diego does, and when

Each item goes into `docs/handoff.md` in PR 1, with exact clicks and how Claude verifies it.

| When | Item | Unblocks |
|---|---|---|
| **Now** | Make the repo private: Settings › General › Danger zone › Change visibility | CHAIR-02; PR 9 |
| **By Sat 3 Oct** | Rotate the keys and add `SUPABASE_PAT`, `SUPABASE_SECRET_KEY` and `VERCEL_TOKEN` to the Claude Code environment (the handoff item already exists) | Every migration, the live suites and the Vercel API |
| **By Wed 7 Oct** | Add GitHub Actions secrets: `SUPABASE_PAT`, `CRON_SECRET` and a CI-only team-scoped `VERCEL_TOKEN`. Claude's sandbox can't set Actions secrets (proxy-blocked) | Staged and promoted deploys (QA-10); migrations from the pipeline (DB-09); hourly backups during the trip windows |
| **Phase 1** | Say yes at the prompt to create the free **staging** Supabase project in the Cardi-Golf org (free, but it's on the `ask` list) | Previews off production data; the disaster-recovery warm standby |
| **Phase 2** | Turn on Cloudflare Email Routing for golf@cardigan.mx to his inbox, or hand Claude a DNS/Email-Routing token | TRUST-01 |
| **Phase 2** | Create a read-only R2 token and add it as a GitHub secret | The weekly restore drill (DB-07) |
| **Phase 2–3** | Product checkpoints, each a one-page proposal from Claude: the strategy one-pager and north star; one account door; spectator link (§18.9); merging friends and crews; keeping «Polo» after the trademark memo; handwritten numerals (optional). Plus recruiting **five organizers** who aren't Diego for a cold setup session | W6; STRAT-09 and the organizer validation that §3.3 asks for |
| **By Sun 31 Jan** | Tournament data (already on the handoff) | Rehearsal 1 on the real configuration |
| **13–14 Feb, 13–14 Mar** | Rehearsals: 12 people with their phones, a TV, the real banker. Plus a scripted VoiceOver pass on his iPhone | Field proof; A11Y and PWA checks on real iOS |
| **Wed 7 Apr** | Go/no-go sign-off | The trip |

He also gets a Spanish «qué probar» note after every merge, as today.

## 7. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | The blind G4 (15–19 Mar) finds new P0/P1s three weeks before the trip | G3 dry run with the same method at the end of January. The trip-safe subset must be done by Rehearsal 1 whatever else slips. Hotfixes during the freeze go through `release.yml`. Anything not safely fixable goes to Diego as a written waiver, never a silent carry-over |
| 2 | The deep refactors (one engine seam, engine keys, server state, the design system) regress something in Dec–Jan | Gates first (Phase 1). Refactors must keep the oracle, property and structured golden numbers identical, plus the visual, axe and e2e-stack suites. Each lands in small PRs behind parity tests, and Rehearsal 1 exercises all of it |
| 3 | Old bundles in the field during the sync rebuild | Expand, then contract (§2.7). The `min_build` switch, heartbeats showing each device's build, and contraction only after every active device has updated. A Dexie v2→v3 migration test |
| 4 | Free-plan Supabase: pausing, shared compute, no PITR | Keep-alive for both projects. Set-based RLS and one snapshot RPC, with reload cost targets tested at 60 players. Hourly R2 dumps plus the warm-standby switch; restore drilled weekly |
| 5 | CI minutes run out on the private free plan, Actions stop, and releases stall. At the past pace (190 runs in 5 days), this is the likeliest operational failure | Heavy suites run only on ready PRs and nightly; local pre-push runs `db` and fixtures. A weekly tally, and a tripwire at 1,500 minutes. The release workflow stays small. If the tripwire fires twice, Claude asks Diego about GitHub Pro (US$4/mo) or going public |
| 6 | iOS-only behaviour can't be tested in the sandbox: the standalone status bar, Dynamic Type, VoiceOver, push, storage eviction | WebKit runs in the weekly CI job. Scripted real-iPhone checklists go to Diego after each phase and run at both rehearsals |
| 7 | Diego's clicks, data or decisions arrive late | Every ask is front-loaded in Phase 0 with exact steps. Claude proposes defaults so work continues while a decision is pending. Tournament data deadline 31 Jan |
| 8 | Secrets arrive late and block migrations | Client-only fixes first (REL-01 client-side, UX-01, REL-14). Migrations are built and proven on the local harness, then applied the day the secrets land |
| 9 | Legal residuals without counsel: the LFPDPPP notice, the money framing | Drafted from the law's text and conservative. A «Polo no mueve dinero» disclaimer on money screens. Recorded as a residual Diego can close by hiring counsel |
| 10 | Backfills or migrations touch production data (tenant ids, settlements) | Staging first; an on-demand backup before each production migration; idempotent backfills with verification queries. The real tournament is set Protegido as soon as it exists. Nothing deletes real tournament data (§0.1 carve-out) |
| 11 | The ephemeral scratchpad (repro scripts, harness) disappears before it's harvested | It is PR 1, on day 1 |
| 12 | Strategy findings grow into new surface (STRAT bets) | Each is a one-page proposal. Build only what closes the finding; no new surface without a metric |

## 8. Verification

- **Per PR:**
  - `npm run preflight` locally.
  - The CI jobs that match the paths changed.
  - The finding's repro test flips from failing to passing.
  - For a P0/P1, an independent verifier agent re-runs the original repro (against the preview, the harness or Ensayo) and tries to break the fix. Its verdict goes in the PR and in the ledger.
  - Visual diffs are reviewed when they change.
- **Per gate:**
  - G1–G3 re-run every closed finding's repro and hunt for regressions in the affected areas.
  - The ledger burn-down must match what the re-review finds.
  - Each gate ends with a scorecard computed with the report's weights and caps, published as a private page for Diego.
- **G4:** the blind 15-panelist review, run with the same brief and graded the same way.
- **In the field:**
  - During both rehearsals, Salud shows save → other phone p95 < 2 s, zero rejected writes left unresolved, and every outbox drained.
  - The real banker closes the settlement to the peso.
  - The go/no-go checklist on 7 Apr passes.

## 9. Appendix: every finding by workstream

A P0 is fixed in Phase 1 (or Phase 0 in W0) and a P1 in Phase 2. A P2 or P3 is fixed in Phase 3, unless it rides with the P0/P1 change that touches the same code, as noted in §4. All 282 are covered, and each appears exactly once (checked with a script against `findings.json`).

| Workstream | # | Findings |
|---|---:|---|
| **W0** Stop the bleeding (Phase 0) | 8 | **P0** REL-01, UX-01, ARCH-09 · **P1** REL-14, CHAIR-01, CHAIR-02, QA-10 · **P2** DB-01 |
| **W1** Sync writes: save_hole, outbox v2, session lapse | 15 | **P0** REL-05, ARCH-01, REL-16 · **P1** REL-08, REL-09, QA-06 · **P2** REL-06, REL-07, REL-17, REL-18, SEC-02, TRUST-24, DB-14, ARCH-13 · **P3** REL-22 |
| **W2** Sync reads: tenant ids, set-based RLS, payload Realtime, snapshot RPC, cache-first | 20 | **P1** REL-11, PERF-07, PERF-08, REL-02, REL-03, REL-15, DB-12, QA-07 · **P2** REL-10, REL-04, REL-19, DB-05, PERF-09, PERF-10, QA-17, SEC-05 · **P3** REL-21, DB-20, PERF-14, ARCH-21 |
| **W3** Money ledger and rules | 34 | **P0** MONEY-01, MONEY-02, MONEY-03, MONEY-20 · **P1** MONEY-04, MONEY-05, MONEY-06, UX-21, QA-03 · **P2** MONEY-07, MONEY-08, MONEY-09, MONEY-10, MONEY-11, MONEY-12, MONEY-13, MONEY-15, MONEY-22, UX-28, COPY-03, COPY-07, COPY-09, QA-04, QA-05, DB-03, DB-04 · **P3** MONEY-16, MONEY-17, MONEY-18, MONEY-19, MONEY-21, COPY-08, QA-18, QA-19 |
| **W4** Tarjeta and Comité flows | 17 | **P1** UX-02, PWA-01 · **P2** MOT-02, MOT-17, UX-08, UX-22, COPY-18, ARCH-14, UX-09, UX-15, UX-16, UX-23, MOT-07, MOT-10 · **P3** UX-19, UX-24, TRUST-19 |
| **W5** Show surfaces: TV, Ceremonia, Calcutta night | 19 | **P1** VIS-03, VIS-04, VIS-06, MOT-04, A11Y-04 · **P2** VIS-05, VIS-07, VIS-08, MOT-01, MOT-05, MOT-08, MOT-23, A11Y-15, UX-13, UX-17, UX-18, STRAT-05 · **P3** MOT-11, A11Y-21 |
| **W6** Organizer, product and strategy | 19 | **P1** UX-06, STRAT-03 · **P2** UX-03, UX-04, UX-05, UX-20, STRAT-01, STRAT-06, STRAT-07, STRAT-08, STRAT-09, STRAT-10, STRAT-11, STRAT-12, STRAT-13, STRAT-14, PWA-06 · **P3** UX-25, STRAT-17 |
| **W7** Mobile and PWA lifecycle | 14 | **P1** PWA-02, PWA-03, PWA-04, PWA-05 · **P2** PWA-07, PWA-08, PWA-09, PWA-10, REL-13, QA-16 · **P3** PWA-12, PWA-14, PWA-15, PWA-16 |
| **W8** Accessibility | 22 | **P1** A11Y-01, A11Y-02 · **P2** A11Y-03, A11Y-05, A11Y-06, A11Y-07, A11Y-08, A11Y-09, A11Y-10, A11Y-11, A11Y-12, A11Y-13, A11Y-14, A11Y-16, A11Y-17, A11Y-19 · **P3** A11Y-20, A11Y-22, A11Y-23, A11Y-24, A11Y-25, MOT-15 |
| **W9** Design system, brand and motion | 34 | **P1** VIS-01 · **P2** VIS-02, VIS-09, VIS-10, VIS-11, VIS-12, VIS-13, VIS-14, VIS-15, VIS-18, VIS-19, VIS-20, VIS-21, VIS-28, MOT-06, MOT-09, MOT-12, MOT-16, MOT-18, MOT-21, PERF-16, STRAT-15 · **P3** VIS-16, VIS-17, VIS-22, VIS-23, VIS-24, VIS-25, VIS-26, VIS-27, MOT-13, MOT-14, MOT-19, MOT-22 |
| **W10** Copy system | 16 | **P1** COPY-04, COPY-24 · **P2** COPY-10, COPY-11, COPY-12, COPY-13, COPY-14, COPY-15, COPY-19, COPY-20, COPY-21, COPY-26, ARCH-05 · **P3** COPY-06, COPY-23, COPY-25 |
| **W11** Trust: security and privacy | 29 | **P1** TRUST-01, TRUST-02, TRUST-03, TRUST-04, TRUST-05 · **P2** SEC-01, SEC-03, SEC-04, SEC-06, TRUST-07, TRUST-08, TRUST-09, TRUST-10, TRUST-11, TRUST-12, TRUST-13, TRUST-14, TRUST-15, TRUST-16, TRUST-17, TRUST-18, TRUST-22, TRUST-23 · **P3** SEC-07, SEC-08, SEC-09, SEC-10, SEC-11, TRUST-21 |
| **W12** Data platform: DB as code, DR, telemetry | 12 | **P0** DB-02 · **P1** DB-07, DB-09, STRAT-02 · **P2** DB-13, DB-16, DB-19, ARCH-16 · **P3** DB-15, DB-17, DB-21, DB-22 |
| **W13** Architecture and performance | 15 | **P2** ARCH-03, ARCH-04, ARCH-06, ARCH-07, ARCH-15, ARCH-17, ARCH-18, PERF-01, PERF-02, PERF-03, PERF-04, PERF-05 · **P3** ARCH-19, ARCH-20, PERF-13 |
| **W14** Quality gates and delivery | 8 | **P1** QA-11 · **P2** QA-12, QA-13, QA-14, QA-15 · **P3** QA-20, QA-21, QA-23 |
