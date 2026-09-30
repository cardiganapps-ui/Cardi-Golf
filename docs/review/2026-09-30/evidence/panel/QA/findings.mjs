import fs from 'node:fs'
const Q = 'panel/evidence/QA'
const F = []
const add = (f) => F.push({ id: `QA-${String(F.length + 1).padStart(2, '0')}`, ...f })

add({
  title: 'The outbox silently drops a score correction made while an earlier write for the same hole is still pushing or queued in the same flush (Deshacer, re-edits, backlog after reconnect), and the chip still says «Sincronizado»',
  severity: 'P0', verdict: 'CONFIRMED', area: 'Reliability, offline and realtime', status: 'new',
  evidence: [
    'src/data/outbox.ts:270 — flush iterates a stale copy `for (const item of [...queue])`, so it pushes the OLD payload of an item that a newer same-hole write has replaced in the queue',
    'src/data/outbox.ts:273-274 — on success it removes by key `queue.filter((x) => x.key !== item.key)` and `d.items.delete(item.key)`: this deletes the NEWER correction (queue and IndexedDB) that was enqueued while the old one was in flight',
    'src/data/outbox.ts:286 — on a network error `queue.map((x) => (x.key === item.key ? next : x))` overwrites the newer correction with the old payload (+1 attempt); src/data/outbox.ts:128 (reject) drops it the same way',
    'src/screens/tournament/ScorecardScreen.tsx:313-323 — «Deshacer» re-enqueues the previous values for the same keys immediately after «Guardar hoyo», i.e. exactly while the first writes are in flight',
    'Live repro on Ensayo (production), panel/evidence/QA/e2e/undo-race.log: Nico hole 1 5→4, «Guardar hoyo», first POST held 7 s, «Deshacer» at +0.9 s → only 3 more POSTs are sent (players 2–4), the undo value 5 for Nico is never sent; after reload the server has 4 and the chip reads «Sincronizado». Hole restored to 5,6,8,6 afterwards',
    'docs/review/2026-09-30/shots/t_tarjeta-ensayo-15pro-light-qa-undo-tapped.png (after tapping Deshacer) and t_tarjeta-ensayo-15pro-light-qa-undo-lost.png (after reload: Nico 4, «Sincronizado»)',
    'Unit probes against the real module (panel/evidence/QA/outbox-probes.log): in-flight success → server saw [5] only, queue empty; in-flight network error → queue holds [5] (old) instead of [4]; backlog after reconnect (3 holes queued, fix hole 3 while hole 1 pushes) → server {1:5, 2:6, 3:4}, correction 5 lost, queue empty',
    'Mutation M20 (enqueue no longer replaces an older write for the same hole) survives all 339 tests: same-key behaviour is untested (panel/evidence/QA/mutation-results.json)',
  ],
  impact: 'On the course, a player who taps «Deshacer» or fixes a hole while the phone is still sending (weak 4G, or the backlog it drains when signal returns after holes entered offline) ends with the wrong gross on the server for that hole. The phone shows the corrected number until the next reload, then flips back, while the chip says everything is synced. Stableford points, the snake, fewest putts and every prize computed from them are wrong unless someone re-checks the whole card before signing.',
  recommendation: 'In flush, re-read the queue head each iteration instead of iterating a copy, and give each item a monotonic version (e.g. `seq` or `createdAt`). After a push, remove the item only if the queued entry for that key still has the same version (`x.key === item.key && x.seq === item.seq`) and delete from Dexie with the same condition; on failure update attempts only if the version is unchanged; in `reject` remove only that version. Add three tests to src/data/outbox.test.ts: correction during an in-flight success, during an in-flight network error, and during a backlog drain (the probes in panel/evidence/QA/repo/qa-tests/outbox-race.test.ts and outbox-backlog.test.ts are ready to paste). Also keep the Deshacer toast from enqueueing until the save being undone has left the queue, or send the undo as a new version.',
  effort: 'S',
  repro: '1) Unit (10 s, no network): `cd $S/panel/evidence/QA/repo && npx vitest run --config qa-tests/vitest.qa.config.ts qa-tests/outbox-race.test.ts qa-tests/outbox-backlog.test.ts` → 3 failures («server saw [5]», «queued after failure [5]», «server has {1:5,2:6,3:4}»). The copy has its own node_modules and imports the unmodified src/data/outbox.ts. 2) Browser (Ensayo only, writes one hole and restores it): with the preview on :4173, `node $S/panel/evidence/QA/e2e/undo-race.mjs <outdir>` — enters as Nico (PIN 1234, once), holds the first scores POST 7 s via page.route, changes hole 1, taps «Guardar hoyo» then «Deshacer», waits for «Sincronizado», reloads, prints «UNDO LOST», then puts the hole back.',
})

