# Polo (formerly Cardi-Golf)

> **Name (2026-09-28):** the product is called **Polo**. Every user-facing string, the wordmark, the PWA name and the icon say Polo. Infrastructure keeps the old name on purpose: the repo `cardiganapps-ui/Cardi-Golf`, the Vercel project `cardi-golf`, the Supabase project and org, the R2 bucket, the `golf.cardigan.mx` / `cardi-golf.vercel.app` hosts, and client storage keys (`cardi-golf:*`, the `cardi-golf-outbox` IndexedDB) so no device loses its session or unsynced scores. Where the text below says "Cardi-Golf" about the product, read Polo.

## Build brief for Claude Code

> **Para Diego:** el repo, este archivo, el CI y el candado de pre-push ya están listos. Abre una sesión de Claude Code en este repo y escribe: *"Lee CLAUDE.md completo y empieza por la sección 19."* Lo que solo tú puedes hacer está en `docs/handoff.md`.

**Cardi-Golf is a platform for running amateur golf tournaments among friends**: live scoring, side games, a Calcutta auction, money tracking and settlement. Any organizer can create a tournament, configure its rules, and run it from phones and a TV.

**Nacho's Bachelor Invitational (Los Cabos, 12 players) is the first tournament it will run.** It is the launch customer and the acceptance test, not the product. Sections 2 and 5–18 describe that tournament in full detail, because a concrete first customer is how you know the platform is complete; section 0.5 says how to read them so the result stays generic.

---

## 0. Operating rules (read before anything else)

These four rules decide how Claude works in this repo. The rest of the file (sections 1–19) is the product brief.

### 0.1 Autonomy: standing permission
Diego has given standing permission for everything this project needs, **except the two carve-outs below**. Don't stop to ask before any of these:
- Creating and changing the Supabase project's schema, RLS, functions, and auth settings.
- Creating the Vercel project, setting its env vars, and deploying previews.
- Installing dependencies.
- Creating branches, opening PRs, and merging them once `check` is green.
- Running the simulator and seeding the **Ensayo** tournament.

The carve-outs, which always need Diego's explicit yes:
1. **Anything that costs money:** a paid plan, an add-on, a domain.
2. **Deleting or overwriting real tournament data:** anything in the real tournament, as opposed to Ensayo.

Two more rules:
- **Report what you did.** Acting without asking is fine; acting silently is not. Every reply ends with what changed, what's live, and what's next.
- **Permission is not product direction.** When a *rule* or *design* is genuinely ambiguous, ask. Do that only after checking section 5, section 18, and `docs/handoff.md`, and never ask twice about the same thing.

`.claude/settings.json` allows every tool by default (Bash, file reads anywhere, edits in the repo, `/home/user`, `/tmp` and `/root/.claude`, the Supabase / Vercel / GitHub / Claude Code Remote / Docs connectors, and the built-in agent, task, skill and artifact tools) so Diego is never asked for routine work (2026-09-28: he asked for no permission prompts at all). Each connector is listed three ways: by server name, as `mcp__<server>__*`, and by the names of the tools that still prompted at the end of a milestone (2026-09-29: `send_later`, the PR subscriptions, `delete_trigger`, the GitHub PR tools). Gmail is deliberately not allowed: sending mail is outward-facing. Some prompts come from the Claude app itself and ignore this file (seen 2026-09-29: `unsubscribe_pr_activity`, `delete_trigger`): avoid those calls (§0.4 step 6), and when one is unavoidable, Diego picks «Permitir siempre». Add a tool there rather than letting it prompt. The `ask` list there names the exceptions that always prompt — creating or pausing a Supabase project and every Vercel purchase — because they cost money or take something down. Don't move an item out of `ask`; force-push is denied outright.

### 0.2 `docs/handoff.md`: the only list Diego needs to read
Everything the project is waiting on a human for lives in `docs/handoff.md`. That covers clicks only he can make, data only he has, and decisions only he can take. Each item gets its exact steps and how you'll verify it.
- Read it before reporting anything as blocked.
- When an item is cleared, strike it through in the same commit.
- When something new needs Diego, add it there, not just in chat.
- Never ask Diego for something that isn't on that list.

### 0.3 Preflight: nothing broken reaches GitHub
- `scripts/preflight.sh` runs typecheck → lint → test → build: whichever of those `package.json` defines, with the exit code preserved.
- `.claude/settings.json` has a `PreToolUse` hook (`scripts/prepush-guard.sh`) that runs preflight before every `git push` and **blocks the push** if it fails.
- CI (`.github/workflows/ci.yml`, job `check`) runs the same script.
- A second workflow (`.github/workflows/e2e.yml`, job `e2e-fixtures`, 2026-10-01) runs the fixture browser suite (`npm run e2e:fixtures`, `e2e/fixtures/`): the real screens on the `/t/_/<fixture>` routes in Chromium with no network. Every main screen at 375 and 393 px (TV and Ceremonia at room sizes) must have no uncaught error, no horizontal scroll and no serious or critical axe violation, and the flows the 2026-09-30 review found broken are replayed at human speed. It runs on ready (non-draft) PRs that touch the app, and on main; a red `e2e-fixtures` blocks a merge like a red `check`.
- A third workflow (`.github/workflows/db.yml`, job `db`, 2026-10-03) proves every migration before it reaches production (`scripts/db-test.sh`, harness in `supabase/tests/harness/`). On Postgres 16 with Supabase's stubs it replays the whole chain from zero twice, by a plain psql loop and by `scripts/db.mjs migrate`, exactly as production gets it. It checks that `db.mjs` refuses a migration edited or removed after it ran and one run again by hand (`file`), since `_migrations` keeps each file's sha256. It runs every `supabase/tests/*.sql` on the two-tenant seed, sends every request in `src/data/testing/cases/serverRules.json` to the migrations (`scripts/server-rules.mjs`), and holds Supabase's advisors at `lint-baseline.json`. The same cases run in Vitest against the in-memory server the outbox's tests use (`src/data/testing/serverRules.test.ts`), so that server's rules are the database's: when a migration changes a rule the phone meets, change the case, then the fake (QA-06, 2026-10-03). It runs on ready PRs that touch the database or its scripts, on main and nightly; a red `db` blocks a merge. `node scripts/db.mjs check` says what `migrate` would apply, without changing anything.
- A fourth workflow (`.github/workflows/e2e-stack.yml`, job `e2e-stack`, 2026-10-08) runs the stack suite (`npm run e2e:stack`, `e2e/stack/`, `playwright.stack.config.ts`): the real app against a real local Supabase (`supabase start` with `supabase/config.toml` and a pinned CLI; db, auth, rest and realtime only), two browser contexts as two phones, on throwaway tournaments that `e2e/stack/seed.sql` makes before every run. A hole saved on one phone must show on the other in under 2 s (every save is timed, and the times land on the run's summary). Holes saved offline must arrive when the signal returns. A lapsed session must keep its queued holes without a new anonymous sign-in (REL-16). One hole must change the leaderboard to exactly the values the seed gives (QA-12). It refuses any Supabase or database that is not local. It runs on ready PRs that touch `src/data`, `src/lib`, `supabase`, `api`, the Scorecard or the suite itself, nightly on main, and by hand; a red `e2e-stack` blocks a merge like a red `check`.
- The hook also refuses any push to `main` and runs the preflight in the tree being pushed (`cd <dir> && git push`, `git -C <dir> push`), so a worktree's push is checked against itself (QA-10, 2026-10-01). A second PreToolUse hook (`scripts/mcp-main-guard.py`) refuses the GitHub MCP write tools (`push_files`, `create_or_update_file`, `delete_file`) on `main`. A SessionStart hook sets `core.hooksPath .githooks`, whose `pre-push` refuses `main` and runs the preflight for any git client. A worktree that symlinks `node_modules` is safe: `.gitignore` ignores `node_modules` as a file too.
- Don't weaken or bypass either one. If the hook blocks you, fix the code.
- Never judge a check by output piped through `tail` or `grep`, because a pipe swallows the exit code.
- `npm test` measures `src/data/outbox.ts`'s coverage and fails below the thresholds in `vite.config.ts` (QA-06): raise them when a test covers more, never lower them to pass.
- When M0 adds `package.json`, define exactly those four scripts, plus `"preflight": "bash scripts/preflight.sh"`.

### 0.4 Shipping loop: branch → PR → watch → green → merge
1. Work on a `claude/<topic>` branch. `main` is what Vercel deploys to production, so never push to it directly.
2. Open a PR per milestone, or per coherent chunk. Then **subscribe to its activity** (`subscribe_pr_activity`) so CI failures and review comments wake you.
3. **Drive it to green yourself:**
   - A red `check` is your work now: find the root cause, fix, and push. "Flake" is not a root cause, and never skip or disable a test.
   - Address every review comment, or reply saying why not.
4. Merge once `check` is green, then send Diego (in Spanish):
   - The Vercel preview/production URL.
   - What to try.
   - What comes next.
5. If you can schedule a check-in (`send_later`), keep one armed about an hour out while a PR is open, and stop once it's merged.
6. **Don't clean up after a merge.** A merged PR unsubscribes the session by itself, and a check-in that fires after the merge just finds nothing to do. So never call `unsubscribe_pr_activity` or `delete_trigger` on the way out. The Claude app asks Diego before both, whatever `.claude/settings.json` says (2026-09-29).

### 0.5 Platform, not a one-off: how to read the rest of this brief
Everything from section 2 on is written for the first tournament. Build it so the *second* tournament needs zero code changes. Concretely:

- **A tournament is a row, not a deploy.** `tournaments` is the root of everything; every other table hangs off it (directly or through `rounds`/`players`). An organizer creates a tournament in the app, and one deployment hosts many. The "Ensayo" rehearsal (§13, §17) is simply another tournament.
- **Rules are settings, games are modules.** Every number in section 5 (entry fee, allowance, cap, cut parameters, prize amounts, Calcutta shares, snake payout, tiers) is a value in `tournaments.settings` (§18 shows the first tournament's values; they are that tournament's defaults, not constants). Each side game (individual Stableford, best round, pairs "Matrimonios", snake "La Víbora", fewest putts, Calcutta) is an **engine module** that a tournament turns on or off and parameterizes. A tournament with only individual Stableford and no Calcutta must work. Add game *formats* (e.g. gross stroke play, match play) only when a tournament needs them, but leave the module seam so they slot in.
- **Field size, days, tiers and tees are data.** Don't hard-code 12 players, 2 days, 4 tiers of 3, or 18 holes per round. Tiers are a list the organizer defines (names + which pair with which); a tournament may have none. Rounds are 1..N. Groups are 2–4 players. The pairs game defines its own pairing rule (A↔D, B↔C is the first tournament's).
- **Names are copy, not code.** "Matrimonios", "La Víbora", "La Cuchara de Palo", "Rey del Birdie" are the first tournament's labels for generic concepts (pairs game, snake, last place, most-birdies award). Each module has a default label the organizer can rename per tournament. Code identifiers stay generic (`pairsGame`, `snake`, `lastPlace`, `mostBirdies`).
- **Brand per tournament.** Logo, name, tagline, and an accent color are tournament fields, shown on Entrar, headers, TV mode and share cards. The design tokens in §14 are the *platform's* look; `assets/nacho-logo.png` is the first tournament's logo (seeded into it, not baked into the shell). The groom flag (§5.1) becomes a generic "honoree" spotlight the organizer may or may not set.
- **Organizers have accounts; players don't need one.** Organizers sign in with email (Supabase Auth, magic link or password) and can create tournaments. Players keep the frictionless flow: tap your face, enter your PIN, no account. A player is a row inside a tournament; the same human in two tournaments is two rows (fine for v1). Players join a tournament by link or 6-character code.
- **Money model is generic.** Entries, prizes, auction purchases, buybacks and payouts are all `payments` rows with a `kind`; the settlement (§11) works for any set of enabled modules and any banker.
- **One engine, many configurations.** `computeTournament(snapshot, settings)` reads the enabled modules from `settings` and returns state only for those. The section-6 tests run against the first tournament's settings; add at least one test per module that proves it can be *disabled* (state absent, money unaffected) and a "minimal tournament" test (8 players, 1 round, individual Stableford only, no tiers).
- **Copy stays Spanish (Mexico) in v1.** The platform is built for Diego's circle first; keep strings in one place (`src/i18n/es-MX.ts`) so a second language is a file, not a refactor. Don't build the second language.
- **Scope discipline.** Generic ≠ bigger. Build exactly the modules and screens the first tournament needs, but built on tournament-scoped data, settings-driven rules and renamable labels. No marketplace, no billing, no public discovery, no multi-org roles beyond organizer / player.

When a later section says "the 12 players", "Nacho", "A/B/C/D", "$2,500", read it as "this tournament's players / honoree / tiers / entry fee".

---

## 1. Your role and how to work with Diego

You are the lead engineer and product designer for this app. Diego is the product owner.

