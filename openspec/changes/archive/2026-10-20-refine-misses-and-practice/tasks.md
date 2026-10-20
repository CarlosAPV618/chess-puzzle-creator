## 0. Decisiones (tomadas por el usuario, 2026-10-18)

- [x] 0.1 D5: ejercicios abiertos a cualquiera con el enlace
- [x] 0.2 D1: calibrar solo con jyonGM53 por ahora; más partidas, después (sección 10)
- [x] 0.3 D9: "Yo soy" solo cuando no se puede detectar el color

## 1. Oportunidad perdida (D1)

- [x] 1.1 Fixture `src/lib/classify/fixtures/jyon-d16.json` con las jugadas UCI y las evaluaciones a profundidad 16 de CarlosAPV vs jyonGM53. Test de referencia: las blancas tienen exactamente 3 `miss` (8.Ab5, 11.Ag5, 12.Da4)
- [x] 1.2 Regla v3 en `classifyGame`: `MISS_WIN = 0.62`, sin la condición sobre la jugada previa del rival. Reescribir el test actual de Miss (best 0.85 → 0.72 ahora es Error) con los escenarios de la spec: no aprovechar, ventaja conservada, sin ventaja ganadora, Blunder que tira la ventaja
- [x] 1.3 `CLASSIFIER_VERSION = 3`

## 2. Tipos de ejercicio y migración (D3, D9)

- [x] 2.1 `ExerciseKind = "mistake" | "brilliant" | "miss"` en `src/lib/types.ts` y en el enum de `schema.ts`. Columna `games.finalFen` (`final_fen text`, nullable)
- [x] 2.2 `pnpm db:generate` para la columna. Añadir al mismo SQL `0002` el `update` de tipos de D3 y revisar la entrada del journal
- [x] 2.3 `buildExercises` con la prioridad de D3. Tests: Brillante no vista → `miss` con `brilliant_played = false`; Oportunidad perdida → `miss`; Blunder → `mistake`; Brillante jugada → `brilliant`. Test con la base local: un ejercicio migrado a `miss` conserva `box` al reanalizar
- [x] 2.4 Validación estricta y texto "Había una jugada brillante. Encuéntrala." según `brilliant_played = false`, no según el tipo

## 3. `/practicar` (D4, D5)

- [x] 3.1 Router: quitar `kind`, `cls` y `phase` de `queue`, con el orden nuevo de D4 (vencidos por `due_at`, luego nuevos por "más reciente"). Quitar `counts`, `byKind` y `bySide` de `summary`, conservando `total`. Ajustar los tests de `test/server.test.ts`
- [x] 3.2 `practice.list({ side?, gameId?, page })`: 12 por página, orden de D4 y página fuera de rango ajustada a la última. Tests de orden, filtro y paginación contra la base local
- [x] 3.3 Componente `MiniBoard` (FEN → cuadrícula CSS con piezas cburnett, orientación y `aria-label`)
- [x] 3.4 Página: estadísticas, luego filtros en la URL (`?lado=`, `?partida=`), luego "Empezar" y luego la lista de tarjetas (miniatura, "Blancas vs Negras", "Jugada N", icono del tipo, dominado), paginada con `?pagina=`. Sin `Breakdown`
- [x] 3.5 `EngineNotice` solo al pie de `/practicar`: quitarlo de `review.tsx` y de la vista del ejercicio
- [x] 3.6 Extraer `ExerciseView` a `src/components/exercise.tsx` (lo usan la sesión y `/practicar/[id]`)
- [x] 3.7 `practice.byId` como `publicProcedure`:
  - `NOT_FOUND` uniforme (id mal formado, inexistente, archivado o con la partida borrada);
  - rate limit por IP o por usuario;
  - `owner`, y sin `gameId`, `box` ni `side` para quien no es dueño.

  Tests: el dueño recibe todo; otro usuario y un visitante reciben la versión reducida; los cuatro casos de `NOT_FOUND`; otro usuario no puede usar `submitResult` sobre ese ejercicio
- [x] 3.8 Página `/practicar/[id]`, con el middleware excluyendo `/practicar/<id>`:
  - textos con los nombres de los jugadores para quien no es dueño;
  - "Compartir" (Web Share, o copiar con "Enlace copiado");
  - `submitResult` solo si `owner`

## 4. Ejercicio y tableros (D6, D7)

