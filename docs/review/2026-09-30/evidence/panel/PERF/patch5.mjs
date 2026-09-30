import { readFileSync, writeFileSync } from 'node:fs'
const F = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/PERF.findings.json'
const a = JSON.parse(readFileSync(F, 'utf8'))
const f = a.find((x) => x.id === 'PERF-11')
f.impact = "Sharing the leaderboard or the settlement to WhatsApp is a headline moment (§9.11, M6 'Diego says wow', the ceremony). On production the first tap costs 1.24 MB and six seconds even on a fast link and a quiet CPU; on the 1.6 Mbps link used elsewhere in this report the download alone adds ~6 s. iOS only opens the share sheet inside the tap's activation window, so a render this slow turns the share into the download fallback, which is what the audit's bug looked like. The cost repeats on every device and every page load."
f.repro = "Production (read-only, needs a session on /t/ensayo): `node $S/panel/evidence/PERF/share.mjs https://golf.cardigan.mx /t/ensayo 1 1` → 'tap 0: image after ~6000 ms; 15 requests (11 cache-busted), 1235878 B' with logo.png?<timestamp> 889,914 B. Without a session: serve a design build (`npx vite preview --outDir $S/dist-design --port 4186`) and run `node $S/panel/evidence/PERF/share.mjs http://127.0.0.1:4186 /t/_/full12-live 0 2` → 13 requests (10 cache-busted), 378,647 B. By hand: DevTools › Network, tap «Compartir tabla»: woff2 files and logo.png with ?1790… query strings."
writeFileSync(F, JSON.stringify(a, null, 2) + '\n')
JSON.parse(readFileSync(F, 'utf8'))
console.log(f.impact)
