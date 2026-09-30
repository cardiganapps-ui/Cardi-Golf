// Builds $S/panel/COPY.findings.json (kept as JS so quoting stays sane while appending).
import { writeFileSync } from 'node:fs'
const S = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad'
const E = `${S}/panel/evidence/COPY`
const SH = 'docs/review/2026-09-30/shots'
const TSX = `cd ${E} && /home/user/Cardi-Golf/node_modules/.bin/tsx --tsconfig /home/user/Cardi-Golf/tsconfig.app.json`

const F = []
const add = (f) => F.push({ id: `COPY-${String(F.length + 1).padStart(2, '0')}`, ...f })

add({
  title: 'Liquidación gives two contradictory "X paga a Banco" instructions: the vía-banco list ignores what was already paid, while its own hint says the banker already collected',
  severity: 'P0',
  verdict: 'CONFIRMED',
  area: 'Correctness of rules and money',
  status: 'new',
  evidence: [
    'src/engine/core/money.ts:243-252 — viaBank = prizes − (entry + side pots + Calcutta purchases) per person; no flow\'s `paid` flag is consulted',
    'src/screens/tournament/MoneyScreen.tsx:64 — "Quién debe qué" lists only unpaid obligations (`!f.paid`), rendered at :228-250 directly above the vía-banco list at :256-290',
    'src/i18n/es-MX.ts:1820 — viaBankHint: "${banker} cobró inscripciones y martillazos y paga a cada quien." (claims the money was collected up front, as CLAUDE.md §11 defines vía banco)',
    'RUNBOOK.md:26 — Calcutta night: «Quién debe qué»: inscripciones, martillazos y recompras. Marca "Pagado" conforme paguen. Todo se paga esa noche.; RUNBOOK.md:68 — «"Vía banco" es la lista de lo que el banquero paga a cada quien.» The list instead asks losers to pay the bank their full net again',
    `${E}/settle-check.out — full12-finished (entries of 10 players marked paid): Arturo is told "paga a Banco $750 (Calcutta)" AND "paga a Banco $2,250"; his true remaining balance after the recorded $2,500 entry is +$250 in his favour. Camilo is told the bank pays him $7,700 while he still owes $3,000 Calcutta and has prizes of $13,200. Following checklist + vía banco, every one of the 12 players ends with the wrong wallet (e.g. Arturo −$5,500 vs true −$2,250; Camilo +$1,200 vs true +$7,200)`,
    `${SH}/t_dinero-full12-finished-15pro-light-copy-checklist.png and ${SH}/t_dinero-full12-finished-15pro-light-copy-viabanco.png — both lists on one screen, same sentence form, different amounts`,
  ],
  impact: 'On Sunday night the banker reads Liquidación to settle 12 friends. Entries are marked paid on Calcutta night (RUNBOOK, §10 "se paga antes de dormir"), so the vía-banco list charges every entry a second time and underpays every winner by what they prepaid (Camilo short $5,500 in the fixture) unless someone notices. The hint text tells them the opposite of what the list assumes.',
  recommendation: 'Decide the model and make copy and engine agree. Per CLAUDE.md §11, vía banco means the bank already holds the entries and hammer prices: the list should be bank → winner for gross prizes and Calcutta shares (minus anything still unpaid in "Quién debe qué"), plus the peer-to-peer buybacks/bets. Compute it from flows with their `paid` flags (remaining = obligations not yet marked paid, payouts not yet marked paid). Add a line under the heading: "Ya descontamos lo que marcaste como pagado." Test: money.test.ts case "entries marked paid → vía banco pays gross prizes and never asks a paid entry again"; golden snapshot for full12-finished.',
  effort: 'M',
  repro: `1) ${TSX} settle-check.ts full12-finished  (prints, per player, what the checklist and the vía-banco list each ask vs the true net). 2) Open http://127.0.0.1:4173/t/_/full12-finished/dinero → Liquidación: "Arturo paga a Banco $750 · Calcutta" in "Quién debe qué" and "Arturo paga a Banco $2,250" under Vía banco, while the fixture records his $2,500 entry as paid.`,
})

add({
  title: 'Marking a vía-banco payout "Pagado" can never stick: the tap stores the net line amount, the engine requires the gross prize total',
  severity: 'P1',
  verdict: 'CONFIRMED',
  area: 'Correctness of rules and money',
  status: 'new',
  evidence: [
    'src/screens/tournament/MoneyScreen.tsx:88 — togglePayout(playerId, tr.amount, true) sends the vía-banco NET amount (e.g. $7,700)',
    'supabase/migrations/0010_admin_safety.sql:330-332 — set_payment_paid stores p_amount as given (upsert replaces amount)',
    'src/engine/core/money.ts:173-181 — a payout counts as paid only when payoutPaid ≥ owedPayout, where owedPayout is the GROSS payouts ($13,200 for Camilo)',
    `${E}/payout-mark.out — "vía banco line: Banco paga a Camilo 7700 | gross payouts owed to Camilo 13200 … after tapping Pagado: payout flows paid = [false,false,false] => row shows as paid? false"`,
  ],
  impact: 'For every winner who also paid an entry (all of them), the banker taps "Pagado" and the row stays unpaid; the toast says it saved. The Comité cannot record who has been paid on the final night, which is the one moment the ledger matters.',
  recommendation: 'Record payouts against the same basis the engine checks (gross), or make the engine compare against the vía-banco net for that person. Fold into the COPY-01 fix. Test: money.test.ts "mark vía-banco payout paid → payout flows paid".',
  effort: 'S',
  repro: `${TSX} payout-mark.ts  → prints the two amounts and paid=false after the simulated tap (same payments row MoneyScreen writes).`,
})

