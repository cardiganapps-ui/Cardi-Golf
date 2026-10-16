# El catálogo de campos de México

Escrito el 2026-10-16 para STRAT-14. Ningún hoyo se captura sin la tarjeta del campo (par e índice de golpe por salida), y es lo primero con lo que se atora un organizador nuevo: el día 1 del viaje, Solmar, no tiene tarjeta en ninguna de las dos bases que consultamos.

## Lo que hay hoy
- **Tres caminos que dan las mismas filas** (CLAUDE.md §13b): buscar en GolfCourseAPI y OpenGolfAPI juntas, leer una foto de la tarjeta con Claude (Haiku, unos $0.01 por tarjeta, siempre como borrador que el Comité revisa), o capturarla a mano o pegarla.
- **El catálogo es compartido:** un campo que un organizador cargó lo encuentra el siguiente, y el Admin de Polo une duplicados y marca tarjetas rotas (`platform_courses`).
- **La cobertura es dispareja:** GolfCourseAPI tiene Quivira completo (cinco salidas) y no tiene Solmar; OpenGolfAPI tiene los dos sin tarjeta.

## La meta
Que un organizador en México encuentre su campo con tarjeta completa en 9 de cada 10 casos, medido como un paso del embudo (STRAT-02): «el campo se encontró» contra «el campo se agregó durante el primer torneo», en Salud.

## El plan, en orden
1. **Medir antes de llenar.** Agregar al embudo el camino por el que llegó cada campo (`courses.source`: búsqueda, foto o a mano) cuando se crea durante el primer torneo de un organizador. Sin costo; se hace junto con el embudo de Salud.
2. **Los 100 campos más jugados de México**, en este orden: Los Cabos (Solmar, Quivira, Diamante, Cabo del Sol, Puerto Los Cabos, Palmilla, El Dorado, Querencia, Cabo Real), Ciudad de México y su zona (Chapultepec, Bosque Real, Club de Golf México, La Hacienda, Los Encinos, Tabachines), Monterrey, Guadalajara, Vallarta y Punta Mita, Riviera Maya y Cancún, San Miguel de Allende, Querétaro.
   - Para cada uno, la búsqueda en las dos bases. Si una trae la tarjeta completa (par e índice en las 18, rating y slope por salida), se importa como hoy, sin tocarla.
   - Si no, una foto de la tarjeta: la que publica el club en su sitio o la que mande alguien del grupo. Siempre como borrador revisado por una persona.
   - Un script (`scripts/seed-courses.mjs`, por hacer) lee la lista, busca en las dos bases, importa lo que esté completo con su procedencia (`source`, `external_id`, `imported_at`) y deja una lista de los que faltan. Corre en modo de prueba por omisión y nunca toca un campo que ya existe.
3. **Una marca de «verificada»** para la tarjeta que una persona comparó contra la tarjeta impresa (un `courses.verified_at` y quién), con un distintivo en la búsqueda. La puede poner el Admin de Polo, o un Comité después de jugar el campo sin correcciones. Las tarjetas sin verificar se siguen pudiendo usar.
4. **Las correcciones vuelven al catálogo:** cuando un Comité corrige una tarjeta compartida, la corrección queda para todos con quién y cuándo (ya pasa con `CourseEditor` y el historial de `courses`, `tees`, `holes`), y el Admin de Polo ve las tarjetas corregidas en su lista de campos.

## Lo que no se hace
- No se copian tarjetas de sitios que no lo permiten. OpenGolfAPI es ODbL y se atribuye en pantalla; GolfCourseAPI se usa con su llave y sus condiciones.
- No se paga una base de campos (sería una decisión de Diego).

## Para el viaje
Solmar se carga con la foto de su tarjeta (docs/handoff.md, datos del torneo). Quivira ya está en GolfCourseAPI con sus cinco salidas: se importa y se compara contra la tarjeta impresa del club antes del ensayo 1.
