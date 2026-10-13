/**
 * The nightly backup (`api/backup-cron.ts`, CLAUDE.md §3, DB-07): one
 * consistent snapshot (`backup_snapshot`, 0039) plus the history up to its
 * last row, the accounts and the file list in it, the changed files copied
 * to R2; on a database without 0039 every table page by page, as before. A
 * table the database lacks fails the whole run, loudly, by name: a backup
 * that skipped a table would look whole and restore without it. So a release
 * that adds a table to the backup ships after the migration that creates it
 * (round 3 of PR 104: 0027's `money_adjustments` reaches production first).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { BACKUP_TABLES } from './backupTables'

const ENV = { CRON_SECRET: 's', SUPABASE_URL: 'https://db.invalid', SUPABASE_SECRET_KEY: 'k', R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c', R2_BACKUP_BUCKET: 'd' }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

interface World {
  /** The database has 0039 (else the RPC answers PGRST202). */
  snapshot?: boolean
  /** A table the database lacks. */
  absent?: string | null
  /** Storage's files, and what R2's manifest already holds. */
  objects?: Array<{ bucket_id: string; name: string; updated_at: string }>
  manifest?: Record<string, string> | null
  /** The history's rows. */
  history?: number
}

function rangeStart(init?: RequestInit): number {
  const h = (init?.headers ?? {}) as Record<string, string>
  return h.Range ? Number(h.Range.split('-')[0]) : 0
}

/** The route against `world`, and what it read, uploaded and recorded. */
async function run(world: World = {}) {
  const { snapshot = true, absent = null, objects = [], manifest = null, history = 1500 } = world
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
  const read: string[] = []
  const uploads: Array<{ url: string; body: Buffer }> = []
  const records: Array<{ ok: boolean; error?: string }> = []
  const patches: Array<{ url: string; body: unknown }> = []
  const rpcBodies: Array<{ p_tables: Record<string, string> }> = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null
    const url = req ? req.url : String(input)
    const method = req ? req.method : (init?.method ?? 'GET')
    if (url.includes('r2.cloudflarestorage.com')) {
      if (method === 'GET') return manifest ? new Response(JSON.stringify(manifest)) : new Response('', { status: 404 })
      uploads.push({ url, body: req ? Buffer.from(await req.arrayBuffer()) : Buffer.from(init!.body as ArrayBuffer) })
      return new Response(null, { status: 200 })
    }
    if (url.includes('/storage/v1/object/')) return new Response('png', { headers: { 'content-type': 'image/png' } })
    if (url.includes('/rest/v1/rpc/backup_snapshot')) {
      rpcBodies.push(JSON.parse(String(init!.body)))
      if (!snapshot) return new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.backup_snapshot' }), { status: 404 })
      if (absent) return new Response(JSON.stringify({ code: '22023', message: `${absent}: la tabla no existe en esta base de datos.` }), { status: 400 })
      const tables = Object.fromEntries(Object.keys(BACKUP_TABLES).filter((t) => t !== 'audit_log').map((t) => [t, t === 'tournaments' ? [{ id: 't1' }] : []]))
      return new Response(JSON.stringify({ snapshotAt: '2026-10-12T09:00:00Z', auditMaxId: history, tables, auth: { users: [{ id: 'u1' }], identities: [] }, storage: { objects } }))
    }
    const table = /\/rest\/v1\/([a-z_]+)/.exec(url)![1]!
    if (method === 'POST' && table === 'backup_runs') {
      records.push(JSON.parse(String(init!.body)))
      return new Response(JSON.stringify([{ id: 7 }]), { status: 201 })
    }
    if (method === 'PATCH' && table === 'backup_runs') {
      patches.push({ url: url.replace('https://db.invalid/rest/v1/', ''), body: JSON.parse(String(init!.body)) })
      return new Response(null, { status: 204 })
    }
    read.push(url.replace('https://db.invalid/rest/v1/', ''))
    if (table === absent) return new Response(JSON.stringify({ code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }), { status: 404 })
    // The history by key (format 2): the page after the last id read, up to the snapshot's.
    const keyset = /and=\(id\.gt\.(\d+),id\.lte\.(\d+)\)&limit=(\d+)/.exec(url)
    if (table === 'audit_log' && keyset) {
      const [after, upTo, limit] = keyset.slice(1).map(Number) as [number, number, number]
      const n = Math.max(0, Math.min(limit, upTo - after))
      return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: after + i + 1 }))))
    }
    if (table === 'audit_log') {
      const from = rangeStart(init)
      const n = Math.max(0, Math.min(1000, history - from))
      return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: from + i + 1 }))))
    }
    return new Response('[]', { status: 200 })
  })
  const { default: handler } = await import('../../api/backup-cron')
  let status = 0
  let body: Record<string, unknown> = {}
  const res = {
    setHeader() {},
    status(s: number) {
      status = s
      return res
    },
    json(b: Record<string, unknown>) {
      body = b
      return res
    },
  }
  await handler({ headers: { authorization: 'Bearer s' } } as never, res as never)
  const backup = uploads.find((u) => u.url.includes('/backups/'))
  const dump = backup ? JSON.parse(gunzipSync(backup.body).toString('utf8')) : null
  return { status, body, read, uploads, records, patches, rpcBodies, dump }
}

