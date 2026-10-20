# practice Specification

## Purpose
TBD - created by archiving change add-chess-analyzer. Update Purpose after archive.
## Requirements
### Requirement: Generar ejercicios desde el análisis guardado
Al guardar un análisis, el servidor SHALL generar los ejercicios de esa partida en la misma transacción, de cualquiera de los dos bandos, con uno de tres tipos:
- `mistake` (Error grave): cada jugada clasificada Blunder;
- `brilliant` (Brillante): cada Brillante verificada y con `exerciseEligible = true` que se jugó (`brilliant_played = true`);
- `miss` (Oportunidad perdida): cada jugada clasificada Oportunidad perdida, y cada Brillante elegible que quien movía no vio (`brilliantMissed`, `brilliant_played = false`).

Las Imprecisiones y los Errores no SHALL generar ejercicio.

Cada ejercicio SHALL guardar `side`: `me` si la jugada era del usuario, `opponent` si era del rival, o null si no se conoce el color.

Si un ply califica para más de un tipo, SHALL crearse uno solo, con esta prioridad:
1. Brillante no vista (`miss`, con la Brillante como respuesta);
2. Brillante jugada (`brilliant`);
3. Blunder (`mistake`) u Oportunidad perdida (`miss`).

#### Scenario: Partida con errores
- **WHEN** se guarda el análisis de una partida donde el usuario cometió 2 Blunders y 1 Imprecisión, y su rival 1 Oportunidad perdida y 1 Error
- **THEN** se crean 2 ejercicios `mistake` con `side = me` y 1 `miss` con `side = opponent`
- **AND** ni la Imprecisión ni el Error generan ejercicio
- **AND** cada ejercicio guarda la posición previa, la jugada hecha, las jugadas aceptadas y la refutación

#### Scenario: Brillante que el usuario no vio
- **WHEN** el análisis tiene un ply del usuario marcado `brilliantMissed` y elegible
- **THEN** se crea un ejercicio `miss` con `side = me`, `brilliant_played = false` y la Brillante como única respuesta aceptada

#### Scenario: Brillante del rival
- **WHEN** el rival jugó una Brillante verificada y elegible
- **THEN** se crea un ejercicio `brilliant` con `side = opponent` y `brilliant_played = true`

#### Scenario: Brillante sin respuesta única
- **WHEN** una Brillante verificada tiene `exerciseEligible = false`
- **THEN** se muestra en el análisis pero no se crea ejercicio

#### Scenario: Partida sin color de usuario
- **WHEN** la partida no tiene `user_color`
- **THEN** los ejercicios se generan con `side = null` y se etiquetan "Blancas" o "Negras"
- **AND** al indicar el color se rellena `side`

#### Scenario: Ejercicios previos al cambio de tipos
- **WHEN** se aplica la migración `0002` sobre ejercicios existentes
- **THEN** los que tienen `class = 'miss'`, o `kind = 'brilliant'` con `brilliant_played = false`, pasan a `kind = 'miss'`
- **AND** conservan `box`, `due_at` e intentos

### Requirement: Reanálisis conserva el progreso
Al reanalizar, los ejercicios SHALL actualizarse por `(game_id, ply)`:
- si `kind` y `best_uci` no cambian, SHALL conservarse `box`, `due_at` e intentos;
- si cambian, SHALL reiniciarse `box = 0` y `due_at = ahora`, conservando el historial de intentos;
- los que ya no califican SHALL archivarse (`archived_at`), no borrarse, y SHALL desarchivarse si vuelven a calificar.

La posición (`fen`) y la fase SHALL calcularse en el servidor a partir del PGN.

#### Scenario: Cambia la respuesta
- **WHEN** un ejercicio en caja 3 se reanaliza y su mejor jugada pasa a ser otra
- **THEN** vuelve a caja 0 y aparece en la siguiente sesión

#### Scenario: El error deja de serlo
- **WHEN** a mayor profundidad una jugada antes Blunder queda como Imprecisión
- **THEN** su ejercicio se archiva y deja de aparecer en la cola, pero su historial se conserva

