# Cardi-Golf — Design audit (phase 0)

Blunt inventory of every screen before the redesign. Facts point at code (`file:line`) or at a before-shot in `design/shots/before/` (390×844 at 1.5×, plus a 1024-wide pass for setup screens and 1280×720 for TV and Ceremonia). Data states come from the in-memory fixtures in `src/dev/fixtures.ts`, reachable at `/t/_/<fixture>` in any build:

| Fixture | State |
|---|---|
| `minimal4-setup` | 4 players, 1 round, Individual only, not started |
| `minimal4-live` | same, round live, players through 9–11 holes |
| `full12-live` | 12 players, every module, day 2 live; a snake tiebreak pending, a disputed hole, an unsigned card |
| `full12-finished` | same, both rounds finished, tournament finished, payments partly marked |
| `pairs8` | 8 players, Individual + Parejas + Mejor ronda, no Calcutta, no snake |
| `large60` | 60 players, 15 groups, 2 rounds, Individual + Víbora + Menos putts, day 2 live |
| `longnames` | 12 players with 30–40-character names, a 70-character tournament name, long pair and course names |

Home, Entrar and the organizer screens need a real session and were shot against the Ensayo tournament with a throwaway organizer account (`scripts/design-organizer.mjs`).

## How to read this

Each screen: **who** it is for, **the 2-second need** (what the person must know before they look away), and **what gets in the way**. Opinions are marked as such only where the fact is not self-evident. Cross-cutting findings are at the end and count more than any single screen.

---

## 1. Home `/` — `src/screens/HomeScreen.tsx`
Shot: `home--first-run.jpg`, `home--returning.jpg`.
- **Who:** a player with a code, or an organizer.
- **2 seconds:** where do I type the code; or, for a returning player, "take me back to my tournament".
- **In the way:** a hero (wordmark, tagline, description, wave) above the fold before any action; three cards numbered `01`/`02`/`03` for things that are not a sequence (`HomeScreen.tsx:48,73`, `InstallGuide.tsx`), the third a dark teal block with a sun-yellow heading; the returning-player button ("Volver a…") is squeezed between the hero and the cards, not the first thing. The code input uses the display serif with letter-spacing (`.codeInput`), so typed codes look like a headline, not a field.
- **Keep:** the six-character code path is right; one field, one button.

## 2. Organizer login / reset — `OrganizerLoginScreen.tsx`, `ResetPasswordScreen.tsx`
Shot: `organizer--login.jpg`, `organizer--reset.jpg`.
- **Who:** organizer.
- **2 seconds:** email, password, go.
- **In the way:** a segmented "Entrar / Crear cuenta" plus a magic-link option makes three flows compete on one screen; labels are tracked-out uppercase eyebrows (`.label`, `global.css:73`); the wordmark repeats the Home hero. Nothing says what Cardi-Golf is on this screen for a first-time organizer arriving by link.

## 3. Mis torneos — `MyTournamentsScreen.tsx`
Shot: `organizer--my-tournaments.jpg`, `--desktop.jpg`.
- **Who:** organizer.
- **2 seconds:** which tournament is live now, open it.
- **In the way:** the signed-in email sits under the title as body text; each tournament is a row (logo, name, "En juego · Código ENSAYO", a "Comité" button) where the status is a middle-dot string and the join code is set in the display serif inside running text; live, upcoming and past are not separated. Empty state is one sentence with no action inline. On desktop the list stays phone-width.
- **Logged (not design):** the same tournament appears twice for an account that is an admin of a tournament with two organizer rows (`listMyTournaments` joins `tournament_organizers` without de-duplicating by tournament). See `DESIGN_NOTES.md`.

## 4. Nuevo torneo (wizard) — `NewTournamentScreen.tsx`
Shot: `organizer--new-1.jpg` … `new-3.jpg`, desktop variants.
- **Who:** organizer.
- **2 seconds:** what step am I on, what do I type.
- **In the way:** the step indicator is four chips in three colors (sun for done, teal for current, outline for next) that read like tags (`NewTournamentScreen.tsx:66`); step 2 ("Juegos") already offers two templates as cards, which is the right idea, but step 3 ("Dinero") then exposes the full settings editor (every prize, module and auction parameter) instead of a summary with an "advanced" reveal; there is no summary before "Crear". Long tournament names are not previewed anywhere. On desktop the form stays phone-width.
- **Keep:** the template step and the prize-pool balance check; the check should become the summary, not a red line.

## 5. Entrar — `EnterScreen.tsx`
Shot: `entrar--faces.jpg`, `entrar--pin.jpg`.
- **Who:** player, first open on the course or the night before.
- **2 seconds:** find my face, tap, PIN.
- **In the way:** event name in the display serif with the wave underneath, then an "Toca tu cara" heading, then the grid: three headings before the grid. Faces are large avatars with a tier badge under each; with 60 players this is 20 rows of scrolling with no search. Honoree gets a crown emoji stuck on the avatar (`ui.tsx:19`). PIN step: the PIN field is the serif display numerals again.
- **Keep:** the flow itself (face → PIN, session sticks) is the right frictionless design.

## 6. Shell (header + tab bar) — `TournamentShell.tsx`
Visible on every tournament shot.
- **Who:** everyone.
- **2 seconds:** which tab am I on; is the app connected.
- **In the way:** the sticky header spends 60px on the event name (truncated at ~26 characters: "Nacho's Bachelor Invitati…", `longnames--live.jpg` shows "Torneo Anual de Anivers…") plus a status word and a sync chip that reads "Conectando…" for as long as Realtime is not subscribed — including permanently on fixtures and on flaky signal — so the most prominent chip on the screen is a worry. Tab bar uses emoji as icons (`TournamentShell.tsx:8-12`: ⛳️ ✏️ 🐍 💸 •••), rendered differently per OS; label size 0.72rem.

