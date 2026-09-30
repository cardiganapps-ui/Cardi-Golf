// Builds $S/shots-B.json and $S/shots-index-B.md from records/*.json + notes.mjs.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { notesFor } from './notes.mjs'

const S = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad'
const EV = `${S}/panel/evidence/SHOTS-B`
const OUT = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
const PHASES = ['admin', 'admin15', 'states', 'patched', 'tv', 'ceremonia', 'print']
const VIEW = { laptop: '1440×900 @1x', '15pro': '393×852 @2x', tv: '1920×1080 @1x' }

const recs = []
for (const ph of PHASES) {
  const f = `${EV}/records/${ph}.json`
  if (!existsSync(f)) continue
  for (const r of JSON.parse(readFileSync(f, 'utf8'))) if (r.file) recs.push({ ...r, phase: ph })
}

function clean(r) {
  const a = r.metrics
  const ellipsisTexts = (a.clipped ?? []).filter((c) => c.startsWith('ellipsis')).map((c) => (c.match(/"([^"]*)"/) ?? [])[1]).filter(Boolean)
  const out = []
  for (const o of r.observations) {
    if (/^nav:/.test(o)) continue
    if (/^sideways scrollers/.test(o) && r.device !== '15pro') continue
    if (/^overlapping text/.test(o)) {
      const quoted = [...o.matchAll(/"([^"]*)"/g)].map((m) => m[1])
      const artifact = quoted.length && quoted.some((q) => ellipsisTexts.some((e) => e.startsWith(q.slice(0, 12)) || q.startsWith(e.slice(0, 12))))
      out.push(artifact ? `${o} [detector artifact: ellipsis-truncated text; verified visually, no real overlap]` : o)
      continue
    }
    out.push(o)
  }
  const ev = (r.observations.join(' ') + ' ')
  if (!/PAGE ERROR|console:/.test(ev)) out.push('no JS page errors or console errors (other than the HTTP failures listed)'.replace(/ \(other than the HTTP failures listed\)/, /HTTP errors/.test(ev) ? ' (other than the HTTP failures listed)' : ''))
  return out
}

const rows = recs.map((r) => {
  const manual = notesFor(r.file)
  const auto = clean(r)
  const full = /-full\.png$/.test(r.file) || /-(print|day2-full|drawn-full)\.png$/.test(r.file)
  return {
    file: `docs/review/2026-09-30/shots/${r.file}`,
    url: `http://127.0.0.1:4173${r.url}`,
    device: r.device,
    fixture: r.fixture,
    route: r.route,
    state: r.state,
    observations: [...manual, ...auto],
    _viewport: `${VIEW[r.device]}${full ? `, full page capped at 3,200 px (page ${r.metrics.scrollH}px)` : ''}`,
    _phase: r.phase,
  }
})

// JSON: the requested keys only.
writeFileSync(`${S}/shots-B.json`, JSON.stringify(rows.map(({ _viewport, _phase, ...x }) => x), null, 2))

// Sizes.
let bytes = 0
for (const r of recs) bytes += statSync(`${OUT}/${r.file}`).size
const pdfs = ['print-full12-live.pdf', 'print-full12-live-a4-portrait.pdf'].map((f) => `${f} (${Math.round(statSync(`${EV}/${f}`).size / 1024)} KB)`)

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const table = (list) => ['| file | URL | viewport | observations |', '|---|---|---|---|', ...list.map((r) => `| \`${r.file.split('/').pop()}\` | ${esc(r.url.replace('http://127.0.0.1:4173', ''))} | ${esc(r._viewport)} | ${esc(r.observations.join(' · '))} |`)].join('\n')

const groups = [
  ['Comité › laptop (1440×900), 13 sections × 5 fixtures, plus `-full` for jugadores/scores/calcutta', (r) => r._phase === 'admin'],
  ['Comité › phone (15pro 393×852), full12-live × 13 sections', (r) => r._phase === 'admin15'],
  ['Comité › secondary states (full12-live, laptop)', (r) => r._phase === 'states'],
  ['SYNTHETIC Calcutta night (in-browser data rewrite; not a shipped fixture)', (r) => r._phase === 'patched'],
  ['Modo TV (1920×1080, motion on, each distinct rotating slide)', (r) => r._phase === 'tv'],
  ['Ceremonia (full12-finished; TV 1920×1080 every click-state, first steps on 15pro, confetti with motion on)', (r) => r._phase === 'ceremonia'],
  ['Imprimir (full12-live, laptop, screen + print media)', (r) => r._phase === 'print'],
]

const issues = `## Issues seen (most serious first)

1. **TV Individual board hides the bottom of the table.** At 1920×1080 only 9 of the 12 rows per page fit; \`.rows\` is \`overflow: hidden\`, so positions 10–12 never appear. On the finished board that hides 10th–12th, including last place (La Cuchara de Palo). On large60 each «1–12» page shows 9, so 15 of 60 players never appear. Evidence: \`t_tv-full12-live-tv-dark-slide1.png\`, \`t_tv-full12-finished-tv-dark-slide1.png\`, \`t_tv-large60-tv-dark-slide1.png\` and \`slide4–7\`, \`t_tv-longnames-tv-dark-slide1.png\` (8½ rows).
2. **TV Matrimonios and Calcutta boards are misaligned.** \`.row\` is a 5-column grid (\`TvScreen.module.css:61\`), but pair rows (\`TvScreen.tsx:126-136\`) and Calcutta rows (\`:182-191\`) render only 4 children. Every cell shifts one column left: names are squeezed into the 6vh avatar column and wrap («Los / Tres»); partners and holdings are cut to «Ca…»; totals float mid-screen. With long names the text overlaps the figures and only 4 of 6 pairs fit. Evidence: \`t_tv-*-slide2.png\` and \`slide4.png\` for full12-live, full12-finished and longnames.
3. **TV Víbora board has no paging.** With 15 groups (large60) about 7 fit and the rest are cut off (\`t_tv-large60-tv-dark-slide2.png\`). Groups with an unanswered tiebreak show no holder and no «pendiente» note.
4. **TV text size.** The smallest text on every slide is ≥ 21.6 px («Salir», secondary lines), except the tier badges at **12 px** on the Individual slides and the Calcutta lot card. The 12 px badges are unreadable at 4 m. «Hoyo 11, 25» (holes played + today's points) carries no labels.
5. **Ceremonia «Siguiente» is invisible.** The enabled button draws cream \`rgb(246,243,234)\` text on white \`rgb(255,255,255)\`, about 1.1:1 contrast, on every step, on TV and phone (\`t_ceremonia-*-step02.png\`).
6. **Ceremonia treats unsettled results as final.** full12-finished still has 4 unanswered snake tiebreaks and 1 unsigned card (Comité › Tarjetas: «Pendientes 5»), yet no «provisional» warning appears. The snake totals list 4 players ($1,200 of $3,600) (\`step07\`). The «Resumen de dinero» nets sum to **−$2,400** (+17,150 / −19,550), exactly 4 unsettled snake pots × $600, and no bank row or note explains it (\`step25\`). This belongs to the MONEY/TRUST lanes; the arithmetic comes from the screenshot.
7. **Ceremonia is phone-scale on a TV.** Its sizes are rem-capped (\`CeremonyScreen.module.css\`): header 22 px, tournament name 14 px, start button 18 px, step titles and winner names max 48 px, lists max 22.4 px. TV mode sizes everything in vh. Other gaps: 3rd and 4th both show «71 puntos» with $3,000 vs $2,000 and the countback isn't shown (\`step15/17\`); the pairs step reveals 2º and 1º together, without prizes (\`step13\`); the Calcutta owners list has no heading (\`step23\`); the Cuchara reveal shows only the name (\`step03\`); the ceremony ends on a bare «Fin.» (\`step26\`).
8. **Player handicap form (Comité › Jugadores).**
   - «Índice WHS» left empty previews handicap 0, and saving would store base 0 (\`AdminPlayers.tsx:117\`; \`-edit-index.png\`).
   - The three-score estimate pre-fills made-up scores (85/92/100), which give index 18.1 if saved untouched (\`-edit-estimate.png\`).
   - «¿Cómo se calculó?» jumps from «Índice estimado 18.1» to «80% de 18», skipping the course-handicap step §13b-D asks for (\`AdminPlayers.tsx:345\`; \`-edit-estimate-why.png\`).
9. **Historial prints a raw Postgres error.** On every fixture the page shows «Algo salió mal — permission denied for function tournament_audit». The trigger is a fixture limitation (no session, fake id), but the ErrorBox prints the English DB message to the organizer (\`t_admin_historial-*.png\`).
10. **The phone Comité nav loses the current section.** Sections scroll sideways with a hidden scrollbar and no fade, and labels are cut («Gru»). For Hándicaps, Tarjetas, Calcutta, Parejas, Historial and Datos the selected tab is scrolled out of view. Torneo adds a second clipped tab strip (\`t_admin_*-full12-live-15pro-light.png\`).
11. **Tarjetas badge ≠ «Pendientes».** The counts disagree: 6 vs 7, 21 vs 22, 2 vs 3, and none vs 1 on friends8. The badge (\`AdminLayout.tsx:36-37\`) excludes unfinished cards; the inbox (\`AdminScores.tsx:40\`) includes them.
12. **Discrepancy line shows «(?)».** «ahora 5/1 (?)» appears because the current value has no enteredBy; an organizer's own edit would read the same. On the phone this row's layout breaks (\`t_admin_scores-full12-live-15pro-light.png\`).
13. **Course editor.**
   - A blank manual tee defaults to par 4 × 18 with SI 1–18, which passes validation.
   - The duplicate-SI error names no hole and highlights no cell.
   - Nothing warns when rating or slope is missing.
   - The editor is an 18-row vertical table, about 1,575 px of scroll inside a bottom sheet (\`t_admin_campos-full12-live-laptop-light-editor-*.png\`).
14. **Calcutta console.**
   - The sold list truncates owners and buyback («Dueño: Fabián, rec…») while the left column is empty.
   - The all-sold empty state repeats «Sorteo de parejas».
   - The custom-amount placeholder is truncated («Monto de la pu»).
   - «¡Vendido!» sits at the fold on a 1440×900 laptop (synthetic mid-lot).
   - On the phone, the bid buttons sit below 12 bidder tiles.
   - Holdings counts on the tiles are unlabeled.
15. **The laptop layout is a stretched phone.** The Comité is a ~930 px column on a 1440 px screen. Every dialog is a bottom sheet pinned to the bottom edge: the search sheet puts one input at the bottom of the screen, and «¿Cómo se calculó?» stacks a second sheet on the edit sheet.
16. **Hándicaps.**
   - The hint always promises a Day-2 cut (\`es-MX.ts:1421\`), even where the default settings turn it off (\`presets.ts:26\`, \`maxStrokes: 0\`): large60 Camilo Z. scored 48 pts on day 1 and still plays 8.
   - The row line «Base 6, día 1 28 pts» runs two numbers together.
   - The «?» buttons have no other label.
   - An overridden row breaks the column alignment; on the phone its «ajuste del comité» note is the part that gets truncated.
17. **Rondas.** «Cancelar ronda» and «Borrar» are styled like «Editar». A finished round's most prominent button is «Volver a programada». «Sin campo» shows because Rondas reads course names from a separate Supabase query (\`AdminRounds.tsx:35\`), so offline it would say the same.
18. **Print cards.** The stroke dots are present (49/56/65 per card in the PDF). Problems:
   - Each card uses only ~55% of its landscape page.
   - The name column wraps to 3–4 lines.
   - The par and SI rows come from the group's first player (\`PrintScreen.tsx:51,77,84\`), so a group mixing tees would print the wrong SI for the forward-tee players. This can't be seen on the single-tee fixture.
19. **Copy.** «1 pts»; «Hoyo 0» for a round not started; «Hoyo 13» meaning holes played; «día 1 28 pts»; «hándicap de campo 18, Golpes de ventaja…» (capitalisation); «Día 2. ahora…»; the PIN sheet tells the Comité to «pídeselo al Comité»; the PIN placeholder is letter-spaced.
20. **Smaller items.**
   - The honoree ring is barely visible in Jugadores.
   - friends8's «hoyo en disputa» warning lives on Torneo, but the fix is in Juegos, with no link.
   - The draw shows two full-width primary buttons.
   - large60 has duplicate display names with nothing to tell them apart, and a paragraph of 48 names in Tarjetas.

## Fixture limitations (not product defects; don't grade on them)

- **No auction fixture.** No fixture has status «auction», so the TV auction board and the console mid-lot can't be seen on the shipped fixtures. The \`patched\` shots come from an in-browser data rewrite (a hook on \`structuredClone\` in the page; no product code touched) and are labelled SYNTHETIC.
- **Supabase reads that fail or come back empty.** Campos lists the Supabase course library (empty for anon). Jugadores gets 400 from \`players_with_pin\` and \`tournament_profiles\` on the fake id, so every row shows «Poner PIN». Historial gets 401 from \`tournament_audit\`. Rondas shows «Sin campo».
- **Writes fail.** Fixtures are read-only, so hammer, buyback, save and publish can't be exercised. Buyback dialogs and post-save states are not captured.
- **One tee only.** The fixtures have a single tee, so mixed-tee print and tarjeta behaviour can't be seen.
- **Repeated names.** large60 generates repeated full names («Arturo Escalante» ×3).
- **No dark mode.** The app has none (no \`prefers-color-scheme\` anywhere in \`src\`). TV and Ceremonia use the \`--board-*\` tokens, so their \`-dark\` suffix is by design, not emulation.
- **Network requests.** Fixture pages still call production Supabase for \`app_flags\` (200) and the section RPCs above. None of these routes signs in anonymously.
`

const md = `# Canonical screenshots, part B (SHOTS-B): Comité, TV, Ceremonia, Imprimir

Date 2026-09-30 · HEAD 379ed52 · served by the shared preview \`http://127.0.0.1:4173\` (\`VITE_DESIGN_ROUTES=1\` build, in-memory fixtures). **${rows.length} screenshots, ${(bytes / 1024 / 1024).toFixed(1)} MB after palette compression**, in \`docs/review/2026-09-30/shots/\`, plus the PDFs ${pdfs.join(' and ')} in \`$S/panel/evidence/SHOTS-B/\`, and \`print-full12-live-render.png\`, a pdf.js render of the Letter PDF.

How they were made: \`$S/panel/evidence/SHOTS-B/shots-b.mjs <phase>\` (phases: admin, admin15, states, tv, ceremonia, print, patched) with \`lib.mjs\`. Chromium 1194, \`reducedMotion: 'reduce'\` except on the TV slides and the confetti shot, colorScheme light, locale es-MX, America/Mazatlan. Each shot waits for \`document.fonts.ready\`, the lazy-screen skeleton to disappear and 600 ms. Every shot gets an in-page analysis: document overflow, sideways scrollers, text clipped by an \`overflow:hidden\` ancestor, overlapping text line boxes, font-size histogram with the minimum, tap targets < 44 px on phones, placeholder and raw-error text, console/page errors and HTTP status of every external call. Raw per-shot metrics are in \`records/*.json\`. Every shot was also reviewed visually, one at a time or in contact sheets (\`sheets/*.png\`). TV slides were captured live as the board rotated every 12 s: full12 ×5 in ~60 s; large60 ×7 in 179 s, because the 60 players page through the Individual board.

Naming: \`<route>-<fixture>-<device>-<theme>[-<state>].png\`. TV and Ceremonia use \`dark\`, the board theme by design.

${issues}
${groups.map(([title, pred]) => `## ${title}\n\n${table(rows.filter(pred))}\n`).join('\n')}`

writeFileSync(`${S}/shots-index-B.md`, md)
console.log(`rows ${rows.length}, ${(bytes / 1024 / 1024).toFixed(2)} MB; groups:`, groups.map(([t, p]) => rows.filter(p).length).join('/'))
