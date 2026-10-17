// @vitest-environment happy-dom
/**
 * ARCH-18: the server state outside a tournament, through one cache.
 * - A query has a deadline of its own, and a screen that goes cancels it.
 * - It is tried again only when the failure may pass by itself.
 * - Two screens asking for the same key ask once.
 * - Another account on the phone (a sign-out, a sign-in) never sees what the
 *   last one read.
 * - The first load (the shell, a player's link, the link to watch) never
 *   brings Query: only the screens that read through it do.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './apiError'
import { useAuth } from './auth'
import { forgetServerState, invalidateServer } from './serverCache'
import { QUERY_TIMEOUT_MS, queryClient, useServerQuery, withDeadline } from './query'
import { TimeoutError } from '../lib/timeout'

beforeEach(() => {
  useAuth.setState({ user: { id: 'uid-ana' } as never, isAnonymous: false, ready: true })
})
afterEach(() => {
  cleanup()
  queryClient.clear()
  vi.useRealTimers()
})

function Reads({ fn, k = 'crews' }: { fn: () => Promise<string>; k?: string }) {
  const q = useServerQuery([k], fn)
  return <p>{q.data ?? (q.error ? 'error' : 'cargando')}</p>
}

describe('withDeadline', () => {
  it('gives up at its deadline with a TimeoutError, and aborts the signal the job got', async () => {
    vi.useFakeTimers()
    let seen: AbortSignal | undefined
    const p = withDeadline((s) => ((seen = s), new Promise<never>(() => undefined)), undefined, 1000, 'crews')
    const caught = p.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await caught).toBeInstanceOf(TimeoutError)
    expect(seen?.aborted).toBe(true)
  })

  it('the caller’s cancel reaches the job too', async () => {
    const outer = new AbortController()
    let seen: AbortSignal | undefined
    const p = withDeadline(
      (s) => ((seen = s), new Promise<never>(() => undefined)),
      outer.signal,
      60_000,
      'crews',
    ).catch((e: unknown) => e)
    outer.abort(new Error('se fue la pantalla'))
    expect(await p).toEqual(new Error('se fue la pantalla'))
    expect(seen?.aborted).toBe(true)
  })

  it('a query that never answers shows its error at the client’s deadline, never an endless spinner', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Reads fn={() => new Promise<never>(() => undefined)} />)
    expect(screen.getByText('cargando')).toBeTruthy()
    // A timeout may pass by itself: asked again twice, each with its own deadline, then said.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * QUERY_TIMEOUT_MS + 10_000)
    })
    expect(await screen.findByText('error')).toBeTruthy()
  })
})

describe('tries again only what may pass by itself', () => {
  it('no signal: asked again, and the answer lands', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fn = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue('Los jueves')
    render(<Reads fn={fn} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(await screen.findByText('Los jueves')).toBeTruthy()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('a refusal: said at once, asked once', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiError('permission denied for function my_crews', '42501'))
    render(<Reads fn={fn} />)
    expect(await screen.findByText('error')).toBeTruthy()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

it('two screens asking for the same thing ask once', async () => {
  const fn = vi.fn(async () => 'Los jueves')
  render(
    <>
      <Reads fn={fn} />
      <Reads fn={fn} />
    </>,
  )
  await waitFor(() => expect(screen.getAllByText('Los jueves')).toHaveLength(2))
  expect(fn).toHaveBeenCalledTimes(1)
})

it('a write’s keys are read again, under any account’s prefix', async () => {
  const fn = vi.fn().mockResolvedValueOnce('antes').mockResolvedValue('después')
  render(<Reads fn={fn} />)
  await screen.findByText('antes')
  await act(() => invalidateServer([['crews']]))
  expect(await screen.findByText('después')).toBeTruthy()
})

describe('what one person read is not the next one’s', () => {
  it('another account on the phone: the cache is empty, and the screen reads for the new one', async () => {
    const fn = vi.fn().mockResolvedValueOnce('crews de Ana').mockResolvedValue('crews de Beto')
    render(<Reads fn={fn} />)
    await screen.findByText('crews de Ana')
    act(() => useAuth.setState({ user: { id: 'uid-beto' } as never }))
    expect(
      queryClient
        .getQueryCache()
        .findAll()
        .every((q) => q.queryKey[0] === 'uid-beto'),
    ).toBe(true)
    expect(await screen.findByText('crews de Beto')).toBeTruthy()
    expect(screen.queryByText('crews de Ana')).toBeNull()
  })

  it('signed out: nothing stays', async () => {
    render(<Reads fn={async () => 'crews de Ana'} />)
    await screen.findByText('crews de Ana')
    cleanup()
    act(() => useAuth.setState({ user: null }))
    expect(queryClient.getQueryCache().findAll()).toHaveLength(0)
  })

  it('the sign-out cleanup empties it too (forgetSignedOut)', async () => {
    render(<Reads fn={async () => 'crews de Ana'} />)
    await screen.findByText('crews de Ana')
    cleanup()
    forgetServerState()
    expect(queryClient.getQueryCache().findAll()).toHaveLength(0)
  })
})

/** The modules `from` imports statically (no `import type`, no `import()`), resolved to files under src. */
function staticImports(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const out: string[] = []
  for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
    const spec = m[1]!
    if (!spec.startsWith('.')) {
      out.push(spec)
      continue
    }
    const base = resolve(dirname(file), spec)
    const hit = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']
      .map((x) => base + x)
      .find((p) => existsSync(p) && /\.tsx?$/.test(p))
    if (hit) out.push(hit)
  }
  return out
}

function reaches(root: string, target: (spec: string) => boolean): string[] | null {
  const seen = new Set<string>()
  const walk = (file: string, path: string[]): string[] | null => {
    if (seen.has(file)) return null
    seen.add(file)
    for (const dep of staticImports(file)) {
      if (target(dep)) return [...path, dep]
      if (dep.startsWith('/')) {
        const found = walk(dep, [...path, dep])
        if (found) return found
      }
    }
    return null
  }
  return walk(root, [root])
}

describe('Query is not in the first load (ARCH-18)', () => {
  const isQuery = (spec: string) =>
    spec.startsWith('@tanstack/') ||
    /\/src\/data\/query\.ts$/.test(spec) ||
    /\/src\/components\/useServerMutation\.ts$/.test(spec)
  const src = (p: string) => join(process.cwd(), 'src', p)
  it.each([
    ['the shell (index.html’s entry)', 'main.tsx'],
    ['a player’s link (the gate, Entrar, En vivo, the Tarjeta)', 'screens/tournament/player.ts'],
    ['the link to watch', 'screens/spectator/routes.tsx'],
  ])('%s', (_, root) => {
    expect(reaches(src(root), isQuery)).toBeNull()
  })
  it('…while a screen that reads through it does (the walk finds what it looks for)', () => {
    expect(reaches(src('screens/profile/MiPolo.tsx'), isQuery)).not.toBeNull()
    expect(reaches(src('screens/platform/index.ts'), isQuery)).not.toBeNull()
  })
})
