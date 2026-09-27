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
- **Fonts.** Phase 1 adds `@fontsource-variable/archivo` (one variable file with a width axis serves narrow numeric columns and normal text; ~45 KB woff2, self-hosted so it works offline). Fraunces stays for one role (the event name). Instrument Sans is removed in phase 2.

## Throwaway organizer account

`scripts/design-organizer.mjs` creates `design-shots@cardi-golf.invalid` (password in `.env.local`, never committed) and makes it an admin of the Ensayo tournament so "Mis torneos" and the wizard can be screenshotted signed in. Remove it with `node scripts/design-organizer.mjs --remove`. It has no access to any other tournament.

## Logged, not fixed

Logic or product issues found while auditing; they are not design work and were not changed silently.

- `listMyTournaments` (`src/data/api.ts:52`) returns one row per `tournament_organizers` row visible to the account, so a tournament with an owner and an admin shows twice in "Mis torneos" for the admin (`design/shots/before/organizer--my-tournaments.jpg`). Fix: de-duplicate by tournament id (keep the highest role).

- `TournamentShell` shows "Conectando…" while `realtime` is `connecting` **or** `off`; on fixtures and before the first subscription this reads as a problem when nothing is wrong. Suggest treating `off` as a neutral, hidden state (phase 2 will render the chip differently but the state machine is unchanged).
- `LiveScreen` derives money per player by summing `state.prizes` in the component; the engine already exposes `state.money.people[id].prizesTotal`. Not a bug, but two sources of truth for the same number.
- `ScorecardScreen` grid headers use `displayName` sliced to fit; long display names truncate to six characters. Data issue: `display_name` has no length guidance in the admin form.
