import { readFileSync, writeFileSync } from 'node:fs'
const f = 'manual-notes.json'
const notes = JSON.parse(readFileSync(f, 'utf8'))
const add = (file, text) => { notes[file] = [...(notes[file] ?? []).filter((x) => x !== text), text] }
const cutRule = "Rule bullet 'se te recorta 1 golpe por cada 2 puntos por encima, máximo 0': with a maximum of 0 the cut is off, so the rule contradicts itself (printed unconditionally: RulesScreen.tsx:30 → es-MX.ts:1926; DEFAULT_SETTINGS maxStrokes 0, presets.ts:26)."
for (const x of ['t_reglamento-pairs8-15pro-light.png', 't_reglamento-large60-15pro-light.png', 't_reglamento-minimal4-live-15pro-light.png']) add(x, cutRule)
add('t_reglamento-minimal4-setup-15pro-light.png', "The same bullet ends 'máximo 0', i.e. the cut is off (RulesScreen.tsx:30 → es-MX.ts:1926).")
const team = "Detail board is broken for teams: every row is named '?', HOYO shows '0' for teams that finished, and net strokes sit under a 'PUNTOS' header; tapping a row opens nothing (GamesScreen.tsx:154/159/168 assume a player id)."
add('t_juegos-team8-15pro-light-tab-por-equipos.png', team)
add('t_juegos-scramble8-15pro-light-tab-scramble.png', team)
add('t_juegos-stroke8-15pro-light-tab-golpes.png', "Board header says 'PUNTOS' over net strokes (61, 62…) because GamesScreen.tsx:154 hard-codes t.live.points; HOY column empty.")
add('t_juegos-match8-15pro-light-tab-match-play.png', "A 'CUARTOS DE FINAL' bracket appears for a one-round singles event, with seeded pairings that were never played (Elías–Matías, Fabián–Leonel, Gael H.–Julián, Hugo I.–Iván J.) and '—' for every result, directly above a board showing the four real matches finished (Matías 8&6…).")
add('t_juegos-bracket8-15pro-light-tab-match-play.png', "Bracket reads well (winners bold, semifinal slots filled), but '6&5'-style results again look like three-digit numbers, and the points-table sub-lines are truncated ('Día 1 6&5, Día 2 …').")
add('t_juegos-friends8-15pro-light-tab-nassau.png', "The result column says 'Gana 2 y 1' / 'Gana 1 arriba' without saying who; the subject and the press results are in the truncated sub-line ('… presión desde el 7: Damián ga…'). Adjacent rows say 'Empate' and 'Iguales' for the same tie; 'Van' labels the running bet without explanation.")
add('t_juegos-friends8-15pro-light-tab-low-neto-del-dia.png', "Scores use a hyphen ('-2', '-5') where the rest of the app prints '−'.")
add('t_juegos-friends8-15pro-light-tab-el-que-coma-mas-tacos.png', "The '$50' amounts under 'Dinero de este juego' sit mid-row rather than right-aligned; the tab strip is cut ('del hoyo').")
add('t_juegos-friends8-15pro-light-tab-drive-mas-largo.png', "Row reads 'hoyo 14 · Pendiente': lowercase, and no 'Día 2', although other contests say 'Día 1, hoyo 3'.")
add('t_juegos-friends8-15pro-light-tab-individual.png', "HOY column empty; tab strip is 942 px of tabs in 359 px.")
add('t_juegos-pairs8-15pro-light-tab-parejas.png', "Partner line truncated ('Gael H. y Leonel, …'), hiding the round scores; HOY empty.")
add('t_juegos-large60-15pro-light-tab-individual.png', "HOY empty; duplicate names 'Aarón L.' (8, 10) and 'Matías B.' (2, 11); dense rows 40 px.")
add('t_juegos-longnames-15pro-light-tab-los-matrimonios.png', "Pair names cut to about 12 characters ('Fundación Nunca …', 'Los Cuñados Incó…'); partner lines cut.")
add('t_tarjeta-longnames-15pro-light-grid.png', "Column header breaks 'Maximiliano' mid-word with no hyphen ('Maximilia / no / Alejandro'): 63-px columns, overflow-wrap:anywhere, hyphens:manual (checked in the DOM).")
const se = "At 375×667 only three players fit above the sticky save bar. The tops of the 4th player's steppers ('4', '2', 'Levantó') show as cut fragments in the unbacked strip between 'Sincronizado' and the tab bar (ScorecardScreen.module.css:184-187: bottom = 56px + safe area + --s2)."
for (const x of ['t_tarjeta-full12-live-se-light.png', 't_tarjeta-longnames-se-light.png', 't_tarjeta-large60-se-light.png']) add(x, se)
add('t_live-large60-15pro-light.png', "Strip says 'Grupo puntero en el hoyo 9' while the leading groups have finished (F): for a group that started on 10 and finished, currentHole returns its last hole (LiveScreen.tsx:99-111).")
const ipad = "Every player screen is a 560-px column centred on the 1024-px iPad (AppShell.module.css:13): 45% of the width is empty, and the tab bar is 560 px wide."
for (const f of ['full12-live', 'longnames', 'large60']) for (const r of ['t_live', 't_tarjeta', 't_juegos', 't_dinero']) add(`${r}-${f}-ipad-light.png`, ipad)
add('t_dinero-full12-live-15pro-light-liquidacion-sin-banco-full.png', "'Sin banco' shows its explanation and then nothing: money.ts:273 returns no peer-to-peer transfers until the tournament is final or the bank balances, and the screen does not say so.")
add('t_dinero-full12-live-15pro-light-full.png', "Matías (entry unpaid) also shows 'Pagó $2,500'.")
add('t_dinero-full12-finished-15pro-light-liquidacion-full.png', "'Quién debe qué' and the 'Vía banco' list both show payments to the bank for the same people with different amounts (Arturo $750 Calcutta above, 'Arturo paga a Banco $2,250' below), and nothing says how they relate; only bank payouts get a 'Pagado' button.")
add('t_stats-minimal4-live-15pro-light.png', "'Hoyo Maldito: Hoyo 8 del día 1: 1 pts promedio' ('1 pts').")
add('t_stats-full12-live-15pro-light.png', "'El Resucitado: +1 pts' is computed while Day 2 is half played; 'El Constante: varianza 1.64' shows a raw statistic; winner chips are 36 px tall.")
add('t_tarjeta-full12-live-15pro-light-snake-tiebreak.png', "Reached client-side: Putts + on two players (2→3), then 'Guardar hoyo'. The sheet opens before any write; nothing was saved.")
add('t_tarjeta-full12-live-15pro-light-stepper-changed.png', "Camilo's strokes 4→5 (unsaved): his badge switches from muted to '2 pts, par neto'; the other rows keep their muted defaults.")
add('t_tarjeta-full12-live-15pro-light-confirm-unusual.png', "Strokes raised to 10, then 'Guardar hoyo': the '¿Seguro?' sheet ('Camilo: 10 golpes', Corregir / Sí, así fue). Nothing was saved.")
writeFileSync(f, JSON.stringify(notes, null, 1))
console.log(Object.keys(notes).length, 'files with notes')
