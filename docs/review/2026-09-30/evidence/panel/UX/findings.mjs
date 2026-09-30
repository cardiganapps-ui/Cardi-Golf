// Source of truth for UX.findings.json; run `node findings.mjs` to regenerate and validate.
import { writeFileSync, readFileSync } from 'node:fs'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/UX.findings.json'
const EVD = '$S/panel/evidence/UX'
const IX = 'Interaction design and core flows'

const F = []
const add = (f) => F.push(f)

add({
  title: 'Typing in a Comité sheet keeps only the first character; the rest go nowhere or into another field (13 → 1, 10 → 1, "Doce" → "D" + "oce" appended to the name)',
  severity: 'P0',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'regressed (introduced by the fix for audit-2026-09-28 P2 Accessibility "Sheet has no focus move, restore or trap", commit f425068, #28)',
  evidence: [
    'src/components/ui.tsx:68-102 — the Sheet effect depends on `onClose`; every caller passes an inline arrow (e.g. AdminPlayers.tsx:240, AdminHandicaps.tsx:113, AdminScores.tsx:292, AdminRounds.tsx:191), so each keystroke that re-renders the parent re-runs the effect: its cleanup calls `opener.current?.focus()` and the re-run focuses the frame (or, when a field was autofocused, that field becomes the "opener" and receives the next keystrokes)',
    `${EVD}/probe-sheet-focus2.mjs (human speed, 150 ms/key) → Hándicaps › Editar (Ajuste del Comité): typing "13" leaves Hándicap de juego = "1" and puts "3" in Razón; Tarjetas › hoyo: typing "10" in Golpes leaves "1"; Rondas › Agregar ronda: "12" → "1"; Jugadores › Agregar: "Doce" in Nombre corto → "D", "21.5" in hándicap → "2", and the full name becomes "Jugador Doceoce1.5"`,
    `${EVD}/probe-sheet-focus.mjs → editing an existing player: name "Camilo Duarte Ruiz" → "C", hándicap base "17.5" → "1", estimate gross "88" → "8"; focus is on DIV[role=dialog] after every key (on a phone: the keyboard closes after each character)`,
    'docs/review/2026-09-30/shots/t_admin_jugadores-full12-live-15pro-light-ux-add-typing.png, t_admin_handicaps-full12-live-15pro-light-ux-override-typing.png, t_admin_jugadores-full12-live-15pro-light-ux-estimate-preview.png (estimate reads 8/9/1 → "Hándicap de juego 0, hándicap de campo -40")',
  ],
  impact: 'Every multi-character entry in these sheets is wrong or impossible: a Day-2 playing-handicap override of 13 is saved as 1 (with "3" typed into the reason), a Comité score correction to 10 strokes is saved as 1 (a hole-in-one worth 5+ Stableford points), players get truncated handicaps and corrupted names during setup. These are the Comité flows RUNBOOK §3 and §6 schedule on tournament days; values that look plausible (1, 2) reach the engine and the money.',
  recommendation: 'In Sheet, keep onClose in a ref (`const close = useRef(onClose); close.current = onClose`) and make the effect depend on [open, id] only, so it runs once per open/close; restore focus only when the sheet actually closes. Add a Playwright test that types "Camilo Duarte" and "13" at 100 ms/key into the player, handicap-override and score sheets and asserts the exact values (the current e2e never types into a sheet).',
  effort: 'S',
  repro: 'node $S/panel/evidence/UX/probe-sheet-focus2.mjs. By hand: http://127.0.0.1:4173/t/_/full12-live/admin/handicaps at 393x852 → "Editar" on any player (sheet "Ajuste del Comité") → tap Hándicap de juego, select its text, type 1 then 3 a beat apart: the box shows 1 and Razón shows 3.',
})

add({
  title: 'A second tap on "Guardar hoyo" saves the next hole for all four players with untouched defaults (par, 2 putts)',
  severity: 'P1',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'src/screens/tournament/ScorecardScreen.tsx:328 — after a save the screen advances (`goto(savedIdx + 1)`) and the same button, in the same place, now saves the next hole; `busy` (l.290/333) only covers the ~50–200 ms of the commit',
    'src/screens/tournament/ScorecardScreen.tsx:171 — drafts for an unplayed hole default to par and 2 putts, so the phantom save looks like a plausible all-par hole',
    `${EVD}/probe-doubletap.mjs → two taps on the same spot 120 / 250 / 400 / 700 ms apart: every run went 12 → 14, hole 13 saved as 5/2 for all four players (grid shows 13 played), two toasts "Hoyo 12 guardado", "Hoyo 13 guardado"`,
    'docs/review/2026-09-30/shots/t_tarjeta-full12-live-15pro-light-ux-doubletap-grid.png — hole 13 filled in for the whole group after a double tap on hole 12',
  ],
  impact: 'A double tap (sun glare, a tap that "didn\'t take", a few beers) silently writes par and 2 putts for four players on a hole they have not played; it syncs to every phone and the leaderboard, and the Tarjeta then reopens on the hole after it (firstOpen skips the phantom hole), inviting the group to enter hole 13\'s real scores on the hole-14 screen. Unless someone spots it before signing, Stableford points and fewest-putts money are wrong.',
  recommendation: 'In ScorecardScreen, ignore Save for ~700 ms after the hole changes (a `settledAt` ref set in the hole-change effect) and animate the hole change so the jump is visible; additionally, when every draft on an unplayed hole is untouched and the previous save was <2 s ago, ask once ("¿Todos hicieron par?"). Add a Playwright check that two taps 250 ms apart save exactly one hole.',
  effort: 'S',
  repro: 'node $S/panel/evidence/UX/probe-doubletap.mjs (or by hand: open http://127.0.0.1:4173/t/_/full12-live/tarjeta at 393x852, double-tap "Guardar hoyo" on hole 12, tap "Ver tarjeta": hole 13 is filled with 5 / 2 pts for everyone).',
})