- **Who Diego is:** a finance professional and non-technical founder. He built and shipped Cardigan (a production PWA) with Vite + React + Supabase + Vercel by following exact commands, SQL, and click paths. He is comfortable in GitHub, the Supabase dashboard, the Vercel dashboard, and a terminal when steps are explicit.
- **Do as much as you can yourself.** When Diego must act (create a project, log in, paste an env var, approve something), give numbered steps with one action each: the exact command or click path, and what he should see when it worked. Put those steps in `docs/handoff.md` (0.2).
- **Plan before code.** Your first reply is the plan described in section 19. Wait for his OK before building.
- **Work in milestones** (section 16). At the end of each one, deploy a Vercel preview and send Diego the URL, a short list in Spanish of what to try, and what comes next.
- **Language:** all app copy is Spanish (Mexico). Code, comments, and commits are in English. Diego is bilingual; talk to him in the language he uses.
- **Money and destruction:** ask before anything that costs money or deletes data. Never commit secrets.
- **Trust is the product.** Real money moves between friends based on these numbers. Every number in the app must be correct, reproducible, and explainable on tap.

---

## 2. The first tournament: what it must do

Twelve friends are playing a 2-day golf tournament in Los Cabos for Nacho's bachelor trip. There is a $30,000 MXN prize pot, several side games, and a Calcutta auction with its own pot. The app replaces paper cards, spreadsheets, and arguments. (Read with §0.5: everything here is one tournament's configuration of the platform.)

**Users**
- The organizer, who creates the tournament and configures it from a phone or laptop.
- The 12 players, on their phones on the course: bright sun, patchy signal, one hand free, a few beers in.
- The Comité (organizers), who set things up and correct mistakes.
- A TV at the dinner and at the villa, showing the auction and live boards.

**The app must**
1. Let each group enter strokes and putts hole by hole in seconds, even offline.
2. Compute every game live, exactly per section 5.
3. Show live leaderboards for every game, with "si terminara ahora" money next to each name.
4. Run the Calcutta auction at dinner: an auctioneer console plus a TV board.
5. Run the Matrimonios draw right after the auction.
6. Track all money (entries, prizes, Calcutta, buybacks) and produce the final settlement.
7. Deliver stats, fun awards, and a final ceremony mode.
8. Look and feel premium. It should dazzle.

**Success criteria**
- Zero scoring disputes: every number has a "¿Cómo se calculó?" breakdown.
- Other phones see a new score in under 2 seconds on 4G.
- Entering one hole for a foursome takes under 10 seconds.
- Score entry works fully offline and syncs later without losing anything.
- Installable PWA on iOS Safari and Android Chrome.
- The scoring engine is fully unit-tested against the cases in section 6.

**Logistics** (confirmed from the Golfbreaks booking US61296, 2026-09-24)
- Trip: Thu 8 – Sun 11 April 2027, Pueblo Bonito Pacifica Golf & Spa Resort, Cabo San Lucas (all-inclusive, 12 golfers, check-in Thu 16:00, check-out Sun 12:00).
- **Calcutta dinner: Thu 8 April 2027** (arrival night).
- **Day 1: Fri 9 April 2027, Solmar Golf Links, first tee 09:00.**
- **Day 2: Sat 10 April 2027, Quivira Los Cabos Golf Course, first tee 09:00.**
- Two different courses, so par / stroke index / tees are **per round**, not per tournament (`rounds.course_id`). Both scorecards are still to be loaded (handoff).
- Booking is under Nicolás Castro (a player) with Golfbreaks; the Putter trophy comes courtesy of Golfbreaks.
- Timezone: `America/Mazatlan` (Baja California Sur).
- Currency: MXN, no decimals, formatted like `$2,500` (use `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })`).

---

## 3. Infrastructure: reuse Cardigan's accounts and patterns, never its data

Cardigan is Diego's clinical practice management app. It stores patient health data, so this project must never touch Cardigan's database, auth, or storage.