## 7. En vivo (leaderboard, the flagship) — `LiveScreen.tsx`
Shots: `full12-live--live.jpg`, `large60--live.jpg`, `longnames--live.jpg`, `minimal4-*--live.jpg`, `pairs8--live.jpg`.
- **Who:** every player between shots; the spectator on the TV.
- **2 seconds:** where am I, who leads, by how much, and how far along.
- **In the way, in order of damage:**
  1. **The score is not the loudest thing.** Each row has six competing elements: position, avatar, name + tier badge + owner initials, a stacked "THRU 11 / HOY 25" block with 0.55rem labels (`LiveScreen.module.css:95`), the total, and a yellow money chip. The money chip (sun on cream) is the highest-contrast element in the row; the total is a 1.5rem serif numeral squeezed between it and the thru block.
  2. **Owner initials ("NI·DI", "MA·DI")** are unreadable to anyone but the owner; they take the sub-line that should say something useful.
  3. **Names truncate at nine characters** (`longnames--live.jpg`: "Cristóba…", "Maximili…") because the grid gives the name column `minmax(0,1fr)` next to fixed 52/40px columns (`LiveScreen.module.css:24`). At 60 rows the same truncation hits ordinary two-word names ("Federic…", "Bernardo…").
  4. The honoree spotlight is a dark teal block with a crown emoji and a 10-word sentence joined by middle dots ("10° · 44 pts · Hoy 8 · Hoyo 9: 0 pts") above the board, so the board starts below the fold on a 844px phone.
  5. Chips row ("Día 2 · En juego", "Grupo puntero en el hoyo 11", coral "4 víboras pendientes") is three pills of three different colors before the content.
  6. No "updated N min ago", no live indicator other than the header chip; movement arrows are 0.6rem glyphs (`▲▼`) hidden under the position.
  7. The feed below the board uses a bird emoji per line and exclamation marks ("¡Rodrigo hizo águila en el 6!", four in a row in `full12-live--live.jpg`).
  8. 4-player state (`minimal4-live--live.jpg`) looks like an empty page: four rows, then the feed.
- **Keep:** `T3` tie labels, the row tap → player sheet, animated re-sorting (but only once, not springs).

## 8. Jugador (player sheet) — `PlayerSheet.tsx`
Shot: `full12-live--live--player-sheet.jpg` (viewport).
- **Who:** anyone checking one player.
- **2 seconds:** his position and both rounds.
- **In the way:** a bottom sheet holding six stacked cards (identity, handicap, both rounds as dense tables, pair/owners, money, stats); the per-round table shows strokes received, gross, net, points and putts per hole in five rows of 0.7rem numerals, with no birdie/bogey notation; "¿Cómo se calculó?" buttons are ghost links inside cards. Long names wrap the header onto three lines.

## 9. Tarjeta (score entry, the most-used action) — `ScorecardScreen.tsx`
Shots: `full12-live--tarjeta.jpg`, `--tarjeta--grid.jpg`, `large60--tarjeta.jpg`, `longnames--tarjeta.jpg`, `minimal4-setup--tarjeta.jpg`.
- **Who:** the player keeping the group's card, one-handed, in sun.
- **2 seconds:** which hole, whose turn, tap the number.
- **In the way:**
  1. **Four players do not fit on one screen.** Each player is a 250px card (avatar, name, stroke dots, two labeled pill steppers, a "Levantó" pill, a yellow points badge), so a foursome is 2.3 screens tall and the save bar sits at the bottom of the third (`full12-live--tarjeta.jpg`). Entering a hole is scroll-tap-scroll-tap.
  2. Steppers default to par (good) but the numeral is 1.7rem inside a pill with 48px −/+ buttons; the number is smaller than the buttons.
  3. The hole header is a dark teal block with "HOYO 12" as a 0.72rem eyebrow above "Par 4 · SI 2"; the hole number, the one thing you must know, is the smallest text in the block.
  4. Points badge ("3 pts · birdie neto") in sun yellow on every card: four yellow pills per hole.
  5. **Grid view** (`--tarjeta--grid.jpg`) is closer to right (points big, gross small, missing holes tinted) but column headers truncate at six characters ("IGNACI", "NICOLÁ"), the missing-hole tint is a pink wash, and there is no par/SI row, no front/back split, no notation.
  6. "Sincronizado" chip repeats the header's sync state.
- **Keep:** 48px targets, par default, the tiebreak prompt, the offline outbox (already resilient: writes queue in IndexedDB and flush on reconnect — `src/data/outbox.ts`).

## 10. Juegos — `GamesScreen.tsx`, `SnakeBoard.tsx`
Shots: `full12-live--juegos--*.jpg` (six tabs), `pairs8--juegos--*.jpg`, `large60--juegos--*.jpg`.
- **Who:** players following side games.
- **2 seconds:** who is winning this game, what is at stake.
- **In the way:** a segmented control with six pills scrolls horizontally on a phone; each tab is a different layout (table / cards / list) with different number styles; the Calcutta tab opens on a dark pot card (good instinct, wrong weight) and lists owners with "invirtió $1,500 · +340%" middle-dot strings and money in three sizes; the snake tab uses an emoji on the holder's avatar and a coral "Pendiente · hoyo 5" chip; Mejor ronda shows a table per day with the winner not visually separated; Menos putts is a plain table. Money appears as chips in some tabs and as plain text in others. At 60 players the Individual tab is a 60-row table with no sticky header.

## 11. Dinero — `MoneyScreen.tsx`
Shots: `full12-live--dinero.jpg`, `--dinero--liquidacion.jpg`, `full12-finished--dinero*.jpg`.
- **Who:** every player (what do I owe / get), the banker.
- **2 seconds:** my net, and whether the bank balances.
- **In the way:** the bank card is a solid coral block whenever prizes are still provisional (i.e. the whole tournament), so the screen opens on an alarm; "Compartir" and "📸 Compartir liquidación" are two share buttons in the title row; per-person rows show net in the serif with a +/− and teal/coral color, but "Pagó $3,500 · Recibe $5,845" is a middle-dot string; the settlement lists "Andrés → Banco $3,405" with arrow glyphs and an unpaid/paid state that only differs by opacity.
- **Keep:** the explanation objects behind every prize; the vía banco / sin banco split.

## 12. Stats y premios — `StatsScreen.tsx`
Shots: `full12-live--stats.jpg`, `large60--stats.jpg`.
- **Who:** the dinner table.
- **2 seconds:** who won what.
- **In the way:** awards are eight identical cards; the "moment" and "cursed hole" are a dark card and a coral card; the race chart has a 12-color legend and a 60-line spaghetti at 60 players; the course section draws 18 bars with 0.6rem labels; the per-player table needs a 900px horizontal scroll.

## 13. Reglamento — `RulesScreen.tsx`
Shot: `full12-live--reglamento.jpg`.
- **In the way:** `01`–`09` numbers with a wave under every heading; otherwise fine copy. Acceptable as a numbered rules sheet (a real sequence), but the wave motif and serif headings go with the old brand.

## 14. Más — `MoreScreen.tsx`
Shot: `full12-live--mas.jpg`.
- **In the way:** an "ENTRASTE COMO" eyebrow card, a primary Comité button, four emoji buttons (📊 📜 📺 🏆), a code card with two buttons, the install guide, then four more buttons. A settings dump, not a screen.

## 15. Modo TV — `TvScreen.tsx`
Shots: `*--tv.jpg` (1280×720).
- **Who:** the villa TV from four metres.
- **2 seconds:** leader and top five.
- **In the way:** it is the closest screen to the goal already (dark board, big figures), but the rows carry the same six elements as the phone (tier badge, thru, today, total) and 12 rows do not fit at 720p; the yellow position column and the feed's emoji icons stay; on Calcutta night the layout is right but the "at stake" list uses ad-hoc labels.

