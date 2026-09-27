#!/usr/bin/env node
// Creates (idempotently) a throwaway organizer account for design screenshots
// and makes it an admin of the Ensayo tournament, so "Mis torneos" and the
// create wizard can be captured signed in. Never touches the real tournament.
//   node scripts/design-organizer.mjs          (reads/writes DESIGN_ORG_* in .env.local)
//   node scripts/design-organizer.mjs --remove (deletes the account again)
import { createClient } from '@supabase/supabase-js'
import { appendFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const envPath = path.join(root, '.env.local')
if (existsSync(envPath)) {
  for (const line of (await readFile(envPath, 'utf8')).split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
const URL_ = process.env.VITE_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const email = process.env.DESIGN_ORG_EMAIL ?? 'design-shots@cardi-golf.invalid'
let password = process.env.DESIGN_ORG_PASSWORD
const remove = process.argv.includes('--remove')

const sb = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 })
if (listErr) {
  console.error(listErr.message)
  process.exit(1)
}
let user = list.users.find((u) => u.email === email)

if (remove) {
  if (user) {
    await sb.from('tournament_organizers').delete().eq('auth_user_id', user.id)
    await sb.auth.admin.deleteUser(user.id)
    console.log('removed', email)
  } else console.log('nothing to remove')
  process.exit(0)
}

if (!user) {
  password ??= randomBytes(12).toString('base64url')
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Diseño (pruebas)' } })
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  user = data.user
  await appendFile(envPath, `DESIGN_ORG_EMAIL=${email}\nDESIGN_ORG_PASSWORD=${password}\n`)
  console.log('created', email, '(credentials appended to .env.local)')
} else if (!password) {
  console.error('User exists but DESIGN_ORG_PASSWORD is not in .env.local; run with --remove and again.')
  process.exit(1)
} else console.log('exists', email)

const { data: ens } = await sb.from('tournaments').select('id').eq('slug', 'ensayo').single()
if (ens) {
  const { error } = await sb.from('tournament_organizers').upsert({ tournament_id: ens.id, auth_user_id: user.id, role: 'admin' }, { onConflict: 'tournament_id,auth_user_id' })
  if (error) console.error('organizer row:', error.message)
  else console.log('admin of ensayo')
}
