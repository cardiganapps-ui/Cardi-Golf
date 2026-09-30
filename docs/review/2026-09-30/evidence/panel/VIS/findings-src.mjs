// Source of truth for VIS findings; `node findings-src.mjs` writes $S/panel/VIS.findings.json
import fs from 'node:fs'
const S = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad'
const E = S + '/panel/evidence/VIS'
const SH = 'docs/review/2026-09-30/shots/'
const F = []
const add = (f) => F.push({ id: `VIS-${String(F.length + 1).padStart(2, '0')}`, ...f })

add({
  title: "Money screens are laid out as ragged staircases: on Juegos › La Calcutta (15/15 rows), the Matrimonios head-to-head (6/6) and Dinero › Liquidación (31/31) every amount and «Pagado» button floats right after its label instead of sitting in a right-aligned column, because the screens' `display: grid` loses to the composed primitive's `display: flex`",
  severity: 'P1', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'new',
  evidence: [
    'src/screens/tournament/GamesScreen.module.css:94-98 `.rowLine { composes: rowLine …; display: grid; grid-template-columns: minmax(0,1fr) auto }` and :12-15 `.gameRow` (same pattern); src/components/primitives.module.css:655-662 `.rowLine { display: flex; … }`',
    'Bundled order in index-PYOh36qD.css (probe $S/panel/evidence/VIS/calc.mjs): `._rowLine_d3vna_94 {display:grid}` then `._gameRow_d3vna_12 {display:grid}` then `._rowLine_1cnem_655 {display:flex}` — same specificity, the composed base comes later and wins; computed display on every Calcutta row = flex',
    'src/screens/tournament/MoneyScreen.module.css:146-154 `.transfer { composes: rowLine }` with `.transferText` lacking `flex: 1` (the primitive `rowTextBlock` that has it is not composed), so the amount and the button hug the text',
    'node $S/panel/evidence/VIS/ragged.mjs → «/juegos#La Calcutta: 15/15 rows ragged (gap up to 199px)», «#Los Matrimonios: 6/6», «/dinero#Liquidación: 31/31 (gap 58px+)»; control screens (Juegos overview, Dinero «Si terminara ahora», Más) 0 ragged',
    'node $S/panel/evidence/VIS/composes.mjs → 3 local `display:grid` overrides silently lose to `composes` (GamesScreen .gameRow, .rowLine; Organizer .choice) plus Admin .inboxRow gap',
    SH + 't_juegos-full12-live-15pro-light-tab-la-calcutta.png — «$8,800» at x≈120, «$3,200» at x≈143, «$800» at x≈187 CSS px; owners «$6,600 / $3,800 / $3,200» step right row by row',
    SH + 't_dinero-full12-live-15pro-light-liquidacion.png — «Quién debe qué»: amounts and «Pagado» buttons at a different x on every row, right third of the screen empty',
    SH + 't_juegos-full12-live-15pro-light-tab-los-matrimonios-full.png — «Cara a cara por grupo» figures float after the pair names',
    'src/styles/one-row.test.ts mandates `composes: rowLine` for every row and passes, but checks CSS text only: nothing verifies the rendered layout, so the pattern it enforces is the one that silently discards each screen\'s grid',
  ],
  impact: "The two screens where money is decided in front of the group — the Calcutta payout table on auction night and the settlement checklist the banker ticks off before bed — look broken: figures wander by up to 200 px from row to row, so nobody can scan a column of amounts or compare two payouts, and «Pagado» buttons sit in a different place on every row (mis-taps on a moving target). For a product whose brief says «Trust is the product», this is the first thing a Stripe or Revolut designer would stop the launch for.",
  recommendation: "Make the row primitive own its columns instead of letting screens re-declare layout: give `.rowLine` (primitives.module.css:655) `display:grid; grid-template-columns:minmax(0,1fr) auto` or make its first child `flex:1` by default, delete the local `display:grid` overrides (they never apply), and compose `rowTextBlock` in `.transferText` (MoneyScreen.module.css:149) and `.rowText` (GamesScreen.module.css:103). Put figures in a right-aligned tabular column (`.fig`, text-align:right) and the action in a fixed-width trailing slot. Add a Playwright layout assertion (the ragged.mjs detector) over Juegos tabs, Dinero modes and the Comité inbox, and a stylelint rule that forbids re-declaring a property that the `composes` target sets.",
  effort: 'S',
  repro: "Open http://127.0.0.1:4188/t/_/full12-live/juegos at 393×852, tap «La Calcutta»: slot amounts and owner values are not in a column. DevTools: getComputedStyle(document.querySelector('[class*=_rowLine_d3vna]')).display → 'flex' although GamesScreen.module.css:96 says grid. Then /t/_/full12-live/dinero → «Liquidación». Or run node $S/panel/evidence/VIS/ragged.mjs '/t/_/full12-live/juegos#La Calcutta' '/t/_/full12-live/dinero#Liquidación'.",
})

add({
  title: "The leaderboard breaks its own first rule: every numeric column (Hoy, Hoyo, Puntos/Gross) is left-aligned under a right-aligned header, so the big figure sits wholly left of «PUNTOS» and «8» and «11» do not share a units column",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'still open (DD-2, which HIST marked fixed: the selector has never matched since it was written in 9aecbfc, #12)',
  evidence: [
    'DESIGN_DIRECTION.md:8 «Right-aligned numeric columns that line up to the pixel.»',
    'src/components/primitives.module.css:304-307 `.boardHead > span:nth-child(n + 3), .leaderRow > .num { text-align: right }` — LeaderRow (src/components/primitives.tsx:161-163) renders its figures with `s.fig`, never `.num`, so the row half of the selector matches nothing; `.leaderRow` itself sets `text-align: left` (:317)',
    'node $S/panel/evidence/VIS/align2.mjs full12-live → header «Puntos» text at x 325–373 (right-aligned); every figure at x 301–325 (text-align:left): no horizontal overlap between a figure and its own header; «8» at 261–269 vs «11» at 261–276 in the Hoyo column. Same on large60 («F» vs «17»)',
    SH + 't_live-full12-live-15pro-light.png, ' + SH + 't_live-large60-15pro-light.png, ' + SH + 't_juegos-full12-live-15pro-light-tab-los-matrimonios-full.png (the pairs board, same primitive)',
  ],
  impact: "The flagship board — the screen every player opens between shots and the one the direction calls «numbers are the hero» — reads as slightly off: the column header and the numbers under it do not line up, and one- and two-digit values stagger. It is the kind of detail that makes a sports board look home-made next to the PGA Tour app, 18Birdies or The Grint.",
  recommendation: "Change the selector to target what LeaderRow renders (`.leaderRow > .fig:not(.pos)` or give today/thru/figure a `.col` class) with `text-align:right`, and keep the header spans on the same grid tracks. Add a visual assertion: for each board, the right edge of every figure equals the right edge of its header (±1 px).",
  effort: 'S',
  repro: "http://127.0.0.1:4188/t/_/full12-live at 393×852: the «60» under PUNTOS ends ~48 px before the header does. DevTools: getComputedStyle(document.querySelector('button[class*=leaderRow] [class*=figure]')).textAlign → 'left'. Or node $S/panel/evidence/VIS/align2.mjs full12-live.",
})