| Piece | Decision |
|---|---|
| GitHub | Private repo `cardiganapps-ui/Cardi-Golf` (Diego's account). |
| Vercel | **Project `cardi-golf` (`prj_8JpqrzlqS3ZkYJB8JPlb35EvC9ZU`)** on team `cardiganapps-4938's projects` (`team_0rR9OfIKmnJ8xFDrOXUkHcT3`), linked to the repo; production branch `main`, previews for every branch. `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set on Production + Preview (values in `.env.example`); framework preset Vite. **Production domain `golf.cardigan.mx`** (live 2026-09-27: DNS-only CNAME `golf` → `cname.vercel-dns.com` in the Cloudflare zone `cardigan.mx`, same as `angus`; HTTPS by Vercel). `cardi-golf.vercel.app` keeps working and stays in every allow-list. App code must never hardcode either host: share links and redirects use `window.location.origin`. The Vercel's GitHub comments on pull requests and commits are **off** (`gitComments`, 2026-09-28, Diego's request: they emailed him on every PR). The Vercel MCP connector is read-only here (403 on project and env-var creation); a team-scoped `VERCEL_TOKEN` (in `.env.local` for now, later in the Claude Code environment secrets) unlocks the REST API: `POST /v10/projects/<id>/env?teamId=…&upsert=true`, `PATCH /v9/projects/<id>`. |
| Supabase | **Project `Cardi-Golf`, ref `gmohwledjejlhcwqjnhd`, region `us-east-1`, URL `https://gmohwledjejlhcwqjnhd.supabase.co`**, in its own free organization "Cardi-Golf" (org id `xqtxffsvifrnqvgzzdxu`), separate from the Cardigan org. Never read from or write to Cardigan's project (`axyuqfkmifcaupwhzfuw`) or Angus's (`xbpvqvlomrnuxydyqyqj`). The Supabase MCP connector in Claude sessions is bound to the *Cardigan* org and does not see this project: manage it with the Management API (`https://api.supabase.com/v1/projects/gmohwledjejlhcwqjnhd/...`, e.g. `POST .../database/query` for SQL and migrations, `PATCH .../config/auth`) or the Supabase CLI, using `SUPABASE_PAT` and `SUPABASE_SECRET_KEY` from `.env.local` (gitignored) or the Claude Code environment secrets — never from a committed file, never echoed into logs or chat. Auth config already set (2026-09-27): anonymous sign-ins on, `password_min_length` 8, `site_url` `https://golf.cardigan.mx`, allow-list covers `golf.cardigan.mx`, `cardi-golf.vercel.app`, `cardi-golf-*.vercel.app` previews and localhost 5173/4173. Since 2026-09-28 (`scripts/auth-config.mjs`, re-runnable; `--check` prints the values): `mailer_autoconfirm` **off**, so every email account confirms with a 6-digit code (`mailer_otp_length` 6) and an anonymous device that sets an email stays anonymous until it types the code; Spanish subjects and templates carry both `{{ .Token }}` and the link; `rate_limit_email_sent` 60; `security_manual_linking_enabled` on (an anonymous device adds Google with `linkIdentity` and keeps its uid). The app verifies codes with `verifyOtp` (a link from Mail opens Safari, not the installed app). Google sign-in is **on** since 2026-09-29 (Google Cloud project `Polo`, OAuth client in production, consent Branding with `/privacidad` and `/terminos`; client ID and secret set through `PATCH .../config/auth`, never committed). **Free plan pauses the project after 7 days idle**: M0 adds a GitHub Actions cron that pings it daily, and the runbook says to check it the day before the trip. |
| Frontend base | Same as Cardigan: Vite + React 19. Add TypeScript. |
| Reusable patterns | Angus (`cardiganapps-ui/Angus`) and Cardigan (`cardiganapps-ui/cardigan`) are sibling repos. Read them (read-only, via `add_repo`) and copy what helps: Supabase client setup, PWA manifest and service worker config, MXN formatting helpers, Vercel config, styling approach, and the preflight/CI pattern this repo already copied. Don't import from them and don't modify them. |
| Storage | Avatars and optional photos go in Supabase Storage in the new project. Use Cloudflare R2 only if Cardigan already has a clean upload helper you can copy. |
| Course data | GolfCourseAPI + OpenGolfAPI (both free) through `api/course-search.ts`; scorecard photos through `api/scorecard-extract.ts` with the Anthropic API on `claude-haiku-4-5`. `GOLFCOURSE_API_KEY`, `OPENGOLF_API_KEY` and `ANTHROPIC_API_KEY` are set on Vercel (encrypted, Production + Preview, 2026-09-27); all verified live. All server-only, never `VITE_`. See §13b and the handoff. |
| Email (Resend) | **Supabase Auth mail goes through Resend SMTP** (2026-09-27): `smtp.resend.com:465`, sender `"Polo" <golf@cardigan.mx>` (renamed from "Cardi-Golf" 2026-09-28) on the `cardigan.mx` domain already verified in Cardigan's Resend account, `rate_limit_email_sent` 60 (was 30 until 2026-09-28). Verified by a real password-reset email (delivered). If you ever PATCH SMTP again, send the full block in one request; a partial PATCH resets sibling fields. The app sends no other email. |
| Backups (R2) | **Nightly JSON backup to Cloudflare R2 bucket `cardi-golf-backups`** (created 2026-09-27, same Cloudflare account as Angus's buckets). Runs as a Vercel cron (`vercel.json` `crons`, e.g. `0 9 * * *` UTC) calling `api/backup-cron.ts`, which checks `Authorization: Bearer $CRON_SECRET`, reads every tournament-scoped table with `SUPABASE_SECRET_KEY` and writes one gzipped JSON per night to `backups/YYYY-MM-DD.json.gz` via the S3 API (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET`). All seven vars are on Vercel **Production only**. This route is the **only** code allowed to use the service-role key; it never returns data, only a count. GitHub Actions secrets can't be set from Claude's sandbox (proxy-blocked), which is why the backup is a Vercel cron and not a workflow. **Built 2026-09-27** (`api/backup-cron.ts`, table list in `src/lib/backupTables.ts` with a test that fails if a migration adds a table the backup misses; schedule `0 9 * * *` UTC ≈ 2 am in Los Cabos). Verified end to end: 26 tables → 86 KB object → read back from R2. To take one on demand: `curl -H "Authorization: Bearer $CRON_SECRET" https://golf.cardigan.mx/api/backup-cron`. The in-app "Respaldo" export (M7) is the per-tournament manual copy; this is the whole-database safety net. |
| Web push | VAPID keys and `PUSH_DISPATCH_SECRET` on Vercel (Production + Preview, 2026-09-29), also in `.env.local`; the secret and `https://golf.cardigan.mx/api/push-dispatch` in Supabase Vault. Rotating: new values in both places, then `scripts/push-check.mjs`. |
| Payments (Stripe) | Not used. Money changes hands in person; the app only tracks it. |
| Tooling | Supabase, Vercel and GitHub MCP tools are connected to Diego's account; use them. Fall back to the Supabase CLI and the Vercel CLI only if a tool is missing. |

---

## 4. Tech stack and architecture

- **Frontend:** Vite + React 19 + TypeScript, React Router.
- **Backend:** Supabase Postgres, Auth (anonymous sign-in plus a PIN claim), Realtime (Postgres changes), Storage, and Row Level Security on every table.
- **Client state:** a small store (Zustand or TanStack Query) fed by Realtime.
- **Offline:** `vite-plugin-pwa` (Workbox) for the app shell, and an IndexedDB outbox (Dexie) for writes, with optimistic UI.
- **Animation:** Motion (framer-motion) for layout and reorder animations; `canvas-confetti` for celebrations.
- **Charts:** Recharts or visx.
- **Share images:** `html-to-image` plus the Web Share API.
- **Fonts:** self-host with Fontsource (`@fontsource/fraunces`, `@fontsource/instrument-sans`) so they work offline.
- **Testing:** Vitest for the engine; Playwright for one end-to-end smoke test (enter a score, see the leaderboard change).
- **Styling:** CSS variables for the tokens in section 14, plus whatever styling approach Cardigan uses (Tailwind or CSS modules), so the setup looks familiar to Diego.

**Core principle: store raw facts, derive everything.** The database stores only tournaments and their settings, players, handicaps, courses, groups, pairs, strokes/putts/pick-ups per hole, snake tiebreak answers, auction lots/bids/ownership, payment marks, and overrides. Every standing, prize, dollar amount, stat, and feed event is computed by one pure TypeScript module, `src/engine/`, from a single snapshot of *one tournament's* data plus its settings. Every client runs the same function, and so do the tests. Per tournament the data is tiny (dozens of players × a few rounds), so recompute everything on every change.

**Engine layout:** `src/engine/core/` (handicaps, strokes received, per-hole scoring, countback, money/settlement) and `src/engine/modules/<module>/` (one folder per side game, each exporting `compute`, its settings schema with defaults, its default labels, and its tests). `computeTournament` runs the enabled modules and merges their state.

---

## 5. The first tournament's rules: the source of truth for its configuration

The printed rules sheet the group received says the same thing. If you find a conflict, this section wins and you flag it to Diego. Every parameter here maps to a setting or a module option (§0.5, §18); every rule is implemented in the engine generically and *configured* to these values for this tournament.

### 5.1 Field
- 12 players, $2,500 MXN entry each, for an entry pot of $30,000.
- Four tiers of three players, assigned by the Comité by handicap: **A** (best), **B**, **C**, **D**.
- One player is Nacho, the groom. Flag him with `is_groom` and give him a special badge in the UI.
- Tier D plays the forward tees. The Comité accounts for that in the base handicap. The app still supports a tee per player, because par and stroke index can differ by tee.

### 5.2 Handicaps
- `baseHcp` is set by the Comité for each player: the average of their last 3–5 real rounds minus the course rating, capped at 54. It's entered in the admin and locked before the Calcutta. One base handicap for the whole tournament even though the two days are on different courses (Solmar, Quivira); the Comité chose simplicity over a per-course slope adjustment. Make a per-round course adjustment possible as a setting (`handicap.perRoundSlope`, default off), but don't turn it on.
- Day 1 playing handicap: `PH1 = roundHalfUp(0.80 × min(baseHcp, 54))`. The group chose 80%; don't relitigate it.
- Strokes received on a hole: `floor(PH / 18) + (SI <= PH % 18 ? 1 : 0)`, where SI is the stroke index of that hole for the player's tee.
- **Anti-sandbag rule for Day 2.** Let `P1` be the player's Day 1 Stableford points. Then `cut = P1 > 36 ? min(4, floor((P1 − 36) / 2)) : 0`, and the Day 2 playing handicap is `PH2 = max(0, PH1 − cut)`.
  - The cut applies to every handicap game on Day 2: individual, Matrimonios, and best round.
  - Nobody ever gets strokes added.
  - The Comité can override a playing handicap; overrides require a reason and are audit-logged.
- The allowance (0.80), the cap (54), and the cut parameters (36, 2, 4) live in settings.
- How `baseHcp` is obtained per player (a WHS index, an estimate from three scores, or a number typed by the Comité) and how it becomes a course handicap for the tee he plays each day is §13b. The rules above start from that course handicap.

### 5.3 Individual Stableford (main event)
- Points per hole: `pickedUp ? 0 : max(0, par + strokesReceived − gross + 2)`. That gives 0 for net double bogey or worse, 1 for bogey, 2 for par, 3 for birdie, 4 for eagle, 5 for albatross.
- Picking up ("Levantar") scores 0 points. Players pick up once they can't score.
- Total over 36 holes.
- Payouts: 1st **$10,000**, 2nd **$5,000**, 3rd **$3,000**, 4th **$2,000**.
- **Tiebreak (countback):** Day 2 total, then Day 2 holes 10–18, then 13–18, then 16–18, then hole 18. If still tied, the tied players share the sum of the prizes for the places they occupy, split evenly.
- The champion also receives the physical trophy, the Putter, courtesy of the travel agency (Golfbreaks).
- Last place overall wins **La Cuchara de Palo**: a wooden-spoon trophy plus a Calcutta slot (5.9).

### 5.4 Mejor ronda del día (best round)
- **$1,200 each day** to the highest single-day Stableford total.
- Open to everyone; a player can win this and the main event.
- Day 2 uses the adjusted handicaps.
- Tie: countback within that day (holes 10–18, 13–18, 16–18, 18), then split.

### 5.5 Los Matrimonios (pairs game)
- Six fixed pairs: each A is paired with a D, and each B with a C.
- **The draw** happens at the end of the Calcutta dinner, and the app runs it (section 13). Nacho doesn't draw: he picks his partner from the tier he's matched with. Everyone else is drawn at random.
- **Pair score:** the sum of both partners' Stableford points on every hole, over 36 holes. Each partner uses his own handicap strokes.
- **Prizes:** 1st pair **$2,000** ($1,000 each), 2nd pair **$1,000** ($500 each).
- **Tie:** better combined Day 2, then split.
- **Pairs play together both days.** Each foursome is one A+D pair and one B+C pair.
  - Day 1 groups come from the draw: random A+D vs B+C matchups.
  - Day 2 groups are set by the pair standings, with the top two pairs in the last group. Default: rank pairs 1–6, then groups are (5,6), (3,4), (1,2) in tee-time order. The Comité can override, and the app warns if a group isn't one A+D pair plus one B+C pair.
- **Tarjeta cruzada:** each pair keeps the other pair's card (section 9.3).

### 5.6 La Víbora (the snake), per group, per day
- Putts are strokes taken on the green, and the player enters them.
- In each group, the snake belongs to whoever most recently took **3 or more putts**. Process holes in the order the group plays them, which depends on its starting hole.
- If two or more players take 3+ putts on the same hole, the one who **holed out last** takes the snake. When this happens, the app asks "¿Quién embocó al último?" and stores the answer.
- **At the end of the round** (group finished 18 holes): the three players not holding the snake get **$200 each** from the pot. The holder gets $0 and carries the rubber snake on his bag until the next round.
- If nobody in the group 3-putted all day, the four split the $600 ($150 each).
- Total: 3 groups × 2 days × $600 = **$3,600**.

### 5.7 Menos putts (fewest putts)
- **$1,000** to the lowest total putts over 36 holes. Only strokes on the green count.
- Tie: split.
- Picked-up holes follow the setting in section 18.

### 5.8 Prize pool check

| Category | Amount |
|---|---|
| Individual Stableford, places 1–4 | $20,000 |
| Los Matrimonios | $3,000 |
| Mejor ronda (2 days) | $2,400 |
| La Víbora | $3,600 |
| Menos putts | $1,000 |
| **Total** | **$30,000 = 12 × $2,500** |

The engine asserts this sum when it loads settings, and the admin shows an error if the settings don't balance.

Balanced is not enough (MONEY-09, 2026-10-07): every place with a prize needs someone who can take it. Individual places can't outnumber the format's entrants (players, or teams under a team format or fourball: drawn ones, else half the field). Pair places can't outnumber the pairs, and a low score's places can't outnumber its entrants. Otherwise the wizard and the Comité refuse to create or save (`checkPrizePool().ok`). Once play starts, a place the field can no longer fill is a warning. An entrant with no result (never played, or a fourball side with no match) takes no paid place. Once final, each game names the places nobody filled and their pesos, which stay with the bank until the Comité decides.

### 5.9 La Calcutta (separate pot)
- **When:** the dinner the night before Day 1.
- **Lots:** every player is auctioned once, in an order drawn from a hat.
- **Bidding:**
  - Each player opens his own lot at **$250** and is the default high bidder.
  - Bids go up in **$250** increments.
  - If nobody tops the opening bid, the player owns himself.
- **Limits:** maximum **3 players per owner**. Bidders are the 12 players; a setting can allow guests.
- **Buyback:** right after the hammer, the player may buy back **up to 50%** of himself by paying his owner the same proportion of the price (50% costs half the price). This is paid directly, player to owner.
- **Pot:** the Calcutta pot is the sum of all hammer prices. It's paid to the banker and 100% of it is paid out:

| Slot | Share of the Calcutta pot |
|---|---|
| Stableford champion | 55% |
| Runner-up | 20% |
| Best finisher from tier C | 10% |
| Best finisher from tier D | 10% |
| Last place (La Cuchara de Palo) | 5% |

- **Payout rules:**
  - Each player cashes **at most one slot: the highest** he qualifies for. If a C or D player finishes 1st or 2nd, his tier slot passes to the next-best finisher from that tier.
  - Placings come from the final individual Stableford ranking, including countback.
  - Ties at a slot boundary: the tied players split the combined slots evenly.
  - Each slot's money is split among the player's owners by ownership percentage.
  - Round to whole pesos, and give any rounding remainder to the champion's owners so the payout totals the pot exactly. A slot nobody can fill stays unassigned in whole pesos (floor), so payouts plus unassigned equal the pot to the peso (MONEY-08).
  - A lot never auctioned (still pending or open once the tournament is live) cashes nothing: the slots' places count among the sold lots, and the Comité sees a warning naming the player (MONEY-11, 2026-10-07; the other reading, self-owned at the opening bid, is Diego's call in the handoff).
- **Payment deadline:** everything is paid before bed on Calcutta night ("se paga antes de dormir").

### 5.10 Governance
The Comité ([NOMBRES], to be confirmed; Nicolás Castro holds the booking and is the likely lead) has the final word. Every correction or override is logged with who, when, and why.

---

## 6. Scoring engine (`src/engine/`)

Pure functions, no I/O, no React. The entry point is `computeTournament(snapshot, settings): TournamentState`.

`TournamentState` includes:
- **Per player, per day, per hole:** strokes received, net score, points, putts, pick-up flag.
- **Per player:** totals and "thru" (holes completed).
- **Handicaps:** the Day 2 cut and PH2 per player.
- **Standings:**
  - Individual, with countback and position labels like `T3`.
  - Best round per day.
  - Matrimonios.
  - Fewest putts.
- **La Víbora, per group per day:**
  - The holder history (hole by hole).
  - The current holder.
  - Pending tiebreak questions.
  - Payouts once the group finishes.
- **Calcutta:**
  - The pot.
  - Who fills each slot.
  - Payouts per owner, both "si terminara ahora" and final.
- **Money:**
  - Prizes per person by category, both live and final.
  - Net per person.
  - Settlement transfers (section 11).
- **Stats and awards** (section 12).
- **Derived feed events:** birdies, lead changes, snake passes, and Nacho's holes.
- **Status flags:** incomplete rounds, pending snake tiebreaks, unsigned cards, score discrepancies.

Every computed number carries an explanation object so the UI can render "¿Cómo se calculó?". For example: base 20 → 80% = 16 → 1 stroke on SI 1–16 → 5 on a par 4 = net par = 2 points.

### Required test cases (Vitest; all must pass)

**Playing handicap (80%, round half up, cap 54)**
```
base 14      → 11.2 → 11
base 25      → 20
base 33      → 26.4 → 26
base 21.875  → 17.5 → 18   (half up)
base 50      → 40
base 54      → 43.2 → 43
base 60      → capped at 54 → 43
```

**Strokes received**
```
PH 0  → 0 on every hole
PH 16 → 1 on SI 1–16, 0 on SI 17–18
PH 18 → 1 on every hole
PH 43 → 3 on SI 1–7, 2 on SI 8–18
```

**Stableford points**
```
par 4, SI 3, PH 16 (1 stroke): gross 4 → 3 pts · 5 → 2 · 6 → 1 · 7 → 0
par 4, SI 3, PH 43 (3 strokes): gross 5 → 4 pts · 7 → 2 · 9 → 0
par 3, SI 18, PH 16 (0 strokes): gross 2 → 3 pts
any hole picked up → 0 pts
```

**Day 2 cut**
```
P1: 35 → 0 · 36 → 0 · 37 → 0 · 38 → 1 · 39 → 1 · 40 → 2 · 42 → 3 · 44 → 4 · 47 → 4 (max)
PH1 16, P1 42 → PH2 13
PH1 2,  P1 44 → PH2 0 (floor at 0)
```

**Countback**
```
A and B both 70 total; Day 2: A 36, B 34 → A ahead
Equal Day 2; Day 2 holes 10–18: A 18, B 17 → A ahead
Equal all the way through hole 18 → tied; they split the prizes for the places they occupy
Two players tied for 1st after countback → each gets ($10,000 + $5,000) / 2 = $7,500
```

**La Víbora**
```
Group [A, B, C, D], starting hole 1:
  hole 3:  B takes 3 putts           → holder B
  hole 7:  C and D both take 3 putts, answer "D holed out last" → holder D
  hole 15: A takes 4 putts           → holder A
  end → B, C, D get $200 each; A gets $0
Nobody takes 3 putts all round → A, B, C, D get $150 each
Starting hole 10: play order is 10–18 then 1–9, so a 3-putt on hole 2 comes after one on hole 18
Two 3-putts on the same hole with no tiebreak answer → state "pendiente", no payout until answered
```

**Calcutta**
```
Pot $12,000 → slots $6,600 / $2,400 / $1,200 / $1,200 / $600
Champion is a C player; the 3rd-place player is also C → Best C slot goes to the 3rd-place player
Runner-up is a D player → Best D slot goes to the next-best D player
Champion owned 50% by owner X and 50% by himself after buyback → X $3,300, champion $3,300
Two players tied for 1st after full countback → each gets (55% + 20%) / 2 = 37.5% of the pot
Rounding remainder goes to the champion's owners; payouts sum exactly to the pot
```

**Money**
```
Prize settings must sum to $30,000
The settlement nets to zero across all people (banker included)
```

---

## 7. Data model, auth, and permissions

### Tables (Postgres, snake_case)

**Organizers and tournaments**
- `organizers`: `auth_user_id` (PK), `display_name`, `created_at`. Anyone with an email account.
- `tournaments`: `id`, `slug`, `name`, `tagline`, `logo_url`, `accent_color`, `join_code` (6 chars, unique), `status` (`setup` | `auction` | `live` | `finished`), `current_round_id`, `settings` (jsonb, section 18: enabled modules, their parameters, labels, entry fee, handicap rules, tiers), `banker_player_id`, `timezone`, `currency`, `created_by`, `created_at`.
- `tournament_organizers`: `tournament_id`, `auth_user_id`, `role` (`owner` | `admin`).
- `courses`: `id`, `name`, `created_by`. Reusable across tournaments.
- `tees`: `id`, `course_id`, `name`, `color`, `rating`, `slope`, `par_total`, `gender` (nullable).
- `courses` also carry `source` (`manual` | `golfcourseapi` | `scorecard_photo`), `external_id`, `imported_at`, `location`.
- `holes`: `tee_id`, `number` (1–18), `par`, `stroke_index`, optional `yards`. Unique on (`tee_id`, `number`).

**People and teams**
- `players`: `id`, `tournament_id`, `full_name`, `display_name`, `tier` (text, one of the tournament's configured tiers, nullable), `base_hcp` (numeric, the value the engine starts from), `handicap_source` (`index` | `estimate` | `manual`), `handicap_index` (nullable), `estimate_inputs` (jsonb: the three scores with their rating/slope/par), `default_tee_id`, `is_honoree` (the first tournament's "groom"), `is_admin` (a player who may also run the Comité console), `avatar_url`, `pin_hash`, `form_guide` (text: recent rounds for the auction), `sort_order`.
- `device_sessions`: `auth_user_id` (PK), `player_id`, `created_at`. Maps anonymous auth users to players.
- `pairs`: `id`, `tournament_id`, `name`, `player1_id`, `player2_id`, `kind` (text: the pairing rule's label, e.g. `AD` | `BC`), `picked_by_honoree`, `drawn_at`.

**Rounds and scoring**
- `rounds`: `id`, `tournament_id`, `number` (1..N), `date`, `course_id`, `holes` (9 | 18), `status` (`scheduled` | `live` | `finished` | `cancelled`).
- `groups`: `id`, `round_id`, `number`, `tee_time`, `start_hole` (1 | 10).
- `group_members`: `group_id`, `player_id`.
- `round_tees`: `round_id`, `player_id`, `tee_id`. Unique on (`round_id`, `player_id`). Which tee each player plays that day (§13b-D). (When the pairs module is on, a group is normally two pairs; the engine validates that, the schema doesn't require it.)
- `scores`: `id`, `round_id`, `player_id`, `hole`, `strokes` (nullable), `putts` (nullable), `picked_up`, `entered_by`, `client_ts`, `updated_at`, `version` (bumped on every change), `device_id`, `mutation_id`. Unique on (`round_id`, `player_id`, `hole`). A direct write from the app records the session's own player as `entered_by`, whatever the body says, and no device or mutation (those are `save_hole`'s) (`scores_00_writer`, SEC-02). The account that wrote is in `audit_log.actor_auth_user_id`, not on the row: every member reads the scores.
- `save_hole(p)` (2026-10-07, migration 0026, on production since 2026-10-08; not yet used by the app): a group's hole in one statement, at most 8 entries and 16 KB (more is refused whole, 22023). Each entry names the fields the phone set and, as `base`, the whole row it saw (`{}` or null when it saw none; no `base` key at all writes blind, as a direct write does, so a client must never drop it); a field someone else changed meanwhile isn't overwritten, and the answer says `conflict` with the server's row. A pick-up also writes «no strokes» and a number of strokes «not picked up», both checked against what the phone saw (a key its base leaves out reads as no strokes, no putts, not picked up), so a stale phone's strokes never vanish under another's pick-up, nor the other way round. Entries the server refuses (round not live, card signed, not in the group, invalid) answer `rejected` and, with conflicts, go to `rejected_writes`, one row per player per call. A mutation sent twice answers what it answered the first time (`score_mutations`: account, tournament, round, hole, answer; no client access); the same id from another account or for another hole is refused (22023). It locks the hole (`save_hole:<round>:<hole>`, which `admin_save_score` and `resolve_score_dispute` take too) and the hole's rows at once, in player order. The app switches to it in outbox v2 (PLAN §5.1); until then phones write each score directly, as before.
- `rejected_writes`: `tournament_id`, `round_id`, `hole`, `player_id`, `writer_player_id`, `auth_user_id`, `device_id`, `mutation_id`, `payload`, `reason` (`round_not_live` | `card_signed` | `not_in_group` | `invalid` | `conflict`), `status` (`open` | `applied` | `dismissed`). Written only by `save_hole`; the Comité reads its tournament's, a phone its own (REL-08).
- `snake_tiebreaks`: `round_id`, `group_id`, `hole`, `last_holed_player_id`, `decided_by`, `created_at`. Unique on (`round_id`, `group_id`, `hole`).
- `card_signatures`: `round_id`, `pair_id` (whose card was signed), `signed_by`, `signed_at`.
- `handicap_overrides`: `round_id`, `player_id`, `playing_hcp`, `reason`, `by`, `at`.

**Calcutta and money**
- `calcutta_lots`: `id`, `tournament_id`, `player_id`, `lot_number`, `status` (`pending` | `open` | `sold`), `price`, `owner_id`, `sold_at`.
- `calcutta_bids`: `id`, `lot_id`, `bidder_id`, `amount`, `created_at`.
- `calcutta_buybacks`: `lot_id`, `pct` (0–50), `amount`, `paid`.
- `payments`: `id`, `tournament_id`, `from_player_id` (null = banker), `to_player_id` (null = banker), `amount`, `kind` (`entry` | `calcutta` | `buyback` | `payout` | `other`), `paid`, `note`.
- `money_adjustments` (2026-10-08, migration 0027, MONEY-05): the Comité's decisions on money the rules leave unassigned. `id`, `tournament_id`, `source_key` (the engine's stable id of the bucket it settles: a module id, `game:<id>`, `calcutta`, `pool`; checked against `^([A-Za-z]{1,40}|game:[a-z0-9-]{1,32})$`, so the snake's held keys `snake:<round>:<group>` are refused), `kind` (`award` | `refund` | `house`), `to_player_id` (a player of the same tournament; null only for `house`), `amount` (whole pesos, 1 to 10,000,000, written as an integer: `1.0` is refused in Spanish, never a cast's 22P02), `reason` (trimmed, 3–500 characters), `call_id` (the call that wrote the row: one decision), `created_by` (auth uid), `created_at`, `voided_at`, `voided_by`, `void_reason`. Members read it; nobody writes it directly. `assign_unassigned(p_tournament_id, p_source_key, p_entries [{kind, to_player_id?, amount}], p_reason)` (the Comité; one call is one assignment under one `call_id`, at most 200 lines and $10,000,000 in all, every row in one statement, refused whole on any bad line, 22023 in Spanish) and `void_adjustment(p_id, p_reason)` (the Comité; voids the rows of that row's `call_id` and no other, so a refund never comes back half and another call on the same line, by the same account, in the same transaction, stays). The server checks shape, tenant, reason and sign, not amounts: the engine checks each call against what its bucket holds, in the order the calls were written (`created_at`, then `call_id`). Audited, in the Realtime publication and in `APPLIED_TABLES`, exported by the backup and brought back by `restore_tournament` (0027 redefines it from 0025's body plus this table, `call_id` and the void columns included). Calls go through `src/data/api.ts` online, never the outbox. **The app does not listen to it on the live channel yet** (`realtimeTables.ts`, REL-01): this bundle may reach phones before 0027 reaches production, and a channel naming an unpublished table fails whole. A phone reads the Comité's decisions on its next fetch: the Comité's own phone fetches after each decision and again before sending one (the «Decidir» sheet refuses a line that changed meanwhile), every phone at least every five minutes (`HEAL_MS`). Adding it to `REALTIME_TABLES` is a separate change once 0027 is on production; `realtimeTables.test.ts` refuses a table only the newest migration publishes.
- `restore_tournament` and other tournaments' ids (NEW-12, 2026-10-08, in 0027's redefinition): since 0010 players and rounds were upserted by id, so a backup of A that named a player or round of B rewrote it in B (its name, handicap, round status) and put scores and groups in B's round. The restore now refuses (22023, «El respaldo trae filas que son de otro torneo; no se restauró nada»), before writing anything, a backup whose players, rounds, pairs, teams, Calcutta lots, payments or assignments already exist under another tournament, or whose groups, scores or bids exist under another tournament's round or lot. With the reference check (every child points at a row the backup carries), every row a restore writes is the tournament's own. `supabase/tests/restore_roundtrip.sql` tries twenty tampered backups.