add({
  title: 'The wizard\'s review step renders label and value run together ("Nombre del torneoNacho\'s…", "FormatoStableford") — its CSS classes do not exist',
  severity: 'P1',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'src/screens/organizer/NewTournamentScreen.tsx:207-212 — uses styles.review, styles.reviewRow, styles.reviewKey, styles.reviewValue',
    'grep -n "review" src/screens/organizer/Organizer.module.css → no match: all four classes are undefined, so the rows are bare inline spans',
    'docs/review/2026-09-30/shots/organizer_nuevo_-demo-15pro-light-ux-step3-calcutta.png — "Nombre del torneoNacho\'s Bachelor Invitational ·", "¿Cuántos días (rondas)?2 días, 12 jugadores", "¿Juegan por dinero?$2,500 por jugador…"',
  ],
  impact: 'The one screen added so an organizer can read what they are about to create (money included) is the most broken-looking screen of the setup flow; every new organizer sees it right before "Crear torneo".',
  recommendation: 'Add the four classes to Organizer.module.css (a two-column ruled list: key in ink-2 at fs-sm, value right-aligned or on its own line), and add a CSS-module lint/test that fails when a TSX file references a class its module does not define (the repo already has a test that scans CSS for literals; extend it).',
  effort: 'S',
  repro: 'Open http://127.0.0.1:4173/organizer/nuevo/_ at 393x852, type a name, Siguiente, Siguiente: the review rows read "FormatoStableford, puntos".',
})

add({
  title: 'The wizard\'s review omits every module: the "Viaje con Calcutta" template reviews as "Juegos aparte: Ninguno por ahora"',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'src/screens/organizer/NewTournamentScreen.tsx:196-202 — the review lists `settings.games` only; modules (pairs, snake, bestRound, fewestPutts, auction) are never shown',
    'src/engine/games/presets.ts:75-80 — the calcutta template is FIRST_TOURNAMENT_SETTINGS (pairs, snake, best round, putts, Calcutta on)',
    `${EVD}/wizard.json → calcuttaReview: "Juegos aparte Ninguno por ahora"`,
  ],
  impact: 'An organizer who picks the full template cannot see before creating that the Calcutta, Matrimonios, Víbora, Mejor ronda and Menos putts are on (or which prizes they carry); the review says the opposite.',
  recommendation: 'Build the review lines from the same source as PrizeSummary (one line per enabled module and game with its prize), so the review is the prize statement; test: the calcutta preset review mentions La Calcutta and Los Matrimonios.',
  effort: 'S',
  repro: '/organizer/nuevo/_ → name → Siguiente → "¿Prefieres empezar de una plantilla?" → "Viaje con Calcutta" → Siguiente: the last row reads "Juegos aparte Ninguno por ahora".',
})

add({
  title: 'OS/browser Back on step 2 or 3 leaves the wizard and discards everything typed, with no warning',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'still open (audit-2026-09-28 P2 "Wizard: … browser Back leaves the wizard")',
  evidence: [
    'src/screens/organizer/NewTournamentScreen.tsx:44 — the step is component state, not the URL or history',
    `${EVD}/j-wizard.mjs (part D) → back from step 2 lands on /fixture; forward returns to "Paso 1 de 3" with an empty name`,
  ],
  impact: 'On Android the back gesture and on iOS the edge swipe are how people go "back a step"; the organizer loses the name, format, field size and money settings and starts over.',
  recommendation: 'Put the step in the URL (?paso=2) with history.push per step so Back goes one step back, and keep the draft in sessionStorage; confirm before leaving with a dirty draft.',
  effort: 'S',
  repro: 'Open /fixture, then /organizer/nuevo/_, type a name, Siguiente, press browser Back: you are on /fixture; Forward shows step 1 empty.',
})

add({
  title: 'After "Crear torneo" nothing guides the organizer to a playable tournament: the "2 días" answer creates no rounds and the Comité has no readiness checklist',
  severity: 'P1',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'supabase/migrations/0010_admin_safety.sql:686-722 — create_tournament inserts the tournament and its owner only; no rounds, although the wizard asked "¿Cuántos días (rondas)?"',
    'src/screens/admin/AdminRounds.tsx:118-120 — rounds are added one at a time by hand ("Agregar ronda"); AdminRounds.tsx:60-64 refuses to start a round without groups (toast only)',
    'src/screens/organizer/NewTournamentScreen.tsx:167-181 — the created state says "Después carga jugadores, campo y PIN en el Comité" and links to /admin, which redirects to Torneo (settings tabs)',
    'grep -rin "checklist|readiness|nextStep" src → nothing but Dinero\'s "Quién debe qué": no setup checklist anywhere',
    'docs/review/2026-09-30/shots/organizer_nuevo_-demo-15pro-light-ux-created.png',
  ],
  impact: 'A first-time organizer (the platform promise: "any organizer can create a tournament") lands in a 10–13-tab console and must discover, in order, Jugadores → PIN per player → Campos → Rondas (again: the days they already gave) → tees per round → Grupos → Iniciar. Nothing says what is missing; the Tarjeta just says there are no groups. Players who join by the code the success screen hands out find an empty face grid.',
  recommendation: 'Create round rows from settings.rounds in create_tournament (Día 1..N, no course yet). Add a "Para empezar" checklist at the top of Comité › Torneo (and as a badge) computed from the snapshot: players ≥ 2, every player has a PIN, a course with a card, every round has course/date, tees assigned, groups for the next round; each line links to its section. Hide the join code on the success screen behind "cuando tengas jugadores".',
  effort: 'M',
  repro: 'Read create_tournament; open /t/_/minimal4-setup/admin: there is no list of what is missing. In /organizer/nuevo/_ choose 2 días and create: the success screen points to the Comité only.',
})