add({
  title: 'Dinero says "Pagó $X" for money that has not been paid: the figure is total obligations, including live bet losses; the WhatsApp settlement text repeats it',
  severity: 'P1',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'new',
  evidence: [
    'src/engine/core/money.ts:204-213 — `m.paid += f.amount` for every outgoing flow (entry, Calcutta, buyback, side pot, bet) regardless of `f.paid`',
    'src/screens/tournament/MoneyScreen.tsx:156 — person line "{t.money.paid} {formatMoney(p.paid)}, recibe …" → "Pagó $6,000, recibe $16,000"',
    'src/screens/tournament/MoneyScreen.tsx:94 — share text sent to WhatsApp: "Camilo: pagó $6,000, recibe $16,000, neto +$10,000"',
    `${E}/settle-check.out — full12-finished: Leonel shows "Pagó $4,750" with $0 actually marked paid; Camilo "Pagó $6,000" with $3,000 marked`,
    `${SH}/t_dinero-full12-live-15pro-light-copy-pago.png`,
  ],
  impact: 'The word that decides trust is wrong. A player sees "Pagó $4,750" and believes the bank has his money; the banker sees the same line and cannot tell who has paid. The shared WhatsApp summary, which is what friends settle from, carries the same false past tense.',
  recommendation: 'Rename the figure to what it is: "Pone $4,750, cobra $8,200" (or "Aporta / Recibe"), and show actual payment state separately ("Debe $2,000" in caution until the checklist is clear). Same in shareText. Keep "Pagó" only for sums of flows with paid=true. Test: a render test on MoneyScreen with no payments marked asserting no "Pagó $" text.',
  effort: 'S',
  repro: 'Open http://127.0.0.1:4173/t/_/full12-finished/dinero, tap "Si terminara ahora": Leonel reads "Pagó $4,750, recibe …" although the fixture has no paid payment row for him (see settle-check.out).',
})

add({
  title: 'Raw technical errors reach players on the field paths: "TypeError: Failed to fetch" under the PIN and in the tournament gate; ~90 UI sites print error.message',
  severity: 'P1',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'partly fixed (DESIGN_AUDIT "Loading, empty, error": raw error text; audit-2026-09-28 P2 "Raw PostgREST English errors … in unwrap toasts" — the outbox now maps to t.sync.errDenied/errNetwork, nothing else does)',
  evidence: [
    `${SH}/t_entrar-ensayo-15pro-light-copy-rawerror.png — Entrar, claim request dropped: red "TypeError: Failed to fetch" under "Tu PIN"`,
    `${SH}/t_gate-ensayo-15pro-light-copy-rawerror.png — tournament gate, lookup dropped while the phone reports online: "Algo salió mal / TypeError: Failed to fetch / Reintentar"`,
    'src/screens/tournament/EnterScreen.tsx:55,77; src/screens/tournament/TournamentGate.tsx:120; src/components/ui.tsx:132-143 (ErrorBox prints the message verbatim)',
    'src/data/api.ts:18-25 — unwrap/rpc throw ApiError(res.error.message): PostgREST/RLS text such as "new row violates row-level security policy…" passes straight through; api.ts:9 promises screens will map 23505/42501/22023 but only AdminRounds.tsx:53 maps one code',
    'grep -rnE "\\.message\\b" src/screens src/components src/app --include=*.tsx → 93 sites in 52 files (toasts, ErrorBox, inline errors)',
    `${SH}/t_admin_historial-full12-live-15pro-light-copy-rawerror.png — Comité › Historial without an authenticated session: "Algo salió mal / permission denied for function tournament_audit"`,
    'docs/handoff.md:37 — the project\'s own handoff tells Diego that an old Comité phone correcting a hole «verá "permission denied" hasta que recargue»: the raw English error is a known, accepted user-facing state',
  ],
  impact: 'Patchy 4G on the course is the defining condition. A player who types his PIN as signal drops gets English developer text and no next step (on iPhone Safari the string is "TypeError: Load failed"). Organizers get RLS and constraint messages in English from every Comité mutation.',
  recommendation: 'One `humanError(e)` in src/lib (network → "Sin señal. Tu PIN no se envió; vuelve a intentar en cuanto tengas señal."; 42501 → "No tienes permiso para esto. Pídeselo al Comité."; 23505 → per-context; timeout → "El servidor no respondió…"; unknown → t.common.error + code for support). Route every toast/ErrorBox/inline error through it; lint rule banning `e.message` in src/screens. Unit-test the mapper with the real strings: "TypeError: Failed to fetch", "TypeError: Load failed", PostgREST 42501/23505 bodies.',
  effort: 'M',
  repro: `node ${E}/raw-errors.mjs (Playwright against :4173/t/ensayo; aborts the claim_player and lookup_tournament requests inside the browser, so nothing reaches the server; one anonymous sign-in, state reused) → prints "TypeError: Failed to fetch" for both.`,
})

add({
  title: '"¿Cómo se calculó?" prints money without thousands separators ("$10000") next to the formatted figure ("+$10,000")',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'partly fixed (audit-2026-09-28 P2 "Explanation strings…"; DESIGN_NOTES says the engine now formats thousands, but only prizeCheck.ts does)',
  evidence: [
    'src/engine/core/ranking.ts:140-148 — `${g.position}º lugar: $${total}`, `$${total} ÷ ${n} = $${base}`, title `$${amount}`',
    'src/engine/modules/individual/index.ts:166 — `$${p.amount} ÷ ${members.length}`; src/engine/computeTournament.ts:162 `$${modules.auction.unfilled} sin asignar`',
    `${E}/scan1.txt — 30 distinct engine strings with 4+ digit raw money: "1º lugar: $10000", "$2000 entre los dos = $1000 cada uno", "1º lugar: $3000"…`,
    `${SH}/t_dinero-full12-live-15pro-light-copy-how.png — row "+$10,000", sheet title "$10000", step "1. 1º lugar: $10000"`,
  ],
  impact: 'The explanation is the product\'s trust promise (§1 "every number explainable on tap"); showing the same prize in two formats on one screen reads as sloppy exactly where people check the money. With ties the lines become "$15000 ÷ 2 = $7500".',
  recommendation: 'Give the engine one `fmtMoney` (the prizeCheck helper) and use it in ranking.ts, individual, pairs, snake, auction, computeTournament warnings. Add a test that walks every `why` in the golden fixtures and fails on /\\$\\d{4,}/.',
  effort: 'S',
  repro: `Open http://127.0.0.1:4173/t/_/full12-live/dinero → tap Camilo → tap "+$10,000" on "Individual, 1º": the sheet reads "$10000 / 1º lugar: $10000". Or ${TSX} dump-strings.ts out.json and grep '\\$[0-9]{4,}'.`,
})
add({
  title: 'Tie places render as "T3º" in prize labels (Dinero breakdown, ceremony, share card)',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'still open (audit-2026-09-28 Copy: ties read "T3º")',
  evidence: [
    'src/engine/modules/individual/index.ts:162 — label `${label}, ${row.label}º` with row.label "T3"; same in pairs/index.ts:151, games/lowScore/index.ts:84',
    'src/components/ShareCard.tsx:111 `${row.label}º`; src/screens/tournament/CeremonyScreen.tsx:124 `${r.label}º`',
    `${E}/scan1.txt — "Individual, T3º" (longnames prizes[2].label), "Match play, T2º" (match8), "Match play, T1º" (bracket8)`,
  ],
  impact: 'A tied player reads "Individual, T3º" as his prize line in Dinero; "T3º" is neither Spanish nor the board\'s own "empatado en 3.º" (es-MX.ts:10-15).',
  recommendation: 'Build prize labels with the existing `ordinal()` ("Individual, empatado en 3.º") or a short "3.º (empate)"; never append º to an engine label. Test: golden snapshot assertion that no label matches /T\\d+º/.',
  effort: 'S',
  repro: `${TSX} dump-strings.ts out.json && grep -o 'T[0-9]*º[^"]*' out.json | sort -u`,
})