## 16. Ceremonia — `CeremonyScreen.tsx`
Shots: `*--ceremonia.jpg`.
- **In the way:** emoji as the step icon (🥄 🎯 🐍 🔥 💍 🥈 🥉 🏅 🏆 🔨 💸), springs and delays on every reveal, three confetti bursts; the money summary is a list of `+$/−$` in seafoam/salmon on dark teal (contrast fails).

## 17. Imprimir — `PrintScreen.tsx`
Shot: `full12-live--imprimir.jpg`, `large60--imprimir.jpg`.
- **In the way:** functional; hard-coded `#000/#fff/#f3f3f3` (`PrintScreen.module.css`), an emoji on the print button, and no front/back nines split. This is the one screen that already looks like a scorecard and should become the reference for the app's scorecard.

## 18. Comité (admin) — `AdminLayout.tsx` + 11 sections
Shots: `full12-live--admin-*.jpg`, `large60--admin-*.jpg`, `longnames--admin-*.jpg`, desktop variants.
- **Who:** the organizer at the villa on a laptop, or on the phone at the course fixing a score.
- **2 seconds:** which section, what is wrong (pending tiebreaks, unsigned cards, disputes).
- **In the way:** an 11-pill horizontal nav that scrolls off-screen after "Rondas" on a phone (`AdminLayout.module.css`); every section is stacked `.card` blocks with eyebrow labels; forms use inline styles for spacing in 11 files (`AdminPlayers.tsx` has 11 `style={{}}`); tables (`AdminScores`, `AdminGroups`) do not use the 1024px width on desktop; the auction console (`AdminAuction.tsx`) mixes a dark lot card, a 4-column bidder grid of avatars, three bid buttons, a number input and a coral "Borrar la subasta" ghost link; the draw uses a ring emoji and spring reveals; the danger zone (delete tournament) is on the same page as the name field. Nothing surfaces the flags the engine already computes (`state.flags`: incomplete rounds, pending tiebreaks, unsigned cards, discrepancies) as the section's first line.
- **Keep:** the settings editor's validation, PIN management, and the data/backup section's plainness.

---

## Cross-cutting findings

### Hierarchy
- Every screen opens with 2–3 layers of chrome (header, chips, spotlight card) before its content; the leaderboard's first row starts at ~430 CSS px on a 844 px phone (`full12-live--live.jpg`).
- Numbers are set in the display serif at 1.05–1.7rem inside pills and cards, so they never dominate; the loudest elements are yellow chips and coral alerts.
- Four accent hues fight (teal, deep teal, coral, sun) plus seafoam avatars; nothing is reserved for "live" or "mine".

### Density and scale
- 4 players: pages look empty (`minimal4-live--live.jpg`, `minimal4-setup--*`).
- 60 players: lists work but every row costs 64px with a shadowed card container, the segmented Juegos table has no sticky header, Stats' race chart is illegible, Entrar is 20 rows of avatars.
- Long names: truncation at 9 characters on the board, 6 in the grid header, 3-line headers in the sheet, event name cut at 26 characters in the shell header (`longnames--*.jpg`).

### Inconsistency
- Three visual languages for the same thing: money as a sun chip (board), plain serif with sign (Dinero), grey small text (Juegos › Calcutta).
- Labels: uppercase tracked eyebrows in 41 places, bold sentence-case in others, `01/02` numerals on Home and Reglamento.
- Containers: `.card` (shadow, 14px radius), `.card--cell`, `.list` (shadow), `.board` (shadow), segmented pills (shadow on the selected pill), sheet (22px radius) — five radii/shadow combinations for the same "group of things".
- Icons: emoji from four different Unicode blocks plus text arrows (`← → ↑ ↓ ↶ ▲ ▼ ▶ ■ ✓ ✕`), which render per-OS and cannot be sized or colored.
- Motion: Motion springs (`stiffness 260–400`) on the leaderboard, draw and ceremony; CSS fade/slide on sheets; a spinner for loading; nothing shared.

### Generic patterns (anti-slop list hits)
- Cream background + display serif + coral accent: the current brand is the "reflexive premium look" the brief names.
- Card kit: content chopped into rounded, shadowed cards on 20 of 29 screens.
- Tracked-out ALL-CAPS eyebrows: `.label` in 41 places; `01/02/03` markers on Home.
- Middle-dot meta strings: 10 in `es-MX.ts`, 20 more composed in TSX.
- Arrows appended to buttons: "Siguiente →", "← Anterior" (Ceremonia), "↶ Deshacer".
- Emoji as UI in 20 files; decorative crowns, birds, snakes, cameras.
- Badges and pills everywhere: 23 `chip` usages, tier badges on every row, points badges on every stepper card.
- Springs/bounce and fade-slide on most transitions; three confetti bursts.
- Filler and exclamation marks: 91 `!`/`¡` in `es-MX.ts` (feed, toasts, headings); jokes in empty states ("Sí, cómo no").
- Hard-coded values: 39 hex/rgba literals in 13 CSS modules outside `tokens.css`; 10 in TS/TSX (confetti colors, chart palette, print, share card); ~120 inline `style={{}}` across 28 files.

### Tokens, type, spacing
- `tokens.css` has colors, two fonts, three radii, one shadow, one duration. No type scale, no spacing scale, no semantic colors (under/over par, live, success), no elevation levels, no border tokens.
- 30+ distinct font sizes in use, mixing rem, px and vh; spacing values 2–24px ad hoc.
- Tabular numerals only where `.num` is applied; totals, money and hole numbers use it inconsistently (`HOY 25` uses `.num`, table cells often do not).
- No true minus/"E" convention (no to-par display exists yet); money uses `formatSignedMoney` with a true minus (good).

### Contrast (measured, WCAG)
| Pair | Ratio | Verdict |
|---|---|---|
| ink `#12343B` on paper `#F7F1E3` | 11.8:1 | AAA |
| muted `#4F6166` on paper | 5.8:1 | AA (fails AAA for scores) |
| muted on panel `#EFE5CF` | 5.2:1 | AA, weak in sun at 0.72rem |
| white on teal `#0F6E77` | 6.0:1 | AA |
| ink on sun `#F2B63F` | 7.3:1 | AA |
| white on coral `#B04327` | 5.7:1 | AA |
| deep `#0B4F57` on seafoam `#A9DCD8` (avatars) | 6.1:1 | AA |
| seafoam on deep (TV/ceremony secondary) | 6.1:1 | AA |
| salmon `#F0A58F` on deep (ceremony negatives) | 4.6:1 | AA borderline |
| sun on deep (TV positions) | 5.1:1 | AA |
Label sizes of 0.55–0.72rem uppercase push AA pairs below readable in sunlight regardless of ratio.

