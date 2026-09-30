// One-time setup: ONE anonymous sign-in + Nico claim (Ensayo PIN from $ENSAYO_PIN, single attempt) on my own origin (:4210),
// SW installed, snapshot cached. Leaves a "golden" persistent profile and the session in state/session.json.
import { openPersistent, E, BASE, STORAGE_KEY, sleep, log, rmSync, writeFileSync, mkdirSync, jwtInfo, storedSession, screenState } from './v10lib.mjs'

const dir = `${E}/profiles/golden`
rmSync(dir, { recursive: true, force: true })
mkdirSync(`${E}/state`, { recursive: true })
const ctx = await openPersistent(dir)
const page = ctx.pages()[0] ?? (await ctx.newPage())
const T = 60000
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Elige tu nombre', { timeout: T })
await page.click('text=Nico')
await page.waitForSelector('input[type=password]', { timeout: T })
await page.fill('input[type=password]', process.env.ENSAYO_PIN ?? '')
await page.waitForSelector('text=Individual', { timeout: T })
log('claimed; board visible')
await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
await sleep(3000)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Individual', { timeout: T })
await sleep(3000)
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller)
const cache = await page.evaluate(
  () =>
    new Promise((res) => {
      const req = indexedDB.open('cardi-golf-cache')
      req.onsuccess = () => {
        const tx = req.result.transaction(['entries', 'snapshots'])
        const e = tx.objectStore('entries').getAllKeys()
        const s = tx.objectStore('snapshots').count()
        tx.oncomplete = () => res({ entries: e.result, snapshots: s.result })
      }
      req.onerror = () => res(null)
    }),
)
const sess = await storedSession(page)
log('SW controls page:', controlled, 'cache:', JSON.stringify(cache), 'session user', jwtInfo(sess.access_token)?.sub, 'expires_at', new Date(sess.expires_at * 1000).toISOString())
log('screen:', JSON.stringify(await screenState(page)))
writeFileSync(`${E}/state/session.json`, JSON.stringify(sess))
await ctx.close()
log('golden profile saved')
