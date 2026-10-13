/**
 * GET /api/backup-cron — nightly backup (CLAUDE.md §3 "Backups (R2)", DB-07).
 * Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`. With the
 * service-role key it takes one consistent snapshot of every table, the
 * accounts' essentials and the list of Storage files (`backup_snapshot`,
 * migration 0039), reads the history (`audit_log`, too big for one request)
 * up to the snapshot's last row, and writes one gzipped JSON to R2 at
 * backups/YYYY-MM-DD.json.gz (format 2, what scripts/restore-r2.mjs loads).
 * Then it copies the Storage files that changed since the last night to R2
 * (files/<bucket>/<name>, with files/manifest.json), within a time budget:
 * what is left goes the next night. On a database without 0039 it reads
 * each table page by page, as before (format 1), so no night is lost.
 * This is the only code allowed to use SUPABASE_SECRET_KEY, and it never
 * returns row data, only counts. Every run, good or bad, is recorded in
 * backup_runs for Admin › Salud.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { gzipSync } from 'node:zlib'
import { AwsClient } from 'aws4fetch'
import { BACKUP_TABLES, backupKey } from '../src/lib/backupTables.js'

export const config = { maxDuration: 60 }

const PAGE = 1000
/** The history, read in pages up to the snapshot's last row; every other table is in the snapshot. */
const HISTORY = 'audit_log'
/**
 * No file is started after this, counted from the run's start; with one
 * read, one write and the last manifest save at FILE_TIMEOUT_MS each, the run
 * ends before Vercel's 60 s (maxDuration). The rest goes the next night.
 */
const FILES_DEADLINE_MS = 38_000
/** Each Storage read and R2 write gives up after this: one stuck file must not take the night's manifest with it. */
const FILE_TIMEOUT_MS = 6_000
/** The manifest is saved every few files, so a run cut short keeps what it copied. */
const MANIFEST_EVERY = 5
const MANIFEST = 'files/manifest.json'

type Row = Record<string, unknown>
type Env = Record<string, string | undefined>

function headers(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}` }
}

async function readTable(url: string, key: string, table: string, order: string, filter = ''): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${url}/rest/v1/${table}?select=*&order=${order}${filter}`, {
      headers: { ...headers(key), Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    })
    if (!r.ok) throw new Error(`${table}: HTTP ${r.status}`)
    const page = (await r.json()) as Row[]
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

interface Snapshot {
  snapshotAt: string
  auditMaxId: number | null
  tables: Record<string, Row[]>
  auth: { users: Row[]; identities: Row[] }
  storage: { objects: Row[] }
}

/** What goes to R2: format 2 (one snapshot) when the database has 0039, else format 1 (page by page, as before 0039). */
export interface Dump {
  version: 1 | 2
  createdAt: string
  snapshotAt?: string
  tables: Record<string, Row[]>
  auth?: Snapshot['auth']
  storage?: Snapshot['storage']
}

/** One consistent snapshot, then the history up to its last row. Null when the database has no backup_snapshot yet. */
async function readSnapshot(url: string, key: string, at: Date): Promise<Dump | null> {
  const p_tables = Object.fromEntries(Object.entries(BACKUP_TABLES).filter(([t]) => t !== HISTORY))
  const r = await fetch(`${url}/rest/v1/rpc/backup_snapshot`, {
    method: 'POST',
    headers: { ...headers(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_tables }),
  })
  if (r.status === 404) {
    const body = (await r.json().catch(() => ({}))) as { code?: string }
    if (body.code === 'PGRST202') return null
    throw new Error(`snapshot: HTTP 404`)
  }
  if (!r.ok) {
    // The database's own words name the table it could not read.
    const body = (await r.json().catch(() => ({}))) as { message?: string }
    throw new Error(`snapshot: ${body.message ?? `HTTP ${r.status}`}`)
  }
  const snap = (await r.json()) as Snapshot
  const history = snap.auditMaxId == null ? [] : await readHistory(url, key, snap.auditMaxId)
  return {
    version: 2,
    createdAt: at.toISOString(),
    snapshotAt: snap.snapshotAt,
    tables: { ...snap.tables, [HISTORY]: history },
    auth: snap.auth,
    storage: snap.storage,
  }
}

/**
 * The history up to the snapshot's last row, by key (each page after the last
 * id read), not by offset: a row that commits mid-read below that id would
 * shift an offset page and repeat a row, and a backup with a repeated row
 * does not restore (PR 122's verifier).
 */
async function readHistory(url: string, key: string, maxId: number): Promise<Row[]> {
  const rows: Row[] = []
  let last = 0
  for (;;) {
    const r = await fetch(`${url}/rest/v1/${HISTORY}?select=*&order=id&and=(id.gt.${last},id.lte.${maxId})&limit=${PAGE}`, { headers: headers(key) })
    if (!r.ok) throw new Error(`${HISTORY}: HTTP ${r.status}`)
    const page = (await r.json()) as Row[]
    rows.push(...page)
    if (page.length < PAGE) return rows
    last = Number(page[page.length - 1]!.id)
  }
}

async function readPaged(url: string, key: string, at: Date): Promise<Dump> {
  const tables: Record<string, Row[]> = {}
  for (const [table, order] of Object.entries(BACKUP_TABLES)) tables[table] = await readTable(url, key, table, order)
  return { version: 1, createdAt: at.toISOString(), tables }
}

