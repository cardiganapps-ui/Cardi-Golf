/** Types for scripts/check-precache.mjs (its tests import it). */
export declare const PRECACHE_BUDGET_KIB: number
export declare function precached(sw: string): string[]
export declare function precacheProblems(dir: string, budgetKib?: number): string[]
