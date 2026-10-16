/** Types for scripts/seed-courses.mjs (its tests import it). */
import type { ProviderCourse, ProviderSearchHit, ProviderTee } from '../src/lib/courseProviders/types.ts'

export interface ListedCourse {
  region?: string
  name: string
  city?: string
}
export interface SeedReport {
  at: string
  target: string
  apply: boolean
  catalogRead: boolean
  providers: { golfcourseapi: boolean; opengolfapi: boolean }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  courses: Array<Record<string, any>>
  /** Providers that answered 429 and were asked nothing more. */
  limited: string[]
  totals: { imported: number; wouldImport: number; exists: number; missing: number; failed: number }
}
export declare const PRODUCTION_URL: string
export declare function targetOf(url: string | undefined): { url: string; kind: 'production' | 'local' }
export declare function dupeKey(name: string | null | undefined): string
export declare function keysMatch(a: string, b: string): boolean
export declare function completeTees(tees: ProviderTee[]): { complete: ProviderTee[]; dropped: Array<{ tee: string; why: string }> }
export declare function candidates(entry: ListedCourse, hits: ProviderSearchHit[]): ProviderSearchHit[]
export declare function importPayload(c: ProviderCourse, tees: ProviderTee[], entry: ListedCourse): Record<string, unknown>
export declare function seed(o: {
  list: ListedCourse[]
  fetch: typeof globalThis.fetch
  env: Record<string, string | undefined>
  apply: boolean
  target: { url: string; kind: string }
  log?: (line: string) => void
  sleep?: (ms: number) => Promise<void>
  pauseMs?: number
}): Promise<SeedReport>