/** Tell Admin › Salud how this run went; its row's id, to add the files to. Never fails the backup. */
async function record(url: string, key: string, run: { ok: boolean; key?: string; bytes?: number; tables?: number; rows?: number; error?: string }): Promise<number | null> {
  try {
    const r = await fetch(`${url}/rest/v1/backup_runs`, {
      method: 'POST',
      headers: { ...headers(key), 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(run),
    })
    const rows = r.ok ? ((await r.json().catch(() => [])) as Array<{ id?: number }>) : []
    return rows[0]?.id ?? null
  } catch {
    // The backup itself is what matters; the record is a courtesy.
    return null
  }
}

/** The night's files, on its backup_runs row (0039's `files`). Never fails the backup. */
async function recordFiles(url: string, key: string, id: number, files: { copied: number; pending: number; failed: number }) {
  try {
    await fetch(`${url}/rest/v1/backup_runs?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers(key), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ files }),
    })
  } catch {
    // As record().
  }
}

/** A Storage path, each segment encoded on its own (names may hold spaces, accents, «#»). */
export function encodePath(name: string): string {
  return name.split('/').map(encodeURIComponent).join('/')
}

/**
 * Copies to R2 each Storage file the manifest doesn't have at its current
 * `updated_at`, until the deadline; each request has its own timeout, and the
 * manifest is saved every few files and at the end, so a night cut short
 * keeps what it copied and the next goes on from there. Never fails the
 * backup: the counts say what happened.
 */
async function copyFiles(env: Env, r2: AwsClient, objects: Row[], deadline: number) {
  const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BACKUP_BUCKET}`
  const out = { copied: 0, pending: 0, failed: 0 }
  let manifest: Record<string, string> = {}
  try {
    const m = await r2.fetch(`${base}/${MANIFEST}`, { signal: AbortSignal.timeout(FILE_TIMEOUT_MS) })
    if (m.ok) manifest = (await m.json()) as Record<string, string>
    else if (m.status !== 404) return { ...out, failed: objects.length }
  } catch {
    return { ...out, failed: objects.length }
  }
  let unsaved = 0
  const saveManifest = async () => {
    try {
      const put = await r2.fetch(`${base}/${MANIFEST}`, {
        method: 'PUT',
        body: JSON.stringify(manifest),
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(FILE_TIMEOUT_MS),
      })
      if (!put.ok) out.failed++
      else unsaved = 0
    } catch {
      out.failed++
    }
  }
  for (const o of objects) {
    const bucket = String(o.bucket_id)
    const name = String(o.name)
    const id = `${bucket}/${name}`
    const stamp = String(o.updated_at ?? o.created_at ?? '')
    if (manifest[id] === stamp) continue
    if (Date.now() > deadline) {
      out.pending++
      continue
    }
    try {
      const got = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodePath(name)}`, {
        headers: headers(env.SUPABASE_SECRET_KEY!),
        signal: AbortSignal.timeout(FILE_TIMEOUT_MS),
      })
      if (!got.ok) throw new Error(String(got.status))
      const put = await r2.fetch(`${base}/files/${encodeURIComponent(bucket)}/${encodePath(name)}`, {
        method: 'PUT',
        body: await got.arrayBuffer(),
        headers: { 'Content-Type': got.headers.get('content-type') ?? 'application/octet-stream' },
        signal: AbortSignal.timeout(FILE_TIMEOUT_MS),
      })
      if (!put.ok) throw new Error(String(put.status))
      manifest[id] = stamp
      out.copied++
      if (++unsaved >= MANIFEST_EVERY) await saveManifest()
    } catch {
      out.failed++
    }
  }
  if (unsaved) await saveManifest()
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const env = process.env as Env
  if (!env.CRON_SECRET || req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  const missing = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BACKUP_BUCKET'].filter(
    (k) => !env[k],
  )
  if (missing.length) {
    res.status(503).json({ error: 'backup not configured', missing })
    return
  }

  const startedAt = new Date()
  const url = env.SUPABASE_URL!
  const key = env.SUPABASE_SECRET_KEY!
  let dump: Dump
  try {
    dump = (await readSnapshot(url, key, startedAt)) ?? (await readPaged(url, key, startedAt))
  } catch (e) {
    await record(url, key, { ok: false, error: `read: ${(e as Error).message}`.slice(0, 500) })
    res.status(502).json({ error: 'read failed', detail: (e as Error).message })
    return
  }
  const counts = Object.fromEntries(Object.entries(dump.tables).map(([t, rows]) => [t, rows.length]))

  const body = gzipSync(JSON.stringify(dump))
  const objectKey = backupKey(startedAt)
  const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, service: 's3', region: 'auto' })
  const put = await r2.fetch(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BACKUP_BUCKET}/${objectKey}`, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
  })
  const rows = Object.values(counts).reduce((a, b) => a + b, 0)
  if (!put.ok) {
    await record(url, key, { ok: false, key: objectKey, error: `upload: HTTP ${put.status}` })
    res.status(502).json({ error: 'upload failed', status: put.status })
    return
  }
  // The night is safe in R2 before any file is copied: a slow copy can't lose it.
  const runId = await record(url, key, { ok: true, key: objectKey, bytes: body.length, tables: Object.keys(counts).length, rows })
  const files = dump.storage ? await copyFiles(env, r2, dump.storage.objects, startedAt.getTime() + FILES_DEADLINE_MS) : null
  if (files && runId != null) await recordFiles(url, key, runId, files)
  res.status(200).json({
    ok: true,
    key: objectKey,
    version: dump.version,
    bytes: body.length,
    counts,
    accounts: dump.auth?.users.length ?? null,
    files,
  })
}
