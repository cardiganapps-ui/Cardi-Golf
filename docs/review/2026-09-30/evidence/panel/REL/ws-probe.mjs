// Probe: what does the Realtime channel say when the app subscribes? Logs phx_join / phx_reply frames (no tokens).
import { launch, newPhone, E, BASE, sleep } from './lib.mjs'
const b = await launch()
const ctx = await newPhone(b, `${E}/state/nico-A.json`)
const page = await ctx.newPage()
const frames = []
page.on('websocket', (ws) => {
  frames.push({ t: Date.now(), ev: 'open', url: ws.url().replace(/apikey=[^&]+/, 'apikey=<k>').replace(/access_token=[^&]+/, 'access_token=<t>') })
  ws.on('framesent', (f) => {
    const s = String(f.payload)
    if (/phx_join|access_token/.test(s)) frames.push({ t: Date.now(), dir: 'sent', data: s.replace(/"access_token":"[^"]+"/g, '"access_token":"<t>"').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>').slice(0, 1500) })
  })
  ws.on('framereceived', (f) => {
    const s = String(f.payload)
    if (/phx_reply|system|phx_error|phx_close/.test(s)) frames.push({ t: Date.now(), dir: 'recv', data: s.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>').slice(0, 1500) })
  })
  ws.on('close', () => frames.push({ t: Date.now(), ev: 'close' }))
})
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Individual', { timeout: 40000 })
await sleep(8000)
const header = await page.locator('header').first().innerText()
console.log('HEADER:', JSON.stringify(header))
for (const f of frames) console.log(JSON.stringify(f))
await page.screenshot({ path: `${E}/shots/ws-probe-live.png` })
await b.close()
