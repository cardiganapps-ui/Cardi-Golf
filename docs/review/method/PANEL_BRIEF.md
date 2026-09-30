# Polo deep panel review: shared brief (read all of it before you start)

`$S` below means `/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad`.

Date: 2026-09-30. Repo `/home/user/Cardi-Golf`, HEAD `379ed5267a3660434068f6a71454a6f4e20a22db` (= `main`, and = the production deployment `dpl_Gucv6ydesYoW1Fq4TWjoUXFV23o4` on https://golf.cardigan.mx). CLAUDE.md is the product brief; you already have it in context.

## 1. The mandate (the owner's words)

You sit on an independent review panel for **Polo**, a platform for running amateur golf tournaments among friends: live scoring, side games, a Calcutta auction, money tracking and settlement, and a social layer (profiles, Polo index, rivalries, crews, Ronda rápida). Its first real event is Nacho's Bachelor Invitational in Los Cabos, 8–11 April 2027, with real money moving between twelve friends.

The owner's bar is explicit: **Polo must hold up next to products built by billion-dollar companies with large engineering and design organizations.** Grade against that bar, not against "good for a small team", "good for an MVP" or "good for AI-assisted code". Effort, intent and documentation earn no credit; only the shipped product and the code behind it do.

Be critical. Your job is to find what is wrong, weak, inconsistent, slow, fragile, confusing or merely adequate, and say how to make it excellent. Praise is allowed only where it is specific and earned, and it never offsets a finding. When in doubt, grade down and say why.

Every panelist also answers: **"What would the equivalent team at a world-class company do here that Polo does not?"**

## 2. Ground rules (binding)

1. **Review only. Change no product code.** You create files only in your scratch area and, for screenshots you cite, in `docs/review/2026-09-30/shots/`.
2. **Evidence or it didn't happen.** Every finding cites at least one of: `file:line`, a command and its output, a screenshot path, a SQL query and its result, or a reproducible step list. No finding rests on "typically", "might" or "best practice says" alone.
3. **Verify before you report.** Mark a finding CONFIRMED only if you reproduced or proved it; otherwise PLAUSIBLE plus what would confirm it. Every P0/P1 will be re-checked afterwards by a separate agent that tries to disprove it, so give an exact, fast repro.
4. **Data safety.** Never write to, delete from or overwrite any real tournament. Live writes only to the **Ensayo** tournament (`/t/ensayo`), throwaway objects you create and then delete, the in-memory fixtures, or the local Postgres harness. Never print secrets, keys, tokens, PIN hashes or real people's personal data into logs, screenshots or files; if a probe succeeds in reading data it shouldn't, record counts and column names, never values. Nothing that costs money. Don't create real email accounts on production.
5. **Know the history.** `docs/audit-2026-09-28.md`, `DESIGN_AUDIT.md`, `DESIGN_DIRECTION.md`, `DESIGN_NOTES.md`, `RUNBOOK.md`, `docs/handoff.md`. For every earlier finding in your area, say whether it is **fixed** (cite the fix), **partly fixed**, **still open**, or **regressed**. Don't re-report a fixed item as new. A regression is automatically one severity higher.
6. **Judge the brief, then judge the brief itself.** Check the product against CLAUDE.md and DESIGN_DIRECTION.md, and also say where the spec or the design direction is itself the weakness.
7. **No grade inflation.** An A is rare and must be defended with evidence.

## 3. Shared-environment rules (about 20 agents share one 4-CPU container and one working tree)

- Never modify, create or delete files inside `/home/user/Cardi-Golf`, except screenshots under `docs/review/2026-09-30/shots/`. **No git command that changes the working tree, index, refs, stash or config** (checkout, switch, stash, reset, restore, clean, add, commit, merge, rebase, pull, fetch into branches, push, config). Read-only git (log, show, diff, blame, grep, ls-files) is fine.
- Don't run `npm run build`, `npm run preflight`, a bare `vite build`, `npm install` or `npm ci` in the repo (they write `dist/` or `node_modules/` that others are using). If you truly need a build, `npx vite build --outDir <your scratch dir> --emptyOutDir` with the env from `.env.example` (`set -a; . ./.env.example; set +a`). If you need an extra npm package, install it in your own scratch dir (`npm init -y && npm i <pkg>` there), never in the repo.
- Your scratch area: `$S/panel/evidence/<CODE>/`. `$S/node_modules` is a symlink to the repo's `node_modules`, so a script anywhere under `$S` can `import` repo packages (playwright-core, @supabase/supabase-js, sharp, zod, vitest…). To run vitest on scratch tests, give vitest a config in your scratch dir with `root: '/home/user/Cardi-Golf'` and an absolute `test.include`, and import repo code by absolute path; never put temp files under `src/`.
- Don't kill processes you didn't start. The shared preview server on `:4173` must stay up. If `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/` isn't 200, restart it in the background: `cd /home/user/Cardi-Golf && npx vite preview --outDir $S/dist-design --port 4173 --strictPort --host 127.0.0.1` (a second restart attempt fails harmlessly on --strictPort).
- Your own servers: port `4180 + your panelist number`. Your own Postgres cluster (only if the shared harness is unusable): port `5440 + your panelist number`.
- CPU is shared. Avoid long CPU-bound loops. For timing measurements, record `uptime` load alongside, repeat at least 3× and report the median; say when contention may distort a number.

## 4. Environment facts

- Node 22. Chromium: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (`import { chromium } from 'playwright-core'; chromium.launch({ executablePath })`). The sandbox's egress-proxy CA is trusted in Chromium's NSS store, so Chromium reaches golf.cardigan.mx and Supabase directly (HTTP and WebSocket). Node's own `fetch` needs `NODE_USE_ENV_PROXY=1` to go through the proxy. Lighthouse 12.8.2 is installed at `$S/lh` (`CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx --prefix $S/lh lighthouse …`).
- **Shared preview server `http://127.0.0.1:4173`** serves HEAD built with `VITE_DESIGN_ROUTES=1` and the public Supabase URL/anon key from `.env.example`. Fixture routes are in-memory (no DB): `/fixture` (index), `/t/_/<fixture>` plus `/tarjeta`, `/juegos`, `/dinero`, `/stats`, `/reglamento`, `/mas`, `/tv`, `/ceremonia`, `/imprimir`, `/admin/<torneo|jugadores|campos|rondas|grupos|handicaps|juegos|scores|calcutta|parejas|equipos|historial|datos>`; `/organizer/nuevo/_` (wizard demo); `/p/_/<name>`, `/p/_/<name>/vs`, `/p/_/<name>/anio`; `/amigos/_`, `/avisos/_`, `/ronda/_`, `/c/_`; `/admin/_/<resumen|torneos|personas|campos|crews|avisos|auditoria|salud>` (platform panel). Fixture names: `src/dev/fixtures.ts` (`FIXTURE_NAMES`): minimal4-setup, minimal4-live, gloria4, full12-live, full12-finished, pairs8, friends8, large60, longnames, stroke8, match8, team8, bracket8, and more. The real app routes (`/`, `/t/ensayo`, `/entrar`, `/organizer/login`…) work on the same server against production Supabase.
- Production https://golf.cardigan.mx runs the same SHA. A Vercel preview with fixture routes: https://cardi-golf-1e4qmkq53-cardiganapps-4938s-projects.vercel.app (the PR build of the same change).
- **Live data you may touch: only Ensayo** (`/t/ensayo`). Its admin player **"Nico"** (PIN in `$ENSAYO_PIN`, never in the repo) is what `e2e/smoke.mjs` uses; don't lock it out (never brute-force Nico's PIN). Only the reliability panelist (REL) may change Ensayo's round status, run its auction or draw, or restore its backup, and must put it back as found; everyone else uses fixtures or the local harness for those flows and may, at most, enter scores on Ensayo.
- Anonymous sign-ins on production are rate-limited per IP and shared by every reviewer: reuse a browser context or storage state; never loop sign-ins.
- **Not available in this container:** `SUPABASE_SECRET_KEY` (service role), `SUPABASE_PAT` (Management API), `VERCEL_TOKEN`, `CRON_SECRET`, `PUSH_DISPATCH_SECRET`, R2, Anthropic and golf-API keys. So `scripts/rls-test.mjs`, `scripts/platform-test.mjs`, `e2e/platform.mjs` and `e2e/profile.mjs` exit 1 ("Missing … SUPABASE_SECRET_KEY"); the Supabase advisors can't be pulled from the Management API; the Supabase MCP connector is denied on this project. You do have the public anon key (`.env.example`): you can act as an anonymous user against production. The Vercel MCP connector is read-only (deployments, runtime logs, project config): load its tools with ToolSearch if useful (team `team_0rR9OfIKmnJ8xFDrOXUkHcT3`, project `prj_8JpqrzlqS3ZkYJB8JPlb35EvC9ZU`).
- **Local Postgres harness:** Postgres 16 binaries at `/usr/lib/postgresql/16/bin`. A shared harness (Supabase-compatible stubs + all 24 migrations) is being built at `$S/pg/`. When `$S/pg/READY` exists, `$S/pg/README.md` explains how to get your own database (`$S/pg/bootstrap.sh <yourdb>`), how to act as anon/authenticated/a specific user, and seeds. Use your own database name; never drop or alter someone else's. If you need it before it's ready, do static work first and check again later.

