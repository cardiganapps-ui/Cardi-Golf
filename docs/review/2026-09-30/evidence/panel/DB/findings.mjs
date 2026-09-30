// Source of truth for $S/panel/DB.findings.json. Run: node findings.mjs
import { writeFileSync } from 'node:fs'

const S = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad'
const E = '$S/panel/evidence/DB'

const F = []
const add = (x) => F.push(x)

add({
  id: 'DB-01',
  title: "The Supabase keep-alive workflow fails every day: its ping gets 401 'Secret API key required'",
  severity: 'P1',
  verdict: 'CONFIRMED',
  area: 'Data layer and database',
  status: 'new',
  evidence: [
    '.github/workflows/keepalive.yml:20-28 — GET $SUPABASE_URL/rest/v1/ with the publishable key, then `[ "$code" = "200" ]`',
    "curl -H 'apikey: sb_publishable_…' -H 'Authorization: Bearer sb_publishable_…' https://gmohwledjejlhcwqjnhd.supabase.co/rest/v1/ → 401 {\"message\":\"Secret API key required\",\"hint\":\"Only secret API keys can be used for this endpoint.\"} (3 of 3 tries, 2026-09-30)",
    "GitHub Actions: both runs of keepalive.yml so far concluded 'failure' (run 36466368136 on 2026-09-28, run 36601036402 on 2026-09-29); job log: 'REST responded 401' then 'Process completed with exit code 1'",
    "What actually keeps the project awake is the Vercel backup cron (vercel.json crons '0 9 * * *'), which reads every table with the secret key; CLAUDE.md §3 ('M0 adds a GitHub Actions cron that pings it daily') and RUNBOOK.md §0 ('el cron diario lo mantiene vivo') rely on the ping; Vercel Hobby keeps runtime logs 1 h (get_runtime_logs over 7 d: 'No logs found … Hobby 1h'), so there is no outside record that the cron ran",
    'Working replacement verified: POST /rest/v1/rpc/app_flags with the same publishable key and body {} → HTTP 200 {"maintenanceBanner": null, "newAccountsPaused": false, "newTournamentsPaused": false} (a real query)',
  ],
  impact:
    "The documented safety net against the free project pausing (7 idle days, supabase.com/pricing) does not work and has never worked. If the backup cron also stops (a missing env var, CRON_SECRET rotation, a Hobby cron hiccup), nothing touches the database, the project pauses, and on 9 April the twelve phones open to errors until someone with Diego's Supabase login restores it (RUNBOOK §5.3). Meanwhile a red scheduled workflow emails the owner daily, which trains everyone to ignore the one alarm that matters.",
  recommendation:
    "Ping something that reaches Postgres through the anon role: `curl -fsS -X POST $SUPABASE_URL/rest/v1/rpc/app_flags -H 'apikey: …' -H 'Authorization: Bearer …' -H 'Content-Type: application/json' -d '{}'` and assert 200 plus a JSON body. Add an independent alarm on backup_runs (no ok row in 36 h → notify via Avisos or an uptime monitor). Test: run the same curl in CI on every PR so a broken ping is red before merge.",
  effort: 'S',
  repro:
    "K=sb_publishable_AfdMuv4UnxfuskCeC-JCJw_iuEJB6sK; curl -s -o /dev/null -w '%{http_code}\\n' -H \"apikey: $K\" -H \"Authorization: Bearer $K\" https://gmohwledjejlhcwqjnhd.supabase.co/rest/v1/  → 401. Then https://github.com/cardiganapps-ui/Cardi-Golf/actions/workflows/keepalive.yml → every run failed.",
})

add({
  id: 'DB-02',
  title: 'restore_tournament (0020) silently stopped restoring side-game entrants, hole awards and bet results, which 0011 restored',
  severity: 'P1',
  verdict: 'CONFIRMED',
  area: 'Data layer and database',
  status: "regressed (0011's restore coverage was lost in 0020; the transactional RPC itself still fixes audit-2026-09-28 P0-10)",
  evidence: [
    'supabase/migrations/0011_games.sql:131-133, 143-144, 164-166, 187-189, 236-241 — restore_tournament carries game_entries, hole_awards and game_results through the temp tables, tenant and reference checks, the wipe and the re-insert',
    "supabase/migrations/0020_teams.sql:141-148 — 'This is 0010's function with teams and team_members added'; it was rebuilt from 0010, not 0011: `grep -c 'game_entries\\|hole_awards\\|game_results' supabase/migrations/0020_teams.sql` → 0",
    'src/data/backup.ts:21-22 — the in-app backup still exports game_entries, game_results and hole_awards; the RPC receives them and ignores them, and returns only {players, rounds, scores}, so the Comité sees success',
    "scripts/rls-test.mjs:302-304 — the only test ('restore brings back entrants, hole awards and results') never changes those rows between backup and restore, so it passes against the broken function; it counts rows and never checks hole_awards.group_id; it last changed on 2026-09-28, before 0020",
    'git log: 0011 in b9924c6 (2026-09-28) → 0020 in 5c7068f (2026-09-29, #51)',
    `Harness drill (${E}/restore-drill.sql → restore-drill.out): backup of panel-t12 built as the organizer through RLS in backup.ts's shape; then 3 entrants removed, bet winner changed J3→J4, a hole award deleted, a score changed; restore_tournament as the organizer (statement_timeout 8s, 791 ms). Result: score restored; game_entries 8 → 5 NOT RESTORED; game_results J3 → J4 NOT RESTORED; hole_awards 'h3:J1:grupo h3:J5:grupo h7:J2:grupo' → 'h3:J1:COMITE h3:J5:COMITE' NOT RESTORED`,
    `Control (${E}/restore-drill-0011.out): the same drill against 0011's function body (renamed restore_tournament_0011) restores all four rows exactly`,
  ],
  impact:
    'Restoring a tournament that has instance games (every Ronda rápida with the Más cerca / Skins / Birdies chips, any side pot or custom bet) keeps the current entrants and bet results instead of the backup\'s, so buy-ins and payouts differ from the state the Comité restored to, while the app reports success. Hole-contest claims survive with group_id = NULL, i.e. as Comité rulings (DB-03). Nacho\'s tournament has games: [] today, so its restore is unaffected until someone adds a side game.',
  recommendation:
    "New migration: restore_tournament = 0020's body plus 0011's three tables (temp tables, tenant and reference checks, wipe hole_awards before groups are deleted, re-insert after groups). Stop hand-maintaining the list: a vitest that reads the last `create or replace function public.restore_tournament` in supabase/migrations and fails when any table in backup.ts BY_TOURNAMENT/BY_ROUND/BY_LOT (+ group_members, team_members) is missing from it. Make rls-test mutate every table after the backup and assert exact equality after restore, including hole_awards.group_id.",
  effort: 'S',
  repro: `$S/pg/bootstrap.sh <db>; psql … -d <db> -f ${E}/seed.sql; psql … -d <db> -f ${E}/restore-drill.sql → the last table prints NOT RESTORED for game_entries, game_results and hole_awards. Control: load 0011_games.sql lines 95-259 renamed to restore_tournament_0011 and run restore-drill-0011.sql → all restored.`,
})