add({
  title: 'The settlement\'s mark-as-paid button reads "Pagado" on every unpaid debt; paid and unpaid states share the same word (and the same accessible name)',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'new',
  evidence: [
    'src/screens/tournament/MoneyScreen.tsx:243-244 — each unpaid row in "Quién debe qué" renders a secondary button whose text is t.moneyScreen.markPaid = "Pagado"',
    'src/screens/tournament/MoneyScreen.tsx:279-285 — vía banco: unpaid payout → button "Pagado"; paid payout → ghost button with a check and aria-label "Pagado". Same label for opposite states',
    'src/i18n/es-MX.ts:1137 and :1830 — markPaid: "Pagado" (a state word, used as the action)',
    `${SH}/t_dinero-full12-finished-15pro-light-copy-checklist.png — "Leonel paga a Banco  Inscripción  $2,500  [Pagado]" for a debt that is not paid`,
  ],
  impact: 'The Comité reads Liquidación at the villa to know who still owes; every outstanding row ends in the word "Pagado". A glance (or a screen-reader user) cannot tell settled from outstanding, and a tap feels like confirming a fact rather than recording one.',
  recommendation: 'Action label "Marcar pagado" on unpaid rows; state "Pagado" with the check (and aria-pressed=true) on paid rows, with "Desmarcar" in the accessible name. Put the outstanding count in the section heading ("Quién debe qué: 14 pendientes, $19,625").',
  effort: 'S',
  repro: 'http://127.0.0.1:4173/t/_/full12-finished/dinero → Liquidación: every row under "Quién debe qué" is unpaid (MoneyScreen.tsx:64 filters !f.paid) and every one ends in "Pagado".',
})

add({
  title: '"paga a Banco" / "Banco paga a…": the settlement sentences treat the bank as a person\'s name, and the banker also appears as a payee of himself',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'new',
  evidence: [
    'src/screens/tournament/MoneyScreen.tsx:30 — name(null) = t.moneyScreen.bank = "Banco", composed at :237 and :273 as "<b>Leonel</b> paga a Banco" (Spanish needs "le paga al banco")',
    `${SH}/t_dinero-full12-finished-15pro-light-copy-viabanco.png — "Banco paga a Iván J. $3,300" while the header says "Banco: Iván J."; "Iván J. paga a Banco — Calcutta $2,000" in the checklist`,
  ],
  impact: 'The most important sentence on the screen is ungrammatical, and the banker reads lines where he pays and is paid by himself; small, but it is the sentence people act on.',
  recommendation: 'Compose with the article ("Leonel le paga al banco", "El banco le paga a Camilo") and name the holder once per line where it matters: "Iván J. (banco) le paga a Camilo". When from/to is the banker himself, net it into his own line ("Iván J.: se queda $3,300 del banco").',
  effort: 'S',
  repro: 'http://127.0.0.1:4173/t/_/full12-finished/dinero → Liquidación → Vía banco.',
})

add({
  title: '"Por asignar: $2,400" in red on a finished tournament with no word on what the money is or what to do (it is La Víbora held by 4 unanswered tiebreaks)',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'new',
  evidence: [
    'src/screens/tournament/MoneyScreen.tsx:101 — verdict = bankOk or bankPending(difference) only; :138 the "Provisional" note is hidden once tournamentFinal',
    `${E}/unassigned.out: full12-finished final=true, bank difference 2400, snake prizes 1200 of 3600, pendingSnakeTiebreaks 4, flags.warnings []`,
    'src/screens/tournament/LiveScreen.tsx:177-185 — the pending-víbora line and engine warnings render only on En vivo (and Comité), never on Dinero',
    `${SH}/t_dinero-full12-finished-15pro-light-copy-checklist.png — red "Por asignar: $2,400" under "Sale del banco $43,600"`,
  ],
  impact: 'At the final settlement the one alarming figure has no explanation; the banker cannot tell whether money is missing, owed, or waiting on a Comité answer, and players see $2,400 "unassigned" of their pot.',
  recommendation: 'Explain the gap where it is shown: list its parts from the engine ("$2,400 de La Víbora: faltan 4 respuestas de «¿Quién embocó al último?»", "$1,600 de la Calcutta sin dueño: decide el Comité") with a link to Comité › Tarjetas. Add an engine field `money.unassigned: Array<{ source, amount, reason }>` so the copy never guesses.',
  effort: 'M',
  repro: `${TSX} unassigned.ts ; then open http://127.0.0.1:4173/t/_/full12-finished/dinero.`,
})

add({
  title: 'Tarjeta shows "4 pts, águila neto" (wrong gender) and, before anything is entered, announces "birdie neto"/"águila neto" for every player from the default values',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'still open (audit-2026-09-28 P2 "The Tarjeta shows «3 pts, birdie neto» … for unsaved default values"); gender error is new (introduced by the display mapping in DESIGN_NOTES PR 3)',
  evidence: [
    'src/screens/tournament/ScorecardScreen.tsx:39 — scoreNameEs = netScoreName(pts).replace("eagle", "águila") → "águila neto"; águila is feminine (the feed says "águila neta", es-MX.ts:1847)',
    'src/engine/core/stableford.ts:16-31 — netScoreName returns "eagle neto", "doble bogey neto o peor"…',
    `${SH}/t_tarjeta-full12-live-15pro-light-copy-aguilaneto.png — hole 12 opened fresh: Camilo "3 pts, birdie neto", Matías "4 pts, águila neto", Fabián and Iván J. "3 pts, birdie neto", nobody has entered a score`,
  ],
  impact: 'The most-used screen misgenders the best score a player can make and, on every stroke hole, tells four people they made birdie or eagle before they type anything; a tired scorer can save the default believing the badge.',
  recommendation: 'Move Spanish score names into i18n (t.card.netName by points: "doble bogey neto o peor", "bogey neto", "par neto", "birdie neto", "águila neta", "albatros neto") and delete the replace(). Show the badge only after a stepper is touched ("Toca para anotar" or nothing). Test: render test for pts 4 → "águila neta".',
  effort: 'S',
  repro: 'http://127.0.0.1:4173/t/_/full12-live/tarjeta — read the badge beside Matías (two stroke dots).',
})

