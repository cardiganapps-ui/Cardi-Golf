/**
 * /design — living style guide for direction A ("La tarjeta").
 * Renders tokens, the type scale and every primitive with real data from
 * the fixtures. It imports the same components the app uses.
 */
import { useMemo, useState } from 'react'
import { dataFromSnapshot } from '../data/tournamentStore'
import { getFixture } from '../dev/fixtures'
import { IconCheck, IconChevronLeft, IconChevronRight, IconCoin, IconFlag, IconGames, IconMore, IconOffline, IconPencil, IconPlus, IconShare, IconSnake, IconTrophy, IconUndo } from '../components/icons'
import { Board, BoardHead, Button, EmptyState, EventName, Field, Figure, Input, LeaderRow, LiveStatus, LogoMark, Money, Plate, ScoreMark, ScorecardGrid, Segmented, Stepper, TabBar, Wordmark, toPar, type GridHole } from '../components/primitives'
import { SheetFrame, Skeleton, ToastItem } from '../components/ui'
import { contrast as ratio, luminance } from '../lib/contrast'
import { cssVar } from '../lib/tokens'
import { ACCENTS } from './accents'
import s from './DesignScreen.module.css'


const COLOR_ROLES: Array<{ name: string; role: string; on?: string }> = [
  { name: 'bg', role: 'card stock, background' },
  { name: 'surface', role: 'ruled area, skeletons' },
  { name: 'ink', role: 'graphite, text and figures', on: '--bg' },
  { name: 'ink-2', role: 'secondary text', on: '--bg' },
  { name: 'accent', role: 'live, primary action, my row', on: '--bg' },
  { name: 'under', role: 'under par (figures only)', on: '--bg' },
  { name: 'over', role: 'over par (figures only)', on: '--bg' },
  { name: 'caution', role: 'pending, unsigned', on: '--bg' },
  { name: 'rule', role: 'hairlines' },
  { name: 'board-bg', role: 'TV and ceremony surface' },
  { name: 'board-ink', role: 'figures on the board', on: '--board-bg' },
  { name: 'board-accent', role: 'leader plate, live mark', on: '--board-bg' },
]
const SCALE: Array<[string, string, string]> = [
  ['2xs', '11', 'table headers, captions'],
  ['xs', '12', 'meta'],
  ['sm', '14', 'secondary text, dense rows'],
  ['md', '16', 'body, names'],
  ['lg', '18', 'lead, dense figures'],
  ['xl', '22', 'leaderboard figure, section titles'],
  ['2xl', '28', 'screen titles, stepper'],
  ['3xl', '36', 'hole number, large stepper'],
  ['4xl', '56', 'hero figure (ceremony, share)'],
]

