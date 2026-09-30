import { readFileSync, writeFileSync } from 'node:fs'
const P = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/PERF.md'
let md = readFileSync(P, 'utf8')
const rep = (a, b) => { if (!md.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); md = md.replace(a, b) }
rep('**Memory, 24-minute runs** (forced GC before each sample). - **Production Ensayo TV**', '**Memory, 24-minute runs** (forced GC before each sample).\n\n- **Production Ensayo TV**')
rep('| Audit P2: `design/shots` is 58 MB | **still open, grown** to 64 MB → PERF-15 |', '| Audit P2: `design/shots` is 58 MB | **still open, grown** | 64 MB now (pack 66.5 MiB) → PERF-15 |')
rep('- **Service worker install** (`sw-install.mjs`): a fresh visitor on production `/`, no sign-in. **Share** (`share.mjs`): first and second taps.', '- **Service worker install** (`sw-install.mjs`): a fresh visitor on production `/`, no sign-in.\n- **Share** (`share.mjs`): the first and second taps on the fixture, and one read-only tap on production Ensayo.\n- **Logo upload** (`logo-upload.mjs`): runs `src/lib/images.ts` `downscaleImage` verbatim in Chromium on `assets/nacho-logo.png`.')
writeFileSync(P, md)
console.log('ok', md.length)