add({
  title: 'The "Hoyo N guardado" toast sits on the sync line for 6 s after every save, and its "Corregir/Deshacer" action is a 53×21 px target',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'src/components/ui.module.css:125-159 — toaster fixed at bottom: 80px + safe area; .toastAction has padding 0',
    'src/components/ui.tsx:172 — a toast with an action stays 6000 ms',
    `${EVD}/foursome-x1.json → toast action box 53.2×21 at y≈735–747; Guardar hoyo at y 663–707; the sync status line sits at ≈711–727`,
    'docs/review/2026-09-30/shots/t_tarjeta-full12-live-15pro-light-ux-after-save.png — the toast hides "Sin conexión… Se reintenta solo."',
  ],
  impact: 'The only signal that a hole actually reached the server ("Sincronizado" / "1 pendiente" / an error) is covered right when the scorer looks for it; the undo/correct action is too small to hit reliably one-handed.',
  recommendation: 'Anchor the Tarjeta\'s save feedback in the save bar itself (replace the status line with "Hoyo 12 guardado · Corregir" for 6 s, full-height 48 px action) instead of a global toast, or raise the toaster above the save bar on this screen; make toast actions ≥ 48×48.',
  effort: 'S',
  repro: 'Open /t/_/full12-live/tarjeta at 393x852 (block *.supabase.co to see the error line), tap Guardar hoyo: the toast covers the status under the button for 6 s.',
})

add({
  title: 'The snake tiebreak prompt blocks saving the hole: there is no "no sé / que lo decida el Comité", so a group that does not remember must guess or change a putt',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'src/screens/tournament/ScorecardScreen.tsx:263-269 — with 2+ players at the threshold and no answer, save() opens the sheet and returns; closing the sheet (l.616) saves nothing',
    'src/engine: an unanswered tiebreak is already a supported "pendiente" state (CLAUDE.md §6 test "no tiebreak answer → pendiente") and Comité › Tarjetas can answer it later',
    `${EVD}/probe-tiebreak.mjs → "Cerrar" leaves the hole unsaved (hole stays 12)`,
    'docs/review/2026-09-30/shots/t_tarjeta-full12-live-15pro-light-ux-tiebreak-settled.png',
  ],
  impact: 'The scores for four players are held hostage by a question about who holed out last; with the group already walking to the next tee the realistic outcomes are a coin-flip answer (wrong snake money) or someone nudging a 3-putt down to 2 to get past it (wrong putts money).',
  recommendation: 'Add a third, quieter option "No sabemos: que decida el Comité" that saves the scores and leaves the tiebreak pending (it already shows in Comité › Tarjetas); show the pending state in the Víbora board.',
  effort: 'S',
  repro: '/t/_/full12-live/tarjeta: + on the putts of rows 2 and 4, Guardar hoyo, then Cerrar: the hole is not saved; the only way forward is to pick a name.',
})

add({
  title: '"Cambiar de jugador" signs the device out of its player immediately: no confirmation and no unsent-scores guard (sign-out has one)',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'src/screens/tournament/MoreScreen.tsx:133-134 — the button calls leave() directly for PIN devices',
    'src/screens/tournament/TournamentGate.tsx:145-149 — leave() = releaseDevice() + forget the tournament + resolve; no check of useOutbox.pending',
    'src/data/account.ts:134-139 — signOutSafely() refuses while the outbox holds unsent scores; the device path has no equivalent',
    `${EVD}/j-join.mjs part B → one tap on "Cambiar de jugador" went straight back to the face grid (confirmAsked=false)`,
    'src/components/RejectedWrites.tsx:52-60 — a non-admin can only "Descartar" a rejected write',
  ],
  impact: 'An accidental tap at the bottom of Más logs the player out mid-round (face + PIN again). If scores were still queued (weak signal), they are pushed after the device lost its player, RLS rejects them, and a non-admin can only discard them — holes the group entered are lost unless the Comité re-types them.',
  recommendation: 'Ask in a ConfirmSheet ("Vas a salir como Nico en este teléfono") and refuse while useOutbox.pending > 0 exactly like signOutSafely; flush first when online.',
  effort: 'S',
  repro: 'On /t/ensayo as Nico: Más → "Cambiar de jugador": the face grid appears with no question. Static: compare MoreScreen.tsx:133 with account.ts:134.',
})

