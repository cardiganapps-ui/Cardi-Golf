// V9 / REL-16 trigger, on production auth with this verifier's OWN throwaway anonymous session (no claim, no tournament data):
// does GoTrue kill a session when a rotated refresh token is presented again after the reuse interval
// (what a phone does when a refresh response was lost on a flaky link and it retries later)?
// Token strings are never printed.
import { readFileSync, writeFileSync } from 'node:fs'
const V = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V9'
const env = readFileSync('/home/user/Cardi-Golf/.env.example', 'utf8')
const URL_ = /VITE_SUPABASE_URL=(\S+)/.exec(env)[1]
const ANON = /VITE_SUPABASE_ANON_KEY=(\S+)/.exec(env)[1]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)
const refresh = async (rt) => {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) })
  const b = await r.json().catch(() => ({}))
  return { status: r.status, code: b.error_code ?? b.code ?? null, msg: b.msg ?? b.message ?? b.error_description ?? null, session: b.access_token ? b : null }
}
const s0 = JSON.parse(readFileSync(`${V}/anon-session.json`, 'utf8'))
log('membership check skipped; session is anonymous:', s0.user?.is_anonymous, 'uid', s0.user?.id?.slice(0, 8))
const T1 = s0.refresh_token
const a = await refresh(T1)
log('1) refresh with T1 ->', a.status, a.code ?? '', '(a new pair T2 issued:', !!a.session, ')')
if (!a.session) process.exit(1)
writeFileSync(`${V}/anon-session.json`, JSON.stringify(a.session))
const T2 = a.session.refresh_token
const b = await refresh(T1)
log('2) T1 again at +0 s (inside the reuse interval) ->', b.status, b.code ?? '', b.session ? '(session returned)' : b.msg)
await sleep(15000)
const c = await refresh(T1)
log('3) T1 again at +15 s (after the reuse interval) ->', c.status, c.code ?? '', c.msg ?? '')
const d = await refresh(T2)
log('4) the legitimate newest token T2 afterwards ->', d.status, d.code ?? '', d.msg ?? (d.session ? 'still valid' : ''))
if (d.session) writeFileSync(`${V}/anon-session.json`, JSON.stringify(d.session))
