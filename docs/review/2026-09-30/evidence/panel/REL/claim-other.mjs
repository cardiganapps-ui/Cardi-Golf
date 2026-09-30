// Claim ONE non-admin Ensayo player (by id) with the seeded PIN, a single attempt. Saves state/<name>.json.
// The display name is read in-process to click the face and never printed.
import { readFileSync } from 'node:fs'
import { launch, newPhone, E, BASE, rest, rpc, sleep, sessionOf, STORAGE_KEY } from './lib.mjs'

const pid = process.argv[2]
const out = process.argv[3]
const st = JSON.parse(readFileSync(`${E}/state/nico-A.json`, 'utf8'))
const jwt = JSON.parse(st.origins.find((o) => o.origin === BASE).localStorage.find((x) => x.name === STORAGE_KEY).value).access_token
const p = (await rest(`players?id=eq.${pid}&select=id,display_name,is_admin`, jwt)).body[0]
if (!p || p.is_admin) throw new Error('not a non-admin player')
const b = await launch()
const ctx = await newPhone(b, null)
const page = await ctx.newPage()
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Elige tu nombre', { timeout: 40000 })
await page.getByRole('button', { name: new RegExp(`^${p.display_name}`) }).first().click()
await page.waitForSelector('input[type=password]', { timeout: 40000 })
await page.fill('input[type=password]', '1234')
const ok = await Promise.race([
  page.waitForSelector('text=Individual', { timeout: 20000 }).then(() => true),
  page.waitForSelector('text=/incorrecto|bloquead|intentos/i', { timeout: 20000 }).then(() => false),
]).catch(() => false)
if (!ok) {
  console.log('claim failed (single attempt, stopping)')
  await b.close()
  process.exit(1)
}
await sleep(1500)
const s = await sessionOf(page)
const mem = (await rpc('my_membership', { tid: '8b40f02b-e8be-4cd7-a93a-b42d450f5fda' }, s.access_token)).body
console.log('claimed', pid.slice(0, 8), 'membership', JSON.stringify({ playerId: mem.playerId?.slice(0, 8), isAdmin: mem.isAdmin, isOrganizer: mem.isOrganizer, via: mem.via }), 'expires', new Date(s.expires_at * 1000).toISOString())
await ctx.storageState({ path: `${E}/state/${out}.json` })
await b.close()