add({
  title: 'Interactive targets are 44 px, below the brief\'s 48 px, on the most-used controls (Guardar hoyo, hole arrows, tiebreak answers, PIN buttons, sheet Cerrar)',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Accessibility',
  status: 'partly fixed (audit-2026-09-28 P2 Accessibility "Targets: .btn--sm 36 px…" → now 44)',
  evidence: [
    'src/styles/tokens.css:92 — --tap: 44px (CLAUDE.md §9: "48px+ tap targets")',
    `${EVD}/targets-tarjeta-full12-live.json → Guardar hoyo 361×44, Hoyo anterior/siguiente 44×44, Ver tarjeta 91×44 (steppers 48×56 and Levantó 64×56 pass)`,
    `${EVD}/probe-tiebreak.mjs → tiebreak answers 361×44, Cerrar 67×44; ${EVD}/targets-entrar-pin-ensayo.json → "No soy yo" 114×44, "Entrar" 239×44`,
  ],
  impact: 'The primary action of the most repeated task and the controls used with a wet or gloved thumb in sun are 8% under the product\'s own minimum; misses turn into the double-tap failure above.',
  recommendation: 'Set --tap to 48px (and .btn to min-height 48, the save button 56) and re-run the target audit; make the Tarjeta save bar 56 px tall.',
  effort: 'S',
  repro: 'node $S/panel/evidence/UX/probe-tarjeta.mjs → prints every target under 48×48.',
})

add({
  title: 'Players who join by link or code never see the install guide before claiming; on iPhone the installed app then starts at "/" with no tournament and asks for code, face and PIN again',
  severity: 'P2',
  verdict: 'PLAUSIBLE',
  area: 'Mobile and PWA experience',
  status: 'new',
  evidence: [
    'grep InstallGuide → only HomeScreen.tsx:108, MoreScreen.tsx:129 (bottom of Más), MiPolo.tsx:323; nothing on the /t/<slug> → Entrar → En vivo path',
    `${EVD}/join.json → installGuideOnLive: 0 after joining by link`,
    'vite.config.ts:42 — start_url "/" (manifest), so the home-screen icon opens Home, not the tournament',
    'RUNBOOK.md:10 promises "la guía sale la primera vez" when opening the link — it does not on that path',
  ],
  impact: 'Twelve players install the app after claiming in Safari (the RUNBOOK order). iOS keeps home-screen web-app storage separate from Safari, so the installed app has neither the PIN claim nor "Tu último torneo": each player must find the six-character code (they came by link) and claim again — the night before the tournament, with drinks.',
  recommendation: 'Show a one-time install sheet on Entrar for iOS Safari before the PIN ("Instálala primero; después entra desde el ícono"), carry the slug through install (a /t/<slug> start page, or a "last tournament" hint in the manifest id/URL), and show the join code on the installed Home when a link was used. Confirm on a real iPhone: claim in Safari, Add to Home Screen, open from the icon.',
  effort: 'M',
  repro: 'Static: routes above. Device: iPhone Safari → golf.cardigan.mx/t/ensayo → Nico/1234 → Compartir → Agregar a inicio → open the icon: Home asks for a code.',
})

add({
  title: 'Liquidación asks for the gross debts and then settles "vía banco" on net balances that ignore what was already paid: following the screen underpays winners by what they paid up front',
  severity: 'P0',
  verdict: 'CONFIRMED',
  area: 'Correctness of rules and money',
  status: 'new',
  evidence: [
    'src/engine/core/money.ts:244-251 — viaBank = (prizes + Calcutta shares) − (entry + side pots + Calcutta purchases) per person, using the owed amounts; the `paid` flags (money.ts:104, 160-171) never enter it',
    'src/i18n/es-MX.ts:1820 — the hint under Vía banco says the banker "cobró inscripciones y martillazos y paga a cada quien" (collected up front, pays everyone), and RUNBOOK.md §1.8 has everything collected on Calcutta night through "Quién debe qué"',
    '/t/_/full12-finished/dinero (Liquidación) → "Quién debe qué" lists Camilo owing only Calcutta $3,000 (his $2,500 entry is marked paid); Vía banco lists "Banco paga a Camilo $7,700"; "Si terminara ahora" shows Camilo "Pagó $6,000, recibe $13,200, +$7,200". 7,700 = 13,200 − 2,500 − 3,000: the entry he already paid is deducted again',
    'docs/review/2026-09-30/shots/t_dinero-full12-finished-15pro-light-ux-liquidacion.png — both lists on one screen; the bank summary above them is gross ($46,000 in, $43,600 out) while the Vía banco rows are net',
    'src/engine/core/money.test.ts:52-55 — the only test asserts the net list balances to zero; nothing tests a settlement after up-front payments',
    `${EVD}/tests/viabank.test.ts (npx vitest run --config ${EVD}/vitest.config.mjs, from the repo) → first tournament finished, every entry and hammer price marked paid: "Quién debe qué" is empty, viaBank is byte-identical to before, 7 players are still told to pay the bank $14,975 and the bank pays out $14,975 in total although it owes $37,500 (banker.pays): the bank ends holding the $37,500 it collected`,
  ],
  impact: 'On the last night the banker follows the app: collect "Quién debe qué", then pay "Vía banco". Camilo ends at +$1,700 (or +$4,700 if the banker skips the first list) instead of +$7,200; every player who paid on Calcutta night is short exactly what he paid, and those who owe are charged twice ("Arturo paga a Banco $2,250" after paying everything). Real money between friends, at the ceremony.',
  recommendation: 'Make vía banco reconcile payments: per person, bank → player = receivables − unpaid obligations (and player → bank = unpaid obligations − receivables when negative), so after everything is collected it pays gross prizes + shares; show one line per person ("ya pagó $5,500; recibe $13,200"). Test: first-tournament snapshot with every entry, purchase and buyback marked paid → viaBank has only bank→player rows summing to banker.pays; with nothing paid → today\'s net list.',
  effort: 'M',
  repro: 'Engine: cd /home/user/Cardi-Golf && npx vitest run --config $S/panel/evidence/UX/vitest.config.mjs (1 test, prints the numbers). UI: open http://127.0.0.1:4173/t/_/full12-finished/dinero → Liquidación: note "Banco paga a Camilo $7,700" and that his entry is not in "Quién debe qué" (paid); tap "Si terminara ahora": Camilo "Pagó $6,000, recibe $13,200, +$7,200". Code: src/engine/core/money.ts:244-251.',
})

