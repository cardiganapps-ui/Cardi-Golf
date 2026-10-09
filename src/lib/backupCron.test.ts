/**
 * The nightly backup (`api/backup-cron.ts`, CLAUDE.md §3) reads every table
 * in `BACKUP_TABLES` or fails the whole run, loudly: a backup that skipped a
 * table would look whole and restore without it. So a release that adds a
 * table to the backup ships after the migration that creates it (round 3 of
 * PR 104: 0027's `money_adjustments` reaches production first).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BACKUP_TABLES } from './backupTables'

const ENV = { CRON_SECRET: 's', SUPABASE_URL: 'https://db.invalid', SUPABASE_SECRET_KEY: 'k', R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c', R2_BACKUP_BUCKET: 'd' }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** The route against a database where `absent` does not exist, and what it read, uploaded and recorded. */
async function run(absent: string | null) {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
  const read: string[] = []
  const uploads: string[] = []
  const records: Array<{ ok: boolean; error?: string }> = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    const method = input instanceof Request ? input.method : (init?.method ?? 'GET')
    if (url.includes('r2.cloudflarestorage.com')) {
      uploads.push(url)
      return new Response(null, { status: 200 })
    }
    const table = /\/rest\/v1\/([a-z_]+)/.exec(url)![1]!
    if (method === 'POST' && table === 'backup_runs') {
      records.push(JSON.parse(String(init!.body)))
      return new Response(null, { status: 201 })
    }
    read.push(table)
    if (table === absent) return new Response(JSON.stringify({ code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }), { status: 404 })
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
  return { status, body, read, uploads, records }
}

describe('the nightly backup', () => {
  it('reads every table it backs up, the Comité’s money decisions included, and uploads one file', async () => {
    const r = await run(null)
    expect(r.status).toBe(200)
    expect(r.read).toEqual(Object.keys(BACKUP_TABLES))
    expect(r.read).toContain('money_adjustments')
    expect(r.uploads).toHaveLength(1)
    expect(r.records).toEqual([expect.objectContaining({ ok: true })])
  })

  it('a table missing on the database fails the whole run, by name, and uploads nothing (never a backup without it)', async () => {
    const r = await run('money_adjustments')
    expect(r.status).toBe(502)
    expect(r.body).toEqual({ error: 'read failed', detail: 'money_adjustments: HTTP 404' })
    expect(r.uploads).toEqual([])
    expect(r.records).toEqual([{ ok: false, error: 'read: money_adjustments: HTTP 404' }])
  })
})