### Requirement: Sesión de práctica
"Empezar" SHALL armar una sesión de hasta 10 ejercicios no archivados y no dominados (`box < 3`) que cumplan una de dos condiciones:
- son nuevos o fallados (`box = 0`);
- son repasos vencidos (`due_at ≤ ahora`).

El orden SHALL ser aleatorio dentro de cada grupo: primero los nuevos y fallados, después los repasos vencidos. Dos sesiones seguidas con los mismos ejercicios disponibles no SHALL dar siempre el mismo orden.

Un ejercicio fallado no SHALL repetirse dentro de la misma sesión. Vuelve en la siguiente porque queda con `box = 0`.

La sesión SHALL incluir los tres tipos. Solo SHALL poder filtrarse por "De quién" (todas, mías, de rivales) y por partida; no SHALL haber filtros de tipo, clase ni fase. El botón "Empezar" SHALL estar justo debajo de los filtros.

"Practicar partida", desde la partida, SHALL abrir directamente una sesión con todos los ejercicios no archivados de esa partida, dominados incluidos, en orden de jugada y sin pasar por la lista. Al salir, SHALL volver a la partida.

#### Scenario: Ejercicio de error u oportunidad perdida
- **WHEN** aparece un ejercicio `mistake` o `miss`
- **THEN** el tablero está orientado al bando que mueve en la posición previa y resalta la última jugada del rival (origen y destino)
- **AND** muestra el texto "¿Qué era mejor aquí?" sin revelar qué se jugó
- **AND** si es el primer ply de la partida, no se resalta ninguna jugada

#### Scenario: Ejercicio de brillante
- **WHEN** aparece un ejercicio `brilliant`
- **THEN** el tablero está orientado al bando que mueve, con el texto "Hay una jugada brillante. Encuéntrala.", y no resalta la última jugada

#### Scenario: Prioridad
- **WHEN** el usuario tiene 4 ejercicios nuevos, 3 fallados, 5 repasos vencidos y 20 acertados que aún no vencen
- **THEN** la sesión tiene 10: los 7 nuevos y fallados en orden aleatorio, y luego 3 de los 5 vencidos al azar
- **AND** ninguno de los 20 que no vencen

#### Scenario: Orden distinto
- **WHEN** el usuario pulsa "Empezar", sale sin resolver nada y vuelve a pulsar "Empezar" con 15 ejercicios nuevos
- **THEN** la segunda sesión no es, en general, la misma secuencia que la primera

#### Scenario: Fallo sin repetición
- **WHEN** en una sesión de 10 el usuario falla el ejercicio 3
- **THEN** la sesión sigue teniendo 10 ejercicios y termina en el 10/10
- **AND** el ejercicio fallado aparece en la siguiente sesión

#### Scenario: Practicar partida
- **WHEN** el usuario toca "Practicar partida" en una partida con 5 ejercicios, 1 de ellos dominado
- **THEN** empieza una sesión con los 5 en orden de jugada, sin pasar por `/practicar`

#### Scenario: Sin ejercicios
- **WHEN** el usuario no tiene ejercicios
- **THEN** se le invita a importar y analizar partidas

### Requirement: Validar la respuesta
- En `brilliant`, y en `miss` con `brilliant_played = false`, solo la jugada Brillante SHALL ser correcta.
- En `mistake` y en `miss`, SHALL ser correcta una jugada de `accepted_uci`: la mejor, más la segunda línea si pierde < 0.05 EP. En `miss`, la segunda además tiene que dejar `EP ≥ MISS_WIN`.
- Si la jugada no está en la lista, el motor del cliente SHALL analizar la posición previa a profundidad 14 con `searchmoves`, para la jugada del usuario y para `best_uci`.
  - Es correcta si pierde < 0.05 EP.
  - En `miss` (sin Brillante) además tiene que dejar `EP ≥ MISS_WIN` para quien mueve.
- La jugada que se hizo en la partida (`played_uci`) no SHALL ser correcta nunca, salvo que sea la propia respuesta (Brillante jugada). Se rechaza sin consultar al motor.

La misma regla SHALL aplicarse en "Reintentar" y en "Repasar partida", con la jugada de la partida en esa posición.

