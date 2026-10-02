# Polo · Runbook del torneo

Una página para el Comité. Todo lo que hay que hacer, en orden, y qué hacer cuando algo falla. La app vive en **https://golf.cardigan.mx** (o https://cardi-golf.vercel.app); el Comité entra como jugador con su PIN (los admins ven "Consola del Comité" en **Más**) o como organizador en `/organizer/login`.

## 0. Antes del viaje (checklist)

Comité › Torneo empieza con **«Para empezar»**: dice qué falta (jugadores, PIN, días con campo y fecha, la tarjeta del campo, tees de otro campo que hayan quedado en un día, equipos o parejas si se juega por equipos o fourball, en match play que el cuadro quepa en los días, tees y grupos del siguiente día) y cada línea abre su sección. «Listo para jugar» sale solo cuando no falta nada y no queda ningún aviso arriba de la tarjeta. Ya en juego, la misma tarjeta prepara el día siguiente («Antes del día 2»). La pestaña Torneo cuenta lo pendiente mientras el torneo está en preparación. Lo de abajo es lo que la app no puede revisar sola.

- [ ] **Campo cargado.** Comité › Campos: los dos campos con sus tees, par e índice de golpe (SI) por hoyo (búsqueda por nombre o foto de la tarjeta). Comité › Rondas: cada día con su campo y fecha.
- [ ] **Jugadores completos.** Comité › Jugadores: los 12, con categoría, hándicap base **bloqueado**, tee, foto, quién es el homenajeado y quiénes son admins. Revisa la vista previa del 80 % y los golpes de ventaja.
- [ ] **PINs enviados.** Comité › Jugadores › PIN: uno por jugador. Mándalos por WhatsApp uno a uno.
- [ ] **App instalada en los 12 teléfonos.** Cada quien abre el link, "Agregar a pantalla de inicio" (la guía sale la primera vez) y entra con su cara + PIN. Una vez adentro, la sesión se queda en el teléfono.
- [ ] **Banquero definido.** Comité › Torneo › Banquero (quien cobra inscripciones y martillazos y paga premios).
- [ ] **Bolsa cuadrada.** Comité › Torneo: el cuadre de premios debe estar en verde. Desde que el torneo sale de preparación, la app vuelve a revisarlo con los jugadores y rondas reales: si alguien no llega o se agrega un día, En vivo, Dinero y el Comité avisan "faltan $…" hasta que se ajusten los premios.
- [ ] **Supabase despierto.** El proyecto gratuito se pausa tras 7 días sin uso; el cron diario lo mantiene vivo. El día antes del viaje abre la app y confirma que carga.
- [ ] **Máximo de filas en 1,000 o más.** Supabase › Project Settings › Data API › Max rows (de fábrica es 1,000; Claude lo revisa con la API de administración). La app y los respaldos piden las tablas en páginas de 1,000 y toman una página más corta como la última: con un tope menor, cargarían solo la primera página, sin avisar.
- [ ] **Tarjetas de papel impresas.** Comité › Datos › "Ver tarjetas para imprimir" → imprime una por grupo (con los puntos de ventaja). Por si acaso.
- [ ] **Ensayo hecho.** Corre una noche de Calcutta y una ronda en el torneo "Ensayo" con 2 o 3 amigos y sus teléfonos reales.

## 1. Noche de Calcutta (la víspera del día 1)

1. Conecta la tele: abre `/t/<slug>/tv` en un navegador (Chromecast / AirPlay / HDMI). Mientras el torneo esté en modo subasta muestra el tablero de la Calcutta.
2. En el teléfono del subastador: **Más › Consola del Comité › Calcutta**.
3. **"Sacar del sombrero"** sortea el orden de los lotes (puedes reordenar a mano) → "Abrir lote 1". El torneo pasa a estado *Subasta*.
4. Por cada lote: la puja abre en $250 con el propio jugador. Toca al postor y luego **+$250 / +$500 / +$1,000** u "Otra". Un postor con 3 jugadores se apaga solo. "Deshacer última puja" si te equivocas.
5. **"¡Vendido!"** → pregunta la recompra (0 / 25 / 50 % o un monto). Muestra cuánto le paga el jugador a su dueño. → "Siguiente lote".
6. Si vendiste mal un lote: en la lista de vendidos toca ↶ para reabrirlo.
7. Al vender el último: **"Sorteo de parejas"**. El homenajeado escoge a su pareja de la categoría que le toca; el resto sale con anillos. Ponles nombre y **guarda**: genera los grupos del día 1 (una pareja A+D con una B+C). Ajusta horas de salida en **Grupos**.
8. **Antes de dormir:** **Dinero › Liquidación › "Quién debe qué"**: inscripciones, martillazos y recompras. Toca **Marcar pagado** conforme paguen (el aviso trae **Deshacer**). Todo se paga esa noche.
   - **¿Marcaste a alguien por error?** Abre **"Ya pagaron"**, justo abajo de la lista: está todo lo marcado, con su monto. Toca **Pagado** en esa fila y vuelve a "Quién debe qué" (el aviso trae **Deshacer** por si tocaste la fila equivocada). Solo cambia esa fila.
   - **Ojo con quien pagó a medias** (pagó un lote y luego compró otro): "Ya pagaron" muestra lo que pagó, y al quitarlo vuelve a deber **todo**, no solo esa parte. **Deshacer** la regresa tal cual; pasado el aviso, la app ya no puede registrar solo una parte. Si te pasa, cóbrale solo lo que de verdad le falta y entonces toca **Marcar pagado**: queda registrado completo.

