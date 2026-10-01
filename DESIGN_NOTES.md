# Design notes

Decisions and rationale for the visual overhaul, so later passes stay consistent. Read `DESIGN_AUDIT.md` (what was wrong) and `DESIGN_DIRECTION.md` (where we are going) first.

## Decisions (2026-09-27)

- **Brand is redefined.** The cream/teal/coral + Fraunces look in CLAUDE.md §14 came from the first tournament's printed sheet and matches the brief's "reflexive premium" anti-pattern. The platform chrome becomes quiet; each event is the star. Nacho's embroidered logo and an accent stay as *that event's* personalization. CLAUDE.md §14 is superseded by `DESIGN_DIRECTION.md` once phase 2 lands.
- **Voice.** UI copy: calm, precise, a little dry, correct golf vernacular, no exclamation marks, no filler. Personality lives only in the live feed's commentary, kept light and correctly phrased. (Supersedes CLAUDE.md §14 "light roasting".)
- **Screenshots are committed** under `design/shots/{before,after,design}` as 1.5× JPEGs capped at 3200 px tall, so the audit and every later pass can be checked without running anything.
- **Fixtures ship.** `/t/_/<fixture>` routes (`src/dev/`) render the real screens on in-memory tournaments in every data state. They are unlinked, read-only and touch no database. They exist so states the Ensayo does not cover (4 and 60 players, finished, long names) can be reviewed on a phone.
- **Formats.** The engine has Stableford only (plus modules). The leaderboard row is designed format-agnostic (primary figure slot: points, to-par, putts, money, team total, holes-up) but only the existing figures are implemented. Gross to-par on the scorecard and a "Puntos / Gross" toggle are display-only derivations from `HoleResult.gross` and `par`; match play is a documented slot, not a feature.
- **Icons.** No emoji as UI. One inline SVG set (`src/components/icons.tsx`, 24-px grid, single stroke weight) in phase 2; no icon dependency.
- **Dark mode.** Not global. TV and Ceremonia use a dedicated board surface with its own tokens; phone screens are light-only because they are used in sunlight.
- **Fonts.** Phase 1 adds `@fontsource-variable/archivo` (one variable file with a width axis serves narrow numeric columns and normal text; ~90 KB woff2 for the Latin width+weight file, self-hosted so it works offline). Fraunces stays for one role (the event name). Instrument Sans is removed in phase 2.

## Decisions (2026-09-27, evening)

- **Direction A approved** ("La tarjeta"). PR #11 (phases 0–1) squash-merged. Phase 2 lands on `main` as soon as its PR is green, and so does each phase-3 PR: production shows the transitional look in between (only the Ensayo tournament lives there; the real one is in April 2027). No integration branch.
- **Phase 2 mechanics.** Tokens moved to `:root` with a `LEGACY` alias block (old names → new) so the 30 screen stylesheets keep resolving; the block shrinks in phase 3 and disappears with the last consumer. Global class names were kept and restyled, so every screen picked up the system without edits. `src/design/primitives.tsx` and `icons.tsx` moved to `src/components/`; `ui.tsx` keeps the behavioural pieces and re-exports `Field` and `Segmented`. `Avatar` stays in `ui.tsx`; the honoree crown is a ring in the event accent. The old `Wordmark` component wraps the new typographic one.
- **App icon.** A constructed geometric "G" with the pencil ring, drawn as SVG paths by `scripts/make-icons.mjs` from the token file (a text glyph would depend on system fonts at build time). The in-app wordmark sets the same idea in Archivo.
- **Chart and confetti colors** come from tokens at runtime (`src/lib/tokens.ts`): `--chart-1..12` for series, `--event-accent` / `--board-accent` / `--under` / `--surface-2` for celebrations.
- **Event accents.** Six curated values in `src/design/accents.ts`; the admin shows them as swatches and maps any legacy free-form color to the nearest one for display. The column and its stored values are unchanged.

## Phase 3, PR 1: first impression (2026-09-28)

