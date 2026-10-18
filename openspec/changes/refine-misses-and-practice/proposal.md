## Why

Pruebas con partidas reales mostraron cuatro problemas:

1. **Oportunidades perdidas.** En CarlosAPV vs jyonGM53, chess.com marca 3 Omisiones de CarlosAPV y la app 0. Hay dos causas:
   - La regla actual es demasiado estricta. Exige que el rival haya cometido un Error o Blunder justo antes y que la mejor jugada dé EP ≥ 0.75.
   - La partida se analizó a profundidad 12.
2. **Práctica.** Los ejercicios se agrupan en tres tipos de cara al usuario, y los Brillantes no vistos son en realidad oportunidades perdidas. Los filtros de tipo, clase y fase sobran. No hay forma de ver ni compartir un ejercicio concreto. "Lo que podía pasar" se reproduce solo.
3. **Celular.** En "Mis partidas" una tarjeta desborda el ancho, lo que provoca scroll horizontal y hace que el menú inferior se pierda. En la revisión:
   - "Repasar partida" y "Girar tablero" quedan fuera de la vista.
   - La gráfica de evaluación atrapa el gesto de scroll.
4. **Revisión.** Al abrir una partida se muestra la posición final en vez de la inicial. El aviso de Stockfish aparece en cada pantalla.

El Elo se revisó y es correcto: la API de chess.com confirma 1786 vs 1786 y 1775 vs 1775. No requiere cambios.

## What Changes

- **Oportunidad perdida (clasificador v3).**
  - Nueva regla alineada con la definición de chess.com: no aprovechar una ventaja ganadora que dejó el rival, o no ver un mate.
  - Umbrales calibrados contra las revisiones de chess.com de partidas reales.
- **Motor.** Se queda Stockfish 19 lite con Normal 16 por defecto. La medición mostró que la diferencia con chess.com venía de la regla, no del motor ni de la profundidad (D2).
- **Tres tipos de ejercicio:**
  - **Error grave** (`mistake`).
  - **Brillante** (`brilliant`).
  - **Oportunidad perdida** (`miss`): incluye las Oportunidades perdidas y los Brillantes no vistos.
  - Las filas existentes se migran sin perder el progreso.
- **`/practicar`:**
  - Se quitan los filtros de tipo, clase y fase, y la tabla de conteos.
  - Quedan "De quién" y "Partida", con el botón "Empezar" justo debajo.
  - Debajo, una lista paginada de tarjetas con miniatura, jugadores y número de jugada.
  - El aviso de Stockfish queda solo al pie de esta pantalla.
- **`/practicar/[id]`.** Cada ejercicio tiene su propia URL para compartirlo, y cualquiera con el enlace puede resolverlo sin que se guarde nada.
  - Para el dueño, el resultado se guarda al resolverlo. Abrirlo antes de que toque no adelanta la repetición espaciada.
  - Tras acertar, el tablero ya no muestra la jugada original con su ✗ junto a "¡Correcto!".
  - En errores y oportunidades perdidas se resalta la última jugada del rival.
  - "Lo que podía pasar" y la mejor línea se recorren a mano; nunca se reproducen solas.
- **Tableros.** Se pueden dibujar flechas con el botón derecho arrastrando y marcar casillas con clic derecho.
- **`/partidas`:**
  - Miniatura de la posición final a la izquierda y los datos a la derecha.
  - Sin contadores de errores; el icono de Brillante solo aparece si hay alguno.
  - "Yo soy" solo cuando no se pudo detectar el color. Al elegirlo, ese nombre se recuerda para las demás partidas.
  - Lo más reciente primero, en todas las listas.
  - Sin desborde horizontal.
- **Revisión de partida:**
  - Abre en la posición inicial.
  - "Reanalizar" y la profundidad pasan debajo de la tabla de precisión.
  - En celular y tablet, "Repasar partida" y "Girar tablero" van en la barra fija de navegación, y al iniciar el repaso el tablero queda a la vista.
  - En táctil, la gráfica solo responde a toques.
- **Celular en general.** Ninguna página desborda a 360 px; se comprueba de forma automática.
- **Icono de la PWA.** El caballo, más grande dentro de la zona segura de Android.

## Capabilities

### New Capabilities
<!-- ninguna -->

### Modified Capabilities
- `move-classification`: nueva regla de Oportunidad perdida.
- `game-analysis`: pantalla de revisión, Mis partidas, aviso de licencia.
- `game-import`: color del usuario ("Yo soy" solo si no se detecta; recordar el nombre).
- `pwa`: icono maskable.
- `practice`: tipos de ejercicio, lista paginada, ejercicio por URL, explicación manual, filtros.

## Impact

- **Código:**
  - `src/lib/classify` (regla Miss, `CLASSIFIER_VERSION = 3`) y `src/lib/engine`.
  - `src/server/services/analysis.ts` (`buildExercises`).
  - `src/server/api/routers/practice.ts` (`list`, `byId`, filtros, cola, `submitResult`) y `games.ts` (`finalFen`, orden, `setUserColor`).
  - `src/app/practicar/**`, `src/app/partidas/**`.
  - `src/components/{review,board,eval-graph,nav-bar,engine-notice}.tsx`, más `mini-board.tsx` y `exercise.tsx`.
  - `src/middleware.ts`, `public/icons/*-v2.png`, `docs/logo.md`.
- **Base de datos:** migración `0002`, que se aplica antes del merge:
  - añade `games.final_fen` (nullable, se rellena al listar);
  - mueve a `miss` los ejercicios con `class = 'miss'` y los Brillantes no jugados (`exercises.kind` es `text`, así que no cambia el esquema).
- **Análisis guardados:** con `CLASSIFIER_VERSION = 3`, las partidas ya analizadas muestran el aviso de reanalizar.
- **Middleware:** `/practicar/[id]` es accesible sin sesión (decisión del usuario, D5).