add({
  title: 'A 9-hole round gives each player half the strokes his 9-hole handicap entitles him to, and the regression test asserts the wrong number',
  severity: 'P1', verdict: 'CONFIRMED', area: 'Correctness of rules and money', status: 'still open (audit-2026-09-28 P1 36: the fix over-corrected from ~60% too many strokes to 50% too few)',
  evidence: [
    'src/engine/core/compute.ts:147 — `strokesReceived(roundHalfUp(playingHcp / 2), h.strokeIndex, 18)`: halves the handicap AND allocates it on the 18-hole stroke indexes, so only holes with SI ≤ PH9 get a stroke; on a front nine (SIs 7,11,17,3,1,13,15,9,5) PH9 8 → strokes only on SI 1,3,5,7 = 4',
    'Probe panel/evidence/QA/repo/qa-tests/nine-hole.test.ts: base 20 → PH 16 → 9-hole PH 8 → 4 strokes received; base 25 → PH 20 → 10 → 5; base 30 → 24 → 12 → 6; base 10 → 8 → 4 → 2 (always exactly half)',
    'src/engine/cleanup.test.ts:168-177 — the test comment says «PH 16 → 8 strokes over the nine» but asserts `total === holes with SI ≤ 8` (= 4) and `total <= 8`, so it pins the defect',
    'src/screens/admin/AdminRounds.tsx:198-199 — the Comité can set any round to 9 holes',
    'Mutation M04 (half PH rounded down instead of half up) also survives: the only 9-hole test uses an even PH',
  ],
  impact: 'Any tournament with a 9-hole round (weather-shortened day, twilight nine) scores every handicap player as if he had half his strokes: a 16-handicap loses ~4 Stableford points per nine, so low handicaps win the day, the best-round prize, the pairs game and the Calcutta slots that depend on the ranking.',
  recommendation: 'Allocate the 9-hole playing handicap over the nine holes being played: rank those holes by their 18-hole SI (1..9) and call `strokesReceived(ph9, rankWithinNine, 9)` (or use a 9-hole SI column when the card has one). Replace cleanup.test.ts:168-177 with hand-worked cases: PH 16 → PH9 8 → 8 strokes (one on every hole but the easiest), PH 20 → PH9 10 → 10 strokes (two on the hardest), odd PH 15 → PH9 8 (half up).',
  effort: 'S',
  repro: '`cd $S/panel/evidence/QA/repo && npx vitest run --config qa-tests/vitest.qa.config.ts qa-tests/nine-hole.test.ts` → 4 failures, printing «PH18 16 → nine-hole PH 8 → strokes received over 9 holes: 4».',
})

add({
  title: 'Calcutta buybacks are only ever tested at exactly 50%, so swapping the owner\'s and the player\'s shares, or dropping the 50% cap, passes every test',
  severity: 'P1', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    'src/engine/modules/auction/index.ts:106 (cap) and :110-112 (owner gets 100 − pct, player gets pct)',
    'Every buyback in the suite is 50%: auction.test.ts:102, money.test.ts:25, golden.test.ts:21 — at 50% both shares are equal, so any mix-up is invisible',
    'Mutation M10 (owner gets pct, player gets 100 − pct) → SURVIVED; M11 (no clamp to buybackMaxPct) → SURVIVED (panel/evidence/QA/mutation-results.json, harness panel/evidence/QA/mutate.mjs)',
    'The console offers 0/25/50/custom (§10), so 25% and custom are the normal cases, not edge cases',
  ],
  impact: 'A refactor that swaps the two lines or drops the cap ships green; on the night a 25% buyback pays 75% of the champion\'s slot to the player instead of the buyer. With a $12,000 pot the champion slot is $6,600, so a swap moves $3,300 between two friends.',
  recommendation: 'Add to auction.test.ts: 25% buyback on a $1,000 lot → owner 75% / paid $750, player 25% / paid $250, champion slot split 75/25; a custom 30%; a stored 60% clamped to 50%; a self-owned lot with a buyback (no second owner). Assert payouts and the buyback flow amount in money.flows.',
  effort: 'S',
  repro: 'cd $S/panel/evidence/QA && node mutate.mjs $S/panel/evidence/QA/repo M10,M11 → «M10 SURVIVED», «M11 SURVIVED» (one exact-string replacement in the copy, full suite, file restored; ~30 s).',
})

add({
  title: 'Settlement and prize-check legs outside the first tournament\'s happy path have no pinning test: side-pot buy-ins in «vía banco», partially paid payouts, percent-place remainders and the pair odd peso can all break silently',
  severity: 'P2', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    'M13 src/engine/core/money.ts:248 `toBank = m.entry + m.sidePots + m.calcuttaPurchases` → drop `m.sidePots`: SURVIVED (settlement tells players with side pots to pay the bank less than they owe)',
    'M14 src/engine/core/money.ts:181 payout «Pagado» when any amount is recorded instead of ≥ owed: SURVIVED',
    'M16 src/engine/settings/prizeCheck.ts:177 percent places lose the remainder pesos: SURVIVED',
    'M23 src/engine/modules/pairs/index.ts:130 odd peso of a pair prize paid to nobody: SURVIVED',
    'The money invariants (netSum 0, banker balanced) are asserted on only three hand-built fixtures (money.test.ts, handCalc.test.ts, golden.test.ts), none with side pots in the settlement',
  ],
  impact: 'Ronda rápida and any tournament with side pots, percent prizes or odd pair prizes can show a settlement that does not add up, or mark a payout paid when only part was paid; nothing in CI would notice.',
  recommendation: 'Add property-style tests in src/engine/core/money.test.ts: for random fields (4–16 players, random enabled modules, side pots, bets, buybacks, partial payments) assert Σ viaBank to bank = Σ from bank, Σ net = 0, every person\'s viaBank balance = prizes + shares − entry − sidePots − purchases, and a payout is paid iff Σ paid ≥ owed. Add exact cases for percentPlaces(1001, [50,30,20]) = [501,300,200] and a $1,001 pair prize.',
  effort: 'M',
  repro: 'cd $S/panel/evidence/QA && node mutate.mjs $S/panel/evidence/QA/repo M13,M14,M16,M23 → all SURVIVED.',
})

