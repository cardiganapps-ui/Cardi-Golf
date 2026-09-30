// REL panel helpers: Chromium launch, Nico session reuse, REST reads with the session JWT.
import { chromium } from 'playwright-core'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'

export const E = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/REL'
export const BASE = process.env.BASE ?? 'http://127.0.0.1:4173'
export const SB_URL = 'https://gmohwledjejlhcwqjnhd.supabase.co'
const envText = readFileSync('/home/user/Cardi-Golf/.env.example', 'utf8')
export const ANON = /VITE_SUPABASE_ANON_KEY=(\S+)/.exec(envText)[1]
export const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
export const STORAGE_KEY = 'cardi-golf-auth'

export async function launch(opts = {}) {
  return chromium.launch({ executablePath: CHROME, ...opts })
}

export async function newPhone(browser, statePath, extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    ...(statePath && existsSync(statePath) ? { storageState: statePath } : {}),
    ...extra,
  })
  return ctx
}

/** Read the stored supabase session from a page (never printed). */
export async function sessionOf(page) {
  return page.evaluate((k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null')
    } catch {
      return null
    }
  }, STORAGE_KEY)
}

/** REST GET with a JWT, from Node (through the egress proxy). */
export async function rest(path, jwt) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}` } })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body }
}
export async function rpc(name, args, jwt) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args ?? {}),
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body }
}

export function saveJson(name, obj) {
  writeFileSync(`${E}/${name}`, JSON.stringify(obj, null, 2))
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * The sandbox's egress relay answers Chromium's WebSocket handshake to Supabase with a 500
 * (curl and Node get 101 through the same relay). Bridge the page's Realtime socket through
 * a Node WebSocket so realtime can be exercised. `log` receives [ms, dir, text] tuples.
 * opts.block: return true to drop the bridge (simulate a blocked socket).
 */
export async function bridgeRealtime(ctx, opts = {}) {
  const { WebSocket: NodeWS, ProxyAgent } = await import('undici')
  const agent = new ProxyAgent(process.env.HTTPS_PROXY)
  await ctx.routeWebSocket(/supabase\.co\/realtime\/v1\/websocket/, (ws) => {
    if (opts.block?.()) {
      ws.close({ code: 1006, reason: 'blocked by test' })
      return
    }
    const upstream = new NodeWS(ws.url(), { dispatcher: agent })
    const queue = []
    let open = false
    const delay = opts.delayMs ?? 0
    const later = (fn) => (delay ? setTimeout(fn, delay) : fn())
    // fixJoin: simulate the fix for REL-01 (drop the unpublished tables from the join, put
    // placeholder bindings back into the reply so the client's binding check still matches).
    const pendingFix = new Map()
    const fixOut = (m) => {
      if (!opts.fixJoin) return m
      try {
        const a = JSON.parse(m)
        if (Array.isArray(a) && a[3] === 'phx_join' && a[4]?.config?.postgres_changes) {
          const pc = a[4].config.postgres_changes
          const removed = []
          a[4].config.postgres_changes = pc.filter((b, i) => {
            if (b.table === 'teams' || b.table === 'team_members') {
              removed.push([i, b])
              return false
            }
            return true
          })
          if (removed.length) pendingFix.set(a[1], removed)
          return JSON.stringify(a)
        }
      } catch {}
      return m
    }
    const fixIn = (m) => {
      if (!pendingFix.size) return m
      try {
        const a = JSON.parse(m)
        if (Array.isArray(a) && a[3] === 'phx_reply' && pendingFix.has(a[1]) && a[4]?.response?.postgres_changes) {
          const pc = a[4].response.postgres_changes
          for (const [i, b] of pendingFix.get(a[1])) pc.splice(i, 0, { id: 1, ...b })
          pendingFix.delete(a[1])
          return JSON.stringify(a)
        }
      } catch {}
      return m
    }
    upstream.onopen = () => {
      open = true
      for (const m of queue.splice(0)) upstream.send(m)
    }
    upstream.onmessage = (e) => {
      const data = typeof e.data === 'string' ? fixIn(e.data) : Buffer.from(e.data)
      opts.log?.([Date.now(), 'recv', String(data).slice(0, 300)])
      later(() => {
        try {
          ws.send(data)
        } catch {}
      })
    }
    upstream.onclose = (c) => {
      try {
        ws.close({ code: c.code === 1005 ? 1000 : c.code, reason: c.reason })
      } catch {}
    }
    upstream.onerror = () => {}
    ws.onMessage((raw) => {
      const m = typeof raw === 'string' ? fixOut(raw) : raw
      opts.log?.([Date.now(), 'sent', String(m).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>').slice(0, 300)])
      later(() => {
        if (open) upstream.send(m)
        else queue.push(m)
      })
    })
    ws.onClose(() => {
      try {
        upstream.close()
      } catch {}
    })
    opts.onSocket?.({ ws, upstream })
  })
}

/** Claim a player on /t/ensayo in a fresh context (ONE anonymous sign-in). */
export async function claim(page, player = 'Nico', pin = '1234', T = 40000) {
  await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('text=Elige tu nombre', { timeout: T })
  await page.click(`text=${player}`)
  await page.waitForSelector('input[type=password]', { timeout: T })
  await page.fill('input[type=password]', pin)
  await page.waitForSelector('text=Individual', { timeout: T })
}
