import { chromium } from 'playwright-core'
import { CHROME, E, BASE } from './v10lib.mjs'
const dir = `${E}/profiles/${process.argv[2]}`
const ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, serviceWorkers: 'block' })
await ctx.route(`${BASE}/v10-blank`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' }))
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto(`${BASE}/v10-blank`)
const rej = await page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open('cardi-golf-outbox')
  req.onsuccess = () => { const tx = req.result.transaction(['rejected']); const g = tx.objectStore('rejected').getAll(); tx.oncomplete = () => res(g.result) }
  req.onerror = () => res(null)
}))
console.log(JSON.stringify((rej ?? []).map((r) => ({ kind: r.kind, hole: r.payload?.hole, strokes: r.payload?.strokes, putts: r.payload?.putts, message: r.message }))))
await ctx.close()