add({
  title: "The TV board silently drops a quarter of the field: each Individual page holds 12 players but only 9 rows fit at 1920×1080, so positions 10–12 (including last place, La Cuchara) never appear, and on 60 players 15 are never shown",
  severity: 'P1', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'still open (DA-15.2 / DESIGN_AUDIT §15 «12 rows do not fit»; HIST marked it fixed from document scrollHeight = 1080, which a fixed, overflow:hidden board always reports)',
  evidence: [
    'src/screens/tournament/TvScreen.tsx:48 `const PAGE = 12`; :99 slices 12 rows per page; src/screens/tournament/TvScreen.module.css:53-57 `.rows { overflow: hidden }` and :59-66 rows sized in vh (avatar 5.5vh + padding + 3vh text ≈ 90 px)',
    'node $S/panel/evidence/VIS/tvsize.mjs /t/_/full12-finished/tv → «rows in DOM 12, fully visible 9»; /t/_/large60/tv «Individual 1–12» → 9 visible',
    SH + 't_tv-full12-finished-tv-dark-slide1.png (ends at 9th), ' + SH + 't_tv-large60-tv-dark-slide1.png (title «1–12», 9 rows), ' + SH + 't_tv-longnames-tv-dark-slide1.png (8½ rows)',
    'Because rows are sized in vh, the same 9-row limit holds on any 16:9 screen, 720p casting included',
  ],
  impact: "At the villa and at dinner the TV is the shared scoreboard. The bottom three of a 12-man field — the players most likely to be roasted, and the Cuchara de Palo slot of the Calcutta — are never on screen, and nothing says the board is cut. On 60 players a quarter of the field is invisible on every rotation.",
  recommendation: "Compute rows per page from the measured height (ResizeObserver on `.rows`, floor(available / rowHeight)) instead of a constant, or size rows so PAGE always fits (row height = (100vh − header) / PAGE). Show «1–9 de 12» and page through all players. Add a Playwright check at 1920×1080 and 1280×720: every player id appears on some page.",
  effort: 'S',
  repro: "Open http://127.0.0.1:4188/t/_/full12-finished/tv in a 1920×1080 window and wait: the Individual slide ends at position 9. document.querySelectorAll('[class*=_row_]').length → 12, but rows 10–12 lie below the clipped container.",
})

add({
  title: "TV Matrimonios and Calcutta boards are broken: their rows render 4 cells into a 5-column grid, so pair and owner names wrap into the 6vh avatar column («Los / Tres», «Iván / J.»), partners and holdings truncate to «Ca…», and the totals float 200 px short of the right edge",
  severity: 'P1', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'new',
  evidence: [
    'src/screens/tournament/TvScreen.module.css:59-61 `.row { grid-template-columns: 6vh 6vh minmax(0,1fr) auto 14vh }` (pos, avatar, name, small, big)',
    'src/screens/tournament/TvScreen.tsx:126-136 pairs row = pos, name, small, big (no avatar); :184-192 Calcutta row = avatar, name, small, big (no pos): every cell lands one track to the left, so the name gets the 6vh (65 px) track and the figure the `auto` track',
    SH + 't_tv-full12-live-tv-dark-slide2.png — «Los / Tres / Ca…», «74 + 40» beside it, «114» at x≈1600 of 1843',
    SH + 't_tv-full12-live-tv-dark-slide4.png — «Iván / J. / Ca…», «$1,500» with no label, «$6,600» at x≈1630',
    SH + 't_tv-longnames-tv-dark-slide2.png — long pair names overlap the figures; only 4 of 6 pairs fit',
  ],
  impact: "Two of the five TV slides — the pairs game and the Calcutta, the two side games the group bet the most on — look visibly broken on the villa TV for 12 s of every minute. The partners and holdings (the point of those boards) are unreadable «Ca…» stubs, and an unlabeled «$1,500» next to «$6,600» invites the wrong reading.",
  recommendation: "Give each board its own grid (or always render 5 cells with empty placeholders), put the pair's two names on the sub line in full, and label the Calcutta columns («invirtió», «vale hoy»). Add a TV visual regression over every slide of full12-live and longnames (Playwright screenshots at 1920×1080 with a per-slide text-overflow check).",
  effort: 'S',
  repro: "http://127.0.0.1:4188/t/_/full12-live/tv at 1920×1080; wait 12 s for «Los Matrimonios» and 36 s for «La Calcutta, $16,000». Or read TvScreen.tsx:126-136 against TvScreen.module.css:61.",
})

add({
  title: "TV type is phone-scale for a room: at 4 m from a 55-inch 1080p screen the names subtend 12′ of arc, the «Hoyo 11, 25» line 9′, «Salir» 8′ and the tier badges 4.5′ — only the totals and titles reach the 16′ legibility floor — and nothing on the board has a column label",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'still open (DESIGN_AUDIT §15 / DA-15.1 «TV rows carry the phone\'s six elements»)',
  evidence: [
    'node $S/panel/evidence/VIS/tvsize.mjs /t/_/full12-finished/tv (55″ 16:9 panel, 0.634 mm/px, Archivo cap height 0.686 em, viewer 4 m): 12 px tier badges → 5.2 mm cap, 4.5′; 23.8 px «Hoyo F, 38» → 10.3 mm, 8.9′; 25.9 px «Día 2, terminada» → 9.7′; 32.4 px names → 14.1 mm, 12.1′; 34.6 px positions 12.9′; 43.2 px board title 16.2′; 49.7 px totals 18.6′',
    'Reference: ISO 9241-303 / MIL-STD-1472 put the minimum character height for reading at 16′ of arc (20–22′ preferred); the signage rule of thumb (1 in per 25 ft for legibility) gives ≥13 mm at 4 m',
    'src/screens/tournament/TvScreen.module.css:66 `.row { font-size: 3vh }`, :105-110 `.small { font-size: 2.2vh }`, :100-104 tier badge inherits the phone\'s fixed 12 px (global.css:419-432); TvScreen.tsx:104-111 renders «Hoyo n, pts» as one unlabeled string and no header row',
    SH + 't_tv-full12-live-tv-dark-slide1.png, ' + SH + 't_tv-full12-live-tv-dark-slide3.png (the snake holder is marked by a ~20 px icon and a 3 px underline)',
  ],
  impact: "From the couch, guests can read who leads and the totals, but not the names reliably, not how many holes each has played, not today's points and not the tiers; the snake holder's mark is invisible. The screen that CLAUDE.md says must make Diego say «wow» on a TV reads as a laptop page projected on a wall.",
  recommendation: "Design the board for distance: a 3-column board (pos, name, total) plus one labeled figure (HOY or HOYO) at ≥ 4.5vh, names at ≥ 4.5vh (≈ 18′), no tier badges, the holder marked by a board-yellow plate, and header labels at ≥ 2.8vh. Use the `Plate` primitive the direction specifies. Add a test that no visible TV text is under 3.5vh.",
  effort: 'M',
  repro: "node $S/panel/evidence/VIS/tvsize.mjs /t/_/full12-finished/tv (prints the size table), or open the page at 1920×1080 and read it from across a room.",
})