add({
  title: 'Tie-break and settlement rules beyond the fixture\'s happy path are untested: best-round countback, stale snake tiebreak answers, DNF snake settlement, last place in a finished tournament',
  severity: 'P2', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'partly fixed (audit-2026-09-28 P2 «Tests: … DNF …»): fewest-putts withdrawal is now covered, the rest is not',
  evidence: [
    'M17 src/engine/modules/bestRound/index.ts:38 remove countback within the day (tie → split): SURVIVED; modules/games.test.ts:25-41 never asserts WHO wins best round, only that $1,200 is paid',
    'M06 src/engine/modules/snake/index.ts:90 accept a stored tiebreak naming a non-candidate (stale answer after a putts edit): SURVIVED',
    'M07 src/engine/modules/snake/index.ts:102 a finished round no longer settles a group with a DNF player (§18.7): SURVIVED',
    'M24 src/engine/modules/individual/index.ts:140 no last place once the tournament is final: SURVIVED; the only assertion (individual.test.ts:63) runs on an unfinished tournament. CeremonyScreen.tsx:47 reveals La Cuchara from it',
  ],
  impact: 'The rules sheet promises these behaviours (§5.4 countback per day, §5.6 «¿Quién embocó al último?», §18.7 DNF), and a regression in any of them changes who gets $1,200 or $200 without a red test.',
  recommendation: 'Add one hand-worked test per rule: two players tied on day points where holes 10–18 decide best round; a tiebreak answer whose player no longer has 3 putts after a Comité edit → pending again; a group with one player stopping at hole 12 and the round marked finished → survivors paid; a finished tournament whose last place is reported and revealed.',
  effort: 'S',
  repro: 'cd $S/panel/evidence/QA && node mutate.mjs $S/panel/evidence/QA/repo M06,M07,M17,M24 → all SURVIVED.',
})

add({
  title: 'The outbox tests do not pin the offline promise: no IndexedDB, no overlay, no automatic retry, no same-hole replacement — four of four targeted outbox mutants survive',
  severity: 'P1', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'partly fixed (audit-2026-09-28 P0 3 and P0 4 now have tests in src/data/outbox.test.ts; persistence and the overlay still have none)',
  evidence: [
    'vite.config.ts `test.environment: \'node\'` and no fake-indexeddb: `getDb()` returns null (src/data/outbox.ts:72-76), so Dexie persistence, `loadQueue` on restart and the v1→v2 schema upgrade (outbox.ts:62-70, 110-115) never run in a test',
    'Coverage of src/data/outbox.ts 56.1% lines; `overlayPending` (outbox.ts:153-186) and the real `push` (229-249) at 0% (panel/evidence/QA/coverage-data-lib.txt, uncovered-lines.txt)',
    'M19 remove the backoff `schedule(...)` after a network error (outbox.ts:289) → SURVIVED: the test calls flush() 30 times by hand (outbox.test.ts:33), so a phone that never retries on its own passes',
    'M20 enqueue keeps both old and new write for the same hole (outbox.ts:189) → SURVIVED; M21 overlay no longer replaces an existing server score (outbox.ts:169) → SURVIVED; M22 «invalid input» retried forever instead of rejected (outbox.ts:253) → SURVIVED',
    'QA-01 is exactly the kind of defect these missing tests would have caught',
  ],
  impact: '«Score entry works fully offline and syncs later without losing anything» (§2) is the promise the whole day rests on, and today a regression in persistence, retry or the optimistic overlay would pass CI and be discovered on the course.',
  recommendation: 'Add fake-indexeddb (dev dependency) and a jsdom/happy-dom project for src/data; test: queue survives a module reload (loadQueue), v1 database upgrades to v2, overlay replaces/insert scores and tiebreaks, a network error schedules a retry with fake timers (advanceTimersByTime(2000) → pushed), same-hole replacement, and the three QA-01 races. Target 100% branch coverage on outbox.ts and enforce it per file.',
  effort: 'M',
  repro: 'cd $S/panel/evidence/QA && node mutate.mjs $S/panel/evidence/QA/repo M19,M20,M21,M22 → all SURVIVED; `grep -n environment vite.config.ts` → node.',
})

add({
  title: 'The data layer that turns server rows into the engine\'s snapshot has no tests: store, realtime reloads, mappers, offline snapshot cache, paging and the backup client are at 0% — the fixes for three earlier P0/P1s shipped without regression tests',
  severity: 'P1', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    'Coverage (panel/evidence/QA/coverage-data-lib.txt): src/data/tournamentStore.ts 0/224, mappers.ts 0/165, api.ts 0/334, snapshotCache.ts 0/46, paged.ts 0/11, backup.ts 0/73, session.ts 0/16; src/data overall 19.1% lines',
    'Earlier fixes without a test: audit P0 5 cold open offline → snapshotCache.ts; audit P0 12 PostgREST 1,000-row cap → paged.ts:10-18 (`rows.length < PAGE` boundary untested); audit P1 15 reload on online/visibility + sequence guard → tournamentStore.ts:77-78, 233-255',
    'The engine is tested only against hand-built snapshots (src/engine/testing/fixtures.ts); nothing checks that mappers.ts produces those shapes from real rows (e.g. `picked_up`→`pickedUp`, `stroke_index`→`strokeIndex`, numeric `base_hcp` strings → Number)',
  ],
  impact: 'The engine can be perfect and the board still wrong: a mapper typo, a paging off-by-one past 1,000 score rows (a 60-player field) or a stale reload overwriting a newer one would ship green and surface as wrong standings or money on the day.',
  recommendation: 'Unit-test the pure parts now: mappers (row fixtures captured from a real backup JSON → snapshot → computeTournament equals the fixture-built result), fetchAll with a fake builder (0, 999, 1000, 1001, 2500 rows), snapshotCache with fake-indexeddb, and the store\'s seq guard with a fake Supabase client (two overlapping reloads, the older resolving last, must not win). Add a golden «backup → snapshot → state» test using a scrubbed copy of the Ensayo backup.',
  effort: 'M',
  repro: 'cd panel/evidence/QA/repo && npx vitest run --config vitest.coverage.config.ts --coverage.enabled=true; ROOT=$PWD node ../cov-by-dir.mjs coverage/coverage-summary.json → src/data 19.1%; per file in ../coverage-data-lib.txt.',
})