#### Scenario: Alternativa válida
- **WHEN** en un ejercicio `mistake` el usuario juega una jugada que no está en `accepted_uci` pero pierde solo 0.03 EP
- **THEN** se marca correcta con el texto "Buena jugada; la del motor era Cxe5"

#### Scenario: Repetir la jugada de la partida
- **WHEN** en el ejercicio `miss` de CarlosAPV vs JihadGhaziri (jugada O-O, mejor a4) el usuario juega O-O
- **THEN** se marca incorrecta aunque a profundidad 14 pierda menos de 0.05 EP

#### Scenario: Oportunidad perdida que no conserva la ventaja
- **WHEN** en un ejercicio `miss` el usuario juega una alternativa que pierde 0.04 EP pero deja `EP = 0.60`
- **THEN** se marca incorrecta

#### Scenario: Respuesta incorrecta
- **WHEN** el usuario juega una jugada que pierde 0.15 EP
- **THEN** se marca incorrecta y se ofrecen "Reintentar", "Pista" y "Ver solución"

### Requirement: Explicar el error
Después de cada respuesta, el sistema SHALL mostrar:
- la jugada original con su número y su icono;
- quién la jugó;
- la evaluación antes y después.

Para el dueño dice "Jugaste" o "Tu rival jugó"; para cualquier otra persona, el nombre del jugador ("CarlosAPV jugó 11. exd5").

SHALL ofrecer "Mejor línea", que el usuario recorre con ◀ ▶ (botones y teclado) sin reproducción automática, y desde donde puede volver a la posición del ejercicio. Los botones SHALL ir en este orden: "Mejor línea", "Siguiente" (o "Volver a la lista" en `/practicar/<id>` cuando no hay siguiente) y "Ver en la partida" (solo el dueño). No SHALL haber "Lo que podía pasar".

Tras la respuesta, el tablero SHALL quedarse en la jugada del usuario con el icono de su resultado:
- si es correcta, el icono de Mejor (o de Brillante en `brilliant`);
- si es incorrecta, el de su clasificación.

La jugada original de la partida SHALL mostrarse solo en el panel ("En la partida: 11. exd5" con su icono). Así el icono del tablero nunca contradice el veredicto.

#### Scenario: Correcto sin contradicción
- **WHEN** el usuario acierta un ejercicio `miss` cuya jugada original fue 11. exd5
- **THEN** el tablero muestra su jugada con el icono de Mejor junto a "¡Correcto!"
- **AND** el panel dice "En la partida: jugaste 11. exd5" con el icono de Oportunidad perdida

#### Scenario: Mejor línea a mano
- **WHEN** el usuario resuelve un ejercicio y toca "Mejor línea"
- **THEN** el tablero no se mueve solo y ▶ avanza una jugada por toque

### Requirement: Repetición espaciada
Cada ejercicio SHALL llevar en `box` su racha de aciertos seguidos, de 0 a 3.

Un **acierto** es correcto al primer intento, sin pista y sin ver la solución. Hace `box = min(3, box + 1)`. Cualquier otro resultado SHALL poner `box = 0` y `due_at = ahora`.

`due_at` SHALL calcularse así:

| `box` | `due_at` |
|---|---|
| 0 | ahora |
| 1 | ahora + 60 días |
| 2 | ahora + 180 días |
| 3 | dominado: no vuelve a "Empezar" (`due_at` = ahora + 180 días, sin uso) |

Todo resultado del dueño SHALL contar igual, venga de "Empezar", de "Practicar partida" o de `/practicar/<id>`, aunque el ejercicio todavía no venza.

El cliente SHALL enviar un solo `practice.submitResult({ exerciseId, firstTryCorrect, usedHint, viewedSolution })` por ejercicio abierto, en cuanto el resultado queda fijado (al acertar o al ver la solución), no al pasar al siguiente. El servidor SHALL calcular `box` y `due_at` y registrar el resultado en `exercise_attempts`.

La migración `0003` SHALL convertir las cajas existentes:
- `box` pasa al mínimo entre la caja vieja, los aciertos limpios seguidos al final del historial de intentos y 3;
- `due_at` se calcula según la tabla, contando desde el último intento.

