/**
 * A person's own «Accesos del administrador» (0068, TRUST-22): what the Admin
 * de Polo opened or did about his account and the crews he is in now, with
 * the reason, newest first. Never who the operator is. A database without
 * 0068 answers null, and the screen shows nothing.
 */
import { supabase } from '../lib/supabase'
import { ApiError } from './apiError'

export interface AdminAccess {
  id: number
  at: string
  /** 'view', 'block', 'unblock', 'pin_unlock', 'crew_remove_member'… */
  action: string
  kind: 'person' | 'crew'
  reason: string | null
  /** The crew's name, for a line about a crew (null once it is gone). */
  crew: string | null
}

export async function myAdminAccesses(): Promise<AdminAccess[] | null> {
  const { data, error } = await supabase().rpc('my_admin_accesses')
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null
    throw ApiError.from(error)
  }
  return (data as AdminAccess[] | null) ?? []
}
