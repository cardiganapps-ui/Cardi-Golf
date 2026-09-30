// Scratch-only build config: the repo's config plus an instrumentation plugin that exposes
// the tournament store and the snapshot pipeline on globalThis, for synthetic updates in tests.
import { mergeConfig, type Plugin } from 'vite'
import base from '/home/user/Cardi-Golf/vite.config.ts'

const expose: Plugin = {
  name: 'perf-expose',
  transform(code, id) {
    if (id.endsWith('/src/data/tournamentStore.ts')) return code + '\n;globalThis.__perfStore = useTournament; globalThis.__perfData = dataFromSnapshot;\n'
    if (id.endsWith('/src/data/outbox.ts')) return code + '\n;globalThis.__perfOutbox = { flush, useOutbox };\n'
    return null
  },
}
export default mergeConfig(base, {
  plugins: [expose],
  build: { minify: process.env.PERF_NOMIN ? false : 'esbuild', sourcemap: false },
})
