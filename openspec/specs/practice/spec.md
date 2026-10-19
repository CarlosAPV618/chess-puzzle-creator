# practice Specification

## Purpose
TBD - created by archiving change add-chess-analyzer. Update Purpose after archive.
## Requirements
### Requirement: Generar ejercicios desde el análisis guardado
Al guardar un análisis, el servidor SHALL generar los ejercicios de esa partida en la misma transacción:
- `mistake` por cada jugada **de cualquiera de los dos bandos** clasificada Blunder u Oportunidad perdida (las Imprecisiones y los Errores no generan ejercicio);
- `brilliant` por cada Brillante verificada y con `exerciseEligible = true`, de cualquiera de los dos bandos, tanto si se jugó (`brilliant_played = true`) como si quien movía no la vio (`brilliantMissed`, `brilliant_played = false`).

Cada ejercicio SHALL guardar `side`: `me` si la jugada era del usuario, `opponent` si era del rival, o null si no se conoce el color.

Si un ply califica para ambos tipos, SHALL crearse uno solo de tipo `brilliant`.

#### Scenario: Partida con blunder
- **WHEN** se guarda el análisis de una partida donde el usuario cometió 2 Blunders y 1 Imprecisión, y su rival 1 Oportunidad perdida y 1 Error
- **THEN** se crean 3 ejercicios `mistake` (2 con `side = me` y 1 con `side = opponent`), y ni la Imprecisión ni el Error generan ejercicio. Cada ejercicio lleva con la posición previa, la jugada hecha, las jugadas aceptadas y la refutación

#### Scenario: Brillante que el usuario no vio
- **WHEN** el análisis tiene un ply del usuario marcado `brilliantMissed` y elegible
- **THEN** se crea un ejercicio `brilliant` con `side = me` y `brilliant_played = false`

#### Scenario: Brillante que el rival no vio
- **WHEN** el rival tenía una Brillante elegible y no la jugó
- **THEN** se crea un ejercicio `brilliant` con `side = opponent` y `brilliant_played = false`

#### Scenario: Brillante del rival
- **WHEN** el rival jugó una Brillante verificada y elegible
- **THEN** se crea un ejercicio `brilliant` con `side = opponent` y `brilliant_played = true`

#### Scenario: Brillante sin respuesta única
- **WHEN** una Brillante verificada tiene `exerciseEligible = false`
- **THEN** se muestra en el análisis pero no se crea ejercicio

#### Scenario: Partida sin color de usuario
- **WHEN** la partida no tiene `user_color`
- **THEN** los ejercicios se generan con `side = null`, se etiquetan "Blancas" o "Negras", y al indicar el color se rellena `side`

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
La sesión SHALL tomar hasta 10 ejercicios no archivados ni dominados con `due_at ≤ ahora`, empezando por los más atrasados. Si no hay pendientes, SHALL tomar ejercicios nuevos. Un ejercicio fallado SHALL repetirse una vez al final de la sesión en curso. SHALL permitir filtrar por tipo (errores, brillantes), de quién (mías, de rivales), clase, fase de la partida y partida.

#### Scenario: Ejercicio de error
- **WHEN** aparece un ejercicio `mistake`
- **THEN** el tablero está orientado al bando que mueve en la posición previa, con el texto "¿Qué era mejor aquí?", y no muestra qué se jugó

#### Scenario: Ejercicio de brillante
- **WHEN** aparece un ejercicio `brilliant`
- **THEN** el tablero está orientado al bando que mueve, con el texto "Hay una jugada brillante. Encuéntrala."

#### Scenario: Sin ejercicios
- **WHEN** el usuario no tiene ejercicios
- **THEN** se le invita a importar y analizar partidas

### Requirement: Validar la respuesta
- En `brilliant`, solo la jugada Brillante SHALL ser correcta.
- En `mistake`, SHALL ser correcta una jugada de `accepted_uci` (la mejor, más la segunda línea si pierde < 0.05 EP). Si no está, el motor del cliente SHALL analizar la posición previa a profundidad 14 con `searchmoves` para la jugada del usuario y para `best_uci`. Es correcta si pierde < 0.05 EP.

#### Scenario: Alternativa válida
- **WHEN** en un ejercicio `mistake` el usuario juega una jugada que no está en `accepted_uci` pero pierde solo 0.03 EP
- **THEN** se marca correcta con el texto "Buena jugada; la del motor era Cxe5"

#### Scenario: Respuesta incorrecta
- **WHEN** el usuario juega una jugada que pierde 0.15 EP
- **THEN** se marca incorrecta y se ofrecen "Reintentar", "Pista" y "Ver solución"

### Requirement: Explicar el error
Después de cada respuesta, el sistema SHALL mostrar la jugada original con su icono y quién la jugó ("Jugaste" o "Tu rival jugó"). En `mistake` SHALL animar la refutación (lo que el rival podía hacer) y luego la mejor línea, con la evaluación antes y después.

#### Scenario: Ver la refutación
- **WHEN** el usuario resuelve un ejercicio de un Blunder que dejaba mate
- **THEN** ve "Jugaste Df3??", se anima la línea del rival hasta el mate y después la jugada correcta

### Requirement: Repetición espaciada
Cada ejercicio SHALL llevar una caja de Leitner:
- correcto al primer intento sin pista: `box + 1`;
- incorrecto, con pista o con solución vista: `box = 0`.

`due_at` SHALL calcularse con intervalos de 0, 1, 3, 7 y 21 días para las cajas 0 a 4. La caja 5 SHALL marcarse dominada y salir de la cola.

El cliente SHALL enviar un solo `practice.submitResult({ exerciseId, firstTryCorrect, usedHint, viewedSolution })` por ejercicio. El servidor SHALL calcular la caja y registrar el resultado en `exercise_attempts`. La repetición al final de la sesión no SHALL cambiar la caja.

#### Scenario: Repetición en la misma sesión
- **WHEN** un ejercicio fallado reaparece al final de la sesión y ahora se acierta
- **THEN** sigue en caja 0, porque solo cuenta el primer resultado de la sesión

#### Scenario: Acierto
- **WHEN** un ejercicio en caja 2 se resuelve a la primera
- **THEN** pasa a caja 3 y vuelve a aparecer en 7 días

#### Scenario: Fallo
- **WHEN** un ejercicio en caja 3 se falla
- **THEN** vuelve a caja 0 y puede reaparecer en la misma sesión del día

### Requirement: Resumen de progreso
La sección Practicar SHALL mostrar los ejercicios pendientes de hoy, los dominados, la racha de días practicando (calculada en la zona horaria del navegador, enviada como `tz`) y un conteo por tipo de error y de brillante, separando las del usuario y las de sus rivales.

#### Scenario: Panel
- **WHEN** el usuario abre "Practicar"
- **THEN** ve "Pendientes hoy: 7 · Dominados: 23 · Racha: 4 días" y un botón "Empezar"