add({
  id: 'DB-03',
  title: "Deleting a group turns its players' hole-contest claims into Comité rulings (hole_awards.group_id ON DELETE SET NULL)",
  severity: 'P1',
  verdict: 'CONFIRMED',
  area: 'Data layer and database',
  status: 'new',
  evidence: [
    'supabase/migrations/0011_games.sql:30 — hole_awards.group_id references groups(id) ON DELETE SET NULL',
    'src/engine/games/contest/index.ts:62-64 — `const comite = rows.filter((a) => a.groupId == null)`: a group-less row is the Comité\'s decision and overrides every group claim',
    'src/data/api.ts:570-579 (adminSetAwards) — "group-less rows override the groups\' claims"; clearing a Comité decision deletes every group-less row for the hole',
    'supabase/migrations/0010_admin_safety.sql:141 (upsert_groups deletes groups missing from the new list) and 0020_teams.sql:244 (restore deletes every group of the tournament) both trigger the SET NULL',
    `Harness (${E}/groups-drop.out): hole 3 disputed between J1 (grupo 1) and J5 (grupo 2); the organizer saves round 1's groups without group 2 through upsert_groups → J5's row becomes COMITE, so the engine now pays J5 the hole outright with no ruling`,
    `Harness (${E}/restore-drill.out): after a restore every surviving claim is COMITE`,
  ],
  impact:
    'After a restore, or after the Comité removes a group in Grupos, every claim that group made becomes a field-wide Comité ruling. A later "Quitar decisión del Comité" deletes those players\' claims too, and a group that re-answers the hole is overruled by its own former claim. Money in hole contests (Ronda rápida\'s Más cerca, custom contests) moves without anyone deciding it: in the drill a disputed hole became a win for J5 only because group 2 was dissolved.',
  recommendation:
    "Make the Comité's rulings explicit instead of encoding them as NULL: add hole_awards.source ('group' | 'comite') (or a separate comite_awards table), change the FK to ON DELETE CASCADE for group claims, and have restore wipe/re-insert hole_awards (DB-02). Engine: comite = rows.filter(a => a.source === 'comite'). Test: delete a group with claims and assert no Comité ruling appears.",
  effort: 'M',
  repro: `psql … -d <db> -f ${E}/groups-drop.sql (after seed.sql): prints the claims before (grupo 1 / grupo 2) and after (J5: COMITE); rolled back.`,
})

add({
  id: 'DB-04',
  title: 'The Comité cannot rule a disputed hole contest for a player a group already claimed: hole_awards PK has no group_id, so the insert hits 23505',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Data layer and database',
  status: 'new',
  evidence: [
    'supabase/migrations/0011_games.sql:36 — primary key (round_id, game_id, hole, player_id): one row per player per hole, whoever wrote it',
    'src/data/api.ts:572-579 — adminSetAwards deletes only group-less rows, then inserts {group_id: null, player_id} for each chosen winner; if a group already claimed that player the insert collides with the claim',
    "src/engine/games/capture.test.ts:44-51 — the engine test resolves a dispute by pushing award(3,'p3',null) next to award(3,'p3','g2'), a pair of rows the database can never hold",
    `Harness (${E}/awards.out), as the organizer through RLS: hole 3 claimed J1 (grupo 1) and J5 (grupo 2); delete group-less rows → DELETE 0; insert (group_id null, J5) → ERROR: duplicate key value violates unique constraint "hole_awards_pkey"`,
  ],
  impact:
    "The normal way to settle a Más cerca dispute (two groups claim different winners, the Comité picks one of them) fails with a raw 'duplicate key value violates unique constraint \"hole_awards_pkey\"'. The only way through is to choose «Nadie» first (which deletes every claim) and then the winner, which nobody will guess. Hole-contest money stays unpaid on the board until someone finds that trick.",
  recommendation:
    "Fix the model (DB-03): with a `source` column, make the PK (round_id, game_id, hole, player_id, source) or move rulings to their own table; or have adminSetAwards run in an RPC that upserts with ON CONFLICT (…) DO UPDATE SET group_id = null. Replace the engine test's impossible fixture with one that goes through the RPC.",
  effort: 'S',
  repro: `psql … -d <db> -f ${E}/awards.sql (after seed.sql) → ERROR: duplicate key value violates unique constraint "hole_awards_pkey"; rolled back.`,
})

add({
  id: 'DB-05',
  title: 'Realtime subscriptions have no tournament filter, and DELETE events reach every subscriber of the table across tournaments (RLS does not apply to deletes)',
  severity: 'P2',
  verdict: 'PLAUSIBLE',
  area: 'Reliability, offline and realtime',
  status: 'new',
  evidence: [
    "src/data/tournamentStore.ts:268-274 — `ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => reload())` for 20 tables, no `filter`; the handler ignores the payload and reloads the whole snapshot for ANY event",
    'supabase.com/docs/guides/realtime/postgres-changes: "RLS policies are not applied to DELETE statements, because there is no way for Postgres to verify that a user has access to a deleted record"; "You can only filter Delete events … if the table has the replica identity set to full"; "Postgres Changes authorizes every event against each subscriber"',
    `${E}/rt-listen.mjs — an anonymous client with only the public key (no sign-in, member of nothing) subscribes to all 20 tables and gets SUBSCRIBED`,
    'supabase/migrations/0003_rls.sql:172-175, 0011_games.sql:90 — the published tables; no replica identity changes anywhere (grep "replica identity" → none), so a DELETE payload carries the primary key columns',
    `Negative control (${E}/rt-listen.log): the anonymous listener, subscribed from 02:48 UTC, received 0 events while the reliability panel wrote Ensayo scores at ~03:00-03:03 and ~03:43-03:47 — INSERT/UPDATE are correctly filtered by RLS; no DELETE happened on production in the window, so the DELETE path rests on Supabase's documentation above`,
    'Deletes in normal use: outbox award push (outbox.ts:239 delete-then-insert), adminSetAwards, setGameResults, createLots, deleteBid, setBuyback(0), reopenLot, unsignCard, upsert_groups (group_members, groups, tiebreaks), save_draw (pairs), restore_tournament, deleteRound / deletePlayer / deleteTournament cascades',
  ],
  impact:
    "Every connected phone of every tournament receives the platform's DELETE stream (primary keys of other tenants' rows) and answers each burst of them with a full 23-request snapshot reload (the 150 ms debounce coalesces a burst); deleting one finished 60-player tournament emits ~2,000 DELETE events to every connected phone, each counted against the free plan's 2 M Realtime messages a month. Anyone with the public key can watch it. It also contradicts §7's tenant boundary ('a device linked to one tournament reads nothing from another').",
  recommendation:
    "Filter every subscription by tournament: tables with tournament_id get `filter: 'tournament_id=eq.<id>'`; for round-scoped tables add a tournament_id column (denormalized, set by trigger) or move to Realtime Broadcast from a trigger (`realtime.broadcast_changes` on topic tournament:<id>, private channels with RLS on realtime.messages) — Supabase's recommended pattern for scale. In the handler, ignore events whose payload's tournament/round is not this tournament. Test: two tournaments, delete a row in B, assert A's client does not reload.",
  effort: 'M',
  repro: `Run ${E}/rt-listen.mjs (NODE_USE_ENV_PROXY=1 node rt-listen.mjs): it logs event type, table and key names only. Any DELETE anywhere on the platform shows up although the client belongs to no tournament.`,
})

