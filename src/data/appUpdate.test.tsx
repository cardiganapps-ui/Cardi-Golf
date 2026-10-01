// @vitest-environment happy-dom
/**
 * PWA-03 part 1. An open app used to never notice a deploy (no update check),
 * offered it once in a 6 s toast, and had no way to be told it is too old.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'

const flagsStore = vi.hoisted(() => ({ store: null as unknown as ReturnType<typeof makeFlags> }))
function makeFlags() {
  return create<{ flags: { minBuild?: number | null } | null; load: () => Promise<void> }>(() => ({ flags: null, load: vi.fn(async () => undefined) }))
}
vi.mock('./platform', () => {
  flagsStore.store = makeFlags()
  return { useAppFlags: flagsStore.store }
})
const blockedCalls = vi.hoisted(() => [] as boolean[])
vi.mock('./outbox', async () => {
  const { create } = await import('zustand')
  return {
    setOutboxBlocked: (b: boolean) => void blockedCalls.push(b),
    useOutbox: create(() => ({ editing: false })),
  }
})

const { _appUpdateTest, offerUpdate, startUpdateChecks, useAppUpdate, SW_CHECK_MS } = await import('./appUpdate')
const { useOutbox } = await import('./outbox')
const { UpdateBar } = await import('../components/UpdateBar')
const { BUILD } = await import('../lib/build')
const { t } = await import('../i18n/es-MX')

const fakeRegistration = () => ({ update: vi.fn(async () => undefined) }) as unknown as ServiceWorkerRegistration & { update: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.useFakeTimers()
  _appUpdateTest.reset()
  blockedCalls.length = 0
  flagsStore.store.setState({ flags: null })
  useOutbox.setState({ editing: false })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('noticing a deploy while the app stays open', () => {
  it('re-checks the service worker on resume and every 30 minutes', () => {
    const reg = fakeRegistration()
    startUpdateChecks(reg)
    expect(reg.update).not.toHaveBeenCalled()
    vi.advanceTimersByTime(SW_CHECK_MS)
    expect(reg.update).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(reg.update).toHaveBeenCalledTimes(2)
    expect(flagsStore.store.getState().load).toHaveBeenCalled()
  })
})

describe('the update bar', () => {
  it('stays until the update is applied, and waits while a hole is half-entered', async () => {
    render(<UpdateBar />)
    expect(screen.queryByRole('status')).toBeNull()
    const apply = vi.fn(async () => undefined)
    act(() => offerUpdate(apply))
    expect(screen.getByRole('status').textContent).toContain(t.sync.newVersion)
    act(() => vi.advanceTimersByTime(10 * 60 * 1000))
    expect(screen.getByRole('status')).toBeTruthy()
    act(() => useOutbox.setState({ editing: true }))
    expect(screen.queryByRole('status')).toBeNull()
    act(() => useOutbox.setState({ editing: false }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.sync.update }))
    })
    expect(apply).toHaveBeenCalledTimes(1)
  })
})

describe('the minimum build', () => {
  it('a floor above this build blocks the outbox and insists, even mid-hole; lifting it unblocks', () => {
    startUpdateChecks(null)
    render(<UpdateBar />)
    act(() => useOutbox.setState({ editing: true }))
    act(() => flagsStore.store.setState({ flags: { minBuild: BUILD.id + 1 } }))
    expect(useAppUpdate.getState().required).toBe(true)
    expect(blockedCalls.at(-1)).toBe(true)
    expect(screen.getByRole('status').textContent).toContain(t.sync.updateRequired)
    act(() => flagsStore.store.setState({ flags: { minBuild: BUILD.id } }))
    expect(useAppUpdate.getState().required).toBe(false)
    expect(blockedCalls.at(-1)).toBe(false)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('no flag, or an old floor, changes nothing', () => {
    startUpdateChecks(null)
    act(() => flagsStore.store.setState({ flags: { minBuild: null } }))
    act(() => flagsStore.store.setState({ flags: { minBuild: BUILD.id - 100 } }))
    expect(useAppUpdate.getState().required).toBe(false)
    expect(blockedCalls.every((b) => b === false)).toBe(true)
  })
})