### Loading, empty, error
- Loading: a text spinner ("Cargando…") in the gate and every lazy screen; no skeletons; the leaderboard pops in with a layout shift when the store resolves.
- Empty: one sentence, sometimes a joke, rarely an action (Mis torneos, Juegos › Calcutta, Stats).
- Error: `ErrorBox` is a coral card with "Algo salió mal" + raw error text; toasts show raw Supabase messages.

### Formats and modules (what the system must flex across)
- Individual Stableford is the only scoring format; the leaderboard's primary figure is points. Pairs (sum of points), best round (per day), snake (holder per group), fewest putts, Calcutta (owners/payouts) are modules toggled per tournament. The redesign must make one row component serve points, putts, money and team totals, and leave a slot for to-par and holes-up without implementing new formats.

### Logged, not fixed (logic and product notes for `DESIGN_NOTES.md`)
- The header sync chip reads "Conectando…" until Realtime subscribes; on fixtures (`realtime: 'off'`) it never resolves. A redesign should treat `off` as a neutral state.
- `EnterScreen` marks the honoree with an avatar crown but the tier badge shows for everyone even in tournaments without tiers (`tier` is null, so it hides; fine) — no bug, noted for the design.
- Print cards show tee times with seconds (fixed in M7) but rely on `state.core` per-hole strokes received; fine.

---

## Appendix A — Styling inventory (line level, for phase 2)

Scope: everything under `src/`, `api/`, `scripts/`, `public/`, excluding `src/design/**`, `src/dev/**` and `src/styles/tokens.css`. The tokens file defines 3 radii (8/14/22px), one shadow, one duration and one ease; there is no font-size or spacing scale. Only the two confetti calls and CSS using `var(--dur)` respect `prefers-reduced-motion`; no `motion` component checks it, nor do the fixed-ms animations in `ui.module.css`.

### A.1 Hard-coded colors in CSS (39)
| File:line | Value | Where |
|---|---|---|
| `src/styles/global.css:196` | `#fff` | `.btn--danger` text |
| `src/styles/global.css:303` | `#fff` | `.toggle` knob |
| `src/styles/global.css:362`, `:370` | `#fff` | `.chip--teal`, `.chip--coral` text |
| `src/components/ui.module.css:6` | `rgba(0,0,0,.3)` drop-shadow | `.crown` |
| `src/components/ui.module.css:12` | `rgba(11,79,87,.45)` | `.backdrop` |
| `src/components/ui.module.css:87`, `:93`, `:94` | `#fff` | `.errorBox` text, button, border |
| `src/components/ShareCard.module.css:146` | `#f1d9d1` | `.zero` row |
| `src/screens/HomeScreen.module.css:27` | `#fff` | `.warn` |
| `src/screens/admin/AdminAuction.module.css:16` | `rgba(255,255,255,.08)` | `.bidBox` |
| `src/screens/admin/AdminScores.module.css:29` | `rgba(242,182,63,.2)` | `.disputed` |
| `src/screens/tournament/CeremonyScreen.module.css:86`, `:92`, `:130`, `:142` | white @8%, sun @18%, white @6%, `#f0a58f` | `.winner`, `.champion`, `.listRow`, `.neg` |
| `src/screens/tournament/FeedTicker.module.css:37` | white @6% | `.big .item` |
| `src/screens/tournament/PlayerSheet.module.css:18`, `:21` | sun @25%, coral @10% | `.birdie td`, `.zero td` |
| `src/screens/tournament/PrintScreen.module.css:2,3,18,35,48,60,70,82,86` | `#fff`, `#000` ×6, `#333` ×2, `#f3f3f3` | print sheet (legitimately monochrome, but should still be tokens) |
| `src/screens/tournament/ScorecardScreen.module.css:102`, `:127`, `:139` | `#fff`, coral @12%, sun @30% | `.pickupOn`, `.missing`, `.disputed` |
| `src/screens/tournament/SnakeBoard.module.css:26`, `:36` | coral @8%, drop-shadow | `.holder`, `.snake` |
| `src/screens/tournament/TvScreen.module.css:62,105,128,152,218` | white @6% ×4, coral @35% | rows, `.snakeGroup`, `.holder`, `.lot`, `.sold` |

### A.2 Hard-coded colors in TS/TSX and assets
- `src/screens/tournament/CeremonyScreen.tsx:159` and `ScorecardScreen.tsx:199`: confetti palettes (`#0F6E77 #F2B63F #B04327 #A9DCD8 #F7F1E3`).
- `src/screens/tournament/ScorecardScreen.tsx:291`: `#8a5a00` disputed hint.
- `src/screens/tournament/StatsScreen.tsx:15`: 12-color chart `PALETTE` (used at `:165`, `:173`); `:115` `#fff`; `:163` Recharts tooltip inline style.
- `src/screens/tournament/LiveScreen.tsx:74`, `MoneyScreen.tsx:96`, `src/screens/admin/SettingsEditor.tsx:181`: `#fff` on coral alert cards.
- `src/screens/admin/AdminPlayers.tsx:296`: `rgba(255,255,255,.15)`; `AdminTournament.tsx:22`: default accent `#0F6E77`.
- `src/lib/shareImage.ts:8`: fallback `#F7F1E3`.
- `scripts/make-icons.mjs:8–11`, `scripts/seed-ensayo.mjs:82`, `public/favicon.svg:3–12`, `index.html:9` (theme-color), `vite.config.ts:30–31` (manifest colors): all carry the old teal/paper palette and must be regenerated from the new tokens.

### A.3 Inline styles (~120)
Full list by file: `HowCalculated.tsx:12,18,20`; `ui.tsx:40,65`; `HomeScreen.tsx:76`; `NotFoundScreen.tsx:7`; `AdminScores.tsx:88,108,197`; `AdminRounds.tsx:75,81,168`; `SettingsEditor.tsx:48,56,181,190,195,216,250`; `AdminCourses.tsx:212,214,218,252,256,275`; `AdminHandicaps.tsx:75,83`; `AdminPlayers.tsx:152,154,155,251,253,272,285,286,294,296,326`; `AdminGroups.tsx:171,177,178,202,227`; `AdminDraw.tsx:98`; `AdminLayout.tsx:39`; `AdminAuction.tsx:79,157,160,162,166,171,185,186,214,237,255`; `AdminTournament.tsx:119,154,182,192,212,218`; `CourseEditor.tsx:85,132,138`; `TournamentShell.tsx:23,28`; `EnterScreen.tsx:42`; `TvScreen.tsx:47`; `LiveScreen.tsx:74,94,95,98`; `MoreScreen.tsx:25,53,56`; `StatsScreen.tsx:108,115,163,173,183,200`; `ScorecardScreen.tsx:69,291,293,300,303,350`; `GamesScreen.tsx:88,92,109,113,207,210,214,224,240,244,246,253`; `MoneyScreen.tsx:96,99,102,108,109,124,128`; `PlayerSheet.tsx:67,74,148,172,185,194,220`; `ResetPasswordScreen.tsx:32`; `MyTournamentsScreen.tsx:29,53`; `OrganizerLoginScreen.tsx:75`; `NewTournamentScreen.tsx:61,65,100,141,144,147`.
Patterns worth a class instead: `{ display: 'block' }` on `.help` (22 times); `{ padding: 10|12|14 }` on `.card` (13 times); `{ '--accent': accent }` (3, legitimate, keep); `{ height: … }` bar height in `StatsScreen.tsx:200` (dynamic, legitimate); `{ textDecoration: 'none' }` on link buttons (4).