add({
  id: 'DB-06',
  title: 'teams and team_members are not in the supabase_realtime publication, so a team draw never reaches other phones live',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Reliability, offline and realtime',
  status: 'new',
  evidence: [
    "src/data/tournamentStore.ts:201-202 — the client subscribes to 'teams' and 'team_members'",
    "supabase/migrations/0020_teams.sql — creates both tables and never runs `alter publication supabase_realtime add table`; `grep -n publication supabase/migrations/*.sql` → only 0003:172 and 0011:90",
    "Harness: pg_publication_tables for supabase_realtime → 18 tables (calcutta_bids … tournaments), no teams, no team_members; every published table has replica identity 'd'",
  ],
  impact:
    "When the Comité saves or renames teams (scramble / team formats), players' phones keep the old teams until some other table changes or they reopen the app; boards and money by team are stale in the meantime. The subscription itself succeeds (verified: SUBSCRIBED), so nothing tells anyone.",
  recommendation:
    'Migration: `alter publication supabase_realtime add table public.teams, public.team_members;`. Add a test that parses migrations and asserts every table in REALTIME_TABLES is published (and vice versa).',
  effort: 'S',
  repro: "Harness: select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1 → no teams/team_members.",
})

add({
  id: 'DB-07',
  title: 'No disaster recovery: the free plan has no Supabase backups, and the nightly R2 dump has no restore path, no accounts, no files and has never been restored',
  severity: 'P1',
  verdict: 'CONFIRMED',
  area: 'Data layer and database',
  status: 'new',
  evidence: [
    'supabase.com/pricing (Free): "Automatic backups: Not included", "PITR: Not included", "Log retention: 1 day"',
    "api/backup-cron.ts:62-66, src/lib/backupTables.ts — the dump is public.* only: no auth.users / auth.identities (every profile, organizer, device_sessions and platform_admins row has an FK to auth.users), no storage objects (logos, avatars, scorecard photos in bucket tournament-assets), no Vault secrets",
    "Nothing reads it back: `grep -rln 'R2_\\|backups/\\|json.gz' scripts/ api/` → only api/backup-cron.ts; RUNBOOK.md has no step for it (§5 covers paper cards and un-pausing; §8 is the per-tournament JSON from Comité › Datos)",
    'api/backup-cron.ts:21-31 — each table is paged with separate HTTP requests (no snapshot), so a dump taken while someone writes is not guaranteed consistent across tables',
    "The per-tournament restore (restore_tournament) cannot use it either: it needs the app's per-tournament shape, courses are never restored, and it drops the instance-game tables (DB-02)",
    'Rebuilding the schema in a new project with anything but scripts/db.mjs fails at 0010 (DB-22)',
  ],
  impact:
    "If the project is lost or corrupted (a bad migration run straight on production — DB-09 —, an accidental tournament delete by an owner, an org/billing mishap), the tournament's scores exist only as a gz JSON nobody has ever loaded. Rebuilding would mean creating a new project, replaying 24 migrations, hand-creating auth users with the same uuids (or dropping every FK to auth.users), writing an importer on the spot, and re-uploading images from nowhere — during a trip, with real money pending. The Comité's per-tournament JSON is the only realistic recovery, and only if someone downloaded it that night.",
  recommendation:
    "Before April: (1) write scripts/restore-r2.mjs that loads a nightly dump into a fresh project or a local Postgres in FK order (auth.users stubs for referenced uids first) and run it as a drill, recording the time; (2) add auth.users (id, email, is_anonymous, created_at) and storage.objects metadata to the dump, and copy the bucket to R2; (3) for April, either upgrade to Pro for daily backups/PITR (a money decision for Diego) or run the dump hourly during the trip; (4) take the dump inside one repeatable-read snapshot (a single SQL function returning jsonb, or pg_dump via the pooler) instead of 49 independent page reads. Put the drill in the runbook.",
  effort: 'M',
  repro: 'grep -rn "backups/" scripts api → only the writer. Read RUNBOOK.md §5/§8: no R2 restore. supabase.com/pricing → Free: no automatic backups.',
})

add({
  id: 'DB-08',
  title: 'The nightly dump holds every player PIN in a form that falls to brute force in minutes (bcrypt of a 4-digit PIN)',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Security and privacy',
  status: 'new',
  evidence: [
    "src/lib/backupTables.ts:16-17, 40 — player_pins, pin_attempts and profile_link_tokens are in BACKUP_TABLES; api/backup-cron.ts writes them to R2 with the rest",
    "supabase/migrations/0002_functions.sql:255-259 — the PIN is `^[0-9]{4}$`, stored as crypt(p_pin, gen_salt('bf', 8)): 10,000 candidates against bcrypt cost 8",
    'The online guard (5 per device, 15 per player, migrations 0010/0013) does not exist offline',
  ],
  impact:
    "Anyone who gets one backup object (a leaked R2 key — the handoff already lists R2 keys pasted into chat that still need rotating — or a copied file) recovers every player's PIN for every tournament in minutes on a laptop, and can then sign in as any player and enter scores in their name.",
  recommendation:
    'Leave player_pins, pin_attempts and profile_link_tokens out of the dump (a restored project re-issues PINs from Comité › Jugadores), or encrypt the dump with a key that is not stored next to the R2 credentials (age/GPG public key in the cron, private key offline). Rotate the R2 keys listed in docs/handoff.md.',
  effort: 'S',
  repro: "grep -n 'player_pins\\|pin_attempts\\|profile_link_tokens' src/lib/backupTables.ts; grep -n \"gen_salt('bf', 8)\" supabase/migrations/0002_functions.sql",
})

