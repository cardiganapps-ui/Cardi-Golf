#!/usr/bin/env node
// End-to-end: the Admin de Polo panel against the live project, signed in as
// a throwaway admin (made one with SQL for the length of the run).
//   npm run build && npx vite preview --port 4173 &
//   node e2e/platform.mjs [outputDir]
// It checks: the shield on Mi Polo → Resumen with real numbers → Torneos
// finds another organizer's tournament → its Comité shows the banner and
// the Historial marks the admin's correction → Personas finds an account,
// blocks, unblocks and deletes it. Everything it creates is removed.
// Needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY,
// SUPABASE_PAT, SUPABASE_PROJECT_REF; E2E_RELAY / CHROMIUM as in smoke.mjs.
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadEnv } from '../scripts/lib/env.mjs'
import { query } from '../scripts/lib/mgmt.mjs'

loadEnv()
const out = process.argv[2] ?? 'test-results'
mkdirSync(out, { recursive: true })
const base = process.env.BASE ?? 'http://localhost:4173'
const URL_ = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SECRET = process.env.SUPABASE_SECRET_KEY
if (!URL_ || !ANON || !SECRET) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SECRET_KEY')
  process.exit(1)
}
const root = path.resolve(new URL('..', import.meta.url).pathname)
const settings = JSON.parse(await readFile(path.join(root, 'scripts', 'fixtures', 'settings-minimal.json'), 'utf8'))
const service = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })
const client = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
const rand = Math.random().toString(36).slice(2, 8)
const T = 20_000
const created = { users: [], tournaments: [] }
let failures = 0
const errors = []
const check = (cond, label, detail) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) {
    failures++
    if (detail !== undefined) console.log('    ', JSON.stringify(detail))
  }
}
const uuid = (s) => {
  if (!/^[0-9a-f-]{36}$/.test(s)) throw new Error(`not a uuid: ${s}`)
  return s
}

