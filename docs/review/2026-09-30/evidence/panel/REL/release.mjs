// Release this review's two device claims (release_device deletes only the caller's device_sessions row).
import { readFileSync } from 'node:fs'
import { E, STORAGE_KEY, rpc } from './lib.mjs'
for (const name of ['playerD', 'nico-A']) {
  const st = JSON.parse(readFileSync(`${E}/state/${name}.json`, 'utf8'))
  const jwt = JSON.parse(st.origins.find((o) => o.localStorage.some((x) => x.name === STORAGE_KEY)).localStorage.find((x) => x.name === STORAGE_KEY).value).access_token
  const before = (await rpc('my_membership', { tid: '8b40f02b-e8be-4cd7-a93a-b42d450f5fda' }, jwt)).body
  const r = await rpc('release_device', {}, jwt)
  const after = (await rpc('my_membership', { tid: '8b40f02b-e8be-4cd7-a93a-b42d450f5fda' }, jwt)).body
  console.log(name, 'release', r.status, 'player before', before.playerId?.slice(0, 8), 'after', after.playerId ?? null)
}