## 5. Baseline already measured (don't re-run unless you need detail)

- **preflight:** exit 0 in 46 s. typecheck ✓; lint ✓ (0 errors, 12 `react-refresh/only-export-components` warnings); test ✓ (48 files, 339 tests, 8.0 s); build ✓ (9.3 s). Chunks: `index-2HR7w7Fz.js` 1,069.46 kB (gzip 342.78 kB, triggers Rollup's >500 kB warning); `StatsScreen` 367.97 kB (gzip 108.22 kB); `index.css` 74.34 kB (gzip 13.87 kB); `AdminTournament` 30.6 kB; `DesignScreen` 38.3 kB, `platformFixtures` 12.8 kB and `socialFixtures` 5.3 kB are emitted in the production build. PWA precache: 78 entries, 2,382 KiB. Log: `$S/baseline/preflight.log`.
- **e2e smoke** (`npm run e2e`, Ensayo, against :4173): 20/20 ✓ in 40 s. Log `$S/baseline/e2e-smoke.log`, screenshots `$S/baseline/e2e-smoke/`.
- **e2e:profile, e2e/platform.mjs, rls-test.mjs, platform-test.mjs:** not runnable here (missing SUPABASE_SECRET_KEY).
- **npm audit --omit=dev:** 0 vulnerabilities. **Outdated majors:** eslint 10, @eslint/js 10, eslint-plugin-react-hooks 7, eslint-plugin-react-refresh 0.5, globals 17, @types/node 26, @vitejs/plugin-react 6, motion 13, react-router 8, typescript 7, vite 8, vitest 5, sharp 0.35.
- **Lighthouse 12.8.2, mobile, simulated 4G + 4× CPU** (reports `$S/lh/*.report.json|html`):
  - prod `/`: Perf 77, A11y 100, BP 100, SEO 92; FCP 1.4 s, LCP 3.7 s, TBT 480 ms, CLS 0.035, SI 1.9 s, TTI 5.2 s, 572 KiB.
  - prod `/t/ensayo` (Entrar): Perf 76, A11y 100, BP 100; FCP 1.2 s, LCP 5.5 s, TBT 180 ms, CLS 0.03, SI 3.5 s, TTI 5.5 s, 1,464 KiB.
  - preview `/t/_/full12-live` (fixture): Perf 52, A11y 95, BP 100; FCP 4.7 s, LCP 5.8 s, TBT 530 ms, CLS 0.001, SI 5.6 s, 563 KiB.
- **CI:** `.github/workflows/ci.yml` (job `check` = preflight with placeholder Supabase env); `keepalive.yml` (daily REST ping 11:17 UTC).
- **Screenshots:** the canonical set is being produced into `docs/review/2026-09-30/shots/`, indexed in `$S/shots-index-A.md` and `$S/shots-index-B.md`.

## 6. Severity

- **P0:** wrong money, lost or corrupted data, a security hole with real impact, or a core flow that fails on the day.
- **P1:** must fix before the trip; a clear defect or a gap a top company would never ship.
- **P2:** meaningful quality improvement.
- **P3:** polish and nits.

## 7. Grading anchors (for your area grade)

A 90–100: indistinguishable from a flagship product at a top-tier company; a specialist from Apple, Stripe or Linear would find nothing above a nit. B 80–89: strong and professional; a few issues a top team would fix before launch. C 70–79: works and is competent, but visibly below the flagship bar; several real gaps. D 60–69: functional with serious gaps; would not pass a launch review at a top company. F <60: unsafe to ship for this area, or broken in core paths. Any open P0 caps its area at 69.

Areas (use these exact strings in `area`): "Correctness of rules and money", "Security and privacy", "Reliability, offline and realtime", "Architecture and code quality", "Data layer and database", "Performance", "Testing and delivery", "Visual design and brand", "Interaction design and core flows", "Accessibility", "Copy and voice (es-MX)", "Mobile and PWA experience", "Product coherence and strategy".

## 8. Output protocol (strict)

Write two files, and write them **as you go** (append/rewrite periodically) so your work survives if you run out of context:

1. `$S/panel/<CODE>.findings.json`: a JSON array. Each element:
```json
{
  "id": "<CODE>-01",
  "title": "short statement of the defect",
  "severity": "P0|P1|P2|P3",
  "verdict": "CONFIRMED|PLAUSIBLE",
  "area": "<one of the 13 area strings>",
  "status": "new | still open (<earlier ref>) | partly fixed (<earlier ref>) | regressed (<earlier ref>)",
  "evidence": ["src/x.ts:120 — what it shows", "command → key output", "docs/review/2026-09-30/shots/…png", "steps…"],
  "impact": "concrete: who is hurt, when, how badly (e.g. 'the organizer pays $1,800 to the wrong person')",
  "recommendation": "the specific fix, where it goes, and the test that would have caught it",
  "effort": "S|M|L",
  "repro": "exact commands or steps a skeptic can run in ≤10 minutes to reproduce"
}
```
   Effort: S under 2 hours, M under a day, L multi-day. Validate the file parses (`node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <file>`).
2. `$S/panel/<CODE>.md`: (a) your area grade(s): 0–100, letter, one paragraph citing the finding IDs that drive it (a panelist whose work spans two areas may grade both); (b) your answer to "What would the equivalent team at a world-class company do here that Polo does not?"; (c) enhancement ideas (not defects), each with expected payoff and effort; (d) what is already excellent, only where specific and earned; (e) status of earlier findings in your area (fixed / partly fixed / still open / regressed, with evidence); (f) method: what you ran, and what you couldn't check and why.

Screenshots you cite go in `/home/user/Cardi-Golf/docs/review/2026-09-30/shots/`, named `<route>-<fixture>-<device>-<theme>.png` (route with `/` turned into `_`, e.g. `t_tarjeta-full12-live-15pro-light.png`; add `-<state>` before `.png` for a state). Devices: `se` 375×667, `15pro` 393×852, `android` 412×915, `ipad` 1024×1366, `laptop` 1440×900, `tv` 1920×1080. deviceScaleFactor 2 for phones, 1 otherwise; viewport-only unless the finding needs the full page. Then compress them: `node $S/tools/compress-png.mjs <files>`. Don't overwrite a file another agent made; pick a new state suffix instead.

Scope: be exhaustive in your area (typically 15–40 findings), quality over quantity, and keep P3 nits to roughly a quarter of your list. Findings outside your area are welcome if you have hard evidence; label them with the right area.

**Your final message is your return value and must be short (≤ 400 words):** area grade(s), counts by severity, and one line per P0/P1 (`id — title`). Everything else lives in the two files.

Panelist codes: ARCH (1, architecture), MONEY (2, rules and money), SEC (3, security), DB (4, database and platform), REL (5, offline/realtime/reliability), PERF (6, performance), QA (7, quality and tests), VIS (8, visual design), UX (9, interaction design), MOT (10, motion), A11Y (11, accessibility), COPY (12, es-MX copy), PWA (13, mobile and PWA), STRAT (14, product strategy), TRUST (15, trust, privacy, compliance).
