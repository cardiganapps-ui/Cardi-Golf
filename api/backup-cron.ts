/**
 * GET /api/backup-cron — nightly backup (CLAUDE.md §3 "Backups (R2)").
 * Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`. It reads
 * every public table with the service-role key and writes one gzipped JSON
 * snapshot to R2 at backups/YYYY-MM-DD.json.gz. This is the only code allowed
 * to use SUPABASE_SECRET_KEY, and it never returns row data — only counts.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { gzipSync } from 'node:zlib'
import { AwsClient } from 'aws4fetch'
import { BACKUP_TABLES, backupKey } from '../src/lib/backupTables.js'

export const config = { maxDuration: 60 }

const PAGE = 1000

type Row = Record<string, unknown>

async function readTable(url: string, key: string, table: string, order: string): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${url}/rest/v1/${table}?select=*&order=${order}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    })
    if (!r.ok) throw new Error(`${table}: HTTP ${r.status}`)
    const page = (await r.json()) as Row[]
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const env = process.env
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
  const tables: Record<string, Row[]> = {}
  const counts: Record<string, number> = {}
  try {
    for (const [table, order] of Object.entries(BACKUP_TABLES)) {
      tables[table] = await readTable(env.SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, table, order)
      counts[table] = tables[table].length
    }
  } catch (e) {
    res.status(502).json({ error: 'read failed', detail: (e as Error).message })
    return
  }

  const body = gzipSync(JSON.stringify({ version: 1, createdAt: startedAt.toISOString(), tables }))
  const key = backupKey(startedAt)
  const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, service: 's3', region: 'auto' })
  const put = await r2.fetch(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BACKUP_BUCKET}/${key}`, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
  })
  if (!put.ok) {
    res.status(502).json({ error: 'upload failed', status: put.status })
    return
  }
  res.status(200).json({ ok: true, key, bytes: body.length, counts })
}
