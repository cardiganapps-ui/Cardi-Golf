# Cardi-Golf — Design direction (phase 1)

Two directions, both grounded in golf's own material culture rather than app aesthetics. One recommendation. The living style guide at `/design` renders the recommended one.

## Givens (both directions)

- **Product and event.** Cardi-Golf is the product; every tournament is an event with its own name. The product chrome (tab bar, headers, controls, tables) is consistent and quiet: ink on card stock, one accent. The event name is the only place expressive typography appears, and each event can carry one accent from a curated set. Nothing else changes per event.
- **Numbers are the hero.** Tabular lining figures everywhere a score or an amount appears. A true minus sign (−) for under par, "E" for even, `T3` for ties. Right-aligned numeric columns that line up to the pixel.
- **Light mode first**, designed for sunlight: AA everywhere, AAA for figures on the leaderboard and scorecard. TV and Ceremonia use a dedicated board surface (deep green, off-white figures), which is a *surface*, not a dark mode.
- **Convention over invention:** red for under par, blue for over par (The Open), plain ink for par. Pencil notation on the scorecard: circle = birdie, double circle = eagle or better, square = bogey, double square = double or worse.
- **Structure from space, alignment and rules.** Cards only for true objects (a lot in the auction, a share image, a sheet). Everything else is a ruled sheet.
- **No emoji.** One inline SVG icon set on a 24-px grid, one stroke weight, used only where an icon speeds recognition (the tab bar, sync state, a handful of actions).
- **Motion** confirms or shows change: 150–250 ms, ease-out, one orchestrated moment (leaderboard re-sort, final reveal). `prefers-reduced-motion` turns it off.
- **Copy:** calm, precise, correct golf vernacular, no exclamation marks, no middle-dot strings, no arrows in buttons. Personality only in the live feed.

## Direction A — "La tarjeta" (the paper scorecard and the pencil)

**Idea.** The app is a well-printed scorecard you keep in your back pocket: card stock, graphite ink, a ruled grid, and the pencil marks every golfer already knows. Structure comes from rules and columns, never from cards. One accent, a deep fairway green, is reserved for three things: the live indicator, the primary action, and "my row".

**Palette**

| Role | Name | Hex | Notes |
|---|---|---|---|
| Background | card stock | `#FBFAF7` | near-white, warm by a hair; not cream |
| Surface | ruled area | `#F3F1EA` | inset panels, skeletons, table zebra |
| Ink | graphite | `#1B211D` | 15.7:1 on background |
| Secondary ink | soft graphite | `#4F5751` | 7.2:1 on background (AAA at any size) |
| Accent | fairway | `#1E6B3B` | 6.3:1 on background; white on it 6.5:1 |
| Under par | red | `#A51D25` | figures only; 7.2:1 (AAA) |
| Over par | blue | `#245583` | figures only; 7.5:1 (AAA) |
| Hairline | rule | `#D8D5CB` | 1 px rules; the heavy rule is ink at 2 px |

Board surface (TV, Ceremonia): `#0F2E22` background, `#F6F3EA` figures (13.2:1), `#A9BBAF` secondary, `#F2C230` for the leader plate and the live mark only.

**Type.** **Archivo** (variable: weight 100–900, width 62–125) for everything: text at width 100, figures at width 90 so 60-row columns stay tight without a second family, weight 600 for figures, 500 for names, 400 for body. It is a grotesque with newspaper and print heritage, sturdy in sunlight, with tabular lining figures that align. **Fraunces 600** survives for exactly one role: the event name, the way club scorecards set the club's name in a serif above a sans grid. Scale (rem, 4-px rhythm): 11 · 12 · 14 · 16 · 18 · 22 · 28 · 36 · 56. Line-heights 1.1 display, 1.3 UI, 1.5 body. No tracking except 0.04em on tiny table headers.

**Layout concept.** *A ruled sheet you scroll, never a stack of cards.*