## 2. Empezar una ronda

1. Comité › **Rondas** › "Iniciar ronda" en el día que toca. (Si el día 1 no arranca, revisa que la ronda tenga campo y grupos.)
2. Cada grupo abre **Tarjeta**: sale su grupo y "Llevas la tarjeta de: [pareja rival]". Cualquiera del grupo puede capturar a los cuatro. Si alguien se sale a medio hoyo (el botón de atrás, otra pestaña, otro hoyo, o el teléfono cierra la app), lo que llevaba capturado se queda en ese teléfono hasta 12 horas y vuelve a aparecer al abrir ese hoyo, con el aviso «Falta guardarlo». Si mientras tanto el otro teléfono ya guardó a ese jugador, vale lo que guardó el otro. En una tarjeta firmada ya no vuelve para los jugadores; al Comité sí, porque la puede corregir (con su razón). El botón de atrás del teléfono cierra primero la ventana que esté abierta.
3. Por hoyo: golpes (arranca en par), putts (arranca en 2), "Levantó" si aplica → **Guardar hoyo**. Los demás teléfonos ven el cambio en menos de 2 segundos. Abajo del botón queda "Hoyo N guardado · Corregir" unos segundos para regresar.
   - Con dos teléfonos en el grupo, cada uno guarda solo a los jugadores que tocó (y a los que nadie ha capturado todavía): lo que ya guardó el otro teléfono no se pisa con el par. Si el otro guarda mientras tienes el hoyo abierto, sus valores aparecen solos.
   - Un doble toque no guarda el hoyo siguiente: el segundo toque no cuenta, y si guardas un hoyo sin tocar nada segundos después del anterior, la app pregunta "¿Guardar el N con todos en par?".
4. Si dos hacen 3 putts en el mismo hoyo, la app pregunta **"¿Quién embocó al último?"** antes de guardar.

## 3. Corregir un score

- **En el grupo, antes de firmar:** vuelve al hoyo en Tarjeta (flechas o "Ver tarjeta" → toca el hoyo) y corrige.
- **Desde el Comité:** Comité › **Tarjetas** → elige jugador y hoyo → corrige. Si la tarjeta ya está firmada te pide una razón; toda corrección del Comité queda en la bitácora con su razón.
- **"Discrepancia"** (dos teléfonos guardaron valores distintos): en Comité › Tarjetas aparece el hoyo con los dos valores; «Conservar el actual» o «Volver al anterior», en un toque.

## 4. Sin señal

