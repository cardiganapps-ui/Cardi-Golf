/**
 * A server error with its Postgres code. humanError reads the code: our own
 * raises (42501, 22023, 23505, P0001) keep their Spanish sentence, Postgres's
 * own messages become copy. Its own module, so the paged reads (paged.ts) and
 * the API (api.ts, which re-exports it) never import each other (DB-20).
 */
export class ApiError extends Error {
  code: string | null
  constructor(message: string, code: string | null) {
    super(message)
    this.code = code
  }
  /** From a supabase-js error, keeping its code. */
  static from(error: { message: string; code?: string | null }): ApiError {
    return new ApiError(error.message, error.code ?? null)
  }
}
