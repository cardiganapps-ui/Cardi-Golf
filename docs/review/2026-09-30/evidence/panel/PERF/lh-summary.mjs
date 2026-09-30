// Summarize a Lighthouse JSON report: metrics, LCP element, heaviest requests, bootup, unused JS, main-thread breakdown.
import { readFileSync } from 'node:fs'
const f = process.argv[2]
const r = JSON.parse(readFileSync(f, 'utf8'))
const a = r.audits
const kib = (b) => (b / 1024).toFixed(1) + ' KiB'
console.log(`== ${f}\nurl ${r.finalDisplayedUrl}  throttling ${r.configSettings.throttlingMethod}  formFactor ${r.configSettings.formFactor}`)
console.log('perf score', r.categories.performance.score)
for (const k of ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index', 'interactive', 'max-potential-fid', 'total-byte-weight', 'dom-size'])
  if (a[k]) console.log(`  ${k}: ${a[k].displayValue ?? a[k].numericValue}`)
const lcpEl = a['largest-contentful-paint-element']
if (lcpEl?.details?.items?.[0]) {
  const it = lcpEl.details.items[0]
  const node = it.items?.[0]?.node ?? it.node
  console.log('LCP element:', node?.snippet ?? JSON.stringify(it).slice(0, 300))
  const phases = lcpEl.details.items[1]?.items
  if (phases) console.log('LCP phases:', phases.map((p) => `${p.phase} ${Math.round(p.timing)}ms`).join(' | '))
}
const net = a['network-requests']?.details?.items ?? []
console.log(`requests ${net.length}; top by transfer:`)
for (const it of [...net].sort((x, y) => (y.transferSize ?? 0) - (x.transferSize ?? 0)).slice(0, 14))
  console.log(`  ${kib(it.transferSize ?? 0)}\t(res ${kib(it.resourceSize ?? 0)})\t${it.resourceType}\t${Math.round(it.networkRequestTime ?? it.startTime ?? 0)}→${Math.round(it.networkEndTime ?? it.endTime ?? 0)}ms\t${String(it.url).slice(0, 110)}`)
const byType = {}
for (const it of net) byType[it.resourceType] = (byType[it.resourceType] ?? 0) + (it.transferSize ?? 0)
console.log('transfer by type:', Object.entries(byType).map(([k, v]) => `${k} ${kib(v)}`).join(', '))
const boot = a['bootup-time']?.details?.items ?? []
console.log('bootup (ms total/scripting/parse):')
for (const it of boot.slice(0, 6)) console.log(`  ${Math.round(it.total)}/${Math.round(it.scripting)}/${Math.round(it.scriptParseCompile)}\t${String(it.url).slice(0, 100)}`)
const mt = a['mainthread-work-breakdown']?.details?.items ?? []
console.log('main thread:', mt.map((x) => `${x.groupLabel ?? x.group} ${Math.round(x.duration)}ms`).join(', '))
const unused = a['unused-javascript']?.details?.items ?? []
for (const it of unused.slice(0, 5)) console.log(`unused JS: ${kib(it.wastedBytes)} of ${kib(it.totalBytes)} (${it.wastedPercent?.toFixed?.(0)}%) ${String(it.url).slice(0, 90)}`)
const uc = a['unused-css-rules']?.details?.items ?? []
for (const it of uc.slice(0, 3)) console.log(`unused CSS: ${kib(it.wastedBytes)} of ${kib(it.totalBytes)} ${String(it.url).slice(0, 90)}`)
const lt = a['long-tasks']?.details?.items ?? []
console.log('long tasks:', lt.slice(0, 8).map((x) => `${Math.round(x.startTime)}+${Math.round(x.duration)}ms ${String(x.url).split('/').pop()}`).join(' | '))
for (const k of ['uses-responsive-images', 'modern-image-formats', 'efficient-animated-content', 'uses-optimized-images', 'offscreen-images', 'font-display', 'render-blocking-resources', 'uses-long-cache-ttl', 'uses-text-compression', 'legacy-javascript', 'duplicated-javascript', 'third-party-summary', 'critical-request-chains', 'redirects', 'server-response-time'])
  if (a[k] && a[k].score !== null && a[k].score < 1) {
    const items = a[k].details?.items ?? []
    console.log(`AUDIT ${k}: score ${a[k].score} ${a[k].displayValue ?? ''}`)
    for (const it of items.slice(0, 6)) console.log(`   - ${kib(it.wastedBytes ?? 0)} wasted / ${kib(it.totalBytes ?? it.transferSize ?? 0)} ${String(it.url ?? it.node?.snippet ?? '').slice(0, 110)}`)
  }