add({
  id: 'DB-09',
  title: 'Migrations run on a database for the first time in production: no CI replay, no staging project, no reversible path, and the DB tests only run by hand against production',
  severity: 'P1',
  verdict: 'CONFIRMED',
  area: 'Testing and delivery',
  status: 'new',
  evidence: [
    '.github/workflows/ci.yml:25-29 and scripts/preflight.sh — CI runs typecheck, lint, vitest and build with a placeholder Supabase URL; no Postgres, no migration replay, no SQL test',
    'scripts/db.mjs:22-38 — `migrate` applies each new file straight to the one project (gmohwledjejlhcwqjnhd) through the Management API; there is no other environment (docs/handoff.md: the org has no free slot for a second project)',
    'scripts/rls-test.mjs and scripts/platform-test.mjs need SUPABASE_SECRET_KEY and create throwaway users and tournaments on production; they are not in CI (baseline: both exit 1 here)',
    "No down migrations anywhere; several are one-way (0010:301-314 deletes duplicate payments; 0015:66 flips counts_for_stats for 'ensayo%'); scripts/db.mjs records only the file name (no checksum), so a later edit of an applied file would be silently skipped (git shows none so far)",
    'DB-02 is exactly the kind of defect a replay + restore round-trip in CI would have caught the day it was written',
  ],
  impact:
    'Every schema change is tested for the first time on the database that will hold the April tournament. A migration that fails halfway is rolled back by the transaction wrapper, but one that succeeds and is wrong (DB-02) ships silently, and there is no rollback other than writing a new migration by hand under pressure.',
  recommendation:
    "Add a CI job: `services: postgres:16` (or `supabase start`), apply the stubs + every migration exactly as scripts/db.mjs does, run splinter, and run a SQL/pgTAP suite (RLS matrix from rls-test.mjs rewritten to use `set request.jwt.claims`, a backup→mutate→restore round trip, the trigger cascade and a two-session race). The shared review harness in $S/pg shows it takes minutes to set up. Record a checksum in _migrations and refuse to run if an applied file changed. For risky migrations, write the reverse script next to it and test both in CI.",
  effort: 'M',
  repro: 'cat .github/workflows/ci.yml scripts/preflight.sh (no database step); node scripts/rls-test.mjs → exits 1 without the production secret key.',
})

add({
  id: 'DB-10',
  title: 'Each hole saved makes every phone in the tournament re-download the whole tournament up to four times (sequential upserts, 150 ms debounce, 23-request reload)',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Performance',
  status: 'new',
  evidence: [
    'src/data/outbox.ts:270-274 — flush pushes queued items one HTTP request at a time; a foursome\'s hole is 4 separate upserts (outbox.ts:231-233), i.e. 4 transactions and 4 Realtime events',
    'src/data/tournamentStore.ts:270-274 — every event restarts a 150 ms timer, then reload(); on 4G each upsert round trip is typically longer than 150 ms, so the four events usually trigger separate reloads',
    'src/data/tournamentStore.ts:121-172 — reload() = 1 + 8 + 11 + 3 = 23 REST requests in three waves (22 when the tournament has no teams), re-reading every score, hole, group and payment of the tournament',
    "Production corroboration by the reliability panel on Ensayo ($S/panel/evidence/REL/logs/latency-fixed.log): for each hole saved on phone A, A's four pushes completed at e.g. [829, 1211, 2138, 3580] ms and phone B ran 2-4 full reloads (bReloadsTriggered) = 44-88 REST requests (bRestRequests) per hole",
    'Every scores row read goes through scores_read → is_tournament_member(round_tournament_id(round_id)), SECURITY DEFINER SQL functions that cannot be inlined, evaluated per row (see DB-11 for the measured cost)',
  ],
  impact:
    'With 16 phones, one hole saved costs up to 16 × 4 × 23 ≈ 1,500 API requests and re-reads the whole scores table each time; three groups finishing holes together is thousands of requests a minute on the free plan\'s shared-CPU instance, and every phone burns battery and data on a golf course with weak signal. It also stretches the "under 2 s" target, because the last of the four events arrives ~4 RTTs after the first.',
  recommendation:
    "Send a hole as one request: `.upsert([4 rows], { onConflict: 'round_id,player_id,hole' })` (one transaction, one statement-level trigger, events arrive together). On receipt, apply the Realtime payload to the snapshot (upsert the row by key) instead of reloading everything; keep a full reload only on reconnect/visibility. Debounce trailing ~400 ms with a max wait.",
  effort: 'M',
  repro: 'Read the lines cited; the harness timing for one scores read under RLS is in DB-11.',
})

add({
  id: 'DB-11',
  title: 'Any client can overwrite a group mate\'s hole without the discrepancy flag: entered_by is client-asserted, and DELETE + INSERT skips the detector',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Data layer and database',
  status: 'new',
  evidence: [
    'supabase/migrations/0010_admin_safety.sql:473-474 — authenticated may insert/update entered_by directly',
    "0010_admin_safety.sql:443-449 — a dispute is flagged only when `new.entered_by is not null and new.entered_by is distinct from old.entered_by`; nothing checks entered_by = my_player_id(tid)",
    'src/screens/tournament/ScorecardScreen.tsx:278 — the client fills entered_by from me.playerId; any client (an old bundle, a script with the public key and a claimed device) can send the previous writer\'s id or null',
    `Harness (${E}/entered-by.out): J1's phone writes J3's hole 10 (5 strokes); J2's phone overwrites with 7 and entered_by = J1 → disputed = false, entered_by shows J1 (the audit_log actor is J2). Control: the same overwrite with entered_by = J2 → disputed = true`,
    'supabase/migrations/0010_admin_safety.sql:472 revokes only INSERT/UPDATE from authenticated; DELETE stays granted, and scores_write (0003:105, FOR ALL) lets a group mate delete a live, unsigned hole; the re-insert goes through scores_clean_insert, which resets disputed/previous',
    `Harness candidate verified ($S/pg/tests/scores-delete-bypass.sql on a seeded clone, ${E}/harness-candidates.out): upsert over another device's hole → disputed t with previous; the same change as DELETE + INSERT → disputed f, previous null (audit shows INSERT, DELETE, INSERT)`,
  ],
  impact:
    'A second phone can overwrite another group member\'s hole without the "discrepancia" flag by sending the first writer\'s id (or null), so the one mechanism meant to surface conflicting cards (§8) can be bypassed, and the Comité\'s view of who entered what is only as honest as the client. The audit log still has the real actor, so this is recoverable after the fact, not prevented.',
  recommendation:
    "In scores_clean_insert / scores_detect_dispute (non-Comité branch) set `new.entered_by := public.my_player_id(public.round_tournament_id(new.round_id))`; revoke DELETE on scores from authenticated (the app never deletes a score; the Comité has RPCs) or split scores_write into INSERT/UPDATE policies; on INSERT, compare with the audit log's last DELETE of the same key within the round and flag it. Tests: a player sending another player's id is overwritten with his own; a player's DELETE on scores is refused.",
  effort: 'S',
  repro: `psql … -d <db> -f ${E}/entered-by.sql (after seed.sql): prints disputed f for the spoofed write and t for the honest one; rolled back.`,
})

