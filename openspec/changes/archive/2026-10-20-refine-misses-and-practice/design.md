## Context

El primer change (`2026-10-18-add-chess-analyzer`, archivado) dejó la app en producción. Este change parte de pruebas reales del usuario con partidas de chess.com:
- CarlosAPV vs jyonGM53, `d6e84ebe…`;
- CarlosAPV vs JihadGhaziri, `b00bc2ec…`.

Las comprobaciones de abajo se hicieron sobre esos datos y sobre el código actual.

Decisiones del usuario (2026-10-18):
- Los ejercicios se pueden abrir con el enlace, por cualquier persona (D5).
- La calibración con más partidas queda para después; por ahora vale lo deducido de jyonGM53 (D1).
- "Yo soy" aparece solo cuando no se puede saber el color del usuario (D9).

## Goals / Non-Goals

**Goals:**
- Que las Oportunidades perdidas coincidan con chess.com en partidas reales.
- Practicar con tres tipos claros, una lista navegable y un enlace por ejercicio.
- Revisión y listas cómodas en un celular de 360 px.

**Non-Goals:**
- Replicar la curva de EP dependiente del rating de chess.com (no es pública).
- Usar el motor de chess.com: corre en sus servidores y no tiene API pública.
- Cambiar el motor o la profundidad por defecto (D2).

## Decisions

### D1. Oportunidad perdida: "tenías una posición ganadora y la soltaste"

