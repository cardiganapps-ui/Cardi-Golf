import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimeoutError, withTimeout } from './timeout'

afterEach(() => vi.useRealTimers())

describe('withTimeout', () => {
  it('passes a value through when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7)
  })

  it('passes a rejection through unchanged', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom')
  })

  it('rejects with TimeoutError when the promise never settles', async () => {
    vi.useFakeTimers()
    const p = withTimeout(new Promise(() => {}), 8000, 'sesión')
    const check = expect(p).rejects.toBeInstanceOf(TimeoutError)
    await vi.advanceTimersByTimeAsync(8000)
    await check
  })
})
