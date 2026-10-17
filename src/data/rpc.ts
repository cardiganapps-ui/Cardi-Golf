/**
 * One way to call a database function (ARCH-03). The name and the arguments
 * are the generated types' (src/data/database.types.ts, from the migrations),
 * so a renamed function or argument fails the typecheck, not a phone. A
 * refusal is an `ApiError` with Postgres's code (PGRST202, 42501, 22023…),
 * which callers and `humanError` read; every request has the client's
 * deadline (REL-14).
 *
 * What a function answers is typed as the catalog says. A jsonb answer has
 * its shape in the function's body, not the catalog: `.parse(schema)` checks
 * it where a wrong shape would break a screen, and `.as<T>()` names the shape
 * the caller reads it as (only on a jsonb answer, or as a narrowing of the
 * declared type: a text function's known words).
 */
import type { z } from 'zod'
import { supabase } from '../lib/supabase'
import { ApiError } from './apiError'
import type { Database, Json } from './database.types'

type Functions = Database['public']['Functions']
export type FnName = Extract<keyof Functions, string>
export type FnArgs<N extends FnName> = Functions[N]['Args']
export type FnReturns<N extends FnName> = Functions[N]['Returns']

/** The arguments, required when the function has any it can't do without. */
export type ArgsOf<N extends FnName> =
  FnArgs<N> extends Record<PropertyKey, never>
    ? [args?: FnArgs<N>]
    : object extends FnArgs<N>
      ? [args?: FnArgs<N>]
      : [args: FnArgs<N>]

/** What `.as<T>()` may name: anything for a jsonb answer, else a narrowing of the declared type (or null: a scalar function's answer may be). */
type Shape<R> = [Json] extends [R] ? unknown : R | null

export type Call<R> = Promise<R> & {
  /** The answer read as the shape its SQL builds. */
  as<T extends Shape<R>>(): Promise<T>
  /** The answer checked against `schema`; one it doesn't match is an `AnswerError`. */
  parse<T>(schema: z.ZodType<T>): Promise<T>
}

/** An answer whose shape this build can't read: a newer server, or a bug. Never shown as is: `humanError` says it in Spanish. */
export class AnswerError extends Error {
  readonly fn: string
  readonly issues: string[]
  constructor(fn: string, issues: string[]) {
    super(`${fn} answered something this build can't read: ${issues.join('; ')}`)
    this.fn = fn
    this.issues = issues
  }
}

/** The issues as paths, never the values (an answer may carry names). */
export function issuesOf(error: z.ZodError): string[] {
  return error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(answer)'}: ${i.code}`)
}

/** `value` checked against `schema` for `fn`'s answer. */
export function parseAnswer<T>(fn: string, schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value)
  if (!r.success) throw new AnswerError(fn, issuesOf(r.error))
  return r.data
}

/** A call with the shapes `rpc` and `anonRpc` both offer. */
export function asCall<R>(fn: string, answer: Promise<R>): Call<R> {
  return Object.assign(answer, {
    as: <T>() => answer as Promise<unknown> as Promise<T>,
    parse: <T>(schema: z.ZodType<T>) => answer.then((v) => parseAnswer(fn, schema, v)),
  })
}

/** A database without the function yet (an older migration): PostgREST's PGRST202, or Postgres's 42883. */
export function isMissingFunction(e: unknown): boolean {
  return e instanceof ApiError && (e.code === 'PGRST202' || e.code === '42883')
}

// The generic call, once: supabase-js's own overloads can't follow a name chosen by a type parameter.
type LooseRpc = (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string; code?: string | null } | null }>

export function rpc<N extends FnName>(name: N, ...[args]: ArgsOf<N>): Call<FnReturns<N>> {
  // Everything inside the promise: a client that can't be made (no env) is a rejected call, never a throw at the caller.
  const answer = (async () => {
    const client = supabase()
    const res = await (client.rpc as unknown as LooseRpc).call(client, name, args)
    if (res.error) throw ApiError.from(res.error)
    return res.data as FnReturns<N>
  })()
  return asCall(name, answer)
}
