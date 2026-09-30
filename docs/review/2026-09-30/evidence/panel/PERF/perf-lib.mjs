// PERF panel helpers: Chromium launch, React commit counter (DevTools hook stub), DOM mutation counter, CDP metrics.
import { chromium } from 'playwright-core'
import { execSync } from 'node:child_process'

export const E = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/PERF'
export const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const load = () => execSync('cat /proc/loadavg').toString().trim()

export async function launch(opts = {}) {
  return chromium.launch({ executablePath: CHROME, args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'], ...opts })
}

/** Installed before any page script: counts React commits and per-component renders, and DOM mutation records. */
export const HOOK_SCRIPT = `(() => {
  const COMP = new Set([0, 1, 11, 14, 15, 28]);
  const nameOf = (t) => {
    if (!t) return '?';
    if (typeof t === 'function') return t.displayName || t.name || 'Anon';
    if (typeof t === 'object') {
      if (t.displayName) return t.displayName;
      if (t.render) return 'ForwardRef(' + (t.render.displayName || t.render.name || '') + ')';
      if (t.type) return 'Memo(' + nameOf(t.type) + ')';
    }
    return String(t);
  };
  const rc = { commits: 0, rendered: {}, mounted: {}, nRendered: 0, nMounted: 0, commitTimes: [], mutations: 0, mutationNodes: 0 };
  window.__RC = rc;
  window.__RCreset = () => { rc.commits = 0; rc.rendered = {}; rc.mounted = {}; rc.nRendered = 0; rc.nMounted = 0; rc.commitTimes = []; rc.mutations = 0; rc.mutationNodes = 0; };
  let id = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers: new Map(),
    inject(r) { id++; this.renderers.set(id, r); return id; },
    checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, setStrictMode() {},
    onCommitFiberRoot(_id, root) {
      rc.commits++;
      rc.commitTimes.push(performance.now());
      const stack = [[root.current, root.current.alternate]];
      while (stack.length) {
        const [next, prev] = stack.pop();
        if (COMP.has(next.tag)) {
          const n = nameOf(next.type);
          if (!prev) { rc.mounted[n] = (rc.mounted[n] || 0) + 1; rc.nMounted++; }
          else if ((next.flags & 1) === 1) { rc.rendered[n] = (rc.rendered[n] || 0) + 1; rc.nRendered++; }
        }
        if (!prev || next.child !== prev.child) for (let c = next.child; c; c = c.sibling) stack.push([c, c.alternate]);
      }
    },
  };
  const startMO = () => {
    new MutationObserver((recs) => { rc.mutations += recs.length; for (const r of recs) rc.mutationNodes += (r.addedNodes?.length || 0) + (r.removedNodes?.length || 0); })
      .observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  };
  if (document.documentElement) startMO(); else document.addEventListener('DOMContentLoaded', startMO);
})();`

export async function newPhone(browser, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, serviceWorkers: 'block', ...extra })
  await ctx.addInitScript(HOOK_SCRIPT)
  return ctx
}

export async function cdpMetrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
}
export function diffMetrics(a, b) {
  const keys = ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration', 'LayoutCount', 'RecalcStyleCount', 'JSHeapUsedSize', 'Nodes', 'JSEventListeners']
  const o = {}
  for (const k of keys) o[k] = k.endsWith('Duration') ? +((b[k] - a[k]) * 1000).toFixed(1) : b[k] - a[k]
  return o
}
export const topN = (obj, n = 12) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
