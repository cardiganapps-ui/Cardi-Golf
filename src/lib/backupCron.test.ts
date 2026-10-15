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
import { callRoute, leaked } from './testing/route'

const ENV = {
  CRON_SECRET: 'cron-secret-555',
  SUPABASE_URL: 'https://db.invalid',
  SUPABASE_SECRET_KEY: 'service-role-key-444',
  R2_ACCOUNT_ID: 'a',
  R2_ACCESS_KEY_ID: 'r2-access-666',
  R2_SECRET_ACCESS_KEY: 'r2-secret-777',
  R2_BACKUP_BUCKET: 'd',
}
/** What must never reach the answer or the logs. */
const SECRETS = [ENV.CRON_SECRET, ENV.SUPABASE_SECRET_KEY, ENV.R2_SECRET_ACCESS_KEY]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
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
  /** The history's rows; null when the snapshot has none (`auditMaxId` null). */
  history?: number | null
  /** The project's «Max rows», when set under PostgREST's 1,000 (DB-20). */
  cap?: number
  /** The request's Authorization header (none when null), and the environment's own changes. */
  auth?: string | null
  env?: Partial<Record<keyof typeof ENV, string>>
  /** The snapshot's own failure: its status and body. */
  snapshotFails?: { status: number; body: string }
  /**
   * R2 refuses (a status) or never answers (throw) the night's file, a Storage file, or the manifest's read or
   * write. A 4xx: aws4fetch tries a 5xx again, up to ten times, waiting longer each time.
   */
  r2Backup?: number | 'throw'
  r2File?: number | 'throw'
  manifestRead?: number | 'throw'
  manifestWrite?: number | 'throw'
  /** Storage files that can't be read. */
  unreadable?: string[]
  /** backup_runs refuses (a status) or never answers (throw) the night's row, or the files added to it. */
  recordFails?: number | 'throw'
  filesRecordFails?: 'throw'
  /** What backup_runs answers for the night's row, when not its id. */
  recordBody?: string
  /** A history page the database refuses (its status), or the history's rows that are still there (the rest went). */
  historyFails?: number
  historyHas?: number
  /** How long each Storage read takes, on a clock the test moves. */
  readMs?: number
}

function rangeStart(init?: RequestInit): number {
  const h = (init?.headers ?? {}) as Record<string, string>
  return h.Range ? Number(h.Range.split('-')[0]) : 0
}

