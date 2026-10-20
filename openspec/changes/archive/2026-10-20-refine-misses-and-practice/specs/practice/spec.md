## MODIFIED Requirements

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

### Requirement: Sesión de práctica
La sesión SHALL tomar hasta 10 ejercicios no archivados ni dominados: primero los ya intentados con `due_at ≤ ahora`, empezando por los más atrasados; después los nuevos (sin intentos), empezando por los de las partidas más recientes. Un ejercicio fallado SHALL repetirse una vez al final de la sesión en curso.

La sesión SHALL incluir los tres tipos. Solo SHALL poder filtrarse por "De quién" (todas, mías, de rivales) y por partida; no SHALL haber filtros de tipo, clase ni fase. El botón "Empezar" SHALL estar justo debajo de los filtros.

#### Scenario: Ejercicio de error u oportunidad perdida
- **WHEN** aparece un ejercicio `mistake` o `miss`
- **THEN** el tablero está orientado al bando que mueve en la posición previa y resalta la última jugada del rival (origen y destino)
- **AND** muestra el texto "¿Qué era mejor aquí?" sin revelar qué se jugó
- **AND** si es el primer ply de la partida, no se resalta ninguna jugada

#### Scenario: Ejercicio de brillante
- **WHEN** aparece un ejercicio `brilliant`
- **THEN** el tablero está orientado al bando que mueve, con el texto "Hay una jugada brillante. Encuéntrala.", y no resalta la última jugada

#### Scenario: Nuevos de partidas recientes
- **WHEN** no hay ejercicios vencidos y hay ejercicios nuevos de una partida de ayer y de una de hace un mes
- **THEN** la sesión empieza por los de la partida de ayer

#### Scenario: Sin ejercicios
- **WHEN** el usuario no tiene ejercicios
- **THEN** se le invita a importar y analizar partidas

### Requirement: Explicar el error
Después de cada respuesta, el sistema SHALL mostrar la jugada original con su icono y quién la jugó, con la evaluación antes y después. Para el dueño dice "Jugaste" o "Tu rival jugó"; para cualquier otra persona, el nombre del jugador ("CarlosAPV jugó exd5").

En `mistake` y `miss` SHALL ofrecer "Lo que podía pasar" (la refutación) y "Mejor línea". Ninguna SHALL reproducirse sola: el usuario las recorre con ◀ ▶ (botones y teclado) y puede volver a la posición del ejercicio.

Tras la respuesta, el tablero SHALL quedarse en la jugada del usuario con el icono de su resultado:
- si es correcta, el icono de Mejor (o de Brillante en `brilliant`);
- si es incorrecta, el de su clasificación.

La jugada original de la partida SHALL mostrarse en el panel ("En la partida: exd5" con su icono) y en el tablero solo dentro de "Lo que podía pasar". Así el icono del tablero nunca contradice el veredicto.

#### Scenario: Correcto sin contradicción
- **WHEN** el usuario acierta un ejercicio `miss` cuya jugada original fue exd5
- **THEN** el tablero muestra su jugada con el icono de Mejor junto a "¡Correcto!"
- **AND** el panel dice "En la partida: exd5" con el icono de Oportunidad perdida

#### Scenario: Ver la refutación a mano
- **WHEN** el usuario resuelve un ejercicio de un Blunder que dejaba mate
- **THEN** ve "Jugaste Df3??" y el tablero no se mueve solo
- **AND** al tocar "Lo que podía pasar" y luego ▶, avanza una jugada por toque hasta el mate

### Requirement: Repetición espaciada
Cada ejercicio SHALL llevar una caja de Leitner:
- correcto al primer intento sin pista: `box + 1`;
- incorrecto, con pista o con solución vista: `box = 0`.

`due_at` SHALL calcularse con intervalos de 0, 1, 3, 7 y 21 días para las cajas 0 a 4. La caja 5 SHALL marcarse dominada y salir de la cola.

El cliente SHALL enviar un solo `practice.submitResult({ exerciseId, firstTryCorrect, usedHint, viewedSolution })` por ejercicio, en cuanto el resultado queda fijado (al acertar o al ver la solución), no al pasar al siguiente.

El servidor SHALL calcular la caja y registrar el resultado en `exercise_attempts`. No SHALL cambiar la caja:
- la repetición al final de la sesión;
- un ejercicio ya intentado que aún no vence (`due_at > ahora`), por ejemplo abierto desde su enlace.