add({
  title: 'None of the ~6,900 lines of SQL (164 functions, 146 SECURITY DEFINER, all RLS) is tested in CI; the only behavioural tests run by hand against production with the service-role key',
  severity: 'P1', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    '`wc -l supabase/migrations/*.sql` → 6,894 lines; parser over the latest definitions → 164 functions, 146 SECURITY DEFINER (panel/evidence/QA/all-migrations.sql)',
    '.github/workflows/ci.yml:25-30 runs only npm ci + scripts/preflight.sh (typecheck, lint, vitest, build) with a placeholder Supabase URL; no database is started',
    'scripts/rls-test.mjs (~180 checks: tenancy, PIN lockout, score reasons, groups/tiebreaks, restore, identity, WHS in SQL, social, crews, push) and scripts/platform-test.mjs (73 checks) need SUPABASE_SECRET_KEY and create/delete real auth users on the production project (rls-test.mjs:14-24, 36-55); both exit 1 here (panel baseline logs)',
    'The only SQL checks in CI are static regexes over migration text (src/lib/platformGuard.test.ts, src/lib/backupTables.test.ts), which cover the platform_* functions and the backup table list, not behaviour',
    'The authenticated e2e scripts also run in production: e2e/profile.mjs:2,47 signs up real addresses on a throwaway mail.tm inbox, so each run sends real Supabase Auth mail through the production Resend SMTP (`rate_limit_email_sent` 60, CLAUDE.md §3, shared with players signing in)',
    'Feasibility, measured on the panel\'s local harness (Postgres 16 + Supabase stubs): all 24 migrations replay unmodified from zero in 0.85 s median (0.83/0.85/0.91 s, panel/evidence/QA/replay-timing.txt); 16 RLS/tenancy checks run in 0.09 s (panel/evidence/QA/pg-selftest.log); the 25 shared WHS cases of src/engine/profile/cases/whs.json run against the SQL functions in milliseconds with 0 mismatches (panel/evidence/QA/whs-parity.sql) — the SQL half of that parity check currently runs only inside rls-test.mjs against production',
  ],
  impact: 'round_results, the WHS/Polo index, rivalries, publish_tournament_results, restore_tournament, duplicate_tournament and every RLS policy change can regress with a green CI. The team\'s own evidence that they work is a PR description saying «rls-test: green», run from one laptop against production.',
  recommendation: 'Add a CI job that starts Postgres (service container or `supabase start`), applies supabase/migrations from zero, and runs SQL tests (pgTAP, or the rls-test.mjs checks pointed at the local stack). Start with tenancy (a device linked to A reads nothing of B), claim_player lockout, admin_save_score reason rule, restore_tournament round-trip, and a WHS golden shared with src/engine/profile/cases/whs.json. Stop running destructive tests against production.',
  effort: 'L',
  repro: 'cat .github/workflows/ci.yml (no database step); node scripts/rls-test.mjs → «Missing … SUPABASE_SECRET_KEY»; grep -c "security definer" supabase/migrations/*.sql.',
})

add({
  title: 'Schema changes reach production before review and merge, with no staging database, no replay-from-zero check, no drift detection and no rollback path',
  severity: 'P1', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    'PR #57, #58, #59, #60 bodies: «migration 0021/0022/0023/0024 (already applied to production)» — applied before the PR was merged',
    'scripts/db.mjs:20-35 — applies any file not recorded in public._migrations by filename only (no checksum), straight to the one project; a migration edited after it ran is never re-applied and nothing notices',
    'public._migrations is created by the script (db.mjs:21), not by a migration (and audit-2026-09-28 P1 39 found it without RLS)',
    '.env.example: previews and production share VITE_SUPABASE_URL (one project, gmohwledjejlhcwqjnhd), so a preview of a schema change can only work after the change is live for everyone',
    'App rollback is shallow and decoupled from the schema: Vercel list_deployments marks only the two latest production deployments as `isRollbackCandidate: true` (379ed52, db220f8); rolling the app back never rolls a migration back',
    'No down migrations and no rollback procedure: `grep -niE "rollback|revert|versión anterior" RUNBOOK.md docs/handoff.md` → nothing; the RUNBOOK\'s only release rule is «no se despliega nada a main mientras hay una ronda en juego» (RUNBOOK.md:47), which nothing enforces',
  ],
  impact: 'An abandoned or reverted PR leaves its schema in production; a migration that breaks the live app (a trigger, a policy) is discovered by users, and the fix is another hand-applied migration. During the trip, a hotfix migration would be written and applied to the only database on the day.',
  recommendation: 'Use Supabase branching or a second free project as staging; CI applies migrations from zero on every PR (and fails on any edit to an applied file via a checksum column); production migrations are applied by a workflow after merge, gated on green; write a forward-fix/rollback note per migration; freeze migrations from a week before the trip.',
  effort: 'M',
  repro: 'Read PR #60 body («already applied to production»); read scripts/db.mjs:20-35; check .env.example for a single VITE_SUPABASE_URL.',
})

