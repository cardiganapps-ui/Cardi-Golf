/**
 * ARCH-03: one way to call a database function. The name and the arguments
 * are the generated types' (a misspelled one fails the typecheck, which
 * `@ts-expect-error` below holds); a refusal keeps Postgres's code; a client
 * that can't be made is a rejected call, as it was from the helpers this
 * replaces; and the answers the app depends on most are checked against
 * their shape, so a renamed key is an error the screen shows, never a screen
 * that reads `undefined`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const srv = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: unknown }>,
  answer: { data: null as unknown, error: null as { message: string; code?: string } | null },
  missingEnv: false,
}))
vi.mock('../lib/supabase', () => ({
  supabase: () => {
    if (srv.missingEnv) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.')
    return {
      rpc: async (name: string, args: unknown) => {
        srv.calls.push({ name, args })
        return srv.answer
      },
    }
  },
}))
vi.mock('./legal', () => ({ acceptLegal: vi.fn(async () => undefined) }))

const { AnswerError, isMissingFunction, rpc } = await import('./rpc')
const { ApiError, lookupTournament, myMembership } = await import('./api')
const { humanError } = await import('../lib/humanError')

beforeEach(() => {
  srv.calls = []
  srv.answer = { data: null, error: null }
  srv.missingEnv = false
})

describe('rpc: one typed call (ARCH-03)', () => {
  it('sends the name and the arguments as given, and answers the data', async () => {
    srv.answer = { data: 'ABC123', error: null }
    expect(await rpc('rotate_join_code', { p_tournament_id: 't1' })).toBe('ABC123')
    expect(srv.calls).toEqual([{ name: 'rotate_join_code', args: { p_tournament_id: 't1' } }])
  })

  it('a refusal is an ApiError with its code; a function the database lacks says so', async () => {
    srv.answer = { data: null, error: { message: 'Could not find the function', code: 'PGRST202' } }
    const e = await rpc('player_phones', { p_tournament_id: 't1' }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ code: 'PGRST202', message: 'Could not find the function' })
    expect(isMissingFunction(e)).toBe(true)
    srv.answer = { data: null, error: { message: 'Solo el Comité', code: '42501' } }
    const refused = await rpc('player_phones', { p_tournament_id: 't1' }).catch((x: unknown) => x)
    expect(isMissingFunction(refused)).toBe(false)
    expect(humanError(refused)).toBe('Solo el Comité')
  })

  it('no client (a build without its env) is a rejected call, never a throw at the caller', async () => {
    srv.missingEnv = true
    let call: Promise<unknown> | null = null
    expect(() => {
      call = rpc('my_crews')
    }).not.toThrow()
    await expect(call).rejects.toThrow(/VITE_SUPABASE_URL/)
  })

  it('.as names the shape; .parse checks it, and an answer that does not read names its paths, never its values', async () => {
    srv.answer = { data: { total: 2, rows: [] }, error: null }
    expect(await rpc('platform_crews', { p_q: null, p_limit: 50, p_offset: 0 }).as<{ total: number; rows: unknown[] }>()).toEqual({ total: 2, rows: [] })
    srv.answer = { data: { playerId: 'p1', role: 'member', isOrganizer: 'sí', isAdmin: false, via: 'device', secret: 'Ana Pérez' }, error: null }
    const e = await myMembership('t1').catch((x: unknown) => x)
    expect(e).toBeInstanceOf(AnswerError)
    expect((e as InstanceType<typeof AnswerError>).issues).toEqual(['isOrganizer: invalid_type'])
    expect(String((e as Error).message)).not.toContain('Ana')
    // Said in Spanish, as any error a screen shows.
    expect(humanError(e)).not.toMatch(/my_membership|isOrganizer|answered/)
  })

  it('names and arguments are the generated types', () => {
    // Never called: the typecheck is the test.
    const typed = () => {
      // @ts-expect-error: no such function
      void rpc('rotate_join_codes', { p_tournament_id: 't1' })
      // @ts-expect-error: no such argument
      void rpc('rotate_join_code', { p_tournament: 't1' })
      // @ts-expect-error: its argument is required
      void rpc('rotate_join_code')
      // @ts-expect-error: a text answer narrows to its words, not to a number
      void rpc('rotate_join_code', { p_tournament_id: 't1' }).as<number>()
    }
    expect(typeof typed).toBe('function')
  })
})

describe('my_membership: what every screen of a tournament goes by (ARCH-03)', () => {
  const member = { playerId: 'p1', role: 'member', isOrganizer: false, isAdmin: false, via: 'device', protected: false }

  it('reads as the server answers it, keeping keys this build does not know', async () => {
    srv.answer = { data: { ...member, newer: 1 }, error: null }
    expect(await myMembership('t1')).toEqual({ ...member, newer: 1 })
    srv.answer = { data: { playerId: null, role: 'platform', isOrganizer: true, isAdmin: true, via: 'platform', protected: null, unlockedUntil: null }, error: null }
    expect(await myMembership('t1')).toMatchObject({ role: 'platform', unlockedUntil: null })
  })

  it.each([
    ['no answer', null],
    ['the Comité’s rights missing', { playerId: 'p1', role: 'member', via: 'device' }],
    ['a player that is not an id', { ...member, playerId: 7 }],
  ])('%s is an error, not a session with no rights', async (_what, data) => {
    srv.answer = { data, error: null }
    await expect(myMembership('t1')).rejects.toBeInstanceOf(AnswerError)
  })
})

describe('lookup_tournament: the faces on Entrar (ARCH-03)', () => {
  const face = { id: 'p1', displayName: 'Ana', fullName: null, tier: 'A', avatarUrl: null, isHonoree: false, hasPin: true, isMe: false, hasProfile: false, pendingMe: false }
  const tournament = { id: 't1', slug: 'viaje', name: 'Viaje', tagline: null, logoUrl: null, accentColor: null, status: 'live', joinCode: null, players: [face] }

  it('reads as the server answers it: before a PIN, no join code and no full names', async () => {
    srv.answer = { data: tournament, error: null }
    expect(await lookupTournament('VIAJE1')).toEqual(tournament)
    srv.answer = { data: null, error: null }
    expect(await lookupTournament('NADA00')).toBeNull()
  })

  it.each([
    ['a face with no name', { ...tournament, players: [{ ...face, displayName: undefined }] }],
    ['players that are not a list', { ...tournament, players: {} }],
    ['a renamed key', { ...tournament, players: [{ ...face, hasPin: undefined, has_pin: true }] }],
  ])('%s is an error the gate shows, not a grid that throws', async (_what, data) => {
    srv.answer = { data, error: null }
    await expect(lookupTournament('VIAJE1')).rejects.toBeInstanceOf(AnswerError)
  })
})