#### Scenario: Repetición en la misma sesión
- **WHEN** un ejercicio fallado reaparece al final de la sesión y ahora se acierta
- **THEN** sigue en caja 0, porque solo cuenta el primer resultado de la sesión

#### Scenario: Acierto
- **WHEN** un ejercicio en caja 2 se resuelve a la primera
- **THEN** pasa a caja 3 y vuelve a aparecer en 7 días

#### Scenario: Fallo
- **WHEN** un ejercicio en caja 3 se falla
- **THEN** vuelve a caja 0 y puede reaparecer en la misma sesión del día

#### Scenario: Abierto antes de tiempo
- **WHEN** el dueño abre por enlace un ejercicio en caja 2 que vence en 3 días y lo acierta
- **THEN** se registra el intento, pero sigue en caja 2 con la misma `due_at`

#### Scenario: Cerrar la pestaña tras acertar
- **WHEN** el usuario acierta un ejercicio y cierra la pestaña sin pulsar "Siguiente"
- **THEN** el resultado ya quedó guardado

### Requirement: Resumen de progreso
La sección Practicar SHALL mostrar los ejercicios pendientes de hoy, los dominados y la racha de días practicando. La racha se calcula en la zona horaria del navegador, enviada como `tz`.

No SHALL mostrar la tabla de conteos por tipo y clase.

#### Scenario: Panel
- **WHEN** el usuario abre "Practicar"
- **THEN** ve "Pendientes hoy: 7 · Dominados: 23 · Racha: 4 días", los filtros, el botón "Empezar" y la lista de ejercicios

## ADDED Requirements

### Requirement: Lista de ejercicios
Debajo del botón "Empezar", `/practicar` SHALL listar los ejercicios no archivados del usuario, de 12 en 12 y con paginación, aplicando los mismos filtros que la sesión.

El orden SHALL ser de lo más reciente a lo más antiguo: por la fecha de la partida (o la de importación si no la tiene), luego la de importación y luego el ply.

Cada tarjeta SHALL mostrar:
- una miniatura de la posición del ejercicio, orientada al bando que mueve;
- debajo, a modo de título, los jugadores ("CarlosAPV vs jyonGM53") y el número de jugada;
- el icono del tipo (Error grave, Brillante u Oportunidad perdida);
- si está dominado.

Tocar una tarjeta SHALL abrir el ejercicio en `/practicar/<id>`. La página SHALL estar en la URL (`?pagina=2`) para que atrás y recargar conserven la posición.

#### Scenario: Paginación con filtro
- **WHEN** el usuario tiene 30 ejercicios, filtra "De rivales" (14) y va a la página 2
- **THEN** ve los ejercicios 13 y 14 de rivales y la URL es `/practicar?lado=rivales&pagina=2`

#### Scenario: Página fuera de rango
- **WHEN** la URL pide `?pagina=99` y solo hay 2 páginas
- **THEN** se muestra la última página

### Requirement: Ejercicio por URL
Cada ejercicio SHALL poder abrirse en `/practicar/<id>` y tener un botón "Compartir" (Web Share API, o copiar el enlace si no está disponible).

- El dueño SHALL resolverlo igual que en una sesión, y el resultado SHALL contar para su repetición espaciada.
- Cualquier otra persona, con o sin sesión, SHALL poder resolverlo (decisión del usuario). No se guarda ningún resultado. Solo se muestran la posición, las jugadas y los nombres de los jugadores de la partida; nunca el correo, el id del dueño, su caja ni el enlace a la partida.

El servidor SHALL limitar las lecturas por IP sin sesión, o por usuario con sesión. Un id mal formado, inexistente, archivado o de una partida borrada SHALL dar la misma respuesta: "No encontramos ese ejercicio".

#### Scenario: Compartir
- **WHEN** el dueño toca "Compartir" en un ejercicio y otra persona sin cuenta abre el enlace
- **THEN** esa persona resuelve el ejercicio con pista, solución y explicación, y no se llama a `practice.submitResult`

#### Scenario: Id inválido
- **WHEN** alguien abre `/practicar/123`, un uuid que no existe o un ejercicio archivado
- **THEN** ve "No encontramos ese ejercicio" con un enlace a Practicar