add({
  id: 'DB-12',
  title: 'Row-level security runs ~15 helper-function calls per row read (up to ~38 on other plans): a player\'s reload costs ~0.8 s of database time at 12 players and ~12 s at 60 (≈10 ms with set-based policies)',
  severity: 'P1',
  verdict: 'CONFIRMED',
  area: 'Performance',
  status: 'new',
  evidence: [
    'supabase/migrations/0003_rls.sql:104-113 — scores_read USING is_tournament_member(round_tournament_id(round_id)); scores_write is FOR ALL, so its USING clause is also OR\'d into every SELECT. The helpers are SECURITY DEFINER SQL functions (0002, 0013, 0021), which Postgres never inlines, so each is a separate per-row execution',
    `Harness plan (${E}/rls-cost.1.out), player of the 60-player tournament: Index Scan … Filter: (is_tournament_organizer(round_tournament_id(round_id)) OR (shares_group(round_id, player_id) AND round_is_live(round_id) AND NOT card_is_signed(round_id, player_id)) OR is_tournament_member(round_tournament_id(round_id)))`,
    `Function calls for the client's first scores page, each in a fresh backend (${E}/one.sh, pg_stat_xact_user_functions): 12 players, 324 rows → my_player_id 1,764 (5.4 per row), round_tournament_id 1,476; 60 players, 1,000 rows returned after evaluating all 1,620 → my_player_id 27,576 (17 per row), round_tournament_id 25,992, is_tournament_organizer_own 3,204, shares_group 1,620. Per-row cost grows with the number of groups because shares_group's join calls my_player_id per group_members row`,
    `Exact count for the client's own query (select * … order by id limit 1000, fresh backend, after ANALYZE): 12 players → 4,788 helper calls for 324 rows (14.8/row); 60 players → 26,244 calls for the 1,764 rows page 1 must evaluate before sorting (14.9/row); plan: Bitmap Heap Scan on scores_round_idx (only this tournament's rows) + Filter (is_tournament_organizer(round_tournament_id(round_id)) OR (shares_group(…) AND round_is_live(…) AND NOT card_is_signed(…)) OR is_tournament_member(round_tournament_id(round_id))), 2,897 ms`,
    `Timing (load average ≈ 2 on 4 CPUs): 12 players 357 ms; 60 players 4,684 ms for page 1 of 2. Earlier runs at load 8-13: same query as postgres without RLS 0.5-0.9 ms, as the player 3,100-3,300 ms (ordered by the index) — i.e. RLS is ~99.9% of the cost`,
    `The client's exact reload (${E}/snapshot-cost.mjs, same filters, ORDER BY and 1,000-row pages, as a PIN-claimed player, container load average ≈ 9): 12 players ≈ 780 ms of server time (scores 466 ms, holes 121 ms for 18 rows, group_members 35 ms); 60 players ≈ 12,800 ms (scores page 1: 6,522 ms, page 2: 5,458 ms — ordering by the random uuid id makes each page evaluate every row again)`,
    `Set-based alternative, measured (${E}/rls-fix.sql, rolled back): scores_read USING (round_id IN (SELECT r.id FROM rounds r WHERE is_tournament_member(r.tournament_id))) and write policies split into INSERT/UPDATE → same 1,620 visible rows, 8.7-11.3 ms, my_player_id called 32 times`,
    'holes and tees show the same shape: holes_write/tees_write are FOR ALL and call can_edit_course per row, which scans every round played on that shared course and runs is_tournament_organizer for each; the cost of reading a course grows with how many tournaments use it',
  ],
  impact:
    "Every phone's reload (DB-10) pays this. For Nacho's 12 players it is ~0.8 s of shared-CPU time per reload, multiplied by 16 phones and up to 4 reloads per hole saved: bursts of tens of CPU-seconds on the free plan's shared-CPU instance whenever groups finish holes together, so the '<2 s to other phones' target (§2) degrades exactly when it matters. At 60 players a single scores page is 3-6 s and flirts with the 8 s statement_timeout of the authenticated role (supabase.com/docs/guides/database/postgres/timeouts), so reloads start failing outright. Realtime's per-subscriber authorization of every change runs the same policy chain.",
  recommendation:
    "Rewrite the read policies set-based: USING (round_id IN (SELECT id FROM rounds WHERE tournament_id = ANY ((SELECT public.my_tournament_ids())))) with one STABLE SECURITY DEFINER function that returns the caller's tournament ids once per statement (Supabase's documented 'wrap in select' pattern); split every FOR ALL write policy into INSERT/UPDATE/DELETE so none is OR'd into SELECT (also clears splinter's multiple_permissive_policies); give holes/tees plain read policies. Order paged reads by the primary key that matches an index (scores: round_id, player_id, hole). Add a CI check: EXPLAIN ANALYZE of the snapshot queries as a player on a seeded 60-player tournament must stay under a budget (e.g. 50 ms each).",
  effort: 'M',
  repro: `$S/pg/bootstrap.sh <db>; psql -d <db> -f ${E}/seed.sql; psql -d <db> -f ${E}/rls-cost.sql (Execution Time + call counts); psql -d <db> -f ${E}/rls-fix.sql (same read, set-based, rolled back); node ${E}/snapshot-cost.mjs t60 dev60 (edit the DB name inside).`,
})

