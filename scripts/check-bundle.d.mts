/** Types for scripts/check-bundle.mjs (its tests import it). */
export declare const ENTRY_BUDGET_GZIP_KIB: number
export declare function entryScripts(html: string): string[]
export declare function entryReport(dir: string, budgetKib?: number): { files: Array<{ path: string; gzip: number }>; kib: number; problems: string[] }