### A.4 Magic numbers in CSS
- **font-size**: 26 distinct rem values (0.55, 0.6, 0.65, 0.7, 0.72, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2, 2.2, 2.6 rem and `0.9em`), 11 px values (ShareCard export, body 17px), 15 vh values (TV: 2 to 11vh), 6 `clamp()` forms (Ceremony). Smallest text: `0.55rem` at `LiveScreen.module.css:96` and `PrintScreen.module.css:80`; `0.6rem` at `LiveScreen:52`, `PrintScreen:68`, `StatsScreen:92`.
- **border-radius**: `999px` ×9, `var(--radius)` ×7, `var(--radius-sm)` ×6, literal `8px` ×3 (same value as the token), plus 12, 18, 24, 6, 3, 2 px, `22%`, `50%` ×3, and vh radii ×7 on TV.
- **shadows**: `var(--shadow-card)` ×6; `0 0 0 2px var(--cell)` at `GamesScreen.module.css:21`; two `drop-shadow` filters.
- **padding**: 60 distinct values (0–32px, 2vh–3vh, `4px !important` at `PrintScreen.module.css:55`, `0 14px 12px 70px` at `MoneyScreen.module.css:14`).
- **gap**: 2px ×11, 4px ×8, 5px ×1, 6px ×17, 8px ×20, 10px ×13, 12px ×9, 14px ×2, 16px ×5, 18px ×2, 20px ×1, plus vh/vw on TV. A 4/8 scale would absorb every value but 5, 6, 10, 14, 18.

### A.5 Emoji and glyphs used as UI (complete)
- Nav: `TournamentShell.tsx:8–12` `⛳️ ✏️ 🐍 💸 •••`.
- Feed: `FeedTicker.tsx:23` `🐦 👑 🐍 🤵`. Avatar honoree: `ui.tsx:19` `👑`.
- Buttons: `ShareCard.tsx:49` `📸`; `AdminAuction.tsx:70` `🎩`, `:84–88` `↑ ↓` (also as aria-labels), `:221` `↶`, `:224` `🔨`, `:242` `→`, `:247` `↶`; `AdminDraw.tsx:105,152` `👑`, `:118` `👑`, `:134,144` `💍`; `AdminGroups.tsx:183,191` `✕`; `AdminHandicaps.tsx:93` `✕`; `SettingsEditor.tsx:216` `✓`; `CeremonyScreen.tsx:239,243` `← →`; `PrintScreen.tsx:37,41` `←`, `🖨`; `StatsScreen.tsx:139` `■ ▶`, `:188` `🪦`, `:193` `🍰`; `MoreScreen.tsx:36–46` `📊 📜 📺 🏆`; `MoneyScreen.tsx:106` `✓`, `:166,196` `→`, `:201` `✓`; `GamesScreen.tsx:58` `⇄`, `:46,175` `Σ`; `ScorecardScreen.tsx:279` `Σ`, `:322,333` `‹ ›`; `PrintScreen.tsx:71` `Σ`; `RulesScreen.tsx:21` `↔`; `LiveScreen.tsx:136` `▲ ▼`.
- Ceremony step icons: `CeremonyScreen.tsx:44,50,62,82,91,101,105,113,140` `🥄 🎯 🐍 🔥 💍 🥈 🥉 🏅 🏆 🔨 💸`; `:221` `🏆`.
- Snake: `SnakeBoard.tsx:47`, `TvScreen.tsx:113,127` `🐍`. TV: `TvScreen.tsx:232` `→`.
- i18n: `es-MX.ts:133` `⋮`, `:536` `🔨`, `:552` `💍`, `:574` `→`, `:583` `›`, `:601` `▶`, `:641` `σ²`, `:732` `•`.
- Functional and kept: stroke dots `•` (`AdminPlayers.tsx:297`, `ScorecardScreen.tsx:351`, `PrintScreen.tsx:117`, `PlayerSheet.tsx:125`), true minus `−` (`money.ts:21`, `ScorecardScreen.tsx:422`, `PlayerSheet.tsx:85`, `AdminHandicaps.tsx:79`).
- Placeholders: `·` empty cell (`ShareCard.tsx:124`, `AdminScores.tsx:179`, `ScorecardScreen.tsx:269`); `–` en dash ×9; `—` em dash (`AdminRounds.tsx:82`). Pick one.

### A.6 Motion (every instance)
- Springs: `AdminDraw.tsx:142` (260/18, scale+rotate), `LiveScreen.tsx:123–129` (400/36 layout), `SnakeBoard.tsx:46` (300/24 layoutId), `TvScreen.tsx:198` (300/14 bid pop), `CeremonyScreen.tsx:211` (220/16 reveal).
- Fades/slides: `FeedTicker.tsx:36` (x −16), `TvScreen.tsx:62,66` (y ±20, 400ms), `:211` (scale 1.15), `CeremonyScreen.tsx:195,203,213,230` (y ±30, stagger 0.6s per winner).
- Confetti: `CeremonyScreen.tsx:160–162` (three bursts), `ScorecardScreen.tsx:199` (birdie).
- CSS: `ui.module.css:17` fadeIn 160ms, `:28` slideUp 220ms, `:77` spin 800ms, `:117` toast 200ms; `global.css:171–178` button transition + `scale(.97)`, `:292–304` toggle, `:516–518` `.fade-in`.
- Timers: `TvScreen.tsx:40` rotate every 12s; `StatsScreen.tsx:62` race replay 250ms/hole.

