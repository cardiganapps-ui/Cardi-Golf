// Builds $S/shots-C.json and $S/shots-index-C.md from the raw capture files plus manual review notes.
import fs from 'node:fs'
import path from 'node:path'

const S = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad'
const HERE = `${S}/panel/evidence/SHOTS-C`
const OUT = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
const REL = 'docs/review/2026-09-30/shots'

const order = ['local', 'wizard', 'profile', 'admin', 'prod']
const raw = []
for (const s of order) {
  const f = `${HERE}/raw-${s}.json`
  if (fs.existsSync(f)) raw.push(...JSON.parse(fs.readFileSync(f, 'utf8')))
}
const shots = raw.filter((r) => r.file)

// ---- manual notes (from looking at every capture), keyed by regex on the file name
const M = [
  // Home / auth / legal / 404
  [/^home-(local|prod)-(15pro|se)-light(-full)?\.png$/, 'No h1: the wordmark is not a heading; first heading is the h2 "Entrar a un torneo".', 'The three secondary doors are unstyled text links that wrap onto two rows with a large gap; "Jugar una ronda rápida" links to plain /entrar (HomeScreen.tsx:100) although EntrarScreen honours ?next= (EntrarScreen.tsx:23), so after sign-in you land on / (Mi Polo), not /ronda (code-confirmed).', 'Legal links are 18px-tall tap targets (103×18, 88×18).', 'Install guide shows both iPhone and Android steps regardless of platform.'],
  [/^home-local-se-light\.png$/, 'At SE the legal links fall below the fold.'],
  [/^home-local-laptop-light\.png$/, 'Laptop: a ~528px phone column pinned top-centre, ~65% of the screen empty; install guide still gives phone steps on a desktop.'],
  [/^home-prod-/, 'Production (same SHA 379ed52): identical to the local build.'],
  [/^organizer_login-local-(15pro|laptop)-light\.png$/, 'Organizer sign-in is email + password only (no Google), a different system from the player /entrar (Google + email code).', '"Entrar con código" and "Olvidé mi contraseña" are small text buttons.'],
  [/^organizer_login-local-.*-signup\.png$/, 'Account creation shows no Términos / Aviso de privacidad link or consent line.'],
  [/^organizer_reset-/, 'Direct visit with no recovery session: expired-link empty state ("Este enlace ya no sirve…"); only action "Entrar". Behaves correctly.'],
  [/^entrar-local-/, 'Google + email code; no back link other than the wordmark; no Términos / Aviso line at account creation.'],
  [/^privacidad-/, 'The contact e-mail appears 3× as plain text: 0 mailto: links, so the rights channel is not tappable.', 'No domicilio, ARCO procedure or transfers section (LFPDPPP elements): for the TRUST panel.'],
  [/^terminos-/, 'Contact e-mail is plain text (0 mailto:); "el aviso de privacidad" in the body is not a link (only the footer button is). No governing law / liability clause: for the TRUST panel.'],
  [/^notfound-/, 'No heading element at all ("Esta página no existe." is a span in EmptyState); document.title stays "Polo". Otherwise fine.'],
  [/^fixture_index-/, 'Dev-only index: lists only the 14 tournament fixtures; the wizard, profile, social and Admin de Polo fixtures (/organizer/nuevo/_, /p/_/…, /amigos/_, /avisos/_, /ronda/_, /c/_, /admin/_/…) are not linked from it.'],

  // Wizard
  [/^organizer_nuevo-.*-step01\.png$/, 'Clean; "Siguiente" disabled until the name has 3+ characters.'],
  [/^organizer_nuevo-.*-step02(-full)?\.png$/, 'Three label styles on one screen: Field label (16px regular, "¿Cuántos jugadores?"), Group label (small bold, "¿Cuántos días (rondas)?"), toggle label (large, "¿Juegan por dinero?"). Group hints sit after the options. Selected segment is solid black while other selections are green. Step is named "Formato" but also holds players, days, money and games.'],
  [/^organizer_nuevo-.*-step02-configured(-full)?\.png$/, 'Entry fee box shows "1000" (no separator) while the review shows "$1,000". The Skins ($200) and Más cerca ($100) side-pot buy-ins are never shown in the wizard.'],
  [/^organizer_nuevo-.*-step02-templates\.png$/, 'Template sheet: no template is marked current (every role=radio has aria-checked=false, though the settings came from "En blanco").'],
  [/^organizer_nuevo-.*-step02-calcutta10(-full)?\.png$/, 'CONFIRMED: after "Viaje con Calcutta" (fixed $10,000/$5,000/$3,000/$2,000) "Reparto del individual" shows 50/30/20 selected; PlayStep.tsx:73 falls back to "classic" and es-MX\'s splits.amounts "Montos fijos" is never offered.', 'The template\'s modules (Parejas, Víbora, Mejor ronda, Menos putts, Calcutta, tiers A–D) are invisible on this step; nothing says 10 players no longer balance ($25,000 pot vs $30,000 prizes).'],
  [/^organizer_nuevo-.*-step03-(balanced|unbalanced|calcutta12)(-full)?\.png$/, 'CONFIRMED: the review card renders unstyled, so each key runs into its value ("Nombre del torneoCopa de los Compadres 2026", "FormatoStableford, puntos", "¿Cuántos días (rondas)?2 días, 12 jugadores"). NewTournamentScreen.tsx:27 imports Organizer.module.css, but .review/.reviewRow/.reviewKey/.reviewValue live in setup/Setup.module.css:243-262, so styles.reviewRow is undefined. In since 1edb42b (#50).', 'Keys reuse the step-2 questions as labels; the review omits the prize split and the side pots.'],
  [/^organizer_nuevo-.*-step03-unbalanced(-full)?\.png$/, 'Unbalanced state says only "Ajusta el dinero para que cuadre y poder crear el torneo.", with no pot, prizes, difference or link to the field; "Crear torneo" is disabled.'],
  [/^organizer_nuevo-.*-step03-(unbalanced|calcutta12)(-full)?\.png$/, 'CONFIRMED: with the Calcutta template the review says "Juegos aparte: Ninguno por ahora" and "Formato: Stableford, puntos". Calcutta, pairs, snake, best round, fewest putts and tiers A–D are not mentioned, because ReviewCard lists only settings.games (NewTournamentScreen.tsx:193-203).'],
  [/^organizer_nuevo-.*-step04-created\.png$/, 'CONFIRMED: "Torneo creado" still shows "Paso 3 de 3, Antes de crear" (NewTournamentScreen.tsx:123-125 clamps the step).', 'The copy buttons are labelled "Enlace" and "Código" with no verb; the link is plain, non-tappable text; no "Compartir" button appears in headless Chromium (no Web Share), which is not verifiable here.', 'Demo mode: code EJEMPL, nothing written.'],

  // Profiles and social
  [/^p-yo-(15pro|se)-light(-full)?\.png$/, 'CONFIRMED: the strip says "16 Rondas · Mejor gross 82", counting the practice round (Ensayo/Solmar 82) and the incomplete one, while "Índice Polo 14 rondas" and Récords "Mejor gross 85" exclude practice (ProfileScreen.tsx:143-146 vs achievements.ts:113).', 'Historial is not date-sorted: a 2025 practice round and a 2024 incomplete round sit between the Sep-2026 rows (the fixture order is rendered as-is).', 'The action row mixes 16px buttons with a 14px "Copiar enlace" (btn--sm) at the same 44px height.'],
  [/^p-yo-se-light/, 'At SE, "Empatado en 3.º de 16, Rey del Bir…" is truncated.'],
  [/^p-nuevo-/, '"Sin índice todavía" still offers "¿Cómo se calculó?". The empty Torneos, Historial and Récords sections are passive text with no next step (join, Ronda rápida, find friends); 20 dashed locked badges dominate the empty profile. "Copiar enlace" is 14px next to 16px buttons.'],
  [/^p-extrano-/, 'Stranger view shows the card only, by design. The fixture passes no friendship state, so the "Agregar" action cannot be seen here (not verified).'],
  [/^p-manual-/, 'CONFIRMED: the index shows "+1.2" (formatIndex, profiles.ts:395-398, plus handicap) but the differentials show "−0.8" (tenths helper, ProfileScreen.tsx:50 and Achievements.tsx:20): two sign conventions on one screen.'],
  [/^p_vs-rivalidad-/, 'CONFIRMED: in the won-round row ("Ganaste") the text starts on the 2px accent bar and "+3" touches the tint\'s edge. .rowUsed (Profile.module.css:205-208) adds the bar with no inner padding. "Terminar rivalidad" is styled as a plain green link.'],
  [/^p_vs-propuesta-/, 'CONFIRMED copy bug: "Diego te propone una rivalidad: recibes 3 golpes de diego." (VersusScreen.tsx:154 lowercases a line containing the rival\'s name). The proposal block is inset 8px from the page grid.'],
  [/^p_vs-amigos-/, 'Friends with no rivalry: suggestion (3 strokes from the indices), proposer and history render correctly.'],
  [/^p_vs-nuevo-/, 'No shared rounds: the Neto/Gross switch is still shown over the empty state.'],
  [/^p_anio-yo-/, 'Year card says 0 Torneos / 0 Victorias / 0 Podios although the profile lists a 1st and a T3. The fixture tournaments have startsOn null and yearRecap drops them (achievements.ts:262,269); PLAUSIBLE for real tournaments with undated rounds. It excludes practice (Mejor gross 85), unlike the profile strip (82). The fixture renders the 540px card at zoom 0.66; no h1.'],
  [/^p_anio-manual-/, '"Mejor diferencial −0.8" for a +1.2 player (sign convention); 0 Victorias despite the fixture\'s win (startsOn null).'],
  [/^p_anio-(nuevo|extrano)-/, 'All-zero card with dashes. The fixture renders it; the real profile hides "Compartir mi año" when there is nothing to share.'],
  [/^amigos-/, 'The incoming request\'s subtitle is truncated to "Club Campestre, Í…" by the Aceptar / Ahora no buttons. Four action styles on one screen (filled, outlined, two kinds of green text).'],
  [/^avisos-/, 'Every notice title is cut to one line, hiding the content ("Resultados de Copa Otoño: quedast…", "Nueva ronda en tu rivalidad con Die…"). On unread rows the avatar touches the 2px accent bar (.rowUsed reused to mean "unread").'],
  [/^c-fx-/, 'CONFIRMED: in standings row 1 the rank "1" sits on the accent bar and "pts" touches the tint\'s edge.', 'Season maths checks out (48.5 / 41.5 / 29 / 16 with the shared 1st place).', '"Salir del crew" (destructive) is styled like "Cambiar código" (a neutral green link).'],
  [/^ronda-fx-(15pro|se)-light(-full)?\.png$/, 'CONFIRMED: the course select clips "…Ciudad de Méxi(co)" with no ellipsis (317px of text in 315px at 15 Pro, 297px at SE).', 'The date shows MM/DD/YYYY: a headless-Chromium artifact (phones use their own picker and locale).', 'Double label: "Campo" then "Elige el campo".', 'Chips are named "Birdies" / "Tres putts" here but "Bote de birdies" / "Multa por tres putts" in the wizard; selected is solid black here and a green tint with ✓ there.'],
  [/^ronda-fx-15pro-light-configured(-full)?\.png$/, 'Picked friends\' checkboxes sit on the accent bar (.rowUsed). The guest row\'s index box is 75px left of the others (the ✕ shifts the column). The entry-fee input has no "$" prefix (the wizard\'s has one) and is a raw input, not NumberField. Pot line is correct: 4 × $300 = $1,200, 70/30.'],
  [/^ronda-fx-15pro-light-configured-money\.png$/, 'Money section in view: "Bote de $1,200, se reparte 70% / 30%." is correct for 4 players.'],
  [/^ronda-fx-15pro-light-toomany\.png$/, 'At 18 players "Máximo 16 jugadores." replaces "N grupos" in the same muted style (not an error style); guests can still be added past the limit.'],
  [/^ronda-fx-15pro-light-toomany-start\.png$/, '"Empezar" is disabled with no reason next to it; the pot line is still computed for 18 players ($5,400, 50/30/20).'],

  // Admin de Polo
  [/^admin_.*-15pro-light/, 'CONFIRMED: the phone section tabs are a horizontal scroller left at scrollLeft 0. "Crews" is cut to "Crew", and the Avisos, Auditoría and Salud tabs are off-screen (x 401–590 in a 393px viewport), so those pages show no active tab.'],
  [/^admin_resumen-/, 'KPI tiles pair unrelated sub-lines: "Rondas rápidas 9 — 69 teléfonos sin cuenta", "Crews 2 — 7 campos en el catálogo", "Protegido 1 — 1 ensayo".', 'The fixture numbers disagree (tile: 3,412 holes in 30 days; chart: 2,573).', '"Lo más reciente" is not time-sorted ("anteayer" before "ayer"); the UI renders the API order.'],
  [/^admin_torneos-fx-laptop-light\.png$/, 'The filter chips are cut at the column edge ("Ens…").'],
  [/^admin_torneos-fx-laptop-light-detail(-full)?\.png$/, 'With a detail open, the sticky pane covers the rest of the filter chips ("Ens…" cut, "Protegidos" underneath).'],
  [/^admin_torneos-.*-detail(-full)?\.png$/, 'CONFIRMED: round dates are raw ISO ("2027-04-08", TournamentDetail.tsx:175), and "0 hoyos" actually counts score rows (es-MX roundLine). The fixture\'s round 2 is dated before round 1. "Quitar protección" is a plain green link.'],
  [/^admin_torneos-fx-15pro-light\.png$/, 'Rows truncate hard on the phone ("Nacho\'s Bachelor Invita…", "Ensayo — 12 jugadores · …"); chips cut ("De un cre…").'],
  [/^admin_personas-fx-(15pro|laptop)-light\.png$/, 'The anonymous device\'s list avatar is "R" (René), but its detail shows "TS" (from "Teléfono sin cuenta"). E-mails are truncated on the phone.'],
  [/^admin_personas-.*-detail/, 'CONFIRMED: the lock row truncates the expiry ("…bloqueado hasta las 08:57 p.…" even at 1440px; "…bloquead…" on the phone). "Borrar cuenta" is a red outlined button while "Borrar crew" elsewhere is a green link.'],
  [/^admin_campos-.*-detail/, 'Blancas tee says "las ventajas se repiten o faltan" (lowercase, no hole named). The grid (11px digits, no row labels for hole / par / SI) does not mark the duplicated SI 1 on holes 4 and 18. The creator\'s e-mail is shown.'],
  [/^admin_crews-.*-detail/, '"Borrar crew" is styled as a neutral green link; the members\' join dates are truncated on the phone.'],
  [/^admin_avisos-/, 'The compose form works, but there is no preview of how the notice or push will look; fields are 956px wide on a laptop.'],
  [/^admin_auditoria-/, 'Readable; "Hoyo · cambio" is a terse label for a score update.'],
  [/^admin_salud-/, 'Status dots are colour-only (green/red); "Respaldo nocturno" is green despite "1 falló" this week.'],
  [/^admin_(campos|crews)-fx-(15pro|laptop)-light\.png$/, 'List renders cleanly.'],

  // Production Entrar
  [/^t_entrar-prod-(15pro|se)-light(-full)?\.png$/, 'Real Ensayo (production, read-only). No h1: the event name is not a heading. Every avatar is a same-coloured initials circle (three "M", two "R" tiles differ only by name), and "Jugador 12" gets the initials "J1". Tiles are ~170px tall, so 9 of 12 players fit on a 15 Pro and ~7 on an SE. No link out (organizer / help) below the grid.'],
  [/^t_entrar-prod-.*-pinpad\.png$/, 'The PIN step is one full-width password field (not per-digit boxes); "Entrar" stays disabled until 4 digits and auto-submits at 4. A non-Nico face was tapped; no PIN typed.'],
]

