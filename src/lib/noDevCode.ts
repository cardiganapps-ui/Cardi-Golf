/**
 * ARCH-07: a production build carries no dev-only module. The design fixtures (src/dev), the style guide
 * (src/design/DesignScreen) and the test builders (any `testing/` folder) shipped in every build and were
 * precached on every phone, the fixtures' made-up people with them: a top-level `lazy()` kept their chunks, and
 * a static import kept the profile fixtures in the entry. This fails the build (preflight, CI and Vercel's
 * production deploy) naming each one that reached a chunk. Builds with the design routes (`npm run dev`,
 * VITE_DESIGN_ROUTES=1: previews, the fixture browser suite) carry them on purpose and are left alone, by the
 * same rule the router uses (`DESIGN_ROUTES`), read from the env Vite resolved.
 */
import type { Plugin } from 'vite'

/** A module only the design routes and the tests may load, by its path. */
export const DEV_ONLY = /\/src\/(?:dev\/|design\/DesignScreen|(?:[\w.-]+\/)*testing\/)/

/** The dev-only modules with code in a build's chunks, as `src/…` paths. */
export function devModulesIn(bundle: Record<string, { type: string; modules?: Record<string, { renderedLength: number }> }>): string[] {
  const found = new Set<string>()
  for (const out of Object.values(bundle)) {
    if (out.type !== 'chunk' || !out.modules) continue
    for (const [id, m] of Object.entries(out.modules)) if (m.renderedLength > 0 && DEV_ONLY.test(id)) found.add(id.slice(id.lastIndexOf('/src/') + 1))
  }
  return [...found].sort()
}

export function noDevCode(): Plugin {
  let designRoutes = true
  return {
    name: 'polo:no-dev-code',
    apply: 'build',
    configResolved(config) {
      designRoutes = !!config.env.DEV || config.env.VITE_DESIGN_ROUTES === '1'
    },
    generateBundle(_, bundle) {
      if (designRoutes) return
      const found = devModulesIn(bundle)
      if (found.length) this.error(`dev-only code in a production build (ARCH-07): ${found.join(', ')}`)
    },
  }
}