add({
  title: "Ceremonia, the finale, is a phone dialog on the TV: at 1920×1080 the tournament name is 14 px (5′ of arc at 4 m), the controls 16–18 px, the step title 48 px, the champion card fills ~20% of the screen, the primary «Siguiente» is cream text on a white box (1.1:1), and the ceremony ignores the event accent (a fairway-green «Revelar» on an Agua tournament)",
  severity: 'P1', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'new',
  evidence: [
    'node $S/panel/evidence/VIS/cersize.mjs → start: «Nacho\'s Bachelor Invitational» 14 px (5.2′), «Empezar la ceremonia» 18 px (6.7′), «Ceremonia» 22 px; step 3 and the last step: title 48 px (17.9′), «Anterior / 3 / 12 / Siguiente» 16 px (6.0′)',
    'src/screens/tournament/CeremonyScreen.module.css sizes in rem with caps (SHOTS-B index §7: header 22 px, name 14 px, lists ≤ 22.4 px), unlike TvScreen which scales in vh',
    'src/screens/tournament/CeremonyScreen.tsx:274 «Siguiente» is `.btn--secondary`; CeremonyScreen.module.css:155-159 recolors its text to --board-ink but never its white background (global.css:212-215) → #f6f3ea on #ffffff = 1.11:1 (also A11Y-04)',
    'Ceremonia never sets --event-accent (only TournamentShell.tsx:52, TvScreen.tsx:75, EnterScreen.tsx:100 do), so `.btn--primary` falls back to the platform fairway #1e6b3b: 2.25:1 against the board green, and not the event\'s colour',
    'node $S/panel/evidence/VIS/cer-accent.mjs → same tournament: Más primary rgb(43,91,140) (Agua), Ceremonia primary rgb(30,107,59) (fairway); «Siguiente» color rgb(246,243,234) on background rgb(255,255,255)',
    SH + 't_ceremonia-full12-finished-tv-dark-vis-step03.png, ' + SH + 't_ceremonia-full12-finished-tv-dark-champion-confetti.png, ' + SH + 't_ceremonia-full12-finished-tv-dark-step25.png, ' + SH + 't_ceremonia-full12-finished-15pro-dark-step02.png',
  ],
  impact: "The prize-giving is the emotional peak of the trip and the brief's «wow» test (CLAUDE.md §9.10, §16 M6). On the TV it shows a small green button in a sea of empty board, a champion card the size of a phone, and a Next button nobody can see; the event's own colour and the direction's plate numerals are absent. It will read as a prototype in front of all twelve players.",
  recommendation: "Give Ceremonia the TV's vh-based scale (names ≥ 10vh on reveal, figures on plates), set --event-accent from the tournament like the other screens, restyle the footer buttons for the board (transparent fill, board-ink text, board-accent focus ring), and choreograph one reveal per step with count-ups of points and money. Verify on a real TV at 4 m during the Ensayo rehearsal.",
  effort: 'M',
  repro: "http://127.0.0.1:4188/t/_/full12-finished/ceremonia at 1920×1080: «Empezar la ceremonia», then look for «Siguiente» at the bottom right. node $S/panel/evidence/VIS/cersize.mjs prints the sizes.",
})

add({
  title: "The Calcutta lot card hides the tier: the auction TV prints the tier badge in graphite on the board surface (1.3:1), so the tier that decides the «Mejor C / Mejor D» slots is invisible while the room bids",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'new',
  evidence: [
    'src/screens/tournament/TvScreen.tsx:244-245 `<span className="tierBadge">` inside `.lotMeta`; the only board override is TvScreen.module.css:100-104 `.name :global(.tierBadge)`, which does not match the lot card',
    'global.css:419-432 `.tierBadge { color: var(--ink); border: 1px solid var(--ink-2); font-size: 12px }` → #1b211d on --board-surface #163b2c = 1.32:1; border #4f5751 = 1.66:1 (computed with src/lib/contrast.ts formula)',
    SH + 't_tv-full12-live-tv-dark-patched-auction.png and ' + SH + 't_tv-auction12-tv-dark-ux-auction.png — a dark 12 px box before «Hándicap de juego 10»',
  ],
  impact: "On auction night the bidders price a player partly by tier (C and D players carry their own 10% slots). The TV shows the tier as an unreadable dark square, so the room has to ask the auctioneer.",
  recommendation: "Render the tier on the lot card as text («Grupo C») in board-ink at the lotMeta size, or add a board override for every .tierBadge under `.tv`; add the pair to tokens.test.ts.",
  effort: 'S',
  repro: "Load http://127.0.0.1:4188/t/_/full12-live/tv with the SHOTS-B auction patch (node $S/panel/evidence/SHOTS-B/shots-b.mjs patched) or look at the cited shot; DevTools on the badge: color rgb(27,33,29) on background rgb(22,59,44).",
})

add({
  title: "Tournament logos break on the board surfaces: a dark logo on a transparent background (the common case) vanishes on the TV and Ceremonia green, and a detailed patch like Nacho's is an unreadable blob at the 40 px header size; there is no plate, outline or small-size variant",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'new',
  evidence: [
    'src/screens/tournament/TvScreen.module.css:21-24 `.logo { height: 9vh; width: auto }` — no background or outline; same pattern in CeremonyScreen.tsx:213; src/components/primitives.module.css:565-570 `.eventLogo` 40×40 contain',
    'Rendered with a structuredClone hook that sets tournament.logoUrl ($S/panel/evidence/VIS/brandinject.mjs): ' + SH + 't_tv-full12-live-tv-dark-vis-logo-dark.png (a black «CC» ring logo, ~1.3:1 on #0f2e22, visible only as a faint outline); ' + SH + 't_live-full12-live-15pro-light-vis-logo-nacho.png (assets/nacho-logo.png as a 40 px multicolour blob beside the name)',
    'DESIGN_DIRECTION.md:141 «The logo, when present, is a small mark beside the event name» — no guidance or tooling for a mark that works at 40 px or on dark; AdminTournament.tsx:221 uploads one image for every surface',
  ],
  impact: "Organizers will upload whatever logo their club or group has; on the two «show» surfaces it either disappears or turns to mush, which reads as Polo mishandling their brand on the night it matters.",
  recommendation: "On board surfaces put logos on a light plate (--on-dark, --r-md, padding) or auto-detect luminance and add a light halo; let the organizer upload a square mark separately from the full logo (with a preview at 40 px and on the board), and crop/downscale on upload (the 889 KB patch is served for a 40 px slot).",
  effort: 'S',
  repro: "node $S/panel/evidence/VIS/brandinject.mjs tv /t/_/full12-live/tv /tmp/x.png dark - and open /tmp/x.png; same with 15pro /t/_/full12-live … nacho.",
})


add({
  title: "Four of the six curated event accents collide with the semantic colours the whole direction rests on: Agua is the over-par blue (ΔE2000 2.9), Vino is the under-par/debt/error red (8.0), Arena is the caution brown (7.5), Pizarra is the secondary ink (10.3)",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'new',
  evidence: [
    'src/design/accents.ts:11-18 (fairway #1e6b3b, agua #2b5b8c, atardecer #b4532a, vino #8a2e3a, pizarra #3f4a54, arena #7a5a2e) against src/styles/tokens.css:20-24 (--under #9d1c23, --over #235380, --caution #8a5a00) and :13 (--ink-2 #4f5751)',
    'CIEDE2000 computed in $S/panel/evidence/VIS (node script in the transcript): Agua–over 2.9 (≈1 just-noticeable difference), Vino–under 8.0, Arena–caution 7.5, Pizarra–ink-2 10.3, Atardecer–under 15.9; only Fairway is ≥ 34 from every semantic colour',
    'The first tournament is Agua: its stored teal #0f6e77 maps to Agua (nearestAccent, accents.ts:28-42; DESIGN_NOTES.md:28 «the Ensayo\'s old teal reads as Agua»); the fixtures full12-live, large60, stroke8 use it',
    SH + 't_live-full12-live-15pro-light-gross.png — on an Agua event the «+11 … +33» over-par figures, the «Anotar el hoyo 12» button, the active tab icon and the my-row bar are the same blue',
    SH + 't-full12-live-15pro-light-vis-accent-vino-mix.png — on a Vino event «Guardar hoyo» and the tab icon are the red of «−$2,650» debts and under-par birdies',
    'DESIGN_DIRECTION.md:10 and :141 promise «red for under par, blue for over par» and that «the semantic colors (under/over) … never change» per event',
    'Legacy values snap by RGB distance, not perceptually: nearestAccent (accents.ts:28-42) maps friends8\'s green #3f6b4f to slate «Pizarra» (RGB d² 1,114 vs 1,489 for Fairway), so a green club colour renders grey-blue (SHOTS-A index, «Accent snapping changes the brand hue»)',
  ],
  impact: "Colour stops carrying meaning exactly where the product depends on it: in Nacho's own tournament «blue» means both «over par» and «mine / press here», and a Vino organizer gets a primary button that reads as an error and a my-row bar that reads as a debt. Players scanning the gross board or Dinero in sun get false signals.",
  recommendation: "Re-pick the accent set in a hue band that stays ≥ 20 ΔE2000 from --under, --over, --caution and the inks (e.g. fairway, a teal-cyan, a plum/violet, an ochre-gold that is not caution, a slate-blue far from --over), or map the chosen accent to a safe neighbour when it is within 15 ΔE of a semantic colour. Add a unit test next to tokens.test.ts that computes ΔE2000 between every accent and every semantic token, and map legacy colours in Lab/OKLab rather than RGB.",
  effort: 'S',
  repro: "Compare #2b5b8c with #235380 and #8a2e3a with #9d1c23 in any ΔE calculator; or open http://127.0.0.1:4188/t/_/full12-live, tap «Gross»: the button, the tab icon and the over-par figures are one blue.",
})