add({
  title: '`main` is unprotected: nothing requires `check` to pass before merge, and allowed tools push around the pre-push hook — every push to main deploys to production',
  severity: 'P1', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'partly fixed (audit-2026-09-28 P2 tooling: a git-level hook exists and the regex is broader, but the GitHub write tools still bypass it and the hook is not installed by default)',
  evidence: [
    'GitHub API list_branches → `{"name":"main", "protected": false}` (every branch unprotected)',
    '.claude/settings.json allows `mcp__github__*` (covers push_files, create_or_update_file, delete_file, merge_pull_request); the PreToolUse hook matches only Bash `git push` (scripts/prepush-guard.sh:10-13)',
    '.githooks/pre-push needs `git config core.hooksPath .githooks`; `git config --get core.hooksPath` in this clone → not set',
    'CLAUDE.md §3: Vercel production branch is `main`, deployed on every push. Vercel does not wait for CI: production deployment dpl_Gucv6ydes… for 379ed52 was created at 2026-09-30T01:58:51Z, the same second the `check` run on main started (finished 01:59:53Z); same for 23fd27b (deploy 16:27:10Z, CI 16:27:10–16:28:15Z) (Vercel list_deployments + panel/evidence/QA/ci-runs.json)',
    'It already happens: 23fd27b «handoff: what Diego should try after the UX overhaul» is a direct commit on main\'s first-parent history with no PR (`git log --first-parent 379ed52`), and it was deployed to production (dpl_76jAfHdsAE3aYc8NLPGaCTu9msy2), contrary to CLAUDE.md §0.4.1 «never push to it directly»',
    'CI history: 187 runs, 185 success, 2 cancelled, 0 failures (panel/evidence/QA/ci-runs.json) — the gate has never been exercised against a red build',
  ],
  impact: 'A red commit (or a direct file edit through the GitHub API) can reach golf.cardigan.mx with no check at all, including during the tournament days.',
  recommendation: 'Protect main: require the `check` status (and a future e2e/SQL job), require PRs, block force pushes; move mcp__github__push_files / create_or_update_file / delete_file to `ask`; run `git config core.hooksPath .githooks` from the setup script; add a Vercel deployment check so production promotion waits for GitHub checks; declare a change freeze for 8–11 April 2027 in RUNBOOK.md.',
  effort: 'S',
  repro: 'GitHub MCP list_branches owner=cardiganapps-ui repo=Cardi-Golf → main protected:false; `git config --get core.hooksPath` → empty; grep mcp__github__ .claude/settings.json.',
})

add({
  title: 'No end-to-end or browser test runs in CI; the core flow is guarded by one manual smoke script against live Ensayo, and the per-PR Playwright checks quoted in PR bodies were never committed',
  severity: 'P1', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    '.github/workflows/ci.yml has one job (`check` = preflight); `npm run e2e` (e2e/smoke.mjs) is never invoked by CI; e2e/profile.mjs and e2e/platform.mjs need SUPABASE_SECRET_KEY',
    'PR bodies cite ad-hoc runs that are not in the repo: #60 «Playwright on the /admin/_ fixtures at 360 and 1280 px: 24/24», #51 «19 checks in a real Chromium», #52 «9 checks», #54 «every list measured flush»; `grep -rl scrollWidth e2e scripts` finds none of them',
    'Production defects shipped through a green CI and were verified afterwards with uncommitted scripts: #43 «/api/push-dispatch crashed in production (500)» (nothing executes the functions), #56 blank white page on iPhone (the fix was verified by hand with Playwright and a hung /auth/v1/** route; that script is not in the repo), #51 the leaderboard read «Día 1 [object Object]» for every player (no component or browser test renders the board)',
    'CI: 0 failed runs out of 187 (panel/evidence/QA/ci-runs.json)',
  ],
  impact: 'Every release depends on someone remembering to run a script by hand against the shared rehearsal tournament. Regressions in the Tarjeta, the gate, the auction console or the money screens are found by the owner on his phone.',
  recommendation: 'Commit a Playwright suite that runs in CI against `vite preview` with VITE_DESIGN_ROUTES=1 fixtures (no network): Tarjeta save/undo/tiebreak, leaderboard change after a save, Dinero totals, auction console, TV, no horizontal scroll at 360/393/1280, no page errors. Run the live smoke against Ensayo on a schedule and before each release, not only by hand.',
  effort: 'M',
  repro: 'cat .github/workflows/ci.yml; `git show 26e2317 --stat` (the production 500); PR #56 and #51 descriptions.',
})