- Home leads with one line on what Cardi-Golf does, then the returning player's tournament (name + one primary button), then the code field, then organizers as a quiet link, then the install steps as a ruled footer. No hero, no numbered cards, no dark block.
- Entrar is the event name (serif, logo, accent rule), one instruction, the grid. Above 16 players the grid goes to two dense columns and gets a name filter. The PIN step sits under a heavy rule with one primary action.
- The event accent now sets `--event-accent` (primary button, my row, the rule under the event name), never the platform `--accent`. Stored values map to the nearest curated swatch: the Ensayo's old teal reads as "Agua"; Diego can pick "Fairway" in Comité, Torneo.
- Organizer sign-in: one primary path; magic link and password reset are two quiet buttons on one line; sign-up is a switch under a hairline. Busy labels change ("Entrando…"). The render-time `navigate()` moved into an effect (logged bug, fixed here because the screen was rewritten).
- Reset: an anonymous or expired session now sees "Este enlace ya no sirve" with a link to sign in, instead of the sign-up confirmation copy.

## Phase 3, PR 2: En vivo (2026-09-28)

- The shell header is one line: small logo, the event name in the serif, and a live dot only when Realtime is subscribed (an "off" or "connecting" state shows nothing, per the logged note). The tab bar follows the primitives: 56 px, icon in the event accent when active.
- (2026-10-01, #87.) While the boards may be old, the phone's copy or no signal, the header's chip says so in a word or two («Sin señal», «Conectando…», under 18 characters) and a second line under the event name says how old they are («Actualizado hace 2 días»; offline, the holes still on the phone first). The age used to ride in the chip («Conectando, guardado ayer, 7:49 a.m.», 31 to 39 characters), which cut the event name to «Nach…» at 375 px. The age is the server data's: a hole saved on the phone leaves it. While that line shows, En vivo's status line leaves «Actualizado» to it.
- En vivo opens with a status line ("Día 2, en juego", then the lead group's hole and "Actualizado hace n min"), then the honoree as one ruled row, then the board. Flags and warnings are single caution lines with an icon, not chips.
- The board is `Board` + `BoardHead` + `LeaderRow`: position with T-ties, name with tier, money and owner initials on the sub line, today's figure, holes played ("F" when finished), and the primary figure large. Rows re-sort once in 200 ms with an ease-out, no spring. Above 20 players the rows go dense.
- Puntos / Gross toggle (when the tournament has handicaps): gross is strokes to par over the holes actually played, pick-ups excluded, derived in the screen from `HoleResult.gross` and `par`; the gross view sorts ascending and computes its own T-labels. Display only; the engine's ranking is untouched. Red under par, blue over par, "E" for even.
- `tournamentStore.updatedAt` (additive, display only) stamps every applied snapshot so the board can say when it last changed.
- The feed is a ruled list with an icon per kind; a lead change is bold with the icon in the event accent, no yellow fill. The TV variant keeps the board tokens.
- `e2e/smoke.mjs` now tolerates a group already on its last hole (the Ensayo has been advanced by every run) and reads today's points from the board cells.

## Phase 3, PR 3: Tarjeta (2026-09-28)

- One hole per screen and the whole foursome on it: the hole number is the largest thing (56 px), par and stroke index beside it, chevrons to move. Each player is a ruled row: name, stroke dots, the live points as text ("3 pts, birdie neto", red from a net birdie up), then the strokes stepper (defaults to par, par shown quiet), the putts stepper and "Levantó" as a pressed toggle. No cards, no badges.
- Save moves on and offers "Deshacer" in the toast instead of asking first; the unusual-value check (10+ strokes, 5+ putts) stays as a sheet because the rules ask to confirm those. Signing a card uses a sheet instead of the browser confirm.
- The sync state ("Sincronizado", "n pendientes", "Sin señal", or the outbox's last error) sits under the save button and under the grid, in the caution color when not clean.
- Grid view is the classic card: holes down (1 to 18 regardless of the group's start hole), par and SI columns, players across with the pencil notation on gross and the points beneath, Ida, Vuelta and Total rows with points and gross, a dash for missing holes, the current hole marked. The first column is pinned on horizontal scroll.
- The engine's net-score names used golf English ("eagle neto"), and the screen swapped in "águila" with a one-line display mapping. Since 2026-10-01 (#84) the engine writes «águila neta» itself and the mapping is gone.

## Phase 3, PR 4: Juegos and Jugador (2026-09-28)

- Juegos opens on one ruled row per enabled game: the label, who leads and with what figure, and what is at stake on the right (first prize, per day, per group, or the Calcutta pot). Tapping a row opens that game; the game tabs scroll and never wrap.
- Every standings table (individual, pairs, best round per day, fewest putts) is the same `Board` / `LeaderRow` as En vivo, with money on the sub line. Countback explanations sit under the individual board as "Desempate" triggers.
- The Calcutta is a statement: the pot as one large figure, the five slots as ruled rows with the amount as the "how" trigger, and owners with value, invested and return on one line each.
- La Víbora: per day and group, a ruled block with the state on the right (in play with the pot, pending in the caution color, settled), four compact player cells with the holder marked by the snake in the event accent (a 250 ms tween, no spring), passes as a numbered list.
- Jugador: name, tier and "1º, 60 pts, por el 29" on one line; the handicap as one sentence with its explanation; each round on `ScorecardGrid` (notation on gross, putts and points rows, Ida/Vuelta/Total) where tapping a hole opens that hole's breakdown; pair, owners, money and stats as ruled sections.
- `ScorecardGrid` gained `putts`, `showPutts` and `onHole`; `HowCalculated` lost its inline styles and exports a controlled `ExplanationSheet`.
- `e2e/smoke.mjs` nudges the first player's strokes down when it can and up otherwise, so repeated runs on the Ensayo stop bottoming out.

## Phase 3, PR 5: Dinero (2026-09-28)

- The bank is a statement, not an alarm: "Entró al banco" and "Sale del banco" as two figures under a heavy rule, the verdict on the right ("Cuadra al peso" in the accent; "Por asignar" in the caution color while prizes are open, and in the under-par red only once the tournament is final and still does not balance).
- Each person is a ruled row with the net as the figure (signed, red when negative); "Pagó x, recibe y" is the sub line; tapping opens the breakdown as aligned lines with the prize amounts as "how" triggers.
- The settlement is two ruled lists: "Quién debe qué" (who, to whom, what for, the amount, "Pagado" for admins) and the transfers, vía banco or sin banco, with paid payouts greyed and marked with a check instead of faded by opacity.
- One "Compartir" (the image) plus the text share when the device supports it; no camera glyph.

## Phase 3, PR 6: Organizer (2026-09-28)

- **Mis torneos** is grouped by what needs the organizer now: "En juego" (live and auction), then "En preparación", then "Terminados" at reduced emphasis. One ruled row per tournament: logo, name, status and code, and the Comité button beside the row instead of a link inside a link (the nested-anchor bug is fixed here; the duplicate rows that came from two organizer rows for one tournament are de-duplicated on screen, the query bug stays logged above).
- **The wizard** shows progress as a four-segment rule plus "Paso n de 4, Nombre", not a row of chips. Templates are ruled radio rows with a check on the selected one; the player count moved into the games step because it drives the prize balance. Step 3 is a **summary** (name, template, games, players, entry and pot) followed by the prize statement, so the organizer reads the money before creating; the full editor opens under "Ajustar reglas y premios" only if they want to change something.
- **Prize statement** (`PrizeSummary`) is shared with the Comité settings editor: one line per enabled game with its detail, the total, the entry pot, and "Cuadra" or the difference in red. It replaces the green/coral card.
- **Created state** leads with the join code as the biggest figure on the page, then the link, copy and share, then "Ir al Comité".
- ~~Logged, not fixed: the per-line detail strings come from the engine (`prizeCheck.ts`) and print raw numbers ("$10000") rather than formatted money.~~ Fixed in cleanup PR 2 (2026-09-28): the engine formats thousands itself, without Intl.

## Phase 3, PR 7: Comité (2026-09-28)

- **Width.** The Comité column widens to 960px (the player screens stay at 560) and from 760px the sections become a sticky side column; Grupos and the auction console go two-column there, the hole grid shows the two nines as two rows.
- **Badges from the engine.** The nav reads `state.flags`: Tarjetas carries tiebreaks + discrepancies (red) + unsigned cards, Rondas the unfinished rounds, Torneo the warnings. Calcutta and Parejas hide when their module is off.
- **Tarjetas is the inbox.** Every flag across every round is one ruled row with the action beside it (answer the tiebreak, keep or restore, "Ver"); the player picker is grouped by group. Empty states for no rounds, no players, no card.
- **Busy and confirm.** Status tabs, banker and new code show busy (new code asks first). Rounds: finish, cancel and delete ask in a sheet that also says how many items are pending in Tarjetas; per-round busy. Groups: leaving a day with a draft asks; the draw asks before replacing Day 1 groups and can skip its animation (timers are now cleared on unmount). Delete a player or course asks in a sheet, not `confirm()`.
- **Search** above the player list, the group picker (unassigned first) and the bidder grid once the list is long; the count is on the heading.
- **One row style** (`Admin.module.css`) for players, courses, handicaps, lots, group members; the figure (handicap, price) right-aligned in the condensed width. Tiles (faces, bidders, holes) share one pressed/selected/disabled treatment.
- `AdminAuction.module.css`, `AdminPlayers.tsx` and `AdminScores.module.css` left the no-literal-colors PENDING list.
- ~~Logged, not fixed: SettingsEditor's `defaultValue` inputs (tiers, prize lists, pairing) still do not reflect a realtime reload~~ Fixed in the input pass: every numeric field is the controlled `NumberField`, so a realtime reload lands — except while the box has the caret, which is deliberate. The pairs row is still cramped at 360px.

## Phase 3, PR 8: TV, Ceremonia, Imprimir, share, Estadísticas, Reglamento, Más (2026-09-28)

- **TV and Ceremonia** use the board palette only: ruled rows on `--board-rule`, the leader on `--board-surface` with the plate accent on the position, the bid and the pot as the only `--board-accent` figures, the event name in Fraunces. No translucent rgba blocks, no wave.
- **Share cards** are card stock: the event name over a heavy rule, ruled rows, figures in the condensed width, birdie and zero holes tinted with the soft accent and the soft red; the footer is the date and the wordmark.
- **Imprimir** keeps pure ink-on-white through tokens (`--ink`, `--surface-2`, `--surface`).
- **Estadísticas**: awards as ruled rows with the value as the figure on the right (no cards), the moment and the cursed hole as two plain rows, the race chart with hairline grid and ink axes, the course bars in ink-3 with the hardest hole red and the easiest green.
- **Reglamento** drops the numbered sections and the wave; each section is a heading over a heavy rule. **Más** is a ruled list of links, the code as a figure, one identity row.
- The `Wave` component, the LEGACY alias block in `tokens.css` and the no-literal-colors PENDING list are gone: every stylesheet resolves against the tokens directly, and the test now fails on any literal outside `tokens.css`, `accents.ts` and the fixtures.

## Rename to Polo (2026-09-28)

- Diego renamed the product from Cardi-Golf to **Polo**. Changed: `t.app.name`, the page title and iOS home-screen title, the PWA `name`/`short_name`, the share-card footer (now reads `t.app.name`), and the `Wordmark` (the pencil ring moved from the "G" to the "P").
- **Logo (same day).** Diego approved a scorecard-grid symbol, replaced it with the sheet in `design/brand/polo-logo-sheet.jpg` (a cursive P in pencil beside "Polo"), and asked for the app to look exactly like it. Two attempts failed: a hand-drawn approximation, and a traced outline filled with a cleaned-up texture, which flattened the pencil into a grey band with hard edges. So nothing is redrawn now; the sheet's own pixels are used:
  - `scripts/brand/extract-logo.py` (one-off; Python with numpy, scipy, OpenCV, Pillow and potracer) takes each copy from the sheet for its own use: the app-icon tile for the icons, the Horizontal Lockup's symbol for the app's lockup, and the TV study's gold symbol for the board. For each one it separates the pencil from what it sits on, pixel by pixel, at 4x (`design/brand/layer-icon.png`, `layer-lockup.png`, `layer-board.png`). Alpha is how much graphite covers the paper (or gold covers the board green), and the colour is un-mixed from it, so composited on the same paper the layer gives back the sheet's pixels: the grain, the double pencil lines, the dark edges and the soft edge. Only the red annotation arrows and a faint smudge inside the icon's bowl are left out.
  - The script also traces the icon copy's outline with potrace, for the favicon (solid `--ink`, enlarged so it reads at 16 px) and to size the maskable icon inside Android's circle (0.804). It also measures the tile's corner radius (12.6%) and both lockups against their P, in cap heights: `standard` (the Horizontal Lockup) has the symbol image 1.40 tall, 0.25 below the baseline, with a 0.133 gap; `board` (the TV study, which the sheet draws larger) has 1.72, 0.36 and 0.234. All of this goes to `src/design/logoMark.json`.
  - `npm run icons` (`scripts/make-icons.mjs`, sharp) composites the icon layer on `--bg` for the PWA icons, and writes the two lockup layers at 3x as `public/brand/polo-mark.png` and `polo-mark-board.png` (35 and 49 KB, precached).
  - `LogoMark` and `Wordmark` use the copy and the proportions of their tone. The lettering is Archivo at weight 740, width 98% and −0.015em tracking, the best of about 750 renders scored against the sheet's wordmark (95.3% overlap). Rendered at the sheet's scale, both lockups sit on the sheet's own to within a pixel. Home shows the lockup one step larger (`lg`) so it reads as it does on the sheet.

- **Icon caching.** iOS kept showing the old flag icon after the logo shipped, because Safari caches a site's touch icon by URL and does not refetch it when the file changes. `vite.config.ts` now adds a fingerprint of each icon's bytes to its URL (`?v=…`) in `index.html` and in the manifest, so any new icon is a new URL. The service worker ignores `v` when looking up its precache, so the icons still work offline. Nothing to bump by hand: `npm run icons` changes the bytes, the build changes the URLs.

## Profiles, PR 2: accounts, profile, Mi Polo (2026-09-28)

- **The index is the hero figure** of a profile: label and rounds on the left, the number at `--fs-4xl` in the condensed width on the right, between the heavy rule under the hero and a hairline. Without an index the figure is omitted (a large dash read as a rule) and the line says «Sin índice todavía»; the owner also gets one sentence on how it is computed.
- **Hero** is the photo at 88 px, the display name, `@handle`, then club and city on one line. No cover image, no card.
- **Tournaments without a logo** get their initial in a ruled square (`EventMark`) instead of an empty box, which read as a checkbox.
- **Mi Polo** (home for accounts): the hero links to the profile; a settings control (two sliders, not a gear) opens the editor; «¿Eres tú?» proposals are ruled rows with the two answers inline; then «En juego», «Próximos», «Jugados» as ruled rows (the player you are there, and «Organizas» when you run it); the join code and the organizer links stay at the bottom.
- **Entrar** is one field and one code, like the organizer sign-in. When the device holds a player, the title becomes «Guarda tu perfil» and the lede names the player and the tournament. Google, when on, is a secondary button above a hairline divider, with Google's own mark (its four brand colors are tokens used only there).
- **Más**: anonymous players see «Tu perfil» with one line and a secondary button; an account that holds the player only by PIN sees «Guardar este torneo en mi perfil»; a profile-linked account's «Cambiar de jugador» becomes «No soy yo», confirmed in a sheet.
- New icons: person, people, bell, search, calendar, home, settings.
- Fixtures: `/p/_/yo`, `/p/_/nuevo`, `/p/_/extrano`, `/p/_/manual`; shots `design/shots/after/perfil--*.jpg`.

## Status bar (2026-10-01, PWA-02)
- **The installed iPhone app uses the default status bar** (`apple-mobile-web-app-status-bar-style=default`). The system draws an opaque bar above the page, and the page starts below it. From iOS 15 the bar takes `theme-color`, so it is most likely fairway green with white icons. With `black-translucent`, the page drew under white icons that vanished on the cream paper, and the sticky header slid under the clock once you scrolled.
- **Any top inset still reported gets a band of paper behind the bar** (`.shell::before`, as tall as `--safe-top`), for example on a translucent bar elsewhere or a notch. The tournament header sticks at `top: var(--safe-top)`, below the band.
- **The TV and Ceremonia boards sit above that band** (z-index 7) and keep their content below the inset.
- **Proof:** `e2e/fixtures/statusbar.spec.ts` emulates a 59 px inset.
- **Still to check on a real iPhone** (`docs/handoff.md`):
  - the bar's colour;
  - whether a copy installed before this change picks the new bar up or needs to be removed and re-added;
  - iOS 26's glass edge.

## Money in columns, and «Ya pagaron» (2026-10-01, VIS-01, UX-21)
- **A row owns its columns.** A screen composes the row primitives and never re-declares what it composes. Both rules are one class, so the bundle's order picks the winner, and the screens' `display: grid` had lost to `rowLine`'s `display: flex` on La Calcutta, the Matrimonios head-to-head and the Liquidación.
- **The convention.**
  - The text block composes `rowTextBlock` and takes the free width.
  - The amount composes `rowFig`: right-aligned, tabular, never wrapped.
  - A control sits in `rowAction`: one 8rem slot on every row of a list that has one, left empty on a line that cannot be marked yet.
  - So every amount in a list ends on one edge, and every button starts on one.
- **Guards.** `src/styles/one-row.test.ts` refuses a re-declaration. `e2e/fixtures/money.spec.ts` measures the rows on every Juegos tab, every Dinero mode and the Comité inbox. The inbox keeps its tighter gap with a two-class rule (`.inbox .inboxRow`), which wins wherever the bundle puts `rowLine`.
- **State and action are two words.** «Marcar pagado» is the action. «Pagado», with its check and pressed, is the state, shown in «Ya pagaron»: a folded list of every payment on record. It sits under «Quién debe qué» while the tournament runs, and under the settlement once it is final. Its rows read in the past («Leonel pagó a Banco») and a step quieter (`--ink-2`, the amount at 500).
- **Taking a payment back.** A tap on «Pagado» writes the same row with paid false, and nothing else. Both directions offer «Deshacer».

## Terms (decided once; `src/i18n/es-MX.ts` follows them)

| Concept | Term | Not |
|---|---|---|
| Strokes received | golpes de ventaja; column "Ventaja" | puntos de ventaja, Vent. |
| Handicap | hándicap, hándicap de juego, hándicap base, hándicap de campo | Hcp, PH |
| Stroke index | índice de golpe (SI); table header "SI" | índice de dificultad |
| WHS index | índice | |
| Gross / net | gross, neto | bruto |
| Under / over par names | birdie, águila, albatros; "neto" when net; par, bogey, doble o peor | eagle, ceros |
| Pick-up | Levantó; grid abbreviation "L", explained in the legend | ↑ |
| Holes played | "Hoyo" as a column header, "por el n" in prose; "F" when finished | Thru |
| Starting hole | hoyo de salida, "Salida por el n" | Sale por el n |
| Entry pot / Calcutta pot | bolsa / pozo (two pots, two words) | mixed |
| Scorecard | tarjeta | score, scores |
| Statistics | estadísticas | stats |
| Link | enlace | link |
| Countback | desempate por los últimos hoyos | countback |
| Versus | contra | vs, vs. |
| A plus handicap | +1.2 in a handicap's own place («Índice +1.2»); −1.2 in an explanation's arithmetic, said once («se escribe +2») | -1.2 |
| Day-2 cut | recorte del día 2 | anti-sandbag |
| Kept as vernacular | Stableford, putts, tee, rating, slope, par, Calcutta, martillazo, "¡Vendido!" | |

Voice rules: no exclamation marks outside `feed` and the auctioneer's "¡Vendido!"; no middle dots as separators (sentences, commas or a second line instead); no arrows or symbols in copy; no jokes outside `feed`; buttons under 24 characters, chips under 18.

~~Engine explanation strings (`src/engine/core/*.ts`, `src/engine/modules/*/index.ts`) still use "→" and " · " and English score names ("eagle neto").~~ Fixed in cleanup PR 2 (2026-09-28): commas and words instead of glyphs. The English net-score names went too in #84 (2026-10-01): the engine writes «águila neta».

**Enforced (2026-10-01, COPY-24).** The rules drifted back (39 middle dots, arrows, «1º», straight quotes, "eagle", "score", "slot", «pozo» for the snake), so `src/lib/copyRules.test.ts` now reads every string in `es-MX.ts`, what the engine writes for the golden tournament and every fixture (explanations, labels, board text, the Reglamento, the catalog), and the string literals in the rest of `src`. It fails on a middle dot, an arrow, straight quotes, an ordinal without its period (`ordinal()` writes «1.º»), a hyphen used as a minus (`withTrueMinus`, `toParText`, `formatMoney` all write «−»), a name list joined by hand or with commas only (`t.common.andList`, `t.common.orList`: «Iván e Hilario», «Camilo u Óscar»), and the «Not» column above. It also reads the API routes' messages and the push worker, runs the term table on every string with a space in it outside code, and computes a probe tournament with plus handicaps, a cut larger than the handicap and a net below zero, so the handicap and points arithmetic is read too. The engine names net scores in Spanish too («águila neta»): nothing read the English names after all. «Pozo» is the Calcutta's word only; the snake is paid from the bolsa.

## Throwaway organizer account

`scripts/design-organizer.mjs` creates `design-shots@cardi-golf.invalid` (password in `.env.local`, never committed) and makes it an admin of the Ensayo tournament so "Mis torneos" and the wizard can be screenshotted signed in. Remove it with `node scripts/design-organizer.mjs --remove`. It has no access to any other tournament.

## Logged, not fixed

Logic or product issues found while auditing; they are not design work and were not changed silently.

- ~~`listMyTournaments` (`src/data/api.ts:52`) returns one row per `tournament_organizers` row visible to the account, so a tournament with an owner and an admin shows twice in "Mis torneos" for the admin (`design/shots/before/organizer--my-tournaments.jpg`). Fix: de-duplicate by tournament id (keep the highest role).~~ Fixed in cleanup PR 3: organizers read only their own `tournament_organizers` rows.

- ~~`TournamentShell` shows "Conectando…" while `realtime` is `connecting` **or** `off`; on fixtures and before the first subscription this reads as a problem when nothing is wrong. Suggest treating `off` as a neutral, hidden state (phase 2 will render the chip differently but the state machine is unchanged).~~ Fixed in cleanup PRs 1 and 4: `off` shows the cached-snapshot time, never "Conectando…".
- ~~`LiveScreen` derives money per player by summing `state.prizes` in the component; the engine already exposes `state.money.people[id].prizesTotal`. Not a bug, but two sources of truth for the same number.~~ Fixed: the row reads `state.money.people[id].prizesTotal`.
- `ScorecardScreen` grid headers use `displayName` sliced to fit; long display names truncate to six characters. Data issue: `display_name` has no length guidance in the admin form.

Found by the organizer/admin line-level audit (Appendix C of `DESIGN_AUDIT.md`). All are behaviour, not visuals; phase 3 may touch the ones marked (UI) because the fix is in the component and changes no data or engine code, the rest wait for a separate PR.
- ~~`MyTournamentsScreen.tsx`: a `Link` ("Comité") is nested inside the row `Link`; nested anchors are invalid HTML. (UI)~~ Fixed in phase 3.6: the two links are siblings.
- ~~`OrganizerLoginScreen.tsx`: `navigate()` is called in the render body instead of an effect. (UI)~~ Fixed in phase 3.1: it runs in an effect.
- ~~`ResetPasswordScreen.tsx`: with no session it shows `t.auth.needsConfirmation` ("Revisa tu correo para confirmar la cuenta…"), the wrong message for an expired reset link.~~ Fixed in phase 3.1: an expired link says so (`t.auth.resetExpired`).
- ~~`AdminAuction.tsx:58`, `AdminDraw.tsx:90`, `PlaceholderScreen.tsx:7`: the module-off guard shows `t.live.comingSoon` = "Llega en el siguiente milestone." (copy pass)~~ Fixed: the copy reads "Este juego no está activo en este torneo."
- ~~`AdminDraw.tsx`: the reveal timers (700ms per pair) are never cleared, so a redraw during a reveal races the old timers; saving the draw overwrites Day 1 groups and flips status to `live` with no confirmation.~~ Fixed: timers are cleared (phase 3.7) and the draw is one confirmed transaction (`save_draw`, cleanup PR 3).
- `AdminGroups.tsx`: switching the day tab discards unsaved drafts silently; `.chip` (28px) holds a 32px `Avatar size="sm"`.
- ~~`AdminRounds.tsx`: start/finish/reopen/cancel have no busy guard, so a double tap fires twice; the date is rendered as raw ISO; a new round defaults to `courses[0]` before courses load.~~ Fixed: per-round busy (phase 3.7), formatted date, start guards (cleanup PR 3).
- ~~`AdminTournament.tsx`: status tabs, banker select and "Nuevo código" write immediately with no busy state or success feedback.~~ Fixed in phase 3.7: busy state and a toast; the new code comes from `rotate_join_code` (cleanup PR 3).
- ~~`SettingsEditor.tsx`: tiers, prize lists and the pairing rule are `defaultValue`/`onBlur` inputs, so they do not reflect a realtime reload of `settings`; invalid entries are dropped silently.~~ Fixed in the input pass: the numeric fields are `NumberField`, which is controlled, clamps on blur instead of dropping, and only accepts an outside value while it does not have the caret.
- `useCourses.ts`: no `loading` flag and `error` is never read by `AdminCourses` or `AdminRounds`.
- `AdminPlayers.tsx`: a `playersWithPin` failure is swallowed.
- `AdminData.tsx`: CSV export triggers two downloads back to back; browsers may block the second.
- `AdminScores.tsx`: tiebreaks and disputes are filtered to the selected round; pending items in other rounds are invisible. `AdminGroups.tsx` re-derives pair warnings the engine already exposes in `flags.warnings`. Nobody reads `flags.incompleteRounds`, `unsignedCards` or `missingModules`.