Sigue capturando: la app guarda en el teléfono; arriba dice "Sin señal" y abajo del nombre del torneo "3 hoyos en el teléfono. Actualizado hace 5 min" (y hay un numerito en la pestaña Tarjeta desde cualquier pantalla). Cuando vuelve la señal se sincroniza sola; nada se pierde por falta de señal, se reintenta hasta que entra. Si al llegar al club sigue en pendiente, abre la app con Wi-Fi: se vacía la cola. No borres la app ni cambies de jugador con pendientes (la app no deja cambiar de jugador mientras haya hoyos, firmas o respuestas sin subir). Si la Tarjeta dice "Confirmando tu sesión…", el teléfono está recuperando su sesión: lo guardado se sube solo en cuanto la recupera. "Cerrar sesión" y cambiar de cuenta (también entrar como organizador con correo y contraseña) esperan a que se suba lo de cualquier torneo; la app dice de qué torneo y si falta señal o el PIN. Sin señal, «Cerrar sesión» funciona mientras la sesión del teléfono siga vigente: la cierra y borra lo guardado en el teléfono. Si la sesión ya venció y no hay señal (o la señal acaba de volver), todavía no se puede: la app lo dice, no borra nada, y en un minuto con señal ya se puede. Con señal lenta el botón dice «Cerrando sesión…» hasta 15 segundos; si el servidor no responde a tiempo, la app dice que por ahora sigues dentro, y si la sesión se cierra después, lo avisa, borra lo guardado y regresa al inicio. Lo capturado en un torneo que se borró ya no se puede subir: al abrir su enlace la app dice «no existe», y eso ya no detiene «Cerrar sesión». Si un teléfono pierde su sesión a media ronda (es raro), la app vuelve a pedir la cara y el PIN en cuanto lo nota; lo que estaba en el teléfono espera ("1 hoyo espera tu PIN" en la Tarjeta) y se sube solo al entrar. Cinco PINs equivocados seguidos bloquean ese teléfono 5 minutos (solo ese teléfono; el jugador entra desde otro). Al abrir la app, un teléfono que ya había entrado al torneo muestra de inmediato lo último guardado en él, con o sin señal: si abre en el torneo, el tablero; si abre en la pantalla de inicio (la app instalada), "Tu último torneo" está ahí de inmediato, también para quien tiene cuenta y abre en Mi Polo, o "Abrir lo guardado" si dice que Polo está tardando en conectar, y un toque muestra el tablero. Arriba dice "Sin señal" (o "Conectando…" mientras llega lo nuevo) y abajo del nombre cuándo se actualizó, por ejemplo "Actualizado hace 5 min" o "Actualizado ayer, 6:40 p.m."; guardar un hoyo en el teléfono no lo cambia. La Tarjeta sigue funcionando. En cuanto hay señal se pone al día solo; no hace falta cerrar la app.

**"Rechazado":** si el servidor no aceptó una captura (la tarjeta ya estaba firmada o la ronda ya se cerró antes de que sincronizara), el teléfono la muestra en rojo en **Tarjeta**, con el día, el hoyo y los valores, aunque el día ya haya terminado; la pestaña Tarjeta lleva un numerito rojo desde cualquier pantalla. Esa lista vive solo en ese teléfono: el Comité no la ve desde el suyo. Toca **"Mandar al Comité"** (manda los valores por WhatsApp o los copia), el Comité los captura desde Comité › Tarjetas con su razón, y cuando te confirme que los capturó toca **"Descartar"** (pregunta antes, porque es la única copia). **"Volver a mandar"** aparece solo en lo que ese teléfono puede volver a escribir: el día en juego, la tarjeta sin firmar y su jugador en ese grupo ese día (si el Comité lo cambió de grupo, ya no; la línea dice «Ya no juegas en ese grupo»). Antes compara con lo que ya tiene la tarjeta (la línea lo dice si es distinto), porque se escribe encima. Si en la lista hay de las dos, el texto de arriba dice qué se vuelve a mandar y qué se manda al Comité. Si dos jugadores comparten nombre corto, la lista usa el nombre completo.

**Regla para el Comité técnico:** no se despliega nada a `main` mientras hay una ronda en juego. La app nunca se recarga sola a media captura. Cuando hay versión nueva, cada teléfono la detecta al volver a abrir la app o en menos de 30 minutos, y arriba aparece una barra fija "Hay una versión nueva · Actualizar" que se queda hasta que el jugador la toca (no aparece mientras tiene un hoyo a medio capturar).

**Después de un arreglo urgente** (por ejemplo, entre el día 1 y el día 2): pide a cada jugador que toque "Actualizar" y revisa en **Más** la línea "Versión": todos los teléfonos deben mostrar la misma fecha y el mismo código. Un teléfono con versión vieja calcula puntos y dinero con el código viejo.

## 5. Si la app se cae

1. Usa las **tarjetas de papel** (sección 0). Golpes arriba, putts abajo, marca los 3 putts para la víbora.
2. Al terminar, el admin captura todo desde Comité › **Tarjetas** (jugador por jugador) o desde Tarjeta eligiendo el grupo.
3. Si Supabase está pausado: dashboard de Supabase → proyecto Cardi-Golf → "Restore". Tarda 1–2 minutos.
4. Si Vercel está caído: el último respaldo JSON (sección 8) tiene todo; la liquidación se puede hacer a mano con el CSV de resultados.

## 6. Cerrar una ronda