add({
  title: 'The Reglamento is not true to the tournament\'s settings: it describes a Calcutta dinner, a Day-2 cut, "los dos días" and C/D tiers whether or not they exist',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'partly fixed (audit-2026-09-28 Copy: «Parejas fijas por categorías ()» with no tiers is fixed; the rest is new)',
  evidence: [
    `${E}/text/pairs8_reglamento.txt — pairs8 has no Calcutta yet reads "Parejas fijas por categorías (A-B), sorteadas en la cena de la Calcutta."; its cut is off yet reads "…se te recorta 1 golpe por cada 2 puntos por encima, máximo 0."; default label gives "El último lugar gana Último lugar."`,
    'src/i18n/es-MX.ts:1938 (cena de la Calcutta, unconditional), :1941 ("juegan juntas los dos días"), :1940 ("mejor día 2 combinado"), :1936 ("el día 2 usa el hándicap ajustado"), :1945 ("se reparte entre los cuatro"), :1953 ("Si un C o D queda 1º o 2º"), :1954 ("Todo se paga antes de dormir"), :1910 ("la hoja impresa")',
    'src/i18n/es-MX.ts:1926 — the cut sentence is printed even when day2Cut.maxStrokes is 0 or the tournament has one round',
  ],
  impact: 'CLAUDE.md §0.5 promises the second tournament needs zero code changes; its players would read rules that do not apply to them (a Calcutta, a cut, four-player groups, C/D tiers) in the document the Comité points to in a dispute.',
  recommendation: 'Build every sentence from settings: omit the draw location when auction is off, omit or rewrite the cut when maxStrokes = 0 or rounds = 1 ("Sin recorte: juegas todo el torneo con el mismo hándicap."), use rounds/groupSize for "los N días"/"entre los que haya en el grupo", derive the tier-slot sentence from settings.auction.payout, and suppress "El último lugar gana …" when the label is the default. Snapshot-test RulesScreen against minimal4, pairs8 and full12.',
  effort: 'M',
  repro: 'http://127.0.0.1:4173/t/_/pairs8/reglamento and compare with the fixture settings (no auction module, cut disabled).',
})

add({
  title: 'The Reglamento fails the brief\'s own test (a non-golfer\'s partner): jargon is never defined, there is no money summary, and its key governance line is ambiguous',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'new',
  evidence: [
    `${E}/text/full12-live_reglamento.txt — uses Stableford, bogey, birdie, eagle, índice de golpe (SI), tee, green, putts, levantar, lote, martillazo, recompra, hándicap base, without one definition; "Levantar cuenta 0 puntos" assumes the reader knows what levantar is`,
    'The document never says how the money moves: no total of the pot vs prizes (§5.8 table), nothing on the banker, "vía banco / sin banco", "si terminara ahora" or when things are paid besides "Todo se paga antes de dormir"',
    'src/i18n/es-MX.ts:1910 — "Si algo no cuadra con la hoja impresa, manda la hoja y el Comité decide." In Mexico "mandar" reads first as "send" (the app itself uses it that way: "Te mandamos un código", "Mándaselo por WhatsApp", "Mandar aviso"), so the rule of precedence reads as "send the sheet". CLAUDE.md §5 also says the opposite precedence (the brief wins and the conflict is flagged)',
    'src/engine/formats/stableford.ts:25 — the points table as a middle-dot string with "eagle" and no albatross (5 points per §5.3)',
  ],
  impact: 'The Reglamento is what the Comité points to when two friends disagree about money; people who do not already know golf betting cannot follow it, and the one sentence about which text prevails can be read two ways.',
  recommendation: 'Rewrite as a document: 1) "En corto" (what you pay, what you can win, who holds the money, when it is paid), 2) the games, each with one worked example ("Si haces 5 en un par 4 y tienes un golpe de ventaja, cuentas 4: par neto, 2 puntos."), 3) a short glossary. Replace the precedence line with "Si esta página y la hoja impresa dicen cosas distintas, vale esta página y el Comité lo aclara." (or the reverse, decided once). Ask Diego which prevails and add it to docs/handoff.md.',
  effort: 'M',
  repro: 'Read http://127.0.0.1:4173/t/_/full12-live/reglamento top to bottom with someone who does not play golf.',
})

add({
  title: 'PIN lockout copy says "Espera 5 minutos" for the 15-minute player lock, ignores lockedUntil, and a missing player falls through to "Ese torneo no existe"',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'new',
  evidence: [
    'supabase/migrations/0013_identity.sql:435-438 — device lock 5 attempts / 5 min; player lock 15 attempts / 15 min; both return reason "locked" with lockedUntil (:494-499)',
    'src/screens/tournament/EnterScreen.tsx:50 — reason "locked" → t.enter.locked = "Muchos intentos. Espera 5 minutos." (es-MX.ts:1079); lockedUntil is never read',
    'src/screens/tournament/EnterScreen.tsx:53 — any other reason (claim_player returns "not_found" for a deleted player) → t.enter.notFound = "Ese torneo no existe. Revisa el enlace o el código."',
  ],
  impact: 'On the first tee a player locked by someone else\'s attempts (the player lock counts every device) is told to wait 5 minutes by his own fault, waits, fails again, and is told the same thing; a player the Comité just re-created gets "Ese torneo no existe".',
  recommendation: 'Use lockedUntil: "Demasiados intentos con este jugador. Vuelve a intentar a las 9:14, o pídele al Comité que lo desbloquee." Distinguish device vs player lock (the RPC can return which). Map not_found to "Ese jugador ya no está en el torneo. Actualiza la lista."',
  effort: 'S',
  repro: 'Read EnterScreen.tsx:49-53 against 0013_identity.sql:430-500 (do not brute-force a real PIN; the Admin de Polo PIN-lock fixture shows the 15-minute player lock: /admin/_/personas).',
})