```
HOME (player, returning)                 EN VIVO (leaderboard)
┌──────────────────────────────┐         ┌──────────────────────────────┐
│ Cardi-Golf                   │         │ Nacho's Bachelor Invitational│  ← event name, Fraunces
│──────────────────────────────│         │ Día 2 · en juego   ● hace 1 m│  ← live dot, updated
│ Nacho's Bachelor Invitational│         │──────────────────────────────│
│ Día 2 en juego · vas 6.º     │  ┃      │  1  Diego A.        25  11  60│  ← pos · name · hoy · thru · TOTAL
│ [ Entrar ]                   │  ┃      │  2  Rodrigo V.      19   8  54│
│──────────────────────────────│         │ T3  Ignacio S.      15  11  54│
│ ¿Te invitaron?               │         │ T3  Mauricio L.     14   8  51│
│ [ CÓDIGO       ] [ Entrar ]  │         │▌ 5  Nicolás C.      22   9  50│  ← my row: 2px accent rule + tint
│──────────────────────────────│         │  6  Justo F.        11   8  48│
│ Organizas uno · Mis torneos  │         │ …                            │
└──────────────────────────────┘         │──────────────────────────────│
                                         │ En vivo                       │
                                         │ Ignacio, birdie en el 10       │
                                         └──────────────────────────────┘
                                         [ En vivo | Tarjeta | Juegos | Dinero | Más ]

TARJETA (score entry, one hole)
┌──────────────────────────────┐
│ Hoyo 12       Par 4 · SI 2   │  ← the hole number is the biggest text
│──────────────────────────────│
│ Diego •      [−]  4  [+]  2  │  ← strokes (huge) · putts (small), one line per player
│ Ignacio ••   [−]  4  [+]  2  │
│ Martín •     [−]  4  [+]  2  │
│ Nicolás •    [−]  4  [+]  2  │
│──────────────────────────────│
│ [        Guardar hoyo 12    ]│  ← one tap; auto-advances; "Deshacer" in the toast
└──────────────────────────────┘
```

**The one memorable thing: the pencil notation.** Circle, double circle, square, double square, drawn with a pencil-like 1.5-px stroke around the figure. It appears on the scorecard grid, in the "hoy" column of the leaderboard (a tiny ring when today has a birdie), on share images, and in the app icon: a bold figure with a red pencil circle around it. Everything else stays quiet so this one mark reads as the brand.

**Anti-slop critique of A.** First draft used a warm cream (`#F7F1E3`) and Fraunces for headings, i.e. the reflexive premium look. Changed: the stock is near-white (`#FBFAF7`), headings are Archivo, Fraunces is confined to the event name with a written rationale (club scorecards), and there is no terracotta anywhere; the only red is the under-par red. Risk of grey-on-grey: secondary ink is 7.2:1, and nothing is set below 12 px. Risk of "cards": the only rounded objects are sheets, auction lots and share images. Risk of reading as generic "clean grotesque": the notation, the ruled grid and the event-name serif are what make it a golf artifact.

## Direction B — "El tablero" (the hand-operated leaderboard)

**Idea.** A phone-sized major-championship board. Light field, but every primary figure sits on a plate: a deep board-green plate with off-white figures, the leader's plate in board yellow, the way a volunteer slides numbers into a manual board. Names set in a condensed grotesque, uppercase on the board only.

**Palette**

| Role | Name | Hex | Notes |
|---|---|---|---|
| Background | field | `#F6F6F1` | |
| Surface | white | `#FFFFFF` | |
| Ink | `#141A16` | | |
| Secondary ink | `#59625D` | | 6.4:1 |
| Accent | board green | `#0E3B2C` | plates, tab bar, primary action |
| Highlight | board yellow | `#F2C230` | leader plate and live mark only |
| Under par | `#C8102E` | | on plates: figures in red on off-white |
| Over par | `#1E6B3B` | | Masters convention; a different green from the accent, figures only |

**Type.** **Barlow** (Barlow + Barlow Semi Condensed): DIN-like signage letterforms with tabular figures; the semi-condensed cut for plates and names, the normal cut for text. No serif anywhere; the event name is Barlow Condensed 700 uppercase, which is how boards letter a championship's name.

**Layout concept.** *Plates in columns: names left, figures right, the board's own rhythm.*

