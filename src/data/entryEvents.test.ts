/**
 * N3: «Para empezar» asks the server again when this phone changes who can
 * get in. The writes that do it call `entryChanged` themselves, so every
 * caller is covered (Jugadores, Más, Mi Polo, Entrar, the sign-in that saves
 * a device's player, the platform panel, a restore), not just the Comité's
 * own buttons. A write the server refuses changed nothing and says nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../lib/supabase', () => ({ supabaseConfigured: true, supabase: () => ({ rpc }) }))

import { setPlayerPin } from './api'
import { restoreBackup } from './backup'
import { onEntryChanged } from './entryEvents'
import { supabasePlatformApi } from './platform'
import { comiteLinkProfile, comiteUnlinkProfile, linkMyProfile, redeemLinkToken, unlinkMyProfile } from './profiles'

const writes: Array<[string, () => Promise<unknown>]> = [
  ['set_player_pin', () => setPlayerPin('p1', '1234')],
  ['link_my_profile', () => linkMyProfile('p1')],
  ['unlink_my_profile', () => unlinkMyProfile('p1')],
  ['comite_link_profile', () => comiteLinkProfile('p1', 'camilo')],
  ['comite_unlink_profile', () => comiteUnlinkProfile('p1')],
  ['redeem_link_token', () => redeemLinkToken('token')],
  ['comite_unlink_profile (platform)', () => supabasePlatformApi.unlinkPlayer('p1')],
  ['platform_delete_account', () => supabasePlatformApi.deleteAccount('u1', 'BORRAR', 'pidió su baja')],
  ['restore_tournament', () => restoreBackup('t1', { version: 1, exportedAt: '2027-04-08T00:00:00Z', tournamentId: 't1', slug: 'viaje', tables: {} })],
]

let off = () => undefined as void
afterEach(() => {
  off()
  rpc.mockReset()
})

describe('who can get in changed', () => {
  it.each(writes)('%s tells «Para empezar»', async (_, write) => {
    const heard = vi.fn()
    off = onEntryChanged(heard)
    rpc.mockResolvedValue({ data: { ok: true, status: 'confirmed' }, error: null })
    await write()
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it.each(writes)('%s refused by the server says nothing', async (_, write) => {
    const heard = vi.fn()
    off = onEntryChanged(heard)
    rpc.mockResolvedValue({ data: null, error: { message: 'Solo el Comité', code: '42501' } })
    await expect(write()).rejects.toThrow()
    expect(heard).not.toHaveBeenCalled()
  })
})
