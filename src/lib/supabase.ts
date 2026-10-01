import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchWithTimeout } from './fetchWithTimeout'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

/**
 * Browser client with the publishable (anon) key. The service role key never
 * reaches the client (CLAUDE.md §7). Lazy so the shell renders even when the
 * env is missing (e.g. a misconfigured preview) and shows a clear message.
 */
export function supabase(): SupabaseClient {
  if (!client) {
    if (!url || !anonKey) {
      throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.')
    }
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'cardi-golf-auth',
      },
      realtime: { params: { eventsPerSecond: 10 } },
      // Every REST, RPC, auth and storage call gets a deadline (REL-14).
      global: { fetch: fetchWithTimeout },
    })
  }
  return client
}

/** Public auth settings (which sign-in providers are on). Cached for the session; `null` when unreachable. */
let settingsCache: Promise<{ external?: Record<string, boolean> } | null> | null = null
export function authSettings(): Promise<{ external?: Record<string, boolean> } | null> {
  if (!url || !anonKey) return Promise.resolve(null)
  settingsCache ??= fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => {
      settingsCache = null
      return null
    })
  return settingsCache
}