describe('the nightly backup', () => {
  it('takes one snapshot of every table but the history, then the history up to its last row, and uploads one file', async () => {
    const r = await run()
    expect(r.status).toBe(200)
    expect(Object.keys(r.rpcBodies[0]!.p_tables)).toEqual(Object.keys(BACKUP_TABLES).filter((t) => t !== 'audit_log'))
    // By key, never by offset: a row committed mid-read can't repeat one (PR 122's verifier).
    expect(r.read).toEqual(['audit_log?select=*&order=id&and=(id.gt.0,id.lte.1500)&limit=1000', 'audit_log?select=*&order=id&and=(id.gt.1000,id.lte.1500)&limit=1000'])
    expect(new Set(r.dump.tables.audit_log.map((a: { id: number }) => a.id)).size).toBe(1500)
    expect(r.dump.version).toBe(2)
    expect(Object.keys(r.dump.tables).sort()).toEqual(Object.keys(BACKUP_TABLES).sort())
    expect(r.dump.tables.money_adjustments).toEqual([])
    expect(r.dump.tables.audit_log).toHaveLength(1500)
    expect(r.dump.auth.users).toEqual([{ id: 'u1' }])
    expect(r.uploads).toHaveLength(1)
    expect(r.records).toEqual([expect.objectContaining({ ok: true })])
  })

  it('a table missing on the database fails the whole run, by name, and uploads nothing (never a backup without it)', async () => {
    const r = await run({ absent: 'money_adjustments' })
    expect(r.status).toBe(502)
    expect(r.body).toEqual({ error: 'read failed', detail: 'snapshot: money_adjustments: la tabla no existe en esta base de datos.' })
    expect(r.uploads).toEqual([])
    expect(r.records).toEqual([{ ok: false, error: 'read: snapshot: money_adjustments: la tabla no existe en esta base de datos.' }])
  })

  it('on a database without 0039 it reads every table page by page, as before, and still fails by name', async () => {
    const r = await run({ snapshot: false })
    expect(r.status).toBe(200)
    expect(r.read.map((u) => u.split('?')[0])).toEqual(Object.keys(BACKUP_TABLES).flatMap((t) => (t === 'audit_log' ? ['audit_log', 'audit_log'] : [t])))
    expect(r.dump.version).toBe(1)
    expect(r.dump.auth).toBeUndefined()
    const missing = await run({ snapshot: false, absent: 'money_adjustments' })
    expect(missing.status).toBe(502)
    expect(missing.body).toEqual({ error: 'read failed', detail: 'money_adjustments: HTTP 404' })
    expect(missing.uploads).toEqual([])
  })

  it('copies the files the manifest lacks, each path segment encoded, and writes the manifest', async () => {
    const r = await run({
      objects: [
        { bucket_id: 'tournament-assets', name: 'courses/c1/tarjeta del campo.jpg', updated_at: '2026-10-01' },
        { bucket_id: 'tournament-assets', name: 'profiles/u1/foto.png', updated_at: '2026-10-02' },
      ],
      manifest: { 'tournament-assets/profiles/u1/foto.png': '2026-10-02' },
    })
    const files = r.uploads.filter((u) => !u.url.includes('/backups/')).map((u) => u.url.replace('https://a.r2.cloudflarestorage.com/d/', ''))
    expect(files).toEqual(['files/tournament-assets/courses/c1/tarjeta%20del%20campo.jpg', 'files/manifest.json'])
    expect(r.body.files).toEqual({ copied: 1, pending: 0, failed: 0 })
    // And on the night's row, for Salud.
    expect(r.patches).toEqual([{ url: 'backup_runs?id=eq.7', body: { files: { copied: 1, pending: 0, failed: 0 } } }])
    expect(JSON.parse(r.uploads.at(-1)!.body.toString('utf8'))).toEqual({
      'tournament-assets/profiles/u1/foto.png': '2026-10-02',
      'tournament-assets/courses/c1/tarjeta del campo.jpg': '2026-10-01',
    })
  })

  it('nothing new in Storage: no file and no manifest written', async () => {
    const r = await run({ objects: [{ bucket_id: 'b', name: 'x.png', updated_at: '1' }], manifest: { 'b/x.png': '1' } })
    expect(r.uploads).toHaveLength(1)
    expect(r.body.files).toEqual({ copied: 0, pending: 0, failed: 0 })
  })
})