Así la racha migrada nunca es mayor que la real.

#### Scenario: Primer acierto
- **WHEN** un ejercicio nuevo se acierta
- **THEN** pasa a `box = 1` y no vuelve a "Empezar" en 60 días

#### Scenario: Segundo acierto
- **WHEN** un ejercicio con `box = 1` se acierta
- **THEN** pasa a `box = 2` y vuelve en 180 días

#### Scenario: Dominado
- **WHEN** un ejercicio con `box = 2` se acierta
- **THEN** pasa a `box = 3`, cuenta como dominado y no vuelve a "Empezar"

#### Scenario: Fallo
- **WHEN** un ejercicio con `box = 2` se falla, o se resuelve con pista
- **THEN** vuelve a `box = 0` y entra con prioridad en la siguiente sesión

#### Scenario: Tres veces desde la lista
- **WHEN** el dueño abre un ejercicio nuevo desde la lista y lo acierta, y repite lo mismo dos veces más
- **THEN** el ejercicio queda dominado y no sale en "Empezar"

#### Scenario: Dominado fallado en Practicar partida
- **WHEN** en "Practicar partida" el usuario falla un ejercicio dominado
- **THEN** vuelve a `box = 0` y entra de nuevo en "Empezar"

#### Scenario: Migración
- **WHEN** se aplica `0003` sobre estos ejercicios:
  - uno con `box = 1` y 4 aciertos seguidos, el último hace 10 días;
  - uno con `box = 2` cuyo último intento, hace 10 días, fue un fallo que la regla vieja no contó;
  - uno con `box = 5` y 5 aciertos seguidos;
  - uno nuevo sin intentos.
- **THEN** quedan, respectivamente, con:
  - `box = 1` y `due_at` en 50 días;
  - `box = 0` y `due_at` = ahora;
  - `box = 3`, dominado;
  - `box = 0` y `due_at` = ahora.

#### Scenario: Cerrar la pestaña tras acertar
- **WHEN** el usuario acierta un ejercicio y cierra la pestaña sin pulsar "Siguiente"
- **THEN** el resultado ya quedó guardado

### Requirement: Resumen de progreso
La sección Practicar SHALL mostrar los ejercicios pendientes de hoy, los dominados y la racha de días practicando:
- pendientes: los mismos que podría tomar "Empezar";
- dominados: `box = 3`;
- racha: calculada en la zona horaria del navegador, enviada como `tz`.

No SHALL mostrar la tabla de conteos por tipo y clase.

#### Scenario: Panel
- **WHEN** el usuario abre "Practicar"
- **THEN** ve "Pendientes hoy: 7 · Dominados: 23 · Racha: 4 días", los filtros, el botón "Empezar" y la lista de ejercicios

### Requirement: Lista de ejercicios
Debajo del botón "Empezar", `/practicar` SHALL listar los ejercicios no archivados del usuario, aplicando los mismos filtros que la sesión. SHALL cargar 28 al inicio y 28 más cada vez que el usuario llega al final de la lista con el scroll. No SHALL haber paginación.

Si la carga automática no está disponible o falla, SHALL mostrarse "Cargar más". Ningún ejercicio SHALL aparecer dos veces.

El orden SHALL ser de lo más reciente a lo más antiguo, siempre el mismo:
1. por la fecha de la partida, o la de importación si no la tiene;
2. luego por la de importación;
3. luego por la partida;
4. luego por el ply.

Cada tarjeta SHALL mostrar:
- una miniatura de la posición del ejercicio, orientada al bando que mueve;
- debajo, a modo de título, los jugadores ("CarlosAPV vs jyonGM53") y el número de jugada;
- el icono del tipo (Error grave, Brillante u Oportunidad perdida);
- si está dominado.

Tocar una tarjeta SHALL abrir el ejercicio en `/practicar/<id>`, conservando los filtros activos en la URL (`?lado=`, `?partida=`).

#### Scenario: Carga al hacer scroll
- **WHEN** el usuario tiene 60 ejercicios y abre `/practicar`
- **THEN** ve 28 tarjetas
- **AND** al llegar al final se cargan 28 más, y después las 4 restantes, sin repetir ninguna