add({
  title: 'The smoke test\'s assertions are largely tautological and it is built on flaky patterns: 7 of 20 checks are `check(true)`, «round 1 is live» passes whatever round is live, and «hole saved» passes when the write is still pending',
  severity: 'P2', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'partly fixed (audit-2026-09-28 P2 tooling: the Ensayo guard exists since #28, e2e/ is linted)',
  evidence: [
    'e2e/smoke.mjs:67,79,97,110,133,189,194 — `check(true, …)`: they only prove the previous waitForSelector did not throw',
    'e2e/smoke.mjs:71-79 — «round 1 is live» is `check(true)` whether or not any round is live and whichever it is; during this review Ensayo\'s live round is «Día 2, grupo 3» (docs/review/2026-09-30/shots/t_tarjeta-ensayo-15pro-light-qa-undo-lost.png), which the check would still report as «✓ round 1 is live»',
    'e2e/smoke.mjs:98 — «hole saved» accepts «pendiente» as well as «Sincronizado», so a write that never reaches the server passes; :105 «leaderboard shows the scorer group» checks that a first name appears anywhere in the page, which is true before the save',
    'Flaky patterns: 8 fixed `waitForTimeout` (1.5 s, 2 s, 0.8 s ×5, 1.2 s); state drifts across runs (comments at :71 and :82 «repeat runs», strokes nudged up/down every run); 30 lines of Spanish `text=` selectors; it restores a backup into the shared rehearsal tournament (:163-174), so two concurrent runs (or a rehearsal) collide',
  ],
  impact: 'The one end-to-end test can pass while the promise it names («enter a score, see the leaderboard change», §4) is broken, and it can fail for reasons unrelated to the code (timing, someone else\'s run), which trains people to ignore it.',
  recommendation: 'Assert outcomes, not arrival: read the hole\'s server row after save (wait for «Sincronizado» only), capture the player\'s points before and after and assert the delta, assert the live round number from the page. Replace fixed sleeps with waits on state (`expect.poll`, `waitForResponse`). Give each run its own throwaway tournament (duplicate Ensayo, run, delete) instead of mutating the shared one. Prefer role/testid selectors over Spanish copy.',
  effort: 'S',
  repro: 'grep -n "check(true" e2e/smoke.mjs (7 lines); grep -c waitForTimeout e2e/smoke.mjs (8); open /t/ensayo/tarjeta → «Día 2».',
})

add({
  title: 'Screens are 0% covered and there is no component-test setup, so the Tarjeta\'s own rules (unusual-value confirm, the snake tiebreak prompt, reason on signed cards, undo) have no automated test',
  severity: 'P2', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    'Coverage: src/screens/* 0 lines of 13,166 (admin 0/3,829, tournament 0/3,449, profile 0/2,421, platform 0/2,143, organizer 0/1,179); src/components 1.6% (panel/evidence/QA/coverage-by-dir.txt)',
    'vite.config.ts test.environment `node`, no jsdom/happy-dom, no @testing-library in package.json',
    'src/screens/tournament/ScorecardScreen.tsx:236-270 — validate() (strokes ≥ 10, putts ≥ 5), the tiebreak prompt when 2+ players reach the threshold, the reason sheet when an admin edits a signed card, and the undo (:313-323) are component logic with no test; the e2e smoke never triggers any of them',
    'A rendering defect reached users for this reason: PR #51 «the leaderboard\'s per-day sub-line … every player read "Día 1 [object Object]"»',
  ],
  impact: 'The flows that decide whether a hole is saved correctly on the course are protected only by manual testing; every UI refactor (six redesign slices in three days) re-risks them.',
  recommendation: 'Add a jsdom project to vitest with @testing-library/react; extract the Tarjeta\'s save decision (validate → reason → tiebreak → commit) into a pure function and test it exhaustively; render GroupCard with a fixture snapshot and assert the tiebreak sheet appears for two 3-putts and the undo writes the previous values. Add a render-smoke test that mounts every route with each fixture and fails on console errors or «[object Object]» in the text.',
  effort: 'M',
  repro: 'ROOT=... node panel/evidence/QA/cov-by-dir.mjs coverage/coverage-summary.json → src/screens/* 0.0%; grep -n "environment" vite.config.ts; grep testing-library package.json → none.',
})

add({
  title: 'The serverless routes and their auth gate are untested (0 of 317 lines); a production 500 in /api/push-dispatch shipped through a green CI',
  severity: 'P2', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    'Coverage: api/backup-cron.ts 0/71, api/course-search.ts 0/75, api/push-dispatch.ts 0/42, api/scorecard-extract.ts 0/96, src/server/auth.ts 0/33 (panel/evidence/QA/coverage-data-lib.txt)',
    'commit 26e2317 «Fix /api/push-dispatch»: «The route crashed in production (500): src/lib/noticeText.ts imported the i18n module without an extension»; the fix changed tsconfig.api.json, but still nothing imports or executes a handler in CI',
    'src/server/auth.ts:29-45 (401 without a bearer token, 403 unless can_manage_courses) and :13-26 (per-IP rate limit) guard the paid Anthropic route; api/backup-cron.ts is the only code holding the service-role key; none has a test for its refusal paths',
  ],
  impact: 'An auth regression on /api/scorecard-extract would let anyone spend the Anthropic balance; a broken backup-cron would stop the only whole-database backup, noticed only if someone reads Salud; a broken push route fails silently for every notification.',
  recommendation: 'Unit-test each handler with a fake VercelRequest/Response: missing/invalid bearer → 401/403 before any upstream call (assert the Anthropic/fetch mock was not called), oversized body → 413 JSON, rate limit after N calls, backup-cron refuses without CRON_SECRET and never returns data. Add a CI step that bundles api/ the way Vercel does (e.g. `vercel build` or esbuild with node16 resolution) and imports each handler.',
  effort: 'M',
  repro: 'cat panel/evidence/QA/coverage-data-lib.txt | grep -E "^api|src/server"; git show 26e2317 | head -20.',
})