add({
  id: 'DB-13',
  title: "The audit trail loses cascaded deletes (logged with no tournament) and never records team draws, PIN resets, device claims or published money",
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Data layer and database',
  status: 'new',
  evidence: [
    'supabase/migrations/0021_platform_admin.sql:290-297 — audit_row resolves the tournament of a round-scoped row with round_tournament_id(round_id) / group_tournament_id(group_id); in a cascade the parent row is already gone, so it returns NULL',
    `Harness (${E}/audit-round-delete.out): the organizer deletes round 2 of the 12-player tournament (api.ts deleteRound) → audit_log gets 108 scores, 3 groups and 12 group_members DELETE rows with tournament_id NULL and 1 rounds row with it; the Comité's Historial (tournament_audit) shows just "rounds DELETE 1"`,
    `Harness (${E}/heavy.out): deleting the 60-player tournament writes 2,089 audit rows, 1,866 of them with tournament_id NULL (scores, groups, group_members, card_signatures, snake_tiebreaks, hole_awards, calcutta_bids, calcutta_buybacks)`,
    'Harness: tables with no audit trigger include teams, team_members, player_pins, device_sessions, tournament_results, tournament_money, course_documents, photos (query in DB.md §f). CLAUDE.md §5.10: "Every correction or override is logged with who, when, and why"',
  ],
  impact:
    "After someone deletes a round or a player by mistake, the Comité's history does not show which scores went, so the evidence needed to rebuild them is only reachable with SQL on production. A PIN reset followed by a new device claiming that player (which lets whoever holds the new PIN enter scores as him) leaves no trace, nor does a change of teams in a team format or the nets published to profiles.",
  recommendation:
    "Carry tournament_id on every tournament-scoped table (scores, groups, group_members, round_tees, card_signatures, snake_tiebreaks, handicap_overrides, hole_awards, calcutta_bids, calcutta_buybacks), filled by a BEFORE INSERT trigger; audit_row then reads it from the row itself. The same column fixes Realtime filtering (DB-05) and makes RLS set-based (DB-12). Add audit triggers on teams, team_members, device_sessions (who claimed whom) and tournament_results/tournament_money, and log set_player_pin as an audit row with no hash. Test: delete a round and assert tournament_audit returns its scores.",
  effort: 'M',
  repro: `psql … -d <db> -f ${E}/audit-round-delete.sql (after seed.sql) → Historial shows only the round; audit_log has 123 rows with tournament_id NULL; rolled back.`,
})

add({
  id: 'DB-14',
  title: 'Round results are rebuilt delete-then-insert with no lock: two writes to a finished round collide (23505), and a score saved while the round is being finished is left out of the results',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Data layer and database',
  status: 'new',
  evidence: [
    'supabase/migrations/0015_results.sql:154-156 — refresh_round_results: `delete from round_results where round_id = p_round`, then one INSERT per player; nothing serializes two refreshes of the same round',
    '0015_results.sql:278-292 — the score statement trigger refreshes only if its own snapshot already sees the round as finished; rounds_refresh_results (305-307) refreshes from the finishing transaction\'s snapshot',
    `Harness race (${E}/race-a.sql, race-b.sql → race-b.out): two admin_save_score calls on the same finished round 0.5 s apart → the second fails with 'duplicate key value violates unique constraint "round_results_pkey"' and its correction is lost (J4 hole 6 stays 5). The first transaction was held open 2 s to make the interleaving deterministic; in real use the window is the refresh itself (≈50-200 ms here)`,
    `Harness write skew (${E}/skew-score.sql, skew-finish.sql): a score (J5, hole 1: 5 → 9) in flight while «Terminar ronda» commits → scores row 9, round_results hole 1 still 5, and nothing refreshes it until the next write to that round or a publish`,
    "src/data/outbox.ts:252-254 — isPermanent() matches /violates/, so an admin phone's queued score that loses this race is moved to «rechazados» instead of being retried",
  ],
  impact:
    "At the end of a day the Comité finishing the round, correcting a card and an admin's phone flushing its last hole can overlap: one of them fails with a raw Postgres error (and, from the outbox, is parked as rejected), or the round's published history, the Polo index and rivalry results are silently computed without the last score until someone happens to touch the round again. Tournament money is unaffected (the engine reads scores), profile data is not.",
  recommendation:
    "Serialize per round: `perform pg_advisory_xact_lock(hashtextextended(p_round::text, 0))` at the top of refresh_round_results, and make the score trigger take `select status from rounds where id = … for share` before deciding (so a finish waits for in-flight score transactions and vice versa). Write results with INSERT … ON CONFLICT (round_id, player_id) DO UPDATE and delete only players no longer present. Add both interleavings to a two-session SQL test in CI. Treat 23505/40001/40P01 as retryable in the outbox.",
  effort: 'S',
  repro: `bootstrap a db, run seed.sql, then in two shells: psql -f ${E}/race-a.sql & psql -f ${E}/race-b.sql → B prints the round_results_pkey error. Skew: psql -f skew-score.sql & psql -f skew-finish.sql, then compare scores vs round_results.detail for J5 hole 1.`,
})

add({
  id: 'DB-15',
  title: '48 foreign keys have no index (some on RLS and cascade paths), while three redundant indexes are maintained for nothing',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: 'Data layer and database',
  status: 'new',
  evidence: [
    'Advisor-equivalent (local splinter run, $S/pg/lints/splinter-results.csv): unindexed_foreign_keys × 48, e.g. scores_player_id_fkey, scores_entered_by_fkey, snake_tiebreaks_group_id_fkey, card_signatures_pair_id_fkey, round_tees_tee_id_fkey, rounds_course_id_fkey, tournament_organizers_auth_user_id_fkey, device_sessions_tournament_id_fkey, rivalries_a_fkey/_b_fkey, friendships_b_fkey, hole_awards_group_id_fkey',
    "src/data/api.ts:100 (listMyTournaments: .eq('auth_user_id', uid)) and 0010:57 (policy tournament_organizers_read: auth_user_id = auth.uid()) filter on the unindexed column; can_edit_course (0021:188-199), evaluated per holes/tees row, scans rounds by the unindexed course_id",
    'Every player delete (deletePlayer, restore of a backup without him) seq-scans the whole scores table twice (cascade on player_id, SET NULL on entered_by), across every tournament on the platform',
    'The opposite problem too (harness catalog query in DB.md §f): scores_round_idx duplicates the leading column of scores_round_id_player_id_hole_key, payments_tournament_idx of payments_flow_key, teams_tournament_idx of teams_tournament_id_number_key — three indexes maintained on every write for nothing, one of them on the hottest table',
  ],
  impact: 'Negligible at today\'s few thousand rows; grows linearly with the platform (every tournament\'s scores share one table), and the policy-path ones multiply with DB-12.',
  recommendation: 'One migration: add the dozen that sit on policies, cascades or app filters (list above), drop the three redundant ones; leave audit-only FKs (created_by, decided_by). Keep splinter in CI so new FKs arrive with their index.',
  effort: 'S',
  repro: 'bash $S/pg/lints/run-lints.sh (or read splinter-results.csv) → name = unindexed_foreign_keys.',
})