async function account(tag, name) {
  const email = `e2e-plat-${tag}-${rand}@cardi-golf.test`
  const password = `Pw-${rand}-${tag}!`
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } })
  if (error) throw error
  created.users.push(data.user.id)
  const sb = client()
  const { data: s, error: e2 } = await sb.auth.signInWithPassword({ email, password })
  if (e2) throw e2
  await sb.rpc('ensure_my_profile')
  return { sb, id: data.user.id, email, session: s.session }
}

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
try {
  console.log('setting up: an admin, an organizer with a corrected score, an account to delete…')
  const ADM = await account('adm', 'Ada Admin')
  await query(`insert into public.platform_admins (auth_user_id, note) values ('${uuid(ADM.id)}', 'e2e-platform')`)
  const ORG = await account('org', 'Oscar Organiza')
  const { data: t, error: tErr } = await ORG.sb.rpc('create_tournament', { p_name: `E2E Plat ${rand}`, p_settings: settings })
  if (tErr) throw tErr
  created.tournaments.push(t.id)
  const { data: p } = await ORG.sb.from('players').insert({ tournament_id: t.id, full_name: 'Pablo Prueba', display_name: 'Pablo', sort_order: 0 }).select('id').single()
  const { data: r } = await ORG.sb.from('rounds').insert({ tournament_id: t.id, number: 1, holes: 18 }).select('id').single()
  await ORG.sb.rpc('admin_save_score', { p_round_id: r.id, p_player_id: p.id, p_hole: 1, p_strokes: 6, p_putts: 2, p_picked_up: false })
  const { error: fixErr } = await ADM.sb.rpc('admin_save_score', { p_round_id: r.id, p_player_id: p.id, p_hole: 1, p_strokes: 5, p_putts: 2, p_picked_up: false, p_reason: 'Lo reportó el grupo' })
  if (fixErr) throw fixErr
  const VIC = await account('vic', 'Victor Borrable')

  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } })
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
  // The admin's session, where supabase-js keeps it.
  await ctx.addInitScript((s) => localStorage.setItem('cardi-golf-auth', s), JSON.stringify(ADM.session))
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(String(e)))

  console.log('the way in:')
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: 'Admin de Polo' }).waitFor({ timeout: T })
  await page.getByRole('link', { name: 'Admin de Polo' }).click()
  await page.waitForURL(/\/admin\/resumen$/, { timeout: T })
  await page.getByText('Cuentas', { exact: true }).waitFor({ timeout: T })
  const accounts = await page.locator('text=Cuentas >> xpath=../span[2]').innerText()
  check(Number(accounts.replace(/,/g, '')) >= 3, 'the shield on Mi Polo opens Resumen with real numbers', accounts)
  await page.screenshot({ path: `${out}/platform-resumen.jpg`, type: 'jpeg', quality: 80, fullPage: true })

  console.log('Torneos → another organizer\'s Comité:')
  await page.getByRole('link', { name: 'Torneos' }).click()
  await page.getByPlaceholder('Nombre, código o correo del organizador').fill(ORG.email)
  await page.getByRole('link', { name: new RegExp(`E2E Plat ${rand}`) }).click({ timeout: T })
  await page.getByText(ORG.email).waitFor({ timeout: T })
  check(true, 'search by the organizer\'s email opens the tournament with its Comité')
  await page.screenshot({ path: `${out}/platform-torneo.jpg`, type: 'jpeg', quality: 80, fullPage: true })
  await page.getByRole('link', { name: 'Abrir su Comité' }).click()
  await page.getByText('Estás en un torneo de otro organizador', { exact: false }).waitFor({ timeout: T })
  check(true, 'its Comité opens with the Admin de Polo banner')
  await page.getByRole('link', { name: 'Historial' }).click()
  await page.getByText('Pablo, hoyo 1: 6 → 5').waitFor({ timeout: T })
  const marked = await page.locator(`text=Pablo, hoyo 1: 6 → 5 >> xpath=ancestor::button[1]`).innerText()
  check(/Admin de Polo/.test(marked) && /Lo reportó el grupo/.test(marked), 'Historial shows the correction, marked Admin de Polo, with its reason', marked)
  await page.screenshot({ path: `${out}/platform-historial.jpg`, type: 'jpeg', quality: 80, fullPage: true })

  console.log('Personas → block, unblock, delete:')
  await page.goto(`${base}/admin/personas`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('Correo, usuario o nombre').fill(VIC.email)
  await page.getByRole('link', { name: /Victor Borrable/ }).click({ timeout: T })
  await page.getByRole('button', { name: 'Bloquear', exact: true }).click({ timeout: T })
  await page.getByRole('dialog').getByPlaceholder('Qué vas a corregir y quién lo pidió').fill('Prueba e2e')
  await page.getByRole('dialog').getByRole('button', { name: 'Bloquear' }).click()
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).waitFor({ timeout: T })
  const { error: vicSignIn } = await client().auth.signInWithPassword({ email: VIC.email, password: `Pw-${rand}-vic!` })
  check(!!vicSignIn, 'blocking from the panel stops the account signing in', vicSignIn?.message)
  await page.screenshot({ path: `${out}/platform-persona.jpg`, type: 'jpeg', quality: 80, fullPage: true })
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click()
  await page.getByRole('dialog').getByPlaceholder('Qué vas a corregir y quién lo pidió').fill('Prueba e2e')
  await page.getByRole('dialog').getByRole('button', { name: 'Desbloquear' }).click()
  await page.getByRole('button', { name: 'Bloquear', exact: true }).waitFor({ timeout: T })
  check(true, 'and unblocking brings the button back')
  await page.getByRole('button', { name: 'Borrar cuenta' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('No se puede deshacer').waitFor({ timeout: T })
  const del = dialog.getByRole('button', { name: 'Borrar cuenta' })
  const disabledBefore = await del.isDisabled()
  await dialog.locator('input').nth(0).fill(VIC.email)
  await dialog.locator('input').nth(1).fill('Prueba e2e')
  await page.screenshot({ path: `${out}/platform-borrar.jpg`, type: 'jpeg', quality: 80 })
  await del.click()
  await page.waitForURL(/\/admin\/personas$/, { timeout: T })
  const { data: gone } = await service.auth.admin.getUserById(VIC.id)
  check(disabledBefore && !gone?.user, 'deleting waits for the email and a reason, then the account is gone', { disabledBefore })

  check(errors.length === 0, 'no page errors', errors)
} catch (e) {
  console.error('ERROR', e.message ?? e)
  failures++
} finally {
  await b.close()
  console.log('cleaning up…')
  for (const id of created.tournaments) await service.from('tournaments').delete().eq('id', id)
  if (created.users.length) {
    const ids = created.users.map((u) => `'${uuid(u)}'`).join(',')
    await query(`delete from public.platform_audit_log where actor_auth_user_id in (${ids}) or target_id in (${ids})`)
  }
  for (const id of created.users) await service.auth.admin.deleteUser(id)
  await query(`delete from public.platform_admins where note = 'e2e-platform'`)
}
console.log(failures === 0 ? '\n✓ the Admin de Polo panel works end to end' : `\n✗ ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
