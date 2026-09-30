// V10 verifier helpers (own code; the Realtime bridge follows the same idea as REL's lib.mjs, re-written).
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync } from 'node:fs'

export const S = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad'
export const E = `${S}/verify/evidence/V10`
export const BASE = 'http://127.0.0.1:4210'
export const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
export const STORAGE_KEY = 'cardi-golf-auth'
export const SB_HOST = 'gmohwledjejlhcwqjnhd.supabase.co'
export const ANON = /VITE_SUPABASE_ANON_KEY=(\S+)/.exec(readFileSync('/home/user/Cardi-Golf/.env.example', 'utf8'))[1]
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const t0 = Date.now()
export const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s]`, ...a)

export async function openPersistent(dir, extra = {}) {
  mkdirSync(dir, { recursive: true })
  return chromium.launchPersistentContext(dir, {
    executablePath: CHROME,
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    ...extra,
  })
}

/** Copy a prepared profile so each run starts from the same on-disk state (SW, IndexedDB, localStorage). */
export function cloneProfile(from, to) {
  rmSync(to, { recursive: true, force: true })
  cpSync(from, to, { recursive: true })
}

/** JWT payload (sub/exp only; never printed whole). */
export function jwtInfo(jwt) {
  try {
    const p = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
    return { sub: p.sub?.slice(0, 8), role: p.role, exp: p.exp, anon: p.role === 'anon' }
  } catch {
    return null
  }
}

export async function storedSession(page) {
  return page.evaluate((k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null')
    } catch {
      return null
    }
  }, STORAGE_KEY)
}

/** Set the stored session's access-token expiry (epoch seconds). Tokens are never printed. */
export async function setExpiry(page, expSeconds) {
  return page.evaluate(
    ([k, exp]) => {
      const s = JSON.parse(localStorage.getItem(k))
      s.expires_at = exp
      localStorage.setItem(k, JSON.stringify(s))
      return true
    },
    [STORAGE_KEY, expSeconds],
  )
}

export async function idbCounts(page) {
  return page
    .evaluate(
      () =>
        new Promise((res) => {
          const req = indexedDB.open('cardi-golf-outbox')
          req.onsuccess = () => {
            try {
              const tx = req.result.transaction(['items', 'rejected'])
              const a = tx.objectStore('items').count()
              const r = tx.objectStore('rejected').count()
              tx.oncomplete = () => res({ items: a.result, rejected: r.result })
            } catch (e) {
              res({ err: String(e) })
            }
          }
          req.onerror = () => res(null)
        }),
    )
    .catch(() => null)
}

/** What the tournament screen shows right now (header + first lines), trimmed. */
export async function screenState(page) {
  return page
    .evaluate(() => {
      const hdr = document.querySelector('header')?.innerText?.replace(/\n+/g, ' | ') ?? null
      const body = (document.body?.innerText ?? '').split('\n').filter(Boolean).slice(0, 8).join(' | ')
      const board = !!document.querySelector('header') && /Individual/.test(document.body.innerText)
      const enter = /Elige tu nombre/.test(document.body.innerText)
      return { hdr, board, enter, body: body.slice(0, 260) }
    })
    .catch((e) => ({ err: String(e).slice(0, 80) }))
}

/**
 * The sandbox relay answers Chromium's Realtime WebSocket handshake with HTTP 500 while Node gets 101,
 * so relay the page socket through a Node (undici) WebSocket, frames unmodified.
 */
export async function bridgeRealtime(ctx, { onFrame } = {}) {
  const { WebSocket: NodeWS, ProxyAgent } = await import('undici')
  const agent = new ProxyAgent(process.env.HTTPS_PROXY)
  await ctx.routeWebSocket(/supabase\.co\/realtime\/v1\/websocket/, (ws) => {
    const up = new NodeWS(ws.url(), { dispatcher: agent })
    const q = []
    let open = false
    up.onopen = () => {
      open = true
      for (const m of q.splice(0)) up.send(m)
    }
    up.onmessage = (e) => {
      const d = typeof e.data === 'string' ? e.data : Buffer.from(e.data)
      onFrame?.('in', String(d))
      try {
        ws.send(d)
      } catch {}
    }
    up.onclose = (c) => {
      try {
        ws.close({ code: c.code === 1005 ? 1000 : c.code, reason: c.reason })
      } catch {}
    }
    up.onerror = () => {}
    ws.onMessage((m) => {
      onFrame?.('out', String(m).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>'))
      if (open) up.send(m)
      else q.push(m)
    })
    ws.onClose(() => {
      try {
        up.close()
      } catch {}
    })
  })
}

export function saveJson(name, obj) {
  writeFileSync(`${E}/${name}`, JSON.stringify(obj, null, 1))
}
export { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync }
