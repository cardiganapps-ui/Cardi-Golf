// V13 verifier: dev server for synthetic auction state (read-only use of the repo source; cache in scratch).
import base from '/home/user/Cardi-Golf/vite.config.ts'
export default {
  ...base,
  root: '/home/user/Cardi-Golf',
  cacheDir: '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V13/vite-cache',
  server: { port: 4213, strictPort: true, host: '127.0.0.1', hmr: false, watch: null },
  logLevel: 'warn',
}
