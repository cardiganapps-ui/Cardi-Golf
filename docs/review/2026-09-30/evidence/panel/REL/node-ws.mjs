import { WebSocket, ProxyAgent } from 'undici'
import { ANON, SB_URL } from './lib.mjs'
const url = `${SB_URL.replace('https', 'wss')}/realtime/v1/websocket?apikey=${ANON}&vsn=1.0.0`
const t0 = Date.now()
const ws = new WebSocket(url, { dispatcher: new ProxyAgent(process.env.HTTPS_PROXY) })
ws.onopen = () => { console.log('open', Date.now() - t0); ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: '1' })) }
ws.onmessage = (m) => { console.log('msg', Date.now() - t0, String(m.data).slice(0, 200)); ws.close() }
ws.onerror = (e) => console.log('error', e.message ?? e.type)
ws.onclose = (c) => console.log('close', c.code)
