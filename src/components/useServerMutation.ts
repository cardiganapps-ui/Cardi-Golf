/**
 * One way to write to the server (ARCH-18), from any screen: `run(job)` is
 * busy while it runs, says a failure once in Spanish (`humanError`, a toast
 * or the hook's `error` for a form), reads again the keys the write changed
 * (`data/query.ts`), and says the screen's «Listo». It replaced eleven
 * copies of a `run()` with its own busy flag (`useServerMutation.test.tsx`
 * holds the line against new ones).
 */
import { useCallback, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { humanError, type ErrorOverrides } from '../lib/humanError'
import { invalidate, queryClient, type ServerKey } from '../data/query'
import { toast } from './toast'

export interface RunOptions<R> {
  /** The toast once it worked: copy, or copy from the answer (none for null). */
  done?: string | ((r: R) => string | null | undefined)
  /** Keys this write changed, beyond the hook's own. */
  invalidates?: readonly ServerKey[]
}

export interface ServerMutationOptions {
  /** Keys every write of this screen changes: read again once one worked. */
  invalidates?: readonly ServerKey[]
  /** Run once a write worked, before the keys are read again (the tournament store's reload, a parent's refresh). */
  after?: () => unknown
  /** Copy for an error code in this screen (a 23505 on a form). */
  overrides?: ErrorOverrides
  /** Its own words for a failure (the account's sign-in errors). */
  words?: (e: unknown) => string
  /** `inline`: the error is the hook's `error`, for the screen to show by its form; otherwise a toast. */
  errors?: 'toast' | 'inline'
  /** After a failure as well as a success (a refusal that means the screen is stale). */
  onError?: (e: unknown) => void
}

/**
 * One way to write (ARCH-18). `run(job)` resolves true when the job and
 * everything after it worked, false when it failed (the error already said);
 * it never rejects. `busy` holds while one runs.
 */
export function useServerMutation(opts: ServerMutationOptions = {}) {
  const latest = useRef(opts)
  latest.current = opts
  const m = useMutation<unknown, unknown, { job: () => Promise<unknown>; run: RunOptions<unknown> }>(
    {
      mutationFn: async ({ job, run }) => {
        const o = latest.current
        const r = await job()
        await o.after?.()
        await invalidate([...(o.invalidates ?? []), ...(run.invalidates ?? [])])
        const done = typeof run.done === 'function' ? run.done(r) : run.done
        if (done) toast(done)
        return r
      },
    },
    queryClient,
  )
  const { mutateAsync, reset } = m
  /** Runs started and not ended: busy from the tap's own render (Query says it a tick later), so a second tap finds the button off. */
  const [running, setRunning] = useState(0)
  const run = useCallback(
    async <R>(job: () => Promise<R>, runOpts: RunOptions<R> = {}): Promise<boolean> => {
      setRunning((n) => n + 1)
      try {
        // The job starts in the tap's own task, as the wrappers' did (Query runs its mutation a tick later):
        // the request is on its way before anything renders. Its failure is handled through the mutation.
        let started: Promise<R>
        try {
          started = job()
        } catch (e) {
          started = Promise.reject(e)
        }
        started.catch(() => undefined)
        await mutateAsync({ job: () => started, run: runOpts as RunOptions<unknown> })
        return true
      } catch (e) {
        const o = latest.current
        o.onError?.(e)
        if (o.errors !== 'inline') toast(errorText(e, o))
        return false
      } finally {
        setRunning((n) => n - 1)
      }
    },
    [mutateAsync],
  )
  const o = opts
  return {
    run,
    busy: running > 0 || m.isPending,
    /** The last failure in words, for `errors: 'inline'`; cleared when the next run starts. */
    error: m.error != null ? errorText(m.error, o) : null,
    clearError: reset,
  }
}

function errorText(e: unknown, o: ServerMutationOptions): string {
  return o.words ? o.words(e) : humanError(e, o.overrides)
}