- [x] 4.1 `Board`: `allowDrawingArrows` activo; casillas marcadas con `onSquareRightClick`, fusionadas en `squareStyles`; limpieza con clic izquierdo y al cambiar de FEN
- [x] 4.2 `lastMoveUci` en el DTO (`queue`, `byId`), resaltado en `mistake` y `miss` (no en `brilliant` ni en ply 0)
- [x] 4.3 Veredicto coherente (bug exd5): tras responder, el tablero se queda en la jugada del usuario con el icono de su resultado, y el panel dice "En la partida: <SAN>" con el icono original
- [x] 4.4 Explicación manual: botones "Lo que podía pasar" y "Mejor línea", ◀ ▶, teclado y "Volver al ejercicio". Quitar los dos temporizadores
- [x] 4.5 Enviar `submitResult` al fijarse el resultado (acierto o solución vista), no en "Siguiente"
- [x] 4.6 `submitResult`: un ejercicio con `attempts > 0` y `due_at > now()` registra el intento sin mover la caja. Test con la base local

## 5. Revisión de partida (D8)

- [x] 5.1 Abrir en ply 0
- [x] 5.2 `toolbar` y el aviso de reanálisis debajo de `Summary` cuando hay análisis (mover el aviso de `partidas/[id]/page.tsx` a `toolbar`)
- [x] 5.3 Por debajo de `lg`:
  - Repasar (o Salir del repaso) y Girar en la barra fija, ocultos en el panel;
  - al iniciar el repaso, `scrollIntoView` del tablero con `scroll-margin-top`
- [x] 5.5 Repaso sin pistas: mientras hay un repaso activo (no terminado), no dibujar la flecha de la mejor jugada tras cada jugada; solo con "Ver solución" (reporte del usuario, 2026-10-19)
- [x] 5.4 Gráfica: `touch-pan-y`; en táctil solo toque (< 8 px y sin `pointercancel`); con mouse, arrastre

## 6. `/partidas` y celular (D9)

- [x] 6.1 `games.import` guarda `finalFen`. `games.list` devuelve `finalFen`, rellena las filas null (calcular y `update`) y ordena por `coalesce(played_at, created_at) desc, created_at desc`
- [x] 6.2 Tarjeta nueva: miniatura final a la izquierda, datos a la derecha, sin contador de errores, Brillante condicional, "Yo soy" solo si `userColor` es null (blancas o negras)
- [x] 6.3 `setUserColor`: registrar el nombre en `player_names` y asignar el color a las otras partidas sin color con ese nombre, en la misma transacción. Test con la base local
- [x] 6.4 Revisar "más reciente primero" en todas las listas (Mis partidas, ejercicios, resultados de importar por usuario, que ya ordena chess.com por `end_time desc`)
- [x] 6.5 Test Playwright: `/`, `/login`, `/registro`, `/analizar`, `/partidas`, `/partidas/<id>`, `/practicar` y `/practicar/<id>` a 360 y 390 px, sin `scrollWidth > innerWidth`, y con el menú inferior visible tras hacer scroll. Corregir cada desborde encontrado (`min-w-0`, `truncate`, `flex-wrap`)

## 7. Pruebas en dispositivo (del change anterior, más las nuevas)

- [ ] 7.1 Medir una partida de 40 jugadas a profundidad 16, más D4b, en un celular de gama media. Si pasa de ~3 min, abrir un change para multihilo con COOP/COEP (D2)
- [ ] 7.2 Instalación y análisis sin red en Android Chrome e iOS Safari; `/partidas` nunca sale de caché
- [ ] 7.3 En iOS Safari y Android Chrome:
  - tocar-tocar y arrastre;
  - scroll sobre la gráfica;
  - que un toque largo no marque casillas (D7; si las marca, desactivar el marcado en táctil)

## 8. PWA (D10)

- [x] 8.1 Regenerar el maskable con el caballo escalado ×1.45 (punto más lejano ≤ 40 %) y `apple-touch-icon` con el mismo criterio. Nombres `-v2` en `manifest.ts` y `layout.tsx`. Corregir `docs/logo.md` (dice 60 %; es 42 %)
- [x] 8.2 Medir con PIL que el punto más lejano del caballo queda ≤ 40 % del centro, y revisarlo en DevTools (Application → Manifest, máscara redonda)
- [ ] 8.3 **Verificar en el celular del usuario:** si el icono no cambia, desinstalar y reinstalar. Si sigue viéndose apagado, probar el mosaico `#96c95c` solo en el icono instalado

## 9. Cierre

- [x] 9.1 `pnpm typecheck`, `pnpm test` y `pnpm build`
- [x] 9.2 Escaneo de secretos antes del push; PR
- [x] 9.3 `pnpm db:migrate` (0002) contra Neon antes del merge; después, deploy y smoke test en producción

## 10. Después (aplazado por el usuario)

- [ ] 10.1 Calibrar `MISS_WIN` con 3–5 partidas más y sus conteos de chess.com (Omisión, Error y Error grave por bando), con el reanálisis a profundidad 16. Ajustar solo si mejora el total sin romper el test 1.1
