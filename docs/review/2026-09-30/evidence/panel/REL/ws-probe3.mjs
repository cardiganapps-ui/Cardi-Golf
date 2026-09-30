import { chromium } from 'playwright-core'
import { CHROME, ANON, SB_URL } from './lib.mjs'
const mode = process.argv[2]
const opts = { executablePath: CHROME }
if (mode === 'proxy') opts.proxy = { server: 'http://127.0.0.1:36625' }
if (mode === 'flag') opts.args = ['--proxy-server=http://127.0.0.1:36625']
if (mode === 'noh2') opts.args = ['--disable-http2']
if (mode === 'noh2quic') opts.args = ['--disable-http2', '--disable-quic']
const b = await chromium.launch(opts)
const page = await b.newPage()
await page.goto('http://127.0.0.1:4173/fixture')
const r = await page.evaluate(async ({ url, key }) => {
  const log = []; const t0 = performance.now()
  await new Promise((res) => {
    const ws = new WebSocket(`${url.replace('https', 'wss')}/realtime/v1/websocket?apikey=${key}&vsn=1.0.0`)
    ws.onopen = () => { log.push([Math.round(performance.now()-t0), 'open']); ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: '1' })) }
    ws.onmessage = (m) => { log.push([Math.round(performance.now()-t0), 'msg', String(m.data).slice(0, 200)]); ws.close(); }
    ws.onclose = (c) => { log.push([Math.round(performance.now()-t0), 'close', c.code]); res() }
    setTimeout(res, 6000)
  })
  return log
}, { url: SB_URL, key: ANON })
console.log(mode, JSON.stringify(r))
await b.close()