chess.com define Miss como no aprovechar el error del rival y perder la oportunidad de una posición ganadora, normalmente acabando en igualdad o peor. No publica los umbrales ([Fuentes](#fuentes-verificadas-2026-10-18)).

La regla v2 exigía que la jugada previa del rival fuera Error o Blunder y que la mejor diera EP ≥ 0.75. En jyonGM53 daba 0 Omisiones; chess.com marca 3.

**Regla v3:** una jugada que la tabla clasifica como Imprecisión o Error es Oportunidad perdida si `EP(mejor) ≥ MISS_WIN` y `EP(después) < MISS_WIN`, ambos desde el bando que mueve. `MISS_WIN = 0.62`.

Medición sobre jyonGM53 (Stockfish 19 lite en node con el clasificador actual y la regla v3 aplicada encima):

| Fuente | Blancas: Omisión / Error / Mejor | Tiempo (node, 1 hilo) |
|---|---|---|
| chess.com | 3 / 1 / 17 | — |
| Guardado, profundidad 12 | 4 (incluye 14.Axe7, en el límite: EP 0.627) / 0 / 16 | — |
| Lite, profundidad 16 | **3** (8.Ab5, 11.Ag5, 12.Da4) / 0 / **17** | 98 s |
| Lite, profundidad 20 | **3** (las mismas) / 1 (25.Dh5) / 14 | 718 s |
| NNUE completa, profundidad 20 | 3 / 2 / 12 | 903 s |

Con `MISS_WIN` en 0.60 salen 4 Omisiones a profundidad 20; con 0.64, 1–2. Con 0.62 el resultado se mantiene igual a profundidad 16 y 20. A profundidad 12 (Rápido) puede aparecer alguna Omisión de más en el límite; es el precio de ese preset.

- **Alternativa descartada:** "el rival se equivocó y devolviste la ventaja", sin exigir posición ganadora. Daba 2–3 Omisiones a las negras (chess.com: 1) y marcaba 18.Te1, que deja +1.86.
- **Diferencia conocida:** chess.com cuenta 1 Omisión y 0 Blunders a las negras. Nosotros damos 14…Cxe7 como Blunder (pérdida 0.22, en el límite de 0.20). Lo atribuimos a su curva por rating.
- **Calibración con más partidas:** aplazada por decisión del usuario (sección 10 de tasks).

Los Brillantes no vistos (`brilliantMissed`) siguen mostrándose igual en la revisión. Para practicar cuentan como Oportunidad perdida (D3).

### D2. Motor: se queda Stockfish 19 lite de un hilo, preset Normal 16 por defecto

chess.com usa Stockfish 18 con la NNUE completa en sus servidores. La medición de D1 muestra que:
- la red completa (94 MB, `stockfish-19-single.wasm`) no se acerca más a chess.com y es 25 % más lenta;
- la profundidad no explicaba la diferencia: 16 y 20 dan las mismas Omisiones.

**Se mantienen** el motor, los presets 12/16/20 y Normal por defecto.

- **Alternativa descartada:** la NNUE completa. Son 94 MB por usuario, quedan fuera del precache de la PWA y obligan a revisar los límites de archivos estáticos de Vercel.
- **Alternativa aplazada:** multihilo con COOP/COEP. Requiere las cabeceras en todo el sitio, porque la navegación del cliente conserva las del documento inicial. Solo se aborda si la tarea 7.1 da más de ~3 min a profundidad 16.

### D3. Tres tipos de ejercicio: `mistake`, `brilliant`, `miss`

`exercises.kind` es `text` y el enum solo existe en TypeScript, así que el cambio de tipo es solo de datos y va en la migración `0002` (ver D9 para la otra parte de esa migración):

```sql
update exercises set kind = 'miss', updated_at = now()
where kind <> 'miss' and (class = 'miss' or (kind = 'brilliant' and brilliant_played = false));
```

Corre antes de que el código nuevo regenere ejercicios. Así, en un reanálisis, `kind` coincide y el `upsert` de `saveAnalysis` conserva `box` y `due_at`, porque solo reinicia cuando cambian `kind` o `best_uci`.

`buildExercises` aplica la prioridad (un ply no puede ser Brillante jugada y no vista a la vez):
1. Brillante no vista → `miss`, con la Brillante como única respuesta y `brilliant_played = false`;
2. Brillante jugada → `brilliant`;
3. Blunder → `mistake`;
4. Oportunidad perdida → `miss`.

Las jugadas aceptadas siguen la regla de siempre: la mejor, más la segunda si pierde menos de 0.05.

En la UI, el icono del tipo es `ClassIcon` de `blunder`, `brilliant` y `miss`. La validación estricta y el texto "Había una jugada brillante. Encuéntrala." dependen de `brilliant_played = false`, no del tipo.

### D4. `/practicar`: filtros, "Empezar", lista paginada

- **Filtros.** Solo "De quién" (`?lado=mias|rivales`) y "Partida" (`?partida=<uuid>`, que ya existe). Se quitan del router y de la UI `kind`, `cls` y `phase`, y la tabla `Breakdown` (más `summary.counts`, `byKind` y `bySide`; se conserva `total` para el estado vacío).
- **Botón.** "Empezar" va justo debajo de los filtros.
- **Orden "más reciente" en todo el change:** `coalesce(games.played_at, games.created_at) desc, games.created_at desc`. Es el mismo que usa `games.list` (D9).
- **`practice.list({ side?, gameId?, page })`**, protegido:
  - 12 por página, ordenados por "más reciente" y luego `exercises.ply asc`;
  - devuelve `{ items, total, page }`, y una página fuera de rango se ajusta a la última;
  - cada item lleva `id`, `kind`, `fen`, `sideToMove`, `white`, `black`, `moveNumber = floor(ply/2)+1` y `mastered`.
- **`queue` (la sesión)** primero toma los ejercicios ya intentados y vencidos (`attempts > 0 and due_at <= now()`, por `due_at asc`). Después, los nuevos (`attempts = 0`), por "más reciente". Hoy los nuevos salen por fecha de creación ascendente, es decir, los más viejos primero.
- **Miniatura.** `MiniBoard` nuevo: cuadrícula CSS de 8×8 con las imágenes cburnett, sin `react-chessboard` (que pesa y es interactivo), con `aria-label`. La comparten `/practicar` y `/partidas`.
- **Aviso de Stockfish.** `EngineNotice` aparece una sola vez, al pie de `/practicar`. Se quita de `review.tsx` y de la vista del ejercicio.

### D5. `/practicar/[id]`: cualquiera con el enlace (decisión del usuario)

`ExerciseView` sale de `practicar/page.tsx` a `src/components/exercise.tsx`. Lo usan la sesión y la página `/practicar/[id]`.

**`practice.byId({ id })`** es un `publicProcedure`:
- `id` llega como `z.string().max(64)`. Si no es un uuid, si no existe, si está archivado o si su partida se borró, responde el mismo `NOT_FOUND` ("No encontramos ese ejercicio"). Así no hay enumeración, y no hay un `BAD_REQUEST` distinto que revele el formato.
- Rate limit de 60/min, por IP sin sesión (`practice.byId:ip:<ip>`) o por usuario con sesión.
- Devuelve `{ exercise, owner }`. Para quien no es dueño se omiten `gameId`, `box` y `side`: no hay enlace "Ver en la partida" (que además está protegida) y el texto usa los nombres de los jugadores ("CarlosAPV jugó exd5"), no "Jugaste". Nunca se exponen el correo ni el id del dueño.
- `submitResult` sigue protegido y validado por dueño, y el cliente solo lo llama si `owner`.

**Middleware.** Pasa a excluir `/practicar/<id>`; `/practicar` sigue protegido. El service worker ya trata `/practicar/*` como `NetworkOnly`.

**"Compartir".** Usa `navigator.share`, o copia la URL con `navigator.clipboard` y avisa con "Enlace copiado".

### D6. Ejercicio: última jugada, veredicto coherente, explicación manual y resultado

- **Última jugada.** `lastMoveUci = games.moves_uci[ply-1]`, o null en ply 0. Se resalta con el estilo `LAST` de `Board` en `mistake` y `miss`; en `brilliant` no.
- **Veredicto coherente (bug reportado).** Hoy, 1.2 s después de acertar, la explicación arranca sola (`useEffect` sobre `phase === "solved"`). Reproduce la jugada original con su icono (exd5 ✗) mientras el panel sigue diciendo "¡Correcto!". Ahora:
  - el tablero se queda en la jugada del usuario con el icono de Mejor (o de Brillante, o de su clasificación si falló);
  - el panel dice "En la partida: exd5" con el icono original.
- **Sin autoplay.** Se eliminan los dos temporizadores. "Lo que podía pasar" y "Mejor línea" son botones; cada uno abre su secuencia, que se recorre con ◀ ▶ (el estilo de `NavBar` y teclado ← →), con "Volver al ejercicio".
- **Resultado al resolver.** El resultado (`firstTryCorrect`, `usedHint`, `viewedSolution`) queda fijado en cuanto se acierta o se ve la solución. Hoy se envía al pulsar "Siguiente", y si se cierra la pestaña se pierde. Ahora se envía en ese momento, en la sesión y en `/practicar/[id]` (solo si `owner`).
- **Repetición espaciada desde la URL.** Un ejercicio ya intentado y aún no vencido (`attempts > 0 and due_at > now()`) registra el intento, pero no mueve la caja. Si no, abrirlo por enlace permitiría adelantar la repetición. Lo decide el servidor en `submitResult`, igual que la repetición dentro de la sesión.

### D7. Tableros: flechas y casillas con clic derecho

Verificado en `react-chessboard` 5 (`dist/index.esm.js`):
- `allowDrawingArrows` y `clearArrowsOnClick` son `true` por defecto;
- las flechas dibujadas viven en un estado propio (`internalArrows`), separado de la prop `arrows`, y no se pisan;
- terminar de dibujar una flecha no dispara `onSquareRightClick`.

Hoy `Board` pone `allowDrawingArrows: false`.

- Se activa. La flecha de la mejor jugada sigue en `arrows`.
- Las casillas marcadas son un estado de `Board`, alternado con `onSquareRightClick` y fusionado en `squareStyles` con un rojo translúcido, como lichess. Se limpian con clic izquierdo y al cambiar la FEN.
- **[POR VERIFICAR] tarea 7.3:** que un toque largo en Android o iOS no dispare `contextmenu` y marque casillas sin querer. Si pasa, desactivar el marcado con `pointerType === "touch"`.

### D8. Revisión de partida

- **Posición inicial.** `useState(N)` → `useState(0)` en `GameReview`. Aplica a `/partidas/[id]` y a `/analizar`; ningún efecto lleva a N al terminar el análisis.
- **Controles.** `AnalysisControls` (prop `toolbar`) y el aviso de reanálisis van debajo de `Summary` cuando hay análisis; sin análisis, siguen arriba. Hoy el aviso vive en `partidas/[id]/page.tsx`, encima de `GameReview`, así que pasa a `GameReview` como parte de `toolbar`.
- **Repasar y Girar.** En escritorio (≥ `lg`) se quedan donde están.
- **Celular y tablet (< `lg`, el mismo corte en que hoy la barra de `NavBar` es fija):**
  - la barra fija suma dos botones de icono: Repasar (`GraduationCap`), que durante el repaso pasa a "Salir del repaso" (`X`), y Girar (`RefreshCw`);
  - en el panel se ocultan esos dos para no duplicarlos;
  - al iniciar el repaso, `boardRef.current.scrollIntoView({ block: "start" })`, con `scroll-margin-top` igual a la cabecera fija.
- **Repaso sin pistas.** `arrows` dibuja la mejor jugada tras cada jugada mala (rama `prevBest`), incluso con el repaso en pausa sobre esa jugada, y revela la respuesta. Con un repaso activo (`review && !review.finished`), esa rama no se aplica; la flecha solo sale con "Ver solución" (`trial.status === "solution"`).
- **Gráfica.** Cambia `touch-none` por `touch-pan-y`. Con `pointerType === "touch"` solo se selecciona en `pointerup`, si el dedo se movió menos de 8 px y no hubo `pointercancel`. Con mouse se sigue arrastrando.
- **Aviso de Stockfish.** Sale de `review.tsx` (D4).

### D9. `/partidas`, color del usuario y desborde en celular

- **Causa del menú que "no queda fijo".** La fila de la tarjeta (nombres, resultado, precisión e iconos) no se ajusta y la página queda más ancha que el viewport. Al desplazarse en horizontal, el `nav` fijo se sale de la vista (captura del usuario: el chevron cortado a la derecha).
- **Tarjeta nueva:**
  - `MiniBoard` de la posición final a la izquierda (`w-20` / `sm:w-24`) y datos a la derecha, con `min-w-0`, `truncate` y `flex-wrap`;
  - sin contador de errores; Brillante solo si `brilliants > 0`;
  - borrar, igual que hoy.
- **"Yo soy" (decisión del usuario).** El selector solo aparece si `user_color` es null, es decir, cuando ni el usuario de la plataforma ni `player_names` permitieron detectarlo. Al elegir un color desaparece.
  - No hay opción "Ninguno": una partida ajena se queda sin color, y el selector visible es el recordatorio.
  - Ya no se puede cambiar un color detectado; viene de nombres que el propio usuario registró.
  - `setUserColor` hoy no guarda el nombre elegido, aunque la spec de `game-import` lo pide. Ahora, en la misma transacción, lo registra en `player_names` y asigna el color a las demás partidas del usuario sin color donde juega ese nombre. Así basta elegir una vez.
- **Posición final:** columna nueva `games.final_fen`, nullable.
  - Calcularla en cada `games.list` cuesta ~15 ms por partida (medido con `replay` en una partida de 86 jugadas), unos 1.5 s con 100 partidas.
  - `games.import` ya reproduce la partida con `parseGamePgn`, así que la guarda al importar.
  - Las filas viejas se rellenan solas: `games.list` calcula y hace `update` de las que vengan con `final_fen` null. Es de una sola vez y evita un script aparte.
  - Va en la migración `0002`, junto con el cambio de tipos de D3.
- **Orden.** El de D4. Los PGN pegados desde la app de chess.com traen solo `[Date]` (comprobado en los dos guardados), así que dos partidas del mismo día empatan y se ordenan por importación.
- **Garantía global.** Un test de Playwright (tarea 6.5) recorre todas las rutas a 360 y 390 px y falla si `document.documentElement.scrollWidth > innerWidth`.

### D10. Icono de la PWA

Medido en `maskable-512.png`:
- el caballo ocupa el **42 %** de alto (no el 60 % que dice `docs/logo.md`);
- su punto más lejano está al **27 %** del centro.

La zona segura maskable es un círculo de radio 40 %, así que el caballo puede escalarse ×1.45: unos 61 % de alto, con el punto más lejano en ~39 %.

> Corrección: en la versión anterior de este plan proponía 72 %, lo que recortaría las esquinas de la base en máscaras redondas.

- Se regenera con esa escala, y `apple-touch-icon` con el mismo criterio.
- Los archivos cambian de nombre (`-v2`) en `manifest.ts` y `layout.tsx`.
- El verde del PNG es exactamente `#7fb24a`, igual que el SVG. Lo "apagado" se debe al tamaño y al recorte, no al color.
- **[POR VERIFICAR] tarea 8.3:**
  - Chrome puede tardar en actualizar el icono de una app ya instalada; si no cambia, desinstalar y reinstalar.
  - Si sigue viéndose apagado, probar el mosaico con `--color-brand-strong` (`#96c95c`) solo en el icono instalado.

### Elo (sin cambios)

El usuario dudaba de que el Elo fuera el mismo en ambos lados. La API pública de chess.com (`/pub/player/carlosapv/games/2026/10`) confirma 1786 vs 1786 (jyonGM53) y 1775 vs 1775 (JihadGhaziri); el resto de partidas tienen Elo distinto. `parseGamePgn` lee bien `WhiteElo` y `BlackElo`.

## Risks / Trade-offs

- **`MISS_WIN` se calibró con una sola partida.** Mitigación: es una constante con test de referencia, y la calibración queda en la sección 10 de tasks.
- **Enlace público de ejercicios.** Expone nombres de jugadores y una posición. Mitigación: uuid no adivinable, sin datos de la cuenta, `NOT_FOUND` uniforme y rate limit. `rate_limits` acumula una fila por IP (ya anotado con `ponytail:` en `rate-limit.ts`).
- **Relleno perezoso de `final_fen`.** La primera carga de "Mis partidas" tras el deploy hace los `update` pendientes; son pocas filas (tope de 20 cuentas).

## Migration Plan

1. `pnpm db:migrate` con `0002` contra Neon, antes del merge:
   - `alter table games add column final_fen text`;
   - el `update` de tipos de D3.

   El código en producción lo tolera mientras dura el deploy: ignora la columna nueva y trata cualquier `kind` distinto de `brilliant` como un error ("¿Qué era mejor aquí?").
2. Merge y deploy.
3. Las partidas analizadas muestran "Reanalizar" (`CLASSIFIER_VERSION = 3`).
4. Rollback: revertir el deploy y `update exercises set kind = case when brilliant_played = false then 'brilliant' else 'mistake' end where kind = 'miss';`. La columna `final_fen` puede quedarse.

## Open Questions

Ninguna.

## Fuentes verificadas (2026-10-18)

- Definición de Miss y modelo de puntos esperados de chess.com: https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc
- Motor de Game Review (Stockfish 18 con NNUE completa en servidor): https://support.chess.com/en/articles/9462780-chess-engines-on-chess-com-how-do-they-work
- API pública de partidas: https://api.chess.com/pub/player/carlosapv/games/2026/10
- `react-chessboard` 5: valores por defecto, `internalArrows` y `onSquareRightClick` en `node_modules/react-chessboard/dist/index.esm.js` (líneas ~4884–5500).
- Builds de `stockfish` 19.0.1: `lite-single` (1.8 MB), `single` (94.6 MB), `lite` y `full` multihilo.
- Mediciones locales: scripts `reana.ts` y `rule.ts` (temporales), `maskable-512.png` medido con PIL y `replay` medido con tsx.