add({
  title: 'Auctioneer console: the chosen bidder stays selected after a bid and the high bidder can outbid himself; "¡Vendido!" sells with no confirmation (spec: "confirm the hammer")',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'still open (DESIGN_AUDIT Appendix C "Calcutta … ↶ Deshacer + 🔨 Vendido (no confirm)")',
  evidence: [
    'src/screens/admin/AdminAuction.tsx:139-148 — bid() never clears `bidder` and never compares it with the current high bidder (bidderId)',
    'src/screens/admin/AdminAuction.tsx:150-163, 265 — hammer() sells immediately on tap; CLAUDE.md §10: "¡Vendido!: confirm the hammer, then a buyback dialog"',
    `${EVD}/j-calcutta.mjs on the scratch fixture auction12 → after "+$250" the picked tile still reads aria-checked=true; a tap on "¡Vendido!" opened no dialog`,
    'docs/review/2026-09-30/shots/t_admin_calcutta-auction12-15pro-light-ux-console-full.png — bid buttons (y≈836), Deshacer/¡Vendido! (y≈944) sit below the 852-px fold under a 286-px bidder grid; the console page is 1,719 px tall',
  ],
  impact: 'At a loud dinner the auctioneer taps "+$250" for the next shout without re-picking: the current high bidder raises himself and pays $250 more; an early or stray "¡Vendido!" sells the lot (recoverable only by "Reabrir" on the sold list, itself an unlabelled icon with no confirmation).',
  recommendation: 'Clear the bidder after each bid (or make a tile tap = "this person bids +increment", one tap per bid) and refuse a bid from the current high bidder; put "¡Vendido!" behind a 1-second hold or a confirm with the price and buyer; label the reopen icon and confirm it. Keep bidder grid, increments and hammer in one thumb-reach block.',
  effort: 'S',
  repro: 'Scratch build (fixture auction12, see method) or by code: AdminAuction.tsx:139-163. On Ensayo (REL only): pick a bidder, +$250 twice → the same person is high bidder at +$500.',
})

add({
  title: 'Errors reach people as raw exception text: "TypeError: Failed to fetch", "Error 404", "Cannot read properties of undefined (reading \'length\')"',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'partly fixed (audit-2026-09-28 P2 "Raw PostgREST English errors appear … in unwrap toasts": the Tarjeta sync line now maps errors; the other 85 call sites do not)',
  evidence: [
    'grep -rn "e instanceof Error ? e.message : String(e)" src --include=*.tsx → 85 call sites in 45 files toast the raw message',
    `${EVD}/j-handicap.mjs, j-calcutta.mjs, j-money-ceremony.mjs → offline saves in Jugadores, a bid, "¡Vendido!" and "Pagado" all toast "TypeError: Failed to fetch"`,
    `${EVD}/j-course.mjs → Buscar campo shows "Cannot read properties of undefined (reading 'length')" when the route answers HTML (captive portal / SPA fallback); Subir tarjeta toasts "Error 404" (src/lib/courseApi.ts:24-27 assumes JSON)`,
    'docs/review/2026-09-30/shots/t_admin_campos-full12-live-15pro-light-ux-search.png, t_admin_campos-full12-live-15pro-light-ux-photo-error.png',
  ],
  impact: 'On resort Wi-Fi or 4G, the Comité sees English developer text with no next step at the worst moments (auction, payments, score fixes); the course search fails outright behind any captive portal.',
  recommendation: 'One `describeError(e)` next to describeSyncError that maps network, auth, RLS, constraint and HTTP status to Spanish with an action ("Sin conexión: se guardará cuando vuelva la señal" / "Reintentar"); make parse() in courseApi.ts check content-type and fall back to searchUnavailable; a lint rule that bans toasting e.message.',
  effort: 'M',
  repro: 'Open /t/_/full12-live/admin/jugadores with *.supabase.co blocked (Playwright route abort), edit a player, Guardar → toast "TypeError: Failed to fetch".',
})

add({
  title: 'Sheets close on a backdrop tap, Escape or "Cerrar" and silently discard what was typed (a manual scorecard, a photo-read draft, a player form)',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'still open (audit-2026-09-28 P2 "Sheets close on backdrop/Escape and discard the player form or a just-read scorecard draft with no confirm")',
  evidence: [
    'src/components/ui.tsx:104-110 — the backdrop calls onClose; AdminCourses.tsx:323 onClose={closeDraft} drops the draft; AdminPlayers.tsx:240 drops the form',
    `${EVD}/j-course.mjs → after entering 27 cells of a card, a tap above the sheet (y≈34) closed it: backdropClosed=true, nothing asked`,
    'The sheet shows a drag handle (ui.module.css .sheetHandle) but has no drag gesture, inviting a swipe that does nothing',
  ],
  impact: 'Ten minutes of typing an 18-hole card (or the Claude read of a photo) is lost to one stray tap on the strip above the sheet.',
  recommendation: 'Give Sheet a `dirty` prop: when true, backdrop/Escape/Cerrar ask "¿Descartar los cambios?"; keep course drafts in sessionStorage until saved.',
  effort: 'S',
  repro: '/t/_/full12-live/admin/campos → Capturar a mano → type a name and a few pars → tap the dimmed header above the sheet: the sheet closes and the draft is gone.',
})

