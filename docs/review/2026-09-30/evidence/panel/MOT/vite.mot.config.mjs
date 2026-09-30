// Dev server for synthetic store updates (review only). Same source as the repo; cache kept in scratch.
import base from '/home/user/Cardi-Golf/vite.config.ts'
export default {
  ...base,
  root: '/home/user/Cardi-Golf',
  cacheDir: '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/MOT/vite-cache',
  server: { port: 4196, strictPort: true, host: '127.0.0.1', hmr: false, watch: null },
  logLevel: 'warn',
}
