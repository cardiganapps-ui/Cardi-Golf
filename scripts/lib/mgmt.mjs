// SQL against the Cardi-Golf Supabase project through the Management API.
// Reads SUPABASE_PAT and SUPABASE_PROJECT_REF from the environment (call
// loadEnv() first). Never prints the token.
export async function query(sql) {
  const PAT = process.env.SUPABASE_PAT
  const REF = process.env.SUPABASE_PROJECT_REF
  if (!PAT || !REF) throw new Error('Missing SUPABASE_PAT / SUPABASE_PROJECT_REF')
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 2000)}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
