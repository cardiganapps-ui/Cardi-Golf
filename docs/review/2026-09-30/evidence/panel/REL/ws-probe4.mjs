import { chromium } from 'playwright-core'
import { CHROME, ANON, SB_URL } from './lib.mjs'
const b = await chromium.launch({ executablePath: CHROME, args: process.argv.slice(2) })
const page = await b.newPage()
page.on('console', (m) => console.log('console:', m.type(), m.text().replace(ANON, '<k>').slice(0, 300)))
await page.goto('http://127.0.0.1:4173/fixture')
const cdp = await page.context().newCDPSession(page)
await cdp.send('Network.enable')
cdp.on('Network.webSocketWillSendHandshakeRequest', (e) => console.log('req', JSON.stringify(e.request.headers).replace(/eyJ[^"]+/g,'<jwt>').replace(/__cf_bm=[^;"]+/g,'__cf_bm=<c>')))
cdp.on('Network.webSocketCreated', (e) => console.log('created', e.url.replace(ANON, '<k>').slice(0, 90)))
cdp.on('Network.webSocketHandshakeResponseReceived', (e) => console.log('handshake', e.response.status, e.response.statusText, JSON.stringify(e.response.headers).slice(0,600)))
cdp.on('Network.webSocketFrameError', (e) => console.log('frameError', e.errorMessage))
cdp.on('Network.webSocketClosed', (e) => console.log('closed'))
cdp.on('Network.loadingFailed', (e) => console.log('loadingFailed', e.type, e.errorText))
await page.evaluate(async ({ url, key }) => {
  await new Promise((res) => {
    const ws = new WebSocket(`${url.replace('https', 'wss')}/realtime/v1/websocket?apikey=${key}&vsn=1.0.0`)
    ws.onclose = () => res(); setTimeout(res, 6000)
  })
}, { url: SB_URL, key: ANON })
await new Promise((r) => setTimeout(r, 500))
await b.close()
