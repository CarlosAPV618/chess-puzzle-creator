## 0. Preparación

- [ ] 0.1 Archivar `refine-misses-and-practice` (`openspec archive refine-misses-and-practice`). Pasar sus tareas manuales pendientes (7.1–7.3, 8.3, 10.1) a la sección 9 de este change. Comprobar que `openspec validate practice-schedule-and-polish` pasa contra las specs ya archivadas.

## 1. Validación de respuestas (D1)

- [x] 1.1 `checkMove` devuelve también los EP de la jugada del usuario. `judgeMove` acepta `playedUci` y `minPoints`, con el orden de D1: best → jugada de la partida (incorrecta, sin motor) → aceptadas → `strict` → motor (pérdida < 0.05 y, con `minPoints`, `EP ≥ minPoints`). La lógica vive en `judge(getEngine, p)` de `check-move.ts` (testeable con un motor falso); `judgeMove` la llama con el motor compartido. `acceptsSecond` es la regla de la segunda línea que comparten `buildExercises` y `acceptedMoves`.
- [x] 1.2 Callers:
  - `ExerciseView`: `playedUci = ex.playedUci`; `minPoints = MISS_WIN` si `kind = miss` y `brilliantPlayed` es null.
  - `review.tsx` (`attempt`): `playedUci = game.movesUci[trial.move]`; `minPoints = MISS_WIN` si la clase es `miss`.
- [x] 1.3 Segunda línea aceptada en `miss` solo si `EP(second) ≥ MISS_WIN`, en `buildExercises` y en `acceptedMoves` (este recibe la clase).
- [x] 1.4 Tests (`node:test`, con un `Engine` falso):
  - la jugada jugada se rechaza aunque el motor dé pérdida 0;
  - la Brillante jugada (`played = best`) sigue siendo correcta;
  - un `miss` con alternativa de pérdida 0.03 y EP 0.60 se rechaza;
  - un `mistake` con la misma alternativa se acepta;
  - `buildExercises` no añade la segunda de un `miss` si baja de `MISS_WIN`.

## 2. Repetición por racha y "Empezar" aleatorio (D2, D3)

- [x] 2.1 `practice.ts`:
  - `MASTERED_BOX = 3`, intervalos `[0, 60, 180]` días, `nextBox` con `min(3, box + 1)` y 0 al fallar;
  - quitar `SESSION_REPEAT_MS` y la regla "no vence aún" de `submitResult`;
  - un fallo pone `due_at = now`.
- [x] 2.2 `queue` sin `gameId`: `box < 3 and (box = 0 or due_at <= now())`, `order by (box = 0) desc, random()`, `limit 10`. Con `gameId`, sin cambios.
- [x] 2.3 `summary`: "Pendientes hoy" con el mismo filtro de 2.2; "Dominados" con `box >= 3`.
- [x] 2.4 Migración `pnpm db:generate --custom --name streak_schedule` con el SQL de D2: `least(box, run, 3)`, y `due_at` desde el último intento (dominado: `greatest(due_at, last + 180 d)`). Revisar el journal. Para `box = 3`, `nextBox`/`dueAtFor` dan `due_at` = ahora + 180 días.
- [x] 2.5 `Session` en `/practicar`:
  - sin re-encolar fallados;
  - quitar la prop `repeat` y la etiqueta "Repaso" de `ExerciseView`;
  - el resumen final sobre el tamaño de la sesión.
- [x] 2.6 Tests en `test/server.test.ts` (base local):
  - acierto 0→1 (+60 d), 1→2 (+180 d), 2→3 dominado y fuera de la cola;
  - fallo desde 2 → 0, en la cola y antes que un vencido;
  - un resultado antes de vencer sí cuenta;
  - 3 aciertos seguidos por `submitResult` retiran el ejercicio;
  - la cola nunca trae `box = 3` ni no vencidos con `box > 0`;
  - dos llamadas a `queue` con 15 nuevos no devuelven siempre el mismo orden (por ejemplo, 5 intentos con al menos un orden distinto);
  - la migración con los cuatro casos del escenario "Migración" de la spec, más una repetición en la sesión (fallo seguido de acierto: `box = 0`).
  - Reescribir los tests actuales de cajas de Leitner, "repetición en la misma sesión" y "no vence aún" (líneas ~199–224 y ~393–399).

## 3. Orden estable, carga por partes y "Siguiente" (D4, D12)

