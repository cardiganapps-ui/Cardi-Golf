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
