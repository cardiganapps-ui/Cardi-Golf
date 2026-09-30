import { defineConfig } from 'vitest/config'
const E = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/PERF'
export default defineConfig({
  root: '/home/user/Cardi-Golf',
  resolve: { alias: { '@': '/home/user/Cardi-Golf/src' } },
  define: { __APP_VERSION__: JSON.stringify('bench') },
  test: {
    include: [`${E}/bench/*.bench.test.ts`],
    environment: 'node',
    testTimeout: 600000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    reporters: ['default'],
    cache: false,
  },
})