/** The route against `world`, and what it read, uploaded and recorded. */
async function run(world: World = {}) {
  const { snapshot = true, absent = null, objects = [], manifest = null, history = 1500 } = world
  for (const [k, v] of Object.entries({ ...ENV, ...world.env })) vi.stubEnv(k, v)
  const outcome = (o: number | 'throw' | undefined) => {
    if (o === 'throw') throw new TypeError('fetch failed')
    return o
  }
  /** Every request, with where it went and the headers it carried. */
  const requests: Array<{ url: string; headers: Record<string, string> }> = []
  const read: string[] = []
  const uploads: Array<{ url: string; body: Buffer }> = []
  const records: Array<{ ok: boolean; error?: string }> = []
  const patches: Array<{ url: string; body: unknown }> = []
  const rpcBodies: Array<{ p_tables: Record<string, string> }> = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null
    const url = req ? req.url : String(input)
    const method = req ? req.method : (init?.method ?? 'GET')
    requests.push({ url, headers: req ? Object.fromEntries(req.headers) : ((init?.headers ?? {}) as Record<string, string>) })
    if (url.includes('r2.cloudflarestorage.com')) {
      const isManifest = url.endsWith('/files/manifest.json')
      if (method === 'GET') {
        const refused = outcome(world.manifestRead)
        if (refused) return new Response('', { status: refused })
        return manifest ? new Response(JSON.stringify(manifest)) : new Response('', { status: 404 })
      }
      const refused = outcome(isManifest ? world.manifestWrite : url.includes('/backups/') ? world.r2Backup : world.r2File)
      if (refused) return new Response('', { status: refused })
      uploads.push({ url, body: req ? Buffer.from(await req.arrayBuffer()) : Buffer.from(init!.body as ArrayBuffer) })
      return new Response(null, { status: 200 })
    }
    if (url.includes('/storage/v1/object/')) {
      if (world.readMs) vi.setSystemTime(Date.now() + world.readMs)
      if (world.unreadable?.some((n) => url.endsWith(`/${n}`))) return new Response('', { status: 500 })
      return new Response('png', { headers: { 'content-type': 'image/png' } })
    }
    if (url.includes('/rest/v1/rpc/backup_snapshot')) {
      rpcBodies.push(JSON.parse(String(init!.body)))
      if (world.snapshotFails) return new Response(world.snapshotFails.body, { status: world.snapshotFails.status })
      if (!snapshot) return new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.backup_snapshot' }), { status: 404 })
      if (absent) return new Response(JSON.stringify({ code: '22023', message: `${absent}: la tabla no existe en esta base de datos.` }), { status: 400 })
      const tables = Object.fromEntries(Object.keys(BACKUP_TABLES).filter((t) => t !== 'audit_log').map((t) => [t, t === 'tournaments' ? [{ id: 't1', name: 'Copa privada' }] : []]))
      return new Response(JSON.stringify({ snapshotAt: '2026-10-12T09:00:00Z', auditMaxId: history, tables, auth: { users: [{ id: 'u1', email: 'ana@example.com' }], identities: [] }, storage: { objects } }))
    }
    const table = /\/rest\/v1\/([a-z_]+)/.exec(url)![1]!
    if (method === 'POST' && table === 'backup_runs') {
      records.push(JSON.parse(String(init!.body)))
      const refused = outcome(world.recordFails)
      if (refused) return new Response('', { status: refused })
      return new Response(world.recordBody ?? JSON.stringify([{ id: 7 }]), { status: 201 })
    }
    if (method === 'PATCH' && table === 'backup_runs') {
      patches.push({ url: url.replace('https://db.invalid/rest/v1/', ''), body: JSON.parse(String(init!.body)) })
      outcome(world.filesRecordFails)
      return new Response(null, { status: 204 })
    }
    read.push(url.replace('https://db.invalid/rest/v1/', ''))
    if (table === absent) return new Response(JSON.stringify({ code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }), { status: 404 })
    // The history by key (format 2): the page after the last id read, up to the snapshot's.
    const keyset = /and=\(id\.gt\.(\d+),id\.lte\.(\d+)\)&limit=(\d+)/.exec(url)
    if (table === 'audit_log' && keyset) {
      if (world.historyFails) return new Response('', { status: world.historyFails })
      const [after, upTo, limit] = keyset.slice(1).map(Number) as [number, number, number]
      const n = Math.max(0, Math.min(limit, world.cap ?? 1000, Math.min(upTo, world.historyHas ?? upTo) - after))
      return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: after + i + 1 }))))
    }
    if (table === 'audit_log') {
      const from = rangeStart(init)
      const n = Math.max(0, Math.min(1000, world.cap ?? 1000, (history ?? 0) - from))
      // With `Prefer: count=exact`, PostgREST says the total in Content-Range («0-399/1500»).
      const counted = ((init?.headers ?? {}) as Record<string, string>).Prefer === 'count=exact'
      const range = counted ? { 'content-range': `${from}-${from + n - 1}/${history ?? 0}` } : undefined
      return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: from + i + 1 }))), { headers: range })
    }
    return new Response('[]', { status: 200 })
  })
  const { default: handler } = await import('../../api/backup-cron')
  const auth = world.auth === undefined ? `Bearer ${ENV.CRON_SECRET}` : world.auth
  const answer = await callRoute(handler, { headers: auth == null ? {} : { authorization: auth } })
  const backup = uploads.find((u) => u.url.includes('/backups/'))
  const dump = backup ? JSON.parse(gunzipSync(backup.body).toString('utf8')) : null
  const body = answer.body as Record<string, unknown>
  return { status: answer.status, body, answer, requests, read, uploads, records, patches, rpcBodies, dump }
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
    expect(r.dump.auth.users).toEqual([{ id: 'u1', email: 'ana@example.com' }])
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