### A.7 Global class usage (literal `className` tokens)
`card` 47 (21 files) · `card--cell` 17 · `card--deep` 7 · `chip` 23 (`--teal` 11, `--sun` 9, `--coral` 8, `--outline` 5) · `tierBadge` 7 · `label` 42 · `section-num` 3 · `wave` 1 · `list` 16 · `listItem` 18 · `segmented` 8 · `btn--primary` 42 · `btn--secondary` 44 · `btn--ghost` 40 · `btn--danger` 1 · `num` 115 · `help` 90 · `muted` 31 · `small` 33 · `error` 8 · `fade-in` 2.
Reading: three button variants are used almost interchangeably (42/44/40), which is the visual-hierarchy finding in numbers. `help` (90) and `small` (33) and `muted` (31) are three names for "secondary text".

## Appendix B — Copy inventory (for the voice pass)

Scope: `src/i18n/es-MX.ts` (line numbers below refer to it unless a file is named), TSX literals, and user-visible strings inside `src/engine/**` (explanations, labels, score names) which are not in the i18n file at all. The file header (`es-MX.ts:3`) declares the old voice: "fun, light roasting, never mean".

### B.1 Exclamations
- `:108` `¡Torneo creado!` (h2, `NewTournamentScreen.tsx:139`); `:515` `¡Vendido!` (auction, vernacular, keep); `:590` feed `¡… hizo águila…!`; `:591` feed `¡Cambio de líder!` (feed, keep); `:708` `Fin. ¡Salud!` (h2); `:722` `¡Campeón!`. `:214` uses `!` as a glyph for disputed holes (`ScorecardScreen.tsx:270`).

### B.2 Middle dots (" · ") as separators
- i18n: `:100`, `:141`, `:226`, `:577`, `:674`, `:682`, `:694`, `:714`, `:715`, `:718`.
- Engine (user-visible): `src/engine/modules/snake/index.ts:160`, `bestRound/index.ts:67`, `individual/index.ts:80`.
- TSX (≈80): `ShareCard.tsx:86,111,118,139,145`; `AdminScores.tsx:93,116,159,180,187`; `AdminRounds.tsx:82,158`; `SettingsEditor.tsx:185`; `AdminCourses.tsx:215,253,277`; `AdminHandicaps.tsx:77–79`; `AdminPlayers.tsx:158,208,291,293,323`; `AdminGroups.tsx:228`; `AdminDraw.tsx:104,105,151,152`; `AdminAuction.tsx:158,164,243`; `LiveScreen.tsx:86,100–102,144`; `MoreScreen.tsx:25`; `TvScreen.tsx:52,83,120,145,153,194`; `CeremonyScreen.tsx:50,63,82,92,101,105,221`; `StatsScreen.tsx:199`; `ScorecardScreen.tsx:70,234,328,329,352,356`; `GamesScreen.tsx:89,187,225,241,248`; `MoneyScreen.tsx:70,100,103,125,141,166`; `PrintScreen.tsx:59,60,90,97`; `PlayerSheet.tsx:68,69,98,101,153,161,179,187`; `MyTournamentsScreen.tsx:54`.

### B.3 Jokes, roasts, filler, anglicisms
- "Sí, cómo no" outside the feed: `:119` wrong PIN, `:232` no three-putts, `:244` no money yet, `:582` nothing owed. In the feed (allowed, rewrite as commentary): `:588`, `:593`.
- Playful copy elsewhere: `:746` 404 ("¿Te pasaste de hoyo?"), `:599` "Solo por la gloria", `:696` "Todo se paga antes de dormir" (rules, keep), `:10` marketing tagline, `:103` "Como el primer torneo", `:173` `comingSoon: 'Llega en el siguiente milestone.'` shown to users at `AdminDraw.tsx:90`, `AdminAuction.tsx:58`, `PlaceholderScreen.tsx:7` (remove).
- Award names (`:628–639`) and module labels are product names; keep, but stop Title-Casing generic nouns.
- Anglicisms: `Thru` (`:179`), `Stats` (`:245,260,597`), `Scores`/`Score` (`:279,425`), `Link` (`:88,354`), `countback` (`:675,678`), `anti-sandbag` (`:669`), `Hcp` (`:177,178`).

### B.4 Eyebrows and forced uppercase
- Source strings in caps: `:52` `CÓDIGO`, `:329` `ESTE`, `:468,730` `SI`, `PlayerSheet.tsx:110–115` headers.
- CSS forcing uppercase: `global.css:74–80` `.label`, `:436–440` `.table th`, `ShareCard.module.css:92–99`, `TvScreen.module.css:161–165`, `HomeScreen.module.css:37–42`.
- The 42 `.label` uses include every `Field` label (`ui.tsx:27`), so 48-character form labels render as tracked caps: `:359`, `:364`, `:386` (48 chars), `:383`, `:379`, `:380`, `:367`, `:545`, `:407`, `SettingsEditor.tsx:57,140`.

### B.5 Vernacular inconsistencies (one term each, decide once)
- Strokes received: "golpes de ventaja" (`:194,433,732`) vs "puntos de ventaja" (`:336`, wrong) vs "Vent." (`:237`).
- Pick-up: "Levantó" / "levantas la bola" / "hoyo levantado"; abbreviation "L" never explained (`ScorecardScreen.tsx:269`, `AdminScores.tsx:116,179`, `PlayerSheet.tsx:126`, `GamesScreen.tsx:187`); `ShareCard.tsx:124` uses `↑` instead.
- Eagle: "águila" (`:590,673`) vs "eagle" (`src/engine/core/stableford.ts:27,37`, surfaces at `ScorecardScreen.tsx:356`); the feed fires on a *net* eagle without saying so (`FeedTicker.tsx:13`).
- Gross/net: "Gross" (`:235`) with "Neto" (`:239`); "Birdies gross" (`:246,612,632`).
- Same idea, two labels: `:250` "Ceros" vs `:616` "Doble o peor"; `:248` "Pares netos" vs `:614` "Pares"; `:249` vs `:615` bogeys.
- Starting hole: "Hoyo de salida" (`:292`), "Sale por el n" (`:293`), "Salida por el n" (`:731`).
- Stroke index: "SI" (`:468,730`, headers), "índice de dificultad (SI)" (`:668`), "índices" (`:472,476`); collides with "Índice" = WHS index (`:418,421`).
- Handicap: "Hándicap" / "Hcp" / "Hcp de juego" / "hándicap de juego" / "hándicap base" / "hándicap de campo" (`AdminPlayers.tsx:291`).
- Pot: "Bolsa" (`:169,665,387`) vs "Pozo" (`:220,524,687,694,383`).
- "Campeón"/"Subcampeón" hard-coded in `TvScreen.tsx:219` and `src/engine/modules/auction/index.ts:85`, duplicating `:700`.
- "1 putt" vs "a un putt" (`:634`); "3-putt" in `snake/index.ts:112`.

