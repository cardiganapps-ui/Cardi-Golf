#!/usr/bin/env node
// Assemble REPORT.md (public-safe) and REPORT.full.md (private) from the report parts.
//   node assemble.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const S = path.resolve(new URL('..', import.meta.url).pathname)
const R = (f) => readFileSync(path.join(S, 'report', f), 'utf8')
const node = (...a) => execFileSync('node', a, { encoding: 'utf8' })

// Findings sections, rendered from each variant.
node(path.join(S, 'tools', 'render-findings.mjs'), path.join(S, 'final', 'findings.json'), path.join(S, 'report', '06-findings.full.md'))
node(path.join(S, 'tools', 'render-findings.mjs'), path.join(S, 'final', 'findings.public.json'), path.join(S, 'report', '06-findings.public.md'))
node(path.join(S, 'tools', 'render-history.mjs'), path.join(S, 'report', 'appendix-history.md'))

const findings = JSON.parse(readFileSync(path.join(S, 'final', 'findings.json'), 'utf8'))
const count = (sev) => findings.filter((f) => f.severity === sev).length
const verified = findings.filter((f) => (f.severity === 'P0' || f.severity === 'P1') && f.verification).length
const intro = (pub) => `## 6. Findings by area

**${findings.length} findings**: **${count('P0')} P0**, **${count('P1')} P1**, ${count('P2')} P2, ${count('P3')} P3. They come from ${
  findings.length + findings.reduce((n, f) => n + (f.merged_from?.length ?? 0), 0)
} raw findings (325 from the panel, 2 from the chair) after merging duplicates under their root cause («Merged»). Every P0 and P1 was re-checked by an independent verifier (${verified} carry a Verification line; the rest were re-checked by the chair and a second agent, as noted). CONFIRMED means the verifier reproduced it; PLAUSIBLE means the evidence holds but reproduction needs something unavailable here. Within each area, findings run P0 first. P0/P1 are shown in full; P2/P3 are condensed. The complete record of every finding (all evidence, reproduction steps, merged duplicates) is in \`findings.json\`.${
  pub ? ' Sixteen security-sensitive findings are listed with their severity and fix, but their evidence and reproduction are withheld from this public copy (CHAIR-02) and kept in the private report.' : ''
}
`
const chunks = R('chunks-table.md')
const baseline = R('04-baseline.md').replace('@@CHUNKS@@', chunks)

const shotsIndex = `## Appendix B. Screenshot index

Files are in \`shots/\`, named \`<route>-<fixture>-<device>-<theme>[-<state>].png\`. The route is the URL path with \`/\` turned into \`_\` (\`t_tarjeta\` = \`/t/<slug>/tarjeta\`, \`t_admin_calcutta\` = \`/t/<slug>/admin/calcutta\`). Devices: \`se\` 375×667, \`15pro\` 393×852, \`android\` 412×915 (phones at 2×), \`ipad\` 1024×1366, \`laptop\` 1440×900, \`tv\` 1920×1080 (1×). Fixtures are the in-memory states in \`src/dev/fixtures.ts\` plus \`prod\` (production, read-only) and \`ensayo\` (the rehearsal tournament). Suffixes name a state (\`-sheet\`, \`-grid\`, \`-step03\`, \`-slide2\`) or the panelist who took the shot (\`-vis-\`, \`-ux-\`, \`-a11y-\`, \`-pwa-\`, \`-rel-\`, \`-copy-\`, \`-trust-\`, \`-strat-\`, \`-qa-\`); \`-patched\` and \`-synthetic\` mark a fixture changed in the browser only, to show a state no fixture has (auction mid-lot, pairs draw).

@@SHOTS@@
`
const shotsTable = R('shots-index.md')

function build(pub) {
  let history = R('05-history.md')
  let appendix = R('appendix-history.md')
  if (pub) {
    history = history
      .replace(/- \*\*AUD-P1-29 \(PIN lockout\)\.\*\*[^\n]*/, '- **AUD-P1-29 (PIN lockout).** The lock now resets, but the lockout can still be triggered against other players → SEC-04 (details in the private report).')
      .replace(/- \*\*AUD-P1-39 \(roster by slug\)\.\*\*[^\n]*/, '- **AUD-P1-39 (roster by slug).** An anonymous lookup still returns more of the roster than the join step needs → SEC-06.')
    appendix = appendix
      .split('\n')
      .map((l) => (/^\| AUD-P1-29 \|/.test(l) ? '| AUD-P1-29 | P1 | **partly fixed** (chair) | PIN lockout never reset, and any visitor could lock every player out from Entrar. | The lock now resets; the lockout can still be triggered against other players (SEC-04; details withheld from the public copy, CHAIR-02). |' : l))
      .map((l) => (/^\| AUD-P1-39 \|/.test(l) ? '| AUD-P1-39 | P1 | partly fixed | `public._migrations` had no RLS; lookup_tournament exposed more of the roster than needed. | `_migrations` fixed (0010); the anonymous lookup still returns more of the roster than the join step needs (SEC-06; details withheld from the public copy, CHAIR-02). |' : l))
      .join('\n')
  }
  const parts = [
    R('01-summary.md'),
    R('02-resumen.md'),
    R('03-scorecard.md'),
    baseline,
    history,
    intro(pub) + R(pub ? '06-findings.public.md' : '06-findings.full.md'),
    R('07-enhancements.md'),
    R('08-roadmap.md'),
    R('09-excellent.md'),
    R('10-method.md'),
    `## Appendix A. Status of every earlier finding\n\nAll ${'327'} de-duplicated items from the earlier audits and documents, with the chair's corrections marked "(chair)". Fixed items are condensed; the full mapper output is summarized in §5.\n` + appendix,
    shotsIndex.replace('@@SHOTS@@', shotsTable),
  ]
  let md = parts.map((p) => p.trim()).join('\n\n') + '\n'
  if (!pub) md = md.replace('**About this copy.** The repository is public (CHAIR-02), so the reproduction details of security-sensitive findings are withheld from this committed copy and kept in the private report page. Every finding is still listed with its severity, verdict and fix.', '**About this copy.** This is the complete report, including the reproduction details of security-sensitive findings. The copy committed to the public repository withholds those details (CHAIR-02).')
  return md
}
const pubMd = build(true)
const fullMd = build(false)
writeFileSync(path.join(S, 'report', 'REPORT.md'), pubMd)
writeFileSync(path.join(S, 'report', 'REPORT.full.md'), fullMd)
for (const [n, md] of [['REPORT.md', pubMd], ['REPORT.full.md', fullMd]]) {
  console.log(n, `${(Buffer.byteLength(md) / 1024).toFixed(0)} KB`, 'mentions 1234:', (md.match(/\b1234\b/g) ?? []).length, 'email:', (md.match(/gaxiola/gi) ?? []).length)
}