add({
  title: "An event shows two brand colours at once: the platform fairway green still drives 47 style rules (links, «Ver tarjeta», «Compartir», toggles, the my-row tint, the current-hole marker, Calcutta amounts, Ceremonia) against 12 for the event accent, so every non-Fairway tournament mixes its accent with green — the my-row marker alone is a green tint with a blue bar detached 16 px from it",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'partly fixed (DA-X.hier.3: one semantic palette now, but two accents inside a tournament)',
  evidence: [
    "grep -rn 'var(--accent)\\|var(--accent-soft)' src --include=*.css (excluding dev/design) → 47; 'var(--event-accent)' → 12",
    'DESIGN_DIRECTION.md:141 «The accent is applied to exactly three things inside that tournament: the rule under the event name, the primary button, and the "my row" marker»; actual event-accent uses also include the tab icon (TournamentShell.module.css:70), honoree ring and dot (ui.module.css:7, primitives.module.css:380), snake holder (SnakeBoard.module.css:54,66), feed lead icon (FeedTicker.module.css:21), Entrar «faceAsk» text (EnterScreen.module.css:54)',
    'primitives.module.css:325-336 `.mine` = --accent-soft green tint + ::before bar in --event-accent at left: calc(-1 * var(--gutter)), i.e. at the screen edge, 16 px outside the tinted row',
    'global.css:220-222 `.btn--ghost { color: var(--accent) }`, :368-370 toggle on = --accent; primitives.module.css:269-271 `.tabOn svg` --accent, :553 live dot --accent; ScorecardScreen grid current hole in accent-soft (shot below)',
    SH + 't-full12-live-15pro-light-vis-accent-vino-mix.png (wine button, green «Ver tarjeta»/«Compartir», green my-row tint with a wine edge bar), ' + SH + 't_tarjeta-full12-live-15pro-light-grid.png (Agua event, green current-hole tile)',
  ],
  impact: "The personalization the platform sells («each event can carry one accent») looks like a half-applied theme: two competing hues on every tournament screen, and the one element that says «this is you» is split into a tint of one colour and a sliver of another at the screen edge.",
  recommendation: "Inside a tournament, alias --accent and --accent-soft to the event accent (and a derived soft tint via color-mix) in TournamentShell, Ceremonia and TV, keep fairway only for platform chrome outside tournaments, and draw the my-row bar inside the row (left: 0 with the row's own padding). Add a lint/test that forbids --accent in tournament screen stylesheets.",
  effort: 'S',
  repro: "node $S/panel/evidence/VIS/brandinject.mjs 15pro /t/_/full12-live/tarjeta /tmp/v.png - '#8a2e3a' (or pick Vino in Comité › Torneo on a fixture) and compare «Guardar hoyo» with «Ver tarjeta»; on /t/_/full12-live look at row 7 (Iván J.).",
})

add({
  title: "No dark appearance anywhere (`color-scheme: light`, zero `prefers-color-scheme`): the auctioneer console at the Calcutta dinner, the bedtime settlement and every night-time check of the board are a full-screen near-white page",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'new (a design decision in DESIGN_NOTES.md:13, challenged here)',
  evidence: [
    "grep -rn 'prefers-color-scheme' src → 0; index.html:10 `<meta name=\"color-scheme\" content=\"light\">`",
    'DESIGN_NOTES.md:13 «Dark mode. Not global … phone screens are light-only because they are used in sunlight»; DESIGN_DIRECTION.md:9 «Light mode first»',
    'CLAUDE.md §2/§10: the Calcutta auction and the pairs draw run at dinner (Thu night), «se paga antes de dormir» (settlement at night), the TV and Ceremonia are evening surfaces; the Comité console is used at the villa',
    'SHOTS-B index: «No dark mode. The app has none … TV and Ceremonia use the --board-* tokens» ($S/shots-index-B.md, Fixture limitations)',
  ],
  impact: "Half of the product's moments happen after sunset: the auctioneer holds a white phone next to a dark TV at a dinner table, and players check money and standings in bed. Every flagship on the benchmark list (Apple's apps, Linear, Stripe, Arc, Things, Revolut, Robinhood, 18Birdies) follows the system appearance; Polo alone glares, and on iOS it also ignores the user's explicit setting.",
  recommendation: "Keep light as the course default but ship an automatic dark theme: a --bg/--surface/--ink set derived from the board palette (the tokens already exist), with under/over re-tuned for dark (the board already has --board-under/--board-over), and let the Tarjeta optionally force light in daylight. Add dark-mode screenshots to the design fixtures and to CI.",
  effort: 'M',
  repro: "Set the phone or DevTools to prefers-color-scheme: dark and open http://127.0.0.1:4188/t/_/full12-live/admin/calcutta: nothing changes.",
})

add({
  title: "The laptop surfaces have no hover state at all: one `:hover` rule exists in the whole product (a chart bar in Admin de Polo), so buttons, rows, nav items, swatches and links in the Comité, the organizer screens and Admin de Polo never respond to the pointer",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'still open (DA-C.1 / DA-C.4.2 «no hover anywhere»)',
  evidence: [
    "grep -rn ':hover' src --include=*.css (excluding dev/design) → 1 (src/screens/platform/Platform.module.css:150 `.plot:hover .bar`)",
    'global.css:184-259 `.btn` family defines :active and :disabled only; primitives.module.css:25-74 same; Admin.module.css rows have :active only',
    'Comité and Admin de Polo are laid out for desktop (AppShell.module.css 960 px column, side nav from 760 px: DESIGN_NOTES PR 7) — ' + SH + 't_admin_torneo-full12-live-laptop-light.png',
  ],
  impact: "On the laptop — where the organizer builds the tournament, runs the auction console and the Admin de Polo — nothing signals what is clickable until it is clicked. It is the single most visible «this is not a desktop product» tell next to Linear or Stripe.",
  recommendation: "Add `@media (hover: hover)` states to the primitives once (button fill/border shift, row background --surface, nav item ink, swatch ring), not per screen; include them in the /design style guide and a Playwright hover snapshot.",
  effort: 'S',
  repro: "Open http://127.0.0.1:4188/t/_/full12-live/admin/torneo on a desktop browser and move the mouse over «Subir logo», the section nav and the accent swatches: no change.",
})

