/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Build time in seconds: higher on every deploy (see vite.config.ts). */
declare const __BUILD_ID__: number
/** Short git commit of the build. */
declare const __BUILD_SHA__: string