const clean = (s) => s.replace(/\s+/g, ' ').trim()
function autoLines(r) {
  const out = []
  for (const i of r.auto?.issues ?? []) {
    if (/^no <h1>/.test(i)) continue
    out.push(`auto: ${i}`)
  }
  for (const n of r.auto?.notes ?? []) {
    if (/^no <h1>/.test(n)) out.push('auto: no <h1>')
    else if (/example\.com/.test(n)) out.push('auto: invented example.com addresses (fixture data)')
    else out.push(`auto: ${n}`)
  }
  for (const c of r.auto?.console ?? []) out.push(`console: ${c}`)
  return out
}

const rows = shots.map((r) => {
  const manual = M.filter(([re]) => re.test(r.file)).flatMap(([, ...notes]) => notes)
  const auto = autoLines(r)
  // Merge the per-shot "tapped face" note that the capture added.
  const extra = (r.observations ?? []).filter((o) => /^tapped face/.test(o))
  const obs = [...manual, ...auto, ...extra].map(clean)
  if (!obs.length) obs.push('No problems seen (automated checks and visual review).')
  const size = fs.statSync(path.join(OUT, r.file)).size
  return {
    file: `${REL}/${r.file}`,
    url: r.url,
    device: r.device,
    viewport: r.viewport,
    fixture: r.fixture,
    route: r.route,
    state: r.state,
    title: r.title,
    bytes: size,
    observations: obs,
  }
})

