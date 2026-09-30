// Contrast matrix of the design tokens, plus glare simulations.
import fs from 'node:fs'
const css = fs.readFileSync('/home/user/Cardi-Golf/src/styles/tokens.css', 'utf8')
const tok = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]))
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16) / 255)
const L = (h) => {
  const [r, g, b] = rgb(h).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const cr = (a, b) => {
  const [x, y] = [L(a), L(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
// CSS filter contrast(c) brightness(b) applied in sRGB space per channel (as Chromium does), then contrast.
const hex = (arr) => '#' + arr.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')
const filt = (h, c = 0.6, b = 1.2) => hex(rgb(h).map((v) => ((v - 0.5) * c + 0.5) * b))
// Physical glare: reflected ambient light adds the same luminance G to both colours.
const glare = (a, b, G) => {
  const [x, y] = [L(a), L(b)]
  return (Math.max(x, y) + 0.05 + G) / (Math.min(x, y) + 0.05 + G)
}
const f2 = (n) => n.toFixed(2)
const pairs = [
  // [label, fg, bg, textSize, role]
  ['ink on bg', 'ink', 'bg', 'any', 'body, figures'],
  ['ink-2 on bg', 'ink-2', 'bg', 'any', 'secondary text, today/thru/pos figures'],
  ['ink-2 on surface', 'ink-2', 'surface', 'any', 'secondary on ruled panels, grid subtotal pts'],
  ['ink-2 on accent-soft (my row)', 'ink-2', 'accent-soft', 'any', 'today/thru/pos on MY row'],
  ['ink-2 on surface-2 (white)', 'ink-2', 'surface-2', 'any', 'field labels, stepper par value'],
  ['ink-3 on bg', 'ink-3', 'bg', 'any', 'untouched pts badge, pickup L, missing –, disabled'],
  ['ink-3 on surface', 'ink-3', 'surface', 'any', 'disabled buttons/inputs'],
  ['under on bg', 'under', 'bg', 'any', 'under-par figures, errors, negative money'],
  ['under on surface', 'under', 'surface', 'any', 'under-par on ruled/locked rows'],
  ['under on accent-soft (my row)', 'under', 'accent-soft', 'any', 'under-par figure on MY row'],
  ['under on under-soft', 'under', 'under-soft', 'any', 'alert cards'],
  ['over on bg', 'over', 'bg', 'any', 'over-par figures'],
  ['over on accent-soft (my row)', 'over', 'accent-soft', 'any', 'over-par figure on MY row'],
  ['caution on bg', 'caution', 'bg', 'any', 'pending/unsigned, sync warn'],
  ['caution on caution-soft', 'caution', 'caution-soft', 'any', 'chip--sun'],
  ['accent on bg', 'accent', 'bg', 'any', 'links, quiet buttons'],
  ['accent on accent-soft', 'accent', 'accent-soft', 'any', 'chip--teal, current hole button'],
  ['accent-ink(white) on accent', 'accent-ink', 'accent', 'any', 'primary button'],
  ['board-ink on board-bg', 'board-ink', 'board-bg', 'any', 'TV/Ceremonia figures'],
  ['board-ink-2 on board-bg', 'board-ink-2', 'board-bg', 'any', 'TV secondary'],
  ['board-ink-2 on board-surface', 'board-ink-2', 'board-surface', 'any', 'TV secondary on plates'],
  ['board-accent on board-bg', 'board-accent', 'board-bg', 'any', 'leader plate / live mark'],
  ['board-under on board-bg', 'board-under', 'board-bg', 'any', 'TV under par / negatives'],
  ['board-over on board-bg', 'board-over', 'board-bg', 'any', 'TV over par'],
  ['board-rule on board-bg (disabled btn text)', 'board-rule', 'board-bg', 'any', 'Ceremonia disabled button text'],
  ['on-dark(board-ink) on surface-2 (Ceremonia Siguiente)', 'board-ink', 'surface-2', 'any', 'Ceremonia "Siguiente" label'],
  ['ink (focus ring) on board-bg', 'ink', 'board-bg', 'nontext', 'focus outline on TV/Ceremonia/deep cards'],
  ['rule-2 on bg (control borders)', 'rule-2', 'bg', 'nontext', 'input/stepper/segmented borders'],
  ['rule-2 on surface-2 (control borders)', 'rule-2', 'surface-2', 'nontext', 'stepper/segmented border on white'],
  ['rule on bg (hairlines)', 'rule', 'bg', 'nontext', 'row rules, grid lines'],
  ['rule-2 on bg (toggle track off)', 'rule-2', 'bg', 'nontext', 'toggle off state'],
  ['surface-2 knob on rule-2 track', 'surface-2', 'rule-2', 'nontext', 'toggle knob off'],
  ['accent on bg (toggle on)', 'accent', 'bg', 'nontext', 'toggle on state'],
]
const rows = []
for (const [label, fg, bg, kind, role] of pairs) {
  const a = tok[fg] ?? fg
  const b = tok[bg] ?? bg
  const c = cr(a, b)
  const cf = cr(filt(a), filt(b))
  rows.push({ label, fg: `${fg} ${a}`, bg: `${bg} ${b}`, ratio: f2(c), aa: kind === 'nontext' ? (c >= 3 ? 'pass 3:1' : 'FAIL 3:1') : c >= 4.5 ? 'pass' : c >= 3 ? 'large only' : 'FAIL', aaa: kind === 'nontext' ? '' : c >= 7 ? 'pass' : c >= 4.5 ? 'large only' : 'FAIL', filter_contrast06_bright12: f2(cf), glare_G0_1: f2(glare(a, b, 0.1)), glare_G0_25: f2(glare(a, b, 0.25)), role })
}
console.table(rows.map((r) => ({ pair: r.label, ratio: r.ratio, AA: r.aa, AAA: r.aaa, 'filter .6/1.2': r.filter_contrast06_bright12, 'glare .10': r.glare_G0_1, 'glare .25': r.glare_G0_25 })))
// Event accents: white text on accent (primary button) and accent as a 3:1 non-text mark on bg
const acc = { fairway: '#1e6b3b', agua: '#2b5b8c', atardecer: '#b4532a', vino: '#8a2e3a', pizarra: '#3f4a54', arena: '#7a5a2e' }
const accRows = Object.entries(acc).map(([k, v]) => ({ accent: k, hex: v, 'white on it': f2(cr('#ffffff', v)), 'on bg (mark)': f2(cr(v, tok.bg)), 'white on it, glare .25': f2(glare('#ffffff', v, 0.25)), 'filter .6/1.2': f2(cr(filt('#ffffff'), filt(v))) }))
console.table(accRows)
fs.writeFileSync(new URL('./contrast.json', import.meta.url), JSON.stringify({ rows, accRows, tokens: tok }, null, 1))
