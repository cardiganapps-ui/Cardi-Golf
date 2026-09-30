#!/usr/bin/env node
// Build the private report page (full, unredacted) as one self-contained HTML file.
//   node build-page.mjs -> $S/page/polo-panel-review.html
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const S = path.resolve(new URL('..', import.meta.url).pathname)
const require = createRequire(path.join(S, 'page', 'package.json'))
const { marked } = require('marked')
marked.setOptions({ gfm: true, breaks: false })

const R = (f) => readFileSync(path.join(S, 'report', f), 'utf8')
const safeMd = (md) => md.replace(/<(?!\/?(details|summary|br)\b)/g, '&lt;')
const html = (md) => marked.parse(safeMd(md))
const strip = (md, re) => md.replace(re, '').trim()

const findings = JSON.parse(readFileSync(path.join(S, 'final', 'findings.json'), 'utf8')).map((f) => ({
  id: f.id, title: f.title, severity: f.severity, verdict: f.verdict, area: f.area, status: f.status, scope: f.scope ?? null,
  evidence: f.evidence, verification: f.verification ?? null, impact: f.impact, recommendation: f.recommendation,
  effort: f.effort, repro: f.repro ?? null, merged: f.merged_from ?? [], chair: f.chair_note ?? null, panelist: f.panelist,
}))
const cnt = (s) => findings.filter((f) => f.severity === s).length

const AREAS = [
  ['Correctness of rules and money', 15, 58, 'F', true],
  ['Security and privacy', 12, 67, 'D', false],
  ['Reliability, offline and realtime', 12, 46, 'F', true],
  ['Architecture and code quality', 8, 62, 'D', true],
  ['Data layer and database', 7, 60, 'D', true],
  ['Performance', 6, 62, 'D', false],
  ['Testing and delivery', 5, 60, 'D', false],
  ['Visual design and brand', 10, 60, 'D', false],
  ['Interaction design and core flows', 10, 54, 'F', true],
  ['Accessibility', 5, 64, 'D', false],
  ['Copy and voice (es-MX)', 3, 62, 'D', false],
  ['Mobile and PWA experience', 4, 64, 'D', false],
  ['Product coherence and strategy', 3, 63, 'D', false],
]

