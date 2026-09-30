import { defineConfig } from 'vitest/config'
export default defineConfig({
  root: '/home/user/Cardi-Golf',
  test: {
    include: ['/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V11/tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
  cacheDir: '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V11/.vite-cache',
})
