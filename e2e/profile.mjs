#!/usr/bin/env node
// Profiles end to end, with real emails (a throwaway mail.tm inbox):
//  A. An anonymous device enters a tournament with a PIN, taps "Guarda tu
//     perfil", types the email and the code: the device becomes the account
//     in place and the player is saved in the new profile.
//  B. A second device, another tournament, the same email: the address has
//     an account, so it signs in with a code and the player travels in a
//     link token. Then Mi Polo lists both tournaments and the profile page shows.
// Creates its own organizer, two tournaments and the accounts, and removes them.
//   npm run build && npx vite preview --port 4173 &
//   node e2e/profile.mjs [outputDir]
// Needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY; E2E_RELAY / CHROMIUM as in smoke.mjs.
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadEnv } from '../scripts/lib/env.mjs'

loadEnv()
const root = path.resolve(new URL('..', import.meta.url).pathname)
const out = process.argv[2] ?? 'test-results'
mkdirSync(out, { recursive: true })
const base = process.env.BASE ?? 'http://localhost:4173'
const T = Number(process.env.E2E_TIMEOUT ?? 40000)
const URL_ = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SECRET = process.env.SUPABASE_SECRET_KEY
if (!URL_ || !ANON || !SECRET) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SECRET_KEY')
  process.exit(1)
}
const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })
const rand = Math.random().toString(36).slice(2, 8)
const created = { users: [], tournaments: [] }
let failed = 0
const check = (ok, label, detail) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`)
  if (!ok) {
    failed++
    if (detail !== undefined) console.log('    ', JSON.stringify(detail))
  }
}

/** A disposable inbox; `code()` waits for the next unseen message and returns its 6-digit code. */
async function inbox() {
  const api = 'https://api.mail.tm'
  const json = { 'content-type': 'application/json' }
  const domain = (await (await fetch(`${api}/domains`)).json())['hydra:member'][0].domain
  const address = `polo-e2e-${rand}@${domain}`
  const password = `Pw-${rand}-${Date.now()}`
  const acct = await (await fetch(`${api}/accounts`, { method: 'POST', headers: json, body: JSON.stringify({ address, password }) })).json()
  const { token } = await (await fetch(`${api}/token`, { method: 'POST', headers: json, body: JSON.stringify({ address, password }) })).json()
  const auth = { authorization: `Bearer ${token}` }
  const seen = new Set()
  return {
    address,
    async code(timeoutMs = 120000) {
      const until = Date.now() + timeoutMs
      while (Date.now() < until) {
        const list = (await (await fetch(`${api}/messages`, { headers: auth })).json())['hydra:member'] ?? []
        const fresh = list.find((m) => !seen.has(m.id))
        if (fresh) {
          seen.add(fresh.id)
          const m = /\b(\d{6})\b/.exec(fresh.subject ?? '') ?? /\b(\d{6})\b/.exec(fresh.intro ?? '')
          if (m) return { code: m[1], subject: fresh.subject }
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
      throw new Error('no email arrived')
    },
    async remove() {
      await fetch(`${api}/accounts/${acct.id}`, { method: 'DELETE', headers: auth }).catch(() => undefined)
    },
  }
}

async function tournamentWith(org, name, player, pin) {
  const settings = JSON.parse(await readFile(path.join(root, 'scripts', 'fixtures', 'settings-minimal.json'), 'utf8'))
  const { data: t, error } = await org.rpc('create_tournament', { p_name: name, p_settings: settings })
  if (error) throw error
  created.tournaments.push(t.id)
  const { data: p, error: pErr } = await org.from('players').insert({ tournament_id: t.id, full_name: player, display_name: player, sort_order: 0 }).select('id').single()
  if (pErr) throw pErr
  const { error: pinErr } = await org.rpc('set_player_pin', { p_player_id: p.id, p_pin: pin })
  if (pinErr) throw pinErr
  return { t, playerId: p.id }
}

async function browserContext(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  if (process.env.E2E_RELAY) {
    await ctx.route('https://*.supabase.co/**', async (route) => {
      const req = route.request()
      try {
        const headers = { ...req.headers() }
        delete headers['content-length']
        const res = await fetch(req.url(), { method: req.method(), headers, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() })
        const body = Buffer.from(await res.arrayBuffer())
        const h = {}
        res.headers.forEach((v, k) => {
          if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) h[k] = v
        })
        await route.fulfill({ status: res.status, headers: h, body })
      } catch {
        await route.abort()
      }
    })
  }
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && !/WebSocket|Failed to load resource/.test(m.text()) && errors.push(m.text()))
  return { ctx, page }
}

/** The auth user id this page's session holds (from supabase-js storage). */
const uidOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('cardi-golf-auth') ?? 'null')?.user?.id ?? null)

async function enterWithPin(page, slug, name, pin) {
  await page.goto(`${base}/t/${slug}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('text=Elige tu nombre', { timeout: T })
  await page.click(`text=${name}`)
  await page.waitForSelector('input[type=password]', { timeout: T })
  await page.fill('input[type=password]', pin)
  await page.waitForURL(new RegExp(`/t/${slug}/?$`), { timeout: T })
  await page.waitForSelector('nav >> text=Más', { timeout: T })
}

