import { readFileSync, writeFileSync } from 'node:fs'
const P = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/PERF.md'
let md = readFileSync(P, 'utf8')
const rep = (a, b) => {
  if (!md.includes(a)) throw new Error('missing: ' + a.slice(0, 60))
  md = md.replace(a, b)
}
rep('ENSAYO_SHARE_PLACEHOLDER', "On production Ensayo (Nico, 4× CPU, fast link, load 0.95), the first tap made 15 requests (11 cache-busted) for 1,235,878 B, including `logo.png?<timestamp>` at 889,914 B although the plain `logo.png` was already cached, and took 5,951 ms to produce the image. Files: `share-*.json`.")
rep('MEMORY_PLACEHOLDER', "- **Production Ensayo TV** (`/t/ensayo/tv`, reload every 20 s: 72 reloads, 1,584 REST requests, 0 errors): heap 5.98 → 7.16 (1 min) → 8.32 (12 min) → 8.69 MB (24 min). DOM nodes varied 75–232 with the rotating board; listeners went 211 → 203.\n- **Fixture large60 En vivo** (a changed score every 10 s, 143 updates): heap 7.38 → 9.92 → 10.60 → 10.99 MB; 1,004 nodes and 255 listeners throughout.\n- **Trend**: the rate halves in the second half, to about 1.9 MB/h. A linear 4-hour projection is +8–16 MB, about 20–25 MB in total.\n- **Accelerated check** (`leak-accel.mjs`, 600 updates in about 2 minutes): 7.38 → 11.23 MB at 300 updates → 11.82 MB at 600. Between heap snapshots at 300 and 600 updates, the growth is +552 KB of V8 `code` objects (JIT tiering) against +0.9 KB of plain objects.\n- **Verdict**: no leak, so no finding. Files: `memory-*.json`, `leak-accel-*.json`.")
rep("- **Memory** (`memory.mjs`). Two 24-minute runs: production `/t/ensayo/tv` reloading every 20 s, and fixture large60 En vivo with a synthetic score change every 10 s. `HeapProfiler.collectGarbage` before each 60 s sample.", "- **Memory** (`memory.mjs`). Two 24-minute runs: production `/t/ensayo/tv` reloading every 20 s, and fixture large60 En vivo with a synthetic score change every 10 s. `HeapProfiler.collectGarbage` before each 60 s sample. `leak-accel.mjs` then ran 600 updates with heap-snapshot constructor diffs.")
rep('Nothing guards any of this:', 'Sharing the board to WhatsApp, a headline moment, costs 1.24 MB and 6 s on the first tap because every font and the logo are re-downloaded with cache-busting (PERF-11). Nothing guards any of this:')
rep('No P0: nothing here loses data or money, which keeps the grade out of F.', 'Memory is sound: no leak over 24-minute sessions or 600 accelerated updates. No P0: nothing here loses data or money, which keeps the grade out of F.')
rep('- **A cheap idle socket**:', '- **Memory hygiene**: heap after GC stays under 11 MB with constant DOM nodes and listeners over 24-minute live sessions (TV and large60). In 600 accelerated updates, app objects grew by under 1 KB; the remaining creep is JIT code.\n- **A cheap idle socket**:')
rep('cache-busted share renders (PERF-11) and smaller', 'and smaller')
writeFileSync(P, md)
console.log('placeholders left:', (md.match(/_PLACEHOLDER/g) || []).length, 'chars', md.length)