- [x] 3.1 `recentOrder` con `games.id desc` antes del ply. "Mis partidas" con el mismo desempate.
- [x] 3.2 `games.list({ cursor? })`, 30 por tanda, y `practice.list({ side?, gameId?, cursor? })`, 28 por tanda. Ambos devuelven `{ items, nextCursor }` con offset; `nextCursor` es null si la tanda llega incompleta. `games.list` rellena `final_fen` solo en la tanda.
- [x] 3.3 Hook `useLoadMore(ref, onVisible, key)` (`src/hooks/use-load-more.tsx`, con `LoadMore` y `dedupe`; `key` = nº de tandas para volver a observar si el sentinel sigue visible) con `IntersectionObserver` (`rootMargin: 400px`). Botón "Cargar más" de respaldo, con el error de carga al lado. Deduplicar por `id` al unir tandas.
- [x] 3.4 `/partidas` y `/practicar` con `useInfiniteQuery`. En `/practicar`, quitar `?pagina=`, `PageLink` y la navegación de páginas. Las invalidaciones de D12 siguen funcionando con la query infinita (`utils.games.list.invalidate()`).
- [x] 3.5 `practice.next({ id, side?, gameId? })` con `lead()` sobre `recentOrder` y `ownerFilters`. Devuelve null si es el último o si no está en el conjunto.
- [x] 3.6 Tarjetas de la lista con `?lado=`/`?partida=` en el `href`. `/practicar/[id]` los lee con la misma validación que `/practicar`. Para el dueño, tras el resultado: "Siguiente" (con los mismos filtros) o "Volver a la lista".
- [x] 3.7 Tests:
  - `games.list` y `practice.list` con 75 y 60 filas: tandas de 30/30/15 y 28/28/4, sin repetidos y con `nextCursor` null al final;
  - partidas con el mismo `created_at` y sin `played_at` dan siempre el mismo orden;
  - `next` recorre la lista entera sin ciclos y respeta `side` y `gameId`;
  - `next` con el id de otro usuario devuelve null;
  - reemplazar los tests de paginación actuales (líneas ~331–356, 411).

## 4. Compartir (D5)

- [x] 4.1 `src/components/share-image.ts`: `exerciseImage(fen, orientation, sideToMove) → Promise<Blob>`.
  - Canvas 1080 × 1200: casillas, coordenadas y la leyenda en `system-ui`.
  - Piezas: `fetch` de `/pieces/cburnett/*.svg`, añadir `width="45" height="45"` donde falte (solo los reyes), cargar desde `blob:` con `img.decode()` y cachearlas en memoria.
  - Si `toBlob` lanza `SecurityError`, rechaza con "No se pudo crear la imagen".
- [x] 4.2 "Compartir" en `/practicar/[id]` abre un menú "Enlace" / "Imagen" (Escape y tocar fuera lo cierran).
  - Al abrir el menú se genera el PNG. "Imagen" queda deshabilitada con spinner hasta que esté listo.
  - Imagen: con `(pointer: coarse)` y `navigator.canShare({ files })` → `navigator.share({ files })`; si no, o con `NotAllowedError`, descarga `ejercicio.png`. `AbortError` se ignora.
  - "Enlace" se queda como hoy.
- [ ] 4.3 `[POR VERIFICAR]` a mano:
  - el PNG no lleva nombres ni otros textos;
  - Android Chrome y iOS Safari abren la hoja nativa con la imagen (activación de usuario, D5);
  - Firefox y Chrome de escritorio descargan un PNG con las piezas dibujadas.

  Si Safari bloquea el canvas o rechaza `share`: dibujar las piezas desde PNG rasterizados en `public/pieces/cburnett-png/`, generados una vez con un script. Si iOS rechaza por la activación aunque el PNG esté listo: mostrar la imagen en una hoja propia con "Guardar".

## 5. Navegación (D6)

- [x] 5.1 `app-shell.tsx`:
  - quitar el `<nav>` inferior;
  - en `< md`, el disparador es `Menu` (`aria-label="Menú"`), y en `≥ md` el avatar de hoy;
  - el panel en `< md`: avatar + correo o "Sin cuenta", las tres páginas con `aria-current`, "Instalar app" y sesión;
  - cerrar con `onClick` en cada enlace (también la página actual), al cambiar `pathname`, con Escape (foco de vuelta al botón) y al tocar fuera;
  - eliminar el botón "Cerrar".
- [x] 5.2 `main` con `pb-10`. La barra ◀ ▶ de `review.tsx` con `bottom-0` y `pb-[env(safe-area-inset-bottom)]`. Revisar que ninguna página deja contenido tapado abajo.

## 6. Revisión (D7, D10)

- [x] 6.1 `moveLabel(fenBefore, san)` en `chess.ts`, con test (blancas, negras y FEN que empieza en la jugada 30). Usarlo en el prompt de `TrialPanel` (con "(blancas)" o "(negras)"), en `PendingPanel`, en `MoveVerdict` y en "En la partida" de `ExerciseView`. `practice.list` calcula `moveNumber` con el número de jugada del FEN, no con `floor(ply / 2) + 1`.
- [x] 6.2 `EvalGraph` con `markColor: Color | null`: `MARKED` + `inaccuracy`, y solo las jugadas de `markColor` (si es null, todas). `review.tsx` pasa `game.userColor`.
- [x] 6.3 Fila bajo el tablero:
  - orden Repasar/Salir → `actions` → Girar;
  - `flex-nowrap gap-1.5`; los botones de texto con `flex-1 min-w-0 whitespace-nowrap`, `text-[13px]` y sin icono bajo `sm` (clase compartida `REVIEW_ROW_BTN` en `review.tsx`, también `px-2` bajo `sm`, que usa el `Link` de `actions`);
  - Girar de `size-11`.
  - Renombrar a "Practicar partida", con `text-sm` en el propio botón; `.btn-primary` global no se toca.