add({
  title: 'Setup forms prefill plausible fake data that passes validation: a blank course is par 4 with SI = hole number, a name-only player gets hándicap 18, the estimate starts at 85/92/100',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'src/screens/admin/CourseEditor.tsx:42-48 — blankTee(): 18 × par 4, strokeIndex = i+1; validateTee (l.10-18) accepts it (a permutation, par 72)',
    `${EVD}/course.json → saveEnabledWithDefaults: true after typing only the course name`,
    'src/screens/admin/AdminPlayers.tsx:31-33 — new player base_hcp 18, source manual; AdminPlayers.tsx:46-50 emptyEstimate() = 85 / 92 / 100',
    `${EVD}/handicap.json → a new player with only a name: tab "A mano", preview 14, Guardar enabled`,
  ],
  impact: 'A rushed organizer saves a course nobody typed or twelve players on 18: every stroke allocation and Stableford point is then computed from invented numbers that look real, and nothing flags them.',
  recommendation: 'Start cells and handicaps empty and require them (validation: every hole has par and SI entered; a player needs a handicap before the round starts), or mark untouched defaults visibly ("sin capturar") and list them in the readiness checklist (UX-06).',
  effort: 'S',
  repro: '/t/_/full12-live/admin/campos → Capturar a mano → type a name → Guardar is enabled on a par-72 card with SI 1–18 in order.',
})

add({
  title: 'The Matrimonios draw happens only on the auctioneer\'s phone; the TV keeps showing the finished auction board',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Product coherence and strategy',
  status: 'new',
  evidence: [
    'src/screens/tournament/TvScreen.tsx:21, 31-40, 88 — boards are individual, pairs, snake, auction, feed and games; nothing renders the draw or its reveal',
    'src/screens/admin/AdminDraw.tsx:57-69 — the reveal (600 ms per pair, rings) runs in local state on the admin device and is saved only at the end',
    'CLAUDE.md §10: "The remaining A↔D and B↔C pairs are drawn with a rings animation" as part of the dinner programme; docs/review/2026-09-30/shots/t_admin_parejas-draw12-15pro-light-ux.png',
  ],
  impact: 'The dinner\'s second big moment is seen by one person holding a phone; the room learns the pairs from a toast or the next morning\'s groups.',
  recommendation: 'Persist the draw as it is revealed (or broadcast it on a realtime channel) and add a "sorteo" board the TV switches to while it runs; same for the auction\'s "¡Vendido!" moment.',
  effort: 'M',
  repro: 'Read TvScreen.tsx board list; on the scratch fixture draw12, /admin/parejas runs the draw while /tv has no draw state to show.',
})

add({
  title: 'Ceremonia takes 25 taps on the TV page itself and ignores the keyboard and presentation clickers; no phone remote',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    `${EVD}/probe-ceremony.mjs → full12-finished: "Empezar" + 12 × "Revelar" + 12 × "Siguiente" = 25 taps, ≈62 s including a 1.5 s look per reveal; ArrowRight and Space change nothing`,
    'src/screens/tournament/CeremonyScreen.tsx:205-280 — only on-screen buttons; no keydown handler',
    'RUNBOOK.md §7.2 — the ceremony runs "en la tele"',
  ],
  impact: 'The emcee has to stand at a laptop with a mouse (or mirror a phone) and double-tap through every reveal; a presenter clicker, the universal tool for this moment, does nothing.',
  recommendation: 'Map ArrowRight/Space/PageDown to "reveal, then next" (one control advances the show), ArrowLeft to back; add a phone "control remoto" that drives the TV page over the realtime channel.',
  effort: 'S',
  repro: 'Open /t/_/full12-finished/ceremonia at 1920×1080, press → or Space: nothing happens.',
})

add({
  title: 'Correcting an earlier hole from the Tarjeta drops the scorer on the hole after it, not back where the group is; the snake question for that hole is asked again',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'src/screens/tournament/ScorecardScreen.tsx:328 — every save advances to idx+1, even for a hole that was already played',
    `${EVD}/fix-sign.json → at hole 12, fixing hole 9 took 7 taps (+2 scrolls): Ver tarjeta, 9, +, Guardar, tiebreak again, Ver tarjeta, 12; the save landed on hole 10`,
  ],
  impact: 'A mid-round correction costs two extra taps and a moment of "where are we?"; a scorer who does not notice may enter the current hole\'s scores on hole 10.',
  recommendation: 'After saving a hole that was already played, return to the group\'s first open hole (firstOpen) and say so in the toast ("Hoyo 9 corregido; seguimos en el 12").',
  effort: 'S',
  repro: '/t/_/full12-live/tarjeta → Ver tarjeta → 9 → + on row 1 → Guardar hoyo (answer the snake sheet) → the screen shows hole 10.',
})