add({
  title: "Loading, error and boot states are generic and nearly invisible: every lazy screen shows the same three bars at 1.08:1 against the page, a failed load is a pink card that prints «Failed to fetch», and every cold start first paints «Polo / Cargando…» in the system font",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'partly fixed (DA-X.lee.1, marked fixed by HIST: skeletons exist but are generic and 1.08:1; DA-X.lee.3 raw messages remain)',
  evidence: [
    'src/components/ui.tsx:113-126 `Spinner` = three bars of fixed widths for every screen (comment: «shaped like the content it replaces» — it is not); skeleton fill --surface #f3f1ea on --bg #fbfaf7 = 1.08:1',
    SH + 't_stats-full12-live-15pro-light-vis-skeleton.png (Estadísticas loading with the service worker blocked and its chunk delayed: three faint bars under the header)',
    SH + 't_ensayo-ensayo-15pro-light-vis-api-down.png (/t/ensayo with /rest/v1 and /auth/v1 failing: «Algo salió mal / Failed to fetch / Reintentar» in a rounded pink card; raw text also COPY-04)',
    SH + 't_live-full12-live-15pro-light-vis-bootfail.png and index.html:33-37 (boot fallback in `system-ui`, 28 px bold «Polo», no mark; see also PWA-14)',
    SH + 'notfound-none-15pro-light-vis.png (404: wordmark, a grey ring, one sentence, a secondary button — acceptable)',
  ],
  impact: "The moments when the network is slow — which on a golf course is most moments — look like a blank page, and the failure state looks like a developer console. These states are what players see first on the course and they carry none of the brand.",
  recommendation: "Make skeletons per screen from the real primitives (Board rows with position/name/figure blocks, the Tarjeta's four steppers) at ≥ 1.3:1 with a slow shimmer that respects reduced motion; keep the previous screen visible during lazy loads (startTransition) and prefetch the tab chunks on idle; design one error pattern (icon, human sentence, cached-data fallback, retry) and give the inline boot fallback the brand mark and background inline.",
  effort: 'M',
  repro: "node $S/panel/evidence/VIS/skel.mjs and node $S/panel/evidence/VIS/states.mjs (write the cited shots); or DevTools › Network › block *rest/v1* and open http://127.0.0.1:4188/t/ensayo.",
})


add({
  title: "The Polo mark is a raster crop of a machine-looking concept sheet, not a designed identity: no vector master, a hairline grey pencil loop beside a 740-weight wordmark (the lockup reads «P Polo»), a separately traced favicon that does not match it, and an app icon whose ink covers 14% of the tile in mid-grey",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'new',
  evidence: [
    'design/brand/polo-logo-sheet.jpg — the source sheet carries garbled placeholder text typical of generated imagery («Rachael», «Hab Son», «Nanswowld» on the mini board; «SNAKE SIDE / WRLD DETAIL» on the badge)',
    'DESIGN_NOTES.md:98-103 — «nothing is redrawn now; the sheet\'s own pixels are used»: scripts/brand/extract-logo.py lifts rasters (public/brand/polo-mark.png 231×252, polo-mark-board.png 222×243); only the favicon is a potrace outline (public/favicon.svg), so the 16-px mark and the in-app mark are two different drawings',
    'Measured on public/icons/icon-512.png: ink covers 13.7% of the tile, median luminance 88/255 (a mid grey, not the graphite --ink #1b211d); $S/panel/evidence/VIS/icons-home.png (home-screen mock, dark and light wallpaper) and icons-tabs.png (16/32 px on light and dark tab strips): a thin grey loop that nearly disappears on the light wallpaper and at 16 px',
    '$S/panel/evidence/VIS/home-lockup-zoom.png — the hairline textured P set before the heavy «Polo»; src/design/logoMark.json wordmark weight 740, a stock Archivo setting with no custom letterform',
    'Primitive usage count: LogoMark 0 uses, Wordmark tone="board" 0 uses — the gold board lockup exists but the TV and Ceremonia carry no Polo mark at all',
  ],
  impact: "The icon is what 12 players see on their home screen every day of the trip, and the mark is what the share images carry into every WhatsApp group; both look like a sketch next to the bold, single-colour marks of the apps around them. A raster mark cannot be reproduced cleanly in one colour, embroidered, engraved on the Putter's box or printed large, and its provenance should be settled before any trademark filing (see STRAT-13).",
  recommendation: "Keep the idea (a pencil P) but commission a vector redraw with a small system: a filled/bolder symbol for ≤ 48 px and the app icon (≥ 25–35% coverage, ink or fairway on card stock, a dark/tinted iOS variant), the textured version only for large display, a symbol-only lockup rule so it never reads «P Polo», clear-space and minimum sizes, and one source for favicon, icons and in-app mark. Verify at 16/32/60/180 px on light and dark grounds.",
  effort: 'M',
  repro: "node $S/panel/evidence/VIS/iconsheet.mjs /tmp/icons.png && node $S/panel/evidence/VIS/iconsheet2.mjs /tmp/icons (writes the contact sheets); open design/brand/polo-logo-sheet.jpg at 100% and read the mini board.",
})

add({
  title: "The direction's signature devices never shipped: the board «plate» exists only in the style guide (0 product uses), the app icon is not the circled figure, the gold board lockup is unused, and the share image — the one artefact that leaves the app — replaces the pencil notation with tints that invert its colours (red-family tint for zero-point holes, where the app draws red circles for birdies)",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'partly fixed (DD-12; HIST counted the share images as done — they use tints, not the notation)',
  evidence: [
    'DESIGN_DIRECTION.md:71 «the pencil notation … appears on the scorecard grid, in the "hoy" column, on share images, and in the app icon: a bold figure with a red pencil circle»; :117,125 «The TV still gets the board. The plate numeral survives as a component on the board surface (TV, Ceremonia)»',
    'src/components/primitives.tsx:399 `Plate` — used only by src/design/DesignScreen.tsx:484; TvScreen.tsx and CeremonyScreen.tsx render plain text figures',
    'src/components/ShareCard.tsx:122 `h.points >= 3 ? styles.birdie : h.points === 0 && h.played ? styles.zero`; ShareCard.module.css:143-151 `.birdie { background: var(--accent-soft) }`, `.zero { background: var(--under-soft) }` — the under-par red family marks the worst holes; no ScoreMark on the card',
    '$S/panel/evidence/PWA/cards/player-full12.png (18 tinted tiles, green for 3+ points, pink for 0) versus ' + SH + 't_tarjeta-full12-live-15pro-light-grid.png (red circles = birdie, blue squares = bogey)',
    'The hoy-column ring was removed deliberately with a written rationale (primitives.tsx:151-158) — that deviation is sound; the others have none',
  ],
  impact: "What was supposed to make Polo recognisable — a golf artefact, not «a clean grotesque app» (DESIGN_DIRECTION.md:73) — survives only inside the Tarjeta grid. The TV shows generic text rows, and the share image teaches the group the opposite colour code from the app, on the image most people will ever see of Polo.",
  recommendation: "Use `Plate` on the TV and Ceremonia for positions and totals (leader in board yellow), put ScoreMark on the player share card (two nines, the same notation as the grid), and decide the icon deliberately (either the circled figure or a vector P) and record the decision in DESIGN_NOTES. Add a design-fixture check that the share card renders the notation.",
  effort: 'M',
  repro: "grep -rn '<Plate' src | grep -v src/design → nothing; open $S/panel/evidence/PWA/cards/player-full12.png beside docs/review/2026-09-30/shots/t_tarjeta-full12-live-15pro-light-grid.png.",
})