### B.6 Long-string risks at 390px
- Buttons over 24 chars: `:68` (26), `:70` (31), `:71` (30), `:74` (25), `:286` (28), `:326` (25), `:337` (26), `:547` (34), `:196` (24), `AdminAuction.tsx:221` (22 + glyph), `PrintScreen.tsx:41`.
- Chips over 18 chars: `:181` "Grupo puntero en el hoyo n" (~26), `:182` "n víboras pendientes", `:228` "En juego: $600", `:446` (43) and `:447` (33) course-coverage chips that wrap (`AdminCourses.tsx:256`), `:141` offline banner (35), `:210/211` "Firmada y bloqueada".
- Headings over 30 chars: `:130` (32), `:528` (43), ceremony step titles with custom labels, `snake/index.ts:160` "La Víbora · Día 2 · Grupo 12".
- Table headers at 13+ columns: `StatsScreen.tsx:215–229` ("Hoyos con la víbora", "Pts en par 3 / 4 / 5").

### B.7 User-visible strings outside i18n (must move in the copy pass)
`SettingsEditor.tsx:57,70,74,140`; `AdminPlayers.tsx:158` (" · Comité"), `:291`; `ShareCard.tsx:86,139` ("Final"); `TvScreen.tsx:219`; `ScorecardScreen.tsx:327–329` ("Par", "SI", "y"); `PlayerSheet.tsx:110–115`; `AdminScores.tsx:180`; share text "entra con el código" in `AdminTournament.tsx:196`, `MoreScreen.tsx:58`, `NewTournamentScreen.tsx:150`; aria-labels `TournamentShell.tsx:39`, `AdminLayout.tsx:45`; `router.tsx:90` ("Modo TV"); engine explanation strings in `src/engine/core/handicap.ts:23,25,44,92,94`, `compute.ts:126`, `stableford.ts`, `money.ts:90`, `src/engine/modules/*/index.ts` (these use `→` and " · "; the engine is off-limits to this redesign, so the UI must format them or the change is logged for a separate PR).

## Appendix C — Organizer and Comité screens, line level

Scope: `src/screens/organizer/*`, `src/screens/admin/*`, the shared primitives they use. Facts unless marked *opinion*. Fixtures `large60` and `longnames` back the scale and long-name claims.

### C.1 Shared baseline
- `AppShell.module.css` caps `.main` at 560px with a 16px gutter. **There are no media queries in any organizer or admin file, nor in `global.css`.** The only wider surface is the CourseEditor sheet (`.sheetWide`, 760px).
- `.btn` 48px, `.btn--sm` 40px, `:active` scale .97, no `:hover` rules anywhere. Global `:focus-visible` is a 3px sun outline; `.input:focus` replaces it with a teal border. **No `:disabled` style for `.input`/`.select`.**
- `.listItem` 60px, `.chip` fixed 28px `nowrap`, `.segmented button` 40px (only `aria-selected` styled), `.toggle` 52×30, `.label` 0.72rem caps, `.help` 0.85rem.
- Toasts (2.8s) are the only error channel for almost every admin mutation.
- Engine `state.flags` (`incompleteRounds`, `pendingSnakeTiebreaks`, `unsignedCards`, `discrepancies`, `missingModules`, `warnings`): only `AdminScores` reads two of them; `LiveScreen` reads two; **nobody reads `incompleteRounds`, `unsignedCards` or `missingModules`.**

### C.2 Per screen
**Mis torneos** (`MyTournamentsScreen.tsx`): Wordmark + "Cerrar sesión", h1 + "Nuevo torneo", email as help text, list of Link rows (avatar, name, "status · Código XXXXXX", nested "Comité" button). Name wraps without ellipsis; no sort or grouping by status. **Bug:** a Link inside a Link (nested anchors). Empty/loading/error states exist; error has no retry.

**Nuevo torneo** (`NewTournamentScreen.tsx`): 4 step chips (teal current, sun done, outline future; not tappable). Step 1 name + tagline; step 2 two template cards as radio buttons (2px teal border is the only selected state, no `role`/`aria-pressed`); step 3 player count (local only, never persisted) + compact SettingsEditor; step 4 deep card with a 2.6rem join code, link with `break-all`, copy/share, "Ir al Comité". Templates: `full` = first tournament settings, 12 players; `minimal` = individual only, 8 players, tiers `[]`, 1 round, fee 0. Busy state only disables the button. Form renders before auth is `ready`.

**Login / Reset** (`OrganizerLoginScreen.tsx`, `ResetPasswordScreen.tsx`): a stack of 3–4 ghost buttons under one primary gives weak hierarchy. Busy only disables. **Bugs:** login calls `navigate()` in the render body; Reset with no session shows `t.auth.needsConfirmation`, the wrong message for an expired link.

**AdminLayout** (`AdminLayout.tsx`): "Comité" eyebrow + 1.5rem h1 (wraps at 30+ chars beside a `nowrap` button) + 10 pill NavLinks in a horizontal scroller with the scrollbar hidden and no fade or scroll-into-view (≈950px of pills in 560px). Calcutta and Parejas render even when their modules are off. `sections.payments` exists in i18n with no route. No badges. *Opinion:* the nav is the natural home for flag counts (Scores: discrepancies + tiebreaks + unsigned; Rondas: incomplete; Torneo: warnings).

**SettingsEditor** (`SettingsEditor.tsx`): 5 sections (Módulos as toggle cards, Reglas, Hándicap, Premios with the balance table, Calcutta). Three inputs (tiers, stableford prizes, pairs prizes) and the pairing rule are `defaultValue`/`onBlur` and **do not reflect external changes** after a realtime reload; invalid list entries are dropped silently; numeric inputs snap `0`/`NaN` back to defaults while typing. `.grid3` gives three numeric fields ≈100px each at 360px; labels wrap. Never exposed: `rounding`, `estimateWeights`, `tieFallback`, `spectatorLink`, `timezone`, `currency`, `individual.format`, adding/removing payout slots.

**Torneo** (`AdminTournament.tsx`): brand card (72px logo, name, tagline, native color input), status segmented, banker select, join code 1.8rem + "Nuevo código", link, full SettingsEditor, sticky save bar (`zIndex:4`), danger zone. **Status tabs, banker select and "Nuevo código" mutate immediately with no confirmation, busy state or success toast.** The 60-player banker select has no search. An invalid settings state is signalled only by the coral balance card, far from the sticky button.

**Jugadores** (`AdminPlayers.tsx`): header + "Agregar", flat list (avatar, unstyled row button with name + "tier · HCP n · (estimado) · Comité", PIN button ghost/secondary). Edit sheet: avatar upload, name/display/tier/tee, handicap segmented (manual / index / estimate), estimate = 3 cards × **4 inputs in one row** (cramped at 360px), deep preview card with 18 stroke chips at 0.7rem/24px, honoree/admin toggles, form guide, delete via native `confirm()`. PIN sheet 2rem input. **60 players = one flat list, no search, filter, count or grouping (~3600px).** HCP is plain help text, not `.num`. `playersWithPin` failure is swallowed.