```
HOME                                     EN VIVO
┌──────────────────────────────┐         ┌──────────────────────────────┐
│ CARDI-GOLF                   │         │ NACHO'S BACHELOR INVITATIONAL│  ← condensed caps on a green band
│ NACHO'S BACHELOR INVITATIONAL│         │ ROUND 2 · LIVE               │
│ Día 2 · en juego · vas 6.º   │         │──────────────────────────────│
│ [ ENTRAR ]                   │         │ 1  DIEGO A.       25  11 [60]│  ← [plate]
│──────────────────────────────│         │ 2  RODRIGO V.     19   8 [54]│
│ ¿Te invitaron?  [CÓDIGO][→]  │         │T3  IGNACIO S.     15  11 [54]│
└──────────────────────────────┘         │T3  MAURICIO L.    14   8 [51]│
                                         │ 5  NICOLÁS C.     22   9 [50]│  ← leader plate yellow, mine outlined
TARJETA                                  └──────────────────────────────┘
┌──────────────────────────────┐
│ [12]  PAR 4 · SI 2           │  ← hole number on a plate
│──────────────────────────────│
│ DIEGO      [−] [ 4 ] [+]  2  │  ← the stroke count is a plate you tap up/down
│ …                            │
│ [        GUARDAR            ]│
└──────────────────────────────┘
```

**The one memorable thing: the plate numeral.** Every primary figure lives on a plate; the leader's is yellow. On the TV it is literally the board.

**Anti-slop critique of B.** Plates are pills in disguise: with 60 rows they become "badges everywhere", the exact pattern the brief bans, and 60 dark plates on a light field is visually heavier than the ink figures of A. Uppercase condensed names read as shouting off the TV. Changed from the first draft: plates limited to one figure per row, names in mixed case except on the TV board, yellow only for the leader. Even so, the plate is a strong idea for a *board* and a weak idea for a *list*.

## Recommendation: Direction A, "La tarjeta"

- **Legibility in sun at any field size.** Ink figures on card stock with hairlines scale from 4 rows to 60 without adding weight; every figure is AAA.
- **It is the artifact golfers already read in two seconds.** The scorecard's grid and notation are learned; nothing needs explaining.
- **The TV still gets the board.** The plate numeral survives as a component on the board surface (TV, Ceremonia), where a plate is authentic, not as the list's default.
- **The event stays the star.** A quiet sans chrome lets one serif line, the event name, and one accent do all the personality.

## Event personalization

Organizers pick one accent from a curated set of six, named after things on a course. It is stored in the existing `accent_color` column (no schema change); any legacy free-form value maps to the nearest swatch, and an unknown value falls back to fairway.

| Name | Hex | White on it |
|---|---|---|
| Fairway (default) | `#1E6B3B` | 6.5:1 |
| Agua | `#2B5B8C` | 7.1:1 |
| Atardecer | `#B4532A` | 5.0:1 |
| Vino | `#8A2E3A` | 8.3:1 |
| Pizarra | `#3F4A54` | 9.1:1 |
| Arena | `#7A5A2E` | 6.3:1 |

The accent is applied to exactly three things inside that tournament: the rule under the event name, the primary button, and the "my row" marker. The product chrome, the semantic colors (under/over) and the type never change. The logo, when present, is a small mark beside the event name, never the header.

## What this means for phase 2 (preview)

- `tokens.next.css` becomes `src/styles/tokens.css`; every `.module.css` and inline style is rewritten against it; the 39 hard-coded colors and ~120 inline styles go.
- Primitives in `src/design/primitives` replace `.btn`, `.card`, `.chip`, `.list`, `.segmented`, the sheet, the toast, the steppers and the tab bar. One `Row` serves the leaderboard in every format through its `figure` slot (points today; to-par, putts, money and team totals implemented from existing data; holes-up left as a documented slot).
- The scorecard grid gets par, stroke index, front/back/total and the pencil notation; the first column pins on horizontal scroll.
- Emoji are replaced by the icon set; copy is rewritten (91 exclamation marks, 30 middle-dot strings, jokes outside the feed).
- The wordmark, app icon, splash and `theme-color` are regenerated from the circled figure.
