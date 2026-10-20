## Why

El usuario usó la app en producción y encontró estos problemas (capturas del 2026-10-19):

1. **Ejercicio que acepta la jugada de la partida.** El ejercicio de O-O en CarlosAPV vs JihadGhaziri es una Oportunidad perdida, pero al volver a jugar O-O la app dice "Buena jugada; la del motor era a4". Así se "resolvió" dos veces (caja 2) sin aprender nada (D1).
2. **Práctica:**
   - Los ejercicios fallados se repiten al final y alargan la sesión.
   - "Empezar" da siempre el mismo orden.
   - Las cajas de Leitner (1, 3, 7, 21 días) no siguen la regla que pide el usuario.
   - Al abrir un ejercicio de la lista no hay "Siguiente".
   - "Compartir" solo comparte el enlace.
3. **Revisión:**
   - "Encuentra una jugada mejor que b5" no dice de qué bando es ni el número de jugada.
   - La gráfica marca también las jugadas del rival y no marca Imprecisiones.
   - La fila de botones se parte en dos en celular.
   - La franja de jugadas es muy alta.
   - Al tocar ◀ ▶ o "Repasar partida", la página se desplaza sola.
   - El encabezado de la partida es alto y no dice quién ganó.
4. **Navegación y listas:**
   - En celular, el menú inferior fijo ocupa espacio; el usuario prefiere un menú hamburguesa arriba.
   - En "Mis partidas", la miniatura queda arriba y solo la imagen y los nombres abren la partida.
   - Al importar por usuario hay que volver a escribir el nombre de chess.com o Lichess.
   - Las piezas de las miniaturas se seleccionan como texto.

## What Changes

- **Validación (D1):** la jugada que se hizo en la partida nunca es correcta. En una Oportunidad perdida, una alternativa además tiene que conservar la posición ganadora.
- **Repetición espaciada nueva (D2), reemplaza las cajas de Leitner.** `box` pasa a contar los aciertos seguidos:
  - 0 = nuevo o fallado: prioridad, ya;
  - 1 = acertado una vez: vuelve en 2 meses;
  - 2 = acertado dos veces seguidas: vuelve en 6 meses;
  - 3 = dominado: ya no sale en "Empezar".
  - Un fallo vuelve a 0.
  - Cuentan todos los resultados del dueño: "Empezar", "Practicar partida" o el ejercicio abierto desde la lista.
  - La migración `0003` convierte las cajas actuales.
- **"Empezar" en orden aleatorio (D2):** primero los nuevos y fallados, después los repasos vencidos, al azar dentro de cada grupo.
- **Sesión sin repeticiones al final (D3).**
- **"Siguiente" en `/practicar/<id>` (D4):** lleva al siguiente ejercicio de la lista, con los mismos filtros.
- **Compartir ejercicio (D5):** "Enlace" o "Imagen". La imagen es un PNG del tablero con "Juegan blancas" o "Juegan negras" y nada más. En celular se usa la hoja nativa de compartir, para ambas opciones; en escritorio la imagen se descarga.
- **Revisión (D7):**
  - número de jugada y bando en los textos;
  - gráfica solo con las jugadas del usuario, ahora también con Imprecisiones;
  - botones "Repasar partida", "Practicar partida" y Girar en una sola fila;
  - franja de jugadas más baja;
  - la página no se desplaza sola;
  - encabezado compacto con el resultado.
- **Menú hamburguesa solo en celular (D6):** sustituye al menú inferior. Muestra el avatar y el correo, las páginas, "Instalar app" y "Cerrar sesión". Se quita el botón "Cerrar". En escritorio no cambia.
- **"Mis partidas" (D8):** toda la tarjeta abre la partida y la miniatura queda centrada en vertical.
- **Importar por usuario (D9):** se prellenan los usuarios de chess.com y Lichess, sacados de las partidas ya importadas.
- **Carga por partes (D12):**
  - "Mis partidas" carga 30 y otras 30 al hacer scroll.
  - La lista de `/practicar` carga 28 por tanda y deja de tener paginación.
- **Tableros (D10):** las piezas no se pueden seleccionar como texto.
- **Specs:** se ponen al día con lo que ya hizo `a586b14`:
  - sin "Lo que podía pasar";
  - botones bajo el tablero;
  - "Practicar partida";
  - sin ejercicios duplicados por posición.

## Capabilities

### New Capabilities
- `navigation`: menú principal (escritorio en el encabezado, celular en hamburguesa).

### Modified Capabilities
- `practice`: sesión de práctica, validar la respuesta, explicar el error, repetición espaciada, resumen de progreso, lista de ejercicios y ejercicio por URL. Se añade "Sin duplicados por posición".
- `game-analysis`: pantalla de revisión, Mis partidas, y reintentar y repasar la partida.
- `game-import`: importar por usuario.

## Impact

- **Base de datos:**
  - migración `0003_streak_schedule.sql`, solo datos (`box` y `due_at`), sin columnas nuevas;
  - se aplica en Neon justo después del deploy, con respaldo previo (autorizado por el usuario; orden explicado en D2).
- **Servidor:**
  - `src/server/api/routers/practice.ts`: `queue`, `submitResult`, `summary`, `list` con cursor, `next` nuevo y orden con desempate;
  - `src/server/api/routers/games.ts`: `list` con cursor;
  - `src/server/api/routers/players.ts`: `accounts` nuevo.
- **Motor:** `src/hooks/use-engine.ts` (`judgeMove`) y `src/lib/engine/check-move.ts`.
- **UI:**
  - componentes: `src/components/{app-shell,review,exercise,eval-graph,move-list,mini-board,board}.tsx`;
  - páginas: `src/app/partidas/{page,[id]/page}.tsx`, `src/app/practicar/{page,[id]/page}.tsx`;
  - importación: `src/app/_components/import-form.tsx`.
- **Nuevo:** `src/components/share-image.ts` (canvas a PNG, sin dependencias nuevas).
- **Tests:** `test/server.test.ts` (reglas nuevas) y `e2e/mobile-overflow.spec.ts` (sin menú inferior, botones en una fila).
- **Prerrequisito:** archivar `refine-misses-and-practice`, que ya está en producción. Las deltas de este change parten de sus textos.