add({
  title: 'PINs are typed one by one by the organizer and never shown or shared from the app; there is no per-player invite',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'src/screens/admin/AdminPlayers.tsx:158-172, 403-411 — the PIN sheet takes four digits the organizer invents and saves; nothing generates, displays after save, or shares it',
    `${EVD}/handicap.json → set PIN: 2 taps + 4 keys per player, share buttons in the sheet: 0`,
    'RUNBOOK.md:9 — "Mándalos por WhatsApp uno a uno" (outside the app)',
  ],
  impact: 'Twelve PINs cost ~70 inputs plus twelve hand-written WhatsApp messages, and the organizer must remember every PIN to resend it; a mistyped PIN is only discovered when the player is locked out on the course.',
  recommendation: 'Generate PINs in bulk ("Generar PINs") and give each player a "Mandar por WhatsApp" row that shares the link plus his PIN (or better, a one-time claim link that needs no PIN).',
  effort: 'M',
  repro: '/t/_/full12-live/admin/jugadores → PIN on any row: a bare four-digit field and Guardar.',
})

add({
  title: 'A debt marked "Pagado" by mistake cannot be un-marked anywhere: one tap, no confirmation, the row disappears',
  severity: 'P1',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'src/screens/tournament/MoneyScreen.tsx:64 — "Quién debe qué" lists only unpaid flows; MoneyScreen.tsx:243 — its button calls toggle(f, true); no call site passes false for entries, Calcutta, buybacks, side pots or bets (grep "toggle(f" → one hit)',
    'Only bank payouts get a paid state that toggles back (MoneyScreen.tsx:279); there is no Comité payments section (DESIGN_AUDIT C: "sections.payments exists in i18n with no route")',
    `${EVD}/money-ceremony.json → 21 identical 44-px "Pagado" buttons on a 2,276-px page; the first tap opened no dialog`,
    'docs/review/2026-09-30/shots/t_dinero-full12-finished-15pro-light-ux-liquidacion.png',
  ],
  impact: 'On Calcutta night the banker ticks sixteen near-identical rows one-handed; a tap on the wrong row records that someone paid $2,500 or $3,000 who did not, the row vanishes, and nothing in the app can put it back (only a JSON restore of the whole tournament). The final settlement then treats unpaid money as collected.',
  recommendation: 'Show paid debts too (collapsed "Ya pagaron", each with a check that toggles back), give every "Pagado" an undo toast, and label the action "Marcar pagado" (state and action are both "Pagado" today). Test: mark then unmark an entry and a Calcutta purchase.',
  effort: 'S',
  repro: 'Open /t/_/full12-finished/dinero → Liquidación → tap "Pagado" on any "Quién debe qué" row (on a live tournament the row disappears after reload; there is no control to reverse it). Code: MoneyScreen.tsx:64, 243.',
})

add({
  title: 'An answered "¿Quién embocó al último?" can never be corrected, by the group or the Comité',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'src/screens/tournament/ScorecardScreen.tsx:265-269 — the Tarjeta asks only while the hole has no answer',
    'src/screens/admin/AdminScores.tsx:83 — the Comité inbox answers pending tiebreaks only; grep "snakeTiebreaks|answerTiebreak" in src/screens → no screen lists or edits answered ones',
    'The two answer buttons are adjacent 361×44 targets (probe-tiebreak.mjs) and the inbox answers are one-tap ghost buttons with no confirmation',
  ],
  impact: 'A thumb that lands on the wrong name decides who carries the snake from that hole on; if nobody 3-putts later, $600 of that group\'s Víbora is paid on a wrong answer and neither the players nor the Comité can fix it in the app.',
  recommendation: 'List answered tiebreaks in Comité › Tarjetas (per group and hole, with who answered) with "Cambiar"; show the answer in the Víbora pass history with an edit affordance for the Comité; audit-log the change.',
  effort: 'S',
  repro: 'Static: ScorecardScreen.tsx:265 (answered → no prompt) and AdminScores.tsx pending-only inbox. Fixture: /t/_/full12-live/admin/scores lists only "Pendientes".',
})

add({
  title: 'Card signing exists only when the pairs game is on: a Stableford-only tournament or a Ronda rápida has no attestation or lock at all',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Product coherence and strategy',
  status: 'new',
  evidence: [
    'src/screens/tournament/ScorecardScreen.tsx:476 — the sign rows render only when `pairsOn && complete`',
    'supabase/migrations/0001_schema.sql card_signatures(round_id, pair_id) — a signature is a pair\'s; 0008_score_disputes.sql:40-50 — only a signature settles disputed holes',
    'CLAUDE.md §0.5 — "A tournament with only individual Stableford and no Calcutta must work"',
  ],
  impact: 'Outside the first tournament\'s format nobody can sign a card: scores stay editable by any group member until the Comité finishes the round, disputed holes never settle from the group, and the "firmada" trust moment does not exist for most tournaments the platform will run.',
  recommendation: 'Make attestation per player (a marker signs each player\'s card, or each player signs his own) and keep the pairs "tarjeta cruzada" as one configuration of it.',
  effort: 'M',
  repro: 'Open /t/_/minimal4-live/tarjeta → Ver tarjeta: there is no "Firmar tarjeta" anywhere, whatever is entered.',
})

add({
  title: 'The Comité section nav scrolls sideways and does not bring the current section into view (Parejas, Calcutta, Datos are off-screen on a phone)',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'still open (DESIGN_AUDIT Appendix C AdminLayout: "horizontal scroller … no fade or scroll-into-view")',
  evidence: [
    'docs/review/2026-09-30/shots/t_admin_parejas-draw12-15pro-light-ux.png and t_admin_calcutta-auction12-15pro-light-ux-console-full.png — the visible tabs end at "Grupos"; the active section is not shown',
    'src/screens/admin/AdminLayout.tsx:66-80 — NavLinks in a scroller, no scrollIntoView for the active one',
  ],
  impact: 'On a phone the Comité cannot see where they are or that 6–8 more sections exist; on Calcutta night the Calcutta tab is two swipes away.',
  recommendation: 'Scroll the active tab into view on mount, add an edge fade, and on phones group sections (Antes / En juego / Después) or use a "Secciones" sheet.',
  effort: 'S',
  repro: 'Open /t/_/full12-live/admin/calcutta at 393×852: the nav row shows Torneo…Grupos; "Calcutta" is not visible.',
})