add({
  title: 'Three words for pots, used for overlapping things: "bote" is the side pot, the Ronda rápida\'s main pot and the Calcutta; "pozo" is the Calcutta and the Víbora\'s money',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'still open (DESIGN_AUDIT B.5 "Pot: Bolsa vs Pozo"; DESIGN_NOTES term table: "bolsa / pozo (two pots, two words)")',
  evidence: [
    'Entry pot = "bolsa": es-MX.ts:588 "bolsa de ${pot}", :642 "Bolsa principal", :1140 money.pot "Bolsa", :1922 rules "bolsa de ${pot}"',
    'Same concept in Ronda rápida = "bote": es-MX.ts:820 "cada uno pone la entrada y el bote se reparte por lugares", :822 potLine "Bote de ${pot}, se reparte ${split}."; entry fee is "Entrada por jugador" (:821) there and "Inscripción por jugador" (:643, :1522) elsewhere',
    'Calcutta = "pozo" (es-MX.ts:1235, :1547, :1741, :1952) but "bote" in the game catalog: src/engine/games/catalog.ts:51 "Subasta de jugadores la noche anterior, con su propio bote."',
    'La Víbora is paid from the entry bolsa, yet the Reglamento says "cobran $200 cada uno del pozo ($600 por grupo)" (es-MX.ts:1945; full12-live_reglamento.txt)',
    'Side pots = "bote aparte" (es-MX.ts:655, :1249) and "Botes" in Dinero (:1817, :1837); engine explanations "Bote $1,600 ÷ 26 skins = $61 y centavos c/u" (src/engine/games/payout.ts:79,84)',
  ],
  impact: 'Money trust depends on knowing which pile a peso comes from. A player reading that the Víbora is paid "del pozo" can reasonably think the Calcutta pays it; an organizer moving from a Ronda rápida to a tournament meets the same pot under a different word.',
  recommendation: 'Fix the vocabulary once and add it to the DESIGN_NOTES term table: bolsa = entry money (tournament and Ronda rápida alike), pozo = Calcutta only, bote = a side pot someone buys into; inscripción everywhere for the entry fee. Rewrite the Víbora line to "…cobran $200 cada uno de la bolsa". A unit test over es-MX.ts and engine strings that fails on "pozo" outside auction keys.',
  effort: 'S',
  repro: 'grep -n "bote\\|Bote\\|pozo\\|Pozo\\|bolsa\\|Bolsa" src/i18n/es-MX.ts src/engine/games/catalog.ts src/engine/games/payout.ts',
})

add({
  title: 'The live feed has no voice: four fixed templates, no commentary, repeated verbatim; the one place the voice spec allows personality has none',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'new (DESIGN_AUDIT §7 item 7 removed the emoji and exclamations; nothing replaced them)',
  evidence: [
    'src/screens/tournament/FeedTicker.tsx:13-24 and src/engine/core/feed.ts:10-14 — four kinds only (birdie, leadChange, snakePass, honoreeHole), one template each (es-MX.ts:1845-1850)',
    `${E}/text/full12-live_live.txt — the ticker: "Matías: birdie neto en el 10, +3 pts", "Matías: birdie neto en el 9, +3 pts", "Matías: águila neta en el 5, +4 pts", "Leonel: birdie neto en el 8, +3 pts", "Leonel: águila neta en el 6, +4 pts", "Leonel: águila neta en el 4, +4 pts", "Leonel: águila neta en el 2, +4 pts"…, each followed by "Día 2"`,
    'CLAUDE.md §9.2 promises "light Mexican-Spanish commentary"; DESIGN_NOTES:8 "Personality lives only in the live feed\'s commentary"; CLAUDE.md §14 (superseded) asked for "light roasting"',
    'Accuracy gaps in the same four lines: a gross eagle is reported as "águila neta" (FeedTicker.tsx:16 ignores e.gross when points ≥ 4); 5+ points (albatros) also reads "águila"; the honoree line prints "1 pts" (es-MX.ts:1850)',
  ],
  impact: 'The feed is the bachelor-party screen: it runs on the villa TV and between shots. As shipped it reads like a log, so the app has no voice anywhere (UI copy is deliberately dry); nothing is mean, but nothing is fun either, which the brief lists as success criterion 8 ("It should dazzle").',
  recommendation: 'Write a small commentary system: 3–5 variants per event, chosen deterministically (hash of event id) so every phone shows the same line; context-aware events (first birdie of the day, back-to-back birdies, a gross eagle, someone leaving the Víbora after holding it 6 holes, the honoree\'s birdie, a group finishing, a lead change on the last hole); a tone guide with do/don\'t examples ("se lleva la víbora" yes; mocking a bad hole no). Collapse repeats ("Leonel: 3 águilas netas en 5 hoyos"). Keep money out of the feed.',
  effort: 'M',
  repro: 'http://127.0.0.1:4173/t/_/full12-live — read "Lo último".',
})

add({
  title: 'Privacy notice says money is private ("Tu dinero solo lo ves tú"), but every tournament member sees every player\'s net in Dinero, on the TV Ceremonia and in the shared settlement',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'new (legal substance is TRUST\'s; this is the copy\'s accuracy)',
  evidence: [
    'src/i18n/es-MX.ts:843 — "Los montos de dinero de un torneo solo los ve su Comité y cada quien el suyo."; :845 — "Tu dinero solo lo ves tú."',
    'src/screens/tournament/MoneyScreen.tsx:36 — `people` = every player of the tournament, no filter by viewer; rendered at :143-190 with "Pagó …, recibe …" and the signed net',
    `${E}/text/full12-live_dinero.txt — all 12 players with their nets on one screen`,
    'src/screens/tournament/CeremonyScreen.tsx:168-190 — "Resumen de dinero" step lists every net on the TV; MoneyScreen.tsx:92-99 share text lists every net',
  ],
  impact: 'The notice contradicts what users see in the first minute of Dinero; a legal text that is visibly wrong undermines every other promise in it (TRUST owns whether the practice is acceptable; here the text is simply false for in-tournament money).',
  recommendation: 'Say what happens: "Dentro de un torneo, todos sus jugadores ven lo que cada quien pone y gana (así funciona la liquidación). En tu perfil, el total de lo que ganaste o pusiste solo lo ves tú." Apply the same sentence in "Qué datos guardamos" and "Quién los ve".',
  effort: 'S',
  repro: 'Open http://127.0.0.1:4173/privacidad, then http://127.0.0.1:4173/t/_/full12-live/dinero.',
})