export function DesignScreen() {
  const fx = useMemo(() => {
    const f = getFixture('full12-live')!
    return { f, data: dataFromSnapshot(structuredClone(f.snapshot)) }
  }, [])
  const large = useMemo(() => {
    const f = getFixture('large60')!
    return dataFromSnapshot(structuredClone(f.snapshot))
  }, [])
  const long = useMemo(() => getFixture('longnames')!, [])
  const [strokes, setStrokes] = useState(4)
  const [putts, setPutts] = useState(2)
  const [seg, setSeg] = useState<'pts' | 'gross'>('pts')
  const [accent, setAccent] = useState(ACCENTS[0]!)
  const COLORS = useMemo(() => COLOR_ROLES.map((c) => ({ ...c, hex: cssVar(`--${c.name}`), on: c.on ? cssVar(c.on) : undefined })), [])

  const nameOf = (id: string, d = fx.data) => d.snapshot.players.find((p) => p.id === id)?.displayName ?? id
  const rows = fx.data.state.modules.individual!.rows
  const r2 = fx.data.state.core.rounds.r2!
  const grossToPar = (pid: string) => {
    let d = 0
    for (const rid of fx.data.state.core.roundIds) for (const h of fx.data.state.core.rounds[rid]?.[pid]?.holes ?? []) if (h.played && !h.pickedUp && h.gross != null) d += h.gross - h.par
    return d
  }
  const holes: GridHole[] = (fx.data.state.core.rounds.r1!.p1!.holes ?? []).map((h) => ({ n: h.hole, par: h.par, si: h.strokeIndex, gross: h.gross, pickedUp: h.pickedUp, pts: h.points }))
  const largeRows = large.state.modules.individual!.rows

  return (
    <div style={{ '--event-accent': accent.hex } as React.CSSProperties}>
      <div className={s.page}>
        <header className={s.stack}>
          <Wordmark size={22} />
          <h1 className={s.pageTitle}>Sistema de diseño · dirección A, «La tarjeta»</h1>
          <p className={s.lede}>Tokens, escala tipográfica y primitivas del rediseño, con datos reales de los fixtures. Son los mismos componentes que usa la app; la fase 3 los lleva a cada pantalla.</p>
        </header>

        {/* ---- Color ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Color</h2>
          <p className={s.cap}>Cartulina, grafito, un acento (fairway) y dos colores semánticos por convención del golf: rojo bajo par, azul sobre par. El número en cada muestra es el contraste WCAG medido contra su fondo.</p>
          <div className={s.swatches}>
            {COLORS.map((c) => (
              <div key={c.name} className={s.swatch}>
                <div className={s.swatchColor} style={{ background: c.hex, color: c.on ? c.on : luminance(c.hex) > 0.4 ? 'var(--ink)' : 'var(--on-dark)' }}>
                  {c.on ? `${ratio(c.hex, c.on)}:1` : ''}
                </div>
                <span className={s.swatchName}>--{c.name}</span>
                <span className={s.swatchHex}>
                  {c.hex.toUpperCase()}, {c.role}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Type ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Tipografía</h2>
          <p className={s.cap}>Archivo (variable: peso y anchura) para todo; los números van semicondensados (anchura 90) y siempre tabulares. Fraunces solo para el nombre del evento.</p>
          <div className={s.specimen}>
            {SCALE.map(([k, px, role]) => (
              <div key={k} className={s.specimenRow}>
                <span className={s.specimenMeta}>{px} px</span>
                <span style={{ fontSize: `${px}px`, lineHeight: 1.15, fontWeight: Number(px) >= 22 ? 600 : 400 }}>
                  {Number(px) >= 22 ? '−3 · E · +2 · T3 · 36' : `${k} · ${role}`}
                </span>
              </div>
            ))}
          </div>
          <div className={s.grid2}>
            <div className={s.stack}>
              <h3 className={s.h3}>Figuras tabulares</h3>
              <div className={s.figColumn}>
                {[
                  ['1', '−4'],
                  ['T2', 'E'],
                  ['T2', '+1'],
                  ['10', '+11'],
                  ['60', '+38'],
                ].map(([a = '', b = 'E']) => {
                  const n = b === 'E' ? 0 : Number(b.replace('−', '-'))
                  const tp = toPar(n)
                  return (
                    <span key={`${a}${b}`} style={{ display: 'contents' }}>
                      <Figure>{a}</Figure>
                      <Figure tone={tp.tone}>{tp.text}</Figure>
                    </span>
                  )
                })}
              </div>
              <span className={s.cap}>Signo menos verdadero (−) y «E» para par. Alineación a la derecha, sin saltos.</span>
            </div>
            <div className={s.stack}>
              <h3 className={s.h3}>Dinero</h3>
              <div className={s.figColumn} style={{ gridTemplateColumns: 'auto' }}>
                <Money amount={12000} />
                <Money amount={2500} signed />
                <Money amount={-1125} signed />
                <Money amount={0} signed />
              </div>
              <span className={s.cap}>MXN sin decimales; signo y color solo en netos.</span>
            </div>
          </div>
          <div className={s.stack}>
            <h3 className={s.h3}>El nombre del evento</h3>
            <EventName name="Nacho's Bachelor Invitational" tagline="Los Cabos, abril de 2027" />
            <EventName name={long.snapshot.tournament.name} tagline={long.snapshot.tournament.tagline ?? undefined} />
            <EventName name="Sábado en Bosques" small />
          </div>
        </section>

        {/* ---- Space, radius, motion ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Espacio, radios, movimiento</h2>
          <div className={s.scale}>
            {[4, 8, 12, 16, 20, 24, 32, 40, 48].map((n) => (
              <div key={n}>
                <div className={s.scaleBox} style={{ width: n, height: n }} />
                <div className={s.scaleLabel}>{n}</div>
              </div>
            ))}
          </div>
          <dl className={s.kv}>
            <dt>Radios</dt>
            <dd>4 px controles y marcas · 10 px sheets y objetos reales · redondo solo avatares y el punto en vivo</dd>
            <dt>Bordes</dt>
            <dd>1 px hairline (--rule); 2 px regla gruesa en tinta para abrir una tabla</dd>
            <dt>Elevación</dt>
            <dd>Solo lo que flota: sheet y toast. Nada más tiene sombra.</dd>
            <dt>Movimiento</dt>
            <dd>150 / 200 / 250 ms, ease-out. Un solo momento orquestado (reordenar la tabla, revelar el campeón). Se apaga con prefers-reduced-motion.</dd>
          </dl>
          <div className={s.motionDemo}>
            <div className={s.motionBox} />
            <span className={s.cap}>200 ms · toca o pasa el cursor</span>
          </div>
        </section>

        {/* ---- Icons ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Iconos</h2>
          <p className={s.cap}>Un solo set en SVG, rejilla de 24 px, trazo 1.75. Solo donde un icono acelera el reconocimiento. Sin emoji.</p>
          <div className={s.iconRow}>
            {[
              [IconFlag, 'En vivo'],
              [IconPencil, 'Tarjeta'],
              [IconGames, 'Juegos'],
              [IconCoin, 'Dinero'],
              [IconMore, 'Más'],
              [IconCheck, 'Guardado'],
              [IconUndo, 'Deshacer'],
              [IconOffline, 'Sin señal'],
              [IconShare, 'Compartir'],
              [IconSnake, 'Víbora'],
              [IconTrophy, 'Campeón'],
              [IconChevronLeft, 'Anterior'],
              [IconChevronRight, 'Siguiente'],
              [IconPlus, 'Más uno'],
            ].map(([I, label]) => {
              const Icon = I as typeof IconFlag
              return (
                <span key={label as string} className={s.iconItem}>
                  <Icon />
                  {label as string}
                </span>
              )
            })}
          </div>
        </section>

        {/* ---- Buttons ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Botones</h2>
          {(['primary', 'secondary', 'quiet', 'danger'] as const).map((v) => (
            <div key={v} className={s.states}>
              {[
                ['normal', {}],
                ['presionado', { pressed: true }],
                ['foco', { focus: true }],
                ['deshabilitado', { disabled: true }],
              ].map(([label, props]) => (
                <div key={label as string}>
                  <div className={s.stateLabel}>
                    {v} · {label as string}
                  </div>
                  <Button variant={v} {...(props as object)}>
                    {v === 'primary' ? 'Guardar hoyo' : v === 'danger' ? 'Borrar' : v === 'quiet' ? 'Deshacer' : 'Ver tarjeta'}
                  </Button>
                </div>
              ))}
            </div>
          ))}
          <div className={s.row}>
            <Button variant="primary" size="sm">
              Entrar
            </Button>
            <Button size="sm">Comité</Button>
            <Button variant="quiet" size="sm">
              ¿Cómo se calculó?
            </Button>
          </div>
        </section>

        {/* ---- Inputs ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Campos</h2>
          <div className={s.grid2}>
            <Field label="Correo" hint="El de tu cuenta de organizador">
              <Input type="email" placeholder="tu@correo.com" />
            </Field>
            <Field label="Código de 6 letras">
              <Input code placeholder="CÓDIGO" maxLength={6} />
            </Field>
            <Field label="Nombre del torneo" error="Escribe al menos 3 letras">
              <Input error defaultValue="Na" />
            </Field>
            <Field label="Hándicap base">
              <Input inputMode="decimal" defaultValue="14.2" />
            </Field>
          </div>
        </section>

        {/* ---- Score entry ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Captura de un hoyo</h2>
          <p className={s.cap}>Los cuatro jugadores en una pantalla. Golpes en grande (arranca en par), putts en pequeño. Un toque en «Guardar» avanza al siguiente hoyo; el toast ofrece deshacer.</p>
          <div className={s.phone}>
            <div className={s.phoneBody}>
              <div className={s.holeHead}>
                <span className={s.holeNum}>
                  <Figure>12</Figure>
                </span>
                <span className={s.holeMeta}>
                  <span>Par 4</span> <span>SI 2</span> <span>388 m</span>
                </span>
                <LiveStatus text="Guardado" />
              </div>
              {[
                ['Diego A.', 1, 4, 2],
                ['Ignacio S.', 2, 4, 2],
                ['Martín Á.', 1, 4, 2],
                ['Nicolás C.', 1, 4, 2],
              ].map(([name, dots, st, pt], i) => (
                <div key={name as string} className={s.entryRow}>
                  <span className={s.entryName}>
                    <span className={s.entryNameMain}>{name as string}</span>
                    <span className={s.dots}>{'•'.repeat(dots as number)}</span>
                  </span>
                  <Stepper label={`Golpes de ${name}`} value={i === 0 ? strokes : (st as number)} par={4} onChange={i === 0 ? setStrokes : () => undefined} />
                  <span className={s.entryPutts}>
                    <strong>{i === 0 ? putts : (pt as number)}</strong>
                    putts
                  </span>
                </div>
              ))}
              <div className={s.row}>
                <Stepper label="Putts de Diego" value={putts} onChange={setPutts} min={0} max={6} />
                <Button variant="quiet" size="sm">
                  Levantó
                </Button>
              </div>
              <Button variant="primary" block>
                Guardar hoyo 12
              </Button>
              <ToastItem text="Hoyo 12 guardado" action="Deshacer" />
            </div>
          </div>
        </section>

        {/* ---- Leaderboard ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Tabla de posiciones</h2>
          <p className={s.cap}>Nombre corto en la fila, nombre completo en la ficha. Una sola fila para todos los formatos: la cifra principal cambia (puntos, gross a par, putts, dinero, total de pareja). Empates con T, movimiento con una punta discreta, mi fila marcada con la regla del evento.</p>
          <div className={s.row}>
            <LiveStatus text="Actualizado hace 1 min" />
            <Segmented
              value={seg}
              options={[
                { value: 'pts', label: 'Puntos' },
                { value: 'gross', label: 'Gross' },
              ]}
              onChange={setSeg}
            />
          </div>
          <Board>
            <BoardHead figureLabel={seg === 'pts' ? 'Pts' : 'A par'} />
            {rows.slice(0, 8).map((r, i) => {
              const pr = r2[r.playerId]
              const tp = toPar(grossToPar(r.playerId))
              return (
                <LeaderRow
                  key={r.playerId}
                  pos={r.label}
                  name={nameOf(r.playerId)}
                  sub={fx.data.snapshot.players.find((p) => p.id === r.playerId)?.tier ? `Categoría ${fx.data.snapshot.players.find((p) => p.id === r.playerId)!.tier}` : undefined}
                  today={pr ? String(pr.points) : undefined}
                  thru={pr ? (pr.thru === 18 ? 'F' : String(pr.thru)) : undefined}
                  figure={seg === 'pts' ? String(r.total) : tp.text}
                  tone={seg === 'pts' ? 'even' : tp.tone}
                  mine={r.playerId === 'p9'}
                  moved={i === 1 ? 'up' : i === 4 ? 'down' : null}
                />
              )
            })}
          </Board>
          <h3 className={s.h3}>Nombres largos</h3>
          <Board>
            <BoardHead figureLabel="Pts" />
            {long.snapshot.players.slice(0, 3).map((p, i) => (
              <LeaderRow key={p.id} pos={String(i + 1)} name={p.displayName} sub={p.fullName} today="14" thru="9" figure={String(31 - i * 2)} />
            ))}
          </Board>
          <h3 className={s.h3}>60 jugadores (filas densas)</h3>
          <Board>
            <BoardHead figureLabel="Pts" dense />
            {largeRows.slice(0, 12).map((r) => {
              const pr = large.state.core.rounds.r2?.[r.playerId]
              return <LeaderRow key={r.playerId} dense pos={r.label} name={nameOf(r.playerId, large)} today={pr ? String(pr.points) : ''} thru={pr ? String(pr.thru) : ''} figure={String(r.total)} mine={r.playerId === 'p17'} />
            })}
          </Board>
          <h3 className={s.h3}>Pareja y dinero como cifra</h3>
          <Board>
            <BoardHead figureLabel="Neto" />
            {fx.data.snapshot.players.slice(0, 3).map((p, i) => {
              const m = fx.data.state.money.people[p.id]!
              return <LeaderRow key={p.id} pos={String(i + 1)} name={p.displayName} sub={`Pagó ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(m.paid)}`} figure={`${m.net < 0 ? '−' : '+'}$${Math.abs(m.net).toLocaleString('es-MX')}`} tone={m.net < 0 ? 'under' : 'even'} />
            })}
          </Board>
        </section>

        {/* ---- Scorecard ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Tarjeta con notación a lápiz</h2>
          <p className={s.cap}>Círculo = birdie, doble círculo = águila o mejor, cuadro = bogey, doble cuadro = doble o peor. Ida, vuelta y total; la primera columna se queda fija al desplazar.</p>
          <div className={s.row}>
            <ScoreMark value={2} kind="eagle" />
            <ScoreMark value={3} kind="birdie" />
            <ScoreMark value={4} kind="par" />
            <ScoreMark value={5} kind="bogey" />
            <ScoreMark value={7} kind="double" />
            <ScoreMark value="–" kind="pickup" />
            <span className={s.cap}>águila · birdie · par · bogey · doble · levantó</span>
          </div>
          <ScorecardGrid holes={holes} playerLabel={nameOf('p1')} showPoints />
        </section>

        {/* ---- Navigation ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Navegación</h2>
          <div className={s.phone}>
            <div className={s.phoneBody}>
              <EventName name="Nacho's Bachelor Invitational" small logoUrl={null} />
              <div className={s.row}>
                <span className={s.cap}>Día 2 en juego</span>
                <LiveStatus text="Actualizado hace 1 min" />
              </div>
            </div>
            <TabBar
              items={[
                { icon: <IconFlag />, label: 'En vivo', active: true },
                { icon: <IconPencil />, label: 'Tarjeta' },
                { icon: <IconGames />, label: 'Juegos' },
                { icon: <IconCoin />, label: 'Dinero' },
                { icon: <IconMore />, label: 'Más' },
              ]}
            />
          </div>
          <div className={s.row}>
            <Segmented
              value="individual"
              options={[
                { value: 'individual', label: 'Individual' },
                { value: 'pairs', label: 'Parejas' },
                { value: 'snake', label: 'Víbora' },
              ]}
              onChange={() => undefined}
            />
          </div>
        </section>

        {/* ---- Sheet, toast, skeleton, empty ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Sheet, toast, esqueleto, vacío</h2>
          <SheetFrame title="¿Quién embocó al último?">
            <div className={s.stack}>
              <span className={s.cap}>Diego A. e Ignacio S. hicieron 3 putts en el 12.</span>
              <div className={s.row}>
                <Button>Diego A.</Button>
                <Button>Ignacio S.</Button>
              </div>
            </div>
          </SheetFrame>
          <div className={s.row}>
            <ToastItem text="Sin señal: se guardará al reconectar" />
            <ToastItem text="3 pendientes" />
          </div>
          <div className={s.stack}>
            <div className={s.stateLabel}>Esqueleto de la tabla (misma altura que la fila real: sin saltos)</div>
            {[0, 1, 2].map((i) => (
              <div key={i} className={s.row} style={{ minHeight: 52, borderBottom: 'var(--hairline)' }}>
                <Skeleton w={24} h={16} />
                <Skeleton w={i === 1 ? '45%' : '60%'} h={16} />
                <span style={{ marginLeft: 'auto' }}>
                  <Skeleton w={40} h={22} />
                </span>
              </div>
            ))}
          </div>
          <EmptyState title="Todavía no hay scores" body="Cuando el grupo guarde el primer hoyo, la tabla aparece aquí." action={<Button size="sm">Ir a la tarjeta</Button>} />
        </section>

        {/* ---- Event personalization ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Acento del evento</h2>
          <p className={s.cap}>El organizador elige uno de seis. Se aplica a la regla bajo el nombre, al botón principal y a «mi fila». Nada más cambia.</p>
          <div className={s.accents}>
            {ACCENTS.map((a) => (
              <button key={a.id} type="button" className={`${s.accentCard} ${accent.id === a.id ? s.accentOn : ''}`} style={{ '--event-accent': a.hex } as React.CSSProperties} onClick={() => setAccent(a)}>
                <EventName name="Copa Tres Marías" small />
                <span className="wave" aria-hidden="true" />
                <Button variant="primary" size="sm">
                  Entrar
                </Button>
                <span className={s.cap}>
                  {a.name}, {a.hex.toUpperCase()}, blanco {ratio(cssVar('--surface-2'), a.hex)}:1
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ---- Board surface ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Superficie de tablero (TV y ceremonia)</h2>
          <p className={s.cap}>La placa numérica vive aquí, no en las listas del teléfono. Amarillo solo para el líder.</p>
          <div className={s.boardFrame}>
            {rows.slice(0, 5).map((r, i) => (
              <div key={r.playerId} className={s.boardRow}>
                <span className={s.boardPos}>{r.label}</span>
                <span>{nameOf(r.playerId)}</span>
                <Plate value={String(r.total)} leader={i === 0} />
              </div>
            ))}
          </div>
        </section>

        {/* ---- Brand ---- */}
        <section className={s.section}>
          <h2 className={s.h2}>Marca</h2>
          <p className={s.cap}>Polo: una tarjeta con un 3 rodeado a lápiz, el birdie, junto al nombre en Archivo 700. El mismo símbolo es el ícono de la app y firma las imágenes para compartir. A color sobre cartulina, a una tinta y sobre el tablero.</p>
          <div className={s.row}>
            <LogoMark size={64} />
            <Wordmark size={36} mark={false} />
            <Wordmark size={36} />
          </div>
          <div className={s.row}>
            <Wordmark size={20} />
            <Wordmark size={20} tone="mono" />
            <span className={s.boardSwatch}>
              <Wordmark size={20} tone="board" />
            </span>
          </div>
          <div className={s.row}>
            <img src="/icons/icon-192.png" alt="" width={96} height={96} className={s.appIcon} />
            <img src="/icons/icon-192.png" alt="" width={48} height={48} className={s.appIcon} />
            <span className={s.cap}>ícono de la app (scripts/make-icons.mjs, colores leídos de tokens.css)</span>
          </div>
        </section>
      </div>
    </div>
  )
}