add({
  title: "Red and green carry opposite meanings on different screens: red is a birdie (good) on the scorecard but a debt and an error on Dinero; green is the brand accent, the selected state and «money won» on the Calcutta tab and the share card, while Dinero shows winnings in ink",
  severity: 'P3', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'new',
  evidence: [
    'tokens.css:20 `--under` «under par, red by convention … also the only error red»; primitives.module.css:155-157 `.moneyNeg { color: var(--under) }`',
    SH + 't_dinero-full12-live-15pro-light.png — negatives in --under red, positives in ink',
    SH + 't_juegos-full12-live-15pro-light-tab-la-calcutta.png — slot payouts «$8,800 … $800» in fairway green; $S/panel/evidence/PWA/cards/leaderboard-full12.png — «$16,000 … $200» in green',
    SH + 't_ceremonia-full12-finished-tv-dark-step25.png — negatives in --board-under #ff6b6b, positives in board ink',
  ],
  impact: "A birdie and a debt share one red, and «won money» is green on two screens but black on the money screen itself, so colour cannot be trusted as a quick read — the opposite of what a money-and-scores product needs.",
  recommendation: "Pick one money language (sign plus ink, and red only for what is owed) and use it on Dinero, Juegos, TV, Ceremonia and the share card; keep green for the brand and selection only. Document the semantic map in DESIGN_NOTES and snapshot it in the /design page.",
  effort: 'S',
  repro: "Compare the three cited screenshots; grep -rn 'accent' src/screens/tournament/GamesScreen.module.css src/components/ShareCard.module.css for the green money.",
})

add({
  title: "The design system is two systems: the documented primitives `Button`, `TabBar`, `Plate`, `Figure` and `LogoMark` have zero product uses, so the /design style guide shows an ink-bordered secondary button and 40%-opacity disabled state that no screen ships, while 277 screen buttons use global `.btn--*` with a 1.9:1 border, a white fill and a different disabled look; tabs likewise come as boxed pills (29 uses) and as underlines (7)",
  severity: 'P3', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'partly fixed (DA-A.7: button variants unified in look, not in source)',
  evidence: [
    'Usage count (grep "<Name" in src/**/*.tsx outside dev/design and primitives.tsx): Button 0, TabBar 0, Plate 0, Figure 0, LogoMark 0; Segmented 29; global `className="segmented"` 7 (AdminScores.tsx:232, AdminHandicaps.tsx:64, AdminPlayers.tsx:281 …)',
    'global.css:212-216 `.btn--secondary { border-color: var(--rule-2); background: var(--surface-2) }`, :249-255 disabled = surface fill; primitives.module.css:37-44 `.btnSecondary { border-color: var(--ink) }` transparent, :69-74 disabled = opacity .4; :25-28 active translateY vs global.css:209-211 brightness',
    'global.css:523-553 `.segmented` «tabs on a rule, not pills» vs primitives.module.css:208-241 boxed segmented with an ink-filled selection; both visible in ' + SH + 't_admin_torneo-full12-live-laptop-light.png (underline tabs) and ' + SH + 't_dinero-full12-live-15pro-light.png (boxed)',
    "grep -rho 'btn btn--[a-z]*' src --include=*.tsx → ghost 98, secondary 98, primary 80, danger 5",
  ],
  impact: "Whoever builds the next screen from the style guide produces a different button and a different tab control from the rest of the app, and fixes to one system (e.g. the 3:1 border A11Y-05 asks for) will not reach the other. It is the root of the inconsistencies this panel keeps finding.",
  recommendation: "Make the primitives the only implementation: have `.btn--*` classes compose from (or be replaced by) `Button`, pick one tab control for in-page navigation and one segmented control for mutually exclusive values, delete the dead variants, and add a lint rule that forbids raw `btn btn--` class strings in screens.",
  effort: 'M',
  repro: "Open http://127.0.0.1:4188/design (secondary button: ink border, transparent) and any Comité screen (secondary button: light grey border on white); run the grep counts above.",
})

add({
  title: "Entrar, the first screen every player sees, inverts its hierarchy: 88-px grey initials discs dominate 170-px card tiles while the names are 14 px, every disc is the same grey (three «M», two «R»), «Jugador 12» becomes «J1», and only 9 of 12 players fit on an iPhone 15 Pro",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'new (SHOTS-C #20 observed; DA-5.x fixed the old issues)',
  evidence: [
    'src/screens/tournament/EnterScreen.module.css:20-26 `.face` tile min-height 132 px plus padding; :44-50 `.faceName` --fs-sm (14 px); global.css:457-461 `.avatar--lg` 88 px with 28 px initials; src/components/ui.tsx:13-24 initials = first letter of each word of the display name, on --surface grey for everyone',
    SH + 't_entrar-prod-15pro-light.png (production /t/ensayo: identical grey «M M», «R R», «J1», tier badge under each name; the fourth row is cut at the fold)',
    'DESIGN_DIRECTION.md:11 «Cards only for true objects» — each face is a bordered white card tile',
  ],
  impact: "A player opening the link on the course has to read twelve small names under twelve large identical letters to find himself; the biggest thing on the screen carries the least information. It is also the first impression of the product and of the event.",
  recommendation: "Make the name the primary element (16–18 px, 600) with a small avatar, or a deterministic tinted monogram per player (distinct hues from a safe palette) when there is no photo; use ruled rows or compact tiles so 12 fit above the fold on a 375×667 phone; never derive initials from «Jugador 12» (use the number).",
  effort: 'S',
  repro: "Open https://golf.cardigan.mx/t/ensayo (read only) or http://127.0.0.1:4188/t/ensayo on a 393×852 viewport.",
})

add({
  title: "On a laptop or iPad the player, organizer, wizard, profile and home screens are a 528–560 px phone column: 14 px text centred in 1440 px with ~65% of the screen empty, and the iPad board leaves its right half blank under a full-width tab bar",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'still open (DA-3.5, DA-4.5, DA-C.1)',
  evidence: [
    'src/app/AppShell.tsx:16 widens only /admin, /tv, /ceremonia, /imprimir; src/app/AppShell.module.css:13 560 px column (HIST measure: wizard <main> 560 px at 1440×900)',
    SH + 'home-local-laptop-light.png, ' + SH + 'organizer_nuevo-demo-laptop-light-step02-configured.png (wizard at 1440×900: form in the middle third, body 14 px)',
    SH + 't_live-full12-live-ipad-light.png (1024×1366: board in a 560 px column, tab bar spread across 1024 px)',
  ],
  impact: "Organizers set up tournaments on a laptop (DESIGN_AUDIT §18 «the organizer at the villa on a laptop»), and the villa iPad is a natural second board; both get a shrunken phone UI that looks unfinished next to any desktop-grade product.",
  recommendation: "Define two more breakpoints: from 900 px give the organizer and wizard a two-column layout (form + live preview of the event header, prize statement and accent), and give En vivo a board + side panel (feed, player sheet) on tablets; cap line length at ~70 ch instead of the column. Add laptop and iPad snapshots to the design fixtures.",
  effort: 'M',
  repro: "Open http://127.0.0.1:4188/organizer/nuevo/_ at 1440×900 and http://127.0.0.1:4188/t/_/full12-live at 1024×1366.",
})