const summaryMd = strip(R('01-summary.md'), /^# .*\n+[^\n]*\n+/).replace('## 1. Executive summary', '').replace(/\*\*About this copy\.\*\*[^\n]*/, '')
const sections = [
  ['summary', '1. Executive summary', summaryMd],
  ['resumen', '2. Resumen para Diego', R('02-resumen.md').replace('## 2. Resumen para Diego', '')],
  ['scorecard', '3. Scorecard', R('03-scorecard.md').replace('## 3. Scorecard', '')],
  ['baseline', '4. Baseline', R('04-baseline.md').replace('## 4. Baseline', '').replace('@@CHUNKS@@', R('chunks-table.md'))],
  ['history', '5. Status of previous audits', R('05-history.md').replace('## 5. Status of previous audits', '')],
  ['findings', '6. Findings by area', null],
  ['enhancements', '7. Enhancement ideas by area', R('07-enhancements.md').replace('## 7. Enhancement ideas by area', '')],
  ['roadmap', '8. Roadmap', R('08-roadmap.md').replace('## 8. Roadmap', '')],
  ['excellent', '9. What is already excellent', R('09-excellent.md').replace('## 9. What is already excellent', '')],
  ['method', '10. Method', R('10-method.md').replace('## 10. Method', '')],
  ['appendix-a', 'Appendix A. Earlier findings', 'All 327 de-duplicated items from the earlier audits and documents, with the chair\'s corrections marked "(chair)".\n' + R('appendix-history.md')],
  ['appendix-b', 'Appendix B. Screenshots', 'The screenshots live in the repository under `docs/review/2026-09-30/shots/`, named `<route>-<fixture>-<device>-<theme>[-<state>].png`.\n\n' + R('shots-index.md')],
]

const areaRows = AREAS.map(([name, w, score, letter, capped]) => `
      <li class="area">
        <span class="area-name">${name}</span>
        <span class="area-weight">${w}%</span>
        <span class="bar" role="img" aria-label="${score} out of 100"><span class="fill grade-${letter}" style="width:${score}%"></span><span class="tick" style="left:69%" title="P0 cap 69"></span></span>
        <span class="area-score"><b>${score}</b> ${letter}${capped ? ' <em class="cap" title="Open P0: capped at 69">cap</em>' : ''}</span>
      </li>`).join('')

const nav = sections.map(([id, title]) => `<a href="#${id}">${title}</a>`).join('\n        ')
const body = sections.map(([id, title, md]) => md === null
  ? `<section id="${id}" class="doc-section findings-section">
      <h2>${title}</h2>
      <p class="lede"><b>${findings.length} findings</b>: ${cnt('P0')} P0, ${cnt('P1')} P1, ${cnt('P2')} P2, ${cnt('P3')} P3, after merging duplicates under their root cause. Every P0 and P1 was re-checked by an independent verifier; CONFIRMED means it was reproduced, PLAUSIBLE that the evidence holds but reproduction needs something unavailable in the review environment. This page carries the full evidence, including the security details withheld from the public repository copy.</p>
      <div class="controls" role="search">
        <div class="chips" id="sev-chips" aria-label="Severity">
          ${['P0', 'P1', 'P2', 'P3'].map((s) => `<button type="button" class="chip sev-${s}" aria-pressed="${s === 'P0' || s === 'P1'}" data-sev="${s}">${s} <span>${cnt(s)}</span></button>`).join('')}
        </div>
        <label class="field"><span>Area</span><select id="f-area"><option value="">All areas</option>${AREAS.map(([a]) => `<option>${a}</option>`).join('')}</select></label>
        <label class="field grow"><span>Search</span><input id="f-q" type="search" placeholder="ID, word or file (e.g. outbox, MONEY-01, Calcutta)" autocomplete="off"></label>
        <button type="button" id="f-expand" class="btn">Expand all</button>
      </div>
      <p class="result-count" id="f-count" aria-live="polite"></p>
      <div id="f-list"></div>
    </section>`
  : `<section id="${id}" class="doc-section">
      <h2>${title}</h2>
      ${html(md)}
    </section>`).join('\n')

const page = `<title>Polo Panel Review</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@90..100,400;90..100,500;90..100,600;90..100,700&family=Fraunces:opsz,wght@9..144,600&display=swap">
<style>
/* Layout: a scorecard you read top-down (verdict, area strip), then a ruled document with a sticky contents rail; findings are a filterable ruled list. Palette follows Polo's own "La tarjeta" direction. */
:root {
  --paper: #FBFAF7; --surface: #F3F1EA; --ink: #1B211D; --ink-2: #4F5751; --rule: #D8D5CB; --accent: #1E6B3B;
  --p0: #9D1C23; --p1: #8A4B00; --p2: #235380; --p3: #56615A;
  --p0-bg: #F6E3E3; --p1-bg: #F4E8D6; --p2-bg: #E2EAF3; --p3-bg: #E9ECE8;
  --f: #9D1C23; --d: #8A4B00; --c: #235380; --b: #1E6B3B;
  --font-body: "Archivo", "Helvetica Neue", Arial, system-ui, sans-serif;
  --font-display: "Fraunces", Georgia, "Times New Roman", serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #111512; --surface: #1A201C; --ink: #E8ECE7; --ink-2: #AAB4AD; --rule: #2C3530; --accent: #5DBB7E;
  --p0: #F2959A; --p1: #E6B26A; --p2: #93BCE8; --p3: #AAB4AD;
  --p0-bg: #3A1D1F; --p1-bg: #37291A; --p2-bg: #1B2A3A; --p3-bg: #242B26;
  --f: #F2959A; --d: #E6B26A; --c: #93BCE8; --b: #5DBB7E; color-scheme: dark } }
:root[data-theme="dark"] {
  --paper: #111512; --surface: #1A201C; --ink: #E8ECE7; --ink-2: #AAB4AD; --rule: #2C3530; --accent: #5DBB7E;
  --p0: #F2959A; --p1: #E6B26A; --p2: #93BCE8; --p3: #AAB4AD;
  --p0-bg: #3A1D1F; --p1-bg: #37291A; --p2-bg: #1B2A3A; --p3-bg: #242B26;
  --f: #F2959A; --d: #E6B26A; --c: #93BCE8; --b: #5DBB7E; color-scheme: dark }
* { box-sizing: border-box }
body { background: var(--paper); color: var(--ink); font: 15px/1.55 var(--font-body); padding-inline: 16px; padding-block: 0 64px }
a { color: var(--accent) }
a:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px }
.wrap { max-width: 1180px; margin: 0 auto }
header.top { padding-block: 32px 24px; border-bottom: 2px solid var(--ink); display: grid; gap: 20px }
.eyebrow { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); font-weight: 600 }
h1 { font-family: var(--font-display); font-weight: 600; font-size: clamp(30px, 5vw, 44px); line-height: 1.05; margin: 4px 0 0; text-wrap: balance }
.verdict { display: grid; grid-template-columns: auto 1fr; gap: 20px 28px; align-items: center }
.grade { font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: 10px }
.grade b { font-size: 64px; line-height: 1; font-weight: 700; font-stretch: 90% }
.grade span { font-size: 22px; color: var(--ink-2) }
.grade .letter { color: var(--f); font-weight: 700 }
.verdict p { margin: 0; max-width: 62ch }
.pills { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px }
.pill { font-size: 13px; font-weight: 600; padding: 3px 9px; border-radius: 999px; font-variant-numeric: tabular-nums }
.pill.P0 { background: var(--p0-bg); color: var(--p0) } .pill.P1 { background: var(--p1-bg); color: var(--p1) }
.pill.P2 { background: var(--p2-bg); color: var(--p2) } .pill.P3 { background: var(--p3-bg); color: var(--p3) }
.pill.no { background: var(--p0); color: var(--paper) }
.areas { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px }
.area { display: grid; grid-template-columns: minmax(0, 1.4fr) 44px minmax(90px, 1fr) 84px; gap: 12px; align-items: center; font-size: 14px }
.area-name { min-width: 0 }
.area-weight { color: var(--ink-2); text-align: right; font-variant-numeric: tabular-nums }
.bar { position: relative; height: 10px; background: var(--surface); border: 1px solid var(--rule); border-radius: 2px }
.fill { position: absolute; inset: 0 auto 0 0; border-radius: 1px }
.fill.grade-F { background: var(--f) } .fill.grade-D { background: var(--d) } .fill.grade-C { background: var(--c) } .fill.grade-B { background: var(--b) }
.tick { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--ink-2); opacity: .5 }
.area-score { font-variant-numeric: tabular-nums; white-space: nowrap }
.area-score b { font-size: 16px }
.cap { font-style: normal; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--p0); margin-left: 4px }
.layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 40px; margin-top: 28px }
nav.toc { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 16px); align-self: start; display: grid; gap: 2px; font-size: 14px; max-height: calc(100vh - 32px); overflow: auto }
nav.toc a { color: var(--ink-2); text-decoration: none; padding: 5px 8px; border-left: 2px solid transparent }
nav.toc a:hover { color: var(--ink); border-left-color: var(--rule) }
nav.toc .toc-title { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); font-weight: 600; padding: 0 8px 6px }
main { min-width: 0 }
.doc-section { padding-block: 8px 28px; border-bottom: 1px solid var(--rule) }
.doc-section h2 { font-size: 24px; line-height: 1.2; margin: 24px 0 12px; text-wrap: balance }
.doc-section h3 { font-size: 18px; margin: 26px 0 8px; text-wrap: balance }
.doc-section h4 { font-size: 16px; margin: 20px 0 6px }
.doc-section p, .doc-section li { max-width: 78ch }
.doc-section ul, .doc-section ol { padding-left: 1.3em }
.doc-section code { font-family: var(--font-mono); font-size: .88em; background: var(--surface); padding: 1px 4px; border-radius: 3px; overflow-wrap: anywhere }
.doc-section table { border-collapse: collapse; font-size: 13.5px; font-variant-numeric: tabular-nums; width: 100% }
.doc-section th, .doc-section td { border-bottom: 1px solid var(--rule); padding: 7px 10px 7px 0; text-align: left; vertical-align: top }
.doc-section th { font-size: 12px; letter-spacing: .03em; color: var(--ink-2); font-weight: 600; border-bottom: 2px solid var(--ink) }
.table-scroll { overflow-x: auto; max-width: 100% }
details > summary { cursor: pointer }
.lede { color: var(--ink-2) }
.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; padding: 14px 0; border-block: 1px solid var(--rule); position: sticky; top: env(safe-area-inset-top, 0px); background: var(--paper); z-index: 2 }
.chips { display: flex; gap: 6px; flex-wrap: wrap }
.chip { font: 600 13px var(--font-body); padding: 6px 11px; border-radius: 999px; border: 1.5px solid var(--rule); background: transparent; color: var(--ink-2); cursor: pointer; min-height: 36px }
.chip span { font-weight: 500; margin-left: 4px; font-variant-numeric: tabular-nums }
.chip[aria-pressed="true"].sev-P0 { background: var(--p0-bg); color: var(--p0); border-color: var(--p0) }
.chip[aria-pressed="true"].sev-P1 { background: var(--p1-bg); color: var(--p1); border-color: var(--p1) }
.chip[aria-pressed="true"].sev-P2 { background: var(--p2-bg); color: var(--p2); border-color: var(--p2) }
.chip[aria-pressed="true"].sev-P3 { background: var(--p3-bg); color: var(--p3); border-color: var(--p3) }
.field { display: grid; gap: 4px; font-size: 12px; color: var(--ink-2); font-weight: 600; min-width: 0 }
.field.grow { flex: 1 1 220px }
.field select, .field input { font: 15px var(--font-body); color: var(--ink); background: var(--surface); border: 1.5px solid var(--rule); border-radius: 6px; padding: 7px 9px; min-height: 38px; width: 100% }
.btn { font: 600 14px var(--font-body); padding: 8px 12px; border-radius: 6px; border: 1.5px solid var(--ink); background: transparent; color: var(--ink); cursor: pointer; min-height: 38px }
.result-count { font-size: 13px; color: var(--ink-2); margin: 10px 0 }
.area-group h3 { font-size: 17px; margin: 24px 0 4px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap }
.area-group h3 small { font-size: 13px; color: var(--ink-2); font-weight: 500 }
.finding { border-bottom: 1px solid var(--rule) }
.finding > summary { list-style: none; display: grid; grid-template-columns: auto auto minmax(0, 1fr); gap: 10px; align-items: baseline; padding: 11px 0 }
.finding > summary::-webkit-details-marker { display: none }
.fid { font: 600 13px var(--font-mono); color: var(--ink-2); white-space: nowrap }
.ftitle { min-width: 0 }
.fbody { padding: 0 0 16px; display: grid; gap: 10px; font-size: 14px }
.meta { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--ink-2); font-size: 13px }
.meta b { color: var(--ink); font-weight: 600 }
.verdict-tag.CONFIRMED { color: var(--b) } .verdict-tag.PLAUSIBLE { color: var(--d) }
.fbody h5 { margin: 4px 0 2px; font-size: 12px; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-2) }
.fbody ul { margin: 0; padding-left: 1.2em; display: grid; gap: 4px }
.fbody li, .fbody p { overflow-wrap: anywhere; margin: 0; max-width: 90ch }
.fbody pre { font: 12.5px/1.5 var(--font-mono); background: var(--surface); padding: 10px; border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 }
.empty { padding: 20px 0; color: var(--ink-2) }
@media (max-width: 960px) {
  .layout { grid-template-columns: minmax(0, 1fr) }
  nav.toc { position: static; max-height: none; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); border-bottom: 1px solid var(--rule); padding-bottom: 12px }
  .verdict { grid-template-columns: minmax(0, 1fr) }
}
@media (max-width: 560px) {
  .area { grid-template-columns: minmax(0, 1fr) 70px; row-gap: 2px }
  .area-weight { display: none }
  .bar { grid-column: 1 / -1; order: 3 }
  .controls { position: static }
  .finding > summary { grid-template-columns: auto minmax(0, 1fr) }
  .finding > summary .fid { grid-column: 2 }
  .finding > summary .ftitle { grid-column: 1 / -1 }
}
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important } }
</style>

<div class="wrap">
  <header class="top">
    <div>
      <div class="eyebrow">Deep panel review, 30 September 2026, commit 379ed52 (= production)</div>
      <h1>Polo panel review</h1>
    </div>
    <div class="verdict">
      <div class="grade" aria-label="Overall grade 59 out of 100, F"><b>59</b><span>/100</span><span class="letter">F</span></div>
      <div>
        <p><b>Not ready for Los Cabos today.</b> Ready with conditions if every P0 is fixed by 15 Nov 2026, the trip-critical P1s by 31 Jan 2027, and two rehearsals with twelve real phones pass (13–14 Feb and 13–14 Mar 2027). The rules engine and the tenant boundary already meet the flagship bar; live updates, the settlement and the Comité forms do not.</p>
        <div class="pills"><span class="pill no">Launch: not ready</span><span class="pill P0">${cnt('P0')} P0</span><span class="pill P1">${cnt('P1')} P1</span><span class="pill P2">${cnt('P2')} P2</span><span class="pill P3">${cnt('P3')} P3</span></div>
      </div>
    </div>
    <ol class="areas" aria-label="Area grades">${areaRows}
    </ol>
  </header>
  <div class="layout">
    <nav class="toc" aria-label="Contents">
      <div class="toc-title">Contents</div>
        ${nav}
    </nav>
    <main>
${body}
    </main>
  </div>
</div>
<script id="findings-data" type="application/json">${JSON.stringify(findings).replace(/</g, '\\u003c')}</script>
<script>
(() => {
  const data = JSON.parse(document.getElementById('findings-data').textContent);
  const AREAS = ${JSON.stringify(AREAS.map((a) => a[0]))};
  const RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const list = document.getElementById('f-list');
  const count = document.getElementById('f-count');
  const q = document.getElementById('f-q');
  const areaSel = document.getElementById('f-area');
  const chips = [...document.querySelectorAll('#sev-chips .chip')];
  let expandAll = false;
  const state = () => ({ sev: new Set(chips.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.dataset.sev)), area: areaSel.value, q: q.value.trim().toLowerCase() });
  const card = (f) => \`<details class="finding" id="\${esc(f.id)}"\${expandAll ? ' open' : ''}>
      <summary><span class="pill \${f.severity}">\${f.severity}</span><span class="fid">\${esc(f.id)}</span><span class="ftitle">\${esc(f.title)}</span></summary>
      <div class="fbody">
        <div class="meta"><span class="verdict-tag \${esc(f.verdict)}"><b>\${esc(f.verdict)}</b></span><span>Status: <b>\${esc(f.status)}</b></span><span>Effort: <b>\${esc(f.effort)}</b></span>\${f.scope ? \`<span>Scope: <b>\${esc(f.scope)}</b></span>\` : ''}\${f.merged.length ? \`<span>Merged: <b>\${esc(f.merged.join(', '))}</b></span>\` : ''}<span>From: <b>\${esc(f.panelist)}</b></span></div>
        <div><h5>Evidence</h5><ul>\${(f.evidence || []).map((e) => \`<li>\${esc(e)}</li>\`).join('')}</ul></div>
        \${f.verification ? \`<div><h5>Verification</h5><p>\${esc(f.verification)}</p></div>\` : ''}
        \${f.chair ? \`<div><h5>Chair</h5><p>\${esc(f.chair)}</p></div>\` : ''}
        <div><h5>Impact</h5><p>\${esc(f.impact)}</p></div>
        <div><h5>Recommendation</h5><p>\${esc(f.recommendation)}</p></div>
        \${f.repro ? \`<div><h5>Reproduce</h5><pre>\${esc(f.repro)}</pre></div>\` : ''}
      </div>
    </details>\`;
  function render() {
    const s = state();
    const hit = data.filter((f) => s.sev.has(f.severity) && (!s.area || f.area === s.area) && (!s.q || (f.id + ' ' + f.title + ' ' + (f.evidence || []).join(' ') + ' ' + f.impact + ' ' + f.recommendation).toLowerCase().includes(s.q)));
    count.textContent = hit.length + ' of ' + data.length + ' findings shown';
    if (!hit.length) { list.innerHTML = '<p class="empty">No finding matches. Turn on more severities or clear the search.</p>'; return; }
    list.innerHTML = AREAS.map((a) => {
      const g = hit.filter((f) => f.area === a).sort((x, y) => RANK[x.severity] - RANK[y.severity] || x.id.localeCompare(y.id, 'en', { numeric: true }));
      if (!g.length) return '';
      return \`<div class="area-group"><h3>\${esc(a)} <small>\${g.length} shown</small></h3>\${g.map(card).join('')}</div>\`;
    }).join('');
  }
  chips.forEach((c) => c.addEventListener('click', () => { c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); render(); }));
  areaSel.addEventListener('change', render);
  q.addEventListener('input', render);
  document.getElementById('f-expand').addEventListener('click', (e) => { expandAll = !expandAll; e.currentTarget.textContent = expandAll ? 'Collapse all' : 'Expand all'; render(); });
  document.querySelectorAll('.doc-section table').forEach((t) => { const w = document.createElement('div'); w.className = 'table-scroll'; t.parentNode.insertBefore(w, t); w.appendChild(t); });
  render();
  const h = location.hash.slice(1);
  if (h) {
    const f = data.find((x) => x.id === h);
    if (f) { chips.forEach((c) => { if (c.dataset.sev === f.severity) c.setAttribute('aria-pressed', 'true'); }); render(); const el = document.getElementById(h); if (el) { el.open = true; el.scrollIntoView(); } }
  }
})();
</script>
`
writeFileSync(path.join(S, 'page', 'polo-panel-review.html'), page)
console.log(`page: ${(Buffer.byteLength(page) / 1024).toFixed(0)} KB, findings ${findings.length}`)
