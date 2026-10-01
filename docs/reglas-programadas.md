# Las reglas, tal como quedaron programadas

Resumen en español de lo que hace el motor (`src/engine/`) para el primer torneo. Cada número de la app sale de aquí y todos tienen su "¿Cómo se calculó?". Si algo no coincide con la hoja de reglas impresa, avísale a Claude: la hoja y `CLAUDE.md` §5 mandan.

Todo lo que abajo dice "2,500", "80%", "36 puntos", "$200", etc. es un **ajuste del torneo**, no un número fijo de la app. Otro torneo puede cambiarlo desde el admin sin tocar código.

## Hándicaps

1. **Hándicap base.** El Comité lo captura por jugador. Puede ser (a) un número a mano, que se usa tal cual; (b) un índice WHS, que se convierte a hándicap de campo con la fórmula oficial `índice × slope ÷ 113 + (rating − par)` del tee que juega; o (c) un **estimado** a partir de tres scores (buen día, día normal, mal día): se calcula el diferencial de cada uno, se pesan 45% / 40% / 15% y se redondea a un decimal. Mientras sea estimado, la app lo marca como tal.
2. **Hándicap de juego del día 1** = 80% del hándicap base (tope 54), redondeado al entero más cercano (.5 sube). Ejemplos: 14 → 11, 21.875 → 18, 60 → 43.
3. **Golpes por hoyo.** Con hándicap de juego H: un golpe en los hoyos cuyo índice de dificultad (SI) sea ≤ H; si H ≥ 18, un golpe en todos y el segundo en los SI ≤ H − 18, etc. Ejemplo: H 43 → 3 golpes en SI 1–7 y 2 en SI 8–18.
4. **Recorte anti-sandbag del día 2.** Si el día 1 haces más de 36 puntos, pierdes 1 golpe por cada 2 puntos arriba de 36, máximo 4. Ejemplos: 37 → 0, 38 → 1, 42 → 3, 47 → 4. El hándicap del día 2 es el del día 1 menos el recorte, nunca menor que 0. Nadie gana golpes nunca. Aplica a todos los juegos con hándicap.
5. **Ajustes del Comité.** Cualquier hándicap de juego se puede sobreescribir para un día con una razón; queda en la bitácora y se muestra en el "¿Cómo se calculó?".
6. **Dos campos.** Solmar y Quivira: par y SI son por ronda. Hay un ajuste opcional (apagado) para recalcular el hándicap de campo por tee cada día.
7. **Rondas de 9 hoyos** (otros torneos): se juega la mitad del hándicap de juego (.5 sube), repartida entre esos nueve hoyos: se ordenan del 1 al 9 por su SI de 18 hoyos y los golpes se dan en ese orden, dando la vuelta si sobran. Ejemplo: hándicap de juego 16 → 8 golpes, uno en cada hoyo menos el más fácil de los nueve. (Antes se daban contra el SI de 18 y se perdía casi la mitad.)

## Formatos por golpes (otros torneos)

- **Stroke play, equipos por golpes y el juego «Low neto»** ordenan por golpes contra el par sobre los hoyos jugados: en vivo, −12 tras 12 hoyos va arriba de +8 tras 4.
- **Al cierre, una tarjeta incompleta queda después de las completas** (un jugador que se retira a la vuelta no gana con 9 hoyos). La app lo avisa con los hoyos jugados. En Stableford no hace falta: los hoyos sin capturar no suman.
- **Equipos en la Calcutta:** cada equipo ocupa un solo lugar; su slot se reparte entre sus jugadores (y de ahí entre los dueños de cada uno). El equipo campeón cobra el slot del campeón y el segundo equipo el del subcampeón.

## Individual (Stableford, el juego principal)

- Puntos por hoyo: `par + golpes de ventaja − golpes reales + 2`, mínimo 0. Doble bogey neto o peor = 0, bogey = 1, par = 2, birdie = 3, eagle = 4.
- "Levantar" = 0 puntos en ese hoyo.
- Suma de los 36 hoyos.
- Premios: $10,000 / $5,000 / $3,000 / $2,000.
- **Desempate (countback):** total del día 2, luego hoyos 10–18 del día 2, luego 13–18, luego 16–18, luego el hoyo 18. Si siguen empatados, comparten los premios de los lugares que ocupan, a partes iguales. Dos empatados en primero: ($10,000 + $5,000) ÷ 2 = $7,500 cada uno. Los empates se muestran con "T" (T3).
- El último lugar es **La Cuchara de Palo** y además cobra un slot de la Calcutta.

## Mejor ronda del día

- $1,200 cada día al mayor total de puntos de ese día. Cualquiera puede ganarlo aunque gane el individual.
- El día 2 usa los hándicaps ya recortados.
- Empate: countback dentro de ese día (10–18, 13–18, 16–18, 18); si persiste, se reparte.

