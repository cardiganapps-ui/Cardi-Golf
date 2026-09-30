// Raw WebSocket probe from a page on the preview origin: close code/reason and every frame (tokens redacted).
import { launch, newPhone, E, BASE, ANON, SB_URL, sleep } from './lib.mjs'
const b = await launch()
const ctx = await newPhone(b, `${E}/state/nico-A.json`)
const page = await ctx.newPage()
await page.goto(`${BASE}/fixture`, { waitUntil: 'domcontentloaded' })
const res = await page.evaluate(
  async ({ url, key, vsn }) => {
    const log = []
    const t0 = performance.now()
    await new Promise((resolve) => {
      const ws = new WebSocket(`${url.replace('https', 'wss')}/realtime/v1/websocket?apikey=${key}&vsn=${vsn}`)
      ws.onopen = () => {
        log.push([Math.round(performance.now() - t0), 'open'])
        const msg = vsn === '1.0.0'
          ? JSON.stringify({ topic: 'realtime:probe', event: 'phx_join', payload: { config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: [] } }, ref: '1' })
          : JSON.stringify(['1', '1', 'realtime:probe', 'phx_join', { config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: [] } }])
        ws.send(msg)
        log.push([Math.round(performance.now() - t0), 'sent join'])
      }
      ws.onmessage = (m) => log.push([Math.round(performance.now() - t0), 'msg', String(m.data).slice(0, 400)])
      ws.onerror = () => log.push([Math.round(performance.now() - t0), 'error'])
      ws.onclose = (c) => {
        log.push([Math.round(performance.now() - t0), 'close', c.code, c.reason, c.wasClean])
        resolve()
      }
      setTimeout(() => {
        try { ws.close() } catch {}
        resolve()
      }, 6000)
    })
    return log
  },
  { url: SB_URL, key: ANON, vsn: process.argv[2] ?? '2.0.0' },
)
console.log(JSON.stringify(res, null, 0))
await b.close()
