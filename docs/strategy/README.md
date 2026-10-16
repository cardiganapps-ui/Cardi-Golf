# Polo: la estrategia en una página

Escrita el 2026-10-16 para cerrar STRAT-01, STRAT-09 y STRAT-12 de la revisión del 2026-09-30. CLAUDE.md sigue siendo el brief técnico; esta página dice para qué existe Polo, cómo se mide y qué no se hace. Cuando las dos digan cosas distintas sobre alcance, gana esta página, y Claude corrige CLAUDE.md en el mismo cambio. Diego la aprueba o la corrige (docs/handoff.md, «Estrategia»).

## Qué es
Polo corre torneos de golf entre amigos, con dinero de por medio, desde los teléfonos de los jugadores y una tele: captura hoyo por hoyo aunque no haya señal, todos los juegos al momento, la subasta, y las cuentas cerradas al peso. Nadie discute un número porque cada número se explica con un toque.

## Para quién
- **Quien organiza** un viaje o un torneo de su grupo: 8 a 24 jugadores, uno a tres días, premios y apuestas entre ellos. Hoy lo hace con hojas de cálculo, WhatsApp y tarjetas de papel. Es quien crea el torneo, y el único que necesita cuenta.
- **Los jugadores**, que entran con su cara y un PIN, sin cuenta, en un campo con mala señal.
- **El banquero**, que cobra y paga, y necesita que cuadre.

El primer cliente es el viaje de Nacho (Los Cabos, 8 a 11 de abril de 2027). Es la prueba de aceptación, no el producto.

## La métrica que manda
**Torneos cerrados al peso**: torneos que no son el Ensayo, con al menos 8 jugadores, en los que capturaron al menos 3 teléfonos distintos, que llegaron a Terminado con el dinero sin nada «por asignar». Un torneo así es uno que Polo reemplazó de verdad: la captura, los juegos y las cuentas.

Se mide con datos que ya existen: `tournaments.status = 'finished'`, `counts_for_stats`, los jugadores, los teléfonos que guardaron hoyos (`audit_log` y `device_status`, STRAT-02), y el gate de «Cerrar torneo», que no deja Terminado con dinero por asignar. Admin de Polo › Resumen la muestra arriba de todo, con el embudo del organizador debajo (`platform_funnel`, STRAT-12): cuántos torneos y organizadores llegaron a cada paso, de crear el torneo a Terminado, sin contar los tuyos, los ensayos ni las rondas rápidas.

Las métricas que la sostienen (STRAT-02, ya en Salud): de guardar a verse en otro teléfono, p95 menor a 2 s; hoyos que se quedan sin subir, cero; errores por versión; y el embudo del organizador (`tournament_created`, el primer hoyo guardado, `card_signed`, Terminado).

## Lo que no se hace (hasta que la métrica lo pida)
- Ni pagos, ni comisiones, ni mover dinero: Polo solo lleva la cuenta.
- Ni descubrir torneos públicos, ni un mercado, ni rankings abiertos.
- Ni roles nuevos más allá de Comité y jugador dentro de un torneo, y el Admin de Polo para operar la plataforma.
- Ni otro idioma: el texto vive en un solo archivo para que llegue a ser un archivo más.
- Ni superficie nueva sin un criterio de aceptación escrito y una persona que lo verifique en un teléfono de verdad (abajo).

## Las tres apuestas, en orden
1. **El viaje de abril sale perfecto.** Dos ensayos con 12 teléfonos (13 y 14 de febrero, 13 y 14 de marzo), la revisión ciega A+ en marzo y luego solo arreglos. Todo lo demás espera si compite con esto.
2. **Un organizador que no es Diego crea y corre su torneo solo.** Cinco sesiones con amigos que organizan viajes de golf (docs/handoff.md): cada uno crea un torneo en frío, y Salud más una llamada de 15 minutos dicen dónde se atoran. Lo que encuentren decide los siguientes cambios, no la lista pendiente.
3. **Después del viaje, la gente vuelve.** Los jugadores del viaje se quedan con su perfil y su historial (STRAT-08) y el siguiente viaje del grupo se arma duplicando el torneo. Solo se mide después de abril.

## Lo que ya se construyó fuera del viaje
Antes de la revisión se construyeron áreas que el viaje no necesita: Ronda rápida, amigos y rivalidades, crews, logros, formatos por golpes, match play y equipos, y casi todo el Admin de Polo. Están probadas y siguen funcionando, pero **no cuentan como hechas para el lanzamiento** hasta que pasen su criterio en teléfonos de verdad. `docs/strategy/launch-scope.json` lista cada ruta y cada migración con su área, y `src/lib/launchScope.test.ts` falla si un cambio agrega una ruta o una migración que no esté en la lista: agregar superficie es una decisión escrita, no un efecto de paso.

Del Admin de Polo, lo que protege el viaje se queda en el alcance: Salud, Protegido, Historial y «Comité en cualquier torneo». Avisos a todos, moderación de personas, fusión de campos y moderación de crews no se tocan más hasta que haya, digamos, 50 organizadores que no sean Diego (STRAT-12). Si Diego prefiere esconderlas detrás de un interruptor (`platform_settings`), es su decisión 5c del handoff.

## Cuándo algo está hecho
Un área está hecha cuando:
1. sus pruebas automáticas pasan en CI (las de siempre);
2. su criterio humano, escrito en CLAUDE.md §16 («After M7»), lo marcó en docs/handoff.md la persona nombrada, con evidencia (un video, un tiempo, una captura);
3. no tiene hallazgos abiertos arriba de P3 en `docs/quality/ledger.json`.

Los hitos M0 a M7 se marcaron hechos con sus pruebas automáticas, sin las personas y los teléfonos que pedían (STRAT-09). Sus criterios humanos se cumplen en el ensayo 1, y quedan en el handoff hasta entonces.

## Documentos de esta carpeta
- `launch-scope.json`: el alcance del lanzamiento, ruta por ruta y migración por migración.
- `brand-clearance.md`: el nombre «Polo» y qué buscar antes de invertir más en la marca (STRAT-13).
- `course-catalog.md`: cómo llenar el catálogo de campos de México (STRAT-14).