add({
  title: 'Every tournament\'s champion "Se lleva el Putter": the first tournament\'s sponsored trophy is hard-coded in the generic Ceremonia',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'new',
  evidence: [
    'src/i18n/es-MX.ts:1979 — ceremony.trophy: "Se lleva el Putter"',
    'src/screens/tournament/CeremonyScreen.tsx:253 — `{step.champion && <span>{C.champion}. {C.trophy}</span>}`: no setting, no condition',
    `${SH}/t_ceremonia-full12-finished-laptop-light-copy-putter.png — "El campeón / Camilo / 73 puntos, $10,000 / Campeón. Se lleva el Putter"`,
    `${E}/putter-check.out — the same line for "Copa Tres Marías" (pairs8) and "Sábado en Bosques" (minimal4-live), which have no trophy`,
  ],
  impact: 'The climax of any other group\'s ceremony announces a trophy that does not exist (the Putter is Golfbreaks\' prize for Nacho\'s tournament, CLAUDE.md §5.3), in front of everyone on the TV. It breaks §0.5 "names are copy, not code".',
  recommendation: 'Make the trophy a tournament setting (labels.trophy, empty by default; "El Putter" for the first tournament) and render "Se lleva {trophy}" only when set. Also label the ceremony\'s Calcutta owner list ("Quién cobra") and add pair prizes to the Matrimonios reveal, which today shows points only.',
  effort: 'S',
  repro: 'http://127.0.0.1:4173/t/_/pairs8/ceremonia (a tournament with no trophy) → Empezar → Siguiente to "El campeón".',
})

add({
  title: 'The Tarjeta\'s two steppers have no visible labels: "Golpes" and "Putts" exist only as aria-labels',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Interaction design and core flows',
  status: 'new (the DESIGN_DIRECTION.md:62 mock itself shows "[−] 4 [+] 2" with no words, so the spec is the source)',
  evidence: [
    'src/components/primitives.tsx:62-76 — Stepper renders `label` only as role=group aria-label and in the ± buttons\' aria-labels',
    'src/screens/tournament/ScorecardScreen.tsx:566-567 — Stepper label={S.strokes} and label={S.putts}; no column header is rendered for the player rows',
    `${SH}/t_tarjeta-full12-live-15pro-light-copy-aguilaneto.png — four rows of "− 4 +  − 2 +  Levantó" with no word saying which number is strokes and which is putts`,
  ],
  impact: 'The single most-used input, used one-handed in sun by whoever keeps the card: a first-time scorer (or a guest in a Ronda rápida) can put putts in the strokes box; the only hint is that one number is grey at par. Mislabelled holes become Comité discrepancies and wrong money.',
  recommendation: 'One header row above the four players ("Golpes", "Putts") aligned to the steppers, or a small caption under each figure on the first row. Keep the aria-labels. Update DESIGN_DIRECTION so the mock carries the labels.',
  effort: 'S',
  repro: 'http://127.0.0.1:4173/t/_/full12-live/tarjeta — look for the words "Golpes"/"Putts" on screen (there are none).',
})

add({
  title: '"¿Cómo se calculó?" reads as algebra, and the money explanations are thin: a prize says only "1º lugar: $10000"',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'partly fixed (audit-2026-09-28 P2 explanation strings: glyphs replaced by words; the explanations themselves did not change)',
  evidence: [
    'src/engine/core/compute.ts:156-161 — a hole: "Par 4, SI 3: 1 golpe de ventaja", "5 − 1 = 4 neto", "4 + 1 − 5 + 2 = 2 pts (par neto)"; the "+ 2" is never explained',
    'src/engine/core/handicap.ts:117-119 — the cut: "Día 1: 37 − 36 = 1 pts de más; 1 ÷ 2 = 0.5, 0 golpes"',
    `${SH}/t_dinero-full12-live-15pro-light-copy-how.png — the whole explanation of a $10,000 prize is "1. 1º lugar: $10000" (no points, no position source, no "si terminara ahora")`,
    'CLAUDE.md §6 sets the bar in prose: "base 20 → 80% = 16 → 1 stroke on SI 1–16 → 5 on a par 4 = net par = 2 points"',
  ],
  impact: 'Zero disputes (§2) depends on these sheets being readable by the person who lost money. Formulas satisfy a golfer who already agrees; they do not settle an argument at dinner.',
  recommendation: 'Lead each explanation with one sentence in words, then the arithmetic: "Hiciste 5 en un par 4. Con tu golpe de ventaja cuentas 4: par neto, 2 puntos." / "Camilo va 1.º con 60 puntos (2 más que Leonel): premio del 1.º, $10,000, si terminara ahora." / "Hiciste 37 el día 1, uno más que 36: el recorte empieza a 2 de más, así que no pierdes golpes." Test the sentences against the §6 cases.',
  effort: 'M',
  repro: 'http://127.0.0.1:4173/t/_/full12-live → tap a player → tap a hole; and /dinero → Camilo → the prize amount.',
})

add({
  title: 'The Comité\'s discrepancy line is shorthand: "Día 2. ahora 5/1 (?), antes 6/1 (Damián)"',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'new',
  evidence: [
    'src/screens/admin/AdminScores.tsx:160-170 — composed in TSX: `${strokes}/${putts}`, "L" for a pick-up, "–" for empty, name("") → "?" for an unknown author, lower-case "ahora" after a period',
    `${E}/text/full12-live_admin_scores.txt — "Discrepancia, Julián, hoyo 3 | Día 2. ahora 5/1 (?), antes 6/1 (Damián) | Dejar el actual | Volver al anterior"`,
    'Same screen\'s hole tiles: "4 pts, 2 p", "1 pts, 1 p" (AdminScores.tsx:282)',
  ],
  impact: 'This is where the Comité decides which of two scores counts, i.e. who wins money. "5/1 (?)" makes them decode units and authorship at the moment they need certainty.',
  recommendation: 'Spell it out: "Ahora: 5 golpes, 1 putt (capturó: no se sabe). Antes: 6 golpes, 1 putt (capturó Damián, 10:42)." Move the strings into i18n.',
  effort: 'S',
  repro: 'http://127.0.0.1:4173/t/_/full12-live/admin/scores — first discrepancy row.',
})

