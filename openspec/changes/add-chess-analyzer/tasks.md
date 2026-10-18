## 0. Decisiones pendientes (design, Open Questions)

- [x] 0.1 OQ 1: repo público bajo GPL-3.0 y portar el clasificador de WintrChess (decidido)
- [x] 0.2 OQ 2: correo y contraseña sin verificación, con tope de 20 cuentas (decidido)
- [x] 0.3 OQ 3: Chess Puzzle Creator, en `chess-puzzle-creator.vercel.app` (decidido)
- [x] 0.4 OQ 4: solo Blunders, Brillantes y Oportunidades perdidas generan ejercicios (decidido)

## 1. Setup

- [ ] 1.1 `pnpm create t3-app@latest` con App Router, tRPC, Drizzle (Postgres), Tailwind y Better Auth. Agregar `pnpm-workspace.yaml` con `allowBuilds` y `minimumReleaseAge`. **Verificar** que trae Next 15 (si trae 16, la redirección va en `proxy.ts` en vez de `middleware.ts`)
- [ ] 1.2 shadcn/ui y el sistema visual con la skill `frontend-design`: paleta oscura, tipografía, componentes base. Es la base de D10
- [x] 1.3 Proyecto en Neon con `DATABASE_URL` (directa) y `DATABASE_URL_POOLED` en `.env` (hecho por el usuario)
- [ ] 1.4 `docker-compose.yml` con Postgres 16 y la base `chess_test` (solo para tests), con `DATABASE_URL_TEST` en `.env`. Ajustar `src/env.js` a las variables de design. Agregar `LICENSE` (GPL-3.0) y un README con la sección "Créditos" (WintrChess, Stockfish, lichess chess-openings)
- [ ] 1.5 Cliente de la app con `postgres(DATABASE_URL_POOLED, { prepare: false })`. `drizzle.config` y `pnpm db:migrate` con `DATABASE_URL`. Sin `db:push`
- [ ] 1.6 `node --test` + `tsx`. Helper de pruebas que se niega a correr si `DATABASE_URL_TEST` falta o no apunta a localhost; al inicio recrea los schemas `public` y `drizzle` de la base local y migra
- [ ] 1.7 Proyecto en Vercel conectado al repo, con `pnpm install --frozen-lockfile` y sin migraciones en el build

## 2. Cuentas

- [ ] 2.1 Better Auth con correo y contraseña (`requireEmailVerification: false`), `nextCookies()` al final, `trustedOrigins` y esquema migrado. Pantallas `/login` y `/registro`
- [ ] 2.2 Tope de cuentas:
  - tabla `app_config` con `max_users = 20` por migración;
  - `auth.signupStatus` pública y aviso en el front;
  - hook `user.create.before` → 403 `SIGNUP_CLOSED`;
  - trigger `BEFORE INSERT` con `pg_advisory_xact_lock` que lee `app_config`.
  
  **Verificar** cómo sale el error del trigger y mapearlo a `SIGNUP_CLOSED` si es posible. Tests: con el tope alcanzado se rechaza; con uno menos y dos registros simultáneos se crea solo uno; el login sigue funcionando; cambiar el valor reabre el registro
- [ ] 2.3 Rate limit de Better Auth con `storage: "database"` (sign-in y sign-up 5/min). **Verificar** qué cabecera de IP usa en Vercel (`x-forwarded-for` / `x-real-ip`) y que no se pueda falsificar
- [ ] 2.4 Tabla `rate_limits` (una fila por clave) y helper `rateLimit(key, max, windowSec)` con upsert atómico. Aplicarlo a `/api/import/chesscom/[type]/[id]`, `games.import`, `analysis.save` y `practice.submitResult`. Test de la ventana y del reinicio
- [ ] 2.5 Script CLI `reset-password <email>` con la API interna de Better Auth, que invalida sesiones
- [ ] 2.6 `protectedProcedure` con `auth.api.getSession`, y `middleware.ts` con la redirección optimista en `/partidas` y `/practicar`
- [ ] 2.7 Flujo sin cuenta: `/analizar` en memoria, pendiente en `sessionStorage`, guardar al volver del login o registro, aviso si el registro está cerrado
- [ ] 2.8 Test: un procedimiento con el id de otro usuario responde NOT_FOUND, y sin sesión UNAUTHORIZED