add({
  title: "Small phones (375×667) get a cramped product: the leaderboard starts at 369 px of the 610 px above the tab bar (status, lead-group line, a full-width button, a caution line, the honoree row and the board title first), so 4 of 12 rows show; and the Tarjeta fits 3 of 4 players, with the 4th player's controls peeking through an unbacked 8 px strip under the sticky save bar",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'partly fixed (DA-X.hier.1: first row was at ~430 px, now 369 px; DA-9.1 fits on 393×852 but not on 375×667)',
  evidence: [
    'node $S/panel/evidence/VIS/fold.mjs → se full12-live {firstRowTop: 369, tabTop: 610, fullyVisibleRows: 4}; 15pro {369, 795, 8}; se longnames {369, 610, 4}',
    SH + 't_live-longnames-se-light.png (four rows and a half above the tab bar), ' + SH + 't_live-full12-live-15pro-light.png',
    'src/screens/tournament/LiveScreen.tsx:176-212 (status line, lead group, primary «Anotar el hoyo n», caution lines, honoree row) before the Board',
    SH + 't_tarjeta-full12-live-se-light.png — three players, then «Guardar hoyo», «Sincronizado», and slices of the 4th player\'s «4 +», «2 +», «Levantó» between the save bar and the tab bar; src/screens/tournament/ScorecardScreen.module.css:184-193 `.saveBar { position: sticky; bottom: calc(56px + var(--safe-bottom) + var(--s2)) }` leaves an 8 px gap with nothing behind it',
  ],
  impact: "The answer to «who leads and where am I» — the 2-second need the audit defined for this screen — needs a scroll on the phones many players carry (SE, mini, older Androids), every time they open the app between shots.",
  recommendation: "Collapse the preamble into one line (status · lead hole · live dot) and move «Anotar el hoyo n» into the Tarjeta tab badge or a compact chip beside the status; fold the honoree into the board (the ring already marks him) and make the board head sticky. Target: first row ≤ 200 px on 375×667, ≥ 8 rows visible. On the Tarjeta, give the save bar a solid band down to the tab bar (bottom: 56px + safe area, padding-bottom s2) and tighten the player rows (steppers 56→48 px) so four players fit above it on 667 px.",
  effort: 'S',
  repro: "Open http://127.0.0.1:4188/t/_/full12-live at 375×667 (or run node $S/panel/evidence/VIS/fold.mjs).",
})

add({
  title: "The points race chart is illegible beyond a handful of players: 60 overlapping lines in a 361×280 px plot with a 60-entry legend of 12 cycling colours (each colour means five players), and 12 converging lines on the real field",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'still open (DA-12.3)',
  evidence: [
    'node $S/panel/evidence/VIS/stats.mjs → large60: chart 361×280, 60 `.recharts-line`, 120 legend nodes; full12-finished: 12 lines, 24 legend nodes',
    SH + 't_stats-large60-15pro-light-vis-race.png (the plot is a braid; the legend runs ~650 px and repeats every colour five times)',
    'src/screens/tournament/StatsScreen.tsx:170-183 plots every player; `PALETTE[i % PALETTE.length]`; only the top 3 lines are thicker',
  ],
  impact: "The one data visualisation in the product — meant to replay the tournament at dinner — cannot answer «where was I on hole 14» or «when did the lead change», so it reads as decoration.",
  recommendation: "Draw everyone in a faint neutral and highlight only me, the leader, the honoree and one tapped player in colour, with direct end-of-line labels instead of a legend; cap the default view at the top 8 plus me; add a tap/scrub to read values. Test at 4, 12 and 60 players.",
  effort: 'M',
  repro: "Open http://127.0.0.1:4188/t/_/large60/stats and scroll to «Carrera de puntos».",
})

add({
  title: "Every board row carries a boxed tier letter and two-letter Calcutta owner codes («IV CA», «DA JU») under the name, so the sub-line reads as noise to everyone but the owner",
  severity: 'P3', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'still open (DA-7.2 owner initials) / partly fixed (DA-X.gen.7 tier badges on every row)',
  evidence: [
    'src/screens/tournament/LiveScreen.tsx:76-81 builds two-letter slices of display names; :254 tier badge on every row; primitives.module.css:369-373 `.owners` letter-spacing 0.02em',
    SH + 't_live-full12-live-15pro-light.png (rows: «A $12,200 IV CA», «D $5,000 LE», «C LE»)',
  ],
  impact: "The sub-line competes with the money figure it is there to carry; a first-time reader cannot decode «IV CA» at all.",
  recommendation: "Show owners only in the player sheet or as «dueño: Iván» on the viewer's own lots; show the tier as a column only on boards where tiers matter (Calcutta night), not on every row of every board.",
  effort: 'S',
  repro: "Open http://127.0.0.1:4188/t/_/full12-live and read the second line of any row.",
})

add({
  title: "Links have no single look — grey plain text on Home and Juegos (they do not read as links), green 600 ghost buttons, grey underlined legal links, green underlined 18 px links with icons on Más, chevron rows on profiles — and ghost buttons and back chevrons break the 16 px text edge (label at 29 px; the Juegos title jumps from x 16 to x 74 between overview and detail)",
  severity: 'P3', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'new',
  evidence: [
    'src/screens/HomeScreen.module.css:71-78 `.door { color: var(--ink-2); text-decoration: none }`; src/screens/tournament/GamesScreen.module.css:142-149 `.crossLink` same; global.css:220-222 `.btn--ghost` fairway 600; src/components/LegalLinks.tsx:7-11 inline grey, underlined by default; global.css:64-66 `a { color: var(--accent) }` (Más links, underlined)',
    SH + 'home-prod-15pro-light.png (three treatments on one screen: grey doors, green «Ya la tengo», grey underlined legal), ' + SH + 't_mas-full12-live-15pro-light.png (green underlined), ' + SH + 't_juegos-full12-live-15pro-light.png («Cómo se juega cada uno» in grey, no affordance, under an empty double rule)',
    'node $S/panel/evidence/VIS/edges.mjs → Home text edges at x 16 but «Ya la tengo» at 29 (global.css:220-223 ghost padding 0 12px); Juegos overview title at x 16, detail title «La Calcutta» at x 74 with the back icon at 29',
  ],
  impact: "Users cannot tell what is tappable: the Home's three doors to the rest of the product and the Juegos cross-links look like captions.",
  recommendation: "Define two link styles only (inline text link; navigational row with chevron) in the primitives and use them everywhere; drop the ghost-button-as-link pattern for navigation, and optically align quiet buttons and back chevrons to the text edge (negative inline margin equal to their padding).",
  effort: 'S',
  repro: "Open http://127.0.0.1:4188/ and http://127.0.0.1:4188/t/_/full12-live/mas.",
})

add({
  title: "Type details drift from the spec: 19 rules set 11 px text (tab labels, board headers, per-hole points) and the share card 10 px although the direction says «nothing is set below 12 px»; 14 letter-spacing declarations up to 0.4em against «no tracking except 0.04em»; a word («varianza 1.14») set as a figure",
  severity: 'P3', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'partly fixed (DD-11, DA-1.5)',
  evidence: [
    "grep -rn 'var(--fs-2xs)' src --include=*.css (excluding dev/design) → 19 (TournamentShell.module.css:58 tab labels, primitives.module.css:297 board head, ScorecardScreen.module.css:274,292 grid points, StatsScreen.module.css:177…); ShareCard.module.css:132 `font-size: 10px`",
    'DESIGN_DIRECTION.md:35 scale starts at 11 yet :73 «nothing is set below 12 px» — the spec contradicts itself',
    "grep letter-spacing → EnterScreen.module.css:78 0.4em, Admin.module.css:268 0.4em, ScorecardScreen.module.css:360 0.14em, MoreScreen.module.css:49 and HomeScreen.module.css:46 0.12em …",
    SH + 't_stats-large60-15pro-light.png («varianza 1.14» in the figure column)',
    SH + 't_live-match8-15pro-light.png — match results «8&6», «4&3», «2&1» in the condensed figure style: Archivo\'s ampersand reads as a digit («886», «483»)',
    'src/engine/games/lowScore/index.ts:90 `v > 0 ? `+${v}` : `${v}`` prints an ASCII hyphen («Hugo I., -2» on ' + SH + 't_juegos-friends8-15pro-light.png) where DESIGN_DIRECTION.md:8 requires a true minus',
  ],
  impact: "Small, grey 11 px labels are the ones players read in sun (tab names, the column headers, the points under each hole); the inconsistencies are small individually but add up to «not quite tight».",
  recommendation: "Set the floor at 12 px (13 px for anything read on the course), give codes and PINs one token for their tracking (e.g. 0.08em) and delete the rest, keep words out of figure columns (label + figure), set match results as «8 y 6» or with a thin-spaced, non-condensed ampersand, and route every signed number through one formatter with U+2212. Add a stylelint rule for the floor and the tracking token.",
  effort: 'S',
  repro: "Run the two greps above; open http://127.0.0.1:4188/t/_/large60/stats.",
})