add({
  title: 'Ronda rápida "Con dinero" commits everyone to stakes the screen never shows (Skins $200 buy-in, Tres putts $20 to each rival, Birdies $50…); the only money line is "Bote de $500, se reparte todo al primero."',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'new',
  evidence: [
    'src/engine/games/quick.ts:3-6,32-35 — with money, "each game keeps its catalog stake or buy-in"',
    'src/engine/games/catalog.ts:62,71,80,89,108 — Skins buyIn 200, Birdies stake 50 (direct), Tres putts stake 20 (direct), Low neto buyIn 100, Más cerca buyIn 100',
    'src/i18n/es-MX.ts:820 — the only disclosure: "…los juegos llevan su apuesta y se ajustan en Comité."; :822 potLine "Bote de ${pot}, se reparte ${split}." renders "se reparte todo al primero" (a split that is not a split)',
    `${SH}/ronda-quick-15pro-light-copy-money.png — "Más cerca del hoyo" and "Tres putts" selected, "Con dinero" on, no amount on any chip`,
  ],
  impact: 'Friends agree on money at the first tee from this screen. They start a round in which Polo will later say "Bruno le paga a Camilo $60 (Tres putts)" at a stake nobody chose or saw; correcting it means finding the game in Comité.',
  recommendation: 'With money on, show each selected chip\'s stake inline and editable ("Tres putts: $20 a cada quien por cada tres putts", "Skins: $200 por jugador, bote $800") and a one-line total exposure ("Con 4 jugadores, cada uno pone $900 al empezar"). Replace "se reparte todo al primero" with "todo para el primero".',
  effort: 'M',
  repro: 'http://127.0.0.1:4173/ronda/_ → select "Tres putts", turn on "Con dinero", type 500: no stake appears; compare catalog.ts defaults.',
})

add({
  title: 'Term table violations still shipping: "eagle" (Reglamento, hole explanations, friends feed), "score", "slot", "hcp", "índice de dificultad", "liga", "p" for putts',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'partly fixed (DESIGN_AUDIT B.3/B.5: Thru, Stats, Link, countback, anti-sandbag fixed in the UI; these remain)',
  evidence: [
    '"eagle": src/engine/formats/stableford.ts:25 (Reglamento: "… birdie: 3 · eagle: 4."), src/engine/core/compute.ts:160 ("4 + 1 − 3 + 2 = 4 pts (eagle neto)", 8 distinct in scan1.txt), src/i18n/es-MX.ts:1066 friends feed "un eagle" / "${n} eagles"',
    '"score": src/engine/games/catalog.ts:61,88 ("el score más bajo"), src/engine/games/describe.ts:26,33, src/engine/games/lowScore/index.ts:95 ("Menor score neto contra el par"), src/engine/core/handicap.ts:95 ("Los scores venían en otro orden")',
    '"slot": src/engine/modules/auction/index.ts:190,194,205 ("Mejor de la categoría C que no cobra otro slot: Hugo I. (4º)") while the Reglamento says "lugar"',
    '"hcp": src/i18n/es-MX.ts:1776 teams.hcpTotal "hcp ${n}" (the file header says «hándicap (never "hcp")»)',
    '"índice de dificultad" + "permutación": api/scorecard-extract.ts:103 "Los índices de dificultad no son una permutación de 1 a 18." vs es-MX.ts:1679 "Los índices de golpe (SI) deben ser 1 a 18 sin repetir."; "ventajas" for SI in the Admin de Polo (es-MX.ts:297, :315)',
    '"liga" for link: supabase migration raise "La liga es una página de Polo, como /crews" (term table: enlace); "p" for putts: src/screens/admin/AdminScores.tsx:282 "4 pts, 2 p"',
  ],
  impact: 'Each is small; together they show the term table is not enforced, so the product speaks three dialects (UI Spanish, engine Spanglish, SQL Mexicanisms) in the explanations people use to check money.',
  recommendation: 'Move every engine-visible string behind i18n (the engine returns keys + params; DESIGN_NOTES already notes the screen maps score names) and add a lint test over es-MX.ts + engine `why` strings with the banned list from DESIGN_NOTES:117-136.',
  effort: 'M',
  repro: `${TSX} dump-strings.ts out.json && grep -oiE '"[^"]*\\b(eagle|slot|scores?|hcp)\\b[^"]*"' out.json | sort -u | head`,
})

add({
  title: 'Grammar and agreement slips in shipped strings: "1 pts", "Iván J. y Julián gana 1 arriba", "greenie (en green de salida en par 3…)", "Comprarse cuenta en el máximo", "día 1 28 pts"',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'new',
  evidence: [
    '"1 pts": es-MX.ts:1190 Tarjeta badge "1 pts, bogey neto"; :1850 feed "Nacho en el 3: 1 pts"; compute.ts:153 hole title; Estadísticas "El Resucitado … +1 pts" (text/full12-live_stats.txt); Comité tiles "1 pts, 1 p"',
    '"Iván J. y Julián gana 1 arriba": src/engine/games/match/index.ts:215 pressText composes `${sideName} ${status}` with a singular verb (the "paga/pagan" line at :187 handles plural); scan1.txt friends8 Nassau',
    'src/engine/games/describe.ts:55 "greenie (en green de salida en par 3 y hace par o mejor)" and catalog blurb "Green de salida en par 3 (o salir de la trampa) y hacer par o mejor." (no verb; shown in the Reglamento via RulesScreen.tsx:39)',
    'es-MX.ts:1544 "Comprarse cuenta en el máximo" (reads as "buy oneself an account"); Comité Hándicaps line "Base 6, día 1 28 pts" and "ajuste del comité" in lower case (text/full12-live_admin_handicaps.txt)',
    'Feed: "águila neta" for a gross eagle and for 5+ points (FeedTicker.tsx:16); Calcutta owner list in Ceremonia has no heading (CeremonyScreen.tsx:158-165)',
    'src/engine/games/describe.ts:56 — `en los hoyos ${holes.join(", ")}` renders "Concurso de drive más largo, en los hoyos 14." in the Reglamento (text/friends8_reglamento.txt); two holes read "en los hoyos 3, 7"',
  ],
  impact: 'Visible on the scorecard, the feed and the money boards; each one reads as machine-assembled text to a native speaker.',
  recommendation: 'Plural helpers for every count ("1 pt"/"1 punto"), agreement in composed sentences (a `verb(side)` helper), rewrite the three game descriptions, and a review pass by a native copy editor on every template with parameters.',
  effort: 'S',
  repro: 'grep -n "pts\\`\\|pts\'" src/i18n/es-MX.ts; http://127.0.0.1:4173/t/_/friends8/juegos → Nassau.',
})