add({
  title: '"Jugar una ronda rápida" on Home goes to sign-in without remembering the intent; after the account exists the user lands in Mi Polo, not the round',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'src/screens/HomeScreen.tsx:97-102 — both "Entrar a mi perfil" and "Jugar una ronda rápida" link to plain /entrar (no ?next=/ronda)',
    'src/screens/profile/EntrarScreen.tsx:94-95 — after sign-in it goes to `next` (default) or the profile editor',
  ],
  impact: 'The cold-start path to a quick round (email, 6-digit code from the mail app, profile name) ends one screen away from where the person asked to go.',
  recommendation: 'Link to /entrar?next=/ronda and keep `next` through the first-time profile editor.',
  effort: 'S',
  repro: 'Read HomeScreen.tsx:97-102.',
})

add({
  title: 'The Tarjeta still announces "4 pts, águila neto" on untouched defaults before anything is entered (muted, but the words are there)',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'partly fixed (audit-2026-09-28 P2 "The Tarjeta shows 3 pts, birdie neto in red for unsaved default values")',
  evidence: [
    'src/screens/tournament/ScorecardScreen.tsx:560-561 — untouched defaults get .ptsMuted but keep the full "N pts, <score name>" text',
    'docs/review/2026-09-30/shots/t_tarjeta-full12-live-15pro-light-ux-hole.png — every row reads "3 pts, birdie neto" / "4 pts, águila neto" on a hole nobody has played',
  ],
  impact: 'Four lines claiming birdies and eagles on an empty hole train the eye to ignore the one line that should confirm what was typed.',
  recommendation: 'Show "par por defecto" (or nothing) until the row is touched; show points only for touched or saved rows.',
  effort: 'S',
  repro: '/t/_/full12-live/tarjeta at 393×852, hole 12 before any tap.',
})

add({
  title: 'Two different sign-in doors for the same account: organizers get email + password (no Google) at /organizer/login, players get email code or Google at /entrar',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: 'Product coherence and strategy',
  status: 'new',
  evidence: [
    `${EVD}/probe-login.mjs → /organizer/login offers "Entrar", "Entrar con código", "Olvidé mi contraseña", "Crear una cuenta" (name, email, password ≥ 8); no Google`,
    'src/screens/HomeScreen.tsx:96-106 — "Entrar a mi perfil" and "Jugar una ronda rápida" go to /entrar; "Organizar un torneo" goes to /organizer/login',
    'docs/review/2026-09-30/shots/organizer_login-none-15pro-light-ux-signup.png',
  ],
  impact: 'Someone who made a Polo profile with Google and later wants to organize meets a password form for an account that has no password; the platform reads as two products glued together.',
  recommendation: 'One sign-in (/entrar) for every account, with "organizar" as a `next`; keep password only as an option inside it.',
  effort: 'S',
  repro: 'Signed out, open / → "Organizar un torneo" vs "Entrar a mi perfil".',
})

add({
  title: 'Base handicaps are never locked: the brief locks them before the Calcutta, the RUNBOOK checklist says "bloqueado", but the player sheet edits them any time with no reason',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: IX,
  status: 'new',
  evidence: [
    'CLAUDE.md §5.2 — baseHcp "is entered in the admin and locked before the Calcutta"; RUNBOOK.md:8 — "hándicap base **bloqueado**"',
    'grep -in "lock|bloquead" src/screens/admin/AdminPlayers.tsx src/engine/settings/schema.ts src/screens/admin/AdminTournament.tsx → no lock state or check; AdminPlayers.tsx:250-330 edits source, index, estimate and base at any tournament status',
    'Contrast: Day-2 overrides require a reason (AdminHandicaps.tsx:113-126); a base change, which moves both days, requires none',
  ],
  impact: 'After twelve lots were bought on the strength of each player\'s handicap, one edit (or a UX-01 typo) changes every playing handicap for both days, and nothing asks why or shows the players that it changed; the audit log is the only trace.',
  recommendation: 'A "Fijar hándicaps" action in Comité (and automatically when the auction opens) after which base changes need a reason, are shown as a caution line on En vivo and in the player sheet, and are listed in Historial; the readiness checklist (UX-06) includes it.',
  effort: 'S',
  repro: '/t/_/full12-live/admin/jugadores (a live tournament with a sold Calcutta) → any player → change "Hándicap base": Guardar is enabled with no reason field.',
})

// ---- write ----
F.forEach((f, i) => (f.id = `UX-${String(i + 1).padStart(2, '0')}`))
const ordered = F.map(({ id, title, severity, verdict, area, status, evidence, impact, recommendation, effort, repro }) => ({ id, title, severity, verdict, area, status, evidence, impact, recommendation, effort, repro }))
writeFileSync(OUT, JSON.stringify(ordered, null, 2))
JSON.parse(readFileSync(OUT, 'utf8'))
const count = ordered.reduce((m, f) => ((m[f.severity] = (m[f.severity] || 0) + 1), m), {})
console.log('wrote', ordered.length, 'findings', JSON.stringify(count))
