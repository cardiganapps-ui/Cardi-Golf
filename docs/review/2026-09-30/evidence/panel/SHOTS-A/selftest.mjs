import { chromium } from 'playwright-core'
import { analyzeStatic, analyzeReach } from './analyze.mjs'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await b.newPage({ viewport: { width: 393, height: 852 } })
await p.setContent(`<html><body style="margin:0;font:16px sans-serif"><main>
<div style="position:relative;height:60px"><span style="position:absolute;left:10px;top:10px">Overlapping text one</span><span style="position:absolute;left:40px;top:14px">second label here</span></div>
<div style="width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">A very long line of text that will be truncated with ellipsis for sure</div>
<div style="width:120px;overflow:hidden;white-space:nowrap">Cut without ellipsis text here</div>
<div style="width:500px;background:#eee">Wider than viewport</div>
<div style="height:1500px"></div>
<button style="height:40px">Last button</button>
</main><nav style="position:fixed;bottom:0;left:0;right:0;height:60px;background:#ccc">tabs</nav></body></html>`)
console.log(JSON.stringify(await p.evaluate(analyzeStatic, { scopeSel: null, full: true }), null, 1).slice(0, 2500))
console.log(JSON.stringify(await p.evaluate(analyzeReach, { scopeSel: null })))
await b.close()
