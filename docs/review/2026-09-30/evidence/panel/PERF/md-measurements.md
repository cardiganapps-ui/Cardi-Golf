Machine: 4 shared vCPUs (Xeon 2.8 GHz), ~20 agents. "4× CPU" means Chromium's `Emulation.setCPUThrottlingRate 4`, Lighthouse's mid-tier mobile proxy. Load averages are recorded in every output file.

**Bundle (production env, sourcemapped; the file matches production's `index-O5Q-5WQE.js` to 43 B).** Entry 1,294,372 B raw, 404,306 B gzip, 414,110 B brotli as served by Vercel (brotli-11 would be 340,948 B). By package, raw / gzip-alone: react-dom 211 / 66 kB; supabase family 223 kB (auth-js 105, realtime 33, phoenix 26, storage 23, postgrest 17, supabase-js 11, iceberg-js 5, functions 3); motion 128 / ~42; dexie 99 / 33; react-router 93 / 32; zod 92 / 26; i18n 77 / 28; screens/tournament 76 / 23; engine ~93 / ~35; screens/profile 29; organizer 19; html-to-image 13; confetti 11; dev/profileFixtures 3. StatsScreen chunk 368 kB (108 kB gzip), of which Polo code is 7.6 kB. Platform-admin chunk 55 kB. Files: `attribution-*.tsv`.

**Precache and first install.** 78 entries, 2,604 KiB. Measured on production for a fresh visitor on `/`: the page transfers 561 KB in 8 requests, then the service worker makes 76 more requests for 696 KB, leaving 2.69 MB in Cache Storage. Unneeded for a player: dev chunks (DesignScreen, fixtures), Stats, the Comité and platform chunks, latin-ext and vietnamese fonts (141 KiB), and 512 px icons (180 KiB). Files: `precache-breakdown.txt`, `sw-install-*.json`.

**Lighthouse, mobile.**

| Run | Perf | FCP | LCP | TBT | TTI | Bytes |
|---|---|---|---|---|---|---|
| prod `/` simulated (chair) | 77 | 1.4 s | 3.7 s | 480 ms | 5.2 s | 572 KiB |
| prod `/t/ensayo` simulated (chair) | 76 | 1.2 s | 5.5 s | 180 ms | 5.5 s | 1,464 KiB |
| preview fixture full12-live simulated (chair) | 52 | 4.7 s | 5.8 s | 530 ms | 5.8 s | 563 KiB |
| prod `/` applied, load 2.3 / 4.5 | 58 / 53 | 2.1 / 1.8 s | 5.3 / 5.3 s | 840 / 1,470 ms | 6.7 / 7.3 s | 572 KiB |
| fixture full12-live applied (own server), load 3.2 / 7.6 | 55 / 52 | 1.5 / 1.5 s | 5.1 / 5.4 s | 1,250 / 1,640 ms | 6.5 / 7.1 s | 546 KiB |
| prod `/t/ensayo` applied, load ≈8 | 53 | 1.8 s | 7.6 s | 670 ms | 7.6 s | 1,464 KiB |

Applied runs above load 4 inflate the CPU metrics (TBT, TTI); their network timings still hold. In the applied `/t/ensayo` run the entry JS downloads from 833 to 3,879 ms and the logo from 7,509 to 13,065 ms. LCP is text (the event name, or the lede on `/`), with 2.9–7.4 s of render delay spent waiting on JS and the API chain. Unused JS on the first route is 71%, unused CSS 94%. Files: `lh/`, `lh-baseline-summary.txt`.

**Warm reopen (returning player, HTTP cache warm, 150 ms RTT, 1.6/0.75 Mbps, 4× CPU, production Ensayo).** Board visible at 3,231 ms. Sequence: lookup_tournament at +613 ms (486 ms) → my_membership at +1,147 (234 ms) → 9 selects at +1,397 → 11 selects at +1,920 → 2 selects at +2,581 (to +2,821). File: `ensayo-net-*.json`.

**One reload** (what every Realtime event triggers; production Ensayo, 12 players, 2 rounds; 5 runs). 22 REST requests in 3 waves, 60.6–60.7 KB down (scores 21 KB, the rest mostly headers), 991–1,416 ms wall time. At 4× CPU: script 99–184 ms (median 135), task 478–633 ms (median 544). REL measured 2–4 of these per saved hole on a watching phone.

**Re-renders per store update** (DevTools-hook counter, instrumented build).

| Scenario | full12-live | large60 |
|---|---|---|
| No-op reload | 3 commits, 282 renders, 1 DOM mutation | 3 commits, 406 renders, 1 mutation |
| One score changes | 3 commits, 414 renders, ~46 mutations | 3 commits, 598 renders, 24 mutations |
| 31 s idle | 1 commit, 131 renders, 0 mutations | n/a |

At 4× CPU (3 runs each), a no-op reload costs 118 / 123 ms of script (median) and 185 / 250 ms of main-thread task time; one changed score costs 135 / 124 ms script and 251 / 287 ms task.

**Interactions at 4× CPU** (Event Timing plus DOM-observed completion).
- Stepper tap: 32–56 ms (full12), 32–80 ms (large60), 51 renders per tap.
- «Guardar hoyo», tap → next hole: full12 221–449 ms (median 293); large60 406–956 ms (median 495). 11–14 commits and 655–713 renders per save, while the click's own Event Timing entry is only 40–80 ms.
- Tab switch: 24–88 ms.
- TV rotation: ~300 ms of main-thread work every 12 s (1.54 s of task time per minute).

**Engine** (Node 22, vitest bench, 60 runs after 8 warm-ups).
- large60 `computeTournament` median: 12.7 ms (load 4.4), then 14.5 / 14.4 / 16.6 ms (load 0.5–2.3); p95 21–29 ms.
- full12-live: 1.8 / 2.4 / 2.6 / 3.2 ms; p95 3.3–10.8 ms.
- parseSettings 0.05–0.16 ms; structuredClone of the snapshot 0.5–1.1 ms (full12) and 2.6–3.5 ms (large60).
- Serialized size: snapshot 57 KB and state 196 KB (full12); 272 KB and 864 KB (large60).
- Profile: computeFeed 32%, GC 18%, computeCore 14%, computeStats 4%.
- Files: `bench/`.

**Realtime socket, idle** (the app's exact channel, 130 s). Join 1,990 B, reply 1,486 B, a 395 B system error (REL-01), then a 35 B heartbeat and a 62 B reply every 25.04 s: about 0.4 KB/min and 6.5 frames/min. File: `rt-idle-*.json`.

**Share image** (fixture, 4× CPU, localhost). First tap: 13 requests (10 cache-busted), 378,647 B, 2,646 ms to the image. Second tap: 0 requests, 1,167 ms. ENSAYO_SHARE_PLACEHOLDER

**Memory, 24-minute runs** (forced GC before each sample). MEMORY_PLACEHOLDER