**Instance games** (2026-09-28, migration 0011; `settings.games[]`, engine `src/engine/games/`)
- `game_entries`: `tournament_id`, `game_id`, `player_id`. Who is in a game whose entrants are a list (side pots).
- `hole_awards`: `round_id`, `group_id`, `hole`, `game_id`, `player_id`, `decided_by`. Hole-contest winners.
- `game_results`: `tournament_id`, `game_id`, `player_id`, `share`. The Comité's result for a custom bet.
- `payments.kind` also takes `side` (buy-in to a side pot, player → bank) and `bet` (direct bet, player → player).
- A pot nobody wins (skins, birdie or eagle pot, hole contest; MONEY-10): once the game is final, a side pot goes back to its entrants, the buy-in each («<juego>, entrada devuelta»; a contest waits while a hole is in dispute), and a pot from the inscriptions stays unassigned with a warning that names the amount. `refundUnwon` / `unwonWarning` in `src/engine/games/payout.ts`.
- `restore_tournament` brings the three back (0011 added them, 0020 lost them, 0025 restores them again; DB-02). `src/data/backup.restore.test.ts` fails when the function's latest definition misses a table `backup.ts` exports, and `supabase/tests/restore_roundtrip.sql` changes every table after a backup and compares each one after the restore (local Postgres harness). 0025 also audits the team draw tables and adds them to the Realtime publication; the client does not listen to them yet: adding `teams` and `team_members` to `src/data/realtimeTables.ts` is a separate change that ships only after 0025 is applied in production (REL-01), so until then a team draw reaches other phones at their next reload.

**Profiles and identity** (2026-09-28, migration 0013)
- `profiles`: `id` (= auth uid), `handle` (unique, `handle_ok()`: 3–20 of `a-z0-9._`, reserved words out), `display_name`, `full_name`, `avatar_url`, `home_club`, `city`, `bio`, `index_source` (`polo` | `manual`), `manual_index`, `polo_index` + `polo_index_rounds` + `polo_index_at` (computed, 0014), `discoverable`. Only accounts (email or Google, not anonymous) have one: `ensure_my_profile()` creates it with a handle from the name. RLS: owner only; the owner may update the editable columns (column grants), never the computed index.
- `players.profile_id` + `profile_status` (`pending` | `confirmed`): the link from a tournament player to a profile, one per profile per tournament. Written **only** by the definer RPCs (`link_my_profile`, `unlink_my_profile`, `comite_link_profile`, `comite_unlink_profile`, `redeem_link_token`, `duplicate_tournament` which copies links as `pending`); the trigger `players_guard_link` refuses direct writes from `anon`/`authenticated`, and `restore_tournament` never takes a link from a backup.
- `profile_link_tokens`: `token_hash`, `created_by`, `player_id`, `expires_at` (15 min), `used_at`. Carries a device's PIN claim across a sign-in to an existing account (`create_link_token` → sign in → `redeem_link_token`). No client access.
- Other profile RPCs: `profile_card(handle)` (strangers with an account see the card of a discoverable profile; people who share a tournament see bio and full name), `search_profiles(q)` (accounts only), `my_links()`, `tournament_profiles(tid)`.

**Results and the Polo index** (2026-09-28, migration 0015)
- `round_results`: one row per player per **finished** round, computed in SQL (`refresh_round_results`) by trigger when a round becomes or stops being finished and when a finished round's scores change. It holds gross, adjusted gross (net double bogey on the WHS course handicap of the tee played; a pick-up counts as net double bogey), the differential (only for complete 18-hole rounds on a rated tee), gross counts and the per-hole detail. There is no client payload.
- `profiles.polo_index`: WHS on the latest 20 differentials of the profile's confirmed players in tournaments with `counts_for_stats` (the Ensayo is off). `recompute_profile_index` runs by trigger on results, links, deleted players and `counts_for_stats`. The arithmetic is integer tenths in both SQL (`whs_*`) and TS (`src/engine/profile/whs.ts`); `src/engine/profile/cases/whs.json` is run against both.
- `tournament_results` (rank label, field, points, per round, awards) and the private `tournament_money` (net: its owner and the Comité only) come from `publish_tournament_results`. It runs when the Comité marks the tournament Terminado, and from Datos › «Publicar resultados»; leaving Terminado withdraws both.
- Reads: `profile_rounds`, `profile_tournaments` (people who may see the full profile), `my_money()` (the owner).