const errors = []
let mail = null
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
try {
  console.log('setup: organizer, two tournaments, an inbox')
  const org = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const orgEmail = `e2e-org-${rand}@cardi-golf.test`
  const orgPass = `Pw-${rand}-org!`
  const { data: made, error: madeErr } = await admin.auth.admin.createUser({ email: orgEmail, password: orgPass, email_confirm: true, user_metadata: { display_name: 'E2E Org' } })
  if (madeErr) throw madeErr
  created.users.push(made.user.id)
  await org.auth.signInWithPassword({ email: orgEmail, password: orgPass })
  const one = await tournamentWith(org, `E2E perfil ${rand}`, 'Prueba', '2468')
  const two = await tournamentWith(org, `E2E perfil dos ${rand}`, 'Prueba Dos', '1357')
  mail = await inbox()

  console.log('A. anonymous device saves its profile (email change, same account):')
  const A = await browserContext(b)
  await enterWithPin(A.page, one.t.slug, 'Prueba', '2468')
  const anonA = await uidOf(A.page)
  if (anonA) created.users.push(anonA)
  await A.page.goto(`${base}/t/${one.t.slug}/mas`, { waitUntil: 'domcontentloaded' })
  await A.page.waitForSelector('a:has-text("Guarda tu perfil")', { timeout: T })
  await A.page.screenshot({ path: `${out}/mas-anonymous.png`, fullPage: true })
  await A.page.click('a:has-text("Guarda tu perfil")', { timeout: T })
  await A.page.waitForSelector('text=Lo que jugaste como Prueba', { timeout: T })
  await A.page.screenshot({ path: `${out}/entrar-save.png`, fullPage: true })
  check(true, 'Más offers "Guarda tu perfil" and Entrar names the player and the tournament')
  await A.page.fill('input[type=email]', mail.address)
  await A.page.click('button:has-text("Mandar código")')
  await A.page.waitForSelector('text=Te mandamos un código', { timeout: T })
  const first = await mail.code()
  check(/perfil/i.test(first.subject), 'the email is the Spanish "guardar tu perfil" code', first.subject)
  await A.page.fill('input[autocomplete=one-time-code]', first.code)
  await A.page.click('button:has-text("Confirmar")')
  await A.page.waitForURL(/\/perfil\/editar\?bienvenida=1/, { timeout: T })
  await A.page.waitForSelector('text=Tu perfil está listo', { timeout: T })
  await A.page.screenshot({ path: `${out}/profile-edit-welcome.png`, fullPage: true })
  const nameValue = await A.page.inputValue('input[autocomplete=nickname]')
  check(nameValue === 'Prueba', 'the new profile starts with the player’s name, not the email', nameValue)
  const { data: userA } = await admin.auth.admin.getUserById(anonA)
  check(userA?.user?.is_anonymous === false && userA.user.email === mail.address, 'the anonymous device is now the account (same uid, email confirmed)')
  const { data: linkA } = await admin.from('players').select('profile_id, profile_status').eq('id', one.playerId).single()
  check(linkA?.profile_id === anonA && linkA.profile_status === 'confirmed', 'and the PIN player is saved in the profile', linkA)
  await A.page.fill('textarea', 'Juego los sábados.')
  await A.page.click('button:has-text("Guardar")')
  await A.page.waitForURL(new RegExp(`/t/${one.t.slug}/mas`), { timeout: T })
  await A.page.waitForSelector('a:has-text("Mi perfil")', { timeout: T })
  check(true, 'saving goes back to the tournament, where Más now shows "Mi perfil"')

  console.log('B. another device, another tournament, the same email (existing account, link token):')
  const B = await browserContext(b)
  await enterWithPin(B.page, two.t.slug, 'Prueba Dos', '1357')
  const anonB = await uidOf(B.page)
  if (anonB) created.users.push(anonB)
  await B.page.goto(`${base}/entrar?next=${encodeURIComponent(`/t/${two.t.slug}/mas`)}`, { waitUntil: 'domcontentloaded' })
  await B.page.waitForSelector('text=Lo que jugaste como Prueba Dos', { timeout: T })
  await B.page.fill('input[type=email]', mail.address)
  await B.page.click('button:has-text("Mandar código")')
  await B.page.waitForSelector('text=Te mandamos un código', { timeout: T })
  const second = await mail.code()
  check(/entrar/i.test(second.subject), 'the address has an account, so the email is a sign-in code', second.subject)
  await B.page.fill('input[autocomplete=one-time-code]', second.code)
  await B.page.click('button:has-text("Confirmar")')
  await B.page.waitForURL(new RegExp(`/t/${two.t.slug}/mas`), { timeout: T })
  await B.page.waitForSelector('a:has-text("Mi perfil")', { timeout: T })
  const { data: linkB } = await admin.from('players').select('profile_id, profile_status').eq('id', two.playerId).single()
  check(linkB?.profile_id === anonA && linkB.profile_status === 'confirmed', 'the second device’s player joined the same profile through the token', linkB)

  console.log('Mi Polo and the profile page:')
  await B.page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  await B.page.waitForSelector('text=Hola,', { timeout: T })
  const home = await B.page.textContent('main')
  check(home.includes(one.t.name) && home.includes(two.t.name), 'Mi Polo lists both tournaments')
  await B.page.screenshot({ path: `${out}/mipolo.png`, fullPage: true })
  const { data: prof } = await admin.from('profiles').select('handle, bio').eq('id', anonA).single()
  await B.page.goto(`${base}/p/${prof.handle}`, { waitUntil: 'domcontentloaded' })
  await B.page.waitForSelector('text=Índice Polo', { timeout: T })
  // Tournaments and history load after the card.
  await B.page.waitForSelector(`text=${one.t.name}`, { timeout: T })
  const page = await B.page.textContent('main')
  check(page.includes(`@${prof.handle}`) && page.includes('Juego los sábados.') && page.includes(one.t.name), 'the profile page shows the handle, the bio and the tournaments')
  await B.page.screenshot({ path: `${out}/profile-page.png`, fullPage: true })
} catch (e) {
  console.error('ERROR', e.message ?? e)
  failed++
} finally {
  await b.close()
  console.log('cleaning up…')
  for (const id of created.tournaments) await admin.from('tournaments').delete().eq('id', id)
  for (const id of created.users) await admin.auth.admin.deleteUser(id).catch(() => undefined)
  await mail?.remove()
}
console.log(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`)
console.log(failed === 0 && errors.length === 0 ? '\n✓ profiles e2e passed' : `\n✗ ${failed} failure(s)`)
process.exit(failed === 0 && errors.length === 0 ? 0 : 1)