add({
  title: 'CI measures nothing beyond pass/fail: no coverage report or threshold, no bundle budget, no accessibility or Lighthouse check, lint warnings never fail, and the placeholder Supabase env keeps every network path dark',
  severity: 'P2', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    'No coverage provider in package.json (the panel had to install @vitest/coverage-v8 in a copy to measure 26.9% lines overall: engine ≈94%, src/data 19.1%, src/lib 74.3%, screens/api 0%)',
    'Build passes with the 1,069.46 kB main chunk (gzip 342.78 kB) and Rollup\'s >500 kB warning; dev-only chunks (DesignScreen 38.3 kB, platformFixtures, socialFixtures) are emitted in the production build ($S/baseline/preflight.log)',
    'Lint: 12 react-refresh warnings accepted as «the 12-warning baseline» in PR bodies; eslint is not run with --max-warnings',
    'No axe/pa11y/Lighthouse step although Lighthouse on prod `/` scores Perf 77, TBT 480 ms (baseline) — nothing would flag a regression',
    '.github/workflows/ci.yml:28-30 VITE_SUPABASE_URL=https://example.supabase.co, so no test touches a real or local backend',
  ],
  impact: 'Quality can only degrade silently: a 200 kB dependency, a test deletion, an a11y regression or a slower first load all merge green.',
  recommendation: 'Add @vitest/coverage-v8 with per-directory thresholds (engine and src/data/outbox ≥ 95% branches, never decreasing), a size-limit budget on the entry chunk and total precache, `eslint --max-warnings 0`, an axe pass over the fixture routes in the Playwright job, and Lighthouse CI on the preview URL with budgets for LCP/TBT.',
  effort: 'M',
  repro: 'grep coverage package.json → none; grep -n "max-warnings" package.json → none; $S/baseline/preflight.log shows the chunk warning and exit 0.',
})

add({
  title: 'The service worker and the update flow are untested: push handling, badge and click routing, and the «don\'t reload mid-hole» deferral that fixed an earlier P0 have no test',
  severity: 'P2', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new (the fix for audit-2026-09-28 P0 13 has no regression test)',
  evidence: [
    'src/main.tsx:16-21 — onNeedRefresh offers the reload only when `useOutbox.getState().editing` is false; the flag is set in ScorecardScreen.tsx (drafts ≠ initial); no test covers either side (src/main.tsx and src/app/* 0% coverage)',
    'public/push-sw.js (push → showNotification + setAppBadge; notificationclick → focus/navigate) has no test; it is imported with a manual `?v=1` cache-buster (vite.config.ts importScripts) that nothing checks is bumped',
    'No test asserts the precache manifest contents (fonts, logo, index.html) that the offline shell (§8) depends on',
  ],
  impact: 'A change to the update prompt could again reload phones mid-hole (the original P0), and a push regression would go unnoticed until a player asks why he got no notice.',
  recommendation: 'Extract the update decision into a pure function (needRefresh × editing → offer now / defer) and unit-test it; add a Playwright test that registers the built SW, simulates an update while the Tarjeta is dirty and asserts no reload; test push-sw.js handlers with a minimal ServiceWorkerGlobalScope mock; assert the built precache includes the fonts and index.html and stays under budget.',
  effort: 'M',
  repro: 'grep -rn "editing" src/main.tsx src/screens/tournament/ScorecardScreen.tsx; ls src/**/*.test.* | grep -i -E "sw|main|update" → none.',
})

add({
  title: 'The §2 success criteria and the M3 acceptance test (4 phones at once, other phones updated in < 2 s, airplane-mode sync) have no automated measurement',
  severity: 'P2', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    'CLAUDE.md §2 «Other phones see a new score in under 2 seconds on 4G», «Entering one hole for a foursome takes under 10 seconds», «works fully offline and syncs later without losing anything»; §16 M3 «4 phones enter scores at the same time … Airplane-mode entry syncs correctly on reconnect»',
    'No test, script or CI job measures propagation latency or runs concurrent writers; e2e/smoke.mjs uses one browser context; scripts/simulate.mjs writes with the service key, not through the outbox',
    'This panel\'s probe had to build its own network hold (panel/evidence/QA/e2e/undo-race.mjs) to exercise a slow write',
  ],
  impact: 'The properties that make or break the day are verified by feel on a few phones; QA-01 shows a concurrency defect in exactly this area that no existing test would find.',
  recommendation: 'Add a Playwright job with 4 browser contexts on a throwaway tournament: each saves a hole, the others must show it within 2 s (record p50/p95); one context goes offline (`context.setOffline`), saves 3 holes, corrects one during the drain, reconnects; assert the server rows equal the final local values. Run it nightly against a staging project and before the trip against Ensayo.',
  effort: 'M',
  repro: 'grep -rn "setOffline\|newContext" e2e scripts → only single-context scripts.',
})

add({
  title: 'The golden money test is a 950-line snapshot of whatever the engine returned when it was written, not an independently worked result',
  severity: 'P3', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    'src/engine/golden.test.ts:1-5 «The snapshot was written before the games/pots foundation landed»; src/engine/__snapshots__/golden.test.ts.snap (950 lines) was created in b9924c6 and never hand-checked',
    'In the mutation run it never kills a mutant alone (M01 and M18 are also killed by hand-worked tests); a refactor that changes a number produces a 950-line diff that `vitest -u` accepts in one keystroke',
    'By contrast src/engine/handCalc.test.ts pins hand-worked numbers with the arithmetic in comments — the right model',
  ],
  impact: 'Low today, but as the only «whole tournament» pin it invites approving snapshot updates without checking money.',
  recommendation: 'Replace the snapshot with explicit expectations for the ~20 numbers that matter (each prize line and every person\'s net), derived by hand like handCalc.test.ts, or keep the snapshot but add a CI rule that fails when a .snap changes without a «money-change» label on the PR.',
  effort: 'S',
  repro: 'git log --format=%h -- src/engine/__snapshots__/golden.test.ts.snap → b9924c6 only; wc -l the .snap → 950.',
})