**Social** (2026-09-28, migration 0016; `src/data/social.ts`, screens `/amigos`, `/avisos`, `/p/<handle>/vs`)
- `friendships`: `a` (asked), `b`, `status` (`pending` | `accepted` | `blocked`), `blocked_by`. One row per pair. Friends see each other's full profile (`profile_visible_to_me`); a block hides both ways and ends their rivalry. RPCs: `friend_request` (answers an incoming one as a yes; strangers reach only discoverable profiles), `friend_respond`, `friend_remove`, `friend_block`, `friendship_with` (someone else's block reads as `none`), `my_friends()` (with suggestions from confirmed tournament mates). `are_friends` / `is_blocked` are internal.
- `rivalries` + `rivalry_rounds`: two friends, `strokes` = what `a` receives (negative: `b` does), within `cap` (18). `recompute_rivalry` replays from scratch over the shared complete non-practice rounds since `started_at`: compare adjusted gross with the strokes applied; the loser receives one more, a tie keeps them. It runs from the `round_results` and link triggers, so a correction re-decides every later round. RPCs: `rivalry_propose` (friends only, one open per pair), `rivalry_respond`, `rivalry_end`, `rivalry_suggestion`, `head_to_head(handle)` (shared rounds on net and gross plus the rivalry, from the caller's side).
- `notifications`: own rows only, unique `(profile_id, key)` so a replay or a republish never notifies twice, never an amount. Written only by the internal `notify()`: friend request/accept, rivalry proposed/accepted/round, a Comité profile proposal (`link_pending`), published results. RPCs: `my_notifications`, `unread_notifications`, `mark_notifications_read`. `friends_feed()` is computed on read (friends' finishes, rounds with an eagle or 3+ birdies, personal-best gross, my rivalry results).

**Ronda rápida** (2026-09-29, migration 0017; `/ronda`, `src/data/quick.ts`, settings from `src/engine/games/quick.ts`)
- `create_quick_round(p)` creates in one transaction a live one-round tournament with `tournaments.quick = true`, the round (course, tee, date), the players and groups of up to four. The creator (an account) is owner and a confirmed player; friends (`are_friends` only) come in as `pending` links and get a `round_invite` notification; guests are plain players. Each plays off the index typed, else their profile's (`profile_index`), on the chosen tee. The settings are individual Stableford at 100% handicap plus the chosen side-game chips; with money, the entry pot splits 100 / 70-30 / 50-30-20 by field size.
- On a quick tournament the organizer sees «Terminar y publicar» on En vivo (`QuickFinish`): it finishes the live rounds, marks the tournament finished and publishes the results.
- `round_rivalries(tid)`: the caller's active rivalries with other confirmed players of that tournament; the Tarjeta shows one line per rival in the group.
- `/campos`: the course library outside a tournament (the Comité › Campos editor), so a quick round can add its course.

**Crews** (2026-09-29, migration 0018; `/crews`, `/c/<slug>`, `/c/unirme/<code>`, `src/data/crews.ts`, season in `src/engine/profile/season.ts`)
- `crews` (`slug`, `name`, 6-character `join_code`, `created_by`) and `crew_members` (`owner` | `member`); readable by members only. `tournaments.crew_id` puts a tournament or Ronda rápida in a crew (`set_tournament_crew`: the Comité, and only into a crew they belong to). Crew-mates see each other's full profile (`profile_visible_to_me` via `shares_crew`).
- RPCs: `create_crew`, `crew_preview(code)`, `join_crew(code)` (the owner hears `crew_join`), `leave_crew` (the last one out deletes it; an owner leaving hands it to the longest member), `rotate_crew_code` (owner), `my_crews`, `crew_page(slug)`. The page returns the members, the outings, and each member's published finish in finished, counting outings, with `tied`: how many of the whole field share that place, so a member tied with a guest shares the points.
- Season table (computed on the client): 25/18/15/12/10/8/6/4/2/1 by place plus 1 for playing. Ties average the places they fill. Order: points, then wins, then best finish; players equal on all three share the position. Per calendar year of the outing's first round.

**Badges, records, the year** (2026-09-29, no migration; `src/engine/profile/achievements.ts`, `src/screens/profile/Achievements.tsx`)
- Computed on read from `profile_rounds` and `profile_tournaments`; practice never counts, nothing carries money. 20 badges (rounds played, first birdie, 3 birdies, eagle, ace, breaking 100/90/80/70, 5 holes at par or better in a row, no doubles, no 3-putts, 28 putts or fewer, 5 tournaments, podium, a win, three wins), each dated by the first round or tournament that earned it. Records: best gross, best differential, most birdies in a round, fewest putts, longest par streak, best finish (the earliest stands on a tie). The owner shares «Mi <año> en Polo» as an image (the recap: rounds, tournaments, wins, podiums, birdies, eagles, best and average gross, best differential, courses, the year's badges).

**Web push** (2026-09-29, migration 0019; `api/push-dispatch.ts`, `public/push-sw.js`, `src/data/push.ts`)
- `push_subscriptions` (own reads; written by `save_push_subscription` / `delete_push_subscription`). A trigger on `notifications` posts, via pg_net, one request per notice to `/api/push-dispatch` with that profile's subscriptions, the notice and the unread count. The URL and the shared secret live in **Vault** (`push_dispatch_url`, `push_dispatch_secret`); the same secret is `PUSH_DISPATCH_SECRET` on Vercel. Without them the trigger does nothing.
- The route checks the secret, signs with the VAPID pair (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; Production + Preview, and `VITE_VAPID_PUBLIC_KEY` for the client), and sends the same text as the inbox (`src/lib/noticeText.ts`). Endpoints answering 404/410 go back through `push_prune(secret, endpoints)` with the anon key. It never uses the service-role key. `scripts/push-check.mjs` runs the whole chain against production.
- The service worker imports `push-sw.js` (`workbox.importScripts`, bump its `?v=` when it changes): it shows the notice, sets the app badge, and a tap opens the notice's page. Permission is asked only from the «Activar avisos» tap (Editar perfil, and a nudge atop Avisos). iPhone needs the app on the home screen (iOS 16.4+); the switch says so.

**Platform admin: «Admin de Polo»** (2026-09-29, migration 0021; `/admin`, `src/data/platform.ts`, `src/screens/platform/`)
- `platform_admins` (RLS on, no policies, no client grants) is the only source of truth, seeded once in 0021 from Diego's email; no code compares an email at runtime. `is_platform_admin()` answers only about the caller.
- «Comité en cualquier torneo»: `is_platform_admin()` is OR'd **last** into the helpers, so every existing policy and RPC recognizes the admin and nothing else changed for anyone else. `is_tournament_member` = `is_tournament_participant` (organizer or player by right) or admin: reads always. `is_tournament_organizer` / `is_tournament_owner` add `platform_can_write(tid)`: Comité rights unless the tournament is Protegido and not unlocked. `my_membership` returns `via: 'platform'` (role `platform`, `protected`, `unlockedUntil`) when he isn't a participant; the gate admits it without caching the entry or making it the last tournament, and `PlatformBanner` says so on En vivo and the Comité.
- The social graph stays private: `profile_visible_to_me` uses `is_tournament_participant`, and policies on `profiles`, `device_sessions`, `notifications`, `push_subscriptions`, `friendships` and `crews` have **no** platform branch. Never add one. Lists that relied on RLS alone must filter by account (`listMyTournaments` filters `auth_user_id`).
- Protegido (`tournaments.is_protected`): the trigger refuses deleting it (anyone, service role included) and refuses changing the flag outside `set_tournament_protected` (owner or admin; off needs a reason). `platform_unlock(tid, reason)` opens it to the admin for 30 min (`platform_unlocks`), `platform_relock` closes it.
- Marking: `audit_log.actor_platform` (the admin, outside tournaments he belongs to); `audit_row` now logs the `tournaments` row against its own id, and audits `tournament_organizers`, `courses`, `tees`, `holes`. `platform_audit_log` (written only by the internal `platform_log`) holds actions with no row of their own (protect, unlock, relock).
- Every `platform_*` RPC is security definer, starts with the `is_platform_admin()` guard (42501) and is revoked from public and anon (internal helpers: `platform_can_write`, `platform_log`, `platform_person_target`, revoked from authenticated too); `src/lib/platformGuard.test.ts` enforces that shape. No service-role code. Live test: `scripts/platform-test.mjs` (makes a throwaway admin with SQL, removes it); browser: `e2e/platform.mjs`.
- Torneos (0021): `platform_overview`, `platform_daily`, `platform_tournaments`, `platform_tournament`; `platform_set_organizer` (0022) gives a tournament left without a Comité a new one (accounts only; a Protegido one needs its unlock).
- Personas (0022): `platform_people`, `platform_person` (never a PIN/token hash, push key or endpoint), `platform_block`/`platform_unblock` (`banned_until` + ends sessions; an issued token lives up to an hour), `platform_delete_preview`/`platform_delete_account` (exact email, or BORRAR for a phone; crews it created go to their longest member first, since `crews.created_by` cascades), `platform_reset_pin_lock` (device and/or player lock; the PIN is untouched). Nobody acts on themselves or another admin; every action needs a reason and is logged.
- Historial (0022): `tournament_audit(tid, before, limit)` is the Comité's own history with names, the admin's changes marked; Comité › Historial.
- Campos (0023): `platform_courses` (filters dupes / broken / unused; duplicates by `course_dupe_key` + `course_keys_match`, broken by `tee_problems`), `platform_course`, `platform_merge_courses(keep, drop, tee_map, reason)` (every tee in use must be mapped to a kept tee with the same par and stroke index on every hole; refuses a locked Protegido tournament; moves rounds, round_tees, default tees, scorecard photos, then recomputes the finished rounds), `platform_delete_course` (only if nobody plays it), `platform_refresh_course_results` (after fixing a card; the panel calls it on save). Cards are edited with the Comité's `CourseEditor` (`can_edit_course` admits the admin).
- Crews (0023): `platform_crews`, `platform_crew`, `platform_crew_remove_member` (the owner's crew goes to the longest member; the last one out deletes it), `platform_delete_crew` (exact name; tournaments stay, out of the crew).
- Avisos (0024): `platform_broadcast(title ≤60, body ≤280, to?, url?)` is an ordinary `notify()` of kind `platform_notice`, so the inbox and the push trigger carry it; the link must be a page inside Polo (`safeNoticeUrl`); two notices to everyone per 24 h, thirty to one person per hour. `noticeLine` returns the notice's own title and body for the push. `platform_audience` counts the reach and lists recent notices. The live test never sends to everyone: the daily limit is checked inside a transaction that rolls back.
- Auditoría (0024): `platform_audit(source, before, limit, q)` merges `platform_audit_log` with `audit_log.actor_platform`; `platform_audit_entry` opens one without secret-shaped keys.
- Salud (0024): `platform_health()`: backups from `backup_runs` (written by `api/backup-cron.ts` on every run, good or bad), push (Vault configured, subscriptions, pg_net's last few hours), last migration, blocked accounts and PIN locks, the switches.
- Switches (0024): `platform_settings` via `platform_set_flag(key, value, reason)`: `new_accounts_paused` (trigger on `profiles`), `new_tournaments_paused` (trigger on `tournaments`), `maintenance_banner` (≤200 chars). The admin is exempt. `app_flags()` is public (anon too); AppShell loads it with a 5 s timeout and `MaintenanceBanner` shows the banner. Supabase's own «disable sign-ups» is deliberately not used: it would stop the anonymous phones players join with.

**Records**
- `audit_log`: `id`, `table_name`, `row_id`, `actor_player_id`, `action`, `before`, `after`, `reason`, `at`. Written by triggers on `scores`, `handicap_overrides`, `players`, `pairs`, `groups`, and the Calcutta tables.
- `photos` (optional): `id`, `round_id`, `player_id`, `hole`, `url`, `created_at`.

### Auth
- **Organizers** sign in with email (magic link or password) and land on "Mis torneos", where they create tournaments.
- **Players:** on first open of a tournament link (`/t/<slug>`) or after entering a join code, the app signs in anonymously (enable anonymous sign-ins in Supabase Auth).
- The player taps his face and enters his 4-digit PIN. A `claim_player(player_id, pin)` RPC (security definer, pgcrypto `crypt`) links the auth user to the player in `device_sessions`.
- Rate-limit PIN attempts: after 5 failures for a player, lock for 5 minutes.
- **Who am I in a tournament:** `my_player_id(tid)` = the player confirmed-linked to my profile there, else this device's PIN claim (`device_sessions`). It powers every policy and helper (`is_tournament_member`, `is_tournament_organizer`, `shares_group`, scores/signatures/tiebreaks/awards, `admin_save_score`, `audit_row`), so one account plays several live tournaments at once. `current_player_id()` (device claim only) stays for older bundles; don't use it in new code. `my_membership(tid)` returns `{playerId, role, isOrganizer, isAdmin, via}` for the tournament gate. `claim_player` refuses (`already_linked`) when the account is confirmed as another player of that tournament.
- The Comité sets and resets PINs from the admin.
- **Player accounts** (2026-09-28, `src/data/account.ts`, `src/screens/profile/`). `/entrar` asks for an email and a 6-digit code. An anonymous device converts in place (`updateUser({ email })` + the `email_change` code: same uid, so its PIN claim and outbox stay valid); an address that already has an account signs in with a code, and the device's player travels in a link token (stashed in `sessionStorage` with the player's names). Google: `linkIdentity` on an anonymous device, else `signInWithOAuth`, returning to `/perfil/vuelta`; hidden in the iOS home-screen app (the OAuth return would land in Safari). After any sign-in `finishProfileSignIn()` creates the profile (named after the player it came from, migration 0014) and saves the device's player in it. Switching account (`refuseWithUnsent` before every way: the organizer's email sign-in at `/organizer/login`, `/entrar`'s code when there is no session to convert and again when the code is typed, Google's sign-in as well as its link) or signing out is refused while the outbox holds unsent writes for any tournament (`unsentWrites()`; writes a newer build queued don't count, they stay on the phone for it), and the refusal names the tournament (from the name each write keeps, once the saved boards are gone) and says whether signal or the PIN sends them. Converting this anonymous device in place is no switch (same uid) and goes ahead with writes queued. A device holds one PIN claim (`claim_player` replaces it), so Entrar refuses a PIN while another tournament still has writes that go out with this phone (`refuseClaimWithUnsent`, outbox `unsentBeforeClaim`: not the tournament being entered, not writes held for a PIN elsewhere); and the gate's `leave()` («Cambiar de jugador», «No soy yo») releases the claim only when it is this tournament's (`myDeviceClaim()`, unless the membership came from it), never another tournament's. When a tournament's own slug leads nowhere (deleted), its queued writes move to the rejected list («El torneo ya no existe»), so they no longer hold the phone. Signing out waits past auth-js's own logout deadline (`SIGN_OUT_TIMEOUT_MS`, 15 s, «Cerrando sesión…»: on lie-fi a valid session ends at 12 s) and clears the profile, «Tu último torneo» and the boards saved on the phone only once the session is really gone (`signOut()` returns that; with no signal and an expired token, or inside auth-js's 60 s retry cooldown, auth-js keeps it and the app says the session could not be confirmed). If auth-js ends it after the wait (an expired token still refreshing), the same cleanup runs then and the shell goes home and says so (`LateSignOutHome`). A sign-out the person asked for is not a lost session to the tournament gate (`signedOutOnPurpose()`) until a real sign-in (`SIGNED_IN`, never a token refresh, and not of the account auth-js is still signing out), and a gate that was open when it was asked for stops its retries (`signOutsAsked()`), so no anonymous user starts behind it. Accounts get **Mi Polo** as home (`/`); with the last tournament's boards saved on the phone, «Tu último torneo» shows there while the profile loads and keeps its place once it lands if it was on screen first or the account's list lacks it; profiles live at `/p/<handle>`, the editor at `/perfil/editar`. `e2e/profile.mjs` runs both paths with real emails (a throwaway mail.tm inbox).

### Permissions (RLS)
- **Tenant boundary is the tournament.** Every policy starts from `tournament_id`: a device linked to one tournament reads nothing from another. `my_player_id(tournament_id)` and `is_tournament_organizer(tournament_id)` are the two helpers.
- **Read:** any linked device can read everything in its tournament except `pin_hash`. Hide it with a view or column privileges.
- **Write scores:** allowed when the round is `live`, the card isn't signed yet, and the writer is in the same group for that round or of the Comité (0026: the Comité's direct writes no longer bypass the round and the card, REL-09). A correction after that goes through `admin_save_score`, with a reason once the card is signed; an admin player's Tarjeta does so by itself on a closed round or a signed card (online only). Deleting a score is the Comité's alone. A phone's snake answer and contest winners need a live round too; the Comité's own decisions on them don't.
- **Organizer/admin-only:** tournament setup, players, pairs, groups, overrides, the auction console, and payments. Organizers (`tournament_organizers`) and players with `is_admin` both count.
- **Spectator link** (optional, section 18): read-only boards without money, through a public view and a share token.
- The service role key never reaches the client.
- **Storage** (`tournament-assets`, migration 0012): every write needs a session. `courses/…` needs `can_manage_courses()`; any other top-level folder must be a tournament id (`try_uuid`, so a non-uuid folder is refused cleanly) that the writer belongs to (insert) or organizes (update, delete). `profiles/<uid>/…` is writable by that account only (0013).

---

## 8. Realtime and offline

- **Subscriptions:** every table in `src/data/realtimeTables.ts` (only published ones: a channel naming an unpublished table fails whole, REL-01). On any change, update the local snapshot and recompute.
  - The tables that move during play (`APPLIED_TABLES` in `src/data/realtimeApply.ts`: scores, tiebreaks, signatures, contest claims, overrides, tees of the day, payments, the Comité's money assignments (applied once the channel listens to them, after 0027 is on production), lots, bids, buybacks, game entries and results) are applied from the event's own row, by key, through the fetch's mappers, at the place a fetch would put it (fetched rows are put in the same order, `inLiveOrder`): a foursome's hole is one recompute and no request (REL-11, PERF-07), and a phone that applied a change and one that fetched it hold the same lists.
  - Another tournament's rows are left alone, at no cost. A delete is applied only when its key is one of this snapshot's rows (deletes are not filtered by RLS, DB-05); a score's delete names its id, which scores keep. A row of a round or lot not loaded yet waits (`parked`: 2 min, the newest 5,000) and lands with its day or lot, whose own change reloads; a delete forgets what was parked for its row. Payments match by id or by their flow key (kind, from, to), so the row Dinero lays and the server's insert are one.
  - The structural tables (the tournament row, players, rounds, groups, pairs) reload, coalesced (150 ms). `teams` and `team_members` are not subscribed until migration 0025 publishes them: a team draw shows on the next reload.
  - A fetch (reload, or the gate's `load` of the tournament already open) gets the changes applied since it started (`catchUp`; a delete of a row the boards did not hold is logged only while a fetch is out), so it never takes one back. A visible phone with a live channel and no fetch for five minutes checks it against the server (`HEAL_MS`), never while a fetch is on its way, waiting longer after each failure (10, 20, then 30 min), since a lost change has no sequence to show the gap yet (PLAN §5.2). The gate unsubscribes the store when it goes, and a load still on its way then opens no channel. A channel being left delivers nothing more; leaving clears what it had waiting, a reload it had asked for included.
  - The store keeps the server's rows (`data.base`: what changes apply to and what the phone keeps) apart from what the screens read (`data.snapshot`: `base` plus the outbox overlay). A write the outbox sent lands as the server stored it: each push asks for its rows back (`select()`), and once taken they are applied like a live change, and logged so a fetch on its way replays them, unless the channel already brought their echo (`sameChange`, jsonb in any key order), after which anything newer is in too. A landed score never replaces one the boards hold with a later stamp; the channel's own changes apply in the order they come whatever their stamps, since `updated_at` is when the transaction began and a write that waited on the row's lock commits last with the earlier one. Only what came since the push went out counts as its echo (an identical earlier row is not), echoes parked for a day not loaded included. A fetch that landed while the push was out may have read before the write, after it, or after a later one, and so may an answer older than the change log (2 min): the write lands all the same (a score under its stamp guard), so a hole the phone saved never leaves its boards, and one more fetch says what the server holds, asked once per flush, when it ends; a write that lands while a fetch is out asks for one more after it, and a fetch superseded or failed keeps that ask. These times and the log's age run on `liveClock` (`performance.timeOrigin + performance.now()`), which a clock set back or forward doesn't move. A signature that met the other pair's comes back empty, and a fetch shows theirs. The app's other tabs land them too (BroadcastChannel, with how long ago the push went out, since each tab's clock counts from its own origin, and when the message was posted, so a tab busy when it comes takes the wait off). A tournament left is fetched by nothing. A refused write leaves the boards at once.
- **Writes go through an IndexedDB outbox:**
  - Apply locally first, then push, then retry with backoff.
  - Show a sync chip: "Sincronizado" or "3 pendientes".
- **Conflicts:** per (round, player, hole), the last write wins by server time. Keep both values in the audit log and show a "discrepancia" badge on that hole until the card is signed.
- **Offline shell:** the app shell, fonts, logo, and the last snapshot are cached. The app opens and shows the last known boards with no signal.
- **Target:** under 2 seconds from save on one phone to update on the others.

---

## 9. Screens and UX (copy in Spanish)

Mobile-first and usable one-handed: 48px+ tap targets, high contrast for bright sun, big numerals, no light-gray text.

Bottom tab bar: **En vivo · Tarjeta · Juegos · Dinero · Más**. Tabs and the Juegos sub-tabs show only the modules the tournament has enabled; labels come from the tournament's settings.

**Organizer screens (outside a tournament):** `/` → Mis torneos (list + "Nuevo torneo"), a create wizard (name, logo, dates, course, modules to enable, entry fee, prizes with the balance check), and the join link / code to share.

### 9.1 Entrar
- Reached via `/t/<slug>` or a join code. Shows the tournament's logo and name.
- A grid of the players' faces. Tap yours, enter your PIN, done. The session stays on the device.
- First run shows a short "Agrégala a tu pantalla de inicio" guide with steps for iOS and for Android.

### 9.2 En vivo (home)
- **Top strip:** "Día 1 · En juego", plus where the lead group is ("Hoyo 12").
- **Groom spotlight card:** Nacho's position, today's points, and his last hole.
- **Individual leaderboard:**
  - Each row shows: position (with `T` for ties), a movement arrow, avatar, name, tier badge, "thru", today's points, total points, a "si terminara ahora" money chip, and the initials of his Calcutta owners.
  - Rows re-sort with smooth animation.
  - Tap a row to open the player sheet.
- **Live feed ticker** with light Mexican-Spanish commentary. For example: "Mauricio: birdie en el 7, +3 pts", "La víbora pasa a René en el 14", "¡Cambio de líder! Justo toma la punta".

### 9.3 Tarjeta (score entry)
- Opens on my group's current hole.
- **Hole header:** number, par, stroke index, and optional yardage.
- **For each of the 4 players:**
  - Avatar and name, with dots for strokes received (•, ••, •••).
  - A big stepper for strokes (defaults to par) and a stepper for putts (defaults to 2).
  - A "Levantó" toggle.
  - A live points badge, e.g. "3 pts · birdie neto".
- **Saving:** "Guardar hoyo" saves and moves to the next hole. Swipe between holes.
- **Grid view:** all 18 holes × 4 players with points and totals; missing holes are highlighted.
- **Validation:** strokes 1–15; putts 0–strokes; picking up clears strokes and keeps putts optional. Confirm unusual values (strokes of 10 or more, putts of 5 or more).
- **Snake tiebreak:** when 2+ players take 3+ putts on the same hole, show "¿Quién embocó al último?" before saving that hole.
- **Moments:** confetti on a net birdie or better (on the scorer's phone), and a snake animation that slides to the new holder.
- **Tarjeta cruzada:** the default view is "Llevas la tarjeta de: [pareja rival]", but anyone in the group can enter any of the four players. After hole 18, each pair signs the other pair's card with "Firmar tarjeta", which locks it.

### 9.4 Juegos
Tabs: Individual · Matrimonios · Mejor ronda · Víbora · Putts · Calcutta.
- **Individual:** full table with countback visible on tap.
- **Matrimonios:** pair standings, and each group's head-to-head.
- **Mejor ronda:** today's table.
- **Víbora:** each group's current holder (animated snake icon on his avatar), pass history hole by hole, and "en juego: $600".
- **Putts:** totals, with average putts per hole.
- **Calcutta:** owners and shares, the pot, and live "valor si terminara ahora" per owner.

### 9.5 Jugador (player sheet)
- Scorecard for both days with strokes received, gross, net, points, and putts.
- Playing handicap and its "¿Cómo se calculó?".
- His pair, his owners (and whom he owns), and his money so far.
- His stats.

### 9.6 Dinero
- **Live mode ("si terminara ahora"):** per person, prizes by category plus Calcutta shares, what they paid, and their net.
- **Final mode:** the settlement (section 11), with "Pagado" toggles.
- **Share:** send the settlement as an image or text via WhatsApp.

### 9.7 Stats y premios
- Stats and awards from section 12.
- A cumulative points "race" chart that replays hole by hole across 36 holes.
- A pairs race chart.

### 9.8 Reglamento
All of section 5, rewritten as friendly Spanish copy. This mirrors the printed rules sheet.

### 9.9 Modo TV (`/tv`)
- Full-screen, dark deep-teal theme, huge type, logo, and the wave motif.
- Auto-rotates every ~12 seconds: Individual → Matrimonios → Víbora holders → Calcutta values → Feed.
- On Calcutta night it shows the auction board instead (section 10).

### 9.10 Ceremonia (`/ceremonia`)
The admin taps through reveals, one at a time, each with drama:
1. La Cuchara de Palo
2. Menos putts
3. Víbora totals
4. Mejor ronda (both days)
5. Matrimonios
6. 4th, 3rd, and 2nd place
7. The champion, with confetti and the Putter
8. Calcutta payouts
9. Final money summary

### 9.11 Share cards
One tap generates a branded image of a leaderboard, a player's round, or the settlement, sized for WhatsApp, via the Web Share API.

---

## 10. Calcutta night: auctioneer console and TV board

### Auctioneer console (admin phone)
- **"Sacar del sombrero":** draw the lot order with a shuffle animation, or set it manually.
- **Open lot:** the current bid is $250 by the player himself.
- **Bid buttons:** +$250, +$500, +$1,000, or custom. Pick the bidder by avatar; bidders already at their 3-player limit are disabled. There's an undo for the last bid.
- **"¡Vendido!":** confirm the hammer, then a buyback dialog offers 0%, 25%, 50%, or a custom amount up to 50%, and shows what the player pays his owner.
- **Next lot.**

### TV board
- **Lot card:** photo, tier, playing handicap, form guide, and his pair (if already drawn).
- **Current bid and bidder** with a pulse animation on each new bid.
- **Running pot counter.**
- **Sold list:** each player with owner and price.
- **"Lo que está en juego":** the pot split into the five slots.

### Matrimonios draw (after the last lot)
1. Nacho picks his partner from the eligible tier.
2. The remaining A↔D and B↔C pairs are drawn with a rings animation.
3. Pairs name themselves (editable).
4. The app generates Day 1 groups (random A+D vs B+C) and the Comité sets tee times.

### Payment check
Before everyone goes to bed, the app shows who still owes what for entry and Calcutta, with "Pagado" toggles.

---

## 11. Money and settlement

**Flows**
- **Entries:** $2,500 × 12 to the banker (the banker is a player set in settings).
- **Calcutta:** hammer prices to the banker.
- **Buybacks:** paid player → owner directly; tracked, with "Pagado" toggles.
- **Payouts:** the banker pays each person his prizes plus his Calcutta shares.

**Per person, show**
- Pagó: entry + Calcutta purchases + buybacks paid.
- Recibe: prizes + Calcutta shares + buybacks received.
- Neto: the difference.

**Checks**
- Everything the banker received equals everything the banker pays out. The app asserts this and shows any mismatch in red.

**Settlement modes**
- **Default, "vía banco":** the banker pays each winner, since money was collected up front.
- **Optional, "sin banco":** a minimized list of peer-to-peer transfers (greedy: the largest debtor pays the largest creditor), for when not everyone paid ahead.
- Both run on **what is still due** (2026-10-01, MONEY-01): flows sharing a payment key form an account (owed, paid, due), and what is marked paid is never asked for again. A vía-banco line names the accounts it closes, and «Marcar pagado» records each one in full (`markPaidWrites`); in sin banco the banker carries the bank's position (the cash he holds, the house cut, anything unassigned). While the tournament runs, «Quién debe qué» is the collection list; once it is final, the settlement is the only list.

**Por asignar** (2026-10-08, MONEY-05, COPY-09; `src/engine/core/unassigned.ts`)
- **Play is over** when every planned day exists (`rounds.length >= settings.rounds`) and each is finished or cancelled, whatever the tournament's status. From then on the tournament is final for the engine (`tournamentFinal` = Terminado or play over), so what Terminado would pay is what Dinero shows, and Dinero and the «Cerrar torneo» gate read the same flag (`money.unassigned.closing`) and the same buckets: every day rained out lists the whole pot; a day not created yet lists nothing and the gate says to create it.
- Once play is over, money the rules leave with the bank is listed by pot, one bucket per prize-check line: each module on the entries, each instance game (`game:<id>`, on the entries or its side pot), the Calcutta pot (`calcutta`), and entries no prize claims (`pool`). A bucket is what its line budgets minus what its prizes pay; its explanation names the causes (a cancelled day, places nobody fills, a pot nobody won, a contest in dispute) and `contributors` says who paid into it. The keys never depend on amounts.
- **Snake money an unanswered tiebreak holds is not a bucket** (`held`, keyed `snake:<round>:<group>`): it is that group's survivors' as soon as someone answers «¿Quién embocó al último?», so Dinero lists it apart with that answer as the only way out (no «Decidir»), the verdict says «Esperando un desempate» when it is all that is left, and the snake's line lists only the rest. Before round 2 the two shared the key `snake`, so an answer given after the Comité assigned part of the line moved which decision was paid and could pay a group's money twice.
- Dinero shows the list to everyone, each line with «¿Cómo se calculó?» and «El Comité decide»; the verdict reads «Por asignar: $X» (caution) and is red only when the bank does not square with the list. The Comité decides each line: «Dar a…», «Devolver» (pro rata to the contributors, `proRata`: largest remainders, to the peso) or «A la casa», with a reason; «Anular» with a reason.
- Each assignment (one `call_id`) is checked oldest first against what its bucket still holds: one that fits is a prize (`moduleId: 'adjustment'`, labelled «<línea>, asignado por el Comité» or «…, devolución») that every money screen, the settlement, the share text, the ceremony, the CSV and the published results read; the house's part stays with the banker beside the house cut (`banker.toHouse`). One over what is left («Asignación de más») or whose bucket is gone («Asignación sin pozo») moves nothing and is flagged until voided.
- Dinero also shows, while a day is open again, what the Comité already decided, marked «Se aplica cuando terminen todas las rondas». The «Decidir» sheet reads its line from the live state by key, and before sending fetches the tournament again: a line another Comité phone changed meanwhile is refused («Mientras decidías, cambió…»).
- **«Cerrar torneo»** (`src/engine/close.ts`, `src/components/CloseGate.tsx`): Terminado, «Publicar resultados» and a Ronda rápida's «Terminar y publicar» first check the tournament as it will be once closed and refuse while there are planned days not created, open days, unanswered snake tiebreaks, money por asignar, unpayable assignments, or unsigned cards of finished rounds (when the pairs game signs them). Three things only warn: what people still owe (collecting after the trip is normal), lots never auctioned (they cash nothing, MONEY-11; whether they count as self-owned is Diego's open question, so the gate forces no sale) and open `rejected_writes` (nobody can clear them until the REL-08 inbox exists; the warning sends the Comité to check those holes in Comité › Tarjetas). The gate is client-side; the server does not refuse Terminado on its own yet.

---

## 12. Stats and awards (display only, no money)

**Per player**
- Points per day, and points by par-3 / par-4 / par-5.
- Gross birdies, net birdies, pars, bogeys, double bogeys or worse, and pick-ups.
- Total putts, putts per hole, one-putts, and three-putts.
- Holes spent holding the snake.
- Best and worst hole, and his longest streak of scoring holes.

**Course**
- Average points per hole, and the hardest and easiest holes.

**Automatic awards (fun names)**
- **Rey del Birdie:** most gross birdies.
- **Francotirador:** most one-putts.
- **Mano de Piedra:** most three-putts.
- **El Resucitado:** biggest points gain from Day 1 to Day 2.
- **El Constante:** smallest variance in points per hole.
- **Víbora de Oro:** most holes spent holding the snake.
- **El Inversionista:** best Calcutta return on investment.
- **El Filántropo:** worst Calcutta return on investment.
- **Hoyo Maldito:** the course's lowest-scoring hole.
- **Momento del torneo:** the best single hole of the event (most points; ties go to the harder stroke index).

---

## 13. Comité (admin) console

- **Tournament:** name, brand, dates, settings (section 18) — which modules are on, their parameters and labels — with the prize-sum validation, status transitions, and who the banker is.
- **Course:** tees, and par / stroke index / yardage for each hole on each tee. Allow bulk paste from a scorecard.
- **Players:** names, avatars, tier, base handicap, tee, groom flag, admin flag, PIN reset, and form guide. Show a live preview of 80% and strokes received.
- **Calcutta:** the console from section 10.
- **Matrimonios and groups:** the draw, manual edits, tee times, starting holes, and the Day 2 group generator (default from section 5.5, with an override).
- **Rounds:** start ("En juego"), finish, and cancel.
- **Day 2 handicaps:** after Day 1, review each player's cut and PH2, with overrides.
- **Scores:** edit any score. Signed cards require a reason. Resolve discrepancies and pending snake tiebreaks.
- **Payments:** mark payments as paid.
- **Data:** export all data as JSON and CSV, and restore from JSON.
- **Rehearsal mode:** just another tournament ("Ensayo") with simulated data (section 17). Tournament scoping guarantees it never mixes with the real one; a "Duplicar torneo" action copies settings, course and players (no scores) so a rehearsal is one tap.

### 13b. Course and handicap setup (platform features; first needed for M2)

Three ways to load a course, one place to decide how each player is handicapped. All of it lives in the Comité console and is generic (§0.5): any tournament, any course, any number of tees.

**A. Course search in a golf-course database.**
- A serverless route `api/course-search.ts` proxies a course database so the API key never reaches the browser. Use **GolfCourseAPI** (header `Authorization: Key <GOLFCOURSE_API_KEY>`). Verified live 2026-09-27: `GET /v1/search?search_query=…` returns `{courses:[{id, club_name, course_name, location:{city,country,…}, tees:{male:<count>, female:<count>}}]}` — **tee counts only**; `GET /v1/courses/{id}` returns the full card: per tee `tee_name`, `course_rating`, `slope_rating`, `par_total`, `total_yards` and `holes[]` with `par`, `yardage`, `handicap` (stroke index), split into `tees.male` / `tees.female`. So the UI searches, then fetches the detail for the picked course. Coverage is uneven: **Quivira Golf Club is there (`mz9gqcpj`, 5 men's tees: Black 74.1/142, Gold 72/137, Blue 69.4/131, White 67/120, Red 63.7/107, all par 72); Solmar Golf Links is not** — it's the photo or manual path.
- **Second provider: OpenGolfAPI** (`https://api.opengolfapi.org`, header `Authorization: Bearer <OPENGOLF_API_KEY>`; reads also work keyless, the key raises limits). Verified live 2026-09-27: `GET /v1/courses/search?q=…` → `{courses:[{id, name, course_name, city, latitude, longitude, par, website, phone}], total}`; `GET /api/v1/courses/{id}` → full detail with `tees[]` (`tee_key`, `tee_name`, `tee_color`, `gender`, `course_rating`, `slope`, `par`, `yardage`) and `holes_data[]` (`number`, `par`, `handicap_index` = stroke index, `yardages` keyed by tee color). ~16,800 courses. Data is **ODbL**: when a course is imported from it, store and show the `_attribution` string ("© OpenStreetMap contributors (ODbL 1.0) via OpenGolfAPI") on the course screen. Coverage for our trip: **Solmar Golf Links is listed (`79fb43c9-bd7a-41f1-8c73-ada89472ad9c`) but with no tees or holes**; Quivira is listed (`7166efab-063c-483d-a47d-3d8f82291664`) also without a card. So for this tournament GolfCourseAPI covers Quivira and Solmar still needs the photo.
- **Search both, merge, and be honest about coverage.** `api/course-search.ts` queries both providers in parallel (each behind its own adapter in `src/lib/courseProviders/`; either missing key or failing provider just drops out), de-duplicates by name + distance (< 2 km), prefers the result that has holes, and marks each result **"Tarjeta completa"** or **"Solo ubicación — sube la foto de la tarjeta"**. Picking a location-only result still creates the course (name, city, coordinates, website) and opens the photo upload right there, so the database and the photo path meet in one flow. Adapter pattern: `src/lib/courseProviders/<provider>.ts` mapping the provider's shape to our `Course/Tee/Hole` model, so the provider can change without touching the UI.
- UI: "Buscar campo" → type a name ("Quivira") → pick a result → pick which tees to import → the course lands in `courses`/`tees`/`holes` with `source: 'golfcourseapi'`, `external_id`, and `imported_at`. Show what was imported and let the organizer edit any cell. Missing key or provider down → the button explains "Búsqueda no disponible; sube una foto o captúralo a mano" instead of a dead button.

**B. Scorecard photo → course.**
- "Subir tarjeta" accepts a photo or PDF of a scorecard (the same downscale/HEIC pipeline as attachments). A serverless route `api/scorecard-extract.ts` sends the image to Claude (`@anthropic-ai/sdk`, model **`claude-haiku-4-5`** — Diego's call: the cheapest model that reads a scorecard well, ~$0.01 per card; if a real card comes back wrong twice, raise it to `claude-sonnet-5` in one constant, not per call, the image as a base64 `image` block, structured JSON via `output_config.format` with a JSON schema for `{ courseName, tees: [{ name, color, rating?, slope?, holes: [{ number, par, strokeIndex, yards? }] }] }`) and returns the parsed card plus a `confidence` per tee. The key is `ANTHROPIC_API_KEY` on Vercel only (workspace-scoped, no extra header needed). Verified 2026-09-27: Haiku read an 18-hole test card with 18/18 par and stroke index correct, rating and slope included, ~1,000 input / ~300 output tokens ≈ $0.0025 per card. Without the key the route answers 503 and the UI says "Lectura de tarjeta pendiente".
- The result opens in the course editor **as a draft** ("Revisar antes de guardar"): every hole is editable, the route flags any tee whose pars don't sum to the printed total or whose stroke indexes aren't a permutation of 1–18, and the organizer confirms. Never save straight from the photo.
- Keep the photo as a `documents` row attached to the course (kind `scorecard`) so the Comité can re-check it later.

**C. Manual entry** stays: bulk paste from a scorecard (already in §13) and per-hole editing. All three paths produce the same rows.

**D. Tees per player, per round.**
- `round_tees` (round_id, player_id, tee_id) — which tee each player plays in each round; default comes from `players.default_tee_id` and the round's course. The Tarjeta screen shows each player's par/SI from *his* tee (a par-5 for the back tees may be a par-4 up front).
- Course handicap follows WHS: `courseHcp = round(index × slope / 113 + (rating − par))`, computed per round from the player's tee. When players in one group play different tees, the `(rating − par)` term is what keeps it fair; show it in "¿Cómo se calculó?".
- Then the tournament rules apply on top: playing handicap = `roundHalfUp(allowance × min(courseHcp, cap))`, then the Day-2 cut (§5.2). So the first tournament's "base handicap" becomes: `handicap_index` (or an estimate, below) → course handicap for that day's tee → allowance → cap → cut. The Comité can still override any player's base handicap by hand (`handicap_source = 'manual'`); in that case the manual number is used as the course handicap unchanged, which is how the first tournament's rules sheet read it.

**E. Players without a handicap index: estimate from three scores.**
- Per player, `handicap_source` ∈ `index | estimate | manual`. For `estimate`, the organizer enters three gross 18-hole scores: **buen día, día normal, mal día**, and for each (optional) the tee's rating/slope and par where they were shot (defaults: rating = par, slope = 113, par 72 → "asumido", shown as such).
- Differential per score: `d = (gross − rating) × 113 / slope` (the WHS score differential).
- Estimated index: `index ≈ 0.45·d_good + 0.40·d_avg + 0.15·d_bad`, rounded to 1 decimal, capped at `handicap.cap`. Rationale: a WHS index is the average of the best 8 of the last 20 differentials, which sits between a golfer's good and typical days; the weights encode that (a "bad day" mostly confirms the spread). The weights live in settings (`handicap.estimateWeights`), and the UI shows the three differentials and the weighted result under "¿Cómo se calculó?", labelled **"estimado"** everywhere the handicap appears (badge on the leaderboard row and the player sheet) until the Comité confirms or overrides it.
- Sanity rails: any score below par − 5 or above par + 60 asks "¿Seguro?"; if `d_good > d_avg` or `d_avg > d_bad` (scores entered in the wrong order) sort them silently and say so.
- Engine tests (add to §6): `(75, 82, 90)` on rating 72.0 / slope 113 → differentials 3.0 / 10.0 / 18.0 → index 8.05 → **8.1**; the same scores on rating 71.2 / slope 128 → 3.35 / 9.53 / 16.60 → 7.81 → **7.8**; `(98, 105, 115)` par 72 defaults → 26.0 / 33.0 / 43.0 → 31.35 → **31.4**; `(120, 130, 140)` → capped at 54; course handicap: index 8.1, slope 128, rating 71.2, par 72 → `8.1 × 128/113 + (71.2 − 72) = 8.37` → **8**; index 20 on slope 113 rating 72 par 72 → **20**.

**Where it lands in the milestones:** the engine parts (course handicap, estimate, per-round tees in strokes received) are M1; the two import routes, the review-draft editor and the player handicap form are M2; both keys are on `docs/handoff.md`.

---

## 14. Brand and design system

> **Superseded (2026-09-27).** The platform brand was redefined in the redesign: `DESIGN_DIRECTION.md` (direction A, "La tarjeta") is the source of truth for tokens, type, spacing, motion and voice, `src/styles/tokens.css` holds every value, and `DESIGN_NOTES.md` records the decisions and the term table. The tokens, fonts and tone below describe the first tournament's printed sheet and now apply only as that event's personalization (its logo and accent); read the rest of this section as history.

The look comes from the tournament's printed rules sheet: beachy, editorial, premium. It sits close to Cardigan's warm cream/teal and Fraunces aesthetic, but it's its own brand.

**Logo:** per tournament (`tournaments.logo_url`); shown on Entrar, the headers, TV mode, and share cards. The platform's own mark is the Polo lockup: a cursive P drawn in one pencil line plus the word "Polo", lifted off the approved sheet `design/brand/polo-logo-sheet.jpg` (the sheet's own pencil pixels, each use from its own copy) by `scripts/brand/extract-logo.py` and rendered by `npm run icons` (see DESIGN_NOTES.md, "Logo"). `assets/nacho-logo.png` (an embroidered patch cut out on a transparent background) is the first tournament's logo: seed it into that tournament's storage, don't bake it into the shell.

**Color tokens**
```css
--paper:   #F7F1E3;  /* background (sand) */
--panel:   #EFE5CF;  /* cards / callouts */
--cell:    #FBF7EE;  /* inputs, table cells */
--ink:     #12343B;  /* primary text */
--muted:   #4F6166;  /* secondary text (never lighter) */
--teal:    #0F6E77;  /* primary accent */
--deep:    #0B4F57;  /* feature blocks, TV background */
--coral:   #B04327;  /* secondary accent, alerts, Cuchara */
--sun:     #F2B63F;  /* highlights on dark backgrounds */
--hair:    #CDBF9F;  /* hairlines */
--seafoam: #A9DCD8;
--midteal: #3AA6AE;
```

**Type**
- **Fraunces 600:** display, headings, and all big numbers.
- **Instrument Sans 400/700:** UI and body.
- Scores and money use tabular numerals.
- Labels are small caps with letter-spacing.

**Motifs**
- A thin teal wave line as a divider.
- Numbered sections (01, 02…).
- Rings for Matrimonios, a snake for La Víbora, a putter for the champion, a wooden spoon for last place.

**Tone**
- Fun, Mexican Spanish, light roasting (e.g., "Sí, cómo no"). Never mean.
- Money copy is always crystal clear.

**Motion**
- Smooth leaderboard re-sorting, number count-ups, and confetti on birdies and the champion.
- A snake that slides between avatars, a gavel hit and pot counter for the auction, and a rings animation for the draw.
- Keep it fast; respect `prefers-reduced-motion`.

**Accessibility:** contrast of at least 4.5:1, visible focus states, and screen-reader labels on steppers.

---

## 15. Seed data and what's still unknown

**Players** (11 known; one to be confirmed):
1. Andrés Gutierrez
2. Diego Arámburu
3. Diego Ortiz Tirado
4. Emiliano Garzón
5. Justo Fernández Del Valle
6. Martín Álvarez
7. Mateo Castro
8. Mauricio Lozano
9. Nicolás Castro
10. René Nosti
11. Rodrigo Vega
12. [JUGADOR 12], to be confirmed

**To be confirmed** (the admin UI must let Diego enter all of these without code changes):
- Which player is Nacho (the groom), since he may be the 12th player.
- Tiers and base handicaps.
- Both scorecards: Solmar Golf Links (Day 1) and Quivira (Day 2) — tees, par and stroke index per hole. Everything else about the schedule is confirmed (§2).
- Tee times per group (first tee 09:00 both days; the three groups follow).
- The banker and the Comité members.

---

## 16. Milestones and acceptance criteria

**M0: Setup**
- Repo, Supabase project and Vercel project already exist (§3); wire the env vars, the keep-alive cron for the free Supabase project, and CI running tests on push.
- Engine module seam and settings schema (with Zod or similar) so every later milestone plugs into it.
- PWA shell, fonts, tokens, and logo.
- Done when: a deployed preview URL is installable on Diego's phone.

**M1: Engine**
- `src/engine/` implementing all of section 5 as core + modules, plus every test in section 6, the per-module "disabled" tests, the minimal-tournament test (§0.5), and the course-handicap / estimate tests (§13b-E).
- Done when: all tests pass and Diego gets a short plain-Spanish summary of the rules as coded.

**M2: Data and auth**
- Schema, RLS, triggers, audit log, organizer sign-in, Mis torneos + create wizard, join link/code, PIN login, and the admin basics (players, course, tees, settings, modules) — including course search, scorecard-photo import with the review draft, per-player tees per round, and the handicap form with the three-score estimate (§13b).
- Done when: Diego signs in as an organizer, creates a tournament from the wizard, sets a PIN for a test player, who then joins by code on another phone — and a second tournament created the same way cannot see the first one's data (an RLS test proves it).

**M3: Score entry and live board**
- The Tarjeta screen, Realtime, the offline outbox, the individual leaderboard, the player sheet, and "¿Cómo se calculó?".
- Done when:
  - 4 phones enter scores at the same time and the others update in under 2 seconds.
  - Airplane-mode entry syncs correctly on reconnect.

**M4: All the games**
- Matrimonios, best round, La Víbora (with the tiebreak prompt), fewest putts.
- The Day 2 cut and group generator, card signing, and discrepancy handling.
- Done when: a full simulated 2-day tournament produces the correct standings and prizes, cross-checked against a hand calculation for at least one group.

**M5: Calcutta night and money**
- The auction console, the TV board, buybacks, the Matrimonios draw, Calcutta payouts, and Dinero with the settlement.
- Done when: a rehearsal auction with 12 lots runs end to end and the money balances to the peso.

**M6: Dazzle**
- The feed, all animations, stats and awards, race charts, share cards, TV mode, Ceremonia, and Reglamento.
- Done when: Diego says "wow" on his phone and on a TV.

**M7: Rehearsal and hardening**
- The simulator, a full rehearsal tournament, the runbook, backup export, and printable fallback scorecards (PDF, with stroke dots per player).
- Done when: the rehearsal passes and the runbook is written.

---

## 17. Testing, rehearsal, and tournament-day runbook

**Simulator.** A script that generates realistic rounds from each player's handicap:
- Gross over par per hole scales with handicap and stroke index, plus noise.
- The chance of a 3-putt rises with handicap.
- Pick-ups happen occasionally.
- It can play in real time (one hole every N seconds per group) so everyone can watch the live boards move during a rehearsal.

**Rehearsal.** A separate "Ensayo" tournament where Diego and 2–3 friends test on real phones before the trip.

**Runbook.** A one-page `RUNBOOK.md` in Spanish, covering:
- The pre-trip checklist: handicaps locked, course loaded, PINs sent, app installed on all 12 phones.
- Calcutta night, step by step.
- Starting a round.
- Fixing a wrong score.
- What to do with no signal (keep entering; it syncs later).
- What to do if the app goes down: use the paper fallback cards, then have the admin bulk-enter.
- Closing a round: signatures, lock, Day 2 handicaps, Day 2 groups.
- The ceremony and final settlement.
- Exporting a backup.

---

## 18. Open questions: build each as a setting with this default

1. **Picked-up holes for Menos putts:** count 3 putts. A pick-up does not pass the snake unless the player actually entered 3 or more putts. *(Comité to confirm.)*
2. **Ties after countback** in best round, Matrimonios, and fewest putts: split.
3. **Does a self-owned lot count toward the 3-player limit?** Yes.
4. **Can guests bid in the Calcutta?** No.
5. **Day 2 groups that aren't one A+D pair plus one B+C pair:** keep the standings order and show a warning.
6. **Rounding of the 80%:** half up to a whole number.
7. **A player who doesn't finish:** unplayed holes score 0 points and the Comité can void. His snake group settles when the others finish.
8. **A cancelled round (weather):** the admin marks it cancelled, and the app previews prizes on the rounds played. The Comité decides.
9. **Spectator link** (read-only, no money): nice-to-have. Ask Diego.
10. **Custom domain:** ask Diego.

Settings object shape. These are the **first tournament's** values; the platform ships the same shape with `modules` all off except `individual`, and the create wizard fills the rest. Every module carries `enabled` and `label`:
```json
{
  "modules": {
    "individual": { "enabled": true, "label": "Individual", "format": "stableford" },
    "bestRound": { "enabled": true, "label": "Mejor ronda" },
    "pairs": { "enabled": true, "label": "Los Matrimonios", "pairing": [["A","D"],["B","C"]], "honoreePicks": true },
    "snake": { "enabled": true, "label": "La Víbora", "puttsThreshold": 3 },
    "fewestPutts": { "enabled": true, "label": "Menos putts" },
    "auction": { "enabled": true, "label": "La Calcutta" }
  },
  "tiers": ["A", "B", "C", "D"],
  "rounds": 2,
  "labels": { "lastPlace": "La Cuchara de Palo", "honoree": "El novio", "trophy": "el Putter" },
  "entryFee": 2500,
  "handicap": { "allowance": 0.8, "cap": 54, "rounding": "halfUp" },
  "day2Cut": { "threshold": 36, "pointsPerStroke": 2, "maxStrokes": 4 },
  "prizes": {
    "stableford": [10000, 5000, 3000, 2000],
    "matrimonios": [2000, 1000],
    "bestRoundPerDay": 1200,
    "snakePerSurvivor": 200,
    "fewestPutts": 1000
  },
  "auction": {
    "openingBid": 250, "increment": 250, "maxPlayersPerOwner": 3,
    "selfOwnedCountsTowardMax": true, "guestsCanBid": false, "buybackMaxPct": 50,
    "payout": [
      { "slot": "place", "place": 1, "share": 0.55 },
      { "slot": "place", "place": 2, "share": 0.20 },
      { "slot": "bestOfTier", "tier": "C", "share": 0.10 },
      { "slot": "bestOfTier", "tier": "D", "share": 0.10 },
      { "slot": "lastPlace", "share": 0.05 }
    ]
  },
  "pickupPuttsForFewestPutts": 3,
  "tieFallback": "split",
  "timezone": "America/Mazatlan",
  "currency": "MXN"
}
```

The prize-sum check (§5.8) validates against the enabled modules only: `entryFee × players` must equal the sum of the enabled modules' prizes.

---

## 19. Start here

Your first reply to Diego must contain:

1. **Your understanding** of the product in about 10 bullets, in Spanish: the platform first (§0.5), then the first tournament as its configuration.
2. **The architecture** as a short text diagram: client, engine core + modules, Supabase (tournament-scoped), Realtime, outbox, Vercel.
3. **The milestone plan** (M0–M7), with what you'll need from Diego at each step.
4. **Everything you need from Diego right now**, as a checklist. Build it from `docs/handoff.md`, which already holds most of it, and add anything missing there too:
   - A decision on the Supabase project (the org's free slots are full; see handoff).
   - The logo file.
   - The course scorecard (par and stroke index per tee).
   - Tiers and base handicaps.
   - Dates, the 12th player, which player is Nacho, the banker, and the Comité.
   - Answers to section 18, or permission to keep the defaults.

The GitHub repo, the Vercel team, and access to the Cardigan/Angus repos (via `add_repo`) are already available, so don't ask for them.

Then wait for Diego's OK and start M0.
