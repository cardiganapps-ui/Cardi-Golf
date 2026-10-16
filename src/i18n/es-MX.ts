/**
 * All app copy, Spanish (Mexico). One file so a second language is a file,
 * not a refactor (CLAUDE.md §0.5).
 * Voice (DESIGN_NOTES.md): calm, precise, a little dry. Golf vernacular used
 * correctly. Personality lives in `feed` only. Money copy is always plain.
 * Terms decided once: golpes de ventaja, hándicap (never "hcp"), gross / neto,
 * índice de golpe (SI) vs índice (WHS), bolsa (entries) vs pozo (Calcutta),
 * tarjeta (never "score"), enlace (never "link"), estadísticas (never "stats").
 */
/** A figure shown as a dash: a card with nothing yet. */
export function blankFigure(figure: string): boolean {
  return figure === '–' || figure === '—' || figure === '-'
}

/** «subió 3 lugares», «bajó 1 lugar»: a board row's movement since this phone last showed the board (MOT-06). */
function movedWords(by: number): string {
  const n = Math.abs(by)
  return `${by > 0 ? 'subió' : 'bajó'} ${n} ${n === 1 ? 'lugar' : 'lugares'}`
}

/** What each pencil mark on a card says, in words. */
const MARK_NAMES: Record<string, string> = { eagle: 'águila o mejor', birdie: 'birdie', par: 'par', bogey: 'bogey', double: 'doble bogey o peor', pickup: 'levantó' }

/** How a board row is said beyond its figures (A11Y-11). */
export interface RowSpeech {
  me?: boolean
  /** The honoree's label («El novio») on his row. */
  honoree?: string | null
  tier?: string | null
  estimated?: boolean
  /** What the figure counts: points, a match's points, strokes to par net or gross, or the gross view's to-par. */
  unit?: 'points' | 'match' | 'net' | 'gross' | 'toPar' | null
  /** The day's figure is already said in words (a match: «ganó 3&2»). */
  todaySpoken?: boolean
  /** What he would win if it ended now, as money text. */
  money?: string | null
  /** «dueños: Iván y Camilo», from `t.live.ownersSpoken`: a string, so an unchanged row stays the same props. */
  owners?: string | null
  /** Places moved since this phone last showed the board (MOT-06): up is positive. */
  movedBy?: number
}

/** «E» is «par», «+3» «3 sobre par», «−2» «2 bajo par»: the board's to-par figures as a voice says them. */
function toParWords(text: string): string {
  if (text === 'E') return 'par'
  const m = /^([+−-])(\d+)$/.exec(text)
  if (!m) return text
  return `${m[2]} ${m[1] === '+' ? 'sobre par' : 'bajo par'}`
}

/** A board figure with its unit, for a screen reader (A11Y-11). */
function spokenFigure(text: string, unit: RowSpeech['unit']): string {
  if (unit === 'points') return `${text} ${text === '1' ? 'punto' : 'puntos'}`
  if (unit === 'match') return `${text} ${text === '1' || text === '½' ? 'punto' : 'puntos'}`
  if (unit === 'net') return `${toParWords(text)} neto`
  if (unit === 'gross') return `${toParWords(text)} gross`
  if (unit === 'toPar') return toParWords(text)
  return text
}

/** "T3" → "empatado en 3.º", "3" → "3.º". Positions come from the engine as labels; no position yet («», «–») stays empty. */
export function ordinal(label: string): string {
  const tied = label.startsWith('T')
  const n = label.replace(/^T/, '')
  if (!/^\d+$/.test(n)) return ''
  return tied ? `empatado en ${n}.º` : `${n}.º`
}

/**
 * «e» instead of «y» before the sound /i/ (Isabel, Íñigo, Hilario, Híjar),
 * but «y» when that i opens a diphthong (hielo, Hiago, Ian, Yolanda). Intl's
 * Spanish list misses the accented ones («y Íñigo»), and engines differ.
 */