describe('the backup’s gate (QA-14)', () => {
  it('without the cron’s secret, a wrong one or none set on the deploy: 401, and nothing read or written', async () => {
    const worlds: World[] = [
      { auth: null },
      { auth: 'Bearer wrong' },
      { auth: ENV.CRON_SECRET },
      { auth: `bearer ${ENV.CRON_SECRET}` },
      { auth: 'Bearer ', env: { CRON_SECRET: '' } },
      { auth: 'Bearer undefined', env: { CRON_SECRET: '' } },
    ]
    for (const world of worlds) {
      const r = await run(world)
      expect([r.status, r.body]).toEqual([401, { error: 'unauthorized' }])
      expect(r.answer.headers['cache-control']).toBe('no-store')
      expect(r.requests).toEqual([])
      expect(leaked(r.answer, SECRETS)).toEqual([])
    }
  })

  it('a deploy missing a setting: 503 naming the settings, never their values, and nothing read', async () => {
    const r = await run({ env: { SUPABASE_SECRET_KEY: '', R2_BACKUP_BUCKET: '' } })
    expect([r.status, r.body]).toEqual([503, { error: 'backup not configured', missing: ['SUPABASE_SECRET_KEY', 'R2_BACKUP_BUCKET'] }])
    expect(r.requests).toEqual([])
    expect(leaked(r.answer, SECRETS)).toEqual([])
  })
})

describe('what the backup answers and where its keys go (QA-14)', () => {
  it('counts only: no row, no account, no key in the answer or the logs', async () => {
    const r = await run({ objects: [{ bucket_id: 'b', name: 'x.png', updated_at: '1' }] })
    expect(r.status).toBe(200)
    expect(Object.keys(r.body).sort()).toEqual(['accounts', 'bytes', 'counts', 'files', 'key', 'ok', 'version'])
    expect(r.body.counts).toMatchObject({ tournaments: 1, audit_log: 1500 })
    expect(r.body.accounts).toBe(1)
    expect(r.answer.text).not.toMatch(/Copa privada|ana@example\.com|t1/)
    expect(leaked(r.answer, SECRETS)).toEqual([])
  })

  it('the service-role key goes to the database only; R2 gets a signature, never the key', async () => {
    const r = await run({ objects: [{ bucket_id: 'b', name: 'x.png', updated_at: '1' }] })
    const r2 = r.requests.filter((q) => q.url.includes('r2.cloudflarestorage.com'))
    expect(r2.length).toBeGreaterThan(0)
    for (const q of r2) {
      expect(JSON.stringify(q.headers)).not.toContain(ENV.SUPABASE_SECRET_KEY)
      expect(JSON.stringify(q.headers)).not.toContain(ENV.R2_SECRET_ACCESS_KEY)
      expect(q.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=r2-access-666\//)
    }
    for (const q of r.requests.filter((q) => !q.url.includes('r2.cloudflarestorage.com'))) expect(q.url.startsWith('https://db.invalid/')).toBe(true)
  })

  it('the night’s file is gzipped JSON at its date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-13T09:00:05Z'))
    const r = await run()
    expect(r.body.key).toBe('backups/2026-10-13.json.gz')
    expect(r.uploads[0]!.url).toBe('https://a.r2.cloudflarestorage.com/d/backups/2026-10-13.json.gz')
    const put = r.requests.find((q) => q.url.includes('/backups/'))!
    expect([put.headers['content-type'], put.headers['content-encoding']]).toEqual(['application/json', 'gzip'])
  })

  it('a «Max rows» under 1,000 loses no history: by key until the snapshot\'s last row, whatever the page (DB-20)', async () => {
    const r = await run({ cap: 400 })
    expect(r.status).toBe(200)
    expect(r.read).toEqual([0, 400, 800, 1200].map((after) => `audit_log?select=*&order=id&and=(id.gt.${after},id.lte.1500)&limit=1000`))
    expect(new Set(r.dump.tables.audit_log.map((a: { id: number }) => a.id)).size).toBe(1500)
  })

  it('a history of exactly one page asks once: its last row is the snapshot\'s (DB-20)', async () => {
    const r = await run({ history: 1000 })
    expect(r.read).toEqual(['audit_log?select=*&order=id&and=(id.gt.0,id.lte.1000)&limit=1000'])
    expect(r.dump.tables.audit_log).toHaveLength(1000)
  })

  it('without 0039, a «Max rows» under 1,000 still reads every row: the total comes with the first page (DB-20)', async () => {
    const r = await run({ snapshot: false, cap: 400 })
    expect(r.status).toBe(200)
    expect(r.dump.tables.audit_log).toHaveLength(1500)
    expect(r.read.filter((u) => u.startsWith('audit_log'))).toHaveLength(4)
  })

  it('a snapshot with no history reads none', async () => {
    const r = await run({ history: null })
    expect(r.status).toBe(200)
    expect(r.read).toEqual([])
    expect(r.dump.tables.audit_log).toEqual([])
  })
})