fs.writeFileSync(`${S}/shots-C.json`, JSON.stringify(rows.map(({ file, url, device, viewport, fixture, route, state, observations }) => ({ file, url, device, viewport, fixture, route, state, observations })), null, 1))

const totalKB = Math.round(rows.reduce((s, r) => s + r.bytes, 0) / 1024)
const esc = (s) => String(s).replace(/\|/g, '\\|')

const ISSUES = fs.readFileSync(`${HERE}/issues.md`, 'utf8')

let md = `# SHOTS-C: screenshots outside a tournament (2026-09-30)

${rows.length} PNGs in \`${REL}/\` (compressed, ${(totalKB / 1024).toFixed(1)} MB total), from HEAD 379ed52 served by the shared preview on \`http://127.0.0.1:4173\` (fixture routes on, production Supabase behind the real routes), plus 9 read-only captures of production \`https://golf.cardigan.mx\`. Devices: \`15pro\` 393×852 @2x, \`se\` 375×667 @2x (both isMobile/hasTouch), \`laptop\` 1440×900 @1x; light scheme, \`reducedMotion: reduce\`, locale es-MX; each shot waits for \`document.fonts.ready\`, the loading skeleton to clear and ~600 ms. \`-full\` variants are full-page, capped at 3,200 CSS px. Script: \`panel/evidence/SHOTS-C/shots.mjs\` (\`SECTIONS=local|wizard|profile|admin|prod\`); index builder: \`build-index.mjs\`.

Every capture ran automated checks: horizontal overflow and elements past the viewport edge; clipped, ellipsised or covered text (\`elementFromPoint\`); select and input text wider than its box; text under 12px; placeholder-looking strings; broken images; missing h1; page errors, console errors and warnings, failed requests and HTTP ≥400. I also looked at every PNG myself. "CONFIRMED" means seen in the capture and traced to the cited line; "PLAUSIBLE" means it rests on fixture data or code reading only.

${ISSUES}

## Index

| file | URL | viewport | observations |
|---|---|---|---|
`
for (const r of rows) {
  md += `| \`${esc(r.file.replace(REL + '/', ''))}\` | ${esc(r.url)} | ${esc(r.viewport)}${r.state !== 'default' ? ` · ${esc(r.state)}` : ''} | ${esc(r.observations.join(' • '))} |\n`
}
fs.writeFileSync(`${S}/shots-index-C.md`, md)
console.log(`wrote ${rows.length} rows, ${totalKB} KB total`)
