/**
 * All app copy, Spanish (Mexico). One file so a second language is a file,
 * not a refactor (CLAUDE.md §0.5). Tone: fun, light roasting, never mean;
 * money copy always crystal clear.
 */
export const t = {
  app: {
    name: 'Cardi-Golf',
    tagline: 'Torneos de golf entre amigos',
    description: 'Marcador en vivo, juegos, Calcutta y dinero. Sin discusiones.',
  },
  nav: {
    live: 'En vivo',
    card: 'Tarjeta',
    games: 'Juegos',
    money: 'Dinero',
    more: 'Más',
  },
  home: {
    myTournaments: 'Mis torneos',
    newTournament: 'Nuevo torneo',
    joinTitle: '¿Te invitaron a un torneo?',
    joinHint: 'Escribe el código de 6 letras que te mandaron.',
    joinPlaceholder: 'CÓDIGO',
    joinButton: 'Entrar',
    organizerTitle: '¿Organizas uno?',
    organizerHint: 'Inicia sesión con tu correo para crear y configurar torneos.',
    organizerButton: 'Iniciar sesión',
    comingSoon: 'Llega en el siguiente milestone.',
  },
  enter: {
    title: 'Entrar',
    tapYourFace: 'Toca tu cara',
    pin: 'Tu PIN',
    pinHint: '4 dígitos. Si no lo tienes, pídeselo al Comité.',
    wrongPin: 'Ese PIN no es. Sí, cómo no.',
    locked: 'Muchos intentos. Espera 5 minutos.',
  },
  install: {
    title: 'Agrégala a tu pantalla de inicio',
    why: 'Así abre en un toque, a pantalla completa y funciona sin señal.',
    ios: 'iPhone: toca Compartir (el cuadro con la flecha) y luego "Agregar a pantalla de inicio".',
    android: 'Android: toca el menú ⋮ y luego "Instalar app" o "Agregar a pantalla de inicio".',
    done: 'Ya la tengo',
  },
  sync: {
    synced: 'Sincronizado',
    pending: (n: number) => (n === 1 ? '1 pendiente' : `${n} pendientes`),
    offline: 'Sin señal · se guarda en el teléfono',
  },
  status: {
    setup: 'En preparación',
    auction: 'Noche de Calcutta',
    live: 'En juego',
    finished: 'Terminado',
  },
  round: {
    day: (n: number) => `Día ${n}`,
    hole: (n: number) => `Hoyo ${n}`,
    thru: (n: number) => (n === 18 ? 'F' : `${n}`),
  },
  money: {
    ifEndedNow: 'si terminara ahora',
    paid: 'Pagó',
    receives: 'Recibe',
    net: 'Neto',
    markPaid: 'Pagado',
    howCalculated: '¿Cómo se calculó?',
  },
  errors: {
    missingEnv:
      'Falta configurar la conexión a la base de datos (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
    offlineFirstOpen: 'Necesitas señal la primera vez que abres la app.',
    notFound: 'Esa página no existe. ¿Te pasaste de hoyo?',
    backHome: 'Volver al inicio',
  },
} as const

export type Copy = typeof t