describe('when the backup fails (QA-14)', () => {
  it('the snapshot refused without words of its own, or another 404: 502 with its status, recorded', async () => {
    for (const [fails, detail] of [
      [{ status: 500, body: '<html>bad gateway</html>' }, 'snapshot: HTTP 500'],
      [{ status: 404, body: '{"code":"PGRST125"}' }, 'snapshot: HTTP 404'],
      // A 404 that is no JSON at all (a proxy's page): no PGRST202 to read, so a failure, never «no 0039».
      [{ status: 404, body: 'Not Found' }, 'snapshot: HTTP 404'],
    ] as const) {
      const r = await run({ snapshotFails: fails })
      expect([r.status, r.body]).toEqual([502, { error: 'read failed', detail }])
      expect(r.records).toEqual([{ ok: false, error: `read: ${detail}` }])
      expect(r.uploads).toEqual([])
    }
  })

  it('R2 refuses the night’s file: 502 with its status, recorded as failed, no file copied', async () => {
    const r = await run({ r2Backup: 403, objects: [{ bucket_id: 'b', name: 'x.png', updated_at: '1' }] })
    expect([r.status, r.body]).toEqual([502, { error: 'upload failed', status: 403 }])
    expect(r.records).toEqual([{ ok: false, key: expect.stringMatching(/^backups\//), error: 'upload: HTTP 403' }])
    expect(r.requests.some((q) => q.url.includes('/storage/v1/object/'))).toBe(false)
  })

  it('R2 never answers the night’s file: 502, and the night is recorded as failed, not lost without a word', async () => {
    const r = await run({ r2Backup: 'throw' })
    expect([r.status, r.body]).toEqual([502, { error: 'upload failed', status: null }])
    expect(r.records).toEqual([{ ok: false, key: expect.stringMatching(/^backups\//), error: 'upload: fetch failed' }])
    expect(leaked(r.answer, SECRETS)).toEqual([])
  })

  it('a history page the database refuses fails the run by name, and uploads nothing', async () => {
    const r = await run({ historyFails: 500 })
    expect([r.status, r.body]).toEqual([502, { error: 'read failed', detail: 'audit_log: HTTP 500' }])
    expect(r.records).toEqual([{ ok: false, error: 'read: audit_log: HTTP 500' }])
    expect(r.uploads).toEqual([])
  })

  it('history rows gone before the read (the snapshot\'s last id never comes): it ends at the empty page, never asks forever', async () => {
    const r = await run({ history: 1500, historyHas: 1200 })
    expect(r.status).toBe(200)
    expect(r.dump.tables.audit_log).toHaveLength(1200)
    expect(r.read).toEqual([
      'audit_log?select=*&order=id&and=(id.gt.0,id.lte.1500)&limit=1000',
      'audit_log?select=*&order=id&and=(id.gt.1000,id.lte.1500)&limit=1000',
      'audit_log?select=*&order=id&and=(id.gt.1200,id.lte.1500)&limit=1000',
    ])
  })

  it('backup_runs answers with nothing it can read: the backup stands, and its files go on no row', async () => {
    const r = await run({ recordBody: 'ok', objects: [{ bucket_id: 'b', name: 'x.png', updated_at: '1' }] })
    expect(r.status).toBe(200)
    expect(r.body.files).toEqual({ copied: 1, pending: 0, failed: 0 })
    expect(r.patches).toEqual([])
  })

  it('backup_runs refuses or never answers: the backup still stands, its files still copied', async () => {
    for (const recordFails of [500, 'throw'] as const) {
      const r = await run({ recordFails, objects: [{ bucket_id: 'b', name: 'x.png', updated_at: '1' }] })
      expect(r.status).toBe(200)
      expect(r.body.files).toEqual({ copied: 1, pending: 0, failed: 0 })
      // No row to add the files to.
      expect(r.patches).toEqual([])
    }
  })
})

describe('the night’s Storage files (QA-14)', () => {
  const files = (n: number) => Array.from({ length: n }, (_, i) => ({ bucket_id: 'b', name: `f${i}.png`, updated_at: '1' }))

  it('a manifest that can’t be read: no file copied, every one counted failed, and the backup stands', async () => {
    for (const manifestRead of [403, 'throw'] as const) {
      const r = await run({ manifestRead, objects: files(3) })
      expect(r.status).toBe(200)
      expect(r.body.files).toEqual({ copied: 0, pending: 0, failed: 3 })
      expect(r.uploads.map((u) => u.url)).toEqual([expect.stringContaining('/backups/')])
    }
  })

  it('a file Storage can’t give or R2 won’t take is counted failed; the rest go on', async () => {
    const unreadable = await run({ unreadable: ['f1.png'], objects: files(3) })
    expect(unreadable.body.files).toEqual({ copied: 2, pending: 0, failed: 1 })
    const refused = await run({ r2File: 403, objects: files(2) })
    expect(refused.body.files).toEqual({ copied: 0, pending: 0, failed: 2 })
    const thrown = await run({ r2File: 'throw', objects: files(2) })
    expect(thrown.body.files).toEqual({ copied: 0, pending: 0, failed: 2 })
  })

  it('the manifest is saved every five files and at the end, so a night cut short keeps what it copied', async () => {
    const r = await run({ objects: files(7) })
    const saves = r.uploads.filter((u) => u.url.endsWith('/files/manifest.json')).map((u) => Object.keys(JSON.parse(u.body.toString('utf8'))).length)
    expect(saves).toEqual([5, 7])
    expect(r.body.files).toEqual({ copied: 7, pending: 0, failed: 0 })
  })

  it('a manifest R2 won’t save is counted failed', async () => {
    for (const manifestWrite of [403, 'throw'] as const) {
      const r = await run({ manifestWrite, objects: files(2) })
      expect(r.body.files).toEqual({ copied: 2, pending: 0, failed: 1 })
    }
  })

  it('the files’ counts not reaching the night’s row fails nothing', async () => {
    const r = await run({ filesRecordFails: 'throw', objects: files(1) })
    expect(r.status).toBe(200)
    expect(r.patches).toHaveLength(1)
    expect(r.body.files).toEqual({ copied: 1, pending: 0, failed: 0 })
  })

  it('no file is started 34 s after the run began: the rest wait for the next night', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // Each read takes 10 s: files 1 to 4 start by 30 s, the fifth would start at 40 s.
    const r = await run({ readMs: 10_000, objects: files(6) })
    expect(r.body.files).toEqual({ copied: 4, pending: 2, failed: 0 })
    expect(r.patches).toEqual([{ url: 'backup_runs?id=eq.7', body: { files: { copied: 4, pending: 2, failed: 0 } } }])
    const saves = r.uploads.filter((u) => u.url.endsWith('/files/manifest.json'))
    expect(saves).toHaveLength(1)
  })
})