add({
  title: 'Test nits: a Day-2-cut test re-implements the rule instead of calling the engine, and a hand-calculation comment contradicts its own assertion',
  severity: 'P3', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'partly fixed (audit-2026-09-28 P2: the pick-up assertion is now correct, the old comment remains)',
  evidence: [
    'src/engine/core/handicap.test.ts:62-67 — «PH1 16, P1 42 → PH2 13» is computed in the test as `Math.max(0, 16 - nextRoundCut(42, CUT).value)`; the engine\'s own application (compute.ts:126) is tested separately in compute.test.ts',
    'src/engine/handCalc.test.ts:101-102 asserts the pick-up counts the setting (39), while the comment at :104 says the pick-up «counts the entered 2»',
  ],
  impact: 'Minor: misleading documentation of the rules for the next reader.',
  recommendation: 'Assert PH2 through computeCore (as compute.test.ts does) and delete the duplicate; fix the comment.',
  effort: 'S',
  repro: 'sed -n 60,68p src/engine/core/handicap.test.ts; sed -n 99,105p src/engine/handCalc.test.ts.',
})

add({
  title: 'design/shots keeps 64 MB of screenshots in git and is still growing',
  severity: 'P3', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'still open (audit-2026-09-28 P2 tooling: 58 MB then, 64 MB / 527 files now)',
  evidence: ['`du -sh design/shots` → 64M; `git ls-files design | wc -l` → 527'],
  impact: 'Every CI checkout and clone downloads them; history only grows.',
  recommendation: 'Move screenshots to an artifact store or Git LFS; keep only a small curated set in the repo.',
  effort: 'S',
  repro: 'du -sh design/shots',
})

add({
  title: 'No automated dependency updates or audit in CI: 13 major versions behind, and nothing would flag a vulnerable or abandoned package',
  severity: 'P3', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    '.github/ holds only workflows/ci.yml and keepalive.yml: no dependabot.yml or renovate config',
    'Baseline `npm outdated`: eslint 10, @eslint/js 10, eslint-plugin-react-hooks 7, react-router 8, typescript 7, vite 8, vitest 5, motion 13 and others behind by a major ($S/baseline/npm-outdated.txt); `npm audit` is run by nobody (0 vulnerabilities today, $S/baseline/npm-audit.txt)',
    'npm ci warns «eslint@9.39.5: This version is no longer supported» ($S/npm-ci.log)',
  ],
  impact: 'Upgrades pile up into a risky big-bang right before the trip, or a security fix is missed.',
  recommendation: 'Enable Dependabot (weekly, grouped minor/patch, majors separate) and an `npm audit --omit=dev --audit-level=high` step in CI; freeze dependencies from March 2027.',
  effort: 'S',
  repro: 'ls .github; cat $S/baseline/npm-outdated.txt',
})

add({
  title: 'The nightly whole-database backup has never been restored: there is no restore script, no drill and no runbook step for it',
  severity: 'P2', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    'CLAUDE.md §3 (Backups): «Verified end to end: 26 tables → 86 KB object → read back from R2» — read back, never restored',
    '`grep -rln "json.gz\\|backups/\\|R2_BACKUP" scripts api src` → api/backup-cron.ts (the writer), src/lib/backupTables.ts (+ its test), scripts/platform-test.mjs:401 and src/dev/platformFixtures.tsx:251 (fake `backup_runs` rows for the Salud panel); nothing reads an object back or restores it',
    'RUNBOOK.md §8 (:71-73) covers only the per-tournament JSON export from Comité › Datos; nothing on the R2 copy',
    'The per-tournament restore is exercised only by e2e/smoke.mjs:163-174 against the shared Ensayo, by hand',
  ],
  impact: 'If the Supabase project is paused, corrupted or a migration destroys data during the trip, the only whole-database copy has an untested format and no procedure; recovery would be improvised on the day.',
  recommendation: 'Write scripts/restore-backup.mjs (download a night\'s object, load it into a fresh database built from supabase/migrations), run it monthly and in the pre-trip checklist against a scratch project or the local harness, assert row counts and that computeTournament on the restored Ensayo equals the live one, and add the steps to RUNBOOK.md.',
  effort: 'M',
  repro: 'grep -rn "backups/" scripts api src; sed -n 71,73p RUNBOOK.md',
})

add({
  title: 'CI tests on Node 22 while Vercel builds the app and runs the functions on Node 24.x',
  severity: 'P3', verdict: 'CONFIRMED', area: 'Testing and delivery', status: 'new',
  evidence: [
    '.nvmrc → 22 (used by ci.yml `node-version-file`); package.json engines `>=22`',
    'Vercel get_project prj_8JpqrzlqS3ZkYJB8JPlb35EvC9ZU → `"nodeVersion": "24.x"`',
    'Same class of drift already hurt once: the production 500 in /api/push-dispatch (#43, 26e2317) came from CI type-checking api/ under different module settings («bundler») than Vercel runs («node16»)',
  ],
  impact: 'A runtime difference (ESM resolution, fetch, crypto, sharp binaries) can pass CI and fail in production functions or the Vercel build.',
  recommendation: 'Pin one version everywhere: set Vercel to 22.x or .nvmrc/engines to 24 and run CI on the same; add the api bundle/import step from QA-14 on that version.',
  effort: 'S',
  repro: 'cat .nvmrc; Vercel MCP get_project idOrName=prj_8JpqrzlqS3ZkYJB8JPlb35EvC9ZU teamId=team_0rR9OfIKmnJ8xFDrOXUkHcT3 → nodeVersion 24.x',
})

const out = process.argv[2]
fs.writeFileSync(out, JSON.stringify(F, null, 2) + '\n')
console.log(`wrote ${F.length} findings to ${out}`)
