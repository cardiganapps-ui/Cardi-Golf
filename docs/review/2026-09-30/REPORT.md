# Polo: deep panel review, 2026-09-30

Review of commit `379ed52` (identical to production at https://golf.cardigan.mx) by an independent panel of fifteen specialists. Every P0 and P1 was re-checked by a separate agent that tried to disprove it. Graded against the owner's bar: **hold up next to products built by billion-dollar companies**.

## 1. Executive summary

**Overall grade: 59/100 (F), on the D/F boundary.** The cap from open P0s in areas 1 and 3 (69) doesn't bind, because the weighted score is already below it.

**Launch verdict for Los Cabos: Not ready today. Ready with conditions** if every P0 is fixed by **15 Nov 2026**, the trip-critical P1s by **31 Jan 2027**, and two rehearsals with twelve real phones pass on **13–14 Feb** and **13–14 Mar 2027** (§8).

Polo has two parts, and they are very different. The rules engine and the tenant boundary are flagship-grade. An independent re-implementation of the rules agrees with the engine on 3,000 random tie-heavy copies of the first tournament, and the full schema, replayed locally, held against every cross-tournament attack the panel tried. Around that core, the parts people touch on the day fail in core paths, and nothing in CI or production would notice.

**Eleven P0s.** Six hit the first tournament directly: live updates, the settlement, cross-card overwrites, a lost correction, a dead-zone session lapse, and Comité typing. Five hit formats and paths the platform ships to other tournaments: 9-hole rounds, stroke play, team format with a Calcutta, team draws, and restore.

**The five things that matter most**

1. **Live updates are dead in production.**
   - **Since 29 Sep (#51):** the Realtime channel includes two tables that were never published. The server refuses the whole subscription, yet the header says «En vivo». Phones and the TV never update (REL-01).
   - **The fix:** one line.
   - **Even fixed, the design misses the 2-second target.** It re-downloads the whole tournament on every change: 4.1 s p50, and with twelve phones refetching at once, 10 of 12 timed out (REL-11, PERF-07, DB-12).
2. **The settlement tells the banker to collect twice.**
   - **Following it breaks every balance:** if the banker collects everything on Calcutta night, as the brief and RUNBOOK say, and then follows «Vía banco», all twelve players end with the wrong amount. The bank keeps $48,400 instead of $2,400 (MONEY-01).
   - **«Pagado» can't be recorded or undone:** it never sticks for payouts, and a mistaken tap can't be reversed (MONEY-04, UX-21).
3. **Scores can be lost or overwritten without anyone knowing.**
   - **Two phones keeping the same card:** real scores are overwritten with par defaults (REL-05).
   - **A quick correction during a sync:** it is dropped while the chip says «Sincronizado» (ARCH-01).
   - **A session that expires in a dead zone:** the phone re-signs in anonymously and its queued holes are rejected (REL-16).
   - **A second tap on «Guardar hoyo»:** it writes a phantom hole (UX-02, PWA-01).
4. **The Comité can't type.** In Comité sheets only the first character sticks, so a handicap override of 13 saves as 1 and a score correction of 10 saves as 1. It's a regression from a focus fix (UX-01).
5. **Nothing would catch the next one.**
   - No crash or sync telemetry (STRAT-02).
   - Migrations run for the first time in production (DB-09).
   - `main` is unprotected, and production deploys before CI finishes (QA-10).
   - No browser test runs in CI (QA-11).
   - The restore path regressed (DB-02), and there is no disaster-recovery drill (DB-07).
   - The repository is public although the brief says it's private (CHAIR-02).

**How far is Polo from a flagship product, and what closes the gap fastest?** Polo is several quarters of disciplined work from flagship, not a rewrite. Its engine and data boundary already meet the bar, but the sync layer, the money settlement and the show surfaces (TV, Ceremonia, Comité forms) fail in core paths that no gate would catch. The fastest way to close the gap is to stop adding surface for six weeks, fix the eleven P0s behind real gates (most are S or M effort), and prove it in two rehearsals with twelve real phones. The gates are the fixture routes and the Postgres harness this panel built, running in CI as browser, visual, accessibility and SQL tests.

**About this copy.** The repository is public (CHAIR-02), so the reproduction details of security-sensitive findings are withheld from this committed copy and kept in the private report page. Every finding is still listed with its severity, verdict and fix.

## 2. Resumen para Diego

**Calificación general: 59 de 100.** Hoy la app no está lista para Los Cabos, pero lo que falta se puede arreglar a tiempo.

**Lo que está bien:** las reglas y los premios se calculan correctamente. Lo comprobamos con miles de torneos simulados. Además, nadie puede ver los datos de otro torneo.

**Lo urgente:**
1. **Desde el 29 de septiembre los teléfonos no se actualizan solos.** Un celular no ve los hoyos que captura otro, y la tele tampoco. La app dice «En vivo», pero no lo está. Se arregla con un cambio de una línea y hay que hacerlo ya.
2. **La liquidación cobra dos veces.** Si el banquero cobra todo la noche de la Calcutta y después sigue la lista «Vía banco», el dinero les sale mal a los doce. Además, «Pagado» no se queda marcado en los pagos del banco y no se puede deshacer.
3. **Se pueden perder o pisar hoyos sin que nadie se entere.** Pasa cuando dos teléfonos llevan la misma tarjeta, cuando alguien corrige muy rápido, o cuando se va la señal justo cuando la sesión se renueva.
4. **En el Comité, al escribir un número solo se guarda el primer dígito.** Un 13 se guarda como 1.
5. **Si algo falla en un teléfono, no hay forma de enterarse.** Y el repositorio del código es público, aunque la guía dice que es privado. Cualquiera puede leer los nombres de los doce, tu correo y los datos de la reservación del viaje.

**El plan:**
- Lo urgente, antes del 15 de noviembre.
- Lo importante, antes del 31 de enero.
- Dos ensayos con doce teléfonos reales: el 14 de febrero y el 14 de marzo.
- Nada de cambios a la app a partir del 25 de marzo.

**Decisiones que te tocan a ti:**
- Hacer privado el repositorio.
- Pagar Supabase Pro solo para abril, para tener respaldos automáticos.
- Revisar con un abogado el aviso de privacidad y cómo se presenta el dinero de la Calcutta.

## 3. Scorecard

| # | Area | Weight | Score | Letter | Cap | Why |
|---|---|---:|---:|:---:|---|---|
| 1 | Correctness of rules and money | 15% | **58** | F | 69 (P0 open) | The engine matches an independent oracle on 3,000 tournaments, but the settlement people pay by is wrong when followed (MONEY-01), «Pagado» for payouts never sticks (MONEY-04), and three configurations the UI offers pay wrong money (MONEY-02/03/20) |
| 2 | Security and privacy | 12% | **67** | D | — | Authorization proven flagship-grade on a full replica; the privacy layer fails on first read (TRUST-01…05), the repository is public (CHAIR-02), and integrity/griefing P2s remain (SEC-02, SEC-04) |
| 3 | Reliability, offline and realtime | 12% | **46** | F | 69 (P0 open) | Live updates dead in production (REL-01); scores overwritten (REL-05), dropped (ARCH-01) or rejected after a dead-zone token lapse (REL-16); 2 s target unreachable by design (REL-11). The outbox itself never lost a score to the network |
| 4 | Architecture and code quality | 8% | **62** | D | 69 (P0 open) | A pure engine, strict TS and no import cycles; but saving a team draw makes the tournament unloadable (ARCH-09, P0), the data boundary is untyped (ARCH-03), settings silently fall back to defaults (ARCH-04), and the design refetches everything (PERF-07) |
| 5 | Data layer and database | 7% | **60** | D | 69 (P0 open) | A careful schema and a concurrency-safe write path; restore regressed (DB-02), no disaster recovery (DB-07), RLS costs ~15 helper calls per row (DB-12), and the keep-alive never worked (DB-01) |
| 6 | Performance | 6% | **62** | D | — | A fast engine and no memory leaks; every change re-downloads the tournament on every phone (PERF-07), reopening waits on five round trips despite a cached snapshot (PERF-08), and the first share costs 1.2 MB (PERF-11/PWA-04) |
| 7 | Testing and delivery | 5% | **60** | D | — | Engine tests are genuinely good (every §6 case, prior fixes pinned); 0% on screens, APIs and SQL in CI, 15 of 24 targeted mutants survive, `main` unprotected, migrations applied before review (QA-06…11, DB-09) |
| 8 | Visual design and brand | 10% | **60** | D | — | A disciplined token and icon system and a golf-native scorecard; money screens misaligned (VIS-01), the TV drops players 10–12 and two slides are broken (VIS-03/04), the ceremony is a phone dialog on a TV (VIS-06); motion sub-grade 60 |
| 9 | Interaction design and core flows | 10% | **54** | F | 69 (P0 open) | The player's Tarjeta and PIN join are good; Comité typing keeps one character (UX-01), a double tap writes a phantom hole (UX-02), money actions can't be undone (UX-21), and the auction TV never shows a sale (MOT-04) |
| 10 | Accessibility | 5% | **64** | D | — | Lighthouse 100 and a strong reduced-motion and reflow base; score controls don't name their player (A11Y-01), the most-used sheet has no close button (A11Y-02), and the ceremony button is 1.1:1 (A11Y-04) |
| 11 | Copy and voice (es-MX) | 3% | **62** | D | — | Careful Comité and recovery copy; raw «TypeError: Failed to fetch» reaches players (COPY-04), and money labels mislead (COPY-03, COPY-07); the voice rules regressed (COPY-24) |
| 12 | Mobile and PWA experience | 4% | **64** | D | — | Installable, a good manifest, and a boot fallback; the toast covers «Guardar hoyo» (PWA-01), the header goes under the Dynamic Island (PWA-02), a hotfix may never reach phones (PWA-03), and back discards a hole (PWA-05) |
| 13 | Product coherence and strategy | 3% | **63** | D | — | The Calcutta → settlement → ceremony chain is a real, differentiated idea; nothing is measured (STRAT-02), two offered formats contradict their boards (STRAT-03), and a new organizer has no path to a playable event (UX-06) |
| | **Overall (weighted)** | 100% | **59** | **F** | 69 (P0 open in areas 1 and 3), not binding | |

### 3.1 Caps applied

- **Areas 1, 3, 4, 5 and 9** have open P0s, so each is capped at 69. None of the scores reaches the cap: each is lower on its merits.
- **Overall:** open P0s in areas 1 and 3 cap the overall grade at 69. The weighted score is 59, so the cap doesn't bind either.

### 3.2 Chair's rulings on disagreements

- **9-hole handicaps.** MONEY rated this P0; ARCH and QA rated it P1; the history agent had marked the earlier item fixed. **Ruled: regressed, P0.** The fix overcorrected. The test asserts the wrong number, and V2 showed a Comité can reach a 9-hole round today.
- **Restore (DB-02).** DB and V4 said P1. **Ruled P0** under the brief's regression rule: the earlier P0-10 fix lost table coverage in 0020, and restore is the RUNBOOK's recovery path.
- **Session lapse vs reconnect.** V10 raised REL-02 to P0 because the reconnect can re-sign in anonymously and reject queued holes. **Ruled:** that path belongs to REL-16, which is raised to P0 on V10's evidence (about two-thirds of timings). REL-02, a stale board after reconnect labelled «Sin señal», stays P1, so the same failure isn't counted twice.
- **Downgrades accepted from the verifiers:**
  - REL-08 (hidden rejected scores) to P1: the data survives on the phone, and unsigned cards warn the Comité.
  - SEC-01 (headers) to P2: framing is defused by storage partitioning, and a CSP must allow the inline boot script.
  - COPY-03 and MONEY-07 to P2: §11 defines «Pagó» as obligations, and the components are explained one tap away.
  - UX-03 to P2: cosmetic, one import line.
  - STRAT-01 to P2: a process observation whose product costs are filed separately.
  - REL-06, REL-07 and REL-10 to P2: last-write-wins is what §8 specifies, and the next reload reconciles.
  - PERF-01 and PERF-02 to P2: the logo doesn't gate the board, and route splitting alone saves about 6% on a player's path.
  - DB-01 and DB-03 to P2: the backup cron keeps the project awake, and DB-02's fix removes the restore trigger.
- **ARCH-09 (team draw).** V4 raised it from P1 to P0. The real store's `team_members` query fails with 400 against production, so every tournament in the shipped team format is unusable once its draw is saved. The first tournament is unaffected. Accepted.
- **DB-12 (RLS cost).** Kept at P1. V4 reproduced the mechanism exactly (4,788 helper calls for 12 players) but corrected the timings measured under load: at low load a reload costs 0.64 s at 12 players and 5.8 s at 60. The statement-timeout risk at 60 players was overstated.
- **REL-14 (outbox stall).** Kept at P1 per V11, against ARCH-11's P2: there is no timeout at all, and one hung request froze the queue for more than 150 s.
- **COPY-24 and CHAIR-01.** P1 only because of the brief's regression rule; each fix takes minutes.
- **Security and privacy.** SEC graded technical security 82 (B); TRUST graded privacy and compliance 58 (F). The brief grades one area, so the chair combined them and weighted the public repository (CHAIR-02), which neither panelist had seen, to reach **67**.
- **Motion.** MOT's sub-grade (60) is folded in as MOT recommended: −3 to Visual (63 → 60) and −4 to Interaction (58 → 54).
- **History disputes.** VIS contested four "fixed" statuses in the history table (DA-15.2, DD-2, DD-12, DA-X.lee.1) with measurements; the chair ruled for VIS (§5.3).
- **GitHub tools without prompts.** This is an explicit owner decision (CLAUDE.md §0.1), and the regression it causes (AUD-P2-34) stands. The fix the chair endorses is branch protection on GitHub, not revoking the owner's choice (V7).

### 3.3 What a world-class team would do that Polo does not

- **Money:** keep a ledger of obligations and settlements rather than recomputing nets. Gate «Terminar» on every peso having an owner. Run property tests and an independent reference implementation in CI.
- **Security and privacy:** ship headers and edge rate limits from day one. Never trust client-supplied identity columns. Make privacy a product surface («Tus datos», card history, operator access log). Get counsel's view on the money framing before launch.
- **Reliability:** a local-first sync engine (mutation ids, base versions, one request per hole, deltas over the socket). Explicit freshness everywhere. SLOs on save→other-phone latency with alerts. Network-chaos tests in CI.
- **Architecture:** a contract-first data layer (generated types, validation at every boundary), a registry that generates the store, backup and restore table lists, and observability before launch.
- **Database:** the database as code with its own pipeline (ephemeral Postgres per PR, replay, pgTAP, advisors as a gate, a staging project), tenant keys on every row, set-based RLS, and a disaster-recovery plan that is proven by drills.
- **Performance:** budgets as code, field web-vitals, an incremental sync store, and a real-device release gate.
- **Testing:** protect the release path first, then treat SQL and the outbox as systems under test, with a committed browser suite over the fixtures.
- **Visual:** visual regression over every fixture and viewport. Design the TV and the ceremony as broadcast products. Build the brand as a system (vector mark, share artefacts that carry the notation).
- **Interaction:** test interactions at human speed (typing, double taps). Make every money and score action reversible and visible. Guide setup to "ready to play". Invite people, not codes.
- **Accessibility:** scripted VoiceOver/TalkBack passes on the four critical journeys, axe and accessibility-tree gates in CI, and accessibility owned by the primitives.
- **Copy:** money words as a state machine, the engine returning keys instead of prose, an error taxonomy, and a copy lint in CI.
- **Mobile:** real phones with the notch every release, an owned update lifecycle (build IDs, update checks, a minimum-version switch), and sheets as history entries.
- **Strategy:** a one-page strategy with a north-star metric, instrumentation before launch, watching five organizers who aren't Diego, and clearing the brand name before investing in it.

## 4. Baseline

Everything in this section was measured by the chair before the panel started, except where a panelist is named.

### 4.1 Code under review

| | |
|---|---|
| Commit | `379ed5267a3660434068f6a71454a6f4e20a22db` ("Admin de Polo: Avisos, Auditoría, Salud and the switches (#60)") |
| Branch | `claude/new-session-yg4z09`, identical to `main`; the report lives on `claude/panel-review-2026-09-30` |
| Production | `dpl_Gucv6ydesYoW1Fq4TWjoUXFV23o4` on https://golf.cardigan.mx, built from the same SHA |
| Date | 2026-09-30. Panel 02:20–04:40 UTC and 20:00–23:30 UTC; a usage limit paused it in between |
| Toolchain | Node 22.22.2, npm 10.9.7 (Vercel builds and runs the functions on Node 24.x: QA-23) |

### 4.2 `npm run preflight`

**Exit code 0 in 46 s.**

| Step | Result |
|---|---|
| typecheck | ✓ (`tsc -b --noEmit`, three tsconfigs) |
| lint | ✓, 0 errors, **12 warnings**, all `react-refresh/only-export-components`: `NumberField.tsx`, `OfflineBanner.tsx`, `primitives.tsx`, `ui.tsx`, `AdminGames.tsx`, `CourseEditor.tsx`, `GameBoardView.tsx`, `TournamentGate.tsx` |
| test | ✓, **48 files, 339 tests**, 8.03 s. The results were identical under four time zones and three shuffled orders (QA) |
| build | ✓, 9.3 s, with two warnings: a chunk over 500 kB, and a zod `@__PURE__` annotation Rollup cannot place |

The preflight build ran without `VITE_SUPABASE_*`, which drops supabase-js from the entry chunk (1,069 kB), so it understates what ships. PERF caught this. The table below comes from the same build with CI's placeholder environment, which is what CI and Vercel build: **entry chunk 1,294.33 kB raw / 401.45 kB gzip (414 kB brotli on Vercel)**, 57 JS/CSS files, 2,106 kB raw / 644 kB gzip in total. The PWA precaches **78 entries, 2,601.76 KiB**, including development-only fixture chunks (ARCH-07, PERF-05).

<details><summary>Every JS/CSS chunk, raw and gzip (CI-equivalent build)</summary>

| Chunk | Raw kB | Gzip kB |
|---|---:|---:|
| `index-DaJGD5Hw.js` | 1,294.33 | 401.45 |
| `StatsScreen-B3gUdhSm.js` | 367.97 | 108.22 |
| `index-PYOh36qD.css` | 74.34 | 13.87 |
| `index-QA3ohR6O.js` | 54.96 | 12.09 |
| `DesignScreen-BUy9-pzv.js` | 38.31 | 13.60 |
| `AdminTournament-BjDRyqYD.js` | 30.60 | 8.51 |
| `PlatformLayout-CxKhIix8.css` | 19.00 | 4.24 |
| `Admin-tQs-lwxd.css` | 15.75 | 3.69 |
| `AdminPlayers-DMid2eyj.js` | 13.56 | 4.43 |
| `platformFixtures-BXRmVREl.js` | 12.80 | 4.35 |
| `AdminAuction-B5nL_Dyp.js` | 10.46 | 3.53 |
| `TvScreen-Brv6wIPm.js` | 9.74 | 3.18 |
| `AdminScores-5oLpdzEF.js` | 9.08 | 3.01 |
| `CeremonyScreen-CRVob16Q.js` | 8.73 | 3.14 |
| `QuickRoundScreen-Jj9Z5n8m.js` | 8.38 | 3.25 |
| `AdminCourses-C71nnETF.js` | 8.01 | 3.05 |
| `AdminGames-Dd_1ap0G.js` | 7.94 | 2.57 |
| `AdminGroups-C23j6bNZ.js` | 7.92 | 2.91 |
| `AdminRounds-BmDOxF-B.js` | 7.00 | 2.34 |
| `CrewScreen-B8P4RsLj.js` | 6.72 | 2.49 |
| `VersusScreen-CvQ2TLPp.js` | 6.61 | 2.25 |
| `AdminData-D60-lNFr.js` | 6.61 | 2.57 |
| `workbox-window.prod.es5-BBnX5xw4.js` | 5.75 | 2.36 |
| `socialFixtures-Fm_tUVfo.js` | 5.27 | 2.20 |
| `DesignScreen-DCARBguz.css` | 5.26 | 1.42 |
| `CourseEditor-BFpLy85p.js` | 5.14 | 1.88 |
| `AdminDraw-Bi46klUa.js` | 4.99 | 2.04 |
| `ProfileEditScreen-BIi8hEBk.js` | 4.96 | 1.95 |
| `FriendsScreen-u8UWIpWW.js` | 4.50 | 1.51 |
| `TvScreen-hCZsF6Sc.css` | 4.31 | 1.23 |
| `AdminTeams-DQJANiDt.js` | 4.25 | 1.81 |
| `PrintScreen-L8WARQ5K.js` | 3.74 | 1.59 |
| `CrewsScreen-BOumMYzu.js` | 3.60 | 1.43 |
| `PlatformLayout-Bp9Ezcfv.js` | 3.56 | 1.51 |
| `AdminHistory-DSmqriPC.js` | 3.37 | 1.45 |
| `StatsScreen-k7KwGf1d.css` | 3.24 | 1.00 |
| `AdminHandicaps-D_b9u_0b.js` | 3.24 | 1.36 |
| `CeremonyScreen-B6Alb66R.css` | 2.93 | 0.92 |
| `AdminAuction-DVY_xyrr.css` | 1.80 | 0.65 |
| `InboxScreen-BZ7RMsnX.js` | 1.74 | 0.91 |
| `PrintScreen-COw6jCfU.css` | 1.71 | 0.70 |
| `AdminTournament-DbXterHC.css` | 1.64 | 0.64 |
| `pairing-oBwGzWfC.js` | 1.59 | 0.79 |
| `PushToggle-BJe7Hycz.js` | 1.51 | 0.72 |
| `Admin.module-CA2ALjDz.js` | 1.48 | 0.67 |
| `noticeText-BlnPtSoW.js` | 1.40 | 0.60 |
| `AdminScores-BTxKzSaL.css` | 1.29 | 0.53 |
| `CoursesScreen-Dk87xAPB.js` | 1.08 | 0.59 |
| `auditDiff-DWgmhH57.js` | 0.97 | 0.58 |
| `LegalScreen-qLqnh9Zz.js` | 0.88 | 0.41 |
| `AdminGroups-DmONB2q7.css` | 0.55 | 0.31 |
| `useCourses-BqJ-uweT.js` | 0.34 | 0.26 |
| `CourseEditor-BfnhYp2y.css` | 0.32 | 0.21 |
| `teeTimes-oQiDIYBD.js` | 0.32 | 0.24 |
| `AdminDraw-GRHBIYmd.css` | 0.26 | 0.19 |
| `useRequireAccount-BdG-DEaf.js` | 0.26 | 0.23 |
| `AdminDraw.module-Di_xsMaH.js` | 0.12 | 0.11 |
| **Total (57 files)** | **2,106.19** | **643.74** |

</details>

### 4.3 End-to-end and integration suites

| Command | Result |
|---|---|
| `npm run e2e` (Ensayo, local build of HEAD) | **20/20 ✓ in 40 s**. The first attempt failed because the local build had no Supabase env: a sandbox issue, not a product failure. The fixed build passed |
| `npm run e2e:profile` | **Not run**: exits 1, `Missing … SUPABASE_SECRET_KEY` |
| `node e2e/platform.mjs` | **Not run**: same |
| `node scripts/rls-test.mjs` | **Not run**: same. The panel instead replayed all 24 migrations on a local Postgres 16 with Supabase-compatible stubs and ran the tenancy matrix there (§10) |
| `node scripts/platform-test.mjs` | **Not run**: same |

This container has neither the service-role key nor a Supabase access token. The Supabase MCP connector is denied on this project. So the live advisors, the service-key suites and backups on R2 could not be exercised; §10 lists what was substituted.

### 4.4 Dependencies

`npm audit --omit=dev`: **0 vulnerabilities.** Behind by a major version: eslint 10, @eslint/js 10, eslint-plugin-react-hooks 7, eslint-plugin-react-refresh 0.5, globals 17, @types/node 26, @vitejs/plugin-react 6, motion 13, react-router 8, typescript 7, vite 8, vitest 5, sharp 0.35. Nothing automates updates (QA-21).

### 4.5 Lighthouse and field-like measurements

Lighthouse 12.8.2, mobile preset, simulated 4G and 4× CPU slowdown (benchmark index 1,550–2,000). Lighthouse 12 no longer has a PWA category, so installability was checked through CDP (below).

| Route | Perf | A11y | Best practices | SEO | FCP | LCP | TBT | CLS | Speed index | TTI | Transfer |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Production `/` | 77 | 100 | 100 | 92 | 1.4 s | 3.7 s | 480 ms | 0.035 | 1.9 s | 5.2 s | 572 KiB |
| Production `/t/ensayo` (Entrar) | 76 | 100 | 100 | 92 | 1.2 s | **5.5 s** | 180 ms | 0.03 | 3.5 s | 5.5 s | **1,464 KiB** |
| Preview `/t/_/full12-live` (fixture) | **52** | 95 | 100 | 45* | 4.7 s | **5.8 s** | 530 ms | 0.001 | 5.6 s | 5.8 s | 563 KiB |

\* Vercel previews send `noindex`, so SEO on the preview is not meaningful.

**Other measurements (PERF, UX, PWA):**
- **Applied throttling:** LCP on `/t/ensayo` was 6.5–7.6 s.
- **Warm reopen:** 3.2 s to the board on 4G.
- **The tournament logo** is 869 KiB, 59% of `/t/ensayo`'s bytes (PERF-01).
- **Interaction latency:** Lighthouse can't measure INP in the lab, so PERF used the Event Timing API at 4× CPU.
  - Stepper taps: 32–56 ms (full12) and 32–80 ms (large60).
  - «Guardar hoyo» to the next hole: 293 ms median (full12), 495 ms (large60).
- **Installability:** the production manifest is installable with **no Chrome installability errors** (`Page.getInstallabilityErrors`). Details in PWA.

### 4.6 Screenshots

**484 canonical screenshots** plus 75 taken by panelists and verifiers for the findings that cite them, all under `shots/` (559 files, 22 MB; 94 uncited extras were left out), named `<route>-<fixture>-<device>-<theme>.png`. The table shows the canonical sets; the added `-<state>` suffixes mark sheets, sub-tabs and similar states.

| Set | What | Devices | Fixtures |
|---|---|---|---|
| A (182) | Player routes (En vivo, Tarjeta, Juegos with every sub-tab, Dinero with Liquidación, Stats, Reglamento, Más), player sheet, «¿Cómo se calculó?», scorecard grid | iPhone 15 Pro 393×852, iPhone SE 375×667, large Android 412×915, iPad 1024×1366 | minimal4-setup, minimal4-live, gloria4, full12-live, full12-finished, pairs8, friends8, large60, longnames, stroke8, match8, team8, bracket8, scramble8 |
| B (181) | Every Comité section, TV mode (each rotating slide), Ceremonia (every reveal), printable cards (screen, print media and PDF) | laptop 1440×900, 15 Pro, TV 1920×1080 | full12-live, full12-finished, large60, longnames, friends8, minimal4-setup |
| C (121) | Home, organizer sign-in and reset, every wizard step, Entrar, legal pages, 404, profile/social fixtures, Ronda rápida, every Admin de Polo section, production `/` and `/t/ensayo` (no PIN typed) | 15 Pro, SE, laptop | profile, social, platform and wizard fixtures; production |

**Dark mode:** none. Forcing `prefers-color-scheme: dark` renders byte-identical pages (SHOTS-A), so no dark set exists (VIS-11). TV and Ceremonia use their dark "board" surface by design and are filed as `-dark`. **Fixture caveat:** the fixture routes show a ~58 px strip under the tab bar that production doesn't have (`AppShell.tsx:19`); no finding relies on it.

## 5. Status of previous audits

A dedicated agent re-checked every earlier finding against the code at HEAD rather than trusting commit messages. It covered the engineering sweep (`docs/audit-2026-09-28.md`), the design audit (`DESIGN_AUDIT.md`), the logged and deferred items in `DESIGN_NOTES.md`, the promises in `DESIGN_DIRECTION.md`, the claims the Comité will rely on in `RUNBOOK.md` and `docs/reglas-programadas.md`, and the open items in `docs/handoff.md`. That is 341 items, 327 once duplicates are removed. Where a panelist later reproduced a defect in an item marked "fixed", the chair ruled on the evidence; those rows are marked "(chair)" in Appendix A.

| Source | Fixed | Partly fixed | Still open | Regressed | Obsolete | Items |
|---|---:|---:|---:|---:|---:|---:|
| Engineering sweep, 2026-09-28 | 48 | 19 | 6 | **5** | 0 | 78 |
| Design audit (phase 0) | 90 | 42 | 13 | **3** | 2 | 150 |
| Design notes (logged/deferred) | 17 | 4 | 2 | 0 | 1 | 24 |
| Design direction (promises) | 9 | 4 | 2 | 0 | 1 | 16 |
| Runbook (claims) | 13 | 3 | 1 | 0 | 0 | 17 |
| Rules summary (claims vs engine) | 4 | 0 | 6 | 0 | 0 | 10 |
| Handoff (waiting on Diego) | 3 | 0 | 29 | 0 | 0 | 32 |
| **All** | **184** | **72** | **59** | **8** | **4** | **327** |

**The earlier sweep's fixes were largely real.** Of its 39 P0/P1 items, 29 are fixed, 8 are partly fixed and 2 regressed. That includes the old headline risks: the Comité UI shown to every player, the outbox dropping scores after 20 failures, the cold open with no signal, the forced reload mid-hole, the 1,000-row cap, the transactional Comité paths, and the unauthenticated Anthropic route. The fixes came with regression tests (`cleanup.test.ts`, `outbox.test.ts`, `backupTables.test.ts`, `platformGuard.test.ts`). The QA panel's mutation run killed every mutant aimed at one of those fixes.

### 5.1 Regressions (each one severity higher than the original)

| Earlier item | Was | Now | What broke again | Carried by |
|---|---|---|---|---|
| AUD-P1-36: 9-hole rounds got too many strokes | P1 | **P0** | The fix overcorrected: a 9-hole round now gives about half the strokes due (PH 16 → 4 instead of 8), and `cleanup.test.ts:168-177` asserts the wrong number. Reachable today from Comité › Rondas | MONEY-03 |
| AUD-P0-10: restore wasn't transactional | P0 | **P0** | Migration 0020's `restore_tournament` silently stopped restoring side-game entrants, bet results and hole awards, which 0011 restored; the only covering test passes by accident | DB-02 |
| AUD-P2-34: GitHub write tools bypass the pre-push check | P2 | **P1** | #29 and #46 moved `mcp__github__*` back to `allow` (an owner decision, CLAUDE.md §0.1); combined with an unprotected `main` | QA-10 |
| AUD-P2-35: `.env.example` missing server-side names | P2 | **P1** | #42 added five web-push variables that `.env.example` doesn't list | CHAIR-01 |
| AUD-P2-20: hard-coded strings outside `es-MX.ts` | P2 | **P1** | " y " and " & " joins are back in AdminScores, AdminDraw, ScorecardScreen, RejectedWrites, AdminGames, GameBoardView and TvScreen | COPY-24 |
| DA-B.2: middle-dot separators | — | **P1** (with AUD-P2-20) | 0 → 12 in `es-MX.ts` and 27 in code, some player-facing | COPY-24 |
| DA-A.5: arrows and glyphs as UI | — | **P1** (with AUD-P2-20) | Five "→" in copy, one on a player-facing board | COPY-24 |
| DA-B.5: one term per concept | — | **P1** (with AUD-P2-20) | "eagle" is back instead of "águila", and "pozo" is used for the snake pot | COPY-24 |

Three of these are P1 only because of the regression rule: the env documentation, the joins, and the vocabulary. The chair keeps them there as the brief requires. Their fixes take minutes.

### 5.2 Earlier P0/P1 items that are only partly fixed

- **AUD-P0-4 (rejected offline scores).** Rejected writes are kept, but only on the phone that sent them. The Comité never sees them, and «Terminar ronda» doesn't warn → REL-08.
- **AUD-P0-12 (1,000-row cap).** Every tournament read is paged, but "last page" is inferred from a hard-coded 1,000, and the shared course list isn't paged → DB-20.
- **AUD-P1-29 (PIN lockout).** The lock now resets, but the lockout can still be triggered against other players → SEC-04 (details in the private report).
- **AUD-P1-32 (status transitions).** Round transitions are guarded. The tournament's status tabs still switch on one tap, including finished → setup and «Terminado», which publishes results.
- **AUD-P1-34 (silent cascades).** Removing a tee still silently clears players' default tees in every tournament that shares the course.
- **AUD-P1-37 (holes by array position).** The Tarjeta and the player sheet still look holes up by array position.
- **AUD-P1-38 (share on iOS).** There is a fallback now, but sharing fails offline and stays broken for the rest of the session → PWA-04.
- **AUD-P1-39 (roster by slug).** An anonymous lookup still returns more of the roster than the join step needs → SEC-06.

### 5.3 Statuses the chair corrected

The history agent marked these fixed. Panelists reproduced the defect, and the chair ruled on their evidence:
- **AUD-P1-36:** regressed (MONEY-03, confirmed by V2).
- **AUD-P0-10:** regressed (DB-02).
- **AUD-P1-29:** partly fixed (SEC-04).
- **AUD-P0-12:** partly fixed (DB-20).
- **AUD-P1-38:** partly fixed (PWA-04, confirmed by V8).
- **DA-15.2** (TV rows fit): still open. The earlier check read the page height of a fixed, clipped board (VIS-03, confirmed by V12).
- **DD-2** (right-aligned figures): still open. The selector hasn't matched since #12 (VIS-02).
- **DD-12** (pencil notation on share images): still open (VIS-15).
- **DA-X.lee.1** (skeletons): partly fixed (VIS-13).

The complete table of all 327 items, with the evidence for each status, is in **Appendix A**.

## 6. Findings by area

**282 findings**: **11 P0**, **47 P1**, 163 P2, 61 P3. They come from 327 raw findings (325 from the panel, 2 from the chair) after merging duplicates under their root cause («Merged»). Every P0 and P1 was re-checked by an independent verifier (55 carry a Verification line; the rest were re-checked by the chair and a second agent, as noted). CONFIRMED means the verifier reproduced it; PLAUSIBLE means the evidence holds but reproduction needs something unavailable here. Within each area, findings run P0 first. P0/P1 are shown in full; P2/P3 are condensed. The complete record of every finding (all evidence, reproduction steps, merged duplicates) is in `findings.json`. Sixteen security-sensitive findings are listed with their severity and fix, but their evidence and reproduction are withheld from this public copy (CHAIR-02) and kept in the private report.

### 6.1 Correctness of rules and money

21 findings: 4 P0 · 3 P1 · 9 P2 · 5 P3.

#### MONEY-01: The settlement ignores what has already been paid: "Vía banco" (and "Sin banco") re-charge entries and Calcutta purchases the app itself shows as Pagado, and underpay winners by the same amount

**P0** · CONFIRMED · new: not in docs/audit-2026-09-28.md, $S/history/status.md, DESIGN_AUDIT.md or DESIGN_NOTES.md. The net computation has been there since th… · Effort M (under a day) · Scope: both · Merged: COPY-01, UX-12

- **Evidence:**
  - src/engine/core/money.ts:243-253 — viaBank = for each person (prizes + Calcutta shares) − (entry + side pots + Calcutta purchases), plus every buyback flow; payments[].paid is never consulted (isPaid is only used to colour flows)
  - src/engine/core/money.ts:273 + 278-301 — peerToPeer (Sin banco) is also built from nets as if nobody had paid anything, and the banker's cash is not a party
  - src/i18n/es-MX.ts:1820 — the hint under the list says "{banquero} cobró inscripciones y martillazos y paga a cada quien" (the money WAS collected), CLAUDE.md §11 "the banker pays each winner, since money was collected up front", §10 "Before everyone goes to bed ... who still owes what for entry and Calcutta, with Pagado toggles"
  - src/screens/tournament/MoneyScreen.tsx:225-294 — Final mode renders "Quién debe qué" (unpaid gross flows) and, below it, money.viaBank (nets that already deducted the same entries): following both charges an unpaid entry twice; following the list after paying on Calcutta night charges it again
  - …11 more in `findings.json`
- **Verification:** Independent verifier V1: CONFIRMED, P0 (both). Wrong money in the core final-settlement flow on the day. Under the spec's own flow the list is wrong: CLAUDE.md §11 says 'vía banco: the banker pays each winner, since money was collected up front', §5.9/§10 say everything is paid 'antes de dormir' on Calcutta night with 'Pagado' toggles, RUNBOOK §1.8 says to collect it all through «Quién debe qué», and the in-app hint (es-MX.ts:1820) says the banker 'cobró inscrip… Reproduction: cd /home/user/Cardi-Golf && npx vitest run --config $S/verify/evide…
- **Impact:** On Sunday night in Los Cabos the banker opens Dinero › Liquidación after collecting every entry and hammer price on Thursday (as §5.9/§10 and the app's own "Quién debe qué" require). The list tells each of the ~8 non-winners to pay him their $2,500 entry (plus their Calcutta purchases) again, and pays each winner prizes minus what they already paid — e.g. the champion receives $7,500 of his $10,000. Followed literally, roughly $30,000 + the Calcutta pot is collected twice and every winner is short by his own entry. Even without prior payments, the two sections of the same screen double-count…
- **Recommendation:** Make the settlement a function of what is still owed, not of gross positions: in computeMoney compute, per person, due = Σ unpaid payout flows − Σ unpaid entry/side/Calcutta flows (using the same aggregate paid logic as the checklist), and emit viaBank from that; emit paid buybacks as settled, not as transfers; for Sin banco, treat money already paid to the banker as the banker's balance so the minimisation includes him. Show paid rows greyed with ✓ instead of dropping them. Tests: (1) all entries paid → viaBank has only Banco→winner rows equal to gross prizes; (2) nothing paid → current nets…

#### MONEY-02: Stroke play, team-on-strokes and the "Low neto" game rank raw strokes over the holes played: an incomplete card wins the prize, and live the group that has played fewest holes leads and carries the money chip

**P0** · CONFIRMED · new, and the same defect class as audit-2026-09-28 P0-8 (fewest putts ranked by raw total). #25 fixed it for fewest putts (fewestPutts rank… · Effort M (under a day) · Scope: platform (the first tournament is Stableford with no lowScore game, so it is not affected)

- **Evidence:**
  - src/engine/formats/strokePlay.ts:69-86 — the ranking value is the raw stroke total over holes played (toParFigure returns value: strokes); src/engine/modules/individual/index.ts:63-74 ranks on that value with no completeness or to-par normalisation
  - src/engine/formats/team.ts:89-113 — same for team best ball/scramble on strokes (a missing hole simply drops out of the total)
  - src/engine/games/lowScore/index.ts:40-56,62-66 — "to par over holes played" with no minimum: a 1-hole card beats an 18-hole card; no warning
  - focused.test.ts "MONEY-02-strokePlay": p1 18 holes even par (72), p2 walks off after 9 holes at +9 (45) → rows [p2 label 1 value 45 "+9" thru 9, p1 label 2 value 72 "E" thru 18]; the $1,000 prize (final:true) goes to p2
  - …3 more in `findings.json`
- **Verification:** Independent verifier V2: CONFIRMED, P0 (platform (the first tournament is Stableford with no lowScore game, so it is not affected)). In every stroke-play or team-on-strokes tournament, the live leaderboard, TV and 'si terminara ahora' chips rank by raw strokes over holes played, so the group that has played fewest holes leads all day. That is a core flow failing on the day in a shipped format: the wizard's FormatPicker offers 'Golpes' and 'Por equipos' (FormatPicker.tsx:19). At the end, an incomplete card (a withdrawal or a forgotten hole) is…
- **Impact:** Any stroke-play, team-strokes tournament or Ronda rápida with the «Low neto» chip: all day the leaderboard, TV and money chips reward whoever is furthest behind on the course (the group off the 10th, the last tee time), and at the end a player who withdraws or forgets to enter a hole is paid first prize — e.g. the $1,000 main prize above goes to the man who walked off at +9 after nine.
- **Recommendation:** Rank stroke formats on strokes relative to par over the holes played (the figure is already computed) while live, and at tournamentFinal require a complete card (thru === holes for every counted round) to be eligible for places — incomplete entrants rank after complete ones, like fewest putts already does (fewestPutts/index.ts:57-70). Same rule in team.ts and lowScore. Add a flag listing entrants ineligible for money. Tests: WD after 9 never wins; live board ranks −12 thru 12 above +8 thru 4; team missing a hole ranks after complete teams.

#### MONEY-03: Nine-hole rounds give players about half the strokes they are due (half the playing handicap is allocated against 18-hole stroke indexes), and the unit test locks the wrong behaviour in

**P0** · CONFIRMED · regressed (AUD-P1-36: the fix overcorrected) · Effort S (under 2 h) · Scope: platform (the first tournament only if the Comité converts a round to 9 holes, e.g. a shortened Day 2; the edit sheet allows it on a live round) · Merged: ARCH-02, QA-02

- **Evidence:**
  - src/engine/core/compute.ts:147 — `round.holes === 9 ? strokesReceived(roundHalfUp(playingHcp / 2), h.strokeIndex, 18)`: a 9-hole handicap of 8 only pays out on holes whose 18-hole SI ≤ 8
  - focused.test.ts "MONEY-03": base 20 → PH 16 → 8 strokes due on the nine; the front nine of PAR_72 (SIs 7,11,17,3,1,13,15,9,5) receives 4 (holes 1,4,5,9); the same nine inside an 18-hole round receives 8
  - focused.test.ts "MONEY-03" nineHoleCourse: a real 9-hole card with SI 1–9, PH 30 → 15 due, 9 given (a 9-hole allocation over 18 caps at one stroke per hole)
  - src/engine/cleanup.test.ts:168-177 asserts `total).toBe(pr.holes.filter((h) => h.strokeIndex <= 8).length)` and `toBeLessThanOrEqual(8)` — it encodes the shortfall as correct
  - …7 more in `findings.json`
- **Verification:** Independent verifier V2: CONFIRMED, P0 (platform (the first tournament only if the Comité converts a round to 9 holes, e.g. a shortened Day 2; the edit sheet allows it on a live round)). Wrong money, deterministic and silent, in a feature the platform ships today. The orchestrator's test is reachability, and it is reachable. Comité › Rondas offers Hoyos 18/9 both when adding a round and when editing an existing round in any status: I opened the edit sheet on a live round (screenshot). The DB check accepts it (0001_schema.sql:150 `check (holes…
- **Impact:** Every net game in a 9-hole round (Stableford points, best round, pairs, skins/low net, the cut for the next day) under-credits every handicap player: a 16 loses 4 Stableford points per nine against a scratch player who loses nothing. Money in any 9-hole event goes to the lower handicaps.
- **Recommendation:** Allocate the 9-hole playing handicap over the nine holes actually played: rank the nine holes by their 18-hole SI (1..9) and use strokesReceived(ph9, rank, 9); document the choice (WHS Appendix E). Replace cleanup.test.ts:168-177 with an exact expectation (PH 16 → 8 strokes on the 8 lowest-SI holes of the nine) plus a 9-hole course (SI 1–9) case where PH 30 → 15.

#### MONEY-20: Team format + Calcutta: the winning team's players are treated as a tie across places 1–2, so they take the champion AND runner-up slots and the real runner-up team gets nothing

**P0** · CONFIRMED · new (team formats arrived with #49/#51 after the 09-28 audit) · Effort S (under 2 h) · Scope: platform (the first tournament uses individual Stableford)

- **Evidence:**
  - src/engine/modules/individual/index.ts:89-93 — rankIndividual flattens each team group into its players but keeps the team's position, so a 2-player team at position 1 looks like a 2-way tie occupying places 1–2 and the next team sits at position 2
  - src/engine/modules/auction/index.ts:164-168 — a group at position p with k members covers place slots p..p+k−1; placeDone then skips the runner-up slot
  - focused.test.ts "MONEY-20": best ball, teams T1 (p1,p2) −18, T2 (p3,p4) E, T3 +18; every lot sold for $1,000 (pot $6,000), payout 70/30 → one slot "Campeón + Subcampeón", share 100%, why "Empate a 2 en el 1º: 70% + 30% = 100%", p1 $3,000, p2 $3,000; T2's owners $0
  - Nothing forbids the combination: schema.ts has no refine between modules.individual.format = team and modules.auction.enabled; the wizard/Comité expose both
- **Verification:** Independent verifier V2: CONFIRMED, P0 (platform (the first tournament uses individual Stableford)). Wrong money in a configuration a user can build today in a few taps, with no warning. The explanation even mislabels it as a tie. rankIndividual (individual/index.ts:89-93) keeps each team's position and flattens its members. assignSlots (auction/index.ts:164-168) then reads a 2-player team at position 1 as a 2-way tie covering places 1–2, so the winning team's owners take the champion and runner-up shares and the r… Reproduction: Own test (mon…
- **Impact:** A scramble or best-ball event with a Calcutta (a classic combination) pays the whole place money to the winning team's owners; with the first tournament's shares the runner-up team's owners lose their 20% (e.g. $3,200 of a $16,000 pot) and the explanation calls it a tie.
- **Recommendation:** Rank players for the Calcutta by their team's finishing position with each team occupying ONE place (the team is the entrant); split a team slot among its members' owners by member. Or refuse the auction under team formats until defined. Tests: 3 teams of 2 → champion slot shared by team 1's members, runner-up slot to team 2's members, pot conserved.

#### MONEY-04: "Pagado" on a vía-banco payout never sticks: the button records the net transfer, the engine compares it with the gross payouts

**P1** · CONFIRMED · new: related to the fixed DA-11.4 (paid rows get a check instead of opacity). That check can never appear on a bank→person row while entrie… · Effort S (under 2 h) · Scope: both · Merged: COPY-02

- **Evidence:**
  - src/screens/tournament/MoneyScreen.tsx:88,277-286 — togglePayout(tr.to, tr.amount, true) writes a `payout` payment for tr.amount, the NET vía-banco transfer (prizes + shares − entry − purchases)
  - src/engine/core/money.ts:173-182 — a payout flow is paid only when Σ payout payments ≥ Σ gross payout flows for that person
  - focused.test.ts "MONEY-04": transfer shown Banco→p1 $3,000, payment written $3,000, gross payouts $4,000 → every payout flow still paid:false after the tap
  - MoneyScreen.tsx:267-268 — `canMark` requires settle === "bank" and a bank-to-person line: person-to-bank lines and every "Sin banco" transfer have no Pagado at all, so half of the settlement can never be ticked
  - …3 more in `findings.json`
- **Verification:** Independent verifier V1: CONFIRMED, P1 (both). A clear defect in the only control for recording final payouts. MoneyScreen.tsx:88/283 writes the row's NET amount as the 'payout' payment, and set_payment_paid (0010:317-333) upserts that amount as given. money.ts:173-182 then marks payouts paid only when that amount ≥ the GROSS payouts. In the first tournament every bank→person row is net of a $2,500 entry, so no winner's 'Pagado' can ever stick. The failure is si… Reproduction: v1.test.ts 'MONEY-04' simulates togglePayout(tr.to, tr.amount, true…
- **Impact:** For every winner who paid an entry (all twelve in Los Cabos) the Comité taps "Pagado" on Sunday and the row stays unpaid; the settlement can never be ticked off, so nobody can tell from the app who has actually been paid.
- **Recommendation:** Make the paid state a property of the transfer that is shown (store the settlement line, or compare against the same net figure the list shows), or — with MONEY-01 fixed — record payouts gross and settle entries separately. Test: mark every viaBank line paid → every payout flow paid and the list empty.

#### MONEY-05: Money the rules leave to "el Comité decide" can never be assigned: no adjustment or manual payout exists, so the settlement stays "Por asignar" forever (cancelled round, unfilled Calcutta slots, skins/side pots nobody wins, disputed contests, unreachable places)

**P1** · CONFIRMED · new. It follows from the #25 fix for audit P0-6: unfilled Calcutta slots now stay with the banker 'hasta que el Comité decida', with no way… · Effort M (under a day) · Scope: both (the first tournament if a day is cancelled or a Calcutta tier slot cannot be filled; the platform for skins nobody wins and disputed contests)

- **Evidence:**
  - Engine sources of unassigned money: computeTournament.ts:162 ("$X sin asignar ... El Comité decide"), auction/index.ts:44,223-225, skins/index.ts:108-111, contest/index.ts:75-77 (disputed holes pay nothing), bestRound/snake pay nothing for a cancelled round (CLAUDE.md §18.8 "The Comité decides")
  - src/engine/types.ts:16 — PaymentKind includes `other`, but grep finds no writer or reader of `other` outside the type; money.ts only turns payments into paid flags, never into money
  - focused.test.ts "MONEY-05": first tournament, Day 2 cancelled → prizes paid $27,000 of $30,000, bank difference $3,000, flags.warnings [] (no warning at all for the cancelled-round money)
  - MoneyScreen.tsx:101 shows "Por asignar: $3,000" with no action; no screen offers to split or refund it
  - …1 more in `findings.json`
- **Verification:** Independent verifier V2: CONFIRMED, P1 (both (the first tournament if a day is cancelled or a Calcutta tier slot cannot be filled; the platform for skins nobody wins and disputed contests)). The spec defines a contingency for the first tournament itself: §18.8, a cancelled round, 'the Comité decides'. The app has no first-class way to record that decision. It raises no warning for the stranded money and does not stop the Comité closing and publishing nets while it is unassigned. That is a clear gap for a product whose premise is 'every number…
- **Impact:** If Saturday at Quivira is rained out, $3,000 of the $30,000 (best round Day 2 + three snakes) sits with the banker with no way to record what the Comité decides; the "Cuadra al peso" verdict, the ceremony totals and the published nets (tournament_money) are wrong or permanently red.
- **Recommendation:** Block Terminado (and publishing) while any peso is unassigned or any snake tiebreak is pending, and re-publish when it changes. Add a Comité "Ajuste" flow: an explained manual award (payments kind `other`, or a `manual_awards` table) from the bank to named players with a reason, fed into computeMoney as prizes and shown in Dinero with its why; offer one-tap presets ("repartir entre los premios del individual", "devolver a partes iguales"). Surface every unassigned peso as a flag with its source. Test: a cancelled round + an adjustment of $3,000 → banker balanced.

#### MONEY-06: The money plan and the real tournament drift apart unchecked: the pool is validated only when settings are saved (a missing player leaves it $2,100 short, an extra round adds an unfunded $1,200 prize), and the planned days are never created, so finishing Day 1 finalizes a two-day event

**P1** · CONFIRMED · partly fixed (audit-2026-09-28 P1-31). Save is blocked while unbalanced (AdminTournament.tsx:87,94,336-337), and the literal 12 survives on… · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/engine/computeTournament.ts:78-192 never calls checkPrizePool; flags.warnings has no pool entry
  - src/engine/settings/prizeCheck.ts:101-108 funds best round for settings.rounds days; modules/bestRound/index.ts:28 pays every non-cancelled round in the snapshot; AdminRounds.tsx:118 adds rounds without touching settings.rounds
  - focused.test.ts "MONEY-06": settings.rounds 2, balanced; the snapshot has 3 rounds → best round pays $3,600, bank pays $31,200 of $30,000 (difference −1,200) while checkPrizePool(settings, fieldShape(snap)) is still balanced:true
  - focused.test.ts "MONEY-06b": first-tournament settings saved for 12, one player never shows → checkPrizePool difference −2,100, engine warnings only the pairing-group notes, bank ends −$2,100
  - …3 more in `findings.json`
- **Verification:** Independent verifier V2: CONFIRMED, P1 (both). The engine never re-checks the pool. If the field or the rounds drift from the saved settings (the 12th player is still unconfirmed per §15), the bank ends short with no flag or banner. In a live 2-day plan where Day 2's round has not been created yet, finishing Day 1 finalizes all money. A top team would block or flag both. It is not P0: the shortfall shows up (Comité › Torneo › Dinero tab, and the Dinero bank verd… Reproduction: Own test money05_06.test.ts (MONEY-06 V2; results in money05_06.res…
- **Impact:** If the 12th player drops (a live possibility per §15) the prizes stay at $30,000 against $27,500 collected; the app shows nothing until Sunday's bank verdict turns red, when the banker is $2,100–2,500 short with winners waiting. A Comité that adds a Day 3 (or a 9-hole playoff) creates a $1,200 best-round prize nobody funded.
- **Recommendation:** Create the planned rounds with the tournament (or treat missing planned rounds as unfinished in tournamentFinal). Run checkPrizePool(settings, fieldShape(snapshot, settings)) inside computeTournament and emit a blocking flag (and a banner in Comité › Torneo and Dinero) whenever it is unbalanced; count rounds from the snapshot, not settings.rounds (or keep settings.rounds in sync from Rondas); require expectedPlayers instead of the literal 12. Test: remove a player → flag; add a round → flag.

#### MONEY-07: The numbers people actually pay by have no "¿Cómo se calculó?": settlement transfers (vía banco / sin banco), the bank verdict "Por asignar" and the Dinero "Por juego" amounts

**P2** · CONFIRMED · new · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/screens/tournament/MoneyScreen.tsx:266-291 — each transfer renders name/amount/Pagado only; the engine's Transfer type (money.ts:47-51) carries no explanat…
  - …4 more in `findings.json`
- **Impact:** The one list twelve friends settle cash from (and that is wrong today, MONEY-01) cannot be audited on the phone: "Banco paga a Camilo $7,700" gives no path to "10,000 +…
- **Recommendation:** Give Transfer a `why` (the person's lines: each prize, share, entry, purchase, what was already paid) and render it with HowCalculated; list the open items behind "Por asignar" (flags alrea…

#### MONEY-08: Calcutta does not close to the peso when a slot goes unfilled on an odd pot: payouts + unfilled = pot + $0.50, the auction reports balanced:false and the warning reads "$612.5 sin asignar"

**P2** · CONFIRMED · new (residue of the fix for audit-2026-09-28 P0-6) · Effort S (under 2 h)

- **Evidence:**
  - src/engine/modules/auction/index.ts:223-225 — unfilled slot amount = money(pot × share), kept in cents; :253 remainder = Math.round(pot − unfilledTotal − distr…
  - …3 more in `findings.json`
- **Impact:** Whenever a slot cannot be filled and its share of the pot ends in 50 centavos (the 5% Cuchara on any odd number of $250 lots, e.g. a $12,250 pot → $612.50), the Calcutta…
- **Recommendation:** Floor each unfilled slot to whole pesos and compute the rounding remainder as pot − Σ paid − Σ unfilled (integers), so the three always sum exactly; format the warning with formatMoney. Add…

#### MONEY-09: The prize check validates totals, not whether anyone can win them: more paid places than players, pairs or game entrants pass as balanced and the money stays in the bank

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/engine/settings/prizeCheck.ts:83-99,145-150 — sums stableford/pairs prizes and side pots without comparing the number of places with the field (or pairs, o…
  - …4 more in `findings.json`
- **Impact:** A small Ronda-rápida-style event or a shrunken field leaves prize money that nobody can win sitting with the banker, with a green check at setup and a red verdict at the…
- **Recommendation:** In checkPrizePool, reject (or roll down) places beyond the reachable count: individual places ≤ entrants of the chosen format (teams, not players, under team/fourball), pair places ≤ pairs,…

#### MONEY-10: A side pot nobody wins keeps the buy-ins silently: birdie/eagle pots and hole contests with no winner pay nothing and raise no warning (skins at least warns)

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/engine/games/payout.ts:64-66 — payUnits returns [] when no unit was won; eventPot/index.ts and contest/index.ts define no warnings() for it (skins/index.ts…
  - …3 more in `findings.json`
- **Impact:** In a Ronda rápida with money, a group that forgets to mark the closest-to-the-pin winners (or a birdie pot on a hard day) loses its buy-ins to the banker with no prompt…
- **Recommendation:** Give every pot-based game a rule for "no winner" (refund pro rata by default, or roll to the next round) and a warning until it is resolved; show it in Dinero. Test: a pot with zero units r…

#### MONEY-11: A lot that was never auctioned still cashes Calcutta slots — for the player himself, for $0 paid into the pot

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 P2 "Unsold lot at tournamentFinal cashes as self-owned with paid: 0; should warn"): the warning exists, the… · Effort S (under 2 h)

- **Evidence:**
  - src/engine/modules/auction/index.ts:242-243 — a slot winner without a sold lot is paid as `{ ownerId: pid, pct: 100, paid: 0 }`
  - …2 more in `findings.json`
- **Impact:** If the Comité skips a lot (or adds a player after the dinner), that player shares a pot he never paid into; the other owners lose 55% of it if he wins.
- **Recommendation:** Apply §5.9 literally: an unsold lot is self-owned at the opening bid and that price is added to the pot and owed by the player (a calcutta flow), or exclude unsold players from the slots (t…

#### MONEY-12: With a house cut, "Sin banco" never collects the cut: the minimised transfers stop when creditors are paid, so one debtor pays less than the rest

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/engine/core/money.ts:236-241 — houseCut is taken out of the bank balance; :278-301 minimizeTransfers matches debtors to creditors only, so Σ debts − Σ cred…
  - …1 more in `findings.json`
- **Impact:** Any tournament with money for balls/dinner/trophies (houseCut, offered in the settings) that settles "sin banco" ends $400 short for the house and unfair between losers.
- **Recommendation:** Model the house as a creditor in minimizeTransfers (to the banker or a named organizer) so the cut is collected pro rata; test Σ transfers out of each debtor = −net.

#### MONEY-13: Settings that pass the schema but make no sense or do nothing: cap/allowance 0 silently make a handicap event scratch, duplicate or unreachable Calcutta place slots, 100% buybacks, a house cut larger than the pot, a «Pueden pujar invitados» toggle wired to nothing, and a currency no screen uses

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - focused.test.ts "MONEY-13": schema accepts cap 0, allowance 0, two place-1 slots, a place-40 slot in a 12-player field, buybackMaxPct 100, houseCut 100,000 on…
  - …4 more in `findings.json`
- **Impact:** An organizer can save a configuration that quietly removes every stroke, pays a 40th-place slot that never exists (money stranded) or promises guests a bid they cannot p…
- **Recommendation:** Tighten schema.ts: cap ≥ 1 when allowance > 0 (or an explicit "scratch" switch), allowance > 0, buybackMaxPct ≤ 50 (§5.9) or ≤ 99, unique place slots, place ≤ expectedPlayers, houseCut ≤ en…

#### MONEY-15: Explanations that do not add up: raw "$10000" instead of "$10,000", false arithmetic when points floor at zero ("4 + 0 − 8 + 2 = 0 pts"), and a team member's prize titled with the whole team's prize

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 P2 "Explanation strings"): percentages and day labels are fixed; these remain · Effort S (under 2 h) · Merged: COPY-05

- **Evidence:**
  - src/engine/core/ranking.ts:140-148 and every module's why use `$${amount}` → focused.test.ts "MONEY-15-raw": title "$10000", step "1º lugar: $10000"
  - …6 more in `findings.json`
- **Impact:** The "¿Cómo se calculó?" sheet is the trust feature; showing arithmetic that is false or amounts in a different format than the line it explains undermines exactly the di…
- **Recommendation:** Use one engine-side peso formatter for all why strings; write "4 + 0 − 8 + 2 = −2 → 0 pts"; title member lines with the member's amount and keep the team total as a step. Property test: eve…

#### MONEY-22: The Polo index is not reproducible: a finished round's adjusted gross and differential are recomputed with the profile's CURRENT index, so the same card yields a different differential after the index moves

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - supabase/migrations/0015_results.sql:175-188 — refresh_round_results takes idx from the confirmed profile (manual_index or polo_index as of now), not from the…
  - …3 more in `findings.json`
- **Impact:** A player's history and index change when the Comité republishes an old tournament or fixes a typo in a finished card; two identical histories can end with different inde…
- **Recommendation:** Freeze the course handicap at finish: use the player row's index for that event (players.handicap_index/base_hcp, which the Comité or the quick round set at the time) or store it in round_r…

#### MONEY-16: Calcutta slot amounts on Juegos and the TV differ by a peso from what owners are paid

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/TvScreen.tsx:273 — "Lo que está en juego" shows Math.floor(pot × share): 25,000 × 0.29 = 7249.999999999999 → "$7,249" while the engine p…
  - …1 more in `findings.json`
- **Impact:** Owners compare the TV figure with what they are handed; a peso off on a money screen reads as an error.
- **Recommendation:** Expose each slot's paid amount (after flooring and remainder) from the engine and render that everywhere; never recompute money in a screen.

#### MONEY-17: Without a 1st-place slot the Calcutta rounding remainder is paid to a player instead of to his owner

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/engine/modules/auction/index.ts:256 — `const target = championOwner ?? filled[0]!.playerIds[0]!` (a player id, not an owner)
  - …1 more in `findings.json`
- **Impact:** A peso goes to the wrong person under a legal custom payout; small, but it is the kind of error that makes the whole table look untrustworthy.
- **Recommendation:** Fall back to the first owner of the highest filled slot's first player; add the case to auction.test.ts.

#### MONEY-18: A hole saved without putts counts as 0 putts for Menos putts and can never pass the snake

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/engine/modules/fewestPutts/index.ts:39 `(h.putts ?? 0)`; snake/index.ts:75 requires `h.putts != null`
  - …2 more in `findings.json`
- **Impact:** Data that lost its putts (a restore from an older export, a manual SQL fix) quietly decides a $1,000 prize.
- **Recommendation:** Treat a played hole without putts as incomplete for putting games (ineligible, flagged for the Comité) and make scores.putts NOT NULL when strokes are present (or default it server-side). T…

#### MONEY-19: The auction console accepts custom bids off the $250 increment, and the server accepts any positive bid from any bidder

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/admin/AdminAuction.tsx:139-147 — `bid(null)` accepts any Number(custom) > current bid; no check that (amount − current) is a multiple of settings.a…
  - …2 more in `findings.json`
- **Impact:** A fat-fingered "1,370" becomes a legal hammer price and flows into the pot and every slot amount.
- **Recommendation:** Round/validate custom bids to the increment in the console and enforce it in the bid insert (RPC or check constraint); test in the auction rehearsal script.

#### MONEY-21: Plus handicaps are floored to zero in tournaments (a +1.2 gives no stroke back) while the Polo index / SQL allocation gives strokes back — two WHS readings in one product

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/engine/core/handicap.ts:21 `Math.max(0, roundWith(raw, h.rounding))` and :129 `if (playingHcp <= 0) return 0`
  - …3 more in `findings.json`
- **Impact:** A plus-handicap friend in a Ronda rápida or tournament plays off scratch instead of giving strokes back: one or two net strokes per round in his favour in every net game.
- **Recommendation:** Allow negative playing handicaps (give strokes back on the highest SIs, as whsStrokes does) or make "plus handicaps play off 0" an explicit setting shown in the why and the Reglamento; shar…

### 6.2 Security and privacy

32 findings: 0 P0 · 6 P1 · 20 P2 · 6 P3.

#### CHAIR-02: The repository is public although the brief says it is private: it publishes personal data and operational details of the first tournament and makes every unfixed vulnerability readable by anyone

**P1** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - GitHub API (search_repositories repo:cardiganapps-ui/Cardi-Golf): "private": false, "visibility": "public"
  - Unauthenticated requests: https://github.com/cardiganapps-ui/Cardi-Golf → 200; https://raw.githubusercontent.com/cardiganapps-ui/Cardi-Golf/main/CLAUDE.md → 200
  - CLAUDE.md §3 states "Private repo cardiganapps-ui/Cardi-Golf"
  - Exposed in the tree: the platform administrator's personal email address (supabase/migrations/0021_platform_admin.sql:41); the PIN every Ensayo player shares (scripts/seed-ensayo.mjs:156-164, e2e/smoke.mjs:25), which gives anyone the rehearsal tournament's Comité; the trip's booking reference, lead guest, hotel and dates (CLAUDE.md §2); the twelve…
  - …1 more in `findings.json`
- **Chair:** Reported by verifier V7 while checking QA-10 and re-checked by the chair: GitHub API visibility "public", and unauthenticated fetches of the repository page and raw CLAUDE.md return 200.
- **Impact:** Anyone can read the friends' names, the owner's email, the booking reference and hotel for the trip, take over the Ensayo rehearsal tournament with the shared PIN (and wreck a rehearsal), and read the source of every unfixed defect in this review, including the ones a stranger can use against the real tournament during the trip. The booking reference and lead guest name are enough to attempt social engineering with the travel agency.
- **Recommendation:** Decide deliberately: make the repository private (GitHub › Settings › General › Danger zone › Change visibility; free for a personal account, and Vercel keeps deploying) or keep it public and remove the personal data: move the admin seed to a one-off SQL run outside the repo, give Ensayo random per-player PINs outside the repo, drop the booking reference and real names from CLAUDE.md and the fixtures (invented names), and rotate anything that was ever treated as private. Add the visibility to the RUNBOOK's pre-trip checklist. Until then this review's security repro details stay out of the rep…

#### TRUST-01: The only channel the privacy notice gives for rights and account deletion (golf@cardigan.mx) cannot receive email: cardigan.mx has no MX record

**P1** · CONFIRMED · new (not in docs/audit-2026-09-28.md or $S/history/status.md; the notice itself dates from 52a643c, 2026-09-28) · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/i18n/es-MX.ts:837 — both legal pages end with «Dudas: golf@cardigan.mx»; es-MX.ts:848 — «pedir que borremos tu cuenta y tus datos escribiendo a golf@cardigan.mx»; es-MX.ts:842 — the operator is identified only by name + that address
  - DNS over HTTPS, two independent resolvers (dns.google and cloudflare-dns.com): cardigan.mx MX → [] (no answer); cardigan.mx A → Vercel anycast IPs (76.76.21.x / 66.33.60.x); send.cardigan.mx MX → feedback-smtp.us-east-1.amazonses.com (Resend bounce feedback, send-only). Output: panel/evidence/TRUST/dns.out
  - With no MX, senders fall back to the A record (RFC 5321 §5.1 implicit MX); Vercel edge IPs do not accept SMTP, so a deletion or ARCO request bounces (typically after days of retries). The auth emails are also sent from golf@cardigan.mx (CLAUDE.md §3 Email), so a reply to a code email bounces too.
- **Verification:** Independent verifier V5: CONFIRMED, P1 (both). The notice publishes exactly one channel for questions, rights requests and account deletion, and that channel has no mail handling at all. The app has no self-service deletion either: the only path is the platform admin's platform_delete_account, src/screens/platform/PersonDetail.tsx:324-348. A privacy contact that cannot receive mail is a clear defect, and a top company would never ship it. Neither is it a polish… Reproduction: DNS over HTTPS against two independent resolvers, 2026-09-30 ~20:10…
- **Impact:** Every person who follows the notice to exercise access, rectification, cancellation or opposition, or to delete their account, gets no answer. Under the LFPDPPP the notice must give a working means to exercise ARCO rights; today the stated means is dead, and the operator will not know requests exist. Before April the 12 players and anyone added to a Ronda rápida have no way to reach Polo about their data.
- **Recommendation:** Give golf@cardigan.mx a real inbox before anything else: add MX records for cardigan.mx (e.g. Cloudflare Email Routing to Diego's mailbox, free; or Google Workspace) and verify with a test message; or change the notice to an address that receives (and keep the From address, but set Reply-To in the Resend SMTP block). Add a synthetic check to Admin › Salud (resolve MX for the contact domain) and a unit test that the legal contact address constant is the one Salud checks. Longer term: an in-app «Solicitud de privacidad» form that writes a row the admin sees in Admin de Polo, so requests never d…

#### TRUST-02: The privacy notice misstates who sees money: every tournament member sees every player's money, any member can share it to WhatsApp, and the operator can read all of it

**P1** · CONFIRMED · new · Effort S (under 2 h) · Scope: both · Merged: COPY-16

- **Evidence:**
  - src/i18n/es-MX.ts:843 — «Los montos de dinero de un torneo solo los ve su Comité y cada quien el suyo.»; es-MX.ts:845 — «Tu dinero solo lo ves tú.»
  - src/screens/tournament/MoneyScreen.tsx:37,141-162 — Dinero («Si terminara ahora») lists every player with Pagó / Recibe / Neto for any member, no admin gate; :92-99,109-110 — «Compartir» builds a text with every person's paid/receives/net and every transfer, and a share card of the settlement, for any member
  - supabase/migrations/0003_rls.sql:158 — payments_read: any tournament member reads every payment row (who owes whom, paid or not)
  - supabase/migrations/0015_results.sql:128-131 — tournament_money_read admits is_tournament_organizer(), which 0021_platform_admin.sql ORs with platform_can_write(): the Admin de Polo reads any tournament's money (and Dinero itself when he enters as Comité)
  - …5 more in `findings.json`
- **Verification:** Independent verifier V5: CONFIRMED, P1 (both). The privacy notice says the opposite of what the product does about the most sensitive data it holds: who owes and wins how much. es-MX.ts:843 says «Los montos de dinero de un torneo solo los ve su Comité y cada quien el suyo», yet every member sees every person's paid, receives and net amounts and can share them. A false statement about who sees financial data is a clear defect that a top company would not publish,… Reproduction: (1) RLS, my own harness db v5_verify: verify/evidence/V5/trust02.sq…
- **Impact:** A player reading the notice believes his winnings and debts are private; in fact the whole field sees them live, any member can post them to a WhatsApp group, and the operator can read them. A notice that says the opposite of what the product does is the kind of statement a regulator or an upset participant holds against the operator; it also undermines trust in every other promise on the page.
- **Recommendation:** Rewrite the money paragraph to match the product: «Dentro de un torneo, todos sus jugadores ven lo que pagó, recibe y le toca a cada quien: así se liquida. Cualquier jugador puede compartir esa liquidación. En tu perfil, el neto publicado de cada torneo solo lo ves tú y el Comité de ese torneo. El administrador de Polo puede verlo para dar soporte.» Consider limiting «Compartir liquidación» to the Comité. Add a claims test: a table in src/lib/privacyClaims.ts mapping each notice sentence to the RLS/RPC test that proves it, run in CI.

#### TRUST-03: Account deletion leaves the person's name, photo and handicap everywhere, although the notice promises past results can stay «sin tu nombre»

**P1** · CONFIRMED · new · Effort M (under a day) · Scope: both

- **Evidence:**
  - src/i18n/es-MX.ts:848 — «Los resultados de torneos ya jugados pueden quedarse sin tu nombre para que los de los demás sigan cuadrando.»
  - supabase/migrations/0022_platform_people.sql:283-319 — platform_delete_account (the only deletion path) hands crews over, logs, then `delete from auth.users`; nothing renames or clears the linked players
  - supabase/migrations/0013_identity.sql:85 — players.profile_id … on delete set null: every players row keeps full_name, display_name, avatar_url, base_hcp, handicap_index, estimate_inputs, form_guide; tournament_results / round_results rows stay keyed to it
  - supabase/migrations/0021_platform_admin.sql:271-306 — audit_row() stores to_jsonb(old)/to_jsonb(new) of every audited players row (names, avatar, handicap, profile_id); the profile_id → null update fired by the deletion writes one more full image; audit_log has no FK and no retention (0001_schema.sql:275-288)
  - …3 more in `findings.json`
- **Verification:** Independent verifier V5: CONFIRMED, P1 (both). The notice promises that after deletion, past results «pueden quedarse sin tu nombre» (es-MX.ts:848). The only deletion path keeps the person's full name, photo, handicap, estimate inputs and form guide on every linked player row, and those stay retrievable by anyone who opens a free anonymous session with the tournament's slug or code. It also writes two more full-image audit rows and stores the email in the operat… Reproduction: My own harness db v5_verify, fresh seed: verify/evidence/V5/trust03…
- **Impact:** A person who asks to be deleted keeps appearing by full name and photo in every tournament he played (visible to members and, via lookup_tournament, to anyone with the slug), in the audit log, in the operator's deletion log and in every backup. The notice's promise is false, and an ARCO cancellation request is not actually honored.
- **Recommendation:** One definer RPC, anonymize_person(uid), called by platform_delete_account and by a future self-service delete: rename linked players to «Jugador borrado» (display name «Borrado»), null avatar_url, form_guide, estimate_inputs, handicap_index; delete Storage objects under profiles/<uid>/ and the players' avatar files; redact personal keys (full_name, display_name, avatar_url, form_guide, estimate_inputs, email) from audit_log before/after for that person's player rows; store a salted hash, not the email, in platform_audit_log. Put a 30–35 day lifecycle rule on the R2 bucket and say so in the no…

#### TRUST-04: The aviso de privacidad lacks most of what Mexican law expects and describes the app as it was before the Admin de Polo

**P1** · CONFIRMED · new · Effort M (under a day) · Scope: both

- **Evidence:**
  - src/i18n/es-MX.ts:835-850 — the whole notice is seven short paragraphs; git show 52a643c: written 2026-09-28 «for Google sign-in… as Google checks», unchanged since, while #57–#60 (0021–0024) added the Admin de Polo, broadcast notices and switches
  - Missing identity element: no domicilio of the responsable (es-MX.ts:842 names only «Diego Gaxiola (golf@cardigan.mx)»)
  - Missing data: IP addresses and user agents kept by Supabase Auth sessions and Vercel logs; the per-IP rate limiter (src/server/auth.ts:13-26); PIN hashes (player_pins); device claims (device_sessions); the audit log with full row images; notifications; scorecard photos; data about players entered by others (names, face photos, handicaps, the three…
  - Missing processors/transfers: Anthropic (scorecard photos and PDFs go to claude-haiku-4-5, api/scorecard-extract.ts:44,74,86-91) is not named; the notice never says the data leaves Mexico (Supabase us-east-1, Vercel, Resend/SES us-east-1, Cloudflare, Anthropic, Google are US companies), nor distinguishes processors (remisiones) from transfers
  - …2 more in `findings.json`
- **Verification:** Independent verifier V5: CONFIRMED, P1 (both). Judged against the finding's stated expectations, not as legal advice: every element it lists as missing is in fact absent from the live notice. Two omissions are substantive inaccuracies, not formalities. First, a processor that receives user uploads (Anthropic, for scorecard photos and PDFs) is not named. Second, the operator's own access (Admin de Polo: every account's email, sign-up and last sign-in, profile, to… Reproduction: Live text: Chromium on https://golf.cardigan.mx/privacidad (verify/…
- **Impact:** Polo processes personal data of people in Mexico (names, faces, emails, money records, device data) and hands it to six US processors, but the notice would not pass a lawyer's first read. If a participant complains, the operator (an individual, personally) has no compliant notice to point to. Not legal advice: a Mexican data-protection lawyer should review the final text.
- **Recommendation:** Draft a complete aviso integral (plus the short version on sign-up screens) from a data inventory generated from the migrations: responsable with domicilio; data categories by source (you / your Comité / your device / Google); primary purposes (run tournaments, scoring, money tally, profiles, notices) and any secondary ones with an opt-out; processors by name and country with the international-transfer statement; ARCO + revocation procedure with a working address, what to include, identity check and the legal response time; retention per category; cookies/local storage; minors; changes (in-ap…

#### TRUST-05: The notice and terms are never shown where data is collected; nobody is asked to accept them and no acceptance is recorded

**P1** · CONFIRMED · new · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/components/LegalLinks.tsx is rendered only in src/screens/HomeScreen.tsx:109 and src/screens/profile/MiPolo.tsx:324 (grep -rn LegalLinks src)
  - No legal link or «Al continuar aceptas…» line on /entrar (account creation by email code or Google), /organizer/login (password sign-up), the /t/<slug> face grid + PIN (anonymous sign-in and device claim), Ronda rápida (adding friends and guests), Comité › Jugadores (entering other people's names, photos, handicaps) or the push permission switch:…
  - No column or table records which terms/notice version a person accepted (grep -rn -i "terms\|accepted_at\|legal_version" supabase/migrations → none)
  - Screenshots: docs/review/2026-09-30/shots/entrar-none-15pro-light-trust.png, organizer_login-none-15pro-light-trust.png, t_ensayo-none-15pro-light-trust-grid.png (names blurred)
  - …1 more in `findings.json`
- **Verification:** Independent verifier V5: CONFIRMED, P1 (both). Every place where Polo collects personal data shows neither the notice nor the terms, and nothing records acceptance: email-code and Google account creation (/entrar), organizer password sign-up, the face grid and PIN step (anonymous sign-in and device claim), and the two places where people enter other people's data (Ronda rápida guests/friends, Comité › Jugadores). The Terms carry the clause that protects the oper… Reproduction: Production, one Chromium context, phone viewport (verify/evidence/V…
- **Impact:** Under the LFPDPPP the notice has to be made available before or when the data is obtained; the 12 players enter through the face grid and never see it, and organizers create accounts without it. Without an acceptance record, Polo cannot show that anyone agreed to the Terms («Polo no cobra ni mueve dinero…», «de que sean legales donde juegan»), which is the clause that protects the operator.
- **Recommendation:** Add one line under every account-creation and first-entry action: «Al continuar aceptas los Términos y el Aviso de privacidad» (both links), including the face grid before the PIN and Ronda rápida before «Empezar». Store profiles.terms_version and terms_accepted_at (and a device-level acceptance for anonymous players in device_sessions). When the legal version changes, show a one-time sheet. e2e: assert the links are visible on /entrar, /organizer/login and /t/ensayo.

#### SEC-01: No Content-Security-Policy and no clickjacking / MIME / referrer headers in production

**P2** · CONFIRMED · new (no header, CSP or framing item in docs/audit-2026-09-28.md or $S/history/status.md) · Effort M (under a day) · Scope: both

- **Evidence:**
  - vercel.json headers[] — only Cache-Control/Content-Type; no CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
  - …4 more in `findings.json`
- **Impact:** The app renders user-controlled fields (profile bio, display/full names, tournament name/tagline, crew names, avatar_url/logo_url as <img src>) and runs an OAuth flow, y…
- **Recommendation:** Add a headers[] block in vercel.json for source '/(.*)' setting Content-Security-Policy (default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://golf.cardig…

#### SEC-02: Integrity: score provenance is client-asserted, so discrepancy detection and the audit trail can be defeated from inside a group

**P2** · CONFIRMED · new · Effort S (under 2 h) · Merged: DB-11

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** A player could change a group mate's score without the discrepancy flag or an honest audit entry.
- **Recommendation:** Derive provenance on the server from the authenticated principal and make discrepancy detection independent of client fields. Details withheld from this public repository while it is public…

#### SEC-03: Outbound request hardening: user-supplied push endpoints are not restricted (request-forgery class)

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** The push dispatcher can be made to send requests to hosts the operator never intended.
- **Recommendation:** Allow-list push service hosts and validate endpoints when they are saved and when they are used. Details withheld from this public repository while it is public (CHAIR-02); the full evidenc…

#### SEC-04: Abuse resistance: the PIN lockout can be triggered against other players

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 #29) · Effort M (under a day)

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** Someone other than the player could keep players out of Entrar on the day.
- **Recommendation:** Rate-limit at the edge and redesign the lockout so only the device attempting the PIN is slowed; alert on bursts. Details withheld from this public repository while it is public (CHAIR-02);…

#### SEC-05: Availability: an expensive read path can exhaust the database statement budget

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** A cheap request pattern could degrade the database for everyone.
- **Recommendation:** Index the predicate, move the read behind a definer RPC with limits, and budget query cost. Details withheld from this public repository while it is public (CHAIR-02); the full evidence and…

#### SEC-06: Data minimisation: an anonymous tournament lookup returns more of the roster than the join step needs

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 #39) · Effort S (under 2 h) · Merged: TRUST-06

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** Strangers can learn the field's full names and photos.
- **Recommendation:** Return display names only before a claim; use unguessable slugs or invite links. Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproducti…

#### TRUST-07: Storage exposure: the public bucket is listable and uploads never expire

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** Uploaded files can be enumerated and remain reachable indefinitely.
- **Recommendation:** Disable listing, use unguessable paths or signed URLs, and add retention. Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are…

#### TRUST-08: Profiles are discoverable by default and the directory can be enumerated

**P2** · CONFIRMED · new · Effort S (under 2 h) · Merged: STRAT-16

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** People's names, photos, clubs and cities can be collected.
- **Recommendation:** Make discovery opt-in and limit what search returns. Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.

#### TRUST-09: No self-service account deletion and no «descargar mis datos»: access and cancellation depend on a manual email (to a mailbox that bounces)

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - grep -n "create or replace function public\.[a-z_]*delete" supabase/migrations/*.sql → only platform_delete_account (admin-only, 0022_platform_people.sql:283)…
  - …2 more in `findings.json`
- **Impact:** A person who wants his data or wants out must write an email (TRUST-01: it bounces) and wait for Diego to run an admin action by hand. Top consumer products (and Apple's…
- **Recommendation:** Editar perfil › «Descargar mis datos» (profile_export(): profile, rounds, tournaments, money, friends, crews, rivalries, notifications as JSON) and «Borrar mi cuenta» (typed confirmation, c…

#### TRUST-10: Backups carry secret-shaped and personal fields indefinitely

**P2** · CONFIRMED · new · Effort S (under 2 h) · Merged: DB-08

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** A leaked backup would expose more than it needs to.
- **Recommendation:** Exclude secret material, encrypt with an operator-held key, and add retention. Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction…

#### TRUST-11: Crew membership controls are too permissive

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** People can end up with access to a group's profiles that the owner cannot revoke.
- **Recommendation:** Owner approval and removal; expiring invite codes. Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.

#### TRUST-12: Money copy reads like a wagering product and the only disclaimer sits in Terms nobody accepts; the Ley Federal de Juegos y Sorteos question has not been put to a lawyer

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/i18n/es-MX.ts:649-650 — «Para la casa» / «Se aparta de la bolsa»; :1818 houseCut «Para la casa: $…»; :1555 «Apuestas directas»; :1838 «Apuestas»; :665 unit…
  - …3 more in `findings.json`
- **Impact:** The Calcutta (an auction pool paid out on results), side pots, direct bets and a «house» cut are recorded, settled and shared by Polo. The LFJS puts games «cuando en ell…
- **Recommendation:** Put «Polo solo lleva la cuenta: no cobra, no guarda ni mueve dinero.» under Dinero, the Calcutta board and the settlement share card; rename «Para la casa» → «Gastos del grupo», «Banco» → «…

#### TRUST-13: No age requirement anywhere, while the product runs money games and takes emails and photos

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/i18n/es-MX.ts:835-860 — neither the notice nor the terms mention age or minors; grep -n -i "menor\|edad\|18 años" src/i18n/es-MX.ts → none
  - …1 more in `findings.json`
- **Impact:** Junior golfers are common in club rounds; a Ronda rápida «con dinero» can include a minor with no check, and a minor can create a discoverable profile. Processing minors…
- **Recommendation:** Terms: 18+ to use money features and to create an account (or under-18 only with a guardian); a «Confirmo que tengo 18 años o más» check at account creation; hide money options for a tourna…

#### TRUST-14: A player cannot see Comité corrections to his own card: no mark, no reason, no notice; the audit trail is Comité-only

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - supabase/migrations/0009_score_reason.sql:5-16 + 0010_admin_safety.sql:476-510 — a Comité correction (admin_save_score) stores scores.reason, which members can…
  - …4 more in `findings.json`
- **Impact:** The Comité are players with money at stake; after a card is signed one of them can change a competitor's hole and the competitor only notices if he re-adds his card. For…
- **Recommendation:** On the Tarjeta and Jugador sheet, mark corrected holes («Corregido por el Comité») and show who/when/why from scores.reason + a member-safe view over audit_log limited to that player's scor…

#### TRUST-15: Signing out does not clear a device's previous identity for offline use

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** On a shared phone, the previous player's access and data can reappear.
- **Recommendation:** Wipe the cached identity and snapshot on sign-out or player change. Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the…

#### TRUST-16: People added by a Comité (names, face photos, handicaps, three gross scores, a free-text form guide) are never told, and have no way to see, fix or remove their data themselves

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - supabase/migrations/0001_schema.sql:90-107 + 0013_identity.sql — players rows are written by organizers (players_write, 0003_rls.sql:70); estimate_inputs holds…
  - …2 more in `findings.json`
- **Impact:** Most of the people whose data Polo holds never signed up: the 12 players are rows the Comité typed, and Ronda rápida guests are typed by a friend. They have no notice, n…
- **Recommendation:** Terms: the organizer confirms he may share the names and photos of the people he adds and informs them; notice: a section «Si alguien te agregó a un torneo». On the face grid and after the…

#### TRUST-18: Nothing is ever deleted: audit images, deletion logs with emails, notifications, anonymous accounts and expired tokens are kept forever, and the audit log outlives deleted tournaments

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - supabase/migrations/0001_schema.sql:275-288 — audit_log.tournament_id has no FK; deleting a tournament fires DELETE audit rows with the full before-image of ev…
  - …3 more in `findings.json`
- **Impact:** Personal data accumulates without limit and without a stated purpose once a tournament ends; the notice gives no retention period, so any period is hard to defend, and d…
- **Recommendation:** Write a retention table into the notice and implement it with pg_cron (or a Vercel cron calling a definer RPC): anonymous users idle 180 days → delete; expired link tokens → delete daily; n…

#### TRUST-22: The operator's access is silent: his reads of any tournament, account or crew are not logged, and unlocking a Protegido tournament is invisible to its Comité

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - supabase/migrations/0021_platform_admin.sql:146-151 — is_tournament_member = is_tournament_participant(tid) OR is_platform_admin(): the admin reads every table…
  - …2 more in `findings.json`
- **Impact:** One person can open any tournament (every hole, everyone's money, the Comité's audit), any account (email, sign-in times, crews) and any crew (members, join code) and le…
- **Recommendation:** Log person, tournament and crew views (platform_log('view', …)) with a short required reason; merge platform_audit_log rows for a tournament (views, unlock, relock) into tournament_audit so…

#### TRUST-23: A quick round can expose a friend's private profile data to people outside it

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** Private names, photos and indexes can reach strangers.
- **Recommendation:** Copy only consented fields into a shared round and honour «No soy yo». Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in…

#### TRUST-24: The dispute trail names the PIN, not the phone: a second phone with a player's PIN claims him silently and its edits read as his in Historial

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - CLAUDE.md §7 «The Comité sets and resets PINs from the admin» — the Comité knows every PIN (Ensayo: all ••••, docs/handoff.md); players cannot change their own…
  - …3 more in `findings.json`
- **Impact:** In a money dispute («yo no puse ese 9») the record says the player did it. Anyone who has seen a PIN (the Comité, who typed them all, or whoever read the WhatsApp messag…
- **Recommendation:** Record a device label at claim time (platform + browser from the user agent, and «cuenta» vs «teléfono»), show «Ana, desde otro teléfono» in Historial when the writer is not the player's fi…

#### SEC-07: Shared-device session isolation is weak

**P3** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** A borrowed or lost phone keeps more access than it should.
- **Recommendation:** Offer global sign-out and clear local state on sign-out. Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private re…

#### SEC-08: A secret comparison in a serverless route is not constant-time

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** A theoretical timing side channel on an operational secret.
- **Recommendation:** Use a constant-time comparison. Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.

#### SEC-09: The push service worker follows payload URLs without an origin check

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** Defence in depth only: every current sender is trusted.
- **Recommendation:** Accept only same-origin paths in notification clicks. Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private repor…

#### SEC-10: Social actions (friend requests, proposals, notices) are not rate-limited

**P3** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** A single account could spam other people.
- **Recommendation:** Rate-limit per sender and per recipient; add block/report flows. Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the pr…

#### SEC-11: A score write policy does not bind every key to the tournament

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.
- **Impact:** An organizer could attach a record to the wrong tenant's player (own-tenant integrity).
- **Recommendation:** Add the tenant bind to the policy's WITH CHECK and a test for it. Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the p…

#### TRUST-21: The terms are five sentences: no governing law or venue, no change mechanism, no liability limits, no account suspension process, no organizer obligations

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/i18n/es-MX.ts:851-859 — «El servicio», «El dinero», «Tu cuenta», «Tu contenido», «Privacidad»; nothing on jurisdiction, applicable law, changes and notice,…
- **Impact:** If money goes wrong between friends (a mis-set prize, a Comité edit), the operator's only shield is «se ofrece tal cual»; a lawyer would add the rest in an hour.
- **Recommendation:** Have a Mexican lawyer expand the terms (applicable law and courts, changes with in-app notice, liability limit, organizer responsibilities, money disclaimer repeated, suspension with reason…

### 6.3 Reliability, offline and realtime

23 findings: 4 P0 · 7 P1 · 10 P2 · 2 P3.

#### ARCH-01: Outbox silently drops a newer write to the same hole when it is re-queued while a flush is running ("Deshacer" or a quick correction is lost)

**P0** · CONFIRMED · new. The pattern (a flush over a snapshot copy, then delete by key) has been in src/data/outbox.ts since the outbox was written (9aecbfc, #… · Effort S (under 2 h) · Scope: both · Merged: QA-01

- **Evidence:**
  - src/data/outbox.ts:189 — enqueue() replaces the queued item by key: `queue = [...queue.filter((x) => x.key !== item.key), item]` and `d.items.put(item)` overwrites the Dexie row with the same key
  - src/data/outbox.ts:270-274 — flush() iterates a copy taken at start (`for (const item of [...queue])`), pushes the OLD object, then deletes BY KEY: `queue = queue.filter((x) => x.key !== item.key); if (d) await d.items.delete(item.key)` — this removes the newer item that was enqueued under the same key while the old one was in flight or still pend…
  - src/data/outbox.ts:263 — a second flush() while one runs returns immediately (`if (flushing) return`), and the finally block only re-flushes if the queue is non-empty, which it no longer is
  - src/screens/tournament/ScorecardScreen.tsx:316-323 — the "Deshacer" toast re-writes the same four keys via writeHole() seconds after the save, i.e. exactly while the save is being pushed (four sequential pushes)
  - …6 more in `findings.json`
- **Verification:** Independent verifier V3: CONFIRMED, P0 (both). Lost data in the core scoring flow, silently: a player's last value for a hole never reaches the server (and is deleted from IndexedDB, so no restart recovers it) while the Tarjeta line reads «Sincronizado». That is the P0 definition ('lost or corrupted data'). The trigger is narrow on good signal: the per-key window lasts until that player's push lands, which is about 1 round trip (~150 ms on the QA live log) for t… Reproduction: My own deterministic repro (not the authors'): $S/verify/evidence/V…
- **Impact:** On the course, a player taps "Guardar hoyo", sees the mistake, and taps "Deshacer" (or swipes back and re-saves) while the four pushes are still going out on 4G. The correction is applied locally, then deleted from the queue and from IndexedDB when the older push lands; the server keeps the wrong strokes, the next realtime reload shows them, and nothing says a write was lost. Wrong strokes change Stableford points, the snake holder and the money. The window is the whole flush (4 sequential round trips, seconds on weak signal; unbounded when a request hangs, see ARCH-10).
- **Recommendation:** In flush(), after a successful push remove the item only if the queued item for that key is still the same object/version (e.g. compare createdAt or a monotonically increasing seq stored on the item; `if (queue.find(k)?.seq === item.seq) delete`), and delete from Dexie with the same guard inside a Dexie transaction (`db.items.where({key}).and(x => x.seq === item.seq).delete()`). Iterate the live queue, not a snapshot copy, so a replaced item is pushed with its newest payload. Add tests: same key re-enqueued during an in-flight push, and re-enqueued while still pending in the current pass; ass…

#### REL-01: Realtime delivers nothing: the channel subscribes to teams/team_members, which are not published, so the server rejects the whole postgres_changes subscription while the header says «En vivo»

**P0** · CONFIRMED · new — regression introduced by 5c7068f (#51, 2026-09-29), after the 2026-09-28 audit; before it the channel listed exactly the published ta… · Effort S (under 2 h) · Scope: both · Merged: DB-06

- **Evidence:**
  - src/data/tournamentStore.ts:197-218 — REALTIME_TABLES includes 'teams' and 'team_members'; one channel binds postgres_changes for all 20 tables (tournamentStore.ts:268-275)
  - supabase/migrations/0003_rls.sql:172-175 and 0011_games.sql:90 are the only `alter publication supabase_realtime add table` statements; 0020_teams.sql never adds teams/team_members
  - logs/rt-control.log (same Nico JWT, three channels, one no-op score upsert): onlyScores → SUBSCRIBED, system 'Subscribed to PostgreSQL', UPDATE event at +614 ms; appList (the app's exact 20 tables) → SUBSCRIBED, system 'Unable to subscribe to changes with given parameters. Please check Realtime is enabled for the given connect parameters: [event:…
  - logs/rt-delivery.log (the real app in Chromium, socket bridged through Node because the sandbox relay 500s Chromium's WS handshake): header text 'Ensayo · Nacho Invitational / En vivo', zero postgres_changes frames and zero snapshot reloads in the 8 s after a score write
  - …5 more in `findings.json`
- **Verification:** Independent verifier V9: CONFIRMED, P0 (both). A core flow fails on the day: the one Realtime channel the app opens (tournament:<id>) is refused server-side for postgres_changes, so no device receives any change from any table. Phones only catch up when they fire online/visibilitychange or the socket re-joins; an always-visible screen (the TV at dinner and at the villa, the Calcutta TV board, the ceremony) never refreshes, and an open phone misses the §2 '<2 s'… Reproduction: 1) Harness (own db v9_rel): `select tablename from pg_publication_ta…
- **Impact:** Since 29 Sep no phone, TV or ceremony screen receives any live change. A board only refreshes when that device fires `online` or `visibilitychange` (the user locks/unlocks or switches apps) or saves itself. The TV at dinner and at the villa is always visible, so it never refreshes: on Calcutta night the TV board would not show a single bid, sale or pot change; during the rounds the TV leaderboard freezes at page load. The §2 success criterion (other phones see a new score in < 2 s) fails outright, and the green «En vivo» chip tells everyone the board is live.
- **Recommendation:** Migration: `alter publication supabase_realtime add table public.teams, public.team_members;` (or drop them from REALTIME_TABLES). Client: register a `system` handler and treat `status: 'error'` as CHANNEL_ERROR (show «Sin actualizaciones en vivo» and start a polling fallback, see REL-05). Tests: a CI check that every table in REALTIME_TABLES is in the publication (parse migrations or query pg_publication_tables in the local harness), and an e2e with two browser contexts asserting a saved hole appears on the other context in < 2 s (the smoke only uses one context, which is why this shipped).

#### REL-05: Tarjeta cruzada loses real scores: every save writes all four players (untouched ones at par defaults) and the open hole never picks up the other phone’s save, so the second scorer overwrites the first scorer’s entries

**P0** · CONFIRMED · new (not in the 2026-09-28 audit or the mapped history). The dispute flag (0008/0010) and the Comité inbox came earlier, but they flag the… · Effort M (under a day) · Scope: both

- **Evidence:**
  - logs/race-A-h14.log (product as-is): Nico’s phone keeps the rival pair (idx 1,3 → 5 and 6), player D’s phone keeps Nico’s pair (idx 0,2 → 3 and 5); D saves 400 ms later. Server: [3,4,5,4] all entered_by D, all disputed; Nico’s real 5 and 6 are gone (only in `previous` and audit)
  - logs/race-A-h13-realtime-fixed-3s.log: same with Realtime working (bridge fix) and D saving 3 s after Nico’s rows were already committed: D’s par defaults still overwrite Nico’s real 6 and 7
  - src/screens/tournament/ScorecardScreen.tsx:165-175 — drafts are initialised once per hole change from the snapshot (par/2 putts when unplayed) and deliberately never refreshed by Realtime; :273-279 writeHole() enqueues all four players regardless of which steppers were touched; the Tarjeta auto-advances to the next hole after each save (:328), so…
  - src/data/outbox.ts:229-233 — plain upsert on (round_id, player_id, hole): last arrival wins
  - …1 more in `findings.json`
- **Verification:** Independent verifier V9: CONFIRMED, P0 (both). Corrupted scores in the brief's own workflow: with tarjeta cruzada (§5.5/§9.3, RUNBOOK §2 «Llevas la tarjeta de: [pareja rival]. Cualquiera del grupo puede capturar a los cuatro») two phones save every hole, and whichever saves second writes par/2-putt defaults over the other pair's real strokes and putts. That moves Stableford points, the snake (a real 3-putt becomes 2), best round, pairs and the live «si terminara… Reproduction: Client, write-free, on the real app (HEAD build on :4209, productio…
- **Impact:** The brief’s own workflow (§5.5, §9.3: each pair keeps the other pair’s card, two phones per group) makes this the normal case, on every hole: whichever scorer saves second replaces the other pair’s real strokes with par. A net double bogey recorded as par is +2 Stableford points; over 18 holes and 3 groups the individual, pairs, best-round and Calcutta payouts move. The rows are flagged, but the copy tells players the last value counts and signing the card makes it final.
- **Recommendation:** Write only the rows the user changed (track dirty players; «untouched» already exists for the badge), never a default over a saved value; when a remote save lands on the open hole, merge it into untouched drafts and show «Diego ya capturó a Justo: 6»; send the version the draft was based on and let the server refuse a stale overwrite (see REL-06). Signing must be blocked (or require an explicit choice) while any hole of that card is disputed. Test: two-context Playwright race (this repro) asserting both phones’ real values survive.

#### REL-16: Queued scores are lost when the session lapses in a dead zone: after a failed token refresh the app signs in as a new anonymous user, the phone's queued holes are rejected, and a player can only «Descartar»

**P0** · CONFIRMED · new (not in the 2026-09-28 audit or the mapped history). · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - logs/session-loss.log: player D queues hole 16 offline (4 items); the stored refresh token is made invalid and the access token expired (stand-in for a revoked/reused token); on reconnect: `token?grant_type=refresh_token 400`, stored session removed, outbox items 0 → rejected 4; the Tarjeta shows «4 rechazados» with four «Descartar» buttons and no…
  - src/data/outbox.ts:251-254 — «row-level security|violates|permission denied» is classed as permanent, so an auth failure (no session) looks like a rule violation; src/components/RejectedWrites.tsx:50 and ScorecardScreen.tsx:475,612 — resend only for admins
  - Trigger is PLAUSIBLE rather than demonstrated end to end: Supabase revokes a session when a rotated refresh token is reused after the 10 s reuse window, which happens when a refresh response is lost on a flaky link and the retry comes late; auth-js then signs out (GoTrueClient _callRefreshToken non-retryable path)
- **Verification:** Independent verifier V9: CONFIRMED, P1 (both). A clear defect in the offline path that §2 promises («syncs later without losing anything»). When the device cannot present a user session, supabase-js falls back to the anon key; PostgREST answers 42501; the outbox classes that as a permanent rule violation and parks the holes. A non-admin can only discard them (RejectedWrites resend is admin-only), and nothing says the session is the cause. The trigger is more pla… Reproduction: Client chain, fully local: `node $S/verify/evidence/V9/session-dead…
- **Chair:** Raised to P0 by the chair on V10's evidence: in about two thirds of timings where signal returns during the 60 s cooldown after a failed token refresh, the app signs in as a brand-new anonymous user, sends the queued holes without the player's identity (all 4 rejected, 401/403) and drops to «Elige tu nombre»; it also happened to a phone opened normally that lost signal across its token expiry. The player sees only «El servidor no aceptó este cambio.» and a non-admin can only discard. V9 had confirmed the mechanism at P1 with a rarer trigger; V10 showed the common one. Losing scores on the course is P0 by the brief.
- **Impact:** A player whose phone lost its session mid-round loses every unsent hole: they are refused, he cannot resend them, and nothing tells him he is signed out until he reopens the app and gets the face grid again.
- **Recommendation:** Before flushing, require a live session; on SIGNED_OUT pause the outbox and ask for the PIN again (same player), then resume; classify 401/JWT/`no session` as retryable-after-reauth, never permanent; let any player resend his own rejected rows once the cause is fixed. Test: outbox.test.ts case «session missing → items stay queued», plus this e2e.

#### REL-02: After a cold open from cache, reconnecting never resumes live data: the gate re-seeds the old snapshot and the phone stays on it, labelled «Sin señal», until the app is killed

**P1** · CONFIRMED · partly fixed (AUD-P1-15, marked fixed in history/status.md): the online/visibility reloads exist, but only for a subscribed store; a cache-… · Effort M (under a day) · Scope: both

- **Evidence:**
  - logs/two-days-run2.log — reopened offline with an expired token; signal returned at t1: outbox drained at +10.1 s (chip «Sincronizado»), but the header stayed «Sin señal: mostrando lo último guardado (03:46 a.m.).» for the whole 75 s watch, with ZERO lookup_tournament / my_membership / tournaments requests; only a full page navigation recovered it
  - src/screens/tournament/TournamentGate.tsx:128-135 — the `online` retry calls resolve(); resolve() → ensureSession() → getSession() under an 8 s withTimeout (src/data/auth.ts:78-84) that expires while auth-js is still in its refresh back-off, so the catch (TournamentGate.tsx:117-121) calls enterFromCache() again and fromCache stays true; nothing re…
  - src/data/tournamentStore.ts:71-79,285 — the store only registers its online/visibilitychange reload listeners inside subscribe(), which a cached open (seed) never calls, so switching apps does not recover either
  - docs/review/2026-09-30/shots/t-ensayo-15pro-light-rel-cache-2days-offline.png — the cached open: global banner, «Sin señal» twice, «mostrando lo último guardado (03:46 a.m.)» for a 2-day-old snapshot, «Actualizado hace 2880 min»
- **Verification:** Independent verifier V10: CONFIRMED, P0 (both). The literal symptom (stuck on the cached board, header «Sin señal» while online) reproduces, but it is the rarest outcome of this trigger; on its own it would be P1. The same trigger (signal returning after a cached open with an expired token) usually lands in auth-js's 60 s refresh-failure cooldown, about 2/3 of the time. Then the gate signs the device in as a NEW anonymous user and the outbox pushes the queued hol… Reproduction: Own harness $S/verify/evidence/V10/coldopen.mjs. The golden profil…
- **Chair:** V10 recommended P0 because the reconnect path can also re-sign in anonymously and reject queued holes; the chair files that path under REL-16 (P0) to avoid counting it twice. REL-02 itself — a phone that stays on the cached board for 73 s+ after signal returns, labelled «Sin señal» while online — stays P1 (about 5% of timings).
- **Impact:** Day 2 morning: a player opens the app at the first tee with poor signal and an overnight-expired token. The signal comes back on hole 1, his holes sync («Sincronizado»), but every board (En vivo, Juegos, Dinero, the Tarjeta) keeps showing last night’s snapshot plus his own writes for as long as the app stays open, under a header that claims there is no signal. His Tarjeta therefore shows holes his playing partners already entered as unplayed, with par defaults (see REL-07).
- **Recommendation:** Make recovery independent of one event: on `online`, `visibilitychange` and a periodic timer while fromCache, retry resolve() with back-off until it succeeds; register the store listeners at seed() too; do not wrap getSession in a timeout that turns a slow refresh into «offline» — race it and keep waiting in the background. Label the state from facts (navigator.onLine and last successful fetch), not from `realtime === off`. Test: Playwright persistent context, expired token, offline open, reconnect → assert a snapshot fetch and a live header within 15 s.

#### REL-03: Opening the app with no signal after the token expired shows a blank spinner for 16 s before the cached boards

**P1** · CONFIRMED · partly fixed (AUD-P0-5, marked «fixed» in history/status.md on code reading: it holds for a valid token only; an expired token costs 16.5 s) · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - logs/two-days.log and logs/two-days-run2.log — «phase2a board visible after ms: 16381» and «16380»
  - src/data/auth.ts:38-58 — AppShell init waits up to SESSION_TIMEOUT_MS (8 s) on getSession(); TournamentGate waits for authReady, then ensureSession() (auth.ts:78-84) waits another 8 s on getSession(); only then does the lookup fail and enterFromCache() run
  - auth-js retries the refresh with exponential back-off while offline (token requests at +0.25, 0.58, 0.98, 1.8, 3.4, 6.6, 13.0 s… in the same log), so both getSession() calls sit the full 8 s
  - docs/review/2026-09-30/shots/t-ensayo-15pro-light-rel-cache-2days-offline.png — the cached open: global banner, «Sin señal» twice, «mostrando lo último guardado (03:46 a.m.)» for a 2-day-old snapshot, «Actualizado hace 2880 min»
- **Verification:** Independent verifier V10: CONFIRMED, P1 (both). Deterministic 16.4–16.6 s before the cached board whenever the stored access token is expired (or within auth-js's 90 s margin) and the network fails fast. Supabase access tokens live 1 h, so this is every phone reopened after ~58 min idle (overnight before Day 2, after lunch, after iOS kills the PWA) where there is no signal. During those 16 s nothing works: the Tarjeta sits behind the gate. The cached board does a… Reproduction: Own harness $S/verify/evidence/V10/coldopen.mjs (persistent Chromi…
- **Impact:** Every phone that was closed for more than an hour (overnight, lunch between rounds) and is opened where there is no signal shows a white screen with a spinner for 16 s. On the course that reads as «the app is broken»; people reach for paper or reopen the app repeatedly.
- **Recommendation:** Decide from local facts first: if navigator.onLine is false or the stored session exists, render the cached tournament immediately (seed) and resolve the session/lookup in the background; never chain two timeouts on the critical path. Test: persistent-context Playwright, expired token, offline open → assert the board within 1.5 s.

#### REL-08: Scores queued on a player’s phone when the round is finished are rejected into a hidden list: the player is never told, the Comité cannot see them, and the Tarjeta names the wrong day

**P1** · CONFIRMED · partly fixed (AUD-P0-4, 2026-09-28): 04b2216 (#23) stopped deleting refused writes. The remaining gap (the list is per device, invisible af… · Effort M (under a day) · Scope: both

- **Evidence:**
  - logs/finish-race.log: player D (non-admin) queues hole 11 offline (4 items); the Comité finishes round 2; D reconnects → IndexedDB `items` 0, `rejected` 4; D’s Tarjeta reads «El día 1 ya terminó. Solo el Comité puede corregir tarjetas.» (round 2 was the one played); En vivo has no mention; after a reload still nothing; server hole 11 unchanged
  - docs/review/2026-09-30/shots/t_tarjeta-ensayo-15pro-light-rel-rejected-hidden.png
  - src/screens/tournament/ScorecardScreen.tsx:59-66 — a non-admin on a non-live round gets the EmptyState, so <RejectedWrites> (rendered only inside GroupCard, :475 and :612) never mounts; the shell header shows no pending/rejected state (TournamentShell.tsx:56-61)
  - src/components/RejectedWrites.tsx:1-6 promises the Comité can resend from Comité › Tarjetas, but the list is per-device Dexie state (src/data/outbox.ts:62-69, 93, 125-134): the Comité’s device never sees another phone’s rejections
  - …3 more in `findings.json`
- **Verification:** Independent verifier V9: CONFIRMED, P1 (both). The core is real. A non-admin player's holes that were queued when the round got finished are refused (RLS 42501) and parked in a per-device list. That list is rendered only inside the Tarjeta's GroupCard, which a non-admin never reaches on a non-live round, so after the last round nobody sees it: not the player, and not the Comité, whose device holds only its own rejections. RUNBOOK §4 promises the opposite («el te… Reproduction: DB, harness (own db v9_rel, `psql -h 127.0.0.1 -p 5433 -U postgres…
- **Impact:** A player whose phone was out of signal on the last holes (or simply locked in a pocket) loses those holes when the Comité closes the day: unplayed holes score 0 points (§18.7), so standings, the best round, pairs, Calcutta slots and the settlement are computed without them, and nobody on the course is told anything.
- **Recommendation:** (1) Make unsent and rejected writes visible from every tournament screen (a shell-level banner «3 hoyos sin subir / 4 rechazados», not only inside GroupCard). (2) Report device outbox state to the server: a `device_outbox` heartbeat (or Realtime Presence) with pending/rejected counts per player, shown to the Comité in Rondas before «Terminar» («El teléfono de Rodrigo tiene 9 hoyos sin subir»). (3) Upload rejected items to a server-side `rejected_writes` table (insert allowed even when the round is closed) so the Comité can accept them with a reason. (4) Map Postgres/RLS failures to specific c…

#### REL-09: An admin player’s queued scores bypass «round live» and «card signed»: after reconnecting they silently rewrite a finished round (no reason, no dispute)

**P1** · CONFIRMED · partly fixed (AUD-P1-28): d0465fe (#27) made the Tarjeta ask an admin for a reason on a signed card (ScorecardScreen.tsx:258-261, 277), but… · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - logs/finish-race.log: Nico (is_admin player) queues hole 10 offline (player d654: 4 → 5); the round is finished; Nico reconnects → the write is accepted: hole 10 «d654:5@962a», round status «finished», disputed=false, no reason
  - supabase/migrations/0003_rls.sql:105-112 — scores_write lets `is_tournament_organizer` write regardless of round_is_live / card_is_signed; 0021_platform_admin.sql:119-127 counts `players.is_admin` as organizer
  - src/screens/tournament/ScorecardScreen.tsx:226-228,277-278 — the reason rule (§7) is only applied when the card is signed at the moment of saving; an item queued earlier replays later through the plain upsert (src/data/outbox.ts:231-233)
  - supabase/migrations/0015_results.sql:278-292 — score changes on a finished round re-run refresh_round_results, so the closed day’s results move
- **Verification:** Independent verifier V9: CONFIRMED, P1 (both). A clear defect against §7 («Admins can always write, but must give a reason once a card is signed»). A value an admin player queued while the round was live replays later through the plain upsert and lands on a finished round and a signed card with no reason. If he was also the previous writer, there is no discrepancy flag either. That silently changes a closed day: round_results are recomputed, and because the engi… Reproduction: Harness (own db v9_rel, `psql ... -f $S/verify/evidence/V9/v9-score…
- **Impact:** The Comité members are also players (RUNBOOK: Nico runs the Comité with a PIN). A stale value queued on the Comité’s own phone lands after the day was closed or the card signed, overriding what the group signed, with no reason and no discrepancy flag when he was also the previous writer.
- **Recommendation:** Route replayed score writes through an RPC that applies the player rules (round live, card unsigned) to outbox items even for organizers, and require an explicit Comité correction (reason) otherwise; or stamp each queued item with the round status/signature state it was captured under and reject if it changed. Test: rls-test case «organizer upsert on a finished round via the player path is refused».

#### REL-11: Even with Realtime working, a saved hole reaches the other phone in 4.1 s p50 / 4.7 s p90 on 4G (target < 2 s): four sequential upserts, a full ~22-request snapshot refetch per row event, and superseded fetches thrown away

**P1** · CONFIRMED · partly fixed (audit-2026-09-28 P1-14: the 5 s rescheduling gap between players is gone; the design still misses the target). Overlaps DB-12… · Effort M (under a day) · Scope: both

- **Evidence:**
  - logs/latency-fixed-run3.log — 12 samples, two contexts, CDP 150 ms / 1.6 Mbps down / 750 kbps up (+75 ms each way on WS frames), Realtime join fixed in the bridge (REL-01 simulated fixed), load 0.6→2.9: p50 4,099 ms, p90 4,717 ms, max 5,288 ms; the first and the fourth player always appear at the same instant; phone B issued 44–88 REST requests pe…
  - logs/latency-fixed.log — the same under load 8–11: p50 4.8 s, p90 8.3 s, max 8.4 s; logs/latency-broken.log — the app as shipped: 0 of 3 samples updated within 20 s (REL-01)
  - src/screens/tournament/ScorecardScreen.tsx:274-279 — one enqueue per player, pushed one request at a time (src/data/outbox.ts:270-292): A’s four pushes finish at ~0.3/0.5/0.75/1.0 s
  - src/data/tournamentStore.ts:270-274 — every postgres_changes event (whatever the row) schedules a full fetchSnapshot 150 ms later; :233-237,248-251 — fetchSeq drops any fetch that a newer one started after, so under a burst the board renders only after the last fetch completes
- **Verification:** Independent verifier V11: CONFIRMED, P1 (both). §2 makes «other phones see a new score in under 2 seconds on 4G» a success criterion, and the design cannot meet it even after REL-01 is fixed: my independently measured pieces add up to ~4.0 s on slow 4G (REL measured p50 4.1 s) and ~2.7-2.9 s on a good ~60 ms link, with ~1.7 s left even at zero network latency. That is a clear, measurable miss of a stated acceptance criterion (P1). Not P0: scores are not lost and… Reproduction: Decomposition from the code, then each piece measured (all evidence…
- **Impact:** The §2 success criterion fails by 2× even after REL-01 is fixed; with twelve phones saving holes, each device does 2–4 full refetches per hole of every group (≈40–90 requests), which on weak signal feeds straight into REL-10.
- **Recommendation:** Apply the Realtime payload (`payload.new`) directly to the snapshot and recompute locally — no refetch for scores/tiebreaks/signatures; refetch only for structural tables. Save a hole as one request (array upsert or `save_hole(rows)` RPC). Filter the channel by tournament (`filter: round_id=in.(…)` / tournament_id) and keep one fallback refetch on reconnect. Add a two-context latency test to CI with a budget (p90 < 2 s on emulated 4G).

#### REL-14: One stalled request freezes the whole outbox: pushes have no timeout, the queue is strictly serial, and `online`/visibility nudges are ignored while a push hangs

**P1** · CONFIRMED · new (not in docs/audit-2026-09-28.md); same defect as ARCH-11 (P2). Note src/lib/timeout.ts's own comment names this risk («without it a st… · Effort S (under 2 h) · Scope: both · Merged: ARCH-11

- **Evidence:**
  - logs/liefi.log part A: the first score POST of hole 15 is held (connection up, no response); holes 15 and 16 give 8 queued items; for 60 s the chip reads «8 pendientes» and IndexedDB keeps 8 items although `online` and `visibilitychange` were fired every 10 s; releasing the request drains all 8 in 2.6 s
  - src/data/outbox.ts:262-299 — `flushing` guard returns early while one push is awaited; `pushImpl` (supabase-js fetch) has no AbortSignal/timeout; the loop is serial and breaks on the first failure
  - src/lib/supabase.ts:20-29 — createClient without a custom fetch/timeout
  - Also reported as ARCH-11 (ARCH, P2): Outbox pushes have no timeout: one request that never answers (course 'lie-fi') blocks every later hole, and the chip just says 'N pendientes'
  - …2 more in `findings.json`
- **Verification:** Independent verifier V11: CONFIRMED, P1 (both). A clear defect in the one component whose job is resilience, with a trivial fix. The question that decides P1 vs P2 is whether the browser bounds the stall anyway. My calibration says it does not do so reliably. In Chromium, a push over an HTTP/2 connection whose path silently died was abandoned after ~40 s when the connection had been idle ≥ 10 s (PING health check plus a retry on a new connection), but was still p… Reproduction: (1) Deterministic outbox repro, evidence/V11/tests/outbox-stall.te…
- **Impact:** On a course, a request that stalls between cells (TCP never resets; browsers can wait minutes) blocks every later hole of that phone; the group keeps playing with «N pendientes» growing and nothing reaches the other phones or the Comité until the socket finally dies.
- **Recommendation:** Wrap every push (and every read) in an AbortController timeout (e.g. 8–10 s) and treat a timeout as a retryable network error; push holes as one batched request; on `online` abort the in-flight request and restart the flush. Test: outbox.test.ts with a push that never resolves → the item is retried after the timeout and later items proceed.

#### REL-15: Cold open on lie-fi (connected, nothing answers) never shows the cached boards: the spinner stays indefinitely

**P1** · CONFIRMED · partly fixed (AUD-P0-5 covered only fast-failing requests) · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - logs/liefi.log part B: persistent profile with SW, cache and a valid token; every Supabase request left unanswered; in 90 s the only screen was the «Polo» wordmark spinner (docs/review/2026-09-30/shots/t-ensayo-15pro-light-rel-liefi-90s.png); the board never appeared
  - src/screens/tournament/TournamentGate.tsx:79-122 — lookupTournament(), myMembership() and load() have no timeout; enterFromCache() runs only from the catch, i.e. only when a request fails fast (airplane mode), never when it hangs
  - Contrast: with the signal fully off and a valid token the cache path works (the same code path fails fast); with an expired token it takes 16 s (REL-03)
- **Verification:** Independent verifier V10: CONFIRMED, P1 (both). On a connection that is up but does not answer (one bar, dead handover, slow captive Wi-Fi) a cold open never reaches the cached board while the token is still valid, so the player cannot open the Tarjeta to score. That blocks a core flow in the most common bad-signal state, but only for cold opens (an app already open keeps working), paper is the documented fallback, and the OS eventually fails hung requests, so P1… Reproduction: `node coldopen.mjs r15-liefi-valid liefi 0 0 90` (profile with SW…
- **Impact:** The most common bad-signal state on a golf course is lie-fi (one bar, captive Wi-Fi at the clubhouse, a dead cell handover), not airplane mode. In it, opening Polo shows a spinner forever even though the phone holds the last boards and could let the player score offline.
- **Recommendation:** Open from cache first, always: seed from IndexedDB immediately when an entry exists and resolve lookup/membership/snapshot in the background with timeouts (3–5 s) and retries; show «Conectando… mostrando lo último guardado de las 10:42». Test: Playwright persistent context with a route that never answers → board visible < 2 s.

#### DB-05: Realtime subscriptions have no tournament filter, and DELETE events reach every subscriber of the table across tournaments (RLS does not apply to deletes)

**P2** · PLAUSIBLE · new · Effort M (under a day)

- **Evidence:**
  - src/data/tournamentStore.ts:268-274 — `ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => reload())` for 20 tables, no `filter`; the hand…
  - …5 more in `findings.json`
- **Impact:** Every connected phone of every tournament receives the platform's DELETE stream (primary keys of other tenants' rows) and answers each burst of them with a full 23-reque…
- **Recommendation:** Filter every subscription by tournament: tables with tournament_id get `filter: 'tournament_id=eq.<id>'`; for round-scoped tables add a tournament_id column (denormalized, set by trigger) o…

#### DB-19: The runbook's outage plan covers a paused project and paper cards, not a Supabase outage on Calcutta night, who can act, or how to restore data

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - RUNBOOK.md §5 "Si la app se cae": paper cards; §5.3 un-pause from the Supabase dashboard (needs a member of the Supabase org; CLAUDE.md §3 and the handoff name…
  - …3 more in `findings.json`
- **Impact:** If Supabase has an incident during the Thursday dinner, the Comité has no documented way to keep running the auction and settle before bed (§5.9), and the person who cou…
- **Recommendation:** Add to RUNBOOK.md: a printable auction sheet (lot order, bids, hammer, buybacks) and "enter it afterwards from the console"; who has Supabase/Vercel/Cloudflare access on the trip (at least…

#### REL-04: The cached-board label shows only a time of day, so a two-day-old snapshot reads as this morning; «Actualizado hace 2880 min»

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - logs/two-days-run2.log — snapshot aged by 2 days: header «Sin señal: mostrando lo último guardado (03:46 a.m.).», status line «Actualizado hace 2880 min»
  - …2 more in `findings.json`
- **Impact:** A player opening yesterday’s board on Day 2 is told it is from «08:12» and believes it is today’s; stale money and standings are read as current.
- **Recommendation:** Relative and absolute with date when not today («guardado ayer 18:40», «hace 2 días»); units that scale (min → h → días); style the whole board as stale (muted, banner) past a threshold. Un…

#### REL-06: Conflict rule is «last arrival wins»: the winner is whichever request reaches Postgres last, a same-player overwrite is silent, and `previous` keeps only one losing value

**P2** · CONFIRMED · new (spec weakness in CLAUDE.md §8; not in docs/audit-2026-09-28.md, whose #30 fixed a different dispute problem: the sticky player-settabl… · Effort M (under a day) · Scope: both

- **Evidence:**
  - logs/race-B-h12-four-phones.log: taps at 0/250/500/750 ms with values 5/6/4/7; audit shows P4’s 7 committed at 39.219 and P3’s 4 at 39.370 → server keeps 4, no…
  - …3 more in `findings.json`
- **Impact:** When several phones capture the same hole, the stored score is decided by radio timing, not by who entered it last or who is right; two devices of the same player (phone…
- **Recommendation:** Optimistic concurrency: add a `version` (or use updated_at) to scores, send the base version with each write (RPC `save_scores(p_rows jsonb)` that returns conflicts instead of overwriting w…

#### REL-07: A phone never reconciles its own write with the server: after the push it keeps showing its optimistic value under «Sincronizado» even when another device’s value won

**P2** · CONFIRMED · new (not in docs/audit-2026-09-28.md; its P1-15 reload-on-reconnect fix is what bounds the stale window) · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - logs/race-B-h12-four-phones.log — after all pushes succeeded the four phones showed four different values for the same score (5, 6, 4, 7) with the chip «Sincro…
  - …2 more in `findings.json`
- **Impact:** The phone that entered a score is exactly the one that believes it; with Realtime down (REL-01) the belief lasts all round. Players check «their» card, see their numbers…
- **Recommendation:** Request `return=representation` (or an RPC returning the stored row) and replace the optimistic row with it, including `disputed`; if it differs from what was sent, toast «Otro teléfono gua…

#### REL-10: Under heavy packet loss the boards silently freeze: the snapshot is ~22 requests, all-or-nothing, never retried, and nothing says the data is old

**P2** · CONFIRMED · new (adjacent to AUD-P1-15, marked fixed in history/status.md: the reload triggers exist, but a failed reload has no retry and no stale sta… · Effort M (under a day) · Scope: both

- **Evidence:**
  - logs/flaky-alternate.log (every other REST/RPC request aborted): another device changed a score; in 60 s — with the Realtime event plus a visibilitychange ever…
  - …2 more in `findings.json`
- **Impact:** On one bar of 4G the leaderboard, «si terminara ahora» money and the snake holder stop moving while every indicator says the app is live and synced; players quote number…
- **Recommendation:** Replace the 22-request snapshot with one `tournament_snapshot(tid)` RPC (one request to lose, not 22) or delta fetches keyed on updated_at; retry failed reloads with back-off; keep `lastSyn…

#### REL-13: Pages without service-worker control (first visit, in-app browsers) crash on any lazy route after a deploy; there is no chunk-load recovery

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - logs/deploy.log part 2 (context with service workers blocked, as in the WhatsApp in-app browser): after the deploy an in-app navigation to Estadísticas throws…
  - …3 more in `findings.json`
- **Impact:** A deploy during Calcutta night or between rounds breaks the TV board, the auction console or Comité screens on any device that opened the link in a browser without SW co…
- **Recommendation:** Add `window.addEventListener(vite:preloadError, …)` that reloads once (guarded by sessionStorage); exclude `/assets/` from the SPA rewrite so a missing chunk is a 404, not HTML; consider cl…

#### REL-17: Offline, the chip says only «Sin señal»: the player cannot see how many holes are waiting (36 in the test), and no screen outside the Tarjeta shows unsent or rejected holes — contrary to the RUNBOOK

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - logs/airplane.log: 36 items queued, chip «Sin señal» on the hole view and on the grid; after reconnect 36/36 reached the server (drained in 19 s)
  - …2 more in `findings.json`
- **Impact:** The one number that tells a player whether it is safe to hand the phone over, switch accounts or leave the course («9 hoyos sin subir») is hidden exactly when it matters…
- **Recommendation:** Show «Sin señal · 9 hoyos en el teléfono» in the chip and a shell-level badge on the Tarjeta tab whenever pending > 0 or rejected > 0 (every tournament screen); align the RUNBOOK.

#### REL-18: The outbox lives in best-effort storage with no cross-tab coordination: no navigator.storage.persist(), no Web Locks/BroadcastChannel, and a failed IndexedDB write leaves the hole in memory only

**P2** · PLAUSIBLE · new · Effort S (under 2 h) · Merged: PWA-11

- **Evidence:**
  - grep over src/ for storage.persist, navigator.locks, BroadcastChannel → no matches
  - …6 more in `findings.json`
- **Impact:** Under storage pressure (a phone full of vacation photos) or in Safari without home-screen install (7-day storage cap), the only copy of unsent holes can be evicted; two…
- **Recommendation:** Call navigator.storage.persist() when the first hole is queued (and show a warning if denied); write to IndexedDB first and only then update memory, surfacing a failure as «No se pudo guard…

#### REL-19: A local save makes a stale board read as fresh: the optimistic patch resets «Actualizado hace N min» to «Actualizado ahora» without any new data

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - logs/fresh-label.log: online «Actualizado ahora» → offline 75 s «Actualizado hace 1 min» → one offline save → «Actualizado ahora» (still offline, nothing fetch…
  - …1 more in `findings.json`
- **Impact:** In the states where the header does not say «Sin señal» (lie-fi, REL-10 packet loss, REL-01 dead Realtime) every hole a group saves stamps the whole board «Actualizado a…
- **Recommendation:** Track `serverSyncedAt` (last successful fetch/realtime apply) separately from local patches and show only that; unit-test that patch() does not change it.

#### REL-21: Connection states read inconsistently: «Sin señal» three times on a cached open, nothing at all while the channel is (re)connecting, «En vivo» whenever the join reply is ok

**P3** · CONFIRMED · partly fixed (audit-2026-09-28 P2 «Sin señal … can contradict») · Effort S (under 2 h)

- **Evidence:**
  - docs/review/2026-09-30/shots/t-ensayo-15pro-light-rel-cache-2days-offline.png — global banner «Sin señal. Se guarda en el teléfono.», header chip «Sin señal» a…
  - …1 more in `findings.json`
- **Impact:** Players learn to ignore the indicators; when one matters (REL-01, REL-10) nobody trusts it.
- **Recommendation:** One status model (offline / connecting / live / stale since hh:mm / sync problem) rendered in one place; drop the duplicate banner on tournament screens.

#### REL-22: The Comité correction path in the Tarjeta (signed card) is online-only: offline it shows a raw English network error and can save half a hole

**P3** · PLAUSIBLE · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/ScorecardScreen.tsx:273-279 — for a signed card each player goes through adminSaveScore (a direct RPC, src/data/api.ts:409-419) in seque…
  - …2 more in `findings.json`
- **Impact:** A Comité correction made on the course without signal fails loudly in English or, worse, lands for one player and not the other.
- **Recommendation:** Queue Comité corrections through the outbox as an `admin_score` item carrying the reason, or save the hole as one RPC; map network errors to Spanish copy.

### 6.4 Architecture and code quality

14 findings: 1 P0 · 0 P1 · 10 P2 · 3 P3.

#### ARCH-09: Any tournament with a team draw can no longer be opened: the store orders team_members by a non-existent `id` column and production PostgREST answers 400

**P0** · CONFIRMED · new (introduced in #51, 2026-09-29, after the 2026-09-28 audit). · Effort S (under 2 h) · Scope: platform

- **Evidence:**
  - src/data/tournamentStore.ts:108-119 — the store's PK map lists 10 tables without an id column but not `team_members`; line 130 falls back to `for (const c of PK[table] ?? ['id']) qb = qb.order(c)`
  - src/data/tournamentStore.ts:171 — `inList('team_members', 'team_id', teamIds)` runs whenever the tournament has at least one team
  - supabase/migrations/0020_teams.sql:26-30 — team_members has no id column (primary key (team_id, player_id))
  - Read-only probe against production with the public anon key: `GET /rest/v1/team_members?select=*&team_id=in.(0000…)&order=id.asc` → HTTP 400 {"code":"42703","message":"column team_members.id does not exist"}; the same query with `order=team_id.asc,player_id.asc` → HTTP 200 []
  - …4 more in `findings.json`
- **Verification:** Independent verifier V4: CONFIRMED, P0 (platform). By the definitions this is «a core flow that fails on the day» for every tournament in a format the platform ships today. The wizard offers four formats, one of them «team» (scramble / best ball / shamble; FormatPicker.tsx:19, schema.ts:34). The moment the Comité saves the team draw, the tournament can no longer be loaded: deterministically, on every device, 100% of the time, not in an edge case. Fresh devices get a… Reproduction: (1) Code: tournamentStore.ts:108-119 PK map has no team_members…
- **Impact:** The team formats (scramble, best ball, shamble) are offered in the wizard (FormatPicker.tsx:19) but the moment the Comité saves the team draw, every device that opens the tournament fresh gets 'column team_members.id does not exist' instead of the app, including the Comité itself, so nobody can even undo the draw from the UI. Devices with an older cached snapshot silently show pre-draw boards with no realtime. For a team event this is a total outage on the day; it does not affect the first tournament's Stableford format.
- **Recommendation:** Add `team_members: ['team_id', 'player_id']` to the store's PK map now. Then remove the duplication that caused it: one exported registry (table → parent key → primary key → realtime yes/no) in src/lib/tournamentTables.ts used by fetchSnapshot, REALTIME_TABLES, backup.ts export and the cron's BACKUP_TABLES, with the existing migrations-vs-list test extended to it. Add an integration test that loads every fixture shape (including team8 and match8) through fetchSnapshot against the local Postgres harness or a PostgREST-faithful fake.

#### ARCH-03: The whole database boundary is untyped: no generated Supabase types, rows are Record<string, any>, and 5 copy-pasted rpc<T>() helpers cast every RPC payload with `as T`

**P2** · CONFIRMED · new · Effort L (multi-day)

- **Evidence:**
  - src/lib/supabase.ts:23 — `createClient(url, anonKey, …)` with no Database generic; no generated types file exists (`rg -l 'Database\[' src` → nothing)
  - …7 more in `findings.json`
- **Impact:** A renamed column, a changed RPC JSON key or a new enum value compiles cleanly and fails at runtime on players' phones (undefined names, NaN handicaps, a status branch ne…
- **Recommendation:** Generate types (`supabase gen types typescript --project-id …` or from the local harness) into src/data/database.types.ts, pass `createClient<Database>`, delete `Row`, and make CI fail when…

#### ARCH-04: Settings are not forward-compatible: one unknown game type or format makes parseSettings throw and the store silently computes the tournament with DEFAULT_SETTINGS (100% allowance, no side games, $0 prizes)

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - src/engine/settings/games.ts:120 — `GameConfig = z.discriminatedUnion('type', [...six types])`; src/engine/settings/schema.ts:45 — `format: z.enum(['stableford…
  - …6 more in `findings.json`
- **Impact:** If Diego ships a new side game or format and enables it mid-trip, every phone that has not accepted the update shows standings at 100% handicap instead of 80%, hides the…
- **Recommendation:** Parse leniently at the edge and fail closed: make unknown `games[]` entries parse into an `{ type: 'unknown', id, label }` placeholder (z.union with a catch-all, or preprocess) so the known…

#### ARCH-05: The engine renders presentation text: 287 hard-coded Spanish strings and three different money formatters, so "¿Cómo se calculó?" shows "$10000" next to "+$10,000"

**P2** · CONFIRMED · partly fixed (docs/audit-2026-09-28.md P2 'Hard-coded strings outside es-MX.ts' and 'Explanation strings': screens are now clean, the engin… · Effort L (multi-day)

- **Evidence:**
  - AST scan ($S/panel/evidence/ARCH/strings.mjs → spanish-literals.json): Spanish string/template literals outside src/i18n: engine 287, api+server 20, screens+co…
  - …5 more in `findings.json`
- **Impact:** The trust feature (§2 'every number has a ¿Cómo se calculó?') is the one place where money is formatted differently from the rest of the app, which reads as sloppy exact…
- **Recommendation:** Make the engine return structured explanations: `{ code: 'place', params: { place: 1, amount: 10000 } }` (a small discriminated union per step), rendered by one `explain()` in src/i18n with…

#### ARCH-06: Currency and timezone are not really data: <Money> and 88 of 95 formatMoney calls hard-code MXN, and the tournaments.currency/timezone columns are a second, never-written source of truth defaulting to the first tournament's values

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - src/components/primitives.tsx:55-58 — `const mxn = new Intl.NumberFormat('es-MX', { currency: 'MXN' })` used by <Money> (11 call sites: leaderboard chips, nets)
  - …4 more in `findings.json`
- **Impact:** A second tournament in USD (or a crew trip to Arizona) would show MXN-formatted amounts on every player screen, and the platform panel reports every tournament as Americ…
- **Recommendation:** Pick one source of truth (the columns, written by create_tournament/duplicate/quick round from settings, or drop the columns) and expose `useCurrency()` from the tournament store; make form…

#### ARCH-07: Dev-only code ships to production: ProfileScreen statically imports src/dev/profileFixtures, and the service worker precaches the design/fixture chunks (61.6 KB) on every device

**P2** · CONFIRMED · partly fixed (docs/audit-2026-09-28.md P2 'Dev routes … ship to production': the routes are now gated by DESIGN_ROUTES, the code is not) · Effort S (under 2 h) · Merged: TRUST-20

- **Evidence:**
  - src/screens/profile/ProfileScreen.tsx:30 — `import { PROFILE_FIXTURES } from '../../dev/profileFixtures'` in a statically routed production screen (router.tsx:…
  - …7 more in `findings.json`
- **Impact:** Every installed phone downloads and stores ~62 KB of fake tournaments, fake profiles and test builders it can never display, on the same 4G the scores need; the main bun…
- **Recommendation:** Move ProfileFixture into src/dev and route it only under DESIGN_ROUTES; wrap all dev lazy() declarations in `if (DESIGN_ROUTES)` (or a separate `devRoutes.tsx` imported via `import.meta.env…

#### ARCH-14: The most critical screen is a 555-line god component with no unit or component tests: GroupCard mixes hole navigation, drafts, validation, snake tiebreak, contests, signing, Comité reasons, undo, swipe and the grid

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - src/screens/tournament/ScorecardScreen.tsx:124-678 — GroupCard: 555 lines, 10 useState + 3 useRef, 5 useEffect, 4 Sheets, ~20 inner functions; 24 non-null asse…
  - …4 more in `findings.json`
- **Impact:** Every change to score entry — the screen that decides the money — is made in a component nobody can test in isolation, so regressions surface on the course. The tangle i…
- **Recommendation:** Extract a pure `useHoleEntry` reducer (drafts, validation, tiebreak detection, undo snapshot) and a `commitHole()` service in src/data that writes one hole atomically (one upsert of the fou…

#### ARCH-15: Three parallel extension seams (6 singleton modules, 6 instance game types, 4 formats) with different contracts, overlapping games and type erasure at the boundary

**P2** · CONFIRMED · new · Effort L (multi-day)

- **Evidence:**
  - src/engine/modules/module.ts:45-53 GameModule {compute, prizes}; src/engine/games/game.ts:52-59 GameImpl {compute, prizes, board, warnings}; src/engine/formats…
  - …3 more in `findings.json`
- **Impact:** A new side game has to pick a seam, and each choice gets different tie rules, explanations, board rendering and money formatting; organizers can configure two 'best roun…
- **Recommendation:** Converge on one Game contract: port the six modules to GameImpl (singletons become instances with max 1), keep formats as the main-event strategy, and type the registry with a mapped type (…

#### ARCH-16: Duplicated sources of truth with no automated drift check: SQL↔TS WHS parity runs only in a script that needs the service key, two TS course-handicap implementations, and five hand-kept table registries

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - scripts/rls-test.mjs:500-501 is the only runner of src/engine/profile/cases/whs.json against SQL; it exits without SUPABASE_SECRET_KEY and is not part of CI (.…
  - …4 more in `findings.json`
- **Impact:** The profile can show an index that its own breakdown does not add up to after a one-sided change; a new table or column is one forgotten list away from an unloadable tou…
- **Recommendation:** Run the shared WHS cases against SQL in CI using a throwaway Postgres (the panel's local harness proves it works in this container) or have SQL return the breakdown so the TS mirror can go.…

#### ARCH-17: Tooling is below the flagship bar: no type-aware lint (a typed run finds 29 floating and 13 misused promises and 226 `any` flows), react-hooks v5 without compiler rules, no formatter, unchecked JS scripts

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - eslint.config.js:9-10 — `tseslint.configs.recommended` only (no recommendedTypeChecked/strictTypeChecked, no parserOptions.project); react-hooks 5.2 recommende…
  - …4 more in `findings.json`
- **Impact:** Promise misuse, `any` leaks and dead branches are found by reviewers (or users) instead of the pre-push gate; formatting noise makes diffs of 200-character JSX lines har…
- **Recommendation:** Adopt `strictTypeChecked` + `stylisticTypeChecked` with parserOptions.projectService, fix or annotate the ~40 real promise findings, turn on `@typescript-eslint/switch-exhaustiveness-check`…

#### ARCH-18: Server state is hand-rolled per screen: 11 copies of a run() mutation wrapper, 62 busy flags, fetch-in-effect with inconsistent cancellation, and no timeouts on the tournament entry path

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - `rg -n '(async function run\b|const run = async|function run\()' src` → 11 wrappers (AdminAuction, AdminData, AdminGames, MoneyScreen, ShareCard, CrewsScreen,…
  - …4 more in `findings.json`
- **Impact:** Each screen handles loading, errors, retries and staleness slightly differently (and some not at all), which is where the raw-error toasts (ARCH-12), infinite spinners o…
- **Recommendation:** Adopt TanStack Query (or React Router loaders/actions) for all non-tournament server state: queries with keys, timeouts via AbortSignal, retries with backoff, dedupe/caching, and one `useMu…

#### ARCH-19: Leftovers: a production /tv route that says 'Próximamente' for a shipped feature, unreferenced exports, test-only engine exports, and the §5.8 'engine asserts the prize pool' promise implemented only in tests

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/app/router.tsx:193 `{ path: 'tv', element: <PlaceholderScreen title={t.tv.title} /> }` → golf.cardigan.mx/tv shows 'Modo TV' + t.live.comingSoon; the real…
  - …3 more in `findings.json`
- **Impact:** Small, but each is a trap: a person opening /tv from a bookmark or a guess is told the TV mode does not exist; dead API functions suggest features (renaming pairs/teams)…
- **Recommendation:** Delete the /tv placeholder (or redirect to the last tournament's TV), remove the unreferenced exports, move test-only helpers under src/engine/testing, and add an engine warning when the en…

#### ARCH-20: Naming and layering inconsistencies: English and Spanish mixed in URLs and route names, 'admin' means two different roles, and the data layer imports types from screens

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/app/router.tsx:154-157 `/organizer`, `/organizer/login`, `/organizer/new`, `/organizer/reset` next to Spanish `/entrar`, `/amigos`, `/avisos`, `/ronda`, `/…
  - …4 more in `findings.json`
- **Impact:** Shared links expose an inconsistent product (golf.cardigan.mx/organizer vs /entrar), new contributors must learn which 'admin' is meant, and moving a screen breaks the o…
- **Recommendation:** Pick Spanish (the product language) for every user-visible path with redirects from the old ones; rename the Comité concept in code (`isComite`, `ComiteLayout`) and keep 'platform' for Polo…

#### ARCH-21: compute() mutates the fetched snapshot through the outbox overlay, and load() then saves that mutated object to IndexedDB as the 'last server snapshot'

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/data/tournamentStore.ts:87-90 — `const snapshot = { ...raw, … }` is a shallow copy; overlays then mutate shared arrays (outbox.ts:169-170 `s.scores[i] = ro…
  - …2 more in `findings.json`
- **Impact:** The offline cache is supposed to hold what the server said; it also holds unconfirmed local writes, so a cold offline open shows a write that the server may later reject…
- **Recommendation:** Make compute() pure: structuredClone (or copy the arrays the overlay touches) before applying overlays, and save the raw fetched snapshot. Add the probe as a unit test.

### 6.5 Data layer and database

13 findings: 1 P0 · 1 P1 · 7 P2 · 4 P3.

#### DB-02: restore_tournament (0020) silently stopped restoring side-game entrants, hole awards and bet results, which 0011 restored

**P0** · CONFIRMED · regressed (AUD-P0-10: the transactional restore lost table coverage in 0020) · Effort S (under 2 h) · Scope: platform

- **Evidence:**
  - supabase/migrations/0011_games.sql:131-133, 143-144, 164-166, 187-189, 236-241 — restore_tournament carries game_entries, hole_awards and game_results through the temp tables, tenant and reference checks, the wipe and the re-insert
  - supabase/migrations/0020_teams.sql:141-148 — 'This is 0010's function with teams and team_members added'; it was rebuilt from 0010, not 0011: `grep -c 'game_entries\|hole_awards\|game_results' supabase/migrations/0020_teams.sql` → 0
  - src/data/backup.ts:21-22 — the in-app backup still exports game_entries, game_results and hole_awards; the RPC receives them and ignores them, and returns only {players, rounds, scores}, so the Comité sees success
  - scripts/rls-test.mjs:302-304 — the only test ('restore brings back entrants, hole awards and results') never changes those rows between backup and restore, so it passes against the broken function; it counts rows and never checks hole_awards.group_id; it last changed on 2026-09-28, before 0020
  - …3 more in `findings.json`
- **Verification:** Independent verifier V4: CONFIRMED, P1 (platform). Restoring a backup silently leaves three money-bearing tables in their current state, while the Comité is told «Respaldo restaurado: N jugadores, N rondas, N hoyos» (AdminData.tsx:86-89, es-MX.ts:1469). It also turns every hole-contest claim into a Comité ruling. In that path this is lost data with a money effect: side-pot entrants, bet winners and contest holes differ from the restored state. P1 rather than P0 beca… Reproduction: My own drill: evidence/V4/restore-drill.sh on my DB v4_db (all…
- **Chair:** The panelist and the harness builder proposed P1; the chair applies the regression rule (one severity higher). Restore is the documented recovery path (RUNBOOK) and silently drops money-bearing rows.
- **Impact:** Restoring a tournament that has instance games (every Ronda rápida with the Más cerca / Skins / Birdies chips, any side pot or custom bet) keeps the current entrants and bet results instead of the backup's, so buy-ins and payouts differ from the state the Comité restored to, while the app reports success. Hole-contest claims survive with group_id = NULL, i.e. as Comité rulings (DB-03). Nacho's tournament has games: [] today, so its restore is unaffected until someone adds a side game.
- **Recommendation:** New migration: restore_tournament = 0020's body plus 0011's three tables (temp tables, tenant and reference checks, wipe hole_awards before groups are deleted, re-insert after groups). Stop hand-maintaining the list: a vitest that reads the last `create or replace function public.restore_tournament` in supabase/migrations and fails when any table in backup.ts BY_TOURNAMENT/BY_ROUND/BY_LOT (+ group_members, team_members) is missing from it. Make rls-test mutate every table after the backup and assert exact equality after restore, including hole_awards.group_id.

#### DB-07: No disaster recovery: the free plan has no Supabase backups, and the nightly R2 dump has no restore path, no accounts, no files and has never been restored

**P1** · CONFIRMED · new (not in docs/audit-2026-09-28.md; $S/history/status.md RB-14 «if Vercel is down, the JSON has everything» concerns a Vercel outage, not… · Effort M (under a day) · Scope: both · Merged: QA-22

- **Evidence:**
  - supabase.com/pricing (Free): "Automatic backups: Not included", "PITR: Not included", "Log retention: 1 day"
  - api/backup-cron.ts:62-66, src/lib/backupTables.ts — the dump is public.* only: no auth.users / auth.identities (every profile, organizer, device_sessions and platform_admins row has an FK to auth.users), no storage objects (logos, avatars, scorecard photos in bucket tournament-assets), no Vault secrets
  - Nothing reads it back: `grep -rln 'R2_\|backups/\|json.gz' scripts/ api/` → only api/backup-cron.ts; RUNBOOK.md has no step for it (§5 covers paper cards and un-pausing; §8 is the per-tournament JSON from Comité › Datos)
  - api/backup-cron.ts:21-31 — each table is paged with separate HTTP requests (no snapshot), so a dump taken while someone writes is not guaranteed consistent across tables
  - …5 more in `findings.json`
- **Verification:** Independent verifier V4: CONFIRMED, P1 (both). No data is lost today, so this is not P0. But the whole-database backup has never been restored anywhere, there is no script or runbook step to restore it, and it cannot bring back accounts or files. On a plan with no accessible platform backups, that is the gap a top company would never ship: a backup that has never been restored is a hope, not a backup. A restore drill and a loader are an S-M job that must happen… Reproduction: (1) Supabase docs (search_docs → guides/platform/backups): «We autom…
- **Impact:** If the project is lost or corrupted (a bad migration run straight on production — DB-09 —, an accidental tournament delete by an owner, an org/billing mishap), the tournament's scores exist only as a gz JSON nobody has ever loaded. Rebuilding would mean creating a new project, replaying 24 migrations, hand-creating auth users with the same uuids (or dropping every FK to auth.users), writing an importer on the spot, and re-uploading images from nowhere — during a trip, with real money pending. The Comité's per-tournament JSON is the only realistic recovery, and only if someone downloaded it th…
- **Recommendation:** Before April: (1) write scripts/restore-r2.mjs that loads a nightly dump into a fresh project or a local Postgres in FK order (auth.users stubs for referenced uids first) and run it as a drill, recording the time; (2) add auth.users (id, email, is_anonymous, created_at) and storage.objects metadata to the dump, and copy the bucket to R2; (3) for April, either upgrade to Pro for daily backups/PITR (a money decision for Diego) or run the dump hourly during the trip; (4) take the dump inside one repeatable-read snapshot (a single SQL function returning jsonb, or pg_dump via the pooler) instead o…

#### ARCH-13: Multi-step writes are not transactional and settings are one JSON blob with last-write-wins: a failed request can erase a custom bet's result, and one Comité screen silently reverts another's change

**P2** · CONFIRMED · partly fixed (docs/audit-2026-09-28.md P0-2 groups and P0-10 restore moved to RPCs; these paths were not) · Effort M (under a day)

- **Evidence:**
  - src/data/api.ts:583-587 setGameResults — delete the game's results, then insert the winners in a second request: if the insert fails (signal drop, RLS) the cus…
  - …4 more in `findings.json`
- **Impact:** Money-bearing configuration can be lost without an error: a Comité member records who won the side bet on a flaky connection and the result vanishes; two organizers (Die…
- **Recommendation:** Move each multi-step mutation into a security-definer RPC that runs in one transaction (set_game_results, set_hole_awards, create_lots, reopen_lot, save_course), as was already done for gro…

#### DB-01: The Supabase keep-alive workflow fails every day: its ping gets 401 'Secret API key required'

**P2** · CONFIRMED · new, and it contradicts the history mapping: $S/history/status.md RB-4 marks 'Supabase despierto … daily cron' as fixed. It has never worke… · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - .github/workflows/keepalive.yml:20-28 — GET $SUPABASE_URL/rest/v1/ with the publishable key, then `[ "$code" = "200" ]`
  - …4 more in `findings.json`
- **Impact:** The documented safety net against the free project pausing (7 idle days, supabase.com/pricing) does not work and has never worked. If the backup cron also stops (a missi…
- **Recommendation:** Ping something that reaches Postgres through the anon role: `curl -fsS -X POST $SUPABASE_URL/rest/v1/rpc/app_flags -H 'apikey: …' -H 'Authorization: Bearer …' -H 'Content-Type: application/…

#### DB-03: Deleting a group turns its players' hole-contest claims into Comité rulings (hole_awards.group_id ON DELETE SET NULL)

**P2** · CONFIRMED · new (hole_awards arrived in 0011, after the 2026-09-28 audit; no earlier finding covers it). · Effort M (under a day) · Scope: platform

- **Evidence:**
  - supabase/migrations/0011_games.sql:30 — hole_awards.group_id references groups(id) ON DELETE SET NULL
  - …5 more in `findings.json`
- **Impact:** After a restore, or after the Comité removes a group in Grupos, every claim that group made becomes a field-wide Comité ruling. A later "Quitar decisión del Comité" dele…
- **Recommendation:** Make the Comité's rulings explicit instead of encoding them as NULL: add hole_awards.source ('group' | 'comite') (or a separate comite_awards table), change the FK to ON DELETE CASCADE for…

#### DB-04: The Comité cannot rule a disputed hole contest for a player a group already claimed: hole_awards PK has no group_id, so the insert hits 23505

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - supabase/migrations/0011_games.sql:36 — primary key (round_id, game_id, hole, player_id): one row per player per hole, whoever wrote it
  - …3 more in `findings.json`
- **Impact:** The normal way to settle a Más cerca dispute (two groups claim different winners, the Comité picks one of them) fails with a raw 'duplicate key value violates unique con…
- **Recommendation:** Fix the model (DB-03): with a `source` column, make the PK (round_id, game_id, hole, player_id, source) or move rulings to their own table; or have adminSetAwards run in an RPC that upserts…

#### DB-13: The audit trail loses cascaded deletes (logged with no tournament) and never records team draws, PIN resets, device claims or published money

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - supabase/migrations/0021_platform_admin.sql:290-297 — audit_row resolves the tournament of a round-scoped row with round_tournament_id(round_id) / group_tourna…
  - …3 more in `findings.json`
- **Impact:** After someone deletes a round or a player by mistake, the Comité's history does not show which scores went, so the evidence needed to rebuild them is only reachable with…
- **Recommendation:** Carry tournament_id on every tournament-scoped table (scores, groups, group_members, round_tees, card_signatures, snake_tiebreaks, handicap_overrides, hole_awards, calcutta_bids, calcutta_b…

#### DB-14: Round results are rebuilt delete-then-insert with no lock: two writes to a finished round collide (23505), and a score saved while the round is being finished is left out of the results

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - supabase/migrations/0015_results.sql:154-156 — refresh_round_results: `delete from round_results where round_id = p_round`, then one INSERT per player; nothing…
  - …4 more in `findings.json`
- **Impact:** At the end of a day the Comité finishing the round, correcting a card and an admin's phone flushing its last hole can overlap: one of them fails with a raw Postgres erro…
- **Recommendation:** Serialize per round: `perform pg_advisory_xact_lock(hashtextextended(p_round::text, 0))` at the top of refresh_round_results, and make the score trigger take `select status from rounds wher…

#### DB-16: Advisor warnings left open: 92 multiple_permissive_policies, 16 auth_rls_initplan, 5 mutable search_path functions, a listable public bucket, 86 SECURITY DEFINER functions callable by anon

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - Advisor-equivalent (local splinter run on the 24 migrations, $S/pg/lints/splinter-results.csv, 405 results): WARN multiple_permissive_policies 92 (23 tables: e…
  - …2 more in `findings.json`
- **Impact:** The performance warnings are the measured cost in DB-12. The listable bucket lets anyone enumerate every logo, avatar and scorecard path (object names include tournament…
- **Recommendation:** Fix the two performance lints with DB-12's policy rewrite; `alter function … set search_path = public` on the five; replace assets_public_read with no SELECT policy (public URLs keep workin…

#### DB-15: 48 foreign keys have no index (some on RLS and cascade paths), while three redundant indexes are maintained for nothing

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - Advisor-equivalent (local splinter run, $S/pg/lints/splinter-results.csv): unindexed_foreign_keys × 48, e.g. scores_player_id_fkey, scores_entered_by_fkey, sna…
  - …3 more in `findings.json`
- **Impact:** Negligible at today's few thousand rows; grows linearly with the platform (every tournament's scores share one table), and the policy-path ones multiply with DB-12.
- **Recommendation:** One migration: add the dozen that sit on policies, cascades or app filters (list above), drop the three redundant ones; leave audit-only FKs (created_by, decided_by). Keep splinter in CI so…

#### DB-17: Re-applying an old migration by hand (the documented `db.mjs file` path) succeeds and silently downgrades live definitions; 10 of 24 files cannot be re-run at all

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - scripts/db.mjs:5-6 documents `node scripts/db.mjs file path.sql` (run a file); nothing stops it from being an applied migration
  - …3 more in `findings.json`
- **Impact:** A well-meant "re-run 0009 to be sure" during the trip would silently switch off the discrepancy flag or break avatar uploads, with no error to notice. Low likelihood, hi…
- **Recommendation:** Make migrations re-runnable (if not exists / drop … if exists / guarded constraints) or move to the Supabase CLI migration history, which refuses to re-apply; have db.mjs refuse `file` on a…

#### DB-20: Paging infers "last page" from a short page with a hard-coded 1,000, and the shared course list is not paged at all

**P3** · CONFIRMED · partly fixed (audit-2026-09-28 P0-12) · Effort S (under 2 h)

- **Evidence:**
  - src/data/paged.ts:5-18 — PAGE = 1000; `if (rows.length < PAGE) return out`: if the project's API "Max rows" is ever set below 1,000 (a dashboard setting), ever…
  - …2 more in `findings.json`
- **Impact:** Nothing today; a quiet truncation later (a dashboard change, or the course catalog growing with every Ronda rápida) that would show wrong boards or a missing course with…
- **Recommendation:** Ask PostgREST for `count=exact` (or read Content-Range) and page until `to >= total`; page listCourses (or search server-side). Unit-test fetchAll with a fake server capped at 500.

#### DB-22: The migration chain only applies through scripts/db.mjs: 0010 and 0024 need public._migrations, which no migration creates

**P3** · CONFIRMED · new (harness candidate PG-C3, re-verified) · Effort S (under 2 h)

- **Evidence:**
  - supabase/migrations/0010_admin_safety.sql:645-646 alters public._migrations; 0024_platform_ops.sql:339 reads it; the table is created only by scripts/db.mjs:21
  - …1 more in `findings.json`
- **Impact:** Rebuilding the database anywhere else (a new project after a disaster, Supabase branching, `supabase db push`, a CI job) fails at 0010 unless someone remembers the pream…
- **Recommendation:** Create the table inside the chain (a 0000_migrations.sql, or `create table if not exists public._migrations …` at the top of 0001); better, adopt the Supabase CLI migration history. The CI…

### 6.6 Performance

14 findings: 0 P0 · 3 P1 · 8 P2 · 3 P3.

#### DB-12: Row-level security runs ~15 helper-function calls per row read (up to ~38 on other plans): a player's reload costs ~0.8 s of database time at 12 players and ~12 s at 60 (≈10 ms with set-based policies)

**P1** · CONFIRMED · new (the 2026-09-28 audit covered paging, P0-12, fixed; not per-row RLS cost). · Effort M (under a day) · Scope: both

- **Evidence:**
  - supabase/migrations/0003_rls.sql:104-113 — scores_read USING is_tournament_member(round_tournament_id(round_id)); scores_write is FOR ALL, so its USING clause is also OR'd into every SELECT. The helpers are SECURITY DEFINER SQL functions (0002, 0013, 0021), which Postgres never inlines, so each is a separate per-row execution
  - Harness plan ($S/panel/evidence/DB/rls-cost.1.out), player of the 60-player tournament: Index Scan … Filter: (is_tournament_organizer(round_tournament_id(round_id)) OR (shares_group(round_id, player_id) AND round_is_live(round_id) AND NOT card_is_signed(round_id, player_id)) OR is_tournament_member(round_tournament_id(round_id)))
  - Function calls for the client's first scores page, each in a fresh backend ($S/panel/evidence/DB/one.sh, pg_stat_xact_user_functions): 12 players, 324 rows → my_player_id 1,764 (5.4 per row), round_tournament_id 1,476; 60 players, 1,000 rows returned after evaluating all 1,620 → my_player_id 27,576 (17 per row), round_tournament_id 25,992, is_tour…
  - Exact count for the client's own query (select * … order by id limit 1000, fresh backend, after ANALYZE): 12 players → 4,788 helper calls for 324 rows (14.8/row); 60 players → 26,244 calls for the 1,764 rows page 1 must evaluate before sorting (14.9/row); plan: Bitmap Heap Scan on scores_round_idx (only this tournament's rows) + Filter (is_tournam…
  - …4 more in `findings.json`
- **Verification:** Independent verifier V4: CONFIRMED, P1 (both). The mechanism is confirmed and costs real time on production today. CLAUDE.md §2's success criterion «other phones see a new score in under 2 seconds on 4G» is at risk in exactly the burst that matters: a foursome saves a hole, and every subscribed phone re-reads the whole tournament once per score row. A top team would never ship read policies that run about 15 security-definer function calls per row. The fix is co… Reproduction: All scripts in evidence/V4/. Own seed (perf-seed.sh, DB v4_perf): a…
- **Impact:** Every phone's reload (DB-10) pays this. For Nacho's 12 players it is ~0.8 s of shared-CPU time per reload, multiplied by 16 phones and up to 4 reloads per hole saved: bursts of tens of CPU-seconds on the free plan's shared-CPU instance whenever groups finish holes together, so the '<2 s to other phones' target (§2) degrades exactly when it matters. At 60 players a single scores page is 3-6 s and flirts with the 8 s statement_timeout of the authenticated role (supabase.com/docs/guides/database/postgres/timeouts), so reloads start failing outright. Realtime's per-subscriber authorization of eve…
- **Recommendation:** Rewrite the read policies set-based: USING (round_id IN (SELECT id FROM rounds WHERE tournament_id = ANY ((SELECT public.my_tournament_ids())))) with one STABLE SECURITY DEFINER function that returns the caller's tournament ids once per statement (Supabase's documented 'wrap in select' pattern); split every FOR ALL write policy into INSERT/UPDATE/DELETE so none is OR'd into SELECT (also clears splinter's multiple_permissive_policies); give holes/tees plain read policies. Order paged reads by the primary key that matches an index (scores: round_id, player_id, hole). Add a CI check: EXPLAIN ANA…

#### PERF-07: Every change anywhere in the tournament makes every device re-download the whole tournament: 22 REST requests in 3 sequential waves (~60 KB as counted by Chrome) per reload, 2–4 reloads per saved hole

**P1** · CONFIRMED · new (history N6 logged the missing Realtime filter as PLAUSIBLE; AUD-P1-15 added the online/visibility/re-SUBSCRIBED reloads and fetchSeq,… · Effort M (under a day) · Scope: both · Merged: ARCH-08, DB-10

- **Evidence:**
  - src/data/tournamentStore.ts:268-274 — every postgres_changes event on any of 20 tables schedules `reload()` after a 150 ms debounce; reload() (245-258) calls fetchSnapshot(), which issues 9 + 11 + 3 paged selects in three dependent waves (121-195), then compute() (zod parse + full engine) and saveSnapshot() to IndexedDB
  - node $S/panel/evidence/PERF/ensayo-net.mjs on production /t/ensayo (Nico): 5 reloads → 22 REST requests in 3 waves each, 60,605–60,664 B encoded on the wire, 991–1,416 ms wall time; scores is the only large body (21,143 B); the other 21 responses are ~1.4–3 KB each, mostly headers. At 4× CPU each reload cost 99–184 ms of script (median 135) and 47…
  - src/data/outbox.ts:270-292 pushes a hole's four scores one request at a time, so each upsert produces its own Realtime event; in REL's throttled-4G runs ($S/panel/evidence/REL/logs/latency-fixed.log, aPushesDoneMs) the four pushes land 220–1,440 ms apart, so the 150 ms debounce never merges them and the watching phone ran 2–4 reloads (44–88 REST r…
  - Order of magnitude for the trip: 3 groups × 18 holes × 2 rounds ≈ 108 hole saves × ~3 reloads ≈ 320 reloads per device ≈ 7,000 requests and ~19 MB per device (at today's 60.6 KB per reload; the scores body doubles by the end of Day 2), on 13 devices including the TV; the large60 shape (15 groups, 1,848 score rows) is ~5× more per device, on ~60 de…
  - …8 more in `findings.json`
- **Verification:** Independent verifier V13: CONFIRMED, P1 (both). Once Realtime works (REL-01), this is the steady-state cost of the live boards and the structural reason the §2 target ('other phones see a new score in under 2 seconds on 4G') is missed. Each saved hole makes every phone, the saver and the TV included, run one full 22-request, 3-wave snapshot per upsert event that lands more than 150 ms after the previous one. Each such reload is 1.2-2.1 s of wall time on this link… Reproduction: (1) Live, production Ensayo as Nico ($S/verify/evidence/V13/prod-e…
- **Impact:** Once Realtime is fixed (REL-01) this is the steady state of the live boards: each saved hole triggers 44–88 requests on every phone and the TV, keeps the radio awake for seconds, and spends ~0.4 s of CPU per phone at mid-range speed (3 reloads × ~135 ms script). The three dependent waves after the 150 ms debounce, plus reloads that overlap and get discarded, are a large part of the latency REL measured (p50 ≈ 4.8 s under load, against the §2 target of < 2 s). It also breaks the platform promise that field size is data: a 60-player event multiplies the storm by ~20 at the Supabase free tier.
- **Recommendation:** Apply the Realtime payload instead of refetching: postgres_changes already carries the row (`payload.new`/`old`); patch the snapshot table by primary key (a small reducer per table), recompute, and fall back to a full reload only on reconnect/visibility or for tables whose payload is incomplete. Batch a hole's four upserts in one request (`upsert([...4 rows])`) so one save is one event. For the full reload, replace 22 selects with one RPC (`tournament_snapshot(tid)` returning json) = one round trip. Test: an e2e with two contexts that counts REST requests on the watcher after one saved hole (…

#### PERF-08: A returning player waits for five sequential round trips before seeing the board; the snapshot already cached in IndexedDB is only used when the network fails

**P1** · CONFIRMED · new (AUD-P0-5 made the cache a fallback for failures; using it for first paint was never done; related REL-10) · Effort M (under a day) · Scope: both

- **Evidence:**
  - src/screens/tournament/TournamentGate.tsx:80-121 — resolve(): await ensureSession() → await lookupTournament(slug) → await myMembership(id) → setPhase → await load(id) (tournamentStore.fetchSnapshot: 3 dependent waves); enterFromCache (68-77) runs only in the catch branch or when load failed
  - ensayo-net.mjs warm open (HTTP cache warm, 150 ms RTT, 1.6/0.75 Mbps, 4× CPU) on production: HTML 308 ms; JS/CSS/fonts from cache; +613 lookup_tournament (486 ms) → +1147 my_membership (234 ms) → +1397 wave 1, 9 selects (to +1914) → +1920 wave 2, 11 selects (to +2566) → +2581 wave 3, 2 selects (to +2821) → board visible at 3,231 ms. From JS ready…
  - Lighthouse prod /t/ensayo (first visit, simulated): LCP 5.5 s with 4,836 ms of 'render delay'; the critical chain runs JS → app_flags → auth/v1/signup → lookup_tournament → my_membership ($S/panel/evidence/PERF/lh-baseline-summary.txt)
  - src/data/snapshotCache.ts + tournamentStore.ts:238,253 already persist the full snapshot on every load and reload
  - …1 more in `findings.json`
- **Verification:** Independent verifier V13: CONFIRMED, P1 (both). The course is exactly the brief's weak-signal case, and iOS kills backgrounded home-screen apps, so cold reopens happen many times per round. Every one of them shows the skeleton for 3.5-6 s on 4G, or ~6 s on a weak link, before the Tarjeta or board can be used, although a snapshot from minutes ago sits in IndexedDB. There is no timeout on lookup, membership or the snapshot (api.ts:141-145, 177-179; supabase.ts crea… Reproduction: Production Ensayo as Nico, warm HTTP cache, serviceWorkers blocked…
- **Impact:** Every time a player pulls the phone out on the course (app killed by iOS, reopened from the home screen) he stares at a spinner for ~2–3 s on decent 4G and 5–10 s on the weak signal the brief expects, although the phone already holds a snapshot from minutes ago. The first-open LCP of 5.5 s is 2.2× the 2.5 s 'good' threshold.
- **Recommendation:** Stale-while-revalidate: on mount read the cached {lookup, me, snapshot} for the slug (snapshotCache already stores it) and render the board immediately with the 'actualizado hace N min' line, then revalidate in the background, refreshing the token in parallel. Serve lookup + membership + snapshot from one RPC (`tournament_open(slug)` returning json), so a fresh board is 1–2 round trips after the session. Budget: warm reopen to board ≤ 1.0 s at 4G/4× CPU (0 network round trips before first paint of the cached board); LCP ≤ 2.5 s on first open. Test: a Playwright check with throttling asserting…

#### MOT-21: The points-race replay is a 4-per-second full redraw of the Recharts chart, not an animation: on a mid-range phone it drops a third of the frames with 12 players and freezes the app with 60 ('Parar' answers after ~1.7 s)

**P2** · CONFIRMED · still open (DESIGN_AUDIT.md A.6 'StatsScreen.tsx:62 race replay 250ms/hole') · Effort M (under a day)

- **Evidence:**
  - src/screens/tournament/StatsScreen.tsx:64-77 — setInterval(250 ms) advances a cursor; every tick re-renders the whole <LineChart> with all series (:167-173, `i…
  - …2 more in `findings.json`
- **Impact:** The race replay is the 'dazzle' moment of Estadísticas at the dinner table. On the phones in the room it plays as a stutter, and in a large event it locks the whole app…
- **Recommendation:** Draw the race once and animate a reveal instead of re-rendering data: an SVG clip-path/stroke-dashoffset or a CSS transform on a mask driven by one MotionValue (compositor-only), interpolat…

#### PERF-01: The tournament logo ships as an 869 KiB 591×640 PNG for a 28–56 px slot, with a 1-hour cache: 59% of the bytes of /t/ensayo

**P2** · CONFIRMED · new (AUD-P2-6 fixed the offline caching of logos and avatars, not their weight) · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - $S/lh/prod-t-ensayo.report.json (Lighthouse, prod /t/ensayo): 869.1 KiB image https://gmohwledjejlhcwqjnhd.supabase.co/storage/v1/object/public/tournament-asse…
  - …6 more in `findings.json`
- **Impact:** Every phone that opens the tournament link for the first time (Calcutta dinner, first tee) downloads 0.87 MB for a 40 px badge; on congested resort Wi-Fi or 3G that is s…
- **Recommendation:** Re-encode the existing logo now (256 px WebP ≈ 30 KB; a 512 px one for the TV if wanted) and replace the object. In the upload path (Comité › Torneo logo, avatars) generate fixed renditions…

#### PERF-02: No route-level code splitting: every route downloads and evaluates a 1.29 MB (404 KiB on the wire) entry chunk, 71% of it unused on the first screen

**P2** · CONFIRMED · new (the baseline recorded the >500 kB warning; related: AUD-P2-7 dev chunks still emitted and precached, partly fixed) · Effort M (under a day) · Scope: both · Merged: ARCH-22

- **Evidence:**
  - Production entry: curl https://golf.cardigan.mx/ → <script src=/assets/index-O5Q-5WQE.js>; that file is 1,294,372 B raw, 404,306 B gzip and 414,110 B brotli as…
  - …8 more in `findings.json`
- **Impact:** On a mid-range Android on 4G (the phones on the course), first open costs ~400 KiB of JS before anything but the boot splash renders (3.0 s of download alone on Lighthou…
- **Recommendation:** Split by route with React Router `lazy` (or `React.lazy`) for Home/Mi Polo, organizer, profile/social, and the tournament shell; keep the tournament shell + Live + Tarjeta in one player chu…

#### PERF-03: Dead weight in the entry chunk: share-image and confetti libraries, the non-tree-shakable zod namespace (with its JSON-Schema converter), full motion with drag, Dexie, the whole i18n table and a dev fixture load on every route

**P2** · CONFIRMED · new; overlaps ARCH-07, ARCH-22 · Effort M (under a day)

- **Evidence:**
  - $S/panel/evidence/PERF/attribution-main.tsv (entry chunk, raw bytes / gzip alone): html-to-image 13,465 / 5,388 (used only by src/lib/shareImage.ts:5 on a Comp…
  - …5 more in `findings.json`
- **Impact:** Roughly 110–130 KiB gzip of the 404 KiB entry is code no first screen needs; on a mid-range phone that is ~150–250 ms of extra parse/compile/evaluate on every cold start…
- **Recommendation:** `import('canvas-confetti')` and `import('html-to-image')` at the call sites; `LazyMotion` + `m` components with `domMax` loaded asynchronously (layout projection is needed only after first…

#### PERF-04: Estadísticas pulls a 368 kB chunk (108 kB gzip) for one line chart: 98% of it is recharts, d3, Redux Toolkit, immer, es-toolkit and decimal.js

**P2** · CONFIRMED · new; related: MOT-21 (replay frame drops), VIS-21 (legibility) · Effort S (under 2 h)

- **Evidence:**
  - Build output: StatsScreen-*.js 368.02 kB │ gzip 108.25 kB (baseline preflight log shows the same 367.97 kB)
  - …3 more in `findings.json`
- **Impact:** ~106 KiB of every phone's first-install download and ~300+ ms of parse/eval on a mid-range phone the first time Estadísticas opens (at the ceremony, on the villa Wi-Fi),…
- **Recommendation:** Draw the race chart as hand-written SVG (<3 kB: scale functions + polylines + a scrubber) or use a micro chart lib (uPlot ~45 kB, or visx pieces). If recharts stays, exclude it from the pre…

#### PERF-05: The service worker precaches 2.6 MB on first install (measured: 76 extra requests, 696 KB on the wire after a 561 KB page), including dev-only chunks, every Comité and platform-admin screen, recharts and two font subsets Spanish never uses

**P2** · CONFIRMED · partly fixed (audit 2026-09-28 P2 'Dev routes ship to production': the routes are gated since, but their chunks are still emitted and preca… · Effort S (under 2 h) · Merged: PWA-13

- **Evidence:**
  - vite.config.ts:62 globPatterns ['**/*.{js,css,html,svg,png,woff2}'] with no globIgnores; build log: 'precache 78 entries (2603.90 KiB)'
  - …7 more in `findings.json`
- **Impact:** Each of the ~13 devices on the trip (12 phones + TV) spends ≈1.2 MB of data and radio time right after the first open, competing with the first snapshot fetch on the sam…
- **Recommendation:** Precache only the shell and the player path (entry, tournament screens, latin fonts, 192 px icon); add `globIgnores` for dev chunks, Stats, Comité/platform chunks and non-latin font subsets…

#### PERF-09: Every store update re-renders every mounted screen component, even when nothing changed: a no-op reload costs 282 (full12) to 406 (large60) component renders, 3 commits and ~120 ms of script on a mid-range phone for one DOM mutation

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - 39 call sites in 32 files select the whole blob with useTournament((s) => s.data) (LiveScreen.tsx:50, TournamentShell.tsx:34, FeedTicker.tsx:29, SnakeBoard.tsx…
  - …5 more in `findings.json`
- **Impact:** Each Realtime-driven reload (and, per PERF-07, there are 2–4 per saved hole) burns ~0.1–0.3 s of main thread on each phone even when the board does not change, dropping…
- **Recommendation:** Select narrow slices with shallow equality (`useTournament(useShallow(s => ...))` or selectors per screen: rows, flags, round state), keep object identity for unchanged parts (compute per m…

#### PERF-10: “Guardar hoyo” recomputes the whole tournament four times and re-renders the Tarjeta ~11 times: 221–449 ms (median 293) from tap to the next hole on a mid-range phone, 406–956 ms (median 495) at 60 players

**P2** · CONFIRMED · partly fixed (audit 2026-09-28 P1-14: the 5 s gap between pushes is gone, outbox.ts:297; pushes are still one request per score); overlaps… · Effort S (under 2 h) · Merged: MOT-03

- **Evidence:**
  - ScorecardScreen.tsx:272-287 writeHole awaits enqueueScore once per player; outbox.ts:188-196 enqueue() → Dexie put → useTournament.patch(overlayPending) → stru…
  - …6 more in `findings.json`
- **Impact:** The one action a scorer repeats 18 times a round feels sticky: a third of a second (almost half a second at worst) between tap and the next hole on a mid-range Android,…
- **Recommendation:** Enqueue the hole as one batch: one Dexie bulkPut, one patch/recompute, one upsert of four rows (also halves the Realtime storm, PERF-07). Move to the next hole optimistically before the Ind…

#### DB-21: A correction on a finished round rebuilds every player's results and replays every linked profile's index and rivalries twice

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - 0015_results.sql:154-225 — refresh_round_results deletes all of the round's results and re-inserts one per player; 0016_social.sql:535-542 — the DELETE stateme…
  - …2 more in `findings.json`
- **Impact:** Fine for 12 players; wasteful work that grows with linked profiles and rivalries, and it widens the race window in DB-14.
- **Recommendation:** Refresh only the changed player's row (the score trigger knows player_id) with an upsert; recompute each affected profile once per statement (collect ids, then recompute), or defer to a que…

#### PERF-13: Caching and preloading gaps on the first open: the critical font is discovered only after the JS renders, fingerprinted icons and the brand mark are served with max-age=0, and uploads keep Storage's 1-hour TTL

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - index.html has no <link rel=preload> for archivo-latin-wdth-normal-*.woff2 (88 KiB, used by every screen): in Lighthouse prod /t/ensayo (simulated) it starts a…
  - …2 more in `findings.json`
- **Impact:** A few hundred ms of font swap/late text on first open and one extra conditional request per image per view outside the SW; small individually, but they sit on the first-…
- **Recommendation:** Preload the latin Archivo woff2 (Vite can emit the hashed URL via a small plugin or `?url` import); add vercel.json headers making /icons/* and /brand/* immutable (fingerprint the brand fil…

#### PERF-14: The engine recomputes everything, including a feed sorted with localeCompare, on every change: large60 takes 14–17 ms per recompute on a 2.8 GHz server core (≈60 ms on a mid-range phone) and builds an 864 KB state each time

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - vitest bench $S/panel/evidence/PERF/bench/engine.bench.test.ts (60 runs after warm-up, 3 repetitions at load 0.5–2.3): computeTournament median 14.5 / 14.4 / 1…
  - …2 more in `findings.json`
- **Impact:** Irrelevant for twelve players (≈10 ms on a mid-range phone), but at 60 players each save (4 recomputes, PERF-10) and each reload spends ~60 ms per recompute on the main…
- **Recommendation:** Sort ISO strings with `<` (or pre-parsed numbers), index scores by (round, player, hole) once per compute and reuse it in feed/snake/stats; compute the feed incrementally or only the tail i…

### 6.7 Testing and delivery

20 findings: 0 P0 · 7 P1 · 8 P2 · 5 P3.

#### CHAIR-01: Regressed: .env.example no longer documents the server and client variables the app needs (the five web-push variables added in #42)

**P1** · CONFIRMED · regressed (AUD-P2-35) · Effort S (under 2 h)

- **Evidence:**
  - grep -n 'VAPID\|PUSH_DISPATCH' .env.example → no match
  - The variables are read by api/push-dispatch.ts (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_DISPATCH_SECRET), src/data/push.ts (VITE_VAPID_PUBLIC_KEY) and scripts/rls-test.mjs
  - Introduced by 72f91ec «Profiles 8: web push (#42)»; the 2026-09-28 sweep (P2, Tooling) had asked for .env.example to list every server-side name, and it was fixed before #42
- **Chair:** Established by the history mapper (AUD-P2-35 regressed) and re-checked by the chair (grep of .env.example against every variable the code reads). P1 only by the regression rule.
- **Impact:** Whoever sets up a new environment, a staging project or a CI job from .env.example gets a build whose push route answers 500 and whose client never offers notifications, with nothing saying which variables are missing. On the trip this matters only if Diego or a helper must rebuild or move the project in a hurry.
- **Recommendation:** Add the five names (values blank, with a comment on where each lives: Vercel Production + Preview, Supabase Vault for the secret) to .env.example, and add a unit test that greps every process.env/import.meta.env name used in api/, src/ and scripts/ and fails when .env.example lacks it (the backupTables.test.ts pattern). P1 only because of the brief's regression rule; the fix takes minutes.

#### DB-09: Migrations run on a database for the first time in production: no CI replay, no staging project, no reversible path, and the DB tests only run by hand against production

**P1** · CONFIRMED · new (docs/audit-2026-09-28.md covers _migrations RLS, item 39, but not the absence of database CI, staging or rollback). · Effort M (under a day) · Scope: both · Merged: QA-08, QA-09

- **Evidence:**
  - .github/workflows/ci.yml:25-29 and scripts/preflight.sh — CI runs typecheck, lint, vitest and build with a placeholder Supabase URL; no Postgres, no migration replay, no SQL test
  - scripts/db.mjs:22-38 — `migrate` applies each new file straight to the one project (gmohwledjejlhcwqjnhd) through the Management API; there is no other environment (docs/handoff.md: the org has no free slot for a second project)
  - scripts/rls-test.mjs and scripts/platform-test.mjs need SUPABASE_SECRET_KEY and create throwaway users and tournaments on production; they are not in CI (baseline: both exit 1 here)
  - No down migrations anywhere; several are one-way (0010:301-314 deletes duplicate payments; 0015:66 flips counts_for_stats for 'ensayo%'); scripts/db.mjs records only the file name (no checksum), so a later edit of an applied file would be silently skipped (git shows none so far)
  - …7 more in `findings.json`
- **Verification:** Independent verifier V4: CONFIRMED, P1 (both). A clear delivery gap a top company would never ship. 6,894 lines of SQL (164 functions, 146 SECURITY DEFINER, every RLS policy) change with no automated database test. Each migration runs for the first time on the one project that will hold the April tournament, before its PR is even opened. The risk is not theoretical: DB-02, a silent loss of restore coverage, escaped exactly this way, and my replay shows a CI job… Reproduction: (1) .github/workflows/ci.yml:25-30: npm ci + bash scripts/preflight.…
- **Impact:** Every schema change is tested for the first time on the database that will hold the April tournament. A migration that fails halfway is rolled back by the transaction wrapper, but one that succeeds and is wrong (DB-02) ships silently, and there is no rollback other than writing a new migration by hand under pressure.
- **Recommendation:** Add a CI job: `services: postgres:16` (or `supabase start`), apply the stubs + every migration exactly as scripts/db.mjs does, run splinter, and run a SQL/pgTAP suite (RLS matrix from rls-test.mjs rewritten to use `set request.jwt.claims`, a backup→mutate→restore round trip, the trigger cascade and a two-session race). The shared review harness in $S/pg shows it takes minutes to set up. Record a checksum in _migrations and refuse to run if an applied file changed. For risky migrations, write the reverse script next to it and test both in CI.

#### QA-03: Calcutta buybacks are only ever tested at exactly 50%, so swapping the owner's and the player's shares, or dropping the 50% cap, passes every test

**P1** · CONFIRMED · new (the 2026-09-28 audit's test-gap item AUD-P2-11 did not mention buyback percentages) · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/engine/modules/auction/index.ts:106 (cap) and :110-112 (owner gets 100 − pct, player gets pct)
  - Every buyback in the suite is 50%: auction.test.ts:102, money.test.ts:25, golden.test.ts:21 — at 50% both shares are equal, so any mix-up is invisible
  - Mutation M10 (owner gets pct, player gets 100 − pct) → SURVIVED; M11 (no clamp to buybackMaxPct) → SURVIVED (panel/evidence/QA/mutation-results.json, harness panel/evidence/QA/mutate.mjs)
  - The console offers 0/25/50/custom (§10), so 25% and custom are the normal cases, not edge cases
- **Verification:** Independent verifier V7: CONFIRMED, P1 (both). Latent, not active: the shipped code is correct today (25% → buyer 75% / player 25%, stored 60% clamped to 50%). But the only buyback tests in the whole suite are the symmetric 50% case, and three plausible one-line regressions (swap, no clamp, amount = half price) all ship green. The app's own guard does not help: `balanced` stays true under every mutant, and scripts/rehearse-auction.mjs and e2e/smoke.mjs assert no… Reproduction: Own scratch copy via `git archive HEAD` (verify/evidence/V7/repo, n…
- **Impact:** A refactor that swaps the two lines or drops the cap ships green; on the night a 25% buyback pays 75% of the champion's slot to the player instead of the buyer. With a $12,000 pot the champion slot is $6,600, so a swap moves $3,300 between two friends.
- **Recommendation:** Add to auction.test.ts: 25% buyback on a $1,000 lot → owner 75% / paid $750, player 25% / paid $250, champion slot split 75/25; a custom 30%; a stored 60% clamped to 50%; a self-owned lot with a buyback (no second owner). Assert payouts and the buyback flow amount in money.flows.

#### QA-06: The outbox tests do not pin the offline promise: no IndexedDB, no overlay, no automatic retry, no same-hole replacement — four of four targeted outbox mutants survive

**P1** · CONFIRMED · partly fixed (audit-2026-09-28 P0-3 and P0-4 gained tests in src/data/outbox.test.ts via 04b2216 #23; persistence, restore, overlay and the… · Effort M (under a day) · Scope: both

- **Evidence:**
  - vite.config.ts `test.environment: 'node'` and no fake-indexeddb: `getDb()` returns null (src/data/outbox.ts:72-76), so Dexie persistence, `loadQueue` on restart and the v1→v2 schema upgrade (outbox.ts:62-70, 110-115) never run in a test
  - Coverage of src/data/outbox.ts 56.1% lines; `overlayPending` (outbox.ts:153-186) and the real `push` (229-249) at 0% (panel/evidence/QA/coverage-data-lib.txt, uncovered-lines.txt)
  - M19 remove the backoff `schedule(...)` after a network error (outbox.ts:289) → SURVIVED: the test calls flush() 30 times by hand (outbox.test.ts:33), so a phone that never retries on its own passes
  - M20 enqueue keeps both old and new write for the same hole (outbox.ts:189) → SURVIVED; M21 overlay no longer replaces an existing server score (outbox.ts:169) → SURVIVED; M22 «invalid input» retried forever instead of rejected (outbox.ts:253) → SURVIVED
  - …1 more in `findings.json`
- **Verification:** Independent verifier V7: CONFIRMED, P1 (both). The one promise the day rests on (§2 «works fully offline and syncs later without losing anything») has no automated test of persistence, restore, the optimistic overlay or the automatic retry, and the real-device field test (docs/handoff.md:34, HO-11) is still unchecked, so nothing proves it on a device either. Not P0: this finding shows no defect in today's code; it shows that six plausible regressions of that cod… Reproduction: Own scratch copy + runner (verify/evidence/V7/mutate-v7.mjs, full s…
- **Impact:** «Score entry works fully offline and syncs later without losing anything» (§2) is the promise the whole day rests on, and today a regression in persistence, retry or the optimistic overlay would pass CI and be discovered on the course.
- **Recommendation:** Add fake-indexeddb (dev dependency) and a jsdom/happy-dom project for src/data; test: queue survives a module reload (loadQueue), v1 database upgrades to v2, overlay replaces/insert scores and tiebreaks, a network error schedules a retry with fake timers (advanceTimersByTime(2000) → pushed), same-hole replacement, and the three QA-01 races. Target 100% branch coverage on outbox.ts and enforce it per file.

#### QA-07: The data layer that turns server rows into the engine's snapshot has no tests: store, realtime reloads, mappers, offline snapshot cache, paging and the backup client are at 0% — the fixes for three earlier P0/P1s shipped without regression tests

**P1** · CONFIRMED · new (the fixes it cites — P0-5 snapshotCache, P0-12 paged.ts, P1-15 store seq guard — are marked fixed in history/status.md, but none has a… · Effort M (under a day) · Scope: both

- **Evidence:**
  - Coverage (panel/evidence/QA/coverage-data-lib.txt): src/data/tournamentStore.ts 0/224, mappers.ts 0/165, api.ts 0/334, snapshotCache.ts 0/46, paged.ts 0/11, backup.ts 0/73, session.ts 0/16; src/data overall 19.1% lines
  - Earlier fixes without a test: audit P0 5 cold open offline → snapshotCache.ts; audit P0 12 PostgREST 1,000-row cap → paged.ts:10-18 (`rows.length < PAGE` boundary untested); audit P1 15 reload on online/visibility + sequence guard → tournamentStore.ts:77-78, 233-255
  - The engine is tested only against hand-built snapshots (src/engine/testing/fixtures.ts); nothing checks that mappers.ts produces those shapes from real rows (e.g. `picked_up`→`pickedUp`, `stroke_index`→`strokeIndex`, numeric `base_hcp` strings → Number)
- **Verification:** Independent verifier V7: CONFIRMED, P1 (both). The layer that turns server rows into the engine's snapshot is where two earlier production-class bugs lived (audit P0-12 the 1,000-row cap, P1-15 stale/overlapping reloads) and both fixes shipped with no regression test; my mutant that re-introduces P0-12 exactly passes CI. A mapper slip (pick-ups, base handicap) would produce wrong standings and money with a perfect engine and a green build. The only end-to-end ch… Reproduction: Tripwire set DATA_MODULES (verify/evidence/V7/tripwire.mjs): a modu…
- **Impact:** The engine can be perfect and the board still wrong: a mapper typo, a paging off-by-one past 1,000 score rows (a 60-player field) or a stale reload overwriting a newer one would ship green and surface as wrong standings or money on the day.
- **Recommendation:** Unit-test the pure parts now: mappers (row fixtures captured from a real backup JSON → snapshot → computeTournament equals the fixture-built result), fetchAll with a fake builder (0, 999, 1000, 1001, 2500 rows), snapshotCache with fake-indexeddb, and the store's seq guard with a fake Supabase client (two overlapping reloads, the older resolving last, must not win). Add a golden «backup → snapshot → state» test using a scrubbed copy of the Ensayo backup.

#### QA-10: `main` is unprotected: nothing requires `check` to pass before merge, and allowed tools push around the pre-push hook — every push to main deploys to production

**P1** · CONFIRMED · regressed (AUD-P2-34), partly fixed otherwise · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - GitHub API list_branches → `{"name":"main", "protected": false}` (every branch unprotected)
  - .claude/settings.json allows `mcp__github__*` (covers push_files, create_or_update_file, delete_file, merge_pull_request); the PreToolUse hook matches only Bash `git push` (scripts/prepush-guard.sh:10-13)
  - .githooks/pre-push needs `git config core.hooksPath .githooks`; `git config --get core.hooksPath` in this clone → not set
  - CLAUDE.md §3: Vercel production branch is `main`, deployed on every push. Vercel does not wait for CI: production deployment dpl_Gucv6ydes… for 379ed52 was created at 2026-09-30T01:58:51Z, the same second the `check` run on main started (finished 01:59:53Z); same for 23fd27b (deploy 16:27:10Z, CI 16:27:10–16:28:15Z) (Vercel list_deployments + pane…
  - …2 more in `findings.json`
- **Verification:** Independent verifier V7: CONFIRMED, P1 (both). Production has no gate: main is unprotected, no ruleset applies, and Vercel aliases golf.cardigan.mx before CI even finishes (23fd27b was READY on the production domain 33 s before `check` completed). 15 commits already reached main without a PR, the latest on 29 Sep. During 9-10 April a single red or hurried push breaks the live rounds with nothing to stop it; the only rule is a sentence in RUNBOOK.md:47. S effort,… Reproduction: GitHub MCP list_branches → main {protected:false} (every branch fal…
- **Impact:** A red commit (or a direct file edit through the GitHub API) can reach golf.cardigan.mx with no check at all, including during the tournament days.
- **Recommendation:** Protect main: require the `check` status (and a future e2e/SQL job), require PRs, block force pushes; move mcp__github__push_files / create_or_update_file / delete_file to `ask`; run `git config core.hooksPath .githooks` from the setup script; add a Vercel deployment check so production promotion waits for GitHub checks; declare a change freeze for 8–11 April 2027 in RUNBOOK.md.

#### QA-11: No end-to-end or browser test runs in CI; the core flow is guarded by one manual smoke script against live Ensayo, and the per-PR Playwright checks quoted in PR bodies were never committed

**P1** · CONFIRMED · new as a finding (history/status.md's note on AUD-P2-37 already says 'CI still does not run any e2e', never reported) · Effort M (under a day) · Scope: both

- **Evidence:**
  - .github/workflows/ci.yml has one job (`check` = preflight); `npm run e2e` (e2e/smoke.mjs) is never invoked by CI; e2e/profile.mjs and e2e/platform.mjs need SUPABASE_SECRET_KEY
  - PR bodies cite ad-hoc runs that are not in the repo: #60 «Playwright on the /admin/_ fixtures at 360 and 1280 px: 24/24», #51 «19 checks in a real Chromium», #52 «9 checks», #54 «every list measured flush»; `grep -rl scrollWidth e2e scripts` finds none of them
  - Production defects shipped through a green CI and were verified afterwards with uncommitted scripts: #43 «/api/push-dispatch crashed in production (500)» (nothing executes the functions), #56 blank white page on iPhone (the fix was verified by hand with Playwright and a hung /auth/v1/** route; that script is not in the repo), #51 the leaderboard r…
  - CI: 0 failed runs out of 187 (panel/evidence/QA/ci-runs.json)
- **Verification:** Independent verifier V7: CONFIRMED, P1 (both). Four production defects already went out through a green CI and were found afterwards by hand: /api/course-search 500 (#4), /api/push-dispatch 500 (#43, same class a day later), «Día 1 [object Object]» on every leaderboard row (#51), a blank page on iPhone (#56). CI renders no screen and executes no function; the only browser check (e2e/smoke.mjs) is manual, live-only and shares the rehearsal tournament. For a produ… Reproduction: .github/workflows/ci.yml: one job `check` = `bash scripts/preflight…
- **Impact:** Every release depends on someone remembering to run a script by hand against the shared rehearsal tournament. Regressions in the Tarjeta, the gate, the auction console or the money screens are found by the owner on his phone.
- **Recommendation:** Commit a Playwright suite that runs in CI against `vite preview` with VITE_DESIGN_ROUTES=1 fixtures (no network): Tarjeta save/undo/tiebreak, leaderboard change after a save, Dinero totals, auction console, TV, no horizontal scroll at 360/393/1280, no page errors. Run the live smoke against Ensayo on a schedule and before each release, not only by hand.

#### QA-04: Settlement and prize-check legs outside the first tournament's happy path have no pinning test: side-pot buy-ins in «vía banco», partially paid payouts, percent-place remainders and the pair odd peso can all break silently

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - M13 src/engine/core/money.ts:248 `toBank = m.entry + m.sidePots + m.calcuttaPurchases` → drop `m.sidePots`: SURVIVED (settlement tells players with side pots t…
  - …4 more in `findings.json`
- **Impact:** Ronda rápida and any tournament with side pots, percent prizes or odd pair prizes can show a settlement that does not add up, or mark a payout paid when only part was pa…
- **Recommendation:** Add property-style tests in src/engine/core/money.test.ts: for random fields (4–16 players, random enabled modules, side pots, bets, buybacks, partial payments) assert Σ viaBank to bank = Σ…

#### QA-05: Tie-break and settlement rules beyond the fixture's happy path are untested: best-round countback, stale snake tiebreak answers, DNF snake settlement, last place in a finished tournament

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 P2 «Tests: … DNF …»): fewest-putts withdrawal is now covered, the rest is not · Effort S (under 2 h)

- **Evidence:**
  - M17 src/engine/modules/bestRound/index.ts:38 remove countback within the day (tie → split): SURVIVED; modules/games.test.ts:25-41 never asserts WHO wins best r…
  - …3 more in `findings.json`
- **Impact:** The rules sheet promises these behaviours (§5.4 countback per day, §5.6 «¿Quién embocó al último?», §18.7 DNF), and a regression in any of them changes who gets $1,200 o…
- **Recommendation:** Add one hand-worked test per rule: two players tied on day points where holes 10–18 decide best round; a tiebreak answer whose player no longer has 3 putts after a Comité edit → pending aga…

#### QA-12: The smoke test's assertions are largely tautological and it is built on flaky patterns: 7 of 20 checks are `check(true)`, «round 1 is live» passes whatever round is live, and «hole saved» passes when the write is still pending

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 P2 tooling: the Ensayo guard exists since #28, e2e/ is linted) · Effort S (under 2 h)

- **Evidence:**
  - e2e/smoke.mjs:67,79,97,110,133,189,194 — `check(true, …)`: they only prove the previous waitForSelector did not throw
  - …3 more in `findings.json`
- **Impact:** The one end-to-end test can pass while the promise it names («enter a score, see the leaderboard change», §4) is broken, and it can fail for reasons unrelated to the cod…
- **Recommendation:** Assert outcomes, not arrival: read the hole's server row after save (wait for «Sincronizado» only), capture the player's points before and after and assert the delta, assert the live round…

#### QA-13: Screens are 0% covered and there is no component-test setup, so the Tarjeta's own rules (unusual-value confirm, the snake tiebreak prompt, reason on signed cards, undo) have no automated test

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - Coverage: src/screens/* 0 lines of 13,166 (admin 0/3,829, tournament 0/3,449, profile 0/2,421, platform 0/2,143, organizer 0/1,179); src/components 1.6% (panel…
  - …3 more in `findings.json`
- **Impact:** The flows that decide whether a hole is saved correctly on the course are protected only by manual testing; every UI refactor (six redesign slices in three days) re-risk…
- **Recommendation:** Add a jsdom project to vitest with @testing-library/react; extract the Tarjeta's save decision (validate → reason → tiebreak → commit) into a pure function and test it exhaustively; render…

#### QA-14: The serverless routes and their auth gate are untested (0 of 317 lines); a production 500 in /api/push-dispatch shipped through a green CI

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - Coverage: api/backup-cron.ts 0/71, api/course-search.ts 0/75, api/push-dispatch.ts 0/42, api/scorecard-extract.ts 0/96, src/server/auth.ts 0/33 (panel/evidence…
  - …2 more in `findings.json`
- **Impact:** An auth regression on /api/scorecard-extract would let anyone spend the Anthropic balance; a broken backup-cron would stop the only whole-database backup, noticed only i…
- **Recommendation:** Unit-test each handler with a fake VercelRequest/Response: missing/invalid bearer → 401/403 before any upstream call (assert the Anthropic/fetch mock was not called), oversized body → 413 J…

#### QA-15: CI measures nothing beyond pass/fail: no coverage report or threshold, no bundle budget, no accessibility or Lighthouse check, lint warnings never fail, and the placeholder Supabase env keeps every network path dark

**P2** · CONFIRMED · new · Effort M (under a day) · Merged: PERF-06

- **Evidence:**
  - No coverage provider in package.json (the panel had to install @vitest/coverage-v8 in a copy to measure 26.9% lines overall: engine ≈94%, src/data 19.1%, src/l…
  - …7 more in `findings.json`
- **Impact:** Quality can only degrade silently: a 200 kB dependency, a test deletion, an a11y regression or a slower first load all merge green.
- **Recommendation:** Add @vitest/coverage-v8 with per-directory thresholds (engine and src/data/outbox ≥ 95% branches, never decreasing), a size-limit budget on the entry chunk and total precache, `eslint --max…

#### QA-16: The service worker and the update flow are untested: push handling, badge and click routing, and the «don't reload mid-hole» deferral that fixed an earlier P0 have no test

**P2** · CONFIRMED · new (the fix for audit-2026-09-28 P0 13 has no regression test) · Effort M (under a day)

- **Evidence:**
  - src/main.tsx:16-21 — onNeedRefresh offers the reload only when `useOutbox.getState().editing` is false; the flag is set in ScorecardScreen.tsx (drafts ≠ initia…
  - …2 more in `findings.json`
- **Impact:** A change to the update prompt could again reload phones mid-hole (the original P0), and a push regression would go unnoticed until a player asks why he got no notice.
- **Recommendation:** Extract the update decision into a pure function (needRefresh × editing → offer now / defer) and unit-test it; add a Playwright test that registers the built SW, simulates an update while t…

#### QA-17: The §2 success criteria and the M3 acceptance test (4 phones at once, other phones updated in < 2 s, airplane-mode sync) have no automated measurement

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - CLAUDE.md §2 «Other phones see a new score in under 2 seconds on 4G», «Entering one hole for a foursome takes under 10 seconds», «works fully offline and syncs…
  - …2 more in `findings.json`
- **Impact:** The properties that make or break the day are verified by feel on a few phones; QA-01 shows a concurrency defect in exactly this area that no existing test would find.
- **Recommendation:** Add a Playwright job with 4 browser contexts on a throwaway tournament: each saves a hole, the others must show it within 2 s (record p50/p95); one context goes offline (`context.setOffline…

#### QA-18: The golden money test is a 950-line snapshot of whatever the engine returned when it was written, not an independently worked result

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/engine/golden.test.ts:1-5 «The snapshot was written before the games/pots foundation landed»; src/engine/__snapshots__/golden.test.ts.snap (950 lines) was…
  - …2 more in `findings.json`
- **Impact:** Low today, but as the only «whole tournament» pin it invites approving snapshot updates without checking money.
- **Recommendation:** Replace the snapshot with explicit expectations for the ~20 numbers that matter (each prize line and every person's net), derived by hand like handCalc.test.ts, or keep the snapshot but add…

#### QA-19: Test nits: a Day-2-cut test re-implements the rule instead of calling the engine, and a hand-calculation comment contradicts its own assertion

**P3** · CONFIRMED · partly fixed (audit-2026-09-28 P2: the pick-up assertion is now correct, the old comment remains) · Effort S (under 2 h)

- **Evidence:**
  - src/engine/core/handicap.test.ts:62-67 — «PH1 16, P1 42 → PH2 13» is computed in the test as `Math.max(0, 16 - nextRoundCut(42, CUT).value)`; the engine's own…
  - …1 more in `findings.json`
- **Impact:** Minor: misleading documentation of the rules for the next reader.
- **Recommendation:** Assert PH2 through computeCore (as compute.test.ts does) and delete the duplicate; fix the comment.

#### QA-20: design/shots keeps 64 MB of screenshots in git and is still growing

**P3** · CONFIRMED · still open (audit-2026-09-28 P2 tooling: 58 MB then, 64 MB / 527 files now) · Effort S (under 2 h) · Merged: PERF-15

- **Evidence:**
  - `du -sh design/shots` → 64M; `git ls-files design | wc -l` → 527
  - …3 more in `findings.json`
- **Impact:** Every CI checkout and clone downloads them; history only grows.
- **Recommendation:** Move screenshots to an artifact store or Git LFS; keep only a small curated set in the repo.

#### QA-21: No automated dependency updates or audit in CI: 13 major versions behind, and nothing would flag a vulnerable or abandoned package

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - .github/ holds only workflows/ci.yml and keepalive.yml: no dependabot.yml or renovate config
  - …2 more in `findings.json`
- **Impact:** Upgrades pile up into a risky big-bang right before the trip, or a security fix is missed.
- **Recommendation:** Enable Dependabot (weekly, grouped minor/patch, majors separate) and an `npm audit --omit=dev --audit-level=high` step in CI; freeze dependencies from March 2027.

#### QA-23: CI tests on Node 22 while Vercel builds the app and runs the functions on Node 24.x

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - .nvmrc → 22 (used by ci.yml `node-version-file`); package.json engines `>=22`
  - …2 more in `findings.json`
- **Impact:** A runtime difference (ESM resolution, fetch, crypto, sharp binaries) can pass CI and fail in production functions or the Vercel build.
- **Recommendation:** Pin one version everywhere: set Vercel to 22.x or .nvmrc/engines to 24 and run CI on the same; add the api bundle/import step from QA-14 on that version.

### 6.8 Visual design and brand

38 findings: 0 P0 · 4 P1 · 22 P2 · 12 P3.

#### VIS-01: Money screens are laid out as ragged staircases: on Juegos › La Calcutta (15/15 rows), the Matrimonios head-to-head (6/6) and Dinero › Liquidación (31/31) every amount and «Pagado» button floats right after its label instead of sitting in a right-aligned column, because the screens' `display: grid` loses to the composed primitive's `display: flex`

**P1** · CONFIRMED · new as a finding, but a code regression: f2712a7 (#54, 2026-09-29 'One list row') replaced working standalone grids — MoneyScreen `.transfe… · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/screens/tournament/GamesScreen.module.css:94-98 `.rowLine { composes: rowLine …; display: grid; grid-template-columns: minmax(0,1fr) auto }` and :12-15 `.gameRow` (same pattern); src/components/primitives.module.css:655-662 `.rowLine { display: flex; … }`
  - Bundled order in index-PYOh36qD.css (probe $S/panel/evidence/VIS/calc.mjs): `._rowLine_d3vna_94 {display:grid}` then `._gameRow_d3vna_12 {display:grid}` then `._rowLine_1cnem_655 {display:flex}` — same specificity, the composed base comes later and wins; computed display on every Calcutta row = flex
  - src/screens/tournament/MoneyScreen.module.css:146-154 `.transfer { composes: rowLine }` with `.transferText` lacking `flex: 1` (the primitive `rowTextBlock` that has it is not composed), so the amount and the button hug the text
  - node $S/panel/evidence/VIS/ragged.mjs → «/juegos#La Calcutta: 15/15 rows ragged (gap up to 199px)», «#Los Matrimonios: 6/6», «/dinero#Liquidación: 31/31 (gap 58px+)»; control screens (Juegos overview, Dinero «Si terminara ahora», Más) 0 ragged
  - …5 more in `findings.json`
- **Verification:** Independent verifier V12: CONFIRMED, P1 (both). A clear layout defect, not a taste call: the grid each screen declares is silently discarded by the cascade, so the Calcutta payout table (auction night) and the settlement checklist (the banker's before-bed list) show amounts and «Pagado» buttons that are not in a column. No figure is wrong or hidden, so it is not P0; but a money list with ragged amounts is something a top company would not ship, the fix is S, and… Reproduction: Own preview on :4212 (HEAD dist-design). (1) node $S/verify/evidenc…
- **Impact:** The two screens where money is decided in front of the group — the Calcutta payout table on auction night and the settlement checklist the banker ticks off before bed — look broken: figures wander by up to 200 px from row to row, so nobody can scan a column of amounts or compare two payouts, and «Pagado» buttons sit in a different place on every row (mis-taps on a moving target). For a product whose brief says «Trust is the product», this is the first thing a Stripe or Revolut designer would stop the launch for.
- **Recommendation:** Make the row primitive own its columns instead of letting screens re-declare layout: give `.rowLine` (primitives.module.css:655) `display:grid; grid-template-columns:minmax(0,1fr) auto` or make its first child `flex:1` by default, delete the local `display:grid` overrides (they never apply), and compose `rowTextBlock` in `.transferText` (MoneyScreen.module.css:149) and `.rowText` (GamesScreen.module.css:103). Put figures in a right-aligned tabular column (`.fig`, text-align:right) and the action in a fixed-width trailing slot. Add a Playwright layout assertion (the ragged.mjs detector) over J…

#### VIS-03: The TV board silently drops a quarter of the field: each Individual page holds 12 players but only 9 rows fit at 1920×1080, so positions 10–12 (including last place, La Cuchara) never appear, and on 60 players 15 are never shown

**P1** · CONFIRMED · still open (DA-15.2 '12 rows did not fit at 720p', marked fixed in $S/history/status.md on measure.json `tv: {scrollHeight:1080, viewport:1… · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/screens/tournament/TvScreen.tsx:48 `const PAGE = 12`; :99 slices 12 rows per page; src/screens/tournament/TvScreen.module.css:53-57 `.rows { overflow: hidden }` and :59-66 rows sized in vh (avatar 5.5vh + padding + 3vh text ≈ 90 px)
  - node $S/panel/evidence/VIS/tvsize.mjs /t/_/full12-finished/tv → «rows in DOM 12, fully visible 9»; /t/_/large60/tv «Individual 1–12» → 9 visible
  - docs/review/2026-09-30/shots/t_tv-full12-finished-tv-dark-slide1.png (ends at 9th), docs/review/2026-09-30/shots/t_tv-large60-tv-dark-slide1.png (title «1–12», 9 rows), docs/review/2026-09-30/shots/t_tv-longnames-tv-dark-slide1.png (8½ rows)
  - Because rows are sized in vh, the same 9-row limit holds on any 16:9 screen, 720p casting included
- **Verification:** Independent verifier V12: CONFIRMED, P1 (both). Content silently dropped from the shared scoreboard: with the first tournament's 12 players, positions 10–12 (last place, La Cuchara, included) never appear on the TV in any rotation, at any 16:9 size tested, and nothing says the board is cut. No money or data is wrong and phones show the full table, so not P0; but a leaderboard that omits a quarter of the field is a clear defect a top company would not ship, and th… Reproduction: Own preview :4212. TvScreen.tsx:48 PAGE=12, :50 pages=ceil(n/12) →…
- **Impact:** At the villa and at dinner the TV is the shared scoreboard. The bottom three of a 12-man field — the players most likely to be roasted, and the Cuchara de Palo slot of the Calcutta — are never on screen, and nothing says the board is cut. On 60 players a quarter of the field is invisible on every rotation.
- **Recommendation:** Compute rows per page from the measured height (ResizeObserver on `.rows`, floor(available / rowHeight)) instead of a constant, or size rows so PAGE always fits (row height = (100vh − header) / PAGE). Show «1–9 de 12» and page through all players. Add a Playwright check at 1920×1080 and 1280×720: every player id appears on some page.

#### VIS-04: TV Matrimonios and Calcutta boards are broken: their rows render 4 cells into a 5-column grid, so pair and owner names wrap into the 6vh avatar column («Los / Tres», «Iván / J.»), partners and holdings truncate to «Ca…», and the totals float 200 px short of the right edge

**P1** · CONFIRMED · new (never flagged: DA-15.1–15.4 cover other TV issues). Not a regression: the pairs and Calcutta rows have had 4 cells in a 5-track grid s… · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/screens/tournament/TvScreen.module.css:59-61 `.row { grid-template-columns: 6vh 6vh minmax(0,1fr) auto 14vh }` (pos, avatar, name, small, big)
  - src/screens/tournament/TvScreen.tsx:126-136 pairs row = pos, name, small, big (no avatar); :184-192 Calcutta row = avatar, name, small, big (no pos): every cell lands one track to the left, so the name gets the 6vh (65 px) track and the figure the `auto` track
  - docs/review/2026-09-30/shots/t_tv-full12-live-tv-dark-slide2.png — «Los / Tres / Ca…», «74 + 40» beside it, «114» at x≈1600 of 1843
  - docs/review/2026-09-30/shots/t_tv-full12-live-tv-dark-slide4.png — «Iván / J. / Ca…», «$1,500» with no label, «$6,600» at x≈1630
  - …1 more in `findings.json`
- **Verification:** Independent verifier V12: CONFIRMED, P1 (both). Two of the TV's five slides for the first tournament (pairs and Calcutta are both enabled) render broken: names wrap into a 65 px track, partners/holdings collapse to two-letter stubs, text collides, and the Calcutta slide clips owners. Numbers shown are correct, so not P0; a visibly broken board on the villa TV is a clear defect a top company would not ship, and the fix is S. Reproduction: Own preview :4212, probe $S/verify/evidence/V12/v04-tvgrid.mjs (rotation sped up by init script; resolved g…
- **Impact:** Two of the five TV slides — the pairs game and the Calcutta, the two side games the group bet the most on — look visibly broken on the villa TV for 12 s of every minute. The partners and holdings (the point of those boards) are unreadable «Ca…» stubs, and an unlabeled «$1,500» next to «$6,600» invites the wrong reading.
- **Recommendation:** Give each board its own grid (or always render 5 cells with empty placeholders), put the pair's two names on the sub line in full, and label the Calcutta columns («invirtió», «vale hoy»). Add a TV visual regression over every slide of full12-live and longnames (Playwright screenshots at 1920×1080 with a per-slide text-overflow check).

#### VIS-06: Ceremonia, the finale, is a phone dialog on the TV: at 1920×1080 the tournament name is 14 px (5′ of arc at 4 m), the controls 16–18 px, the step title 48 px, the champion card fills ~20% of the screen, the primary «Siguiente» is cream text on a white box (1.1:1), and the ceremony ignores the event accent (a fairway-green «Revelar» on an Agua tournament)

**P1** · CONFIRMED · new (DA-16.1–16.4 covered emoji, springs, confetti and money colours; the history marks DD-4 'board surface' fixed on token values, not on… · Effort M (under a day) · Scope: both

- **Evidence:**
  - node $S/panel/evidence/VIS/cersize.mjs → start: «Nacho's Bachelor Invitational» 14 px (5.2′), «Empezar la ceremonia» 18 px (6.7′), «Ceremonia» 22 px; step 3 and the last step: title 48 px (17.9′), «Anterior / 3 / 12 / Siguiente» 16 px (6.0′)
  - src/screens/tournament/CeremonyScreen.module.css sizes in rem with caps (SHOTS-B index §7: header 22 px, name 14 px, lists ≤ 22.4 px), unlike TvScreen which scales in vh
  - src/screens/tournament/CeremonyScreen.tsx:274 «Siguiente» is `.btn--secondary`; CeremonyScreen.module.css:155-159 recolors its text to --board-ink but never its white background (global.css:212-215) → #f6f3ea on #ffffff = 1.11:1 (also A11Y-04)
  - Ceremonia never sets --event-accent (only TournamentShell.tsx:52, TvScreen.tsx:75, EnterScreen.tsx:100 do), so `.btn--primary` falls back to the platform fairway #1e6b3b: 2.25:1 against the board green, and not the event's colour
  - …2 more in `findings.json`
- **Verification:** Independent verifier V12: CONFIRMED, P1 (both). RUNBOOK.md:67 runs the Ceremonia «En la tele» and §16 M6 is accepted on a TV; at 1920×1080 the forward control's label is invisible (1.11:1, a WCAG 1.4.3 failure on the ceremony's main navigation) and everything but the step title and winner name is below 10-foot sizes (14–22 px). The flow is not blocked («Revelar» is visible and the blank white box can still be clicked), so not P0; the invisible label alone is a cl… Reproduction: Own preview :4212, probe $S/verify/evidence/V12/v06-ceremonia.mjs…
- **Impact:** The prize-giving is the emotional peak of the trip and the brief's «wow» test (CLAUDE.md §9.10, §16 M6). On the TV it shows a small green button in a sea of empty board, a champion card the size of a phone, and a Next button nobody can see; the event's own colour and the direction's plate numerals are absent. It will read as a prototype in front of all twelve players.
- **Recommendation:** Give Ceremonia the TV's vh-based scale (names ≥ 10vh on reveal, figures on plates), set --event-accent from the tournament like the other screens, restyle the footer buttons for the board (transparent fill, board-ink text, board-accent focus ring), and choreograph one reveal per step with count-ups of points and money. Verify on a real TV at 4 m during the Ensayo rehearsal.

#### MOT-01: Ceremonia and the TV still run Motion's default bouncy springs and 300 ms fades: a Ceremonia step change takes ~760 ms with a 12% overshoot and a blank stage between steps

**P2** · CONFIRMED · partly fixed (DESIGN_AUDIT A.6 springs; motion.ts claims every call site now uses the tokens) · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/CeremonyScreen.tsx:227 (start), :235 (each step: initial {opacity:0,y:30} / exit {opacity:0,y:-30}), :262 (end) — no `transition` prop,…
  - …5 more in `findings.json`
- **Impact:** The ceremony — the one screen the whole dinner watches, advanced by the organizer one tap at a time — moves at three times the documented speed, bounces, and blanks the…
- **Recommendation:** Give every animated call site an explicit transition from src/design/motion.ts (ease/easeSlow; `stagger` for lists) and use `mode="popLayout"` or a cross-fade instead of `mode="wait"` so th…

#### MOT-05: Calcutta night's promised motion is missing: no hat-draw shuffle, no gavel, no pot counter; the draw of the pairs is a 250 ms fade with a static rings icon on the auctioneer's phone only

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - src/screens/admin/AdminAuction.tsx:85 'Sortear el orden' (the brief's 'Sacar del sombrero') → `setOrder(shuffle(draft))`: the ordered list (:92-110) re-renders…
  - …4 more in `findings.json`
- **Impact:** The three theatrical beats of the dinner — the hat draw, each hammer, the rings — land as instant list swaps and a fade on one phone. The auctioneer has nothing to show…
- **Recommendation:** Hat draw: `layout` on the order rows (they are keyed by player id) plus a 600–900 ms staggered reorder so the new order visibly shuffles into place; mirror it on the TV. Pot: a 400–600 ms t…

#### MOT-08: The TV — the screen the whole villa watches — does not animate the leaderboard re-sort at all; the rows jump, and the 12 s rotation gives no sign of what is next or when

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/TvScreen.tsx:100-117 — individual rows are plain <div key={playerId}>, no `layout`; pairs (:124-137) the same
  - …4 more in `findings.json`
- **Impact:** The single orchestrated moment the design direction promises happens only on a phone that happens to be on En vivo (and, with REL-01, not even there). On the TV, where t…
- **Recommendation:** Reuse the phone board's `motion.div layout transition={easeSlow}` on the TV rows (and pairs), hold the individual board on screen when a re-sort happens in its last 2 s, and add a thin prog…

#### MOT-18: A live score that does not change the order — most of them — leaves no trace on the board: 'hoy' and the total swap in one frame with no highlight, count or mark

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/components/primitives.tsx:161-163 — today and total are plain text spans; nothing in LeaderRow, Money or Figure animates or highlights a changed value; `gr…
  - …2 more in `findings.json`
- **Impact:** On a 12-player board most incoming scores move nobody. A player glancing at the board cannot tell whether anything arrived since the last glance, whose figures moved, or…
- **Recommendation:** Mark changed figures: a 1–2 s background wash on the changed cells (accent-soft fading to transparent; reduced motion → a static dot until the next view) and a short count on the total (≤ 4…

#### MOT-23: The 'final reveal' — one of the two orchestrated moments the direction promises — is a 250 ms pop: at 120 ms after 'Revelar' the champion's name, points and prize are already on the TV, with no build-up

**P2** · CONFIRMED · partly fixed (DESIGN_AUDIT.md §16 'springs and delays on every reveal, three confetti bursts': the reveal springs are gone, the three burst… · Effort M (under a day)

- **Evidence:**
  - src/screens/tournament/CeremonyScreen.tsx:243-256 — 'Revelar' mounts the whole reveal (scale 0.7 → 1, easeSlow) and each winner block (stagger 250 ms); the cha…
  - …3 more in `findings.json`
- **Impact:** The ceremony is the last thing the group does together and the champion is its climax; on the TV the name simply appears, the same way as the 4th-place winner, and the c…
- **Recommendation:** Choreograph the champion (and 2nd–4th) as a sequence the organizer controls: the podium order dims in, a held beat, the points count up from the runner-up's total, then the name and avatar…

#### PERF-16: Uploading a transparent logo through Comité › Torneo turns its background black: any PNG over 400 KB or wider than 800 px is re-encoded as JPEG (the Nacho patch comes out on a solid black square)

**P2** · CONFIRMED · new; distinct from VIS-08 (logo contrast on dark surfaces) · Effort S (under 2 h)

- **Evidence:**
  - src/lib/images.ts:18-21 — keepPng = file.type === 'image/png' && scale === 1 && file.size < 400_000; otherwise canvas.toBlob(…, 'image/jpeg', 0.86), and JPEG h…
  - …2 more in `findings.json`
- **Impact:** When the organizer uploads the first tournament's logo (or any designer-exported PNG logo, usually wider than 800 px) the way the product intends, the event's brand show…
- **Recommendation:** Encode logos and avatars as WebP (`canvas.toBlob(…, 'image/webp', 0.85)` keeps alpha; fall back to PNG when WebP encoding is unsupported, which Safari < 16 is); never pick JPEG for a source…

#### VIS-02: The leaderboard breaks its own first rule: every numeric column (Hoy, Hoyo, Puntos/Gross) is left-aligned under a right-aligned header, so the big figure sits wholly left of «PUNTOS» and «8» and «11» do not share a units column

**P2** · CONFIRMED · still open (DD-2, which HIST marked fixed: the selector has never matched since it was written in 9aecbfc, #12) · Effort S (under 2 h)

- **Evidence:**
  - DESIGN_DIRECTION.md:8 «Right-aligned numeric columns that line up to the pixel.»
  - …3 more in `findings.json`
- **Impact:** The flagship board — the screen every player opens between shots and the one the direction calls «numbers are the hero» — reads as slightly off: the column header and th…
- **Recommendation:** Change the selector to target what LeaderRow renders (`.leaderRow > .fig:not(.pos)` or give today/thru/figure a `.col` class) with `text-align:right`, and keep the header spans on the same…

#### VIS-05: TV type is phone-scale for a room: at 4 m from a 55-inch 1080p screen the names subtend 12′ of arc, the «Hoyo 11, 25» line 9′, «Salir» 8′ and the tier badges 4.5′ — only the totals and titles reach the 16′ legibility floor — and nothing on the board has a column label

**P2** · CONFIRMED · still open (DESIGN_AUDIT §15 / DA-15.1 «TV rows carry the phone's six elements») · Effort M (under a day)

- **Evidence:**
  - node $S/panel/evidence/VIS/tvsize.mjs /t/_/full12-finished/tv (55″ 16:9 panel, 0.634 mm/px, Archivo cap height 0.686 em, viewer 4 m): 12 px tier badges → 5.2 m…
  - …3 more in `findings.json`
- **Impact:** From the couch, guests can read who leads and the totals, but not the names reliably, not how many holes each has played, not today's points and not the tiers; the snake…
- **Recommendation:** Design the board for distance: a 3-column board (pos, name, total) plus one labeled figure (HOY or HOYO) at ≥ 4.5vh, names at ≥ 4.5vh (≈ 18′), no tier badges, the holder marked by a board-y…

#### VIS-07: The Calcutta lot card hides the tier: the auction TV prints the tier badge in graphite on the board surface (1.3:1), so the tier that decides the «Mejor C / Mejor D» slots is invisible while the room bids

**P2** · CONFIRMED · new · Effort S (under 2 h) · Merged: MOT-20

- **Evidence:**
  - src/screens/tournament/TvScreen.tsx:244-245 `<span className="tierBadge">` inside `.lotMeta`; the only board override is TvScreen.module.css:100-104 `.name :gl…
  - …5 more in `findings.json`
- **Impact:** On auction night the bidders price a player partly by tier (C and D players carry their own 10% slots). The TV shows the tier as an unreadable dark square, so the room h…
- **Recommendation:** Render the tier on the lot card as text («Grupo C») in board-ink at the lotMeta size, or add a board override for every .tierBadge under `.tv`; add the pair to tokens.test.ts.

#### VIS-08: Tournament logos break on the board surfaces: a dark logo on a transparent background (the common case) vanishes on the TV and Ceremonia green, and a detailed patch like Nacho's is an unreadable blob at the 40 px header size; there is no plate, outline or small-size variant

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/TvScreen.module.css:21-24 `.logo { height: 9vh; width: auto }` — no background or outline; same pattern in CeremonyScreen.tsx:213; src/c…
  - …2 more in `findings.json`
- **Impact:** Organizers will upload whatever logo their club or group has; on the two «show» surfaces it either disappears or turns to mush, which reads as Polo mishandling their bra…
- **Recommendation:** On board surfaces put logos on a light plate (--on-dark, --r-md, padding) or auto-detect luminance and add a light halo; let the organizer upload a square mark separately from the full logo…

#### VIS-09: Four of the six curated event accents collide with the semantic colours the whole direction rests on: Agua is the over-par blue (ΔE2000 2.9), Vino is the under-par/debt/error red (8.0), Arena is the caution brown (7.5), Pizarra is the secondary ink (10.3)

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/design/accents.ts:11-18 (fairway #1e6b3b, agua #2b5b8c, atardecer #b4532a, vino #8a2e3a, pizarra #3f4a54, arena #7a5a2e) against src/styles/tokens.css:20-2…
  - …6 more in `findings.json`
- **Impact:** Colour stops carrying meaning exactly where the product depends on it: in Nacho's own tournament «blue» means both «over par» and «mine / press here», and a Vino organiz…
- **Recommendation:** Re-pick the accent set in a hue band that stays ≥ 20 ΔE2000 from --under, --over, --caution and the inks (e.g. fairway, a teal-cyan, a plum/violet, an ochre-gold that is not caution, a slat…

#### VIS-10: An event shows two brand colours at once: the platform fairway green still drives 47 style rules (links, «Ver tarjeta», «Compartir», toggles, the my-row tint, the current-hole marker, Calcutta amounts, Ceremonia) against 12 for the event accent, so every non-Fairway tournament mixes its accent with green — the my-row marker alone is a green tint with a blue bar detached 16 px from it

**P2** · CONFIRMED · partly fixed (DA-X.hier.3: one semantic palette now, but two accents inside a tournament) · Effort S (under 2 h)

- **Evidence:**
  - grep -rn 'var(--accent)\|var(--accent-soft)' src --include=*.css (excluding dev/design) → 47; 'var(--event-accent)' → 12
  - …4 more in `findings.json`
- **Impact:** The personalization the platform sells («each event can carry one accent») looks like a half-applied theme: two competing hues on every tournament screen, and the one el…
- **Recommendation:** Inside a tournament, alias --accent and --accent-soft to the event accent (and a derived soft tint via color-mix) in TournamentShell, Ceremonia and TV, keep fairway only for platform chrome…

#### VIS-11: No dark appearance anywhere (`color-scheme: light`, zero `prefers-color-scheme`): the auctioneer console at the Calcutta dinner, the bedtime settlement and every night-time check of the board are a full-screen near-white page

**P2** · CONFIRMED · new (a design decision in DESIGN_NOTES.md:13, challenged here) · Effort M (under a day)

- **Evidence:**
  - grep -rn 'prefers-color-scheme' src → 0; index.html:10 `<meta name="color-scheme" content="light">`
  - …3 more in `findings.json`
- **Impact:** Half of the product's moments happen after sunset: the auctioneer holds a white phone next to a dark TV at a dinner table, and players check money and standings in bed.…
- **Recommendation:** Keep light as the course default but ship an automatic dark theme: a --bg/--surface/--ink set derived from the board palette (the tokens already exist), with under/over re-tuned for dark (t…

#### VIS-12: The laptop surfaces have no hover state at all: one `:hover` rule exists in the whole product (a chart bar in Admin de Polo), so buttons, rows, nav items, swatches and links in the Comité, the organizer screens and Admin de Polo never respond to the pointer

**P2** · CONFIRMED · still open (DA-C.1 / DA-C.4.2 «no hover anywhere») · Effort S (under 2 h)

- **Evidence:**
  - grep -rn ':hover' src --include=*.css (excluding dev/design) → 1 (src/screens/platform/Platform.module.css:150 `.plot:hover .bar`)
  - …2 more in `findings.json`
- **Impact:** On the laptop — where the organizer builds the tournament, runs the auction console and the Admin de Polo — nothing signals what is clickable until it is clicked. It is…
- **Recommendation:** Add `@media (hover: hover)` states to the primitives once (button fill/border shift, row background --surface, nav item ink, swatch ring), not per screen; include them in the /design style…

#### VIS-13: Loading, error and boot states are generic and nearly invisible: every lazy screen shows the same three bars at 1.08:1 against the page, a failed load is a pink card that prints «Failed to fetch», and every cold start first paints «Polo / Cargando…» in the system font

**P2** · CONFIRMED · partly fixed (DA-X.lee.1, marked fixed by HIST: skeletons exist but are generic and 1.08:1; DA-X.lee.3 raw messages remain) · Effort M (under a day)

- **Evidence:**
  - src/components/ui.tsx:113-126 `Spinner` = three bars of fixed widths for every screen (comment: «shaped like the content it replaces» — it is not); skeleton fi…
  - …4 more in `findings.json`
- **Impact:** The moments when the network is slow — which on a golf course is most moments — look like a blank page, and the failure state looks like a developer console. These state…
- **Recommendation:** Make skeletons per screen from the real primitives (Board rows with position/name/figure blocks, the Tarjeta's four steppers) at ≥ 1.3:1 with a slow shimmer that respects reduced motion; ke…

#### VIS-14: The Polo mark is a raster crop of a machine-looking concept sheet, not a designed identity: no vector master, a hairline grey pencil loop beside a 740-weight wordmark (the lockup reads «P Polo»), a separately traced favicon that does not match it, and an app icon whose ink covers 14% of the tile in mid-grey

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - design/brand/polo-logo-sheet.jpg — the source sheet carries garbled placeholder text typical of generated imagery («Rachael», «Hab Son», «Nanswowld» on the min…
  - …4 more in `findings.json`
- **Impact:** The icon is what 12 players see on their home screen every day of the trip, and the mark is what the share images carry into every WhatsApp group; both look like a sketc…
- **Recommendation:** Keep the idea (a pencil P) but commission a vector redraw with a small system: a filled/bolder symbol for ≤ 48 px and the app icon (≥ 25–35% coverage, ink or fairway on card stock, a dark/t…

#### VIS-15: The direction's signature devices never shipped: the board «plate» exists only in the style guide (0 product uses), the app icon is not the circled figure, the gold board lockup is unused, and the share image — the one artefact that leaves the app — replaces the pencil notation with tints that invert its colours (red-family tint for zero-point holes, where the app draws red circles for birdies)

**P2** · CONFIRMED · partly fixed (DD-12; HIST counted the share images as done — they use tints, not the notation) · Effort M (under a day)

- **Evidence:**
  - DESIGN_DIRECTION.md:71 «the pencil notation … appears on the scorecard grid, in the "hoy" column, on share images, and in the app icon: a bold figure with a re…
  - …4 more in `findings.json`
- **Impact:** What was supposed to make Polo recognisable — a golf artefact, not «a clean grotesque app» (DESIGN_DIRECTION.md:73) — survives only inside the Tarjeta grid. The TV shows…
- **Recommendation:** Use `Plate` on the TV and Ceremonia for positions and totals (leader in board yellow), put ScoreMark on the player share card (two nines, the same notation as the grid), and decide the icon…

#### VIS-18: Entrar, the first screen every player sees, inverts its hierarchy: 88-px grey initials discs dominate 170-px card tiles while the names are 14 px, every disc is the same grey (three «M», two «R»), «Jugador 12» becomes «J1», and only 9 of 12 players fit on an iPhone 15 Pro

**P2** · CONFIRMED · new (SHOTS-C #20 observed; DA-5.x fixed the old issues) · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/EnterScreen.module.css:20-26 `.face` tile min-height 132 px plus padding; :44-50 `.faceName` --fs-sm (14 px); global.css:457-461 `.avata…
  - …2 more in `findings.json`
- **Impact:** A player opening the link on the course has to read twelve small names under twelve large identical letters to find himself; the biggest thing on the screen carries the…
- **Recommendation:** Make the name the primary element (16–18 px, 600) with a small avatar, or a deterministic tinted monogram per player (distinct hues from a safe palette) when there is no photo; use ruled ro…

#### VIS-19: On a laptop or iPad the player, organizer, wizard, profile and home screens are a 528–560 px phone column: 14 px text centred in 1440 px with ~65% of the screen empty, and the iPad board leaves its right half blank under a full-width tab bar

**P2** · CONFIRMED · still open (DA-3.5, DA-4.5, DA-C.1) · Effort M (under a day)

- **Evidence:**
  - src/app/AppShell.tsx:16 widens only /admin, /tv, /ceremonia, /imprimir; src/app/AppShell.module.css:13 560 px column (HIST measure: wizard <main> 560 px at 144…
  - …2 more in `findings.json`
- **Impact:** Organizers set up tournaments on a laptop (DESIGN_AUDIT §18 «the organizer at the villa on a laptop»), and the villa iPad is a natural second board; both get a shrunken…
- **Recommendation:** Define two more breakpoints: from 900 px give the organizer and wizard a two-column layout (form + live preview of the event header, prize statement and accent), and give En vivo a board +…

#### VIS-20: Small phones (375×667) get a cramped product: the leaderboard starts at 369 px of the 610 px above the tab bar (status, lead-group line, a full-width button, a caution line, the honoree row and the board title first), so 4 of 12 rows show; and the Tarjeta fits 3 of 4 players, with the 4th player's controls peeking through an unbacked 8 px strip under the sticky save bar

**P2** · CONFIRMED · partly fixed (DA-X.hier.1: first row was at ~430 px, now 369 px; DA-9.1 fits on 393×852 but not on 375×667) · Effort S (under 2 h)

- **Evidence:**
  - node $S/panel/evidence/VIS/fold.mjs → se full12-live {firstRowTop: 369, tabTop: 610, fullyVisibleRows: 4}; 15pro {369, 795, 8}; se longnames {369, 610, 4}
  - …3 more in `findings.json`
- **Impact:** The answer to «who leads and where am I» — the 2-second need the audit defined for this screen — needs a scroll on the phones many players carry (SE, mini, older Android…
- **Recommendation:** Collapse the preamble into one line (status · lead hole · live dot) and move «Anotar el hoyo n» into the Tarjeta tab badge or a compact chip beside the status; fold the honoree into the boa…

#### VIS-21: The points race chart is illegible beyond a handful of players: 60 overlapping lines in a 361×280 px plot with a 60-entry legend of 12 cycling colours (each colour means five players), and 12 converging lines on the real field

**P2** · CONFIRMED · still open (DA-12.3) · Effort M (under a day)

- **Evidence:**
  - node $S/panel/evidence/VIS/stats.mjs → large60: chart 361×280, 60 `.recharts-line`, 120 legend nodes; full12-finished: 12 lines, 24 legend nodes
  - …2 more in `findings.json`
- **Impact:** The one data visualisation in the product — meant to replay the tournament at dinner — cannot answer «where was I on hole 14» or «when did the lead change», so it reads…
- **Recommendation:** Draw everyone in a faint neutral and highlight only me, the leader, the honoree and one tapped player in colour, with direct end-of-line labels instead of a legend; cap the default view at…

#### VIS-28: The brand's «one memorable thing» collides with itself in the player sheet: pencil marks are 30 px wide in 25–26 px hole columns, so 17 of 19 adjacent marks overlap by up to 5 px and double squares and circles fuse into each other

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/components/primitives.module.css:414-422 `.mark { width: 30px; height: 30px }`; ScorecardGrid (primitives.tsx:207+) gives nine hole columns what is left af…
  - …3 more in `findings.json`
- **Impact:** The player sheet is opened from every leaderboard row; its scorecard is where the notation is most visible, and at phone width it reads as a smudged row of merged shapes…
- **Recommendation:** Size the mark from the column (e.g. `width: min(30px, 100%)` with the SVG in a square box and the figure at 0.55 of it), or give the grid a minimum column of 30 px and let the nines scroll;…

#### MOT-11: The brief itself: one 150–250 ms scale for everything is right for a phone tap and wrong for the TV and the ceremony — the bid 'pulse' lasts 150 ms on a screen watched from four metres

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - DESIGN_DIRECTION.md:13 'Motion confirms or shows change: 150–250 ms, ease-out'; src/design/motion.test.ts:38-42 enforces 0.15 ≤ every duration ≤ 0.25
  - …2 more in `findings.json`
- **Impact:** Motion on the board surface is under-powered where it matters most (auction, ceremony, lead change on the TV) and the design system gives authors no sanctioned way to do…
- **Recommendation:** Split the motion tokens by surface: phone chrome 150/200/250 ms (keep), board surface ('--dur-board' 400–600 ms, a slower ease-out) and one 'moment' budget (≤ 1.2 s, choreographed, skippabl…

#### MOT-13: The 'ease-out' token is not an ease-out: cubic-bezier(0.2, 0, 0, 1) starts from rest, so the first frame of a 200 ms move covers 10% where a decelerate curve covers 40%

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/styles/tokens.css:117 `--ease: cubic-bezier(0.2, 0, 0, 1)`; src/design/motion.ts:20 'The one curve'; DESIGN_DIRECTION.md:13 and DesignScreen.tsx:174 promis…
  - …2 more in `findings.json`
- **Impact:** Every sheet, toast, row re-sort and board fade spends its first frame nearly still, which reads as a one-frame lag after the tap — small, but it is the texture of the wh…
- **Recommendation:** Use a decelerate curve for entrances and user-initiated moves (e.g. cubic-bezier(0, 0, 0, 1) or (0.05, 0.7, 0.1, 1)), keep the standard curve only for elements moving within the screen, and…

#### MOT-14: The signed-card stamp slams in again every time the grid is opened, not when the card is signed: motion that no longer marks a change

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/ScorecardScreen.tsx:495-505 — `motion.span initial={{ scale: 1.25, opacity: 0, rotate: -14 }} animate=…` with no AnimatePresence initial…
  - …2 more in `findings.json`
- **Impact:** The stamp is meant to make the one irreversible act of the day feel final (the code comment says so); replaying it on every view turns it into decoration and teaches pla…
- **Recommendation:** Animate only on the transition from unsigned to signed (track the previous signed set in a ref, or AnimatePresence initial={false} around the stamp), and render a static stamp otherwise.

#### MOT-19: The feed grows and snaps back by one row on every new event: the dropped tenth item keeps its space for ~300 ms, then vanishes without its exit fade

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/FeedTicker.tsx:37-46 — <AnimatePresence initial={false}> (mode 'sync') with `layout` items; the list is sliced to `limit` (10 on En vivo)
  - …1 more in `findings.json`
- **Impact:** Small but constant: on En vivo the page's bottom edge jumps 44 px down and back on every birdie, lead change and snake pass, which is noticeable when the feed is what yo…
- **Recommendation:** Use `mode="popLayout"` on the feed's AnimatePresence (the exiting item leaves the flow immediately and fades in place) or render limit+1 items with the last one clipped by the container.

#### VIS-16: Red and green carry opposite meanings on different screens: red is a birdie (good) on the scorecard but a debt and an error on Dinero; green is the brand accent, the selected state and «money won» on the Calcutta tab and the share card, while Dinero shows winnings in ink

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - tokens.css:20 `--under` «under par, red by convention … also the only error red»; primitives.module.css:155-157 `.moneyNeg { color: var(--under) }`
  - …3 more in `findings.json`
- **Impact:** A birdie and a debt share one red, and «won money» is green on two screens but black on the money screen itself, so colour cannot be trusted as a quick read — the opposi…
- **Recommendation:** Pick one money language (sign plus ink, and red only for what is owed) and use it on Dinero, Juegos, TV, Ceremonia and the share card; keep green for the brand and selection only. Document…

#### VIS-17: The design system is two systems: the documented primitives `Button`, `TabBar`, `Plate`, `Figure` and `LogoMark` have zero product uses, so the /design style guide shows an ink-bordered secondary button and 40%-opacity disabled state that no screen ships, while 277 screen buttons use global `.btn--*` with a 1.9:1 border, a white fill and a different disabled look; tabs likewise come as boxed pills (29 uses) and as underlines (7)

**P3** · CONFIRMED · partly fixed (DA-A.7: button variants unified in look, not in source) · Effort M (under a day)

- **Evidence:**
  - Usage count (grep "<Name" in src/**/*.tsx outside dev/design and primitives.tsx): Button 0, TabBar 0, Plate 0, Figure 0, LogoMark 0; Segmented 29; global `clas…
  - …3 more in `findings.json`
- **Impact:** Whoever builds the next screen from the style guide produces a different button and a different tab control from the rest of the app, and fixes to one system (e.g. the 3…
- **Recommendation:** Make the primitives the only implementation: have `.btn--*` classes compose from (or be replaced by) `Button`, pick one tab control for in-page navigation and one segmented control for mutu…

#### VIS-22: Every board row carries a boxed tier letter and two-letter Calcutta owner codes («IV CA», «DA JU») under the name, so the sub-line reads as noise to everyone but the owner

**P3** · CONFIRMED · still open (DA-7.2 owner initials) / partly fixed (DA-X.gen.7 tier badges on every row) · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/LiveScreen.tsx:76-81 builds two-letter slices of display names; :254 tier badge on every row; primitives.module.css:369-373 `.owners` le…
  - …1 more in `findings.json`
- **Impact:** The sub-line competes with the money figure it is there to carry; a first-time reader cannot decode «IV CA» at all.
- **Recommendation:** Show owners only in the player sheet or as «dueño: Iván» on the viewer's own lots; show the tier as a column only on boards where tiers matter (Calcutta night), not on every row of every bo…

#### VIS-23: Links have no single look — grey plain text on Home and Juegos (they do not read as links), green 600 ghost buttons, grey underlined legal links, green underlined 18 px links with icons on Más, chevron rows on profiles — and ghost buttons and back chevrons break the 16 px text edge (label at 29 px; the Juegos title jumps from x 16 to x 74 between overview and detail)

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/HomeScreen.module.css:71-78 `.door { color: var(--ink-2); text-decoration: none }`; src/screens/tournament/GamesScreen.module.css:142-149 `.crossLi…
  - …2 more in `findings.json`
- **Impact:** Users cannot tell what is tappable: the Home's three doors to the rest of the product and the Juegos cross-links look like captions.
- **Recommendation:** Define two link styles only (inline text link; navigational row with chevron) in the primitives and use them everywhere; drop the ghost-button-as-link pattern for navigation, and optically…

#### VIS-24: Type details drift from the spec: 19 rules set 11 px text (tab labels, board headers, per-hole points) and the share card 10 px although the direction says «nothing is set below 12 px»; 14 letter-spacing declarations up to 0.4em against «no tracking except 0.04em»; a word («varianza 1.14») set as a figure

**P3** · CONFIRMED · partly fixed (DD-11, DA-1.5) · Effort S (under 2 h)

- **Evidence:**
  - grep -rn 'var(--fs-2xs)' src --include=*.css (excluding dev/design) → 19 (TournamentShell.module.css:58 tab labels, primitives.module.css:297 board head, Score…
  - …5 more in `findings.json`
- **Impact:** Small, grey 11 px labels are the ones players read in sun (tab names, the column headers, the points under each hole); the inconsistencies are small individually but add…
- **Recommendation:** Set the floor at 12 px (13 px for anything read on the course), give codes and PINs one token for their tracking (e.g. 0.08em) and delete the rest, keep words out of figure columns (label +…

#### VIS-25: The printed fallback card, the one screen the audit called «the reference for the app's scorecard», now lags the app's own grid: no Ida/Vuelta subtotals, each card fills only ~55% of its landscape page, and names wrap to 3–4 lines

**P3** · CONFIRMED · still open (DA-17.3) · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/PrintScreen.tsx:65-90 holes 1–18 and one Total column; the app grid has Ida/Vuelta/Total (ScorecardScreen.tsx:369-404)
  - …2 more in `findings.json`
- **Impact:** If the app goes down on the course (RUNBOOK fallback), players add up 18 boxes by hand with no OUT/IN, on a card that wastes half the sheet and has little room to write.
- **Recommendation:** Print Ida/Vuelta/Total columns, one group per page at full width with taller score rows (≥ 12 mm), handicap and pair on one line, and the stroke dots large enough to see in sun; keep ink-on…

#### VIS-26: Juegos' game tabs are a boxed pill strip that scrolls off both edges with no fade or indicator, cutting labels mid-word («ejor ronda», «La Ví»), and the selected tab can sit out of view

**P3** · CONFIRMED · partly fixed (DA-10.1) · Effort S (under 2 h)

- **Evidence:**
  - docs/review/2026-09-30/shots/t_juegos-full12-live-15pro-light-tab-la-calcutta.png (strip starts at «ejor ronda»), docs/review/2026-09-30/shots/t_juegos-full12-…
  - …1 more in `findings.json`
- **Impact:** Six games are hidden behind an invisible horizontal scroll; the clipped words look like a rendering error.
- **Recommendation:** Use the underline tab style with a fade mask at the edges and `scrollIntoView({inline:'center'})` on selection, or replace the strip with the Juegos overview list plus a back chevron (the o…

#### VIS-27: Admin de Polo looks like a different, template product: rounded KPI cards with tracked uppercase eyebrows, full-round filter pills, coloured status chips, middle-dot meta lines and raw ISO dates — every pattern the redesign removed — and its destructive actions («Quitar protección», «Quitar del Comité») are the same green text links as «Agregar al Comité»

**P3** · CONFIRMED · new (a screen added after the audit that reintroduces the patterns DA-X.gen.2/3/7 removed from the product; HIST DA-B.4 note) · Effort M (under a day)

- **Evidence:**
  - src/screens/platform/Platform.module.css:15,75 `text-transform: uppercase` eyebrows (also Profile.module.css:343,433); :224,491 `border-radius: var(--r-round)`…
  - …2 more in `findings.json`
- **Impact:** Only Diego sees it, so the brand cost is small; the risk is the destructive links that look like constructive ones on the screen that can unprotect the real tournament,…
- **Recommendation:** Rebuild the panel from the same primitives (ruled rows, figures right-aligned, sentence-case labels, formatted dates) and give destructive actions the danger treatment everywhere (`btn--dan…

### 6.9 Interaction design and core flows

30 findings: 1 P0 · 4 P1 · 20 P2 · 5 P3.

#### UX-01: Typing in a Comité sheet keeps only the first character; the rest go nowhere or into another field (13 → 1, 10 → 1, "Doce" → "D" + "oce" appended to the name)

**P0** · CONFIRMED · regressed: a defect introduced by the fix for AUD-P2-24 (Sheet focus move and restore, f425068, #28) and worsened by 56459f2 (#48). $S/hist… · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/components/ui.tsx:68-102 — the Sheet effect depends on `onClose`; every caller passes an inline arrow (e.g. AdminPlayers.tsx:240, AdminHandicaps.tsx:113, AdminScores.tsx:292, AdminRounds.tsx:191), so each keystroke that re-renders the parent re-runs the effect: its cleanup calls `opener.current?.focus()` and the re-run focuses the frame (or, w…
  - $S/panel/evidence/UX/probe-sheet-focus2.mjs (human speed, 150 ms/key) → Hándicaps › Editar (Ajuste del Comité): typing "13" leaves Hándicap de juego = "1" and puts "3" in Razón; Tarjetas › hoyo: typing "10" in Golpes leaves "1"; Rondas › Agregar ronda: "12" → "1"; Jugadores › Agregar: "Doce" in Nombre corto → "D", "21.5" in hándicap → "2", and the…
  - $S/panel/evidence/UX/probe-sheet-focus.mjs → editing an existing player: name "Camilo Duarte Ruiz" → "C", hándicap base "17.5" → "1", estimate gross "88" → "8"; focus is on DIV[role=dialog] after every key (on a phone: the keyboard closes after each character)
  - docs/review/2026-09-30/shots/t_admin_jugadores-full12-live-15pro-light-ux-add-typing.png, t_admin_handicaps-full12-live-15pro-light-ux-override-typing.png, t_admin_jugadores-full12-live-15pro-light-ux-estimate-preview.png (estimate reads 8/9/1 → "Hándicap de juego 0, hándicap de campo -40")
- **Verification:** Independent verifier V3: CONFIRMED, P0 (both). On its own merits this is P1: the Comité cannot type any multi-character value into the main console sheets. That covers player names and base handicaps during setup, the Day-2 playing-handicap override, score corrections of 10 or more, and round numbers. On a phone the keyboard drops after every character. The truncated value (1, 2) is plausible, and Save stays enabled, so a hurried Comité can save a wrong handicap… Reproduction: My own Playwright script against my preview (:4203, HEAD build with…
- **Impact:** Every multi-character entry in these sheets is wrong or impossible: a Day-2 playing-handicap override of 13 is saved as 1 (with "3" typed into the reason), a Comité score correction to 10 strokes is saved as 1 (a hole-in-one worth 5+ Stableford points), players get truncated handicaps and corrupted names during setup. These are the Comité flows RUNBOOK §3 and §6 schedule on tournament days; values that look plausible (1, 2) reach the engine and the money.
- **Recommendation:** In Sheet, keep onClose in a ref (`const close = useRef(onClose); close.current = onClose`) and make the effect depend on [open, id] only, so it runs once per open/close; restore focus only when the sheet actually closes. Add a Playwright test that types "Camilo Duarte" and "13" at 100 ms/key into the player, handicap-override and score sheets and asserts the exact values (the current e2e never types into a sheet).

#### MOT-04: On Calcutta night the TV never shows a sale: at the hammer the lot card jumps straight to the next player, and from the 8th lot on the newest sale is appended below the bottom edge of a 1080p screen

**P1** · CONFIRMED · new (no earlier audit or design-audit item on the TV sold list or a sold state; RB-6 'TV shows the auction board' is fixed and unrelated) · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/screens/tournament/TvScreen.tsx:228-230 — `lot = open ?? next`: the moment a lot is sold there is no open lot, so the card shows the next pending player; the bid box renders only `{open && …}` (:250), so the price and the buyer disappear in the same frame
  - src/screens/tournament/TvScreen.tsx:279-289 — the sold list is `.slice(-8)` in sale order, newest LAST; TvScreen.module.css:256-259 `.sold { flex: 1; overflow: hidden }` clips it
  - Dev server on :4196 (same source) with the real store's patch() turning full12-live into auction night (evidence/MOT/dev-tv-auction.mjs): after a synthetic hammer on lot 7 the lot card goes 'Camilo Duarte, $1,000' → 'Lote 8, Damián Escalante' with no bid box in one frame; the pot changes $8,000 → $9,000 with a default spring (scale 1.15 → 0.989 →…
  - evidence/MOT/dev-tv-overflow.mjs at 1920×1080: 7 sold → last row top 1012 / bottom 1066; 8 sold → 8 rows, the newest at top 1066 / bottom 1120 with scrollHeight 1080 (overflow hidden); 11 sold → still the newest at 1066–1120. docs/review/2026-09-30/shots/t_tv-full12-live-tv-board-dev-auction-8sold.png (8 sold, 7 visible, the 8th — the sale just ma…
  - …1 more in `findings.json`
- **Verification:** Independent verifier V13: CONFIRMED, P1 (both). No money is computed wrong and the auctioneer's console keeps the full sold list, so not P0. But §10 specifies the TV board ('Sold list: each player with owner and price', pulse on each bid) and §14 a gavel moment, and the one evening the whole group watches the TV the board never acknowledges a sale and, from the 7th lot on, the newest sale is cut or missing. At 12 lots the TV shows lots 5-10 whole, lot 11 half-cut… Reproduction: Own script, not the author's: Vite dev server on :4213 (config $S/…
- **Impact:** Calcutta night is the one event the whole group watches on the TV, with real money (the first tournament's pot is ~$12,000 MXN). For every lot the room never sees 'sold to X for $Y' on the screen: the card jumps to the next man before anyone reads the price, and for lots 8–12 the sale is not on the TV at all. Disputes about who bought whom, and for how much, get settled from the auctioneer's phone instead of the board everyone trusts.
- **Recommendation:** Add a sold state to AuctionBoard: keep the just-sold lot on the card for ~4 s (or until the auctioneer opens the next lot) with 'Vendido a {owner}, {price}' and a single gavel/stamp motion (reuse the Tarjeta stamp at ~250 ms), then show the next lot. Put the newest sale at the TOP of the sold list (or keep the whole list and scroll it so the newest is visible) and size it to the viewport (show N = what fits). Add a Playwright check on a synthetic auction state at 1920×1080 and 1280×720 that the latest sold row's bounding box is inside the viewport and that 'Vendido' is visible within 500 ms o…

#### UX-02: A second tap on "Guardar hoyo" saves the next hole for all four players with untouched defaults (par, 2 putts)

**P1** · CONFIRMED · new. The auto-advance under the same button dates from the Tarjeta redesign (8f6d868, #15). The earlier audit covered double taps only on t… · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/screens/tournament/ScorecardScreen.tsx:328 — after a save the screen advances (`goto(savedIdx + 1)`) and the same button, in the same place, now saves the next hole; `busy` (l.290/333) only covers the ~50–200 ms of the commit
  - src/screens/tournament/ScorecardScreen.tsx:171 — drafts for an unplayed hole default to par and 2 putts, so the phantom save looks like a plausible all-par hole
  - $S/panel/evidence/UX/probe-doubletap.mjs → two taps on the same spot 120 / 250 / 400 / 700 ms apart: every run went 12 → 14, hole 13 saved as 5/2 for all four players (grid shows 13 played), two toasts "Hoyo 12 guardado", "Hoyo 13 guardado"
  - docs/review/2026-09-30/shots/t_tarjeta-full12-live-15pro-light-ux-doubletap-grid.png — hole 13 filled in for the whole group after a double tap on hole 12
- **Verification:** Independent verifier V3: CONFIRMED, P1 (both). A clear defect in the core scoring flow that a top team would not ship. A second tap on «Guardar hoyo» after the ~120-150 ms commit writes par and 2 putts for all four players on a hole nobody has played. The write syncs everywhere, and the Tarjeta then sits (and reopens) one hole ahead. It is not P0: the phantom values are overwritten if the group notices the hole numeral and enters that hole, the big numeral and a… Reproduction: My own script against my preview (:4203), fixture /t/_/full12-live/…
- **Impact:** A double tap (sun glare, a tap that "didn't take", a few beers) silently writes par and 2 putts for four players on a hole they have not played; it syncs to every phone and the leaderboard, and the Tarjeta then reopens on the hole after it (firstOpen skips the phantom hole), inviting the group to enter hole 13's real scores on the hole-14 screen. Unless someone spots it before signing, Stableford points and fewest-putts money are wrong.
- **Recommendation:** In ScorecardScreen, ignore Save for ~700 ms after the hole changes (a `settledAt` ref set in the hole-change effect) and animate the hole change so the jump is visible; additionally, when every draft on an unplayed hole is untouched and the previous save was <2 s ago, ask once ("¿Todos hicieron par?"). Add a Playwright check that two taps 250 ms apart save exactly one hole.

#### UX-06: After "Crear torneo" nothing guides the organizer to a playable tournament: the "2 días" answer creates no rounds and the Comité has no readiness checklist

**P1** · CONFIRMED · new (related AUD-P1-32 'Iniciar ronda without groups' is now guarded by a toast; no earlier item on onboarding/readiness) · Effort M (under a day) · Scope: platform · Merged: STRAT-04

- **Evidence:**
  - supabase/migrations/0010_admin_safety.sql:686-722 — create_tournament inserts the tournament and its owner only; no rounds, although the wizard asked "¿Cuántos días (rondas)?"
  - src/screens/admin/AdminRounds.tsx:118-120 — rounds are added one at a time by hand ("Agregar ronda"); AdminRounds.tsx:60-64 refuses to start a round without groups (toast only)
  - src/screens/organizer/NewTournamentScreen.tsx:167-181 — the created state says "Después carga jugadores, campo y PIN en el Comité" and links to /admin, which redirects to Torneo (settings tabs)
  - grep -rin "checklist|readiness|nextStep" src → nothing but Dinero's "Quién debe qué": no setup checklist anywhere
  - …4 more in `findings.json`
- **Verification:** Independent verifier V6: CONFIRMED, P1 (platform). Platform core flow: §0.5 makes 'the second tournament needs zero code changes' the acceptance test, and that test is an organizer with no Diego and no RUNBOOK. The wizard asks '¿Cuántos días (rondas)?' and then creates no rounds (a clear defect: an answer is collected and silently not acted on; Rondas then says 'Sin rondas. Agrega el día 1.'), and a fresh tournament produces zero engine flags, so no Comité section e… Reproduction: 1) DB: $S/pg/bootstrap.sh v6_verify; generated the wizard's exa…
- **Impact:** A first-time organizer (the platform promise: "any organizer can create a tournament") lands in a 10–13-tab console and must discover, in order, Jugadores → PIN per player → Campos → Rondas (again: the days they already gave) → tees per round → Grupos → Iniciar. Nothing says what is missing; the Tarjeta just says there are no groups. Players who join by the code the success screen hands out find an empty face grid.
- **Recommendation:** Create round rows from settings.rounds in create_tournament (Día 1..N, no course yet). Add a "Para empezar" checklist at the top of Comité › Torneo (and as a badge) computed from the snapshot: players ≥ 2, every player has a PIN, a course with a card, every round has course/date, tees assigned, groups for the next round; each line links to its section. Hide the join code on the success screen behind "cuando tengas jugadores".

#### UX-21: A debt marked "Pagado" by mistake cannot be un-marked anywhere: one tap, no confirmation, the row disappears

**P1** · CONFIRMED · new · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/screens/tournament/MoneyScreen.tsx:64 — "Quién debe qué" lists only unpaid flows; MoneyScreen.tsx:243 — its button calls toggle(f, true); no call site passes false for entries, Calcutta, buybacks, side pots or bets (grep "toggle(f" → one hit)
  - Only bank payouts get a paid state that toggles back (MoneyScreen.tsx:279); there is no Comité payments section (DESIGN_AUDIT C: "sections.payments exists in i18n with no route")
  - $S/panel/evidence/UX/money-ceremony.json → 21 identical 44-px "Pagado" buttons on a 2,276-px page; the first tap opened no dialog
  - docs/review/2026-09-30/shots/t_dinero-full12-finished-15pro-light-ux-liquidacion.png
- **Verification:** Independent verifier V1: CONFIRMED, P1 (both). One tap makes an irreversible change to the money ledger, with no confirmation, no undo, and nowhere in the app to reverse it. The spec asks for 'Pagado toggles' (§9.6, §10). The mis-marked debt vanishes from the only collection list the banker uses on Calcutta night (16 near-identical rows in the fixture). Once MONEY-01 is fixed and the settlement is driven by paid state, a mis-tap will produce wrong money directly… Reproduction: UI (ui.mjs on my preview :4201; every Supabase request intercepted,…
- **Impact:** On Calcutta night the banker ticks sixteen near-identical rows one-handed; a tap on the wrong row records that someone paid $2,500 or $3,000 who did not, the row vanishes, and nothing in the app can put it back (only a JSON restore of the whole tournament). The final settlement then treats unpaid money as collected.
- **Recommendation:** Show paid debts too (collapsed "Ya pagaron", each with a check that toggles back), give every "Pagado" an undo toast, and label the action "Marcar pagado" (state and action are both "Pagado" today). Test: mark then unmark an entry and a Calcutta purchase.

#### COPY-18: The Tarjeta's two steppers have no visible labels: "Golpes" and "Putts" exist only as aria-labels

**P2** · CONFIRMED · new (the DESIGN_DIRECTION.md:62 mock itself shows "[−] 4 [+] 2" with no words, so the spec is the source) · Effort S (under 2 h)

- **Evidence:**
  - src/components/primitives.tsx:62-76 — Stepper renders `label` only as role=group aria-label and in the ± buttons' aria-labels
  - …2 more in `findings.json`
- **Impact:** The single most-used input, used one-handed in sun by whoever keeps the card: a first-time scorer (or a guest in a Ronda rápida) can put putts in the strokes box; the on…
- **Recommendation:** One header row above the four players ("Golpes", "Putts") aligned to the steppers, or a small caption under each figure on the first row. Keep the aria-labels. Update DESIGN_DIRECTION so th…

#### MOT-02: Saving a hole has no motion at all: the hole number, all four players' values, the button and the toast swap in the same frame, and the swipe between holes has no drag-follow

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - src/screens/tournament/ScorecardScreen.tsx:328 `goto(savedIdx + 1)` → :210-213 `setHole(order[i])`: the hole view re-renders in place; no motion import is used…
  - …3 more in `findings.json`
- **Impact:** Seventy-two times a round the scorer taps the most important button in the app and nothing on screen says 'saved, you are now on the next hole' except a small number cha…
- **Recommendation:** Make the advance visible and directional: on save, slide the hole block out left and the next hole in from the right (150–200 ms, ease-out, x ±24 px + opacity, reduced-motion → cross-fade),…

#### MOT-06: The leaderboard's movement arrow is a 6 px triangle that exists for ~0.55 s after a live re-sort and never after you come back to the board, and it carries no magnitude

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/LiveScreen.tsx:56-74 — the previous order lives in a component ref, arrows are set on a re-sort and cleared by `setTimeout(…, 600)`; a r…
  - …4 more in `findings.json`
- **Impact:** Players check the board between shots — typically right after entering a hole on the Tarjeta, i.e. after a remount — and exactly then the arrows are guaranteed absent. T…
- **Recommendation:** Store the last-seen order per device (tournamentStore or localStorage keyed by tournament and round) and show movement since the player last looked, or since the start of the round as golf…

#### MOT-07: La Víbora has no moment on the Tarjeta: the scorer who passes the snake sees nothing; the one snake slide lives in Juegos › La Víbora and only plays if that screen is open when the change arrives

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/ScorecardScreen.tsx — the only snake references are the threshold (:135) and the tiebreak check (:263-265); no holder, no icon, no anima…
  - …3 more in `findings.json`
- **Impact:** The snake is the side game that changes hands most often during a round ($600 per group per day). The person who just took three putts and the three who escaped it get n…
- **Recommendation:** After a save that changes the group's holder, show it on the Tarjeta: a one-line banner under the hole header ('La víbora pasa a René') with the snake icon sliding from the old holder's row…

#### MOT-09: Sheets and toasts leave in zero frames, and the sheet's grabber cannot be dragged: 32 sheets show a handle that does nothing

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - src/components/ui.tsx:103 `if (!open) return null` — the sheet unmounts with no exit; ui.module.css:19,31 give only an entry (backdrop fadeIn 150 ms, sheet sli…
  - …3 more in `findings.json`
- **Impact:** Every sheet in the app — player breakdown, '¿Cómo se calculó?', tiebreak, sign card, confirmations — pops out of existence, so closing reads like a glitch rather than a…
- **Recommendation:** Wrap Sheet and Toaster in AnimatePresence: exit = reverse of the entry at --dur-fast (sheet y 16 → 0 and opacity, backdrop fade). Make the grabber real: pointer-drag the sheet (translateY f…

#### MOT-10: No haptics anywhere: saving a hole, a birdie, a 3-putt that passes the snake, a wrong PIN and every stepper tap are silent to the hand

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - `grep -rn 'vibrate\|haptic' src api public` → 0 hits
  - …2 more in `findings.json`
- **Impact:** On a sunlit screen the finger is the most reliable feedback channel, and it gets nothing: a missed tap on '+' and a landed tap feel the same, which is how wrong scores g…
- **Recommendation:** Add a tiny `haptic(kind)` helper: `navigator.vibrate?.(8)` for stepper ticks and toggles, `vibrate([12, 40, 12])` on save, a longer pattern on a birdie or a snake pass, `vibrate([30, 60, 30…

#### MOT-12: The most-tapped element on the flagship screen gives no touch feedback: leaderboard rows have no pressed state (tap highlight is off globally) and on a mid-range phone the sheet takes ~200 ms to appear

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/styles/global.css:14 `-webkit-tap-highlight-color: transparent`; src/components/primitives.module.css:280-324 `.leaderRow` has no :active rule (buttons, st…
  - …3 more in `findings.json`
- **Impact:** Players open a rival's card from the board dozens of times a day. On the phones they carry, the tap produces no change for a fifth of a second, then a fade: it feels lik…
- **Recommendation:** Add a pressed state to `.leaderRow`, `.segBtn`, `.pickup` and `.award` (background var(--surface) or the ruled-row tint, applied on :active and on a JS `data-pressed` set at pointerdown so…

#### MOT-16: Switching tabs keeps the previous tab's scroll: from a scrolled En vivo, Dinero opens at its bottom with the bank summary, the title and the view switch above the fold

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - `grep -rn 'ScrollRestoration\|scrollTo' src` → only AdminScores' scrollIntoView; TournamentShell.tsx:66-81 tabs are plain NavLinks inside one window scroll
  - …2 more in `findings.json`
- **Impact:** Every tab change after reading the feed lands the player somewhere in the middle of the next screen with no heading, which reads as a different screen or a broken one; o…
- **Recommendation:** Give each tab its own scroll memory (restore on return, top on first visit), e.g. React Router's <ScrollRestoration getKey={(loc) => loc.pathname} /> in the tournament shell, and scroll to…

#### UX-03: The wizard's review step renders label and value run together ("Nombre del torneoNacho's…", "FormatoStableford") — its CSS classes do not exist

**P2** · CONFIRMED · new (introduced by 1edb42b, PR #50, which added ReviewCard and put its CSS in Setup.module.css) · Effort S (under 2 h) · Scope: platform

- **Evidence:**
  - src/screens/organizer/NewTournamentScreen.tsx:207-212 — uses styles.review, styles.reviewRow, styles.reviewKey, styles.reviewValue
  - …2 more in `findings.json`
- **Impact:** The one screen added so an organizer can read what they are about to create (money included) is the most broken-looking screen of the setup flow; every new organizer see…
- **Recommendation:** Add the four classes to Organizer.module.css (a two-column ruled list: key in ink-2 at fs-sm, value right-aligned or on its own line), and add a CSS-module lint/test that fails when a TSX f…

#### UX-04: The wizard's review omits every module: the "Viaje con Calcutta" template reviews as "Juegos aparte: Ninguno por ahora"

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/organizer/NewTournamentScreen.tsx:196-202 — the review lists `settings.games` only; modules (pairs, snake, bestRound, fewestPutts, auction) are nev…
  - …2 more in `findings.json`
- **Impact:** An organizer who picks the full template cannot see before creating that the Calcutta, Matrimonios, Víbora, Mejor ronda and Menos putts are on (or which prizes they carr…
- **Recommendation:** Build the review lines from the same source as PrizeSummary (one line per enabled module and game with its prize), so the review is the prize statement; test: the calcutta preset review men…

#### UX-05: OS/browser Back on step 2 or 3 leaves the wizard and discards everything typed, with no warning

**P2** · CONFIRMED · still open (audit-2026-09-28 P2 "Wizard: … browser Back leaves the wizard") · Effort S (under 2 h)

- **Evidence:**
  - src/screens/organizer/NewTournamentScreen.tsx:44 — the step is component state, not the URL or history
  - …1 more in `findings.json`
- **Impact:** On Android the back gesture and on iOS the edge swipe are how people go "back a step"; the organizer loses the name, format, field size and money settings and starts ove…
- **Recommendation:** Put the step in the URL (?paso=2) with history.push per step so Back goes one step back, and keep the draft in sessionStorage; confirm before leaving with a dirty draft.

#### UX-08: The snake tiebreak prompt blocks saving the hole: there is no "no sé / que lo decida el Comité", so a group that does not remember must guess or change a putt

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/ScorecardScreen.tsx:263-269 — with 2+ players at the threshold and no answer, save() opens the sheet and returns; closing the sheet (l.6…
  - …3 more in `findings.json`
- **Impact:** The scores for four players are held hostage by a question about who holed out last; with the group already walking to the next tee the realistic outcomes are a coin-fli…
- **Recommendation:** Add a third, quieter option "No sabemos: que decida el Comité" that saves the scores and leaves the tiebreak pending (it already shows in Comité › Tarjetas); show the pending state in the V…

#### UX-09: "Cambiar de jugador" signs the device out of its player immediately: no confirmation and no unsent-scores guard (sign-out has one)

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/MoreScreen.tsx:133-134 — the button calls leave() directly for PIN devices
  - …4 more in `findings.json`
- **Impact:** An accidental tap at the bottom of Más logs the player out mid-round (face + PIN again). If scores were still queued (weak signal), they are pushed after the device lost…
- **Recommendation:** Ask in a ConfirmSheet ("Vas a salir como Nico en este teléfono") and refuse while useOutbox.pending > 0 exactly like signOutSafely; flush first when online.

#### UX-13: Auctioneer console: the chosen bidder stays selected after a bid and the high bidder can outbid himself; "¡Vendido!" sells with no confirmation (spec: "confirm the hammer")

**P2** · CONFIRMED · still open (DESIGN_AUDIT Appendix C "Calcutta … ↶ Deshacer + 🔨 Vendido (no confirm)") · Effort S (under 2 h)

- **Evidence:**
  - src/screens/admin/AdminAuction.tsx:139-148 — bid() never clears `bidder` and never compares it with the current high bidder (bidderId)
  - …3 more in `findings.json`
- **Impact:** At a loud dinner the auctioneer taps "+$250" for the next shout without re-picking: the current high bidder raises himself and pays $250 more; an early or stray "¡Vendid…
- **Recommendation:** Clear the bidder after each bid (or make a tile tap = "this person bids +increment", one tap per bid) and refuse a bid from the current high bidder; put "¡Vendido!" behind a 1-second hold o…

#### UX-15: Sheets close on a backdrop tap, Escape or "Cerrar" and silently discard what was typed (a manual scorecard, a photo-read draft, a player form)

**P2** · CONFIRMED · still open (audit-2026-09-28 P2 "Sheets close on backdrop/Escape and discard the player form or a just-read scorecard draft with no confirm… · Effort S (under 2 h)

- **Evidence:**
  - src/components/ui.tsx:104-110 — the backdrop calls onClose; AdminCourses.tsx:323 onClose={closeDraft} drops the draft; AdminPlayers.tsx:240 drops the form
  - …2 more in `findings.json`
- **Impact:** Ten minutes of typing an 18-hole card (or the Claude read of a photo) is lost to one stray tap on the strip above the sheet.
- **Recommendation:** Give Sheet a `dirty` prop: when true, backdrop/Escape/Cerrar ask "¿Descartar los cambios?"; keep course drafts in sessionStorage until saved.

#### UX-16: Setup forms prefill plausible fake data that passes validation: a blank course is par 4 with SI = hole number, a name-only player gets hándicap 18, the estimate starts at 85/92/100

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/admin/CourseEditor.tsx:42-48 — blankTee(): 18 × par 4, strokeIndex = i+1; validateTee (l.10-18) accepts it (a permutation, par 72)
  - …3 more in `findings.json`
- **Impact:** A rushed organizer saves a course nobody typed or twelve players on 18: every stroke allocation and Stableford point is then computed from invented numbers that look rea…
- **Recommendation:** Start cells and handicaps empty and require them (validation: every hole has par and SI entered; a player needs a handicap before the round starts), or mark untouched defaults visibly ("sin…

#### UX-18: Ceremonia takes 25 taps on the TV page itself and ignores the keyboard and presentation clickers; no phone remote

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - $S/panel/evidence/UX/probe-ceremony.mjs → full12-finished: "Empezar" + 12 × "Revelar" + 12 × "Siguiente" = 25 taps, ≈62 s including a 1.5 s look per reveal; Ar…
  - …2 more in `findings.json`
- **Impact:** The emcee has to stand at a laptop with a mouse (or mirror a phone) and double-tap through every reveal; a presenter clicker, the universal tool for this moment, does no…
- **Recommendation:** Map ArrowRight/Space/PageDown to "reveal, then next" (one control advances the show), ArrowLeft to back; add a phone "control remoto" that drives the TV page over the realtime channel.

#### UX-20: PINs are typed one by one by the organizer and never shown or shared from the app; there is no per-player invite

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - src/screens/admin/AdminPlayers.tsx:158-172, 403-411 — the PIN sheet takes four digits the organizer invents and saves; nothing generates, displays after save,…
  - …2 more in `findings.json`
- **Impact:** Twelve PINs cost ~70 inputs plus twelve hand-written WhatsApp messages, and the organizer must remember every PIN to resend it; a mistyped PIN is only discovered when th…
- **Recommendation:** Generate PINs in bulk ("Generar PINs") and give each player a "Mandar por WhatsApp" row that shares the link plus his PIN (or better, a one-time claim link that needs no PIN).

#### UX-22: An answered "¿Quién embocó al último?" can never be corrected, by the group or the Comité

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/ScorecardScreen.tsx:265-269 — the Tarjeta asks only while the hole has no answer
  - …2 more in `findings.json`
- **Impact:** A thumb that lands on the wrong name decides who carries the snake from that hole on; if nobody 3-putts later, $600 of that group's Víbora is paid on a wrong answer and…
- **Recommendation:** List answered tiebreaks in Comité › Tarjetas (per group and hole, with who answered) with "Cambiar"; show the answer in the Víbora pass history with an edit affordance for the Comité; audit…

#### UX-28: Base handicaps are never locked: the brief locks them before the Calcutta, the RUNBOOK checklist says "bloqueado", but the player sheet edits them any time with no reason

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - CLAUDE.md §5.2 — baseHcp "is entered in the admin and locked before the Calcutta"; RUNBOOK.md:8 — "hándicap base **bloqueado**"
  - …2 more in `findings.json`
- **Impact:** After twelve lots were bought on the strength of each player's handicap, one edit (or a UX-01 typo) changes every playing handicap for both days, and nothing asks why or…
- **Recommendation:** A "Fijar hándicaps" action in Comité (and automatically when the auction opens) after which base changes need a reason, are shown as a caution line on En vivo and in the player sheet, and a…

#### MOT-22: No screen-to-screen motion anywhere, and lazily loaded screens answer a tap with ~0.5 s of nothing then a skeleton flash (Estadísticas: content at 500 ms at 1×, 981 ms at 4×)

**P3** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - `grep -rn 'viewTransition\|startViewTransition' src` → none; drill-downs swap in place: Juegos overview → game (GamesScreen.tsx:101, 136), wizard steps, Más →…
  - …2 more in `findings.json`
- **Impact:** Moving between levels of the app gives no sense of direction (push vs. back), and on a phone in the field the first visit to a secondary screen looks stuck, then flashes…
- **Recommendation:** Use React Router's `viewTransition` on drill-down links with a 200 ms slide/fade pair (reduced motion → cross-fade), keep tab switches instant; prefetch the lazy chunks after first paint (o…

#### TRUST-19: Historial is usable for a dispute only with patience: no filter by player, hole or round, and the detail shows raw column names and UUIDs

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/admin/AdminHistory.tsx:31-44,84-116 — newest-first pages of 50 over the whole tournament, only a «solo admin de Polo» toggle; a 2-day, 12-player ev…
  - …1 more in `findings.json`
- **Impact:** At the dinner, the Comité has to page back through hundreds of lines to find «hoyo 7 de Diego» and then read database column names.
- **Recommendation:** Filters (jugador, ronda, hoyo, solo correcciones) and a per-hole history sheet reachable from the Tarjeta; map keys to Spanish labels (golpes, putts, levantó, capturó) and UUIDs to names.

#### UX-19: Correcting an earlier hole from the Tarjeta drops the scorer on the hole after it, not back where the group is; the snake question for that hole is asked again

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/ScorecardScreen.tsx:328 — every save advances to idx+1, even for a hole that was already played
  - …1 more in `findings.json`
- **Impact:** A mid-round correction costs two extra taps and a moment of "where are we?"; a scorer who does not notice may enter the current hole's scores on hole 10.
- **Recommendation:** After saving a hole that was already played, return to the group's first open hole (firstOpen) and say so in the toast ("Hoyo 9 corregido; seguimos en el 12").

#### UX-24: The Comité section nav scrolls sideways and does not bring the current section into view (Parejas, Calcutta, Datos are off-screen on a phone)

**P3** · CONFIRMED · still open (DESIGN_AUDIT Appendix C AdminLayout: "horizontal scroller … no fade or scroll-into-view") · Effort S (under 2 h)

- **Evidence:**
  - docs/review/2026-09-30/shots/t_admin_parejas-draw12-15pro-light-ux.png and t_admin_calcutta-auction12-15pro-light-ux-console-full.png — the visible tabs end at…
  - …1 more in `findings.json`
- **Impact:** On a phone the Comité cannot see where they are or that 6–8 more sections exist; on Calcutta night the Calcutta tab is two swipes away.
- **Recommendation:** Scroll the active tab into view on mount, add an edge fade, and on phones group sections (Antes / En juego / Después) or use a "Secciones" sheet.

#### UX-25: "Jugar una ronda rápida" on Home goes to sign-in without remembering the intent; after the account exists the user lands in Mi Polo, not the round

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/HomeScreen.tsx:97-102 — both "Entrar a mi perfil" and "Jugar una ronda rápida" link to plain /entrar (no ?next=/ronda)
  - …1 more in `findings.json`
- **Impact:** The cold-start path to a quick round (email, 6-digit code from the mail app, profile name) ends one screen away from where the person asked to go.
- **Recommendation:** Link to /entrar?next=/ronda and keep `next` through the first-time profile editor.

### 6.10 Accessibility

25 findings: 0 P0 · 3 P1 · 15 P2 · 7 P3.

#### A11Y-01: Tarjeta: the 20 score-entry controls of a foursome carry no player name (4× 'Golpes: más', 4× 'Levantó'), the hole number is a bare figure, and point changes are silent

**P1** · CONFIRMED · new (AUD-P2-25/26 touched board rows and target sizes, not the Tarjeta control names) · Effort S (under 2 h) · Scope: platform

- **Evidence:**
  - src/screens/tournament/ScorecardScreen.tsx:566-570 — <Stepper label={S.strokes}> / <Stepper label={S.putts}> / 'Levantó' button: the label is the same for all four players
  - src/components/primitives.tsx:62-76 — Stepper builds aria-label `${label}: menos|más`; its group is aria-label={label}
  - $S/panel/evidence/A11Y/ax-tarjeta-hole.txt — Chromium AX tree: group "Golpes" ×4, button "Golpes: más" ×4, button "Putts: más" ×4, button "Levantó" ×4; hole header is StaticText "12" then "Par 4, SI 2" (no 'Hoyo'); no heading anywhere in the hole view
  - $S/panel/evidence/A11Y/axe-states.json facts[5] 'tarjeta hole view names' — stepButtons list, pickupNames ['Levantó'×4]
  - …1 more in `findings.json`
- **Verification:** Independent verifier V8: CONFIRMED, P1 (platform). This is the only score-entry flow (§9.3). The visual grouping of a player's name with his controls is not exposed to assistive tech (WCAG 1.3.1 / 2.4.6, level A/AA). Voice Control and control-by-control navigation hit four identical targets per label, and a change is announced as a bare figure. A top company's accessibility review would block it, and the fix is small, so P1 for the platform. It does not bite the fir… Reproduction: Own CDP probe $S/verify/evidence/V8/ax.mjs (Accessibility.getFu…
- **Impact:** A blind or low-vision player (VoiceOver/TalkBack) or a Voice Control user entering the hole for his group cannot tell which of four identical 'Golpes: más' buttons belongs to Camilo; Voice Control 'toca Golpes más' matches four targets; after a tap he hears only '5', never whose score or the resulting points; after 'Guardar hoyo' nothing says which hole he is now on. This is the product's core flow (§9.3) and the only way to score.
- **Recommendation:** Wrap each player row in role=group aria-labelledby=<player-name id>; pass label={`${S.strokes} de ${p.displayName}`} (and 'Levantó, Camilo'); render the hole header as an <h1> 'Hoyo 12, par 4, índice 2' and move focus to it (or announce it) after save; announce '5 golpes, 2 pts, bogey neto, Camilo' via one polite live region. Test: Playwright on /t/_/full12-live/tarjeta asserting every button name on the page is unique and contains a player name (getByRole('button', { name: 'Golpes de Camilo: más' })).

#### A11Y-02: Player sheet (opened from every leaderboard row) has no close button and is announced as the generic 'Ventana'

**P1** · CONFIRMED · partly fixed (AUD-P2-24: sheets now have a fallback name 'Ventana', focus moves in and back; the player sheet still has no close control or… · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/screens/tournament/PlayerSheet.tsx:70 — <Sheet open={!!playerId} onClose={onClose} wide> is the only one of 31 <Sheet> uses without a title (grep '<Sheet ' src | grep -v title=)
  - src/components/ui.tsx:43-53 — aria-label={title ?? t.common.dialog}; the head with the 'Cerrar' button renders only when title is set
  - $S/panel/evidence/A11Y/axe-states.json facts[0]: dialogs=[{name:'Ventana', modal:'true', hasClose:false, buttons:['¿Cómo se calculó?','Hoyo 1','Hoyo 2',…]}]
  - ui.tsx:105 — the backdrop that closes it is role=presentation (not in the accessibility tree, not focusable)
  - …1 more in `findings.json`
- **Verification:** Independent verifier V8: CONFIRMED, P1 (both). This is the most-opened sheet (every row of En vivo, Juegos and Stats). A screen-reader user lands in a modal named 'Ventana' with 39 controls and nothing that closes it. On a phone, sighted users have no close button, no working drag and no Escape; only a strip at the very top of the screen closes it. A top company would not ship that, and the fix is S. It could be P0 if a device shows that taps under the iOS statu… Reproduction: Own CDP probe $S/verify/evidence/V8/ax.mjs (log ax.log): after tapp…
- **Impact:** On a phone there is no Escape key. A VoiceOver/TalkBack user who taps any row of En vivo, Juegos or Stats lands in a modal named 'Ventana' with 30+ hole buttons and no way to dismiss it except gestures that navigate back in history (losing the screen). Sighted users must aim for the thin backdrop strip above a 92dvh sheet. This is the most-opened sheet in the app.
- **Recommendation:** Give PlayerSheet title={p.fullName} (the head then renders 'Cerrar'), or make Sheet always render a close button; name dialogs with aria-labelledby on the visible h2. Test: e2e asserting getByRole('dialog', { name: <player> }) has a 'Cerrar' button.

#### A11Y-04: Ceremonia: the 'Siguiente' button is near-white text on a white button (1.1:1), unreadable for the whole ceremony

**P1** · CONFIRMED · new (introduced by the redesign, d033e38; not in docs/audit-2026-09-28.md or DESIGN_AUDIT §16, where DA-16.4 fixed a different contrast iss… · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - axe color-contrast (serious) on /t/_/full12-live/ceremonia: .btn--secondary 'Siguiente' fg #f6f3ea bg #ffffff ratio 1.1 ($S/panel/evidence/A11Y/axe-fixtures.json)
  - src/screens/tournament/CeremonyScreen.module.css:155-158 — .footer :global(.btn--secondary) sets color: var(--board-ink) but leaves the background
  - src/styles/global.css:212-216 — .btn--secondary { background: var(--surface-2) /* #ffffff */ }
  - docs/review/2026-09-30/shots/t_ceremonia-full12-live-15pro-light-a11y-focus.png — blank white box bottom right
  - …1 more in `findings.json`
- **Verification:** Independent verifier V8: CONFIRMED, P1 (both). This is the only forward control after each of the 12 reveals of the ceremony (§9.10), the showpiece screen at the final dinner, often on the TV. Its label is at 1.11:1 (WCAG 1.4.3 needs 4.5:1) and renders as a blank white box. The control still works, and its position (opposite a legible 'Anterior', with '1 / 12' between them) lets an operator guess it, so not P0. But a blank primary control on the brand moment is… Reproduction: Own script $S/verify/evidence/V8/ceremony.mjs on my server (:4208),…
- **Impact:** At the final dinner the Comité member running the reveals (§9.10) sees an empty white box as the only 'next' control, on the phone and mirrored on the TV in front of the whole group; anyone who does not already know it says 'Siguiente' cannot read it.
- **Recommendation:** `.footer :global(.btn--secondary) { background: transparent; }` (or --board-surface). Add an axe color-contrast check over /tv, /ceremonia and every sheet to the e2e smoke so compositions, not just tokens, are tested.

#### A11Y-03: Sheets do not trap focus: Tab walks out of an aria-modal dialog into the page and tab bar behind it

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 P2 Accessibility: 'Sheet has no focus move, restore or trap; nested sheets share one Escape' → move, restore… · Effort S (under 2 h)

- **Evidence:**
  - src/components/ui.tsx:64-111 — focus moves to the frame on open and back to the opener on close; no keydown Tab handling, no inert on the background
  - …2 more in `findings.json`
- **Impact:** Keyboard and switch-access users (organizers on a laptop, players with a BT keyboard) tab out of a confirm sheet into controls that are visually covered, and can activat…
- **Recommendation:** Set `inert` on the app root while a sheet is open (sheets render inside #root today, so portal them to document.body first), or use <dialog>.showModal(), which traps and inerts natively. Te…

#### A11Y-05: Form-control boundaries and the switch 'off' state fail WCAG 1.4.11 (1.9:1): fields, steppers, segmented controls and switches are outlined too faintly, worse in sun

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/styles/tokens.css:16,107 — --rule-2 #bdb9ac, --control-border: 1.5px solid var(--rule-2)
  - …4 more in `findings.json`
- **Impact:** The PIN field on Entrar, the join-code field, every Comité and wizard field (white on white inside sheets), the stepper frames and the segmented options are outlined by…
- **Recommendation:** Darken --rule-2 to ≥3:1 on both --bg and --surface-2 (e.g. #8a8579 ≈ 3.4:1) or give fields a 3:1 bottom border; draw the toggle off state with a 3:1 outline and an ink knob. Add non-text pa…

#### A11Y-06: Keyboard focus is hidden behind the sticky tab bar (WCAG 2.2 2.4.11): 24 of 40 focus stops on a 60-player board are fully covered

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - $S/panel/evidence/A11Y/keyboard.json 'En vivo large60': rows 14.º…37.º focused with elementFromPoint at top/centre/bottom all returning the tab bar link (cover…
  - …3 more in `findings.json`
- **Impact:** Keyboard, switch-access and desktop screen-reader users (organizers on a laptop, a player with a BT keyboard) cannot see which row or button has focus below the fold; pr…
- **Recommendation:** In global.css: html { scroll-padding-bottom: calc(56px + var(--safe-bottom) + 8px); scroll-padding-top: <sticky header height>; } and extra padding on the Tarjeta (save bar). Test: Playwrig…

#### A11Y-07: At 200% text the core screens break: board headers overlap, segmented options and tab labels clip, Dinero pushes 'Por asignar $3,000' off-screen and truncates every 'Pagó/recibe'

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - docs/review/2026-09-30/shots/t-full12-live-15pro-light-a11y-text200.png — header 'HOY HOYO PUNTOS' overlaps ('HOYHOYOPUNTOS'), 'Puntos | G…' clipped, tab-bar l…
  - …5 more in `findings.json`
- **Impact:** Low-vision golfers who enlarge text (browser text zoom, desktop zoom, Android font scale) lose money figures on Dinero and the column meaning on the leaderboard (WCAG 1.…
- **Recommendation:** Size board tracks in em (e.g. 2em 1fr 2.6em 2.4em 4.6em), let the tab bar grow with its text, allow sub-lines to wrap to two lines above a text-size threshold (container query on the row),…

#### A11Y-08: The installed PWA ignores the phone's text-size setting (no Dynamic Type), so enlarging text is impossible on iPhone except by pinch-zoom

**P2** · PLAUSIBLE · new · Effort M (under a day)

- **Evidence:**
  - grep -rn 'apple-system-body' src index.html → no matches; root font size is the UA default 16px and every size is a fixed rem (src/styles/tokens.css:67-75)
  - …2 more in `findings.json`
- **Impact:** Older or low-vision players who set Larger Text on their iPhone get the same 14 px secondary text and 11-12 px labels in Polo; the only escape is pinch-zoom, which does…
- **Recommendation:** html { font: -apple-system-body; } with a clamp on the resulting root size (e.g. font-size: clamp(16px, 1rem, 24px) after reading it), then fix A11Y-07 so the layout survives. Confirm on a…

#### A11Y-09: The promised AAA (7:1) for scores and money is not met: 'my row' figures 6.35:1, pre-entry points 5.58:1, picked-up 'L' 5.58:1, grid subtotal points 6.60:1, 'Por asignar $3,000' 5.67:1; token docs overstate ratios

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - axe color-contrast-enhanced ($S/panel/evidence/A11Y/axe-aaa.json): En vivo my-row .today/.thru #4f5751 on #e6efe8 6.35:1 (14 px); large60 my-row .pos 6.35:1; T…
  - …5 more in `findings.json`
- **Impact:** The row each player reads most — his own, tinted — carries the day's points and holes at the lowest contrast on the board; under a 0.25 glare model it drops to 2.9:1. Th…
- **Recommendation:** Figures always in --ink/--under/--over (keep --ink-2 for labels); on the my-row tint use --ink for today/thru/pos; render 'L' and untouched points in --ink-2 at least; fix the token comment…

#### A11Y-10: Scorecard grids hide the score from assistive tech: the pencil mark's aria-label on a plain span replaces or loses the gross figure, rows have no headers, hole buttons are named only 'Hoyo 5' or '5'

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 P2 Copy: 'English aria-labels on score marks' → now Spanish, but still on a generic span) · Effort M (under a day)

- **Evidence:**
  - src/components/primitives.tsx:182-195 — <span aria-label={markName}> with no role around the SVG (aria-hidden) and the figure
  - …4 more in `findings.json`
- **Impact:** A TalkBack user reading the grid hears 'doble bogey o peor, 1' but never that the player took 7; a VoiceOver user (which ignores aria-label on generic spans) hears '7 1'…
- **Recommendation:** Render the mark as <span role="img" aria-label="7, doble bogey">; make the hole cell <th scope="row">; add visually hidden units ('pts', 'golpes'); hole buttons named 'Hoyo 5: 7 golpes, dob…

#### A11Y-11: Leaderboard row names drop what the row shows: the 'si terminara ahora' money, tier, Calcutta owners, movement, the honoree and 'this is me'; the figure has no unit

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 P2 Accessibility: 'Board rows are buttons whose name is a concatenation of figures' → now a composed label,… · Effort S (under 2 h)

- **Evidence:**
  - src/components/primitives.tsx:138 — aria-label={t.live.rowLabel(pos, name, figure, today, thru)} overrides the content; src/i18n/es-MX.ts:1160 rowLabel ends wi…
  - …2 more in `findings.json`
- **Impact:** A blind player cannot hear the money column §2 promises next to each name, cannot find his own row among 12–60, and hears '60' without knowing it is points (or 'E'/'F' l…
- **Recommendation:** Extend rowLabel: '1.º, Camilo (tú), categoría A, 60 puntos, hoy 25, hoyo 11, ganaría $12,200, dueños IV y CA, sube 2'; spell 'F' as 'terminó' and 'E' as 'par' for speech. Unit-test rowLabel.

#### A11Y-12: Focus is dropped to <body> whenever a view swaps in place: Juegos open/back, every wizard step, the Tarjeta's last hole, Entrar 'No soy yo'

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - $S/panel/evidence/A11Y/keyboard.json — juegosAfterOpen {tag:'BODY'}, juegosAfterBack {tag:'BODY'}; tarjetaAtLastHole {tag:'BODY'} (the focused 'Hoyo siguiente'…
  - …3 more in `findings.json`
- **Impact:** Keyboard and screen-reader users are thrown to the top of the document (VoiceOver: to nowhere) after each step of the wizard, each game they open in Juegos and at the en…
- **Recommendation:** After any in-place view change move focus to the new view's heading (h1/h2 with tabIndex=-1): Juegos detail h1, wizard step heading, Tarjeta hole header; never disable the focused control w…

#### A11Y-13: Route changes are silent: every screen is titled 'Polo', focus stays on the tab link, and En vivo, Tarjeta, Entrar, Inicio and the 404 have no h1

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - index.html:21 <title>Polo</title>; grep -rn 'document.title' src → no matches (every AX tree root is RootWebArea "Polo")
  - …3 more in `findings.json`
- **Impact:** WCAG 2.4.2 Page Titled (A): the app switcher, history and screen readers say 'Polo' for every screen; after tapping 'Juegos' a VoiceOver user hears nothing and must hunt…
- **Recommendation:** A small RouteAnnouncer: set document.title per route ('Tarjeta · Nacho's Bachelor Invitational · Polo'), move focus to the screen's h1 (tabIndex=-1) on navigation; make EventName an h1 on E…

#### A11Y-14: Errors and status changes are not announced: wrong-PIN error is plain text, the Tarjeta sync chip is not a live region, the toast region mounts only with its first toast, and 'Deshacer' vanishes after 6 s

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/EnterScreen.tsx:187-206 — on a wrong PIN the field is cleared and `{error && <p className="error">}` appears: no role=alert, no aria-des…
  - …4 more in `findings.json`
- **Impact:** A screen-reader user who mistypes a PIN hears the digits disappear and nothing else; the 'Hoyo 7 guardado' confirmation and the only undo for a wrong save may never be s…
- **Recommendation:** Keep one always-mounted polite region (and one assertive for errors) in AppShell; role=alert + aria-describedby + aria-invalid for field errors; make the sync chip role=status; keep undo av…

#### A11Y-15: The focus ring disappears on board surfaces (TV, Ceremonia, deep cards): ink outline on board green is 1.12:1

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/styles/global.css:261-264 and src/components/primitives.module.css:75-84 — :focus-visible outline 2px var(--ink) everywhere
  - …2 more in `findings.json`
- **Impact:** The ceremony and the TV board are the screens most likely driven from a laptop keyboard or a presentation clicker; the operator cannot see which control is focused (2.4.…
- **Recommendation:** Scope a board ring: .card--deep :focus-visible, [data-surface=board] :focus-visible { outline-color: var(--board-accent) } (8.7:1). Add the pair to tokens.test.ts.

#### A11Y-16: Touch targets below the product's own promise: the '¿Cómo se calculó?' trigger is forced to 36 px on phones, Hándicaps '?' 35×36, Stats winners and profile badges 36 px, Comité day tabs 40×40; the 48 px of §9 became 44 px

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 P2 Accessibility: 'Targets: .btn--sm 36 px…, hole and grid cells 36 px' → coarse-pointer .btn--sm is now 44,… · Effort S (under 2 h) · Merged: UX-10

- **Evidence:**
  - src/components/HowCalculated.module.css:1-3 — .trigger { min-height: 36px } loads after global.css:241-245 (coarse .btn--sm 44 px) and wins at equal specificity
  - …7 more in `findings.json`
- **Impact:** The explanation button that backs 'zero disputes' is the smallest control on the money screens; players in gloves, one-handed, in a cart, miss it or hit the neighbouring…
- **Recommendation:** Set --tap to 48px for (pointer: coarse); delete .trigger's min-height; move legacy .segmented to the primitive; make the grid hole buttons ≥44 wide. A Playwright check measuring all interac…

#### A11Y-17: Fake tabs remain: Juegos' tablist has no panels, aria-controls or arrow keys, and the Comité has 8 legacy role=tablist controls — one of them changes the tournament's status when a 'tab' is selected

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 P2 Accessibility 'Segmented is a fake tablist for view toggles' and DESIGN_AUDIT C.4 #8 'role=tab without pa… · Effort M (under a day)

- **Evidence:**
  - $S/panel/evidence/A11Y/axe-states.json facts 'juegos tablist semantics': {count:6, controls:0, tabindexMinus:0, panels:0}; primitives.tsx:80-90
  - …4 more in `findings.json`
- **Impact:** Screen-reader users are told 'pestaña 2 de 6' with nothing associated, arrow keys do nothing, and on Comité › Torneo 'pestaña Terminado' is actually a destructive state…
- **Recommendation:** Use the Segmented radiogroup for choices (day, buyback %, status — status behind a ConfirmSheet), and a real APG tabs pattern (aria-controls, role=tabpanel, roving tabindex, arrow keys) or…

#### A11Y-19: No high-contrast or outdoor accommodation: no prefers-contrast or forced-colors rules; in forced colors the selected option, the active tab and 'my row' vanish; secondary ink falls to ~3.2:1 under glare

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - grep -rn 'prefers-contrast\|forced-colors' src → 0 matches
  - …4 more in `findings.json`
- **Impact:** The product is 'designed for sunlight' but offers nothing when the sun wins: low-vision players who turn on Increase Contrast / high-contrast themes get no stronger pale…
- **Recommendation:** A 'Modo sol' token set, also applied under @media (prefers-contrast: more): ink-2 → ink, rule-2 → ink at 2 px, figures one weight heavier, stroke dots as a number ('2 golpes'); @media (forc…

#### A11Y-20: Stats race chart: an unnamed, focusable role=application SVG, 12 players separated by colour alone, no text alternative; hole-difficulty values only in title attributes

**P3** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - $S/panel/evidence/A11Y/ax3.mjs output — chart svg {role:'application', tabindex:'0', aria-label:null, title:'', desc:'', lines:12}
  - …2 more in `findings.json`
- **Impact:** Screen-reader users hit an unnamed 'application' tab stop that switches VoiceOver/NVDA into focus mode; colour-blind users cannot follow one of 12 lines (§9.7's race cha…
- **Recommendation:** Give the chart role=img with a generated summary ('Camilo lideró desde el hoyo 23; Leonel subió 5 lugares el día 2') plus a 'Ver como tabla' toggle; highlight a chosen player (tap in legend…

#### A11Y-21: TV mode auto-rotates boards every 12 s with no way to pause (WCAG 2.2.2), also under reduced motion

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/TvScreen.tsx:41-45 — setInterval(…, 12000) with no pause state, no key or tap handler
  - …1 more in `findings.json`
- **Impact:** People reading the Calcutta table or the pairs board on the villa TV (slower readers, low vision at distance) lose the board mid-read with no control; the TV route is al…
- **Recommendation:** Tap/Space pauses and shows 'En pausa'; arrow keys step boards; keep rotating by default for the unattended TV.

#### A11Y-22: Speech output reads abbreviations and letters literally: 'SI' (spoken 'sí'), 'hoyo F', 'E', 'L', '•'; key radiogroups are unnamed

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - $S/panel/evidence/A11Y/ax-tarjeta-hole.txt — 'Par 4, SI 2' (Spanish TTS reads 'sí 2'); stroke dots are StaticText '•'/'••'
  - …3 more in `findings.json`
- **Impact:** VoiceOver users hear 'Par cuatro, sí dos', 'hoyo efe', 'e'; they need to learn the app's private shorthand that sighted users decode from layout.
- **Recommendation:** Wrap abbreviations: <abbr title='índice de hándicap'>SI</abbr> plus aria-label on the containing text ('Par 4, índice 2'); rowLabel speaks 'terminó' and 'par'; pass label to every Segmented.

#### A11Y-23: Entrar (player PIN flow): face buttons read 'Diego A. A' (tier glued to the name), the honoree ring is silent, the screen has no h1

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - $S/panel/evidence/A11Y/ensayo.mjs output (real /t/ensayo, read-only) — face names 'Andrés A', 'Diego A. A', 'Jugador 12 D'; headings: only 'H2 Elige tu nombre'
  - …3 more in `findings.json`
- **Impact:** The very first screen every player sees reads names with stray letters and gives no top heading to orient on; minor friction, repeated by every screen-reader user on day…
- **Recommendation:** aria-label `${displayName}, categoría ${tier}` (and ', el novio' when honoree); EventName as h1 on Entrar.

#### A11Y-24: Form fields put hint and error text inside the <label>, so they become part of the field's name; aria-invalid and aria-describedby are used nowhere

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/components/primitives.tsx:30-38 — Field renders <label> containing the label span, the control, the hint and the error
  - …1 more in `findings.json`
- **Impact:** Screen readers announce each field as one long run-on name ('Nombre del torneo Así aparece en la pantalla de inicio…'), and an invalid field is never marked invalid, so…
- **Recommendation:** Field: <label htmlFor> around the label text only; hint and error by id via aria-describedby; aria-invalid when error; role=alert on the error text.

#### A11Y-25: '¿Cómo se calculó?' buttons labelled only with an amount ('$6,600') or '?', and printed cards carry empty table headers

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/components/HowCalculated.tsx:31-35 — the button's name is `label` when given; GamesScreen.tsx (Calcutta slots) and PlayerSheet.tsx:156 pass formatMoney(amo…
  - …1 more in `findings.json`
- **Impact:** A screen-reader user hears '$6,600, botón' with no hint that it explains the figure — the feature behind 'zero disputes' is undiscoverable without sight.
- **Recommendation:** aria-label `${label}: ¿cómo se calculó?` on the trigger; visually hidden text in the empty <th>.

#### MOT-15: Reduced motion is honoured almost everywhere now; the exceptions are the Comité's smooth scroll, the TV's 20 px jump and 12 s rotation, and the race replay

**P3** · CONFIRMED · partly fixed (docs/audit-2026-09-28.md:89 'No MotionConfig reducedMotion="user"') · Effort S (under 2 h)

- **Evidence:**
  - Fixed: src/main.tsx:32 `<MotionConfig reducedMotion="user">`; tokens.css:120-126 sets --dur* to 0 ms; ui.module.css:104-108 stops the skeleton shimmer; confett…
  - …2 more in `findings.json`
- **Impact:** Small: a vestibular-sensitive organizer still gets a smooth scroll on the Comité's busiest screen and a jumping TV board; everything on the player's phone is correct.
- **Recommendation:** Use `behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'` (one helper), drop the y offset from the TV board transition under reduce (useReducedMotion → opac…

### 6.11 Copy and voice (es-MX)

19 findings: 0 P0 · 2 P1 · 13 P2 · 4 P3.

#### COPY-04: Raw technical errors reach players on the field paths: "TypeError: Failed to fetch" under the PIN and in the tournament gate; ~90 UI sites print error.message

**P1** · CONFIRMED · still open / partly fixed (audit-2026-09-28 P2-2 and DESIGN_AUDIT 'Loading, empty, error' raw error text: the outbox copy was mapped, api.t… · Effort M (under a day) · Scope: both · Merged: ARCH-12, UX-14

- **Evidence:**
  - docs/review/2026-09-30/shots/t_entrar-ensayo-15pro-light-copy-rawerror.png — Entrar, claim request dropped: red "TypeError: Failed to fetch" under "Tu PIN"
  - docs/review/2026-09-30/shots/t_gate-ensayo-15pro-light-copy-rawerror.png — tournament gate, lookup dropped while the phone reports online: "Algo salió mal / TypeError: Failed to fetch / Reintentar"
  - src/screens/tournament/EnterScreen.tsx:55,77; src/screens/tournament/TournamentGate.tsx:120; src/components/ui.tsx:132-143 (ErrorBox prints the message verbatim)
  - src/data/api.ts:18-25 — unwrap/rpc throw ApiError(res.error.message): PostgREST/RLS text such as "new row violates row-level security policy…" passes straight through; api.ts:9 promises screens will map 23505/42501/22023 but only AdminRounds.tsx:53 maps one code
  - …9 more in `findings.json`
- **Verification:** Independent verifier V7: CONFIRMED, P1 (both). Reproduced on the real Entrar and gate screens: a player gets red English developer text («TypeError: Failed to fetch») with no next step, and with real loss of signal the app's own banner simultaneously says «Sin señal. Se guarda en el teléfono.» although the PIN attempt was not saved. Raw exception text on the sign-in screen is a clear defect a top company would not ship; 90 more sites print raw errors to organize… Reproduction: Own server on :4207 (dist-design), own script verify/evidence/V7/co…
- **Impact:** Patchy 4G on the course is the defining condition. A player who types his PIN as signal drops gets English developer text and no next step (on iPhone Safari the string is "TypeError: Load failed"). Organizers get RLS and constraint messages in English from every Comité mutation.
- **Recommendation:** One `humanError(e)` in src/lib (network → "Sin señal. Tu PIN no se envió; vuelve a intentar en cuanto tengas señal."; 42501 → "No tienes permiso para esto. Pídeselo al Comité."; 23505 → per-context; timeout → "El servidor no respondió…"; unknown → t.common.error + code for support). Route every toast/ErrorBox/inline error through it; lint rule banning `e.message` in src/screens. Unit-test the mapper with the real strings: "TypeError: Failed to fetch", "TypeError: Load failed", PostgREST 42501/23505 bodies.

#### COPY-24: Regressed: the copy rules drift back: hard-coded " y "/" & " joins, 39 middle-dot separators, "→" arrows, and banned terms ("eagle", "pozo" for the snake pot, "score", "slot")

**P1** · CONFIRMED · regressed (AUD-P2-20, DA-B.2, DA-A.5, DA-B.5) · Effort S (under 2 h) · Merged: COPY-22

- **Evidence:**
  - Middle dots: 12 in es-MX.ts (all Admin de Polo + bannerProtected "Protegido · solo lectura") and 27 outside i18n, incl. player-facing src/engine/formats/stableford.ts:25 (Reglamento) and src/engine/games/match/index.ts:185 ("después de 9 · presión desde el 4: Empate"), GameBoardView.tsx:84, TvScreen.tsx:206, AdminHistory.tsx:70,92,121
  - Arrows: GameBoardView.tsx:66 "Camilo → Damián" in a game's money list (Dinero says "paga a"); es-MX.ts:1341 and :1771 ("12 jugadores → 3 equipos"); "›" in es-MX.ts:1767 "Comité › Torneo › Reglas"
  - Quotes: «» in es-MX.ts:311,352,490,1858 but straight quotes in :612, :869, :1094-1095, :1560
  - Ordinals: "1.º" from ordinal() (es-MX.ts:10-15, :913) vs "1º" in :646-647, :1932, :1940, :1957, :1975 and engine labels ("Individual, 1º")
  - …4 more in `findings.json`
- **Chair:** P1 by the brief's regression rule (AUD-P2-20 was P2). Re-checked independently by two agents: the history mapper found AUD-P2-20, DA-B.2, DA-A.5 and DA-B.5 regressed with file:line evidence, and the copy panelist counted the same drift (COPY-22, COPY-24). The fix is a string pass plus a copy-lint test.
- **Impact:** Individually nits; together they are why the product reads as assembled rather than written, which is what the redesign set out to fix.
- **Recommendation:** Finish the copy pass with a test: fail on " · ", "→", "›", straight double quotes and /\dº/ in es-MX.ts and in engine `why`/label output from the golden fixtures; format negatives with the existing true-minus helper.

#### COPY-03: Dinero says "Pagó $X" for money that has not been paid: the figure is total obligations, including live bet losses; the WhatsApp settlement text repeats it

**P2** · CONFIRMED · new: DA-11.3 (fixed) changed only the format of this line (middle dots to 'Pagó $6,000, recibe $16,000'), not its meaning. · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - src/engine/core/money.ts:204-213 — `m.paid += f.amount` for every outgoing flow (entry, Calcutta, buyback, side pot, bet) regardless of `f.paid`
  - …4 more in `findings.json`
- **Impact:** The word that decides trust is wrong. A player sees "Pagó $4,750" and believes the bank has his money; the banker sees the same line and cannot tell who has paid. The sh…
- **Recommendation:** Rename the figure to what it is: "Pone $4,750, cobra $8,200" (or "Aporta / Recibe"), and show actual payment state separately ("Debe $2,000" in caution until the checklist is clear). Same i…

#### COPY-07: The settlement's mark-as-paid button reads "Pagado" on every unpaid debt; paid and unpaid states share the same word (and the same accessible name)

**P2** · CONFIRMED · new · Effort S (under 2 h) · Merged: A11Y-18

- **Evidence:**
  - src/screens/tournament/MoneyScreen.tsx:243-244 — each unpaid row in "Quién debe qué" renders a secondary button whose text is t.moneyScreen.markPaid = "Pagado"
  - …6 more in `findings.json`
- **Impact:** The Comité reads Liquidación at the villa to know who still owes; every outstanding row ends in the word "Pagado". A glance (or a screen-reader user) cannot tell settled…
- **Recommendation:** Action label "Marcar pagado" on unpaid rows; state "Pagado" with the check (and aria-pressed=true) on paid rows, with "Desmarcar" in the accessible name. Put the outstanding count in the se…

#### COPY-09: "Por asignar: $2,400" in red on a finished tournament with no word on what the money is or what to do (it is La Víbora held by 4 unanswered tiebreaks)

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - src/screens/tournament/MoneyScreen.tsx:101 — verdict = bankOk or bankPending(difference) only; :138 the "Provisional" note is hidden once tournamentFinal
  - …3 more in `findings.json`
- **Impact:** At the final settlement the one alarming figure has no explanation; the banker cannot tell whether money is missing, owed, or waiting on a Comité answer, and players see…
- **Recommendation:** Explain the gap where it is shown: list its parts from the engine ("$2,400 de La Víbora: faltan 4 respuestas de «¿Quién embocó al último?»", "$1,600 de la Calcutta sin dueño: decide el Comi…

#### COPY-10: Tarjeta shows "4 pts, águila neto" (wrong gender) and, before anything is entered, announces "birdie neto"/"águila neto" for every player from the default values

**P2** · CONFIRMED · still open (audit-2026-09-28 P2 "The Tarjeta shows «3 pts, birdie neto» … for unsaved default values"); gender error is new (introduced by… · Effort S (under 2 h) · Merged: UX-26

- **Evidence:**
  - src/screens/tournament/ScorecardScreen.tsx:39 — scoreNameEs = netScoreName(pts).replace("eagle", "águila") → "águila neto"; águila is feminine (the feed says "…
  - …5 more in `findings.json`
- **Impact:** The most-used screen misgenders the best score a player can make and, on every stroke hole, tells four people they made birdie or eagle before they type anything; a tire…
- **Recommendation:** Move Spanish score names into i18n (t.card.netName by points: "doble bogey neto o peor", "bogey neto", "par neto", "birdie neto", "águila neta", "albatros neto") and delete the replace(). S…

#### COPY-11: The Reglamento is not true to the tournament's settings: it describes a Calcutta dinner, a Day-2 cut, "los dos días" and C/D tiers whether or not they exist

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 Copy: «Parejas fijas por categorías ()» with no tiers is fixed; the rest is new) · Effort M (under a day) · Merged: MONEY-14

- **Evidence:**
  - /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/COPY/text/pairs8_reglamento.txt — pairs8 has no Calcutta yet…
  - …5 more in `findings.json`
- **Impact:** CLAUDE.md §0.5 promises the second tournament needs zero code changes; its players would read rules that do not apply to them (a Calcutta, a cut, four-player groups, C/D…
- **Recommendation:** Build every sentence from settings: omit the draw location when auction is off, omit or rewrite the cut when maxStrokes = 0 or rounds = 1 ("Sin recorte: juegas todo el torneo con el mismo h…

#### COPY-12: The Reglamento fails the brief's own test (a non-golfer's partner): jargon is never defined, there is no money summary, and its key governance line is ambiguous

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/COPY/text/full12-live_reglamento.txt — uses Stableford, boge…
  - …3 more in `findings.json`
- **Impact:** The Reglamento is what the Comité points to when two friends disagree about money; people who do not already know golf betting cannot follow it, and the one sentence abo…
- **Recommendation:** Rewrite as a document: 1) "En corto" (what you pay, what you can win, who holds the money, when it is paid), 2) the games, each with one worked example ("Si haces 5 en un par 4 y tienes un…

#### COPY-13: PIN lockout copy says "Espera 5 minutos" for the 15-minute player lock, ignores lockedUntil, and a missing player falls through to "Ese torneo no existe"

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - supabase/migrations/0013_identity.sql:435-438 — device lock 5 attempts / 5 min; player lock 15 attempts / 15 min; both return reason "locked" with lockedUntil…
  - …2 more in `findings.json`
- **Impact:** On the first tee a player locked by someone else's attempts (the player lock counts every device) is told to wait 5 minutes by his own fault, waits, fails again, and is…
- **Recommendation:** Use lockedUntil: "Demasiados intentos con este jugador. Vuelve a intentar a las 9:14, o pídele al Comité que lo desbloquee." Distinguish device vs player lock (the RPC can return which). Ma…

#### COPY-14: Three words for pots, used for overlapping things: "bote" is the side pot, the Ronda rápida's main pot and the Calcutta; "pozo" is the Calcutta and the Víbora's money

**P2** · CONFIRMED · still open (DESIGN_AUDIT B.5 "Pot: Bolsa vs Pozo"; DESIGN_NOTES term table: "bolsa / pozo (two pots, two words)") · Effort S (under 2 h)

- **Evidence:**
  - Entry pot = "bolsa": es-MX.ts:588 "bolsa de ${pot}", :642 "Bolsa principal", :1140 money.pot "Bolsa", :1922 rules "bolsa de ${pot}"
  - …4 more in `findings.json`
- **Impact:** Money trust depends on knowing which pile a peso comes from. A player reading that the Víbora is paid "del pozo" can reasonably think the Calcutta pays it; an organizer…
- **Recommendation:** Fix the vocabulary once and add it to the DESIGN_NOTES term table: bolsa = entry money (tournament and Ronda rápida alike), pozo = Calcutta only, bote = a side pot someone buys into; inscri…

#### COPY-15: The live feed has no voice: four fixed templates, no commentary, repeated verbatim; the one place the voice spec allows personality has none

**P2** · CONFIRMED · new (DESIGN_AUDIT §7 item 7 removed the emoji and exclamations; nothing replaced them) · Effort M (under a day)

- **Evidence:**
  - src/screens/tournament/FeedTicker.tsx:13-24 and src/engine/core/feed.ts:10-14 — four kinds only (birdie, leadChange, snakePass, honoreeHole), one template each…
  - …3 more in `findings.json`
- **Impact:** The feed is the bachelor-party screen: it runs on the villa TV and between shots. As shipped it reads like a log, so the app has no voice anywhere (UI copy is deliberate…
- **Recommendation:** Write a small commentary system: 3–5 variants per event, chosen deterministically (hash of event id) so every phone shows the same line; context-aware events (first birdie of the day, back-…

#### COPY-19: "¿Cómo se calculó?" reads as algebra, and the money explanations are thin: a prize says only "1º lugar: $10000"

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 P2 explanation strings: glyphs replaced by words; the explanations themselves did not change) · Effort M (under a day)

- **Evidence:**
  - src/engine/core/compute.ts:156-161 — a hole: "Par 4, SI 3: 1 golpe de ventaja", "5 − 1 = 4 neto", "4 + 1 − 5 + 2 = 2 pts (par neto)"; the "+ 2" is never explai…
  - …3 more in `findings.json`
- **Impact:** Zero disputes (§2) depends on these sheets being readable by the person who lost money. Formulas satisfy a golfer who already agrees; they do not settle an argument at d…
- **Recommendation:** Lead each explanation with one sentence in words, then the arithmetic: "Hiciste 5 en un par 4. Con tu golpe de ventaja cuentas 4: par neto, 2 puntos." / "Camilo va 1.º con 60 puntos (2 más…

#### COPY-20: The Comité's discrepancy line is shorthand: "Día 2. ahora 5/1 (?), antes 6/1 (Damián)"

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/admin/AdminScores.tsx:160-170 — composed in TSX: `${strokes}/${putts}`, "L" for a pick-up, "–" for empty, name("") → "?" for an unknown author, low…
  - …2 more in `findings.json`
- **Impact:** This is where the Comité decides which of two scores counts, i.e. who wins money. "5/1 (?)" makes them decode units and authorship at the moment they need certainty.
- **Recommendation:** Spell it out: "Ahora: 5 golpes, 1 putt (capturó: no se sabe). Antes: 6 golpes, 1 putt (capturó Damián, 10:42)." Move the strings into i18n.

#### COPY-21: Ronda rápida "Con dinero" commits everyone to stakes the screen never shows (Skins $200 buy-in, Tres putts $20 to each rival, Birdies $50…); the only money line is "Bote de $500, se reparte todo al primero."

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - src/engine/games/quick.ts:3-6,32-35 — with money, "each game keeps its catalog stake or buy-in"
  - …3 more in `findings.json`
- **Impact:** Friends agree on money at the first tee from this screen. They start a round in which Polo will later say "Bruno le paga a Camilo $60 (Tres putts)" at a stake nobody cho…
- **Recommendation:** With money on, show each selected chip's stake inline and editable ("Tres putts: $20 a cada quien por cada tres putts", "Skins: $200 por jugador, bote $800") and a one-line total exposure (…

#### COPY-26: Player sheet says "2.º, 54 pts, por el 26": the cross-round hole count is printed as if it were a hole number

**P2** · CONFIRMED · partly fixed (audit-2026-09-28 P1 #17 "Wrong «Hoyo» figure": GamesScreen.tsx:47-48 now uses the active round; PlayerSheet.tsx:78 still pass… · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/PlayerSheet.tsx:78 — t.player.position(label, total, t.round.thru(totals.thru, Σ round holes)) → thru 26 of 36
  - …2 more in `findings.json`
- **Impact:** The first line of every player sheet on day 2 names a hole that does not exist; people checking where a rival is on the course are misled.
- **Recommendation:** Use the current round's thru and say which day when there are several: "2.º, 54 pts, por el 8 del día 2" (or "F" / "terminó el día 2"). Test with full12-live.

#### COPY-06: Tie places render as "T3º" in prize labels (Dinero breakdown, ceremony, share card)

**P3** · CONFIRMED · still open (audit-2026-09-28 Copy: ties read "T3º") · Effort S (under 2 h)

- **Evidence:**
  - src/engine/modules/individual/index.ts:162 — label `${label}, ${row.label}º` with row.label "T3"; same in pairs/index.ts:151, games/lowScore/index.ts:84
  - …2 more in `findings.json`
- **Impact:** A tied player reads "Individual, T3º" as his prize line in Dinero; "T3º" is neither Spanish nor the board's own "empatado en 3.º" (es-MX.ts:10-15).
- **Recommendation:** Build prize labels with the existing `ordinal()` ("Individual, empatado en 3.º") or a short "3.º (empate)"; never append º to an engine label. Test: golden snapshot assertion that no label…

#### COPY-08: "paga a Banco" / "Banco paga a…": the settlement sentences treat the bank as a person's name, and the banker also appears as a payee of himself

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/MoneyScreen.tsx:30 — name(null) = t.moneyScreen.bank = "Banco", composed at :237 and :273 as "<b>Leonel</b> paga a Banco" (Spanish needs…
  - …1 more in `findings.json`
- **Impact:** The most important sentence on the screen is ungrammatical, and the banker reads lines where he pays and is paid by himself; small, but it is the sentence people act on.
- **Recommendation:** Compose with the article ("Leonel le paga al banco", "El banco le paga a Camilo") and name the holder once per line where it matters: "Iván J. (banco) le paga a Camilo". When from/to is the…

#### COPY-23: Grammar and agreement slips in shipped strings: "1 pts", "Iván J. y Julián gana 1 arriba", "greenie (en green de salida en par 3…)", "Comprarse cuenta en el máximo", "día 1 28 pts"

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - "1 pts": es-MX.ts:1190 Tarjeta badge "1 pts, bogey neto"; :1850 feed "Nacho en el 3: 1 pts"; compute.ts:153 hole title; Estadísticas "El Resucitado … +1 pts" (…
  - …5 more in `findings.json`
- **Impact:** Visible on the scorecard, the feed and the money boards; each one reads as machine-assembled text to a native speaker.
- **Recommendation:** Plural helpers for every count ("1 pt"/"1 punto"), agreement in composed sentences (a `verb(side)` helper), rewrite the three game descriptions, and a review pass by a native copy editor on…

#### COPY-25: Comité labels that ask for the wrong thing: "Nombre del homenajeado" is the role label (En vivo prints "{label}: {name}"), "A partir de (puntos)" for a cut that starts above the threshold

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/i18n/es-MX.ts:1548-1549 lastPlaceLabel "Nombre del último lugar", honoreeLabel "Nombre del homenajeado"; src/screens/admin/SettingsEditor.tsx:52-57 plain i…
  - …3 more in `findings.json`
- **Impact:** Diego configures these once, from a phone; a label that asks for a name produces a visibly wrong home screen for every player, and "A partir de 36" invites a Comité memb…
- **Recommendation:** "Cómo le dicen al homenajeado (p. ej., El novio)", "Nombre del premio al último lugar (p. ej., La Cuchara de Palo)", "Recorte si hace más de (puntos)"; drop the example tiers from the pairi…

### 6.12 Mobile and PWA experience

15 findings: 0 P0 · 5 P1 · 6 P2 · 4 P3.

#### PWA-01: After each saved hole the toast lands on top of «Guardar hoyo» for 6 s on iPhone-size screens; a tap meant for the next save hits the toast or «Corregir»/«Deshacer»

**P1** · CONFIRMED · new, introduced by a fix. The AUD-P1-16 fix (d0465fe, #27, 2026-09-28) moved the sticky save bar to bottom: calc(56px + safe + 8px), into t… · Effort S (under 2 h) · Scope: both · Merged: UX-07

- **Evidence:**
  - src/components/ui.module.css:126-136 — .toaster { position: fixed; bottom: calc(80px + var(--safe-bottom)); z-index: 60 } and .toast { pointer-events: auto }
  - src/screens/tournament/ScorecardScreen.module.css:185-187 — .saveBar { position: sticky; bottom: calc(56px + var(--safe-bottom) + var(--s2)) } → the 44 px button occupies ~bottom 86-130 px, the 58 px toast occupies bottom 80-138 px
  - src/screens/tournament/ScorecardScreen.tsx:316-327 — every save raises toast(S.savedHole, { label: Deshacer|Corregir }) for 6 s (ui.tsx:172); Corregir/Deshacer calls goto(savedIdx) and, for Deshacer, rewrites the previous values
  - $S/panel/evidence/PWA/toast-cover2.mjs → iPhone 15 Pro standalone geometry (393x852, insets 59/34): save {y:688,h:44}, toast {y:680,h:58}; elementFromPoint(center of Guardar hoyo) = SPAN «Hoyo 12 guardado»; 50 px right of center = BUTTON «Corregir». Same on 13 mini standalone, on 15 Pro inside Safari (393x659 visible) and on SE (toast-cover.mjs).…
  - …7 more in `findings.json`
- **Verification:** Independent verifier V3: CONFIRMED, P1 (both). For 6 s after every save, the confirmation toast floats over the primary action on every iPhone geometry. A save tapped in that window either does nothing (toast text) or hits the toast's action. «Corregir» jumps back to the previous hole and discards what was entered for the next one. «Deshacer» silently rewrites the previous hole's old values, reverting a correction just made. A top team would not ship a toast ove… Reproduction: Same harness as UX-02 ($S/verify/evidence/V3/tarjeta-taps.mjs modes…
- **Impact:** Every iPhone player (the installed app has the 59 px status-bar inset, Safari has a shorter viewport) whose foursome saves a hole within 6 s of the previous one — the brief's own target is under 10 s per hole, and an all-par hole is one tap — loses the tap, or jumps back to the previous hole via «Corregir» and may then enter hole 13's strokes on hole 12; with «Deshacer» (re-editing a played hole) the previous values are written back. With a deploy waiting, the same tap can hit «Actualizar» and reload away a half-entered hole.
- **Recommendation:** Never float a toast over the primary action: on the Tarjeta render the save confirmation inside the save bar (the existing .saveStatus line: «Hoyo 12 guardado · Corregir») instead of the global toaster, or have the Toaster read a per-screen bottom offset (e.g. a CSS var the Tarjeta sets to the save bar's top) and give .toast pointer-events only on the action. Keep the update offer out of the Tarjeta entirely (see PWA-03). Test: a Playwright check on 375x667 and 393x852 with safe-area insets that taps «Guardar hoyo» twice 1 s apart and asserts the hole advanced twice (elementFromPoint at the b…

#### PWA-02: Installed iPhone app: the sticky header slides under the status bar / Dynamic Island once you scroll, and the status bar's white icons sit on the cream page

**P1** · PLAUSIBLE · new (not in docs/audit-2026-09-28.md or DESIGN_AUDIT.md; black-translucent dates from 9aecbfc) · Effort S (under 2 h) · Scope: both

- **Evidence:**
  - index.html:6-12 — viewport-fit=cover plus apple-mobile-web-app-status-bar-style=black-translucent: in the home-screen app the page draws under a transparent status bar whose clock and icons are white
  - src/app/AppShell.module.css:1-6 — .shell { padding-top: var(--safe-top) } only offsets the start of the page
  - src/screens/tournament/TournamentShell.module.css:7-18 — .top { position: sticky; top: 0; background: var(--bg) }: once scrolled it sticks at y=0, inside the 59 px status-bar band
  - $S/panel/evidence/PWA/notch2.mjs with Emulation.setSafeAreaInsetsOverride {top:59,bottom:34}: header top = 59 at rest, 0 after scrolling 600 px (same on /juegos). Body background behind the status bar = rgb(251,250,247)
  - …3 more in `findings.json`
- **Verification:** Independent verifier V8: PLAUSIBLE, P1 (both). Every iPhone that installs the app (the RUNBOOK asks all 12 players to) shows the event name and the live/offline chip under the clock, Dynamic Island and battery on every scrolled tournament screen, and white status-bar icons on a cream page all day. Nothing is lost and scoring still works, so not P0; but it is the first thing an iPhone user sees on the first scroll, a top company would never ship it, and the fix i… Reproduction: Own probe $S/verify/evidence/V8/notch.mjs on my preview (:4208), Ch…
- **Impact:** On every iPhone with the app installed (the RUNBOOK asks all 12 players to install it), every scrolled screen — leaderboard, Juegos, Dinero, player sheet background — puts the event name and the live/sync chip behind the clock and the Dynamic Island, and the phone's own clock/battery are near-invisible on the cream page all day. It reads as a broken app on the first scroll.
- **Recommendation:** Either switch the meta to apple-mobile-web-app-status-bar-style=default (dark icons, content starts below the bar) or keep black-translucent and (1) make every sticky header top: 0 with padding-top: var(--safe-top) (or top: var(--safe-top) plus a fixed paper band of height --safe-top behind it, z-index above content), and (2) put a dark band or dark header color behind the status bar so white icons stay legible. Add a Playwright visual check with setSafeAreaInsetsOverride({top:59}) that scrolls each tabbed screen and asserts the header's top >= env(safe-area-inset-top).

#### PWA-03: A new version is offered once, for 6 seconds, and never again; nothing checks for updates while the app stays open; «Versión 0.1.0» never changes, so nobody can tell which build a phone runs

**P1** · CONFIRMED · partly fixed (AUD-P0-13: the forced reload is gone and the offer is deferred while the Tarjeta is dirty; the weak, unverifiable offer is ne… · Effort M (under a day) · Scope: both · Merged: REL-12

- **Evidence:**
  - src/main.tsx:16-27 — onNeedRefresh raises one toast(t.sync.newVersion, {label: Actualizar}); src/components/ui.tsx:172 removes an action toast after 6000 ms; vite-plugin-pwa calls onNeedRefresh once per waiting worker (node_modules/vite-plugin-pwa/dist/client/build/register.js:55-81)
  - grep -rn '\.update()\|onRegisteredSW' src → no registration.update() anywhere: no periodic or on-resume update check (the store reloads data on visibilitychange, src/data/tournamentStore.ts:77-78, but the service worker is only re-checked on a full navigation)
  - $S/panel/evidence/PWA/update-flow.mjs on my own server (:4193, a copy of the build, sw.js revision bumped to simulate a deploy): 'A. after 20 s open: waiting SW? false' (deploy not noticed while open); 'B. waiting SW? true (toast should be deferred)' (deferral works); '[toast] SHOWN 28.7s / GONE 34.7s' (6.0 s); 'E. 30 s later; still waiting SW? tr…
  - src/screens/tournament/MoreScreen.tsx:160-162 and src/components/BootProblem.tsx:41 print __APP_VERSION__ = package.json version; git log -S'"version": "0.1.0"' -- package.json → set 2026-09-27 and never bumped through 60 PRs
  - …4 more in `findings.json`
- **Verification:** Independent verifier V8: CONFIRMED, P1 (both). Each client computes standings and money itself (§4). A Friday-night hotfix, which is exactly what the RUNBOOK's 'no deploys during a round' rule steers towards, reaches Saturday's phones only if the player taps a 6-second toast at launch, and that toast is sometimes never rendered. Nobody can check which build a phone runs. So the fix that settles a dispute may not be the code computing the money on some phones, an… Reproduction: Own server $S/verify/evidence/V8/serve.mjs (Vercel headers from ver…
- **Impact:** If a scoring or money bug is fixed on Friday night (Day 1 → Day 2 is exactly when a hotfix is most likely), a phone that is resumed rather than cold-started never sees it, and one that is cold-started shows the offer for 6 s during boot and then keeps running the old engine all day. Every client computes standings and money itself (§4), so phones on different builds can show different numbers for the same scores — the 'zero disputes' promise breaks — and the Comité has no way to see who is behind (every phone says 0.1.0).
- **Recommendation:** (1) Keep a persistent, non-blocking «Actualizar» affordance in the shell (the sync chip or a thin bar under the header) until the update is applied, still deferred while the Tarjeta is dirty; (2) call registration.update() on visibilitychange→visible and every 30-60 min (onRegisteredSW); (3) inject the git SHA and build time (VERCEL_GIT_COMMIT_SHA) as the version and show it in Más and in Comité › Salud; (4) optional server-side floor: a min_build flag in the existing app_flags() that makes the shell insist (outside a dirty Tarjeta); (5) RUNBOOK: after a hotfix, the Comité checks each phone's…

#### PWA-04: Share cards fail offline, and one failed attempt breaks sharing for the rest of the session even with signal back (cacheBust bypasses the precached fonts; html-to-image caches the failures)

**P1** · CONFIRMED · new (AUD-P1-38 fixed the awaited fonts and the NotAllowedError fallback; the cacheBust offline and poisoning defect was not in the earlier… · Effort S (under 2 h) · Scope: both · Merged: PERF-11

- **Evidence:**
  - src/lib/shareImage.ts:11 — toBlob(node, { pixelRatio: 2, cacheBust: true, … })
  - node_modules/html-to-image/lib/dataurl.js:106-108 — cacheBust appends ?<Date.now()> to every font and image URL it embeds; node_modules/html-to-image/lib/embed-webfonts.js getWebFontCSS embeds every @font-face of each used family (latin, latin-ext, vietnamese)
  - vite.config.ts:69 — the precache ignores only the v query parameter (ignoreURLParametersMatching: [/^v$/]), so /assets/archivo-latin-wdth-normal-DY7AcnAa.woff2?1790737318629 is a precache miss and a HTTP-cache miss
  - $S/panel/evidence/PWA/share-offline.mjs: page SW-controlled, context set offline, tap «Compartir tabla» → 'result toast: No se pudo generar 365 ms' with FAILED /assets/archivo-*.woff2?<ts> and /assets/fraunces-*.woff2?<ts> (6 fonts). The same card online renders correctly (cards/leaderboard-full12.png)
  - …7 more in `findings.json`
- **Verification:** Independent verifier V8: CONFIRMED, P1 (both). A clear defect a top company would not ship: one share attempt with no signal (the normal condition on the course, §2) disables every image share in the app until the app is killed or reloaded, and an installed-app user has no reload. It is the lowest-impact P1 of this batch: it touches the share cards (§9.11, M6), not scores or money, and Dinero keeps a text share beside the image (MoneyScreen.tsx:110). Screenshots… Reproduction: Own script $S/verify/evidence/V8/share.mjs against my server (:4208…
- **Impact:** On the course (patchy signal is §2’s normal condition) «Compartir tabla», «Compartir mi ronda», «Compartir» in Dinero and «Compartir mi año» fail with «No se pudo generar la imagen.» although everything they need is on the phone — and after that one attempt they keep failing at the villa on Wi-Fi until the app is killed and reopened, which an installed-app user does not know to do. Online, each first share downloads the fonts again before the share sheet can open, which on iPhone likely turns the share sheet into a file download.
- **Recommendation:** Minimum fix, validated: cacheBust: false in src/lib/shareImage.ts:11 (every asset is content-hashed; logos and avatars carry their own ?v=). Build fontEmbedCSS once per session with getFontEmbedCSS restricted to the latin subsets and pass it to toBlob, so the render needs no network. Pre-render the card when the share UI opens (or on the first tap, then offer «Compartir» as a second tap with the ready File) so navigator.share runs inside the gesture on iOS. Test: Playwright offline → share → PNG; then online → share → PNG in the same session; plus a device check on iOS that the WhatsApp sheet…

#### PWA-05: System back ignores open sheets and silently throws away a half-entered hole

**P1** · CONFIRMED · new (AUD-P1-19, swipes leaking through sheets, is fixed at ScorecardScreen.tsx:153/426; AUD-P2-12, sheets discarding forms on backdrop/Esca… · Effort M (under a day) · Scope: both

- **Evidence:**
  - grep -rn 'pushState\|popstate\|useBlocker\|beforeunload' src → nothing: sheets (src/components/ui.tsx:64-111) do not create a history entry and nothing guards a dirty Tarjeta
  - $S/panel/evidence/PWA/back.mjs (412x915): player sheet open on /t/_/full12-live, page.goBack() → URL /fixture (the whole screen is left; the sheet is simply gone)
  - same script: Tarjeta first stepper 4 → two taps on + → 6 → goBack → URL /t/_/full12-live with no confirmation → forward → stepper back to 4 (draft discarded); drafts live only in React state (ScorecardScreen.tsx:165-181)
  - ScorecardScreen.tsx:150,423-431 — holes change with a horizontal swipe on the whole screen; on Android gesture navigation (and in iOS Safari, not the installed app) a swipe that starts at the edge is the system back instead
- **Verification:** Independent verifier V8: CONFIRMED, P1 (both). On Android (installed or browser) and in iOS Safari, back is the reflex for closing a sheet. Here it leaves the whole screen, including out of the Tarjeta while the tiebreak or confirm sheet is up, and it throws away the unsaved hole. Saved scores are never lost and recovery is re-entering one hole, so not P0. Back-closes-the-sheet is table stakes a top company would not miss, so P1 for the platform. For the first t… Reproduction: Own script $S/verify/evidence/V8/back.mjs (412x915, touch, my serve…
- **Impact:** Android players (and anyone playing in iOS Safari) close a player sheet, «¿Cómo se calculó?» or the tiebreak question with the back gesture — the most common gesture on Android — and are thrown to the previous screen, or out of the installed app when the tournament was its first page. A player who swipes from the edge to change hole, or presses back by reflex mid-entry, loses the hole he was typing without any warning.
- **Recommendation:** Give every Sheet a history entry (push on open, close on popstate, history.back() on programmatic close) — or drive sheets from a search param — so back closes the top sheet first. In the Tarjeta use react-router's useBlocker (the app already uses a data router) while editing is true, plus persisting drafts per (round, group, hole) in sessionStorage so an OS kill or a back does not lose them. Tests: Playwright goBack with a sheet open → URL unchanged and sheet closed; dirty hole → goBack → confirm or restored draft.

#### MOT-17: When the signal drops or returns, a banner is inserted above the Tarjeta and every stepper jumps 37 px under the thumb, with no transition

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/app/AppShell.tsx:39 renders <OfflineBanner /> in normal flow above <main>; OfflineBanner.tsx:20-28 mounts/unmounts it on the online/offline events; Offline…
  - …3 more in `findings.json`
- **Impact:** Signal on a golf course comes and goes every few holes. Each flap moves the whole scoring UI by one stepper row's worth of pixels at the moment a thumb may be on its way…
- **Recommendation:** Do not insert content above the scoring UI: show connectivity as an overlay (fixed, over the header, not in flow) or reuse the existing header status, and animate its appearance (opacity/tr…

#### PWA-06: WhatsApp presentation: the leaderboard card puts every peso a person would collect (Calcutta returns included) beside his Stableford rank under «Individual: si terminara ahora»; the settlement card greys out winners and omits who pays whom; large fields become unreadable; invite links have no preview

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - src/components/ShareCard.tsx:84-99 — cash = state.prizes.filter(p => p.playerId === r.playerId) summed, under the subtitle `${individual.label}: si terminara a…
  - …7 more in `findings.json`
- **Impact:** The images are what the whole group sees. A leaderboard card where 7th place «wins» $6,600 with no label starts exactly the argument the product exists to prevent (§1: e…
- **Recommendation:** Leaderboard card: show only the Individual prize in that column with a header («Premio»), or drop money from the public card and keep it on the settlement card. Cap a card at 4:5 or 9:16 (1…

#### PWA-07: Safe areas are handled only in the player shell: the Comité save bar sits on the iPhone home indicator, and nothing uses safe-area-inset-left/right (landscape puts Comité and TV text under the notch)

**P2** · CONFIRMED · new (the 2026-09-28 P2 'orientation: portrait' is fixed — vite.config.ts:45 orientation 'any' — which exposes the landscape half) · Effort S (under 2 h)

- **Evidence:**
  - src/screens/admin/Admin.module.css:167-170 — .sticky { position: sticky; bottom: var(--s3) } (12 px, no --safe-bottom); used by AdminGroups.tsx:261, AdminTourn…
  - …3 more in `findings.json`
- **Impact:** Nico (Comité on an iPhone with the app installed) saves groups and tee times with a button crossed by the home indicator, where an upward flick sends him to the home scr…
- **Recommendation:** Add --safe-left/--safe-right tokens; use bottom: calc(var(--s3) + var(--safe-bottom)) for .sticky and max(var(--gutter), env(safe-area-inset-left/right)) for horizontal padding in AppShell…

#### PWA-08: The install guide is not where players arrive, is the same two-platform list for everyone, cannot be reopened, and Android gets no one-tap install

**P2** · CONFIRMED · new · Effort M (under a day) · Merged: UX-11

- **Evidence:**
  - grep -rn InstallGuide src → HomeScreen.tsx:108, MoreScreen.tsx:129, MiPolo.tsx:323; nothing in EnterScreen.tsx, the page a /t/<slug> link opens. CLAUDE.md §9.1…
  - …7 more in `findings.json`
- **Impact:** The 12 players open a WhatsApp link, land on Entrar, pick their face and play in the browser; the guide sits at the bottom of Más where few look, so most never install (…
- **Recommendation:** Show a platform-specific install card on Entrar after a successful PIN and at the top of En vivo until installed: iOS steps with the current Safari UI (screenshots/icons), Android with a re…

#### PWA-09: An iPhone player who joined in Safari and then installs the app starts over in an app that opens on Home and only accepts a 6-character code; a pasted invite link is truncated to «HTTPS»

**P2** · PLAUSIBLE · new · Effort S (under 2 h)

- **Evidence:**
  - vite.config.ts:42-43 — start_url '/' and scope '/': the installed app always opens on Home, never on the tournament
  - …5 more in `findings.json`
- **Impact:** On Calcutta night, iPhone players who followed the natural order (open link, enter with PIN, then install as the RUNBOOK asks) open the installed app to an empty Home th…
- **Recommendation:** Make Home in standalone mode resume the last tournament directly (Navigate to /t/<last> when getLastTournament() and display-mode is standalone); accept a pasted link or slug in the Home fi…

#### PWA-10: Push reaches accounts only, and only for social events: a tournament day sends nothing (tee times, round start, card to sign, results) to the PIN players who make up the field

**P2** · CONFIRMED · new · Effort L (multi-day)

- **Evidence:**
  - supabase/migrations/0019_push.sql:15,85 — push_subscriptions.profile_id references profiles; the dispatch trigger selects subscriptions by notifications.profil…
  - …3 more in `findings.json`
- **Impact:** Nacho's twelve join with face + PIN (anonymous devices). Unless a player also creates a Polo account, links it to his player and installs the app, he cannot receive a si…
- **Recommendation:** Allow a device subscription keyed to (tournament, player) for PIN devices (device_sessions), and add tournament notifications: round live, your tee time (T-15 min), card ready to sign, pend…

#### PWA-12: Push rough edges: a notification tap reloads the running app (drops an unsaved hole), the Android badge is a white square, iPad reads as «unsupported», the «denied» copy points to browser settings, and the icon count is never re-synced

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - public/push-sw.js:28-43 — clients.matchAll({ includeUncontrolled: true }) then c.focus().then(w => w.navigate(url)): navigate() is a full navigation of that wi…
  - …5 more in `findings.json`
- **Impact:** A player entering a hole who taps an incoming notice (a Ronda rápida invite, a published result) loses the steppers and waits for a cold boot; on Android the notificatio…
- **Recommendation:** Post a message to the focused client ({type: 'navigate', url}) and let the router navigate (keeping the Tarjeta's dirty-draft guard), falling back to navigate()/openWindow; ship a 96x96 mon…

#### PWA-14: Install polish: no iOS launch image (blank white start, although the handoff promises a new «pantalla de arranque»), and a bare manifest (no screenshots, shortcuts or categories) for Android’s install sheet

**P3** · PLAUSIBLE · new · Effort S (under 2 h)

- **Evidence:**
  - index.html and the production head ($S/panel/evidence/PWA/prod-head.txt): no <link rel="apple-touch-startup-image">; iOS does not build a launch screen from th…
  - …4 more in `findings.json`
- **Impact:** Every cold start on an iPhone shows an empty white screen, then a system-font «Polo / Cargando…», then the app: three frames that make a premium brand look like a web pa…
- **Recommendation:** Generate apple-touch-startup-image PNGs per device class in npm run icons (cream background, centred mark), give the boot div the --bg colour inline, and verify on a device. Add 3-5 portrai…

#### PWA-15: The installed app has no manual refresh: pull-to-refresh is disabled globally and «Sin actualizaciones en vivo» is not tappable

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/styles/global.css:27 — body { overscroll-behavior-y: none } removes Chrome’s pull-to-refresh in the browser; standalone apps have no reload button at all
  - …2 more in `findings.json`
- **Impact:** When Realtime drops on the course (the status the header shows), the player sees a stale board and a warning he can do nothing about, other than killing the app.
- **Recommendation:** Make the status chip a button («Actualizar») that calls reload(), and add pull-to-refresh on the boards (a small custom implementation, since the native one is disabled for good reasons).

#### PWA-16: Mobile input hints work against the user: the 4-digit PIN field is autocomplete=one-time-code (iOS offers the emailed 6-digit code, which auto-submits as a wrong PIN) and the player-photo picker forces the selfie camera (capture="user"), so the Comité cannot pick an existing photo

**P3** · PLAUSIBLE · new · Effort S (under 2 h)

- **Evidence:**
  - src/screens/tournament/EnterScreen.tsx:176-190 — type=password, inputMode numeric, autoComplete="one-time-code", onChange keeps 4 digits and submits at 4
  - …3 more in `findings.json`
- **Impact:** A player who just signed in to his profile and then enters a tournament is offered the wrong code on the PIN field; tapping it burns one of the five attempts that preced…
- **Recommendation:** Use autocomplete="off" (or "current-password" if the PIN should be saved by the keychain) on the PIN field; keep one-time-code only for the emailed codes. Remove capture="user" (the OS shee…

### 6.13 Product coherence and strategy

18 findings: 0 P0 · 2 P1 · 15 P2 · 1 P3.

#### STRAT-02: No product analytics, no crash reporting and no success metric: Polo cannot see a failure on a player's phone or learn whether anything it built is used

**P1** · CONFIRMED · new (no earlier audit item on telemetry; the boot fallback from #56 addressed blank pages, not reporting) · Effort M (under a day) · Scope: both · Merged: ARCH-10, DB-18, REL-20, PERF-12

- **Evidence:**
  - grep -rn -iE 'posthog|plausible|@vercel/analytics|speed-insights|gtag|google-analytics|mixpanel|amplitude|sentry|telemetry|web-vitals' src api index.html package.json vite.config.ts → no analytics or error SDK (only unrelated words); package.json dependencies contain none
  - src/app/RouteError.tsx:15 and src/app/RootBoundary.tsx:24: a crash is only console.error on the device; nothing leaves the phone
  - The only usage view is Admin de Polo › Resumen (platform_overview / platform_daily): row counts (cuentas, torneos, rondas rápidas, hoyos capturados), no funnel, activation, retention or crash-free rate (/admin/_/resumen fixture text in evidence/STRAT/walk/survey2.json)
  - grep -n -iE 'retention|retenci|activation|activaci|north star|metric|métrica|funnel|embudo|KPI|analytics' CLAUDE.md DESIGN_DIRECTION.md DESIGN_NOTES.md docs/handoff.md README.md → no product metric anywhere; CLAUDE.md §2 'Success criteria' are operational only (disputes, 2 s sync, 10 s per hole, offline, installable, tests)
  - …12 more in `findings.json`
- **Verification:** Independent verifier V6: CONFIRMED, P1 (both). P1 is carried by the crash half (ARCH-10), which I reproduced: no error ever leaves the device, the crash screen shows no detail, and the only errorElement is the root route, so one render fault in one tab replaces the whole app including the tab bar and the Tarjeta. For a money-moving field app that is a gap a top company would not ship, and it bites the first tournament: a crash on a player's phone on 9-10 April c… Reproduction: grep -rniE "posthog|plausible|@vercel/analytics|speed-insights|_ver…
- **Impact:** On 9–10 April a JavaScript error, a stuck outbox or a failed claim on one of 12 phones is known only if the player speaks up in the moment, and after the trip nobody can tell whether profiles, crews, rivalries or Ronda rápida are used, so every roadmap decision stays opinion. For a second organizer's event, failures are invisible to Diego entirely. A top company does not ship a money-moving app without crash reporting and a defined success metric.
- **Recommendation:** Add first-party, privacy-respecting telemetry: a `client_events` table written through a rate-limited security-definer RPC (no PII: tournament id, event name, app version), capturing window.onerror / unhandledrejection / RootBoundary / outbox permanent failures, plus ~10 funnel events (visit, account, tournament created, first player, first round live, first hole saved, ceremony, settlement shared, day-30 return). Show them in Admin › Resumen as a funnel. Write down one north-star metric (e.g. 'events completed with a settlement shared') and three guardrails (crash-free sessions ≥ 99.5%, p95…

#### STRAT-03: Match play and Por equipos are offered as equal choices in the wizard but the rest of the product still speaks Stableford: the feed crowns the wrong leader, the champion wins with '1 puntos', the rules describe a Day-2 points cut, the team race chart is empty with '?' labels

**P1** · CONFIRMED · new (DA-X.fmt.1 "Stableford was the only format" is marked fixed by #49/#51 for the boards; this is the rest of the product not following) · Effort L (multi-day) · Scope: platform

- **Evidence:**
  - Wizard step 2 offers Stableford, Golpes, Match play and Por equipos at equal weight (evidence/STRAT/walk/wizard.txt: '¿Qué van a jugar? / Stableford / Golpes / Match play / Por equipos')
  - src/engine/core/feed.ts:31–48: birdie and lead-change events are computed from Stableford points in every format. Scratch vitest (evidence/STRAT/vt/feedlead.test.ts → feedlead.txt): match8 'lastLeadAnnounced=Fabián (34 Stableford pts) boardLeader=Matías'; team8 announces an individual (Fabián) while the board leader is team tA
  - docs/review/2026-09-30/shots/t-match8-15pro-light-strat-feed-pts.png and t-match8-15pro-light-strat-points-header.png: a match-play board whose feed reads 'Leonel: águila neta en el 18, +4 pts'; the HOY column shows '8&6' for both the winner (Matías, 1st) and the loser (Leonel, 8th) with no won/lost marker
  - docs/review/2026-09-30/shots/t_ceremonia-match8-15pro-light-strat-champion.png: 'El campeón… 1 puntos, $2,880… Campeón. Se lleva el Putter' (CeremonyScreen.tsx:133,137 use C.withPoints(r.total) for every format; es-MX.ts:1981)
  - …3 more in `findings.json`
- **Verification:** Independent verifier V6: CONFIRMED, P1 (platform). A shipped platform feature (two of the four first-class choices on wizard step 2) contradicts its own board on the surfaces people screenshot: the ceremony crowns a team champion as "?" with a "?" avatar, prints "puntos" for stroke totals, and hands every champion "el Putter"; the feed announces a leader the board does not have; the Reglamento describes a Day-2 cut that does not exist; the team race chart is empty w… Reproduction: Engine, my own script over the app pipeline (parseSettings + co…
- **Impact:** The first organizer who picks Match play or Por equipos (two of the four options on step 2) gets a product that contradicts its own board in the feed, the ceremony, the rules page and the statistics. In a product whose promise is 'every number correct and explainable', a feed that crowns the wrong leader and a champion 'with 1 puntos who takes the Putter' is a trust failure at the exact moments a group shares screenshots.
- **Recommendation:** Now (S): hide Match play and Por equipos in the wizard and Comité behind a flag until parity. Then (L): make every surface format-aware through the format registry (src/engine/formats): feed events from the format's own figure (holes up, net to par), a won/lost result column for match play, ceremony subtitles from format.figureLabel, rules text from the enabled modules only (omit the Day-2 cut when maxStrokes = 0 or rounds = 1), stats and race chart keyed by entrant with team names. Add a parity test that renders En vivo, Juegos, Stats, Reglamento, Ceremonia, Imprimir and the share card for s…

#### STRAT-01: Scope outran validation: ~27k lines of new surface (games, social, formats, platform admin) shipped in 35 hours after the audit, against ~3k lines of hardening, with almost nothing validated by a real user

**P2** · CONFIRMED · new · Effort M (under a day) · Scope: both

- **Evidence:**
  - git log --numstat per squash-merge (evidence/STRAT/prs-stats.txt): after the 2026-09-28 audit (#21), hardening = #23 +533, #25 +438, #26 +1,497, #27 +378, #28…
  - …5 more in `findings.json`
- **Impact:** Every added area is more surface to harden, test on phones and support before 8 April 2027, and none of it has evidence of use. The 12 friends will meet the least-valida…
- **Recommendation:** Declare a surface freeze until the launch path is validated: (1) put Ronda rápida, crews, rivalries, badges/recap, push, Match play / Por equipos and the Admin de Polo sections other than S…

#### STRAT-05: No spectator link and no read-only TV: the group chat, partners and the villa TV can see the board only by claiming a player with a PIN, and shared images carry no way in

**P2** · CONFIRMED · still open (CLAUDE.md §18.9 spectator link, 'nice-to-have. Ask Diego'; never built) · Effort M (under a day)

- **Evidence:**
  - grep -rn -i 'spectator' src supabase → only src/engine/settings/schema.ts:198 `spectatorLink: z.boolean()` and presets.ts:52,114 `false`: a dead setting
  - …4 more in `findings.json`
- **Impact:** A bachelor trip is followed by a much larger audience than the 12 players (the groom's other friends, partners, the WhatsApp group); today none of them can watch, and ev…
- **Recommendation:** Build §18.9: a rotatable `spectator_token` per tournament, a /v/<token> route backed by a security-definer RPC that returns the boards without money (or with, per a setting) and no PII beyo…

#### STRAT-06: Two account doors and two homes for one kind of account: /organizer/login (password, no Google) lands on Mis torneos, /entrar (code, Google) lands on Mi Polo, and both homes list the same tournaments

**P2** · CONFIRMED · new · Effort M (under a day) · Merged: UX-27

- **Evidence:**
  - src/screens/HomeScreen.tsx:97–105: 'Entrar a mi perfil' and 'Jugar una ronda rápida' both link to /entrar; 'Organizar un torneo' links to /organizer/login
  - …6 more in `findings.json`
- **Impact:** Someone who created the account with Google on /entrar and later taps 'Organizar un torneo' while signed out meets a password form with no Google button; organizers keep…
- **Recommendation:** One sign-in (/entrar) for every account: code first, Google, password optional; the intent (`?para=organizar`) changes only the headline. Redirect /organizer/login there. Make Mi Polo the o…

#### STRAT-07: The signed-out product sells tournaments; the signed-in home sells a weekly-round tracker: Ronda rápida is Mi Polo's only primary action and 'Organizar un torneo' is a small ghost button at the very bottom

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - src/i18n/es-MX.ts:20–21: tagline 'Torneos de golf entre amigos', description 'Marcador en vivo, juegos, Calcutta y cuentas claras para torneos entre amigos'
  - …3 more in `findings.json`
- **Impact:** An organizer who signs up to run a tournament lands on a home that pushes a different job; Diego's own launch event is one ghost button away. Without one stated job the…
- **Recommendation:** Write a one-page positioning (primary job: 'run your group's golf events, from invite to settlement'; weekly rounds are the lighter event type). Signed-in home: 'Tus eventos' first, one pri…

#### STRAT-08: The post-trip retention loop never starts for the launch cohort: players join anonymously by PIN, the only nudge to keep a profile sits in Más, and the ceremony ends on a bare 'Fin.' with no save, crew or rematch

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - Players join by face + PIN as anonymous users (CLAUDE.md §7 Auth; TournamentGate.tsx:93); results reach a profile only when a player is confirmed-linked to an…
  - …4 more in `findings.json`
- **Impact:** After Los Cabos the 12 players' results stay inside one tournament; most will never have accounts, so the crews, season table, rivalries and index built for retention re…
- **Recommendation:** Make the end of the trip the conversion moment: after the last reveal, a 'Guarda tu resultado' sheet on every phone (Google or code, one tap; the device already holds the player), and for t…

#### STRAT-09: The brief no longer constrains or measures anything: §0.5's scope rule is contradicted by §7, nothing after M7 has acceptance criteria, and the M0–M7 gates were declared met in two hours although they required people and phones

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - CLAUDE.md:77 (§0.5): 'Build exactly the modules and screens the first tournament needs… No marketplace, no billing, no public discovery, no multi-org roles bey…
  - …3 more in `findings.json`
- **Impact:** With no binding scope, no metric and gates that pass on declaration, every session can justify building more (STRAT-01) and readiness is overstated to the owner. The lau…
- **Recommendation:** Split CLAUDE.md into: a 1–2 page product strategy (positioning, target organizer, north-star metric, non-goals, the current three bets); per-area PRDs with acceptance criteria and who verif…

#### STRAT-10: Before the first round, every player's home is a board of zeros: no date, course, group, tee time, entry owed or countdown

**P2** · CONFIRMED · still open (DESIGN_AUDIT 'Density and scale': '4 players: pages look empty (… minimal4-setup--*)'; the pre-event state was never designed) · Effort M (under a day)

- **Evidence:**
  - docs/review/2026-09-30/shots/t-minimal4-setup-15pro-light-strat-pre-event.png: 'Día 1, programada', four rows 'T1 … 0 —', 'si terminara ahora', 'Nada todavía.…
  - …2 more in `findings.json`
- **Impact:** The first thing each of the 12 players sees when the PIN arrives, and all through Calcutta night, is a tied table of zeros; the weeks when the group is most excited (and…
- **Recommendation:** A pre-event En vivo while no round is live: countdown, the schedule (Calcutta dinner, days, courses, tee times), 'tu grupo', what you owe the bank (Dinero already knows), the field with tie…

#### STRAT-11: The first tournament leaks into every tournament: any champion 'se lleva el Putter' (Golfbreaks' trophy for Nacho's trip), and snake copy says 'víbora' whatever the organizer renames the game

**P2** · CONFIRMED · new · Effort S (under 2 h) · Merged: COPY-17

- **Evidence:**
  - src/i18n/es-MX.ts:1979 `trophy: 'Se lleva el Putter'`; src/screens/tournament/CeremonyScreen.tsx:253 renders `{C.champion}. {C.trophy}` for every champion with…
  - …6 more in `findings.json`
- **Impact:** The climax of every other organizer's night announces a trophy that does not exist, and renaming a game leaves the old name in the Tarjeta, feed and awards; both make th…
- **Recommendation:** Add an optional `labels.trophy` (shown only when set; the first tournament sets 'el Putter') and route every snake string through settings.modules.snake.label. Test: render the ceremony, fe…

#### STRAT-12: The Admin de Polo console (12% of the product code, 33 platform RPCs, the second-largest copy section) was built before organizer basics such as setup guidance, a spectator link or analytics

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - evidence/STRAT/loc-by-area.txt: platform admin 5,794 source lines (12.1%); migrations 0021–0024 = 1,842 lines; 33 `platform_*` SQL functions (grep -ohE 'functi…
  - …3 more in `findings.json`
- **Impact:** Engineering time and security surface (33 security-definer functions that reach across tournament boundaries for one person) went to moderating a user base that does not…
- **Recommendation:** Keep Protegido, 'Comité en cualquier torneo', Historial and Salud (they protect the April event). Freeze Personas moderation, Avisos broadcast, catalog merge and crew moderation behind a fl…

#### STRAT-13: The product name 'Polo' is an established golf label (Ralph Lauren's 'Polo Golf') and was adopted with no trademark or search check; the product lives on the domain of Diego's clinical-practice app

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - PR #22 (2026-09-28) renamed the product; DESIGN_NOTES.md 'Rename to Polo' and docs/handoff.md record no trademark, IMPI or search check
  - …2 more in `findings.json`
- **Impact:** A challenge from an established golf brand after the icons, lockup and copy are built around a cursive P would force a rebrand; 'Polo' is close to unsearchable for a gol…
- **Recommendation:** Run an IMPI search (classes 9, 41, 42) plus a USPTO/EUIPO knock-out search before any further brand investment; if unclear, choose a distinctive name now, while the user base is one test to…

#### STRAT-14: Course data is the first-run bottleneck in the target market and there is no plan to seed it: neither provider has a full card for the launch event's Day-1 course

**P2** · CONFIRMED · new · Effort L (multi-day)

- **Evidence:**
  - docs/handoff.md:17: GolfCourseAPI 'Solmar no está en la base (se carga por foto o a mano)'; :19 OpenGolfAPI 'tiene Solmar y Quivira en su lista, pero sin tarje…
  - …2 more in `findings.json`
- **Impact:** For a Mexico-first product, a new organizer's first minutes are likely spent photographing a scorecard and reviewing 18 holes per tee before any value; a wrong stroke in…
- **Recommendation:** Seed and verify the ~100 most-played Mexican courses (Los Cabos, CDMX, Monterrey, Guadalajara, Vallarta, Riviera Maya) in the shared catalog with a `verified` flag and badge; route correcti…

#### STRAT-15: The brand has no ownable signature and the owner says it still feels generic: the design direction confined personality to the feed for a product whose reason to exist is a bachelor-trip night

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - docs/handoff.md:85 'Dibujar yo diez números que parezcan lápiz sería justo lo genérico que me reclamaste'; :86 '…para que deje de sentirse genérico, dime cuál…
  - …3 more in `findings.json`
- **Impact:** Against 18Birdies, Squabbit or GameBook, Polo cannot win on breadth (GPS, 30k courses, native apps); it wins on the night itself (the auction, the snake, the ceremony).…
- **Recommendation:** Name three signature moments (the hammer on Calcutta night, the snake changing hands, the champion reveal) and give them a deliberate budget: TV choreography, sound and haptics, a voice gui…

#### TRUST-17: The operator's access is undisclosed, and the spec's promise that the social graph stays private from the admin is contradicted by the admin's own crew and person panels

**P2** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - CLAUDE.md §7 «Platform admin»: «The social graph stays private: … policies on … friendships and crews have no platform branch. Never add one.»
  - …2 more in `findings.json`
- **Impact:** The admin tooling honors the letter of the rule (no RLS branch) while the definer RPCs read the crew graph and join codes, so the spec and the product disagree and the n…
- **Recommendation:** Decide the rule and write it once: either the admin sees crews for moderation (then say so in CLAUDE.md and in the notice, and drop the join code from platform_crew), or he does not (then p…

#### UX-17: The Matrimonios draw happens only on the auctioneer's phone; the TV keeps showing the finished auction board

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - src/screens/tournament/TvScreen.tsx:21, 31-40, 88 — boards are individual, pairs, snake, auction, feed and games; nothing renders the draw or its reveal
  - …2 more in `findings.json`
- **Impact:** The dinner's second big moment is seen by one person holding a phone; the room learns the pairs from a toast or the next morning's groups.
- **Recommendation:** Persist the draw as it is revealed (or broadcast it on a realtime channel) and add a "sorteo" board the TV switches to while it runs; same for the auction's "¡Vendido!" moment.

#### UX-23: Card signing exists only when the pairs game is on: a Stableford-only tournament or a Ronda rápida has no attestation or lock at all

**P2** · CONFIRMED · new · Effort M (under a day)

- **Evidence:**
  - src/screens/tournament/ScorecardScreen.tsx:476 — the sign rows render only when `pairsOn && complete`
  - …2 more in `findings.json`
- **Impact:** Outside the first tournament's format nobody can sign a card: scores stay editable by any group member until the Comité finishes the round, disputed holes never settle f…
- **Recommendation:** Make attestation per player (a marker signs each player's card, or each player signs his own) and keep the pairs "tarjeta cruzada" as one configuration of it.

#### STRAT-17: A curious organizer cannot see Polo work before creating an account: the home page has no example tournament although the fixture engine could serve one

**P3** · CONFIRMED · new · Effort S (under 2 h)

- **Evidence:**
  - docs/review/2026-09-30/shots/home-none-15pro-light-strat-logged-out.png: code field, 'Entrar a mi perfil', 'Jugar una ronda rápida', 'Organizar un torneo', ins…
  - …1 more in `findings.json`
- **Impact:** A stranger who heard about Polo from a friend must create an account and a tournament before seeing a live board, the Calcutta or the settlement, the features that sell…
- **Recommendation:** Ship one curated, read-only demo ('Ver un torneo de ejemplo': a finished 12-player event with Calcutta, snake and settlement, plus a TV view) from the existing fixture engine, with generic…

## 7. Enhancement ideas by area

These aren't defects. They are what would make each area excellent rather than merely correct. Each panelist proposed more; these are the ones the chair would fund first, with the expected payoff and effort (S under 2 h, M under a day, L multi-day).

### 7.1 Correctness of rules and money
| Idea | Payoff | Effort |
|---|---|---|
| Keep money as a **ledger of obligations and settlements** (entry, hammer, buyback, prize, share, adjustment vs. each «Pagado»); every screen reads the outstanding balance | Removes the settlement class of bugs by construction (MONEY-01, MONEY-04, MONEY-07); a banker can read it aloud | M |
| A **«Cerrar torneo» checklist the app enforces**: pending tiebreaks → unsold lots → unassigned pesos → outstanding payments → publish | Sunday night can't close with money nobody owns (MONEY-05) | M |
| Move the panel's **property tests and independent oracle** (`evidence/MONEY/gen.ts`, `prop.test.ts`, `oracle.test.ts`) into CI, bounded to ~1,000 cases | Every future money regression is caught on the PR | S |
| **Per-person statement card** («Tu cuenta»: paid, won, owed, each with its why) for WhatsApp | Settles disputes privately | S |
| Import **WHS's published worked examples** (9-hole allocation included) as fixtures | MONEY-03 could not have shipped | S |

### 7.2 Security and privacy
| Idea | Payoff | Effort |
|---|---|---|
| **«Tus datos»** in Editar perfil: what Polo holds, devices holding my PIN, who sees my profile, download, delete | Turns rights into a product feature; answers most ARCO requests without email (TRUST-03, TRUST-09) | M |
| **Player-facing card history** (per hole: who entered, corrections, reasons) | Delivers the Reglamento's promise; settles disputes at the table (TRUST-14) | S–M |
| **Security headers asserted in CI**, plus Turnstile or an edge rate limit on anonymous sign-in and Entrar | Closes SEC-01 for good and blunts SEC-04 | S–M |
| `dataInventory.ts` checked against the migrations, feeding the privacy notice, the backup exclusions and the retention jobs | The notice can't drift from the schema again (TRUST-04) | S |
| One `<MoneyDisclaimer/>` on every money surface («Polo no mueve dinero»), plus counsel's review of the Calcutta and «casa» framing | Nobody mistakes Polo for a payment or gambling operator (TRUST-12) | S + external |

### 7.3 Reliability, offline and realtime
| Idea | Payoff | Effort |
|---|---|---|
| A **`save_hole` RPC**: one request per hole, server-side merge of only the touched fields, a conflict answer with base versions | Fixes REL-05/06/07 at the root; a quarter of the requests | M |
| **Apply Realtime payloads locally**, with one catch-up fetch on (re)subscribe, and a single `tournament_snapshot(tid)` RPC for cold loads | Sub-second updates, about 20× less traffic, one consistent read (REL-11, PERF-07, DB-10) | M |
| **Device heartbeat** (pending, rejected, last sync, app version per phone) shown in Comité › Rondas and Salud | The Comité sees «Rodrigo: 9 hoyos sin subir, versión vieja» before closing a day (REL-08) | S |
| A **trip-mode switch** (deploy freeze, minimum client version, slower polling fallback) | Operational control for the four days | S |
| A **network-chaos Playwright suite** (loss, stalls, expired token, blocked socket, 2 and 4 contexts, a two-build deploy) as regression tests with budgets | The scenarios in this review become permanent guards | M |

### 7.4 Architecture and code quality
| Idea | Payoff | Effort |
|---|---|---|
| **Generated database types** and one typed RPC client, with zod at every boundary (network, IndexedDB, localStorage) | Ends the 76 unchecked casts (ARCH-03) | M |
| One generated **tournament-table registry** feeding the store, the backup export, the cron list and the restore | Removes the drift behind ARCH-09 and DB-02 | M |
| **Engine in a Web Worker** with per-module memoisation | Jank-free boards at 60 players (PERF-10, PERF-14) | S–M |
| A **typed explanation DSL** (`{code, params}`) rendered by one formatter per locale | Consistent money formatting; a second language becomes a file (ARCH-05) | L |
| Build-time exclusion of dev routes and fixtures, with a CI check | Stops fixture chunks shipping and being precached (ARCH-07) | S |

### 7.5 Data layer and database
| Idea | Payoff | Effort |
|---|---|---|
| **Denormalize `tournament_id`** onto every round-, group- and lot-scoped table | One change unlocks Realtime filters, set-based RLS and attributed audit rows (DB-05, DB-12, DB-13) | M |
| **pgTAP plus a migration replay in CI**, built from the panel's harness (stubs, seeds, lints, idempotence) | Catches DB-02-class regressions on the PR (DB-09) | M |
| A nightly **"restore the R2 dump into a scratch Postgres and diff"** job | Turns an untested dump into a proven backup (DB-07) | M |
| **Supabase Pro for April only** (daily backups, point-in-time recovery, 7-day logs, dedicated compute) | Removes the worst of DB-07 and DB-12 for the trip; a money decision for Diego | S |

### 7.6 Performance
| Idea | Payoff | Effort |
|---|---|---|
| **Budgets as code**: per-route JS, precache ceiling, Lighthouse CI on `/t/:slug` and the Tarjeta (PERF.md proposes the numbers) | Nothing regresses silently (PERF-06) | S |
| **Route-level splitting** plus prefetching the tournament shell and snapshot while the player types his PIN | ~1 s off the first board | S–M |
| **Image renditions at upload** (WebP/AVIF, `srcset`, content-hashed) | The 869 KiB logo becomes ~30 KB (PERF-01) | S–M |
| A **board-only payload for the TV** | The TV becomes the cheapest device in the room | M |

### 7.7 Testing and delivery
The QA panel's **ten tests**, in priority order:
- **T1:** outbox concurrency and persistence (fake-indexeddb).
- **T2:** four-phone sync end to end with an offline drain.
- **T3:** money property test.
- **T4:** hand-worked Calcutta buyback and slot-tie cases.
- **T5:** SQL replay plus pgTAP, including a restore round trip.
- **T6:** row-to-state contract test (mappers, paging).
- **T7:** Tarjeta component tests.
- **T8:** rules beyond the happy path (9 holes, best-round countback, snake DNF).
- **T9:** fixture browser suite (axe, no page errors, visual diff).
- **T10:** API handler tests.

None of them helps unless `main` requires them (QA-10). Also:

| Idea | Payoff | Effort |
|---|---|---|
| Turn the `/t/_/<fixture>` routes into a **visual-regression suite** at 375/393/1024/1440/1920 px | Would have stopped ten of the visual defects in this review | M |
| A pre-trip **go/no-go workflow** (smoke, RLS, platform, push check, backup restore) against staging | One button a week before and the day before | S |
| Record the **rehearsal's writes** and replay them through the outbox and the engine in CI | Real-world traces become regression tests | M |

### 7.8 Visual design and brand
| Idea | Payoff | Effort |
|---|---|---|
| **TV v2**: an auto-fit board with plates (leader in board yellow), labelled columns, a lower-third feed ticker, the event logo on a plate | The «wow» M6 asks for; legible from the couch | M |
| **Ceremonia v2**: full-bleed reveals at TV scale, count-ups, player photo, event accent, the notation on the champion's card | The emotional peak of the trip becomes the best demo | M |
| A **photo step at claim** («Toma tu foto») | Faces replace grey initials on Entrar, the TV lots and the ceremony | S–M |
| **Share images as brand ambassadors**: the notation, the event accent and logo, a «polo» + link footer | Organic growth through WhatsApp | M |
| A **«sol» mode** for the Tarjeta beside an automatic dark mode | Legible at noon and at the dinner table | M |

### 7.9 Interaction design and core flows (motion included)
| Idea | Payoff | Effort |
|---|---|---|
| **Per-player entry** («Anoto solo lo mío»): each phone opens on its owner's row | Recall time per hole falls from ~10 s to ~3 s each; disputes surface earlier | M |
| A **visible hole transition** (slide + haptic tick) and a hammer sequence on the TV (price locks, «Vendido a …», gavel, pot counts up) | Ends the double-save error class (UX-02) and gives Calcutta night its centrepiece (MOT-04) | S–M |
| An **auction «modo cena»**: tile tap = bid, long-press = custom, hold-to-confirm hammer | ~40% fewer taps over 12 lots | M |
| **Settle-up per person** with one «Liquidado» each | The ceremony's money step takes minutes, not a debate | M |
| A **"since you last looked" board** (▲n/▼n, changed cells washed until the next view) | Answers «¿me moví?» on every glance | S–M |

### 7.10 Accessibility
| Idea | Payoff | Effort |
|---|---|---|
| **Axe and accessibility-tree gates in CI** over the fixture routes, with unique-name assertions | A11Y-01/02/04 could not have shipped | S |
| A **save announcement plus haptic** after «Guardar hoyo» | Eyes-free confirmation; fewer double saves | S |
| A **large-print Tarjeta** (one player per screen, 72 px figures) chosen automatically at large text sizes | Low-vision and presbyopic players score unaided in sun | M |
| An **accessibility statement** page and a pre-trip line in the RUNBOOK («turn on VoiceOver once, enter one hole») | Trust and a real-device check | S |

### 7.11 Copy and voice (es-MX)
| Idea | Payoff | Effort |
|---|---|---|
| **`humanError(e)`** plus a lint rule banning `e.message` in screens | No raw errors, ever (COPY-04) | M |
| **Liquidación as a per-person ledger** («ya pagó / debe / le toca / total») | Kills COPY-01/03/07 together | M |
| A **copy-lint test** (banned terms, " · ", "→", `\dº`, `\$\d{4,}`, "1 pts") over the catalog and the golden-fixture engine output | Stops the drift in COPY-22…25 for good | S |
| A **Reglamento «En corto»** (what you pay, what you can win, who holds the money, when it's paid) plus a glossary | The rules work for guests and partners (COPY-12) | M |
| A **feed commentary kit** (3–5 variants per event; streaks, honoree, leaving the víbora) | The villa-TV «dazzle» the brief asks for (COPY-15) | M |

### 7.12 Mobile and PWA
| Idea | Payoff | Effort |
|---|---|---|
| **Resume on launch** (standalone opens the last tournament) plus manifest shortcuts («Mi tarjeta», «En vivo») | One tap less on every cold start | S |
| **Real build IDs, update checks on resume and on a timer**, and a persistent «Actualizar» that waits for a safe moment | A Day-1 hotfix provably reaches all 12 phones (PWA-03) | S |
| **Badge = pending holes**, and `navigator.storage.persist()` for the outbox | Players can see unsynced scores; the queue can't be evicted (REL-18) | S |
| **PINs by WhatsApp** (`wa.me` per player) and a **QR on the Calcutta TV** (join plus install) | Twelve phones set up in minutes | S |

### 7.13 Product coherence and strategy
The three bets (STRAT):
1. **Every event recruits the next organizer.** A spectator link, TV pairing without a PIN, a public recap page, and a QR code plus «Organiza el tuyo» on every share card.
2. **Set up a trip in ten minutes.** A readiness checklist, rounds created from the settings, per-player invite links instead of PINs, a seeded catalog of Mexican courses, and an AI draft from a pasted WhatsApp message or spreadsheet.
3. **The group, not the profile, drives retention.** At the end of the ceremony: «Guarda tu resultado», «Crear el crew con los 12», «Agendar la revancha». Friends and crews merged into one group page.

Runner-up: **money settled, not just counted.** SPEI/CLABE and Mercado Pago requests from «Quién debe qué».

## 8. Roadmap

Owner types: **E**ngineering, **D**esign, **P**roduct (including Diego's decisions). Effort: S under 2 h, M under a day, L multi-day. Dates leave time for two rehearsals with real phones before the trip (Thu 8 – Sun 11 April 2027).

### 8.1 Wave 1: before the trip (blocking, dated)

**Milestones**

| Date | Milestone |
|---|---|
| **Wed 7 Oct 2026** | Stop the bleeding (below) |
| **Sun 15 Nov 2026** | Every open P0 fixed, with the regression test that would have caught it |
| **Sun 31 Jan 2027** | Trip-critical P1s fixed |
| **Sat 13 – Sun 14 Feb 2027** | **Rehearsal 1**: twelve real phones, both days simulated, Calcutta night on the TV, settlement paid by a real banker |
| **Sun 28 Feb 2027** | Rehearsal-1 findings fixed |
| **Sat 13 – Sun 14 Mar 2027** | **Rehearsal 2** (final dress rehearsal) |
| **Thu 25 Mar 2027** | Code freeze; only hotfixes behind the new update flow |
| **Wed 7 – Mon 12 Apr 2027** | Deploy freeze |

**By 7 Oct 2026: stop the bleeding**

| Item | Findings | Owner | Effort |
|---|---|---|---|
| Remove `teams`/`team_members` from the Realtime channel, or publish them. Live updates have been dead in production since #51; ship today | REL-01 | E | S |
| Fix typing in Comité sheets (13 → 1). Add a human-speed typing e2e | UX-01 | E | S |
| Point the keep-alive at a request the publishable key may make (`rpc/app_flags`). Check it goes green | DB-01 | E | S |
| Order `team_members` by a real column, and load one team-draw fixture through the real `fetchSnapshot` in CI | ARCH-09 | E | S |
| Protect `main`: required `check`, no direct pushes, production deploy waits for CI. Diego decides whether GitHub write tools go back to `ask` | QA-10 | E + P | S |
| Until fixed, hide the configurations that pay wrong money: the 9-hole option, stroke play / team-on-strokes / Low neto ranking on incomplete cards, and team format + Calcutta | MONEY-02, MONEY-03, MONEY-20 | E + P | S |
| Add a timeout to every Supabase request so one stalled push can't freeze the outbox | REL-14 | E | S |

**By 15 Nov 2026: every P0**

| Item | Findings | Owner | Effort |
|---|---|---|---|
| Settlement as a ledger: «Vía banco» and «Sin banco» net out what is already «Pagado»; payout «Pagado» sticks; «Pagado» can be undone; transfers explained | MONEY-01, MONEY-04, UX-21, MONEY-07, COPY-03, COPY-07 | E + D | M |
| Save only touched fields; merge remote changes into an open hole; one request per hole; debounce the second tap; move the toast off «Guardar hoyo» | REL-05, UX-02, PWA-01, REL-06, REL-07 | E + D | M |
| Outbox: never drop a newer write to the same hole; fake-indexeddb concurrency suite (QA's T1) | ARCH-01, QA-06 | E | M |
| Restore restores every table again, with a round-trip test that changes side-game rows | DB-02 | E | S |
| Rejected writes go to a server-side inbox the Comité sees; «Terminar ronda» warns about phones with unsent holes; admin writes can't bypass round/card state | REL-08, REL-09, REL-16 | E | M |
| Fix the platform money P0s, then unhide the configurations: 9-hole allocation per WHS, rank by holes played, team Calcutta slots | MONEY-02, MONEY-03, MONEY-20 | E | M |
| Crash and sync telemetry: error reporting with release tags, save→ack and save→other-phone latency, outbox depth, rejected writes | STRAT-02 (ARCH-10, DB-18, REL-20, PERF-12) | E | M |
| CI replays all migrations on Postgres with pgTAP (tenancy, restore round trip, WHS parity), and migrations reach production from the pipeline after merge | DB-09 (QA-08, QA-09) | E | M |
| Fixture browser suite (axe, no page errors, visual diff) and one multi-phone sync e2e in CI | QA-11, QA-17, QA-12 | E | M |

**By 31 Jan 2027: trip-critical P1s**

| Item | Findings | Owner | Effort |
|---|---|---|---|
| Sync model: one snapshot RPC, apply Realtime payloads locally, set-based RLS, cold open from cache first. Target save→other phone p95 < 2 s | REL-11, PERF-07, PERF-08, DB-12, REL-02, REL-03, REL-10, REL-15 | E | L |
| TV and Ceremonia at room scale: all rows paged, fixed Matrimonios/Calcutta slides, sold moment on the auction TV, readable «Siguiente», event accent | VIS-03, VIS-04, VIS-06, A11Y-04, MOT-04 | D + E | M |
| Money screens aligned (grid cascade) | VIS-01 | D + E | S |
| iPhone standalone polish: safe-area header, update checks on resume/timer with a real build ID, back closes sheets and guards a half-entered hole, offline share | PWA-02, PWA-03, PWA-05, PWA-04 | E | M |
| Accessibility: player names in Tarjeta control labels, a real close button and name on the player sheet | A11Y-01, A11Y-02 | E | S |
| Privacy: a working rights mailbox (MX record or another address), a notice that matches the product and the LFPDPPP (counsel review), notice and acceptance where data is collected, deletion that anonymizes | TRUST-01, TRUST-02, TRUST-03, TRUST-04, TRUST-05 | P + E | M + external |
| Disaster recovery for April: a restore drill of the R2 dump, a written RPO/RTO, and Diego's decision on Supabase Pro for the trip month (costs money) | DB-07 | E + P | M |
| Security headers (CSP, frame-ancestors, nosniff, referrer policy) asserted in CI | SEC-01 | E | S |
| Organizer path to a playable tournament: rounds from the wizard, a readiness checklist | UX-06 (STRAT-04), UX-03 | P + D + E | M |
| Formats that contradict their boards: fix or hide match play and team formats | STRAT-03 | P + E | M |
| Raw technical errors replaced by `humanError` (lint rule), and copy regressions cleaned up with a copy-lint test | COPY-04, COPY-24, CHAIR-01 | E | M |
| Contest claims survive group edits; the Comité can rule on claimed holes | DB-03, DB-04 | E | S |
| Tests that pin money edges: buybacks, settlement legs, the data layer | QA-03, QA-07 | E | M |
| Logo renditions and route-level splitting | PERF-01, PERF-02 | E | M |

Everything else at P2/P3 is candidate work after the P1s. The rehearsals decide which of it matters for April.

### 8.2 Wave 2: next 90 days (the gap to flagship)

| Theme | What | Findings | Owner | Effort |
|---|---|---|---|---|
| A sync engine, not refetch-everything | `save_hole` RPC with base versions, local-first store, conflict inbox for the Comité, device heartbeats | REL-05/06/07/11, DB-05/10/12/13/14 | E | L |
| Money as a ledger, end to end | Obligations and settlements, «Cerrar torneo» gate, per-person statements, integer-peso invariants in CI | MONEY-01…07, MONEY-08…13 | E + D | L |
| Quality gates that match the risk | Visual regression over every fixture × viewport, axe/AX-tree gates, bundle and Lighthouse budgets, mutation score on engine and outbox, Renovate | QA-12…21, PERF-06, A11Y-*, VIS-* | E | M |
| Show surfaces as broadcast products | TV v2 (plates, arc-minute type scale, moment queue), Ceremonia v2, auction «modo cena», remote control from the admin phone | VIS-05/07/08, MOT-01/05/08/23, UX-13/17/18 | D + E | L |
| A design system that closes | Dark and «sol» modes, hover and laptop/tablet layouts, a vector mark, primitives that own naming and focus, one link style | VIS-09…17, VIS-19…28, A11Y-03/05/06/12/13/17 | D + E | L |
| Copy as a system | Engine returns keys and params; ICU plurals and gender; Reglamento generated from settings and tested; feed commentary kit | ARCH-05, COPY-10…23 | E + D | L |
| Trust as a product surface | «Tus datos», player card history, operator access log, retention jobs, a `MoneyDisclaimer` | TRUST-06…24, SEC-02…11 | P + E | M |
| Organizer activation | Invite links instead of PINs, bulk players, seeded Mexican course catalog, AI draft from a pasted message | UX-20, STRAT-04/14 | P + E | L |

### 8.3 Wave 3: long term (bets)

| Bet | Why | Findings | Owner | Effort |
|---|---|---|---|---|
| **Every event recruits the next organizer**: spectator link, TV pairing without a PIN, public recap, QR code and «Organiza el tuyo» on every share | The trip is watched by several times more people than play it; today they see nothing | STRAT-05, STRAT-17, PWA-06 | P | L |
| **Set up a trip in ten minutes**: readiness checklist, per-player invites, catalog, AI draft | The organizer is the bottleneck of the platform | STRAT-04, STRAT-14, UX-06 | P | L |
| **The group, not the profile, drives retention**: save-your-result, crew-of-the-12 and rematch prompts at the end of the ceremony; friends and crews merged | The retention loop never starts for the launch cohort | STRAT-06/07/08/10 | P | L |
| **Money settled, not just counted**: SPEI/CLABE and Mercado Pago requests from «Quién debe qué», with counsel's view on gambling-law exposure first | The biggest friction among friends; the Mexican answer to Venmo inside Squabbit | TRUST-12, TRUST-13 | P | L |
| **Clear the brand**: trademark search before investing further in «Polo» | «Polo Golf» is an established Ralph Lauren line | STRAT-13 | P | S + external |

## 9. What is already excellent

These strengths were checked by at least one panelist. Protect them while fixing everything else.

- **The rules engine.**
  - `computeTournament` is a pure function of one snapshot: no clock, randomness or DOM in engine code.
  - An independent re-implementation of §5, written from the brief, agrees with it on 3,000 random tie-heavy copies of the first tournament. That covers handicaps with the Day-2 cut, points, countback (including ties that survive it), best round, pairs, the snake from the 10th tee, fewest putts and the whole Calcutta.
  - Across 6,200 random tournaments it is deterministic, independent of input order and module-separable, and its flows net to zero.
  - Every prize carries an explanation (MONEY, ARCH).
- **The §6 test cases, written as given.** `handCalc.test.ts` pins a hand-worked group, and every engine fix from the last sweep has a regression test. Every mutant aimed at a §6 case or a prior fix was killed. The 339 tests run in 8 s and give the same result under four time zones and shuffled order (QA).
- **One WHS rulebook in two languages.** Integer-tenths arithmetic in SQL and TypeScript, driven by one case file. The two sides agreed on 7,000 random cases plus 1,000 adjusted-gross cards (MONEY).
- **The tenant boundary.**
  - It holds on production for a stranger and for a claimed player.
  - On a full local replica it held across a 5-persona read matrix, a 30-statement write matrix, a 20-RPC misuse sweep and storage-path tests.
  - All 179 `security definer` functions pin `search_path`. PIN hashes live in a policy-less table. There is no runtime write path into `platform_admins`, and the social graph has no platform-admin branch.
  - No secrets in git history or the bundle (SEC, TRUST).
- **The outbox never lost a score to the network.** 36 of 36 scores arrived after nine holes in airplane mode, and 12 of 12 with every other request dropped. Queued writes survive a reload, an app update and two days closed. The update offer never reloads a dirty Tarjeta (REL, PWA).
- **The score write path under load.** 5,867 upserts in 20 s from four concurrent writers, with no failures or deadlocks; contested rows were flagged as designed (DB).
- **Transactional Comité paths.** Restore, groups, draw and teams run as single-transaction RPCs that validate before deleting. `backupTables.test.ts` and `platformGuard.test.ts` encode team knowledge as tests (DB, QA).
- **The Tarjeta hole view and the scorecard grid.** Four players and «Guardar hoyo» fit on one 393×852 screen, with a 56 px hole number and par defaults. The grid, with par/SI, Ida/Vuelta and pencil notation, is the one screen a golfer would call a real scorecard. An all-par hole takes one tap (UX, VIS).
- **Zero-install join.** Link, face, PIN. The PIN keypad auto-submits and handles a wrong entry gracefully (UX, STRAT).
- **Design-system discipline.** No colour literal outside `tokens.css`, enforced by a test. One 47-icon set and no emoji. The motion vocabulary is enforced by a test, and reduced motion is honoured at the root (VIS, MOT, A11Y).
- **Recovery and offline copy.** «Reiniciar no borra tu sesión…», consequence-first confirmations in the Comité, and 107 of 108 SQL errors in plain Spanish (COPY).
- **PWA foundations.** Installable with no Chrome errors. A maskable icon inside the safe zone, fingerprinted icons, a no-bundle boot fallback, a 16 px input floor, and a wake lock on the TV (PWA).

## 10. Method

**Shape of the review.** The chair established the baseline (§4), then convened fifteen independent panelists and four baseline builders as parallel agents:
- three screenshot builders, which produced the 484-shot canonical matrix;
- a local Postgres harness;
- a history mapper, which covered 341 earlier items.

Every panelist worked from the same brief with the same rules: review only, evidence or it didn't happen, and data safety. They wrote their findings and an area grade independently. The chair merged the 327 raw findings (325 from the panel, 2 from the chair) into **282** under their root causes; 45 were duplicates. Every P0 and P1 went to one of thirteen **adversarial verifiers**. None of them had written the finding, and each was told to disprove it: reproduce it independently, attack reachability and mitigations, and judge severity against the definitions. What survived is marked CONFIRMED (the verifier reproduced it) or PLAUSIBLE (evidence holds but reproduction needs something unavailable here, stated in the finding). The chair then ruled on disagreements (§3.2) and applied the brief's caps and regression rule.

| Panelist | Area | What they ran |
|---|---|---|
| ARCH | Architecture | Static map of engine/data/UI; counts of `any`/casts/`!`; typed-lint run; import-cycle (Tarjan) analysis; hard-coded-assumption sweep; six defect probes in scratch vitest |
| MONEY | Rules and money | Hand derivation of a full group and the whole Calcutta; an independent §5 oracle vs the engine on 3,000 tournaments; property tests on 6,200 random tournaments; SQL↔TS WHS parity on 7,000+ cases in a private Postgres |
| SEC | Security | Static review of every policy, grant and 179 definer functions; live anon-key probes on production; a harness read/write/RPC/storage matrix; a link-token race; lockout brute-force math; header and bundle/history secret scans |
| DB | Database | Migration review; splinter advisor lints on the replay; EXPLAIN ANALYZE of RLS cost at 12 and 60 players; pgbench-style concurrent upserts; a restore drill of 0011 vs 0020; keep-alive run history |
| REL | Reliability | Playwright scenarios on Ensayo: airplane mode for nine holes, every other request dropped, four phones on one hole, a deploy mid-round, a round finished with queued scores, two days closed, expired token, lie-fi; save-to-other-phone latency over a Node-bridged Realtime socket |
| PERF | Performance | Sourcemapped bundle attribution; Lighthouse simulated and applied; Event Timing latency at 4× CPU; React commit counting; engine benchmarks; 24-minute memory sessions; Realtime frame accounting |
| QA | Testing and delivery | Coverage by directory in a scratch copy; 24 targeted mutants; timezone and shuffle determinism runs; CI history (187 runs); a live reproduction of the outbox loss on Ensayo |
| VIS | Visual design | Review of all 484 canonical shots plus its own; token, icon and wordmark renders at 16–512 px; ΔE2000 accent distances; TV arc-minute legibility; layout measurements in the browser |
| UX | Interaction | Scripted journeys with tap counts and timings at 393×852; keystroke-level estimates; Comité sheet typing at human speed; target measurements |
| MOT | Motion | Inventory of every animation; rAF and trace frame timing at 4× CPU; reduced-motion runtime checks; video capture; a simulated auction on a dev server |
| A11Y | Accessibility | axe-core on 85 route/state scans; CDP accessibility-tree review; keyboard walk; 200% text and 320 px reflow; forced colours; glare simulation; target and contrast measurements |
| COPY | Copy | `es-MX.ts` end to end; greps for strings outside the catalog, engine text and SQL messages; money copy on fixtures; Reglamento read as a non-golfer |
| PWA | Mobile and PWA | CDP installability; manifest and icon checks; safe-area emulation (`setSafeAreaInsetsOverride`); update-flow and back-gesture scripts; share-card renders online and offline |
| STRAT | Product | Surface inventory and line counts per area; a cold new-organizer walk; git and PR timing analysis; competitive scan (18Birdies, Golf GameBook, TheGrint, Squabbit, Settle Up Golf, Calcuttapp, BlueGolf, Golfshot, Arccos) |
| TRUST | Privacy and compliance | Legal pages vs the schema and processors; DNS checks for the rights mailbox; harness scenarios for visibility, deletion and operator access; LFPDPPP expectations (not legal advice) |

**Verification.** Thirteen verifier batches (V1–V13) covered every P0/P1 after merging, in five rough groups:
- money settlement and rules;
- outbox, Tarjeta and Comité forms;
- database and platform;
- security and privacy;
- organizer flow, telemetry, testing, mobile/accessibility, realtime and sync, TV and money layout, and performance.

Verifiers wrote their own repros: engine tests, fake-indexeddb outbox races, harness transactions, Node Realtime clients, and Playwright on their own preview servers. They corrected facts where findings overstated them, and downgraded several (e.g. SEC-01, COPY-03, MONEY-07, UX-03, STRAT-01, REL-06/07/08/14). Each finding's **Verification** line records what its verifier ran.

**What could not be checked, and why.**
- **The service-key suites** (`scripts/rls-test.mjs`, `scripts/platform-test.mjs`, `e2e/profile.mjs`, `e2e/platform.mjs`) **and the live Supabase advisors.** This environment has neither `SUPABASE_SECRET_KEY` nor `SUPABASE_PAT`, and the Supabase connector is denied on the project. Substituted: a local Postgres 16 replay of all 24 migrations on Supabase-compatible stubs (auth, storage, vault, pg_net), Supabase's own splinter lints (405 results, none at ERROR), and the tenancy matrix on seeded tenants. Stubs are not Supabase: PostgREST limits, Realtime and Auth behaviour were tested on production only through the anon key.
- **Real iPhones and Safari/WebKit.** Only Chromium is available. iOS-only claims (the status bar in the installed app, Dynamic Type, iOS double-tap) are marked PLAUSIBLE or reasoned from CSS and Apple's documented behaviour.
- **Chromium's Realtime socket.** The sandbox's egress relay answers Chromium's WebSocket handshake to Supabase with HTTP 500, while Node gets 101. Realtime was therefore tested from Node clients and a Node-bridged socket. REL-01 was isolated without a browser.
- **Nightly R2 backups, Vercel logs beyond the MCP's read scope, email delivery, push to real devices, and the auth email templates.** No credentials for them here.
- **Timing measurements** ran on a shared 4-CPU container with other agents. Every timing records its load average and median of several runs; absolute numbers are indicative, and relative comparisons are sound.
- **The auction mid-lot and the pairs draw** exist in no shipped fixture. MOT, UX and SHOTS-B simulated them in the browser only (marked "patched" or "synthetic").
- **The Calcutta night flow on Ensayo** (auction, draw, restore) was run only by REL, which owned Ensayo's state.

**Production side effects.**
- **Anonymous sessions:** about a dozen anonymous auth sessions from reviewers' browsers. No email accounts were created.
- **Ensayo writes:**
  - The repo's own e2e smoke: a one-stroke nudge, a contest mark, and a backup export/restore round trip, which the smoke is designed to leave in place.
  - QA's reproduction of the outbox loss, with the hole put back.
  - REL's scenarios.
- **Ensayo restored:** REL recorded Ensayo before its runs and restored it. It diffed twice to confirm that all 360 score rows, rounds, `current_round_id`, groups, players, tiebreaks, awards and signatures match. The only residue is the server-set `updated_at` on 69 rows and the audit-log entries.
- **Nothing else touched:** no real tournament, account, payment or setting was touched, and nothing that costs money was used.

**Interruptions.** Two usage limits paused the panel for about 16 hours, and the container restarted once. Every agent resumed from its own transcript. The shared preview server was not restarted after it reached its background time limit; later agents used their own.

## Appendix A. Status of every earlier finding

All 327 de-duplicated items from the earlier audits and documents, with the chair's corrections marked "(chair)". Fixed items are condensed; the full mapper output is summarized in §5.

#### docs/audit-2026-09-28.md

78 items: 5 regressed, 6 still open, 19 partly fixed, 48 fixed, 0 obsolete.

| ID | Sev. | Status | Finding | Evidence at HEAD |
|---|---|---|---|---|
| AUD-P0-10 | P0 | **regressed** (chair) | Restore from backup was ~20 sequential requests with no transaction, deleting first; native confirm(). | Chair: the restore is transactional, but 0020's restore_tournament stopped restoring side-game entrants, bet results and hole awards, which 0011 restored (DB-02, drilled on the harness). |
| AUD-P1-36 | P1 | **regressed** (chair) | 9-hole rounds got ~60% too many strokes. | Chair: the fix overcorrected. 9-hole rounds now get about half the strokes due (PH 16 → 4 instead of 8), and cleanup.test.ts asserts the wrong number. Reproduced by MONEY-03/ARCH-02/QA-02 and confirmed by verifier V2 (P0; one severity higher as a regression). |
| AUD-P2-20 | P2 | regressed | Hard-coded user-visible strings outside es-MX.ts (joins " y ", " & ", " contra ", " + ", "(copia)", "º lugar", "(damas)", grid headers, English aria-… | f425068 (#28) moved most strings; at f425068 `git grep "join(' y ')"` finds 0 hits in src/*.tsx, while 4 " & " joins were never moved; Now: " & " in src/screens/admin/AdminScores.tsx:185, AdminDraw.t… |
| AUD-P2-34 | P2 | regressed | Pre-push guard matched only literal `git push`; GitHub write tools in `allow` bypassed it; no git-level hook. | Fixed in f425068 (#28): scripts/prepush-guard.sh:11-14 matches any `git … push`; .githooks/pre-push added; `.claude/settings.json` at f425068 put mcp__github__push_files, create_or_update_file and de… — Deliberate trade-off (Diego asked for no prompts, CLAUDE.md §0.1) but it contradicts §0.3 "don't we… |
| AUD-P2-35 | P2 | regressed | .env.example missing most server-side names; design-organizer read SUPABASE_SERVICE_ROLE_KEY; .env.local parser rejected names with digits. | Fixed in f425068 (#28): scripts/lib/env.mjs loader; design-organizer reads SUPABASE_SECRET_KEY; .env.example listed every server-side name then; Broken again by 72f91ec (#42): .env.example has no VAP… |
| AUD-P2-12 | P2 | still open | Sheets closed on backdrop/Escape and discarded the player form or a just-read scorecard draft with no confirm. | src/components/ui.tsx:105 backdrop click and :88-92 Escape call onClose unconditionally; no dirty/unsaved guard in AdminPlayers.tsx or AdminCourses.tsx (grep "dirty\|discard\|unsaved" → none) |
| AUD-P2-13 | P2 | still open | Avatar uploaded on pick (before save) to a random path; orphans on cancel. | src/screens/admin/AdminPlayers.tsx:144-152 uploads immediately to `${tournamentId}/avatars/${editing.id ?? crypto.randomUUID()}.jpg`; cancelling a new player orphans the file, cancelling an edit leav… |
| AUD-P2-15 | P2 | still open | Manual tees always 18 holes; start holes only 1/10; pasteError hard-codes 18; no 9-hole card possible. | src/screens/admin/CourseEditor.tsx:47 blank tee is always 18 holes; src/screens/admin/AdminGroups.tsx:230-232 start options 1 and 10 only; src/i18n/es-MX.ts:1677 "Necesito 18 números por línea" — Contradicts CLAUDE.md §0.5 ("don't hard-code … 18 holes per round") although the engine supports 9-… |
| AUD-P2-16 | P2 | still open | drawGroupsFromPairs with no tiers made groups of two regardless of groupSize. | src/lib/pairing.ts:67-75: pairs are bucketed by kind and group i takes one pair of each kind, so with a single kind every group is one pair; groupSize is never read |
| AUD-P2-17 | P2 | still open | Provider adapters silently fabricated SI 1–18 / par 4; mergeHits could absorb a course-level hit into its club. | src/lib/courseProviders/golfcourseapi.ts:42-48 and opengolfapi.ts:50 still fall back to par 4 and SI i+1 (and renumber duplicate SIs); AdminCourses.tsx:100 opens provider drafts with no notes, so the… |
| AUD-P2-38 | P2 | still open | design/shots was 58 MB of committed JPEGs. | `du -sh design/shots` → 64M, 523 tracked files (git ls-files design/shots \| wc -l); pack size 66.47 MiB (git count-objects -vH) — Grew from 58 MB. |
| AUD-P0-4 | P0 | partly fixed | Scores queued offline were deleted when RLS rejected them (round finished / card signed before flush). | 04b2216 (#23): rejections are persisted in a Dexie "rejected" table and shown in red (src/data/outbox.ts:124-134, src/components/RejectedWrites.tsx:15-60, ScorecardScreen.tsx:475,612, AdminScores.tsx… — Nothing is silently deleted any more; recovery depends on the player noticing and telling the Comit… |
| AUD-P0-12 | P0 | **partly fixed** (chair) | PostgREST 1,000-row cap never handled (60 players × 2 rounds truncated standings, money and backups). | Chair: every tournament read is paged, but paging infers the last page from a hard-coded 1,000 and the shared course list is not paged (DB-20). |
| AUD-P1-29 | P1 | **partly fixed** (chair) | PIN lockout never reset, and any visitor could lock every player out from Entrar. | The lock now resets; the lockout can still be triggered against other players (SEC-04; details withheld from the public copy, CHAIR-02). |
| AUD-P1-32 | P1 | partly fixed | Status transitions unguarded: any jump in Torneo; "Iniciar ronda" without groups; stealing current_round_id; "Reabrir" of a cancelled round went stra… | Rounds fixed in ee69057/#19: src/screens/admin/AdminRounds.tsx:63-70 needs groups and asks when another round is live; finish/cancel/delete confirm in a sheet (:103-112,180-188); Still open: Torneo s… |
| AUD-P1-34 | P1 | partly fixed | Deleting a player or a tee cascaded silently (pairs, signatures, payments, lots, scores; round_tees and default_tee_id across tournaments). | ee69057 (#26): player delete names what goes and is blocked with scores or a sold lot (src/screens/admin/AdminPlayers.tsx:392-401); tees in round_tees cannot be deleted (supabase/migrations/0010_admi… |
| AUD-P1-37 | P1 | partly fixed | Snake, stats and the Tarjeta indexed holes by array position; a tee with a missing hole shifted everything. | Snake fixed in 635f709: src/engine/modules/snake/index.ts:74 finds by hole number; Still positional: src/screens/tournament/ScorecardScreen.tsx:139,155,344,350-372 and src/screens/tournament/PlayerSh… — Only reachable with a tee missing a hole (imports, merges); the Comité editor always produces conti… |
| AUD-P1-38 | P1 | **partly fixed** (chair) | Share image on iOS failed with NotAllowedError instead of downloading; fonts not awaited; pairs money chip clipped. | Chair: the NotAllowedError fallback exists, but sharing fails offline and stays broken for the session because of cacheBust (PWA-04, confirmed by V8). |
| AUD-P1-39 | P1 | partly fixed | `public._migrations` had no RLS; lookup_tournament exposed more of the roster than needed. | `_migrations` fixed (0010); the anonymous lookup still returns more of the roster than the join step needs (SEC-06; details withheld from the public copy, CHAIR-02). |
| AUD-P2-2 | P2 | partly fixed | Tiebreak buttons ignored busy; raw PostgREST English errors in "Guardar hoyo" and toasts; `pending` counted every tournament. | Fixed: busy on tiebreak buttons (ScorecardScreen.tsx:622); pending per open tournament (src/data/outbox.ts:101-104); sync errors mapped to Spanish (outbox.ts:118-123); Still open: api.ts `unwrap`/`rp… |
| AUD-P2-7 | P2 | partly fixed | Dev routes (/design, /t/_/<fixture>) shipped to production with real player names and fixture admins. | f425068 (#28): routes only when DEV or VITE_DESIGN_ROUTES=1 (src/app/router.tsx:59-60,170-185); fixtures use invented names; Still open: the lazy chunks are still emitted and precached in production:… — No longer a data exposure; now a bundle/precache weight issue (PERF). |
| AUD-P2-10 | P2 | partly fixed | Explanation strings: 6.666666666666667%, "Día N" mislabel, hard-coded "hoyo 18"/"3-putt", "5 ÷ 2 = 2 golpes", " · " and "→" joins, no tie explanation… | Fixed in 635f709/f425068: pct formatting (auction/index.ts:220), real round numbers, tie explanations; no "→" left in src/engine; Still open: money in prize explanations is unformatted — src/engine/c… |
| AUD-P2-11 | P2 | partly fixed | Tests missing: 9-hole, >2 rounds, groups of 2–3, DNF, tiers:[] with auction, multi-lot isPaid; a conditional that asserted nothing; a test asserting… | 635f709 (#25): src/engine/cleanup.test.ts:20-175 covers 9-hole, rounds 3+, withdrawal, tiers [] + auction, multi-lot paid; games.test.ts:55-72 pairs assertions are unconditional; handCalc.test.ts:101… |
| AUD-P2-14 | P2 | partly fixed | Wizard: switching template reset "Ajustar reglas" edits; browser Back left the wizard. | fcbfa16/#50: replacing edits with a preset now asks (src/screens/organizer/NewTournamentScreen.tsx:151,165); Still open: steps are local state only (NewTournamentScreen.tsx:44,100-103), no history en… |
| AUD-P2-19 | P2 | partly fixed | "Duplicar" did not copy PINs, pairs, groups or banker and did not say so; setPaymentPaid select-then-insert duplicated rows. | Fixed: set_payment_paid, one row per flow (supabase/migrations/0010_admin_safety.sql:317-336); Still open: duplicate_tournament still copies no PINs, pairs, groups, banker or co-organizers (supabase/… |
| AUD-P2-22 | P2 | partly fixed | RUNBOOK/README/handoff named old sections and buttons, the vercel.app URL and an expired token; design-shots waited for "Toca tu cara". | Fixed: section names (Tarjetas, Estadísticas y premios), golf.cardigan.mx URL, design-shots wait (scripts/design-shots.mjs no longer waits for the old text); Still open in RUNBOOK.md: "Sacar del somb… |
| AUD-P2-24 | P2 | partly fixed | Sheet: no focus move/restore/trap; nested sheets shared one Escape; body scroll reset early; title-less sheets unnamed. | f425068 (#28) + #48: src/components/ui.tsx:60-102 focus moves in and back, Escape closes only the innermost, scroll restored with the last sheet; aria-label fallback t.common.dialog (:43); Still open… |
| AUD-P2-25 | P2 | partly fixed | Board rows' accessible name was a concatenation of figures; Segmented was a fake tablist. | Fixed: LeaderRow aria-label is a sentence (src/components/primitives.tsx:138, t.live.rowLabel); the Segmented primitive is a radiogroup (primitives.tsx:80-89); Still open: seven hand-rolled `.segment… |
| AUD-P2-26 | P2 | partly fixed | Targets below 44 px (.btn--sm 36, steppers 40, hole/grid cells 36); clickable <tr> in Estadísticas. | Fixed: .btn--sm is 44 px on coarse pointers (src/styles/global.css:235-245); Estadísticas opens a player from a button; Never took effect: f425068 added `min-height: 40px` to .gridCellBtn but the old… |
| AUD-P2-32 | P2 | partly fixed | TV showed the top 12 and clipped the rest; no wake lock. | d0465fe (#27): src/screens/tournament/TvScreen.tsx:47-57,98-101 pages the individual board by 12 and holds a screen wake lock; Still clips: the instance-game boards added later render `.rows.slice(0,… |
| AUD-P0-1 | P0 | fixed | Every PIN-linked player got the Comité UI (isOrganizerOf read all org… | 04b2216 (#23) isOrganizerOf by own row; ee69057 (… |
| AUD-P0-2 | P0 | fixed | Saving groups deleted and re-inserted them, cascading away every snak… | ee69057 (#26): upsert_groups updates groups in pl… |
| AUD-P0-3 | P0 | fixed | Outbox dropped a score after 20 failed pushes on network errors. | 04b2216 (#23): src/data/outbox.ts:284-290 keeps n… |
| AUD-P0-5 | P0 | fixed | Cold open with no signal showed an error screen instead of the last b… | 04b2216 (#23): src/data/snapshotCache.ts (Dexie `… |
| AUD-P0-6 | P0 | fixed | Unfillable Calcutta slots were paid to the champion's owner as "Redon… | 635f709 (#25): unfilled slots flagged and kept wi… |
| AUD-P0-7 | P0 | fixed | "Picked-up hole counts 3 putts" never applied because the Tarjeta alw… | 635f709 (#25): src/engine/modules/fewestPutts/ind… |
| AUD-P0-8 | P0 | fixed | Fewest putts ranked by raw total, so the player with the fewest holes… | 635f709 (#25): src/engine/modules/fewestPutts/ind… |
| AUD-P0-9 | P0 | fixed | "Pagado" for Calcutta marked every lot of a multi-lot owner paid afte… | 635f709 (#25): src/engine/core/money.ts:161-171 c… |
| AUD-P0-11 | P0 | fixed | Adding a round with an existing number silently overwrote that round. | ee69057 (#26): src/data/api.ts:350-356 insert vs… |
| AUD-P0-13 | P0 | fixed | A new deploy reloaded phones mid-hole (autoUpdate + immediate reload). | 04b2216 (#23): vite.config.ts:32 `registerType: '… |
| AUD-P1-14 | P1 | fixed | Second to fourth players of a hole reached the server 5 s late (queue… | 04b2216 (#23): src/data/outbox.ts:293-298 re-flus… |
| AUD-P1-15 | P1 | fixed | Boards stayed stale after reconnect; overlapping reloads had no seque… | 04b2216 (#23): src/data/tournamentStore.ts:70-79… |
| AUD-P1-16 | P1 | fixed | "Guardar hoyo" hid behind the tab bar on short screens. | d0465fe (#27): src/screens/tournament/ScorecardSc… |
| AUD-P1-17 | P1 | fixed | Juegos "Hoyo" column showed cross-round thru (F after Day 1, 19–36 on… | d0465fe (#27): src/screens/tournament/GamesScreen… |
| AUD-P1-18 | P1 | fixed | Start hole 10 broke "Grupo puntero en el hoyo N" and the honoree's la… | d0465fe (#27): src/lib/holes.ts:14-30 (play order… |
| AUD-P1-19 | P1 | fixed | Swipes leaked through sheets in the Tarjeta (tiebreak answer committe… | d0465fe (#27): src/screens/tournament/ScorecardSc… |
| AUD-P1-20 | P1 | fixed | Course editor could not remove a tee (parent re-synced tees during re… | ee69057 (#26): src/screens/admin/CourseEditor.tsx… |
| AUD-P1-21 | P1 | fixed | Pending photo/course refs leaked between flows, attaching a scorecard… | ee69057 (#26): src/screens/admin/AdminCourses.tsx… |
| AUD-P1-22 | P1 | fixed | Hammer after a failed sale opened the buyback for an unsold lot; self… | ee69057 (#26): src/screens/admin/AdminAuction.tsx… |
| AUD-P1-23 | P1 | fixed | Draw of 14+ pairs wrote "09:60" tee times after pairs were saved, los… | ee69057 (#26): src/lib/teeTimes.ts:1-12 withTeeTi… |
| AUD-P1-24 | P1 | fixed | Comité tiebreak answers went through the outbox and toasted "Guardado… | ee69057 (#26): src/screens/admin/AdminScores.tsx:… |
| AUD-P1-25 | P1 | fixed | Comité score edits had no client validation (empty → 0, putts > strok… | ee69057 (#26): src/screens/admin/AdminScores.tsx:… |
| AUD-P1-26 | P1 | fixed | Admin (PIN) players saw course/scorecard buttons that RLS rejected; d… | ee69057 (#26): can_manage_courses admits admin pl… |
| AUD-P1-27 | P1 | fixed | "Si terminara ahora" paid everyone before a single score (twelve T1 r… | 635f709 (#25): src/engine/modules/individual/inde… |
| AUD-P1-28 | P1 | fixed | Admin could overwrite a signed card from the Tarjeta with no reason. | d0465fe (#27): src/screens/tournament/ScorecardSc… |
| AUD-P1-30 | P1 | fixed | Comité `reason` on scores was sticky and player-settable; `disputed`… | ee69057 (#26): scores_detect_dispute ignores reas… |
| AUD-P1-31 | P1 | fixed | Unbalanced prize pool could be saved from Torneo; the check used a ha… | ee69057 (#26): src/screens/admin/AdminTournament.… |
| AUD-P1-33 | P1 | fixed | /api/scorecard-extract and /api/course-search unauthenticated and unt… | ee69057 (#26): src/server/auth.ts:26-45 requireCo… |
| AUD-P1-35 | P1 | fixed | Cut compounded for rounds 3+ (undefined by §5.2). | 635f709 (#25): `day2Cut.mode` previous\|cumulativ… |
| AUD-P2-1 | P2 | fixed | Undo toast after saving a hole only navigated back; nothing was undon… | d0465fe (#27): src/screens/tournament/ScorecardSc… |
| AUD-P2-3 | P2 | fixed | "Sin señal" in the shell (Realtime) and the Tarjeta chip (navigator.o… | d0465fe (#27): src/screens/tournament/TournamentS… |
| AUD-P2-4 | P2 | fixed | Tarjeta showed "3 pts, birdie neto" in red for untouched default valu… | d0465fe (#27): src/screens/tournament/ScorecardSc… |
| AUD-P2-5 | P2 | fixed | `roundNotLive` copy shown for a finished round between days. | d0465fe (#27): ScorecardScreen.tsx:63,609; src/i1… |
| AUD-P2-6 | P2 | fixed | Logo and avatars not cached offline. | 04b2216 (#23): vite.config.ts:71-78 Workbox Cache… |
| AUD-P2-8 | P2 | fixed | Prize-pool check assumed uniform group size (11 players balance at se… | 635f709 (#25): src/engine/settings/prizeCheck.ts:… |
| AUD-P2-9 | P2 | fixed | Unsold lot at tournamentFinal cashed as self-owned with paid 0 and no… | 635f709 (#25): src/engine/computeTournament.ts:16… |
| AUD-P2-18 | P2 | fixed | Join code generated client-side with no uniqueness check. | ee69057 (#26): create_tournament uses generate_jo… |
| AUD-P2-21 | P2 | fixed | Copy defects: "scores"/"stats" in stats.noData, "o más más recienteme… | f425068 (#28): src/i18n/es-MX.ts:1887 noData, :47… |
| AUD-P2-23 | P2 | fixed | No MotionConfig reducedMotion="user". | f425068 (#28): src/main.tsx:31 `<MotionConfig red… |
| AUD-P2-27 | P2 | fixed | .locked opacity .55 and --ink-3 on --surface (4.3:1) below AA; disabl… | f425068 (#28): src/styles/tokens.css:14 --ink-3 #… |
| AUD-P2-28 | P2 | fixed | maximum-scale=1 blocked pinch zoom; orientation portrait locked table… | f425068 (#28): index.html:6-7 viewport without ma… |
| AUD-P2-29 | P2 | fixed | /imprimir printed inside the 560 px column, no @page, blank last page… | d0465fe (#27): src/screens/tournament/PrintScreen… |
| AUD-P2-30 | P2 | fixed | Shell bottom padding plus tab-bar safe-area padding left a floating s… | d0465fe (#27): src/app/AppShell.module.css:15,27… |
| AUD-P2-31 | P2 | fixed | Player sheet scorecard clipped at hole 8; Ida/Vuelta cells stacked tw… | d0465fe (#27): src/components/primitives.tsx:208… |
| AUD-P2-33 | P2 | fixed | Estadísticas "varianza 1.641" and long units crowded the award row. | f425068 (#28): src/i18n/es-MX.ts:1898 variance wi… |
| AUD-P2-36 | P2 | fixed | e2e/smoke.mjs accepted any E2E_SLUG with no ensayo guard although it… | f425068 (#28): e2e/smoke.mjs:18-22 refuses slugs… |
| AUD-P2-37 | P2 | fixed | CI ran check twice per PR; five exhaustive-deps suppressions; e2e/ un… | f425068 (#28): .github/workflows/ci.yml:3-8 push… |
| AUD-P2-39 | P2 | fixed | Simulator nits: Day-1 points against the current round's tees; clampe… | f425068 (#28): scripts/simulate.mjs:69-79 tees pe… |

#### DESIGN_AUDIT.md

150 items: 3 regressed, 13 still open, 42 partly fixed, 90 fixed, 2 obsolete.

| ID | Sev. | Status | Finding | Evidence at HEAD |
|---|---|---|---|---|
| DA-A.5 | — | regressed | Emoji and glyphs used as UI (complete inventory). | Fixed by f425068 (#28): zero user-visible arrow glyphs in src/*.tsx and es-MX.ts at that commit (git grep); Now 5 user-visible "→" in copy: src/i18n/es-MX.ts:1341 (Historial), :1771 (team size), src/… |
| DA-B.2 | — | regressed | Middle dots (" · ") as separators: 10 in es-MX.ts, 3 in the engine, ~80 in TSX. | Fixed by f425068 (#28): 0 in es-MX.ts and 0 composed in src screens/components/engine at that commit (git grep " · "); Now 12 in es-MX.ts (e.g. :163, :177, :221, :237, :242, :463) and 27 in code, pla… |
| DA-B.5 | — | regressed | Vernacular inconsistencies (golpes/puntos de ventaja, Levantó/L, águila vs eagle, bolsa vs pozo, Campeón duplicated…). | Fixed in 9aecbfc/f425068: DESIGN_NOTES term table; es-MX had no "eagle" in copy at f425068 (git show f425068:src/i18n/es-MX.ts); Now: "un eagle" / "N eagles" in the friends feed (src/i18n/es-MX.ts:10… |
| DA-3.1 | — | still open | Signed-in email sits under the title as body text. | src/screens/organizer/MyTournamentsScreen.tsx:58 `{user && <span className="help">{user.email}</span>}` |
| DA-3.5 | — | still open | On desktop the list stays phone-width. | src/app/AppShell.tsx:16 widens only /admin, /tv, /ceremonia, /imprimir; /organizer stays in the 560 px column (src/app/AppShell.module.css:13) |
| DA-4.5 | — | still open | On desktop the form stays phone-width. | Measured on http://127.0.0.1:4173/organizer/nuevo/_ at 1440×900: <main> is 560 px wide (history/work/measure.json wizardDesktop) |
| DA-6.4 | — | still open | Tab labels at 0.72rem. | Now smaller: --fs-2xs = 11 px (src/styles/tokens.css:67; tab label computed font-size 11px on /t/_/full12-live, measure.json full12Live.tabLabelFontPx), below DESIGN_DIRECTION's "nothing is set below… |
| DA-7.2 | — | still open | Calcutta owner initials ("NI·DI") unreadable to anyone but the owner, taking the sub line. | src/screens/tournament/LiveScreen.tsx:76-81 still builds two-letter slices of display names; rendered "IV CA", "LE", "GA" on /t/_/full12-live (measure.json full12Live.ownersSample) |
| DA-10.8 | — | still open | 60-player Individual table with no sticky header. | src/components/primitives.module.css:295-303 .boardHead has no position: sticky (only the grid's first column is sticky, :469-472) |
| DA-12.3 | — | still open | Race chart: 12-color legend, 60-line spaghetti at 60 players. | StatsScreen.tsx:170-183 plots every player and lists every player in the legend; PALETTE cycles every 12 (`PALETTE[i % PALETTE.length]`); only the top 3 lines are thicker |
| DA-12.5 | — | still open | Per-player table needs a 900 px horizontal scroll. | StatsScreen.module.css:182-187 `.tableWrap table { min-width: 900px }` |
| DA-15.1 | — | still open | TV rows carried the same six elements as the phone (tier, thru, today, total). | src/screens/tournament/TvScreen.tsx:104-114 position, avatar, name + tier badge, "Hoyo n, pts", total |
| DA-15.2 | — | **still open** (chair) | 12 rows did not fit at 720p. | Chair: the check read the page height of a fixed, clipped board; only 9 of 12 rows fit at 1080p (VIS-03, confirmed by V12). |
| DA-16.3 | — | still open | Three confetti bursts. | CeremonyScreen.tsx:192-194 three bursts on the champion (skipped under reduced motion, :190) |
| DA-17.3 | — | still open | Paper card had no front/back nines split. | PrintScreen.tsx:65-90 holes in play order and one Total column; no Ida/Vuelta subtotals, unlike the app grid |
| DA-C.2-datos | — | still open | CSV export triggers two downloads; restore without progress. | src/screens/admin/AdminData.tsx:41-63 still two downloadText calls in a row (see DN-19) |
| DA-1.5 | — | partly fixed | Code input set in the display serif with letter-spacing, reading as a headline, not a field. | Serif gone, but src/screens/HomeScreen.module.css:41-48 still sets 600 weight, fs-xl, uppercase and 0.12em tracking (DESIGN_DIRECTION allows tracking only 0.04em on tiny table headers) |
| DA-4.4 | — | partly fixed | Long tournament names not previewed anywhere. | The review lists the name (NewTournamentScreen.tsx:198) but not as it will render: the shell header still truncates long names (DA-6.1), and the line joins name and tagline with " · " |
| DA-6.1 | — | partly fixed | Sticky header spent 60 px on the event name, truncated at ~26 characters. | One 52 px line (src/screens/tournament/TournamentShell.module.css:8-18,24-35), but the 70-character longnames name still truncates at ~41 characters (measure.json longnamesLive.header; docs/review/20… |
| DA-9.1 | — | partly fixed | Four players did not fit on one screen (2.3 screens tall). | Fits on 393×852 (fourth stepper ends at 630 px, save bar at 663 px: measure2.json); Not on a 375×667 SE: the fourth player's steppers end at 630 px under the sticky save bar (537 px) and tab bar (610… |
| DA-10.1 | — | partly fixed | Six-pill segmented control scrolled horizontally on a phone. | b41c028 (#16): Juegos opens on one row per game; The game tabs still scroll: 6 tabs, 599 px of content in 359 px on 393×852 (measure2.json juegosTabs; docs/review/2026-09-30/shots/t_juegos-full12-liv… |
| DA-12.4 | — | partly fixed | Course section: 18 bars with 0.6rem labels. | Labels now 11 px (src/screens/tournament/StatsScreen.module.css:176-180), still under 12 px; the grid hard-codes 18 columns (:151 `repeat(18, 1fr)`) |
| DA-14.1 | — | partly fixed | Más was a settings dump: eyebrow card, Comité button, four emoji buttons, code card, install guide, four more buttons. | Emoji and the eyebrow card are gone (src/screens/tournament/MoreScreen.tsx:68-160), but the stack is the same: identity, Comité, profile save, four links, code with two buttons, install guide, two or… |
| DA-18.1 | — | partly fixed | 11-pill horizontal nav scrolled off-screen after "Rondas" on a phone. | Side column from 760 px and badges (167e171 #19; src/screens/admin/AdminLayout.tsx:36-39); On a 393 px phone the section nav still scrolls: 11 links, 871 px of content in 361 px (measure.json adminNa… |
| DA-18.3 | — | partly fixed | Inline styles for spacing in 11 files (AdminPlayers had 11). | Down to a few: `style={{ flex: 1 }}` in AdminHandicaps.tsx:82, AdminGroups.tsx:243, AdminAuction.tsx:97,285,303; `style={undefined}` in AdminRounds.tsx:143,232; see DA-A.3 |
| DA-X.hier.1 | — | partly fixed | 2–3 layers of chrome before content; the first leaderboard row at ~430 px on an 844 px phone. | First row now at 369 px of 852 on /t/_/full12-live (measure.json full12Live.firstRowTop): status line, lead-group line, the "Anotar el hoyo 12" primary button (#52), a caution line, the honoree row a… |
| DA-X.hier.3 | — | partly fixed | Four accent hues fought; nothing reserved for "live" or "mine". | One semantic palette now (tokens.css:9-25), but a tournament shows two accents: the event accent (12 CSS uses: primary button, tab icon, my-row bar, snake, feed…) and the platform fairway `--accent`… |
| DA-X.dens.2 | — | partly fixed | 60 players: 64 px carded rows, no sticky Juegos header, illegible race chart, 20 rows of faces on Entrar. | Rows go dense above 20 (LiveScreen.tsx:221,279) and Entrar gets a filter (DA-5.2); Still: no sticky board header (DA-10.8), race chart plots all 60 (DA-12.3) |
| DA-X.dens.3 | — | partly fixed | Long names: truncation at 9 (board), 6 (grid), 3-line sheet headers, 26 (shell header). | Board, grid and sheet fixed (DA-7.3, DA-9.5, DA-8.4); the shell header still truncates at ~41 characters (DA-6.1) |
| DA-X.inc.4 | — | partly fixed | Icons: emoji from four Unicode blocks plus text arrows that render per-OS. | One SVG set (src/components/icons.tsx) replaced the emoji; Text arrows are back in copy; counted under DA-A.5 (regressed) — Count the arrow regression once, under DA-A.5. |
| DA-X.gen.7 | — | partly fixed | Badges and pills everywhere (23 chips, tier badges on every row, points badges on every stepper). | Points badges gone; 18 `chip` classNames remain, 14 of them colored (chip--teal/sun/coral) mostly in the platform admin (e.g. src/screens/platform/TournamentsScreen.tsx:124-127) plus AdminRounds.tsx:… |
| DA-X.gen.8 | — | partly fixed | Springs/bounce and fade-slide on most transitions; three confetti bursts. | Springs gone (DA-16.2); three bursts remain (DA-16.3) |
| DA-X.gen.10 | — | partly fixed | Hard-coded values: 39 hex in CSS, 10 in TS, ~120 inline styles. | Colors fixed and enforced (DA-A.1); 23 inline styles remain (DA-A.3) |
| DA-X.tok.2 | — | partly fixed | 30+ font sizes mixing rem/px/vh; ad-hoc spacing. | 43 font-size declarations still bypass the --fs scale (TV vh units, share-card px, Profile.module.css:560,582 64/34 px); 19 `gap: 2px` (grep) |
| DA-X.lee.1 | — | **partly fixed** (chair) | Loading: text spinner, no skeletons, layout shift when the store resolves. | Chair: skeletons exist but are generic and nearly invisible at 1.08:1 (VIS-13). |
| DA-X.lee.3 | — | partly fixed | Error: coral "Algo salió mal" box with raw error text; toasts show raw Supabase messages. | ErrorBox restyled (ui.tsx:132) and boot errors handled (c0bf82b #56); Raw messages still reach toasts (see AUD-P2-2); Mis torneos error has no retry (MyTournamentsScreen.tsx:64 no onRetry) |
| DA-A.3 | — | partly fixed | ~120 inline style={{}} across 28 files. | 23 left across 15 files (`grep -rn "style={{" src --include=*.tsx`, excluding dev/design), e.g. src/components/LegalLinks.tsx:7-11 static layout and color, src/screens/organizer/setup/GameCatalog.tsx… |
| DA-A.4 | — | partly fixed | Magic numbers: 26 rem font sizes, 60 paddings, ad-hoc gaps and radii. | 43 font-size declarations off the scale; 19 `gap: 2px`; 7 radius literals (see DA-X.tok.2) |
| DA-A.7 | — | partly fixed | Global class usage: three button variants used interchangeably; three names for secondary text. | Secondary text consolidated (className counts: small 33→9, muted 31→3, help 90→67); Buttons still split almost evenly: btn--primary 73, btn--secondary 97, btn--ghost 88 in TSX classNames |
| DA-B.6 | — | partly fixed | Long-string risks: buttons over 24 characters, chips over 18. | Still over 24: "Guardar este torneo en mi perfil" (es-MX.ts:1305, a Más button), "¿Prefieres empezar de una plantilla?" (:583), "Mis torneos como organizador" (:782), "¿No está tu campo? Agrégalo" (:… |
| DA-C.1 | — | partly fixed | Shared baseline: no media queries in organizer/admin, no :hover, no :disabled for inputs, toasts the only error channel, flags unread. | Admin media queries (5 files) and flags read (AdminLayout.tsx:36-39); `.input:disabled` exists (global.css:314-316); Still: 0 `:hover` rules in global.css, components and admin CSS; organizer screens… |
| DA-C.2-mis | — | partly fixed | Name wraps without ellipsis; no status grouping; nested anchors; error with no retry. | Grouping and sibling links fixed (MyTournamentsScreen.tsx:15-19,89-104); Error still has no retry (MyTournamentsScreen.tsx:64 `<ErrorBox message={error} />`) |
| DA-C.2-wiz | — | partly fixed | Step chips not tappable; template radios without role; player count never persisted; busy only disables; form renders before auth is ready. | Progress rule, preset confirm, expectedPlayers persisted (NewTournamentScreen.tsx:88); Still renders before auth is ready and redirects afterwards in an effect (NewTournamentScreen.tsx:59-61); browse… |
| DA-C.2-layout | — | partly fixed | 10-pill scroller, Calcutta/Parejas shown with modules off, no badges. | Module-gated sections and badges (AdminLayout.tsx:36-39); still a horizontal scroller on phones (DA-18.1) |
| DA-C.2-settings | — | partly fixed | defaultValue inputs ignore realtime; invalid entries dropped; numeric snapping; cramped grid; rounding, estimateWeights, tieFallback, spectatorLink,… | NumberField controlled inputs (DN-16); format now a real choice (#49); timezone/currency appear only in the setup MoneyEditor; Still not editable anywhere: handicap.rounding, handicap.estimateWeights… |
| DA-C.2-torneo | — | partly fixed | Status tabs, banker select and "Nuevo código" mutate immediately; 60-player banker select without search; invalid state signalled far from the save b… | Busy/toast, confirmed new code, message near save (AdminTournament.tsx:299,336); Status tabs still unguarded (AUD-P1-32); banker is still a plain <select> (AdminTournament.tsx:286) |
| DA-C.2-jugadores | — | partly fixed | 60-player flat list with no search; cramped estimate inputs; native confirm on delete; HCP as help text; playersWithPin failure swallowed. | Search (measure.json large60Players.search = true), delete sheet, right-aligned figures; playersWithPin failure still swallowed (src/screens/admin/AdminPlayers.tsx:85 `.catch(() => undefined)`) |
| DA-C.2-campos | — | partly fixed | useCourses without loading/error; 36 px hole inputs; "Borrar tee" without confirm; wrapping coverage chips. | useCourses has loading/error and AdminCourses reads them (src/screens/admin/useCourses.ts; AdminCourses.tsx:23); "Borrar tee" still removes without asking (CourseEditor.tsx:199, draft only); hole inp… |
| DA-C.2-rondas | — | partly fixed | Immediate start/finish/reopen/cancel; raw ISO date; tees sheet saves silently; new round defaults to courses[0] before load. | Confirms, busy, formatted date (AdminRounds.tsx:137), tee saves toast (:248); New round still defaults to `courses[0]?.id ?? ''` while AdminRounds ignores useCourses' loading/error (AdminRounds.tsx:3… |
| DA-C.2-grupos | — | partly fixed | Day switch discards drafts; 28 px chip holds a 32 px avatar; long names overflow; 60-player picker without search; warnings re-derived locally. | Leaving a day with a draft asks (AdminGroups.tsx:144-151,272); rows instead of chips; picker search; Pair-composition warnings still re-derived in the screen (AdminGroups.tsx:62-72) instead of flags.… |
| DA-C.2-calcutta | — | partly fixed | "siguiente milestone" guard; ↑/↓-only ordering; 60-bidder grid between lot and sale; reasons only in title; hammer without confirm; ↶ with title only. | Copy fixed (DN-11); bidder search; limit reason visible and in aria-label (AdminAuction.tsx:234-237); reopen has aria-label (:293); Hammer ("¡Vendido!") still sells on one tap with no confirm (AdminA… |
| DA-C.2-shared | — | partly fixed | HowCalculated trigger 32 px; InstallGuide hard-codes "03"; full-bleed OfflineBanner; 540 px ShareCard without name ellipsis, 60-row image ~2.7k px ta… | "03" gone; ShareCard names ellipsize (src/components/ShareCard.module.css:69-74); HowCalculated trigger 36 px (src/components/HowCalculated.module.css:2); the leaderboard share image still renders ev… |
| DA-C.3 | — | partly fixed | Flags coverage: incompleteRounds, unsignedCards, missingModules surfaced nowhere; tiebreaks/discrepancies only for the selected round. | All six flags now read (AdminLayout.tsx:36-39, AdminScores.tsx:39, AdminRounds.tsx:102,126); Grupos still re-derives warnings (AdminGroups.tsx:62-72) |
| DA-C.4.2 | — | partly fixed | No pressed state on non-.btn controls; no hover anywhere. | Tiles share pressed/selected/disabled (DESIGN_NOTES PR 7); still 0 :hover rules for mouse users on the laptop Comité |
| DA-C.4.3 | — | partly fixed | Immediate mutations without busy/confirm across status, banker, code, rounds, tees, tiebreaks, groups, draw. | Busy and confirms added nearly everywhere; Still immediate: tournament status tabs (AUD-P1-32) and the hammer (DA-C.2-calcutta) |
| DA-C.4.4 | — | partly fixed | Errors only as toasts; no loading/error for courses; missing empty states in Hándicaps and Scores. | Empty states and course loading/error added; Errors are still toasts with raw messages (AUD-P2-2) |
| DA-C.4.5 | — | partly fixed | No search in any 60-player list or select (six places). | Search in Jugadores, group picker, bidder grid, Entrar; Banker still a plain select (AdminTournament.tsx:286) |
| DA-C.4.8 | — | partly fixed | Missing aria-labels, nested anchors, pickers without radio semantics, role="tab" without panels, targets under 40 px. | aria-labels, sibling links and radiogroups fixed (AdminDraw.tsx:147, AdminAuction.tsx:229); Still 7 role="tablist" controls without panels (AUD-P2-25) and sub-44 px targets (AUD-P2-26) |
| DA-1.1 | — | fixed | Home opened with a hero (wordmark, tagline, description, wave) above… | a68496e (#13), reworked c0bf82b: src/screens/Home… |
| DA-1.2 | — | fixed | Three cards numbered 01/02/03 for things that are not a sequence (Hom… | src/screens/HomeScreen.tsx has no numbered cards;… |
| DA-1.3 | — | fixed | Third card a dark teal block with a sun-yellow heading. | No dark block on Home; no color literals outside… |
| DA-1.4 | — | fixed | Returning player's "Volver a…" squeezed between hero and cards instea… | src/screens/HomeScreen.tsx:59-67 the last tournam… |
| DA-2.1 | — | fixed | Segmented "Entrar / Crear cuenta" plus magic link: three flows compet… | a68496e (#13): src/screens/organizer/OrganizerLog… |
| DA-2.2 | — | fixed | Labels were tracked-out uppercase eyebrows (.label). | src/styles/global.css:81-86 .label is 12 px, 600,… |
| DA-2.3 | — | fixed | Wordmark repeated the Home hero. | OrganizerLoginScreen.tsx:63 small Wordmark only |
| DA-2.4 | — | fixed | Nothing said what the product is to a first-time organizer arriving b… | OrganizerLoginScreen.tsx:66-67 title plus t.auth.… |
| DA-3.2 | — | fixed | Row status as a middle-dot string, join code in the display serif ins… | MyTournamentsScreen.tsx:92-95 "status, código XXX… |
| DA-3.3 | — | fixed | Live, upcoming and past tournaments not separated. | 4637f85 (#18): MyTournamentsScreen.tsx:15-19 grou… |
| DA-3.4 | — | fixed | Empty state one sentence with no inline action. | MyTournamentsScreen.tsx:66-76 EmptyState with "Nu… |
| DA-4.1 | — | fixed | Step indicator: four chips in three colors that read like tags. | src/screens/organizer/NewTournamentScreen.tsx:116… |
| DA-4.2 | — | fixed | Step 3 exposed the full settings editor instead of a summary with an… | 1edb42b (#50): three steps (name → "¿Qué van a ju… |
| DA-4.3 | — | fixed | No summary before "Crear". | NewTournamentScreen.tsx:79 stepNames [step1, step… |
| DA-5.1 | — | fixed | Three headings (serif name + wave, "Toca tu cara", then the grid) bef… | src/screens/tournament/EnterScreen.tsx:100-118 ev… |
| DA-5.2 | — | fixed | 60 players = 20 rows of avatars with no search. | EnterScreen.tsx:12,30-34,108-110 dense grid and a… |
| DA-5.3 | — | fixed | Honoree marked with a crown emoji on the avatar. | src/components/ui.tsx:23 honoreeMark ring in the… |
| DA-5.4 | — | fixed | PIN field in serif display numerals. | src/screens/tournament/EnterScreen.module.css:73-… |
| DA-6.2 | — | fixed | Sync chip read "Conectando…" whenever Realtime was not subscribed, pe… | 7180b20 (#14) + d0465fe (#27): TournamentShell.ts… |
| DA-6.3 | — | fixed | Tab bar used emoji as icons. | TournamentShell.tsx:6,19-25 SVG icons from src/co… |
| DA-7.1 | — | fixed | The score was not the loudest thing: six competing elements, a sun mo… | src/components/primitives.tsx:135-165 LeaderRow:… |
| DA-7.3 | — | fixed | Names truncated at nine characters on the board. | Grid reworked (primitives.module.css:280-291); on… |
| DA-7.4 | — | fixed | Honoree spotlight: dark block, crown, 10-word middle-dot sentence pus… | LiveScreen.tsx:201-212 one ruled row with commas… |
| DA-7.5 | — | fixed | Chips row: three pills in three colors before the content. | LiveScreen.tsx:176-195 status line plus single ca… |
| DA-7.6 | — | fixed | No "updated N min ago"; movement arrows were 0.6rem glyphs. | LiveScreen.tsx:133 "Actualizado hace n min"; prim… |
| DA-7.7 | — | fixed | Feed: bird emoji per line and exclamation marks. | src/screens/tournament/FeedTicker.tsx:26 SVG icon… |
| DA-7.8 | — | fixed | 4-player state looked like an empty page. | /t/_/minimal4-live at 393×852 scrolls to 1,127 px… |
| DA-8.1 | — | fixed | Player sheet was six stacked cards. | src/screens/tournament/PlayerSheet.tsx uses ruled… |
| DA-8.2 | — | fixed | Per-round tables: five rows of 0.7rem numerals, no birdie/bogey notat… | PlayerSheet.tsx:107 ScorecardGrid with pencil not… |
| DA-8.3 | — | fixed | "¿Cómo se calculó?" were ghost links inside cards. | PlayerSheet.tsx:91,157 HowCalculated triggers; ta… |
| DA-8.4 | — | fixed | Long names wrapped the sheet header onto three lines. | Measured: a 34-character name wraps to 2 lines (4… |
| DA-9.2 | — | fixed | Stepper numeral smaller than its ± buttons. | docs/review/2026-09-30/shots/t_tarjeta-full12-liv… |
| DA-9.3 | — | fixed | Hole number was the smallest text in the header block. | 8f6d868 (#15): 56 px hole number (same screenshot) |
| DA-9.4 | — | fixed | Yellow points pills on every card. | Points as text, muted until touched (ScorecardScr… |
| DA-9.5 | — | fixed | Grid view: headers truncated at six characters, pink missing tint, no… | Headers show full display names on /t/_/longnames… |
| DA-9.6 | — | fixed | "Sincronizado" chip repeated the header's sync state. | The header reports connection/Realtime (Tournamen… |
| DA-10.2 | — | fixed | Each tab a different layout with different number styles. | Every standings table is Board/LeaderRow (src/scr… |
| DA-10.3 | — | fixed | Calcutta tab: dark pot card, middle-dot owner strings, money in three… | Pot as one figure, slots and owners as ruled rows… |
| DA-10.4 | — | fixed | Snake tab: emoji on the holder, coral "Pendiente" chip. | src/screens/tournament/SnakeBoard.module.css:54,6… |
| DA-10.5 | — | fixed | Mejor ronda winner not visually separated. | Board per day; position 1 styled (primitives.tsx:… |
| DA-10.6 | — | fixed | Menos putts a plain table. | GamesScreen.tsx:295-305 Board rows |
| DA-10.7 | — | fixed | Money as chips in some tabs, plain text in others. | Money primitive on the sub line in every board |
| DA-11.1 | — | fixed | Bank card a solid coral alarm whenever prizes were provisional. | 6370c34 (#17): statement; /t/_/full12-live/dinero… |
| DA-11.2 | — | fixed | Two share buttons ("Compartir" and "📸 Compartir liquidación"). | One "Compartir" (measure.json dinero; docs/review… |
| DA-11.3 | — | fixed | "Pagó $3,500 · Recibe $5,845" middle-dot strings. | "Pagó $6,000, recibe $16,000" (measure.json diner… |
| DA-11.4 | — | fixed | Settlement "Andrés → Banco" arrows; paid state only by opacity. | No arrow glyph in MoneyScreen.tsx (grep); paid ro… |
| DA-12.1 | — | fixed | Awards as eight identical cards. | src/screens/tournament/StatsScreen.tsx:95-110 rul… |
| DA-12.2 | — | fixed | Moment and cursed hole as a dark card and a coral card. | Plain rows (DESIGN_NOTES PR 8) |
| DA-13.1 | — | fixed | Numbered 01–09 sections with a wave under every heading, old-brand se… | d033e38 (#20): src/screens/tournament/RulesScreen… |
| DA-15.3 | — | fixed | Yellow position column and emoji feed icons on the TV. | Board palette with the plate accent on the leader… |
| DA-15.4 | — | fixed | Calcutta "at stake" list used ad-hoc labels. | TvScreen.tsx:269-272 uses t.rules.slotName |
| DA-16.1 | — | fixed | Emoji as step icons. | src/screens/tournament/CeremonyScreen.tsx:17,48-1… |
| DA-16.2 | — | fixed | Springs and delays on every reveal. | No spring/stiffness anywhere in src (grep); share… |
| DA-16.4 | — | fixed | Money summary +$/−$ in seafoam/salmon on dark teal, contrast failing. | Board tokens: --board-under #ff6b6b 5.28:1 and --… |
| DA-17.1 | — | fixed | Print sheet hard-coded #000/#fff/#f3f3f3. | Tokens only (no-literal-colors test covers PrintS… |
| DA-17.2 | — | fixed | Emoji on the print button. | src/screens/tournament/PrintScreen.tsx:14,42 Icon… |
| DA-18.2 | — | fixed | Every Comité section was stacked .card blocks with eyebrow labels. | One row style (src/screens/admin/Admin.module.css… |
| DA-18.4 | — | fixed | Comité tables did not use desktop width. | AppShell.module.css:18-20 960 px column for /admi… |
| DA-18.5 | — | fixed | Auction console mixed a dark lot card, a 4-column bidder grid, bid bu… | 167e171 (#19): two-pane console on desktop, share… |
| DA-18.6 | — | fixed | The draw used a ring emoji and spring reveals. | src/screens/admin/AdminDraw.tsx: IconRings, no sp… |
| DA-18.7 | — | fixed | Danger zone (delete tournament) on the same page as the name field. | 1edb42b (#50): Comité › Torneo tabs (AdminTournam… |
| DA-18.8 | — | fixed | Nothing surfaced the engine flags (tiebreaks, unsigned cards, discrep… | AdminLayout.tsx:36-39 nav badges; AdminScores.tsx… |
| DA-X.hier.2 | — | fixed | Numbers never dominated; the loudest elements were yellow chips and c… | Figures are the largest element on the board and… |
| DA-X.inc.1 | — | fixed | Three visual languages for money (sun chip, signed serif, grey small… | Money primitive (primitives.tsx) on the board sub… |
| DA-X.inc.2 | — | fixed | Labels: 41 uppercase tracked eyebrows, bold sentence case elsewhere,… | .label sentence case (global.css:81-86); no secti… |
| DA-X.inc.3 | — | fixed | Five radius/shadow combinations for "a group of things". | Radius tokens (tokens.css); 9 `.card` uses left i… |
| DA-X.inc.5 | — | fixed | Motion: springs, CSS fades, a spinner; nothing shared. | src/design/motion.ts shared eases/durations (test… |
| DA-X.gen.1 | — | fixed | Cream + display serif + coral: the reflexive premium look. | Card stock #fbfaf7, Archivo, Fraunces only for th… |
| DA-X.gen.2 | — | fixed | Card kit on 20 of 29 screens. | 9 `className="card…"` in TSX (5 in AdminData) |
| DA-X.gen.5 | — | fixed | Arrows appended to buttons ("Siguiente →", "← Anterior", "↶ Deshacer"… | No arrow in any button label; undo is IconUndo (A… |
| DA-X.gen.6 | — | fixed | Emoji as UI in 20 files. | Emoji scan of src (non-dev): only "✓" as a figure… |
| DA-X.tok.1 | — | fixed | tokens.css had no type or spacing scale, no semantic colors, elevatio… | src/styles/tokens.css:9-125 type scale, spacing,… |
| DA-X.tok.3 | — | fixed | Tabular numerals only where .num was applied. | Figures use the .fig/.num rules with tabular-nums… |
| DA-X.tok.4 | — | fixed | No true minus / "E" convention for to-par. | 7180b20 (#14): Puntos/Gross toggle with toPar (re… |
| DA-X.lee.2 | — | fixed | Empty states: one sentence, sometimes a joke, rarely an action. | EmptyState primitive with actions (e.g. MyTournam… |
| DA-X.fmt.1 | — | fixed | Stableford was the only format; one row component had to serve points… | 1c79931 (#49), 5c7068f (#51): stroke, match, team… |
| DA-X.log.3 | — | fixed | Print cards: tee times with seconds (fixed in M7); rely on state.core… | PrintScreen.tsx:61 `g.teeTime.slice(0, 5)` |
| DA-A.1 | — | fixed | 39 hard-coded colors in CSS outside tokens.css. | 0 now: `grep -rnE "#[0-9a-fA-F]{3,8}\|rgba?\(" sr… |
| DA-A.2 | — | fixed | Hard-coded colors in TS/TSX (confetti, chart palette, print, share ca… | Runtime colors from tokens (src/lib/tokens.ts); i… |
| DA-A.6 | — | fixed | Motion inventory: five spring configs, fades, confetti, CSS animation… | No springs (grep stiffness/spring → none); shared… |
| DA-B.1 | — | fixed | Exclamation marks in copy. | Only "¡Vendido!" (src/i18n/es-MX.ts:1729) and the… |
| DA-B.3 | — | fixed | Jokes, roasts, filler ("Sí, cómo no", "siguiente milestone", 404 joke… | All counts 0 in user copy of src/i18n/es-MX.ts (g… |
| DA-B.4 | — | fixed | Eyebrows and forced uppercase (every Field label rendered in tracked… | .label sentence case; uppercase left on tiny tabl… |
| DA-C.2-login | — | fixed | Ghost-button stack; busy only disables; navigate() in render; wrong m… | DN-9, DN-10 fixed in a68496e (#13); busy labels (… |
| DA-C.2-handicaps | — | fixed | 32 px trigger wrapping the playing handicap in a chip; ✕ without aria… | src/screens/admin/AdminHandicaps.tsx:61 EmptyStat… |
| DA-C.2-scores | — | fixed | Flags filtered to the selected round; 60-player select without group… | Inbox across rounds (AdminScores.tsx:39-40), play… |
| DA-C.2-parejas | — | fixed | Wrong module-off copy; 700 ms/pair reveal with no skip and uncleared… | DN-11, DN-12; skip and reduced motion (AdminDraw.… |
| DA-C.4.1 | — | fixed | No layout above 560 px anywhere in admin. | AppShell.module.css:18-20; admin media queries |
| DA-C.4.6 | — | fixed | Numbers inconsistent (.num at three sizes, handicap in a chip, figure… | Right-aligned `a.fig` figure column in the shared… |
| DA-C.4.7 | — | fixed | Wrong copy: "siguiente milestone" guards; reset-link message. | DN-10, DN-11 |
| DA-X.con.1 | — | obsolete | Measured contrast of the old palette (muted fails AAA for scores; 0.5… | The palette was replaced (tokens.css:9-25); the n… |
| DA-X.log.2 | — | obsolete | EnterScreen honoree crown and tier badges (noted as no bug). | Crown replaced by a ring (DA-5.3); the note recor… |

#### DESIGN_NOTES.md

24 items: 0 regressed, 2 still open, 4 partly fixed, 17 fixed, 1 obsolete.

| ID | Sev. | Status | Finding | Evidence at HEAD |
|---|---|---|---|---|
| DN-18 | — | still open | AdminPlayers swallowed a playersWithPin failure. | src/screens/admin/AdminPlayers.tsx:85 `playersWithPin(tournamentId).then(setPins).catch(() => undefined)`: a failure silently shows every player without a PIN |
| DN-19 | — | still open | AdminData CSV export triggers two downloads back to back; browsers may block the second. | src/screens/admin/AdminData.tsx:53 and :63 two downloadText() calls from one click — The first file is also named `<slug>-scores-<date>.csv`, the term DESIGN_NOTES bans. |
| DN-7 | — | partly fixed | Grid headers sliced display names to six characters; display_name has no length guidance in the admin form. | Headers now show full display names (/t/_/longnames grid, measure.json gridHeadersLong); Still no length guidance or limit on the display-name field (src/screens/admin/AdminPlayers.tsx:255 plain inpu… |
| DN-14 | — | partly fixed | Rondas: no busy guard, raw ISO date, new round defaulting to courses[0] before courses load. | Busy per round and formatted date (src/screens/admin/AdminRounds.tsx:73-86,137); Still: a new round defaults to `courses[0]?.id ?? ''` (AdminRounds.tsx:118) and the screen ignores useCourses' loading… |
| DN-17 | — | partly fixed | useCourses had no loading flag and its error was never read (AdminCourses, AdminRounds). | src/screens/admin/useCourses.ts now returns loading/error and AdminCourses.tsx:23 reads them; AdminRounds.tsx:35 still takes only `courses` |
| DN-20 | — | partly fixed | AdminScores filtered tiebreaks/disputes to the selected round; Grupos re-derived pair warnings; nobody read incompleteRounds, unsignedCards or missin… | Inbox across all rounds and all flags read (AdminScores.tsx:39-40, AdminLayout.tsx:36-39, AdminRounds.tsx:102,126); AdminGroups.tsx:62-72 still re-derives pair warnings — Not struck in DESIGN_NOTES.md:169 although mostly fixed. |
| DN-1 | — | fixed | Prize-statement detail strings printed raw numbers ("$10000"). | 635f709 (#25): src/engine/settings/prizeCheck.ts:… |
| DN-2 | — | fixed | SettingsEditor defaultValue/onBlur inputs (tiers, prize lists, pairin… | Controlled NumberField everywhere (src/components… |
| DN-4 | — | fixed | listMyTournaments returned one row per organizer row, so a tournament… | ee69057 (#26) own-row policy (supabase/migrations… |
| DN-6 | — | fixed | LiveScreen summed state.prizes itself: two sources of truth for a pla… | src/screens/tournament/LiveScreen.tsx:229 `cash =… |
| DN-8 | — | fixed | Mis torneos nested a Link inside the row Link (invalid HTML). | 4637f85 (#18): src/screens/organizer/MyTournament… |
| DN-9 | — | fixed | OrganizerLoginScreen called navigate() during render. | a68496e (#13): src/screens/organizer/OrganizerLog… |
| DN-10 | — | fixed | Reset password with no session showed the sign-up confirmation copy. | src/i18n/es-MX.ts:490 t.auth.resetExpired |
| DN-11 | — | fixed | Module-off guard read "Llega en el siguiente milestone." | src/i18n/es-MX.ts:1144 "Este juego no está activo… |
| DN-12 | — | fixed | AdminDraw reveal timers never cleared; saving the draw overwrote Day… | Timers cleared (167e171 #19); one confirmed save_… |
| DN-13 | — | fixed | Grupos: switching the day tab discarded drafts silently; a 28 px .chi… | src/screens/admin/AdminGroups.tsx:144-151,272 ask… |
| DN-15 | — | fixed | Torneo: status tabs, banker and "Nuevo código" wrote with no busy sta… | src/screens/admin/AdminTournament.tsx:142-165 bus… |
| DN-22 | — | fixed | Archivo variable for everything, Fraunces for the event name only, In… | package.json:25-26 only @fontsource-variable/arch… |
| DN-23 | — | fixed | No emoji as UI; one inline SVG set. | src/components/icons.tsx; emoji scan finds only "… |
| DN-24 | — | fixed | No global dark mode; TV and Ceremonia use a board surface; phone scre… | No prefers-color-scheme rules in src CSS (grep);… |
| DN-25 | — | fixed | Leaderboard rows re-sort once in 200 ms ease-out, no spring; dense ab… | LiveScreen.tsx:114 `animate = rows.length <= 20`;… |
| DN-26 | — | fixed | LEGACY alias block, Wave component and the no-literal-colors PENDING… | No "LEGACY" in tokens.css; PENDING = new Set([])… |
| DN-27 | — | fixed | Product renamed Polo in name, title, PWA name, share footer and wordm… | index.html:21 <title>Polo</title>; vite.config.ts… |
| DN-21 | — | obsolete | Decision that fixture routes render in every build. | Superseded by f425068 (#28): routes only in dev o… |

#### DESIGN_DIRECTION.md

16 items: 0 regressed, 2 still open, 4 partly fixed, 9 fixed, 1 obsolete.

| ID | Sev. | Status | Finding | Evidence at HEAD |
|---|---|---|---|---|
| DD-2 | — | **still open** (chair) | Tabular lining figures, true minus for under par, "E" for even, T3 for ties, right-aligned numeric columns. | Chair: the right-alignment rule's selector has not matched since #12; numeric columns are left-aligned under right-aligned headers (VIS-02). |
| DD-12 | — | **still open** (chair) | Pencil notation on the scorecard grid, a ring in the leaderboard "hoy" column when today has a birdie, on share images and in the app icon. | Chair: share images use coloured tints, not the pencil notation (VIS-15). |
| DD-3 | — | partly fixed | AA everywhere; AAA for figures on the leaderboard and the scorecard. | Holds for primary figures: ink 15.69:1, under 7.67:1, over 7.68:1 on --bg (WCAG formula on src/styles/tokens.css:9-22); Fails AAA (7:1) for small secondary figures: --ink-2 is 6.35:1 on the my-row ti… |
| DD-6 | — | partly fixed | Structure from space, alignment and rules; cards only for true objects (a lot, a share image, a sheet). | 9 `.card` uses left; 5 are plain Comité › Datos sections (src/screens/admin/AdminData.tsx:96-165), not objects |
| DD-11 | — | partly fixed | Archivo for everything, Fraunces only for the event name; scale 11–56; no tracking except 0.04em on tiny table headers; "nothing is set below 12 px". | Families hold (DN-22); 11 px (--fs-2xs) is used in 19 rules (tab labels, board heads, course bars) and the share card has 10 px (src/components/ShareCard.module.css:132), against "nothing below 12 px… |
| DD-17 | — | partly fixed | Returning player sees the event and a live status line ("Día 2 en juego, vas 6.º") above "Entrar". | Order holds (src/screens/HomeScreen.tsx:59-67), but the returning-player block shows only the name and a button: no round status or position |
| DD-4 | — | fixed | TV/Ceremonia board surface #0F2E22 with #F6F3EA figures (13.2:1), #A9… | src/styles/tokens.css:28-35 exact values; compute… |
| DD-5 | — | fixed | Red under par, blue over par, ink for par; pencil notation circle / d… | src/components/primitives.tsx:172-186 markFor + m… |
| DD-7 | — | fixed | No emoji; one SVG icon set on a 24 px grid with one stroke weight. | src/components/icons.tsx; emoji scan → only the "… |
| DD-8 | — | fixed | Motion confirms or shows change: 150–250 ms ease-out, one orchestrate… | src/design/motion.ts:16-31 (150/200/250 ms, one c… |
| DD-10 | — | fixed | Palette values: card stock #FBFAF7, ruled #F3F1EA, graphite #1B211D,… | src/styles/tokens.css:9-24 identical values |
| DD-13 | — | fixed | Legacy free-form accent values map to the nearest swatch; unknown fal… | src/design/accents.ts:28-40 nearestAccent; DEFAUL… |
| DD-14 | — | fixed | One Row serves the leaderboard in every format through its figure slo… | LeaderRow used for Stableford, stroke, match and… |
| DD-15 | — | fixed | Scorecard grid with par, stroke index, front/back/total and notation;… | ScorecardScreen.tsx:369-404 par/SI columns and Id… |
| DD-18 | — | fixed | The logo, when present, is a small mark beside the event name, never… | src/screens/tournament/TournamentShell.tsx:53 28… |
| DD-16 | — | obsolete | Wordmark, app icon, splash and theme-color regenerated from the circl… | Superseded by the Polo logo sheet (DESIGN_NOTES "… |

#### RUNBOOK.md

17 items: 0 regressed, 1 still open, 3 partly fixed, 13 fixed, 0 obsolete.

| ID | Sev. | Status | Finding | Evidence at HEAD |
|---|---|---|---|---|
| RB-2 | — | still open | Checklist: every player's base handicap "bloqueado" before the trip (CLAUDE.md §5.2: "locked before the Calcutta"). | No lock exists: no handicap lock column, RPC or UI (grep for lock/bloque in src and supabase/migrations finds only PIN, card and platform locks); AdminPlayers keeps base_hcp editable at any time — Governance gap: base handicaps can change after the auction without a reason prompt (the change is… |
| RB-8 | — | partly fixed | "Iniciar ronda" (check the round has a course and groups). | Groups are enforced (AdminRounds.tsx:63-66); A round with no course starts anyway on par-4 placeholders with only a warning (src/engine/core/compute.ts:89-94) |
| RB-11 | — | partly fixed | "Cinco PINs equivocados seguidos bloquean ese teléfono 5 minutos (solo ese teléfono; el jugador entra desde otro)." | True per device (supabase/migrations/0013_identity.sql:435-436,480-484); Omits the player-level lock: 15 failures across devices lock that player everywhere for 15 minutes (0013:437-438,485-496), so… |
| RB-15 | — | partly fixed | "Revisa en En vivo que no queden hoyos sin capturar ni víboras pendientes (sale un chip rojo)." | En vivo shows pending snakes as a caution line (LiveScreen.tsx:177-181), not a red chip; Unfinished cards are not shown on En vivo at all: incompleteRounds surfaces only in Comité › Rondas and Tarjet… |
| RB-1 | — | fixed | App lives at golf.cardigan.mx (or cardi-golf.vercel.app); admins see… | `curl` → 200 for both hosts (2026-09-30); src/i18… |
| RB-3 | — | fixed | Review the 80% preview and strokes received per player. | src/screens/admin/AdminPlayers.tsx:93-116,341 liv… |
| RB-4 | — | fixed | A daily cron keeps the free Supabase project awake. | .github/workflows/keepalive.yml: daily 11:17 UTC… |
| RB-5 | — | fixed | Print one paper card per group with the strokes received. | src/screens/tournament/PrintScreen.tsx:91 stroke… |
| RB-6 | — | fixed | TV shows the auction board while the tournament is in "Subasta"; open… | TvScreen.tsx:30; AdminAuction.tsx:119 (status auc… |
| RB-7 | — | fixed | After the last lot: honoree picks, the rest drawn, pairs named, savin… | src/screens/admin/AdminDraw.tsx:81-95 withTeeTime… |
| RB-9 | — | fixed | Comité › Tarjetas: pick a player and hole; signed cards ask for a rea… | AdminScores.tsx:53-99 (reason when signed, resolv… |
| RB-10 | — | fixed | Keep entering with no signal; nothing is lost, it retries until it ge… | See AUD-P0-3 and AUD-P0-5 |
| RB-12 | — | fixed | A rejected capture shows in red under the card with its values; tell… | src/components/RejectedWrites.tsx:38-60 |
| RB-13 | — | fixed | No deploys to main during a round; the app offers "Hay una versión nu… | src/main.tsx:13-27; vite.config.ts:32 |
| RB-14 | — | fixed | If Vercel is down, the last JSON backup has everything and the settle… | src/screens/admin/AdminData.tsx:55-63 results CSV… |
| RB-16 | — | fixed | Ceremonia from Más (admins only): reveal one by one through the money… | MoreScreen.tsx:114 admin link; CeremonyScreen.tsx… |
| RB-17 | — | fixed | Nightly JSON and CSV downloads; restore accepts only this tournament'… | restore_tournament validates the tenant (supabase… |

#### docs/reglas-programadas.md

10 items: 0 regressed, 6 still open, 0 partly fixed, 4 fixed, 0 obsolete.

| ID | Sev. | Status | Finding | Evidence at HEAD |
|---|---|---|---|---|
| RP-2 | — | still open | Day-2 cut described as "Recorte anti-sandbag"; nothing about rounds 3+. | docs/reglas-programadas.md:12 uses the term DESIGN_NOTES bans ("recorte del día 2", not "anti-sandbag"); day2Cut.mode previous\|cumulative for rounds 3+ (src/engine/settings/schema.ts:125) is not men… |
| RP-4 | — | still open | "Hoyo levantado sin putts anotados: cuenta 3 putts." | Stale since 635f709 (#25): a picked-up hole counts at least 3 even when putts were entered (src/engine/modules/fewestPutts/index.ts:40), and ranking is by holes played first (:58-68); the summary say… |
| RP-6 | — | still open | "Pozo = suma de los martillazos, todo se reparte" with the five slots. | Stale since 635f709 (#25): a slot nobody can fill stays with the banker, flagged for the Comité (src/engine/modules/auction/index.ts:171-224), so not everything is always paid out; docs/reglas-progra… — The handoff (docs/handoff.md:38) explained the change to Diego; this summary was never updated. |
| RP-7 | — | still open | "Mientras haya premios abiertos lo marca en rojo como 'por asignar'." | Stale since 6370c34 (#17): "Por asignar" is in the caution color while prizes are open, red only once final and still unbalanced (DESIGN_NOTES PR 5; /t/_/full12-live/dinero shows "Por asignar: $3,000… |
| RP-8 | — | still open | Feed, stats and fun awards, ceremony and share cards "viene en M3–M6". | All four exist (src/screens/tournament/FeedTicker.tsx, StatsScreen.tsx, CeremonyScreen.tsx, src/components/ShareCard.tsx); docs/reglas-programadas.md:77-79 still says they are not built — Stale document. |
| RP-9 | — | still open | Presented as "lo que hace el motor"; covers only the first tournament's Stableford modules. | Stroke, match and team formats (src/engine/formats/*, #49/#51) and the instance games (skins, Nassau, contests, custom bets, side pots, house cut: src/engine/games/*, #30–#33) are not described anywh… — The Reglamento screen generates rules from settings (RulesScreen.tsx:39 describeGame), so players a… |
| RP-1 | — | fixed | Base handicap sources (manual / WHS index via index × slope ÷ 113 + (… | src/engine/core/handicap.ts (courseHandicap, esti… |
| RP-3 | — | fixed | Snake: holder = last 3+ putts in play order; tie → who holed last, pe… | src/engine/modules/snake/index.ts; tests src/engi… |
| RP-5 | — | fixed | "La app no deja guardar una configuración que no cuadre." | Wizard and Comité › Torneo block save while unbal… |
| RP-10 | — | fixed | Payouts, countback order (Day 2, 10–18, 13–18, 16–18, 18), tie splits… | src/engine/core/ranking.ts countback windows; ind… |

#### docs/handoff.md

32 items: 0 regressed, 29 still open, 0 partly fixed, 3 fixed, 0 obsolete.

| ID | Sev. | Status | Finding | Evidence at HEAD |
|---|---|---|---|---|
| HO-1 | — | still open | Solmar Golf Links scorecard (Day 1): par and SI per tee; not in either course database. | docs/handoff.md:135 unchecked ("- [ ]") — Launch-blocking for the April 2027 event. |
| HO-2 | — | still open | Tiers and handicaps (WHS index or three scores) and tee for each of the 12 players. | docs/handoff.md:136 unchecked ("- [ ]") — Launch-blocking for the April 2027 event. Also the base handicap lock the rules require does not ex… |
| HO-3 | — | still open | Player 12 and which player is Nacho (the honoree). | docs/handoff.md:137 unchecked ("- [ ]") — Launch-blocking for the April 2027 event. |
| HO-4 | — | still open | Tee times for groups 2 and 3 on both days. | docs/handoff.md:139 unchecked ("- [ ]") |
| HO-5 | — | still open | Banker and Comité members. | docs/handoff.md:140 unchecked ("- [ ]") — Launch-blocking for the April 2027 event. Settlement "vía banco" needs a banker (CLAUDE.md §11). |
| HO-6 | — | still open | §18 answers (defaults or point by point), spectator link, own domain. | docs/handoff.md:142 unchecked ("- [ ]") — Part of the line is stale: golf.cardigan.mx is live (CLAUDE.md §3), yet it still says "¿dominio pro… |
| HO-7 | — | still open | Protect the April tournament as soon as it exists (Comité › Torneo › Zona de peligro › Proteger). | docs/handoff.md:68 unchecked ("- [ ]") — Launch-blocking for the April 2027 event. The RUNBOOK does not mention it. |
| HO-8 | — | still open | Full rehearsal (M7): close day 2, Terminado, Ceremonia on a TV, JSON/CSV backup, restore, print, duplicate. | docs/handoff.md:90 unchecked ("- [ ]") — Launch-blocking for the April 2027 event. §16 M7 is "done when the rehearsal passes". |
| HO-9 | — | still open | Calcutta night rehearsal (M5) with the TV board. | docs/handoff.md:94 unchecked ("- [ ]") — Launch-blocking for the April 2027 event. |
| HO-10 | — | still open | Pairs draw after the last lot. | docs/handoff.md:95 unchecked ("- [ ]") |
| HO-11 | — | still open | Field test of sync (cleanup PR 1): airplane-mode cold open, pending → synced, "Hay una versión nueva" prompt, non-Comité player without the console. | docs/handoff.md:34 unchecked ("- [ ]") — The only real-device check of AUD-P0-3/4/5/13. |
| HO-12 | — | still open | Tarjeta and boards on a real phone (cleanup PR 4). | docs/handoff.md:36 unchecked ("- [ ]") |
| HO-13 | — | still open | Hardened Comité on the Ensayo (cleanup PR 3), incl. restore and per-device PIN lock. | docs/handoff.md:37 unchecked ("- [ ]") |
| HO-14 | — | still open | Review the refined money rules (cleanup PR 2). | docs/handoff.md:38 unchecked ("- [ ]") — The Spanish rules summary was not updated with them (RP-4, RP-6). |
| HO-15 | — | still open | Copy and accessibility pass on a phone (cleanup PR 5). | docs/handoff.md:35 unchecked ("- [ ]") |
| HO-16 | — | still open | Try the redesign on phone, laptop and TV. | docs/handoff.md:58 unchecked ("- [ ]") |
| HO-17 | — | still open | Open Polo on the iPhone after the blank-page fix; "Reiniciar la app" if stuck. | docs/handoff.md:62 unchecked ("- [ ]") |
| HO-18 | — | still open | Reinstall the home-screen app to get the Polo name and icon. | docs/handoff.md:30 unchecked ("- [ ]") |
| HO-19 | — | still open | Install the app on the phone (Safari / Chrome). | docs/handoff.md:104 unchecked ("- [ ]") |
| HO-20 | — | still open | Basic acceptance: enter a hole, player sheet, enter as player, as organizer, create a tournament from scratch. | docs/handoff.md:101,102,105,106,107 unchecked |
| HO-21 | — | still open | M6 dazzle, Dinero, Juegos, Comité Grupos/Hándicaps/Tarjetas checks. | docs/handoff.md:92,96,98,99 unchecked — Line 98 still describes countback as "(⇄)", a glyph and term the redesign removed. |
| HO-22 | — | still open | New games parts 1, 3, 4 (side pots, contests, new tournament money step). | docs/handoff.md:108,109,110 unchecked |
| HO-23 | — | still open | Profiles parts 0–8 (code sign-in, identity, accounts, results and Polo index, friends/rivalries, Ronda rápida, crews, badges, web push). | docs/handoff.md:42,44,46,47,48,49,50,51,52 unchecked — e2e/profile.mjs covers parts of it but needs SUPABASE_SECRET_KEY (not runnable here). |
| HO-24 | — | still open | Admin de Polo: enter, Comité anywhere, Personas, Historial, Campos cleanup, Crews, test notice, Salud (first nightly backup), Auditoría. | docs/handoff.md:66,67,69,70,71,72,73,74,75 unchecked — Salud is where Diego would see a failing nightly backup; nobody has confirmed it shows one yet. |
| HO-25 | — | still open | UX overhaul checks: 3-step setup, Comité tabs, typing and zoom on iPhone, new navigation, new formats, row alignment. | docs/handoff.md:79,80,81,82,83,84 unchecked |
| HO-26 | — | still open | Decide on hand-drawn numerals (needs a real handwritten 0–9 from Diego). | docs/handoff.md:85 unchecked ("- [ ]") |
| HO-27 | — | still open | Tell Claude what still feels wrong / generic. | docs/handoff.md:86 unchecked ("- [ ]") |
| HO-28 | — | still open | Rotate every key pasted into chat and store the new ones in the Claude Code environment. | docs/handoff.md:114-127 has no done marker; this container has no SUPABASE_PAT / SUPABASE_SECRET_KEY / VERCEL_TOKEN in its environment (PANEL_BRIEF §4), consistent with the environment step not being… — Keys that sat in two chat transcripts (Supabase secret and PAT, Vercel, Anthropic, Resend, Cloudfla… |
| HO-29 | — | still open | Optional: protect `main` with a ruleset (paid on private repos). | docs/handoff.md:148 unchecked ("- [ ]") — Only the local hook and CI guard main; the Claude-side guard is bypassable by the GitHub write tool… |
| HO-30 | — | fixed | Google sign-in (struck as done 2026-09-29). | `GET https://gmohwledjejlhcwqjnhd.supabase.co/aut… |
| HO-31 | — | fixed | Custom domain golf.cardigan.mx (struck as done). | `curl https://golf.cardigan.mx/` → 200 (2026-09-3… |
| HO-32 | — | fixed | Access emails through Resend "hasta 30/hora" (struck as done). | Superseded values: CLAUDE.md §3 records rate_limi… |

## Appendix B. Screenshot index

Files are in `shots/`, named `<route>-<fixture>-<device>-<theme>[-<state>].png`. The route is the URL path with `/` turned into `_` (`t_tarjeta` = `/t/<slug>/tarjeta`, `t_admin_calcutta` = `/t/<slug>/admin/calcutta`). Devices: `se` 375×667, `15pro` 393×852, `android` 412×915 (phones at 2×), `ipad` 1024×1366, `laptop` 1440×900, `tv` 1920×1080 (1×). Fixtures are the in-memory states in `src/dev/fixtures.ts` plus `prod` (production, read-only) and `ensayo` (the rehearsal tournament). Suffixes name a state (`-sheet`, `-grid`, `-step03`, `-slide2`) or the panelist who took the shot (`-vis-`, `-ux-`, `-a11y-`, `-pwa-`, `-rel-`, `-copy-`, `-trust-`, `-strat-`, `-qa-`); `-patched` and `-synthetic` mark a fixture changed in the browser only, to show a state no fixture has (auction mid-lot, pairs draw).

| Route | Files | Fixtures | Devices |
|---|---:|---|---|
| `t_juegos` | 61 | bracket8, friends8, full12-finished, full12-live, gloria4, large60, longnames, match8, minimal4-live, minimal4-setup, pairs8, scramble8, stroke8, team8 | 15pro, android, ipad, se |
| `t_dinero` | 46 | bracket8, friends8, full12-finished, full12-live, gloria4, large60, longnames, match8, minimal4-live, minimal4-setup, pairs8, scramble8, stroke8, team8 | 15pro, android, ipad, se |
| `t_live` | 44 | bracket8, friends8, full12-finished, full12-live, gloria4, large60, longnames, match8, minimal4-live, minimal4-setup, pairs8, scramble8, stroke8, team8 | 15pro, android, ipad, se |
| `t_tarjeta` | 35 | ensayo, full12-finished, full12-live, large60, longnames, minimal4-live, minimal4-setup, pairs8 | 15pro, android, ipad, se |
| `t_ceremonia` | 34 | full12-finished, full12-live, match8 | 15pro, tv |
| `organizer_nuevo` | 30 | demo | 15pro, laptop |
| `t_tv` | 26 | auction12, full12-finished, full12-live, large60, longnames | 15pro, tv |
| `t_admin_jugadores` | 21 | friends8, full12-live, large60, longnames, minimal4-setup | 15pro, laptop |
| `t_admin_calcutta` | 18 | auction12, friends8, full12-live, large60, longnames, minimal4-setup | 15pro, laptop |
| `t_admin_scores` | 16 | friends8, full12-live, large60, longnames, minimal4-setup | 15pro, laptop |
| `t_admin_campos` | 12 | friends8, full12-live, large60, longnames, minimal4-setup | 15pro, laptop |
| `t_admin_handicaps` | 11 | friends8, full12-live, large60, longnames, minimal4-setup | 15pro, laptop |
| `t_admin_parejas` | 11 | draw12, friends8, full12-live, large60, longnames, minimal4-setup | 15pro, laptop |
| `t_stats` | 11 | ensayo, full12-finished, full12-live, large60, longnames, minimal4-live, minimal4-setup, pairs8, team8 | 15pro |
| `ronda` | 10 | fx, quick | 15pro, se |
| `p` | 9 | extrano, manual, nuevo, yo | 15pro, se |
| `t` | 9 | ensayo, full12-live, match8, minimal4-setup | 15pro |
| `home` | 8 | local, none, prod | 15pro, laptop, se |
| `t_mas` | 8 | full12-finished, full12-live, large60, longnames, minimal4-live, minimal4-setup, pairs8 | 15pro |
| `t_reglamento` | 8 | full12-finished, full12-live, large60, longnames, match8, minimal4-live, minimal4-setup, pairs8 | 15pro |
| `p_vs` | 7 | amigos, nuevo, propuesta, rivalidad | 15pro |
| `t_admin_grupos` | 7 | friends8, full12-live, large60, longnames, minimal4-setup | 15pro, laptop |
| `t_admin_historial` | 7 | friends8, full12-live, large60, longnames, minimal4-setup | 15pro, laptop |
| `t_entrar` | 7 | ensayo, prod | 15pro, se |
| `admin_torneos` | 6 | fx | 15pro, laptop |
| `t_admin_datos` | 6 | friends8, full12-live, large60, longnames, minimal4-setup | 15pro, laptop |
| `t_admin_equipos` | 6 | friends8, full12-live, large60, longnames, minimal4-setup | 15pro, laptop |
| `t_admin_juegos` | 6 | friends8, full12-live, large60, longnames, minimal4-setup | 15pro, laptop |
| `t_admin_rondas` | 6 | friends8, full12-live, large60, longnames, minimal4-setup | 15pro, laptop |
| `t_admin_torneo` | 6 | friends8, full12-live, large60, longnames, minimal4-setup | 15pro, laptop |
| `admin_campos` | 5 | fx | 15pro, laptop |
| `admin_personas` | 5 | fx | 15pro, laptop |
| `organizer_login` | 5 | local, none | 15pro, laptop |
| `admin_crews` | 4 | fx | 15pro, laptop |
| `admin_resumen` | 4 | fx | 15pro, laptop |
| `p_anio` | 4 | extrano, manual, nuevo, yo | 15pro |
| `t_ensayo` | 4 | ensayo, none | 15pro |
| `t_imprimir` | 4 | full12-live | laptop |
| `admin_avisos` | 3 | fx | 15pro, laptop |
| `admin_salud` | 3 | fx | 15pro, laptop |
| `(other)` | 3 |  |  |
| `admin_auditoria` | 2 | fx | 15pro, laptop |
| `c` | 2 | fx | 15pro |
| `entrar` | 2 | local, none | 15pro |
| `notfound` | 2 | local, none | 15pro |
| `organizer_nuevo_` | 2 | demo | 15pro |
| `organizer_reset` | 2 | local | 15pro, laptop |
| `privacidad` | 2 | local | 15pro |
| `terminos` | 2 | local | 15pro |
| `amigos` | 1 | fx | 15pro |
| `avisos` | 1 | fx | 15pro |
| `fixture_index` | 1 | fx | laptop |
| `t_ensayo_dinero` | 1 | none | 15pro |
| `t_ensayo_mas` | 1 | none | 15pro |
| `t_gate` | 1 | ensayo | 15pro |
| **Total** | **558** | | |
