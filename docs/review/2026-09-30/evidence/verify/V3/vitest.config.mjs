import { defineConfig } from 'vitest/config'
const V3 = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V3'
export default defineConfig({
  root: '/home/user/Cardi-Golf',
  test: {
    include: [`${V3}/tests/**/*.test.ts`],
    environment: 'node',
    // one file per worker, no shared module state between files
    isolate: true,
  },
  cacheDir: `${V3}/.vite-cache`,
})
