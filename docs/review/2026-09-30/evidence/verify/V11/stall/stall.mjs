// V11 / REL-14 calibration: how long does Chromium keep a fetch pending when the network path silently dies?
// h2 server (TLS, self-signed) <- TCP relay with a blackhole switch <- Chromium page. Nothing leaves the machine.
import http2 from 'node:http2'
import net from 'node:net'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
const dir = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V11/stall'
const CAP = Number(process.argv[2] ?? 150) * 1000
const server = http2.createSecureServer({ key: readFileSync(`${dir}/key.pem`), cert: readFileSync(`${dir}/cert.pem`) }, (req, res) => {
  if (req.url === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>stall</title><p>stall</p>')
  if (req.url === '/ok') return res.writeHead(200).end('ok')
  if (req.url === '/push') { let n = 0; req.on('data', (c) => (n += c.length)); req.on('end', () => setTimeout(() => res.writeHead(200).end('pushed ' + n), 10)); return }
  res.writeHead(404).end()
})
await new Promise((r) => server.listen(18443, '127.0.0.1', r))
const relay = { blackhole: false, conns: 0 }
const proxy = net.createServer((c) => {
  relay.conns++
  const u = net.connect(18443, '127.0.0.1')
  c.on('data', (d) => { if (!relay.blackhole) u.write(d) })
  u.on('data', (d) => { if (!relay.blackhole) c.write(d) })
  c.on('error', () => undefined); u.on('error', () => undefined)
  c.on('close', () => u.destroy()); u.on('close', () => c.destroy())
})
await new Promise((r) => proxy.listen(18444, '127.0.0.1', r))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)
async function trial(label, idleMs) {
  relay.blackhole = false
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  await page.goto('https://127.0.0.1:18444/')
  const warm = await page.evaluate(async () => { const r = await fetch('/ok'); await r.text(); const e = performance.getEntriesByType('resource').at(-1); return e?.nextHopProtocol })
  relay.blackhole = true // the path dies silently: no RST, no FIN, bytes vanish both ways
  log(label, 'warm fetch ok over', warm, '; path blackholed; idle', idleMs, 'ms before the push')
  const result = await page.evaluate(async ([idle, cap]) => {
    await new Promise((r) => setTimeout(r, idle))
    const t0 = performance.now()
    const p = fetch('/push', { method: 'POST', body: 'x'.repeat(200) }).then(async (r) => 'resolved ' + r.status + ' ' + (await r.text()), (e) => 'rejected: ' + String(e))
    const capP = new Promise((r) => setTimeout(() => r('still pending at cap'), cap))
    const out = await Promise.race([p, capP])
    return { outcome: out, afterMs: Math.round(performance.now() - t0) }
  }, [idleMs, CAP])
  log(label, JSON.stringify(result))
  await ctx.close()
  return result
}
const A = await trial('A: connection idle 12 s, then the push', 12000)
const B = await trial('B: connection just used (<1 s), then the push', 200)
console.log(JSON.stringify({ A, B, relayConnections: relay.conns }))
await browser.close(); proxy.close(); server.close()
process.exit(0)
