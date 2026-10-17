/**
 * ARCH-07: a production build fails when a dev-only module (the design fixtures, the style guide, the test
 * builders) reaches one of its chunks. Fixture chunks and the profile fixtures used to ship and be precached on
 * every phone. The real build runs it on every preflight; here, the rule itself.
 */
import { describe, expect, it, vi } from 'vitest'
import { DEV_ONLY, devModulesIn, noDevCode } from './noDevCode'

const R = '/home/user/Cardi-Golf'
const chunk = (modules: Record<string, number>) => ({
  type: 'chunk',
  modules: Object.fromEntries(Object.entries(modules).map(([id, n]) => [id, { renderedLength: n }])),
})

describe('what is dev-only', () => {
  it('the fixtures, the style guide and any testing folder', () => {
    for (const id of [
      'src/dev/fixtures.ts',
      'src/dev/profileFixtures.ts',
      'src/design/DesignScreen.tsx',
      'src/design/DesignScreen.module.css',
      'src/engine/testing/fixtures.ts',
      'src/data/testing/fakeSupabase.ts',
    ])
      expect(DEV_ONLY.test(`${R}/${id}`), id).toBe(true)
  })
  it('never what the app uses: the design system’s tokens, its motion, its mark, a screen', () => {
    for (const id of [
      'src/design/accents.ts',
      'src/design/motion.ts',
      'src/design/logoMark.json',
      'src/screens/profile/ProfileScreen.tsx',
      'src/lib/telemetry.ts',
      'src/app/devRoutes.tsx',
    ])
      expect(DEV_ONLY.test(`${R}/${id}`), id).toBe(false)
  })
})

describe('a build’s chunks', () => {
  it('names each dev-only module with code in a chunk, once; one tree-shaken to nothing and the assets are no matter', () => {
    const bundle = {
      'index.js': chunk({ [`${R}/src/main.tsx`]: 900, [`${R}/src/dev/profileFixtures.ts`]: 4000 }),
      'Stats.js': chunk({ [`${R}/src/dev/profileFixtures.ts`]: 10, [`${R}/src/dev/FixtureGate.tsx`]: 0 }),
      'style.css': { type: 'asset' },
    }
    expect(devModulesIn(bundle)).toEqual(['src/dev/profileFixtures.ts'])
  })
})

describe('the plugin', () => {
  const run = (env: Record<string, unknown>, bundle: object) => {
    const plugin = noDevCode() as unknown as {
      configResolved: (c: { env: Record<string, unknown> }) => void
      generateBundle: (this: { error: (m: string) => never }, o: unknown, b: object) => void
    }
    plugin.configResolved({ env })
    const error = vi.fn((m: string) => {
      throw new Error(m)
    })
    try {
      plugin.generateBundle.call({ error }, {}, bundle)
    } catch {
      // The build stops here.
    }
    return error
  }
  const leaky = { 'index.js': chunk({ [`${R}/src/design/DesignScreen.tsx`]: 3000 }) }

  it('fails a production build that carries one, naming it', () => {
    const error = run({ DEV: false, VITE_DESIGN_ROUTES: undefined }, leaky)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('src/design/DesignScreen.tsx'))
    expect(run({ DEV: false }, { 'index.js': chunk({ [`${R}/src/main.tsx`]: 900 }) })).not.toHaveBeenCalled()
  })

  it('leaves alone a build with the design routes, by the router’s own rule', () => {
    expect(run({ DEV: false, VITE_DESIGN_ROUTES: '1' }, leaky)).not.toHaveBeenCalled()
    expect(run({ DEV: true }, leaky)).not.toHaveBeenCalled()
    expect(run({ DEV: false, VITE_DESIGN_ROUTES: 'true' }, leaky)).toHaveBeenCalled()
  })
})
