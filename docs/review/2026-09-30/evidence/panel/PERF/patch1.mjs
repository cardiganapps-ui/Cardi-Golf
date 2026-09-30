import { readFileSync, writeFileSync } from 'node:fs'
const F = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/PERF.findings.json'
const a = JSON.parse(readFileSync(F, 'utf8'))
const byId = Object.fromEntries(a.map((f) => [f.id, f]))
byId['PERF-05'].evidence.push("Measured on production (sw-install.mjs, fresh visitor on /, no sign-in): the page itself transfers 561,194 B in 8 requests, then the service worker makes 76 more requests for 696,188 B on the wire (the entry JS and the latin Archivo come from the HTTP cache), leaving 2,692 KB in Cache Storage; the largest precached files are StatsScreen 108,041 B, icon-512 106,654, archivo latin-ext 86,240, icon-maskable-512 73,573, polo-mark-board 48,825, polo-mark 35,188, archivo vietnamese 34,464, and DesignScreen 14,136 (a dev-only screen). Output: $S/panel/evidence/PERF/sw-install-*.json")
byId['PERF-05'].title = 'The service worker precaches 2.6 MB on first install (measured: 76 extra requests, 696 KB on the wire after a 561 KB page), including dev-only chunks, every Comité and platform-admin screen, recharts and two font subsets Spanish never uses'
byId['PERF-05'].repro += " Live: `node $S/panel/evidence/PERF/sw-install.mjs` → serviceWorker.requests 76, bytes ≈696,000, largestSw lists DesignScreen-*.js."
const e7 = byId['PERF-07'].evidence
const i = e7.findIndex((x) => x.startsWith('src/data/outbox.ts:270-292'))
e7[i] = "src/data/outbox.ts:270-292 pushes a hole's four scores one request at a time, so each upsert produces its own Realtime event; in REL's throttled-4G runs ($S/panel/evidence/REL/logs/latency-fixed.log, aPushesDoneMs) the four pushes land 220–1,440 ms apart, so the 150 ms debounce never merges them and the watching phone ran 2–4 reloads (44–88 REST requests) per saved hole"
e7.push("Foreground after a dropped socket (the normal case when a phone is locked between holes): the visibilitychange listener calls reload() (tournamentStore.ts:74-78) and the channel's re-SUBSCRIBED callback calls reload() again (280-282); the fetchSeq guard discards the first result but not its 22 requests, so each unlock can cost two full snapshots (code reading; Chromium in this sandbox cannot open the Supabase socket, so not reproduced live)")
e7.push("Idle socket, for contrast (rt-idle.mjs, app's exact channel, 130 s): join 1,990 B + reply 1,486 B + a 395 B system error (REL-01), then one 35 B heartbeat and 62 B reply every 25.04 s ≈ 0.4 KB/min. The steady-state cost is the refetches, not the socket")
const e9 = byId['PERF-09'].evidence
e9[0] = "39 call sites in 32 files select the whole blob with useTournament((s) => s.data) (LiveScreen.tsx:50, TournamentShell.tsx:34, FeedTicker.tsx:29, SnakeBoard.tsx:16, GamesScreen.tsx:26, ScorecardScreen.tsx:42,125, useMyGroup.ts:14,20, TvScreen.tsx:24,223, every admin screen…); compute() (tournamentStore.ts:87-100) returns a new object graph on every reload or patch, with no structural sharing, so every one of them re-renders"
writeFileSync(F, JSON.stringify(a, null, 2) + '\n')
JSON.parse(readFileSync(F, 'utf8'))
console.log('patched', a.length)