## 3. Motor y análisis

- [ ] 3.1 Copiar la build lite single-thread de `stockfish` v19 (y la ASM.js de respaldo) a `public/engine/`, servir el wasm con `application/wasm` y **verificar** los nombres de archivo del paquete
- [ ] 3.2 `lib/engine`: wrapper UCI sobre el Worker (`analyze({ startFen, moves }, { depth, multipv, searchmoves? })` → promesa, cancelable), con `position fen ... moves ...`, conversión a eval desde blancas y posiciones sin jugadas legales resueltas con chess.js. Tests de la conversión de signo y de mate
- [ ] 3.3 Analizar la partida posición por posición con progreso, resultados parciales y Wake Lock
- [ ] 3.4 Esquema Zod de `positions` y `moves` y `analysis.save`: reproducir el PGN, validar los tamaños N+1 y N, que las UCI sean legales y que pese < 200 KB, y reemplazar el análisis anterior. Guardado automático al terminar. Tests de rechazo
- [ ] 3.5 Pantalla de revisión (`/analizar` y `/partidas/[id]`): tablero, barra de evaluación, gráfica, lista de jugadas, flecha, iconos, precisión, conteo por clase, navegación (botones, gráfica, teclado) y exploración de variantes
- [ ] 3.6 **Medir** el tiempo de una partida de 40 jugadas a profundidad 16, más la verificación D4b, en un celular de gama media. Si pasa de ~3 min, evaluar multihilo con COOP/COEP solo en la ruta de análisis (**verificar** las cabeceras por ruta en Vercel)
- [ ] 3.7 Aviso de licencia de Stockfish con enlace
- [ ] 3.8 "Reintentar" en jugadas ?!, ?, ?? y Oportunidad perdida, y modo "Repasar partida" con pausas en los momentos clave, pista, solución, omitir y resumen. Sin guardar nada (D9b)

## 4. Clasificador (`lib/classify`, puro y con tests)

- [ ] 4.1 EP (perspectiva del que mueve), pérdida, tabla de clases, transiciones de mate y Forzada
- [ ] 4.2 Libro: script que convierte `lichess-org/chess-openings` a `{ piezas+turno+enroques → {eco, name} }` (**verificar** la licencia CC0). Teoría y nombre de apertura. Test con casilla al paso
- [ ] 4.3 Portar de `WintrCat/wintrchess` (`shared/src/lib/reporter/`, fijando el commit) la seguridad de piezas: atacantes (con rayos X), defensores, pieza insegura, atrapada y "danger levels". Encabezado de atribución en cada archivo, TypeScript estricto y sin lodash si basta la stdlib
- [ ] 4.4 Gran jugada, Brillante (solo la jugada del motor) y `brilliantMissed`
- [ ] 4.5 Verificación D4b: reanálisis a profundidad 22 con MultiPV 3, sacrificio sostenido de 4 plies, estabilidad entre profundidades, `exerciseEligible`, tope de 6 candidatos por partida
- [ ] 4.6 Set de calibración (~40 posiciones con evals fijas) y test con 0 falsos positivos y recall ≥ 70 %. Incluir los casos del issue de "danger levels" de WintrChess
- [ ] 4.7 Oportunidad perdida (Imprecisión o Error tras un Error o Blunder rival, con mejor EP ≥ 0.75) y precisión. Tests de los escenarios de la spec
- [ ] 4.8 Iconos SVG propios de las 11 clases, con `aria-label`

## 5. Importación

