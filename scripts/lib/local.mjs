// SQL against a local Postgres through psql (the db CI job, the review
// harness): the same calls scripts/db.mjs makes through the Management API.
// Connection from the usual PG* variables (PGHOST, PGPORT, PGUSER,
// PGPASSWORD, PGDATABASE). Statements run with ON_ERROR_STOP, as a migration
// does in production: the first error stops the file and rolls it back.
import { spawnSync } from 'node:child_process'

function psql(input, args = []) {
  const r = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `psql exited ${r.status}`).trim().slice(0, 4000))
  return r.stdout
}

/** Run statements; nothing comes back. */
export function exec(sql) {
  psql(sql)
  return []
}

/** One query's rows, as the Management API returns them (an array of objects). */
export function rows(sql) {
  // Unaligned and bare: the JSON text exactly as Postgres made it (COPY would escape its newlines).
  const out = psql(`select coalesce(json_agg(q), '[]'::json) from (${sql}) q;`, ['-A', '-t'])
  return JSON.parse(out.trim() || '[]')
}