add({
  title: 'Voice rules from DESIGN_NOTES are only partly applied: 39 middle-dot joins remain (some player-facing), arrows in money lines, "›" breadcrumbs, mixed quotes, "1º" vs "1.º", ASCII hyphen for minus',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'partly fixed (DESIGN_AUDIT B.1 exclamations fixed: only "¡Vendido!" and "¡Cambio de líder!" remain; B.2 middle dots partly fixed)',
  evidence: [
    'Middle dots: 12 in es-MX.ts (all Admin de Polo + bannerProtected "Protegido · solo lectura") and 27 outside i18n, incl. player-facing src/engine/formats/stableford.ts:25 (Reglamento) and src/engine/games/match/index.ts:185 ("después de 9 · presión desde el 4: Empate"), GameBoardView.tsx:84, TvScreen.tsx:206, AdminHistory.tsx:70,92,121',
    'Arrows: GameBoardView.tsx:66 "Camilo → Damián" in a game\'s money list (Dinero says "paga a"); es-MX.ts:1341 and :1771 ("12 jugadores → 3 equipos"); "›" in es-MX.ts:1767 "Comité › Torneo › Reglas"',
    'Quotes: «» in es-MX.ts:311,352,490,1858 but straight quotes in :612, :869, :1094-1095, :1560',
    'Ordinals: "1.º" from ordinal() (es-MX.ts:10-15, :913) vs "1º" in :646-647, :1932, :1940, :1957, :1975 and engine labels ("Individual, 1º")',
    'Minus: "-100%" (Estadísticas, El Filántropo; es-MX.ts:1898 formats pct without a true minus), "Low neto del día: Hugo I., -2" on Juegos (text/friends8_juegos.txt) and stroke-play countback "Hugo I. -3 – Matías -2" use ASCII hyphens next to an en dash (DESIGN_DIRECTION: true minus sign)',
  ],
  impact: 'Individually nits; together they are why the product reads as assembled rather than written, which is what the redesign set out to fix.',
  recommendation: 'Finish the copy pass with a test: fail on " · ", "→", "›", straight double quotes and /\\dº/ in es-MX.ts and in engine `why`/label output from the golden fixtures; format negatives with the existing true-minus helper.',
  effort: 'S',
  repro: 'grep -c " · " src/i18n/es-MX.ts; grep -rn " · \\|→" src --include=*.tsx --include=*.ts | grep -v "test\\|src/dev"',
})

add({
  title: 'Comité labels that ask for the wrong thing: "Nombre del homenajeado" is the role label (En vivo prints "{label}: {name}"), "A partir de (puntos)" for a cut that starts above the threshold',
  severity: 'P3',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'new',
  evidence: [
    'src/i18n/es-MX.ts:1548-1549 lastPlaceLabel "Nombre del último lugar", honoreeLabel "Nombre del homenajeado"; src/screens/admin/SettingsEditor.tsx:52-57 plain inputs, no hint or placeholder',
    'src/screens/tournament/LiveScreen.tsx:194 renders `{settings.labels.honoree}: {honoree.displayName}` ("El novio: Damián"); an organizer who types the honoree\'s name gets "Nacho: Nacho"',
    'src/i18n/es-MX.ts:1533 cutThreshold "A partir de (puntos)" while the rule is "más de 36" (strictly greater: 37 gives no cut; es-MX.ts:1926, CLAUDE.md §5.2)',
    'src/i18n/es-MX.ts:1513 "Reglas de pareja (A-D, B-C)" bakes the first tournament\'s tiers into a generic label; :1414 "parejas 5 y 6 salen primero…" assumes six pairs',
  ],
  impact: 'Diego configures these once, from a phone; a label that asks for a name produces a visibly wrong home screen for every player, and "A partir de 36" invites a Comité member to apply the cut one point early by hand.',
  recommendation: '"Cómo le dicen al homenajeado (p. ej., El novio)", "Nombre del premio al último lugar (p. ej., La Cuchara de Palo)", "Recorte si hace más de (puntos)"; drop the example tiers from the pairing label; derive the groups hint from the pair count.',
  effort: 'S',
  repro: 'http://127.0.0.1:4173/t/_/full12-live/admin/torneo → Reglas.',
})

add({
  title: 'Player sheet says "2.º, 54 pts, por el 26": the cross-round hole count is printed as if it were a hole number',
  severity: 'P2',
  verdict: 'CONFIRMED',
  area: 'Copy and voice (es-MX)',
  status: 'partly fixed (audit-2026-09-28 P1 #17 "Wrong «Hoyo» figure": GamesScreen.tsx:47-48 now uses the active round; PlayerSheet.tsx:78 still passes totals.thru)',
  evidence: [
    'src/screens/tournament/PlayerSheet.tsx:78 — t.player.position(label, total, t.round.thru(totals.thru, Σ round holes)) → thru 26 of 36',
    'src/i18n/es-MX.ts:1284 — position: "${ordinal}, ${total} pts, por el ${thru}"; DESIGN_NOTES term table: "por el n" = the hole a player is through',
    `${E}/text/sheet-grid.txt — Leonel (8 holes into day 2): "2.º, 54 pts, por el 26"`,
  ],
  impact: 'The first line of every player sheet on day 2 names a hole that does not exist; people checking where a rival is on the course are misled.',
  recommendation: 'Use the current round\'s thru and say which day when there are several: "2.º, 54 pts, por el 8 del día 2" (or "F" / "terminó el día 2"). Test with full12-live.',
  effort: 'S',
  repro: 'http://127.0.0.1:4173/t/_/full12-live → tap Leonel.',
})

writeFileSync(`${S}/panel/COPY.findings.json`, JSON.stringify(F, null, 2))
console.log('wrote', F.length, 'findings')
