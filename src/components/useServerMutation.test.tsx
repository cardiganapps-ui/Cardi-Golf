// @vitest-environment happy-dom
/**
 * ARCH-18: every write outside the tournament store's own goes through one
 * hook. It is busy while it runs, says a failure once in Spanish (a toast, or
 * the form's line), reads again the keys it changed, and says the screen's
 * «Listo». And the copies of `run()` it replaced don't come back: a screen
 * that writes its own wrapper fails here.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../data/apiError'
import { queryClient, useServerQuery } from '../data/query'
import { t } from '../i18n/es-MX'
import { onToast } from './toast'
import { useServerMutation } from './useServerMutation'

afterEach(() => {
  cleanup()
  queryClient.clear()
})

function toasts() {
  const said: string[] = []
  const off = onToast((m) => said.push(m.msg))
  return { said, off }
}

describe('useServerMutation', () => {
  it('is busy while the write runs, says its «Listo», and answers true', async () => {
    const { said, off } = toasts()
    let finish!: () => void
    const { result } = renderHook(() => useServerMutation())
    let ok: Promise<boolean>
    act(() => {
      ok = result.current.run(() => new Promise<void>((r) => (finish = r)), { done: 'Listo' })
    })
    // From the tap's own render: a second tap finds the button off.
    expect(result.current.busy).toBe(true)
    await act(async () => {
      finish()
      expect(await ok).toBe(true)
    })
    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(said).toEqual(['Listo'])
    off()
  })

  it('a failure is said once, in Spanish, never as the server wrote it; it answers false and never throws', async () => {
    const { said, off } = toasts()
    const { result } = renderHook(() => useServerMutation())
    let ok = true
    await act(async () => {
      ok = await result.current.run(() => Promise.reject(new ApiError('new row violates row-level security policy for table "crews"', '42501')), { done: 'Listo' })
    })
    expect(ok).toBe(false)
    expect(said).toEqual([t.errors.permission])
    await waitFor(() => expect(result.current.busy).toBe(false))
    off()
  })

  it('a form says it by itself: no toast, the hook holds the words until the next try', async () => {
    const { said, off } = toasts()
    const { result } = renderHook(() => useServerMutation({ errors: 'inline' }))
    await act(async () => {
      await result.current.run(() => Promise.reject(new TypeError('Failed to fetch')))
    })
    expect(said).toEqual([])
    await waitFor(() => expect(result.current.error).toBe(t.errors.network))
    let finish!: () => void
    act(() => {
      void result.current.run(() => new Promise<void>((r) => (finish = r)))
    })
    await waitFor(() => expect(result.current.error).toBeNull())
    await act(async () => finish())
    off()
  })

  it('what it changed is read again before it is done; the tournament store’s reload runs first', async () => {
    const order: string[] = []
    let reads = 0
    function Crews() {
      const q = useServerQuery(['crews', 'mine'], async () => {
        reads++
        return reads
      })
      return <p>{`leídas ${q.data ?? 0}`}</p>
    }
    render(<Crews />)
    await screen.findByText('leídas 1')
    const { result } = renderHook(() => useServerMutation({ invalidates: [['crews']], after: () => order.push('after') }))
    await act(async () => {
      await result.current.run(async () => order.push('job'))
    })
    expect(order).toEqual(['job', 'after'])
    // Read again by the time the write is done (the screen shows it on Query's next tick).
    expect(reads).toBe(2)
    expect(await screen.findByText('leídas 2')).toBeTruthy()
  })

  it('after a failure, the screen’s own step (a refusal that means it is stale)', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useServerMutation({ onError }))
    const e = new ApiError('Las pujas suben de $250 en $250: la siguiente es $750', '22023')
    await act(async () => {
      await result.current.run(() => Promise.reject(e))
    })
    expect(onError).toHaveBeenCalledWith(e)
  })
})

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/**
 * The writes left on their own wrapper, and why: they are on a player's first load (the `player` chunk: En
 * vivo's share card, Dinero, the tournament's notices switch) or beside it, where Query is kept out (ARCH-18).
 * Shrink this list; never grow it.
 */
const ON_THE_PLAYER_PATH = new Set(['src/components/ShareCard.tsx', 'src/components/CloseGate.tsx', 'src/screens/tournament/MoneyScreen.tsx', 'src/screens/profile/usePushSwitch.ts'])

describe('no screen writes its own run() again', () => {
  it('the copied wrappers are gone, but for the player path', () => {
    const found = files(join(process.cwd(), 'src'))
      .map((f) => f.slice(process.cwd().length + 1))
      .filter((f) => /(async function run\b|const run = async|function run\()/.test(readFileSync(f, 'utf8')))
    expect(found.filter((f) => !ON_THE_PLAYER_PATH.has(f))).toEqual([])
  })
})
