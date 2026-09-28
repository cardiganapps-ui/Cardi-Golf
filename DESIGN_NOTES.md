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
- En vivo opens with a status line ("Día 2, en juego", then the lead group's hole and "Actualizado hace n min"), then the honoree as one ruled row, then the board. Flags and warnings are single caution lines with an icon, not chips.
- The board is `Board` + `BoardHead` + `LeaderRow`: position with T-ties, name with tier, money and owner initials on the sub line, today's figure, holes played ("F" when finished), and the primary figure large. Rows re-sort once in 200 ms with an ease-out, no spring. Above 20 players the rows go dense.
- Puntos / Gross toggle (when the tournament has handicaps): gross is strokes to par over the holes actually played, pick-ups excluded, derived in the screen from `HoleResult.gross` and `par`; the gross view sorts ascending and computes its own T-labels. Display only; the engine's ranking is untouched. Red under par, blue over par, "E" for even.
- `tournamentStore.updatedAt` (additive, display only) stamps every applied snapshot so the board can say when it last changed.
- The feed is a ruled list with an icon per kind; a lead change is bold with the icon in the event accent, no yellow fill. The TV variant keeps the board tokens.
- `e2e/smoke.mjs` now tolerates a group already on its last hole (the Ensayo has been advanced by every run) and reads today's points from the board cells.

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
| Day-2 cut | recorte del día 2 | anti-sandbag |
| Kept as vernacular | Stableford, putts, tee, rating, slope, par, Calcutta, martillazo, "¡Vendido!" | |

Voice rules: no exclamation marks outside `feed` and the auctioneer's "¡Vendido!"; no middle dots as separators (sentences, commas or a second line instead); no arrows or symbols in copy; no jokes outside `feed`; buttons under 24 characters, chips under 18.

Engine explanation strings (`src/engine/core/*.ts`, `src/engine/modules/*/index.ts`) still use "→" and " · " and English score names ("eagle neto"). The engine is out of scope for the redesign; logged for a separate PR. `HowCalculated` renders them as-is.

## Throwaway organizer account

`scripts/design-organizer.mjs` creates `design-shots@cardi-golf.invalid` (password in `.env.local`, never committed) and makes it an admin of the Ensayo tournament so "Mis torneos" and the wizard can be screenshotted signed in. Remove it with `node scripts/design-organizer.mjs --remove`. It has no access to any other tournament.

## Logged, not fixed

Logic or product issues found while auditing; they are not design work and were not changed silently.

- `listMyTournaments` (`src/data/api.ts:52`) returns one row per `tournament_organizers` row visible to the account, so a tournament with an owner and an admin shows twice in "Mis torneos" for the admin (`design/shots/before/organizer--my-tournaments.jpg`). Fix: de-duplicate by tournament id (keep the highest role).

- `TournamentShell` shows "Conectando…" while `realtime` is `connecting` **or** `off`; on fixtures and before the first subscription this reads as a problem when nothing is wrong. Suggest treating `off` as a neutral, hidden state (phase 2 will render the chip differently but the state machine is unchanged).
- `LiveScreen` derives money per player by summing `state.prizes` in the component; the engine already exposes `state.money.people[id].prizesTotal`. Not a bug, but two sources of truth for the same number.
- `ScorecardScreen` grid headers use `displayName` sliced to fit; long display names truncate to six characters. Data issue: `display_name` has no length guidance in the admin form.

Found by the organizer/admin line-level audit (Appendix C of `DESIGN_AUDIT.md`). All are behaviour, not visuals; phase 3 may touch the ones marked (UI) because the fix is in the component and changes no data or engine code, the rest wait for a separate PR.
- `MyTournamentsScreen.tsx`: a `Link` ("Comité") is nested inside the row `Link`; nested anchors are invalid HTML. (UI)
- `OrganizerLoginScreen.tsx`: `navigate()` is called in the render body instead of an effect. (UI)
- `ResetPasswordScreen.tsx`: with no session it shows `t.auth.needsConfirmation` ("Revisa tu correo para confirmar la cuenta…"), the wrong message for an expired reset link.
- `AdminAuction.tsx:58`, `AdminDraw.tsx:90`, `PlaceholderScreen.tsx:7`: the module-off guard shows `t.live.comingSoon` = "Llega en el siguiente milestone." (copy pass)
- `AdminDraw.tsx`: the reveal timers (700ms per pair) are never cleared, so a redraw during a reveal races the old timers; saving the draw overwrites Day 1 groups and flips status to `live` with no confirmation.
- `AdminGroups.tsx`: switching the day tab discards unsaved drafts silently; `.chip` (28px) holds a 32px `Avatar size="sm"`.
- `AdminRounds.tsx`: start/finish/reopen/cancel have no busy guard, so a double tap fires twice; the date is rendered as raw ISO; a new round defaults to `courses[0]` before courses load.
- `AdminTournament.tsx`: status tabs, banker select and "Nuevo código" write immediately with no busy state or success feedback.
- `SettingsEditor.tsx`: tiers, prize lists and the pairing rule are `defaultValue`/`onBlur` inputs, so they do not reflect a realtime reload of `settings`; invalid entries are dropped silently.
- `useCourses.ts`: no `loading` flag and `error` is never read by `AdminCourses` or `AdminRounds`.
- `AdminPlayers.tsx`: a `playersWithPin` failure is swallowed.
- `AdminData.tsx`: CSV export triggers two downloads back to back; browsers may block the second.
- `AdminScores.tsx`: tiebreaks and disputes are filtered to the selected round; pending items in other rounds are invisible. `AdminGroups.tsx` re-derives pair warnings the engine already exposes in `flags.warnings`. Nobody reads `flags.incompleteRounds`, `unsignedCards` or `missingModules`.