- [x] 6.4 `MoveList`: `ol.scrollTo` sobre su contenedor en vez de `scrollIntoView` (`left` en la franja, `top` en `lg`; `ol` con `relative`). En celular, botones `min-h-9` y `py-0.5`.
- [x] 6.5 Quitar `colRef.scrollIntoView` y su comentario de `startReview`. Veredicto de alto fijo y una sola línea (`truncate`); en el ply 0, con análisis, el hueco con "Posición inicial".
- [x] 6.6 Encabezado de `/partidas/[id]`: botón atrás de 36 px, `text-sm`, y la etiqueta de resultado de D7 con colores de marca.
- [x] 6.7 `select-none` y `[-webkit-touch-callout:none]` en `MiniBoard`, `EvalBar` y `Board`.

## 7. Mis partidas e Importar (D8, D9)

- [x] 7.1 Tarjeta de `/partidas`:
  - `relative`, con un `Link` estirado (`after:absolute after:inset-0`) y `aria-label`;
  - Borrar y "Yo soy" con `relative z-10`;
  - quitar los demás `Link` internos; "Analizar" pasa a etiqueta;
  - miniatura con `self-center`.
- [x] 7.2 `players.accounts` con la consulta de D9. Tests:
  - dos fuentes;
  - una partida sin color se ignora;
  - el nombre más frecuente gana, aunque otro tenga la partida más reciente;
  - a igualdad gana el más reciente;
  - mayúsculas distintas cuentan como el mismo nombre;
  - otro usuario no ve nada.
- [x] 7.3 `import-form.tsx`:
  - con sesión, al llegar `accounts` y si la pestaña y los campos no se tocaron, abrir "Usuario" con la plataforma más reciente y su nombre;
  - cambiar de plataforma rellena el nombre si no se editó;
  - sin sesión, nada.

## 8. Cierre

- [x] 8.1 e2e `mobile-overflow.spec.ts`, mínimo (un solo test a 360 px, sin capturas; lo corre el agente principal una vez al final):
  - sin menú inferior; la hamburguesa abre el panel con correo, páginas y "Cerrar sesión";
  - los tres botones bajo el tablero con el mismo `offsetTop`;
  - tras 5 clics en ▶, `window.scrollY` no cambia;
  - "Practicar partida" abre la sesión.
  - Fuera de alcance por costo: tarjeta clicable de `/partidas`, carga por scroll y el barrido de desbordamiento a 360/390 px.
- [ ] 8.2 `pnpm typecheck`, `pnpm test`, `pnpm build` y `pnpm test:e2e`.
- [ ] 8.3 `[POR VERIFICAR]` en Vercel → Settings → Environment Variables si `DATABASE_URL` de Preview es la de producción. Si lo es, no practicar en el preview antes del merge (D2, riesgos).
- [ ] 8.4 Despliegue, en este orden (D2):
  1. escaneo de secretos y PR;
  2. respaldo en Neon (`create table exercises_box_backup_20261019 as select id, box, due_at from exercises`) y reparto de `box`;
  3. merge y deploy;
  4. justo después, `pnpm db:migrate` (0003);
  5. comprobar que no queda `box > 3`;
  6. `update exercises set box = 0, due_at = now()` en el ejercicio de O-O (JihadGhaziri, ply 20, D1).
- [ ] 8.5 Smoke test en producción:
  - el ejercicio de O-O rechaza O-O;
  - "Empezar" cambia de orden al repetirlo;
  - menú hamburguesa en el celular.

  Rollback: revertir el deploy y restaurar `box`/`due_at` desde el respaldo.
- [ ] 8.6 Borrar la tabla de respaldo cuando el usuario confirme que todo está bien.

## 9. Pendientes heredados de `refine-misses-and-practice`

- [ ] 9.1 (7.1) Medir una partida de 40 jugadas a profundidad 16, más D4b, en un celular de gama media. Si pasa de ~3 min, abrir un change para multihilo con COOP/COEP
- [ ] 9.2 (7.2) Instalación y análisis sin red en Android Chrome e iOS Safari; `/partidas` nunca sale de caché
- [ ] 9.3 (7.3) En iOS Safari y Android Chrome: tocar-tocar y arrastre, scroll sobre la gráfica, y que un toque largo no marque casillas
- [ ] 9.4 (8.3) Verificar el icono instalado en el celular del usuario
- [ ] 9.5 (10.1) Calibrar `MISS_WIN` con 3–5 partidas más de chess.com (aplazado por el usuario)
