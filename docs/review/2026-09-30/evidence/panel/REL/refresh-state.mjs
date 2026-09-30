// Refresh a stored session once from Node (grant_type=refresh_token) and write it back to the state file,
// for both the :4173 and :4185 origins. Never prints tokens.
// usage: node refresh-state.mjs <stateName>
import { readFileSync, writeFileSync } from 'node:fs'
import { E, SB_URL, ANON, STORAGE_KEY } from './lib.mjs'

const name = process.argv[2]
const file = `${E}/state/${name}.json`
const st = JSON.parse(readFileSync(file, 'utf8'))
const origin = st.origins.find((o) => o.localStorage.some((x) => x.name === STORAGE_KEY))
const cur = JSON.parse(origin.localStorage.find((x) => x.name === STORAGE_KEY).value)
const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ refresh_token: cur.refresh_token }),
})
const body = await res.json()
if (!res.ok) {
  console.log(name, 'refresh failed', res.status, body.error_code ?? body.error ?? '', String(body.msg ?? body.error_description ?? '').slice(0, 80))
  process.exit(1)
}
const next = { ...cur, access_token: body.access_token, refresh_token: body.refresh_token, expires_in: body.expires_in, expires_at: body.expires_at, token_type: body.token_type, user: body.user ?? cur.user }
const value = JSON.stringify(next)
for (const o of ['http://127.0.0.1:4173', 'http://127.0.0.1:4185']) {
  let entry = st.origins.find((x) => x.origin === o)
  if (!entry) {
    entry = { origin: o, localStorage: [] }
    st.origins.push(entry)
  }
  const item = entry.localStorage.find((x) => x.name === STORAGE_KEY)
  if (item) item.value = value
  else entry.localStorage.push({ name: STORAGE_KEY, value })
}
writeFileSync(file, JSON.stringify(st))
console.log(name, 'refreshed; same user', next.user?.id === cur.user?.id, 'expires', new Date(next.expires_at * 1000).toISOString())