1. Cada pareja **firma la tarjeta de la otra** al terminar el 18 ("Firmar tarjeta" en Tarjeta). Eso la bloquea.
2. **Antes de terminar:** que cada teléfono que capturó abra la **Tarjeta con señal** y no le queden hoyos por subir. Un teléfono que se quedó sin señal puede tener hoyos sin subir, y después de terminar ya no entran (le salen como "Rechazado"). Lo mismo con "Terminar y publicar" en una Ronda rápida.
3. Comité › **Rondas** › "Terminar ronda". Revisa en **En vivo** que no queden hoyos sin capturar ni víboras pendientes (sale un chip rojo).
4. Comité › **Hándicaps**: revisa el recorte del día 2 de cada jugador (regla anti-sandbag). Ajusta con razón si el Comité lo decide.
5. Comité › **Grupos** › "Generar grupos del día 2 por tabla": las dos mejores parejas salen al último. Ajusta horas y salidas.
6. **Dinero**: los premios del día (mejor ronda, víbora) ya aparecen como definitivos.

## 7. Ceremonia y liquidación final

1. Comité › Rondas: las dos rondas en "Terminada". Comité › Torneo: estado **Terminado**.
2. En la tele: `/t/<slug>/ceremonia` (desde **Más › Ceremonia**, solo admins). Toca "Revelar" uno por uno: Cuchara de Palo, menos putts, víbora, mejor ronda, parejas, 4º–2º, **el campeón** (confeti y el Putter), pagos de la Calcutta, resumen de dinero. Con una laptop conectada a la tele, un teclado o un control de presentación lo lleva solo: → (o espacio, o el botón de avanzar del control) revela y luego pasa al siguiente; ← regresa. Si una lista no cabe en la pantalla (muchos jugadores), se ve por páginas («1–24 de 60») y → pasa a la siguiente antes de seguir. «Siguiente» hace lo mismo que →: si un paso no se ha revelado, primero lo revela. Un empate de muchos se ve como lista compacta, una línea por jugador.
3. **Dinero › Liquidación**: con el torneo terminado es una sola lista, solo con lo que falta por pagar: lo que ya se marcó como pagado (inscripciones y martillazos del jueves) no se vuelve a pedir. "Vía banco": cada quien queda a mano con el banquero en una línea (sus premios menos lo que todavía deba), más recompras y apuestas directas. "Sin banco": la lista mínima de transferencias entre personas; lo que ya entró al banco lo reparte el banquero. Toca **Marcar pagado** conforme se pague: la línea desaparece, y el aviso trae **Deshacer** por si fue un error. Si el error se nota después: **"Ya pagaron"**, abajo de la liquidación, tiene cada pago marcado por separado (una línea vía banco marca sus premios y lo que debía, por ejemplo "Banco pagó a Camilo, Premios" y "Camilo pagó a Banco, Calcutta"); toca **Pagado** en cada uno y la línea vuelve a la liquidación. Si ese pago era solo una parte de lo que debía, vuelve a contar la deuda completa (igual que la noche de la Calcutta): usa **Deshacer** en el aviso; si ya no alcanzas, al liquidar esa línea toma en cuenta lo que ya había pagado (el banco le da eso de más, o él paga eso de menos) y márcala pagada. **Compartir** manda la liquidación a WhatsApp como imagen o texto.
4. **Más › Estadísticas y premios**: los premios automáticos (Rey del Birdie, Mano de Piedra…) y la carrera de puntos para revivirla en la cena.

## 8. Respaldo

Cada noche del torneo: Comité › **Datos** › "Descargar respaldo (JSON)" y "Descargar CSV". Guarda los archivos en el teléfono y en Drive. Restaurar: mismo lugar, "Restaurar desde JSON…" (solo acepta respaldos de ese mismo torneo y reemplaza todo). **Mientras no se aplique la migración 0025** (espera las llaves, ver `docs/handoff.md`), restaurar no regresa los juegos de apuestas: quién entró a cada bolsa, los ganadores de los concursos por hoyo y los resultados de las apuestas se quedan como estaban; revísalos a mano en Comité › Juegos después de restaurar.

## 9. Ensayo y simulador

- **Duplicar torneo** (Comité › Datos) copia configuración, campo y jugadores a un torneo nuevo para ensayar sin tocar el real.
- Desde la terminal del repo, el simulador llena rondas del torneo "Ensayo" (y solo de ese) con scores realistas:

```
node scripts/simulate.mjs --round 1 --reset            # día 1 de golpe
node scripts/simulate.mjs --round 2 --interval 20      # día 2 en tiempo real, un hoyo cada 20 s por grupo
node scripts/rehearse-auction.mjs                      # una Calcutta completa de 12 lotes
```