**Campos** (`AdminCourses.tsx`, `CourseEditor.tsx`, `useCourses.ts`): Buscar / Foto / Manual buttons, list of courses (unstyled row button, "location · N tees · source", attribution at 0.75rem, coral Borrar). Search sheet with coverage chips forced to wrap (`maxWidth:150`). Import sheet with toggle-as-checkbox per tee. Draft sheet (760px) → CourseEditor: notes card, name/location, tee tabs + "+ Agregar tee", 2×2 tee fields, `<details>` paste, hole table with **36px inputs** (`CourseEditor.module.css`), validation list, Borrar tee (no confirm) / Cancelar / Guardar. `useCourses` has **no `loading` flag and its `error` is never read**, so the empty text flashes before the fetch and failures are invisible.

**Rondas** (`AdminRounds.tsx`): one card per round ("Día N", "Actual" chip, "date · course · N hoyos" with the **raw ISO date**, status chip) and up to 6 buttons in two rows, two of them coral ghosts side by side. **Empezar / Terminar / Reabrir / Cancelar mutate immediately with no confirmation or busy state** (double-tap possible). Tees sheet: 60 rows of selects, saves on change with no indicator. New round defaults to `courses[0]`, which may be unset before courses load.

**Grupos** (`AdminGroups.tsx`): day tabs, generator buttons, one card per group (time input 110px, start-hole select, ✕ without confirm), player chips as remove buttons (no confirm/undo), unassigned names as a coral paragraph, sticky save without `zIndex`. **Switching day tabs silently discards drafts.** **`.chip` is 28px but holds a 32px avatar (`Avatar size="sm"`), which overflows.** 30-char names in `nowrap` chips overflow the card. 15 groups ≈ 3k px. Picker sheet: 60 players, no search, not "unassigned first". Re-derives pair-composition warnings locally instead of reading `flags.warnings`.

**Hándicaps** (`AdminHandicaps.tsx`): day tabs, list rows with name + "Base · Campo · Día N: X pts · Corte −n" + a HowCalculated trigger (32px) wrapping the playing handicap **in a 1rem chip, not `.num`**, Editar, and ✕ **without `aria-label`**. **No empty state:** no rounds shows an empty segmented pill above an empty shadowed list box. *Opinion:* a table (Base / Campo / Corte / Juega) on wide screens.

**Scores** (`AdminScores.tsx`): tiebreak card (coral left border) and dispute card (sun left border) **filtered to the selected round only**, day tabs, a 60-player select with no group context, player summary + "Quitar firma"/"Sin firmar", a 6-column hole tile grid (64px tiles, gross 1.2rem `.num`, **points and putts at 0.65rem**, `.empty` opacity .6, no `:active`), edit sheet with a 3-column grid (strokes / putts / picked-up toggle squeezed). Tiebreak answers have no busy state. **Nothing renders when there are no rounds, no players, or the selected player has no row.** *Opinion:* 9 columns mirror the two nines; this screen should be the review inbox for all four flags across all rounds.

**Calcutta** (`AdminAuction.tsx`): module-off guard shows **"Llega en el siguiente milestone."** Phase 1: order list with ↑/↓ only (moving one player 30 places = 30 taps), "Abrir 1". Phase 2: pot chip (0.8rem), deep lot card (88px avatar, eyebrow, 1.5rem name, tier + hcp + pair, form guide), bid box with a 2.6rem sun figure, bidder grid `repeat(4,1fr)` of 68px cells (disabled = opacity .35 with the reason only in `title`), +inc/×2/×4/custom, "↶ Deshacer" + "🔨 Vendido" (no confirm), sold list ("Name → owner · recompra n%", ↶ with `title` only), "Reiniciar". Buyback sheet with segmented presets. **60 bidders = 15 rows of grid (~1.1k px) between the lot and the sale buttons; no search or recency.** *Opinion:* a two-pane console on desktop.

**Parejas** (`AdminDraw.tsx`): same wrong module-off copy. Existing pairs list, honoree face grid (`repeat(3,1fr)`, 84px, no `:active`), "💍 Sortear", animated reveal at **700ms per pair with no skip (30 pairs = 21s) and timers never cleared** (a redraw races the old ones). **Saving overwrites Day 1 groups without warning** and flips status to live. Pair card leaves ≈250px for the name input at 360px.

**Datos** (`AdminData.tsx`): four clean cards (export JSON/CSV, restore, print, duplicate). No inline styles. CSV export triggers two downloads in sequence (browsers may block the second). Restore has no progress indicator.

**Shared:** `HowCalculated` trigger 32px; `InstallGuide` hard-codes section number "03"; `OfflineBanner` is full-bleed deep/sun; `ShareCard` is a fixed 540px export where `.name` has no ellipsis, the 26px title wraps for long names, and a 60-row leaderboard renders ≈2.7k px tall (WhatsApp crops the preview).

### C.3 Flags coverage
| Flag | Surfaced | Should surface (*opinion*) |
|---|---|---|
| `pendingSnakeTiebreaks` | Scores, selected round only | Nav badge; all rounds; Rondas before "Terminar" |
| `discrepancies` | Scores, selected round + tiles | Nav badge; cross-round; Datos before export |
| `unsignedCards` | nowhere (Scores recomputes for one player) | Scores inbox; Rondas before "Terminar" |
| `incompleteRounds` | nowhere | Rondas live card; Scores player select |
| `warnings` | LiveScreen only; Grupos re-derives | Torneo / Rondas / Campos; Grupos from the engine |
| `missingModules` | nowhere | Torneo |

### C.4 Cross-cutting, ranked
1. No layout above 560px anywhere in admin.
2. No pressed state on any non-`.btn` control: list rows, unstyled row buttons, segmented, chips, hole tiles, bidder cells, faces, template cards, nav pills. No hover anywhere.
3. Immediate mutations without busy/confirm: status tabs, banker, join code, round start/finish/reopen/cancel, per-player tee, tiebreak answers, group chip removal, group ✕, draw save.
4. Errors only as toasts; missing loading/error for courses; missing empty states in Hándicaps and Scores.
5. No search in any 60-player list or select (six places).
6. Numbers inconsistent: `.num` at 1.2/1.8/2.6rem, playing handicap in a chip, HCP/pts/holdings as 0.65–0.85rem help text.
7. Wrong copy: "siguiente milestone" guards; reset-link message.
8. Accessibility: missing `aria-label` (Hándicaps ✕, Calcutta ↶), nested anchors, pickers without radio/pressed semantics, `role="tab"` without panels, targets under 40px (HowCalculated 32, CourseEditor inputs 36, stroke chips 24).