const takesE = (word: string) => /^[hH]?[iIíÍ](?![aeouáéóúAEOUÁÉÓÚ])/.test(word.replace(/^[\s«"'“‘(¿¡]+/, ''))
/** «u» instead of «o» before the sound /o/ (Óscar, Homero). */
const takesU = (word: string) => /^[hH]?[oOóÓ]/.test(word.replace(/^[\s«"'“‘(¿¡]+/, ''))

/** Parts joined with commas and a last connector; blank parts are left out. */
function listWith(parts: string[], last: (word: string) => string): string {
  const items = parts.map((p) => p.trim()).filter(Boolean)
  if (items.length < 2) return items[0] ?? ''
  const end = items[items.length - 1]!
  return `${items.slice(0, -1).join(', ')} ${last(end)} ${end}`
}

/** «birdie», «águila», «albatros», with «neto/neta» when the event plays off handicap. */
function underParName(under: number, net: boolean): string {
  const [word, neto] = under >= 3 ? ['albatros', 'neto'] : under === 2 ? ['águila', 'neta'] : ['birdie', 'neto']
  return net ? `${word} ${neto}` : word
}
/** «par», «bogey», «doble bogey», «triple bogey», «4 sobre par», with «neto» when off handicap. */
function overParName(d: number, net: boolean): string {
  if (d < 0) return underParName(-d, net)
  const word = d === 0 ? 'par' : d === 1 ? 'bogey' : d === 2 ? 'doble bogey' : d === 3 ? 'triple bogey' : `${d} sobre par`
  return net ? `${word} neto` : word
}

/**
 * The feed's lines for a score under par (COPY-15): `what` is its name («birdie neto»), `under` how far under, `fig`
 * the points after a comma or nothing. A run of birdies, then the day's first, then an eagle get lines of their own.
 */
function feedUnderPar(name: string, hole: number, what: string, under: number, fig: string, ctx: { first?: boolean; streak?: number }): string[] {
  const What = what.charAt(0).toUpperCase() + what.slice(1)
  if (ctx.streak && ctx.streak > 1) return [`${name} no para: ${what} en el ${hole}, ${ctx.streak} hoyos seguidos bajo par${fig}`, `${name} va que vuela: ${what} en el ${hole}, ya van ${ctx.streak} seguidos${fig}`]
  if (ctx.first) return [`${name} estrena el día con un ${what} en el ${hole}${fig}`, `${name} abre el día: ${what} en el ${hole}${fig}`]
  if (under >= 2) return [`${name}: ${what} en el ${hole}${fig}`, `¡${What} de ${name} en el ${hole}!${fig ? ` ${fig.slice(2)}` : ''}`, `${name} se luce en el ${hole}: ${what}${fig}`]
  return [`${name}: ${what} en el ${hole}${fig}`, `${What} de ${name} en el ${hole}${fig}`, `${name} la mete en el ${hole}: ${what}${fig}`, `En el ${hole}, ${what} para ${name}${fig}`]
}

/** «Camilo y Damián», «Camilo, Damián e Iván»: Spanish conjunctions, no comma before the last. */
function andList(parts: string[]): string {
  return listWith(parts, (w) => (takesE(w) ? 'e' : 'y'))
}

/** «Camilo o Damián», «Camilo u Óscar»: a choice between names. */
function orList(parts: string[]): string {
  return listWith(parts, (w) => (takesU(w) ? 'u' : 'o'))
}

/**
 * A count of Stableford points, abbreviated as golf writes it: «1 pt», «0 pts», «34 pts», «−1 pt» (COPY-23: the
 * copy wrote «1 pts»). `text` is the figure as shown, when it is not the bare number (a sign, a true minus).
 */
export function ptsText(n: number, text: string | number = n): string {
  return `${text} ${Math.abs(n) === 1 ? 'pt' : 'pts'}`
}

/**
 * A game's label inside a sentence (STRAT-11). The organizer names the game («La Víbora», «El Tres Putts»), and a
 * sentence that names it takes that name with its article in lower case: «Tiene la Víbora», «cargando el Tres
 * Putts». A label with no article stays as typed.
 */
export function labelInSentence(label: string): string {
  return label.trim().replace(/^(El|La|Los|Las)(?=\s)/u, (a) => a.toLowerCase())
}

/** A label without its leading article, for a name built on it: «La Víbora» gives «Víbora de Oro» (STRAT-11). */
export function labelBare(label: string): string {
  return label.trim().replace(/^(?:El|La|Los|Las)\s+/u, '')
}

/** A handicap as golfers write it: under zero is a «plus» handicap, +1.2 (the arithmetic in an explanation keeps −1.2). */
export function handicapText(n: number): string {
  return n < 0 ? `+${-n}` : String(n)
}

type HcpSource = 'index' | 'estimate' | 'manual'
const HCP_WORD: Record<HcpSource, string> = { index: 'índice', estimate: 'estimado', manual: 'base' }
/** A handicap changed after they were fixed (UX-28): «de 14 a 12», «de 14.2 a 12.3 (índice)», «de 14 (base) a 12.3 (índice)». */
export function hcpFromTo(from: { source: HcpSource; base: number }, to: { source: HcpSource; base: number }): string {
  if (from.source === to.source) return `de ${handicapText(from.base)} a ${handicapText(to.base)}${from.source === 'manual' ? '' : ` (${HCP_WORD[from.source]})`}`
  return `de ${handicapText(from.base)} (${HCP_WORD[from.source]}) a ${handicapText(to.base)} (${HCP_WORD[to.source]})`
}

/** What the phone may not do yet while a tournament's writes are still on it (account.ts). */
/** A money line's words (COPY-08): who pays, the verb with its target, and whom when that is a person. */
export interface PayWords {
  who: string
  verb: string
  whom: string | null
}
/**
 * Who pays whom, as a person says it. A party is a name, or null for the bank, which is no one's name: «Leonel le
 * paga al banco», «El banco le paga a Camilo». `bankerSelf`: one party is the bank and the other the banker, who
 * holds it, so it is his own money going in or coming out, never a payment to himself.
 */
function payWords(from: string | null, to: string | null, paid = false, bankerSelf = false): PayWords {
  if (bankerSelf && to === null && from) return { who: from, verb: paid ? 'puso lo suyo en el banco' : 'pone lo suyo en el banco', whom: null }
  if (bankerSelf && from === null && to) return { who: to, verb: paid ? 'se quedó con lo suyo del banco' : 'se queda con lo suyo del banco', whom: null }
  const verb = paid ? 'le pagó' : 'le paga'
  return to === null ? { who: from ?? 'El banco', verb: `${verb} al banco`, whom: null } : { who: from ?? 'El banco', verb: `${verb} a`, whom: to }
}
/** The words as one line, with the amount when there is one: «El banco le paga a Camilo: $3,300». */
function payText(w: PayWords, amount?: string): string {
  return `${w.who} ${w.verb}${w.whom ? ` ${w.whom}` : ''}${amount ? `: ${amount}` : ''}`
}

export type UnsentAction = 'signOut' | 'switch' | 'enter' | 'delete'
const UNSENT_ACTION: Record<UnsentAction, string> = {
  signOut: 'cerrar sesión',
  switch: 'cambiar de cuenta',
  delete: 'borrar tu cuenta',
  // A PIN in another tournament: the phone keeps one PIN at a time.
  enter: 'entrar a otro torneo',
}

export const t = {
  app: {
    name: 'Polo',
    tagline: 'Torneos de golf entre amigos',
    description: 'Marcador en vivo, juegos, Calcutta y cuentas claras para torneos entre amigos.',
    /** The installed app's shortcuts (a long press on its icon, PWA-14): the last tournament's card, and its En vivo. */
    shortcuts: { card: 'Mi tarjeta', cardShort: 'Tarjeta', live: 'En vivo' },
    /** What the install sheet's screenshots show (PWA-14). */
    screenshots: { live: 'La tabla del torneo, en vivo', card: 'La tarjeta: un hoyo en segundos' },
  },
  common: {
    /** Names of the choice controls a screen reader announces (A11Y-17). */
    whichDay: 'Qué día',
    whichTee: 'Qué tee',
    // UX-15: a sheet holding typed work asks before a stray tap, Escape or back throws it away.
    discardTitle: '¿Descartar lo que capturaste?',
    discardBody: 'Si cierras ahora, se pierde lo que escribiste en esta hoja.',
    keepEditing: 'Seguir capturando',
    discard: 'Descartar',
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Borrar',
    edit: 'Editar',
    add: 'Agregar',
    back: 'Atrás',
    notNow: 'Ahora no',
    next: 'Siguiente',
    done: 'Listo',
    close: 'Cerrar',
    moveUp: 'Subir',
    moveDown: 'Bajar',
    total: 'Total',
    undo: 'Deshacer',
    final: 'Final',
    sections: 'Secciones',
    dialog: 'Ventana',
    stepDown: 'menos',
    stepUp: 'más',
    versus: ' contra ',
    plusList: (parts: Array<string | number>) => parts.join(' + '),
    /**
     * A main-event figure with its unit: «34 pts», «1 pt», «−3 neto», «+2 gross»,
     * «1½ puntos» (match points). Points only where the event counts them.
     */
    figure: (text: string, value: number, kind: 'points' | 'net' | 'gross' | 'match') =>
      kind === 'points' ? ptsText(value, text) : kind === 'match' ? `${text} ${value > 0 && value <= 1 ? 'punto' : 'puntos'}` : `${text} ${kind === 'net' ? 'neto' : 'gross'}`,
    /** «Camilo y Damián», «Camilo, Damián e Iván»: Spanish conjunctions, «e» before an i sound included. The only way copy joins names. */
    andList,
    /** «Camilo o Damián», «Camilo u Óscar»: who, of these. */
    orList,
    copySuffix: '(copia)',
    joinWithCode: (name: string, code: string) => `${name}: entra con el código ${code}`,
    loading: 'Cargando…',
    saving: 'Guardando…',
    saved: 'Guardado',
    yes: 'Sí',
    no: 'No',
    confirmDelete: '¿Seguro? Esto no se puede deshacer.',
    confirm: 'Confirmar',
    keep: 'Dejar como está',
    copy: 'Copiar',
    copied: 'Copiado',
    share: 'Compartir',
    error: 'Algo salió mal',
    retry: 'Reintentar',
    optional: 'opcional',
    none: 'Ninguno',
    search: 'Buscar',
    name: 'Nombre',
    logout: 'Cerrar sesión',
  },
  nav: {
    live: 'En vivo',
    card: 'Tarjeta',
    games: 'Juegos',
    money: 'Dinero',
    more: 'Más',
    admin: 'Comité',
  },
  /**
   * Each screen's name (A11Y-13): the document title, and what a screen reader
   * hears when the page changes. Inside a tournament its name follows.
   */
  titles: {
    /** The document title: the page, then the app («Tarjeta, Copa Tres Marías — Polo»). Home is the app alone. */
    document: (page: string) => `${page} — Polo`,
    inTournament: (page: string, tournament: string) => `${page}, ${tournament}`,
    /** A section of a console: «Comité: Jugadores», «Admin de Polo: Salud». */
    section: (console: string, section: string) => `${console}: ${section}`,
    home: 'Polo',
    opening: 'Abriendo tu torneo',
    enter: 'Entrar',
    organizerLogin: 'Entrar como organizador',
    newPassword: 'Nueva contraseña',
    newTournament: 'Nuevo torneo',
    myTournaments: 'Mis torneos',
    account: 'Tu cuenta',
    editProfile: 'Editar perfil',
    friends: 'Amigos',
    inbox: 'Avisos',
    joinCrew: 'Unirte a una crew',
    crew: 'Crew',
    versus: 'Cara a cara',
    year: 'Tu año en Polo',
    profile: 'Perfil',
    print: 'Tarjetas para imprimir',
    notFound: 'Página no encontrada',
    fixtures: 'Fixtures',
    design: 'Diseño',
    /** `/demo` (STRAT-17). */
    demo: 'Torneo de ejemplo',
  },
  boot: {
    slowTitle: 'Polo está tardando en conectar',
    slowBody: 'No pudimos confirmar tu sesión. Suele ser la señal: vuelve a intentar en un momento.',
    crashTitle: 'Algo falló al abrir Polo',
    crashBody: 'Casi siempre es una versión vieja guardada en el teléfono. Reiniciar la app la reemplaza.',
    retry: 'Reintentar',
    retrying: 'Conectando…',
    reset: 'Reiniciar la app',
    /** The last tournament's boards, saved on the phone: they open without the session (REL-03). */
    openSaved: 'Abrir lo guardado',
    resetHint: 'Reiniciar no borra tu sesión ni los hoyos que no se hayan enviado.',
    version: (v: string) => `Versión ${v}`,
  },
  /** The Polo platform admin (/admin): Diego's oversight of every tournament. */
  platform: {
    title: 'Admin de Polo',
    entry: 'Admin de Polo',
    sectionsLabel: 'Secciones del admin',
    groups: { overview: 'Vista general', catalog: 'Catálogo', ops: 'Operación' },
    sections: {
      overview: 'Resumen',
      tournaments: 'Torneos',
      people: 'Personas',
      courses: 'Campos',
      crews: 'Crews',
      notices: 'Avisos',
      audit: 'Auditoría',
      health: 'Salud',
    },
    backHome: 'Volver a Mi Polo',
    // Resumen
    kpi: {
      accounts: 'Cuentas',
      accounts7d: (n: number) => (n ? `+${n} esta semana` : 'Ninguna nueva esta semana'),
      devices: (n: number) => `${n} ${n === 1 ? 'teléfono' : 'teléfonos'} sin cuenta`,
      tournaments: 'Torneos',
      live: (n: number) => (n ? `${n} en juego` : 'Ninguno en juego'),
      quickRounds: 'Rondas rápidas',
      rounds: 'Rondas jugadas',
      rounds30d: (n: number) => `${n} en 30 días`,
      scores: 'Hoyos capturados',
      scoresHint: 'En 30 días',
      push: 'Con avisos',
      pushHint: (profiles: number) => `de ${profiles} ${profiles === 1 ? 'perfil' : 'perfiles'}`,
      crews: 'Crews',
      courses: (n: number) => `${n} ${n === 1 ? 'campo' : 'campos'} en el catálogo`,
    },
    northStar: {
      title: 'Torneos cerrados al peso',
      hint: (days: number) => `En ${days} días: terminados, con 8 o más jugadores y hoyos de 3 o más teléfonos. La métrica que manda.`,
      finished: (n: number) => (n === 1 ? '1 terminado en total' : `${n} terminados en total`),
    },
    funnel: {
      title: (days: number) => `Organizadores, ${days} días`,
      intro: 'Torneos de organizadores que no son el admin, sin ensayos ni rondas rápidas. Cada paso cuenta los que llegaron hasta ahí.',
      step: {
        created: 'Creados',
        field: 'Con jugadores',
        played: 'Con un día en juego',
        scored: 'Con hoyos capturados',
        signed: 'Con una tarjeta firmada',
        finished: 'Terminados',
      },
      line: (tournaments: number, organizers: number) =>
        `${tournaments} ${tournaments === 1 ? 'torneo' : 'torneos'}, ${organizers} ${organizers === 1 ? 'organizador' : 'organizadores'}`,
      none: 'Ningún organizador ha creado un torneo en este periodo.',
    },
    activity: 'Actividad, 30 días',
    series: { scores: 'Hoyos', accounts: 'Cuentas nuevas', tournaments: 'Torneos nuevos' },
    seriesLabel: 'Qué mostrar',
    dayTotal: (label: string, n: number, day: string) => `${label}: ${n} el ${day}`,
    recent: 'Lo más reciente',
    recentEmpty: 'Nada todavía.',
    event: {
      tournament: (name: string) => `Torneo nuevo: ${name}`,
      quick: (name: string) => `Ronda rápida: ${name}`,
      profile: (name: string) => `Se sumó ${name}`,
      platform: (action: string) => `Admin de Polo: ${action}`,
    },
    actions: {
      protect: 'protegió un torneo',
      unprotect: 'le quitó la protección a un torneo',
      unlock: 'desbloqueó un torneo',
      relock: 'volvió a bloquear un torneo',
      view: 'abrió algo para revisarlo',
    } as Record<string, string>,
    // Torneos
    search: 'Nombre, código o correo del organizador',
    kinds: {
      all: 'Todos',
      real: 'Torneos',
      quick: 'Rondas rápidas',
      crew: 'De un crew',
      practice: 'Ensayos',
      protected: 'Protegidos',
      orphan: 'Sin Comité',
    },
    kindLabel: 'Tipo',
    status: { setup: 'En preparación', auction: 'Calcutta', live: 'En juego', finished: 'Terminado' } as Record<string, string>,
    roundStatus: { scheduled: 'Programada', live: 'En juego', finished: 'Terminada', cancelled: 'Cancelada' } as Record<string, string>,
    /** What an audit row changed, by table; unknown tables show as they are. */
    tables: {
      scores: 'Hoyo', players: 'Jugador', rounds: 'Ronda', groups: 'Grupo', group_members: 'Grupo', pairs: 'Pareja',
      tournaments: 'Torneo', tournament_organizers: 'Comité', payments: 'Pago', handicap_overrides: 'Hándicap',
      round_tees: 'Tee', snake_tiebreaks: 'Víbora', card_signatures: 'Firma', calcutta_lots: 'Calcutta',
      calcutta_bids: 'Puja', calcutta_buybacks: 'Recompra', game_entries: 'Juego', hole_awards: 'Premio de hoyo',
      game_results: 'Resultado', courses: 'Campo', tees: 'Tee', holes: 'Hoyo del campo', pin_claims: 'Teléfono',
      spectator_links: 'Enlace para ver', teams: 'Equipo', team_members: 'Equipo', player_pins: 'PIN', player_corrections: 'Pedido de corrección',
      tournament_results: 'Resultados publicados', photos: 'Foto', course_documents: 'Tarjeta del campo',
      money_adjustments: 'Dinero por asignar', rejected_writes: 'Pendiente de revisar',
    } as Record<string, string>,
    practiceCount: (n: number) => `${n} ${n === 1 ? 'ensayo' : 'ensayos'}`,
    count: (shown: number, total: number) => (shown === total ? `${total} ${total === 1 ? 'torneo' : 'torneos'}` : `${shown} de ${total}`),
    more: 'Ver más',
    empty: 'Ningún torneo coincide.',
    chips: { protected: 'Protegido', practice: 'Ensayo', quick: 'Rápida', orphan: 'Sin Comité' },
    rowSub: (players: number, owner: string | null) => `${players} ${players === 1 ? 'jugador' : 'jugadores'}${owner ? `, ${owner}` : ''}`,
    lastActivity: (when: string) => `Movimiento ${when}`,
    noActivity: 'Sin movimiento',
    // Detalle
    pickOne: 'Elige un torneo para ver su detalle.',
    back: 'Torneos',
    open: 'Abrir el torneo',
    openComite: 'Abrir su Comité',
    comite: 'Comité',
    roleOwner: 'Dueño',
    roleAdmin: 'Comité',
    noComite: 'Este torneo no tiene Comité. Solo tú puedes administrarlo.',
    rounds: 'Rondas',
    noRounds: 'Sin rondas.',
    roundLine: (n: number, course: string | null, scores: number) => `Ronda ${n}${course ? `, ${course}` : ''}, ${scores} ${scores === 1 ? 'hoyo' : 'hoyos'}`,
    counts: {
      players: 'Jugadores',
      linked: 'Con perfil',
      devices: 'Teléfonos',
      groups: 'Grupos',
      payments: 'Pagos',
      disputes: 'Discrepancias',
    },
    code: 'Código',
    created: (when: string) => `Creado ${when}`,
    crew: (name: string) => `Crew: ${name}`,
    audit: 'Últimos cambios',
    auditEmpty: 'Sin cambios registrados.',
    auditLine: (table: string, action: string) => `${table}, ${action === 'INSERT' ? 'alta' : action === 'UPDATE' ? 'cambio' : 'baja'}`.replace(/^./, (c) => c.toUpperCase()),
    byPlatform: 'Admin de Polo',
    notFound: 'Ese torneo ya no existe.',
    // Protección
    protection: 'Protección',
    protectedBody: 'Nadie puede borrarlo, ni su dueño. Para corregir algo como Admin de Polo tienes que desbloquearlo 30 minutos con un motivo.',
    unprotectedBody: 'Protégelo cuando sea un torneo real: nadie podrá borrarlo por accidente.',
    protect: 'Proteger',
    unprotect: 'Quitar protección',
    unprotectReason: 'Motivo para quitarla',
    unlock: 'Desbloquear 30 min',
    relock: 'Bloquear ya',
    unlockTitle: 'Desbloquear este torneo',
    unlockBody: 'Vas a poder hacer lo mismo que su Comité durante 30 minutos. Todo queda registrado como Admin de Polo, con este motivo.',
    reason: 'Motivo',
    reasonPlaceholder: 'Qué vas a corregir y quién lo pidió',
    unlockedUntil: (time: string) => `Desbloqueado hasta las ${time}`,
    saved: 'Listo',
    /**
     * Before a tournament, an account or a crew opens (0068, TRUST-22): his reason goes on the record, and who it is
     * about sees it. Asked once; for two hours the same one opens again with none.
     */
    view: {
      title: '¿Por qué lo abres?',
      body: {
        tournament: 'Queda registrado con tu motivo, y su Comité lo ve en el historial del torneo.',
        person: 'Queda registrado con tu motivo, y esta persona lo ve en su perfil, en «Accesos del administrador».',
        crew: 'Queda registrado con tu motivo, y sus miembros lo ven en su perfil, en «Accesos del administrador».',
      },
      placeholder: 'Qué pasó y quién lo pidió',
      open: 'Abrir',
    },
    // Personas
    people: {
      search: 'Correo, usuario o nombre',
      filters: { all: 'Todos', accounts: 'Cuentas', devices: 'Teléfonos sin cuenta', blocked: 'Bloqueados' },
      filterLabel: 'Quiénes',
      count: (shown: number, total: number) => (shown === total ? `${total} ${total === 1 ? 'persona' : 'personas'}` : `${shown} de ${total}`),
      empty: 'Nadie coincide.',
      pickOne: 'Elige a alguien para ver su detalle.',
      back: 'Personas',
      phone: 'Teléfono sin cuenta',
      phoneAs: (player: string, tournament: string | null) => `Entró como ${player}${tournament ? ` en ${tournament}` : ''}`,
      phoneUnclaimed: 'Todavía no entra como ningún jugador',
      rowSub: (who: string, n: number) => `${who}${n ? `, ${n} ${n === 1 ? 'torneo' : 'torneos'}` : ''}`,
      provider: { email: 'Correo', google: 'Google', anonymous: 'Sin cuenta' } as Record<string, string>,
      chips: { blocked: 'Bloqueado', admin: 'Admin de Polo', you: 'Tú' },
      joined: (when: string) => `Se unió ${when}`,
      lastSeen: (when: string) => `Última entrada ${when}`,
      neverSeen: 'Nunca ha entrado',
      unconfirmed: 'Correo sin confirmar',
      profile: 'Perfil',
      viewProfile: 'Ver su perfil',
      hidden: 'Perfil oculto en búsquedas',
      index: (v: string) => `Índice ${v}`,
      tournaments: 'Torneos',
      noTournaments: 'No está en ningún torneo.',
      role: { owner: 'Dueño', admin: 'Comité' } as Record<string, string>,
      link: { confirmed: 'Jugador', pending: 'Por confirmar', device: 'Con PIN' } as Record<string, string>,
      tournamentLine: (role: string | null, link: string | null, player: string | null) =>
        [role, link && player ? `${link}: ${player}` : link].filter(Boolean).join(', '),
      /** What «Quitar amarre» unlinks: the player, and the tournament he plays. */
      playerIn: (player: string | null, tournament: string) => (player ? `${player} en ${tournament}` : tournament),
      unlink: 'Quitar amarre',
      unlinked: 'Amarre quitado',
      social: 'Crews y amigos',
      friends: (n: number, pending: number) => `${n} ${n === 1 ? 'amigo' : 'amigos'}${pending ? `, ${pending} por responder` : ''}`,
      crewLine: (role: string, members: number) => `${role === 'owner' ? 'Dueño' : 'Miembro'}, ${members} ${members === 1 ? 'miembro' : 'miembros'}`,
      push: (n: number, hosts: string) => (n ? `Avisos en ${n} ${n === 1 ? 'dispositivo' : 'dispositivos'} (${hosts})` : 'Sin avisos activados'),
      pin: 'Bloqueos de PIN',
      noPinLocks: 'Sin bloqueos de PIN.',
      deviceLock: (failed: number, until: string | null) => (until ? `Este teléfono está bloqueado hasta las ${until}` : `${failed} ${failed === 1 ? 'intento fallido' : 'intentos fallidos'} en este teléfono`),
      playerLock: (name: string, tournament: string, until: string | null) => `${name} en ${tournament}${until ? `: bloqueado hasta las ${until}` : ''}`,
      clearLock: 'Quitar bloqueo',
      clearLockTitle: 'Quitar el bloqueo de PIN',
      clearLockBody: 'El PIN no cambia: solo se borran los intentos fallidos y el bloqueo.',
      activity: 'Lo que hizo el admin',
      noActivity: 'Nada todavía.',
      actions: { block: 'Bloqueó la cuenta', unblock: 'Desbloqueó la cuenta', delete: 'Borró la cuenta', pin_unlock: 'Quitó un bloqueo de PIN', view: 'Abrió la cuenta' } as Record<string, string>,
      manage: 'Acciones',
      block: 'Bloquear',
      blockTitle: 'Bloquear esta cuenta',
      blockBody: 'No podrá volver a entrar y se cierran sus sesiones. Si ya tenía la app abierta, puede seguir hasta una hora. Sus torneos y resultados no se tocan.',
      unblock: 'Desbloquear',
      unblockTitle: 'Desbloquear esta cuenta',
      unblockBody: 'Podrá volver a entrar.',
      delete: 'Borrar cuenta',
      deleteTitle: 'Borrar esta cuenta',
      deleteIntro: 'No se puede deshacer. Esto pasa:',
      deleteOrphaned: (names: string) => `Se quedan sin Comité: ${names}. Podrás darles uno nuevo desde Torneos.`,
      deleteOrganizer: (n: number) => `Deja de ser del Comité en ${n} ${n === 1 ? 'torneo' : 'torneos'}.`,
      /** The players the account confirmed as its own (TRUST-03). */
      deleteAnonymized: (n: number, tournaments: string) =>
        `${n === 1 ? 'Su jugador queda' : `Sus ${n} jugadores quedan`} como «Jugador borrado», sin nombre, foto ni forma, en ${tournaments}. Los hoyos, el hándicap y el dinero se quedan, para que los resultados de los demás sigan cuadrando.`,
      /** Players only proposed to the profile: the Comité's own entry, kept as it is. */
      deletePlayers: (n: number) => `${n} ${n === 1 ? 'jugador conserva' : 'jugadores conservan'} su nombre, sus hoyos y sus resultados, sin su perfil.`,
      deleteCrewsHanded: (names: string) => `Sus crews pasan a su miembro más antiguo: ${names}.`,
      deleteCrewsDeleted: (names: string) => `Se borran sus crews donde estaba solo: ${names}.`,
      deleteSocial: (friends: number, rivalries: number) =>
        `Se borran ${andList([`${friends} ${friends === 1 ? 'amistad' : 'amistades'}`, `${rivalries} ${rivalries === 1 ? 'rivalidad' : 'rivalidades'}`])}.`,
      deleteProfile: 'Se borra su perfil, sus avisos y su índice Polo.',
      deleteConfirmEmail: (email: string) => `Escribe su correo (${email}) para confirmar`,
      deleteConfirmWord: 'Escribe BORRAR para confirmar',
      deleteInstead: 'Mejor bloquearla',
      deleted: 'Cuenta borrada',
      cantSelf: 'Es tu cuenta: aquí no hay acciones.',
      cantAdmin: 'Es admin de Polo: no se bloquea ni se borra desde aquí.',
      notFound: 'Esa cuenta ya no existe.',
      done: 'Listo',
    },
    // Campos
    courses: {
      search: 'Nombre o ciudad',
      filters: { all: 'Todos', dupes: 'Duplicados', broken: 'Con errores', unused: 'Sin usar' },
      filterLabel: 'Cuáles',
      count: (shown: number, total: number) => (shown === total ? `${total} ${total === 1 ? 'campo' : 'campos'}` : `${shown} de ${total}`),
      empty: 'Ningún campo coincide.',
      pickOne: 'Elige un campo para ver su tarjeta.',
      back: 'Campos',
      rowSub: (tees: number, rounds: number, where: string | null) =>
        [where, `${tees} ${tees === 1 ? 'tee' : 'tees'}`, rounds ? `${rounds} ${rounds === 1 ? 'ronda' : 'rondas'}` : 'sin usar'].filter(Boolean).join(', '),
      chips: { dupe: 'Duplicado', broken: 'Con errores' },
      source: { manual: 'A mano', golfcourseapi: 'Base de datos', opengolfapi: 'Base de datos', scorecard_photo: 'Foto de tarjeta' } as Record<string, string>,
      created: (who: string | null, when: string) => `${who ? `Lo agregó ${who}` : 'Agregado'} ${when}`,
      tees: 'Tees',
      teeLine: (par: number | null, rating: number | null, slope: number | null, inUse: number) =>
        [par ? `Par ${par}` : null, rating != null ? `${rating} / ${slope ?? '—'}` : null, inUse ? `en uso (${inUse})` : null].filter(Boolean).join(', '),
      problems: { holes: 'no tiene 9 ni 18 hoyos', par: 'algún par fuera de 3–6', si: 'los índices de golpe se repiten o faltan' } as Record<string, string>,
      noTees: 'Sin tees: nadie puede jugarlo así.',
      usedBy: 'Dónde se juega',
      notUsed: 'Nadie lo juega todavía.',
      usedLine: (rounds: number) => `${rounds} ${rounds === 1 ? 'ronda' : 'rondas'}`,
      dupes: 'Parece el mismo que',
      edit: 'Corregir la tarjeta',
      editHint: 'Si ya se jugaron rondas terminadas aquí, al guardar se recalculan sus resultados y el índice Polo.',
      saved: (n: number) => (n ? `Guardado. Recalculé ${n} ${n === 1 ? 'ronda' : 'rondas'}.` : 'Guardado'),
      merge: 'Fusionar con este',
      mergeTitle: 'Fusionar campos',
      mergeKeep: 'Se queda',
      mergeDrop: 'Se va',
      mergeSwap: 'Al revés',
      mergeBody: (drop: string, keep: string) => `Las rondas, los tees de cada jugador y las fotos de «${drop}» pasan a «${keep}», y «${drop}» se borra.`,
      mergeMapTitle: 'A qué tee pasa cada uno',
      mergeUnmapped: 'Nadie lo juega: se borra',
      mergeNeedsMap: 'Alguien lo juega: elige a cuál pasa',
      mergeMismatch: 'Tarjetas distintas (par o índice de golpe); corrígela antes',
      mergeDone: (rounds: number) => `Fusionados. ${rounds} ${rounds === 1 ? 'ronda pasó' : 'rondas pasaron'} al campo que se queda.`,
      delete: 'Borrar campo',
      deleteTitle: 'Borrar este campo',
      deleteBody: 'Nadie lo juega. Se borra con sus tees y hoyos.',
      deleteInUse: 'Se juega en algún torneo: fusiónalo con el bueno en lugar de borrarlo.',
      deleted: 'Campo borrado',
      refresh: 'Recalcular resultados',
      refreshed: (n: number) => `Recalculé ${n} ${n === 1 ? 'ronda' : 'rondas'}.`,
      activity: { course_merge: 'Fusionó campos', course_delete: 'Borró un campo', course_refresh: 'Recalculó resultados' } as Record<string, string>,
    },
    // Crews
    crews: {
      search: 'Nombre o código',
      count: (shown: number, total: number) => (shown === total ? `${total} ${total === 1 ? 'crew' : 'crews'}` : `${shown} de ${total}`),
      empty: 'Ningún crew coincide.',
      pickOne: 'Elige un crew para ver su detalle.',
      back: 'Crews',
      rowSub: (members: number, outings: number, owner: string | null) =>
        [`${members} ${members === 1 ? 'miembro' : 'miembros'}`, `${outings} ${outings === 1 ? 'salida' : 'salidas'}`, owner].filter(Boolean).join(', '),
      lastOuting: (when: string) => `Última salida ${when}`,
      noOutings: 'Sin salidas',
      members: 'Miembros',
      owner: 'Dueño',
      member: 'Miembro',
      joined: (when: string) => `Entró ${when}`,
      remove: 'Sacar',
      removeTitle: (name: string) => `Sacar a ${name} del crew`,
      removeBodyOwner: 'Es el dueño: el crew pasa a su miembro más antiguo.',
      removeBodyLast: 'Es el último: el crew se borra.',
      removeBody: 'Deja de ver el crew y sus salidas.',
      removed: { removed: 'Listo', handed: 'Listo. El crew pasó a su miembro más antiguo.', deleted: 'Era el último: el crew se borró.' } as Record<string, string>,
      outings: 'Salidas',
      delete: 'Borrar crew',
      deleteTitle: 'Borrar este crew',
      deleteBody: 'Sus torneos y rondas se quedan, fuera del crew. Sus miembros dejan de verlo.',
      deleteConfirm: (name: string) => `Escribe «${name}» para confirmar`,
      deleted: 'Crew borrado',
      activity: { crew_remove_member: 'Sacó a alguien', crew_delete: 'Borró el crew', view: 'Abrió el crew' } as Record<string, string>,
      notFound: 'Ese crew ya no existe.',
    },
    // Avisos
    notices: {
      hint: 'Llega a su bandeja de Avisos y, a quien tenga los avisos activados, como notificación en el teléfono.',
      to: 'Para',
      toAll: 'Todos',
      toOne: 'Una persona',
      toLabel: 'A quién',
      pick: 'Busca a quién',
      picked: (name: string) => `Para ${name}`,
      change: 'Cambiar',
      title: 'Título',
      titleHint: (n: number) => `${n} de 60`,
      body: 'Mensaje',
      bodyHint: (n: number) => `${n} de 280`,
      url: 'Al tocarlo, abre (opcional)',
      urlHint: 'Una página de Polo, como /crews o /ronda',
      urlBad: 'Tiene que ser una página de Polo, que empiece con /',
      preview: 'Así se ve',
      audienceAll: (profiles: number, push: number) => `Llega a ${profiles} ${profiles === 1 ? 'perfil' : 'perfiles'}; ${push} ${push === 1 ? 'lo recibe' : 'lo reciben'} en el teléfono.`,
      limit: (sent: number) => (sent >= 2 ? 'Ya mandaste los dos avisos a todos de hoy.' : `Puedes mandar ${2 - sent} ${2 - sent === 1 ? 'aviso' : 'avisos'} a todos más hoy.`),
      send: 'Mandar aviso',
      confirmAll: (n: number) => `Mandar a ${n} ${n === 1 ? 'persona' : 'personas'}`,
      confirmTitle: 'Mandar el aviso',
      confirmBody: 'No se puede deshacer: llega de inmediato.',
      sent: (n: number) => `Aviso enviado a ${n} ${n === 1 ? 'persona' : 'personas'}`,
      recent: 'Enviados',
      recentEmpty: 'Nada todavía.',
      recentTo: (name: string | null, count: number) => (name ? `A ${name}` : `A todos (${count})`),
    },
    // Auditoría
    auditLog: {
      hint: 'Todo lo que hiciste como Admin de Polo: acciones del panel y cambios dentro de torneos.',
      search: 'Motivo, torneo o acción',
      sources: { all: 'Todo', platform: 'Panel', comite: 'Dentro de torneos' },
      sourceLabel: 'Qué',
      empty: 'Nada que coincida.',
      more: 'Ver más',
      detail: 'Detalle',
      fields: 'Datos',
      actions: {
        protect: 'Protegió un torneo',
        unprotect: 'Quitó la protección',
        unlock: 'Desbloqueó un torneo',
        relock: 'Volvió a bloquear',
        block: 'Bloqueó una cuenta',
        unblock: 'Desbloqueó una cuenta',
        delete: 'Borró una cuenta',
        pin_unlock: 'Quitó un bloqueo de PIN',
        set_organizer: 'Cambió el Comité',
        course_merge: 'Fusionó campos',
        course_delete: 'Borró un campo',
        course_refresh: 'Recalculó resultados',
        crew_remove_member: 'Sacó a alguien de un crew',
        crew_delete: 'Borró un crew',
        broadcast: 'Mandó un aviso',
        set_flag: 'Cambió un interruptor',
        /** 0068 (TRUST-22): he opened it from his panel, or a tournament by its link. */
        view: 'Abrió para revisar',
        /** 0070 (TRUST-09): a person's own steps, logged beside the operator's. */
        self_export: 'Una persona descargó sus datos',
        self_delete: 'Una persona borró su cuenta',
      } as Record<string, string>,
      comiteLine: (table: string, op: string) => `${table}, ${op === 'INSERT' ? 'alta' : op === 'UPDATE' ? 'cambio' : 'baja'}`,
    },
    // Salud
    health: {
      refresh: 'Actualizar',
      backup: 'Respaldo nocturno',
      backupOk: (when: string) => `Último respaldo bueno ${when}`,
      backupNever: 'Todavía no hay respaldos registrados. El siguiente corre a las 2 am de Los Cabos.',
      backupFailed: (when: string, error: string) => `El último intento falló ${when}: ${error}`,
      backupSize: (kb: number, tables: number, rows: number) => `${kb.toLocaleString('es-MX')} KB, ${tables} tablas, ${rows.toLocaleString('es-MX')} filas`,
      backupWeek: (ok: number, failed: number) => `Esta semana: ${ok} ${ok === 1 ? 'bueno' : 'buenos'}${failed ? `, ${failed} ${failed === 1 ? 'falló' : 'fallaron'}` : ''}`,
      backupStale: 'Más de 36 horas sin un respaldo bueno. Revisa el cron en Vercel.',
      /** The nightly deletion (0069, TRUST-18): it runs after a good backup. */
      retention: 'Borrado de cada noche',
      retentionHint: 'Después de cada respaldo bueno se borra lo que ya cumplió: nunca nada de un torneo que exista.',
      retentionNever: 'Todavía no corre: corre después del siguiente respaldo bueno.',
      retentionLast: (when: string, ok: boolean) => (ok ? `La última noche corrió ${when}` : `La última noche falló ${when}`),
      retentionWeek: 'Esta semana se borraron',
      retentionNone: 'Esta semana no hubo nada que borrar.',
      retentionKind: {
        anonymous: 'Usuarios anónimos sin usar 180 días',
        link_tokens: 'Enlaces de un solo uso vencidos',
        score_mutations: 'Respuestas a hoyos guardados de hace más de 90 días',
        notifications: 'Avisos de hace más de 12 meses',
        client_events: 'Datos técnicos de más de 30 días',
        device_status: 'Teléfonos sin usarse 90 días',
        deleted_tournament_audit: 'Historial de torneos borrados hace 90 días',
      } as Record<string, string>,
      retentionCount: (label: string, n: number) => `${label}: ${n.toLocaleString('es-MX')}`,
      push: 'Notificaciones',
      pushConfigured: 'Configuradas',
      pushMissing: 'Falta configurarlas en Vault (ve docs/handoff.md).',
      pushUnknown: 'No pude revisar la configuración.',
      pushSubs: (subs: number, profiles: number) => `${subs} ${subs === 1 ? 'teléfono' : 'teléfonos'} de ${profiles} ${profiles === 1 ? 'perfil' : 'perfiles'}`,
      pushRecent: (total: number, failed: number) => (total ? `Últimas horas: ${total} ${total === 1 ? 'envío' : 'envíos'}${failed ? `, ${failed} con error` : ', sin errores'}` : 'Sin envíos en las últimas horas'),
      pushRecentNote: 'Supabase solo guarda unas horas de envíos.',
      database: 'Base de datos',
      migration: (name: string, when: string) => `Última migración: ${name}, ${when}`,
      notices24h: (n: number) => `${n} ${n === 1 ? 'aviso' : 'avisos'} en 24 horas`,
      people: 'Personas',
      blocked: (n: number) => `${n} ${n === 1 ? 'cuenta bloqueada' : 'cuentas bloqueadas'}`,
      locks: (device: number, player: number) => `${device + player} ${device + player === 1 ? 'bloqueo de PIN activo' : 'bloqueos de PIN activos'}`,
      switches: 'Interruptores',
      switchesHint: 'Para una emergencia o un mantenimiento. Tú siempre puedes crear cuentas y torneos.',
      pauseAccounts: 'Pausar cuentas nuevas',
      pauseAccountsHint: 'Nadie puede crear perfil. Quien ya juega con PIN sigue igual.',
      pauseTournaments: 'Pausar torneos nuevos',
      pauseTournamentsHint: 'Nadie puede crear torneos ni rondas rápidas.',
      banner: 'Aviso de mantenimiento',
      bannerHint: 'Sale arriba de todas las pantallas, para todos, hasta que lo quites.',
      bannerPlaceholder: 'Polo se actualiza hoy a las 11 pm; puede tardar unos minutos.',
      bannerSet: 'Poner aviso',
      bannerClear: 'Quitar aviso',
      switchTitle: 'Cambiar interruptor',
      switchOn: (what: string) => `Encender: ${what}`,
      switchOff: (what: string) => `Apagar: ${what}`,
      // Telemetría (STRAT-02): lo que mandan los teléfonos.
      phones: 'Teléfonos, últimas 24 horas',
      phonesHint: 'Lo que reporta cada teléfono: errores, cuánto tarda un hoyo en llegar a los demás, y lo que le falta por mandar. Nunca nombres ni montos.',
      sync: 'Hoyos en vivo',
      syncNone: 'Ningún hoyo de otro teléfono llegó en estas horas.',
      syncLag: (p50: string, p95: string) => `Llegan a los demás en ${p50} (la mitad), ${p95} (95 de cada 100)`,
      syncSlow: (n: number, total: number) => `${n} de ${total} ${total === 1 ? 'tardó' : 'tardaron'} más de 2 s`,
      syncAck: (p50: string, p95: string) => `El servidor contesta un hoyo en ${p50} (la mitad), ${p95} (95 de cada 100)`,
      devices: 'Teléfonos',
      devicesSeen: (n: number) => `${n} ${n === 1 ? 'teléfono activo' : 'teléfonos activos'}`,
      devicesPending: (holes: number, phones: number, when: string | null) =>
        holes ? `${holes} ${holes === 1 ? 'hoyo' : 'hoyos'} sin mandar en ${phones} ${phones === 1 ? 'teléfono' : 'teléfonos'}${when ? `, el más viejo ${when}` : ''}` : 'Nada sin mandar',
      devicesRejected: (n: number) => `${n} ${n === 1 ? 'hoyo rechazado' : 'hoyos rechazados'} en los teléfonos`,
      build: (sha: string | null, n: number) => `${sha ? `Versión ${sha}` : 'Versión sin nombre'}: ${n}`,
      vitals: 'Rapidez',
      vitalsNone: 'Sin mediciones todavía.',
      vital: { lcp: 'Carga', inp: 'Respuesta al tocar', cls: 'Saltos de la pantalla', fcp: 'Primer dibujo', ttfb: 'Respuesta del servidor' } as Record<string, string>,
      errors: 'Errores',
      errorsNone: 'Ningún error en estas horas.',
      errorLine: (count: number, devices: number, when: string) => `${count} ${count === 1 ? 'vez' : 'veces'} en ${devices} ${devices === 1 ? 'teléfono' : 'teléfonos'}, la última ${when}`,
      errorWhere: (route: string, line: string, sha: string | null) => [route ? `En ${route}` : '', line, sha ? `versión ${sha}` : ''].filter(Boolean).join(', '),
      usage: 'Uso',
      usageLine: (count: number, people: number) => `${count.toLocaleString('es-MX')} (${people} ${people === 1 ? 'persona' : 'personas'})`,
      step: {
        app_open: 'Abrieron la app',
        tournament_open: 'Abrieron un torneo',
        pin_claimed: 'Entraron con su PIN',
        pin_refused: 'PIN equivocado',
        hole_saved: 'Hoyos guardados',
        card_signed: 'Tarjetas firmadas',
        tournament_created: 'Torneos creados',
        quick_round_created: 'Rondas rápidas',
      } as Record<string, string>,
      telemetryUnavailable: 'La telemetría todavía no está en la base de datos.',
    },
    // Detalle de torneo: darle Comité
    addOrganizer: 'Agregar al Comité',
    addOrganizerTitle: 'Agregar al Comité',
    addOrganizerBody: 'Busca la cuenta de quien lo va a administrar. Queda como dueño.',
    addOrganizerPick: 'Elige una cuenta',
    removeOrganizer: 'Quitar del Comité',
    // Banner inside a tournament
    banner: 'Admin de Polo',
    bannerBody: 'Estás en un torneo de otro organizador. Lo que cambies queda registrado a tu nombre como Admin de Polo.',
    bannerProtected: 'Protegido: solo lectura',
    bannerUnlocked: (time: string) => `Desbloqueado hasta las ${time}`,
    bannerPanel: 'Ver en el admin',
  },
  home: {
    myTournaments: 'Mis torneos',
    newTournament: 'Nuevo torneo',
    joinTitle: 'Entrar a un torneo',
    joinHint: 'Escribe el código de seis caracteres que te mandaron, o pega el enlace.',
    joinPlaceholder: 'Código o enlace',
    joinButton: 'Entrar',
    lastTournament: 'Tu último torneo',
    organizerTitle: 'Organizadores',
    organizerHint: 'Crea y configura torneos con tu correo.',
    organizerButton: 'Organizar un torneo',
    otherWays: 'Otras formas de entrar',
    quickRound: 'Jugar una ronda rápida',
    backTo: (name: string) => `Volver a ${name}`,
    notFound: 'No encontré un torneo con ese código.',
  },
  auth: {
    title: 'Organizadores',
    intro: 'Crea el torneo, carga jugadores y campos, y corre el Comité desde tu teléfono.',
    firstTime: '¿Primera vez aquí?',
    haveAccount: '¿Ya tienes cuenta?',
    signingIn: 'Entrando…',
    creating: 'Creando la cuenta…',
    resetExpired: 'Este enlace ya no sirve. Pide otro con «Olvidé mi contraseña».',
    email: 'Correo',
    password: 'Contraseña',
    passwordHint: 'Mínimo 8 caracteres.',
    displayName: 'Tu nombre',
    signIn: 'Entrar',
    signUp: 'Crear cuenta',
    magicLink: 'Entrar con código',
    magicSent: 'Te enviamos un código y un enlace. Escribe el código aquí o abre el enlace en este teléfono.',
    toggleToSignUp: 'Crear una cuenta',
    toggleToSignIn: 'Ya tengo cuenta',
    needsConfirmation: 'Te enviamos un código para confirmar tu correo. Escríbelo aquí.',
    code: 'Código del correo',
    codeHint: 'Seis dígitos. Si no llega, revisa spam.',
    confirmCode: 'Confirmar',
    confirming: 'Confirmando…',
    badCode: 'Ese código no sirve o ya expiró. Pide otro.',
    codeSentTo: (email: string) => `Código enviado a ${email}`,
    otherEmail: 'Usar otro correo',
    resend: 'Reenviar código',
    resent: 'Te enviamos otro código.',
    anonymousWarning: 'Este teléfono está entrando como jugador. Para organizar, inicia sesión con tu correo.',
    forgot: 'Olvidé mi contraseña',
    resetSent: 'Te enviamos un correo para cambiarla. Ábrelo en este teléfono.',
    resetTitle: 'Nueva contraseña',
    newPassword: 'Nueva contraseña',
    resetDone: 'Contraseña cambiada.',
    changePassword: 'Cambiar contraseña',
  },
  organizer: {
    myTournaments: 'Mis torneos',
    empty: 'Todavía no tienes torneos.',
    emptyHint: 'Crea el primero: nombre, juegos y premios en tres pasos.',
    groupLive: 'En juego',
    groupSetup: 'En preparación',
    groupFinished: 'Terminados',
    newTournament: 'Nuevo torneo',
    open: 'Abrir',
    admin: 'Comité',
    joinCode: 'Código',
    link: 'Enlace',
    duplicate: 'Duplicar',
    duplicateName: (name: string) => `${name} (copia)`,
    wizard: {
      title: 'Nuevo torneo',
      step1: 'Nombre',
      step2: 'Formato',
      step3: 'Juegos',
      step4: 'Dinero',
      step5: 'Listo',
      stepOf: (n: number, total: number) => `Paso ${n} de ${total}`,
      summary: 'Resumen',
      modulesOn: 'Juegos',
      playersLine: (n: number) => `${n} jugadores`,
      entryLine: (fee: string, pot: string) => `${fee} por jugador, bolsa de ${pot}`,
      name: 'Nombre del torneo',
      namePlaceholder: 'Copa de los Compadres',
      tagline: 'Lema (opcional)',
      taglinePlaceholder: 'Valle de Bravo, noviembre',
      template: 'Empieza con',
      templateHint: 'Una plantilla para no empezar de cero. Todo se puede cambiar.',
      replaceTitle: '¿Cambiar de plantilla?',
      replaceBody: 'Se reemplazan los juegos y el dinero que ya ajustaste.',
      replaceConfirm: 'Cambiar',
      format: '¿Qué van a jugar?',
      formatHint: 'El formato de la tabla principal. Los demás juegos se agregan aparte.',
      formatInfo: (name: string) => `Cómo se juega ${name}`,
      formatInfoTitle: 'Cómo se juega',
      formats: {
        stableford: { name: 'Stableford', blurb: 'Puntos por hoyo: gana quien más sume. Puedes levantar sin arruinar la tarjeta.' },
        strokePlay: { name: 'Golpes', blurb: 'Se cuentan todos los golpes: gana quien menos haga. El formato de siempre.' },
        matchPlay: { name: 'Match play', blurb: 'Hoyo por hoyo contra tu rival. Se gana por hoyos, no por golpes.' },
        team: { name: 'Por equipos', blurb: 'Scramble, mejor bola o shamble: el equipo juega una tarjeta.' },
      },
      scoring: 'Con o sin hándicap',
      scoringNet: 'Neto',
      scoringGross: 'Gross',
      matchMode: 'Tipo de partido',
      matchSingles: 'Uno contra uno',
      matchFourball: 'Fourball',
      matchHint: 'El partido es el grupo: dos jugadores, o cuatro en dos parejas. Las parejas se arman en Equipos, en la consola del Comité.',
      teamMode: 'Cómo juega el equipo',
      teamScramble: 'Scramble',
      teamBestBall: 'Mejor bola',
      teamShamble: 'Shamble',
      teamHint: 'Los equipos se arman en Equipos, en la consola del Comité.',
      teamScoring: 'Qué se cuenta',
      teamStrokes: 'Golpes',
      teamPoints: 'Puntos',
      money: '¿Juegan por dinero?',
      moneyHint: 'Si no, se juega por la pura gloria. Se puede cambiar después.',
      quickGames: 'Juegos aparte',
      quickGamesHint: 'Los más comunes, de un toque. Hay más para agregar cuando quieras, ya dentro del torneo.',
      templateLink: '¿Prefieres empezar de una plantilla?',
      review: 'Antes de crear',
      reviewFormat: 'Formato',
      reviewDays: (n: number) => (n === 1 ? 'Una vuelta' : `${n} días`),
      reviewField: (n: number) => `${n} jugadores`,
      reviewMoney: (fee: string, pot: string) => `${fee} por jugador, bolsa de ${pot}`,
      reviewNoMoney: 'Sin dinero',
      reviewHint: 'Todo esto se cambia después en Comité.',
      // The games, one line each with what it pays: the prize statement, read before the tournament exists (UX-04).
      reviewGamesTitle: 'Juegos y premios',
      reviewNoPrize: 'Sin premio',
      reviewPrizes: 'Premios de la bolsa',
      reviewBalanced: (pot: string) => `Cuadra con la bolsa de ${pot}`,
      reviewAuctionPot: 'Pozo aparte',
      reviewAuction: (slots: string[]) => `Lo que se pague en la subasta: ${andList(slots)}`,
      reviewSidePot: (detail: string) => `Bote aparte: ${detail}`,
      reviewBet: 'Apuesta directa',
      // Leaving the wizard with something typed (UX-05).
      leaveTitle: '¿Salir sin crear el torneo?',
      leaveBody: 'Se borra lo que llevas.',
      leaveConfirm: 'Salir y borrar',
      leaveStay: 'Seguir aquí',
      players: '¿Cuántos jugadores?',
      playersHint: 'Aproximado; el cuadre de la bolsa lo usa hasta que cargues a los jugadores.',
      rounds: '¿Cuántos días (rondas)?',
      groupSize: 'Jugadores por grupo',
      handicap: 'Hándicap',
      handicapHint: 'Qué porcentaje del hándicap juega cada quien.',
      noHandicap: 'Sin hándicap',
      tiersOn: '¿Hay categorías?',
      tiersHint: 'Por ejemplo A, B, C y D por nivel. Sirven para las parejas y la Calcutta.',
      tierAdd: 'Agregar categoría',
      tierName: 'Nombre de la categoría',
      create: 'Crear torneo',
      creating: 'Creando…',
      created: 'Torneo creado',
      shareHint: 'Compártelo cuando los jugadores ya estén dados de alta: con el código o el enlace entran a este torneo con su cara y su PIN.',
      nextSteps: 'Ya existe. Ahora, en el Comité: los jugadores con su PIN, el campo, la fecha y los grupos. «Para empezar» te dice qué falta.',
      shareLater: 'Código para invitar',
      goAdmin: 'Ir al Comité',
      fixToCreate: 'Ajusta el dinero para crear el torneo: debe cuadrar, y cada premio debe tener quién lo gane.',
    },
  },
  setup: {
    catalogHint: 'Enciende lo que quieran jugar. Cada juego tiene sus opciones; lo demás queda en «Más opciones».',
    add: 'Agregar',
    addAnother: 'Agregar otro',
    remove: 'Quitar',
    more: 'Más opciones',
    done: 'Listo',
    name: 'Nombre del juego',
    days: 'Qué días',
    allDays: 'Todos',
    day: (n: number) => `Día ${n}`,
    later: 'Se arma después en Comité.',
    basis: { net: 'Neto', gross: 'Gross', points: 'Puntos' } as Record<string, string>,
    carry: 'Empates se acumulan',
    scope: { overall: 'Todo el torneo', perRound: 'Por día' } as Record<string, string>,
    event: { birdie: 'Birdies', eagle: 'Águilas', threePutt: 'Tres putts' } as Record<string, string>,
    format: { nassau: 'Nassau', match: 'Match a 18' } as Record<string, string>,
    press: 'Presión automática',
    pressOff: 'Sin presión',
    pressAt: (n: number) => `Al ir ${n} abajo`,
    maxPresses: 'Presiones por vuelta',
    pairScoring: { bestBall: 'Mejor bola', aggregate: 'Suma de la pareja' } as Record<string, string>,
    kind: { closest: 'Más cerca', longDrive: 'Drive largo', greenie: 'Greenie', sandy: 'Sandy', custom: 'Otro' } as Record<string, string>,
    holes: 'Hoyos',
    /** A11Y-22: what each switch on a game's card chooses, said by a screen reader before its options. */
    choose: {
      basis: 'Cuenta en',
      scope: 'Se juega',
      event: 'Paga por',
      format: 'Formato',
      kind: 'Tipo de concurso',
      holes: 'En qué hoyos',
      pairScoring: 'Cómo cuenta la pareja',
      money: (game: string) => `Dinero de ${game}`,
    },
    holesPar3: 'Par 3',
    holesAll: 'Todos',
    holesPick: 'Elegir',
    description: 'De qué se trata',
    descriptionPlaceholder: 'El que coma más tacos en la cena',
    /** `game` is the snake's own label (STRAT-11). */
    puttsThreshold: (game: string) => `Putts que pasan ${labelInSentence(game)}`,
    // Money
    mainPot: 'Bolsa principal',
    entryFee: 'Inscripción por jugador',
    split: 'Reparto del individual',
    splitHint: 'De lo que queda en la bolsa después de los demás premios.',
    splits: { classic: '50/30/20', wta: 'Todo al 1.º', top2: '60/40', top4: '40/30/20/10', amounts: 'Montos fijos' } as Record<string, string>,
    place: (n: number) => ordinal(String(n)),
    addPlace: 'Agregar lugar',
    /** TRUST-12: what the group spends together, never a «house» that takes a cut. */
    houseCut: 'Gastos del grupo',
    houseCutHint: 'Se aparta de la bolsa para lo del grupo: pelotas, cena, trofeos.',
    modulePrizes: 'Premios de la bolsa',
    perDay: 'por día',
    perSurvivor: (game: string) => `a cada quien sin ${labelInSentence(game)}`,
    sidePotsTitle: 'Juegos aparte',
    source: { none: 'Sin dinero', side: 'Bote aparte', main: 'De la bolsa', direct: 'Directo' } as Record<string, string>,
    sourceHint: {
      none: 'Por la gloria.',
      side: 'Cada quien que entra pone su parte; el bote solo paga a los que entraron.',
      main: 'Sale de la bolsa principal.',
      direct: 'Se pagan entre ellos, sin pasar por el banco.',
    } as Record<string, string>,
    buyIn: 'Cada quien pone',
    amount: 'Monto de la bolsa',
    stake: (unit: string) => `Por ${unit}`,
    unit: { skins: 'skin', eventPot: 'cada uno', match: 'apuesta', contest: 'hoyo ganado', custom: 'perdedor', lowScore: 'lugar' } as Record<string, string>,
    placesSplit: 'Reparto',
    bar: {
      main: 'Bolsa',
      pots: 'Botes aparte',
      ok: 'Cuadra',
      off: (diff: string) => `Faltan ${diff}`,
      over: (diff: string) => `Sobran ${diff}`,
      unreachable: 'Hay premios que nadie gana',
      /** MONEY-13: it balances, but something else in the settings makes no sense (listed by Guardar or Crear). */
      sense: 'Hay algo que corregir',
    },
  },
  account: {
    title: 'Tu perfil',
    lede: 'Tu índice, tus torneos y tus amigos, en cualquier teléfono. Sin contraseña: te mandamos un código.',
    saveTitle: 'Guarda tu perfil',
    saveLede: (name: string, tournament: string) => `Lo que jugaste como ${name} en ${tournament} queda en tu perfil.`,
    email: 'Tu correo',
    sendCode: 'Mandar código',
    sending: 'Mandando…',
    codeSent: (email: string) => `Te mandamos un código a ${email}. Escríbelo aquí.`,
    google: 'Continuar con Google',
    or: 'o con tu correo',
    /**
     * Why the phone may not sign out, change account or enter another
     * tournament with a PIN yet: what was entered in a tournament is still on
     * the phone. `name` null: a tournament the phone has no name for.
     */
    unsentSignal: (name: string | null, action: UnsentAction) =>
      `Lo capturado en ${name ?? 'un torneo'} aún no se sube. Abre ${name ?? 'el torneo'} con señal y espera a que diga «Sincronizado» antes de ${UNSENT_ACTION[action]}.`,
    unsentPin: (name: string | null, action: UnsentAction) =>
      `Lo capturado en ${name ?? 'un torneo'} espera tu PIN. Abre ${name ?? 'el torneo'}, entra con tu PIN y se sube solo; luego ya puedes ${UNSENT_ACTION[action]}.`,
    tooFast: 'Espera un minuto antes de pedir otro código.',
    badEmail: 'Revisa el correo.',
    googleTaken: 'Esa cuenta de Google ya tiene perfil.',
    googleTakenAction: 'Entrar con esa cuenta',
    returning: 'Terminando de entrar…',
    returnFailed: 'No se pudo terminar de entrar.',
    linked: (name: string) => `Guardado en tu perfil como ${name}.`,
    linkTaken: 'Ese jugador ya está en el perfil de otra persona. Pídele al Comité que lo revise.',
    already: 'Tu perfil ya es otro jugador en ese torneo.',
    signOut: 'Cerrar sesión',
    /** SEC-07: signing out ends every session of the account, so a lost or lent phone is signed out from another. */
    signOutEverywhere: 'Cierra tu sesión en todos los teléfonos y computadoras donde entraste. Si perdiste o prestaste un teléfono, ciérrala desde otro.',
    /** The sign-out button while it waits for the server (up to 15 s on lie-fi). */
    signingOut: 'Cerrando sesión…',
    /**
     * auth-js kept the session: it could not confirm it with the server to end
     * it (no signal and an expired token, or the signal just back inside its
     * 60 s retry cooldown, when no request is even sent). Nothing was cleared.
     */
    signOutUnconfirmed: 'No se pudo confirmar tu sesión con el servidor, así que sigue abierta y lo guardado en el teléfono sigue aquí. Intenta de nuevo en un minuto.',
    /** The server has not answered yet (lie-fi, an expired token still refreshing): the session may still end, and then the phone says so. */
    signOutPending: 'El servidor no ha respondido: por ahora sigues dentro. Si la sesión se cierra, se borra lo guardado en el teléfono y te avisamos.',
    /** The session ended after the phone had said it was still there: what it kept of the person is gone now too. */
    signedOutLate: 'Ya se cerró tu sesión y se borró lo guardado en el teléfono.',
    enterProfile: 'Entrar a mi perfil',
    enterProfileHint: 'Tu índice y tu historial en todos tus torneos.',
  },
  profile: {
    /** Editar perfil (0070, TRUST-09): the person's own data, downloaded, and the account deleted by its owner. */
    myData: {
      title: 'Tus datos',
      download: 'Descargar mis datos',
      downloadHint: 'Un archivo con todo lo que Polo guarda de ti: tu cuenta y tu perfil, tus jugadores con sus hoyos, resultados y dinero, tus amigos, crews, rivalidades y avisos, y quién entró a tu cuenta.',
      downloading: 'Preparando el archivo…',
      downloaded: 'Listo: el archivo está en tus descargas.',
      file: (day: string) => `polo-mis-datos-${day}.json`,
      delete: 'Borrar mi cuenta',
      deleteHint: 'Se borran tu perfil, tus amistades, rivalidades y avisos, y sales de tus crews. Lo que jugaste se queda en sus torneos, sin tu nombre.',
      deleteTitle: 'Borrar tu cuenta',
      deleteBody: 'Es para siempre. Se borran tu cuenta, tu perfil, tus amistades, tus rivalidades, tus avisos y los teléfonos donde los activaste, y sales de tus crews. Tus golpes, tu hándicap y tu dinero se quedan en cada torneo, para que los resultados de los demás sigan cuadrando, con tu jugador como «Jugador borrado».',
      deletePlayers: (n: number, where: string[]) => `${n === 1 ? 'Tu jugador queda' : `Tus ${n} jugadores quedan`} como «Jugador borrado» en ${andList(where)}.`,
      deleteOrphaned: (names: string[]) =>
        `Eres todo el Comité de ${andList(names)}: ${names.length === 1 ? 'se queda' : 'se quedan'} sin Comité. Si quieres, antes agrega a alguien a su Comité.`,
      deleteCrewsHanded: (names: string[]) => `${names.length === 1 ? 'Tu crew' : 'Tus crews'} ${andList(names)} ${names.length === 1 ? 'pasa' : 'pasan'} a quien lleva más tiempo en ${names.length === 1 ? 'él' : 'cada uno'}.`,
      deleteCrewsGone: (names: string[]) => `${names.length === 1 ? 'Tu crew' : 'Tus crews'} ${andList(names)} se ${names.length === 1 ? 'borra' : 'borran'}: no ${names.length === 1 ? 'tiene' : 'tienen'} a nadie más.`,
      deleteKept: 'Las copias de cada noche de antes del borrado lo siguen guardando, como dice el Aviso de privacidad.',
      confirmEmail: (email: string) => `Escribe tu correo (${email}) para confirmar`,
      deleteConfirm: 'Borrar para siempre',
      deleted: 'Tu cuenta se borró.',
    },
    /** Editar perfil (0068, TRUST-22): what the Admin de Polo opened or did about this account and its crews, and why. */
    adminAccess: {
      title: 'Accesos del administrador',
      hint: 'Cada vez que quien opera Polo abre tu cuenta o uno de tus crews, o hace algo con ellos, escribe por qué y aparece aquí.',
      none: 'Nadie de Polo ha abierto tu cuenta ni tus crews.',
      line: {
        view: 'Abrió tu cuenta',
        block: 'Bloqueó tu cuenta',
        unblock: 'Desbloqueó tu cuenta',
        pin_unlock: 'Quitó el bloqueo de PIN de tu teléfono',
      } as Record<string, string>,
      crewLine: {
        view: (crew: string) => `Abrió tu crew ${crew}`,
        crew_remove_member: (crew: string) => `Sacó a alguien de tu crew ${crew}`,
      } as Record<string, (crew: string) => string>,
      other: 'Hizo un cambio en tu cuenta',
      crewOther: (crew: string) => `Hizo un cambio en tu crew ${crew}`,
      goneCrew: 'un crew que ya no existe',
      reason: (r: string) => `Motivo: ${r}`,
      more: 'Ver todos',
    },
    index: 'Índice Polo',
    indexManual: 'Índice',
    manualNote: 'Declarado por el jugador',
    noIndex: 'Sin índice todavía',
    noIndexHint: 'Se calcula con tus rondas completas en Polo, como el índice oficial: las 8 mejores de las últimas 20.',
    rounds: (n: number) => (n === 1 ? '1 ronda' : `${n} rondas`),
    memberSince: (d: string) => `En Polo desde ${d}`,
    edit: 'Editar perfil',
    share: 'Compartir perfil',
    copyLink: 'Copiar enlace',
    shareText: (name: string) => `${name} en Polo`,
    tournaments: 'Torneos',
    noTournaments: 'Todavía no hay torneos en este perfil.',
    pending: 'Por confirmar',
    notFound: 'No encontré ese perfil.',
    notFoundHint: 'Puede que sea privado o que el usuario haya cambiado.',
    signInToSee: 'Entra a tu perfil para ver a otros jugadores.',
    viewProfile: 'Ver perfil',
    myProfile: 'Mi perfil',
    // Results (0015)
    indexTitle: (v: string) => `Índice Polo ${v}`,
    indexRule: (n: number, k: number) => `De tus últimas ${n} rondas que cuentan, ${k === 1 ? 'se toma la mejor' : `se promedian las ${k} mejores`}.`,
    indexAdjust: (v: string) => `Con pocas rondas se ajusta: ${v}.`,
    indexNeeds: 'Hacen falta 3 rondas completas de 18 hoyos, en un campo con rating y slope, en torneos que cuentan.',
    indexHow: 'Cada ronda da un diferencial: (gross ajustado − rating) × 113 ÷ slope. El gross ajustado topa cada hoyo en doble bogey neto y un hoyo levantado cuenta así.',
    counts: 'Cuenta',
    stats: { rounds: 'Rondas', bestGross: 'Mejor gross', birdies: 'Birdies' },
    history: 'Historial',
    noHistory: 'Las rondas aparecen aquí cuando el Comité las marca como terminadas.',
    practice: 'Práctica',
    incomplete: 'Incompleta',
    roundLine: (gross: number | null, ags: number | null) => (gross != null ? `Gross ${gross}${ags != null && ags !== gross ? `, ajustado ${ags}` : ''}` : ags != null ? `Ajustado ${ags}` : 'Sin gross'),
    differential: 'Diferencial',
    seeAll: (n: number) => `Ver las ${n}`,
    roundTitle: (tournament: string, day: number) => `${tournament}, día ${day}`,
    roundFacts: (tee: string | null, ch: number | null) => [tee ? `Tee ${tee}` : null, ch != null ? `hándicap de campo ${handicapText(ch)}` : null].filter(Boolean).join(', '),
    finish: (label: string, field: number | null) => {
      const n = label.replace(/^T/, '')
      const place = label.startsWith('T') ? `Empatado en ${n}.º` : `${n}.º`
      return field ? `${place} de ${field}` : place
    },
    money: 'Mi dinero',
    /** True of the code: the section is drawn for the profile's owner only (my_money()), but each tournament's members see every net in its Dinero (TRUST-02). */
    moneyHint: 'Este resumen solo lo ves tú; cada cifra la ven todos en el Dinero de su torneo.',
    moneyTotal: 'En total',
    noMoney: 'Cuando un torneo tuyo termine, aquí sale lo que ganaste o pusiste.',
    // Edit
    editTitle: 'Editar perfil',
    welcome: 'Tu perfil está listo. Revisa tu nombre y tu foto.',
    photo: 'Cambiar foto',
    displayName: 'Nombre',
    displayNameHint: 'Como te conocen en el grupo.',
    fullName: 'Nombre completo',
    handle: 'Usuario',
    handleHint: 'De 3 a 20: letras, números, punto o guion bajo.',
    handleTaken: 'Ese usuario ya existe o no está disponible.',
    homeClub: 'Club',
    city: 'Ciudad',
    bio: 'Sobre ti',
    bioCount: (n: number) => `${n} de 280`,
    indexSource: 'Tu índice',
    indexPolo: 'Automático',
    indexManualOption: 'Lo escribo yo',
    indexPoloHint: 'Polo lo calcula con tus rondas.',
    manualIndex: 'Índice',
    manualIndexHint: 'Si eres plus, escríbelo con signo: +1.2.',
    discoverable: 'Aparecer en búsquedas',
    discoverableHint: 'Viene apagado: así solo te encuentran tus amigos, tus crews y quienes juegan un torneo contigo. Si lo prendes, cualquiera con cuenta te encuentra con tres letras de tu nombre o tu usuario.',
    saved: 'Perfil guardado',
  },
  mipolo: {
    hello: (name: string) => `Hola, ${name}`,
    pendingTitle: '¿Eres tú?',
    pendingLine: (player: string, tournament: string) => `El Comité de ${tournament} dice que eres ${player}.`,
    yes: 'Sí, soy yo',
    no: 'No soy yo',
    live: 'En juego',
    upcoming: 'Próximos',
    past: 'Jugados',
    enter: 'Entrar',
    organizer: 'Organizas',
    organizerLink: 'Mis torneos como organizador',
    newTournament: 'Organizar un torneo',
    /** STRAT-07: under «Organizar un torneo», as the round has its line. */
    newTournamentHint: 'Un viaje o el torneo del grupo: juegos, Calcutta y las cuentas al peso.',
    empty: 'Cuando juegues un torneo en Polo, aparece aquí.',
    feed: 'Tus amigos',
    feedEmpty: 'Agrega a la gente con la que juegas para ver sus rondas aquí.',
    findFriends: 'Buscar amigos',
  },
  quick: {
    title: 'Ronda rápida',
    cta: 'Ronda rápida',
    ctaHint: 'Tu salida del fin de semana en un minuto: quién, dónde y a qué juegan.',
    name: 'Nombre',
    defaultName: (course: string, date: string) => `${course}, ${date}`,
    when: 'Fecha',
    course: 'Campo',
    coursePick: 'Elige el campo',
    noCourses: 'Todavía no hay campos. Agrega el tuyo: se busca en la base de campos o se lee de una foto de la tarjeta.',
    addCourse: '¿No está tu campo? Agrégalo',
    tee: 'Tee',
    teeHint: 'Todos salen del mismo tee; se cambia por jugador en Comité.',
    teeIncomplete: 'Ese tee no tiene sus 18 hoyos capturados.',
    who: 'Quién juega',
    you: 'Tú',
    friends: 'Amigos',
    friendsHint: 'Les llega un aviso para confirmar que son ellos y pueden capturar su tarjeta.',
    noFriends: 'Agrega amigos en Polo para invitarlos; mientras, súmalos como invitados.',
    guests: 'Invitados',
    guest: 'Invitado',
    guestsHint: 'Sin cuenta: tú capturas su tarjeta.',
    guestName: 'Nombre del invitado',
    addGuest: 'Agregar',
    index: 'Índice',
    indexLabel: (name: string) => `Índice de ${name}`,
    remove: (name: string) => `Quitar a ${name}`,
    games: 'A qué juegan',
    gamesHint: 'Siempre hay Stableford individual con hándicap completo. Suma lo que quieras:',
    game: { skins: 'Skins', closest: 'Más cerca del hoyo', birdies: 'Birdies', threePutts: 'Tres putts', lowNet: 'Low neto' } as Record<string, string>,
    money: 'Con dinero',
    moneyHint: 'Sin dinero todo es por la gloria. Con dinero, cada uno paga la inscripción y la bolsa se reparte por lugares; los juegos llevan su apuesta y se ajustan en Comité.',
    entryFee: 'Inscripción por jugador',
    /** `split` null: one place takes it all. */
    /** The inscriptions are the bolsa, here as in a tournament; a «bote» is only what a game's entrants put in (COPY-14). */
    potLine: (pot: string, split: string | null) => (split ? `Bolsa de ${pot}, se reparte ${split}.` : `Bolsa de ${pot}, todo para el primero.`),
    /** COPY-21: each chosen game's money, said before anyone commits to it. */
    stakeBuyIn: (game: string, each: string, pot: string) => `${game}: ${each} por jugador, bote de ${pot}.`,
    stakeBirdies: (each: string) => `Birdies: cada birdie o mejor cobra ${each} de cada uno de los demás.`,
    stakeThreePutts: (each: string) => `Tres putts: cada tres putts le cuesta ${each} a quien los hace, para cada uno de los demás.`,
    upfront: (players: number, each: string, direct: boolean) =>
      `Con ${players} ${players === 1 ? 'jugador' : 'jugadores'}, cada uno pone ${each} al empezar${direct ? '; lo de jugador a jugador se paga al final' : ''}.`,
    groups: (n: number) => (n === 1 ? 'Un grupo' : `${n} grupos de hasta 4`),
    start: 'Empezar',
    starting: 'Armando la ronda…',
    tooMany: 'Máximo 16 jugadores.',
    // Inside the tournament
    finishTitle: 'Terminar y publicar',
    finishHint: 'Cierra la ronda, calcula todo y lo manda a los perfiles: historial, índice y rivalidades.',
    finishMissing: (n: number) => (n === 1 ? 'A 1 jugador le faltan hoyos.' : `A ${n} jugadores les faltan hoyos.`),
    finishConfirm: 'Ya no se podrá capturar. Si algo quedó mal, el Comité lo corrige y se vuelve a publicar.',
    finished: (n: number) => `Ronda publicada en ${n === 1 ? '1 perfil' : `${n} perfiles`}.`,
    rivalryLine: (name: string, n: number) => (n === 0 ? `Rivalidad con ${name}: parejos` : n > 0 ? `Rivalidad con ${name}: recibes ${n}` : `Rivalidad con ${name}: das ${-n}`),
  },
  legal: {
    /** Where data is collected (TRUST-05): the notice and the terms, a tap away, before anything is saved. */
    consent: {
      start: 'Al continuar aceptas los ',
      /** The face grid and the PIN step: short enough to sit above the faces on a small phone. */
      enterStart: 'Al entrar aceptas los ',
      terms: 'Términos de uso',
      termsShort: 'Términos',
      middle: ' y el ',
      privacy: 'Aviso de privacidad',
      end: '.',
    },
    /**
     * After a document someone accepted changes, or for an account with no
     * record yet (TRUST-05, LegalUpdate): «Entendido» records the versions
     * on screen; «Cerrar» asks again the next time the app opens.
     */
    update: {
      title: (privacy: boolean, terms: boolean) =>
        privacy && terms ? 'Cambiamos el aviso y los términos' : privacy ? 'Cambiamos el aviso de privacidad' : 'Cambiamos los términos de uso',
      body: (both: boolean) =>
        both
          ? 'Cada uno dice arriba su fecha nueva. Léelos cuando quieras: al tocar «Entendido» guardamos que aceptas las versiones nuevas.'
          : 'Dice arriba su fecha nueva. Léelo cuando quieras: al tocar «Entendido» guardamos que aceptas la versión nueva.',
      firstTitle: 'El aviso y los términos de Polo',
      firstBody: 'Todavía no tenemos guardado que los aceptaste. Léelos cuando quieras: al tocar «Entendido» lo guardamos.',
      ok: 'Entendido',
    },
    /** Comité › Jugadores: the Comité types other people's data. */
    othersData: {
      start: 'Lo que captures de cada jugador, salvo su PIN, lo ven todos en el torneo; quién más lo ve está en el ',
      privacy: 'Aviso de privacidad',
      end: '.',
    },
    /** The push switch (Editar perfil, Avisos): what turning it on stores (save_push_subscription). */
    pushNote: {
      start: 'Al activarlos, Polo guarda la dirección de avisos de este navegador, como dice el ',
      privacy: 'Aviso de privacidad',
      end: '.',
    },
    /** The tournament's switch on a PIN phone (Más, En vivo): what turning it on stores, and until when (save_pin_push, 0052). */
    pinPushNote: {
      start: 'Al activarlos, Polo guarda la dirección de avisos de este navegador, ligada a tu jugador, hasta que este teléfono deje de entrar como él, como dice el ',
      privacy: 'Aviso de privacidad',
      end: '.',
    },
    /** Comité › Campos and /campos: a scorecard photo goes to Anthropic to be read (api/scorecard-extract.ts). */
    scorecardNote: {
      start: 'Foto o PDF de la tarjeta del campo: se la mandamos a Anthropic para que Claude la lea, y tú revisas todo antes de guardar. Más en el ',
      privacy: 'Aviso de privacidad',
      end: '.',
    },
    /** An account's sign-up (TRUST-13): checked before every way in, recorded with the acceptance (confirm_adult, 0070). */
    adult: {
      check: 'Confirmo que tengo 18 años o más',
      hint: 'Polo es para mayores de edad, y más donde se juega dinero.',
      needed: 'Para seguir, confirma que tienes 18 años o más.',
    },
    newTab: '(se abre en otra pestaña)',
    /** Both pages end on it. golf@cardigan.mx only sends the code emails: it has no mailbox yet (TRUST-01). */
    contact: 'Dudas: con Diego Gaxiola, que opera Polo. El correo golf@cardigan.mx todavía no recibe mensajes.',
    back: 'Volver a Polo',
    /** A legal page opened from a consent line is a tab of its own: closing it goes back to the form, still filled in. */
    close: 'Cerrar y volver',
    closeBlocked: 'Este navegador no deja cerrar la pestaña desde aquí: ciérrala tú y vuelve a la de Polo.',
    /**
     * Each document has its own version and date, and changes them only when
     * its own text changes: legalNotice.test.ts holds each version's
     * fingerprint, so an edit without a new version fails. Every sentence is
     * checked against the migrations, the API routes and the screens; what
     * the product cannot promise yet (a self-service deletion, a mailbox) is
     * said as it is today.
     */
    privacy: {
      title: 'Aviso de privacidad',
      version: '2026-10-16.2',
      updated: 'Última actualización: 16 de octubre de 2026',
      sections: [
        ['Quiénes somos', 'Polo es una app para organizar torneos y rondas de golf entre amigos: marcador en vivo, juegos, dinero entre jugadores y perfiles. La opera Diego Gaxiola, en golf.cardigan.mx.'],
        ['Qué datos guardamos', 'Tu correo (o tu cuenta de Google: nombre, correo y foto de perfil) para que entres a tu perfil; lo que escribes en tu perfil (nombre, usuario, foto, club, ciudad, índice, texto sobre ti); los torneos y rondas que juegas (golpes, putts, resultados, hándicap); tus amigos, crews y rivalidades; y, si activas los avisos, la dirección que tu navegador da para mandarte notificaciones y qué navegador es. En cada torneo, también lo que el Comité captura de cada jugador, lo que cada quien paga, gana y debe, a qué jugador quedó ligado cada teléfono que entró con un PIN, desde cuándo y hasta cuándo, y si es iPhone, Android o computadora, y el historial de cambios a sus golpes, jugadores, grupos y pagos. Si un teléfono que entró con un PIN activa los avisos del torneo, guardamos la dirección que su navegador da para mandarle notificaciones y qué navegador es, ligadas a su usuario anónimo y a su jugador; y, de cada torneo, qué avisos le mandó a cada jugador. Cuando aceptas este aviso y los términos (al entrar con tu PIN, al entrar a tu cuenta o crearla, al armar una Ronda rápida o al tocar «Entendido» cuando la app te los muestra), guardamos qué versión de cada uno aceptaste, cuándo y en qué paso; si el teléfono no tiene señal, lo guarda él y lo manda después (si no logra mandarlo en una semana, o cierras sesión antes, se pide otra vez en el siguiente paso). Al crear tu cuenta guardamos también que confirmaste tener 18 años o más; de un torneo con dinero, cuándo su Comité confirmó que todos sus jugadores son mayores de edad; lo que un jugador le pide al Comité corregir de sus datos; a qué crew pediste entrar, hasta que te contestan; y cuándo descargaste tus datos o borraste tu cuenta, en los registros de quien opera Polo. Abrir el enlace de un torneo o de un perfil no crea ningún usuario: en un navegador sin sesión, el usuario anónimo (sin correo ni nombre) se crea cuando mandas un PIN, y queda ligado a tu jugador si el PIN es el correcto. Supabase, donde viven las cuentas, guarda además la dirección IP y el navegador de cada sesión, con cuenta o sin ella. De cada navegador que abre la app guardamos además datos técnicos, ligados a su usuario y al torneo que tiene abierto: un número al azar que lo distingue, la versión de la app, si es iPhone, Android o computadora y si está en la pantalla de inicio; sus errores (el mensaje y la pantalla); cuánto tarda en guardarse un hoyo y en llegar a los demás teléfonos; qué tan rápido carga y responde; cuántos hoyos le faltan por mandar; y cuántas veces se dan algunos pasos (abrir la app o un torneo, entrar con un PIN, guardar un hoyo, firmar una tarjeta, crear un torneo). Nunca nombres, golpes ni montos. Se borran a los 30 días, y los de cada teléfono a los 90 sin usarse. Un navegador que solo abre un enlace para ver no manda ninguno.'],
        ['Para qué los usamos', 'Solo para que la app funcione: calcular marcadores, juegos, índices y resultados; mostrarle a cada quien lo que le toca ver; leer las tarjetas de campo que alguien sube; mandarte avisos, y al teléfono solo si los activas; guardar respaldos; y que quien opera Polo pueda dar soporte, corregir errores y saber si la app funciona bien en los teléfonos. Los avisos de un torneo le dicen a cada jugador cuándo empieza un día y de qué hoyo y a qué hora sale su grupo, que le toca firmar una tarjeta, que su grupo tiene pendiente quién embocó al último en un hoyo, que el Comité corrigió su tarjeta (qué cambió y por qué queda en ella, a la vista de todo el torneo) y, al final, en qué lugar quedó: nunca llevan montos ni nombres de otros jugadores. No vendemos ni rentamos datos, no hay publicidad y no los usamos para nada más.'],
        ['Quién ve tu perfil', 'Tu perfil completo (tu nombre completo, lo que escribes sobre ti, tus rondas y tus torneos) lo ven tus amigos, tus crews y quienes están en un torneo donde juegas, jugadores o Comité. Cualquier otra persona con cuenta, salvo quien opera Polo, solo ve tu tarjeta (nombre, usuario, foto, club, ciudad, índice y desde cuándo estás en Polo), y solo si prendes «Aparecer en búsquedas» en tu perfil: viene apagado. Prendido, te encuentran con tres letras de tu nombre o tu usuario, y la búsqueda muestra tu nombre, tu usuario y tu foto; tu club y tu ciudad solo están en tu tarjeta. Quien administra un crew decide si basta su código para entrar o si aprueba a cada quien, puede ponerle fin al código y puede sacar a cualquiera; quien sale o es sacado deja de ver el perfil completo de los demás, y ellos el suyo. Lo que se ve de ti como jugador de un torneo está en la sección que sigue.'],
        ['Lo que se ve de un torneo', 'Sus jugadores, golpes, putts, resultados, hándicaps, grupos y dinero los ve quien está en el torneo: sus jugadores y su Comité, juegue o no; también el historial de cada tarjeta: qué valores tuvo cada hoyo, quién los capturó y cuándo, y el motivo cuando el Comité lo corrigió. Además, cualquiera que abra su enlace o escriba su código de seis caracteres ve, sin cuenta, el nombre y el logo del torneo y el nombre completo, la foto, la categoría y si es el homenajeado de cada jugador, para que cada quien elija quién es. Si su Comité crea un enlace para ver (viene apagado), cualquiera que lo tenga ve, sin cuenta ni PIN, los tableros del torneo: su nombre y su logo; el nombre corto, la categoría y el hándicap de cada jugador, con el índice o las tres rondas de donde sale, el tee que juega cada día, el hándicap de juego que le fije el Comité (sin su motivo) y si es el homenajeado; el campo de cada día con sus tees y sus hoyos; sus golpes, putts y resultados, los grupos, las parejas, los equipos, quién firmó cada tarjeta y cuándo, y los juegos, con quién juega cada uno y quién ganó cada concurso. Nunca su nombre completo, su foto, su forma reciente ni su PIN, ni lo que el Comité escribe como motivo, nota o descripción de una apuesta; desde ahí nadie captura nada y no se crea ningún usuario. Sin dinero, como viene, no ve premios, pagos ni montos, ni la Calcutta, ni los juegos con bote aparte ni quién entró en ellos; con dinero ve también lo que cada quien paga, gana y debe, la Calcutta con sus precios y los botes aparte. El Comité puede cambiar el enlace, y el anterior deja de funcionar al instante, o apagarlo cuando quiera. Si un amigo te agrega a una Ronda rápida, tu nombre (el corto, no el completo) y tu índice pasan a esa ronda como jugador, aunque todavía no confirmes que eres tú; tu foto, solo si tu perfil aparece en búsquedas. Si dices «No soy yo», tu foto se quita de ese jugador. Su Comité ve además qué teléfonos del torneo tienen hoyos sin mandar, de qué jugador son y qué versión de la app tienen. También ve qué teléfonos entraron con el PIN de cada jugador, si son iPhone, Android o computadora y desde cuándo, y puede sacar a uno del torneo; en el historial de cambios, lo que hizo un jugador que entró en más de un teléfono dice desde cuál.'],
        ['Lo que el Comité captura de cada jugador', 'El Comité de un torneo escribe de cada jugador su nombre, su foto, su categoría, su tee, su hándicap (o tres rondas para estimarlo: buen día, día normal y mal día), su forma reciente, si es el homenajeado o puede usar el Comité, y su PIN; en una Ronda rápida, quien la arma escribe el nombre y el índice de sus invitados. Todo eso, salvo el PIN, lo ve quien está en el torneo, y el nombre, la foto, la categoría y si es el homenajeado, también quien tenga su enlace o su código; el nombre corto, la categoría, el tee, el hándicap (con el índice o las tres rondas) y si es el homenajeado, también quien tenga el enlace para ver, si el Comité lo crea. El PIN lo escoge el Comité, que lo escribe y se lo pasa al jugador; se guarda como una huella (hash), así que después nadie puede leerlo en la app, ni el Comité, que solo puede cambiarlo.'],
        ['Si alguien te agregó a un torneo', 'Si el Comité de un torneo, o un amigo en una Ronda rápida, te agregó como jugador, no creaste ninguna cuenta: lo que guardamos de ti es lo que él escribió (la sección anterior), lo que se captura de ti en el torneo y, si entras con tu PIN, qué teléfono quedó ligado a tu jugador. Quien te agrega se compromete, en los términos, a poder compartir tu nombre, tu foto y lo demás que escriba de ti con quienes ven el torneo, y a avisarte que te agregó. La primera vez que entras con tu PIN, Polo te muestra lo que el Comité guardó de ti y te deja pedirle que lo corrija; tu pedido lo ve el Comité de ese torneo. Para que se borre, o para cualquier otra cosa, está «Cómo pedir algo sobre tus datos».'],
        ['El dinero de un torneo', 'Lo que cada quien paga, gana y debe en un torneo lo ven todos los que están en él, jugadores y Comité: en Dinero, En vivo, Juegos y la hoja de cada jugador, y en las pantallas de TV y Ceremonia que se ponen para el grupo; y, si el Comité crea un enlace para ver con dinero, también quien tenga ese enlace. Cualquiera de ellos puede compartirlo, por ejemplo por WhatsApp, como texto o como imagen. En tu perfil, Mi dinero junta lo que ganaste o pusiste en cada torneo terminado: ese resumen solo lo ves tú, pero cada cifra la ven en Dinero todos los que están en su torneo. Los avisos que manda la app nunca llevan montos; los que escribe quien opera Polo son texto libre.'],
        ['Quién opera Polo', 'Quien opera Polo puede ver cualquier torneo, dinero incluido, y corregirlo con los mismos permisos que su Comité; para corregir uno Protegido, primero lo desbloquea por un rato y anota el motivo. También ve las cuentas: su correo, si entran con correo o con Google, cuándo se crearon y cuándo entraron por última vez, el nombre, la foto, el club, la ciudad y el índice de su perfil, sus torneos, sus crews y cuántos amigos tienen; los crews, con sus miembros y sus salidas (nunca su código), para atender un reporte; y los teléfonos que entraron sin cuenta, con el jugador que eligieron. También ve los datos técnicos que manda cada teléfono. Puede bloquear o borrar una cuenta, sacar a alguien de un crew y mandar avisos a todos o a una persona. Para abrir desde su panel un torneo en el que no está, una cuenta o un crew, escribe por qué, y queda registrado: el Comité de ese torneo lo ve en su historial de cambios, con el motivo, y tú ves en Editar perfil, en «Accesos del administrador», cuándo abrió tu cuenta o uno de tus crews, por qué y lo que hizo con ellos. Si entra a un torneo por su enlace, su Comité también lo ve en el historial, sin motivo. Lo que cambia en un torneo queda marcado como suyo. Fuera de la app, como administra la base de datos y los respaldos, puede consultar todos los datos, también la dirección IP y el navegador de cada sesión, y eso no queda en esos registros. Lo usa para dar soporte y corregir errores.'],
        ['Dónde viven', 'En Supabase (cuentas, base de datos y archivos), Vercel (sirve la app, y por sus servidores pasan el respaldo de cada noche, los avisos y las fotos de tarjetas que van a Anthropic) y Resend (los correos con código). Las fotos que se suben a Polo (de perfil, de jugadores, logos y tarjetas) son archivos públicos: cualquiera, aun sin cuenta, puede abrirlos. La app nunca borra un archivo: ni tus fotos de perfil anteriores ni los de una cuenta, un torneo o un campo que se borra. Cada noche, una copia de los datos de la app va a Cloudflare R2 en un archivo JSON comprimido, con lo esencial de cada cuenta (su correo o su teléfono, si es anónima, cuándo se creó y se confirmó, si está bloqueada, su nombre y su foto de perfil, y con qué entra, también el identificador de su cuenta de Google; nunca su contraseña) y una copia de cada archivo subido. No lleva ningún PIN, ningún enlace de un solo uso ni la dirección de avisos de ningún navegador. Nosotros no la ciframos: Cloudflare cifra lo que guarda en sus discos, pero quien tenga las llaves de ese almacenamiento puede leerla. Hoy esas copias no se borran nunca. Si subes la foto o el PDF de la tarjeta de un campo, se la mandamos a Anthropic para que Claude, su modelo, lea el nombre del campo, los pares, los índices de golpe, las yardas, el rating y el slope; recibe esa imagen y nada más. En cada navegador que entra a un torneo se queda una copia de lo último que cargó, dinero incluido, y de lo capturado que falte por mandar, para que funcione sin señal. La copia se borra al cambiar de jugador, al cerrar sesión o si el torneo ya no existe; lo capturado sin mandar se queda en el teléfono hasta que se manda. Un navegador que abre un enlace para ver no guarda nada del torneo: pide los tableros otra vez mientras los tiene en pantalla, y lo único que se queda en él es lo que se queda de cualquier página de Polo, la app misma y las imágenes que muestra (ahí, el logo del torneo), para abrir más rápido. Los avisos pasan por el servicio de notificaciones de tu navegador (el de Apple, Google, Microsoft o Mozilla).'],
        ['Fuera de México', 'Los servicios que usa Polo son de empresas de Estados Unidos y guardan o procesan ahí lo que les toca: Supabase (las cuentas, la base de datos y los archivos, en Virginia), Vercel (sirve la app), Resend (los correos con código), Cloudflare (los respaldos de cada noche) y Anthropic (las fotos de tarjetas de campo). Esos cinco hacen su parte por encargo de Polo y no usan tus datos para lo suyo. Google, si entras con Google, y el servicio de notificaciones de tu navegador (Apple, Google, Microsoft o Mozilla), si activas los avisos, no trabajan para Polo: reciben lo que tu cuenta o tu navegador ya les da, bajo sus propios avisos de privacidad. Fuera de ellos y de lo que este aviso dice que ve cada quien, no compartimos tus datos con nadie.'],
        ['Cuánto tiempo los guardamos', 'Cada noche, después del respaldo, se borra lo que ya cumplió su plazo. Tu perfil, tus amistades y rivalidades, tu lugar en tus crews y qué versión de este aviso y de los términos aceptaste se guardan mientras tengas tu cuenta (si entraste sin cuenta, mientras exista tu usuario anónimo), y se borran al borrarla (lo que queda de ti en los torneos está en «Tus derechos»). Los avisos de tu bandeja se borran a los 12 meses. Lo de un torneo (jugadores, golpes, grupos, Calcutta, pagos, resultados y los avisos que mandó) se guarda mientras exista el torneo, también para quienes ya no juegan, y su historial de cambios también; si el torneo se borra, su historial se queda con una copia de todo lo que tenía y se borra 90 días después. La respuesta que el servidor le dio a cada hoyo guardado sirve para no guardarlo dos veces, y se borra a los 90 días. Los campos cargados con sus fotos de tarjeta y los registros de quien opera Polo no tienen fecha de borrado, y tampoco lo que Supabase guarda de cada sesión (dirección IP y navegador); los de una cuenta se borran al borrarla. Un usuario anónimo, el que se crea al mandar un PIN, se borra si pasan 180 días sin usarse y no tiene nada en ningún torneo (nunca entró como un jugador ni capturó nada); si entró como un jugador, se queda mientras quede rastro de eso en el torneo. La dirección para mandarte avisos se guarda hasta que apagues los avisos en ese teléfono o el navegador la dé de baja: cerrar sesión no los apaga. La de un teléfono que entró con un PIN se borra además en cuanto el teléfono deja de entrar como ese jugador: al cambiar de jugador, al entrar con el PIN de otro, si el Comité lo saca del torneo o si se borra el jugador. Los intentos de PIN sirven unos minutos y después solo quedan como registro, y los enlaces de un solo uso sirven 15 minutos y se borran a partir del día siguiente. Los datos técnicos de los teléfonos se borran a partir de los 30 días, y los de cada teléfono a partir de los 90 días sin usarse. El enlace para ver de un torneo dura hasta que su Comité lo cambia o lo apaga, o se borra el torneo, y no va en las copias de cada noche; el historial de cambios guarda cuándo se creó, se cambió o se apagó, nunca el enlace. Las copias de cada noche guardan lo que había esa noche, salvo los PIN, los enlaces y las direcciones de avisos, y hoy no se borran nunca.'],
        ['Google', 'Si entras con Google, solo pedimos tu nombre, correo y foto de perfil: el correo para reconocer tu cuenta, y el nombre y la foto para empezar tu perfil, que puedes cambiar. Mientras no la cambies, esa foto se sigue cargando desde Google: cada quien que la ve se la pide a Google, que así recibe su dirección IP. El uso de esa información se apega a la Política de Datos de Usuario de los Servicios de API de Google, incluidos sus requisitos de uso limitado.'],
        ['Tus derechos', 'Puedes editar tu perfil cuando quieras, ponerlo o sacarlo de las búsquedas y apagar los avisos en cada teléfono. En Editar perfil, «Descargar mis datos» te da un archivo con todo lo que Polo guarda de ti (tu cuenta y tu perfil, tus jugadores con sus hoyos, resultados y dinero, tus amigos, crews, rivalidades y avisos, qué aceptaste y cuándo, y los accesos del administrador), y «Borrar mi cuenta» la borra, escribiendo tu correo para confirmar; también puede borrarla quien opera Polo. Al borrarla se quitan de la base de datos tu perfil, tus amistades, tus rivalidades, tus avisos, los navegadores donde los activaste y los datos técnicos de tus teléfonos, y sales de tus crews. En cada torneo donde confirmaste a un jugador como tuyo, ese jugador queda como «Jugador borrado»: sin tu nombre, tu foto ni tu forma, también en su historial de cambios; se quedan sus golpes, su hándicap y su dinero, para que los resultados de los demás sigan cuadrando. También queda así un jugador ligado a tu perfil que nunca confirmaste, si lleva tu nombre o tu foto: el que te agregó un amigo a una Ronda rápida, o la copia de un torneo duplicado; si el Comité le puso otro nombre, se queda con ese nombre, sin tu foto ni tu forma, también en su historial. Se quedan cada foto que subiste, también las anteriores, como archivo público; de tu correo, los registros de quien opera Polo guardan solo una huella, que sirve para reconocerlo si alguien vuelve a escribirlo, no para leerlo; lo que alguien haya escrito a mano en un motivo o una nota, tal como lo escribió; y todo lo de antes del borrado, perfil y amistades incluidos, en los respaldos de cada noche, que hoy no se borran nunca.'],
        ['Cómo pedir algo sobre tus datos', 'Puedes pedir saber qué datos tenemos de ti, corregirlos, que los borremos o que dejemos de usarlos para algo (tus derechos de acceso, rectificación, cancelación y oposición), y también retirar tu consentimiento o limitar su uso. Pídeselo a quien opera Polo, Diego Gaxiola, directamente o por medio del Comité de tu torneo, que se lo pasa; el correo golf@cardigan.mx todavía no recibe mensajes. Di tu nombre, el correo de tu cuenta o el torneo y el jugador, qué pides y, si es una corrección, el dato correcto. Antes de hacerlo confirmamos que eres tú: que entres a tu cuenta frente a nosotros o, cuando golf@cardigan.mx ya reciba mensajes, que nos escribas desde el correo de tu cuenta; si juegas sin cuenta, con el Comité de tu torneo. Te contestamos en un máximo de 20 días hábiles y, si procede, lo hacemos en los 15 días hábiles siguientes. Si no quedas conforme, puedes acudir a la Secretaría Anticorrupción y Buen Gobierno, la autoridad de protección de datos personales en México.'],
        ['Menores de edad', 'Polo es para mayores de 18 años. Para crear una cuenta confirmas que los tienes, y guardamos que lo confirmaste. Un torneo que juega con dinero le pide a su Comité confirmar que todos sus jugadores son mayores de edad, y lo guarda. Si un Comité agrega como jugador a alguien menor de edad en un torneo sin dinero, necesita el permiso de su madre, su padre o su tutor, y cualquiera de ellos puede pedirnos corregir o borrar sus datos como dice la sección anterior.'],
        ['Cambios a este aviso', 'Cuando este aviso cambie, cambian la fecha y la versión de arriba, y lo que ya guardamos no se usa para algo nuevo sin decirlo aquí antes. Si ya lo habías aceptado, al abrir Polo te lo decimos, con un enlace para leerlo, hasta que toques «Entendido» (nunca mientras capturas un hoyo, en la subasta o en las pantallas de TV).'],
      ] as Array<[string, string]>,
    },
    terms: {
      title: 'Términos de uso',
      version: '2026-10-16',
      updated: 'Última actualización: 16 de octubre de 2026',
      sections: [
        ['El servicio', 'Polo es gratis y se ofrece tal cual, para grupos de amigos. Lo opera Diego Gaxiola. Puede cambiar o dejar de funcionar; hacemos respaldos cada noche, pero no garantizamos que esté disponible siempre.'],
        ['Edad', 'Para crear una cuenta en Polo necesitas tener 18 años o más, y lo confirmas al crearla. Un torneo que juega con dinero es solo para mayores de edad, y su Comité lo confirma por todos sus jugadores.'],
        ['El dinero', 'Polo solo lleva la cuenta: no cobra, no guarda ni mueve dinero. Anota lo que los jugadores acuerdan entre ellos; cada grupo es responsable de lo que se juega, de pagarlo y de que sea legal donde juegan. El Comité de cada torneo decide sus reglas y sus resultados, y quien opera Polo también puede corregir un error en cualquier torneo.'],
        ['Si organizas', 'Si creas un torneo o una Ronda rápida, o agregas a alguien como jugador, confirmas que puedes compartir su nombre, su foto y lo demás que escribas de él con quienes van a ver el torneo, y que le avisas que lo agregaste y dónde está el aviso de privacidad. Corriges lo que te pida corregir de sus datos. Las reglas, los premios y el dinero de tu torneo son responsabilidad de su Comité.'],
        ['Tu cuenta', 'Usa tus datos reales, no te hagas pasar por nadie y no uses Polo para molestar a otros. Puedes borrar tu cuenta cuando quieras, en Editar perfil.'],
        ['Si se suspende una cuenta', 'Quien opera Polo puede bloquear o borrar una cuenta que no cumpla estos términos, y siempre anota el motivo. Si crees que fue un error, díselo a Diego Gaxiola, directamente o por medio del Comité de tu torneo (el correo golf@cardigan.mx todavía no recibe mensajes), y lo revisa.'],
        ['Tu contenido', 'Lo que subes o escribes (fotos, nombres, tarjetas) sigue siendo tuyo. Nos das permiso de guardarlo, de mostrarlo a quien dice el aviso de privacidad y, si es la foto o el PDF de la tarjeta de un campo, de mandarlo a Anthropic para leerlo.'],
        ['Responsabilidad', 'En lo que la ley lo permita, quien opera Polo no responde por pérdidas que vengan de usar la app, de un error en un marcador o en una cuenta de dinero, o de que no esté disponible. Antes de pagar, revisen los números entre ustedes: cada uno dice «¿Cómo se calculó?».'],
        ['Cambios', 'Si estos términos cambian, cambian su fecha y su versión de arriba, y la app te lo dice al abrirla, con un enlace para leerlos, hasta que toques «Entendido». Si no estás de acuerdo, puedes dejar de usar Polo y borrar tu cuenta.'],
        ['Ley y tribunales', 'Estos términos se rigen por las leyes de México, y cualquier desacuerdo se resuelve ante los tribunales de México que correspondan. Los escribió quien opera Polo, sin que un abogado los haya revisado todavía.'],
        ['Privacidad', 'Cómo tratamos tus datos está en el aviso de privacidad.'],
      ] as Array<[string, string]>,
    },
  },
  push: {
    title: 'Avisos en este teléfono',
    /** «Los de la app»: the Admin de Polo's notices are his own text (platform_broadcast), so the promise is only about the app's. */
    hint: 'Te llega como notificación cada aviso nuevo: solicitudes de amistad, rivalidades, resultados y más. Los de la app nunca llevan montos.',
    enable: 'Activar avisos',
    disable: 'Apagar en este teléfono',
    on: 'Activados en este teléfono.',
    /** Blocked: where this phone undoes it (PWA-12). The installed iPhone app has no browser settings: it is Ajustes. */
    denied: 'Los bloqueaste en este navegador. Para activarlos: el ícono junto a la dirección y luego Notificaciones.',
    deniedIos: 'Los bloqueaste para Polo. Para activarlos: abre Ajustes, toca Notificaciones y luego Polo.',
    deniedAndroidApp: 'Los bloqueaste para Polo. Para activarlos: en los Ajustes del teléfono, Aplicaciones, Polo y luego Notificaciones.',
    deniedAndroid: 'Los bloqueaste en este navegador. Para activarlos: toca el ícono junto a la dirección, luego Permisos y Notificaciones.',
    needsInstall: 'En iPhone y iPad los avisos llegan solo a la app de la pantalla de inicio (iOS 16.4 o más nuevo): toca Compartir, «Agregar a inicio», y abre Polo desde el ícono.',
    unsupported: 'Este navegador no recibe avisos.',
    unsupportedIos: 'Este iPhone no recibe avisos: hace falta iOS 16.4 o más nuevo.',
    enabled: 'Listo: te avisamos aquí.',
    disabled: 'Avisos apagados en este teléfono.',
    /** A tournament's notices (0052, PWA-10): in Más always, and on En vivo after the first hole saved in the installed app. */
    tournament: {
      title: 'Avisos del torneo',
      /** What they tell, for the games this tournament plays. */
      hint: (things: string[]) => `Te avisamos en este teléfono ${andList(things)}. Nunca llevan montos.`,
      day: 'cuando empiece cada día',
      card: 'cuando te toque firmar una tarjeta',
      snake: (game: string) => `cuando en ${game} falte decir quién embocó al último`,
      results: 'cuando salgan los resultados',
      /** TRUST-14 (0062). */
      corrected: 'cuando el Comité corrija tu tarjeta',
      later: 'Ahora no',
    },
  },
  achievements: {
    badges: 'Insignias',
    badgesCount: (n: number, of: number) => `${n} de ${of}`,
    locked: 'Por ganar',
    earnedOn: (d: string) => `Ganada el ${d}`,
    earned: 'Ganada',
    badge: {
      firstRound: { name: 'Primera ronda', how: 'Termina una ronda completa en Polo.' },
      rounds10: { name: 'Diez rondas', how: '10 rondas completas.' },
      rounds25: { name: 'Veinticinco', how: '25 rondas completas.' },
      rounds50: { name: 'Medio centenar', how: '50 rondas completas.' },
      firstBirdie: { name: 'Primer pajarito', how: 'Un birdie o mejor.' },
      birdies3: { name: 'Parvada', how: 'Tres birdies o mejor en una ronda.' },
      eagle: { name: 'Águila', how: 'Dos bajo par en un hoyo.' },
      ace: { name: 'Hoyo en uno', how: 'Embocar desde la salida.' },
      break100: { name: 'Menos de 100', how: 'Gross de 99 o menos en 18 hoyos.' },
      break90: { name: 'Menos de 90', how: 'Gross de 89 o menos en 18 hoyos.' },
      break80: { name: 'Menos de 80', how: 'Gross de 79 o menos en 18 hoyos.' },
      break70: { name: 'Menos de 70', how: 'Gross de 69 o menos en 18 hoyos.' },
      parStreak5: { name: 'Racha', how: 'Cinco hoyos seguidos en par o mejor.' },
      noDoubles: { name: 'Sin dobles', how: '18 hoyos sin pasar de bogey.' },
      noThreePutts: { name: 'Mano firme', how: '18 hoyos sin tres putts (con putts capturados).' },
      putts28: { name: 'Putter caliente', how: '28 putts o menos en 18 hoyos.' },
      tournaments5: { name: 'De torneo en torneo', how: 'Cinco torneos terminados.' },
      podium: { name: 'Podio', how: 'Terminar entre los tres primeros de un torneo.' },
      firstWin: { name: 'Campeón', how: 'Ganar un torneo.' },
      wins3: { name: 'Tricampeón', how: 'Ganar tres torneos.' },
    } as Record<string, { name: string; how: string }>,
    records: 'Récords',
    noRecords: 'Tus mejores marcas aparecen cuando tengas rondas completas.',
    record: {
      bestGross: 'Mejor gross',
      bestDifferential: 'Mejor diferencial',
      mostBirdies: 'Más birdies en una ronda',
      fewestPutts: 'Menos putts',
      longestParStreak: 'Racha en par o mejor',
      bestFinish: 'Mejor lugar',
    } as Record<string, string>,
    holes: (n: number) => (n === 1 ? '1 hoyo' : `${n} hoyos`),
    place: (rank: number, of: number | null | undefined) => (of ? `${rank}.º de ${of}` : `${rank}.º`),
    // The year
    recap: (y: number) => `Mi ${y} en Polo`,
    recapButton: (y: number) => `Compartir mi ${y}`,
    recapRounds: 'Rondas',
    recapTournaments: 'Torneos',
    recapWins: 'Victorias',
    recapPodiums: 'Podios',
    recapBirdies: 'Birdies',
    recapEagles: 'Águilas',
    recapBest: 'Mejor gross',
    recapAvg: 'Promedio',
    recapDiff: 'Mejor diferencial',
    recapCourses: 'Campos',
    recapFavorite: (c: string) => `Tu campo: ${c}`,
    recapBadges: 'Insignias del año',
    recapShareText: (y: number) => `Mi ${y} en Polo`,
  },
  crews: {
    title: 'Crews',
    mine: 'Mis crews',
    lede: 'Tu grupo de siempre: sus salidas, su tabla del año y su campeón.',
    none: 'Todavía no estás en ningún crew. Crea el de tu grupo o entra con el código que te pasaron.',
    members: (n: number) => (n === 1 ? '1 miembro' : `${n} miembros`),
    owner: 'Administra',
    create: 'Crear un crew',
    createName: 'Nombre del crew',
    createPlaceholder: 'Los del sábado',
    createButton: 'Crear',
    join: 'Entrar con código',
    joinPlaceholder: 'Código',
    joinButton: 'Entrar',
    badCode: 'Ese código no existe. Pídele al grupo el nuevo.',
    joinTitle: (name: string) => `Te invitan a ${name}`,
    joinLine: (n: number) => `${n === 1 ? '1 miembro' : `${n} miembros`}. Al entrar ven tu perfil completo y tú el suyo.`,
    joinCta: 'Entrar al crew',
    already: 'Ya estás en este crew.',
    joined: (name: string) => `Ya eres de ${name}`,
    /** A crew that approves who enters (0071, TRUST-11). */
    joinApprovalLine: (n: number) => `${n === 1 ? '1 miembro' : `${n} miembros`}. Quien lo administra aprueba a quien entra; ya adentro, ven tu perfil completo y tú el suyo.`,
    joinAsk: 'Pedir entrar',
    requested: (name: string) => `Listo: quien administra ${name} ya sabe que quieres entrar.`,
    alreadyAsked: 'Ya pediste entrar: quien lo administra decide.',
    // Crew page
    season: (y: number) => `Temporada ${y}`,
    table: 'Tabla',
    tableHow: 'Por salida: 25, 18, 15, 12, 10, 8, 6, 4, 2 y 1 punto del 1.º al 10.º, más 1 por jugar. Los empates se reparten los puntos de los lugares que ocupan. Desempata quien ganó más salidas y luego el mejor lugar.',
    noSeason: 'Cuando se publique la primera salida del crew, aquí sale la tabla.',
    events: (n: number) => (n === 1 ? '1 salida' : `${n} salidas`),
    wins: (n: number) => (n === 1 ? '1 victoria' : `${n} victorias`),
    pts: 'pts',
    champion: (y: number) => `Campeón ${y}`,
    leader: 'Va arriba',
    outings: 'Salidas',
    upcoming: 'En juego y próximas',
    past: 'Jugadas',
    noOutings: 'Todavía no hay salidas. Arma la primera con una Ronda rápida.',
    newOuting: 'Nueva salida',
    playersCount: (n: number) => (n === 1 ? '1 jugador' : `${n} jugadores`),
    invite: 'Invitar',
    inviteHint: 'Comparte el código o el enlace; entra quien tenga cuenta en Polo.',
    shareText: (name: string) => `Únete a ${name} en Polo`,
    rotate: 'Cambiar código',
    rotateConfirm: 'El código y el enlace de ahora dejan de servir. Los miembros se quedan.',
    /** The owner's controls (0071, TRUST-11). */
    rotateFor: 'El código nuevo sirve',
    rotateDays: { never: 'Sin fin', d7: '7 días', d30: '30 días' } as Record<'never' | 'd7' | 'd30', string>,
    codeUntil: (when: string) => `El código sirve hasta ${when}.`,
    codeExpired: 'El código ya no sirve: cambia el código para invitar a alguien.',
    approval: 'Aprobar solicitudes',
    approvalHint: 'Con el código, quien quiera entrar te lo pide y tú decides. Apagado, entra cualquiera que lo tenga.',
    requests: (n: number) => (n === 1 ? '1 solicitud' : `${n} solicitudes`),
    accept: 'Aceptar',
    decline: 'Rechazar',
    accepted: (name: string) => `${name} ya es del crew`,
    declined: (name: string) => `Rechazaste a ${name}`,
    remove: 'Sacar',
    removeTitle: (name: string) => `Sacar a ${name}`,
    removeBody: (name: string, crew: string) => `${name} deja de estar en ${crew}: ya no ve la tabla, las salidas ni el perfil completo de los demás, y no se le avisa. Puede volver a entrar si tiene el código: cámbialo, o prende «Aprobar solicitudes».`,
    removed: (name: string) => `${name} ya no es del crew`,
    leave: 'Salir del crew',
    leaveConfirm: (name: string) => `Dejas de ver la tabla y las salidas de ${name}. Si eres el último, el crew se borra.`,
    crewField: 'Crew',
    crewNone: 'Sin crew',
    crewHint: 'La salida cuenta para la tabla de ese crew.',
  },
  courses: {
    title: 'Campos',
    back: 'Volver',
  },
  social: {
    friends: 'Amigos',
    inbox: 'Avisos',
    unread: (n: number) => (n === 1 ? '1 aviso nuevo' : `${n} avisos nuevos`),
    searchLabel: 'Buscar por nombre o usuario',
    searchPlaceholder: 'Nombre o @usuario',
    searchNone: 'Nadie con ese nombre. Si tiene el perfil oculto, pídele su enlace.',
    /** TRUST-08 (0058): two letters find only the people you know; a stranger who chose to be found needs three. */
    searchShort: 'Con dos letras solo salen tus amigos, tus crews y quienes jugaron contigo. Escribe una más para buscar a alguien más.',
    incoming: 'Te quieren agregar',
    outgoing: 'Esperando respuesta',
    suggestions: 'Jugaron contigo',
    sharedTournaments: (n: number) => (n === 1 ? '1 torneo juntos' : `${n} torneos juntos`),
    noFriends: 'Todavía no tienes amigos en Polo. Búscalos o agrega a quien jugó contigo.',
    add: 'Agregar',
    accept: 'Aceptar',
    decline: 'Ahora no',
    cancel: 'Cancelar',
    requested: 'Solicitud enviada',
    addFriend: 'Agregar amigo',
    acceptFriend: 'Aceptar solicitud',
    areFriends: 'Son amigos',
    removeFriend: 'Quitar de amigos',
    removeConfirm: (name: string) => `${name} deja de ver tu perfil completo, salvo que jueguen un torneo juntos. Si tienen una rivalidad, se termina.`,
    block: 'Bloquear',
    blockConfirm: (name: string) => `${name} no podrá encontrarte ni agregarte. No se le avisa.`,
    blocked: 'Bloqueado',
    unblock: 'Desbloquear',
    notFound: 'No encontré ese perfil.',
    sent: 'Solicitud enviada',
    nowFriends: (name: string) => `Tú y ${name} ya son amigos`,
    // Head to head
    versus: 'Cara a cara',
    versusTitle: (name: string) => `Tú contra ${name}`,
    net: 'Neto',
    gross: 'Gross',
    record: (w: number, l: number, t: number) => `${w} ganadas, ${l} perdidas${t ? `, ${t} empatadas` : ''}`,
    recordShort: { won: 'Ganadas', lost: 'Perdidas', tied: 'Empates' },
    recordHow: 'Neto: gross ajustado menos tu hándicap de campo en el tee que jugó cada uno. Gross: solo rondas sin hoyos levantados.',
    sharedRounds: 'Rondas juntos',
    /** A11Y-22: the Neto/Gross switch over the shared rounds. */
    basis: 'Contar en',
    noShared: 'Todavía no tienen rondas completas juntos. Cuando el Comité cierre una en la que jugaron los dos, sale aquí.',
    you: 'Tú',
    /** Between the two faces on Cara a cara. */
    versusJoin: 'contra',
    roundVs: (basis: 'net' | 'gross', mine: number | null, theirs: number | null) => `${basis === 'net' ? 'Neto' : 'Gross'} ${mine ?? '—'} contra ${theirs ?? '—'}`,
    // Rivalry
    rivalry: 'Rivalidad',
    rivalryHint: 'Juegan con golpes que se mueven: después de cada ronda que jueguen juntos, quien pierde recibe un golpe más. Cuenta el gross ajustado de cada uno con los golpes aplicados.',
    rivalryFriendsOnly: 'Las rivalidades son entre amigos.',
    strokesMine: (n: number, name: string) => (n === 0 ? `Parejos con ${name}` : n > 0 ? `Recibes ${n === 1 ? '1 golpe' : `${n} golpes`} de ${name}` : `Le das ${-n === 1 ? '1 golpe' : `${-n} golpes`} a ${name}`),
    strokesFigure: (n: number) => (n === 0 ? '0' : n > 0 ? `+${n}` : `−${-n}`),
    strokesLabel: (n: number) => (n === 0 ? 'Parejos' : n > 0 ? 'Recibes' : 'Das'),
    suggest: (n: number | null) => (n == null ? 'Sin los dos índices, empiecen parejos o acuerden los golpes.' : n === 0 ? 'Con sus índices, van parejos.' : n > 0 ? `Con sus índices, recibirías ${n}.` : `Con sus índices, darías ${-n}.`),
    startStrokes: 'Golpes para empezar',
    receive: 'Recibo',
    give: 'Doy',
    propose: 'Proponer rivalidad',
    proposed: (name: string) => `Propuesta enviada. Empieza cuando ${name} acepte.`,
    waiting: (name: string) => `Esperando a que ${name} acepte.`,
    theyPropose: (name: string, line: string) => `${name} te propone una rivalidad: ${line}.`,
    acceptRivalry: 'Aceptar rivalidad',
    endRivalry: 'Terminar rivalidad',
    endConfirm: 'La rivalidad se cierra con su historial. Pueden empezar otra cuando quieran.',
    ended: 'Terminada',
    since: (d: string) => `Desde ${d}`,
    noRivalryRounds: 'Cuenta desde hoy: la próxima ronda que jueguen juntos mueve los golpes.',
    result: { won: 'Ganaste', lost: 'Perdiste', tie: 'Empate' } as Record<'won' | 'lost' | 'tie', string>,
    resultLine: (mine: number, theirs: number, before: number) => `${mine} contra ${theirs}, ${before === 0 ? 'parejos' : before > 0 ? `recibiendo ${before}` : `dando ${-before}`}`,
    // Inbox
    noNotices: 'Nada nuevo. Aquí te avisamos de amigos, rivalidades y resultados.',
    notice: {
      friend_request: (name: string) => `${name} te quiere agregar como amigo`,
      friend_accepted: (name: string) => `${name} aceptó tu solicitud`,
      rivalry_proposed: (name: string) => `${name} te propone una rivalidad`,
      rivalry_accepted: (name: string) => `${name} aceptó la rivalidad`,
      rivalry_round: (name: string) => `Nueva ronda en tu rivalidad con ${name}`,
      link_pending: (player: string, tournament: string) => `El Comité de ${tournament} dice que eres ${player}`,
      results: (tournament: string, finish: string | null) => `Resultados de ${tournament}${finish ? `: quedaste ${finish}` : ''}`,
      round_invite: (name: string, tournament: string) => `${name} te agregó a su ronda: ${tournament}`,
      crew_join: (name: string, crew: string) => `${name} entró a ${crew}`,
      /** A crew that approves who enters (0071, TRUST-11): to its owner, and to whoever it let in. */
      crew_request: (name: string, crew: string) => `${name} quiere entrar a ${crew}`,
      crew_accepted: (crew: string) => `Ya eres de ${crew}`,
      platform_notice: (title: string, body: string) => `${title}: ${body}`,
      platformTitle: 'Aviso de Polo',
      /**
       * A tournament's notices to its players (0052, PWA-10), PIN phones included: the inbox row, and the push's
       * body under the tournament's name. No names and never an amount: the server sends neither.
       */
      round_live: (tournament: string, round: number) => `Empezó el día ${round} de ${tournament}`,
      roundLiveBody: (round: number, group: number | null, startHole: number | null, teeTime: string | null) =>
        group == null
          ? `Empezó el día ${round}.`
          : `Empezó el día ${round}. Tu grupo ${group} sale${startHole != null ? ` del hoyo ${startHole}` : ''}${teeTime ? ` a las ${teeTime}` : ''}.`,
      card_to_sign: (tournament: string, round: number) => `Firma la tarjeta del día ${round} en ${tournament}`,
      cardToSignBody: (round: number) => `Tu grupo terminó el día ${round}: firma la tarjeta de la otra pareja.`,
      /** A marker's rule (UX-23): the notice names nobody (it never carries another player's name). */
      cardToSignMarkerBody: (round: number) => `Ya hay tarjetas de tu grupo del día ${round} listas: firma las de tus compañeros.`,
      snake_tiebreak: (tournament: string, game: string, hole: number) => `${game} en ${tournament}: falta decir quién embocó al último en el ${hole}`,
      snakeTiebreakBody: (game: string, round: number, hole: number) => `${game}, día ${round}: falta decir quién embocó al último en el hoyo ${hole}.`,
      /** The snake's own name when a notice comes without it (the server always sends the tournament's). */
      snakeGame: 'La Víbora',
      /** TRUST-14 (0062): the day only, never the hole, the values or who: the card says them, with the Comité's reason. */
      score_corrected: (tournament: string, round: number) => `El Comité corrigió tu tarjeta del día ${round} en ${tournament}`,
      scoreCorrectedBody: (round: number) => `El Comité corrigió tu tarjeta del día ${round}. Toca para ver qué cambió y por qué.`,
    },
    someone: 'Alguien',
    // Feed
    feedFinish: (name: string, finish: string, tournament: string) => `${name} quedó ${finish} en ${tournament}`,
    feedRound: (name: string, what: string, where: string) => `${name}: ${what} en ${where}`,
    feedWhat: (birdies: number, eagles: number, best: boolean, gross: number | null) =>
      andList([best && gross != null ? `su mejor ronda (${gross})` : null, eagles > 0 ? (eagles === 1 ? 'un águila' : `${eagles} águilas`) : null, birdies >= 3 ? `${birdies} birdies` : null].filter((x): x is string => !!x)) || 'una gran ronda',
    feedRivalry: (name: string, result: 'won' | 'lost' | 'tie') => (result === 'won' ? `Le ganaste la ronda a ${name}` : result === 'lost' ? `${name} te ganó la ronda` : `Empataste con ${name}`),
  },
  enter: {
    title: 'Entrar',
    tapYourFace: 'Elige tu nombre',
    search: 'Buscar por nombre',
    noMatch: 'Nadie con ese nombre.',
    pin: 'Tu PIN',
    pinHint: '4 dígitos. Si no lo tienes, pídeselo al Comité.',
    noPin: 'Este jugador todavía no tiene PIN. Pídeselo al Comité.',
    wrongPin: 'PIN incorrecto.',
    attemptsLeft: (n: number) => (n === 1 ? 'Te queda 1 intento.' : `Te quedan ${n} intentos.`),
    /** COPY-13: the time the lock ends, on this phone's clock; none when the server did not say. */
    lockedUntil: (time: string | null) =>
      time ? `Demasiados intentos. Vuelve a intentar a las ${time}.` : 'Demasiados intentos. Espera unos minutos y vuelve a intentar.',
    /** SEC-04: too many wrong PINs for this player from phones that never held him. His own phones still get in. */
    lockedPlayer: (time: string | null) =>
      `Hubo demasiados intentos con este PIN desde teléfonos nuevos. ${time ? `Vuelve a intentar a las ${time}` : 'Espera unos minutos'} o pídele al Comité que lo desbloquee. Donde ya entraste antes, sigue funcionando.`,
    playerGone: 'Ese jugador ya no está en el torneo. Elige tu nombre otra vez.',
    isThisYou: '¿Eres tú?',
    /**
     * A11Y-23: what a screen reader hears for a face: «Diego A., categoría A, homenajeado». It heard «Diego A. A» (the
     * tier glued to the name) and nothing of the honoree's ring. The lookup carries no settings, so the honoree is
     * the platform's word, not the tournament's label; a face the Comité proposed for this profile asks «¿Eres tú?».
     */
    faceSpoken: (name: string, tier: string | null, honoree: boolean, askMe: boolean) =>
      [name, askMe ? '¿eres tú?' : tier ? `categoría ${tier}` : '', honoree ? 'homenajeado' : ''].filter(Boolean).join(', '),
    confirmYou: (name: string) => `El Comité dice que eres ${name}.`,
    alreadyLinked: (name: string) => `Tu perfil ya es ${name || 'otro jugador'} en este torneo. Si no eres tú, pídele al Comité que lo corrija.`,
    notFound: 'Ese torneo no existe. Revisa el enlace o el código.',
    /** «no existe», when this phone still had writes of that tournament: they can never go out now. */
    goneUnsent: 'Lo que este teléfono tenía sin subir de ese torneo ya no se puede subir.',
    noPlayersHint: 'El Comité los carga en un momento. Mientras, ve preparando el swing.',
    noPlayers: 'El Comité todavía no ha cargado jugadores.',
    enterAs: (name: string) => `Entrar como ${name}`,
    notMe: 'No soy yo',
    organizerEnter: 'Entrar como organizador',
    switchPlayer: 'Cambiar de jugador',
  },
  install: {
    title: 'Instala la app',
    why: 'Abre en un toque, a pantalla completa y sin señal.',
    // iOS 26's compact Safari keeps Share under «⋯»; the sheet's item reads «Agregar a inicio» in es-MX.
    ios: 'Toca Compartir (el cuadro con la flecha; si no lo ves, está en ⋯) y luego «Agregar a inicio». Después abre Polo desde el ícono.',
    android: 'Toca el menú ⋮ y luego «Instalar app» o «Agregar a pantalla de inicio».',
    onIphone: 'En iPhone',
    onAndroid: 'En Android',
    installButton: 'Instalar',
    later: 'Ahora no',
    done: 'Ya la tengo',
    /** Más: always there, whatever the card was told. */
    howTo: 'Cómo instalar la app',
    /** Entrar in an iPhone's browser, before the PIN: the installed app keeps nothing of the browser's. */
    iosFirst: 'En iPhone, instala Polo antes de entrar y entra desde el ícono: así entras una sola vez.',
    iosFirstHow: 'Cómo se instala',
    alreadyIos: 'Si ya la instalaste, abre Polo desde el ícono.',
    /** The Tarjeta in an iPhone's browser: holes saved here stay in this browser. */
    iosCard: 'Si ya instalaste Polo, captura desde el ícono: lo que guardes aquí se queda en este navegador.',
    /** …and when this browser still has holes to send: only it can send them. */
    iosCardHeld: (n: number) =>
      n === 1
        ? 'Este navegador tiene 1 hoyo por subir, y la app del ícono no lo ve: déjalo abierto con señal hasta que suba.'
        : `Este navegador tiene ${n} hoyos por subir, y la app del ícono no los ve: déjalo abierto con señal hasta que suban.`,
  },
  sync: {
    synced: 'Sincronizado',
    live: 'En vivo',
    connecting: 'Conectando…',
    pending: (n: number) => (n === 1 ? '1 pendiente' : `${n} pendientes`),
    /** The banner over screens outside a tournament; a tournament's header says it in place (MOT-17). */
    offline: 'Sin señal. Se guarda en el teléfono.',
    offlineShort: 'Sin señal',
    pendingHoles: (n: number) => (n === 1 ? '1 hoyo por subir' : `${n} hoyos por subir`),
    /** The header's chip while a refresh someone asked for is under way (PWA-15). */
    refreshing: 'Actualizando…',
    /** The chip as a button (PWA-15): what it says, then what a tap does («Conectando… Actualizar», not «…. »). */
    refreshLabel: (state: string) => `${state}${state.endsWith('…') ? '' : '.'} Actualizar`,
    storeFailed: 'No se pudo guardar en el teléfono (sin espacio o modo privado). Libera espacio e intenta otra vez.',
    notPersistent: 'Este teléfono podría borrar los hoyos que aún no se suben si se queda sin espacio. Agrega Polo a tu pantalla de inicio para protegerlos.',
    rejected: (n: number) => (n === 1 ? '1 rechazado' : `${n} rechazados`),
    /** The same, said to a screen reader the moment it happens on the Tarjeta (A11Y-14). */
    rejectedSaid: (n: number) => (n === 1 ? 'El servidor rechazó 1 cambio de este teléfono.' : `El servidor rechazó ${n} cambios de este teléfono.`),
    errSigned: 'La tarjeta ya estaba firmada; el Comité tiene que capturarlo.',
    errNotLive: 'La ronda ya no está en juego; el Comité tiene que capturarlo.',
    errDenied: 'El servidor no aceptó este cambio.',
    /** save_hole: the player is not in this phone's group that day. */
    errNotInGroup: 'Ese jugador no está en tu grupo; el Comité tiene que capturarlo.',
    /** save_hole: values the server can't take (out of range, putts over strokes), or a call it can't read. */
    errInvalid: 'El servidor no aceptó esos valores; revisa el hoyo y captúralo otra vez.',
    /** save_hole: this device holds no player of the tournament any more; the PIN brings it back. */
    errNotMember: 'Este teléfono ya no está como jugador del torneo. Entra con tu PIN y se sube solo.',
    /** A write of a tournament that was deleted: it can never go out (its link leads nowhere). */
    errGone: 'El torneo ya no existe.',
    /** A hole of a day (round) the Comité deleted: it can never go out. */
    errRoundGone: 'Ese día del torneo ya no existe.',
    errNetwork: 'Sin conexión con el servidor. Se reintenta solo.',
    /** A write waits for the phone's session to be confirmed (after a lapse, or inside auth's cooldown). */
    errSession: 'Confirmando tu sesión… Se reintenta solo.',
    heldForPin: (n: number) =>
      n === 1
        ? 'Este teléfono tiene 1 hoyo sin subir. Entra con tu PIN y se sube solo.'
        : `Este teléfono tiene ${n} hoyos sin subir. Entra con tu PIN y se suben solos.`,
    /** The Tarjeta's line when the phone lost its session mid-round: the holes saved since wait for the PIN (REL-16). */
    heldForPinShort: (n: number) => (n === 1 ? '1 hoyo espera tu PIN' : `${n} hoyos esperan tu PIN`),
    unsentBeforeSwitch: (n: number) => (n === 1 ? 'Tienes 1 hoyo sin subir' : `Tienes ${n} hoyos sin subir`),
    /** The same, when what waits is a card signature, a snake answer or a hole award, not a hole. */
    unsentWritesBeforeSwitch: 'Tienes cambios sin subir',
    unsentBeforeSwitchBody:
      'Si cambias de jugador ahora, este teléfono ya no los puede subir. Espera a tener señal: cuando la Tarjeta diga «Sincronizado», ya puedes cambiar.',
    understood: 'Entendido',
    newVersion: 'Hay una versión nueva de la app.',
    updateRequired: 'Esta versión ya no sube hoyos. Actualiza y se sube todo lo guardado en el teléfono.',
    update: 'Actualizar',
    /**
     * The header's second line while the boards may be old (the phone's copy,
     * no signal, a fetch that failed): how old they are (REL-04). Out of the
     * chip, which cut the event name. The holes still on the phone are the
     * Tarjeta's to say (REL-21). `when` from `ago`.
     */
    boardsAge: (when: string) => `Actualizado ${when}`,
    /** How old a saved board is (src/lib/freshness.ts). */
    ago: {
      now: 'hace un momento',
      minutes: (n: number) => `hace ${n} min`,
      hours: (n: number) => (n === 1 ? 'hace 1 hora' : `hace ${n} horas`),
      today: (time: string) => `hoy, ${time}`,
      yesterday: (time: string) => `ayer, ${time}`,
      days: (n: number) => `hace ${n} días`,
      date: (date: string) => `el ${date}`,
    },
  },
  status: {
    setup: 'En preparación',
    auction: 'Noche de Calcutta',
    live: 'En juego',
    finished: 'Terminado',
  },
  roundStatus: {
    scheduled: 'Programada',
    live: 'En juego',
    finished: 'Terminada',
    cancelled: 'Cancelada',
  },
  round: {
    day: (n: number) => `Día ${n}`,
    hole: (n: number) => `Hoyo ${n}`,
    thru: (n: number, holes = 18) => (n === holes ? 'F' : `${n}`),
    /** A11Y-22: «F» said as a word, never «hoyo efe». */
    thruSpoken: (n: number, holes = 18) => (n === holes ? 'terminó' : `hoyo ${n}`),
  },
  /**
   * En vivo, once, after a PIN (TRUST-16): what the Comité typed about this player, who sees it, and «Pedir
   * corrección», which reaches the Comité in Comité › Jugadores (request_player_correction, 0070).
   */
  myData: {
    title: 'Esto es lo que el Comité guardó de ti',
    lede: 'Lo ve todo el torneo; tu PIN no. Si algo está mal, pídele al Comité que lo corrija.',
    name: 'Nombre',
    shortName: (s: string) => `se ve como ${s}`,
    photo: 'Foto',
    photoYes: 'Tiene una foto tuya',
    photoNo: 'Sin foto',
    tier: 'Categoría',
    handicap: 'Hándicap',
    handicapIndex: (v: string) => `Índice ${v}`,
    handicapEstimate: (scores: string) => `Estimado con tres rondas: ${scores}`,
    handicapManual: (v: string) => `${v}, el número que puso el Comité`,
    form: 'Forma reciente',
    none: 'Nada',
    ok: 'Está bien',
    ask: 'Pedir corrección',
    what: 'Qué hay que corregir',
    whatHint: 'Por ejemplo: mi hándicap es 14, o mi nombre lleva acento.',
    send: 'Mandar al Comité',
    sent: 'Listo: el Comité ya lo sabe.',
    /** Comité › Jugadores: the players' requests. */
    requests: (n: number) => (n === 1 ? '1 pedido de corrección' : `${n} pedidos de corrección`),
    requestsHint: 'Lo que un jugador pidió corregir de sus datos, desde su teléfono. Corrígelo en su hoja y márcalo hecho.',
    requestLine: (player: string, when: string) => `${player}, ${when}`,
    done: 'Hecho',
    doneAt: (when: string) => `Hecho ${when}`,
  },
  money: {
    ifEndedNow: 'si terminara ahora',
    /** TRUST-12: under Dinero, the Calcutta board and the settlement's share. */
    disclaimer: 'Polo solo lleva la cuenta: no cobra, no guarda ni mueve dinero.',
    /** TRUST-13: the Comité says every player is 18 or older before a tournament plays for money. */
    adults: {
      check: 'Todos los jugadores son mayores de edad',
      hint: 'Con dinero en juego, el Comité confirma que todos tienen 18 años o más. Queda registrado.',
      title: 'Mayores de edad',
      confirmed: (when: string) => `El Comité confirmó el ${when} que todos los jugadores son mayores de edad.`,
      missing: 'Este torneo juega con dinero y el Comité no ha confirmado que todos los jugadores son mayores de edad.',
      confirm: 'Confirmar',
      undo: 'Quitar la confirmación',
    },
    /**
     * What a person puts in (entry, Calcutta, buybacks, side pots, bets lost),
     * paid or not: «Pone $6,000, recibe $16,000». It used to read «Pagó», a
     * past tense for money nobody had handed over (COPY-03).
     */
    puts: 'Pone',
    /** What of it is still due today, beside «Pone»: what «Quién debe qué» asks him for. */
    owes: (amount: string) => `debe ${amount}`,
    receives: 'Recibe',
    net: 'Neto',
    markPaid: 'Pagado',
    howCalculated: '¿Cómo se calculó?',
    /** A11Y-25: a «¿Cómo se calculó?» shown as a figure is said as what it explains: «Campeón, $6,600: ¿Cómo se calculó?». */
    howCalculatedOf: (what: string) => (what ? `${what}: ¿Cómo se calculó?` : '¿Cómo se calculó?'),
    entryFee: 'Inscripción',
    pot: 'Bolsa',
    prizes: 'Premios',
  },
  live: {
    comingSoon: 'Este juego no está activo en este torneo.',
    noRounds: 'Todavía no hay rondas.',
    players: 'Jugadores',
    tier: 'Cat.',
    hcp: 'Hándicap',
    playingHcp: 'Hándicap de juego',
    thru: 'Hoyo',
    today: 'Hoy',
    scoreHole: (n: number) => `Anotar el hoyo ${n}`,
    scoreDone: 'Ver mi tarjeta',
    leadGroup: (hole: number) => `Grupo puntero en el hoyo ${hole}`,
    /** `when` from t.sync.ago: «Actualizado hace 5 min», «Actualizado ayer, 6:40 p.m.». */
    updated: (when: string) => `Actualizado ${when}`,
    points: 'Puntos',
    gross: 'Gross',
    /** A11Y-22: the Puntos/Gross switch's name. */
    boardIn: 'Tablero en',
    /** The honoree's card where the event does not count points: its figure, today's, and his last hole in words. */
    spotlightFigure: (pos: string, figure: string, today: string | null, lastHole: number | null, lastText: string | null) =>
      `${ordinal(pos)} con ${figure}${today ? `, hoy ${today}` : ''}${lastHole != null && lastText ? `, hoyo ${lastHole}: ${lastText}` : ''}`,
    spotlight: (pos: string, total: number, today: number | null, lastHole: number | null, lastPts: number | null) => `${ordinal(pos)} con ${ptsText(total)}${today != null ? `, hoy ${today}` : ''}${lastHole != null && lastPts != null ? `, hoyo ${lastHole}: ${ptsText(lastPts)}` : ''}`,
    /** A decided match's day, said with its side: «ganó 8&6», «perdió 8&6»; a match won on the 18th is «1 arriba» for the winner and «1 abajo» for the loser. */
    matchDay: (result: 'won' | 'lost' | 'halved', text: string) => (result === 'won' ? `ganó ${text}` : result === 'lost' ? `perdió ${text.replace(/ arriba$/, ' abajo')}` : text),
    // A card with nothing yet reads «–» or «—» on screen: spoken, it is left out, not «, —».
    /**
     * A11Y-11: what a screen reader hears for a board row, everything the row shows: «1.º, Camilo (tú), El novio,
     * categoría A, 60 puntos, hoy 25 puntos, hoyo 11, ganaría $12,200, dueños: Iván y Camilo, subió 3 lugares». It
     * said «1.º, Camilo, hoy 25, hoyo 11, 60»: no unit, no money, no owners, nothing for «tú» or the arrow.
     */
    ownersSpoken: (names: string[]) => `${names.length === 1 ? 'dueño' : 'dueños'}: ${andList(names)}`,
    /** MOT-06: places moved since this phone last showed the board, beside the position («▲3»), and said. */
    movedSpoken: movedWords,
    rowLabel: (pos: string, name: string, figure: string, today?: string, thru?: string, x: RowSpeech = {}) =>
      [
        ordinal(pos),
        x.me ? `${name} (tú)` : name,
        x.honoree ?? '',
        x.tier ? `categoría ${x.tier}` : '',
        x.estimated ? 'hándicap estimado' : '',
        blankFigure(figure) ? '' : spokenFigure(figure, x.unit),
        today && !blankFigure(today) ? `hoy ${x.todaySpoken ? today : spokenFigure(today, x.unit)}` : '',
        thru ? (thru === 'F' ? 'terminó' : `hoyo ${thru}`) : '',
        x.money ? `ganaría ${x.money}` : '',
        x.owners ?? '',
        x.movedBy ? movedWords(x.movedBy) : '',
      ]
        .filter(Boolean)
        .join(', '),
    /** `game` is the snake's own label (STRAT-11). */
    pendingSnake: (n: number, game: string) => `${game}: ${n === 1 ? '1 desempate pendiente' : `${n} desempates pendientes`}`,
    /** UX-28: a handicap changed after they were fixed; tapping it opens the player. */
    hcpChanged: (name: string, fromTo: string) => `El hándicap de ${name} cambió después de fijarlos: ${fromTo}`,
    /** STRAT-10: En vivo before anyone has played a hole: the next day, his group, tee and handicap, what he owes, and how long to go. */
    pre: {
      title: 'Antes de salir',
      day: (n: number, of: number) => (of > 1 ? `Día ${n} de ${of}` : `Día ${n}`),
      /** The countdown to his group's tee time, or the day's first, on the tournament's clock. */
      days: (n: number) => `Faltan ${n} días`,
      tomorrow: 'Es mañana',
      today: 'Es hoy',
      todayIn: (hours: number, minutes: number) =>
        `Salen en ${andList([hours > 0 ? `${hours} ${hours === 1 ? 'hora' : 'horas'}` : '', hours === 0 || minutes ? `${minutes} min` : ''].filter(Boolean))}`,
      group: 'Tu grupo',
      groupLine: (n: number, time: string | null, hole: number) => `Grupo ${n}${time ? `, a las ${time}` : ''}, salida por el ${hole}`,
      groupWith: (names: string[]) => `Con ${andList(names)}`,
      noGroup: 'El Comité todavía no arma los grupos.',
      firstTee: 'Primera salida',
      tee: 'Tu tee',
      hcp: 'Tu hándicap de juego',
      owes: 'Te falta pagar',
      money: 'Tus pagos',
      owesLine: (total: string, parts: string[]) => `${total}: ${parts.join(', ')}`,
      paid: 'Ya pagaste todo',
      /** One thing he owes, by kind: «Inscripción $2,500». */
      part: (label: string, amount: string) => `${label} ${amount}`,
    },
  },
  card: {
    contest: {
      question: { closest: '¿Quién la dejó más cerca?', longDrive: '¿Quién pegó el drive más largo?', greenie: '¿Quién hizo greenie?', sandy: '¿Quién hizo sandy?', custom: '¿Quién ganó?' } as Record<string, string>,
      nobody: 'Nadie',
      many: 'Pueden ser varios',
      hint: 'Se guarda con el hoyo.',
    },
    group: 'Grupo',
    keeping: (pair: string) => `Llevas la tarjeta de: ${pair}`,
    noGroups: 'El Comité todavía no arma los grupos de esta ronda.',
    notInGroup: 'No estás en ningún grupo de esta ronda. Pídele al Comité que te asigne.',
    pickGroup: 'Elige el grupo que vas a capturar.',
    roundNotLive: (n: number) => `El día ${n} todavía no está en juego. El Comité lo inicia desde su consola.`,
    roundFinished: (n: number) => `El día ${n} ya terminó. Solo el Comité puede corregir tarjetas.`,
    correct: 'Corregir',
    ptsGrossCaption: 'pts / golpes',
    /** Units a screen reader hears after a figure of the grid (A11Y-10). */
    unitPoints: (n: number | null) => (n === 1 ? 'punto' : 'puntos'),
    unitNet: 'neto',
    unitStrokes: (n: number | null) => (n === 1 ? 'golpe' : 'golpes'),
    netGrossCaption: 'neto / golpes',
    grossCaption: 'golpes',
    signedReasonTitle: 'Corrección con tarjeta firmada',
    signedReasonHint: 'Hay tarjetas firmadas en este grupo. La corrección del Comité necesita una razón y queda en la bitácora.',
    strokes: 'Golpes',
    putts: 'Putts',
    pickedUp: 'Levantó',
    // Each player's controls carry his name: four «Golpes: más» are four identical targets for VoiceOver and Voice Control (A11Y-01).
    strokesOf: (name: string) => `Golpes de ${name}`,
    puttsOf: (name: string) => `Putts de ${name}`,
    pickedUpOf: (name: string) => `Levantó, ${name}`,
    /** What a screen reader hears after a change: whose score, and what it is worth. */
    said: (name: string, strokes: number, putts: number, pickedUp: boolean, pts: string) =>
      `${name}: ${pickedUp ? 'levantó' : `${strokes} ${strokes === 1 ? 'golpe' : 'golpes'}`}, ${putts} ${putts === 1 ? 'putt' : 'putts'}, ${pts}`,
    /** The hole header as it is read out, and announced when the hole changes. */
    /** A half-entered hole that came back after leaving the card (PWA-05). */
    restoredDraft: 'Lo que llevabas capturado en este hoyo sigue aquí. Falta guardarlo.',
    /**
     * A hole someone else saved first (REL-05): the server kept theirs, and
     * this phone's value waits for the player to choose. `who`: who entered
     * theirs (null: unknown); `self`: the player entered his own; `day`: the
     * day, when it is not the one on screen (the question stays on every
     * state of the Tarjeta until it is answered, a closed day included);
     * 'gone': a day the Comité deleted since, which has no number to name.
     */
    conflictTitle: 'Alguien más capturó primero',
    conflictLine: (hole: number, who: string | null, player: string, theirs: string, mine: string, self: boolean, day: number | 'gone' | null = null) =>
      `${day === null ? `Hoyo ${hole}` : day === 'gone' ? `Hoyo ${hole} (día borrado)` : `Día ${day}, hoyo ${hole}`}: ${self ? `${player} ya capturó su hoyo` : who ? `${who} ya capturó a ${player}` : `Alguien más capturó a ${player}`}: ${theirs}. No se guardó lo tuyo: ${mine}.`,
    /** A value in that line: «6», «6 con 3 putts», «levantó», «1 putt». */
    conflictValue: (strokes: number | null, putts: number | null, pickedUp: boolean, withPutts: boolean, puttsOnly: boolean) => {
      const p = `${putts ?? 0} ${putts === 1 ? 'putt' : 'putts'}`
      return puttsOnly ? p : `${pickedUp ? 'levantó' : `${strokes ?? '–'}`}${withPutts ? ` con ${p}` : ''}`
    },
    keepMine: 'Guardar el mío',
    keepTheirs: 'Dejar el suyo',
    conflictAction: (action: string, hole: number, player: string, day: number | 'gone' | null = null) =>
      `${action}: ${day === null || day === 'gone' ? '' : `día ${day}, `}hoyo ${hole}${day === 'gone' ? ' (día borrado)' : ''}, ${player}`,
    /** Under the question on a day that is no longer live: what «Guardar el mío» does then. */
    conflictClosedHint: 'Ese día ya no está en juego: «Guardar el mío» lo manda al Comité, que lo revisa en sus pendientes.',
    holeSpoken: (hole: number, par: number, si?: number | null, yards?: number | null) => `Hoyo ${hole}, par ${par}${si ? `, índice de golpe ${si}` : ''}${yards ? `, ${yards} yardas` : ''}`,
    noStrokes: 'Sin golpes de ventaja',
    save: 'Guardar hoyo',
    savedHole: (n: number) => `Hoyo ${n} guardado`,
    /** A hole the whole group had played, saved again: the card goes back to where the group is (UX-19). */
    correctedHole: (n: number, backTo: number | null) => (backTo == null ? `Hoyo ${n} corregido` : `Hoyo ${n} corregido; seguimos en el ${backTo}`),
    /** The Comité's correction goes to the server at once (a closed day, a signed card): with no signal it is not kept (REL-22). */
    correctionNeedsSignal: 'Sin señal: la corrección no se guardó. Guárdala otra vez cuando haya señal; lo que escribiste sigue aquí.',
    undoNeedsSignal: 'Sin señal: no se deshizo. Inténtalo otra vez cuando haya señal.',
    /** On the button for a moment after a save (MOT-02). */
    savedCheck: 'Guardado',
    /** The snake changed hands with this save (MOT-07). */
    /** `game` is the snake's own label, which names its object too (STRAT-11). */
    snakePasses: (name: string, game: string) => `${game} pasa a ${name}`,
    /** The mark on the row of the one who carries it. */
    snakeHolder: (game: string) => `Tiene ${labelInSentence(game)}`,
    restoredHole: (n: number) => `Hoyo ${n} quedó como estaba`,
    allDefaultsTitle: (n: number) => `¿Guardar el ${n} con todos en par?`,
    allDefaultsHint: 'Acabas de guardar el hoyo anterior y aquí nadie ha cambiado nada. Si fue un doble toque, regresa.',
    allDefaultsBack: 'Regresar',
    allDefaultsConfirm: 'Sí, todos par',
    front: 'Ida',
    back: 'Vuelta',
    groupLine: (day: number, group: number) => `Día ${day}, grupo ${group}`,
    ptsLine: (pts: number, name: string | null) => (name ? `${ptsText(pts)}, ${name}` : ptsText(pts)),
    /** The badge of a player nobody has changed on a hole he hasn't played: the steppers show the par it would save (COPY-10). */
    notCaptured: 'Sin capturar',
    parHere: (par: number) => `par ${par} en su tee`,
    saveLast: 'Guardar y ver la tarjeta',
    grid: 'Ver tarjeta',
    holeView: 'Ver hoyo',
    /** The grid's heading, for a screen reader (A11Y-12). */
    gridHeading: 'La tarjeta completa',
    prev: 'Hoyo anterior',
    next: 'Hoyo siguiente',
    missingHoles: 'Los hoyos sin captura aparecen con un guion.',
    whoHoledLast: '¿Quién embocó al último?',
    whoHoledLastHint: (threshold: number, game: string) => `Dos o más hicieron ${threshold} putts o más en este hoyo: ${labelInSentence(game)} pasa al que embocó al último.`,
    // UX-08: the group that doesn't remember saves the hole all the same; the snake waits for the Comité (Comité › Tarjetas).
    whoHoledLastUnknown: 'No sabemos: que decida el Comité',
    whoHoledLastUnknownHint: (game: string) => `El hoyo se guarda igual. ${game} queda pendiente hasta que el Comité diga quién fue.`,
    markName: MARK_NAMES,
    /** A11Y-10: a score mark as a screen reader says it: «7, doble bogey o peor»; a pick-up is «levantó». */
    markSpoken: (value: string | number, kind: string) => (kind === 'pickup' ? 'levantó' : `${value}, ${(MARK_NAMES[kind] ?? kind)}`),
    weirdTitle: '¿Seguro?',
    weirdFix: 'Corregir',
    weirdConfirm: 'Sí, así fue',
    sign: 'Firmar tarjeta',
    signConfirm: 'Al firmar se bloquea la tarjeta de esa pareja. ¿Todo correcto?',
    signTitle: (pair: string) => `Firmar la tarjeta de ${pair}`,
    /** A marker signs each player's card (UX-23): the button says whose, the confirmation locks only his. */
    signShort: 'Firmar',
    signPlayer: (name: string) => `Firmar la tarjeta de ${name}`,
    signPlayerConfirm: 'Al firmar se bloquea su tarjeta. ¿Todo correcto?',
    signMarkerHint: 'Cada tarjeta la firma otro jugador del grupo, nunca el mismo jugador. Al firmarla se bloquea.',
    signed: 'Tarjeta firmada.',
    stamp: 'Firmada',
    cardSigned: 'Firmada y bloqueada',
    cardUnsigned: 'Sin firmar',
    lockedSigned: 'La tarjeta ya está firmada. Solo el Comité puede corregirla.',
    disputed: 'Discrepancia',
    /**
     * TRUST-14: a hole the Comité decided (a correction, «Aplicar» in Pendientes, a discrepancy it resolved), with
     * its reason; `src/lib/comiteReasons.ts` picks the line. `at` is «Hoyo 7» or «Hoyo 7, Ana».
     */
    corrected: 'Lo revisó el Comité',
    correctionsTitle: 'Lo que revisó el Comité',
    correctionAt: (hole: number, name: string | null) => `Hoyo ${hole}${name ? `, ${name}` : ''}`,
    correctionTyped: (at: string, reason: string) => `${at}: lo corrigió el Comité. «${reason}»`,
    correctionPlain: (at: string) => `${at}: lo corrigió el Comité.`,
    correctionKept: (at: string) => `${at}: el Comité resolvió la discrepancia y dejó el valor que tenía.`,
    correctionRestored: (at: string) => `${at}: el Comité resolvió la discrepancia y regresó el valor anterior.`,
    /** TRUST-14 (0062 `card_history`): how each hole got to what it holds, for everyone in the tournament. */
    history: {
      title: 'Historial de la tarjeta',
      show: 'Ver el historial de la tarjeta',
      hint: 'Cada hoyo que cambió después de capturarse: cada valor, quién lo puso y cuándo.',
      loading: 'Leyendo el historial…',
      none: 'Ningún hoyo cambió después de capturarse.',
      unavailable: 'El historial todavía no está en el servidor.',
      comite: 'el Comité',
      /** «8 abr 2027, 10:41, Ana: 5 golpes, 2 putts», then the Comité's why when there is one. */
      step: (when: string, who: string, what: string, why: string | null) => `${when}, ${who}: ${what}${why ? `. ${why}` : ''}`,
      value: (strokes: number | null, putts: number | null) =>
        `${strokes ?? '—'} ${strokes === 1 ? 'golpe' : 'golpes'}${putts == null ? '' : `, ${putts} ${putts === 1 ? 'putt' : 'putts'}`}`,
      pickedUp: (putts: number | null) => `levantó${putts == null ? '' : `, ${putts} ${putts === 1 ? 'putt' : 'putts'}`}`,
      deleted: 'lo borró',
      typed: (reason: string) => `«${reason}»`,
      kept: 'Resolvió la discrepancia y dejó el valor que tenía',
      restored: 'Resolvió la discrepancia y regresó el valor anterior',
    },
    disputedHint: 'Los hoyos marcados los capturaron dos teléfonos con valores distintos. Vale el último; la firma de la tarjeta lo confirma.',
  },
  /**
   * A tournament's settings this build can't read in full (ARCH-04): a newer build wrote them.
   * The boards, the money and the Comité's setup wait for the update instead of computing the
   * defaults, and a side game it doesn't know is named and left out.
   */
  outdated: {
    title: 'Actualiza la app',
    body: 'Esta versión de la app no puede leer las reglas de este torneo, así que no muestra puntos ni dinero: con reglas que no conoce, saldrían mal.',
    /** For the Comité: what it doesn't recognize («modules.wolf»). */
    detail: (what: string) => `Lo que no reconoce: ${what}`,
    /** A side game of a type this build doesn't know, among the warnings. */
    game: (label: string) => `${label}: esta versión de la app no conoce este juego. Actualiza la app.`,
    /** No money on any screen: a game it doesn't know may move some. */
    money: (labels: string[]) =>
      `Esta versión de la app no conoce ${andList(labels.map((l) => `«${l}»`))}, que ${labels.length > 1 ? 'mueven' : 'mueve'} dinero, así que no muestra el dinero. Actualízala para verlo.`,
    /** A save of the games while the row holds one this build doesn't know: the save would drop it. */
    games: (labels: string[]) => `Esta versión de la app no conoce ${andList(labels.map((l) => `«${l}»`))}: actualízala para cambiar los juegos.`,
    /** A Comité save over a row this build can't read. */
    save: 'Esta versión de la app no puede leer la configuración de este torneo: actualízala para cambiarla.',
  },
  games: {
    more: 'Más sobre los juegos',
    seeRules: 'Cómo se juega cada uno',
    seeMoney: '¿Quién va ganando dinero?',
    tiebreak: 'Desempate',
    tiebreaks: 'Desempates',
    leader: (name: string, figure: string) => `${name}, ${figure}`,
    noResultsHint: 'En cuanto alguien anote un hoyo, aquí aparece quién va ganando.',
    noResults: 'Sin resultados todavía',
    firstPrize: (amount: string) => `${amount} al primero`,
    perDay: (amount: string) => `${amount} por día`,
    perGroup: (amount: string) => `${amount} por grupo`,
    holders: 'La tienen',
    nobodyHolds: 'Nadie la tiene',
    roi: 'rendimiento',
    pointsFigure: (n: number) => ptsText(n),
    puttsFigure: (n: number) => (n === 1 ? '1 putt' : `${n} putts`),
    /** Menos putts: holes saved without putts, left out until captured (MONEY-18). */
    missingPutts: (n: number) => `faltan los putts de ${n === 1 ? '1 hoyo' : `${n} hoyos`}`,
    player: 'Jugador',
    headToHead: 'Cara a cara por grupo',
    unpaired: (names: string) => `Sin pareja: ${names}`,
    auctionPot: 'Pozo',
    sold: (n: number, total: number) => `${n} de ${total} vendidos`,
    owners: 'Dueños',
    invested: 'invirtió',
    unassigned: 'Sin asignar',
    noAuctionYet: 'La subasta todavía no empieza.',
    snakeRule: (n: number, game: string) => `En cada grupo, ${labelInSentence(game)} pasa a quien hace ${n} putts o más en un hoyo. Al final de la ronda cobran todos menos quien se quedó con ${labelInSentence(game)}.`,
    /** The same, on a link to watch «Sin dinero» (STRAT-05): who holds it, never who cashes. */
    snakeRuleNoMoney: (n: number, game: string) => `En cada grupo, ${labelInSentence(game)} pasa a quien hace ${n} putts o más en un hoyo, y se queda con él hasta que otro hace ${n} putts o se acaba la ronda.`,
    snakePending: (hole: number) => `Pendiente en el hoyo ${hole}`,
    snakeSettled: 'Repartida',
    snakeDone: 'Terminada',
    inPlay: (amount: string) => `En juego: ${amount}`,
    snakeInPlay: 'En juego',
    holder: (game: string) => `Tiene ${labelInSentence(game)}`,
    snakeWho: (names: string) => `¿quién embocó al último? (${names})`,
    snakeTo: (name: string) => `pasa a ${name}`,
    noThreePutts: 'Nadie ha hecho tres putts.',
    sidePot: 'Bote aparte',
    fromMain: 'De la bolsa',
    perBet: (amount: string) => `${amount} por apuesta`,
    justForFun: 'Por diversión',
    moneyOfGame: 'Dinero de este juego',
    notEntered: (n: number, total: number) => `Juegan ${n} de ${total}`,
    outdated: 'Esta versión de la app no conoce este juego. Actualiza la app (ciérrala y vuelve a abrirla).',
  },
  player: {
    /** A11Y-10: a hole of the player's card, said whole: «Hoyo 5: 7 golpes, doble bogey o peor, 1 pt»; «Hoyo 5: levantó». */
    holeSpoken: (n: number, gross: number | null, kind: string, pts: number | null) =>
      `Hoyo ${n}: ${gross == null ? 'levantó' : `${gross} ${gross === 1 ? 'golpe' : 'golpes'}, ${(MARK_NAMES[kind] ?? kind)}`}${pts == null ? '' : `, ${pts} ${pts === 1 ? 'punto' : 'puntos'}`}`,
    gross: 'Gross',
    putts: 'Putts',
    strokesShort: 'Ventaja',
    hole: 'Hoyo',
    par: 'Par',
    si: 'SI',
    /** A11Y-22: how «SI» is said; a Spanish voice reads the letters as «sí». */
    siSpoken: 'índice de golpe',
    pts: 'Pts',
    yards: (y: number) => `${y} yd`,
    grossShort: 'Gross',
    netShort: 'Neto',
    puttsShort: 'Putts',
    partner: 'Pareja',
    ownedBy: 'Dueños',
    owns: 'Tiene en la Calcutta',
    noMoneyYet: 'Sin premios todavía.',
    stats: 'Estadísticas',
    birdies: 'Birdies gross',
    netBirdies: 'Birdies netos',
    pars: 'Pares netos',
    bogeys: 'Bogeys netos',
    worse: 'Doble o peor',
    pickups: 'Levantó',
    puttsAvg: 'Putts por hoyo',
    onePutts: 'A un putt',
    threePutts: 'A tres putts',
    snakeHoles: (game: string) => `Hoyos con ${labelInSentence(game)}`,
    /** `figure` already carries its unit (`common.figure`). */
    /** `where` is `where()`'s: how far into which day (COPY-26), or null before the first hole. */
    position: (label: string, figure: string, where: string | null) => `${ordinal(label)}, ${figure}${where ? `, ${where}` : ''}`,
    /** A team format: where his team stands, and its figure. */
    positionTeam: (label: string, team: string, figure: string, where: string | null) => `${ordinal(label)} con ${team}, ${figure}${where ? `, ${where}` : ''}`,
    /**
     * COPY-26: how far he is, on the day he is playing. A count across days read as a hole («por el 26» of 36):
     * «por el 8 del día 2», «terminó el día 1», «terminó»; one day says no day.
     */
    where: (thru: number, holes: number, day: number, days: number, last: boolean) =>
      thru >= holes ? (days > 1 && !last ? `terminó el día ${day}` : 'terminó') : days > 1 ? `por el ${thru} del día ${day}` : `por el ${thru}`,
    handicapLine: (base: number, source: string) => `${source} ${handicapText(base)}`,
    dayHcp: (day: number, ph: number, cut: number) => `día ${day}: ${ph}${cut ? ` (−${cut})` : ''}`,
    round: (day: number, figure: string) => `Día ${day}: ${figure}`,
    grossPutts: (gross: number | null, putts: number) => `${gross != null ? `${gross} golpes, ` : ''}${putts} putts`,
    whyHole: (n: number) => `Hoyo ${n}`,
    /** UX-28: his handicap is not what it was when they were fixed. `fromTo` from `hcpFromTo`. */
    hcpChanged: (fromTo: string) => `Su hándicap cambió después de fijarlos: ${fromTo}.`,
    /** One change, with the Comité's reason. */
    hcpChange: (when: string, reason: string) => `${when}: «${reason}»`,
  },
  more: {
    /** MOT-10: the Tarjeta's vibration, on this phone only. */
    haptics: 'Vibrar al capturar',
    /** `game`: the snake's label when the tournament plays it (STRAT-11). */
    hapticsHint: (game: string | null) => `Un toque corto en cada número y al guardar un hoyo, más largo en un birdie${game ? ` o si pasa ${labelInSentence(game)}` : ''}. Solo en este teléfono.`,
    title: 'Más',
    rules: 'Reglamento',
    stats: 'Estadísticas y premios',
    ceremony: 'Ceremonia',
    tv: 'Modo TV',
    install: 'Instalar la app',
    whoAmI: 'Entraste como',
    organizer: 'Organizador',
    admin: 'Consola del Comité',
    exit: 'Salir de este torneo',
    version: 'Versión',
    saveProfile: 'Guarda tu perfil',
    saveProfileHint: 'Tu historial y tu índice en cualquier teléfono.',
    saveHere: 'Guardar este torneo en mi perfil',
    savedHere: 'Guardado en tu perfil',
    notMeBody: (name: string) => `Tu perfil deja de ser ${name} en este torneo. Para volver, entra con su PIN.`,
    // UX-09: one tap at the bottom of Más used to drop the player mid-round.
    switchBody: (name: string) => `Este teléfono deja de ser ${name} en este torneo. Para volver, entra con su PIN.`,
  },
  admin: {
    title: 'Comité',
    /** «Para empezar» (UX-06): what the tournament still needs before the first tee. */
    /** MONEY-13: settings that parse but make no sense; each refuses the save (engine/settings/sense.ts). */
    sense: {
      cap: 'El tope de hándicap es 0: nadie recibe golpes. Para jugar scratch, pon 0 % de hándicap.',
      cutMax: (max: number) => `El recorte de hándicap llega hasta ${max} golpes por día.`,
      houseCut: (cut: string, pot: string) => `Los gastos del grupo se llevan ${cut} y las inscripciones suman ${pot}.`,
      placeTwice: (place: string) => `Dos casillas de la Calcutta pagan lo mismo: ${place}.`,
      placeUnreachable: (place: string, field: string) => `La Calcutta paga el ${place} lugar y hay ${field}: nadie lo puede ganar.`,
      tierTwice: (tier: string) => `Dos casillas de la Calcutta pagan al mejor de la categoría ${tier}.`,
      lastTwice: (label: string) => `Dos casillas de la Calcutta pagan a ${label}.`,
      buyback: (max: number) => `La recompra llega hasta la mitad: ${max} %.`,
      currency: (c: string) => `Polo cuenta en pesos mexicanos (MXN), no en ${c}.`,
      timezone: (zone: string) => `La zona horaria «${zone}» no existe.`,
      signingPairs: (game: string) => `Las tarjetas las firman las parejas, pero ${game} está apagado: en Reglas, elige quién firma.`,
      /** Not an error: said beside the allowance, so a scratch event is never one by accident. */
      scratch: 'Con 0 % nadie recibe golpes: se juega scratch.',
      /** Near Guardar and Crear. */
      nearSave: 'Corrige esto antes de guardar:',
    },
    ready: {
      title: 'Para empezar',
      hint: 'Lo que falta para el primer tee. Toca una línea para ir a su sección.',
      titleNext: (day: number) => `Antes del día ${day}`,
      hintNext: (day: number) => `Lo que falta para el día ${day}. Toca una línea para ir a su sección.`,
      doneLabel: 'Listo',
      todoLabel: 'Pendiente',
      /** `what`: the lines it checked, from `checked` (andList). */
      allSet: (what: string) => `Listo para jugar: ${what}.`,
      checked: { players: 'jugadores', pins: 'PIN', handicaps: 'hándicaps', rounds: 'rondas', roundSetup: 'rondas', card: 'campo', foreignTees: 'tees', teams: 'equipos', pairs: 'parejas', bracket: 'cuadro', tees: 'tees', groups: 'grupos' },
      day: (n: number) => `día ${n}`,
      players: (n: number) => `${n} jugadores dados de alta`,
      playersMissing: 'Da de alta a los jugadores (al menos 2)',
      pins: 'Todos tienen PIN para entrar',
      pinsMissing: (n: number) => (n === 1 ? 'A 1 jugador le falta su PIN' : `A ${n} jugadores les falta su PIN`),
      handicaps: 'Hándicaps fijados',
      handicapsMissing: 'Revisa los hándicaps y fíjalos (abrir la subasta o empezar a jugar los fija solo)',
      rounds: (n: number) => (n === 1 ? '1 ronda creada' : `${n} rondas creadas`),
      roundsMissing: (n: number) => (n === 1 ? 'Falta crear 1 ronda' : `Faltan ${n} rondas por crear`),
      roundsCancelled: (n: number) => (n === 1 ? 'La ronda está cancelada: vuelve a programarla' : 'Todas las rondas están canceladas: vuelve a programar una'),
      roundsExtra: (n: number, days: number, extra: number) => `${n} rondas para un torneo de ${days} ${days === 1 ? 'día' : 'días'}: sube los días en Reglas o borra ${extra === 1 ? 'la que sobra' : `las ${extra} que sobran`}`,
      roundSetup: 'Cada ronda tiene campo y fecha',
      roundSetupMissing: (days: string) => `Falta campo o fecha: ${days}`,
      card: 'El campo de cada ronda tiene su tarjeta',
      cardMissing: (days: string) => `Falta la tarjeta del campo (par e índice de golpe): ${days}`,
      cardBlank: (days: string) => `Captura la tarjeta (sigue en par 4 en todos los hoyos): ${days}`,
      cardNoIndex: (days: string) => `Captura el índice de golpe de cada hoyo: ${days}`,
      cardNine: (days: string) => `Cambia la ronda a 9 hoyos (el campo tiene 9): ${days}`,
      teesForeign: (days: string) => `Cambia los tees de otro campo: ${days}`,
      teams: (n: number) => (n === 1 ? '1 equipo armado' : `${n} equipos armados`),
      teamsMissing: 'Arma los equipos',
      teamsLoose: (n: number) => (n === 1 ? '1 jugador sin equipo' : `${n} jugadores sin equipo`),
      pairs: (n: number) => (n === 1 ? '1 pareja armada' : `${n} parejas armadas`),
      pairsMissing: 'Arma las parejas del fourball',
      pairsLoose: (n: number) => (n === 1 ? '1 jugador sin pareja' : `${n} jugadores sin pareja`),
      /** Under fourball a team that isn't two players (teams of 4 from a team format, the odd one of a draw). */
      pairsNotTwo: (n: number) => (n === 1 ? '1 equipo no es pareja: el fourball se juega en parejas de 2' : `${n} equipos no son parejas: el fourball se juega en parejas de 2`),
      bracketDays: (needed: number, days: number) => `El cuadro necesita ${needed} rondas y el torneo es de ${days} ${days === 1 ? 'día' : 'días'}: sube los días a ${needed} en Reglas`,
      bracketUndecided: (round: string, n: number, day: number) => `${round}: ${n === 1 ? 'un partido quedó' : `${n} partidos quedaron`} sin ganador. Decide quién pasa y arma los grupos del día ${day}`,
      tees: (day: number) => `Todos tienen tee para el día ${day}`,
      teesMissing: (n: number, day: number, tee: string) => (n === 1 ? `1 jugador sin tee para el día ${day}: saldría desde ${tee}` : `${n} jugadores sin tee para el día ${day}: saldrían desde ${tee}`),
      groups: (day: number) => `Grupos del día ${day} listos`,
      groupsMissing: (day: number) => `Arma los grupos del día ${day}`,
      groupsPartial: (n: number, day: number) => (n === 1 ? `1 jugador sin grupo el día ${day}` : `${n} jugadores sin grupo el día ${day}`),
      groupsMatches: (n: number, day: number) => (n === 1 ? `Arma el grupo de 1 partido del día ${day}` : `Arma los grupos de ${n} partidos del día ${day}`),
    },
    sections: {
      tournament: 'Torneo',
      players: 'Jugadores',
      courses: 'Campos',
      rounds: 'Rondas',
      groups: 'Grupos',
      handicaps: 'Hándicaps',
      scores: 'Tarjetas',
      auction: 'Calcutta',
      draw: 'Parejas',
      teams: 'Equipos',
      games: 'Juegos',
      payments: 'Pagos',
      data: 'Datos',
      history: 'Historial',
    },
    history: {
      hint: 'Cada cambio del torneo: quién, cuándo y qué. Lo que corrige el Admin de Polo aparece marcado, y también cuándo lo abrió y por qué.',
      empty: 'Sin cambios todavía.',
      /**
       * What the Admin de Polo did about the tournament as a whole (0068, TRUST-22): opened it from his panel (with
       * his reason) or by its link (with none), unlocked or locked it, changed its protection or its Comité.
       */
      operator: {
        line: {
          view: 'El Admin de Polo abrió este torneo',
          unlock: 'El Admin de Polo lo desbloqueó para corregirlo',
          relock: 'El Admin de Polo lo volvió a bloquear',
          protect: 'El Admin de Polo lo protegió',
          unprotect: 'El Admin de Polo le quitó la protección',
          set_organizer: 'El Admin de Polo cambió quién es del Comité',
        } as Record<string, string>,
        viewLink: 'El Admin de Polo abrió este torneo desde su enlace, sin escribir motivo',
        other: 'El Admin de Polo hizo un cambio',
        until: (time: string) => `hasta las ${time}`,
      },
      more: 'Ver más',
      platformOnly: 'Solo Admin de Polo',
      byPlatform: 'Admin de Polo',
      byComite: 'Comité',
      system: 'Polo',
      what: {
        INSERT: 'agregó',
        UPDATE: 'cambió',
        DELETE: 'borró',
      } as Record<string, string>,
      /** «Diego, hoyo 3: de 5 a 4»; just the value when it is new, «se borró (era 5)» when it went. */
      scoreLine: (player: string, hole: string, before: string | null, after: string | null) =>
        `${player}, hoyo ${hole}${before != null && after != null ? `: de ${before} a ${after}` : after != null ? `: ${after}` : before != null ? `: se borró (era ${before})` : ''}`,
      /** One field of a change, in its detail: «de 5 a 4». */
      change: (before: string, after: string) => `de ${before} a ${after}`,
      fields: 'Qué cambió',
      detail: 'Detalle del cambio',
      reason: (r: string) => `Motivo: ${r}`,
      /** TRUST-19 (0063): the history narrowed on the server, so «Ver más» pages what the filters leave. */
      filter: {
        player: 'Jugador',
        round: 'Día',
        hole: 'Hoyo',
        all: 'Todos',
        corrections: 'Solo correcciones del Comité',
        clear: 'Quitar filtros',
        none: 'Nada con estos filtros.',
        holeStory: 'Ver la historia de este hoyo',
      },
      /** Each column of a change by its name in Spanish (TRUST-19); a column without one shows as it is. */
      field: {
        strokes: 'Golpes',
        putts: 'Putts',
        picked_up: 'Levantó',
        entered_by: 'Capturó',
        reason: 'Motivo',
        disputed: 'Discrepancia',
        previous: 'Valor anterior',
        player_id: 'Jugador',
        round_id: 'Día',
        hole: 'Hoyo',
        group_id: 'Grupo',
        number: 'Número',
        tee_time: 'Hora de salida',
        start_hole: 'Hoyo de salida',
        playing_hcp: 'Hándicap de juego',
        by: 'Quién',
        at: 'Cuándo',
        full_name: 'Nombre completo',
        display_name: 'Nombre corto',
        tier: 'Categoría',
        base_hcp: 'Hándicap base',
        handicap_source: 'De dónde sale su hándicap',
        handicap_index: 'Índice',
        estimate_inputs: 'Sus tres rondas',
        default_tee_id: 'Tee',
        is_honoree: 'Homenajeado',
        is_admin: 'Puede usar el Comité',
        avatar_url: 'Foto',
        form_guide: 'Forma reciente',
        profile_status: 'Perfil',
        name: 'Nombre',
        player1_id: 'Jugador 1',
        player2_id: 'Jugador 2',
        kind: 'Tipo',
        picked_by_honoree: 'La eligió el homenajeado',
        drawn_at: 'Sorteo',
        lot_id: 'Lote',
        bidder_id: 'Pujó',
        amount: 'Monto',
        pct: 'Porcentaje',
        paid: 'Pagado',
        lot_number: 'Número de lote',
        status: 'Estado',
        price: 'Precio',
        owner_id: 'Dueño',
        sold_at: 'Vendido',
        pair_id: 'Pareja',
        signed_by: 'Firmó',
        signed_at: 'Firmada',
        game_id: 'Juego',
        share: 'Parte',
        decided_by: 'Decidió',
        last_holed_player_id: 'Embocó al último',
        team_id: 'Equipo',
        from_player_id: 'Paga',
        to_player_id: 'Recibe',
        note: 'Nota',
        source_key: 'De qué dinero',
        voided_at: 'Anulada',
        void_reason: 'Por qué se anuló',
        tee_id: 'Tee',
        course_id: 'Campo',
        date: 'Fecha',
        holes: 'Hoyos',
        slug: 'Dirección',
        tagline: 'Lema',
        logo_url: 'Logo',
        accent_color: 'Color',
        join_code: 'Código',
        current_round_id: 'Día en juego',
        settings: 'Ajustes',
        banker_player_id: 'Banquero',
        timezone: 'Zona horaria',
        currency: 'Moneda',
        counts_for_stats: 'Cuenta para las estadísticas',
        quick: 'Ronda rápida',
        crew_id: 'Crew',
        is_protected: 'Protegido',
        handicaps_locked_at: 'Hándicaps fijados',
        adults_confirmed_at: 'Mayores de edad, confirmado',
        message: 'Pedido',
        done_at: 'Hecho',
        platform: 'Teléfono',
        claimed_at: 'Desde',
        released_at: 'Hasta',
        role: 'Papel',
        sort_order: 'Orden',
        /** DB-13 (0064): a PIN line says a PIN was set, never which; a published result says how many. */
        pin: 'PIN',
        locked: 'Bloqueado',
        players: 'Jugadores',
        nets: 'Netos publicados',
        url: 'Archivo',
      } as Record<string, string>,
      /** How a value reads in a change's detail (TRUST-19): names for ids, words for flags. */
      value: {
        yes: 'sí',
        no: 'no',
        none: '—',
        /** An id the boards no longer hold (a row since deleted). */
        other: 'otro registro',
        image: 'una imagen',
        changed: 'cambiaron',
        day: (n: number) => `día ${n}`,
        group: (n: number) => `grupo ${n}`,
        team: (n: number) => `equipo ${n}`,
        lot: (n: number, player: string | null) => `lote ${n}${player ? `, ${player}` : ''}`,
        tee: (course: string, tee: string) => `${course}, ${tee}`,
        /** A hole's earlier value (scores.previous): «5 golpes, 2 putts, de Ana». */
        previous: (value: string, who: string | null) => `${value}${who ? `, de ${who}` : ''}`,
        lotStatus: { pending: 'por subastar', open: 'en subasta', sold: 'vendido' } as Record<string, string>,
        source: { index: 'su índice', estimate: 'tres rondas', manual: 'a mano' } as Record<string, string>,
        /** DB-13 (0064): which PIN a line is about, the one before or the one that replaced it. */
        pin: { old: 'el anterior', new: 'uno nuevo' } as Record<string, string>,
      },
      /**
       * Which of the player's phones made the change, once he has entered with his PIN on more than one (TRUST-24):
       * «teléfono 2 de 2, Android». On an iPhone, Safari and the app on the home screen count as two.
       */
      phone: (n: number, of: number, kind: string | null) => `teléfono ${n} de ${of}${kind ? `, ${kind}` : ''}`,
      /** A phone's kind, as the server read it from the phone (0050); «other» says nothing. */
      kinds: { ios: 'iPhone', android: 'Android', desktop: 'computadora' } as Record<string, string>,
      /** A PIN claim's line (pin_claims): a phone took the player, let go of him, or the Comité took it off. */
      claim: {
        took: (player: string, from: string) => `${player} entró con su PIN ${from}`,
        from: { ios: 'desde un iPhone', android: 'desde un Android', desktop: 'desde una computadora', other: 'desde un teléfono' } as Record<string, string>,
        left: (player: string) => `Un teléfono dejó de entrar como ${player}`,
        removed: (player: string) => `El Comité sacó del torneo un teléfono que entraba como ${player}`,
        /** SEC-04 (0056): the Comité opened a locked PIN to new phones again, the PIN unchanged. */
        unlocked: (player: string) => `El Comité desbloqueó el PIN de ${player}`,
        /** DB-13 (0064): a PIN set for the first time, or a new one in place of the last. */
        pinSet: (player: string) => `${player} ya tiene PIN`,
        pinChanged: (player: string) => `${player} tiene un PIN nuevo`,
      },
      /** DB-13 (0064): the results on everyone's profile, published, published again, or withdrawn by leaving Terminado. */
      results: {
        INSERT: 'Se publicaron los resultados',
        UPDATE: 'Se volvieron a publicar los resultados',
        DELETE: 'Se retiraron los resultados publicados',
      } as Record<string, string>,
    },
    games: {
      hint: 'Quién entra en cada juego y los partidos. Los juegos se agregan o quitan en Torneo.',
      none: 'Este torneo no tiene juegos aparte. Agrégalos en Torneo.',
      who: 'Quién juega',
      everyone: 'Todos',
      some: 'Solo algunos',
      playing: (n: number, total: number) => `Juegan ${n} de ${total}`,
      matches: 'Partidos',
      noMatches: 'Sin partidos todavía.',
      addMatch: 'Agregar partido',
      singles: 'Uno contra uno',
      pairs: 'Parejas',
      /** A11Y-22: the singles/pairs switch's name. */
      matchKind: 'Modalidad',
      sideA: 'Lado A',
      sideB: 'Lado B',
      pick: 'Elige',
      removeMatch: 'Quitar partido',
      contestHoles: 'Hoyos del concurso',
      dayHole: (day: number, hole: number) => `Día ${day}, hoyo ${hole}`,
      disputed: (names: string) => `En disputa: ${names}`,
      open: 'Sin ganador todavía',
      claims: (names: string) => `Los grupos marcaron: ${names}`,
      useGroups: 'Lo que marcaron los grupos',
      saveWinner: 'Guardar ganador',
      saveNobody: 'Nadie ganó',
      winners: 'Ganadores',
      saveWinners: (n: number) => (n === 1 ? 'Guardar ganador' : `Guardar ${n} ganadores`),
      clearWinners: 'Quitar ganadores',
      saveMatch: 'Guardar partido',
      incomplete: 'Elige a todos los jugadores; nadie puede estar en los dos lados.',
      vs: 'contra',
      money: {
        none: 'Sin dinero',
        main: (amount: string) => `${amount} de la bolsa principal`,
        side: (amount: string) => `Bote aparte: ${amount} por jugador`,
        direct: (amount: string) => `Directo entre jugadores: ${amount}`,
      },
    },
    sectionsLabel: 'Secciones del Comité',
    inbox: {
      title: 'Pendientes',
      /** A tab's badge, to a screen reader. */
      count: (n: number) => (n === 1 ? '1 pendiente' : `${n} pendientes`),
      none: 'Nada pendiente.',
      tiebreak: (group: number, hole: number, game: string) => `${game}, grupo ${group}, hoyo ${hole}`,
      // UX-22: an answer given by the wrong thumb can be changed; the change stays in Historial.
      answeredTitle: (game: string) => `Desempates de ${labelInSentence(game)}`,
      answeredHint: 'Quién embocó al último en cada empate de 3 putts. Si alguien contestó mal, cámbialo aquí; el cambio queda en el historial.',
      answeredSub: (day: string, who: string, by: string | null) => `${day}. Embocó al último: ${who}. Lo dijo ${by ?? 'el Comité'}.`,
      change: 'Cambiar',
      changeTitle: (group: number, hole: number) => `Grupo ${group}, hoyo ${hole}: ¿quién embocó al último?`,
      changeHint: (game: string) => `Toca a quien de verdad embocó al último. ${game} y su dinero se recalculan desde ese hoyo.`,
      dispute: (name: string, hole: number) => `Discrepancia, ${name}, hoyo ${hole}`,
      unsigned: (pair: string) => `Tarjeta sin firmar, ${pair}`,
      incomplete: (n: number) => `${n} tarjeta${n === 1 ? '' : 's'} sin terminar`,
      // MONEY-18: holes saved with strokes and no putts; the games that pay on putts wait for them.
      missingPutts: (name: string, holes: number[]) => `Faltan los putts de ${name}: ${holes.length === 1 ? 'hoyo' : 'hoyos'} ${andList(holes.map(String))}`,
      missingPuttsWhy: (games: string[]) => `${andList(games)} no ${games.length === 1 ? 'los cuenta' : 'los cuentan'} hasta que se capturen.`,
      warning: 'Aviso',
      view: 'Ver',
      rejectedTitle: 'Capturas rechazadas por el servidor',
      /** On a Comité device, which can send them again. */
      rejectedHint: 'Este teléfono intentó guardar esto y el servidor no lo aceptó. Revísalo y vuélvelo a mandar, o descártalo.',
      /** On a player's phone: the list lives only there, so the Comité learns of it from the player. */
      rejectedHintPlayer: 'Este teléfono intentó guardar esto y el servidor no lo aceptó. Solo está en este teléfono: mándaselo al Comité, y descártalo cuando te confirme que lo capturó.',
      /** Every line can go again now (the day live, the card unsigned, this phone's player in that group): checked against what the card holds now. */
      rejectedHintResend: 'Este teléfono intentó guardar esto y el servidor no lo aceptó. Ahora sí se puede volver a mandar: compara cada línea con lo que ya tiene la tarjeta y vuelve a mandar lo que siga siendo correcto, o descártalo.',
      /** Some lines can go again and some can't: both instructions. */
      rejectedHintMixed: 'Este teléfono intentó guardar esto y el servidor no lo aceptó. Lo que tiene «Volver a mandar» ya se puede mandar otra vez: compáralo con lo que ya tiene la tarjeta. Lo demás solo está en este teléfono: mándaselo al Comité, y descártalo cuando te confirme que lo capturó.',
      /** «día 2, hoyo 11»; a day deleted since says so. */
      dayHole: (day: number | null, hole: number) => (day === null ? `hoyo ${hole} de un día que ya no existe` : `día ${day}, hoyo ${hole}`),
      rejectedScore: (name: string, where: string, value: string) => `${name}, ${where}: ${value}`,
      /** What a refused hole held: «5 golpes, 2 putts», «levantó, 1 putt». */
      scoreValue: (strokes: number | null, putts: number | null, pickedUp: boolean) => {
        const shots = pickedUp ? 'levantó' : strokes === null ? 'sin golpes' : `${strokes} golpe${strokes === 1 ? '' : 's'}`
        return putts === null ? shots : `${shots}, ${putts} putt${putts === 1 ? '' : 's'}`
      },
      rejectedTiebreak: (group: number, where: string, name: string, game: string) => `${game}, grupo ${group}, ${where}: ${name}`,
      rejectedSignature: (pair: string, day: number | null) => (day === null ? `Firma de ${pair}, de un día que ya no existe` : `Firma de ${pair}, día ${day}`),
      rejectedAward: (game: string, where: string, names: string) => `${game}, ${where}: ${names}`,
      /** The state of the tournament now (what was true when the server refused it isn't known here). */
      reasonClosed: (day: number) => `El día ${day} está cerrado.`,
      reasonSigned: 'La tarjeta está firmada.',
      /** The day is live and the card unsigned, but this phone's player is no longer in that group that day. */
      reasonNotInGroup: (day: number) => `Ya no juegas en ese grupo el día ${day}.`,
      /** A refused hole the card now holds differently: resending it would replace this. */
      nowOnCard: (value: string) => `En la tarjeta ahora: ${value}`,
      discardTitle: '¿Descartar esta captura?',
      discardBody: 'Solo está en este teléfono. Descártala cuando el Comité te confirme que la capturó.',
      /** When the phone can neither share nor copy: the text, to copy by hand or show. */
      sendManual: 'Cópialo o enséñale esta pantalla al Comité.',
      resend: 'Volver a mandar',
      discard: 'Descartar',
      sendToComite: 'Mandar al Comité',
      sendCopied: 'Copiado: pégalo en el chat del Comité.',
      /** The first line of what «Mandar al Comité» sends; one line per capture follows. */
      sendHeader: (tournament: string, who: string | null) => (who ? `${tournament}: esto no se subió desde el teléfono de ${who}.` : `${tournament}: esto no se subió desde este teléfono.`),
      /**
       * A hole save_hole refused and kept for the Comité (0026, 0028): the Comité sees it in «Pendientes de revisar».
       * `who` null: the phone's own player's.
       */
      leftForComite: (hole: number, who: string | null) =>
        who ? `El hoyo ${hole} de ${who} quedó para el Comité: ya lo ve en su lista de pendientes.` : `Tu hoyo ${hole} quedó para el Comité: ya lo ve en su lista de pendientes.`,
    },
    /** «Pendientes de revisar»: holes the server kept for the Comité (REL-08, 0028). */
    serverInbox: {
      title: 'Pendientes de revisar',
      hint: 'Hoyos que el servidor no tomó: llegaron con el día cerrado o la tarjeta firmada, de un teléfono fuera del grupo, o con valores imposibles; también el par que la Tarjeta pone sola, cuando es lo único que llegó para un hoyo vacío. Aplica lo que mandó el teléfono o descártalo; las dos cosas piden motivo y quedan en el Historial. Cuando dos teléfonos guardan el mismo hoyo, el que llegó después pregunta en su Tarjeta «Guardar el mío» o «Dejar el suyo», aunque el día ya esté cerrado, hasta que alguien conteste en ese teléfono; si guarda el suyo con el día cerrado, llega aquí.',
      none: 'Nada por revisar: el servidor tomó todo lo que mandaron los teléfonos.',
      unavailable: 'Esta lista llega con la próxima actualización del servidor. Mientras, revisa las tarjetas abajo; no detiene el cierre del torneo.',
      retry: 'Volver a cargar',
      /** «Beto, día 1, hoyo 14». */
      where: (name: string, where: string) => `${name}, ${where}`,
      sent: (value: string, who: string | null) => (who ? `Mandó ${value}, desde el teléfono de ${who}.` : `Mandó ${value}.`),
      sentUnreadable: 'Lo que mandó no se entiende.',
      /** An untouched default (`auto`), listed because nothing else was sent for that empty hole. */
      untouched: 'Era el par que la Tarjeta pone sola, sin que nadie lo cambiara; es lo único que llegó para ese hoyo.',
      why: {
        round_not_live: 'El día no estaba en juego.',
        card_signed: 'La tarjeta ya estaba firmada.',
        not_in_group: 'Ese teléfono no jugaba en su grupo.',
        invalid: 'Los valores no eran válidos.',
      } as Record<string, string>,
      now: (value: string) => `En la tarjeta ahora: ${value}.`,
      nowEmpty: 'En la tarjeta ahora: sin captura.',
      wouldBe: (value: string) => `Si se aplica: ${value}.`,
      matches: 'La tarjeta ya tiene este valor: puedes descartarlo.',
      cannotApply: 'Esto no se puede aplicar: descártalo y, si hace falta, corrige el hoyo en la tarjeta de abajo.',
      apply: 'Aplicar',
      dismiss: 'Descartar',
      applyTitle: 'Aplicar lo que mandó el teléfono',
      applyBody: (where: string, value: string) => `${where} queda en ${value}. El motivo se guarda con la corrección.`,
      dismissTitle: 'Descartar lo que mandó el teléfono',
      dismissBody: (where: string) => `${where}: la tarjeta no cambia. El motivo queda en el Historial.`,
      dismissMatching: (n: number) => `Descartar los que ya coinciden (${n})`,
      dismissMatchingTitle: 'Descartar los que ya coinciden',
      dismissMatchingBody: (n: number) => `${n === 1 ? 'Un hoyo ya tiene' : `${n} hoyos ya tienen`} en la tarjeta lo que mandó el teléfono. Se descartan con el mismo motivo; la tarjeta no cambia.`,
      matchingReason: 'La tarjeta ya tiene ese valor',
      applied: 'Aplicado.',
      dismissed: 'Descartado.',
      /** Some of a bulk dismissal went and some did not. */
      partly: (done: number, total: number) => `Se descartaron ${done} de ${total}. Revisa los que quedan.`,
    },
    groups: {
      fromStandings: 'Generar por tabla de parejas',
      randomPairs: 'Sorteo de parejas',
      randomPlayers: 'Sorteo de jugadores',
      addGroup: 'Grupo',
      addPlayer: 'Jugador',
      teeTime: 'Hora de salida',
      startHole: 'Hoyo de salida',
      startAt: (n: number) => `Salida por el ${n}`,
      warnIncomplete: 'Este grupo no está formado por parejas completas.',
      warnKinds: (kinds: string) => `Este grupo no es una pareja ${kinds}. Se respeta el orden de la tabla, pero revísalo.`,
      unassigned: (names: string) => `Sin grupo: ${names}`,
      /**
       * COPY-25: from the groups «Generar por tabla de parejas» makes, by places in the pair standings, in tee order
       * (`generateGroupsFromStandings`): six pairs give «salen primero las parejas 5.ª y 6.ª, luego 3.ª y 4.ª, y
       * cierran 1.ª y 2.ª». It said that for every tournament, however many pairs it had.
       */
      standingsHint: (groups: number[][]) => {
        const places = (g: number[]) => andList(g.map((n) => `${n}.ª`))
        if (groups.length < 2) return `Por la tabla de parejas: ${groups.length ? `${groups[0]!.length === 1 ? 'la pareja' : 'las parejas'} ${places(groups[0]!)} salen juntas` : 'todavía no hay parejas'}.`
        const middle = groups.slice(1, -1).map((g) => `luego ${places(g)}`)
        const last = groups.at(-1)!
        return `Por la tabla de parejas: salen primero ${groups[0]!.length === 1 ? 'la pareja' : 'las parejas'} ${places(groups[0]!)}, ${[...middle, `y ${last.length === 1 ? 'cierra la' : 'cierran'} ${places(last)}`].join(', ')}.`
      },
      discardDrafts: 'Tienes cambios sin guardar en este día. ¿Descartarlos?',
      unsavedChip: 'Sin guardar',
      unassignedFirst: 'Sin grupo',
      members: (n: number, size: number) => `${n} de ${size}`,
    },
    handicaps: {
      hint: 'Revisa el hándicap de juego de cada día. El recorte del día 2 sale de los puntos del día 1. Un ajuste del Comité necesita razón y queda en la bitácora.',
      base: 'Base',
      course: 'Campo',
      cut: 'Recorte',
      override: 'Ajuste del Comité',
      /** Inside a player's line, after a comma: the Comité keeps its capital (COPY-23: the line lowered the whole label). */
      overrideInLine: 'ajuste del Comité',
      /** The day before's points, in a player's line: «28 pts el día 1» (it read «día 1 28 pts»). */
      prevDay: (points: number, day: number) => `${ptsText(points)} el día ${day}`,
      overrideHint: 'Sustituye el hándicap de juego de este jugador solo para este día.',
      reason: 'Razón',
      reasonPlaceholder: 'p. ej. Jugó de rojas',
      noRounds: 'Sin rondas todavía. Agrega el día 1 en Rondas y aquí aparecerá el hándicap de juego de cada jugador.',
      plays: 'Juega',
    },
    scores: {
      invalidStrokes: 'Los golpes van de 1 a 15.',
      invalidPutts: 'Los putts van de 0 a los golpes.',
      /** A hole tile saved with strokes and no putts (MONEY-18): what to fill. */
      noPutts: 'sin putts',
      disputesTitle: 'Discrepancias',
      disputesHint: 'Dos teléfonos capturaron valores distintos para el mismo hoyo. Vale el último; decide cuál se queda.',
      /** COPY-20: a discrepancy in words, each value with who captured it (nobody named: the Comité's own write). */
      disputeNow: (value: string, who: string | null) => `Ahora: ${value} (capturó ${who ?? 'el Comité'}).`,
      disputeBefore: (value: string, who: string | null) => `Antes: ${value} (capturó ${who ?? 'el Comité'}).`,
      keepCurrent: 'Dejar el actual',
      restorePrevious: 'Volver al anterior',
      restoreReason: 'Se restaura el valor anterior (discrepancia)',
      unsign: 'Quitar firma',
      unsignConfirm: '¿Quitar la firma de esta tarjeta? Se podrá volver a editar.',
      reason: 'Razón de la corrección',
      reasonHint: 'La tarjeta está firmada: la corrección necesita razón y queda en la bitácora.',
      noRounds: 'Sin rondas todavía. Las tarjetas aparecen cuando hay una ronda.',
      noPlayers: 'Sin jugadores todavía.',
      noCard: 'Este jugador no tiene tarjeta en esta ronda.',
      player: 'Jugador',
      groupOf: (n: number) => `Grupo ${n}`,
      noGroup: 'Sin grupo',
      signedLine: 'Firmada',
    },
    data: {
      publish: 'Resultados en los perfiles',
      publishHint: 'Se publican solos al marcar el torneo como Terminado. Si corriges algo después, publícalos otra vez.',
      publishWaiting: 'Las rondas terminadas ya cuentan para el índice de cada jugador. Lugar, puntos y dinero se publican cuando el torneo está Terminado.',
      publishButton: 'Publicar resultados',
      export: 'Respaldo',
      exportHint: 'Descarga todo el torneo (jugadores, rondas, grupos, tarjetas, Calcutta, pagos) como JSON, y las tarjetas y resultados como CSV. Hazlo cada noche del torneo.',
      exportJson: 'Respaldo JSON',
      exportCsv: 'Tarjetas y resultados CSV',
      restore: 'Restaurar',
      restoreHint: 'Sube un respaldo JSON de este mismo torneo. Reemplaza todo lo que hay ahora (los campos no se tocan).',
      restoreButton: 'Restaurar desde JSON…',
      restoreConfirm: (when: string) => `Se reemplazan todos los datos del torneo con el respaldo del ${when}. ¿Seguro?`,
      restored: 'Respaldo restaurado.',
      restoredCount: (players: number, rounds: number, scores: number) => `Respaldo restaurado: ${players} jugadores, ${rounds} rondas, ${scores} hoyos.`,
      wrongTournament: 'Ese respaldo es de otro torneo. Solo se puede restaurar un respaldo de este mismo torneo.',
      badFile: 'Ese archivo no es un respaldo válido.',
      print: 'Tarjetas de papel',
      printHint: 'Por si la app se cae: una tarjeta por grupo con los golpes de ventaja de cada jugador. Imprímelas la noche anterior.',
      printButton: 'Ver tarjetas',
      duplicate: 'Duplicar torneo',
      duplicateHint: 'Copia la configuración, el campo y los jugadores (sin tarjetas ni Calcutta) a un torneo nuevo, por ejemplo para un ensayo.',
      duplicateName: 'Nombre del torneo nuevo',
      duplicateButton: 'Duplicar',
      duplicated: 'Torneo duplicado. Estás en el nuevo.',
    },
    tournament: {
      statusConfirmTitle: (status: string) => `¿Pasar el torneo a «${status}»?`,
      statusConfirmBody: 'Todos los teléfonos lo ven al instante.',
      sections: 'Secciones del torneo',
      tabs: {
        brand: 'Marca',
        status: 'Estado',
        rules: 'Reglas',
        games: 'Juegos',
        money: 'Dinero',
        auction: 'Calcutta',
        danger: 'Zona de peligro',
      },
      countsForStats: 'Cuenta para el índice Polo',
      countsForStatsHint: 'Apágalo en un ensayo: las rondas se ven en los perfiles, pero no mueven el índice.',
      published: (n: number) => `Resultados publicados en ${n === 1 ? '1 perfil' : `los perfiles de ${n} jugadores`}.`,
      publishFailed: 'No se publicaron los resultados:',
      unbalancedNearSave: 'La bolsa no cuadra: ajusta los premios antes de guardar.',
      unreachableNearSave: 'Hay premios que nadie puede ganar: ajústalos antes de guardar.',
      /** update_settings refused a save (ARCH-13): what it read changed on another screen or phone, and nothing was written. */
      settingsChanged: 'Alguien más cambió la configuración mientras tanto y tu cambio no se guardó. Ya ves cómo quedó: vuelve a hacerlo.',
      /** Torneo after that refusal: the draft kept over what the server holds now. */
      settingsMerged: 'Mientras editabas, alguien más guardó cambios en la configuración. Ya los ves aquí junto con los tuyos: revisa y vuelve a guardar.',
      settingsMergedLost: 'Mientras editabas, alguien más cambió lo mismo que tú y quedó lo suyo. Tus demás cambios siguen aquí: revisa y vuelve a guardar.',
      brand: 'Marca',
      name: 'Nombre',
      tagline: 'Lema',
      logo: 'Logo',
      uploadLogo: 'Subir logo',
      /** PERF-01: a logo stored whole, before renditions (or seeded straight into Storage). */
      logoHeavy: 'Este logo está guardado completo y tarda en cargar en los teléfonos. Optimízalo: se ve igual y pesa mucho menos.',
      optimizeLogo: 'Optimizar logo',
      accent: 'Color de acento',
      status: 'Estado',
      /** UX-28: leaving Configuración fixes the base handicaps (0046). */
      statusLocksHandicaps: 'Pasar a Subasta o a En juego fija los hándicaps: después, cambiar uno pide un motivo.',
      joinCode: 'Código para entrar',
      newCode: 'Generar otro código',
      newCodeConfirm: 'El código anterior deja de funcionar. Quien ya entró sigue dentro.',
      invalidNearSave: 'Corrige la configuración antes de guardar.',
      unsaved: 'Cambios sin guardar',
      link: 'Enlace del torneo',
      banker: 'Banquero',
      modules: 'Juegos',
      moduleLabel: 'Nombre en la app',
      /** COPY-25: the first tournament's tiers were in the label; the options name this tournament's. */
      pairingRules: 'Qué categorías van juntas',
      honoreePicks: (label: string) => `${label} escoge pareja`,
      /** UX-23: who signs a card after the last hole; `pairs` is offered only with the pairs game on. */
      cardSigning: 'Quién firma las tarjetas',
      cardSigningOption: { pairs: 'Las parejas, cruzado', marker: 'Otro jugador del grupo', none: 'Nadie firma' } as Record<'pairs' | 'marker' | 'none', string>,
      cardSigningHint: {
        pairs: 'Al terminar el día, cada pareja firma la tarjeta de la otra pareja de su grupo. La firma bloquea la tarjeta: después solo el Comité la corrige, con un motivo.',
        marker: 'Al terminar el día, otro jugador del grupo firma la tarjeta de cada jugador; nadie firma la suya. La firma bloquea esa tarjeta: después solo el Comité la corrige, con un motivo.',
        none: 'Nadie firma: el grupo puede corregir sus hoyos mientras el día esté en juego, y el Comité después.',
      } as Record<'pairs' | 'marker' | 'none', string>,
      perRoundSlope: 'Ajustar hándicap por slope de cada ronda',
      perRoundSlopeHint: 'Apagado: un solo hándicap base para todo el torneo.',
      rules: 'Reglas',
      tiers: 'Categorías, de mejor a peor',
      rounds: 'Rondas',
      groupSize: 'Jugadores por grupo',
      entryFee: 'Inscripción por jugador',
      prizesTitle: 'Premios',
      stablefordPrizes: 'Premios individuales, por lugar',
      pairsPrizes: 'Premios por pareja, por lugar',
      bestRoundPerDay: 'Mejor ronda, por día',
      fewestPutts: 'Menos putts',
      handicap: 'Hándicap',
      allowance: 'Porcentaje de juego',
      cap: 'Tope',
      cutTitle: 'Recorte del día 2',
      /** COPY-25: the cut starts above the threshold (37 with 36), never at it. */
      cutThreshold: 'Recorte si hace más de (puntos)',
      cutPer: 'Puntos por golpe',
      cutMax: 'Máximo de golpes',
      cutMode: 'A partir del día 3',
      cutModePrevious: 'Se calcula con el día anterior',
      cutModeCumulative: 'Los recortes se acumulan',
      payoutTier: 'Categoría',
      auctionTitle: 'Calcutta',
      openingBid: 'Puja inicial',
      increment: 'Incremento',
      maxPerOwner: 'Jugadores por dueño, máximo',
      selfCounts: 'Comprarse a sí mismo cuenta para el máximo',
      buybackMax: 'Recompra máxima (%)',
      auctionPayoutSlots: 'Reparto del pozo, suma 100%',
      /** COPY-25: these name a prize and a role, never a person: En vivo prints «{label}: {name}». */
      lastPlaceLabel: 'Premio al último lugar',
      lastPlaceHint: 'Su nombre, como «La Cuchara de Palo». Con «Último lugar» no hay premio con nombre.',
      honoreeLabel: 'Cómo le dicen al homenajeado',
      honoreeHint: 'Su papel, no su nombre, como «El novio». En vivo va antes de su nombre.',
      trophyLabel: 'Trofeo del campeón',
      trophyHint: 'Lo que se lleva el campeón en la ceremonia, como «el Putter». Vacío: sin trofeo.',
      pickupPutts: 'Putts por hoyo levantado',
      balance: 'Cuadre de la bolsa',
      balanced: 'Cuadra',
      notBalanced: (diff: string) => `No cuadra por ${diff}`,
      unreachableTitle: 'Premios que nadie puede ganar: quita esos lugares o cambia el reparto.',
      sidePots: 'Botes aparte',
      bets: 'Apuestas directas',
      invalid: 'Hay un error en la configuración:',
      playersForCheck: 'Jugadores para el cuadre',
      expectedPlayers: 'Jugadores que esperas',
      expectedPlayersHint: 'Mientras no hay jugadores, la bolsa se revisa con este número.',
      fieldUnknownNearSave: 'Escribe en Dinero cuántos jugadores esperas: con eso se revisa la bolsa.',
      danger: 'Zona de peligro',
      deleteTournament: 'Borrar este torneo',
      deleteConfirm: (name: string) => `Escribe «${name}» para confirmar que quieres borrar el torneo y todos sus datos.`,
      protectedTitle: 'Torneo protegido',
      protectedBody: 'Nadie puede borrarlo, ni tú. Quítale la protección si de verdad quieres borrarlo.',
      unprotectedTitle: 'Proteger este torneo',
      unprotectedBody: 'Para un torneo real: nadie podrá borrarlo por accidente, y el Admin de Polo necesitará desbloquearlo con un motivo para corregir algo.',
      protect: 'Proteger',
      unprotect: 'Quitar protección',
      unprotectReason: 'Motivo para quitarla',
    },
    players: {
      add: 'Agregar jugador',
      profile: 'Perfil',
      linkProfile: 'Amarrar perfil',
      unlinkProfile: 'Quitar',
      profileConfirmed: 'Confirmado',
      profilePending: 'Falta que lo confirme',
      profileHint: 'Si ya tiene perfil en Polo, amárralo: su índice y su historial se juntan.',
      searchProfiles: 'Nombre o usuario',
      withHandle: (h: string) => `Usar @${h}`,
      indexApplied: 'Índice puesto. Guarda para aplicarlo.',
      applyIndex: (idx: string, declared: boolean) => (declared ? `Usar su índice (${idx})` : `Usar índice Polo (${idx})`),
      proposed: 'Listo. Lo confirma desde su perfil.',
      linkedSelf: 'Amarrado a tu perfil',
      /** TRUST-08: a profile starts out of search, so a hidden one is the usual reason; the player can link it himself. */
      noProfile: 'No encontré ese perfil. Si lo tiene oculto, que entre al torneo con su PIN y lo guarde en su perfil, o que prenda «Aparecer en búsquedas».',
      profileTaken: 'Este jugador ya tiene un perfil confirmado.',
      profileElsewhere: 'Ese perfil ya es otro jugador de este torneo.',
      linkedTo: (h: string) => `@${h}`,
      deleteTakes: (partner: string | null, groups: number, payments: number) =>
        `Se borra ${andList(
          [
            'el jugador con su PIN',
            partner ? `su pareja con ${partner}` : '',
            groups ? `su lugar en ${groups} grupo${groups === 1 ? '' : 's'}` : '',
            payments ? `${payments} pago${payments === 1 ? '' : 's'} marcado${payments === 1 ? '' : 's'}` : '',
          ].filter(Boolean),
        )}. No se puede deshacer.`,
      deleteBlocked: (scores: number, sold: boolean) =>
        `No se puede borrar: ${andList([scores ? `tiene ${scores} hoyo${scores === 1 ? '' : 's'} capturado${scores === 1 ? '' : 's'}` : '', sold ? 'está en la Calcutta' : ''].filter(Boolean))}. Si no va a jugar, déjalo sin grupo: sus hoyos cuentan 0.`,
      empty: 'Sin jugadores todavía.',
      emptyHint: 'Agrega a cada jugador con su nombre, categoría y hándicap. El PIN se pone después.',
      search: 'Buscar jugador',
      count: (n: number) => `${n} jugador${n === 1 ? '' : 'es'}`,
      noMatch: 'Nadie con ese nombre.',
      strokesLine: (ranges: string) => `Golpes de ventaja: ${ranges}`,
      fullName: 'Nombre completo',
      displayName: 'Nombre corto',
      tier: 'Categoría',
      honoree: 'Homenajeado',
      admin: 'Puede usar el Comité',
      tee: 'Tee por defecto',
      avatar: 'Foto',
      uploadAvatar: 'Subir foto',
      formGuide: 'Forma reciente',
      pin: 'PIN',
      hasPin: 'Tiene PIN',
      noPin: 'Sin PIN',
      setPin: 'Poner PIN',
      resetPin: 'Cambiar PIN',
      pinSet: 'PIN guardado. Mándaselo por WhatsApp.',
      pinInput: 'PIN de 4 dígitos',
      /** UX-20: PINs made by the app, each player's invite, and the list to read aloud. */
      pins: {
        title: 'PINs e invitaciones',
        missing: (n: number) => (n === 1 ? '1 jugador todavía no tiene PIN.' : `${n} jugadores todavía no tienen PIN.`),
        allSet: 'Todos tienen PIN. Para mandarle la invitación a alguien, toca «Cambiar PIN» en su renglón.',
        generate: 'Generar PINs',
        generateTitle: 'Generar los PINs que faltan',
        generateBody: (n: number) =>
          `${n === 1 ? 'Un PIN' : `${n} PINs`} de cuatro dígitos al azar, uno para cada jugador sin PIN. Se ven solo en la lista que sale después: al cerrarla ya no se pueden volver a ver. Si alguien olvida el suyo, cámbialo.`,
        generating: (done: number, of: number) => `Guardando ${done} de ${of}…`,
        failed: (n: number) => (n === 1 ? 'Un PIN no se guardó: vuelve a intentarlo.' : `${n} PINs no se guardaron: vuelve a intentarlo.`),
        listOpen: (n: number) => `Lista de PINs (${n})`,
        list: 'Lista de PINs',
        listHint: 'Léelos en voz alta o mándale a cada quien el suyo. Al cerrar esta lista ya no se pueden volver a ver.',
        copyList: 'Copiar la lista',
        print: 'Imprimir',
        /** One line of the list as copied: «Ana López: 4821». */
        listLine: (name: string, pin: string) => `${name}: ${pin}`,
        random: 'Generar uno',
        shown: 'Su PIN',
        shownHint: 'Se ve solo ahora: al cerrar ya no se puede volver a ver.',
        invite: 'Invitación',
        inviteHint: 'El enlace abre Entrar con su cara ya elegida. El PIN nunca va en el enlace.',
        whatsapp: 'Mandar por WhatsApp',
        /** The list's own button, beside each PIN; it is said with whose («Mandarle a Ana por WhatsApp»). */
        send: 'Mandar',
        whatsappTo: (name: string) => `Mandarle a ${name} por WhatsApp`,
        copyLink: 'Copiar enlace',
        /** The message the Comité sends: the link, and the PIN when it was just made or typed. */
        invitation: (name: string, tournament: string, url: string, pin: string | null) =>
          `Hola, ${name}: ya estás en ${tournament}. Entra aquí, toca tu cara y escribe tu PIN: ${url}\n${pin ? `Tu PIN: ${pin}` : 'Tu PIN te lo manda el Comité.'}`,
      },
      /** The phones holding a player's PIN (TRUST-24): a row says how many when there are more than one. */
      phonesCount: (n: number) => `en ${n} teléfonos`,
      phones: 'Teléfonos con su PIN',
      phonesHelp:
        'Cada teléfono que entró como este jugador con su PIN. En un iPhone, Safari y la app de la pantalla de inicio cuentan como dos. Cambiar el PIN no saca a los que ya entraron: sácalos aquí.',
      /** «Teléfono 2, iPhone, desde 13 oct 2026, 10:02»: its number is the one Historial names. */
      phoneLine: (n: number, kind: string | null, since: string) => `Teléfono ${n}${kind ? `, ${kind}` : ''}, desde ${since}`,
      removePhone: 'Sacar',
      /** Each «Sacar» names its phone, so a screen reader tells them apart (the visible word stays in the name). */
      removePhoneOf: (n: number) => `Sacar el teléfono ${n}`,
      removePhoneTitle: 'Sacar este teléfono del torneo',
      removePhoneBody:
        'Ese teléfono tendrá que volver a escribir el PIN, y lo que tenga sin mandar espera a que lo escriba. Para que no vuelva a entrar, cambia también el PIN. Queda en el historial con tu motivo.',
      phoneRemoved: 'Teléfono sacado del torneo.',
      /** SEC-04: wrong PINs from phones that never held the player lock it for new phones; his own still get in. */
      pinLocked: 'PIN bloqueado',
      pinLockedLine: (failed: number, time: string) =>
        `${failed} intentos fallidos desde teléfonos nuevos. Ningún teléfono nuevo puede entrar como este jugador hasta las ${time}; los que ya entraron siguen funcionando. Si no fue él, cambia el PIN.`,
      unlockPin: 'Desbloquear',
      pinUnlocked: 'PIN desbloqueado. El PIN no cambió.',
      handicap: 'Hándicap',
      source: 'Cómo se obtiene',
      sourceManual: 'A mano',
      sourceIndex: 'Índice WHS',
      sourceEstimate: 'Estimar con tres rondas',
      baseHcp: 'Hándicap base',
      index: 'Índice',
      goodDay: 'Buen día',
      normalDay: 'Día normal',
      badDay: 'Mal día',
      gross: 'Golpes',
      rating: 'Rating',
      slope: 'Slope',
      par: 'Par',
      assumed: 'asumido',
      estimated: 'estimado',
      preview: 'Vista previa',
      previewPh: (ph: number) => `Hándicap de juego ${ph}`,
      courseHcp: (n: number) => `hándicap de campo ${handicapText(n)}`,
      committee: 'Comité',
      strokesOn: (n: number) => (n === 0 ? 'Sin golpes de ventaja' : `${n} golpe${n === 1 ? '' : 's'} de ventaja`),
      areYouSure: '¿Seguro? Ese resultado se ve raro.',
      /** Save waits for a handicap someone typed, by the method chosen (UX-16): a new player opened on 18. */
      hcpMissing: { manual: 'Escribe su hándicap para guardarlo.', index: 'Escribe su índice para guardarlo.', estimate: 'Escribe los golpes de sus tres rondas para guardarlo.' },
      reordered: 'Las rondas venían en otro orden; se acomodaron.',
      /** UX-28: the base handicaps fixed before the Calcutta (0046). */
      lock: {
        title: 'Hándicaps',
        open: 'Fíjalos antes de que empiece el torneo: después, cambiar uno pide un motivo y todos lo ven en En vivo. Abrir la subasta o empezar a jugar los fija solo.',
        fix: 'Fijar hándicaps',
        fixTitle: 'Fijar los hándicaps',
        fixBody: 'Desde ahora, cambiar el hándicap de un jugador pide un motivo, y En vivo y su ficha dicen qué cambió y por qué.',
        fixed: (when: string | null) =>
          `${when ? `Fijados el ${when}` : 'Fijados desde que empezó el torneo'}. Cambiar uno pide un motivo, y todos lo ven en En vivo.`,
        free: 'Liberar',
        freeTitle: 'Liberar los hándicaps',
        freeBody: 'Se vuelven a cambiar sin motivo, y se borra lo que se anotó al cambiarlos. Solo se puede antes de que empiece el torneo.',
        fixedHint: 'Fijado: cambiarlo pide un motivo.',
        reasonTitle: 'Cambiar un hándicap fijado',
        reasonBody: (name: string, fromTo: string) => `El hándicap de ${name} cambia ${fromTo}. Todos lo verán en En vivo, con este motivo.`,
        reasonConfirm: 'Guardar con motivo',
        changed: 'cambió después de fijarlos',
        history: 'Cambios después de fijarlos',
      },
    },
    courses: {
      title: 'Campos',
      empty: 'Sin campos. Busca uno, sube una foto de la tarjeta o captúralo a mano.',
      notMine: 'Lo creó otro organizador; solo quien lo creó puede borrarlo.',
      ladies: 'damas',
      deleteTee: 'Borrar tee',
      new: 'Nuevo campo',
      search: 'Buscar campo',
      searchPlaceholder: 'Nombre del campo (p. ej. Quivira)',
      searchUnavailable: 'Búsqueda no disponible; sube una foto o captúralo a mano.',
      noResults: 'Sin resultados. Prueba con otro nombre.',
      fullCard: 'Tarjeta completa',
      locationOnly: 'Solo ubicación',
      cardUnknown: 'Tarjeta por confirmar',
      locationCreated: 'Campo creado con su ubicación. Ahora sube la foto de la tarjeta.',
      attribution: 'Datos',
      importTees: 'Elige qué tees importar',
      import: 'Importar',
      photo: 'Subir tarjeta',
      photoReading: 'Leyendo la tarjeta…',
      photoUnavailable: 'Lectura de tarjeta pendiente: falta configurar la llave.',
      manual: 'Capturar a mano',
      review: 'Revisar antes de guardar',
      courseName: 'Nombre del campo',
      location: 'Ubicación',
      tees: 'Tees',
      addTee: 'Agregar tee',
      teeName: 'Nombre del tee',
      color: 'Color',
      rating: 'Rating',
      slope: 'Slope',
      hole: 'Hoyo',
      par: 'Par',
      yards: 'Yardas',
      /** A11Y-22: each box says its hole, and «SI» in words (a Spanish voice reads the letters as «sí»). */
      parOf: (n: number) => `Par del hoyo ${n}`,
      siOf: (n: number) => `Índice de golpe del hoyo ${n}`,
      yardsOf: (n: number) => `Yardas del hoyo ${n}`,
      parTotal: 'Par total',
      paste: 'Pegar de la tarjeta',
      pasteHint: 'Pega dos o tres líneas: pares, índices de golpe y (opcional) yardas de los 18 hoyos, separados por espacios o comas.',
      pasteApply: 'Aplicar',
      pasteError: 'No entendí. Necesito 18 números por línea.',
      issues: 'Revisar',
      siNotPermutation: 'Los índices de golpe (SI) deben ser 1 a 18 sin repetir.',
      parSum: (n: number) => `Los pares suman ${n}.`,
      /** A tee started from scratch: cells nobody has typed yet (UX-16). */
      holesUntyped: (holes: number[]) =>
        holes.length > 6 ? `Falta el par o el índice de ${holes.length} hoyos.` : `Falta el par o el índice ${holes.length === 1 ? 'del hoyo' : 'de los hoyos'} ${andList(holes.map(String))}.`,
      confidence: { high: 'Lectura confiable', medium: 'Revisar con cuidado', low: 'Lectura dudosa' },
      source: { manual: 'A mano', golfcourseapi: 'Importado', opengolfapi: 'Importado', scorecard_photo: 'De foto' },
    },
    // Rondas › Teléfonos del torneo (STRAT-02, 0037): lo que cada teléfono reporta.
    devices: {
      title: 'Teléfonos del torneo',
      hint: 'Los que se usaron en los últimos 7 días, con lo que les falta por mandar. Antes de terminar un día, que el que tenga hoyos abra la Tarjeta con señal.',
      refresh: 'Actualizar',
      none: 'Ningún teléfono ha reportado todavía.',
      unavailable: 'La lista de teléfonos todavía no está disponible.',
      failed: 'No se pudo leer la lista de teléfonos. Intenta de nuevo con señal.',
      noPlayer: 'Sin jugador (no ha entrado con su PIN)',
      pending: (n: number, when: string | null) => `${n === 1 ? 'Un hoyo sin mandar' : `${n} hoyos sin mandar`}${when ? `, el primero ${when}` : ''}`,
      clear: 'Todo mandado',
      rejected: (n: number) => (n === 1 ? 'Un hoyo que el servidor no tomó' : `${n} hoyos que el servidor no tomó`),
      seen: (when: string, sha: string | null, other: boolean) => `Visto ${when}${sha ? `, versión ${sha}${other ? ', otra que la tuya' : ''}` : ''}`,
    },
    rounds: {
      add: 'Agregar ronda',
      empty: 'Sin rondas. Agrega el día 1.',
      number: 'Ronda',
      date: 'Fecha',
      course: 'Campo',
      holes: 'Hoyos',
      status: 'Estado',
      start: 'Iniciar ronda',
      finish: 'Terminar ronda',
      cancel: 'Cancelar ronda',
      reopen: 'Reabrir',
      tees: 'Tee de cada jugador',
      teeDefault: 'Por defecto',
      /** A tee chosen for the day that belongs to another course (the round's course changed): shown so it can be put back to «Por defecto». */
      teeOtherCourse: (name: string | null) => (name ? `${name}, de otro campo` : 'Tee de otro campo'),
      noCourse: 'Sin campo',
      current: 'Ronda actual',
      finishConfirm: (n: number) => `¿Terminar el día ${n}? Se cierran las tarjetas y se calculan los premios del día.`,
      cancelConfirm: (n: number) => `¿Cancelar el día ${n}? Deja de contar para los premios. Se puede reabrir.`,
      deleteConfirm: (n: number) => `¿Borrar el día ${n} con todas sus tarjetas? No se puede deshacer.`,
      pendingBeforeFinish: (n: number) => `Hay ${n} pendiente${n === 1 ? '' : 's'} en Tarjetas. Puedes terminar de todos modos.`,
      /** Holes of this day the server did not take, still to apply or dismiss (REL-08): a warning, not a lock. */
      inboxBeforeFinish: (n: number) => `${n === 1 ? 'Un hoyo de este día que el servidor no tomó sigue' : `${n} hoyos de este día que el servidor no tomó siguen`} en «Pendientes de revisar» (Tarjetas). Puedes terminar y resolverlos después.`,
      /** On the day's block. */
      inboxCount: (n: number) => (n === 1 ? 'Un hoyo por revisar en Tarjetas' : `${n} hoyos por revisar en Tarjetas`),
      /** Nothing here knows what another phone still holds (REL-08), so the Comité asks before closing. */
      phonesBeforeFinish: 'Un teléfono que se quedó sin señal puede tener hoyos sin subir, y después de terminar ya no entran: antes, que cada teléfono que capturó abra la Tarjeta con señal y no le queden hoyos por subir.',
      devicesBeforeFinish: (holes: number, names: string[]) =>
        `${names.length === 1 ? 'El teléfono' : 'Los teléfonos'} de ${andList(names)} ${names.length === 1 ? 'reporta' : 'reportan'} ${holes === 1 ? 'un hoyo sin mandar' : `${holes} hoyos sin mandar`} (Teléfonos del torneo, abajo).`,
      noDate: 'Sin fecha',
      teeSaved: 'Tee guardado.',
      duplicateNumber: (n: number) => `Ya hay un día ${n}. Cambia el número.`,
      needsGroups: 'Arma los grupos antes de iniciar la ronda.',
      startWhileLive: (n: number) => `El día ${n} sigue en juego. ¿Iniciar esta ronda de todos modos? La otra se queda en juego hasta que la termines.`,
      reschedule: 'Volver a programada',
    },
  },
  auction: {
    title: 'La Calcutta',
    console: 'Consola del subastador',
    drawOrder: 'Sortear el orden',
    drawHint: 'Sortea el orden de los lotes. Puedes reordenarlos a mano antes de abrir el primero.',
    manualOrder: 'Orden manual',
    lot: (n: number) => `Lote ${n}`,
    of: (n: number, total: number) => `${n} de ${total}`,
    open: 'Abrir lote',
    /** UX-28: opening the auction fixes the base handicaps (0046). */
    locksHandicaps: 'Abrir la subasta fija los hándicaps: después, cambiar uno pide un motivo.',
    currentBid: 'Puja actual',
    self: 'él mismo',
    owner: 'Dueño',
    bidder: 'Postor',
    bid: (amount: string) => `+${amount}`,
    custom: 'Otra',
    customAmount: 'Monto de la puja',
    undo: 'Deshacer última puja',
    sold: '¡Vendido!',
    soldTo: (name: string, price: string) => `Vendido a ${name} por ${price}`,
    /** The TV's stamp at the hammer, under the price: who bought him. */
    stampTo: (name: string) => `Vendido a ${name}`,
    stampSelf: 'Se queda con él mismo',
    reopen: 'Reabrir lote',
    // UX-13: a loud dinner. The bidder is picked again for every bid, the high bidder can't raise himself, and the hammer and a reopen ask first.
    leading: 'Va arriba',
    leadingLabel: (name: string) => `${name}, va arriba`,
    pickBidder: 'Toca quién puja.',
    hammerTitle: '¿Vendido?',
    hammerBody: (player: string, buyer: string, price: string) => `${player} se vende a ${buyer} por ${price}.`,
    hammerSelf: (player: string, price: string) => `${player} se queda con él mismo por ${price}.`,
    reopenTitle: (player: string) => `¿Reabrir el lote de ${player}?`,
    reopenBody: (price: string, buyer: string, buyback: boolean) => `Se deshace la venta de ${price} a ${buyer}${buyback ? ' y su recompra' : ''}. El lote vuelve a abrirse con sus pujas.`,
    reopenWhileOpen: 'Primero vende o deshaz el lote abierto.',
    limitReached: (n: number) => `Ya tiene ${n}`,
    minBid: (amount: string) => `La puja tiene que superar ${amount}.`,
    /** A custom bid off the step (MONEY-19): the valid amounts either side of it. */
    offStep: (increment: string, options: string[]) => `Las pujas suben de ${increment} en ${increment}: ${options.length === 1 ? `la siguiente es ${options[0]}` : `${options[0]} o ${options[1]}`}.`,
    selfAtLimit: (n: number) => `Ya tiene ${n} jugadores; no puede quedarse consigo mismo. Alguien más tiene que pujar.`,
    searchBidder: 'Buscar postor',
    buyback: 'Recompra',
    buybackHint: (max: number) => `El jugador puede recomprar hasta el ${max}% de sí mismo pagándole a su dueño esa proporción del precio.`,
    buybackPays: (name: string, amount: string, owner: string) => `${name} le paga ${amount} a ${owner}`,
    noBuyback: 'Sin recompra',
    next: 'Siguiente lote',
    pot: 'Pozo',
    atStake: 'Lo que está en juego',
    soldList: 'Vendidos',
    pending: 'Por vender',
    allSold: 'Todos vendidos.',
    goDraw: 'Sorteo de parejas',
    reset: 'Borrar la subasta',
    resetConfirm: 'Se borran todos los lotes, pujas y recompras. ¿Seguro?',
    formGuide: 'Forma reciente',
    pair: 'Pareja',
    noPlayers: 'Primero carga a los jugadores.',
    /** The TV runs on the link to watch «Con dinero» (STRAT-05), never on a player's PIN; the link below is this phone's own TV view. */
    tvHint: 'En la tele, abre el enlace para ver con dinero (Torneo, pestaña Estado): no pide PIN. En este teléfono:',
    /** The console needs the server for every bid (DB-19): the night goes on on paper, and is entered here afterwards. */
    paperHint: 'Si se va la señal o el servidor, la subasta sigue en papel:',
  },
  bracket: {
    title: 'Cuadro',
    champion: 'Campeón',
    bye: 'Pasa directo',
    empty: 'El cuadro se arma cuando haya jugadores y grupos.',
    nextRound: (name: string) => `Armar los grupos de ${name}`,
    nextRoundHint: (name: string, n: number) => `${name}: ${n} ${n === 1 ? 'partido' : 'partidos'} según quién ganó.`,
    noNextRound: 'No hay una ronda pendiente por armar.',
    written: 'Grupos armados.',
  },
  teams: {
    title: 'Equipos',
    hint: 'El sorteo reparte a los jugadores para que los equipos queden parejos de hándicap.',
    notTeamFormat: 'Este torneo no se juega por equipos. Cámbialo en Comité, sección Torneo, en Reglas.',
    existing: 'Equipos sorteados',
    size: '¿De cuántos?',
    sizeOption: (n: number) => `${n} por equipo`,
    sizeHint: (players: number, teams: number) => `${players} jugadores en ${teams} ${teams === 1 ? 'equipo' : 'equipos'}.`,
    draw: 'Sortear equipos',
    redraw: 'Sortear otra vez',
    names: 'Ponles nombre',
    unnamed: (n: number) => `Equipo ${n}`,
    hcpTotal: (n: number) => `hándicap ${handicapText(n)}`,
    spread: (n: number) =>
      n === 0 ? 'Quedaron exactamente parejos: todos los equipos suman el mismo hándicap.' : `Del equipo más fuerte al más débil hay ${n} de hándicap.`,
    groupsPreview: (n: number, first: string) => `Saldrían ${n} ${n === 1 ? 'grupo' : 'grupos'}, el primero a las ${first}.`,
    save: 'Guardar equipos',
    saveConfirm: 'Se reemplazan los equipos que hubiera. Los grupos de la ronda se ajustan en Grupos.',
    saved: 'Equipos guardados.',
  },
  draw: {
    pickedByHonoree: 'la eligió el homenajeado',
    title: 'Sorteo de parejas',
    hint: (label: string) => `${label}: el homenajeado escoge; el resto sale al azar por categorías.`,
    honoreePicks: (name: string) => `${name} escoge a su pareja`,
    eligible: 'Elegibles',
    draw: 'Sortear el resto',
    redraw: 'Volver a sortear',
    names: 'Nombres de las parejas',
    namePlaceholder: (a: string, b: string) => andList([a, b]),
    /** Each pair's name field, by who is in it: «Nombre de Camilo y Matías». */
    nameOf: (both: string) => `Nombre de ${both}`,
    /** The draw is saved as it is drawn, and the TV shows it (UX-17). */
    saved: 'Sorteo guardado con los grupos del día 1; la tele lo va mostrando. Las horas de salida se ajustan en Grupos.',
    onTv: 'La tele muestra el sorteo pareja por pareja, con el enlace para ver (Torneo, pestaña Estado). En este teléfono:',
    existing: 'Ya hay parejas. Volver a sortear las reemplaza (los grupos del día 1 también).',
    redrawConfirm: 'La sala ya vio este sorteo. Volver a sortear reemplaza las parejas y los grupos del día 1.',
    noHonoree: 'No hay homenajeado marcado; todo sale al azar.',
    missingTiers: 'Faltan categorías en algunos jugadores; asígnalas en Jugadores antes del sorteo.',
    showAll: 'Mostrar todas',
    saveNames: 'Guardar nombres',
    namesSaved: 'Nombres guardados.',
    /** On Calcutta night the draw ends the night: «Empezar el torneo» takes the TV to the tournament's boards. */
    start: 'Empezar el torneo',
    startHint: 'Cierra la noche de la Calcutta: la tele pasa a los tableros del torneo. Los nombres escritos se guardan antes.',
    started: 'El torneo empezó.',
  },
  moneyScreen: {
    live: 'Si terminara ahora',
    byGame: 'Por juego',
    /** A11Y-22: the names of Dinero's two switches. */
    view: 'Ver el dinero',
    settleHow: 'Cómo se paga',
    byGameEmpty: 'Todavía no hay premios repartidos',
    byGameEmptyHint: 'Aquí verás cuánto paga cada juego y a quién, en cuanto haya tarjetas.',
    seeRules: 'Ver el reglamento completo',
    final: 'Liquidación',
    person: 'Persona',
    breakdown: 'Desglose',
    entry: 'Inscripción',
    purchases: 'Compras Calcutta',
    buybacksPaid: 'Recompras pagadas',
    prizes: 'Premios',
    shares: 'Calcutta',
    buybacksReceived: 'Recompras cobradas',
    sidePots: 'Botes',
    houseCut: (amount: string) => `Gastos del grupo: ${amount}`,
    viaBank: 'Vía banquero',
    viaBankHint: (banker: string) => `Solo lo que falta por pagar: ${banker} cobra lo que se le debe y paga a cada quien. Lo ya marcado como pagado no se vuelve a pedir.`,
    p2p: 'Sin banquero',
    p2pHint: (banker: string | null) =>
      `Lista mínima de transferencias entre personas, sobre lo que falta por pagar (el que más debe le paga al que más recibe).${banker ? ` Lo que ya entró al banco lo reparte ${banker}.` : ''}`,
    settlePreview: 'Así quedaría si terminara ahora. Mientras tanto, lo que se cobra se marca en «Quién debe qué».',
    allSettled: 'Todo liquidado: nadie le debe nada a nadie.',
    /** Two parties square up; null is the bank («Iván J. queda a mano con el banco»). */
    squared: (a: string | null, b: string | null) => (a === null || b === null ? `${a ?? b ?? ''} queda a mano con el banco` : `${andList([a, b])} quedan a mano`),
    recordPaid: 'Registrar algo que ya se pagó',
    recordPaidHint: 'Solo si alguien ya pagó y no se marcó: la liquidación de arriba ya lo cuenta como pendiente. Al marcarlo aquí, deja de pedirse.',
    markedPaid: 'Marcado como pagado.',
    unmarkedPaid: 'Ya no cuenta como pagado.',
    refund: 'Devolución',
    /** TRUST-12: the banker is one of the players who holds the cash, not an institution. */
    bank: 'Banquero',
    bankIn: 'Recibió el banquero',
    bankOut: 'Paga el banquero',
    bankOk: 'Cuadra al peso',
    /** While play goes on: prizes not decided yet. Once it is over, «Por asignar» is a list (t.unassigned). */
    bankPending: (diff: string) => `Por repartir: ${diff}`,
    /** Over, nothing listed, and the bank still does not square: a real mismatch. */
    bankOff: (diff: string) => `No cuadra: ${diff}`,
    byComite: 'Asignado por el Comité',
    /** A money line in words (COPY-08); null is the bank, `bankerSelf` the banker with his own bank. */
    pays: (from: string | null, to: string | null, amount: string, bankerSelf = false) => payText(payWords(from, to, false, bankerSelf), amount),
    payWords,
    payText,
    /** On a person's own breakdown, whom he pays: «Apuesta, le paga a Camilo». */
    paysTo: 'le paga a',
    markPaid: 'Marcar pagado',
    /** The state, on its own toggle in «Ya pagaron»; the action is «Marcar pagado». */
    paid: 'Pagado',
    paidTitle: (n: number) => `Ya pagaron (${n})`,
    paidHint: 'Si algo se marcó por error, toca «Pagado» y vuelve a quedar pendiente. Si esa persona solo había pagado una parte, vuelve a deber todo: para volver a registrar solo esa parte, usa «Deshacer» en el aviso.',
    /** A «Deshacer» tapped after a later change to the same payment: it would bring back the older value. */
    undoStale: 'Ese pago cambió después: revísalo en «Ya pagaron».',
    share: 'Compartir liquidación',
    shareTitle: (name: string) => `Liquidación, ${name}`,
    checklist: 'Quién debe qué',
    /** The heading's count and total, so a glance says how much is still out (COPY-07). */
    checklistCount: (n: number, total: string) => (n === 1 ? `1 pendiente, ${total}` : `${n} pendientes, ${total}`),
    owesEntry: 'Inscripción',
    owesLots: (lots: number[]) => `Calcutta, ${lots.length === 1 ? 'lote' : 'lotes'} ${andList(lots.map(String))}`,
    owesBuyback: 'Recompra',
    owesSide: 'Botes',
    owesBet: 'Apuestas',
    nothingOwed: 'Nadie debe nada.',
    noBanker: 'Falta definir al banquero en Comité, sección Torneo.',
    provisional: 'Provisional: hay premios abiertos.',
  },
  /** «¿Cómo se calculó?» of the numbers people pay by: each settlement line and the bank (MONEY-07). */
  settleWhy: {
    /** One part of a line, signed from the payer's side: + he owes it, − it nets against it. */
    part: (label: string, amount: string) => `${label}: ${amount}`,
    /** A flow partly paid already: what is left of it. */
    partOf: (label: string, amount: string, of: string) => `${label}: ${amount} (de ${of}; lo demás ya se pagó)`,
    /** An account paid beyond what it owes. */
    overpaid: (kind: string) => `${kind}, pagado de más (se devuelve)`,
    total: (amount: string) => `Total: ${amount}`,
    /** A vía-banco line whose parts cancel out. */
    nets: 'Lo que le deben y lo que debe se compensan: no cambia de manos dinero, solo se cierran las cuentas.',
    owesTotal: (name: string | null, amount: string) => `${name ?? 'El banco'} todavía debe ${amount} en total`,
    getsTotal: (name: string | null, amount: string) => `${name ?? 'El banco'} todavía tiene que recibir ${amount} en total`,
    /** The bank's side, in two parts: the banker holds it, or it stands as itself. */
    bankCollects: 'Lo que el banquero todavía cobra',
    bankPays: 'Lo que el banquero todavía paga',
    ruleTitle: 'Cómo se reparte',
    rule: 'Para hacer las menos transferencias, el que más debe le paga al que más tiene que recibir, y así hasta cuadrar.',
    share: (from: string | null, total: string, amount: string, to: string | null) => `De los ${total} que debe ${from ?? 'el banco'}, ${amount} van ${to === null ? 'al banco' : `a ${to}`}.`,
    bankTitle: 'El banquero',
    bankIn: (label: string, amount: string) => `Entra, ${label}: ${amount}`,
    bankOut: (label: string, amount: string) => `Sale, ${label}: ${amount}`,
    bankInTotal: (amount: string) => `Entra en total: ${amount}`,
    bankOutTotal: (amount: string) => `Sale en total: ${amount}`,
    entries: (n: number, fee: string) => `inscripciones (${n} × ${fee})`,
    lots: (n: number) => `Calcutta (${n === 1 ? '1 lote' : `${n} lotes`})`,
    mainPrizes: 'premios del torneo',
    calcuttaShares: 'pagos de la Calcutta',
    houseCut: (amount: string) => `Gastos del grupo: ${amount}`,
    toHouse: (amount: string) => `El Comité lo dejó para gastos del grupo: ${amount}`,
    squares: 'Lo que entra es lo que sale: cuadra al peso.',
    left: (amount: string) => `Queda en el banco: ${amount}.`,
    short: (amount: string) => `Falta en el banco: ${amount}.`,
    /** Counts are what is owed, paid or not: «Quién debe qué» says what is still due. */
    gross: 'Cuenta todo lo que se debe, ya pagado o no.',
  },
  /** Money the rules leave to the Comité, and its decisions (MONEY-05, COPY-09). */
  unassigned: {
    // What the engine writes: the buckets, their explanations, the assignments.
    poolLabel: 'Inscripciones sin premio',
    budget: (label: string, amount: string) => `${label} reparte ${amount}`,
    paid: (amount: string) => `Ya se repartió ${amount}`,
    left: (amount: string) => `Quedan ${amount} sin asignar`,
    poolSurplus: (entries: string, prizes: string) => `Las inscripciones suman ${entries} y los premios ${prizes}`,
    cancelledRound: (n: number) => `Día ${n} cancelado: su premio no se jugó`,
    unplayedRound: (n: number) => `Día ${n} no se jugó`,
    pendingTiebreak: (day: number, group: number, hole: number) => `Día ${day}, grupo ${group}: falta decir quién embocó al último en el hoyo ${hole}`,
    // Snake money an unanswered tiebreak holds: the snake pays it once answered; the Comité does not assign it.
    heldLabel: (label: string, day: number, group: number) => `${label}, día ${day}, grupo ${group}`,
    heldTitle: (amount: string) => `${amount} esperan un desempate`,
    heldWhy: (amount: string, game: string) => `En cuanto se responda, ${labelInSentence(game)} reparte los ${amount} de ese grupo. No es dinero por asignar.`,
    heldNote: (hole: number) => `Responde el desempate del hoyo ${hole} («¿Quién embocó al último?») en Comité, sección Tarjetas.`,
    heldApart: (amount: string) => `${amount} esperan un desempate y se reparten al responderlo`,
    heldTotal: (amount: string) => `Esperando un desempate: ${amount}`,
    heldExtra: (amount: string, game: string) => `Además, ${amount} esperan un desempate de ${labelInSentence(game)}.`,
    title: (amount: string) => `${amount} sin asignar`,
    decides: 'El Comité decide: darlo a alguien, devolverlo o dejarlo para gastos del grupo.',
    awardLabel: (label: string) => `${label}, asignado por el Comité`,
    refundLabel: (label: string) => `${label}, devolución`,
    /** The Comité's reason; a link to watch carries none (its free text stays with the members, STRAT-05). */
    adjustmentWhy: (label: string, amount: string, reason: string) => [`${label}: ${amount} sin asignar`, reason ? `El Comité decidió: ${reason}` : 'Lo decidió el Comité'],
    over: (label: string, assigned: string, left: string) => `Asignación de más en ${label}: el Comité asignó ${assigned} y solo quedan ${left}. No se paga hasta que se anule.`,
    orphan: (label: string, assigned: string) => `Asignación sin dinero en ${label}: hay ${assigned} asignados y ahí ya no queda dinero por asignar. No se paga hasta que se anule.`,
    mismatch: (bank: string, listed: string) => `El banco tiene ${bank} sin repartir y la lista de por asignar suma ${listed}. Revisa los premios en Comité, sección Torneo.`,
    // Dinero: the list everyone sees, and the Comité's actions.
    heading: 'Por asignar',
    intro: 'Dinero que el reglamento deja al Comité. Hasta que decida, se queda en el banco.',
    total: (amount: string) => `Por asignar: ${amount}`,
    totalHint: 'El Comité decide qué hacer con cada línea de abajo.',
    decide: 'Decidir',
    decideTitle: (label: string) => `${label}: qué hacer con este dinero`,
    available: (amount: string) => `Hay ${amount} por asignar.`,
    give: 'Dar a…',
    giveHint: 'Escoge a quién y cuánto. Lo que no asignes se queda por asignar.',
    refund: 'Devolver',
    refundHint: 'Se devuelve a quienes pusieron el dinero, en proporción a lo que pusieron.',
    refundNone: 'No se sabe quién puso este dinero: dalo a alguien o déjalo para gastos del grupo.',
    house: 'A gastos del grupo',
    houseHint: 'Se queda con el banquero para gastos del grupo, como lo que se aparta de la bolsa para eso.',
    amountFor: (name: string) => `Cantidad para ${name}`,
    assigning: (amount: string, left: string) => `Asignas ${amount}; quedan ${left} por asignar.`,
    tooMuch: (left: string) => `Es más de lo que hay: quedan ${left}.`,
    nothing: 'Escribe al menos una cantidad.',
    reason: 'Motivo',
    reasonHint: 'Queda en el historial y lo ven todos.',
    reasonShort: 'Escribe el motivo, al menos 3 letras.',
    confirm: 'Asignar',
    assigned: 'Asignado.',
    applied: 'Lo que ya decidió el Comité',
    toHouse: 'A gastos del grupo',
    void: 'Anular',
    voidTitle: 'Anular esta asignación',
    voidBody: 'El dinero vuelve a quedar por asignar. Queda en el historial con el motivo.',
    voided: 'Asignación anulada.',
    statusOver: 'No se paga: es más de lo que queda. Anúlala y vuelve a asignar.',
    statusOrphan: 'No se paga: ahí ya no queda dinero por asignar. Anúlala.',
    statusWaiting: 'Se aplica cuando terminen todas las rondas.',
    waitingIntro: 'Hay una ronda abierta: estas decisiones del Comité se aplican cuando terminen todas.',
    // Terminado while a planned day is open or was never created (an older app, a restored backup): nothing new is listed.
    finalOpenVerdict: 'Falta cerrar un día',
    finalOpen: (open: number[], missing: number[]) => {
      const what: string[] = []
      if (open.length) what.push(open.length === 1 ? `el día ${open[0]} sigue abierto` : `los días ${andList(open.map(String))} siguen abiertos`)
      if (missing.length) what.push(missing.length === 1 ? `el día ${missing[0]} no existe` : `los días ${andList(missing.map(String))} no existen`)
      const fix = missing.length
        ? 'termina o cancela cada día en Comité, sección Rondas (crea el que falte, o baja el número de rondas en Comité, sección Torneo)'
        : open.length === 1
          ? 'termínalo o cancélalo en Comité, sección Rondas'
          : 'termínalos o cancélalos en Comité, sección Rondas'
      return `El torneo está Terminado, pero ${andList(what)}: ${fix} para repartir lo pendiente. Lo que el Comité ya decidió sigue contando.`
    },
    stale: 'Mientras decidías, cambió lo que hay en esta línea. Revisa la cantidad y vuelve a asignar.',
    gone: 'Esta línea ya no tiene dinero por asignar.',
    rowWhat: (label: string, amount: string, reason: string) => `${label}, ${amount}: ${reason}`,
  },
  /** «Cerrar torneo»: what blocks Terminado and publishing (MONEY-05). */
  /** Holes saved with strokes and no putts (MONEY-18): the engine's warning. */
  missingPutts: {
    who: (name: string, days: Array<{ day: number; holes: number[] }>) => `${name} (${days.map((d) => `día ${d.day}: ${d.holes.length === 1 ? 'hoyo' : 'hoyos'} ${andList(d.holes.map(String))}`).join('; ')})`,
    warning: (who: string[], games: string[]) => `Faltan putts: ${andList(who)}. Hasta que el Comité los capture en Tarjetas, ${andList(games)} no ${games.length === 1 ? 'los cuenta' : 'los cuentan'}.`,
  },
  closeGate: {
    title: 'Antes de cerrar el torneo',
    blocked: 'Falta resolver esto:',
    ok: 'Todo listo para cerrar.',
    understood: 'Entendido',
    moneyFirst: 'Terminar la ronda y decidir en Dinero',
    moneyFirstHint: 'La ronda se cierra y en Dinero aparece lo que queda por asignar. Cuando el Comité decida, vuelve aquí para publicar.',
    missingRounds: (days: number[]) => `${days.length === 1 ? `El día ${days[0]} no está creado` : `Los días ${andList(days.map(String))} no están creados`}: créalo y juégalo o cancélalo en Comité, sección Rondas, o baja el número de rondas en Comité, sección Torneo.`,
    openRounds: (days: number[]) => `${days.length === 1 ? `El día ${days[0]} sigue abierto` : `Los días ${andList(days.map(String))} siguen abiertos`}: termínalo o cancélalo en Comité, sección Rondas.`,
    tiebreaks: (n: number, game: string) => `${n === 1 ? 'Un desempate' : `${n} desempates`} de ${labelInSentence(game)} sin responder («¿Quién embocó al último?»): en Comité, sección Tarjetas.`,
    unsoldLots: (names: string) => `Lotes de la Calcutta sin vender: ${names}. No cobran nada de la Calcutta; si deben contar, véndelos en Comité, sección Calcutta.`,
    unassigned: (amount: string) => `${amount} por asignar: el Comité decide en Dinero, Liquidación.`,
    badAssignments: (n: number) => `${n === 1 ? 'Una asignación no se puede pagar' : `${n} asignaciones no se pueden pagar`}: anúlalas en Dinero, Liquidación.`,
    unsignedCards: (n: number) => `${n === 1 ? 'Una tarjeta sin firmar' : `${n} tarjetas sin firmar`} en rondas terminadas: el Comité puede firmarlas en Tarjeta.`,
    missingPutts: (n: number) => `Faltan los putts de ${n === 1 ? 'un hoyo' : `${n} hoyos`}: captúralos en Comité, sección Tarjetas.`,
    rejectedWrites: (n: number) => `${n === 1 ? 'Un hoyo que el servidor no tomó sigue sin revisar: aplícalo o descártalo' : `${n} hoyos que el servidor no tomó siguen sin revisar: aplícalos o descártalos`} en Comité, sección Tarjetas, «Pendientes de revisar».`,
    /** The server has no «Pendientes de revisar» yet (0028 not applied): nothing there can hold the close. */
    rejectedUnavailable: 'La lista «Pendientes de revisar» todavía no está en el servidor, así que no detiene el cierre. Si un teléfono avisó que un hoyo quedó para el Comité, corrígelo antes en Tarjetas.',
    owed: (people: number, amount: string) => `${people === 1 ? 'Una persona todavía debe' : `${people} personas todavía deben`} ${amount}. No impide cerrar: se puede cobrar después en Dinero.`,
    /**
     * The server's own refusal (0029 `close_blockers_text`): this line, then
     * one sentence per item it checks (missingRounds, openRounds,
     * rejectedWrites, worded as above). The phone shows it as the server
     * sends it (humanError); the test server builds it from these lines, and
     * cases/serverRules.json pins both to the database's text.
     */
    serverRefusedFinish: 'Todavía no se puede marcar Terminado.',
    serverRefusedPublish: 'Todavía no se pueden publicar los resultados.',
  },
  /**
   * The live feed (§9.2), the one place the voice plays (DESIGN_NOTES.md, «Voice»; COPY-15): light, Mexican, never
   * mean and never about money, the names as the board shows them. Each kind gives a few lines, and `feedLines`
   * picks one per event from its key, so every phone reads the same line and a recompute never changes it. The
   * first line of each is the plain one.
   */
  feed: {
    title: 'Lo último',
    empty: 'Nada todavía. El primer birdie abre el marcador.',
    /**
     * A Stableford hole at 3 points or more, named for its points: 3 a birdie, 4 an eagle, 5 or more an albatross.
     * `plain` when the card itself made it with no stroke received, so the name takes no «neto» (COPY-23: every
     * 4 or more read «águila neta», a gross eagle too). A run of birdies or the day's first gets its own lines.
     */
    underParPoints: (name: string, hole: number, pts: number, plain: boolean, ctx: { first?: boolean; streak?: number } = {}) => {
      const what = underParName(pts - 2, !plain)
      const fig = ptsText(pts, `+${pts}`)
      return feedUnderPar(name, hole, what, pts - 2, `, ${fig}`, ctx)
    },
    /** Under strokes: «birdie neto», «águila» (gross), «albatros neto». No points: the event does not count them. */
    underPar: (name: string, hole: number, under: number, net: boolean, ctx: { first?: boolean; streak?: number } = {}) => feedUnderPar(name, hole, underParName(under, net), under, '', ctx),
    /** `figure` as the board writes the total: «34» points, «−3» or «E» against par; `previous`, who led before. */
    leadChange: (name: string, figure: string, previous: string | null = null) => {
      const fig = figure === 'E' ? 'en par' : `con ${figure}`
      return [`¡Cambio de líder! ${name} toma la punta ${fig}`, previous ? `${name} le quita la punta a ${previous}, ${fig}` : `${name} se pone adelante, ${fig}`, `Nuevo líder: ${name}, ${fig}`]
    },
    /** `game` is the snake's own label (STRAT-11). */
    snakePass: (name: string, hole: number, game: string) => [
      `${game} pasa a ${name} en el ${hole}`,
      `${name} se lleva ${labelInSentence(game)} en el ${hole}`,
      `En el ${hole}, ${labelInSentence(game)} cambia de dueño: ahora es de ${name}`,
    ],
    /** `role`: the honoree's label when the organizer gave one («El novio»); null for the platform's own. */
    honoreeHole: (name: string, hole: number, pts: number, role: string | null = null) =>
      pts === 0
        ? [`${name} en el ${hole}: cero puntos.`, `El ${hole} no fue para ${name}: cero puntos.`, `${name}${role ? `, ${labelInSentence(role)},` : ''} en el ${hole}: cero puntos, pero sigue sonriendo.`]
        : [`${name} en el ${hole}: ${ptsText(pts)}`, `${name}${role ? `, ${labelInSentence(role)},` : ''} suma ${ptsText(pts)} en el ${hole}`, `Reporte de ${name} en el ${hole}: ${ptsText(pts)}`],
    /** A hole named on the score the event counts: «par», «bogey neto», «birdie», «levantó». */
    scoreName: (toPar: number | null, net: boolean) => (toPar == null ? 'levantó' : overParName(toPar, net)),
    /** The honoree's hole under strokes: «par», «bogey neto», «levantó». */
    honoreeToPar: (name: string, hole: number, toPar: number | null, net: boolean, role: string | null = null) => {
      const w = toPar == null ? 'levantó' : overParName(toPar, net)
      return [`${name} en el ${hole}: ${w}.`, role ? `${name}, ${labelInSentence(role)}, en el ${hole}: ${w}.` : `Así va ${name} en el ${hole}: ${w}.`, `Reporte de ${name} en el ${hole}: ${w}.`]
    },
    /** Three putts or more where no snake says it: a gentle ribbing about the green, never the player. */
    threePutt: (name: string, hole: number, putts: number) => [
      `${name}: ${putts} putts en el ${hole}. El green ganó esta vez.`,
      `En el ${hole}, ${putts} putts para ${name}: el hoyo se hizo chiquito.`,
      `${name} pasea la bola en el green del ${hole}: ${putts} putts.`,
    ],
    day: (n: number) => `Día ${n}`,
  },
  stats: {
    title: 'Estadísticas y premios',
    awards: 'Premios automáticos',
    awardsHint: 'Sin dinero en juego.',
    race: 'Carrera de puntos',
    raceHint: 'Puntos acumulados hoyo por hoyo.',
    raceStrokes: 'Carrera de golpes',
    raceHintStrokes: 'Golpes sobre o bajo par, acumulados hoyo por hoyo: más arriba va mejor.',
    pairsRace: 'Carrera de parejas',
    /** A11Y-22: the switch between the players' race and the pairs'. */
    raceKind: 'Carrera',
    play: 'Revivir',
    /**
     * The race chart (PERF-04, VIS-21, A11Y-20, MOT-21, 2026-10-16): a few lines in colour and the rest of a large
     * field in grey, each named beside its line, a bar to read the race at any hole, and the whole race as a table.
     */
    raceChart: {
      replayHint: 'Toca «Revivir» para verla de nuevo, o mueve la barra para leerla hoyo por hoyo.',
      scrubHint: 'Mueve la barra para leerla hoyo por hoyo.',
      /** Past six lines, a few stand out. */
      colourHint: (pairs: boolean) =>
        pairs ? 'En color, las tres primeras, la tuya y la que elijas para comparar; en gris, las demás.' : 'En color, los tres primeros, tú y quien elijas para comparar; en gris, los demás.',
      pause: 'Pausar',
      resume: 'Seguir',
      end: 'Ver el final',
      /** The bar's name; its value is the hole, said as `at`. */
      cursor: 'Hoyo de la carrera',
      start: 'En la salida',
      /** «Hoyo 5», or «Hoyo 5 del día 2» when the event has more than one day. */
      at: (day: number, hole: number, days: number) => (days > 1 ? `Hoyo ${hole} del día ${day}` : `Hoyo ${hole}`),
      pick: 'Comparar con',
      pickNone: 'Nadie más',
      me: 'Tú',
      mine: 'La tuya',
      picked: 'Comparado',
      others: (n: number, pairs: boolean) => `${pairs ? 'Las demás' : 'Los demás'} (${n})`,
      /** A place at a hole: «3.º», «T3» when shared. */
      place: (n: number, tied: boolean) => (tied ? `T${n}` : `${n}.º`),
      showTable: 'Ver como tabla',
      hideTable: 'Ocultar la tabla',
      tableName: (title: string) => `${title}, hoyo por hoyo`,
      entrant: (pairs: boolean) => (pairs ? 'Pareja' : 'Jugador'),
      /** The figure as a voice says it: «72 puntos», «11 bajo par», «par». */
      spoken: (v: number, strokes: boolean) => (strokes ? toParWords(v === 0 ? 'E' : v > 0 ? `+${v}` : `−${-v}`) : `${v} ${Math.abs(v) === 1 ? 'punto' : 'puntos'}`),
      /**
       * What the chart says to a screen reader: «Carrera de puntos: 12 jugadores, 36 hoyos. Va al frente Diego A.
       * con 72 puntos; tomó la punta en el hoyo 5 del día 2.»
       */
      summary: (s: { title: string; count: number; pairs: boolean; holes: number; leaders: string[]; value: string; tookLead: string | null; wireToWire: boolean }) => {
        const who = s.leaders.length === 1 ? `Va al frente ${s.leaders[0]} con ${s.value}` : `Van al frente ${andList(s.leaders)} con ${s.value}`
        const since = s.tookLead ? `; tomó la punta en el ${s.tookLead.charAt(0).toLowerCase()}${s.tookLead.slice(1)}` : s.wireToWire ? '; va al frente desde el primer hoyo' : ''
        const noun = s.pairs ? (s.count === 1 ? 'pareja' : 'parejas') : s.count === 1 ? 'jugador' : 'jugadores'
        return `${s.title}: ${s.count} ${noun}, ${s.holes} ${s.holes === 1 ? 'hoyo' : 'hoyos'}. ${who}${since}.`
      },
      /** A hole of the course strip (A11Y-20): its number, par and average, said and shown on a tap. */
      holeBar: (label: string, par: number, avg: string) => `${label}, par ${par}: ${avg}`,
      holeBarHint: 'Toca un hoyo para ver su promedio.',
    },
    course: 'El campo',
    hardest: 'Hoyo más difícil',
    easiest: 'Hoyo más fácil',
    avgPoints: 'pts promedio',
    perPlayer: 'Por jugador',
    holesPlayed: 'Hoyos',
    byPar: 'Pts en par 3 / 4 / 5',
    byParStrokes: 'Contra par en par 3 / 4 / 5',
    /** A total against par in a table cell: «+3», «0», «−2». */
    signed: (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0'),
    /** An average against par: «1.25 sobre par en promedio», «en par en promedio». */
    avgToPar: (avg: number) => (avg === 0 ? 'en par en promedio' : `${Math.abs(avg)} ${avg > 0 ? 'sobre' : 'bajo'} par en promedio`),
    birdiesGross: 'Birdies gross',
    birdiesNet: 'Birdies netos',
    pars: 'Pares',
    bogeys: 'Bogeys',
    worse: 'Doble o peor',
    pickUps: 'Levantó',
    putts: 'Putts',
    puttsPerHole: 'Putts por hoyo',
    onePutts: 'A un putt',
    threePutts: 'A tres putts',
    snakeHoles: (game: string) => `Hoyos con ${labelInSentence(game)}`,
    bestHole: 'Mejor hoyo',
    worstHole: 'Peor hoyo',
    streak: 'Racha',
    moment: 'Momento del torneo',
    momentText: (name: string, hole: number, day: number, pts: number) => `${name}, hoyo ${hole} del día ${day}: ${pts} ${pts === 1 ? 'punto' : 'puntos'}.`,
    momentStrokes: (name: string, hole: number, day: number, toPar: number, net: boolean) => `${name}, hoyo ${hole} del día ${day}: ${overParName(toPar, net)}.`,
    cursed: 'Hoyo Maldito',
    cursedText: (hole: number, day: number, avg: number) => `Hoyo ${hole} del día ${day}: ${ptsText(avg)} promedio.`,
    cursedStrokes: (hole: number, day: number, avg: number) => `Hoyo ${hole} del día ${day}: ${avg === 0 ? 'en par en promedio' : `${Math.abs(avg)} ${avg > 0 ? 'sobre' : 'bajo'} par en promedio`}.`,
    noData: 'Cuando haya tarjetas capturadas, aquí salen las estadísticas.',
    award: {
      mostBirdies: { name: 'Rey del Birdie', desc: 'Más birdies gross' },
      mostOnePutts: { name: 'Francotirador', desc: 'Más hoyos a un putt' },
      mostThreePutts: { name: 'Mano de Piedra', desc: 'Más hoyos a tres putts' },
      biggestGain: { name: 'El Resucitado', desc: 'Mayor mejora del día 1 al día 2' },
      mostConsistent: { name: 'El Constante', desc: 'Menor varianza de puntos por hoyo' },
      // The name a profile shows, where no tournament's label is at hand; a tournament's screens use `snakeAward` (STRAT-11).
      snakeGold: { name: 'Víbora de Oro', desc: 'Más hoyos cargando la víbora' },
      bestRoi: { name: 'El Inversionista', desc: 'Mejor retorno en la Calcutta' },
      worstRoi: { name: 'El Filántropo', desc: 'Peor retorno en la Calcutta' },
    },
    /** Under strokes the awards that read the hole figure say so. */
    awardStrokes: { mostConsistent: 'Menor varianza de golpes por hoyo', biggestGain: 'Más golpes menos del día 1 al día 2' } as Partial<Record<string, string>>,
    /** The snake's award, named for the tournament's own snake: «La Víbora» gives «Víbora de Oro» (STRAT-11). */
    snakeAward: (game: string) => ({ name: `${labelBare(game)} de Oro`, desc: `Más hoyos cargando ${labelInSentence(game)}` }),
    // Signed figures (a return on the Calcutta, a gain from day 1 to day 2) take a true minus, never a hyphen.
    unit: (unit: 'count' | 'points' | 'strokes' | 'pct' | 'variance', v: number) =>
      unit === 'strokes'
        ? `${v} ${v === 1 ? 'golpe' : 'golpes'} menos`
        : unit === 'pct'
        ? `${Math.round(v * 100) < 0 ? '−' : ''}${Math.abs(Math.round(v * 100))}%`
        : unit === 'points'
          ? ptsText(v, `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`)
          : unit === 'variance'
            ? `varianza ${v.toFixed(2)}`
            : `${v}`,
  },
  share: {
    leaderboard: 'Compartir tabla',
    round: 'Compartir mi ronda',
    settlement: 'Compartir liquidación',
    generating: 'Generando imagen…',
    saved: 'Imagen lista',
    shareNow: 'Compartir',
    failed: 'No se pudo generar la imagen.',
    /** What a card left out (PWA-06): it never runs taller than WhatsApp shows whole. */
    more: (n: number) => (n === 1 ? 'Y 1 más: el resto está en Polo.' : `Y ${n} más: el resto está en Polo.`),
    /** The footer of a card made on the example tournament (STRAT-17). */
    demoLink: (url: string) => `Torneo de ejemplo: ${url}`,
  },
  /**
   * The Reglamento (§9.8, COPY-11, COPY-12): every sentence from the tournament's settings, so it says only what
   * the engine runs. `src/engine/settings/reglamento.ts` decides which lines a tournament gets; this is their words.
   * Golf's words are said once in plain Spanish where they first appear, and again in «Palabras de golf».
   */
  rules: {
    title: 'Reglamento',
    intro: (name: string) => `Las reglas de ${name}, tal como las calcula la app.`,
    sections: {
      summary: 'En corto',
      field: 'El campo',
      handicaps: 'Hándicaps',
      cards: 'Las tarjetas',
      governance: 'El Comité',
      glossary: 'Palabras de golf',
    },
    /** «En corto»: the money first, as a person asks for it (COPY-12). */
    summary: {
      fee: (fee: string, n: number, pot: string) => `Cada jugador paga ${fee} de inscripción. Con ${n === 1 ? '1 jugador' : `${n} jugadores`}, la bolsa es de ${pot}.`,
      noFee: 'No hay inscripción.',
      noMoney: 'Se juega sin dinero: por la gloria.',
      /** `prizes`: each game with what it takes from the bolsa, «Individual ($20,000)». */
      prizes: (prizes: string[]) => `De la bolsa salen los premios: ${andList(prizes)}.`,
      prize: (label: string, amount: string) => `${label} (${amount})`,
      kept: (amount: string) => `${amount} de la bolsa no son premio: se apartan para los gastos del torneo.`,
      auction: (label: string) => `${label} va aparte de la bolsa: se subasta a cada jugador, y lo que pagan los compradores forma su propio pozo, que se reparte completo entre los dueños de los que mejor terminan.`,
      sidePots: (labels: string[]) => `${andList(labels)} ${labels.length === 1 ? 'tiene su propio bote' : 'tienen su propio bote'}: solo ponen y cobran los que entran.`,
      bets: (labels: string[]) => `${andList(labels)} se ${labels.length === 1 ? 'paga' : 'pagan'} directo entre jugadores, sin pasar por la bolsa.`,
      banker: (name: string) => `${name} es el banquero: junta el dinero y paga los premios.`,
      noBanker: 'El Comité dice quién es el banquero: quien junta el dinero y paga los premios.',
      settle: 'En Dinero se ve en todo momento lo que cada quien ganaría si el torneo terminara ahora, y al final, quién le paga a quién.',
    },
    /** `days` and `holes` describe the days the tournament has; `holes` is null before any day exists. */
    field: (n: number, days: number, holes: number[] | null, groupSize: number, tiers: string) => [
      `${n === 1 ? '1 jugador' : `${n} jugadores`}, ${days === 1 ? 'un día' : `${days} días`}${holes && holes.length ? ` de ${orList([...new Set(holes)].sort((a, b) => a - b).map(String))} hoyos` : ''}, en grupos de hasta ${groupSize}.`,
      ...(tiers ? [`Categorías por hándicap: ${tiers}, asignadas por el Comité.`] : []),
    ],
    /** How a rounding mode reads, with an example (MONEY-14: it always said «mitad hacia arriba»). */
    rounding: {
      halfUp: 'redondeado al entero, el medio hacia arriba (17.5 queda en 18)',
      halfDown: 'redondeado al entero, el medio hacia abajo (17.5 queda en 17)',
      nearestEven: 'redondeado al entero, el medio al par más cercano (17.5 queda en 18 y 16.5 en 16)',
      floor: 'redondeado hacia abajo (17.9 queda en 17)',
      ceil: 'redondeado hacia arriba (17.1 queda en 18)',
    } as Record<'halfUp' | 'halfDown' | 'nearestEven' | 'floor' | 'ceil', string>,
    /**
     * The cut line only where a cut can happen: more than one day and a maximum above zero (a one-day event, or a
     * wizard-made one with `maxStrokes: 0`, read «máximo 0» before, STRAT-03). It is computed on Stableford points
     * whatever the main event plays, and says so where the event does not count points.
     */
    handicaps: (
      allowancePct: number,
      cap: number,
      rounding: string,
      cut: { threshold: number; pointsPerStroke: number; maxStrokes: number; mode?: 'previous' | 'cumulative' },
      event: { rounds: number; points: boolean; nine: boolean },
    ) => {
      if (allowancePct <= 0) return ['Se juega sin hándicap: nadie recibe golpes de ventaja y cuentan los golpes tal cual.']
      /** «36 puntos», «1 punto», with «Stableford» when the event counts strokes and the cut reads the points beside them. */
      const points = (n: number) => `${n} ${n === 1 ? 'punto' : 'puntos'}${event.points ? '' : ' Stableford'}`
      const each = cut.pointsPerStroke === 1 ? 'cada punto' : `cada ${cut.pointsPerStroke} puntos`
      const cutLine =
        event.rounds <= 1 || cut.maxStrokes <= 0
          ? [event.rounds > 1 ? 'Sin recorte: lo que hagas un día no cambia tu hándicap del siguiente.' : '']
          : event.rounds === 2
            ? [`Recorte del día 2: si en el día 1 haces más de ${points(cut.threshold)}, para el día 2 se te recorta 1 golpe por ${each} por encima, máximo ${cut.maxStrokes}. Nunca se suman golpes.`]
            : [
                `Recorte de hándicap: si en un día haces más de ${points(cut.threshold)}, al día siguiente se te recorta 1 golpe por ${each} por encima, máximo ${cut.maxStrokes}${cut.mode === 'cumulative' ? ' cada vez; los recortes de los días se acumulan' : '; cada día se calcula solo con el anterior'}. Nunca se suman golpes.`,
              ]
      return [
        'El hándicap dice el nivel de cada quien: a más hándicap, más golpes de ventaja, que se le restan a sus golpes para que todos compitan parejo.',
        'El Comité pone el hándicap base de cada jugador: su índice oficial, un estimado de tres rondas suyas o un número que escribe a mano.',
        `Se juega con el ${allowancePct}% del hándicap base, con tope de ${cap}, ${rounding}: ese es el hándicap de juego.`,
        'Los golpes de ventaja se reparten por hoyo según su índice de golpe, del 1 (el más difícil) al 18 (el más fácil), en el tee que juegas: con hándicap de juego 16, recibes un golpe en los hoyos de índice 1 al 16.',
        ...(event.nine ? ['En una ronda de 9 hoyos cuenta la mitad del hándicap de juego.'] : []),
        ...cutLine.filter(Boolean),
        'El Comité puede ajustar un hándicap con un motivo escrito, y queda en el historial que ve todo el torneo.',
      ]
    },
    /** «del 10 al 18, del 13 al 18, del 16 al 18 y el 18»: the last holes the tiebreak looks at, from `countbackWindows`. */
    lastHoles: (windows: Array<[number, number]>) => andList(windows.map(([a, b]) => (a === b ? `el ${a}` : `del ${a} al ${b}`))),
    /** The tiebreak by the last holes, said once in words (COPY-12); `days` > 1 starts it from the last day. */
    tiebreak: (lastHoles: string, days: number, prizes: boolean) =>
      `Desempate por los últimos hoyos: si dos empatan, va adelante quien fue mejor ${days > 1 ? `el último día, luego en los hoyos ${lastHoles}` : `en los hoyos ${lastHoles}`}. Si sigue el empate, ${prizes ? 'se reparten los premios de los lugares que ocupan' : 'comparten el lugar'}.`,
    noPrize: 'Sin premio en dinero.',
    /**
     * `how` comes from the format the tournament plays, so this mirrors the engine. `lastPlace` is null when the
     * tournament gave last place no name of its own: «El último lugar gana Último lugar.» named a trophy nobody set
     * up. Match play breaks a tie on its own countback (holes up in the last day's match), not on the last holes.
     */
    individual: (prizes: string[], lastPlace: string | null, how: string[], tiebreak: string) => [
      ...how,
      prizes.length ? `Premios: ${andList(prizes.map((p, i) => `${ordinal(String(i + 1))} ${p}`))}.` : t.rules.noPrize,
      tiebreak,
      ...(lastPlace ? [`El último lugar gana ${lastPlace}.`] : []),
    ],
    /** Match play breaks a tie on the last match: holes up, not the last holes' scores. */
    matchTiebreak: (days: number, prizes: boolean) =>
      `Empate en puntos: va adelante quien terminó mejor su partido${days > 1 ? ' del último día' : ''} (más hoyos arriba, o menos abajo). Si sigue el empate, ${prizes ? 'se reparten los premios de los lugares que ocupan' : 'comparten el lugar'}.`,
    bestRound: (prize: string | null, days: number, cut: boolean, lastHoles: string) => [
      days > 1
        ? `${prize ? `${prize} cada día` : 'Cada día gana'} al mejor total Stableford de ese día. Lo puede ganar cualquiera, también quien gane el individual.`
        : `${prize ? `${prize} al` : 'Gana el'} mejor total Stableford del día.`,
      ...(cut ? ['Desde el día 2 cuenta el hándicap ya recortado.'] : []),
      `Empate: va adelante quien fue mejor en los hoyos ${lastHoles} de ese día; si sigue, se reparte.`,
    ],
    pairs: (rule: string, prizes: string[], honoree: string | null, o: { auction: string | null; days: number }) => [
      `Parejas fijas${rule ? ` por categorías (${rule})` : ''}, sorteadas ${o.auction ? `al terminar la noche de ${labelInSentence(o.auction)}` : 'por el Comité'}.${honoree ? ` ${honoree} escoge a su pareja.` : ''}`,
      'Puntos de la pareja: la suma de los puntos Stableford de los dos en cada hoyo, cada uno con sus propios golpes de ventaja.',
      prizes.length
        ? `Premios por pareja: ${andList(prizes.map((p, i) => `${ordinal(String(i + 1))} ${p}`))}, la mitad para cada uno. Empate: ${o.days > 1 ? 'gana la pareja con más puntos el último día; si sigue, se reparte' : 'se reparte'}.`
        : t.rules.noPrize,
      `Las parejas juegan juntas${o.days > 1 ? (o.days === 2 ? ' los dos días' : ` los ${o.days} días`) : ''}: cada grupo es de dos parejas.`,
    ],
    /** `game` is the snake's own label; `perSurvivor` and `pot` null when it plays for no money. */
    snake: (threshold: number, perSurvivor: string | null, pot: string | null, game: string) => [
      `En cada grupo, ${labelInSentence(game)} pasa a quien hace ${threshold} putts o más en un hoyo (los putts son los golpes en el green). Si dos o más lo hacen en el mismo hoyo, pasa al que embocó al último.`,
      perSurvivor && pot
        ? `Al terminar la ronda, cada uno de los que no tienen ${labelInSentence(game)} cobra ${perSurvivor} de la bolsa (${pot} por grupo). Si nadie hizo ${threshold} putts, los ${pot} se reparten entre todos los del grupo.`
        : `Es sin dinero: lo que cuenta es no terminar la ronda con ${labelInSentence(game)}.`,
    ],
    fewestPutts: (prize: string | null, pickup: number) => [
      `${prize ? `${prize} a` : 'Gana'} quien haga menos putts en todo el torneo: solo cuentan los golpes en el green. Un hoyo levantado cuenta ${pickup} putts. Empate: se reparte.`,
    ],
    /** `tiers`: the categories with a place of their own in the payout; `game` the auction's label. */
    auction: (opening: string, increment: string, max: number, buyback: number, slots: string[], o: { game: string; tiers: string[]; selfCounts: boolean }) => [
      `${o.game} es una subasta: antes del día 1 se subasta a cada jugador, en orden sorteado, y quien lo compra (su dueño) cobra si a ese jugador le va bien.`,
      `Cada jugador abre la puja por sí mismo en ${opening} y las pujas suben de ${increment} en ${increment}. Si nadie puja más, se queda con él mismo. Máximo ${max} jugadores por dueño${o.selfCounts ? ', contándose a sí mismo' : ''}.`,
      ...(buyback > 0
        ? [`Recompra: al caer el martillo, el jugador puede comprarle a su dueño hasta el ${buyback}% de sí mismo pagándole esa parte del precio (el 50% cuesta la mitad), y cobra esa misma parte.`]
        : []),
      `El pozo es la suma de lo que se pagó por todos y se reparte completo: ${andList(slots)}.`,
      `Cada jugador cobra como máximo un lugar, el mejor que le toque${o.tiers.length ? `: si uno de la categoría ${orList(o.tiers)} queda en un lugar mejor, su lugar de categoría pasa al siguiente de su categoría` : ''}. Lo de cada lugar se reparte entre los dueños del jugador según su parte, y los empates se reparten.`,
      'Al cerrar la subasta, la app muestra quién debe qué.',
    ],
    /** Who signs, by the tournament's rule (`cardSigning`, UX-23). */
    cards: {
      enter: 'Cada grupo captura sus hoyos en la app: golpes, putts y si alguien levantó.',
      pairs: 'Al terminar el día, cada pareja firma la tarjeta de la otra pareja de su grupo. Ya firmada, solo el Comité la corrige, con un motivo.',
      marker: 'Al terminar el día, otro jugador del grupo firma la tarjeta de cada quien; nadie firma la suya. Ya firmada, solo el Comité la corrige, con un motivo.',
      none: 'Las tarjetas no se firman: el grupo corrige sus hoyos mientras el día está en juego, y después el Comité.',
    } as Record<'enter' | 'pairs' | 'marker' | 'none', string>,
    /** COPY-12: «manda la hoja» read as «send the sheet»; the page is what the app computes, and §5 already says it prevails. */
    governance: [
      'El Comité tiene la última palabra. Cada corrección queda registrada con quién, cuándo y por qué, y la ve todo el torneo.',
      'Si una hoja impresa dice otra cosa, vale esta página, que es lo que calcula la app, y el Comité lo aclara.',
    ],
    /** «Palabras de golf»: each shown only when the tournament's rules use it (COPY-12). */
    glossary: {
      par: 'Par: los golpes que marca cada hoyo. Birdie es uno menos, águila dos menos y albatros tres menos; bogey es uno más y doble bogey, dos más.',
      handicap: 'Hándicap: el nivel de cada jugador. Le da golpes de ventaja, que se restan de sus golpes en los hoyos más difíciles.',
      strokeIndex: 'Índice de golpe: el número de cada hoyo del 1 al 18 que dice qué tan difícil es; los golpes de ventaja van primero a los de índice más bajo.',
      net: 'Gross y neto: gross son los golpes que hiciste; neto, esos golpes menos los de ventaja.',
      stableford: 'Stableford: cada hoyo da puntos por cómo quedaste contra el par en neto (par neto 2 puntos, cada golpe menos uno más). Gana quien suma más.',
      pickUp: 'Levantar: recoger la bola y dejar el hoyo cuando ya no vas a sumar.',
      putts: 'Putts: los golpes en el green, la parte del pasto corto alrededor del hoyo.',
      tee: 'Tee: el lugar de salida de cada hoyo; hay varios, de más atrás a más adelante, y cada uno tiene su par e índice de golpe.',
      tiebreak: 'Desempate por los últimos hoyos: entre dos empatados, va adelante el que fue mejor al final de la vuelta.',
      auction: (game: string) => `${game}: la subasta de jugadores. El dueño de un jugador cobra si a ese jugador le va bien.`,
      buyback: 'Recompra: el jugador le compra a su dueño una parte de sí mismo y cobra esa parte.',
      hammer: 'Martillazo: el momento en que se cierra la venta de un jugador.',
    },
    slotName: (slot: string, place: number | undefined, tier: string | undefined, lastPlace: string) => (slot === 'place' ? (place === 1 ? 'Campeón' : place === 2 ? 'Subcampeón' : ordinal(String(place))) : slot === 'bestOfTier' ? `Mejor ${tier}` : lastPlace),
    slot: (slot: string, place: number | undefined, tier: string | undefined, share: number, lastPlace: string) => `${t.rules.slotName(slot, place, tier, lastPlace)} ${Math.round(share * 100)}%`,
  },
  ceremony: {
    title: 'Ceremonia',
    hint: 'Revela uno por uno; en la tele se ve mejor. Con un teclado o un control de presentación: la flecha derecha o la barra espaciadora avanzan, la flecha izquierda regresa.',
    next: 'Siguiente',
    prev: 'Anterior',
    start: 'Empezar la ceremonia',
    done: 'Fin.',
    notFinal: 'El torneo no está cerrado: los resultados son provisionales.',
    reveal: 'Revelar',
    steps: {
      lastPlace: (label: string) => label,
      fewestPutts: (label: string) => label,
      snake: (label: string) => `${label}: totales`,
      bestRound: (label: string, day: number) => `${label}, día ${day}`,
      // What the Comité gave or gave back from a line's «por asignar» (MONEY-05).
      byComite: (label: string) => `${label}: lo que asignó el Comité`,
      pairs: (label: string) => label,
      place: (n: number) => (n === 1 ? 'El campeón' : `${ordinal(String(n))} lugar`),
      auction: (label: string) => `${label}: pagos`,
      money: 'Resumen de dinero',
    },
    /** Over the Calcutta step's list of owners, beside its places (COPY-23: the list had no heading). */
    auctionOwners: 'Lo que cobra cada dueño',
    /** `name` is the tournament's own trophy (`labels.trophy`): «el Putter» for the first one. */
    trophy: (name: string) => `Se lleva ${name}`,
    champion: 'Campeón',
    /** Match points come in halves and read as golf writes them, as on the standings: «1½ puntos», «½ punto». */
    withPoints: (pts: number) => {
      const whole = Math.floor(pts)
      const figure = pts - whole === 0.5 ? `${whole || ''}½` : String(pts)
      return `${figure} ${pts === 1 || pts === 0.5 ? 'punto' : 'puntos'}`
    },
    /** On a plate after «Víbora de Oro», which already says what the holes are. */
    holesHeld: (n: number) => (n === 1 ? '1 hoyo' : `${n} hoyos`),
  },
  print: {
    print: 'Imprimir o guardar PDF',
    /** A11Y-22: the cards/Calcutta switch's name. */
    whatToPrint: 'Qué imprimir',
    hole: 'Hoyo',
    par: 'Par',
    startHole: (n: number) => `Salida por el ${n}`,
    legend: 'Los puntos (•) son los golpes de ventaja en ese hoyo. Arriba golpes, abajo putts.',
    sign: 'Firmas',
    noGroups: 'Esta ronda todavía no tiene grupos.',
    /**
     * The Calcutta on paper (DB-19): the console needs the server for every bid, so a night without it runs on this
     * sheet and the console takes it afterwards.
     */
    cards: 'Tarjetas',
    auctionSheet: 'Hoja de la Calcutta',
    auctionRules: (open: string, step: string, max: number, selfCounts: boolean, buyback: number) =>
      `Cada lote abre en ${open} con el propio jugador y sube de ${step} en ${step}. Cada quien compra hasta ${max} ${max === 1 ? 'jugador' : 'jugadores'}${selfCounts ? ', contándose a sí mismo' : ''}. Al venderse, el jugador puede recomprar hasta el ${buyback} % de sí mismo, pagándole a su dueño esa parte del precio.`,
    lot: 'Lote',
    player: 'Jugador',
    buyer: 'Comprador',
    price: 'Precio',
    buyback: 'Recompra',
    paid: 'Pagó',
    pot: 'Pozo de la Calcutta',
    /** How the night on paper reaches the app once the server is back. */
    auctionAfter: 'Cuando vuelva la señal, en la consola, lote por lote: «Abrir lote», el comprador, «Otra» con el precio, «¡Vendido!» y la recompra.',
  },
  tv: {
    title: 'Modo TV',
    auction: 'La Calcutta',
    now: 'Ahora',
    boards: 'Tableros',
    exit: 'Salir',
    /** Which rows the page shows, when the board takes more than one: «1–9 de 12». */
    range: (from: number, to: number, of: number) => `${from}–${to} de ${of}`,
    invested: 'invirtió',
    worth: 'vale hoy',
    /** Column labels the room reads over the figures (VIS-05). */
    thru: 'hoyo',
    today: 'hoy',
    total: 'total',
    days: 'por día',
    /** The lot card's tier, in words the room reads from the couch (VIS-07): «Categoría C». */
    tier: (tier: string) => `Categoría ${tier}`,
    /** Under the board, which one comes next (MOT-08). */
    next: (board: string) => `Sigue: ${board}`,
    /** The room stops the rotation to read a board (A11Y-21). */
    pause: 'Pausar',
    resume: 'Seguir',
    paused: 'En pausa',
    /** Calcutta night on the TV (MOT-05, UX-17): the lot order out of the hat, then the pairs draw. */
    hatTitle: 'así salieron del sombrero',
    hatMore: (n: number) => (n === 1 ? 'y 1 lote más' : `y ${n} lotes más`),
    drawTitle: (label: string) => `${label}, el sorteo`,
    drawKind: (a: string, b: string) => `Categorías ${andList([a, b])}`,
    drawPicked: (name: string) => `la eligió ${name}`,
  },
  /**
   * The link to watch a tournament without a PIN (STRAT-05, 0053): the Comité's card in Torneo, pestaña Estado, and
   * the page whoever has it opens. Off until the Comité makes it; «Sin dinero» unless it chooses otherwise.
   */
  /** «Guarda tus rondas» (STRAT-08): a player on a PIN keeps the tournament in a profile once it ends. */
  saveResults: {
    title: 'Guarda tus rondas',
    body: (name: string) => `Lo que jugaste en ${name} se queda en tu perfil, en cualquier teléfono.`,
    gets: ['Tus tarjetas y tus resultados, torneo por torneo', 'Tu índice Polo, que se calcula con tus rondas', 'Tu lugar listo para el siguiente torneo del grupo'],
    action: 'Guardar mis rondas',
    actionHere: 'Guardar en mi perfil',
    hint: 'Con tu correo y un código, sin contraseña. Este teléfono no pierde nada.',
  },
  /** The example tournament on `/demo` (STRAT-17): made-up people, read-only, before any account. */
  demo: {
    open: 'Ver un torneo de ejemplo',
    title: 'Torneo de ejemplo',
    intro: 'Así se ve un torneo en Polo cuando termina: el tablero, los juegos, la Calcutta y las cuentas cerradas al peso.',
    introHint: 'Es un ejemplo: los jugadores y los campos son inventados. Toca un nombre o un número para ver cómo se calculó.',
    foot: 'Aquí nadie captura nada. En un torneo tuyo, cada jugador entra con su cara y un PIN, y todos ven esto en vivo.',
    organize: 'Organizar un torneo',
    shareText: 'Mira cómo se ve un torneo de golf en Polo:',
  },
  spectator: {
    title: 'Enlace para ver',
    hint: 'Quien lo tenga ve los tableros en vivo sin cuenta y sin PIN, y desde ahí nadie captura nada. Sirve para la tele, la familia o el grupo de WhatsApp. Ve el nombre corto de cada jugador, nunca su nombre completo ni su foto.',
    none: 'Todavía no hay enlace para ver.',
    moneyLabel: 'Qué muestra',
    noMoney: 'Sin dinero',
    withMoney: 'Con dinero',
    noMoneyHint: 'Sin dinero: los tableros y los juegos, sin premios, pagos, montos ni la Calcutta.',
    withMoneyHint: 'Con dinero: también lo que cada quien gana, paga y debe, y la Calcutta con sus precios. La subasta en la tele lo necesita.',
    create: 'Crear enlace para ver',
    rotate: 'Cambiar enlace',
    rotateBody: 'El enlace de ahora deja de funcionar al instante, también en la tele. Comparte el nuevo con quien deba tenerlo.',
    off: 'Apagar',
    offBody: 'Nadie podrá ver el torneo con este enlace. Si después creas otro, será uno nuevo.',
    /** Turning money on for a link that already exists: whoever has it sees the money from now on. */
    moneyOnTitle: 'Mostrar el dinero',
    moneyOnBody: 'Quien ya tenga este enlace verá el dinero desde ahora. Si lo compartiste en el grupo y el dinero es solo para la tele, primero toca «Cambiar enlace».',
    tv: 'Abrir en modo TV',
    created: 'Enlace creado.',
    rotated: 'Enlace cambiado: el anterior ya no funciona.',
    turnedOff: 'Enlace apagado.',
    moneyOn: 'El enlace ahora muestra el dinero.',
    moneyOff: 'El enlace ya no muestra el dinero.',
    /** A database without 0053 yet. */
    unavailable: 'El enlace para ver todavía no está en el servidor.',
    shareText: (name: string) => `Sigue ${name} en vivo:`,
    // The page the link opens.
    gone: 'Este enlace ya no funciona',
    goneHint: 'El Comité lo cambió o lo apagó. Pídele el nuevo.',
    note: 'Lo ves con el enlace para ver del torneo, sin dinero: se actualiza solo y aquí nadie captura.',
    noteMoney: 'Lo ves con el enlace para ver del torneo, con dinero: se actualiza solo y aquí nadie captura.',
    viewTv: 'Modo TV',
    copy: 'Copiar enlace',
    /** A share card made from the page carries the link (its footer). */
    cardLink: (url: string) => `En vivo: ${url}`,
    /** Calcutta night on the TV with a link «Sin dinero»: the auction is all prices. */
    tvNeedsMoney: 'La subasta se ve en la tele con el enlace para ver con dinero.',
    tvNeedsMoneyHint: 'El Comité lo elige en Comité, sección Torneo, pestaña Estado.',
    /** Comité › Historial: what happened to the link, never the link itself. */
    history: {
      created: (money: boolean) => `Se creó el enlace para ver, ${money ? 'con dinero' : 'sin dinero'}`,
      rotated: 'Se cambió el enlace para ver: el anterior dejó de funcionar',
      money: (money: boolean) => (money ? 'El enlace para ver ahora muestra el dinero' : 'El enlace para ver ya no muestra el dinero'),
      off: 'Se apagó el enlace para ver',
    },
  },
  errors: {
    missingEnv: 'Falta configurar la conexión a la base de datos (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
    offlineFirstOpen: 'Necesitas señal la primera vez que abres la app.',
    notFound: 'Esta página no existe.',
    notFoundHint: 'Revisa el enlace o vuelve al inicio.',
    backHome: 'Volver al inicio',
    forbidden: 'No tienes permiso para ver esto.',
    // What a failure says, from src/lib/humanError.ts (COPY-04). Never the raw error.
    network: 'Sin señal. Vuelve a intentar en cuanto tengas señal.',
    timeout: 'El servidor no respondió a tiempo. Vuelve a intentar en un momento.',
    server: 'El servidor tuvo un problema. Vuelve a intentar en un momento.',
    session: 'Tu sesión se venció. Vuelve a abrir Polo e intenta de nuevo.',
    sessionStart: 'No se pudo abrir tu sesión. Vuelve a intentar en un momento.',
    permission: 'No tienes permiso para hacer esto.',
    duplicate: 'Ya hay uno igual. Cambia lo repetido y vuelve a intentar.',
    linked: 'No se pudo: está ligado a otros datos o ya no existe.',
    invalid: 'Hay un dato que no es válido. Revísalo y vuelve a intentar.',
    tooMany: 'Demasiados intentos seguidos. Espera un minuto.',
    notLoaded: 'El torneo todavía no carga. Vuelve a intentar en un momento.',
    wrongPassword: 'Correo o contraseña incorrectos.',
    emailNotConfirmed: 'Falta confirmar tu correo: usa «Entrar con código».',
    emailTaken: 'Ese correo ya tiene cuenta. Entra con tu contraseña o con código.',
    weakPassword: 'La contraseña necesita al menos 8 caracteres.',
    samePassword: 'La contraseña nueva tiene que ser distinta de la anterior.',
    banned: 'Esta cuenta está bloqueada por ahora.',
    // Not «Algo salió mal»: ErrorBox already says that as its heading.
    unknown: 'No se pudo completar. Vuelve a intentar.',
    /** `ref`: a code, an HTTP status or the error's class, for support; never the message. */
    unknownRef: (ref: string) => `No se pudo completar (ref. ${ref}). Vuelve a intentar.`,
    image: 'No se pudo procesar la imagen. Prueba con otra foto.',
  },
} as const

export type Copy = typeof t