add({
  id: 'DB-16',
  title: 'Advisor warnings left open: 92 multiple_permissive_policies, 16 auth_rls_initplan, 5 mutable search_path functions, a listable public bucket, 86 SECURITY DEFINER functions callable by anon',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Data layer and database',
  status: 'new',
  evidence: [
    'Advisor-equivalent (local splinter run on the 24 migrations, $S/pg/lints/splinter-results.csv, 405 results): WARN multiple_permissive_policies 92 (23 tables: every FOR ALL write policy overlaps its FOR SELECT policy — the cause of DB-12); WARN auth_rls_initplan 16 (courses, tees, holes, course_documents, device_sessions, organizers, profiles ×2, friendships, notifications, push_subscriptions, rivalries, rivalry_rounds, tournament_money, tournament_organizers); WARN function_search_path_mutable 5 (scores_clean_insert, scores_detect_dispute, slugify, touch_updated_at, tournaments_guard_protect); WARN public_bucket_allows_listing 1 (tournament-assets, policy assets_public_read); WARN anon_security_definer_function_executable 86 and authenticated_… 128; INFO rls_enabled_no_policy 9 (intended: pins, tokens, platform tables); INFO unindexed_foreign_keys 48 (DB-15)',
    'Among the anon-callable definers are internal helpers reachable at /rest/v1/rpc with only the public key: is_account_user(uuid), round_tournament_id / player_tournament_id / group_tournament_id / lot_tournament_id(uuid), card_is_signed, round_is_live, shares_group, my_player_id — none needs to be an API endpoint',
    'The live advisors (Security and Performance) could not be pulled: no SUPABASE_PAT here and the Supabase MCP is denied on this project',
  ],
  impact:
    "The performance warnings are the measured cost in DB-12. The listable bucket lets anyone enumerate every logo, avatar and scorecard path (object names include tournament ids). The anon-callable helpers let a stranger probe whether a uuid is an account or which tournament a player/round id belongs to — small leaks that add up with DB-05's DELETE stream.",
  recommendation:
    "Fix the two performance lints with DB-12's policy rewrite; `alter function … set search_path = public` on the five; replace assets_public_read with no SELECT policy (public URLs keep working); `alter default privileges in schema public revoke execute on functions from public, anon` and grant EXECUTE only to the RPCs the app calls. Run `supabase db lint` / splinter in CI and fail on new WARNs. Owner action to get the real advisors: Dashboard › Advisors (Security, Performance) or `curl -H 'Authorization: Bearer $SUPABASE_PAT' https://api.supabase.com/v1/projects/gmohwledjejlhcwqjnhd/advisors/security` (and /performance).",
  effort: 'M',
  repro: 'bash $S/pg/lints/run-lints.sh, then read splinter-results.csv grouped by name/level.',
})

add({
  id: 'DB-17',
  title: 'Re-applying an old migration by hand (the documented `db.mjs file` path) succeeds and silently downgrades live definitions; 10 of 24 files cannot be re-run at all',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: 'Data layer and database',
  status: 'new',
  evidence: [
    "scripts/db.mjs:5-6 documents `node scripts/db.mjs file path.sql` (run a file); nothing stops it from being an applied migration",
    'Harness idempotence report ($S/pg/idempotence.md, raw outputs in $S/pg/idem/): 0007, 0008, 0009 and 0012 re-apply without error and put back older bodies of audit_row(), scores_detect_dispute() and three storage policies; 0001-0003, 0010, 0011, 0013, 0015, 0016, 0018, 0019 fail on re-run (plain create/add without guards)',
    `Verified here ($S/pg/tests/rerun-0009-0012.sql on a seeded clone, ${E}/harness-candidates.out): after re-applying 0012 an account's own avatar upload is refused (42501); after re-applying 0009 a phone overwriting a Comité-corrected hole is no longer flagged and keeps the Comité's reason`,
    'No migration builds an index CONCURRENTLY (e.g. 0020:23-24, 0021:266); RUNBOOK.md §4 forbids deploys during a round but says nothing about `db.mjs migrate`, which is separate from deploys',
  ],
  impact:
    'A well-meant "re-run 0009 to be sure" during the trip would silently switch off the discrepancy flag or break avatar uploads, with no error to notice. Low likelihood, high confusion.',
  recommendation:
    'Make migrations re-runnable (if not exists / drop … if exists / guarded constraints) or move to the Supabase CLI migration history, which refuses to re-apply; have db.mjs refuse `file` on anything under supabase/migrations; add "no migrations during a round" to the runbook; CI applies the chain twice and diffs definitions (the harness does it in ~5 s).',
  effort: 'S',
  repro: '$S/pg/bootstrap.sh <db> --seed; psql -d <db> -f $S/pg/tests/rerun-0009-0012.sql → two "ok -" lines proving the downgrade (rolled back).',
})

add({
  id: 'DB-18',
  title: 'No production observability: no client error reporting, logs kept 1 hour (Vercel Hobby) and 1 day (Supabase Free), and no alert on a failed backup, a failed keep-alive or rejected phone writes',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Reliability, offline and realtime',
  status: 'new',
  evidence: [
    'package.json dependencies: no error-tracking or logging client (no Sentry/Bugsnag/PostHog/log drain); grep over src/ and api/ finds none',
    "Vercel get_runtime_logs for the project over 7 days → 'No logs found … Hobby 1h' (runtime-log retention one hour)",
    'supabase.com/pricing Free: "Log retention: 1 day"',
    'api/backup-cron.ts:34-45 records runs in backup_runs, visible only when someone opens Admin › Salud; the keep-alive failure (DB-01) goes to an email; pg_net keeps push responses 6 h (0024:305-317); outbox rejections live only in the phone\'s IndexedDB (src/data/outbox.ts:125-134)',
  ],
  impact:
    "If sync fails on three phones on the 10th, the team finds out when a player complains; by the time anyone looks, the Vercel logs are gone and Supabase's are going. Nobody is paged when the nightly backup stops. Diagnosing a money dispute after the trip has no server trail beyond audit_log.",
  recommendation:
    'Before April: a free-tier error tracker in the client and the API routes (sample 100% during the trip), with the outbox reporting rejections and repeated push failures; a daily health check (GitHub Action with the anon key) that calls an RPC summarizing backup_runs, disputes, pending tiebreaks and failed pushes and fails loudly; for the trip dates, Vercel/Supabase log drains or at least a pinned Admin › Salud check in the runbook each morning.',
  effort: 'M',
  repro: 'Inspect package.json; query Vercel runtime logs for the project for any window older than 1 h (empty); open supabase.com/pricing.',
})