#### Scenario: Cambiar el filtro
- **WHEN** el usuario cargó 56 ejercicios y cambia "De quién" a "De rivales"
- **THEN** la lista vuelve a empezar con los primeros 28 de rivales

#### Scenario: Enlace viejo con página
- **WHEN** alguien abre `/practicar?pagina=3`
- **THEN** ve la primera tanda de la lista y no hay error

### Requirement: Ejercicio por URL
Cada ejercicio SHALL poder abrirse en `/practicar/<id>` y tener un botón "Compartir" con dos opciones:
- **Enlace:** Web Share API con la URL, o copiarla si no está disponible.
- **Imagen:** un PNG de la posición, orientado al bando que mueve, con coordenadas y la leyenda "Juegan blancas" o "Juegan negras", y nada más. Sin nombres, evaluación, última jugada ni URL.
  - En un dispositivo táctil que puede compartir archivos, SHALL abrirse la hoja nativa de compartir.
  - En los demás casos (escritorio, o si compartir falla), SHALL descargarse `ejercicio.png`.
  - Si la imagen no puede generarse, SHALL decirlo, y "Enlace" sigue disponible.

Reglas de acceso:
- El dueño SHALL resolverlo igual que en una sesión, y el resultado SHALL contar para su repetición espaciada.
- Tras el resultado, el dueño SHALL ver "Siguiente", que abre el siguiente ejercicio de la lista con los mismos filtros que traía la URL. Si es el último, o si ya no está en la lista, SHALL ver "Volver a la lista".
- Cualquier otra persona, con o sin sesión, SHALL poder resolverlo. No se guarda ningún resultado ni se ofrece "Siguiente". Solo se muestran la posición, las jugadas y los nombres de los jugadores de la partida; nunca el correo, el id del dueño, su caja ni el enlace a la partida.

El servidor SHALL limitar las lecturas por IP sin sesión, o por usuario con sesión. Un id mal formado, inexistente, archivado o de una partida borrada SHALL dar la misma respuesta: "No encontramos ese ejercicio".

#### Scenario: Compartir enlace
- **WHEN** el dueño elige "Compartir → Enlace" y otra persona sin cuenta abre el enlace
- **THEN** esa persona resuelve el ejercicio con pista, solución y explicación, y no se llama a `practice.submitResult`

#### Scenario: Compartir imagen en celular
- **WHEN** en Android Chrome el usuario elige "Compartir → Imagen"
- **THEN** se abre la hoja nativa con un PNG del tablero y la leyenda "Juegan negras", sin otros textos

#### Scenario: Imagen en escritorio
- **WHEN** en Chrome o Firefox de escritorio el usuario elige "Imagen"
- **THEN** se descarga `ejercicio.png`, sin abrir la hoja de compartir del sistema

#### Scenario: Siguiente desde la lista
- **WHEN** el dueño abre desde la lista filtrada "Mías" el tercer ejercicio y lo resuelve
- **THEN** "Siguiente" abre el cuarto ejercicio de esa lista filtrada

#### Scenario: Último de la lista
- **WHEN** el dueño resuelve el último ejercicio de la lista
- **THEN** ve "Volver a la lista" en lugar de "Siguiente"

#### Scenario: Id inválido
- **WHEN** alguien abre `/practicar/123`, un uuid que no existe o un ejercicio archivado
- **THEN** ve "No encontramos ese ejercicio" con un enlace a Practicar

### Requirement: Sin duplicados por posición
Un usuario no SHALL tener dos ejercicios activos con la misma posición. La posición se identifica por tablero, turno, enroques y al paso; los relojes no cuentan.

Al guardar un análisis, un ejercicio cuya posición ya esté activa en otra partida del usuario, o repetida dentro de la misma partida, no SHALL crearse.

#### Scenario: Partida importada dos veces
- **WHEN** el usuario importa la misma partida desde Lichess y como PGN y analiza las dos
- **THEN** sus ejercicios existen una sola vez

#### Scenario: Apertura repetida
- **WHEN** dos partidas del usuario llegan a la misma posición con el mismo error
- **THEN** solo la primera analizada genera el ejercicio

