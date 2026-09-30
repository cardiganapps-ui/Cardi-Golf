import { readFileSync, writeFileSync } from 'node:fs'
const F = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/PERF.findings.json'
const a = JSON.parse(readFileSync(F, 'utf8'))
const f = Object.fromEntries(a.map((x) => [x.id, x]))
f['PERF-08'].evidence.push("lookup_tournament refuses callers without a session (supabase/migrations/0013_identity.sql: `if auth.uid() is null then raise 'Sin sesión'`), so a first open is necessarily sign-up → lookup; the avoidable part is everything after it. A phone reopened after its 1-hour access token expired (the morning of Day 2) also waits for auth-js's token refresh before the lookup (src/data/auth.ts:78-85 getSession), i.e. six dependent round trips")
f['PERF-08'].recommendation = "Stale-while-revalidate: on mount read the cached {lookup, me, snapshot} for the slug (snapshotCache already stores it) and render the board immediately with the 'actualizado hace N min' line, then revalidate in the background, refreshing the token in parallel. Serve lookup + membership + snapshot from one RPC (`tournament_open(slug)` returning json), so a fresh board is 1–2 round trips after the session. Budget: warm reopen to board ≤ 1.0 s at 4G/4× CPU (0 network round trips before first paint of the cached board); LCP ≤ 2.5 s on first open. Test: a Playwright check with throttling asserting a leaderboard row is visible before the first /rest/v1 response resolves."
writeFileSync(F, JSON.stringify(a, null, 2) + '\n')
JSON.parse(readFileSync(F, 'utf8'))
console.log('ok')