add({
  id: 'DB-19',
  title: "The runbook's outage plan covers a paused project and paper cards, not a Supabase outage on Calcutta night, who can act, or how to restore data",
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Reliability, offline and realtime',
  status: 'new',
  evidence: [
    'RUNBOOK.md §5 "Si la app se cae": paper cards; §5.3 un-pause from the Supabase dashboard (needs a member of the Supabase org; CLAUDE.md §3 and the handoff name only Diego); §5.4 "Si Vercel está caído: el último respaldo JSON (sección 8) tiene todo; la liquidación se puede hacer a mano con el CSV"',
    'The auction console writes directly, not through the outbox (src/data/api.ts:439-480 createLots, placeBid, sellLot, setBuyback…), so Calcutta night has no offline path at all; the runbook has no paper fallback for the auction or for the Matrimonios draw',
    'An installed PWA keeps working when Vercel is down (cached shell, API on supabase.co), which the runbook does not say; it does not name status pages, who holds dashboard access on the trip, or what to do if Supabase is down but not paused',
    'No step restores anything but the per-tournament JSON from Comité › Datos (DB-02, DB-07)',
  ],
  impact:
    "If Supabase has an incident during the Thursday dinner, the Comité has no documented way to keep running the auction and settle before bed (§5.9), and the person who could un-pause or contact support may not be the one holding the phone. Improvising with real money on the table is exactly what the app exists to avoid.",
  recommendation:
    'Add to RUNBOOK.md: a printable auction sheet (lot order, bids, hammer, buybacks) and "enter it afterwards from the console"; who has Supabase/Vercel/Cloudflare access on the trip (at least two people); status.supabase.com / vercel-status; "installed app keeps working without Vercel"; the R2/JSON restore drill from DB-07 with its measured time. Rehearse one outage during the Ensayo (turn the network off for the auctioneer).',
  effort: 'S',
  repro: 'Read RUNBOOK.md §1, §5 and §8; grep src/data/api.ts for placeBid/sellLot (direct writes).',
})

add({
  id: 'DB-20',
  title: 'Paging infers "last page" from a short page with a hard-coded 1,000, and the shared course list is not paged at all',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: 'Data layer and database',
  status: 'partly fixed (audit-2026-09-28 P0-12)',
  evidence: [
    'src/data/paged.ts:5-18 — PAGE = 1000; `if (rows.length < PAGE) return out`: if the project\'s API "Max rows" is ever set below 1,000 (a dashboard setting), every paged read returns after its first page and truncates silently',
    "src/data/api.ts:308-311 listCourses — `from('courses').select(…, tees(id)).order('name')` with no range; courses_read (0003:38) lets every signed-in user read every course, so the picker silently stops at 1,000 courses (alphabetical)",
    'Fixed since the audit: tournamentStore.fetchSnapshot and backup.ts page every table by its primary key (tournamentStore.ts:121-172, backup.ts:39-45); api/backup-cron.ts pages with Range headers',
  ],
  impact: 'Nothing today; a quiet truncation later (a dashboard change, or the course catalog growing with every Ronda rápida) that would show wrong boards or a missing course with no error.',
  recommendation: "Ask PostgREST for `count=exact` (or read Content-Range) and page until `to >= total`; page listCourses (or search server-side). Unit-test fetchAll with a fake server capped at 500.",
  effort: 'S',
  repro: 'Read the cited lines; set a fake page size of 500 in a unit test of fetchAll → it returns 500 of 1,200 rows.',
})

add({
  id: 'DB-21',
  title: 'A correction on a finished round rebuilds every player\'s results and replays every linked profile\'s index and rivalries twice',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: 'Performance',
  status: 'new',
  evidence: [
    '0015_results.sql:154-225 — refresh_round_results deletes all of the round\'s results and re-inserts one per player; 0016_social.sql:535-542 — the DELETE statement trigger recomputes every profile, then each per-player INSERT statement recomputes that profile again',
    `Harness (${E}/write-cost.out; one session, so each case's counts are taken net of the previous one): one admin_save_score on the finished round of the 12-player tournament → refresh_round_results 1, recompute_profile_index 24, recompute_rivalries_of 24, notify 12, 47 ms; on the 60-player one → 1 refresh, 120 index recomputes, 120 rivalry replays, 195 ms`,
    'By contrast a player\'s live-round upsert is 87 function calls and 15.9 ms with every trigger (audit 1.7 ms)',
  ],
  impact: 'Fine for 12 players; wasteful work that grows with linked profiles and rivalries, and it widens the race window in DB-14.',
  recommendation: 'Refresh only the changed player\'s row (the score trigger knows player_id) with an upsert; recompute each affected profile once per statement (collect ids, then recompute), or defer to a queue drained once per transaction.',
  effort: 'S',
  repro: `psql -d <db> -f ${E}/write-cost.sql (after seed.sql) — read the pg_stat_xact_user_functions rows (run each case in its own session for exact counts).`,
})

add({
  id: 'DB-22',
  title: 'The migration chain only applies through scripts/db.mjs: 0010 and 0024 need public._migrations, which no migration creates',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: 'Data layer and database',
  status: 'new (harness candidate PG-C3, re-verified)',
  evidence: [
    'supabase/migrations/0010_admin_safety.sql:645-646 alters public._migrations; 0024_platform_ops.sql:339 reads it; the table is created only by scripts/db.mjs:21',
    `Verified here: a fresh database with the Supabase stubs, then each migration with \`psql -1 -f\` → "stopped at 0010_admin_safety.sql: … :645: ERROR: relation \"public._migrations\" does not exist" (${E}/nomig.err)`,
  ],
  impact: 'Rebuilding the database anywhere else (a new project after a disaster, Supabase branching, `supabase db push`, a CI job) fails at 0010 unless someone remembers the preamble — exactly when nobody has time to (see DB-07).',
  recommendation: 'Create the table inside the chain (a 0000_migrations.sql, or `create table if not exists public._migrations …` at the top of 0001); better, adopt the Supabase CLI migration history. The CI replay in DB-09 keeps it honest.',
  effort: 'S',
  repro: '$S/pg/tests/no-migrations-table.sh, or: createdb x; psql -d x -f $S/pg/stubs.sql; for f in supabase/migrations/*.sql; do psql -d x -1 -f $f || break; done → stops at 0010.',
})

export default F

if (import.meta.url === `file://${process.argv[1]}`) {
  const ids = new Set()
  for (const f of F) {
    if (ids.has(f.id)) throw new Error('dup ' + f.id)
    ids.add(f.id)
    for (const k of ['id', 'title', 'severity', 'verdict', 'area', 'status', 'evidence', 'impact', 'recommendation', 'effort', 'repro']) if (!(k in f)) throw new Error(`${f.id} missing ${k}`)
  }
  writeFileSync(`${S}/panel/DB.findings.json`, JSON.stringify(F, null, 2) + '\n')
  const by = {}
  for (const f of F) by[f.severity] = (by[f.severity] ?? 0) + 1
  console.log(F.length, 'findings', by)
}