## Los Matrimonios (parejas)

- Seis parejas fijas: cada A con un D, cada B con un C. Nacho escoge a su pareja; el resto sale al azar.
- Puntos de la pareja = suma de los puntos Stableford de los dos en cada hoyo, 36 hoyos, cada quien con sus golpes.
- Premios: 1ª pareja $2,000 ($1,000 cada uno), 2ª $1,000 ($500 cada uno).
- Empate: mejor día 2 combinado; si persiste, se reparte.
- Los grupos del día 2 salen de la tabla: parejas 5 y 6 salen primero, luego 3 y 4, y las dos primeras cierran. El Comité puede cambiarlos; la app avisa si un grupo no es una pareja A+D con una B+C.

## La Víbora (por grupo, por día)

- La víbora la tiene quien hizo **3 o más putts** más recientemente, siguiendo el orden en que el grupo juega los hoyos (si salen por el 10, el hoyo 2 va después del 18).
- Si dos o más hacen 3 putts en el mismo hoyo, se la queda el que **emboca al último**; la app lo pregunta al guardar ese hoyo y, hasta que se conteste, ese grupo queda "pendiente" y no se reparte nada.
- Al terminar la ronda, los tres que **no** la tienen cobran $200 cada uno; el que la tiene, $0 y carga la víbora de goma hasta la siguiente ronda.
- Si nadie hizo 3 putts en todo el día, los cuatro se reparten los $600 ($150 cada uno).
- Levantar la bola no pasa la víbora, salvo que sí hayas anotado 3 o más putts.
- Total: 3 grupos × 2 días × $600 = $3,600.

## Menos putts

- $1,000 al menor total de putts en 36 hoyos. Solo cuentan golpes en el green.
- Hoyo levantado sin putts anotados: cuenta 3 putts (ajuste; el Comité lo puede cambiar).
- Empate: se reparte.

## Bolsa de premios

$20,000 individual + $3,000 Matrimonios + $2,400 mejor ronda + $3,600 Víbora + $1,000 putts = **$30,000 = 12 × $2,500**. La app no deja guardar una configuración que no cuadre.

## La Calcutta (bolsa aparte)

- Cada jugador se subasta una vez. Abre en $250 y él mismo es el postor inicial; pujas de $250 en $250. Si nadie sube, se queda consigo mismo.
- Máximo 3 jugadores por dueño (comprarse a uno mismo cuenta). Solo pujan los 12.
- **Recompra:** justo después del martillazo, el jugador puede recomprar hasta el 50% de sí mismo pagándole a su dueño esa proporción del precio (50% = la mitad). Eso se paga directo entre ellos.
- **Pozo** = suma de los martillazos, todo se reparte:
  - Campeón 55% · Subcampeón 20% · Mejor C 10% · Mejor D 10% · Cuchara de Palo 5%.
- Cada jugador cobra **un solo slot, el más alto**. Si un C o D queda 1º o 2º, el slot de su categoría pasa al siguiente mejor de esa categoría.
- Los lugares salen de la tabla final del individual, con countback. Un empate en la frontera de un slot reparte los slots combinados entre los empatados (dos empatados en primero: (55% + 20%) ÷ 2 = 37.5% cada uno).
- El dinero de cada slot se reparte entre los dueños del jugador según su porcentaje (con recompra del 50%: mitad y mitad).
- Todo en pesos enteros; los centavos que sobren van a los dueños del campeón para que el reparto sume exactamente el pozo.

## Dinero

- Inscripciones ($2,500 × 12) y martillazos van al banquero. Recompras van de jugador a dueño. El banquero paga premios y repartos de la Calcutta.
- Por persona: **Pagó** (inscripción + compras + recompras pagadas), **Recibe** (premios + Calcutta + recompras cobradas) y **Neto**.
- La app comprueba que lo que entró al banco es lo que sale; mientras haya premios abiertos (ronda en juego, víbora pendiente) lo marca en rojo como "por asignar".
- Liquidación por defecto "vía banco", sobre lo que falta por pagar: lo marcado como pagado (por ejemplo, inscripciones y martillazos cobrados la noche de la Calcutta) no se vuelve a pedir. Cada quien queda a mano con el banco en una línea: sus premios pendientes menos lo que todavía deba. Opción "sin banco": lista mínima de transferencias entre personas sobre lo mismo (el que más debe le paga al que más recibe); lo que ya está en el banco lo reparte el banquero, que también se queda con lo de la casa.

## Lo que aún no está programado (viene en M3–M6)

Feed de eventos, estadísticas y premios divertidos, ceremonia y tarjetas para compartir. El motor ya guarda lo necesario (hoyos con la víbora, putts de 1 y 3, etc.).