add({
  title: "The printed fallback card, the one screen the audit called «the reference for the app's scorecard», now lags the app's own grid: no Ida/Vuelta subtotals, each card fills only ~55% of its landscape page, and names wrap to 3–4 lines",
  severity: 'P3', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'still open (DA-17.3)',
  evidence: [
    'src/screens/tournament/PrintScreen.tsx:65-90 holes 1–18 and one Total column; the app grid has Ida/Vuelta/Total (ScorecardScreen.tsx:369-404)',
    '$S/panel/evidence/SHOTS-B/print-full12-live-render.png (pdf.js render of the Letter PDF: card in the top half of each page; «Hándicap de juego 20, Los Uno» over three lines)',
    'SHOTS-B index item 18 (par/SI from the group\'s first player — a correctness risk for mixed tees, MONEY/UX lane)',
  ],
  impact: "If the app goes down on the course (RUNBOOK fallback), players add up 18 boxes by hand with no OUT/IN, on a card that wastes half the sheet and has little room to write.",
  recommendation: "Print Ida/Vuelta/Total columns, one group per page at full width with taller score rows (≥ 12 mm), handicap and pair on one line, and the stroke dots large enough to see in sun; keep ink-on-white only.",
  effort: 'S',
  repro: "Open http://127.0.0.1:4188/t/_/full12-live/imprimir and print to PDF, or view the cited render.",
})

add({
  title: "Juegos' game tabs are a boxed pill strip that scrolls off both edges with no fade or indicator, cutting labels mid-word («ejor ronda», «La Ví»), and the selected tab can sit out of view",
  severity: 'P3', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'partly fixed (DA-10.1)',
  evidence: [
    SH + 't_juegos-full12-live-15pro-light-tab-la-calcutta.png (strip starts at «ejor ronda»), ' + SH + 't_juegos-full12-live-15pro-light-tab-los-matrimonios-full.png (ends at «La Ví»)',
    'src/components/primitives.module.css:208-219 `.segmented { overflow-x: auto; scrollbar-width: none }` with no mask or scroll-into-view; HIST measure: 599 px of tabs in 359 px',
  ],
  impact: "Six games are hidden behind an invisible horizontal scroll; the clipped words look like a rendering error.",
  recommendation: "Use the underline tab style with a fade mask at the edges and `scrollIntoView({inline:'center'})` on selection, or replace the strip with the Juegos overview list plus a back chevron (the overview already exists).",
  effort: 'S',
  repro: "Open http://127.0.0.1:4188/t/_/full12-live/juegos, tap «La Calcutta».",
})


add({
  title: "Admin de Polo looks like a different, template product: rounded KPI cards with tracked uppercase eyebrows, full-round filter pills, coloured status chips, middle-dot meta lines and raw ISO dates — every pattern the redesign removed — and its destructive actions («Quitar protección», «Quitar del Comité») are the same green text links as «Agregar al Comité»",
  severity: 'P3', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'new (a screen added after the audit that reintroduces the patterns DA-X.gen.2/3/7 removed from the product; HIST DA-B.4 note)',
  evidence: [
    'src/screens/platform/Platform.module.css:15,75 `text-transform: uppercase` eyebrows (also Profile.module.css:343,433); :224,491 `border-radius: var(--r-round)` pills; src/screens/platform/TournamentsScreen.tsx:124-127 chip--teal/sun/coral',
    SH + 'admin_resumen-fx-laptop-light.png (eight carded KPI tiles «CUENTAS 38 …»), ' + SH + 'admin_torneos-fx-laptop-light-detail.png («12 jugadores · Diego Arámburu», «Ronda 1 · Solmar Golf Links · 0 hoyos», «2027-04-08», red «Protegido» chip, green «Quitar protección» and «Quitar del Comité» next to green «Agregar al Comité»)',
    'src/screens/platform/TournamentDetail.tsx:119-120 «Quitar protección» as `btn--ghost` (fairway text)',
  ],
  impact: "Only Diego sees it, so the brand cost is small; the risk is the destructive links that look like constructive ones on the screen that can unprotect the real tournament, and a second visual language that new screens will copy.",
  recommendation: "Rebuild the panel from the same primitives (ruled rows, figures right-aligned, sentence-case labels, formatted dates) and give destructive actions the danger treatment everywhere (`btn--danger` or red text with a confirm).",
  effort: 'M',
  repro: "Open http://127.0.0.1:4188/admin/_/resumen and /admin/_/torneos (select Nacho's Bachelor Invitational) on a laptop.",
})

add({
  title: "The brand's «one memorable thing» collides with itself in the player sheet: pencil marks are 30 px wide in 25–26 px hole columns, so 17 of 19 adjacent marks overlap by up to 5 px and double squares and circles fuse into each other",
  severity: 'P2', verdict: 'CONFIRMED', area: 'Visual design and brand', status: 'new',
  evidence: [
    'src/components/primitives.module.css:414-422 `.mark { width: 30px; height: 30px }`; ScorecardGrid (primitives.tsx:207+) gives nine hole columns what is left after a 21% label column and a 14% total column (:470-500)',
    'node $S/panel/evidence/VIS/marks.mjs → se {markW: 30, cellW: 24.8, adjacentPairs: 19, overlapping: 17, minGap: −5.2}; 15pro {cellW: 26.1, overlapping: 17, minGap: −3.9}',
    SH + 't_live-full12-live-se-light-vis-sheet-marks.png and $S/panel/evidence/VIS/sheet-marks-crop.png (holes 3–4 double squares fused; the eagle\'s double circle on 7 runs into the birdie circle on 8 and the square on 9)',
    'DESIGN_DIRECTION.md:71 «Circle, double circle, square, double square, drawn with a pencil-like 1.5-px stroke around the figure … Everything else stays quiet so this one mark reads as the brand»',
  ],
  impact: "The player sheet is opened from every leaderboard row; its scorecard is where the notation is most visible, and at phone width it reads as a smudged row of merged shapes instead of a crisp card — the detail that should make Polo look crafted makes it look careless.",
  recommendation: "Size the mark from the column (e.g. `width: min(30px, 100%)` with the SVG in a square box and the figure at 0.55 of it), or give the grid a minimum column of 30 px and let the nines scroll; add a layout test asserting no two marks intersect at 360 px.",
  effort: 'S',
  repro: "Open http://127.0.0.1:4188/t/_/full12-live at 375×667, tap the first row (Camilo), look at Día 1 holes 3–9; or run node $S/panel/evidence/VIS/marks.mjs.",
})

const SERVER = ' [Local server if :4188 is down: cd /home/user/Cardi-Golf && npx vite preview --outDir $S/dist-design --port 4188 --strictPort --host 127.0.0.1, where $S = ' + S + '. Scripts: $S/panel/evidence/VIS/*.mjs read BASE (default http://127.0.0.1:4188).]'
for (const f of F) if (/127\.0\.0\.1:4188|\$S\/panel\/evidence\/VIS/.test(f.repro) && !f.repro.includes('Local server')) f.repro += SERVER
fs.writeFileSync(S + '/panel/VIS.findings.json', JSON.stringify(F, null, 2))
console.log('wrote', F.length, 'findings')