- [ ] 5.1 PGN: normalizar (BOM, CRLF), separar partidas aunque falte la línea en blanco o `[Event`, validar, ignorar comentarios y variantes (**verificar** si chess.js 1.4 acepta RAV), límites, errores por partida, variantes no soportadas, partidas desde FEN. Tests con PGN irregulares
- [ ] 5.2 `source`/`source_id` desde `[Site]` de Lichess o `[Link]` de Chess.com, o hash si no hay
- [ ] 5.3 Lichess: link (id de 8 caracteres) y usuario (NDJSON) desde el navegador, con manejo de 429 y 404 y filtro de variantes
- [ ] 5.4 Chess.com por usuario: archivos mensuales en serie hasta N partidas o 24 meses, con filtro `rules = chess`
- [ ] 5.5 Ruta `/api/import/chesscom/[type]/[id]` con validación estricta (400 sin petición externa) que usa el callback y busca en el archivo mensual. **Verificar** el formato del callback y que Chess.com no bloquee las IPs de Vercel; si las bloquea, eliminar la ruta y pedir el usuario en el front
- [ ] 5.6 Tabla `player_names`, detección de `user_color` sin distinguir mayúsculas, pregunta "¿Cuál eres tú?" y `games.setUserColor` (que actualiza `side` en los ejercicios)
- [ ] 5.7 `games.import` con deduplicación por `(user_id, source, source_id)`, la pantalla "Mis partidas" y `games.delete` con borrado en cascada

## 6. Practicar

- [ ] 6.1 Tablas `exercises` (con `side`, `brilliant_played` y `archived_at`) y `exercise_attempts`. Generación en la transacción de `analysis.save` para los dos bandos (Blunder, Oportunidad perdida, Brillantes jugadas y no vistas). `fen` y fase calculadas en el servidor. Upsert que conserva o reinicia el progreso según `kind`/`best_uci`, y archivado o desarchivado. Tests de generación y de reanálisis
- [ ] 6.2 Cola de la sesión (pendientes, atrasados, nuevos, repetición del fallado al final) y filtros (tipo, mías o de rivales, clase, fase, partida)
- [ ] 6.3 Pantalla del ejercicio: textos por tipo, validación (`accepted_uci`, `searchmoves` a profundidad 14), reintento, pista y solución
- [ ] 6.4 Explicación: jugada original con icono y quién la jugó, animación de la refutación y mejor línea
- [ ] 6.5 `practice.submitResult` con Leitner (cajas, `due_at`, dominado). Test de la transición de cajas y de que la repetición en la sesión no cambie la caja
- [ ] 6.6 Panel de progreso: pendientes, dominados, racha (con `tz`) y conteo por tipo, separando mías y de rivales

## 7. PWA

- [ ] 7.1 `app/manifest.ts`, iconos (192, 512, maskable, apple-touch) y meta tags de iOS
- [ ] 7.2 Service worker con Serwist (**verificar** compatibilidad con Next 15 y Turbopack, o usar un `sw.js` a mano): precache de `/engine/*`, del libro, de `/_next/static/*`, `/`, `/analizar` y `/offline`; network-only para tRPC, `/api/*`, `/partidas*` y `/practicar`
- [ ] 7.3 Botón "Instalar app" (`beforeinstallprompt`, instrucciones en iOS, oculto en modo standalone), aviso "Sin conexión" y aviso de versión nueva
- [ ] 7.4 Probar la instalación y el análisis sin red en Android Chrome e iOS Safari, y que `/partidas` nunca salga de caché

## 8. Diseño y lanzamiento

- [ ] 8.1 Revisar todas las pantallas a 360 px, 768 px y escritorio. Botones ≥ 44 px, contraste AA
- [ ] 8.2 Probar tocar-tocar y arrastre en iOS Safari y Android Chrome
- [ ] 8.3 `pnpm db:migrate` contra producción y deploy a Vercel con `DATABASE_URL_POOLED`, `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL=https://chess-puzzle-creator.vercel.app`
