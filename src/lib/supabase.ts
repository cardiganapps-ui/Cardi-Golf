import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
    })
  }
  return client
}
